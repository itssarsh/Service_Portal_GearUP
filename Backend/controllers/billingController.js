const pool = require("../config/db");
const { isWorkshopRole } = require("../utils/roles");
const {
  derivePaymentStatus,
  getDefaultDueDate,
  invoiceEligibleStatuses,
  paymentStatuses,
  syncInvoiceForServiceRecord,
  toSqlDate,
} = require("../utils/billing");

async function getCurrentUser(userId) {
  const result = await pool.query(
    "SELECT id, name, phone, role FROM users WHERE id = $1",
    [userId]
  );

  return result.rows[0] || null;
}

const accessConditionSql = `
  (
    ($2 = 'admin')
    OR ($2 = 'mechanic' AND (sr.mechanic_id = $1 OR v.created_by = $1))
  )
`;

exports.listInvoices = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || !isWorkshopRole(currentUser.role)) {
      return res.status(403).json({ error: "Mechanic portal access is required" });
    }

    const invoiceResult = await pool.query(
      `
        SELECT
          bi.*,
          sr.service_type,
          sr.status AS service_status,
          sr.service_date,
          sr.next_service_date,
          sr.mechanic_id,
          v.id AS vehicle_id,
          v.registration_number,
          v.vehicle_type,
          v.brand,
          v.model,
          COALESCE(customer.name, v.owner_name) AS owner_name,
          COALESCE(customer.phone, v.owner_phone) AS owner_phone,
          mechanic.name AS mechanic_name
        FROM billing_invoices bi
        JOIN service_records sr ON sr.id = bi.service_record_id
        JOIN vehicles v ON v.id = sr.vehicle_id
        LEFT JOIN users customer ON customer.id = v.owner_user_id
        LEFT JOIN users mechanic ON mechanic.id = sr.mechanic_id
        WHERE ${accessConditionSql}
        ORDER BY bi.created_at DESC, bi.id DESC
      `,
      [currentUser.id, currentUser.role]
    );

    res.json(invoiceResult.rows);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to fetch billing invoices" });
  }
};

exports.autoGenerateInvoices = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || !isWorkshopRole(currentUser.role)) {
      return res.status(403).json({ error: "Mechanic portal access is required" });
    }

    const { serviceRecordId } = req.body || {};

    if (serviceRecordId) {
      const serviceRecordResult = await pool.query(
        `
          SELECT sr.id, sr.status
          FROM service_records sr
          JOIN vehicles v ON v.id = sr.vehicle_id
          WHERE sr.id = $3 AND ${accessConditionSql}
          LIMIT 1
        `,
        [currentUser.id, currentUser.role, serviceRecordId]
      );

      const serviceRecord = serviceRecordResult.rows[0] || null;

      if (!serviceRecord) {
        return res.status(404).json({ error: "Service record not found" });
      }

      if (!invoiceEligibleStatuses.has(serviceRecord.status)) {
        return res.status(400).json({ error: "Only completed jobs can be invoiced" });
      }

      const invoice = await syncInvoiceForServiceRecord(serviceRecord.id);

      return res.status(201).json({
        generatedCount: invoice ? 1 : 0,
        invoices: invoice ? [invoice] : [],
      });
    }

    const recordsResult = await pool.query(
      `
        SELECT sr.id
        FROM service_records sr
        JOIN vehicles v ON v.id = sr.vehicle_id
        LEFT JOIN billing_invoices bi ON bi.service_record_id = sr.id
        WHERE
          ${accessConditionSql}
          AND sr.status = 'completed'
          AND bi.id IS NULL
        ORDER BY sr.created_at DESC, sr.id DESC
      `,
      [currentUser.id, currentUser.role]
    );

    const invoices = [];

    for (const record of recordsResult.rows) {
      const invoice = await syncInvoiceForServiceRecord(record.id);

      if (invoice) {
        invoices.push(invoice);
      }
    }

    res.status(201).json({
      generatedCount: invoices.length,
      invoices,
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to auto-generate invoices" });
  }
};

exports.updateInvoicePayment = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || !isWorkshopRole(currentUser.role)) {
      return res.status(403).json({ error: "Mechanic portal access is required" });
    }

    const invoiceResult = await pool.query(
      `
        SELECT
          bi.*,
          sr.service_date
        FROM billing_invoices bi
        JOIN service_records sr ON sr.id = bi.service_record_id
        JOIN vehicles v ON v.id = sr.vehicle_id
        WHERE bi.id = $3 AND ${accessConditionSql}
        LIMIT 1
      `,
      [currentUser.id, currentUser.role, req.params.id]
    );

    const invoice = invoiceResult.rows[0] || null;

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const requestedAmountPaid =
      req.body?.amountPaid !== undefined && req.body?.amountPaid !== null
        ? Number(req.body.amountPaid)
        : Number(invoice.amount_paid || 0);

    if (Number.isNaN(requestedAmountPaid) || requestedAmountPaid < 0) {
      return res.status(400).json({ error: "Amount paid must be a valid positive number" });
    }

    const requestedStatus = String(req.body?.paymentStatus || "").trim().toLowerCase();

    if (requestedStatus && !paymentStatuses.has(requestedStatus)) {
      return res.status(400).json({ error: "Invalid payment status" });
    }

    const amountDue = Number(invoice.amount_due || 0);
    const resolvedAmountPaid =
      requestedStatus === "paid" ? amountDue : Math.min(requestedAmountPaid, amountDue);
    const resolvedDueDate =
      toSqlDate(req.body?.dueDate) ||
      toSqlDate(invoice.due_date) ||
      getDefaultDueDate(invoice.service_date);
    const resolvedPaymentStatus = derivePaymentStatus({
      amountDue,
      amountPaid: resolvedAmountPaid,
      dueDate: resolvedDueDate,
      requestedStatus,
    });
    const resolvedPaidAt =
      resolvedPaymentStatus === "paid"
        ? toSqlDate(req.body?.paidAt) || toSqlDate(invoice.paid_at) || toSqlDate(new Date())
        : resolvedAmountPaid > 0
          ? toSqlDate(req.body?.paidAt) || toSqlDate(invoice.paid_at) || toSqlDate(new Date())
          : null;

    const updatedInvoiceResult = await pool.query(
      `
        UPDATE billing_invoices
        SET
          amount_paid = $1,
          payment_status = $2,
          due_date = $3,
          paid_at = $4,
          payment_method = $5,
          notes = $6
        WHERE id = $7
        RETURNING *
      `,
      [
        resolvedAmountPaid,
        resolvedPaymentStatus,
        resolvedDueDate,
        resolvedPaidAt,
        req.body?.paymentMethod ? String(req.body.paymentMethod).trim() : null,
        req.body?.notes ? String(req.body.notes).trim() : null,
        req.params.id,
      ]
    );

    res.json(updatedInvoiceResult.rows[0]);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to update payment status" });
  }
};

exports.getBillingReport = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || !isWorkshopRole(currentUser.role)) {
      return res.status(403).json({ error: "Mechanic portal access is required" });
    }

    const summaryResult = await pool.query(
      `
        SELECT
          COUNT(*)::INT AS invoice_count,
          COALESCE(SUM(bi.amount_due), 0) AS total_invoiced,
          COALESCE(SUM(bi.amount_paid), 0) AS total_collected,
          COALESCE(SUM(GREATEST(bi.amount_due - bi.amount_paid, 0)), 0) AS outstanding_amount,
          COALESCE(
            SUM(
              CASE
                WHEN bi.payment_status = 'overdue'
                THEN GREATEST(bi.amount_due - bi.amount_paid, 0)
                ELSE 0
              END
            ),
            0
          ) AS overdue_amount,
          COALESCE(
            SUM(CASE WHEN bi.payment_status = 'paid' THEN 1 ELSE 0 END),
            0
          )::INT AS paid_invoices,
          COALESCE(
            SUM(CASE WHEN bi.payment_status = 'partially_paid' THEN 1 ELSE 0 END),
            0
          )::INT AS partially_paid_invoices,
          COALESCE(
            SUM(CASE WHEN bi.payment_status IN ('unpaid', 'overdue') THEN 1 ELSE 0 END),
            0
          )::INT AS unpaid_invoices
        FROM billing_invoices bi
        JOIN service_records sr ON sr.id = bi.service_record_id
        JOIN vehicles v ON v.id = sr.vehicle_id
        WHERE ${accessConditionSql}
      `,
      [currentUser.id, currentUser.role]
    );

    const monthlyResult = await pool.query(
      `
        WITH accessible_invoices AS (
          SELECT bi.*
          FROM billing_invoices bi
          JOIN service_records sr ON sr.id = bi.service_record_id
          JOIN vehicles v ON v.id = sr.vehicle_id
          WHERE ${accessConditionSql}
        ),
        month_buckets AS (
          SELECT generate_series(
            date_trunc('month', CURRENT_DATE) - INTERVAL '1 month',
            date_trunc('month', CURRENT_DATE),
            INTERVAL '1 month'
          ) AS month_bucket
        )
        SELECT
          TO_CHAR(month_bucket, 'Mon YYYY') AS label,
          TO_CHAR(month_bucket, 'YYYY-MM') AS month,
          (
            SELECT COALESCE(SUM(ai.amount_due), 0)
            FROM accessible_invoices ai
            WHERE date_trunc('month', ai.created_at) = month_bucket
          ) AS invoiced_amount,
          (
            SELECT COALESCE(SUM(ai.amount_paid), 0)
            FROM accessible_invoices ai
            WHERE ai.paid_at IS NOT NULL AND date_trunc('month', ai.paid_at) = month_bucket
          ) AS collected_amount
        FROM month_buckets
        ORDER BY month_bucket
      `,
      [currentUser.id, currentUser.role]
    );

    res.json({
      summary: summaryResult.rows[0] || {},
      monthly: monthlyResult.rows,
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to fetch earnings report" });
  }
};
