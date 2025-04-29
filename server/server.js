require("dotenv").config(); // 首先加载环境变量
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const connectDB = require('./config/db'); // 数据库连接文件
const authRouter = require("./routes/auth"); // 认证路由
const Message = require("./models/Message");   // 消息模型
const jwt = require("jsonwebtoken");
const User = require("./models/User");       // 用户模型

connectDB(); // 连接数据库

const app = express();
app.use(cors()); // 允许跨域
app.use(express.json()); // 解析 JSON 请求体
app.use('/api/auth', authRouter); // 使用认证路由

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000", // 允许你的 React 前端访问
        methods: ["GET", "POST"],
    },
});

// 基本的根路由，确认服务器运行
app.get("/", (req, res) => {
    res.send("Chat Server is running!");
});

// Socket.IO 认证中间件
io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth.token;
        if (!token) {
            console.log("Socket Auth Error: No token provided");
            return next(new Error('Authentication error: No token provided'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.user.id).select('-password');
        if (!user) {
            console.log("Socket Auth Error: User not found for token");
            return next(new Error('Authentication error: User not found'));
        }

        socket.user = user; // 将用户信息附加到 socket
        console.log(`Socket authenticated for user: ${user.username} (ID: ${user.id})`);
        next(); // 认证成功

    } catch (err) {
        console.error("Socket Auth Error:", err.message);
        let errMsg = 'Authentication error';
        if (err.name === 'JsonWebTokenError') errMsg = 'Authentication error: Invalid token';
        if (err.name === 'TokenExpiredError') errMsg = 'Authentication error: Token expired';
        next(new Error(errMsg)); // 认证失败
    }
});

// --- WebSocket 连接处理 ---
io.on('connection', async (socket) => { // <--- 设为 async 以便使用 await
    console.log(`用户 ${socket.user.username} (${socket.id}) 连接成功`);

    // --- 新增：发送历史消息给刚连接的用户 ---
    try {
        // 查询数据库中最近的 N 条消息 (例如最近 50 条)
        const messageHistory = await Message.find()
            .sort({ timestamp: -1 }) // 1. 按时间戳降序获取最新的
            .limit(50)               // 2. 限制数量
            .populate('sender', 'username _id') // 3. 填充发送者信息
            .sort({ timestamp: 1 }); // 4. 结果反转为升序 (旧->新)，方便前端显示

        // 使用 socket.emit 只发送给当前连接的这个 socket
        socket.emit('loadHistory', messageHistory);
        console.log(`已发送 ${messageHistory.length} 条历史消息给 ${socket.user.username}`);

    } catch (error) {
        console.error(`获取或发送历史消息给 ${socket.user.username} 时出错:`, error);
        // 可以在此向客户端发送错误事件，如果需要的话
        // socket.emit('historyError', { error: 'Failed to load message history.' });
    }
    // --- 结束新增部分 ---


    // --- 监听客户端的 'sendMessage' 事件 ---
    socket.on('sendMessage', async (data) => {
        const messageContent = data.text?.trim(); // 获取并清理文本

        if (!messageContent) {
            return socket.emit('messageError', { error: 'Cannot send empty message' });
        }
        if (messageContent.length > 500) { // 示例长度限制
            return socket.emit('messageError', { error: 'Message is too long' });
        }

        try {
            // 创建并保存消息到数据库
            const newMessage = new Message({
                sender: socket.user.id, // 从认证中间件获取 ID
                contentType: 'text',
                content: messageContent,
                // timestamp 字段通常由 Mongoose 自动添加 (如果 schema 中定义了 timestamps: true)
                // 或者在 new Message 时手动设置: timestamp: new Date()
            });
            await newMessage.save();
            console.log(`消息已保存: ${newMessage.content} by ${socket.user.username}`);

            // 填充发送者信息以便广播
            const populatedMessage = await Message.findById(newMessage._id)
                .populate('sender', 'username _id'); // 只填充需要的字段

            // 使用 io.emit 广播给所有连接的客户端
            io.emit('newMessage', populatedMessage);
            console.log(`消息 ${populatedMessage._id} 已广播`);

        } catch (error) {
            console.error('保存或广播消息时出错:', error);
            socket.emit('messageError', { error: 'Failed to send message due to server error.' });
        }
    });

    // --- 处理客户端断开连接 ---
    socket.on('disconnect', () => {
        // 检查 socket.user 是否存在，因为断开连接时可能认证已失败或未完成
        if (socket.user) {
            console.log(`用户 ${socket.user.username} (${socket.id}) 断开`);
            // 可以在这里广播用户离开的消息（如果需要）
            // io.emit('userLeft', { username: socket.user.username, id: socket.user.id });
        } else {
            console.log(`一个未认证的 socket (${socket.id}) 断开`);
        }
    });

    // 可选：处理基本的 socket 错误
    socket.on('error', (err) => {
        console.error(`Socket 错误 (${socket.user?.username || socket.id}):`, err.message);
    });

}); // io.on('connection', ...) 结束

const PORT = process.env.PORT || 5000; // 使用环境变量或默认 5000

server.listen(PORT, () => console.log(`服务器正在端口 ${PORT} 上运行`));