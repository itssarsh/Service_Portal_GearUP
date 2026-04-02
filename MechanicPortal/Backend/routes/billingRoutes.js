const express = require("express");
const auth = require("../middleware/auth");
const mechanicBillingController = require("../controllers/billingController");

const router = express.Router();

router.get("/invoices", auth, mechanicBillingController.listInvoices);
router.post("/invoices/auto-generate", auth, mechanicBillingController.autoGenerateInvoices);
router.put("/invoices/:id/payment", auth, mechanicBillingController.updateInvoicePayment);
router.get("/report", auth, mechanicBillingController.getBillingReport);

module.exports = router;
