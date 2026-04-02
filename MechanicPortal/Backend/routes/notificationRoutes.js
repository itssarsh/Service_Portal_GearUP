const express = require("express");
const auth = require("../middleware/auth");
const mechanicNotificationController = require("../controllers/notificationController");

const router = express.Router();

router.get("/", auth, mechanicNotificationController.listNotifications);
router.patch("/read", auth, mechanicNotificationController.markNotificationsRead);

module.exports = router;
