// server/controllers/authController.js
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// 注册
exports.registerUser = async (req, res) => {
    const { username, email, password } = req.body;
    console.log("[Register] 收到注册请求:", { username, email }); // 添加日志
    try {
        let user = await User.findOne({ $or: [{ email }, { username }] });
        if (user) {
            console.warn("[Register] 警告: 用户或邮箱已存在:", username, email);
            return res.status(400).json({ msg: 'User or Email already exists' });
        }
        user = new User({ username, email, password });
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        await user.save();
        console.log("[Register] 用户注册成功:", user.username, user.id);
        const payload = { user: { id: user.id } }; // 只包含 ID
        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' }, (err, token) => {
            if (err) throw err;
            console.log("[Register] 生成 Token 并返回");
            res.status(201).json({ token });
        });
    } catch (err) { console.error("[Register] 服务器错误:", err.message); res.status(500).send('Server Error'); }
};

// 登录
exports.loginUser = async (req, res) => {
    const { email, password } = req.body;
    console.log("[Login] 收到登录请求:", { email }); // 添加日志
    try {
        let user = await User.findOne({ email });
        if (!user) {
            console.warn("[Login] 警告: 邮箱未找到:", email);
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            console.warn("[Login] 警告: 密码不匹配:", email);
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }
        console.log("[Login] 用户登录成功:", user.username, user.id);
        const payload = { user: { id: user.id, username: user.username } }; // 包含用户名
        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' }, (err, token) => {
            if (err) throw err;
            console.log("[Login] 生成 Token 并返回");
            res.json({ token });
        });
    } catch (err) { console.error("[Login] 服务器错误:", err.message); res.status(500).send('Server Error'); }
};

// 获取当前用户信息
exports.getMe = async (req, res) => {
    console.log("[GetMe] 收到获取用户信息请求, 用户ID:", req.user?.id); // 添加日志
    try {
        if (!req.user?.id) {
            console.error('[GetMe] 错误: req.user.id 缺失');
            return res.status(401).json({ msg: '认证错误' });
        }
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            console.warn('[GetMe] 警告: 未找到用户:', req.user.id);
            return res.status(404).json({ msg: '用户未找到' });
        }
        console.log("[GetMe] 成功获取用户信息:", user.username);
        res.json(user);
    } catch (err) { console.error('[GetMe] 服务器错误:', err.message); res.status(500).send('服务器错误'); }
};