//This file defines authentication routes:
const express = require("express");
const router = express.Router(); //creates a router object
const db = require("../db");
const bcrypt = require("bcrypt");
const { randomUUID } = require("crypto");
const { registerSchema, loginSchema } = require("../validation");
const { findUserByEmail, signToken, verifyPassword } = require("../auth");
const { audit } = require("../audit");
const { sendEmail } = require("../email");

//registor endpoint
router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.issues }); //Validates the request body against registerSchema

  const { email, password, fullName, phoneNumber, address, role } = parsed.data; //extract validated fields

  const existing = await findUserByEmail(email);
  if (existing) return res.status(409).json({ error: "Email already taken" }); //Checks if the email is already registered.

  const passwordHash = await bcrypt.hash(password, 10);
  const userCode = "USR-" + randomUUID().slice(0, 8);

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const userRes = await client.query(
      `INSERT INTO users (user_id, email, password_hash, full_name, phone_number, address, role)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, email, role`,
      [userCode, email, passwordHash, fullName, phoneNumber, address, role]
    );

    const user = userRes.rows[0];

    if (role === "Citizen") {
      await client.query(
        `INSERT INTO citizens (citizen_id, user_id, notification_preference)
       VALUES ($1,$2,$3)`,
        ["CIT-" + randomUUID().slice(0, 8), user.id, "Email"]
      );
    }
    //Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000);

    // Save OTP
    await client.query(
      `UPDATE users
       SET email_otp = $1,
           email_otp_expires = $2
       WHERE id = $3`,
      [otp, expires, user.id]
    );

    // Send OTP email
    await sendEmail({
      to: email,
      subject: "CSRMS verification code",
      text: `Your verification code is ${otp}. It expires in 10 minutes.`,
    });

    // audit MUST use client
    await audit(
      {
        userId: user.id,
        action: "REGISTER",
        details: `User ${email} (${role})`,
        ipAddress: null,
      },
      client
    );

    await client.query("COMMIT");

    res.status(201).json({
      message: "OTP sent to email",
      email,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

//verify email
router.post("/verify-email", async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: "Email and code are required" });
  }

  const { rows } = await db.query(
    `SELECT id, role, email_otp, email_otp_expires
     FROM users
     WHERE email = $1 AND is_active = TRUE`,
    [email]
  );

  const user = rows[0];
  if (!user) {
    return res.status(400).json({ error: "Invalid email" });
  }

  if (user.email_otp !== otp || new Date(user.email_otp_expires) < new Date()) {
    return res.status(400).json({ error: "Invalid or expired code" });
  }

  await db.query(
    `UPDATE users
     SET is_verified = TRUE,
         email_otp = NULL,
         email_otp_expires = NULL
     WHERE id = $1`,
    [user.id]
  );

  const token = signToken(user);

  res.json({ token });
});

//login endpoint
router.post("/login", async (req, res) => {
  const { identifier, password } = req.body;

  try {
    let user;

    // Determine if admin (starts with "UGR/") or citizen (email)
    if (identifier.toUpperCase().startsWith("UGR/")) {
      // Admin login by UGR ID
      const { rows } = await db.query(
        `
        SELECT u.id, u.email, u.password_hash, u.role
        FROM users u
        JOIN municipal_staff m ON u.id = m.user_id
        WHERE m.staff_id = $1 AND u.is_active = TRUE
        `,
        [identifier]
      );
      user = rows[0];
    } else {
      // Citizen login by email
      const { rows } = await db.query(
        `
        SELECT u.id, u.email, u.password_hash, u.role
        FROM users u
        WHERE u.email = $1 AND u.is_active = TRUE
        `,
        [identifier]
      );
      user = rows[0];
    }

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Role-specific verification
    if (user.role === "Citizen") {
      const { rows: citizenRows } = await db.query(
        `SELECT id AS citizen_id FROM citizens WHERE user_id = $1`,
        [user.id]
      );
      if (!citizenRows[0])
        return res.status(403).json({ error: "Citizen record not found" });
    } else if (user.role === "Administrator") {
      const { rows: staffRows } = await db.query(
        `SELECT id AS staff_id FROM municipal_staff WHERE user_id = $1`,
        [user.id]
      );
      if (!staffRows[0])
        return res.status(403).json({ error: "Admin record not found" });
    }

    // Generate JWT token
    const token = signToken(user);

    // Respond with token and user info
    res.json({
      token,
      user: { id: user.id, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Forgot Password: send OTP
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });
  const { rows } = await db.query(`SELECT id FROM users WHERE email = $1`, [
    email,
  ]);
  const user = rows[0];
  if (!user) return res.status(404).json({ error: "User not found" });
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = new Date(Date.now() + 10 * 60 * 1000);
  await db.query(
    `UPDATE users SET email_otp = $1, email_otp_expires = $2 WHERE id = $3`,
    [otp, expires, user.id]
  );
  await sendEmail({
    to: email,
    subject: "CSRMS Password Reset Code",
    text: `Your password reset code is ${otp}. It expires in 10 minutes.`,
  });
  res.json({ message: "Reset code sent to email" });
});

// Verify Reset OTP
router.post("/verify-reset", async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp)
    return res.status(400).json({ error: "Email and code required" });
  const { rows } = await db.query(
    `SELECT id, email_otp, email_otp_expires FROM users WHERE email = $1`,
    [email]
  );
  const user = rows[0];
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.email_otp !== otp || new Date(user.email_otp_expires) < new Date()) {
    return res.status(400).json({ error: "Invalid or expired code" });
  }
  // Don’t reset password yet, just confirm OTP
  res.json({ message: "OTP verified, proceed to reset password" });
});

// Reset Password
router.post("/reset-password", async (req, res) => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword) {
    return res
      .status(400)
      .json({ error: "Email, code, and new password required" });
  }
  const { rows } = await db.query(
    `SELECT id, email_otp, email_otp_expires FROM users WHERE email = $1`,
    [email]
  );
  const user = rows[0];
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.email_otp !== otp || new Date(user.email_otp_expires) < new Date()) {
    return res.status(400).json({ error: "Invalid or expired code" });
  }
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.query(
    `UPDATE users SET password_hash = $1, email_otp = NULL, email_otp_expires = NULL WHERE id = $2`,
    [passwordHash, user.id]
  );
  res.json({ message: "Password reset successful" });
});

module.exports = router;
