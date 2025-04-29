// server/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // 引入用户模型用于验证用户是否存在

module.exports = async function (req, res, next) {
    // 1. 从请求头获取 token
    const token = req.header('Authorization'); // 通常格式是 "Bearer <token>"

    // 2. 检查 token 是否存在
    if (!token) {
        return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    // 3. 验证 token
    try {
        // Bearer token 需要提取实际的 token 部分
        const tokenValue = token.split(' ')[1]; // "Bearer <token>" -> "<token>"
        if (!tokenValue) {
            return res.status(401).json({ msg: 'Token format is invalid' });
        }

        // 使用密钥验证 token
        const decoded = jwt.verify(tokenValue, process.env.JWT_SECRET);

        // (可选但推荐) 检查解码出的用户 ID 是否在数据库中真实存在
        const userExists = await User.findById(decoded.user.id);
        if (!userExists) {
            return res.status(401).json({ msg: 'Token user not found, authorization denied' });
        }

        // 4. 将解码后的用户信息附加到请求对象上
        req.user = decoded.user; // decoded.user 应该包含 { id: '...' } 等信息
        // console.log('Token verified, user:', req.user);
        next(); // Token 有效，放行，继续处理请求

    } catch (err) {
        console.error('Token verification failed:', err.message);
        if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({ msg: 'Token is not valid' });
        }
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ msg: 'Token has expired' });
        }
        res.status(500).json({ msg: 'Server Error during token verification' });
    }
};