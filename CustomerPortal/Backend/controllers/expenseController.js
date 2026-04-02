const pool = require("../config/db");

function normalizedPhoneMatchSql(columnName, parameterPosition) {
  return `regexp_replace(COALESCE(${columnName}, ''), '\\D', '', 'g') = regexp_replace(COALESCE($${parameterPosition}, ''), '\\D', '', 'g')`;
}

function ownedVehicleMatchSql(columnName = "v.owner_phone", ownerIdPosition = 1, phonePosition = 2) {
  return `(v.owner_user_id = $${ownerIdPosition} OR ${normalizedPhoneMatchSql(columnName, phonePosition)})`;
}

async function getCurrentUser(userId) {
  const result = await pool.query(
    "SELECT id, phone, role FROM users WHERE id = $1",
    [userId]
  );

  return result.rows[0] || null;
}

async function getCurrentCustomer(userId) {
  const currentUser = await getCurrentUser(userId);

  if (!currentUser || currentUser.role !== "customer") {
    return null;
  }

  return currentUser;
}

async function getOwnedVehicle(currentUser, vehicleId) {
  const result = await pool.query(
    `
      SELECT v.id, v.registration_number, v.brand, v.model
      FROM vehicles v
      WHERE
        v.id = $1
        AND ${ownedVehicleMatchSql("v.owner_phone", 2, 3)}
    `,
    [vehicleId, currentUser.id, currentUser.phone]
  );

  return result.rows[0] || null;
}

async function requireCustomer(req, res) {
  const currentUser = await getCurrentCustomer(req.user.id);

  if (!currentUser) {
    res.status(403).json({ error: "Customer portal access is required" });
    return null;
  }

  return currentUser;
}

async function syncOwnedServiceRecordExpenses(currentUser) {
  await pool.query(
    `
      INSERT INTO vehicle_expenses (
        vehicle_id,
        service_type,
        amount,
        description,
        expense_date,
        service_record_id,
        source
      )
      SELECT
        sr.vehicle_id,
        sr.service_type,
        sr.amount,
        COALESCE(
          NULLIF(TRIM(sr.work_summary), ''),
          NULLIF(TRIM(sr.complaint), ''),
          CONCAT('Service record #', sr.id)
        ) AS description,
        COALESCE(sr.service_date, sr.booking_date, CURRENT_DATE) AS expense_date,
        sr.id AS service_record_id,
        'service_record' AS source
      FROM service_records sr
      JOIN vehicles v ON v.id = sr.vehicle_id
      WHERE
        ${ownedVehicleMatchSql("v.owner_phone", 1, 2)}
        AND sr.status IN ('completed', 'delivered')
        AND COALESCE(sr.amount, 0) > 0
      ON CONFLICT (service_record_id) WHERE service_record_id IS NOT NULL
      DO UPDATE
      SET
        vehicle_id = EXCLUDED.vehicle_id,
        service_type = EXCLUDED.service_type,
        amount = EXCLUDED.amount,
        description = EXCLUDED.description,
        expense_date = EXCLUDED.expense_date,
        source = EXCLUDED.source
    `,
    [currentUser.id, currentUser.phone]
  );

  await pool.query(
    `
      DELETE FROM vehicle_expenses ve
      USING service_records sr, vehicles v
      WHERE
        ve.service_record_id = sr.id
        AND v.id = sr.vehicle_id
        AND ${ownedVehicleMatchSql("v.owner_phone", 1, 2)}
        AND ve.source = 'service_record'
        AND (
          sr.status NOT IN ('completed', 'delivered')
          OR COALESCE(sr.amount, 0) <= 0
        )
    `,
    [currentUser.id, currentUser.phone]
  );
}

exports.listExpenses = async (req, res) => {
  try {
    const currentUser = await requireCustomer(req, res);

    if (!currentUser) {
      return;
    }

    await syncOwnedServiceRecordExpenses(currentUser);

    const expenses = await pool.query(
      `
        SELECT
          ve.*,
          v.registration_number,
          v.vehicle_type,
          v.brand,
          v.model
        FROM vehicle_expenses ve
        JOIN vehicles v ON v.id = ve.vehicle_id
        WHERE ${ownedVehicleMatchSql("v.owner_phone", 1, 2)}
        ORDER BY
          ve.expense_date DESC NULLS LAST,
          ve.created_at DESC,
          ve.id DESC
      `,
      [currentUser.id, currentUser.phone]
    );

    res.json(expenses.rows);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to fetch expenses" });
  }
};

// ✅ Add Expense
exports.addExpense = async (req, res) => {
  try {
    const currentUser = await requireCustomer(req, res);

    if (!currentUser) {
      return;
    }

    const { vehicle_id, service_type, amount, description, expense_date } = req.body;
    const ownedVehicle = await getOwnedVehicle(currentUser, vehicle_id);

    if (!ownedVehicle) {
      return res.status(404).json({ error: "Vehicle not found for this customer" });
    }

    await pool.query(
      `INSERT INTO vehicle_expenses 
      (vehicle_id, service_type, amount, description, expense_date)
      VALUES ($1, $2, $3, $4, $5)`,
      [vehicle_id, service_type, amount, description, expense_date]
    );

    res.json({ message: "Expense added successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

exports.getExpenseAnalytics = async (req, res) => {
  try {
    const currentUser = await requireCustomer(req, res);

    if (!currentUser) {
      return;
    }

    await syncOwnedServiceRecordExpenses(currentUser);

    const [summaryResult, vehicleTotalsResult, monthlyReportResult, yearlyReportResult, serviceWiseResult] =
      await Promise.all([
        pool.query(
          `
            SELECT
              COALESCE(SUM(ve.amount), 0) AS total_expense,
              COUNT(ve.id)::INT AS expense_entries,
              COUNT(DISTINCT ve.vehicle_id)::INT AS active_vehicles
            FROM vehicle_expenses ve
            JOIN vehicles v ON v.id = ve.vehicle_id
            WHERE ${ownedVehicleMatchSql("v.owner_phone", 1, 2)}
          `,
          [currentUser.id, currentUser.phone]
        ),
        pool.query(
          `
            SELECT
              v.id AS vehicle_id,
              v.registration_number,
              v.brand,
              v.model,
              COALESCE(SUM(ve.amount), 0) AS total_expense,
              COUNT(ve.id)::INT AS expense_entries,
              MAX(ve.expense_date) AS last_expense_date
            FROM vehicles v
            LEFT JOIN vehicle_expenses ve ON ve.vehicle_id = v.id
            WHERE ${ownedVehicleMatchSql("v.owner_phone", 1, 2)}
            GROUP BY v.id, v.registration_number, v.brand, v.model, v.created_at
            ORDER BY total_expense DESC, v.created_at DESC, v.id DESC
          `,
          [currentUser.id, currentUser.phone]
        ),
        pool.query(
          `
            SELECT
              EXTRACT(YEAR FROM ve.expense_date)::INT AS year,
              EXTRACT(MONTH FROM ve.expense_date)::INT AS month,
              TO_CHAR(DATE_TRUNC('month', ve.expense_date), 'Mon YYYY') AS label,
              COALESCE(SUM(ve.amount), 0) AS total
            FROM vehicle_expenses ve
            JOIN vehicles v ON v.id = ve.vehicle_id
            WHERE
              ve.expense_date IS NOT NULL
              AND ${ownedVehicleMatchSql("v.owner_phone", 1, 2)}
            GROUP BY 1, 2, 3
            ORDER BY year DESC, month DESC
          `,
          [currentUser.id, currentUser.phone]
        ),
        pool.query(
          `
            SELECT
              EXTRACT(YEAR FROM ve.expense_date)::INT AS year,
              COALESCE(SUM(ve.amount), 0) AS total
            FROM vehicle_expenses ve
            JOIN vehicles v ON v.id = ve.vehicle_id
            WHERE
              ve.expense_date IS NOT NULL
              AND ${ownedVehicleMatchSql("v.owner_phone", 1, 2)}
            GROUP BY 1
            ORDER BY year DESC
          `,
          [currentUser.id, currentUser.phone]
        ),
        pool.query(
          `
            SELECT
              COALESCE(NULLIF(TRIM(ve.service_type), ''), 'Other') AS service_type,
              COALESCE(SUM(ve.amount), 0) AS total,
              COUNT(ve.id)::INT AS expense_entries
            FROM vehicle_expenses ve
            JOIN vehicles v ON v.id = ve.vehicle_id
            WHERE ${ownedVehicleMatchSql("v.owner_phone", 1, 2)}
            GROUP BY 1
            ORDER BY total DESC, service_type ASC
          `,
          [currentUser.id, currentUser.phone]
        ),
      ]);

    const summary = summaryResult.rows[0] || {
      total_expense: 0,
      expense_entries: 0,
      active_vehicles: 0,
    };

    res.json({
      summary: {
        total_expense: Number(summary.total_expense || 0),
        expense_entries: Number(summary.expense_entries || 0),
        active_vehicles: Number(summary.active_vehicles || 0),
      },
      vehicle_totals: vehicleTotalsResult.rows.map((row) => ({
        ...row,
        total_expense: Number(row.total_expense || 0),
        expense_entries: Number(row.expense_entries || 0),
      })),
      monthly_report: monthlyReportResult.rows.map((row) => ({
        ...row,
        total: Number(row.total || 0),
      })),
      yearly_report: yearlyReportResult.rows.map((row) => ({
        ...row,
        total: Number(row.total || 0),
      })),
      service_wise_breakdown: serviceWiseResult.rows.map((row) => ({
        ...row,
        total: Number(row.total || 0),
        expense_entries: Number(row.expense_entries || 0),
      })),
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to fetch expense analytics" });
  }
};

// ✅ Total Spend per Vehicle
exports.getTotalExpense = async (req, res) => {
  try {
    const currentUser = await requireCustomer(req, res);

    if (!currentUser) {
      return;
    }

    await syncOwnedServiceRecordExpenses(currentUser);

    const ownedVehicle = await getOwnedVehicle(currentUser, req.params.vehicleId);

    if (!ownedVehicle) {
      return res.status(404).json({ error: "Vehicle not found for this customer" });
    }

    const result = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM vehicle_expenses WHERE vehicle_id = $1`,
      [req.params.vehicleId]
    );

    res.json({
      vehicle_id: Number(req.params.vehicleId),
      total: Number(result.rows[0]?.total || 0),
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to fetch total expense" });
  }
};

// ✅ Monthly Report
exports.getMonthlyExpense = async (req, res) => {
  try {
    const currentUser = await requireCustomer(req, res);

    if (!currentUser) {
      return;
    }

    await syncOwnedServiceRecordExpenses(currentUser);

    const ownedVehicle = await getOwnedVehicle(currentUser, req.params.vehicleId);

    if (!ownedVehicle) {
      return res.status(404).json({ error: "Vehicle not found for this customer" });
    }

    const result = await pool.query(
      `
        SELECT
          EXTRACT(YEAR FROM expense_date)::INT AS year,
          EXTRACT(MONTH FROM expense_date)::INT AS month,
          TO_CHAR(DATE_TRUNC('month', expense_date), 'Mon YYYY') AS label,
          COALESCE(SUM(amount), 0) AS total
        FROM vehicle_expenses
        WHERE vehicle_id = $1 AND expense_date IS NOT NULL
        GROUP BY 1, 2, 3
        ORDER BY year DESC, month DESC
      `,
      [req.params.vehicleId]
    );

    res.json(
      result.rows.map((row) => ({
        ...row,
        total: Number(row.total || 0),
      }))
    );
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to fetch monthly expense report" });
  }
};

// ✅ Yearly Report
exports.getYearlyExpense = async (req, res) => {
  try {
    const currentUser = await requireCustomer(req, res);

    if (!currentUser) {
      return;
    }

    await syncOwnedServiceRecordExpenses(currentUser);

    const ownedVehicle = await getOwnedVehicle(currentUser, req.params.vehicleId);

    if (!ownedVehicle) {
      return res.status(404).json({ error: "Vehicle not found for this customer" });
    }

    const result = await pool.query(
      `
        SELECT
          EXTRACT(YEAR FROM expense_date)::INT AS year,
          COALESCE(SUM(amount), 0) AS total
        FROM vehicle_expenses
        WHERE vehicle_id = $1 AND expense_date IS NOT NULL
        GROUP BY 1
        ORDER BY year DESC
      `,
      [req.params.vehicleId]
    );

    res.json(
      result.rows.map((row) => ({
        ...row,
        total: Number(row.total || 0),
      }))
    );
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to fetch yearly expense report" });
  }
};

// ✅ Service-wise Breakdown
exports.getServiceWiseExpense = async (req, res) => {
  try {
    const currentUser = await requireCustomer(req, res);

    if (!currentUser) {
      return;
    }

    await syncOwnedServiceRecordExpenses(currentUser);

    const ownedVehicle = await getOwnedVehicle(currentUser, req.params.vehicleId);

    if (!ownedVehicle) {
      return res.status(404).json({ error: "Vehicle not found for this customer" });
    }

    const result = await pool.query(
      `
        SELECT
          COALESCE(NULLIF(TRIM(service_type), ''), 'Other') AS service_type,
          COALESCE(SUM(amount), 0) AS total,
          COUNT(id)::INT AS expense_entries
        FROM vehicle_expenses
        WHERE vehicle_id = $1
        GROUP BY 1
        ORDER BY total DESC, service_type ASC
      `,
      [req.params.vehicleId]
    );

    res.json(
      result.rows.map((row) => ({
        ...row,
        total: Number(row.total || 0),
        expense_entries: Number(row.expense_entries || 0),
      }))
    );
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to fetch service-wise expense report" });
  }
};
