// server/routes/friendRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { getFriends, addFriend, removeFriend, searchUsers, moveFriendToGroup } = require('../controllers/friendController');

router.use(authMiddleware); // 应用认证

router.get('/', getFriends);
router.get('/search', searchUsers);
router.post('/', addFriend);
router.delete('/:friendId', removeFriend);
router.put('/:friendId/group', moveFriendToGroup); // 确认移动分组路由

module.exports = router;