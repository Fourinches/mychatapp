// server/controllers/friendController.js (完整版 - 包含 addFriend 修复)
const User = require('../models/User');

// 获取好友列表 (包含分组)
exports.getFriends = async (req, res) => {
    console.log("[GetFriends] 用户", req.user?.id, "请求好友列表");
    try {
        const user = await User.findById(req.user.id)
            .populate({ path: 'friends.friend', select: 'username _id' }); // 填充好友信息
        if (!user) {
            console.warn("[GetFriends] 用户未找到:", req.user?.id);
            return res.status(404).json({ msg: '用户未找到' });
        }
        const friendsWithGroups = user.friends.map(f =>
            f?.friend?._id ? { id: f.friend._id, username: f.friend.username, group: f.group || '默认分组' } : null
        ).filter(f => f !== null);
        console.log("[GetFriends] 返回好友列表:", friendsWithGroups.length, "人");
        res.json(friendsWithGroups);
    } catch (err) {
        console.error("[GetFriends] 获取好友列表错误:", err.message);
        res.status(500).send('服务器错误');
    }
};

// 搜索用户 (排除自己和好友)
exports.searchUsers = async (req, res) => {
    console.log("[SearchUsers] 用户", req.user?.id, "搜索:", req.query.query);
    try {
        const query = req.query.query?.trim() || '';
        if (!query) return res.json([]);
        const currentUser = await User.findById(req.user.id).select('friends'); // 只需 friends 字段
        if (!currentUser) {
            console.warn("[SearchUsers] 当前用户未找到:", req.user?.id);
            return res.status(404).json({ msg: '当前用户未找到' });
        }
        const friendIds = currentUser.friends.map(f => f.friend); // 获取好友 ID 列表
        console.log(`[SearchUsers] 排除好友 IDs:`, friendIds);
        const users = await User.find({
            username: { $regex: query, $options: 'i' },
            _id: { $ne: req.user.id, $nin: friendIds }
        }).limit(10).select('username _id');
        console.log("[SearchUsers] 搜索结果:", users);
        res.json(users);
    } catch (err) {
        console.error("[SearchUsers] 搜索用户错误:", err.message);
        res.status(500).send('服务器错误');
    }
};

// 添加好友 (修正检查好友是否存在的方式)
exports.addFriend = async (req, res) => {
    console.log("[后端 addFriend] 收到添加好友请求");
    try {
        const friendId = req.body.friendId;
        console.log("[后端 addFriend] 请求体中的 friendId:", friendId);
        if (!req.user?.id) { // 检查当前用户 ID 是否存在
            console.error("[后端 addFriend] 错误: 未经认证的用户尝试添加好友");
            return res.status(401).json({ msg: '未认证，无法获取当前用户ID' });
        }
        console.log("[后端 addFriend] 当前用户 req.user.id:", req.user.id);

        if (!friendId || friendId === req.user.id.toString()) {
            console.log("[后端 addFriend] 验证失败: 无效ID或添加自己");
            return res.status(400).json({ msg: '无效的好友ID或不能添加自己' });
        }

        // 使用 Promise.all 并行查找用户
        const [currentUser, friendUser] = await Promise.all([
            User.findById(req.user.id),
            User.findById(friendId)
        ]);
        console.log("[后端 addFriend] 查找用户结果: currentUser?", !!currentUser, "friendUser?", !!friendUser);

        if (!currentUser || !friendUser) {
            console.log("[后端 addFriend] 用户未找到");
            return res.status(404).json({ msg: '用户未找到' });
        }

        // *** 修正点：增加健壮性检查 ***
        const alreadyFriends = currentUser.friends && Array.isArray(currentUser.friends) && currentUser.friends.some(f =>
                f && f.friend && typeof f.friend.equals === 'function' && f.friend.equals(friendId)
            // 1. 确保 friends 是数组
            // 2. 确保 f 存在
            // 3. 确保 f.friend 存在
            // 4. 确保 f.friend 有 equals 方法
            // 5. 调用 equals 比较
        );
        // *****************************

        console.log("[后端 addFriend] 是否已是好友?", alreadyFriends);
        if (alreadyFriends) {
            return res.status(400).json({ msg: '你们已经是好友了' });
        }

        // 添加好友
        const defaultGroup = '默认分组';
        // 确保 push 的结构正确
        currentUser.friends.push({ friend: friendUser._id, group: defaultGroup });
        friendUser.friends.push({ friend: currentUser._id, group: defaultGroup });
        console.log("[后端 addFriend] 准备保存数据库...");

        await Promise.all([currentUser.save(), friendUser.save()]); // 并行保存
        console.log(`[后端 addFriend] 用户 ${currentUser.username} 添加了好友 ${friendUser.username} - 保存成功`);

        res.status(201).json({ msg: '好友添加成功', friend: { _id: friendUser._id, username: friendUser.username, group: defaultGroup } });

    } catch (err) {
        console.error("[后端 addFriend] 添加好友时出错:", err);
        if (err.name === 'CastError' && err.path === '_id') {
            return res.status(400).json({ msg: '提供的用户ID格式无效' });
        }
        res.status(500).send('服务器错误');
    }
};

// 删除好友 (修正过滤逻辑)
exports.removeFriend = async (req, res) => {
    console.log("[RemoveFriend] 用户", req.user?.id, "尝试移除好友:", req.params.friendId);
    try {
        const friendId = req.params.friendId;
        if (!friendId) return res.status(400).json({ msg: '缺少好友ID' });
        if (!req.user?.id) return res.status(401).json({ msg: '未认证' });

        const currentUser = await User.findById(req.user.id);
        if (!currentUser) return res.status(404).json({ msg: '当前用户未找到' });

        // *** 修正过滤逻辑 ***
        const initialLength = currentUser.friends.length;
        currentUser.friends = currentUser.friends.filter(f => f?.friend?.toString() !== friendId); // 增加健壮性检查
        const changed = currentUser.friends.length !== initialLength;
        // ------------------

        const friendUser = await User.findById(friendId);
        if (friendUser) {
            // *** 修正过滤逻辑 ***
            friendUser.friends = friendUser.friends.filter(f => f?.friend?.toString() !== req.user.id); // 增加健壮性检查
            await friendUser.save();
        }

        if (changed) await currentUser.save();
        console.log(`[RemoveFriend] 用户 ${currentUser.username} 移除了好友 ${friendId}`);

        res.json({ msg: '好友移除成功', removedFriendId: friendId });
        // --- TODO: WebSocket 通知 ---

    } catch (err) {
        console.error("[RemoveFriend] 移除好友错误:", err.message);
        if (err.name === 'CastError') return res.status(400).json({ msg: '无效的好友ID格式' });
        res.status(500).send('服务器错误');
    }
};

// 移动好友到分组 (确认逻辑)
exports.moveFriendToGroup = async (req, res) => {
    console.log("[MoveGroup] 用户", req.user?.id, "移动好友:", req.params.friendId, "到分组:", req.body.group);
    try {
        const friendId = req.params.friendId;
        const { group } = req.body;
        if (!friendId || group === undefined || group.trim() === '') return res.status(400).json({ msg: '缺少好友ID或分组名称' });
        if (!req.user?.id) return res.status(401).json({ msg: '未认证' });
        const newGroupName = group.trim();

        const currentUser = await User.findById(req.user.id);
        if (!currentUser) return res.status(404).json({ msg: '当前用户未找到' });

        // 使用 findIndex 和 equals 进行比较
        const friendIndex = currentUser.friends.findIndex(f => f?.friend?.equals(friendId)); // 增加健壮性检查

        if (friendIndex === -1) {
            console.log("[MoveGroup] 未在好友列表中找到:", friendId);
            return res.status(404).json({ msg: '未找到该好友' });
        }

        console.log(`[MoveGroup] 找到好友索引: ${friendIndex}, 旧分组: ${currentUser.friends[friendIndex].group}, 新分组: ${newGroupName}`);
        currentUser.friends[friendIndex].group = newGroupName;
        currentUser.markModified('friends'); // 标记数组已修改
        await currentUser.save();
        console.log(`[MoveGroup] 用户 ${currentUser.username} 将好友 ${friendId} 移动到分组 ${newGroupName} - 保存成功`);

        res.json({ msg: `好友已移动到分组 '${newGroupName}'`, friendId: friendId, newGroup: newGroupName });
        // --- TODO: WebSocket 通知 ---

    } catch (err) {
        console.error("[MoveGroup] 移动好友分组错误:", err.message);
        if (err.name === 'CastError') return res.status(400).json({ msg: '无效的好友ID格式' });
        res.status(500).send('服务器错误');
    }
};