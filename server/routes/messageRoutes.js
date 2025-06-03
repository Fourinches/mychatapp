// server/routes/messageRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware'); // 引入认证中间件
const { downloadHistory } = require('../controllers/messageController'); // 引入控制器

// 应用认证中间件，只有登录用户才能下载
router.use(authMiddleware);

// @route   GET /api/messages/download
// @desc    下载指定聊天记录
// @access  Private
// @query   chatType=public 或 chatType=private&targetId=<friend_id>
router.get('/download', downloadHistory);

module.exports = router;