const pool = require("../config/db");

const invoiceEligibleStatuses = new Set(["completed"]);
const paymentStatuses = new Set(["unpaid", "partially_paid", "paid", "overdue"]);

function toSqlDate(value) {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.toISOString().slice(0, 10);
}

function addDays(value, numberOfDays) {
  const parsedDate = value ? new Date(value) : new Date();

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  parsedDate.setDate(parsedDate.getDate() + numberOfDays);
  return parsedDate;
}

function getDefaultDueDate(serviceDate) {
  return toSqlDate(addDays(serviceDate, 7)) || toSqlDate(new Date());
}

function formatInvoiceNumber(invoiceId, createdAt) {
  const parsedDate = createdAt ? new Date(createdAt) : new Date();
  const invoiceYear = Number.isNaN(parsedDate.getTime())
    ? new Date().getFullYear()
    : parsedDate.getFullYear();

  return `INV-${invoiceYear}-${String(invoiceId).padStart(5, "0")}`;
}

function derivePaymentStatus({ amountDue, amountPaid, dueDate, requestedStatus }) {
  const normalizedRequestedStatus = String(requestedStatus || "").trim().toLowerCase();
  const safeAmountDue = Number(amountDue || 0);
  const safeAmountPaid = Number(amountPaid || 0);
  const normalizedDueDate = toSqlDate(dueDate);
  const today = toSqlDate(new Date());

  if (normalizedRequestedStatus === "paid") {
    return "paid";
  }

  if (safeAmountDue > 0 && safeAmountPaid >= safeAmountDue) {
    return "paid";
  }

  if (safeAmountPaid > 0) {
    return "partially_paid";
  }

  if (normalizedRequestedStatus === "overdue") {
    return "overdue";
  }

  if (normalizedDueDate && normalizedDueDate < today) {
    return "overdue";
  }

  return "unpaid";
}

async function assignInvoiceNumber(invoiceId, createdAt, db = pool) {
  const invoiceNumber = formatInvoiceNumber(invoiceId, createdAt);
  const invoiceResult = await db.query(
    `
      UPDATE billing_invoices
      SET invoice_number = $1
      WHERE id = $2
      RETURNING *
    `,
    [invoiceNumber, invoiceId]
  );

  return invoiceResult.rows[0] || null;
}

async function syncInvoiceForServiceRecord(serviceRecordId, db = pool) {
  const serviceRecordResult = await db.query(
    `
      SELECT
        sr.id,
        sr.amount,
        sr.status,
        sr.service_date,
        sr.mechanic_id,
        v.created_by
      FROM service_records sr
      JOIN vehicles v ON v.id = sr.vehicle_id
      WHERE sr.id = $1
      LIMIT 1
    `,
    [serviceRecordId]
  );

  const serviceRecord = serviceRecordResult.rows[0];

  if (!serviceRecord || !invoiceEligibleStatuses.has(serviceRecord.status)) {
    return null;
  }

  const existingInvoiceResult = await db.query(
    `
      SELECT *
      FROM billing_invoices
      WHERE service_record_id = $1
      LIMIT 1
    `,
    [serviceRecordId]
  );

  const existingInvoice = existingInvoiceResult.rows[0] || null;
  const amountDue = Number(serviceRecord.amount || 0);
  const amountPaid = existingInvoice
    ? Math.min(Number(existingInvoice.amount_paid || 0), amountDue)
    : 0;
  const dueDate = existingInvoice?.due_date || getDefaultDueDate(serviceRecord.service_date);
  const paymentStatus = derivePaymentStatus({
    amountDue,
    amountPaid,
    dueDate,
    requestedStatus: existingInvoice?.payment_status,
  });

  if (existingInvoice) {
    const updatedInvoiceResult = await db.query(
      `
        UPDATE billing_invoices
        SET
          amount_due = $1,
          amount_paid = $2,
          payment_status = $3,
          due_date = $4,
          created_by = COALESCE(created_by, $5),
          paid_at = CASE
            WHEN $3 = 'paid' THEN COALESCE(paid_at, CURRENT_DATE)
            WHEN $3 = 'partially_paid' THEN paid_at
            ELSE NULL
          END
        WHERE id = $6
        RETURNING *
      `,
      [
        amountDue,
        amountPaid,
        paymentStatus,
        dueDate,
        serviceRecord.mechanic_id || serviceRecord.created_by || null,
        existingInvoice.id,
      ]
    );

    return updatedInvoiceResult.rows[0] || null;
  }

  const createdInvoiceResult = await db.query(
    `
      INSERT INTO billing_invoices (
        service_record_id,
        amount_due,
        amount_paid,
        payment_status,
        due_date,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
    [
      serviceRecordId,
      amountDue,
      amountPaid,
      paymentStatus,
      dueDate,
      serviceRecord.mechanic_id || serviceRecord.created_by || null,
    ]
  );

  const createdInvoice = createdInvoiceResult.rows[0] || null;

  if (!createdInvoice) {
    return null;
  }

  return assignInvoiceNumber(createdInvoice.id, createdInvoice.created_at, db);
}

module.exports = {
  derivePaymentStatus,
  getDefaultDueDate,
  invoiceEligibleStatuses,
  paymentStatuses,
  syncInvoiceForServiceRecord,
  toSqlDate,
};
