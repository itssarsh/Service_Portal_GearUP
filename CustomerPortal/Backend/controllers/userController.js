const pool = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { normalizePhoneNumber } = require("../utils/normalize");

function normalizedPhoneMatchSql(columnName, parameterPosition) {
  return `regexp_replace(COALESCE(${columnName}, ''), '\\D', '', 'g') = regexp_replace(COALESCE($${parameterPosition}, ''), '\\D', '', 'g')`;
}

function getFrontendBaseUrl() {
  return process.env.FRONTEND_URL?.trim() || "http://localhost:3000";
}

function buildResetLink(user, token) {
  return `${getFrontendBaseUrl()}/reset-password?token=${token}&email=${encodeURIComponent(
    user.email
  )}`;
}

async function sendEmail(user, token) {
  const resetLink = buildResetLink(user, token);
  const mailUser = process.env.MAIL_USER?.trim();
  const mailPass = process.env.MAIL_PASS?.trim();
  const mailFrom = process.env.MAIL_FROM?.trim() || mailUser;

  console.log("Customer password reset link:", resetLink);

  if (!mailUser || !mailPass) {
    console.log("Email config missing. Reset link was logged above.");
    return;
  }

  let nodemailer;

  try {
    nodemailer = require("nodemailer");
  } catch (error) {
    console.log("nodemailer is not installed. Reset link was logged above.");
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: mailUser,
      pass: mailPass,
    },
  });

  await transporter.sendMail({
    from: `Vehicle Service App <${mailFrom}>`,
    to: user.email,
    subject: "Reset your customer portal password",
    text: `Reset link: ${resetLink}`,
    html: `<p><a href="${resetLink}">Click here to reset your password</a></p>`,
  });
}

function capitalize(str) {
  if (!str) return str;

  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeRole(role) {
  return String(role || "")
    .trim()
    .toLowerCase();
}

async function getCurrentUser(userId) {
  const result = await pool.query(
    `
      SELECT
        id,
        name,
        email,
        phone,
        address,
        state,
        city,
        locality,
        pincode,
        location,
        vehicle_type,
        vehicle_model,
        vehicle_number,
        phone_verified,
        role,
        created_at
      FROM users
      WHERE id = $1
    `,
    [userId]
  );

  return result.rows[0] || null;
}

const PORTAL_FEEDBACK_QUESTIONS = [
  {
    key: "experience",
    question: "How was your overall experience using the customer portal?",
    placeholder: "Share your overall experience here...",
  },
  {
    key: "helpfulFeature",
    question: "Which feature helped you the most?",
    placeholder: "Dashboard, bookings, SOS, profile, or another feature...",
  },
  {
    key: "improvement",
    question: "What should we improve in the portal?",
    placeholder: "Share your improvement suggestion...",
  },
];

async function getPortalReviewPayload(currentUser) {
  const summaryResult = await pool.query(
    `
      SELECT
        COUNT(*)::INT AS total_reviews,
        COALESCE(ROUND(AVG(rating)::numeric, 1), 0) AS average_rating
      FROM portal_reviews
      WHERE EXISTS (
        SELECT 1
        FROM users u
        WHERE u.id = portal_reviews.user_id
          AND LOWER(TRIM(u.role)) = 'customer'
      )
    `
  );

  const reviewsResult = await pool.query(
    `
      SELECT
        pr.id,
        pr.user_id,
        pr.rating,
        pr.review_text,
        pr.created_at,
        pr.updated_at,
        u.name,
        u.role
      FROM portal_reviews pr
      JOIN users u ON u.id = pr.user_id
      WHERE LOWER(TRIM(u.role)) = 'customer'
      ORDER BY pr.updated_at DESC, pr.id DESC
      LIMIT 6
    `
  );

  const myReviewResult = await pool.query(
    `
      SELECT
        id,
        user_id,
        rating,
        review_text,
        created_at,
        updated_at
      FROM portal_reviews
      WHERE user_id = $1
      LIMIT 1
    `,
    [currentUser.id]
  );

  return {
    questions: PORTAL_FEEDBACK_QUESTIONS,
    summary: summaryResult.rows[0] || { total_reviews: 0, average_rating: 0 },
    reviews: reviewsResult.rows,
    myReview: myReviewResult.rows[0] || null,
  };
}

async function createCustomerUser(req, res) {
  try {
    const {
      name,
      email,
      phone,
      address,
      state,
      city,
      locality,
      pincode,
      password,
      confirmPassword,
      vehicleType,
      vehicleModel,
      vehicleNumber,
    } = req.body;

    const trimmedName = String(name || "").trim();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedPhone = normalizePhoneNumber(phone);
    const trimmedAddress = String(address || "").trim();
    const trimmedState = String(state || "").trim();
    const trimmedCity = String(city || "").trim();
    const trimmedLocality = String(locality || "").trim();
    const trimmedPincode = String(pincode || "").trim();
    const locationSummary = [trimmedLocality, trimmedCity, trimmedState].filter(Boolean).join(", ");
    const trimmedVehicleType = String(vehicleType || "").trim();
    const trimmedVehicleModel = String(vehicleModel || "").trim();
    const trimmedVehicleNumber = String(vehicleNumber || "").trim().toUpperCase();

    if (
      !trimmedName ||
      !normalizedEmail ||
      !normalizedPhone ||
      !trimmedAddress ||
      !trimmedState ||
      !trimmedCity ||
      !trimmedLocality ||
      !trimmedPincode ||
      !password ||
      !confirmPassword
    ) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (!/^\d{10}$/.test(normalizedPhone)) {
      return res.status(400).json({ error: "Phone number must be 10 digits" });
    }

    if (!/^\d{6}$/.test(trimmedPincode)) {
      return res.status(400).json({ error: "Pincode must be 6 digits" });
    }

    const hasAnyVehicleDetail = Boolean(trimmedVehicleType || trimmedVehicleModel || trimmedVehicleNumber);
    const hasAllVehicleDetails = Boolean(trimmedVehicleType && trimmedVehicleModel && trimmedVehicleNumber);

    if (hasAnyVehicleDetail && !hasAllVehicleDetails) {
      return res.status(400).json({
        error: "Complete vehicle type, model, and number together or leave all optional vehicle fields blank",
      });
    }

    const userExists = await pool.query(
      "SELECT id FROM users WHERE LOWER(email) = $1 OR phone = $2",
      [normalizedEmail, normalizedPhone]
    );

    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: "User already exists" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const hashedConfirmPassword = await bcrypt.hash(confirmPassword, 10);

    const createdUser = await pool.query(
      `
        INSERT INTO users (
          name,
          email,
          phone,
          address,
          state,
          city,
          locality,
          pincode,
          location,
          vehicle_type,
          vehicle_model,
          vehicle_number,
          phone_verified,
          password,
          confirmPassword,
          role
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, FALSE, $13, $14, 'customer')
        RETURNING
          id,
          name,
          email,
          phone,
          address,
          state,
          city,
          locality,
          pincode,
          location,
          vehicle_type,
          vehicle_model,
          vehicle_number,
          phone_verified,
          role
      `,
      [
        capitalize(trimmedName),
        normalizedEmail,
        normalizedPhone,
        capitalize(trimmedAddress),
        capitalize(trimmedState),
        capitalize(trimmedCity),
        capitalize(trimmedLocality),
        trimmedPincode,
        capitalize(locationSummary),
        trimmedVehicleType ? capitalize(trimmedVehicleType) : null,
        trimmedVehicleModel ? capitalize(trimmedVehicleModel) : null,
        trimmedVehicleNumber || null,
        hashedPassword,
        hashedConfirmPassword,
      ]
    );

    return res.status(201).json(createdUser.rows[0]);
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({ error: "Signup failed" });
  }
}

exports.listUsers = async (req, res) => {
  try {
    const users = await pool.query(
      `
        SELECT id, name, email, phone, address, role, created_at
        FROM users
        WHERE role = 'customer'
        ORDER BY id
      `
    );

    res.json(users.rows);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

exports.signup = createCustomerUser;

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "User not found" });
    }

    const customerUser = result.rows.find((row) => normalizeRole(row.role) === "customer");

    if (!customerUser) {
      console.log(
        "Customer login rejected: non-customer role",
        JSON.stringify({
          email,
          roles: result.rows.map((row) => normalizeRole(row.role)),
        })
      );
      return res.status(403).json({ error: "Please use the staff login page for this account." });
    }

    const validPassword = await bcrypt.compare(password, customerUser.password);

    if (!validPassword) {
      return res.status(400).json({ error: "Invalid password" });
    }

    const token = jwt.sign(
      { id: customerUser.id, role: normalizeRole(customerUser.role) },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

    res.json({
      token,
      expiresAt,
      user: {
        id: customerUser.id,
        name: customerUser.name,
        email: customerUser.email,
        phone: customerUser.phone,
        address: customerUser.address,
        state: customerUser.state,
        city: customerUser.city,
        locality: customerUser.locality,
        pincode: customerUser.pincode,
        location: customerUser.location,
        vehicle_type: customerUser.vehicle_type,
        vehicle_model: customerUser.vehicle_model,
        vehicle_number: customerUser.vehicle_number,
        phone_verified: Boolean(customerUser.phone_verified),
        role: normalizeRole(customerUser.role),
      },
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Login failed" });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const user = await getCurrentUser(req.user.id);

    if (!user || normalizeRole(user.role) !== "customer") {
      return res.status(403).json({ error: "Customer portal access is required" });
    }

    user.name = capitalize(user.name);
    user.address = capitalize(user.address);
    user.state = capitalize(user.state);
    user.city = capitalize(user.city);
    user.locality = capitalize(user.locality);
    user.location = capitalize(user.location);
    user.vehicle_type = capitalize(user.vehicle_type);
    user.vehicle_model = capitalize(user.vehicle_model);
    user.phone_verified = Boolean(user.phone_verified);
    user.role = capitalize(user.role);

    const statsResult = await pool.query(
      `
        SELECT
          (
            SELECT COUNT(*)
            FROM vehicles v
            WHERE v.owner_user_id = $1 OR ${normalizedPhoneMatchSql("v.owner_phone", 2)}
          )::INT AS vehicles_count,
          (
            SELECT COUNT(*)
            FROM service_records sr
            JOIN vehicles v ON v.id = sr.vehicle_id
            WHERE v.owner_user_id = $1 OR ${normalizedPhoneMatchSql("v.owner_phone", 2)}
          )::INT AS service_records_count
      `,
      [req.user.id, user.phone]
    );

    res.json({
      ...user,
      stats: statsResult.rows[0],
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
};

exports.getPortalReviews = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || normalizeRole(currentUser.role) !== "customer") {
      return res.status(403).json({ error: "Customer portal access is required" });
    }

    const payload = await getPortalReviewPayload(currentUser);
    res.json(payload);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to fetch portal reviews" });
  }
};

exports.savePortalReview = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || normalizeRole(currentUser.role) !== "customer") {
      return res.status(403).json({ error: "Customer portal access is required" });
    }

    const rating = Number(req.body?.rating);
    const reviewText = String(req.body?.reviewText || "").trim() || null;

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5" });
    }

    await pool.query(
      `
        INSERT INTO portal_reviews (
          user_id,
          rating,
          review_text,
          updated_at
        )
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id)
        DO UPDATE SET
          rating = EXCLUDED.rating,
          review_text = EXCLUDED.review_text,
          updated_at = CURRENT_TIMESTAMP
      `,
      [currentUser.id, rating, reviewText]
    );

    const payload = await getPortalReviewPayload(currentUser);
    res.json(payload);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to save portal review" });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND LOWER(TRIM(role)) = 'customer'",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Customer account not found" });
    }

    const user = result.rows[0];
    const token = crypto.randomBytes(32).toString("hex");

    await pool.query(
      "UPDATE users SET reset_token = $1, token_expiry = $2 WHERE id = $3",
      [token, Date.now() + 15 * 60 * 1000, user.id]
    );

    await sendEmail(user, token);
    res.json({ message: "Reset link sent" });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to send reset link" });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND LOWER(TRIM(role)) = 'customer'",
      [email]
    );

    if (result.rows.length === 0 || result.rows[0].reset_token !== token) {
      return res.status(400).json({ message: "Invalid token" });
    }

    if (Date.now() > result.rows[0].token_expiry) {
      return res.status(400).json({ message: "Token expired" });
    }

    if (typeof newPassword !== "string" || newPassword.trim() === "") {
      return res.status(400).json({ message: "New password is required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.query(
      "UPDATE users SET password = $1, reset_token = NULL, token_expiry = NULL WHERE id = $2",
      [hashedPassword, result.rows[0].id]
    );

    res.json({ message: "Password reset successful" });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to reset password" });
  }
};

exports.logout = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

exports.updateProfile = async (req, res) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const {
      name,
      email,
      phone,
      address,
      state,
      city,
      locality,
      pincode,
      vehicleType,
      vehicleModel,
      vehicleNumber,
    } = req.body;
    const userId = req.user.id;

    if (
      !name &&
      !email &&
      !phone &&
      !address &&
      !state &&
      !city &&
      !locality &&
      !pincode &&
      vehicleType === undefined &&
      vehicleModel === undefined &&
      vehicleNumber === undefined
    ) {
      return res.status(400).json({ error: "At least one field is required to update" });
    }

    const currentUserResult = await client.query(
      `
        SELECT
          id,
          name,
          email,
          phone,
          role,
          address,
          state,
          city,
          locality,
          pincode,
          location,
          vehicle_type,
          vehicle_model,
          vehicle_number
        FROM users
        WHERE id = $1
      `,
      [userId]
    );

    if (currentUserResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const currentUser = currentUserResult.rows[0];

    const updates = [];
    const values = [];
    let paramIndex = 1;
    const hasName = typeof name === "string" && name.trim() !== "";
    const hasEmail = typeof email === "string" && email.trim() !== "";
    const hasPhone = typeof phone === "string" && phone.trim() !== "";
    const hasAddress = typeof address === "string" && address.trim() !== "";
    const hasState = typeof state === "string" && state.trim() !== "";
    const hasCity = typeof city === "string" && city.trim() !== "";
    const hasLocality = typeof locality === "string" && locality.trim() !== "";
    const hasPincode = typeof pincode === "string" && pincode.trim() !== "";
    const nextName = hasName ? capitalize(name.trim()) : currentUser.name;
    const nextEmail = hasEmail ? email.trim().toLowerCase() : currentUser.email;
    const nextPhone = hasPhone ? normalizePhoneNumber(phone) : currentUser.phone;
    const nextState = hasState ? capitalize(state.trim()) : currentUser.state;
    const nextCity = hasCity ? capitalize(city.trim()) : currentUser.city;
    const nextLocality = hasLocality ? capitalize(locality.trim()) : currentUser.locality;
    const nextPincode = hasPincode ? pincode.trim() : currentUser.pincode;
    const locationFieldsSubmitted =
      state !== undefined || city !== undefined || locality !== undefined || pincode !== undefined;
    const hasVehicleType = typeof vehicleType === "string" && vehicleType.trim() !== "";
    const hasVehicleModel = typeof vehicleModel === "string" && vehicleModel.trim() !== "";
    const hasVehicleNumber = typeof vehicleNumber === "string" && vehicleNumber.trim() !== "";
    const vehicleFieldsSubmitted =
      vehicleType !== undefined || vehicleModel !== undefined || vehicleNumber !== undefined;
    const clearedVehicleFields =
      vehicleFieldsSubmitted && !hasVehicleType && !hasVehicleModel && !hasVehicleNumber;
    const completedVehicleFields = hasVehicleType && hasVehicleModel && hasVehicleNumber;

    if (hasPhone && !/^\d{10}$/.test(nextPhone)) {
      return res.status(400).json({ error: "Phone number must be 10 digits" });
    }

    if (hasPincode && !/^\d{6}$/.test(nextPincode)) {
      return res.status(400).json({ error: "Pincode must be 6 digits" });
    }

    if (locationFieldsSubmitted && (!nextState || !nextCity || !nextLocality || !nextPincode)) {
      return res.status(400).json({
        error: "State, city, locality, and pincode should be completed together",
      });
    }

    const nextLocationSummary = [nextLocality, nextCity, nextState].filter(Boolean).join(", ");

    if (vehicleFieldsSubmitted && !clearedVehicleFields && !completedVehicleFields) {
      return res.status(400).json({
        error: "Complete vehicle type, model, and number together or clear all three fields",
      });
    }

    if (hasEmail || hasPhone) {
      const duplicateUserResult = await client.query(
        `
          SELECT id
          FROM users
          WHERE id <> $1
            AND (LOWER(email) = $2 OR phone = $3)
          LIMIT 1
        `,
        [userId, nextEmail, nextPhone]
      );

      if (duplicateUserResult.rows.length > 0) {
        return res.status(400).json({ error: "Another user already uses this email or phone" });
      }
    }

    if (hasName) {
      updates.push(`name = $${paramIndex++}`);
      values.push(nextName);
    }
    if (hasEmail) {
      updates.push(`email = $${paramIndex++}`);
      values.push(nextEmail);
    }
    if (hasPhone) {
      updates.push(`phone = $${paramIndex++}`);
      values.push(nextPhone);
      updates.push(`phone_verified = $${paramIndex++}`);
      values.push(false);
    }
    if (hasAddress) {
      updates.push(`address = $${paramIndex++}`);
      values.push(capitalize(address.trim()));
    }
    if (hasState) {
      updates.push(`state = $${paramIndex++}`);
      values.push(nextState);
    }
    if (hasCity) {
      updates.push(`city = $${paramIndex++}`);
      values.push(nextCity);
    }
    if (hasLocality) {
      updates.push(`locality = $${paramIndex++}`);
      values.push(nextLocality);
    }
    if (hasPincode) {
      updates.push(`pincode = $${paramIndex++}`);
      values.push(nextPincode);
    }
    if (locationFieldsSubmitted) {
      updates.push(`location = $${paramIndex++}`);
      values.push(capitalize(nextLocationSummary));
    }
    if (vehicleFieldsSubmitted) {
      updates.push(`vehicle_type = $${paramIndex++}`);
      values.push(clearedVehicleFields ? null : capitalize(vehicleType.trim()));
      updates.push(`vehicle_model = $${paramIndex++}`);
      values.push(clearedVehicleFields ? null : capitalize(vehicleModel.trim()));
      updates.push(`vehicle_number = $${paramIndex++}`);
      values.push(clearedVehicleFields ? null : vehicleNumber.trim().toUpperCase());
    }

    values.push(userId);

    await client.query("BEGIN");
    transactionStarted = true;

    const result = await client.query(
      `
        UPDATE users
        SET ${updates.join(", ")}
        WHERE id = $${paramIndex}
        RETURNING
          id,
          name,
          email,
          phone,
          address,
          state,
          city,
          locality,
          pincode,
          location,
          vehicle_type,
          vehicle_model,
          vehicle_number,
          phone_verified,
          role
      `,
      values
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({ error: "User not found" });
    }

    if (normalizeRole(currentUser.role) === "customer" && (hasName || hasPhone)) {
      await client.query(
        `
          UPDATE vehicles
          SET
            owner_name = CASE WHEN $2::text IS NULL THEN owner_name ELSE $2 END,
            owner_phone = CASE WHEN $3::text IS NULL THEN owner_phone ELSE $3 END
          WHERE owner_user_id = $1 OR ${normalizedPhoneMatchSql("owner_phone", 4)}
        `,
        [
          userId,
          hasName ? nextName : null,
          hasPhone ? nextPhone : null,
          currentUser.phone || "",
        ]
      );
    }

    await client.query("COMMIT");
    transactionStarted = false;
    res.json(result.rows[0]);
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }
    console.error(error.message);
    res.status(500).json({ error: "Failed to update profile" });
  } finally {
    client.release();
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const userId = req.user.id;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: "All password fields are required" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: "New passwords do not match" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const result = await pool.query("SELECT password FROM users WHERE id = $1", [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const validPassword = await bcrypt.compare(currentPassword, result.rows[0].password);

    if (!validPassword) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.query("UPDATE users SET password = $1 WHERE id = $2", [hashedPassword, userId]);

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to change password" });
  }
};
