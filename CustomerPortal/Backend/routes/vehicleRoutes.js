const express = require("express");
const auth = require("../middleware/auth");
const customerVehicleController = require("../controllers/vehicleController");

const router = express.Router();

router.get("/", auth, customerVehicleController.listVehicles);
router.post("/", auth, customerVehicleController.createVehicle);

module.exports = router;
