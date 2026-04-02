const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const initializeDatabase = require("./init/initDb");
const customerUserRoutes = require("./routes/userRoutes");
const customerVehicleRoutes = require("./routes/vehicleRoutes");
const customerServiceRecordRoutes = require("./routes/serviceRecordRoutes");
const customerEmergencyRoutes = require("./routes/emergencyRoutes");
const customerChatRoutes = require("./routes/chatRoutes");
const customerNotificationRoutes = require("./routes/notificationRoutes");
const expenseRoutes = require("./routes/expenseRoutes");
const app = express();
const uploadsDirectory = path.join(__dirname, "..", "..", "shared_uploads");

app.use(cors());
app.use(express.json({ limit: "12mb" }));
app.use("/uploads", express.static(uploadsDirectory));

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "customer-backend",
    hint: "Frontend runs separately. Try /api/customer/users or /api/customer/users/login.",
  });
});

app.get("/api/customer", (req, res) => {
  res.json({
    ok: true,
    routes: [
      "/api/customer/users",
      "/api/customer/users/signup",
      "/api/customer/users/login",
      "/api/customer/users/me",
      "/api/customer/vehicles",
      "/api/customer/service-records",
      "/api/customer/chat/threads",
      "/api/customer/notifications",
      "/api/customer/emergency/requests",
      "/api/customer/expenses",
      "/api/customer/expenses/analytics",
    ],
  });
});

app.use("/api/customer/users", customerUserRoutes);
app.use("/api/customer/vehicles", customerVehicleRoutes);
app.use("/api/customer/service-records", customerServiceRecordRoutes);
app.use("/api/customer/chat", customerChatRoutes);
app.use("/api/customer/notifications", customerNotificationRoutes);
app.use("/api/customer/emergency", customerEmergencyRoutes);
app.use("/api/customer/expenses", expenseRoutes);

async function startServer() {
  await initializeDatabase();

  const port = process.env.PORT || 5000;

  app.listen(port, () => {
    console.log(`Customer backend running on port ${port}`);
  });
}

startServer();
