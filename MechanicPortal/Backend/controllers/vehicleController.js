const pool = require("../config/db");
const {
  normalizePhoneNumber,
  normalizeRegistrationNumber,
  normalizeWhitespace,
  toTitleCase,
} = require("../utils/normalize");
const { isWorkshopRole } = require("../utils/roles");

function normalizedPhoneMatchSql(columnName, parameterPosition) {
  return `regexp_replace(COALESCE(${columnName}, ''), '\\D', '', 'g') = regexp_replace(COALESCE($${parameterPosition}, ''), '\\D', '', 'g')`;
}

const allowedVehicleTypes = new Set(["car", "tractor", "bike", "truck", "other"]);

async function getCurrentUser(userId) {
  const result = await pool.query(
    "SELECT id, name, phone, role FROM users WHERE id = $1",
    [userId]
  );

  return result.rows[0] || null;
}

async function getAccessibleVehicle(vehicleId, currentUser) {
  const vehicleResult = await pool.query(
    `
      SELECT v.*
      FROM vehicles v
      WHERE
        v.id = $1
        AND (
          ($3 = 'admin')
          OR (
            $3 = 'mechanic'
            AND (
              v.created_by = $2
              OR EXISTS (
                SELECT 1
                FROM service_records sr
                WHERE sr.vehicle_id = v.id AND sr.mechanic_id = $2
              )
            )
          )
        )
      LIMIT 1
    `,
    [vehicleId, currentUser.id, currentUser.role]
  );

  return vehicleResult.rows[0] || null;
}

exports.createVehicle = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || !isWorkshopRole(currentUser.role)) {
      return res.status(403).json({ error: "Mechanic portal access is required" });
    }

    const {
      registrationNumber,
      vehicleType,
      brand,
      model,
      manufactureYear,
      ownerName,
      ownerPhone,
      notes,
      ownerUserId,
    } = req.body;

    if (!registrationNumber || !vehicleType || !brand || !model) {
      return res.status(400).json({ error: "Vehicle details are required" });
    }

    if (!ownerName || !ownerPhone) {
      return res.status(400).json({ error: "Owner details are required" });
    }

    const normalizedType = vehicleType.trim().toLowerCase();

    if (!allowedVehicleTypes.has(normalizedType)) {
      return res.status(400).json({ error: "Invalid vehicle type" });
    }

    let resolvedOwnerName = toTitleCase(ownerName);
    let resolvedOwnerPhone = normalizePhoneNumber(ownerPhone);
    let resolvedOwnerUserId = ownerUserId || null;

    if (resolvedOwnerUserId) {
      const ownerResult = await pool.query(
        "SELECT id, name, phone FROM users WHERE id = $1",
        [resolvedOwnerUserId]
      );

      if (ownerResult.rows.length === 0) {
        return res.status(404).json({ error: "Selected owner not found" });
      }

      resolvedOwnerName = ownerResult.rows[0].name;
      resolvedOwnerPhone = ownerResult.rows[0].phone;
    } else {
      const ownerResult = await pool.query(
        `
          SELECT id, name, phone
          FROM users
          WHERE ${normalizedPhoneMatchSql("phone", 1)}
          ORDER BY id
          LIMIT 1
        `,
        [resolvedOwnerPhone]
      );

      if (ownerResult.rows.length > 0) {
        resolvedOwnerUserId = ownerResult.rows[0].id;
        resolvedOwnerName = ownerResult.rows[0].name;
        resolvedOwnerPhone = ownerResult.rows[0].phone;
      }
    }

    const vehicleResult = await pool.query(
      `
        INSERT INTO vehicles (
          registration_number,
          vehicle_type,
          brand,
          model,
          manufacture_year,
          owner_name,
          owner_phone,
          owner_user_id,
          created_by,
          notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `,
      [
        normalizeRegistrationNumber(registrationNumber),
        normalizedType,
        toTitleCase(brand),
        toTitleCase(model),
        manufactureYear || null,
        resolvedOwnerName,
        resolvedOwnerPhone,
        resolvedOwnerUserId,
        currentUser.id,
        notes ? normalizeWhitespace(notes) : null,
      ]
    );

    res.status(201).json(vehicleResult.rows[0]);
  } catch (error) {
    console.error(error.message);

    if (error.code === "23505") {
      return res.status(400).json({ error: "Vehicle with this registration number already exists" });
    }

    res.status(500).json({ error: "Failed to create vehicle" });
  }
};

exports.listVehicles = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || !isWorkshopRole(currentUser.role)) {
      return res.status(403).json({ error: "Mechanic portal access is required" });
    }

    const vehicles = await pool.query(
      `
        SELECT
          v.*,
          COALESCE(owner_user.name, v.owner_name) AS owner_name,
          COALESCE(owner_user.phone, v.owner_phone) AS owner_phone,
          creator.name AS created_by_name
        FROM vehicles v
        LEFT JOIN users owner_user ON owner_user.id = v.owner_user_id
        LEFT JOIN users creator ON creator.id = v.created_by
        WHERE
          ($2 = 'admin')
          OR (
            $2 = 'mechanic'
            AND (
              v.created_by = $1
              OR EXISTS (
                SELECT 1
                FROM service_records sr
                WHERE sr.vehicle_id = v.id AND sr.mechanic_id = $1
              )
            )
          )
        ORDER BY v.created_at DESC, v.id DESC
      `,
      [currentUser.id, currentUser.role]
    );

    res.json(vehicles.rows);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to fetch vehicles" });
  }
};

exports.updateVehicleNotes = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || !isWorkshopRole(currentUser.role)) {
      return res.status(403).json({ error: "Mechanic portal access is required" });
    }

    const accessibleVehicle = await getAccessibleVehicle(req.params.id, currentUser);

    if (!accessibleVehicle) {
      return res.status(404).json({ error: "Vehicle not found" });
    }

    const updatedVehicle = await pool.query(
      `
        UPDATE vehicles
        SET notes = $1
        WHERE id = $2
        RETURNING *
      `,
      [req.body.notes ? normalizeWhitespace(req.body.notes) : null, req.params.id]
    );

    res.json(updatedVehicle.rows[0]);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to update customer notes" });
  }
};
