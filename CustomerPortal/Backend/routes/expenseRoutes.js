const express = require("express");
const auth = require("../middleware/auth");
const router = express.Router();
const expenseController = require("../controllers/expenseController");

router.get("/analytics", auth, expenseController.getExpenseAnalytics);
router.get("/", auth, expenseController.listExpenses);
router.post("/add", auth, expenseController.addExpense);
router.get("/total/:vehicleId", auth, expenseController.getTotalExpense);
router.get("/monthly/:vehicleId", auth, expenseController.getMonthlyExpense);
router.get("/yearly/:vehicleId", auth, expenseController.getYearlyExpense);
router.get("/service-wise/:vehicleId", auth, expenseController.getServiceWiseExpense);

module.exports = router;
