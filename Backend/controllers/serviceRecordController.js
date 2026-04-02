const pool = require("../config/db");
const { isWorkshopRole, normalizeRole } = require("../utils/roles");
const { syncInvoiceForServiceRecord } = require("../utils/billing");
const {
  getCustomerContextByServiceRecord,
  insertCustomerNotification,
} = require("../utils/customerNotifications");

const allowedStatuses = new Set(["requested", "accepted", "in_progress", "completed"]);
const allowedBookingStatuses = new Set(["requested", "accepted", "rejected", "rescheduled"]);
const allowedTransportOptions = new Set(["drop_off", "pickup_drop"]);
const allowedComplaintStatuses = new Set(["open", "in_review", "resolved"]);

function formatLabel(value, fallback = "Update") {
  if (!value) {
    return fallback;
  }

  return String(value)
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatCurrencyInr(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDisplayDate(value, fallback = "Not scheduled") {
  if (!value) {
    return fallback;
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return fallback;
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsedDate);
}

function buildVehicleLabel(context) {
  return [
    context?.brand,
    context?.model,
    context?.registration_number,
  ]
    .filter(Boolean)
    .join(" ");
}

const serviceRecordResponseSelect = `
  SELECT
    sr.*,
    v.registration_number,
    v.vehicle_type,
    v.brand,
    v.model,
    COALESCE(customer.name, v.owner_name) AS owner_name,
    COALESCE(customer.phone, v.owner_phone) AS owner_phone,
    mechanic.name AS mechanic_name
  FROM service_records sr
  JOIN vehicles v ON v.id = sr.vehicle_id
  LEFT JOIN users customer ON customer.id = v.owner_user_id
  LEFT JOIN users mechanic ON mechanic.id = sr.mechanic_id
`;

async function getCurrentUser(userId) {
  const result = await pool.query(
    "SELECT id, name, phone, role FROM users WHERE id = $1",
    [userId]
  );

  return result.rows[0] || null;
}

async function getAccessibleVehicle(vehicleId, currentUser) {
  const result = await pool.query(
    `
      SELECT
        v.id,
        v.created_by,
        EXISTS (
          SELECT 1
          FROM service_records sr
          WHERE sr.vehicle_id = v.id AND sr.mechanic_id = $2
        ) AS assigned_to_mechanic
      FROM vehicles v
      WHERE v.id = $1
    `,
    [vehicleId, currentUser.id]
  );

  const vehicle = result.rows[0] || null;

  if (!vehicle) {
    return null;
  }

  if (normalizeRole(currentUser.role) !== "mechanic") {
    return vehicle;
  }

  if (vehicle.created_by === currentUser.id || vehicle.assigned_to_mechanic) {
    return vehicle;
  }

  return null;
}

async function getAccessibleServiceRecord(recordId, currentUser, db = pool) {
  const result = await db.query(
    `
      SELECT sr.*, v.created_by
      FROM service_records sr
      JOIN vehicles v ON v.id = sr.vehicle_id
      WHERE
        sr.id = $1
        AND (
          ($2 = 'admin')
          OR ($2 = 'mechanic' AND (sr.mechanic_id = $3 OR v.created_by = $3))
        )
      LIMIT 1
    `,
    [recordId, currentUser.role, currentUser.id]
  );

  return result.rows[0] || null;
}

async function getServiceRecordResponse(recordId, currentUser, db = pool) {
  const result = await db.query(
    `
      ${serviceRecordResponseSelect}
      WHERE
        sr.id = $1
        AND (
          ($2 = 'admin')
          OR ($2 = 'mechanic' AND (sr.mechanic_id = $3 OR v.created_by = $3))
        )
      LIMIT 1
    `,
    [recordId, currentUser.role, currentUser.id]
  );

  return result.rows[0] || null;
}

function parseServiceRecordInput(body) {
  const {
    vehicleId,
    serviceType,
    complaint,
    workSummary,
    status,
    amount,
    kmReading,
    serviceDate,
    nextServiceDate,
    customerBooking,
    bookingDate,
    bookingTimeSlot,
    bookingStatus,
    rejectionReason,
    estimatedHours,
    transportOption,
  } = body;

  const trimmedServiceType = serviceType?.trim();
  const trimmedComplaint = complaint?.trim();
  const trimmedWorkSummary = workSummary?.trim();
  const trimmedBookingTimeSlot = bookingTimeSlot?.trim();
  const trimmedRejectionReason = rejectionReason?.trim();
  const normalizedStatus = status?.trim().toLowerCase();
  const normalizedAmount = Number(amount);
  const normalizedKmReading = Number(kmReading);
  const normalizedEstimatedHours = Number(estimatedHours);
  const normalizedCustomerBooking = true;
  const normalizedBookingStatus =
    bookingStatus?.trim().toLowerCase() ||
    (normalizedStatus === "requested" ? "requested" : "accepted");
  const normalizedTransportOption = transportOption?.trim().toLowerCase() || "drop_off";
  const isBillingRequired = normalizedStatus === "completed";
  const hasAmount = amount !== undefined && amount !== null && String(amount).trim() !== "";
  const hasKmReading =
    kmReading !== undefined && kmReading !== null && String(kmReading).trim() !== "";
  const hasEstimatedHours =
    estimatedHours !== undefined && estimatedHours !== null && String(estimatedHours).trim() !== "";

  return {
    vehicleId,
    trimmedServiceType,
    trimmedComplaint,
    trimmedWorkSummary,
    normalizedStatus,
    normalizedAmount,
    normalizedKmReading,
    serviceDate,
    nextServiceDate,
    normalizedCustomerBooking,
    bookingDate,
    trimmedBookingTimeSlot,
    normalizedBookingStatus,
    trimmedRejectionReason,
    normalizedEstimatedHours,
    normalizedTransportOption,
    hasAmount,
    hasKmReading,
    hasEstimatedHours,
    isBillingRequired,
  };
}

function validateServiceRecordInput(input) {
  if (!input.vehicleId || !input.trimmedServiceType || !input.normalizedStatus) {
    return "Required fields are missing";
  }

  if (!allowedStatuses.has(input.normalizedStatus)) {
    return "Invalid status";
  }

  if (!allowedBookingStatuses.has(input.normalizedBookingStatus)) {
    return "Invalid booking status";
  }

  if (!allowedTransportOptions.has(input.normalizedTransportOption)) {
    return "Invalid transport option";
  }

  if (
    input.isBillingRequired &&
    (!input.hasAmount || !input.hasKmReading || !input.serviceDate || !input.nextServiceDate)
  ) {
    return "Completed records require billing and schedule details";
  }

  if (input.normalizedCustomerBooking && !input.bookingDate) {
    return "Schedule date is required";
  }

  if (
    (input.hasAmount && Number.isNaN(input.normalizedAmount)) ||
    (input.hasKmReading && Number.isNaN(input.normalizedKmReading)) ||
    (input.hasEstimatedHours && Number.isNaN(input.normalizedEstimatedHours))
  ) {
    return "Amount, KM reading, and workload hours must be valid numbers";
  }

  if (input.hasEstimatedHours && input.normalizedEstimatedHours <= 0) {
    return "Workload hours must be greater than zero";
  }

  return null;
}

function parseBookingActionInput(body) {
  const bookingStatus = body?.bookingStatus?.trim().toLowerCase();
  const bookingDate = body?.bookingDate || null;
  const bookingTimeSlot = body?.bookingTimeSlot?.trim() || null;
  const rejectionReason = body?.rejectionReason?.trim() || null;
  const transportOption = body?.transportOption?.trim().toLowerCase() || null;
  const estimatedHours = body?.estimatedHours;
  const hasEstimatedHours =
    estimatedHours !== undefined && estimatedHours !== null && String(estimatedHours).trim() !== "";
  const normalizedEstimatedHours = Number(estimatedHours);

  return {
    bookingStatus,
    bookingDate,
    bookingTimeSlot,
    rejectionReason,
    transportOption,
    hasEstimatedHours,
    normalizedEstimatedHours,
  };
}

function parseComplaintActionInput(body) {
  return {
    complaintStatus: body?.complaintStatus?.trim().toLowerCase() || "open",
    mechanicNote: body?.mechanicNote?.trim() || "",
  };
}

exports.createServiceRecord = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || !isWorkshopRole(currentUser.role)) {
      return res.status(403).json({ error: "Mechanic portal access is required" });
    }

    const parsedInput = parseServiceRecordInput(req.body);
    const validationError = validateServiceRecordInput(parsedInput);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const accessibleVehicle = await getAccessibleVehicle(parsedInput.vehicleId, currentUser);

    if (!accessibleVehicle) {
      return res.status(404).json({ error: "Vehicle not found" });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const recordResult = await client.query(
        `
          INSERT INTO service_records (
            vehicle_id,
            mechanic_id,
            service_type,
            complaint,
            work_summary,
            status,
            amount,
            km_reading,
            service_date,
            next_service_date,
            customer_booking,
            booking_date,
            booking_time_slot,
            booking_status,
            rejection_reason,
            estimated_hours,
            transport_option
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            COALESCE($9, CURRENT_DATE),
            $10,
            $11,
            $12,
            $13,
            $14,
            $15,
            $16,
            $17
          )
          RETURNING *
        `,
        [
          parsedInput.vehicleId,
          req.user.id,
          parsedInput.trimmedServiceType,
          parsedInput.trimmedComplaint || null,
          parsedInput.trimmedWorkSummary || null,
          parsedInput.normalizedStatus,
          parsedInput.hasAmount ? parsedInput.normalizedAmount : 0,
          parsedInput.hasKmReading ? parsedInput.normalizedKmReading : null,
          parsedInput.serviceDate || null,
          parsedInput.nextServiceDate || null,
          parsedInput.normalizedCustomerBooking,
          parsedInput.bookingDate || null,
          parsedInput.trimmedBookingTimeSlot || null,
          parsedInput.normalizedBookingStatus,
          parsedInput.trimmedRejectionReason || null,
          parsedInput.hasEstimatedHours ? parsedInput.normalizedEstimatedHours : 1,
          parsedInput.normalizedTransportOption,
        ]
      );

      const notificationContext = await getCustomerContextByServiceRecord(recordResult.rows[0].id, client);

      if (notificationContext?.customer_id) {
        const vehicleLabel = buildVehicleLabel(notificationContext);

        await insertCustomerNotification(
          {
            customerId: notificationContext.customer_id,
            serviceRecordId: recordResult.rows[0].id,
            sourceType: "service_record",
            actionType: "created",
            title: "New service job created",
            message: [
              `${currentUser.name || "Workshop team"} created a ${formatLabel(
                notificationContext.service_type,
                "service"
              ).toLowerCase()} record`,
              vehicleLabel ? `for ${vehicleLabel}.` : "for your vehicle.",
            ]
              .filter(Boolean)
              .join(" "),
          },
          client
        );
      }

      await syncInvoiceForServiceRecord(recordResult.rows[0].id, client);
      await client.query("COMMIT");

      const createdRecord = await getServiceRecordResponse(recordResult.rows[0].id, currentUser);
      res.status(201).json(createdRecord || recordResult.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to create service record" });
  }
};

exports.getServiceRecordById = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || !isWorkshopRole(currentUser.role)) {
      return res.status(403).json({ error: "Mechanic portal access is required" });
    }

    const record = await getServiceRecordResponse(req.params.id, currentUser);

    if (!record) {
      return res.status(404).json({ error: "Service record not found" });
    }

    res.json(record);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to fetch service record" });
  }
};

exports.updateServiceRecord = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || !isWorkshopRole(currentUser.role)) {
      return res.status(403).json({ error: "Mechanic portal access is required" });
    }

    const parsedInput = parseServiceRecordInput(req.body);
    const validationError = validateServiceRecordInput(parsedInput);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const accessibleVehicle = await getAccessibleVehicle(parsedInput.vehicleId, currentUser);

    if (!accessibleVehicle) {
      return res.status(404).json({ error: "Vehicle not found" });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const existingRecord = await getAccessibleServiceRecord(req.params.id, currentUser, client);

      if (!existingRecord) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Service record not found" });
      }

      const updatedRecord = await client.query(
        `
          UPDATE service_records
          SET
            vehicle_id = $1,
            mechanic_id = $2,
            service_type = $3,
            complaint = $4,
            work_summary = $5,
            status = $6,
            amount = $7,
            km_reading = $8,
            service_date = $9,
            next_service_date = $10,
            customer_booking = $11,
            booking_date = $12,
            booking_time_slot = $13,
            booking_status = $14,
            rejection_reason = $15,
            estimated_hours = $16,
            transport_option = $17
          WHERE id = $18
          RETURNING *
        `,
        [
          parsedInput.vehicleId,
          existingRecord.mechanic_id,
          parsedInput.trimmedServiceType,
          parsedInput.trimmedComplaint || null,
          parsedInput.trimmedWorkSummary || null,
          parsedInput.normalizedStatus,
          parsedInput.hasAmount ? parsedInput.normalizedAmount : 0,
          parsedInput.hasKmReading ? parsedInput.normalizedKmReading : null,
          parsedInput.serviceDate || null,
          parsedInput.nextServiceDate || null,
          parsedInput.normalizedCustomerBooking,
          parsedInput.bookingDate || null,
          parsedInput.trimmedBookingTimeSlot || null,
          parsedInput.normalizedBookingStatus,
          parsedInput.trimmedRejectionReason || null,
          parsedInput.hasEstimatedHours ? parsedInput.normalizedEstimatedHours : 1,
          parsedInput.normalizedTransportOption,
          req.params.id,
        ]
      );

      const notificationContext = await getCustomerContextByServiceRecord(req.params.id, client);
      const changeSummaryParts = [];
      const previousAmount = Number(existingRecord.amount || 0);
      const nextAmount = parsedInput.hasAmount ? parsedInput.normalizedAmount : 0;

      if (existingRecord.status !== parsedInput.normalizedStatus) {
        changeSummaryParts.push(`status changed to ${formatLabel(parsedInput.normalizedStatus)}`);
      }

      if ((existingRecord.work_summary || "").trim() !== (parsedInput.trimmedWorkSummary || "").trim()) {
        changeSummaryParts.push(
          parsedInput.trimmedWorkSummary ? "work summary was updated" : "work summary was cleared"
        );
      }

      if (previousAmount !== nextAmount) {
        changeSummaryParts.push(`amount updated to ${formatCurrencyInr(nextAmount)}`);
      }

      if ((existingRecord.next_service_date || null) !== (parsedInput.nextServiceDate || null)) {
        changeSummaryParts.push(
          parsedInput.nextServiceDate
            ? `next service date set for ${formatDisplayDate(parsedInput.nextServiceDate)}`
            : "next service date was removed"
        );
      }

      if ((existingRecord.booking_date || null) !== (parsedInput.bookingDate || null)) {
        changeSummaryParts.push(
          parsedInput.bookingDate
            ? `visit date updated to ${formatDisplayDate(parsedInput.bookingDate)}`
            : "visit date was removed"
        );
      }

      if ((existingRecord.booking_time_slot || "") !== (parsedInput.trimmedBookingTimeSlot || "")) {
        changeSummaryParts.push(
          parsedInput.trimmedBookingTimeSlot
            ? `time slot changed to ${parsedInput.trimmedBookingTimeSlot}`
            : "time slot was cleared"
        );
      }

      if (notificationContext?.customer_id) {
        const vehicleLabel = buildVehicleLabel(notificationContext);

        await insertCustomerNotification(
          {
            customerId: notificationContext.customer_id,
            serviceRecordId: updatedRecord.rows[0].id,
            sourceType: "service_record",
            actionType: "updated",
            title: "Mechanic updated your service",
            message: [
              `${currentUser.name || "Workshop team"} updated your service record`,
              vehicleLabel ? `for ${vehicleLabel}.` : "for your vehicle.",
              changeSummaryParts.length > 0
                ? `Changes: ${changeSummaryParts.join(", ")}.`
                : "Please open the dashboard to review the latest details.",
            ]
              .filter(Boolean)
              .join(" "),
          },
          client
        );
      }

      await syncInvoiceForServiceRecord(req.params.id, client);
      await client.query("COMMIT");

      const responseRecord = await getServiceRecordResponse(updatedRecord.rows[0].id, currentUser);
      res.json(responseRecord || updatedRecord.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to update service record" });
  }
};

exports.updateBookingRequest = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || !isWorkshopRole(currentUser.role)) {
      return res.status(403).json({ error: "Mechanic portal access is required" });
    }

    const existingRecord = await getAccessibleServiceRecord(req.params.id, currentUser);

    if (!existingRecord) {
      return res.status(404).json({ error: "Service record not found" });
    }

    if (!existingRecord.customer_booking) {
      return res.status(400).json({ error: "This record is not marked as a customer booking request" });
    }

    const bookingAction = parseBookingActionInput(req.body);

    if (!bookingAction.bookingStatus || !allowedBookingStatuses.has(bookingAction.bookingStatus)) {
      return res.status(400).json({ error: "Invalid booking status" });
    }

    if (
      bookingAction.transportOption &&
      !allowedTransportOptions.has(bookingAction.transportOption)
    ) {
      return res.status(400).json({ error: "Invalid transport option" });
    }

    if (
      bookingAction.hasEstimatedHours &&
      (Number.isNaN(bookingAction.normalizedEstimatedHours) ||
        bookingAction.normalizedEstimatedHours <= 0)
    ) {
      return res.status(400).json({ error: "Workload hours must be greater than zero" });
    }

    const resolvedBookingDate = bookingAction.bookingDate || existingRecord.booking_date || null;

    if (
      (bookingAction.bookingStatus === "accepted" || bookingAction.bookingStatus === "rescheduled") &&
      !resolvedBookingDate
    ) {
      return res.status(400).json({ error: "Accepted or rescheduled bookings require a booking date" });
    }

    if (
      bookingAction.bookingStatus === "rejected" &&
      existingRecord.status !== "requested"
    ) {
      return res.status(400).json({ error: "Only requested bookings can be rejected" });
    }

    const updatedRecord = await pool.query(
      `
        UPDATE service_records
        SET
          booking_status = $1,
          booking_date = $2,
          booking_time_slot = $3,
          rejection_reason = CASE WHEN $1 = 'rejected' THEN $4 ELSE NULL END,
          estimated_hours = COALESCE($5, estimated_hours),
          transport_option = COALESCE($6, transport_option)
        WHERE id = $7
        RETURNING id
      `,
      [
        bookingAction.bookingStatus,
        resolvedBookingDate,
        bookingAction.bookingTimeSlot || existingRecord.booking_time_slot || null,
        bookingAction.rejectionReason || null,
        bookingAction.hasEstimatedHours ? bookingAction.normalizedEstimatedHours : null,
        bookingAction.transportOption || null,
        req.params.id,
      ]
    );

    const notificationContext = await getCustomerContextByServiceRecord(req.params.id);

    if (notificationContext?.customer_id) {
      const vehicleLabel = buildVehicleLabel(notificationContext);
      const bookingUpdateMessageByStatus = {
        accepted: [
          `${currentUser.name || "Workshop team"} accepted your booking`,
          vehicleLabel ? `for ${vehicleLabel}.` : "for your vehicle.",
          `Visit date: ${formatDisplayDate(resolvedBookingDate)}.`,
          `Time slot: ${bookingAction.bookingTimeSlot || existingRecord.booking_time_slot || "To be confirmed"}.`,
        ],
        rescheduled: [
          `${currentUser.name || "Workshop team"} rescheduled your booking`,
          vehicleLabel ? `for ${vehicleLabel}.` : "for your vehicle.",
          `New visit date: ${formatDisplayDate(resolvedBookingDate)}.`,
          `Time slot: ${bookingAction.bookingTimeSlot || existingRecord.booking_time_slot || "To be confirmed"}.`,
        ],
        rejected: [
          `${currentUser.name || "Workshop team"} rejected your booking`,
          vehicleLabel ? `for ${vehicleLabel}.` : "for your vehicle.",
          bookingAction.rejectionReason ? `Reason: ${bookingAction.rejectionReason}.` : "",
        ],
        requested: [
          `${currentUser.name || "Workshop team"} updated your booking request`,
          vehicleLabel ? `for ${vehicleLabel}.` : "for your vehicle.",
        ],
      };

      await insertCustomerNotification({
        customerId: notificationContext.customer_id,
        serviceRecordId: updatedRecord.rows[0].id,
        sourceType: "booking",
        actionType: bookingAction.bookingStatus,
        title: `Booking ${formatLabel(bookingAction.bookingStatus)}`,
        message: (bookingUpdateMessageByStatus[bookingAction.bookingStatus] || []).filter(Boolean).join(" "),
      });
    }

    const responseRecord = await getServiceRecordResponse(updatedRecord.rows[0].id, currentUser);
    res.json(responseRecord || updatedRecord.rows[0]);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to update booking request" });
  }
};

exports.updateComplaintAction = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || !isWorkshopRole(currentUser.role)) {
      return res.status(403).json({ error: "Mechanic portal access is required" });
    }

    const complaintAction = parseComplaintActionInput(req.body);

    if (!allowedComplaintStatuses.has(complaintAction.complaintStatus)) {
      return res.status(400).json({ error: "Invalid complaint status" });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const existingRecord = await getAccessibleServiceRecord(req.params.id, currentUser, client);

      if (!existingRecord) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Service record not found" });
      }

      if (!String(existingRecord.customer_complaint || "").trim()) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "No customer complaint is available for this service record" });
      }

      const previousStatus = existingRecord.customer_complaint_status || "open";
      const previousNote = String(existingRecord.customer_complaint_mechanic_note || "").trim();
      const nextNote = complaintAction.mechanicNote.trim();
      const hasStatusChanged = previousStatus !== complaintAction.complaintStatus;
      const hasNoteChanged = previousNote !== nextNote;

      if (!hasStatusChanged && !hasNoteChanged) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "No complaint action changes were provided" });
      }

      const updatedResult = await client.query(
        `
          UPDATE service_records
          SET
            customer_complaint_status = $1,
            customer_complaint_mechanic_note = $2,
            customer_complaint_updated_at = CURRENT_TIMESTAMP,
            customer_complaint_updated_by = $3
          WHERE id = $4
          RETURNING id
        `,
        [
          complaintAction.complaintStatus,
          nextNote || null,
          currentUser.id,
          req.params.id,
        ]
      );

      const notificationContext = await getCustomerContextByServiceRecord(req.params.id, client);

      if (notificationContext?.customer_id) {
        const vehicleLabel = buildVehicleLabel(notificationContext);
        const statusLabel = formatLabel(complaintAction.complaintStatus, "Open");
        const complaintTitle =
          complaintAction.complaintStatus === "resolved"
            ? "Complaint resolved"
            : complaintAction.complaintStatus === "in_review"
              ? "Complaint under review"
              : "Complaint updated";

        await insertCustomerNotification(
          {
            customerId: notificationContext.customer_id,
            serviceRecordId: updatedResult.rows[0].id,
            sourceType: "complaint",
            actionType: complaintAction.complaintStatus,
            title: complaintTitle,
            message: [
              `${currentUser.name || "Workshop team"} updated your complaint`,
              vehicleLabel ? `for ${vehicleLabel}.` : "for your vehicle.",
              `Status: ${statusLabel}.`,
              nextNote ? `Note: ${nextNote}` : "",
            ]
              .filter(Boolean)
              .join(" "),
          },
          client
        );
      }

      await client.query("COMMIT");

      const responseRecord = await getServiceRecordResponse(updatedResult.rows[0].id, currentUser);
      res.json(responseRecord || updatedResult.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to update complaint action" });
  }
};

exports.listServiceRecords = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || !isWorkshopRole(currentUser.role)) {
      return res.status(403).json({ error: "Mechanic portal access is required" });
    }

    const records = await pool.query(
      `
        ${serviceRecordResponseSelect}
        WHERE
          ($2 = 'admin')
          OR ($2 = 'mechanic' AND (sr.mechanic_id = $1 OR v.created_by = $1))
        ORDER BY
          CASE
            WHEN sr.customer_booking = TRUE THEN COALESCE(sr.booking_date, sr.service_date)
            ELSE COALESCE(sr.service_date, sr.booking_date)
          END DESC NULLS LAST,
          sr.created_at DESC,
          sr.id DESC
      `,
      [currentUser.id, currentUser.role]
    );

    res.json(records.rows);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to fetch service records" });
  }
};
