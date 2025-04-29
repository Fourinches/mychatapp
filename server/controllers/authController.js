const User = require('../models/User'); // 引入 User 模型
const bcrypt = require('bcryptjs');     // 用于密码哈希
const jwt = require('jsonwebtoken');   // 用于生成 JWT

// 注册用户逻辑
exports.registerUser = async (req, res) => {
    const { username, email, password } = req.body;

    try {
        // 1. 检查用户或邮箱是否已存在
        let user = await User.findOne({ $or: [{ email }, { username }] });
        if (user) {
            return res.status(400).json({ msg: 'User or Email already exists' });
        }

        // 2. 创建新用户实例 (密码还没哈希)
        user = new User({
            username,
            email,
            password, // 原始密码
        });

        // 3. 哈希密码
        const salt = await bcrypt.genSalt(10); // 生成 salt
        user.password = await bcrypt.hash(password, salt); // 哈希处理

        // 4. 保存用户到数据库
        await user.save();

        // 5. (可选) 直接为新注册用户生成 Token 并返回，实现注册后自动登录
        const payload = {
            user: {
                id: user.id, // 使用数据库生成的 ID
                // 可以添加 username 等信息，但不建议放敏感信息
            },
        };

        jwt.sign(
            payload,
            process.env.JWT_SECRET, // 从 .env 文件读取密钥
            { expiresIn: '1h' },    // Token 有效期 (例如 1 小时)
            (err, token) => {
                if (err) throw err;
                res.status(201).json({ token }); // 返回 Token
            }
        );

        // 或者仅返回成功消息
        // res.status(201).json({ msg: 'User registered successfully' });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// 登录用户逻辑
exports.loginUser = async (req, res) => {
    const { email, password } = req.body; // 或使用 username 登录

    try {
        // 1. 查找用户
        let user = await User.findOne({ email }); // 按邮箱查找
        if (!user) {
            return res.status(400).json({ msg: 'Invalid Credentials' }); // 不要提示用户不存在，统一说凭证无效
        }

        // 2. 比较密码
        const isMatch = await bcrypt.compare(password, user.password); // 比较输入密码和数据库哈希
        if (!isMatch) {
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }

        // 3. 密码匹配，生成 JWT
        const payload = {
            user: {
                id: user.id,
                username: user.username // 可以包含用户名
            },
        };

        jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '1h' }, // 保持和注册一致或根据需要调整
            (err, token) => {
                if (err) throw err;
                res.json({ token }); // 登录成功，返回 Token
            }
        );

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};
exports.getMe = async (req, res) => {
    try {
        // authMiddleware 应该已经验证了 token，并将 user id 放在 req.user.id 中
        if (!req.user || !req.user.id) {
            // 理论上中间件会处理，但这里加个保险检查
            console.error('错误: 在 getMe 控制器中，req.user.id 缺失。');
            return res.status(401).json({ msg: '认证错误，请求中未找到用户ID' });
        }

        // 根据中间件附加的 user id 从数据库查找用户信息
        // 使用 .select('-password') 来排除密码字段，确保不将密码哈希发送回前端
        const user = await User.findById(req.user.id).select('-password');

        if (!user) {
            // 即使 token 有效，用户也可能在 token 过期前被删除了
            return res.status(404).json({ msg: '用户未找到' });
        }

        // 成功找到用户，返回用户信息 (不含密码)
        res.json(user);

    } catch (err) {
        console.error('获取用户信息时服务器出错:', err.message);
        res.status(500).send('服务器错误');
    }
};