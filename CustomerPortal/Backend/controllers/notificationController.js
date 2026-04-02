const pool = require("../config/db");

function normalizedPhoneMatchSql(columnName, parameterPosition) {
  return `regexp_replace(COALESCE(${columnName}, ''), '\\D', '', 'g') = regexp_replace(COALESCE($${parameterPosition}, ''), '\\D', '', 'g')`;
}

async function getCurrentUser(userId) {
  const result = await pool.query(
    "SELECT id, name, phone, role FROM users WHERE id = $1",
    [userId]
  );

  return result.rows[0] || null;
}

exports.listNotifications = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || currentUser.role !== "customer") {
      return res.status(403).json({ error: "Customer portal access is required" });
    }

    const requestedLimit = Number(req.query.limit);
    const limit = Number.isInteger(requestedLimit)
      ? Math.max(1, Math.min(requestedLimit, 100))
      : 30;

    const notifications = await pool.query(
      `
        SELECT
          cn.*,
          sr.service_type,
          sr.status,
          sr.booking_status,
          sr.emergency_status,
          v.registration_number,
          v.brand,
          v.model
        FROM customer_notifications cn
        LEFT JOIN service_records sr ON sr.id = cn.service_record_id
        LEFT JOIN vehicles v ON v.id = sr.vehicle_id
        WHERE
          cn.customer_id = $1
          AND (
            sr.id IS NULL
            OR v.owner_user_id = $1
            OR ${normalizedPhoneMatchSql("v.owner_phone", 2)}
          )
        ORDER BY cn.created_at DESC, cn.id DESC
        LIMIT $3
      `,
      [currentUser.id, currentUser.phone, limit]
    );

    res.json(notifications.rows);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
};

exports.markNotificationsRead = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || currentUser.role !== "customer") {
      return res.status(403).json({ error: "Customer portal access is required" });
    }

    const notificationIds = Array.isArray(req.body?.notificationIds)
      ? req.body.notificationIds
          .map((notificationId) => Number(notificationId))
          .filter((notificationId) => Number.isInteger(notificationId) && notificationId > 0)
      : [];

    const updatedNotifications = notificationIds.length > 0
      ? await pool.query(
          `
            UPDATE customer_notifications
            SET
              is_read = TRUE,
              read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
            WHERE
              customer_id = $1
              AND id = ANY($2::int[])
            RETURNING id
          `,
          [currentUser.id, notificationIds]
        )
      : await pool.query(
          `
            UPDATE customer_notifications
            SET
              is_read = TRUE,
              read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
            WHERE
              customer_id = $1
              AND is_read = FALSE
            RETURNING id
          `,
          [currentUser.id]
        );

    res.json({
      ok: true,
      updatedCount: updatedNotifications.rows.length,
      notificationIds: updatedNotifications.rows.map((notification) => notification.id),
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to update notifications" });
  }
};
