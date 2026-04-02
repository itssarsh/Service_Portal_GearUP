const express = require("express");
const auth = require("../middleware/auth");
const mechanicEmergencyController = require("../controllers/emergencyController");

const router = express.Router();

router.get("/notifications", auth, mechanicEmergencyController.listNotifications);
router.patch("/notifications/read", auth, mechanicEmergencyController.markNotificationsRead);
router.get("/requests", auth, mechanicEmergencyController.listEmergencyRequests);
router.post("/requests", auth, mechanicEmergencyController.createEmergencyRequest);
router.patch(
  "/requests/:id/status",
  auth,
  mechanicEmergencyController.updateEmergencyStatus
);

module.exports = router;
