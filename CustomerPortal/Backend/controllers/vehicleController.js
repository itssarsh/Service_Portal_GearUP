const pool = require("../config/db");
const {
  normalizePhoneNumber,
  normalizeRegistrationNumber,
  normalizeWhitespace,
  toTitleCase,
} = require("../utils/normalize");

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

exports.createVehicle = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || currentUser.role !== "customer") {
      return res.status(403).json({ error: "Customer portal access is required" });
    }

    const { registrationNumber, vehicleType, brand, model, modelYear, notes } = req.body;

    if (!registrationNumber || !vehicleType || !brand || !model) {
      return res.status(400).json({ error: "Vehicle details are required" });
    }

    const normalizedType = vehicleType.trim().toLowerCase();

    if (!allowedVehicleTypes.has(normalizedType)) {
      return res.status(400).json({ error: "Invalid vehicle type" });
    }

    const vehicleResult = await pool.query(
      `
        INSERT INTO vehicles (
          registration_number,
          vehicle_type,
          brand,
          model,
          model_year,
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
        modelYear || null,
        currentUser.name,
        normalizePhoneNumber(currentUser.phone),
        currentUser.id,
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

    if (!currentUser || currentUser.role !== "customer") {
      return res.status(403).json({ error: "Customer portal access is required" });
    }

    const vehicles = await pool.query(
      `
        SELECT v.*, creator.name AS created_by_name
        FROM vehicles v
        LEFT JOIN users creator ON creator.id = v.created_by
        WHERE v.owner_user_id = $1 OR ${normalizedPhoneMatchSql("v.owner_phone", 2)}
        ORDER BY v.created_at DESC, v.id DESC
      `,
      [currentUser.id, currentUser.phone]
    );

    res.json(vehicles.rows);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to fetch vehicles" });
  }
};
