const pool = require("../config/db");

function normalizedColumnMatchSql(leftColumn, rightColumn) {
  return `regexp_replace(COALESCE(${leftColumn}, ''), '\\D', '', 'g') = regexp_replace(COALESCE(${rightColumn}, ''), '\\D', '', 'g')`;
}

async function getCustomerContextByServiceRecord(serviceRecordId, db = pool) {
  const result = await db.query(
    `
      SELECT
        sr.id AS service_record_id,
        sr.service_type,
        sr.status,
        sr.booking_status,
        sr.booking_date,
        sr.booking_time_slot,
        sr.emergency_status,
        sr.transport_option,
        sr.amount,
        sr.next_service_date,
        v.id AS vehicle_id,
        v.registration_number,
        v.brand,
        v.model,
        v.owner_name,
        customer.id AS customer_id,
        customer.name AS customer_name
      FROM service_records sr
      JOIN vehicles v ON v.id = sr.vehicle_id
      LEFT JOIN LATERAL (
        SELECT u.id, u.name
        FROM users u
        WHERE
          LOWER(TRIM(u.role)) = 'customer'
          AND (
            u.id = v.owner_user_id
            OR ${normalizedColumnMatchSql("u.phone", "v.owner_phone")}
          )
        ORDER BY CASE WHEN u.id = v.owner_user_id THEN 0 ELSE 1 END, u.id ASC
        LIMIT 1
      ) customer ON true
      WHERE sr.id = $1
      LIMIT 1
    `,
    [serviceRecordId]
  );

  return result.rows[0] || null;
}

async function getCustomerContextByThread(threadId, db = pool) {
  const result = await db.query(
    `
      SELECT
        ct.id AS chat_thread_id,
        ct.customer_id,
        customer.name AS customer_name,
        ct.service_record_id,
        ct.vehicle_id,
        v.registration_number,
        v.brand,
        v.model
      FROM chat_threads ct
      JOIN users customer ON customer.id = ct.customer_id
      LEFT JOIN vehicles v ON v.id = ct.vehicle_id
      WHERE ct.id = $1
      LIMIT 1
    `,
    [threadId]
  );

  return result.rows[0] || null;
}

async function insertCustomerNotification(payload, db = pool) {
  if (!payload?.customerId) {
    return null;
  }

  const result = await db.query(
    `
      INSERT INTO customer_notifications (
        customer_id,
        service_record_id,
        chat_thread_id,
        source_type,
        action_type,
        title,
        message
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `,
    [
      payload.customerId,
      payload.serviceRecordId || null,
      payload.chatThreadId || null,
      payload.sourceType,
      payload.actionType,
      payload.title,
      payload.message,
    ]
  );

  return result.rows[0] || null;
}

module.exports = {
  getCustomerContextByServiceRecord,
  getCustomerContextByThread,
  insertCustomerNotification,
};
