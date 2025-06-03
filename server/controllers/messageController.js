// server/controllers/messageController.js
const Message = require('../models/Message');
const User = require('../models/User'); // 可能需要用于获取用户名

// 格式化单条消息为文本行
const formatMessageToText = (msg) => {
    if (!msg) return '';
    const timestamp = new Date(msg.timestamp || msg.createdAt).toLocaleString('zh-CN'); // 本地化时间格式
    const sender = msg.sender?.username || '未知用户';
    let content = '';
    switch (msg.messageType) {
        case 'text':
            content = msg.content;
            break;
        case 'image':
            content = `[图片] ${msg.originalFilename || msg.fileUrl}`;
            break;
        case 'video':
            content = `[视频] ${msg.originalFilename || msg.fileUrl}`;
            break;
        case 'file':
            content = `[文件] ${msg.originalFilename || msg.fileUrl}`;
            break;
        default:
            content = '[未知类型消息]';
    }
    return `[${timestamp}] ${sender}: ${content}`;
};

// 下载聊天记录控制器
exports.downloadHistory = async (req, res) => {
    const userId = req.user.id; // 来自 authMiddleware
    const { chatType, targetId } = req.query; // 从查询参数获取聊天类型和目标ID

    console.log(`[Download History] 用户 ${userId} 请求下载记录: 类型=${chatType}, 目标ID=${targetId}`);

    if (!chatType) {
        return res.status(400).json({ msg: '缺少 chatType 查询参数' });
    }
    // 私聊必须提供 targetId
    if (chatType === 'private' && !targetId) {
        return res.status(400).json({ msg: '私聊记录下载需要 targetId (好友ID)' });
    }

    try {
        let query = {};
        let filename = 'chat_history';
        let targetUsername = '';

        if (chatType === 'public') {
            query = { isPrivate: false, roomId: null }; // 查询公共聊天记录
            filename = 'public_chat_history.txt';
        } else if (chatType === 'private') {
            query = {
                isPrivate: true,
                $or: [ // 查询双方的消息
                    { sender: userId, recipient: targetId },
                    { sender: targetId, recipient: userId }
                ]
            };
            // 尝试获取好友用户名用于文件名
            const friend = await User.findById(targetId).select('username');
            targetUsername = friend ? friend.username : targetId;
            filename = `chat_with_${targetUsername}.txt`;
        } else {
            return res.status(400).json({ msg: '无效的 chatType' });
        }

        console.log("[Download History] 查询数据库条件:", query);
        // 查询所有相关消息，按时间正序排列
        const messages = await Message.find(query)
            .sort({ timestamp: 1 }) // 时间正序
            .populate('sender', 'username'); // 填充发送者用户名

        console.log(`[Download History] 查询到 ${messages.length} 条记录`);

        // 格式化消息为纯文本
        const formattedHistory = messages.map(formatMessageToText).join('\n'); // 每条消息占一行

        // 设置响应头，提示浏览器下载文件
        res.setHeader('Content-Type', 'text/plain; charset=utf-8'); // 设为纯文本，UTF-8编码
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`); // 设置下载文件名，处理中文名

        // 发送格式化后的文本内容
        res.send(formattedHistory);

    } catch (error) {
        console.error("[Download History] 下载聊天记录时出错:", error);
        res.status(500).send('服务器错误');
    }
};