//This file provides authentication and authorization utilities
const jwt = require("jsonwebtoken"); //Imports the jsonwebtoken library.Used to create and verify JWTs (JSON Web Tokens), which are secure tokens for authentication.
const bcrypt = require("bcrypt"); //Imports bcrypt, a library for hashing and verifying passwords. Ensures passwords are never stored in plain text.
const db = require("./db");

async function findUserByEmail(email) {
  const { rows } = await db.query(
    "SELECT * FROM users WHERE email=$1 AND is_active=TRUE",
    [email]
  );
  return rows[0] || null;
} //look up user by email

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
  );
} //creates a jwt for user

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
} //Compares a plain text password with a hashed password stored in the database.

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
} //protects routes by requiring a valid token.

module.exports = {
  findUserByEmail,
  signToken,
  verifyPassword,
  authMiddleware,
};
