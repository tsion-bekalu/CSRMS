const express = require("express");
const router = express.Router(); //creates a router object to hold request related endpoints
const db = require("../db");
const { randomUUID } = require("crypto");
const { authMiddleware } = require("../auth"); //ensures user is authenticated
const { requireRole } = require("../rbac");
const { createRequestSchema, updateStatusSchema } = require("../validation");
const { audit } = require("../audit");
const { sendEmail } = require("../email");

// Citizen creates a request
router.post("/", authMiddleware, requireRole("Citizen"), async (req, res) => {
  //validates request body against schema
  const parsed = createRequestSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.issues[0].message });
  const { title, description, category, location, imagePath } = parsed.data; //extract validated fields

  try {
    const citizenRes = await db.query(
      `SELECT c.id AS cid, u.email
       FROM citizens c JOIN users u ON u.id=c.user_id
       WHERE u.id=$1`,
      [req.user.sub]
    ); //Finds citizen profile linked to the authenticated user.

    const citizen = citizenRes.rows[0];
    if (!citizen)
      return res.status(403).json({ error: "Citizen profile not found" });

    const requestCode = "REQ-" + randomUUID().slice(0, 8); //generates unique request id
    const insertRes = await db.query(
      `INSERT INTO service_requests (request_id, citizen_id, title, description, category, status, location, image_path)
       VALUES ($1,$2,$3,$4,$5,'Pending',$6,$7)
       RETURNING *`,
      [
        requestCode,
        citizen.cid,
        title,
        description,
        category,
        location,
        imagePath || null,
      ]
    ); //Inserts new request into DB with status = Pending.

    await db.query(
      `UPDATE citizens SET total_requests_submitted = total_requests_submitted + 1 WHERE id=$1`,
      [citizen.cid]
    );

    await audit({
      userId: req.user.sub,
      action: "REQUEST_CREATE",
      details: `Created ${requestCode}`,
      ipAddress: req.ip,
    });

    res.status(201).json({ request: insertRes.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create request" });
  }
});

// List/filter/sort requests
router.get("/", authMiddleware, async (req, res) => {
  const {
    status,
    category,
    priority,
    sort = "submission_date",
    order = "desc",
    mine,
  } = req.query; //reads query parameter to filter or sort
  const allowedSort = new Set(["submission_date", "priority", "status"]);
  const sortCol = allowedSort.has(sort) ? sort : "submission_date";
  const ord = order?.toLowerCase() === "asc" ? "ASC" : "DESC";

  try {
    const params = [];
    let where = "WHERE 1=1";

    if (status) {
      params.push(status);
      where += ` AND status = $${params.length}`;
    }
    if (category) {
      params.push(category);
      where += ` AND category = $${params.length}`;
    }
    if (priority) {
      params.push(priority);
      where += ` AND priority = $${params.length}`;
    }
    if (mine === "true" && req.user.role === "Citizen") {
      params.push(req.user.sub);
      where += ` AND citizen_id IN (SELECT c.id FROM citizens c WHERE c.user_id = $${params.length})`;
    }

    const { rows } = await db.query(
      `SELECT sr.*, c.full_name AS citizen_name
   FROM service_requests sr
   LEFT JOIN citizens c ON sr.citizen_id = c.id
   ${where}
   ORDER BY ${sortCol} ${ord}
   LIMIT 100`,
      params
    );

    res.json({ requests: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch requests" });
  }
});

// Update status (Staff or Administrator) with email notification
router.patch(
  "/:requestId/status",
  authMiddleware,
  requireRole("Administrator"),
  async (req, res) => {
    const parsed = updateStatusSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.issues });
    const { status, note } = parsed.data;
    const { requestId } = req.params;

    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");

      const reqRes = await client.query(
        `SELECT sr.id, sr.request_id, sr.status, sr.citizen_id, u.email, u.id AS recipient_user_id
       FROM service_requests sr
       JOIN citizens c ON c.id = sr.citizen_id
       JOIN users u ON u.id = c.user_id
       WHERE sr.request_id = $1`,
        [requestId]
      ); //fetches request details and citizen email
      const request = reqRes.rows[0];
      if (!request) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Request not found" });
      }

      if (request.status === "Closed") {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Request already closed" });
      }

      // Valid workflow transitions: Pending → In Progress → Resolved → Closed
      const allowedTransitions = {
        Pending: ["In Progress"],
        "In Progress": ["Resolved", "Pending"], // allow revert if needed
        Resolved: ["Closed", "In Progress"], // allow reopen
        Closed: [],
      };
      if (!allowedTransitions[request.status].includes(status)) {
        await client.query("ROLLBACK");
        return res
          .status(400)
          .json({ error: `Invalid transition ${request.status} → ${status}` });
      }

      await client.query(`UPDATE service_requests SET status=$1 WHERE id=$2`, [
        status,
        request.id,
      ]);

      if (status === "Resolved" && request.status !== "Resolved") {
        await client.query(
          `UPDATE citizens SET total_requests_resolved = total_requests_resolved + 1 WHERE id=$1`,
          [request.citizen_id]
        );
      }

      // Optional: store progress note in audit
      await audit({
        userId: req.user.sub,
        action: "REQUEST_STATUS_UPDATE",
        details: `${request.request_id}: ${request.status} -> ${status}${
          note ? ` | note: ${note}` : ""
        }`,
        ipAddress: req.ip,
      });

      await client.query("COMMIT");

      // Send email after commit
      const message = `Your request ${
        request.request_id
      } status changed to: ${status}${note ? `\nNote: ${note}` : ""}`;
      try {
        await sendEmail({
          to: request.email,
          subject: `CSRMS Update: ${request.request_id}`,
          text: message,
        });
      } catch (mailErr) {
        console.warn("Email send failed:", mailErr.message);
      }

      res.json({ success: true, requestId, status });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(err);
      res.status(500).json({ error: "Failed to update status" });
    } finally {
      client.release();
    }
  }
);

// Close request (Administrator only)
router.post(
  "/:requestId/close",
  authMiddleware,
  requireRole("Administrator"),
  async (req, res) => {
    const { requestId } = req.params;
    try {
      const { rows } = await db.query(
        `UPDATE service_requests
       SET status='Closed', resolution_date = COALESCE(resolution_date, NOW())
       WHERE request_id=$1 AND status IN ('Resolved','In Progress','Pending')
       RETURNING *`,
        [requestId]
      );
      if (!rows[0])
        return res
          .status(404)
          .json({ error: "Request not found or already closed" });

      await audit({
        userId: req.user.sub,
        action: "REQUEST_CLOSED",
        details: `Closed ${requestId}`,
        ipAddress: req.ip,
      });

      res.json({ request: rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to close request" });
    }
  }
);

router.get("/stats", authMiddleware, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending,
         SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as in_progress,
         SUM(CASE WHEN status IN ('Resolved','Closed') THEN 1 ELSE 0 END) as resolved,
         SUM(CASE WHEN status = 'Rejected' THEN 1 ELSE 0 END) as rejected
       FROM service_requests sr
       JOIN citizens c ON c.id = sr.citizen_id
       WHERE c.user_id = $1`,
      [req.user.sub]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

router.get("/my", authMiddleware, async (req, res) => {
  try {
    const citizenId = req.user.cid;

    const { rows } = await db.query(
      `
      SELECT
        request_id,
        title,
        category,
        location,
        status,
        submission_date
      FROM service_requests
      WHERE citizen_id = $1
      ORDER BY submission_date DESC
      `,
      [citizenId]
    );

    res.json({ requests: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load requests" });
  }
});

module.exports = router;
