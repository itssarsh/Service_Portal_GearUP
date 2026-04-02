const express = require("express");
const auth = require("../middleware/auth");
const mechanicServiceRecordController = require("../controllers/serviceRecordController");

const router = express.Router();

router.get("/", auth, mechanicServiceRecordController.listServiceRecords);
router.post("/", auth, mechanicServiceRecordController.createServiceRecord);
router.get("/:id", auth, mechanicServiceRecordController.getServiceRecordById);
router.put("/:id", auth, mechanicServiceRecordController.updateServiceRecord);
router.patch("/:id/booking", auth, mechanicServiceRecordController.updateBookingRequest);
router.patch("/:id/complaint", auth, mechanicServiceRecordController.updateComplaintAction);

module.exports = router;
