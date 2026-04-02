const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const initializeDatabase = require("./init/initDb");
const mechanicUserRoutes = require("./routes/userRoutes");
const mechanicVehicleRoutes = require("./routes/vehicleRoutes");
const mechanicServiceRecordRoutes = require("./routes/serviceRecordRoutes");
const mechanicBillingRoutes = require("./routes/billingRoutes");
const mechanicChatRoutes = require("./routes/chatRoutes");
const mechanicEmergencyRoutes = require("./routes/emergencyRoutes");
const mechanicNotificationRoutes = require("./routes/notificationRoutes");

const app = express();
const uploadsDirectory = path.join(__dirname, "..", "..", "shared_uploads");

app.use(cors());
app.use(express.json({ limit: "12mb" }));
app.use("/uploads", express.static(uploadsDirectory));

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "mechanic-backend",
    hint: "Frontend runs separately. Try /api/mechanic/users or /api/mechanic/users/login.",
  });
});

app.get("/api/mechanic", (req, res) => {
  res.json({
    ok: true,
    routes: [
      "/api/mechanic/users",
      "/api/mechanic/users/signup",
      "/api/mechanic/users/login",
      "/api/mechanic/users/me",
      "/api/mechanic/vehicles",
      "/api/mechanic/service-records",
      "/api/mechanic/billing/invoices",
      "/api/mechanic/billing/report",
      "/api/mechanic/chat/threads",
      "/api/mechanic/notifications",
      "/api/mechanic/emergency/requests",
    ],
  });
});

app.use("/api/mechanic/users", mechanicUserRoutes);
app.use("/api/mechanic/vehicles", mechanicVehicleRoutes);
app.use("/api/mechanic/service-records", mechanicServiceRecordRoutes);
app.use("/api/mechanic/billing", mechanicBillingRoutes);
app.use("/api/mechanic/chat", mechanicChatRoutes);
app.use("/api/mechanic/notifications", mechanicNotificationRoutes);
app.use("/api/mechanic/emergency", mechanicEmergencyRoutes);

async function startServer() {
  await initializeDatabase();

  const port = process.env.PORT || 5000;

  app.listen(port, () => {
    console.log(`Mechanic backend running on port ${port}`);
  });
}

startServer();
