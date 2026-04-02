const pool = require("../config/db");
const { isWorkshopRole } = require("../utils/roles");

function parseNotificationKeys(notificationIds) {
  const mechanicNotificationIds = [];
  const emergencyNotificationIds = [];

  (Array.isArray(notificationIds) ? notificationIds : []).forEach((notificationId) => {
    const normalizedValue = String(notificationId || "").trim();

    if (!normalizedValue) {
      return;
    }

    if (normalizedValue.includes(":")) {
      const [notificationGroup, rawId] = normalizedValue.split(":");
      const parsedId = Number(rawId);

      if (!Number.isInteger(parsedId) || parsedId <= 0) {
        return;
      }

      if (notificationGroup === "emergency") {
        emergencyNotificationIds.push(parsedId);
        return;
      }

      if (notificationGroup === "mechanic") {
        mechanicNotificationIds.push(parsedId);
      }

      return;
    }

    const parsedId = Number(normalizedValue);

    if (Number.isInteger(parsedId) && parsedId > 0) {
      mechanicNotificationIds.push(parsedId);
    }
  });

  return {
    mechanicNotificationIds,
    emergencyNotificationIds,
  };
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

    if (!currentUser || !isWorkshopRole(currentUser.role)) {
      return res.status(403).json({ error: "Mechanic portal access is required" });
    }

    const requestedLimit = Number(req.query.limit);
    const limit = Number.isInteger(requestedLimit)
      ? Math.max(1, Math.min(requestedLimit, 100))
      : 30;

    const notifications = await pool.query(
      `
        SELECT *
        FROM (
          SELECT
            CONCAT('mechanic:', mn.id) AS id,
            mn.id AS source_id,
            'mechanic' AS notification_group,
            mn.is_read,
            mn.read_at,
            mn.created_at,
            mn.customer_id,
            mn.service_record_id,
            mn.chat_thread_id,
            mn.source_type,
            mn.action_type,
            mn.title,
            mn.message,
            customer.name AS customer_name,
            COALESCE(sr.service_type, thread_record.service_type) AS service_type,
            COALESCE(service_vehicle.registration_number, thread_vehicle.registration_number) AS registration_number,
            COALESCE(service_vehicle.brand, thread_vehicle.brand) AS brand,
            COALESCE(service_vehicle.model, thread_vehicle.model) AS model,
            NULL::text AS emergency_location
          FROM mechanic_notifications mn
          LEFT JOIN users customer ON customer.id = mn.customer_id
          LEFT JOIN service_records sr ON sr.id = mn.service_record_id
          LEFT JOIN vehicles service_vehicle ON service_vehicle.id = sr.vehicle_id
          LEFT JOIN chat_threads ct ON ct.id = mn.chat_thread_id
          LEFT JOIN service_records thread_record ON thread_record.id = ct.service_record_id
          LEFT JOIN vehicles thread_vehicle ON thread_vehicle.id = ct.vehicle_id
          WHERE mn.mechanic_id = $1

          UNION ALL

          SELECT
            CONCAT('emergency:', en.id) AS id,
            en.id AS source_id,
            'emergency' AS notification_group,
            en.is_read,
            en.read_at,
            en.created_at,
            customer.id AS customer_id,
            en.service_record_id,
            NULL::int AS chat_thread_id,
            'emergency' AS source_type,
            COALESCE(sr.emergency_status, 'open') AS action_type,
            en.title,
            en.message,
            COALESCE(customer.name, v.owner_name) AS customer_name,
            sr.service_type,
            v.registration_number,
            v.brand,
            v.model,
            en.emergency_location
          FROM emergency_notifications en
          JOIN service_records sr ON sr.id = en.service_record_id
          JOIN vehicles v ON v.id = sr.vehicle_id
          LEFT JOIN users customer ON customer.id = v.owner_user_id
          WHERE
            en.mechanic_id = $1
            AND sr.is_emergency = TRUE
            AND (
              sr.mechanic_id IS NULL
              OR sr.mechanic_id = $1
              OR $3 = 'admin'
            )
        ) notifications
        ORDER BY notifications.created_at DESC, notifications.source_id DESC
        LIMIT $2
      `,
      [currentUser.id, limit, String(currentUser.role || "").trim().toLowerCase()]
    );

    res.json(notifications.rows);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to fetch customer activity notifications" });
  }
};

exports.markNotificationsRead = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || !isWorkshopRole(currentUser.role)) {
      return res.status(403).json({ error: "Mechanic portal access is required" });
    }

    const { mechanicNotificationIds, emergencyNotificationIds } = parseNotificationKeys(
      req.body?.notificationIds
    );

    const updateMechanicNotifications = mechanicNotificationIds.length > 0
      ? pool.query(
          `
            UPDATE mechanic_notifications
            SET
              is_read = TRUE,
              read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
            WHERE
              mechanic_id = $1
              AND id = ANY($2::int[])
            RETURNING id
          `,
          [currentUser.id, mechanicNotificationIds]
        )
      : mechanicNotificationIds.length === 0 && emergencyNotificationIds.length === 0
        ? pool.query(
            `
              UPDATE mechanic_notifications
              SET
                is_read = TRUE,
                read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
              WHERE
                mechanic_id = $1
                AND is_read = FALSE
              RETURNING id
            `,
            [currentUser.id]
          )
        : Promise.resolve({ rows: [] });

    const updateEmergencyNotifications = emergencyNotificationIds.length > 0
      ? pool.query(
          `
            UPDATE emergency_notifications
            SET
              is_read = TRUE,
              read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
            WHERE
              mechanic_id = $1
              AND id = ANY($2::int[])
            RETURNING id
          `,
          [currentUser.id, emergencyNotificationIds]
        )
      : mechanicNotificationIds.length === 0 && emergencyNotificationIds.length === 0
        ? pool.query(
            `
              UPDATE emergency_notifications
              SET
                is_read = TRUE,
                read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
              WHERE
                mechanic_id = $1
                AND is_read = FALSE
              RETURNING id
            `,
            [currentUser.id]
          )
        : Promise.resolve({ rows: [] });

    const [updatedMechanicNotifications, updatedEmergencyNotifications] = await Promise.all([
      updateMechanicNotifications,
      updateEmergencyNotifications,
    ]);

    const updatedNotificationIds = [
      ...updatedMechanicNotifications.rows.map((notification) => `mechanic:${notification.id}`),
      ...updatedEmergencyNotifications.rows.map((notification) => `emergency:${notification.id}`),
    ];

    res.json({
      ok: true,
      updatedCount: updatedNotificationIds.length,
      notificationIds: updatedNotificationIds,
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to update customer activity notifications" });
  }
};
