// server/models/Message.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false, index: true },
    roomId: { type: String, required: false, index: true },
    isPrivate: { type: Boolean, default: false, required: true, index: true },
    messageType: { type: String, required: true }, // 'text', 'image', 'video', 'file'
    content: { type: String, trim: true },
    fileUrl: { type: String },
    mimeType: { type: String },
    originalFilename: { type: String },
}, { timestamps: true });

// 复合索引优化私聊查询
messageSchema.index({ sender: 1, recipient: 1, isPrivate: 1, timestamp: -1 });
messageSchema.index({ recipient: 1, sender: 1, isPrivate: 1, timestamp: -1 });
// 群聊索引（如果使用）
messageSchema.index({ roomId: 1, isPrivate: 1, timestamp: -1 });

module.exports = mongoose.model('Message', messageSchema);