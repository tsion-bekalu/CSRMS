const express = require("express");
const router = express.Router();
const pool = require("../db");
const { authMiddleware } = require("../auth");

router.get("/reports", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.sub;

    const citizenResult = await pool.query(
      "SELECT id FROM citizens WHERE user_id = $1",
      [userId]
    );

    if (citizenResult.rowCount === 0) {
      return res.json({ reports: [] });
    }

    const citizenId = citizenResult.rows[0].id;

    const reportsResult = await pool.query(
      `
      SELECT 
        request_id,
        title,
        description,
        category,
        status,
        priority,
        submission_date
      FROM service_requests
      WHERE citizen_id = $1
      ORDER BY submission_date DESC
      `,
      [citizenId]
    );

    res.json({ reports: reportsResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
