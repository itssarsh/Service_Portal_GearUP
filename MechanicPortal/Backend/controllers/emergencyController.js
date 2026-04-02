const pool = require("../config/db");
const { isWorkshopRole, normalizeRole } = require("../utils/roles");
const {
  getCustomerContextByServiceRecord,
  insertCustomerNotification,
} = require("../utils/customerNotifications");
const {
  normalizePhoneNumber,
  normalizeRegistrationNumber,
  normalizeWhitespace,
  toTitleCase,
} = require("../utils/normalize");

const allowedVehicleTypes = new Set(["car", "tractor", "bike", "truck", "other"]);
const allowedEmergencyStatuses = new Set([
  "open",
  "assigned",
  "in_progress",
  "resolved",
  "cancelled",
]);
const allowedEmergencyPriorities = new Set(["low", "medium", "high", "critical"]);
const allowedTransportOptions = new Set(["drop_off", "pickup_drop"]);

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

function buildVehicleLabel(context) {
  return [
    context?.brand,
    context?.model,
    context?.registration_number,
  ]
    .filter(Boolean)
    .join(" ");
}

const emergencyRequestSelectSql = `
  SELECT
    sr.id,
    sr.vehicle_id,
    sr.mechanic_id,
    sr.service_type,
    sr.complaint,
    sr.work_summary,
    sr.status,
    sr.booking_date,
    sr.booking_time_slot,
    sr.estimated_hours,
    sr.transport_option,
    sr.is_emergency,
    sr.emergency_status,
    sr.emergency_location,
    sr.emergency_priority,
    sr.emergency_requested_at,
    sr.emergency_resolved_at,
    sr.created_at,
    v.registration_number,
    v.vehicle_type,
    v.brand,
    v.model,
    COALESCE(customer.name, v.owner_name) AS owner_name,
    COALESCE(customer.phone, v.owner_phone) AS owner_phone,
    mechanic.name AS mechanic_name,
    mechanic.phone AS mechanic_phone,
    mechanic.address AS mechanic_address,
    creator.name AS created_by_name
  FROM service_records sr
  JOIN vehicles v ON v.id = sr.vehicle_id
  LEFT JOIN users customer ON customer.id = v.owner_user_id
  LEFT JOIN users mechanic ON mechanic.id = sr.mechanic_id
  LEFT JOIN users creator ON creator.id = v.created_by
`;

function getEmergencyVisibilitySql(roleParameterPosition, userIdParameterPosition) {
  return `
    (
      ($${roleParameterPosition} = 'admin')
      OR (
        $${roleParameterPosition} = 'mechanic'
        AND (
          sr.mechanic_id = $${userIdParameterPosition}
          OR v.created_by = $${userIdParameterPosition}
          OR (
            sr.mechanic_id IS NULL
            AND EXISTS (
              SELECT 1
              FROM emergency_notifications en
              WHERE
                en.service_record_id = sr.id
                AND en.mechanic_id = $${userIdParameterPosition}
            )
          )
        )
      )
    )
  `;
}

async function getCurrentUser(userId, db = pool) {
  const result = await db.query(
    "SELECT id, name, email, phone, address, role FROM users WHERE id = $1",
    [userId]
  );

  return result.rows[0] || null;
}

function getEmergencyServiceStatus(emergencyStatus) {
  if (emergencyStatus === "in_progress") {
    return "in_progress";
  }

  if (emergencyStatus === "resolved" || emergencyStatus === "cancelled") {
    return "completed";
  }

  return "accepted";
}

function extractPincode(value) {
  const match = String(value || "").match(/\b\d{6}\b/);
  return match ? match[0] : "";
}

function tokenizeLocation(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !/^\d+$/.test(token));
}

function getLocationScore(leftLocation, rightLocation) {
  const leftPincode = extractPincode(leftLocation);
  const rightPincode = extractPincode(rightLocation);

  if (leftPincode && rightPincode) {
    if (leftPincode === rightPincode) {
      return 0;
    }

    if (leftPincode.slice(0, 3) === rightPincode.slice(0, 3)) {
      return 1;
    }
  }

  const leftTokens = tokenizeLocation(leftLocation);
  const rightTokens = new Set(tokenizeLocation(rightLocation));
  const overlap = leftTokens.filter((token) => rightTokens.has(token)).length;

  if (overlap >= 2) {
    return 2;
  }

  if (overlap === 1) {
    return 3;
  }

  return 4;
}

async function getNearbyMechanic(emergencyLocation, currentUser, db = pool) {
  const mechanics = await db.query(
    `
      SELECT id, name, phone, address, role
      FROM users
      WHERE role IN ('mechanic', 'admin')
      ORDER BY id
    `
  );

  if (mechanics.rows.length === 0) {
    return null;
  }

  const rankedMechanics = mechanics.rows
    .map((mechanic) => ({
      ...mechanic,
      score: getLocationScore(emergencyLocation, mechanic.address),
      currentUserPreference: mechanic.id === currentUser.id ? -1 : 0,
    }))
    .sort((leftMechanic, rightMechanic) => {
      if (leftMechanic.score !== rightMechanic.score) {
        return leftMechanic.score - rightMechanic.score;
      }

      if (leftMechanic.currentUserPreference !== rightMechanic.currentUserPreference) {
        return leftMechanic.currentUserPreference - rightMechanic.currentUserPreference;
      }

      return leftMechanic.id - rightMechanic.id;
    });

  return rankedMechanics[0] || null;
}

async function findLinkedCustomer(ownerPhone, db = pool) {
  const normalizedPhone = normalizePhoneNumber(ownerPhone);

  if (!normalizedPhone) {
    return null;
  }

  const result = await db.query(
    `
      SELECT id, name, phone
      FROM users
      WHERE role = 'customer'
        AND regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $1
      ORDER BY id
      LIMIT 1
    `,
    [normalizedPhone]
  );

  return result.rows[0] || null;
}

async function findOrCreateVehicle(payload, currentUser, db = pool) {
  const normalizedRegistrationNumber = normalizeRegistrationNumber(payload.registrationNumber);
  const normalizedVehicleType = String(payload.vehicleType || "")
    .trim()
    .toLowerCase();

  if (!normalizedRegistrationNumber || !normalizedVehicleType || !payload.brand || !payload.model) {
    throw new Error("Vehicle details are required for SOS request");
  }

  if (!allowedVehicleTypes.has(normalizedVehicleType)) {
    throw new Error("Invalid vehicle type");
  }

  if (!payload.ownerName || !payload.ownerPhone) {
    throw new Error("Owner details are required for SOS request");
  }

  const existingVehicle = await db.query(
    `
      SELECT *
      FROM vehicles
      WHERE registration_number = $1
      LIMIT 1
    `,
    [normalizedRegistrationNumber]
  );

  if (existingVehicle.rows.length > 0) {
    return existingVehicle.rows[0];
  }

  const linkedCustomer = await findLinkedCustomer(payload.ownerPhone, db);

  const createdVehicle = await db.query(
    `
      INSERT INTO vehicles (
        registration_number,
        vehicle_type,
        brand,
        model,
        owner_name,
        owner_phone,
        owner_user_id,
        created_by,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `,
    [
      normalizedRegistrationNumber,
      normalizedVehicleType,
      toTitleCase(payload.brand),
      toTitleCase(payload.model),
      toTitleCase(payload.ownerName),
      normalizePhoneNumber(payload.ownerPhone),
      linkedCustomer?.id || null,
      currentUser.id,
      normalizeWhitespace(payload.emergencyLocation || "Emergency location captured"),
    ]
  );

  return createdVehicle.rows[0];
}

async function getEmergencyRequestById(requestId, currentUser, db = pool) {
  const result = await db.query(
    `
      ${emergencyRequestSelectSql}
      WHERE
        sr.id = $1
        AND sr.is_emergency = TRUE
        AND ${getEmergencyVisibilitySql(2, 3)}
      LIMIT 1
    `,
    [requestId, normalizeRole(currentUser.role), currentUser.id]
  );

  return result.rows[0] || null;
}

async function listUnreadNotifications(currentUser, db = pool) {
  const result = await db.query(
    `
      SELECT
        en.id,
        en.service_record_id,
        en.title,
        en.message,
        en.emergency_location,
        en.created_at,
        sr.emergency_priority,
        sr.emergency_status,
        v.registration_number,
        v.brand,
        v.model
      FROM emergency_notifications en
      JOIN service_records sr ON sr.id = en.service_record_id
      JOIN vehicles v ON v.id = sr.vehicle_id
      WHERE
        en.mechanic_id = $1
        AND en.is_read = FALSE
        AND sr.is_emergency = TRUE
        AND (
          sr.mechanic_id IS NULL
          OR sr.mechanic_id = $1
          OR $2 = 'admin'
        )
      ORDER BY en.created_at DESC, en.id DESC
      LIMIT 12
    `,
    [currentUser.id, normalizeRole(currentUser.role)]
  );

  return result.rows;
}

exports.listEmergencyRequests = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || !isWorkshopRole(currentUser.role)) {
      return res.status(403).json({ error: "Mechanic portal access is required" });
    }

    const requests = await pool.query(
      `
        ${emergencyRequestSelectSql}
        WHERE
          sr.is_emergency = TRUE
          AND ${getEmergencyVisibilitySql(2, 1)}
        ORDER BY
          CASE sr.emergency_priority
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            ELSE 4
          END,
          sr.emergency_requested_at DESC,
          sr.id DESC
      `,
      [currentUser.id, normalizeRole(currentUser.role)]
    );

    res.json(requests.rows);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to fetch emergency requests" });
  }
};

exports.listNotifications = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || !isWorkshopRole(currentUser.role)) {
      return res.status(403).json({ error: "Mechanic portal access is required" });
    }

    const notifications = await listUnreadNotifications(currentUser);
    res.json(notifications);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to fetch SOS notifications" });
  }
};

exports.markNotificationsRead = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || !isWorkshopRole(currentUser.role)) {
      return res.status(403).json({ error: "Mechanic portal access is required" });
    }

    const notificationIds = Array.isArray(req.body.notificationIds)
      ? req.body.notificationIds
          .map((notificationId) => Number(notificationId))
          .filter((notificationId) => Number.isInteger(notificationId) && notificationId > 0)
      : [];

    const updatedNotifications = notificationIds.length > 0
      ? await pool.query(
          `
            UPDATE emergency_notifications
            SET
              is_read = TRUE,
              read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
            WHERE
              mechanic_id = $1
              AND id = ANY($2::INT[])
            RETURNING id
          `,
          [currentUser.id, notificationIds]
        )
      : await pool.query(
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
        );

    res.json({ updatedCount: updatedNotifications.rowCount });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to update SOS notifications" });
  }
};

exports.createEmergencyRequest = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || !isWorkshopRole(currentUser.role)) {
      return res.status(403).json({ error: "Mechanic portal access is required" });
    }

    const emergencyLocation = normalizeWhitespace(req.body.emergencyLocation);
    const complaint = normalizeWhitespace(req.body.complaint);
    const emergencyPriority = String(req.body.emergencyPriority || "critical")
      .trim()
      .toLowerCase();
    const estimatedHours = Number(req.body.estimatedHours || 2);
    const transportOption = String(req.body.transportOption || "pickup_drop")
      .trim()
      .toLowerCase();

    if (!emergencyLocation) {
      return res.status(400).json({ error: "Emergency location is required" });
    }

    if (!complaint) {
      return res.status(400).json({ error: "Emergency issue details are required" });
    }

    if (!allowedEmergencyPriorities.has(emergencyPriority)) {
      return res.status(400).json({ error: "Invalid emergency priority" });
    }

    if (!allowedTransportOptions.has(transportOption)) {
      return res.status(400).json({ error: "Invalid transport option" });
    }

    if (Number.isNaN(estimatedHours) || estimatedHours <= 0) {
      return res.status(400).json({ error: "Estimated hours must be greater than zero" });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const vehicle = await findOrCreateVehicle(req.body, currentUser, client);
      const nearbyMechanic = await getNearbyMechanic(emergencyLocation, currentUser, client);

      const createdEmergencyRequest = await client.query(
        `
          INSERT INTO service_records (
            vehicle_id,
            mechanic_id,
            service_type,
            complaint,
            work_summary,
            status,
            customer_booking,
            booking_date,
            booking_status,
            estimated_hours,
            transport_option,
            is_emergency,
            emergency_status,
            emergency_location,
            emergency_priority,
            emergency_requested_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            'accepted',
            FALSE,
            CURRENT_DATE,
            'accepted',
            $6,
            $7,
            TRUE,
            'assigned',
            $8,
            $9,
            CURRENT_TIMESTAMP
          )
          RETURNING id
        `,
        [
          vehicle.id,
          nearbyMechanic?.id || currentUser.id,
          normalizeWhitespace(req.body.serviceType) || "Emergency SOS",
          complaint,
          nearbyMechanic
            ? `Auto-assigned to ${nearbyMechanic.name || "mechanic"} based on nearest service area.`
            : "No nearby mechanic match found. Assigned to current workspace user.",
          estimatedHours,
          transportOption,
          emergencyLocation,
          emergencyPriority,
        ]
      );

      const notificationContext = await getCustomerContextByServiceRecord(
        createdEmergencyRequest.rows[0].id,
        client
      );

      if (notificationContext?.customer_id) {
        const vehicleLabel = buildVehicleLabel(notificationContext);

        await insertCustomerNotification(
          {
            customerId: notificationContext.customer_id,
            serviceRecordId: createdEmergencyRequest.rows[0].id,
            sourceType: "emergency",
            actionType: "created",
            title: "SOS case created for your vehicle",
            message: [
              `${currentUser.name || "Workshop team"} created an SOS case`,
              vehicleLabel ? `for ${vehicleLabel}.` : "for your vehicle.",
              emergencyLocation ? `Location: ${emergencyLocation}.` : "",
              complaint ? `Issue: ${complaint}.` : "",
            ]
              .filter(Boolean)
              .join(" "),
          },
          client
        );
      }

      await client.query("COMMIT");

      const request = await getEmergencyRequestById(createdEmergencyRequest.rows[0].id, currentUser);
      res.status(201).json(request);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to create SOS request" });
  }
};

exports.updateEmergencyStatus = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || !isWorkshopRole(currentUser.role)) {
      return res.status(403).json({ error: "Mechanic portal access is required" });
    }

    const existingRequest = await getEmergencyRequestById(req.params.id, currentUser);

    if (!existingRequest) {
      return res.status(404).json({ error: "Emergency request not found" });
    }

    const emergencyStatus = String(req.body.emergencyStatus || "")
      .trim()
      .toLowerCase();
    const workSummary = normalizeWhitespace(req.body.workSummary);
    const normalizedRole = normalizeRole(currentUser.role);

    if (!allowedEmergencyStatuses.has(emergencyStatus)) {
      return res.status(400).json({ error: "Invalid emergency status" });
    }

    if (
      normalizedRole === "mechanic"
      && existingRequest.mechanic_id
      && Number(existingRequest.mechanic_id) !== Number(currentUser.id)
    ) {
      return res.status(409).json({ error: "This SOS request is already assigned to another mechanic" });
    }

    const shouldAssignMechanic = normalizedRole === "mechanic" && emergencyStatus !== "cancelled";

    const updatedRequest = await pool.query(
      `
        UPDATE service_records
        SET
          emergency_status = $1,
          status = $2,
          work_summary = COALESCE($3, work_summary),
          mechanic_id = CASE
            WHEN $5 = TRUE THEN $6
            ELSE mechanic_id
          END,
          emergency_resolved_at = CASE
            WHEN $1 IN ('resolved', 'cancelled') THEN CURRENT_TIMESTAMP
            ELSE NULL
          END
        WHERE id = $4
        RETURNING id
      `,
      [
        emergencyStatus,
        getEmergencyServiceStatus(emergencyStatus),
        workSummary || null,
        req.params.id,
        shouldAssignMechanic,
        currentUser.id,
      ]
    );

    await pool.query(
      `
        UPDATE emergency_notifications
        SET
          is_read = TRUE,
          read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
        WHERE service_record_id = $1
      `,
      [req.params.id]
    );

    const notificationContext = await getCustomerContextByServiceRecord(req.params.id);

    if (notificationContext?.customer_id) {
      const vehicleLabel = buildVehicleLabel(notificationContext);

      await insertCustomerNotification({
        customerId: notificationContext.customer_id,
        serviceRecordId: Number(req.params.id),
        sourceType: "emergency",
        actionType: emergencyStatus,
        title: `SOS ${formatLabel(emergencyStatus)}`,
        message: [
          `${currentUser.name || "Workshop team"} updated your SOS request to ${formatLabel(
            emergencyStatus
          ).toLowerCase()}.`,
          vehicleLabel ? `Vehicle: ${vehicleLabel}.` : "",
          workSummary ? `Workshop note: ${workSummary}.` : "",
        ]
          .filter(Boolean)
          .join(" "),
      });
    }

    const request = await getEmergencyRequestById(updatedRequest.rows[0].id, currentUser);
    res.json(request);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to update SOS request" });
  }
};
