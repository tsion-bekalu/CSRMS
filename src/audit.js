//This file provides a centralized audit logging utility: Records every important action (login, registration, request creation, status update, etc.) into the audit_logs table.

const db = require("./db"); //imports db which allows to run SQL queries against PostgreSQL.
const { randomUUID } = require("crypto"); //Used to generate unique identifiers for each audit log entry.

async function audit({ userId, action, details, ipAddress }, client = null) {
  const logId = "LOG-" + randomUUID().slice(0, 8);
  const executor = client || db;
  await executor.query(
    `INSERT INTO audit_logs (log_id, user_id, action, details, ip_address)
     VALUES ($1,$2,$3,$4,$5)`,
    [logId, userId || null, action, details || "", ipAddress || null]
  );
}

module.exports = { audit };
