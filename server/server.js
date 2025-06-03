// server/server.js (最终完整版)
console.log("JWT_SECRET:", process.env.JWT_SECRET);
require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const connectDB = require('./config/db');
const authRouter = require("./routes/auth");
const friendRouter = require("./routes/friendRoutes"); // 引入好友路由
const Message = require("./models/Message");
const jwt = require("jsonwebtoken");
const User = require("./models/User");
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const authMiddleware = require('./middleware/authMiddleware');
const messageRouter = require("./routes/messageRoutes");
connectDB();

const app = express();
app.use(cors());
app.use(express.json());
require("dotenv").config();

// --- API 路由 ---
app.use('/api/auth', authRouter);
app.use('/api/friends', friendRouter); // 使用好友路由
app.use('/api/message', messageRouter);
// --- 文件上传 ---
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)){ fs.mkdirSync(uploadDir); console.log(`创建上传目录: ${uploadDir}`); }
const storage = multer.diskStorage({ destination: (req, file, cb) => cb(null, uploadDir + '/'), filename: (req, file, cb) => { const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9); cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname)); } });
const upload = multer({ storage: storage, limits: { fileSize: 1024 * 1024 * 50 } });
// 考虑添加 authMiddleware 保护上传接口
app.post('/api/upload', upload.single('file'), (req, res) => {
    console.log("[/api/upload] 收到请求");
    if (!req.file) { console.error("[/api/upload] 错误：未收到文件"); return res.status(400).json({ msg: '没有文件被上传。' }); }
    console.log("[/api/upload] Multer 处理成功:", req.file.filename);
    const fileUrl = `${req.protocol}://${req.get('host')}/${uploadDir}/${req.file.filename}`;
    res.json({ url: fileUrl, mimeType: req.file.mimetype }); // 只返回必需信息
});
app.use(`/${uploadDir}`, express.static(path.join(__dirname, uploadDir)));
// ----------------

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: ["http://localhost:3000"], methods: ["GET", "POST"] } });

app.get("/", (req, res) => { res.send("Chat Server is running!"); });

// --- 用户 Socket 映射 ---
const userSockets = new Map(); // userId(string) -> Set<socketId(string)>
const socketUsers = new Map(); // socketId(string) -> userId(string)
// ---------------------------

// --- Socket.IO 认证中间件 ---
io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth.token;
        if (!token) return next(new Error('认证错误: 没有提供 token'));
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.user.id).select('-password'); // 不再 populate friends
        if (!user) return next(new Error('认证错误: 用户未找到'));
        socket.user = user; // 附加基础用户信息
        console.log(`[Auth Middleware] Socket authenticated for user: ${user.username} (ID: ${user.id})`);
        next();
    } catch (err) { console.error("Socket 认证错误:", err.message); next(new Error('认证错误')); }
});

// --- 辅助函数：通知好友状态更新 ---
const notifyFriendStatus = async (userId, isOnline, ioInstance) => {
    const userIdStr = userId.toString();
    console.log(`[Notify Status] 开始通知用户 [${userIdStr}] 的好友状态 (状态: ${isOnline ? '在线' : '离线'})`);
    try {
        const userWithFriends = await User.findById(userIdStr).select('friends'); // 查询好友列表
        if (!userWithFriends?.friends?.length) { console.log(`[Notify Status] 用户 [${userIdStr}] 没有好友需要通知。`); return; }
        const friendIds = userWithFriends.friends.map(f => f.friend.toString());
        console.log(`[Notify Status] 用户 [${userIdStr}] 的好友 IDs:`, friendIds);
        friendIds.forEach(friendIdStr => {
            const friendSocketIds = userSockets.get(friendIdStr);
            if (friendSocketIds?.size > 0) {
                friendSocketIds.forEach(socketId => {
                    ioInstance.to(socketId).emit('friendStatusUpdate', { userId: userIdStr, isOnline });
                    console.log(`  [Notify Status] 已发送状态更新给好友 [${friendIdStr}] (Socket: ${socketId})`);
                });
            }
        });
    } catch (error) { console.error(`[Notify Status] 通知好友状态时出错 (用户: ${userIdStr}):`, error); }
};

// --- WebSocket 连接处理 ---
io.on('connection', (socket) => {
    const userId = socket.user.id.toString();
    const username = socket.user.username;
    console.log(`[Connection] 用户 ${username} (${userId}) 使用 Socket ID: ${socket.id} 连接成功`);

    // 管理用户 Socket 映射
    let isFirstConnection = false;
    if (!userSockets.has(userId)) { userSockets.set(userId, new Set()); isFirstConnection = true; }
    userSockets.get(userId).add(socket.id);
    socketUsers.set(socket.id, userId);
    console.log(`[Connection] 当前在线用户数: ${userSockets.size}, Sockets:`, [...socketUsers.keys()].length);

    // 通知好友上线 (仅首次连接)
    if (isFirstConnection) {
        console.log(`[Connection] 用户 ${username} 首次连接，通知好友上线...`);
        notifyFriendStatus(userId, true, io); // 调用辅助函数
    }

    // 处理获取好友列表请求
    socket.on('getFriendList', async () => {
        console.log(`[getFriendList] 用户 ${username} 请求好友列表`);
        try {
            const userWithPopulatedFriends = await User.findById(userId).populate({ path: 'friends.friend', select: 'username _id' });
            if (!userWithPopulatedFriends) return socket.emit('friendListUpdate', []);
            const friendListWithStatusAndGroup = userWithPopulatedFriends.friends.map(f => { if (!f?.friend?._id) return null; const friendIdStr = f.friend._id.toString(); return { id: friendIdStr, username: f.friend.username, group: f.group || '默认分组', isOnline: userSockets.has(friendIdStr) }; }).filter(f => f !== null);
            socket.emit('friendListUpdate', friendListWithStatusAndGroup);
            console.log(`[getFriendList] 已发送好友列表给 ${username} (${friendListWithStatusAndGroup.length} 人)`);
        } catch(err) { console.error(`[getFriendList] Error for ${username}:`, err); socket.emit('friendListUpdate', []); }
    });

    // 处理获取私聊历史记录请求
    socket.on('getPrivateHistory', async ({ friendId }) => {
        if (!friendId) { console.warn(`[getPrivateHistory] 缺少 friendId`); return; }
        console.log(`[getPrivateHistory] ${username} (${userId}) 请求与 ${friendId} 的历史`);
        try {
            // 1. 按创建时间倒序查找最新的 50 条
            const messages = await Message.find({
                isPrivate: true,
                $or: [
                    { sender: userId, recipient: friendId },
                    { sender: friendId, recipient: userId }
                ]
            })
                .sort({ createdAt: -1 }) // 按创建时间倒序
                .limit(50)               // 限制最多 50 条
                .populate('sender', 'username _id'); // 填充发送者信息

            // 2. 反转数组，使得这 50 条中，最旧的在前面，符合聊天显示顺序
            const sortedHistory = messages.reverse();

            socket.emit('privateHistory', { friendId: friendId, history: sortedHistory });
            console.log(`[getPrivateHistory] 已发送 ${sortedHistory.length} 条记录 (与 ${friendId}) 给 ${username}`);
        } catch (error) {
            console.error(`[getPrivateHistory] 获取私聊记录出错 (${userId}<=>${friendId}):`, error);
            socket.emit('messageError', { error: '无法加载私聊记录' });
        }
    });

    // 处理发送消息
    socket.on('sendMessage', async (data) => {
        console.log("[sendMessage] 收到事件, data:", data);
        if (!data?.type) return socket.emit('messageError', { error: '无效的消息数据格式' });
        const isPrivate = !!data.recipientId; const recipientId = isPrivate ? data.recipientId.toString() : null;
        if (isPrivate && recipientId === userId) return socket.emit('messageError', { error: '不能给自己发送私聊消息' });
        let newMessageData = { sender: userId, messageType: data.type, isPrivate: isPrivate, recipient: recipientId, roomId: null, content: '', fileUrl: null, mimeType: null, originalFilename: null }; let logMessageType = '';
        if (data.type === 'text') { const msg = data.text?.trim(); if (!msg || msg.length > 500) return socket.emit('messageError', { error: '文本消息为空或过长' }); newMessageData.content = msg; logMessageType = '文本'; }
        else if (data.type === 'file') { if (!data.url || !data.mimeType) return socket.emit('messageError', { error: '文件消息缺少 url 或 mimeType' }); newMessageData.fileUrl = data.url; newMessageData.mimeType = data.mimeType; newMessageData.originalFilename = data.originalFilename; if (data.mimeType.startsWith('image/')) { newMessageData.messageType = 'image'; logMessageType = '图片'; } else if (data.mimeType.startsWith('video/')) { newMessageData.messageType = 'video'; logMessageType = '视频'; } else { newMessageData.messageType = 'file'; logMessageType = '文件'; } }
        else { return socket.emit('messageError', { error: '不支持的消息类型' }); }
        try { const newMessage = new Message(newMessageData); await newMessage.save(); console.log(`[sendMessage] ${logMessageType} 消息已保存 by ${username}`, newMessageData); const populatedMessage = await Message.findById(newMessage._id).populate('sender', 'username _id'); console.log("[sendMessage] 准备发送/广播:", populatedMessage); if (isPrivate) { logMessageType += ` 私聊 to ${recipientId}`; const senderSocketIds = userSockets.get(userId) || new Set(); const recipientSocketIds = userSockets.get(recipientId) || new Set(); const targetSocketIds = new Set([...senderSocketIds, ...recipientSocketIds]); if (targetSocketIds.size > 0) { targetSocketIds.forEach(socketId => { io.to(socketId).emit('receivePrivateMessage', populatedMessage); }); console.log(`[sendMessage] ${logMessageType} 消息 ${populatedMessage._id} 已发送给 ${targetSocketIds.size} sockets`); } else { console.log(`[sendMessage] 私聊消息 ${populatedMessage._id} 已保存, 但接收者 ${recipientId} 不在线`); } } else { logMessageType += " 公共"; io.emit('newMessage', populatedMessage); console.log(`[sendMessage] ${logMessageType} 消息 ${populatedMessage._id} 已广播`); } } catch (error) { console.error(`[sendMessage] 保存或发送 ${logMessageType} 消息时出错:`, error); socket.emit('messageError', { error: '处理消息失败。' }); }
    });
    socket.on('getPublicHistory', async () => {
        console.log(`[getPublicHistory] ${username} (${userId}) 请求公共历史`);
        try {
            // 1. 按创建时间倒序查找最新的 50 条公共消息
            const messages = await Message.find({ isPrivate: false })
                .sort({ createdAt: -1 }) // 按创建时间倒序
                .limit(50)               // 限制最多 50 条
                .populate('sender', 'username _id'); // 填充发送者信息

            // 2. 反转数组，使得这 50 条中，最旧的在前面
            const sortedHistory = messages.reverse();

            socket.emit('publicHistory', { history: sortedHistory }); // 使用新事件名
            console.log(`[getPublicHistory] 已发送 ${sortedHistory.length} 条公共记录给 ${username}`);
        } catch (error) {
            console.error(`[getPublicHistory] 获取公共记录出错 for ${username}:`, error);
            socket.emit('messageError', { error: '无法加载公共聊天记录' });
        }
    });
    // 处理断开连接
    socket.on('disconnect', (reason) => {
        const disconnectedUserId = socketUsers.get(socket.id);
        console.log(`[Disconnect] 用户 ${disconnectedUserId} 的连接 (${socket.id}) 断开, 原因: ${reason}`);
        if (disconnectedUserId) {
            const userSocketSet = userSockets.get(disconnectedUserId);
            if (userSocketSet) {
                userSocketSet.delete(socket.id);
                if (userSocketSet.size === 0) {
                    userSockets.delete(disconnectedUserId); // 从在线映射中移除
                    console.log(`[Disconnect] 用户 ${disconnectedUserId} 所有连接已断开.`);
                    notifyFriendStatus(disconnectedUserId, false, io); // 通知好友下线
                }
            }
        }
        socketUsers.delete(socket.id); // 清理反向映射
        console.log(`[Disconnect] 断开连接后在线用户数: ${userSockets.size}`);
    });

    // 处理 Socket 错误
    socket.on('error', (err) => { console.error(`[Socket Error] 用户 ${socket.user?.username} (${socket.id}):`, err); });

}); // io.on('connection', ...) 结束

const PORT = process.env.PORT || 5000;

server.listen(PORT, '::', () => {
    console.log(`HTTP Server listening on port ${PORT} for ALL IPv4/IPv6 addresses`);
    const address = server.address(); // 获取监听的详细信息
    if (address) {
        console.log(`Server accessible at: http://[${address.address}]:${address.port}`); // 注意 address.address 可能显示 ::
    }
});
