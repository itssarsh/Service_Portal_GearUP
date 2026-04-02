const express = require("express");
const auth = require("../middleware/auth");
const mechanicChatController = require("../controllers/chatController");

const router = express.Router();

router.get("/threads", auth, mechanicChatController.listThreads);
router.post("/threads", auth, mechanicChatController.createOrGetThread);
router.get("/threads/:threadId/messages", auth, mechanicChatController.listMessages);
router.post("/threads/:threadId/messages", auth, mechanicChatController.sendMessage);

module.exports = router;
