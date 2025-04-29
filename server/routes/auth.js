// server/routes/auth.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware'); // 引入中间件

// @route   POST api/auth/register
// @desc    Register user
// @access  Public
router.post('/register', authController.registerUser);

// @route   POST api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', authController.loginUser);

// @route   GET api/auth/me
// @desc    Get current user info (protected)
// @access  Private
router.get('/me', authMiddleware, authController.getMe); // 应用中间件保护此路由

module.exports = router;