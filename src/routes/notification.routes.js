const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../auth");
const db = require("../db");

// Get notifications
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { unreadOnly = false, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const params = [req.user.sub];
    let where = "WHERE recipient_id = $1";
    let paramCount = 2;

    if (unreadOnly === "true") {
      params.push(false);
      where += " AND is_read = $2";
      paramCount++;
    }

    params.push(parseInt(limit), parseInt(offset));

    const { rows } = await db.query(
      `SELECT * FROM notifications
       ${where}
       ORDER BY sent_date DESC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      params
    );

    const countRes = await db.query(
      `SELECT COUNT(*) FROM notifications ${where}`,
      params.slice(0, params.length - 2)
    );

    res.json({
      notifications: rows,
      pagination: {
        total: parseInt(countRes.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(countRes.rows[0].count / limit),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// Mark notification as read
router.patch("/:notificationId/read", authMiddleware, async (req, res) => {
  try {
    const { notificationId } = req.params;

    const { rows } = await db.query(
      `UPDATE notifications 
       SET is_read = TRUE, read_date = NOW()
       WHERE notification_id = $1 AND recipient_id = $2
       RETURNING *`,
      [notificationId, req.user.sub]
    );

    if (!rows[0]) {
      return res
        .status(404)
        .json({ error: "Notification not found or unauthorized" });
    }

    res.json({
      message: "Notification marked as read",
      notification: rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

// Mark all as read
router.post("/mark-all-read", authMiddleware, async (req, res) => {
  try {
    const { rowCount } = await db.query(
      `UPDATE notifications 
       SET is_read = TRUE, read_date = NOW()
       WHERE recipient_id = $1 AND is_read = FALSE`,
      [req.user.sub]
    );

    res.json({
      message: "All notifications marked as read",
      updatedCount: rowCount,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to mark all notifications as read" });
  }
});

// Delete notification
router.delete("/:notificationId", authMiddleware, async (req, res) => {
  try {
    const { notificationId } = req.params;

    const { rows } = await db.query(
      `DELETE FROM notifications 
       WHERE notification_id = $1 AND recipient_id = $2
       RETURNING *`,
      [notificationId, req.user.sub]
    );

    if (!rows[0]) {
      return res
        .status(404)
        .json({ error: "Notification not found or unauthorized" });
    }

    res.json({
      message: "Notification deleted",
      notification: rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete notification" });
  }
});

// Get unread count
router.get("/unread-count", authMiddleware, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT COUNT(*) FROM notifications 
       WHERE recipient_id = $1 AND is_read = FALSE`,
      [req.user.sub]
    );

    res.json({
      unreadCount: parseInt(rows[0].count),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get unread count" });
  }
});

module.exports = router;
