// server/models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    // --- 确认 friends 字段结构 ---
    friends: [{
        _id: false, // 不需要为这个子文档生成单独的 _id
        friend: { // 好友的用户 ID
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',

        },
        group: { // 好友所属分组
            type: String,
            default: '默认分组',
            required: true,
            trim: true
        }
    }]
    // -------------------------
});

// 索引可以帮助快速查找某个用户是否在好友列表的 friend 字段中
userSchema.index({ 'friends.friend': 1 });

module.exports = mongoose.model('User', userSchema);