const pool = require("../config/db");
const { normalizeWhitespace } = require("../utils/normalize");
const {
  getMechanicContextByServiceRecord,
  insertMechanicNotification,
} = require("../utils/mechanicNotifications");

const allowedServiceTypes = new Map([
  ["basic", "Basic"],
  ["full", "Full"],
  ["emergency", "Emergency"],
]);

const allowedTransportOptions = new Set(["drop_off", "pickup_drop"]);
const bookingTimePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
const minimumBookingTimeInMinutes = 9 * 60;
const maximumBookingTimeInMinutes = 18 * 60;

function normalizedPhoneMatchSql(columnName, parameterPosition) {
  return `regexp_replace(COALESCE(${columnName}, ''), '\\D', '', 'g') = regexp_replace(COALESCE($${parameterPosition}, ''), '\\D', '', 'g')`;
}

function formatCurrencyInr(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatPdfCurrencyInr(value) {
  return `INR ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDisplayDate(value, fallback = "Not set") {
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

function getInvoiceNumber(recordId) {
  return `INV-${String(recordId).padStart(6, "0")}`;
}

function convertTimeToMinutes(timeValue) {
  const normalizedValue = String(timeValue || "").trim();
  const match = normalizedValue.match(bookingTimePattern);

  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function isValidBookingTime(timeValue) {
  const totalMinutes = convertTimeToMinutes(timeValue);

  return totalMinutes !== null &&
    totalMinutes >= minimumBookingTimeInMinutes &&
    totalMinutes <= maximumBookingTimeInMinutes;
}

function escapePdfText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function formatPdfNumber(value) {
  return Number(value || 0)
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d)0$/, "$1");
}

function getPdfColor(color) {
  return color
    .map((channel) => formatPdfNumber(Math.max(0, Math.min(255, channel)) / 255))
    .join(" ");
}

function pushPdfText(commands, { text, x, y, size = 12, font = "F1", color = [15, 23, 42] }) {
  commands.push(
    "BT",
    `/${font} ${formatPdfNumber(size)} Tf`,
    `${getPdfColor(color)} rg`,
    `${formatPdfNumber(x)} ${formatPdfNumber(y)} Td`,
    `(${escapePdfText(text)}) Tj`,
    "ET"
  );
}

function pushPdfRect(
  commands,
  { x, y, width, height, fillColor = null, strokeColor = null, lineWidth = 1 }
) {
  commands.push("q");

  if (fillColor) {
    commands.push(`${getPdfColor(fillColor)} rg`);
  }

  if (strokeColor) {
    commands.push(`${getPdfColor(strokeColor)} RG`);
    commands.push(`${formatPdfNumber(lineWidth)} w`);
  }

  commands.push(
    `${formatPdfNumber(x)} ${formatPdfNumber(y)} ${formatPdfNumber(width)} ${formatPdfNumber(height)} re ${
      fillColor && strokeColor ? "B" : fillColor ? "f" : "S"
    }`
  );
  commands.push("Q");
}

function wrapPdfText(value, maxChars = 64, maxLines = 4) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();

  if (!normalized) {
    return ["Not provided"];
  }

  const words = normalized.split(" ");
  const lines = [];
  let currentLine = "";

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (nextLine.length <= maxChars) {
      currentLine = nextLine;
      return;
    }

    if (currentLine) {
      lines.push(currentLine);
      currentLine = word;
      return;
    }

    lines.push(word.slice(0, maxChars));
    currentLine = word.slice(maxChars);
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  if (lines.length <= maxLines) {
    return lines;
  }

  const trimmedLines = lines.slice(0, maxLines);
  const lastLine = trimmedLines[maxLines - 1];

  trimmedLines[maxLines - 1] =
    lastLine.length >= maxChars
      ? `${lastLine.slice(0, Math.max(0, maxChars - 3))}...`
      : `${lastLine}...`;

  return trimmedLines;
}

function formatInvoiceStatus(status) {
  return String(status || "completed")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildPdfDocument(invoice) {
  const commands = [];
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;
  const headerHeight = 108;
  const cardGap = 18;
  const cardWidth = (contentWidth - cardGap) / 2;
  const mutedColor = [100, 116, 139];
  const inkColor = [15, 23, 42];
  const navyColor = [17, 50, 91];
  const accentColor = [184, 134, 11];
  const panelFill = [248, 250, 252];
  const panelStroke = [226, 232, 240];

  pushPdfRect(commands, {
    x: 0,
    y: pageHeight - headerHeight,
    width: pageWidth,
    height: headerHeight,
    fillColor: navyColor,
  });

  pushPdfText(commands, {
    text: "VEHICLE SERVICE INVOICE",
    x: margin,
    y: 742,
    size: 24,
    font: "F2",
    color: [255, 255, 255],
  });
  pushPdfText(commands, {
    text: "Workshop billing summary for your completed service",
    x: margin,
    y: 721,
    size: 10,
    color: [224, 231, 255],
  });
  pushPdfText(commands, {
    text: `Invoice No. ${invoice.invoiceNumber}`,
    x: 386,
    y: 742,
    size: 12,
    font: "F2",
    color: [255, 255, 255],
  });
  pushPdfText(commands, {
    text: `Generated on ${invoice.generatedOn}`,
    x: 386,
    y: 722,
    size: 10,
    color: [224, 231, 255],
  });

  const cardTop = 654;
  const cardHeight = 86;

  pushPdfRect(commands, {
    x: margin,
    y: cardTop - cardHeight,
    width: cardWidth,
    height: cardHeight,
    fillColor: panelFill,
    strokeColor: panelStroke,
  });
  pushPdfRect(commands, {
    x: margin + cardWidth + cardGap,
    y: cardTop - cardHeight,
    width: cardWidth,
    height: cardHeight,
    fillColor: panelFill,
    strokeColor: panelStroke,
  });

  pushPdfText(commands, {
    text: "Billed To",
    x: margin + 16,
    y: 632,
    size: 10,
    font: "F2",
    color: mutedColor,
  });
  pushPdfText(commands, {
    text: invoice.customerName,
    x: margin + 16,
    y: 610,
    size: 16,
    font: "F2",
    color: inkColor,
  });
  pushPdfText(commands, {
    text: invoice.customerPhone,
    x: margin + 16,
    y: 591,
    size: 11,
    color: mutedColor,
  });

  const vehicleCardX = margin + cardWidth + cardGap + 16;
  pushPdfText(commands, {
    text: "Vehicle",
    x: vehicleCardX,
    y: 632,
    size: 10,
    font: "F2",
    color: mutedColor,
  });
  pushPdfText(commands, {
    text: invoice.vehicleName,
    x: vehicleCardX,
    y: 610,
    size: 16,
    font: "F2",
    color: inkColor,
  });
  pushPdfText(commands, {
    text: invoice.registrationNumber,
    x: vehicleCardX,
    y: 591,
    size: 11,
    color: mutedColor,
  });

  pushPdfRect(commands, {
    x: margin,
    y: 430,
    width: contentWidth,
    height: 126,
    fillColor: [255, 255, 255],
    strokeColor: panelStroke,
  });
  pushPdfText(commands, {
    text: "Service Details",
    x: margin + 16,
    y: 532,
    size: 12,
    font: "F2",
    color: inkColor,
  });

  const detailRows = [
    { label: "Service Type", value: invoice.serviceType },
    { label: "Service Date", value: invoice.serviceDate },
    { label: "Status", value: invoice.status },
    { label: "Mechanic", value: invoice.mechanicName },
    { label: "Concern", value: invoice.concernShort },
    { label: "Warranty", value: invoice.warrantyShort },
  ];

  detailRows.forEach((row, index) => {
    const column = index % 2;
    const rowIndex = Math.floor(index / 2);
    const baseX = margin + 16 + column * 258;
    const baseY = 503 - rowIndex * 30;

    pushPdfText(commands, {
      text: row.label,
      x: baseX,
      y: baseY,
      size: 9,
      font: "F2",
      color: mutedColor,
    });
    pushPdfText(commands, {
      text: row.value,
      x: baseX,
      y: baseY - 15,
      size: 11,
      color: inkColor,
    });
  });

  pushPdfRect(commands, {
    x: margin,
    y: 210,
    width: contentWidth,
    height: 196,
    fillColor: panelFill,
    strokeColor: panelStroke,
  });
  pushPdfText(commands, {
    text: "Workshop Notes",
    x: margin + 16,
    y: 382,
    size: 12,
    font: "F2",
    color: inkColor,
  });

  let notesCursorY = 356;
  const noteSections = [
    { label: "Complaint", lines: wrapPdfText(invoice.concern, 74, 3) },
    { label: "Work Summary", lines: wrapPdfText(invoice.workSummary, 74, 5) },
    { label: "Warranty Notes", lines: wrapPdfText(invoice.warrantyNotes, 74, 3) },
  ];

  noteSections.forEach((section) => {
    pushPdfText(commands, {
      text: section.label,
      x: margin + 16,
      y: notesCursorY,
      size: 9,
      font: "F2",
      color: mutedColor,
    });

    section.lines.forEach((line, index) => {
      pushPdfText(commands, {
        text: line,
        x: margin + 16,
        y: notesCursorY - 16 - index * 14,
        size: 11,
        color: inkColor,
      });
    });

    notesCursorY -= 34 + section.lines.length * 14;
  });

  pushPdfRect(commands, {
    x: 360,
    y: 110,
    width: 210,
    height: 70,
    fillColor: navyColor,
  });
  pushPdfText(commands, {
    text: "Invoice Total",
    x: 378,
    y: 155,
    size: 10,
    font: "F2",
    color: [226, 232, 240],
  });
  pushPdfText(commands, {
    text: invoice.amount,
    x: 378,
    y: 128,
    size: 22,
    font: "F2",
    color: [255, 255, 255],
  });

  pushPdfText(commands, {
    text: "Thank you for choosing our workshop. Keep this invoice for future service and warranty support.",
    x: margin,
    y: 78,
    size: 10,
    color: mutedColor,
  });
  pushPdfText(commands, {
    text: "This invoice is system-generated and reflects the latest workshop record.",
    x: margin,
    y: 60,
    size: 9,
    color: accentColor,
  });

  const content = commands.join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((objectBody, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${objectBody}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";

  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

async function getOwnedVehicle(currentUser, vehicleId) {
  const vehicleResult = await pool.query(
    `
      SELECT id, registration_number, brand, model
      FROM vehicles
      WHERE id = $1
      AND (owner_user_id = $2 OR ${normalizedPhoneMatchSql("owner_phone", 3)})
    `,
    [vehicleId, currentUser.id, currentUser.phone]
  );

  return vehicleResult.rows[0] || null;
}

async function getMechanicById(mechanicId) {
  if (!Number.isInteger(mechanicId) || mechanicId <= 0) {
    return null;
  }

  const mechanicResult = await pool.query(
    `
      SELECT id, name, role
      FROM users
      WHERE id = $1
      AND LOWER(TRIM(role)) = 'mechanic'
    `,
    [mechanicId]
  );

  return mechanicResult.rows[0] || null;
}

function validateBookingPayload(payload) {
  const errors = [];
  const vehicleId = Number(payload.vehicleId);
  const rawMechanicId = payload.mechanicId;
  const normalizedServiceType = String(payload.serviceType || "").trim().toLowerCase();
  const bookingDate = String(payload.bookingDate || "").trim();
  const bookingTimeSlot = String(payload.bookingTimeSlot || "").trim();
  const transportOption = String(payload.transportOption || "").trim().toLowerCase();
  const concern = normalizeWhitespace(payload.concern || "");
  const mechanicId =
    rawMechanicId === null || rawMechanicId === undefined || String(rawMechanicId).trim() === ""
      ? null
      : Number(rawMechanicId);

  if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
    errors.push("Select a vehicle to continue");
  }

  if (!allowedServiceTypes.has(normalizedServiceType)) {
    errors.push("Choose a valid service type");
  }

  if (!bookingDate) {
    errors.push("Booking date is required");
  } else if (bookingDate < getTodayDateString()) {
    errors.push("Booking date cannot be in the past");
  }

  if (!bookingTimeSlot) {
    errors.push("Preferred time is required");
  } else if (!isValidBookingTime(bookingTimeSlot)) {
    errors.push("Choose a valid preferred time between 09:00 and 18:00");
  }

  if (!allowedTransportOptions.has(transportOption)) {
    errors.push("Choose a valid pickup and drop option");
  }

  if (mechanicId !== null && (!Number.isInteger(mechanicId) || mechanicId <= 0)) {
    errors.push("Choose a valid mechanic");
  }

  return {
    errors,
    data: {
      vehicleId,
      mechanicId,
      serviceType: allowedServiceTypes.get(normalizedServiceType) || "",
      bookingDate,
      bookingTimeSlot,
      transportOption,
      concern: concern || null,
    },
  };
}

function validateFeedbackPayload(payload) {
  const errors = [];
  const rating = Number(payload.rating);
  const feedback = normalizeWhitespace(payload.feedback || "");

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    errors.push("Please select a rating between 1 and 5");
  }

  return {
    errors,
    data: {
      rating,
      feedback: feedback || null,
    },
  };
}

function validateRaisedComplaintPayload(payload) {
  const complaint = normalizeWhitespace(payload.complaint || "");

  if (!complaint) {
    return {
      errors: ["Please share the complaint details before submitting"],
      data: null,
    };
  }

  return {
    errors: [],
    data: {
      complaint,
    },
  };
}

async function getCurrentUser(userId) {
  const result = await pool.query(
    "SELECT id, phone, role FROM users WHERE id = $1",
    [userId]
  );

  return result.rows[0] || null;
}

async function getOwnedServiceRecord(currentUser, recordId) {
  const result = await pool.query(
    `
      SELECT
        sr.id,
        sr.status,
        sr.customer_booking,
        sr.mechanic_id,
        sr.customer_rating,
        sr.customer_feedback,
        sr.customer_complaint,
        sr.customer_complaint_status,
        sr.customer_complaint_mechanic_note,
        sr.customer_complaint_updated_at
      FROM service_records sr
      JOIN vehicles v ON v.id = sr.vehicle_id
      WHERE
        sr.id = $1
        AND (v.owner_user_id = $2 OR ${normalizedPhoneMatchSql("v.owner_phone", 3)})
    `,
    [recordId, currentUser.id, currentUser.phone]
  );

  return result.rows[0] || null;
}

async function getOwnedServiceRecordDetails(currentUser, recordId) {
  const result = await pool.query(
    `
      SELECT
        sr.*,
        v.registration_number,
        v.vehicle_type,
        v.brand,
        v.model,
        v.owner_name,
        v.owner_phone,
        mechanic.name AS mechanic_name
      FROM service_records sr
      JOIN vehicles v ON v.id = sr.vehicle_id
      LEFT JOIN users mechanic ON mechanic.id = sr.mechanic_id
      WHERE
        sr.id = $1
        AND (v.owner_user_id = $2 OR ${normalizedPhoneMatchSql("v.owner_phone", 3)})
    `,
    [recordId, currentUser.id, currentUser.phone]
  );

  return result.rows[0] || null;
}

exports.createServiceRecord = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || currentUser.role !== "customer") {
      return res.status(403).json({ error: "Customer portal access is required" });
    }

    const { errors, data } = validateBookingPayload(req.body);

    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0] });
    }

    const ownedVehicle = await getOwnedVehicle(currentUser, data.vehicleId);

    if (!ownedVehicle) {
      return res.status(404).json({ error: "Vehicle not found for this customer" });
    }

    if (data.mechanicId !== null) {
      const selectedMechanic = await getMechanicById(data.mechanicId);

      if (!selectedMechanic) {
        return res.status(404).json({ error: "Selected mechanic was not found" });
      }
    }

    const result = await pool.query(
      `
        INSERT INTO service_records (
          vehicle_id,
          mechanic_id,
          service_type,
          complaint,
          status,
          amount,
          service_date,
          next_service_date,
          customer_booking,
          booking_date,
          booking_time_slot,
          transport_option
        )
        VALUES ($1, $2, $3, $4, 'pending', 0, NULL, NULL, TRUE, $5, $6, $7)
        RETURNING *
      `,
      [
        data.vehicleId,
        data.mechanicId,
        data.serviceType,
        data.concern,
        data.bookingDate,
        data.bookingTimeSlot,
        data.transportOption,
      ]
    );

    const mechanicContext = await getMechanicContextByServiceRecord(result.rows[0].id);

    if (mechanicContext?.mechanic_id) {
      const vehicleLabel = buildVehicleLabel(mechanicContext);

      await insertMechanicNotification({
        mechanicId: mechanicContext.mechanic_id,
        customerId: currentUser.id,
        serviceRecordId: result.rows[0].id,
        sourceType: "booking",
        actionType: "created",
        title: "New booking request",
        message: [
          `${currentUser.name || "Customer"} requested ${String(data.serviceType || "service").trim()} service`,
          vehicleLabel ? `for ${vehicleLabel}.` : "for a customer vehicle.",
          `Visit date: ${formatDisplayDate(data.bookingDate)}.`,
          `Time slot: ${data.bookingTimeSlot}.`,
        ]
          .filter(Boolean)
          .join(" "),
      });
    }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to create service booking" });
  }
};

exports.updateServiceRecord = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || currentUser.role !== "customer") {
      return res.status(403).json({ error: "Customer portal access is required" });
    }

    const existingRecordResult = await pool.query(
      `
        SELECT sr.id, sr.status, sr.customer_booking
        FROM service_records sr
        JOIN vehicles v ON v.id = sr.vehicle_id
        WHERE
          sr.id = $1
          AND sr.customer_booking = TRUE
          AND (v.owner_user_id = $2 OR ${normalizedPhoneMatchSql("v.owner_phone", 3)})
      `,
      [req.params.id, currentUser.id, currentUser.phone]
    );

    const existingRecord = existingRecordResult.rows[0];

    if (!existingRecord) {
      return res.status(404).json({ error: "Booking not found" });
    }

    if (existingRecord.status !== "pending") {
      return res.status(400).json({ error: "Only pending bookings can be edited" });
    }

    const { errors, data } = validateBookingPayload(req.body);

    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0] });
    }

    const ownedVehicle = await getOwnedVehicle(currentUser, data.vehicleId);

    if (!ownedVehicle) {
      return res.status(404).json({ error: "Vehicle not found for this customer" });
    }

    if (data.mechanicId !== null) {
      const selectedMechanic = await getMechanicById(data.mechanicId);

      if (!selectedMechanic) {
        return res.status(404).json({ error: "Selected mechanic was not found" });
      }
    }

    const result = await pool.query(
      `
        UPDATE service_records
        SET
          vehicle_id = $1,
          mechanic_id = $2,
          service_type = $3,
          complaint = $4,
          booking_date = $5,
          booking_time_slot = $6,
          transport_option = $7
        WHERE id = $8
        RETURNING *
      `,
      [
        data.vehicleId,
        data.mechanicId,
        data.serviceType,
        data.concern,
        data.bookingDate,
        data.bookingTimeSlot,
        data.transportOption,
        req.params.id,
      ]
    );

    const mechanicContext = await getMechanicContextByServiceRecord(req.params.id);

    if (mechanicContext?.mechanic_id) {
      const vehicleLabel = buildVehicleLabel(mechanicContext);

      await insertMechanicNotification({
        mechanicId: mechanicContext.mechanic_id,
        customerId: currentUser.id,
        serviceRecordId: result.rows[0].id,
        sourceType: "booking",
        actionType: "updated",
        title: "Booking request updated",
        message: [
          `${currentUser.name || "Customer"} updated a booking request`,
          vehicleLabel ? `for ${vehicleLabel}.` : "for a customer vehicle.",
          `Visit date: ${formatDisplayDate(data.bookingDate)}.`,
          `Time slot: ${data.bookingTimeSlot}.`,
        ]
          .filter(Boolean)
          .join(" "),
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to update service booking" });
  }
};

exports.listBookingMechanics = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || currentUser.role !== "customer") {
      return res.status(403).json({ error: "Customer portal access is required" });
    }

    const mechanics = await pool.query(
      `
        SELECT id, name
        FROM users
        WHERE LOWER(TRIM(role)) = 'mechanic'
        ORDER BY name ASC, id ASC
      `
    );

    res.json(mechanics.rows);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to fetch mechanics" });
  }
};

exports.getServiceRecordById = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || currentUser.role !== "customer") {
      return res.status(403).json({ error: "Customer portal access is required" });
    }

    const result = await pool.query(
      `
        SELECT
          sr.*,
          v.registration_number,
          v.vehicle_type,
          v.brand,
          v.model,
          v.owner_name,
          v.owner_phone,
          mechanic.name AS mechanic_name
        FROM service_records sr
        JOIN vehicles v ON v.id = sr.vehicle_id
        LEFT JOIN users mechanic ON mechanic.id = sr.mechanic_id
        WHERE
          sr.id = $1
          AND (v.owner_user_id = $2 OR ${normalizedPhoneMatchSql("v.owner_phone", 3)})
      `,
      [req.params.id, currentUser.id, currentUser.phone]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Service record not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to fetch service record" });
  }
};

exports.listServiceRecords = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || currentUser.role !== "customer") {
      return res.status(403).json({ error: "Customer portal access is required" });
    }

    const records = await pool.query(
      `
        SELECT
          sr.*,
          v.registration_number,
          v.vehicle_type,
          v.brand,
          v.model,
          v.owner_name,
          v.owner_phone,
          mechanic.name AS mechanic_name
        FROM service_records sr
        JOIN vehicles v ON v.id = sr.vehicle_id
        LEFT JOIN users mechanic ON mechanic.id = sr.mechanic_id
        WHERE v.owner_user_id = $1 OR ${normalizedPhoneMatchSql("v.owner_phone", 2)}
        ORDER BY
          COALESCE(sr.booking_date, sr.service_date) DESC NULLS LAST,
          sr.created_at DESC,
          sr.id DESC
      `,
      [currentUser.id, currentUser.phone]
    );

    res.json(records.rows);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to fetch service records" });
  }
};

exports.submitServiceFeedback = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || currentUser.role !== "customer") {
      return res.status(403).json({ error: "Customer portal access is required" });
    }

    const existingRecord = await getOwnedServiceRecord(currentUser, req.params.id);

    if (!existingRecord) {
      return res.status(404).json({ error: "Service record not found" });
    }

    if (!existingRecord.mechanic_id) {
      return res.status(400).json({ error: "Rating can be shared after a mechanic is assigned" });
    }

    if (!["completed", "delivered"].includes(existingRecord.status)) {
      return res.status(400).json({ error: "Rating can be submitted after service is completed" });
    }

    if (existingRecord.customer_rating || existingRecord.customer_feedback) {
      return res.status(400).json({ error: "Mechanic rating has already been submitted for this service" });
    }

    const { errors, data } = validateFeedbackPayload(req.body);

    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0] });
    }

    const result = await pool.query(
      `
        UPDATE service_records
        SET
          customer_rating = $1,
          customer_feedback = $2,
          customer_feedback_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *
      `,
      [data.rating, data.feedback, req.params.id]
    );

    if (existingRecord.mechanic_id) {
      const mechanicContext = await getMechanicContextByServiceRecord(req.params.id);
      const vehicleLabel = buildVehicleLabel(mechanicContext);

      await insertMechanicNotification({
        mechanicId: existingRecord.mechanic_id,
        customerId: currentUser.id,
        serviceRecordId: req.params.id,
        sourceType: "rating",
        actionType: "submitted",
        title: "New customer rating",
        message: [
          `${currentUser.name || "Customer"} rated your completed service ${data.rating}/5.`,
          vehicleLabel ? `Vehicle: ${vehicleLabel}.` : "",
          data.feedback ? `Feedback: ${data.feedback}` : "",
        ]
          .filter(Boolean)
          .join(" "),
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to submit service feedback" });
  }
};

exports.raiseServiceComplaint = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || currentUser.role !== "customer") {
      return res.status(403).json({ error: "Customer portal access is required" });
    }

    const existingRecord = await getOwnedServiceRecord(currentUser, req.params.id);

    if (!existingRecord) {
      return res.status(404).json({ error: "Service record not found" });
    }

    if (existingRecord.status === "pending") {
      return res.status(400).json({ error: "Complaint can be raised once the service has started" });
    }

    if (existingRecord.customer_complaint) {
      return res.status(400).json({ error: "A complaint has already been submitted for this service" });
    }

    const { errors, data } = validateRaisedComplaintPayload(req.body);

    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0] });
    }

    const result = await pool.query(
      `
        UPDATE service_records
        SET
          customer_complaint = $1,
          customer_complaint_status = 'open',
          customer_complaint_created_at = CURRENT_TIMESTAMP,
          customer_complaint_mechanic_note = NULL,
          customer_complaint_updated_at = NULL,
          customer_complaint_updated_by = NULL
        WHERE id = $2
        RETURNING *
      `,
      [data.complaint, req.params.id]
    );

    if (existingRecord.mechanic_id) {
      const mechanicContext = await getMechanicContextByServiceRecord(req.params.id);
      const vehicleLabel = buildVehicleLabel(mechanicContext);

      await insertMechanicNotification({
        mechanicId: existingRecord.mechanic_id,
        customerId: currentUser.id,
        serviceRecordId: req.params.id,
        sourceType: "complaint",
        actionType: "raised",
        title: "New customer complaint",
        message: [
          `${currentUser.name || "Customer"} raised a complaint for a completed service.`,
          vehicleLabel ? `Vehicle: ${vehicleLabel}.` : "",
          `Complaint: ${data.complaint}`,
        ]
          .filter(Boolean)
          .join(" "),
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to raise complaint" });
  }
};

exports.downloadInvoicePdf = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || currentUser.role !== "customer") {
      return res.status(403).json({ error: "Customer portal access is required" });
    }

    const record = await getOwnedServiceRecordDetails(currentUser, req.params.id);

    if (!record) {
      return res.status(404).json({ error: "Service record not found" });
    }

    if (!["completed", "delivered"].includes(record.status)) {
      return res.status(400).json({ error: "Invoice is available after service completion" });
    }

    const invoiceNumber = getInvoiceNumber(record.id);
    const warrantyPeriod =
      record.warranty_name || record.warranty_start_date || record.warranty_end_date
        ? `${record.warranty_name || "Included"} (${formatDisplayDate(
            record.warranty_start_date
          )} to ${formatDisplayDate(record.warranty_end_date)})`
        : "Not added";
    const pdfBuffer = buildPdfDocument({
      invoiceNumber,
      generatedOn: formatDisplayDate(new Date(), "Today"),
      customerName: record.owner_name || "Customer",
      customerPhone: record.owner_phone || "Phone not set",
      vehicleName: `${record.brand || ""} ${record.model || ""}`.trim() || "Vehicle",
      registrationNumber: record.registration_number || "Registration not set",
      serviceType: record.service_type || "Service",
      mechanicName: record.mechanic_name || "Not assigned",
      serviceDate: formatDisplayDate(record.service_date),
      status: formatInvoiceStatus(record.status),
      concern: record.complaint || "No booking concern was added.",
      concernShort: wrapPdfText(record.complaint || "Not provided", 26, 1)[0],
      workSummary: record.work_summary || "Workshop summary was not added.",
      amount: formatPdfCurrencyInr(record.amount),
      warrantyShort: wrapPdfText(warrantyPeriod, 26, 1)[0],
      warrantyNotes:
        record.warranty_notes ||
        (record.warranty_name || record.warranty_start_date || record.warranty_end_date
          ? `Coverage: ${warrantyPeriod}`
          : "No warranty details were attached to this service."),
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${invoiceNumber}.pdf"`);
    res.setHeader("Content-Length", pdfBuffer.length);

    return res.send(pdfBuffer);
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({ error: "Failed to generate invoice PDF" });
  }
};
