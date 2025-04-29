// server/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // 引入用户模型

module.exports = async function (req, res, next) {
    console.log("[中间件] 收到请求:", req.method, req.originalUrl);
    const authHeader = req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn("[中间件] 警告: No token or invalid format");
        return res.status(401).json({ msg: 'No token or invalid format, authorization denied' });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
        console.warn("[中间件] 警告: No token found after Bearer");
        return res.status(401).json({ msg: 'No token found after Bearer, authorization denied' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log("[中间件] Token decoded:", decoded);

        // 验证数据库中用户是否存在
        const userExists = await User.findById(decoded.user.id).select('_id');
        if (!userExists) {
            console.warn("[中间件] 警告: Token user not found in DB:", decoded.user.id);
            return res.status(401).json({ msg: 'Token user not found, authorization denied' });
        }

        req.user = decoded.user; // 附加 { id: '...' } 到请求对象
        console.log("[中间件] Token 验证通过, req.user:", req.user);
        next();

    } catch (err) {
        console.error('[中间件] Token 验证失败:', err.message);
        if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({ msg: 'Token is not valid' });
        }
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ msg: 'Token has expired' });
        }
        // 返回 401 更合适，因为是认证问题
        res.status(401).json({ msg: 'Token verification failed' });
    }
};