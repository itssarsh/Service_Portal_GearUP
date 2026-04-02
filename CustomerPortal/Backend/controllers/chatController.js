const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const pool = require("../config/db");
const { isWorkshopRole, normalizeRole } = require("../utils/roles");
const {
  getMechanicContextByThread,
  insertMechanicNotification,
} = require("../utils/mechanicNotifications");

const chatUploadsDirectory = path.join(__dirname, "..", "..", "..", "shared_uploads", "chat");
const publicUploadPathPrefix = "/uploads/chat";
const maxUploadBytes = 5 * 1024 * 1024;
const allowedImageMimeTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

fs.mkdirSync(chatUploadsDirectory, { recursive: true });

const threadSelectSql = `
  SELECT
    ct.*,
    customer.name AS customer_name,
    customer.phone AS customer_phone,
    mechanic.name AS mechanic_name,
    mechanic.phone AS mechanic_phone,
    v.registration_number,
    v.brand,
    v.model,
    sr.service_type,
    latest.id AS last_message_id,
    latest.sender_id AS last_message_sender_id,
    latest.message_text AS last_message_text,
    latest.image_url AS last_message_image_url,
    latest.created_at AS last_message_at
  FROM chat_threads ct
  JOIN users customer ON customer.id = ct.customer_id
  JOIN users mechanic ON mechanic.id = ct.mechanic_id
  LEFT JOIN vehicles v ON v.id = ct.vehicle_id
  LEFT JOIN service_records sr ON sr.id = ct.service_record_id
  LEFT JOIN LATERAL (
    SELECT cm.id, cm.sender_id, cm.message_text, cm.image_url, cm.created_at
    FROM chat_messages cm
    WHERE cm.thread_id = ct.id
    ORDER BY cm.created_at DESC, cm.id DESC
    LIMIT 1
  ) latest ON true
`;

async function getCurrentUser(userId, db = pool) {
  const result = await db.query(
    "SELECT id, name, email, phone, role FROM users WHERE id = $1",
    [userId]
  );

  return result.rows[0] || null;
}

function isCustomerRole(role) {
  return normalizeRole(role) === "customer";
}

function buildAbsoluteUploadUrl(req, imageUrl) {
  if (!imageUrl) {
    return null;
  }

  return `${req.protocol}://${req.get("host")}${imageUrl}`;
}

function mapThreadRow(req, row) {
  return {
    ...row,
    last_message_image_url: buildAbsoluteUploadUrl(req, row.last_message_image_url),
  };
}

function mapMessageRow(req, row) {
  return {
    ...row,
    image_url: buildAbsoluteUploadUrl(req, row.image_url),
  };
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

async function getAccessibleVehicle(vehicleId, currentUser, db = pool) {
  const result = await db.query(
    `
      SELECT v.*
      FROM vehicles v
      WHERE
        v.id = $1
        AND (
          ($2 = 'admin')
          OR (
            $2 = 'mechanic'
            AND (
              v.created_by = $3
              OR EXISTS (
                SELECT 1
                FROM service_records sr
                WHERE sr.vehicle_id = v.id AND sr.mechanic_id = $3
              )
            )
          )
          OR ($2 = 'customer' AND v.owner_user_id = $3)
        )
      LIMIT 1
    `,
    [vehicleId, normalizeRole(currentUser.role), currentUser.id]
  );

  return result.rows[0] || null;
}

async function getAccessibleServiceRecord(recordId, currentUser, db = pool) {
  const result = await db.query(
    `
      SELECT sr.*, v.owner_user_id, v.created_by
      FROM service_records sr
      JOIN vehicles v ON v.id = sr.vehicle_id
      WHERE
        sr.id = $1
        AND (
          ($2 = 'admin')
          OR ($2 = 'mechanic' AND (sr.mechanic_id = $3 OR v.created_by = $3))
          OR ($2 = 'customer' AND v.owner_user_id = $3)
        )
      LIMIT 1
    `,
    [recordId, normalizeRole(currentUser.role), currentUser.id]
  );

  return result.rows[0] || null;
}

async function getAccessibleThread(threadId, currentUser, db = pool) {
  const result = await db.query(
    `
      ${threadSelectSql}
      WHERE
        ct.id = $1
        AND (
          ($2 = 'admin')
          OR ($2 = 'mechanic' AND ct.mechanic_id = $3)
          OR ($2 = 'customer' AND ct.customer_id = $3)
        )
      LIMIT 1
    `,
    [threadId, normalizeRole(currentUser.role), currentUser.id]
  );

  return result.rows[0] || null;
}

async function getUserById(userId, db = pool) {
  const result = await db.query(
    "SELECT id, name, phone, role FROM users WHERE id = $1",
    [userId]
  );

  return result.rows[0] || null;
}

async function customerHasMechanicRelationship(customerId, mechanicId, db = pool) {
  const result = await db.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM vehicles v
        LEFT JOIN service_records sr ON sr.vehicle_id = v.id
        WHERE
          v.owner_user_id = $1
          AND (v.created_by = $2 OR sr.mechanic_id = $2)
      ) AS has_relationship
    `,
    [customerId, mechanicId]
  );

  return Boolean(result.rows[0]?.has_relationship);
}

function normalizeImageName(imageName, fallbackExtension) {
  const baseName = String(imageName || "chat-image")
    .trim()
    .replace(/\.[a-zA-Z0-9]+$/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(0, 80);

  return `${baseName || "chat-image"}.${fallbackExtension}`;
}

async function persistImageUpload(imageDataUrl, imageName) {
  if (!imageDataUrl) {
    return null;
  }

  const matches = String(imageDataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);

  if (!matches) {
    throw new Error("Only valid image uploads are supported");
  }

  const mimeType = matches[1];
  const extension = allowedImageMimeTypes.get(mimeType);

  if (!extension) {
    throw new Error("Supported image formats are JPG, PNG, WEBP, and GIF");
  }

  const buffer = Buffer.from(matches[2], "base64");

  if (buffer.length === 0) {
    throw new Error("Uploaded image is empty");
  }

  if (buffer.length > maxUploadBytes) {
    throw new Error("Image must be 5 MB or smaller");
  }

  const normalizedFileName = normalizeImageName(imageName, extension);
  const savedFileName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}-${normalizedFileName}`;
  const savedFilePath = path.join(chatUploadsDirectory, savedFileName);

  await fs.promises.writeFile(savedFilePath, buffer);

  return {
    imageUrl: `${publicUploadPathPrefix}/${savedFileName}`,
    imageName: normalizedFileName,
  };
}

function normalizeMessageText(messageText) {
  const normalizedText = String(messageText || "").trim();
  return normalizedText || null;
}

function normalizeOptionalId(value, fieldLabel) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numericValue = Number(value);

  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    throw new Error(`${fieldLabel} is invalid`);
  }

  return numericValue;
}

async function resolveThreadParticipants(body, currentUser) {
  const currentRole = normalizeRole(currentUser.role);
  let customerId = normalizeOptionalId(body.customerId, "Customer");
  let mechanicId = normalizeOptionalId(body.mechanicId, "Mechanic");
  let vehicleId = normalizeOptionalId(body.vehicleId, "Vehicle");
  let serviceRecordId = normalizeOptionalId(body.serviceRecordId, "Service record");

  if (vehicleId) {
    const vehicle = await getAccessibleVehicle(vehicleId, currentUser);

    if (!vehicle) {
      throw new Error("Vehicle not found");
    }

    customerId = customerId || vehicle.owner_user_id || null;
  }

  if (serviceRecordId) {
    const serviceRecord = await getAccessibleServiceRecord(serviceRecordId, currentUser);

    if (!serviceRecord) {
      throw new Error("Service record not found");
    }

    customerId = customerId || serviceRecord.owner_user_id || null;
    mechanicId = mechanicId || serviceRecord.mechanic_id || null;
    vehicleId = vehicleId || serviceRecord.vehicle_id || null;
  }

  if (currentRole === "customer") {
    customerId = currentUser.id;

    if (!mechanicId) {
      throw new Error("A mechanic is required to start chat");
    }

    const hasRelationship = await customerHasMechanicRelationship(customerId, mechanicId);

    if (!hasRelationship) {
      throw new Error("You can only chat with mechanics linked to your service records");
    }
  } else if (isWorkshopRole(currentRole)) {
    mechanicId = currentRole === "admin" && mechanicId ? mechanicId : currentUser.id;
  } else {
    throw new Error("Chat access is not allowed for this account");
  }

  if (!customerId) {
    throw new Error("Customer account is required to start chat");
  }

  if (!mechanicId) {
    throw new Error("Mechanic account is required to start chat");
  }

  const customer = await getUserById(customerId);
  const mechanic = await getUserById(mechanicId);

  if (!customer || !isCustomerRole(customer.role)) {
    throw new Error("Customer account not found");
  }

  if (!mechanic || !isWorkshopRole(mechanic.role)) {
    throw new Error("Mechanic account not found");
  }

  return {
    customerId,
    mechanicId,
    vehicleId,
    serviceRecordId,
  };
}

exports.listThreads = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser) {
      return res.status(401).json({ error: "User not found" });
    }

    const threads = await pool.query(
      `
        ${threadSelectSql}
        WHERE
          ($1 = 'admin')
          OR ($1 = 'mechanic' AND ct.mechanic_id = $2)
          OR ($1 = 'customer' AND ct.customer_id = $2)
        ORDER BY COALESCE(latest.created_at, ct.updated_at, ct.created_at) DESC, ct.id DESC
      `,
      [normalizeRole(currentUser.role), currentUser.id]
    );

    res.json(threads.rows.map((row) => mapThreadRow(req, row)));
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to fetch chat threads" });
  }
};

exports.createOrGetThread = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser) {
      return res.status(401).json({ error: "User not found" });
    }

    let participants;

    try {
      participants = await resolveThreadParticipants(req.body || {}, currentUser);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const existingThread = await client.query(
        `
          SELECT id
          FROM chat_threads
          WHERE customer_id = $1 AND mechanic_id = $2
          LIMIT 1
        `,
        [participants.customerId, participants.mechanicId]
      );

      let threadId;

      if (existingThread.rows.length > 0) {
        threadId = existingThread.rows[0].id;

        await client.query(
          `
            UPDATE chat_threads
            SET
              vehicle_id = COALESCE($1, vehicle_id),
              service_record_id = COALESCE($2, service_record_id),
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
          `,
          [participants.vehicleId, participants.serviceRecordId, threadId]
        );
      } else {
        const createdThread = await client.query(
          `
            INSERT INTO chat_threads (
              customer_id,
              mechanic_id,
              vehicle_id,
              service_record_id
            )
            VALUES ($1, $2, $3, $4)
            RETURNING id
          `,
          [
            participants.customerId,
            participants.mechanicId,
            participants.vehicleId,
            participants.serviceRecordId,
          ]
        );

        threadId = createdThread.rows[0].id;
      }

      await client.query("COMMIT");

      const thread = await getAccessibleThread(threadId, currentUser);
      res.status(existingThread.rows.length > 0 ? 200 : 201).json(mapThreadRow(req, thread));
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to open chat thread" });
  }
};

exports.listMessages = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser) {
      return res.status(401).json({ error: "User not found" });
    }

    const thread = await getAccessibleThread(req.params.threadId, currentUser);

    if (!thread) {
      return res.status(404).json({ error: "Chat thread not found" });
    }

    const messages = await pool.query(
      `
        SELECT cm.*, sender.name AS sender_name, sender.role AS sender_role
        FROM chat_messages cm
        JOIN users sender ON sender.id = cm.sender_id
        WHERE cm.thread_id = $1
        ORDER BY cm.created_at ASC, cm.id ASC
      `,
      [req.params.threadId]
    );

    res.json({
      thread: mapThreadRow(req, thread),
      messages: messages.rows.map((row) => mapMessageRow(req, row)),
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to fetch chat messages" });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser) {
      return res.status(401).json({ error: "User not found" });
    }

    const thread = await getAccessibleThread(req.params.threadId, currentUser);

    if (!thread) {
      return res.status(404).json({ error: "Chat thread not found" });
    }

    const messageText = normalizeMessageText(req.body?.messageText);
    let uploadDetails = null;

    try {
      uploadDetails = await persistImageUpload(req.body?.imageDataUrl, req.body?.imageName);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    if (!messageText && !uploadDetails) {
      return res.status(400).json({ error: "Enter a message or attach an image" });
    }

    const createdMessage = await pool.query(
      `
        INSERT INTO chat_messages (
          thread_id,
          sender_id,
          message_text,
          image_url,
          image_name
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
      [
        req.params.threadId,
        currentUser.id,
        messageText,
        uploadDetails?.imageUrl || null,
        uploadDetails?.imageName || null,
      ]
    );

    await pool.query(
      `
        UPDATE chat_threads
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `,
      [req.params.threadId]
    );

    if (normalizeRole(currentUser.role) === "customer") {
      const mechanicContext = await getMechanicContextByThread(req.params.threadId);

      if (mechanicContext?.mechanic_id) {
        const vehicleLabel = buildVehicleLabel(mechanicContext);
        const messagePreview = messageText
          ? `Message: ${messageText}`
          : uploadDetails
            ? "The customer attached an image."
            : "";

        await insertMechanicNotification({
          mechanicId: mechanicContext.mechanic_id,
          customerId: currentUser.id,
          serviceRecordId: mechanicContext.service_record_id || null,
          chatThreadId: mechanicContext.chat_thread_id,
          sourceType: "chat",
          actionType: "new_message",
          title: "New customer message",
          message: [
            `${currentUser.name || mechanicContext.customer_name || "Customer"} sent you a new chat message.`,
            vehicleLabel ? `Vehicle: ${vehicleLabel}.` : "",
            messagePreview,
          ]
            .filter(Boolean)
            .join(" "),
        });
      }
    }

    const sender = await getUserById(currentUser.id);

    res.status(201).json(
      mapMessageRow(req, {
        ...createdMessage.rows[0],
        sender_name: sender?.name || currentUser.name,
        sender_role: currentUser.role,
      })
    );
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to send chat message" });
  }
};
