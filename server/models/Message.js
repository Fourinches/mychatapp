// models/Message.js
const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // 关联到 User 模型
        required: true,
    },
    messageType: { // 使用新字段区分类型
        type: String,
        enum: ['text', 'image', 'video', 'file'], // 添加可能的文件类型
        required: true,
        default: 'text',
    },
    content: { // 文本内容，对于文件消息可以为空
        type: String,
        // 不再强制要求，因为文件消息没有文本内容
        // required: function() { return this.messageType === 'text'; }
    },
    fileUrl: { // 存储文件的可访问 URL
        type: String,
        // required: function() { return this.messageType !== 'text'; } // 文件消息必需
    },
    mimeType: { // 存储文件的 MIME 类型 (e.g., 'image/jpeg', 'video/mp4')
        type: String,
        // required: function() { return this.messageType !== 'text'; } // 文件消息必需
    },
    // 你之前的 schema 没有 timestamps: true，所以我们保留手动 default
    timestamp: {
        type: Date,
        default: Date.now,
    },
    // 注意：你之前的 schema 只有一个 contentType 字段，我们现在用 messageType, fileUrl, mimeType 替代它和 content 的部分功能
}, { timestamps: true }); // 推荐添加 timestamps: true 自动管理 createdAt/updatedAt

module.exports = mongoose.model('Message', MessageSchema);