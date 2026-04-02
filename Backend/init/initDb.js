const pool = require("../config/db");

async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone VARCHAR(15) UNIQUE NOT NULL,
        address TEXT,
        workshop_name TEXT,
        service_location TEXT,
        vehicle_types TEXT[] DEFAULT '{}',
        services_offered TEXT[] DEFAULT '{}',
        years_experience INT,
        availability_days TEXT[] DEFAULT '{}',
        availability_start TIME,
        availability_end TIME,
        service_mode TEXT,
        id_proof_type TEXT,
        id_proof_reference TEXT,
        phone_verified BOOLEAN DEFAULT FALSE,
        password TEXT NOT NULL,
        confirmPassword TEXT NOT NULL,
        role TEXT DEFAULT 'customer',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS address TEXT,
      ADD COLUMN IF NOT EXISTS workshop_name TEXT,
      ADD COLUMN IF NOT EXISTS service_location TEXT,
      ADD COLUMN IF NOT EXISTS vehicle_types TEXT[] DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS services_offered TEXT[] DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS years_experience INT,
      ADD COLUMN IF NOT EXISTS availability_days TEXT[] DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS availability_start TIME,
      ADD COLUMN IF NOT EXISTS availability_end TIME,
      ADD COLUMN IF NOT EXISTS service_mode TEXT,
      ADD COLUMN IF NOT EXISTS id_proof_type TEXT,
      ADD COLUMN IF NOT EXISTS id_proof_reference TEXT,
      ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS phone VARCHAR(15),
      ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'customer',
      ADD COLUMN IF NOT EXISTS confirmPassword TEXT
    `);

    // Optional safety: enforce uniqueness when possible (ignore if existing data violates it).
    await pool.query(`
      ALTER TABLE users
      ADD CONSTRAINT IF NOT EXISTS users_phone_key UNIQUE (phone)
    `).catch(() => null);

    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS reset_token TEXT,
      ADD COLUMN IF NOT EXISTS token_expiry BIGINT
    `);

    await pool.query(`
      ALTER TABLE users
      DROP CONSTRAINT IF EXISTS users_role_check
    `);

    await pool.query(`
      UPDATE users
      SET role = 'customer'
      WHERE role IS NULL OR role = 'user'
    `);

    await pool.query(`
      ALTER TABLE users
      ADD CONSTRAINT users_role_check
      CHECK (role IN ('customer', 'mechanic', 'admin'))
    `).catch(() => null);

    await pool.query(`
      ALTER TABLE users
      DROP CONSTRAINT IF EXISTS users_service_mode_check
    `);

    await pool.query(`
      ALTER TABLE users
      ADD CONSTRAINT users_service_mode_check
      CHECK (
        service_mode IS NULL
        OR service_mode IN ('shop', 'doorstep', 'shop_and_doorstep')
      )
    `).catch(() => null);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS vehicles (
        id SERIAL PRIMARY KEY,
        registration_number VARCHAR(30) UNIQUE NOT NULL,
        vehicle_type TEXT NOT NULL,
        brand VARCHAR(80) NOT NULL,
        model VARCHAR(80) NOT NULL,
        manufacture_year INT,
        owner_name VARCHAR(120) NOT NULL,
        owner_phone VARCHAR(15) NOT NULL,
        owner_user_id INT REFERENCES users(id) ON DELETE SET NULL,
        created_by INT REFERENCES users(id) ON DELETE SET NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      ALTER TABLE vehicles
      ADD COLUMN IF NOT EXISTS registration_number VARCHAR(30),
      ADD COLUMN IF NOT EXISTS vehicle_type TEXT,
      ADD COLUMN IF NOT EXISTS brand VARCHAR(80),
      ADD COLUMN IF NOT EXISTS model VARCHAR(80),
      ADD COLUMN IF NOT EXISTS manufacture_year INT,
      ADD COLUMN IF NOT EXISTS owner_name VARCHAR(120),
      ADD COLUMN IF NOT EXISTS owner_phone VARCHAR(15),
      ADD COLUMN IF NOT EXISTS owner_user_id INT REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS created_by INT REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS notes TEXT,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS service_records (
        id SERIAL PRIMARY KEY,
        vehicle_id INT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
        mechanic_id INT REFERENCES users(id) ON DELETE SET NULL,
        service_type VARCHAR(120) NOT NULL,
        complaint TEXT,
        customer_rating INT,
        customer_feedback TEXT,
        customer_feedback_at TIMESTAMP,
        customer_complaint TEXT,
        customer_complaint_status VARCHAR(40),
        customer_complaint_created_at TIMESTAMP,
        customer_complaint_mechanic_note TEXT,
        customer_complaint_updated_at TIMESTAMP,
        customer_complaint_updated_by INT REFERENCES users(id) ON DELETE SET NULL,
        work_summary TEXT,
        status TEXT DEFAULT 'requested',
        amount NUMERIC(10, 2) DEFAULT 0,
        km_reading INT,
        service_date DATE DEFAULT CURRENT_DATE,
        next_service_date DATE,
        customer_booking BOOLEAN DEFAULT FALSE,
        booking_date DATE,
        booking_time_slot VARCHAR(80),
        booking_status VARCHAR(40) DEFAULT 'accepted',
        rejection_reason TEXT,
        estimated_hours NUMERIC(5, 2) DEFAULT 1,
        transport_option VARCHAR(40) DEFAULT 'drop_off',
        is_emergency BOOLEAN DEFAULT FALSE,
        emergency_status VARCHAR(40) DEFAULT 'open',
        emergency_location TEXT,
        emergency_priority VARCHAR(20) DEFAULT 'high',
        emergency_requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        emergency_resolved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      ALTER TABLE service_records
      ADD COLUMN IF NOT EXISTS vehicle_id INT REFERENCES vehicles(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS mechanic_id INT REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS service_type VARCHAR(120),
      ADD COLUMN IF NOT EXISTS complaint TEXT,
      ADD COLUMN IF NOT EXISTS customer_rating INT,
      ADD COLUMN IF NOT EXISTS customer_feedback TEXT,
      ADD COLUMN IF NOT EXISTS customer_feedback_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS customer_complaint TEXT,
      ADD COLUMN IF NOT EXISTS customer_complaint_status VARCHAR(40),
      ADD COLUMN IF NOT EXISTS customer_complaint_created_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS customer_complaint_mechanic_note TEXT,
      ADD COLUMN IF NOT EXISTS customer_complaint_updated_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS customer_complaint_updated_by INT REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS work_summary TEXT,
      ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'requested',
      ADD COLUMN IF NOT EXISTS amount NUMERIC(10, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS km_reading INT,
      ADD COLUMN IF NOT EXISTS service_date DATE DEFAULT CURRENT_DATE,
      ADD COLUMN IF NOT EXISTS next_service_date DATE,
      ADD COLUMN IF NOT EXISTS customer_booking BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS booking_date DATE,
      ADD COLUMN IF NOT EXISTS booking_time_slot VARCHAR(80),
      ADD COLUMN IF NOT EXISTS booking_status VARCHAR(40) DEFAULT 'accepted',
      ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
      ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(5, 2) DEFAULT 1,
      ADD COLUMN IF NOT EXISTS transport_option VARCHAR(40) DEFAULT 'drop_off',
      ADD COLUMN IF NOT EXISTS is_emergency BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS emergency_status VARCHAR(40) DEFAULT 'open',
      ADD COLUMN IF NOT EXISTS emergency_location TEXT,
      ADD COLUMN IF NOT EXISTS emergency_priority VARCHAR(20) DEFAULT 'high',
      ADD COLUMN IF NOT EXISTS emergency_requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS emergency_resolved_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);

    await pool.query(`
      ALTER TABLE service_records
      ALTER COLUMN complaint DROP NOT NULL
    `).catch(() => null);

    await pool.query(`
      ALTER TABLE service_records
      DROP CONSTRAINT IF EXISTS service_records_customer_rating_check
    `);

    await pool.query(`
      ALTER TABLE service_records
      ADD CONSTRAINT service_records_customer_rating_check
      CHECK (
        customer_rating IS NULL
        OR (customer_rating >= 1 AND customer_rating <= 5)
      )
    `).catch(() => null);

    await pool.query(`
      UPDATE service_records
      SET customer_complaint_status = CASE
        WHEN customer_complaint IS NULL OR btrim(customer_complaint) = '' THEN NULL
        WHEN customer_complaint_status IS NULL OR btrim(customer_complaint_status) = '' THEN 'open'
        WHEN lower(btrim(customer_complaint_status)) IN ('open', 'raised', 'new') THEN 'open'
        WHEN lower(btrim(customer_complaint_status)) IN ('in_review', 'in review', 'reviewing', 'under_review', 'under review') THEN 'in_review'
        WHEN lower(btrim(customer_complaint_status)) IN ('resolved', 'closed', 'done', 'completed') THEN 'resolved'
        ELSE 'open'
      END
    `);

    await pool.query(`
      ALTER TABLE service_records
      DROP CONSTRAINT IF EXISTS service_records_customer_complaint_status_check
    `);

    await pool.query(`
      ALTER TABLE service_records
      ADD CONSTRAINT service_records_customer_complaint_status_check
      CHECK (
        customer_complaint_status IS NULL
        OR customer_complaint_status IN ('open', 'in_review', 'resolved')
      )
    `).catch(() => null);

    await pool.query(`
      ALTER TABLE service_records
      DROP CONSTRAINT IF EXISTS service_records_status_check
    `);

    await pool.query(`
      ALTER TABLE service_records
      DROP CONSTRAINT IF EXISTS service_records_booking_status_check
    `);

    await pool.query(`
      ALTER TABLE service_records
      DROP CONSTRAINT IF EXISTS service_records_estimated_hours_check
    `);

    await pool.query(`
      ALTER TABLE service_records
      DROP CONSTRAINT IF EXISTS service_records_transport_option_check
    `);

    await pool.query(`
      ALTER TABLE service_records
      DROP CONSTRAINT IF EXISTS service_records_emergency_status_check
    `);

    await pool.query(`
      ALTER TABLE service_records
      DROP CONSTRAINT IF EXISTS service_records_emergency_priority_check
    `);

    await pool.query(`
      UPDATE service_records
      SET status = CASE
        WHEN status IS NULL OR btrim(status) = '' THEN 'requested'
        WHEN lower(btrim(status)) IN ('pending', 'request', 'requested', 'new') THEN 'requested'
        WHEN lower(btrim(status)) IN ('accepted', 'approve', 'approved', 'confirmed') THEN 'accepted'
        WHEN lower(btrim(status)) IN ('in_progress', 'in progress', 'inprogress', 'ongoing') THEN 'in_progress'
        WHEN lower(btrim(status)) IN ('completed', 'complete', 'done', 'delivered', 'closed') THEN 'completed'
        ELSE 'requested'
      END
    `);

    await pool.query(`
      UPDATE service_records
      SET booking_status = CASE
        WHEN booking_status IS NULL OR btrim(booking_status) = '' THEN
          CASE
            WHEN status = 'requested' THEN 'requested'
            ELSE 'accepted'
          END
        WHEN lower(btrim(booking_status)) IN ('requested', 'request', 'new') THEN 'requested'
        WHEN lower(btrim(booking_status)) IN ('accepted', 'approve', 'approved', 'confirmed') THEN 'accepted'
        WHEN lower(btrim(booking_status)) IN ('rejected', 'reject', 'declined') THEN 'rejected'
        WHEN lower(btrim(booking_status)) IN ('rescheduled', 'reschedule') THEN 'rescheduled'
        ELSE
          CASE
            WHEN status = 'requested' THEN 'requested'
            ELSE 'accepted'
          END
      END
    `);

    await pool.query(`
      UPDATE service_records
      SET estimated_hours = 1
      WHERE estimated_hours IS NULL OR estimated_hours <= 0
    `);

    await pool.query(`
      UPDATE service_records
      SET transport_option = CASE
        WHEN transport_option IS NULL OR btrim(transport_option) = '' THEN 'drop_off'
        WHEN lower(btrim(transport_option)) IN ('drop_off', 'dropoff') THEN 'drop_off'
        WHEN lower(btrim(transport_option)) IN ('pickup_drop', 'pickupdrop', 'pickup_dropoff') THEN 'pickup_drop'
        ELSE 'drop_off'
      END
    `);

    await pool.query(`
      UPDATE service_records
      SET is_emergency = COALESCE(is_emergency, FALSE)
    `);

    await pool.query(`
      UPDATE service_records
      SET emergency_status = CASE
        WHEN emergency_status IS NULL OR btrim(emergency_status) = '' THEN
          CASE
            WHEN is_emergency = TRUE THEN 'open'
            ELSE 'resolved'
          END
        WHEN lower(btrim(emergency_status)) IN ('open', 'new', 'raised') THEN 'open'
        WHEN lower(btrim(emergency_status)) IN ('assigned', 'accepted') THEN 'assigned'
        WHEN lower(btrim(emergency_status)) IN ('in_progress', 'in progress', 'ongoing') THEN 'in_progress'
        WHEN lower(btrim(emergency_status)) IN ('resolved', 'completed', 'done', 'closed') THEN 'resolved'
        WHEN lower(btrim(emergency_status)) IN ('cancelled', 'canceled') THEN 'cancelled'
        ELSE
          CASE
            WHEN is_emergency = TRUE THEN 'open'
            ELSE 'resolved'
          END
      END
    `);

    await pool.query(`
      UPDATE service_records
      SET emergency_priority = CASE
        WHEN emergency_priority IS NULL OR btrim(emergency_priority) = '' THEN
          CASE
            WHEN is_emergency = TRUE THEN 'critical'
            ELSE 'high'
          END
        WHEN lower(btrim(emergency_priority)) IN ('low', 'medium', 'high', 'critical') THEN lower(btrim(emergency_priority))
        WHEN lower(btrim(emergency_priority)) IN ('urgent', 'emergency', 'sos') THEN 'critical'
        ELSE 'high'
      END
    `);

    await pool.query(`
      UPDATE service_records
      SET emergency_requested_at = COALESCE(emergency_requested_at, created_at, CURRENT_TIMESTAMP)
    `);

    await pool.query(`
      ALTER TABLE service_records
      ADD CONSTRAINT service_records_status_check
      CHECK (status IN ('requested', 'accepted', 'in_progress', 'completed'))
    `).catch(() => null);

    await pool.query(`
      ALTER TABLE service_records
      ADD CONSTRAINT service_records_booking_status_check
      CHECK (booking_status IN ('requested', 'accepted', 'rejected', 'rescheduled'))
    `).catch(() => null);

    await pool.query(`
      ALTER TABLE service_records
      ADD CONSTRAINT service_records_estimated_hours_check
      CHECK (estimated_hours IS NULL OR estimated_hours > 0)
    `).catch(() => null);

    await pool.query(`
      ALTER TABLE service_records
      ADD CONSTRAINT service_records_transport_option_check
      CHECK (
        transport_option IS NULL
        OR transport_option IN ('drop_off', 'pickup_drop')
      )
    `).catch(() => null);

    await pool.query(`
      ALTER TABLE service_records
      ADD CONSTRAINT service_records_emergency_status_check
      CHECK (emergency_status IN ('open', 'assigned', 'in_progress', 'resolved', 'cancelled'))
    `).catch(() => null);

    await pool.query(`
      ALTER TABLE service_records
      ADD CONSTRAINT service_records_emergency_priority_check
      CHECK (emergency_priority IN ('low', 'medium', 'high', 'critical'))
    `).catch(() => null);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_vehicles_owner_phone
      ON vehicles(owner_phone)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_service_records_vehicle_id
      ON service_records(vehicle_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_service_records_booking_date
      ON service_records(booking_date)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_service_records_is_emergency
      ON service_records(is_emergency)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_service_records_emergency_status
      ON service_records(emergency_status)
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS emergency_notifications (
        id SERIAL PRIMARY KEY,
        mechanic_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        service_record_id INT NOT NULL REFERENCES service_records(id) ON DELETE CASCADE,
        title VARCHAR(160) NOT NULL,
        message TEXT NOT NULL,
        emergency_location TEXT,
        is_read BOOLEAN DEFAULT FALSE,
        read_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      ALTER TABLE emergency_notifications
      ADD COLUMN IF NOT EXISTS mechanic_id INT REFERENCES users(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS service_record_id INT REFERENCES service_records(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS title VARCHAR(160),
      ADD COLUMN IF NOT EXISTS message TEXT,
      ADD COLUMN IF NOT EXISTS emergency_location TEXT,
      ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS read_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);

    await pool.query(`
      UPDATE emergency_notifications
      SET is_read = FALSE
      WHERE is_read IS NULL
    `);

    await pool.query(`
      ALTER TABLE emergency_notifications
      ALTER COLUMN title SET NOT NULL
    `).catch(() => null);

    await pool.query(`
      ALTER TABLE emergency_notifications
      ALTER COLUMN message SET NOT NULL
    `).catch(() => null);

    await pool.query(`
      ALTER TABLE emergency_notifications
      ALTER COLUMN mechanic_id SET NOT NULL
    `).catch(() => null);

    await pool.query(`
      ALTER TABLE emergency_notifications
      ALTER COLUMN service_record_id SET NOT NULL
    `).catch(() => null);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_emergency_notifications_mechanic_request
      ON emergency_notifications(mechanic_id, service_record_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_emergency_notifications_mechanic_read
      ON emergency_notifications(mechanic_id, is_read, created_at DESC)
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS billing_invoices (
        id SERIAL PRIMARY KEY,
        service_record_id INT UNIQUE NOT NULL REFERENCES service_records(id) ON DELETE CASCADE,
        invoice_number VARCHAR(40) UNIQUE,
        amount_due NUMERIC(10, 2) DEFAULT 0,
        amount_paid NUMERIC(10, 2) DEFAULT 0,
        payment_status TEXT DEFAULT 'unpaid',
        due_date DATE,
        paid_at DATE,
        payment_method VARCHAR(40),
        notes TEXT,
        created_by INT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      ALTER TABLE billing_invoices
      ADD COLUMN IF NOT EXISTS service_record_id INT UNIQUE REFERENCES service_records(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(40) UNIQUE,
      ADD COLUMN IF NOT EXISTS amount_due NUMERIC(10, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(10, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid',
      ADD COLUMN IF NOT EXISTS due_date DATE,
      ADD COLUMN IF NOT EXISTS paid_at DATE,
      ADD COLUMN IF NOT EXISTS payment_method VARCHAR(40),
      ADD COLUMN IF NOT EXISTS notes TEXT,
      ADD COLUMN IF NOT EXISTS created_by INT REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);

    await pool.query(`
      ALTER TABLE billing_invoices
      DROP CONSTRAINT IF EXISTS billing_invoices_payment_status_check
    `);

    await pool.query(`
      ALTER TABLE billing_invoices
      ADD CONSTRAINT billing_invoices_payment_status_check
      CHECK (payment_status IN ('unpaid', 'partially_paid', 'paid', 'overdue'))
    `).catch(() => null);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_billing_invoices_service_record_id
      ON billing_invoices(service_record_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_billing_invoices_payment_status
      ON billing_invoices(payment_status)
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_threads (
        id SERIAL PRIMARY KEY,
        customer_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        mechanic_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        vehicle_id INT REFERENCES vehicles(id) ON DELETE SET NULL,
        service_record_id INT REFERENCES service_records(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      ALTER TABLE chat_threads
      ADD COLUMN IF NOT EXISTS customer_id INT REFERENCES users(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS mechanic_id INT REFERENCES users(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS vehicle_id INT REFERENCES vehicles(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS service_record_id INT REFERENCES service_records(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_threads_customer_mechanic
      ON chat_threads(customer_id, mechanic_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_threads_vehicle_id
      ON chat_threads(vehicle_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_threads_service_record_id
      ON chat_threads(service_record_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_threads_updated_at
      ON chat_threads(updated_at DESC)
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_notifications (
        id SERIAL PRIMARY KEY,
        customer_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        service_record_id INT REFERENCES service_records(id) ON DELETE CASCADE,
        chat_thread_id INT REFERENCES chat_threads(id) ON DELETE CASCADE,
        source_type VARCHAR(40) NOT NULL,
        action_type VARCHAR(80) NOT NULL,
        title VARCHAR(160) NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        read_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      ALTER TABLE customer_notifications
      ADD COLUMN IF NOT EXISTS customer_id INT REFERENCES users(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS service_record_id INT REFERENCES service_records(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS chat_thread_id INT REFERENCES chat_threads(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS source_type VARCHAR(40),
      ADD COLUMN IF NOT EXISTS action_type VARCHAR(80),
      ADD COLUMN IF NOT EXISTS title VARCHAR(160),
      ADD COLUMN IF NOT EXISTS message TEXT,
      ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS read_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);

    await pool.query(`
      UPDATE customer_notifications
      SET is_read = FALSE
      WHERE is_read IS NULL
    `);

    await pool.query(`
      ALTER TABLE customer_notifications
      ALTER COLUMN customer_id SET NOT NULL
    `).catch(() => null);

    await pool.query(`
      ALTER TABLE customer_notifications
      ALTER COLUMN source_type SET NOT NULL
    `).catch(() => null);

    await pool.query(`
      ALTER TABLE customer_notifications
      ALTER COLUMN action_type SET NOT NULL
    `).catch(() => null);

    await pool.query(`
      ALTER TABLE customer_notifications
      ALTER COLUMN title SET NOT NULL
    `).catch(() => null);

    await pool.query(`
      ALTER TABLE customer_notifications
      ALTER COLUMN message SET NOT NULL
    `).catch(() => null);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_customer_notifications_customer_read
      ON customer_notifications(customer_id, is_read, created_at DESC)
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        thread_id INT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
        sender_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message_text TEXT,
        image_url TEXT,
        image_name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS thread_id INT REFERENCES chat_threads(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS sender_id INT REFERENCES users(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS message_text TEXT,
      ADD COLUMN IF NOT EXISTS image_url TEXT,
      ADD COLUMN IF NOT EXISTS image_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created_at
      ON chat_messages(thread_id, created_at DESC, id DESC)
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS mechanic_notifications (
        id SERIAL PRIMARY KEY,
        mechanic_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        customer_id INT REFERENCES users(id) ON DELETE SET NULL,
        service_record_id INT REFERENCES service_records(id) ON DELETE CASCADE,
        chat_thread_id INT REFERENCES chat_threads(id) ON DELETE CASCADE,
        source_type VARCHAR(40) NOT NULL,
        action_type VARCHAR(60) NOT NULL,
        title VARCHAR(180),
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        read_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      ALTER TABLE mechanic_notifications
      ADD COLUMN IF NOT EXISTS mechanic_id INT REFERENCES users(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS customer_id INT REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS service_record_id INT REFERENCES service_records(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS chat_thread_id INT REFERENCES chat_threads(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS source_type VARCHAR(40),
      ADD COLUMN IF NOT EXISTS action_type VARCHAR(60),
      ADD COLUMN IF NOT EXISTS title VARCHAR(180),
      ADD COLUMN IF NOT EXISTS message TEXT,
      ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS read_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_mechanic_notifications_mechanic_created_at
      ON mechanic_notifications(mechanic_id, created_at DESC, id DESC)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_mechanic_notifications_unread
      ON mechanic_notifications(mechanic_id, is_read, created_at DESC)
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS portal_reviews (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        rating INT NOT NULL,
        review_text TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      ALTER TABLE portal_reviews
      ADD COLUMN IF NOT EXISTS user_id INT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS rating INT,
      ADD COLUMN IF NOT EXISTS review_text TEXT,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);

    await pool.query(`
      ALTER TABLE portal_reviews
      DROP CONSTRAINT IF EXISTS portal_reviews_rating_check
    `);

    await pool.query(`
      ALTER TABLE portal_reviews
      ADD CONSTRAINT portal_reviews_rating_check
      CHECK (rating BETWEEN 1 AND 5)
    `).catch(() => null);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_portal_reviews_updated_at
      ON portal_reviews(updated_at DESC)
    `);

    console.log("Vehicle service database initialized");
  } catch (err) {
    console.error("DB Init Error:", err.message);
  }
}

module.exports = initializeDatabase;
