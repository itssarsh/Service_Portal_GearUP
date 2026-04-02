const pool = require("../config/db");
const { normalizeWhitespace } = require("../utils/normalize");

const allowedEmergencyPriorities = new Set(["low", "medium", "high", "critical"]);
const allowedTransportOptions = new Set(["drop_off", "pickup_drop"]);

function normalizedPhoneMatchSql(columnName, parameterPosition) {
  return `regexp_replace(COALESCE(${columnName}, ''), '\\D', '', 'g') = regexp_replace(COALESCE($${parameterPosition}, ''), '\\D', '', 'g')`;
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

async function getCurrentUser(userId, db = pool) {
  const result = await db.query(
    "SELECT id, name, email, phone, address, role FROM users WHERE id = $1",
    [userId]
  );

  return result.rows[0] || null;
}

async function getNearbyMechanics(emergencyLocation, db = pool) {
  const mechanics = await db.query(
    `
      SELECT id, name, phone, address, role
      FROM users
      WHERE role = 'mechanic'
      ORDER BY id
    `
  );

  if (mechanics.rows.length === 0) {
    return [];
  }

  const rankedMechanics = mechanics.rows
    .map((mechanic) => ({
      ...mechanic,
      score: getLocationScore(emergencyLocation, mechanic.address),
    }))
    .sort((leftMechanic, rightMechanic) => {
      if (leftMechanic.score !== rightMechanic.score) {
        return leftMechanic.score - rightMechanic.score;
      }

      return leftMechanic.id - rightMechanic.id;
    });

  return rankedMechanics;
}

async function createEmergencyNotifications(
  serviceRecordId,
  currentUser,
  ownedVehicle,
  emergencyLocation,
  complaint,
  mechanics,
  db = pool
) {
  const title = "New nearby SOS request";
  const vehicleLabel = [
    ownedVehicle.brand,
    ownedVehicle.model,
    ownedVehicle.registration_number,
  ]
    .filter(Boolean)
    .join(" ");
  const message = [
    `${currentUser.name || "Customer"} raised an SOS request`,
    vehicleLabel ? `for ${vehicleLabel}` : "",
    emergencyLocation ? `near ${emergencyLocation}` : "",
    complaint ? `Issue: ${complaint}.` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  for (const mechanic of mechanics) {
    await db.query(
      `
        INSERT INTO emergency_notifications (
          mechanic_id,
          service_record_id,
          title,
          message,
          emergency_location
        )
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (mechanic_id, service_record_id)
        DO UPDATE SET
          title = EXCLUDED.title,
          message = EXCLUDED.message,
          emergency_location = EXCLUDED.emergency_location,
          is_read = FALSE,
          read_at = NULL,
          created_at = CURRENT_TIMESTAMP
      `,
      [mechanic.id, serviceRecordId, title, message, emergencyLocation]
    );
  }
}

async function getOwnedVehicle(currentUser, vehicleId, db = pool) {
  const result = await db.query(
    `
      SELECT *
      FROM vehicles
      WHERE
        id = $1
        AND (owner_user_id = $2 OR ${normalizedPhoneMatchSql("owner_phone", 3)})
      LIMIT 1
    `,
    [vehicleId, currentUser.id, currentUser.phone]
  );

  return result.rows[0] || null;
}

async function getOwnedEmergencyRequest(currentUser, requestId, db = pool) {
  const result = await db.query(
    `
      SELECT
        sr.*,
        v.registration_number,
        v.vehicle_type,
        v.brand,
        v.model,
        v.owner_name,
        v.owner_phone,
        mechanic.name AS mechanic_name,
        mechanic.phone AS mechanic_phone
      FROM service_records sr
      JOIN vehicles v ON v.id = sr.vehicle_id
      LEFT JOIN users mechanic ON mechanic.id = sr.mechanic_id
      WHERE
        sr.id = $1
        AND sr.is_emergency = TRUE
        AND (v.owner_user_id = $2 OR ${normalizedPhoneMatchSql("v.owner_phone", 3)})
      LIMIT 1
    `,
    [requestId, currentUser.id, currentUser.phone]
  );

  return result.rows[0] || null;
}

exports.listEmergencyRequests = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || currentUser.role !== "customer") {
      return res.status(403).json({ error: "Customer portal access is required" });
    }

    const requests = await pool.query(
      `
        SELECT
          sr.*,
          v.registration_number,
          v.vehicle_type,
          v.brand,
          v.model,
          v.owner_name,
          v.owner_phone,
          mechanic.name AS mechanic_name,
          mechanic.phone AS mechanic_phone
        FROM service_records sr
        JOIN vehicles v ON v.id = sr.vehicle_id
        LEFT JOIN users mechanic ON mechanic.id = sr.mechanic_id
        WHERE
          sr.is_emergency = TRUE
          AND (v.owner_user_id = $1 OR ${normalizedPhoneMatchSql("v.owner_phone", 2)})
        ORDER BY
          sr.emergency_requested_at DESC NULLS LAST,
          sr.created_at DESC,
          sr.id DESC
      `,
      [currentUser.id, currentUser.phone]
    );

    res.json(requests.rows);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to fetch SOS requests" });
  }
};

exports.createEmergencyRequest = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || currentUser.role !== "customer") {
      return res.status(403).json({ error: "Customer portal access is required" });
    }

    const vehicleId = Number(req.body.vehicleId);
    const emergencyLocation = normalizeWhitespace(req.body.emergencyLocation);
    const complaint = normalizeWhitespace(req.body.complaint);
    const emergencyPriority = String(req.body.emergencyPriority || "critical")
      .trim()
      .toLowerCase();
    const transportOption = String(req.body.transportOption || "pickup_drop")
      .trim()
      .toLowerCase();

    if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
      return res.status(400).json({ error: "Choose a valid vehicle" });
    }

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

    const ownedVehicle = await getOwnedVehicle(currentUser, vehicleId);

    if (!ownedVehicle) {
      return res.status(404).json({ error: "Vehicle not found for this customer" });
    }

    const client = await pool.connect();

    let createdRequestId = null;

    try {
      await client.query("BEGIN");

      const nearbyMechanics = await getNearbyMechanics(emergencyLocation, client);
      const assignmentSummary = nearbyMechanics.length
        ? `SOS request raised. ${nearbyMechanics.length} mechanic${
            nearbyMechanics.length > 1 ? "s have" : " has"
          } been notified.`
        : "SOS request raised. Mechanic notification is pending.";

      const createdRequest = await client.query(
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
            booking_time_slot,
            transport_option,
            is_emergency,
            emergency_status,
            emergency_location,
            emergency_priority,
            emergency_requested_at
          )
          VALUES (
            $1,
            NULL,
            'emergency',
            $2,
            $3,
            'pending',
            TRUE,
            CURRENT_DATE,
            'Emergency ASAP',
            $4,
            TRUE,
            'open',
            $5,
            $6,
            CURRENT_TIMESTAMP
          )
          RETURNING id
        `,
        [
          ownedVehicle.id,
          complaint,
          assignmentSummary,
          transportOption,
          emergencyLocation,
          emergencyPriority,
        ]
      );

      createdRequestId = createdRequest.rows[0].id;

      if (nearbyMechanics.length > 0) {
        await createEmergencyNotifications(
          createdRequestId,
          currentUser,
          ownedVehicle,
          emergencyLocation,
          complaint,
          nearbyMechanics,
          client
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const request = await getOwnedEmergencyRequest(currentUser, createdRequestId);
    res.status(201).json(request);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to create SOS request" });
  }
};
