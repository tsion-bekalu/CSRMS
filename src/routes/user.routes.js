const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../auth");
const { requireRole } = require("../rbac");
const db = require("../db");
const bcrypt = require("bcrypt");
const { audit } = require("../audit");

// Get user profile
router.get("/profile", authMiddleware, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.email, u.full_name, u.phone_number, u.address, u.role, u.registration_date,
              c.citizen_id, c.notification_preference, 
              c.total_requests_submitted, c.total_requests_resolved,
              ms.staff_id, ms.department
       FROM users u
       LEFT JOIN citizens c ON c.user_id = u.id
       LEFT JOIN municipal_staff ms ON ms.user_id = u.id
       WHERE u.id = $1 AND u.is_active = TRUE`,
      [req.user.sub]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ user: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// Update profile
router.put("/profile", authMiddleware, async (req, res) => {
  try {
    const { fullName, phoneNumber, address, notificationPreference } = req.body;

    const { rows } = await db.query(
      `UPDATE users 
       SET full_name = COALESCE($1, full_name),
           phone_number = COALESCE($2, phone_number),
           address = COALESCE($3, address)
       WHERE id = $4 AND is_active = TRUE
       RETURNING id, email, full_name, phone_number, address, role`,
      [fullName, phoneNumber, address, req.user.sub]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update citizen notification preference if user is citizen
    if (notificationPreference && rows[0].role === "Citizen") {
      await db.query(
        `UPDATE citizens 
         SET notification_preference = $1
         WHERE user_id = $2`,
        [notificationPreference, req.user.sub]
      );
    }

    await audit({
      userId: req.user.sub,
      action: "UPDATE_PROFILE",
      details: "User profile updated",
      ipAddress: req.ip,
    });

    res.json({
      message: "Profile updated successfully",
      user: rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// Change password
router.put("/change-password", authMiddleware, async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const { oldPassword, newPassword } = req.body;

    const userRes = await client.query(
      `SELECT password_hash FROM users WHERE id = $1 AND is_active = TRUE`,
      [req.user.sub]
    );

    if (!userRes.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "User not found" });
    }

    const isValid = await bcrypt.compare(
      oldPassword,
      userRes.rows[0].password_hash
    );
    if (!isValid) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    await client.query(
      `UPDATE users 
       SET password_hash = $1
       WHERE id = $2`,
      [newPasswordHash, req.user.sub]
    );

    await audit({
      userId: req.user.sub,
      action: "CHANGE_PASSWORD",
      details: "Password changed successfully",
      ipAddress: req.ip,
    });

    await client.query("COMMIT");

    res.json({ message: "Password changed successfully" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to change password" });
  } finally {
    client.release();
  }
});

// Deactivate account
router.post("/deactivate", authMiddleware, async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE users 
       SET is_active = FALSE
       WHERE id = $1
       RETURNING id, email`,
      [req.user.sub]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: "User not found" });
    }

    await audit({
      userId: req.user.sub,
      action: "DEACTIVATE_ACCOUNT",
      details: "Account deactivated",
      ipAddress: req.ip,
    });

    res.json({
      message: "Account deactivated successfully",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to deactivate account" });
  }
});

// Get user dashboard stats
router.get("/dashboard", authMiddleware, async (req, res) => {
  try {
    const [profileRes, recentRequestsRes, statsRes] = await Promise.all([
      db.query(
        `SELECT u.full_name, u.email, u.role,
                c.total_requests_submitted, c.total_requests_resolved,
                c.notification_preference
         FROM users u
         LEFT JOIN citizens c ON c.user_id = u.id
         WHERE u.id = $1 AND u.is_active = TRUE`,
        [req.user.sub]
      ),
      db.query(
        `SELECT request_id, title, status, priority, submission_date
         FROM service_requests sr
         JOIN citizens c ON c.id = sr.citizen_id
         WHERE c.user_id = $1
         ORDER BY submission_date DESC
         LIMIT 5`,
        [req.user.sub]
      ),
      db.query(
        `SELECT 
           COUNT(*) as total,
           SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending,
           SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as in_progress,
           SUM(CASE WHEN status IN ('Resolved', 'Closed') THEN 1 ELSE 0 END) as resolved
         FROM service_requests sr
         JOIN citizens c ON c.id = sr.citizen_id
         WHERE c.user_id = $1`,
        [req.user.sub]
      ),
    ]);

    const dashboard = {
      profile: profileRes.rows[0],
      recentRequests: recentRequestsRes.rows,
      stats: statsRes.rows[0],
    };

    res.json({ dashboard });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch dashboard" });
  }
});

module.exports = router;
