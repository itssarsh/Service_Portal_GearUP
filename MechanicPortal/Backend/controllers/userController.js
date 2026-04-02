const pool = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { isWorkshopRole } = require("../utils/roles");
const {
  normalizePhoneNumber,
  normalizeWhitespace,
  toTitleCase,
} = require("../utils/normalize");

function getFrontendBaseUrl() {
  return process.env.FRONTEND_URL?.trim() || "http://localhost:3001";
}

function buildResetLink(user, token) {
  return `${getFrontendBaseUrl()}/workshop/reset-password?token=${token}&email=${encodeURIComponent(
    user.email
  )}`;
}

async function sendEmail(user, token) {
  const resetLink = buildResetLink(user, token);
  const mailUser = process.env.MAIL_USER?.trim();
  const mailPass = process.env.MAIL_PASS?.trim();
  const mailFrom = process.env.MAIL_FROM?.trim() || mailUser;

  console.log("Mechanic password reset link:", resetLink);

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
    subject: "Reset your mechanic portal password",
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

function normalizeSelectionList(values = []) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values.map((value) => normalizeWhitespace(value)).filter(Boolean))];
}

function normalizeTimeValue(value) {
  const normalizedValue = normalizeWhitespace(value);

  if (!normalizedValue) {
    return "";
  }

  return /^\d{2}:\d{2}$/.test(normalizedValue) ? normalizedValue : "";
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
        workshop_name,
        service_location,
        vehicle_types,
        services_offered,
        years_experience,
        availability_days,
        availability_start,
        availability_end,
        service_mode,
        id_proof_type,
        id_proof_reference,
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
    question: "How was your overall experience using the portal?",
    placeholder: "Share your overall experience here...",
  },
  {
    key: "helpfulFeature",
    question: "Which feature was the most helpful?",
    placeholder: "Enter the feature or workflow name...",
  },
  {
    key: "improvement",
    question: "What should be improved in the portal?",
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

exports.listUsers = async (req, res) => {
  try {
    const users = await pool.query(
      `
        SELECT id, name, email, phone, address, role, created_at
        FROM users
        WHERE role IN ('mechanic', 'admin')
        ORDER BY id
      `
    );

    res.json(users.rows);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

exports.signup = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      address,
      workshopName,
      serviceLocation,
      vehicleTypes,
      servicesOffered,
      yearsExperience,
      availabilityDays,
      availabilityStart,
      availabilityEnd,
      serviceMode,
      idProofType,
      idProofReference,
      password,
      confirmPassword,
      phoneVerified,
    } = req.body;

    const normalizedName = toTitleCase(name);
    const normalizedEmail = normalizeWhitespace(email).toLowerCase();
    const normalizedPhone = normalizePhoneNumber(phone);
    const normalizedAddress = normalizeWhitespace(address);
    const normalizedWorkshopName = toTitleCase(workshopName);
    const normalizedServiceLocation = normalizeWhitespace(serviceLocation);
    const normalizedVehicleTypes = normalizeSelectionList(vehicleTypes);
    const normalizedServicesOffered = normalizeSelectionList(servicesOffered);
    const normalizedAvailabilityDays = normalizeSelectionList(availabilityDays);
    const normalizedAvailabilityStart = normalizeTimeValue(availabilityStart);
    const normalizedAvailabilityEnd = normalizeTimeValue(availabilityEnd);
    const normalizedServiceMode = normalizeWhitespace(serviceMode).toLowerCase();
    const normalizedIdProofType = normalizeWhitespace(idProofType);
    const normalizedIdProofReference = normalizeWhitespace(idProofReference);
    const normalizedYearsExperience = Number(yearsExperience);

    if (
      !normalizedName ||
      !normalizedEmail ||
      !normalizedPhone ||
      !normalizedAddress ||
      !normalizedWorkshopName ||
      !normalizedServiceLocation ||
      !password ||
      !confirmPassword ||
      !normalizedIdProofType ||
      !normalizedIdProofReference
    ) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (!/^\d{10}$/.test(normalizedPhone)) {
      return res.status(400).json({ error: "Phone number must be 10 digits" });
    }

    if (normalizedVehicleTypes.length === 0) {
      return res.status(400).json({ error: "Select at least one vehicle type" });
    }

    if (normalizedServicesOffered.length === 0) {
      return res.status(400).json({ error: "Select at least one service offering" });
    }

    if (normalizedAvailabilityDays.length === 0) {
      return res.status(400).json({ error: "Select working days and hours" });
    }

    if (!normalizedAvailabilityStart || !normalizedAvailabilityEnd) {
      return res.status(400).json({ error: "Working hours are required" });
    }

    if (
      !["shop", "doorstep", "shop_and_doorstep"].includes(normalizedServiceMode)
    ) {
      return res.status(400).json({ error: "Choose a valid service mode" });
    }

    if (
      !Number.isInteger(normalizedYearsExperience) ||
      normalizedYearsExperience < 0 ||
      normalizedYearsExperience > 60
    ) {
      return res.status(400).json({ error: "Years of experience must be between 0 and 60" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long" });
    }

    const userExists = await pool.query(
      "SELECT id FROM users WHERE email = $1 OR phone = $2",
      [normalizedEmail, normalizedPhone]
    );

    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: "User already exists" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
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
          workshop_name,
          service_location,
          vehicle_types,
          services_offered,
          years_experience,
          availability_days,
          availability_start,
          availability_end,
          service_mode,
          id_proof_type,
          id_proof_reference,
          phone_verified,
          password,
          confirmPassword,
          role
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
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16,
          $17,
          $18,
          'mechanic'
        )
        RETURNING
          id,
          name,
          email,
          phone,
          address,
          workshop_name,
          service_location,
          vehicle_types,
          services_offered,
          years_experience,
          availability_days,
          availability_start,
          availability_end,
          service_mode,
          id_proof_type,
          id_proof_reference,
          phone_verified,
          role
      `,
      [
        normalizedName,
        normalizedEmail,
        normalizedPhone,
        normalizedAddress,
        normalizedWorkshopName,
        normalizedServiceLocation,
        normalizedVehicleTypes,
        normalizedServicesOffered,
        normalizedYearsExperience,
        normalizedAvailabilityDays,
        normalizedAvailabilityStart,
        normalizedAvailabilityEnd,
        normalizedServiceMode,
        normalizedIdProofType,
        normalizedIdProofReference,
        Boolean(phoneVerified),
        hashedPassword,
        hashedConfirmPassword,
      ]
    );

    res.status(201).json(createdUser.rows[0]);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Signup failed" });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "User not found" });
    }

    const user = result.rows[0];

    if (!isWorkshopRole(user.role)) {
      return res.status(403).json({ error: "Please use the customer login page for this account." });
    }

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(400).json({ error: "Invalid password" });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        workshop_name: user.workshop_name,
        service_location: user.service_location,
        vehicle_types: user.vehicle_types || [],
        services_offered: user.services_offered || [],
        years_experience: user.years_experience,
        availability_days: user.availability_days || [],
        availability_start: user.availability_start,
        availability_end: user.availability_end,
        service_mode: user.service_mode,
        id_proof_type: user.id_proof_type,
        id_proof_reference: user.id_proof_reference,
        phone_verified: user.phone_verified,
        role: user.role,
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

    if (!user || !isWorkshopRole(user.role)) {
      return res.status(403).json({ error: "Mechanic portal access is required" });
    }

    user.name = capitalize(user.name);
    user.address = capitalize(user.address);
    user.role = capitalize(user.role);

    const statsResult = await pool.query(
      `
        SELECT
          (
            SELECT COUNT(*)
            FROM vehicles v
            WHERE
              ($2 = 'admin')
              OR ($2 = 'mechanic' AND v.created_by = $1)
          )::INT AS vehicles_count,
          (
            SELECT COUNT(*)
            FROM service_records sr
            JOIN vehicles v ON v.id = sr.vehicle_id
            WHERE
              ($2 = 'admin')
              OR ($2 = 'mechanic' AND (sr.mechanic_id = $1 OR v.created_by = $1))
          )::INT AS service_records_count
      `,
      [req.user.id, user.role]
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

exports.updateProfile = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || !isWorkshopRole(currentUser.role)) {
      return res.status(403).json({ error: "Mechanic portal access is required" });
    }

    const name = toTitleCase(req.body?.name);
    const email = normalizeWhitespace(req.body?.email).toLowerCase();
    const phone = normalizePhoneNumber(req.body?.phone);
    const address = toTitleCase(req.body?.address);
    const workshopName = toTitleCase(req.body?.workshopName);
    const serviceLocation = normalizeWhitespace(req.body?.serviceLocation);
    const vehicleTypes = normalizeSelectionList(req.body?.vehicleTypes);
    const servicesOffered = normalizeSelectionList(req.body?.servicesOffered);
    const availabilityDays = normalizeSelectionList(req.body?.availabilityDays);
    const availabilityStart = normalizeTimeValue(req.body?.availabilityStart);
    const availabilityEnd = normalizeTimeValue(req.body?.availabilityEnd);
    const serviceMode = normalizeWhitespace(req.body?.serviceMode).toLowerCase();
    const idProofType = normalizeWhitespace(req.body?.idProofType);
    const idProofReference = normalizeWhitespace(req.body?.idProofReference);
    const hasYearsExperience = Object.prototype.hasOwnProperty.call(req.body || {}, "yearsExperience");
    const yearsExperience = hasYearsExperience ? Number(req.body?.yearsExperience) : null;
    const hasVehicleTypes = Object.prototype.hasOwnProperty.call(req.body || {}, "vehicleTypes");
    const hasServicesOffered = Object.prototype.hasOwnProperty.call(req.body || {}, "servicesOffered");
    const hasAvailabilityDays = Object.prototype.hasOwnProperty.call(req.body || {}, "availabilityDays");
    const hasAvailabilityStart = Object.prototype.hasOwnProperty.call(req.body || {}, "availabilityStart");
    const hasAvailabilityEnd = Object.prototype.hasOwnProperty.call(req.body || {}, "availabilityEnd");
    const hasServiceMode = Object.prototype.hasOwnProperty.call(req.body || {}, "serviceMode");
    const hasWorkshopName = Object.prototype.hasOwnProperty.call(req.body || {}, "workshopName");
    const hasServiceLocation = Object.prototype.hasOwnProperty.call(req.body || {}, "serviceLocation");
    const hasIdProofType = Object.prototype.hasOwnProperty.call(req.body || {}, "idProofType");
    const hasIdProofReference = Object.prototype.hasOwnProperty.call(req.body || {}, "idProofReference");

    if (
      !name &&
      !email &&
      !phone &&
      !address &&
      !workshopName &&
      !serviceLocation &&
      !hasVehicleTypes &&
      !hasServicesOffered &&
      !hasYearsExperience &&
      !hasAvailabilityDays &&
      !hasAvailabilityStart &&
      !hasAvailabilityEnd &&
      !hasServiceMode &&
      !hasIdProofType &&
      !hasIdProofReference
    ) {
      return res.status(400).json({ error: "At least one profile field is required" });
    }

    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: "Please enter a valid email address" });
    }

    if (phone && (phone.length < 10 || phone.length > 15)) {
      return res.status(400).json({ error: "Phone number must be between 10 and 15 digits" });
    }

    if (hasVehicleTypes && vehicleTypes.length === 0) {
      return res.status(400).json({ error: "Select at least one vehicle type" });
    }

    if (hasServicesOffered && servicesOffered.length === 0) {
      return res.status(400).json({ error: "Select at least one service offering" });
    }

    if (hasAvailabilityDays && availabilityDays.length === 0) {
      return res.status(400).json({ error: "Select at least one working day" });
    }

    if ((hasAvailabilityStart || hasAvailabilityEnd) && (!availabilityStart || !availabilityEnd)) {
      return res.status(400).json({ error: "Working hours are required" });
    }

    if (
      hasServiceMode &&
      !["shop", "doorstep", "shop_and_doorstep"].includes(serviceMode)
    ) {
      return res.status(400).json({ error: "Choose a valid service mode" });
    }

    if (
      hasYearsExperience &&
      (!Number.isInteger(yearsExperience) || yearsExperience < 0 || yearsExperience > 60)
    ) {
      return res.status(400).json({ error: "Years of experience must be between 0 and 60" });
    }

    const duplicateConditions = [];
    const duplicateValues = [];

    if (email) {
      duplicateConditions.push(`email = $${duplicateValues.length + 1}`);
      duplicateValues.push(email);
    }

    if (phone) {
      duplicateConditions.push(`phone = $${duplicateValues.length + 1}`);
      duplicateValues.push(phone);
    }

    if (duplicateConditions.length > 0) {
      duplicateValues.push(req.user.id);

      const duplicateUser = await pool.query(
        `
          SELECT id
          FROM users
          WHERE (${duplicateConditions.join(" OR ")}) AND id <> $${duplicateValues.length}
          LIMIT 1
        `,
        duplicateValues
      );

      if (duplicateUser.rows.length > 0) {
        return res.status(400).json({ error: "Email or phone number is already in use" });
      }
    }

    const updates = [];
    const values = [];

    if (name) {
      updates.push(`name = $${values.length + 1}`);
      values.push(name);
    }

    if (email) {
      updates.push(`email = $${values.length + 1}`);
      values.push(email);
    }

    if (phone) {
      updates.push(`phone = $${values.length + 1}`);
      values.push(phone);
    }

    if (address) {
      updates.push(`address = $${values.length + 1}`);
      values.push(address);
    }

    if (hasWorkshopName && workshopName) {
      updates.push(`workshop_name = $${values.length + 1}`);
      values.push(workshopName);
    }

    if (hasServiceLocation && serviceLocation) {
      updates.push(`service_location = $${values.length + 1}`);
      values.push(serviceLocation);
    }

    if (hasVehicleTypes && vehicleTypes.length > 0) {
      updates.push(`vehicle_types = $${values.length + 1}`);
      values.push(vehicleTypes);
    }

    if (hasServicesOffered && servicesOffered.length > 0) {
      updates.push(`services_offered = $${values.length + 1}`);
      values.push(servicesOffered);
    }

    if (hasYearsExperience && Number.isInteger(yearsExperience)) {
      updates.push(`years_experience = $${values.length + 1}`);
      values.push(yearsExperience);
    }

    if (hasAvailabilityDays && availabilityDays.length > 0) {
      updates.push(`availability_days = $${values.length + 1}`);
      values.push(availabilityDays);
    }

    if ((hasAvailabilityStart || hasAvailabilityEnd) && availabilityStart && availabilityEnd) {
      updates.push(`availability_start = $${values.length + 1}`);
      values.push(availabilityStart);
      updates.push(`availability_end = $${values.length + 1}`);
      values.push(availabilityEnd);
    }

    if (hasServiceMode && serviceMode) {
      updates.push(`service_mode = $${values.length + 1}`);
      values.push(serviceMode);
    }

    if (hasIdProofType && idProofType) {
      updates.push(`id_proof_type = $${values.length + 1}`);
      values.push(idProofType);
    }

    if (hasIdProofReference && idProofReference) {
      updates.push(`id_proof_reference = $${values.length + 1}`);
      values.push(idProofReference);
    }

    values.push(req.user.id);

    await pool.query(
      `
        UPDATE users
        SET ${updates.join(", ")}
        WHERE id = $${values.length}
      `,
      values
    );

    const updatedUser = await getCurrentUser(req.user.id);

    res.json({
      ...updatedUser,
      name: capitalize(updatedUser.name),
      address: capitalize(updatedUser.address),
      role: capitalize(updatedUser.role),
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to update profile" });
  }
};

exports.getPortalReviews = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || !isWorkshopRole(currentUser.role)) {
      return res.status(403).json({ error: "Mechanic portal access is required" });
    }

    const payload = await getPortalReviewPayload(currentUser);
    res.json(payload);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to fetch portal reviews" });
  }
};

exports.upsertPortalReview = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser || !isWorkshopRole(currentUser.role)) {
      return res.status(403).json({ error: "Mechanic portal access is required" });
    }

    const rating = Number(req.body?.rating);
    const reviewText = req.body?.reviewText?.trim() || null;

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
      "SELECT * FROM users WHERE email = $1 AND role IN ('mechanic')",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Mechanic account not found" });
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
      "SELECT * FROM users WHERE email = $1 AND role IN ('mechanic', 'admin')",
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
    const hashedConfirmPassword = await bcrypt.hash(newPassword, 10);

    await pool.query(
      `
        UPDATE users
        SET
          password = $1,
          confirmPassword = $2,
          reset_token = NULL,
          token_expiry = NULL
        WHERE id = $3
      `,
      [hashedPassword, hashedConfirmPassword, result.rows[0].id]
    );

    res.json({ message: "Password reset successful" });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to reset password" });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const currentUser = await pool.query(
      "SELECT id, password, role FROM users WHERE id = $1",
      [req.user.id]
    );

    if (currentUser.rows.length === 0 || !isWorkshopRole(currentUser.rows[0].role)) {
      return res.status(403).json({ error: "Mechanic portal access is required" });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current password and new password are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long" });
    }

    const passwordMatches = await bcrypt.compare(currentPassword, currentUser.rows[0].password);

    if (!passwordMatches) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ error: "New password must be different from current password" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const hashedConfirmPassword = await bcrypt.hash(newPassword, 10);

    await pool.query(
      "UPDATE users SET password = $1, confirmPassword = $2 WHERE id = $3",
      [hashedPassword, hashedConfirmPassword, currentUser.rows[0].id]
    );

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to change password" });
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
