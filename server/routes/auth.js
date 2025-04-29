// server/routes/auth.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController'); // 引入控制器
const authMiddleware = require('../middleware/authMiddleware');
// @route   POST api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', authController.registerUser);

// @route   POST api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', authController.loginUser);

// (可选) 可能还需要一个获取当前用户信息的路由，需要认证
// const authMiddleware = require('../middleware/authMiddleware'); // 稍后创建
 router.get('/me', authMiddleware, authController.getMe);

module.exports = router;