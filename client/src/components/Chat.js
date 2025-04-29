// client/src/components/Chat.js (完整版 - 包含好友、私聊、搜索修复、媒体状态修复)
import React, { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import setAuthToken from '../utils/setAuthToken';
import axios from 'axios';

// --- 配置 ---
const SOCKET_SERVER_URL = 'http://localhost:5000';
const MAX_FILE_SIZE_MB = 50;
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

function Chat() {
    // --- 基础状态 ---
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [error, setError] = useState('');
    const [isConnected, setIsConnected] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const [selectedFile, setSelectedFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [isUploading, setIsUploading] = useState(false);

    // --- 好友和聊天状态 ---
    const [friends, setFriends] = useState([]); // { id, username, isOnline, hasUnread }
    const [activeChat, setActiveChat] = useState({ type: 'public' }); // { type: 'public' } | { type: 'private', friendId, friendUsername }
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState([]); // { _id, username }
    const [isSearching, setIsSearching] = useState(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);

    // --- Refs and Hooks ---
    const socketRef = useRef(null);
    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const navigate = useNavigate();
    const activeChatRef = useRef(activeChat); // 使用 Ref 跟踪 activeChat

    // 更新 Ref 以便在回调中获取最新 activeChat
    useEffect(() => {
        activeChatRef.current = activeChat;
    }, [activeChat]);


    // --- 解码 Token 并设置用户 ---
    const decodeTokenAndSetUser = useCallback(() => {
        const token = localStorage.getItem('token');
        if (token) {
            try {
                const decoded = jwtDecode(token);
                if (decoded.user && decoded.user.id && decoded.user.username) {
                    console.log("Token 解码成功, 用户:", decoded.user.username);
                    setCurrentUser({ id: decoded.user.id, username: decoded.user.username });
                    setAuthToken(token); // 设置 Axios 默认请求头
                } else {
                    throw new Error("无效的 Token 格式");
                }
            } catch (decodeError) {
                console.error("解码 Token 失败:", decodeError);
                localStorage.removeItem('token');
                setAuthToken(null); // 清除 Axios 请求头
                navigate('/login');
            }
        } else {
            console.log("未找到 Token, 跳转到登录");
            navigate('/login');
        }
    }, [navigate]);


    // --- WebSocket 效果钩子 ---
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            navigate('/login');
            return;
        }

        // 确保 currentUser 存在后再连接
        if (!currentUser) {
            decodeTokenAndSetUser();
            return; // 等待 currentUser 更新后重新运行 effect
        }

        // 防止重复连接
        if (socketRef.current?.connected) {
            console.log("WebSocket 已连接，跳过重连");
            return;
        }
        // 清理可能存在的旧实例
        if (socketRef.current) {
            console.log("清理旧的 Socket 实例...");
            socketRef.current.disconnect();
        }

        console.log(`尝试连接 WebSocket (用户: ${currentUser.username})...`);
        const socket = io(SOCKET_SERVER_URL, { auth: { token: token } });
        socketRef.current = socket;

        // --- 事件处理函数定义 ---
        const handleConnect = () => {
            setIsConnected(true);
            setError('');
            console.log('WebSocket 已连接, Socket ID:', socket.id);
            console.log('请求初始好友列表...');
            socket.emit('getFriendList'); // 连接成功后请求好友列表
            // 根据当前的 activeChat 处理初始状态
            if (activeChatRef.current.type === 'public') {
                console.log("连接成功，当前为公共聊天。");
                setMessages([]); // 清空可能残留的消息
                setIsLoadingHistory(false);
            } else if (activeChatRef.current.type === 'private') {
                console.log(`重连时仍在私聊 (${activeChatRef.current.friendUsername}), 请求历史...`);
                setIsLoadingHistory(true);
                socket.emit('getPrivateHistory', { friendId: activeChatRef.current.friendId });
            }
        };

        const handleDisconnect = (reason) => {
            setIsConnected(false);
            setActiveChat({ type: 'public' }); // 断开连接默认回到公共聊天
            setMessages([]);
            setFriends([]); // 清空好友列表
            if (reason === 'io server disconnect') { setError("服务器主动断开连接"); }
            else if (reason !== 'io client disconnect') { setError('连接已断开...'); } // 避免登出时显示错误
            console.log('WebSocket 已断开:', reason);
        };

        const handleConnectError = (err) => {
            setError(`连接失败: ${err.message}.`);
            setIsConnected(false);
            // 处理认证错误导致的连接失败
            if (err.message?.toLowerCase().includes('authentication error') || err.message === '认证错误') {
                localStorage.removeItem('token');
                setAuthToken(null);
                navigate('/login');
            }
            console.error('WebSocket 连接错误:', err.message);
        };

        // 好友列表更新
        const handleFriendListUpdate = (friendList) => {
            console.log("收到好友列表更新:", friendList);
            // 合并未读状态，避免列表刷新时丢失未读提示
            setFriends(prevFriends => {
                const unreadMap = new Map(prevFriends.filter(f => f.hasUnread).map(f => [f.id, true]));
                return friendList.map(f => ({ ...f, hasUnread: unreadMap.get(f.id) || false }));
            });
        };

        // 好友在线状态更新
        const handleFriendStatusUpdate = ({ userId, isOnline }) => {
            console.log(`好友状态更新: 用户 ${userId} ${isOnline ? '上线' : '下线'}`);
            setFriends(prevFriends =>
                prevFriends.map(friend =>
                    friend.id === userId ? { ...friend, isOnline } : friend
                )
            );
        };

        // 处理私聊历史记录
        const handlePrivateHistory = ({ friendId, history }) => {
            console.log(`收到 ${friendId} 的私聊历史，当前激活聊天:`, activeChatRef.current);
            // 使用 Ref 来比较，确保比较的是最新的 activeChat
            if (activeChatRef.current.type === 'private' && activeChatRef.current.friendId === friendId && Array.isArray(history)) {
                console.log(`加载与 ${activeChatRef.current.friendUsername} 的历史: ${history.length} 条`);
                setMessages(history);
            } else {
                console.log(`忽略来自 ${friendId} 的历史记录，因为当前激活聊天不匹配。`);
            }
            setIsLoadingHistory(false); // 无论如何结束加载状态
        };

        // 处理公共消息 (如果后端还发送的话)
        const handleNewMessage = (message) => {
            console.log("收到公共消息:", message?.content);
            if (activeChatRef.current.type === 'public') { // 使用 Ref
                setMessages((prev) => [...prev, message]);
            } else {
                console.log("收到公共消息，但当前不在公共聊天。");
                // 可以考虑增加公共频道的未读提示
            }
        };

        // 处理收到的私聊消息
        const handleReceivePrivateMessage = (message) => {
            console.log(`收到来自 ${message.sender?.username} 的私聊:`, message?.content);
            if (!currentUser) return; // 确保 currentUser 存在
            // 确定好友 ID (消息可能是自己发的，也可能是对方发的)
            const friendId = message.sender?._id === currentUser.id ? message.recipient : message.sender?._id;
            if (!friendId) {
                console.warn("无法确定私聊消息的好友 ID:", message);
                return;
            }

            // 如果当前正在和该好友聊天，直接添加到消息列表并清除未读
            if (activeChatRef.current.type === 'private' && activeChatRef.current.friendId === friendId) {
                setMessages((prev) => [...prev, message]);
                setFriends(prevFriends =>
                    prevFriends.map(f =>
                        f.id === friendId ? { ...f, hasUnread: false } : f
                    )
                );
            } else {
                // 如果不在当前聊天，标记为未读
                console.log(`收到来自 ${message.sender?.username} 的私聊，但当前不在该聊天。标记未读。`);
                setFriends(prevFriends =>
                    prevFriends.map(f =>
                        f.id === friendId ? { ...f, hasUnread: true } : f
                    )
                );
            }
        };

        // 处理消息错误
        const handleMessageError = (errorData) => {
            setError(`消息错误: ${errorData.error || '未知错误'}`);
            setTimeout(() => setError(''), 5000);
            console.error('收到消息错误:', errorData);
        };

        // --- 绑定监听器 ---
        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);
        socket.on('connect_error', handleConnectError);
        socket.on('friendListUpdate', handleFriendListUpdate);
        socket.on('friendStatusUpdate', handleFriendStatusUpdate);
        socket.on('privateHistory', handlePrivateHistory);
        socket.on('newMessage', handleNewMessage); // 监听公共消息
        socket.on('receivePrivateMessage', handleReceivePrivateMessage); // 监听私聊消息
        socket.on('messageError', handleMessageError);

        // --- 清理函数 ---
        return () => {
            console.log('组件卸载或依赖变化，清理 WebSocket 监听器并断开连接...');
            socket.off('connect', handleConnect);
            socket.off('disconnect', handleDisconnect);
            socket.off('connect_error', handleConnectError);
            socket.off('friendListUpdate', handleFriendListUpdate);
            socket.off('friendStatusUpdate', handleFriendStatusUpdate);
            socket.off('privateHistory', handlePrivateHistory);
            socket.off('newMessage', handleNewMessage);
            socket.off('receivePrivateMessage', handleReceivePrivateMessage);
            socket.off('messageError', handleMessageError);
            socket.disconnect();
            socketRef.current = null;
            setIsConnected(false);
            // 清理预览 URL (如果存在)
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
                console.log("清理预览 URL on unmount");
            }
        };
        // 依赖项：仅在用户身份变化时重新运行以建立新连接
    }, [navigate, decodeTokenAndSetUser, currentUser]);

    // --- 自动滚动 ---
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };
    useEffect(scrollToBottom, [messages]); // 依赖消息列表

    // --- 文件处理 ---
    const handleFileButtonClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setError('');
        // 文件类型和大小检查
        const isAllowedExtension = /\.(jpg|jpeg|png|gif|mp4|mov|webm|pdf|doc|docx)$/i.test(file.name);
        if (!ALLOWED_FILE_TYPES.includes(file.type) && !file.type.startsWith('image/') && !file.type.startsWith('video/') && !isAllowedExtension) {
            setError(`不支持的文件类型: ${file.type || file.name.split('.').pop()}`);
            setTimeout(() => setError(''), 5000);
            e.target.value = null; return;
        }
        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
            setError(`文件过大，最大 ${MAX_FILE_SIZE_MB}MB`);
            setTimeout(() => setError(''), 5000);
            e.target.value = null; return;
        }

        setSelectedFile(file);
        const objectUrl = URL.createObjectURL(file);
        setPreviewUrl(objectUrl);
        setNewMessage(''); // 选择文件后清空文本输入
        e.target.value = null; // 允许选择同名文件
        console.log("文件已选择:", file.name);
    };

    // 文件预览清理函数
    const handleCancelPreview = useCallback(() => {
        console.log("调用 handleCancelPreview 清理文件状态...");
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
            console.log("旧 previewUrl 已释放");
        }
        setSelectedFile(null);
        setPreviewUrl(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = null;
            console.log("文件 input 值已清空");
        }
        console.log("文件状态清理调用完成 (下次渲染生效)");
    }, [previewUrl]); // 依赖 previewUrl

    // --- 好友搜索 ---
    const handleSearchChange = (e) => {
        const term = e.target.value;
        console.log("好友搜索框输入:", term); // 添加日志确认事件触发
        setSearchTerm(term);
        if (term.trim().length > 1) {
            searchUsersAPI(term.trim());
        } else {
            setSearchResults([]);
        }
    };

    const searchUsersAPI = useCallback(async (query) => {
        if (isSearching) return;
        setIsSearching(true);
        setError('');
        console.log(`开始搜索用户: ${query}`);
        try {
            // 确认 Axios 请求头已设置 Token (通过 setAuthToken)
            const res = await axios.get(`/api/friends/search?query=${query}`);
            console.log("搜索结果:", res.data);
            setSearchResults(res.data || []);
        } catch (err) {
            console.error("搜索用户失败:", err.response?.data || err.message);
            setError(err.response?.data?.msg || '搜索用户失败');
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    }, [isSearching]);

    // --- 添加好友 ---
    const handleAddFriend = useCallback(async (friendId) => {
        setError('');
        console.log(`[前端] 尝试添加好友，ID: ${friendId}`); // <--- 日志 1
        try {
            console.log("[前端] 发送 POST 请求到 /api/friends"); // <--- 日志 2
            const res = await axios.post('/api/friends', { friendId });
            console.log('[前端] 添加好友 API 响应:', res.status, res.data); // <--- 日志 3
            const addedFriend = res.data.friend;
            if (addedFriend) {
                setFriends(prev => prev.some(f => f.id === addedFriend._id) ? prev : [...prev, { id: addedFriend._id, username: addedFriend.username, isOnline: false, hasUnread: false }]);
                console.log("[前端] 好友列表已乐观更新"); // <--- 日志 4
            }
            setSearchResults(prev => prev.filter(user => user._id !== friendId));
        } catch (err) {
            console.error("[前端] 添加好友失败:", err); // <--- 日志 5
            if (err.response) {
                console.error("[前端] 错误响应数据:", err.response.data); // <--- 日志 6
                setError(err.response.data?.msg || `添加失败 (${err.response.status})`);
            } else {
                setError('添加好友时发生网络或未知错误');
            }
            setTimeout(() => setError(''), 5000);
        }
    }, []);

    // --- 移除好友 ---
    const handleRemoveFriend = useCallback(async (friendId, friendUsername) => {
        if (!window.confirm(`确定要移除好友 ${friendUsername} 吗？`)) return;
        setError('');
        console.log(`尝试移除好友: ${friendId}`);
        try {
            await axios.delete(`/api/friends/${friendId}`);
            console.log('移除好友成功:', friendId);
            // 更新好友列表状态
            setFriends(prev => prev.filter(f => f.id !== friendId));
            // 如果当前正与该好友聊天，切换回公共聊天
            if (activeChatRef.current.type === 'private' && activeChatRef.current.friendId === friendId) {
                setActiveChat({ type: 'public' });
                setMessages([]); // 清空消息列表
            }
            // 如果后端没有 WebSocket 通知，则需要手动刷新列表
            // socketRef.current?.emit('getFriendList');
        } catch (err) {
            console.error("移除好友失败:", err.response?.data || err.message);
            setError(err.response?.data?.msg || '移除好友失败');
            setTimeout(() => setError(''), 5000);
        }
    }, []); // 移除依赖，内部使用 Ref

    // --- 切换聊天对象 ---
    const handleSelectChat = useCallback((chatInfo) => {
        if (!socketRef.current?.connected) { setError("未连接到服务器"); return; }
        // 检查是否点击了当前已激活的聊天
        if (activeChatRef.current.type === chatInfo.type && (chatInfo.type === 'public' || activeChatRef.current.friendId === chatInfo.friendId)) { return; }

        console.log("请求切换聊天到:", chatInfo);
        setActiveChat(chatInfo);
        setMessages([]); setError('');
        handleCancelPreview(); // 切换聊天时取消文件预览
        setNewMessage('');
        setIsLoadingHistory(true);

        if (chatInfo.type === 'public') {
            console.log("切换到公共聊天。");
            // 清空消息列表 (上面已做)，公共历史目前不加载
            setIsLoadingHistory(false);
        } else if (chatInfo.type === 'private') {
            console.log(`请求与 ${chatInfo.friendUsername} (${chatInfo.friendId}) 的私聊历史...`);
            socketRef.current.emit('getPrivateHistory', { friendId: chatInfo.friendId });
            // 清除此好友的未读标记
            setFriends(prevFriends => prevFriends.map(f => f.id === chatInfo.friendId ? { ...f, hasUnread: false } : f));
        }
    }, [isConnected, handleCancelPreview]);


    // --- 发送消息 ---
    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!isConnected) { setError("未连接"); return; }
        console.log(`发送按钮点击: newMessage='${newMessage}', selectedFile=`, selectedFile); // 调试日志
        if (!newMessage.trim() && !selectedFile) { setError("不能发送空消息"); setTimeout(()=>setError(''), 3000); return; }

        const currentActiveChat = activeChatRef.current; // 使用 Ref 获取最新状态
        const targetRecipientId = currentActiveChat.type === 'private' ? currentActiveChat.friendId : null;

        // --- 发送文件 ---
        if (selectedFile) {
            const fileToSend = selectedFile; // 捕获当前选中的文件状态
            setIsUploading(true); setError('');
            const formData = new FormData(); formData.append('file', fileToSend);
            console.log(`开始上传文件: ${fileToSend.name} to ${targetRecipientId || '公共'}`);
            try {
                const res = await axios.post('/api/upload', formData);
                console.log('文件上传成功:', res.data);
                if (socketRef.current && res.data.url && res.data.mimeType) {
                    const payload = { type: 'file', recipientId: targetRecipientId, url: res.data.url, mimeType: res.data.mimeType, originalFilename: fileToSend.name };
                    socketRef.current.emit('sendMessage', payload);
                    console.log(`已发送文件消息 WS:`, payload);
                    handleCancelPreview(); // <--- 成功后清理
                    console.log("文件发送成功，调用了 handleCancelPreview");
                } else { throw new Error('服务器返回文件信息无效'); }
            } catch (uploadError) {
                console.error('文件上传失败:', uploadError);
                setError(`上传失败: ${uploadError.response?.data?.msg || '错误'}`);
                setTimeout(() => setError(''), 5000);
                handleCancelPreview(); // <--- 失败后也清理
                console.log("文件上传失败，调用了 handleCancelPreview");
            } finally { setIsUploading(false); }
            // --- 发送文本 ---
        } else {
            const messageText = newMessage.trim();
            if (!messageText) return;
            if (socketRef.current) {
                const payload = { type: 'text', recipientId: targetRecipientId, text: messageText };
                socketRef.current.emit('sendMessage', payload);
                console.log(`已发送文本消息 WS:`, payload);
                setNewMessage(''); setError('');
            }
        }
    };

    // --- 登出 ---
    const handleLogout = useCallback(() => {
        console.log("执行登出...");
        localStorage.removeItem('token');
        setAuthToken(null);
        socketRef.current?.disconnect();
        setActiveChat({ type: 'public' }); setMessages([]); setFriends([]); setError(''); setCurrentUser(null);
        setSearchTerm(''); setSearchResults([]); handleCancelPreview(); // 登出时也清理预览
        console.log("状态已重置，导航到 /login");
        navigate('/login');
    }, [navigate, handleCancelPreview]); // 加入 handleCancelPreview 依赖

    // --- 获取聊天标题 ---
    const getChatTitle = () => activeChat.type === 'public' ? '公共聊天室' : activeChat.friendUsername || '私聊';

    // --- JSX 渲染 ---
    return (
        <div style={stylesChat.appContainer}>
            {/* 侧边栏 */}
            <div style={stylesChat.sidebar}>
                <div style={stylesChat.sidebarHeader}>
                    {currentUser && <h3>你好, {currentUser.username}</h3>}
                    <button onClick={handleLogout} style={stylesChat.logoutButtonSmall}>登出</button>
                </div>
                <div style={{...stylesChat.chatListItem, ...(activeChat.type === 'public' ? stylesChat.activeChatListItem : {})}} onClick={() => handleSelectChat({ type: 'public' })}>🌐 公共聊天室</div>
                <hr style={stylesChat.hr}/>
                <h4>好友列表 ({friends.length})</h4>
                <div style={stylesChat.friendList}>
                    {friends.length === 0 && <p style={stylesChat.sidebarNotice}>还没有好友</p>}
                    {friends.map(friend => (
                        <div key={friend.id} style={{...stylesChat.chatListItem, ...(activeChat.type === 'private' && activeChat.friendId === friend.id ? stylesChat.activeChatListItem : {})}} onClick={() => handleSelectChat({ type: 'private', friendId: friend.id, friendUsername: friend.username })} title={`与 ${friend.username} 私聊`} className="chatListItem">
                            <span style={{ ...stylesChat.statusIndicator, backgroundColor: friend.isOnline ? '#4CAF50' : '#9E9E9E' }}></span>
                            <span style={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{friend.username}</span>
                            {friend.hasUnread && <span style={stylesChat.unreadBadge}>!</span>}
                            <button onClick={(e) => { e.stopPropagation(); handleRemoveFriend(friend.id, friend.username); }} style={stylesChat.removeFriendButton} title="移除好友" className="removeFriendButton">✕</button>
                        </div>
                    ))}
                </div>
                {/* 简单的 CSS hover 效果，用于显示移除按钮 */}
                <style>{`.chatListItem:hover .removeFriendButton { display: inline-block !important; }`}</style>
                <hr style={stylesChat.hr}/>
                <h4>添加好友</h4>
                {/* 搜索框 */}
                <input
                    type="text"
                    placeholder="搜索用户名..."
                    value={searchTerm}
                    onChange={handleSearchChange} // <--- 确认绑定
                    style={stylesChat.searchInput}
                    // 确保没有 disabled 属性
                />
                {/* 搜索结果 */}
                <div style={stylesChat.searchResults}>
                    {isSearching && <p style={stylesChat.sidebarNotice}>搜索中...</p>}
                    {!isSearching && searchTerm && searchResults.length === 0 && <p style={stylesChat.sidebarNotice}>未找到用户</p>}
                    {searchResults.map(user => (
                        <div key={user._id} style={stylesChat.searchResultItem}>
                            <span>{user.username}</span>
                            <button onClick={() => handleAddFriend(user._id)} style={stylesChat.addButton}>添加</button>
                        </div>
                    ))}
                </div>
            </div>

            {/* 主聊天区 */}
            <div style={stylesChat.chatArea}>
                <div style={stylesChat.header}>
                    <h2 style={{ margin: 0 }}>{getChatTitle()}</h2>
                    <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                        <div style={stylesChat.status}>状态: {isConnected ? <span style={{color: 'green'}}>已连接</span> : <span style={{color: 'red'}}>已断开</span>}</div>
                    </div>
                </div>
                {error && <p style={stylesChat.errorText}>{error}</p>}
                {/* 消息列表 */}
                <div style={stylesChat.messageList} className="message-list-scrollbar">
                    {isLoadingHistory && <p style={stylesChat.noticeText}>正在加载聊天记录...</p>}
                    {!isLoadingHistory && messages.length === 0 && (<p style={stylesChat.noticeText}>{activeChat.type === 'public' ? '公共聊天室无消息' : `开始与 ${activeChat.friendUsername || '好友'} 聊天吧！`}</p>)}
                    {messages.map((msg) => (
                        <div key={msg._id} style={{...stylesChat.messageBubble, alignSelf: msg.sender?._id === currentUser?.id ? 'flex-end' : 'flex-start', backgroundColor: msg.sender?._id === currentUser?.id ? '#dcf8c6' : '#eee'}}>
                            {activeChat.type === 'public' && msg.sender?._id !== currentUser?.id && (<strong style={stylesChat.senderName}>{msg.sender?.username || '用户'}</strong>)}
                            {/* 消息内容渲染 */}
                            {msg.messageType === 'text' && ( <span style={stylesChat.messageContent}>{msg.content}</span> )}
                            {(msg.messageType === 'image' || msg.mimeType?.startsWith('image/')) && ( <img src={msg.fileUrl} alt={msg.originalFilename || '图片'} style={stylesChat.messageImage} /> )}
                            {(msg.messageType === 'video' || msg.mimeType?.startsWith('video/')) && ( <video src={msg.fileUrl} controls style={stylesChat.messageVideo} /> )}
                            {msg.messageType === 'file' && !msg.mimeType?.startsWith('image/') && !msg.mimeType?.startsWith('video/') && ( <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer" style={stylesChat.messageFileLink} download={msg.originalFilename || true}>📄 下载文件 {msg.originalFilename ? `(${msg.originalFilename})` : ''}</a> )}
                            {msg.timestamp && ( <span style={{...stylesChat.timestamp, textAlign: msg.sender?._id === currentUser?.id ? 'right' : 'left'}}>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span> )}
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>
                {/* 文件预览 */}
                {previewUrl && (
                    <div style={stylesChat.previewArea}>
                        {selectedFile?.type.startsWith('image/') && <img src={previewUrl} alt="预览" style={stylesChat.previewImage} />}
                        {selectedFile?.type.startsWith('video/') && <video src={previewUrl} controls={false} autoPlay={false} muted style={stylesChat.previewVideo} />}
                        {!selectedFile?.type.startsWith('image/') && !selectedFile?.type.startsWith('video/') && ( <span style={stylesChat.previewFileIcon}>📄</span> )}
                        <span style={stylesChat.previewFilename}>{selectedFile?.name}</span>
                        <button onClick={handleCancelPreview} style={stylesChat.cancelPreviewButton} title="取消选择">×</button>
                    </div>
                )}
                {/* 消息输入 */}
                <form onSubmit={handleSendMessage} style={stylesChat.messageForm}>
                    <input type="file" ref={fileInputRef} onChange={handleFileSelect} style={{ display: 'none' }} accept={ALLOWED_FILE_TYPES.join(',')} />
                    <button type="button" onClick={handleFileButtonClick} style={stylesChat.attachButton} disabled={isUploading || !isConnected} title="选择文件" > + </button>
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder={activeChat.type === 'public' ? "在公共频道发言..." : `给 ${activeChat.friendUsername || '好友'} 发消息...`}
                        style={stylesChat.messageInput}
                        disabled={isUploading || !isConnected || !!selectedFile} // 确认: 有文件选中时禁用
                        aria-label="消息输入框"
                    />
                    <button
                        type="submit"
                        disabled={isUploading || !isConnected || (!newMessage.trim() && !selectedFile)} // 确认: 有内容或文件才能发送
                        style={{...stylesChat.sendButton, ...((isUploading || !isConnected || (!newMessage.trim() && !selectedFile)) ? stylesChat.sendButtonDisabled : {}) }}
                    >
                        {isUploading ? '上传中...' : '发送'}
                    </button>
                </form>
            </div>
        </div>
    );
}

// --- 样式对象 ---
const stylesChat = {
    // ... (之前提供的所有样式定义，包括 appContainer, sidebar, chatArea, messageForm 等)
    appContainer: { display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'Arial, sans-serif', backgroundColor: '#f0f0f0' },
    sidebar: { width: '280px', flexShrink: 0, display: 'flex', flexDirection: 'column', backgroundColor: '#f8f9fa', borderRight: '1px solid #dee2e6', padding: '10px', overflowY: 'auto' },
    sidebarHeader: { padding: '10px 5px', borderBottom: '1px solid #dee2e6', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    logoutButtonSmall: { padding: '4px 8px', fontSize: '12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' },
    hr: { border: 'none', borderTop: '1px solid #e0e0e0', margin: '10px 0' },
    chatListItem: { display: 'flex', alignItems: 'center', padding: '10px 8px', borderRadius: '6px', cursor: 'pointer', marginBottom: '5px', transition: 'background-color 0.2s ease', position: 'relative' },
    activeChatListItem: { backgroundColor: '#d4edda', fontWeight: 'bold' },
    statusIndicator: { width: '10px', height: '10px', borderRadius: '50%', marginRight: '10px', flexShrink: 0 },
    unreadBadge: { backgroundColor: 'red', color: 'white', borderRadius: '50%', padding: '2px 6px', fontSize: '10px', fontWeight: 'bold', marginLeft: 'auto' },
    friendList: { flexGrow: 1, overflowY: 'auto', minHeight: '100px' },
    sidebarNotice: { color: '#6c757d', fontSize: '13px', textAlign: 'center', padding: '10px 0' },
    removeFriendButton: { background: 'none', border: 'none', color: '#dc3545', cursor: 'pointer', fontSize: '16px', padding: '0 5px', marginLeft: '5px', display: 'none', opacity: 0.7 },
    searchInput: { width: 'calc(100% - 20px)', padding: '8px 10px', borderRadius: '4px', border: '1px solid #ced4da', marginBottom: '10px', boxSizing: 'border-box' },
    searchResults: { maxHeight: '150px', overflowY: 'auto', marginBottom: '10px' },
    searchResultItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', fontSize: '14px', borderBottom: '1px solid #f0f0f0' },
    addButton: { padding: '3px 8px', fontSize: '12px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' },
    chatArea: { flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 15px', borderBottom: '1px solid #dee2e6', backgroundColor: '#f8f9fa', flexShrink: 0 },
    status: { fontSize: '14px', color: '#6c757d' },
    errorText: { color: '#dc3545', textAlign: 'center', padding: '10px 15px', backgroundColor: '#f8d7da', borderBottom: '1px solid #f5c6cb', fontSize: '14px', margin: 0, flexShrink: 0 },
    messageList: { flexGrow: 1, overflowY: 'auto', padding: '15px', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column' },
    noticeText: { textAlign: 'center', color: '#888', marginTop: '20px', fontSize: '14px', padding: '10px' },
    messageBubble: { maxWidth: '75%', padding: '8px 12px', borderRadius: '15px', marginBottom: '10px', wordWrap: 'break-word', lineHeight: '1.4', fontSize: '15px', position: 'relative', color: '#333' },
    senderName: { fontWeight: 'bold', marginRight: '5px', color: '#007bff', fontSize: '13px', display: 'block', marginBottom: '3px' },
    messageContent: { fontSize: '15px' },
    timestamp: { fontSize: '10px', color: '#999', display: 'block', marginTop: '4px' },
    messageImage: { maxWidth: '100%', maxHeight: '250px', borderRadius: '10px', display: 'block', marginTop: '5px', cursor: 'pointer', objectFit: 'contain', backgroundColor: '#f0f0f0' },
    messageVideo: { maxWidth: '100%', maxHeight: '250px', borderRadius: '10px', display: 'block', marginTop: '5px', backgroundColor: '#000' },
    messageFileLink: { display: 'inline-block', marginTop: '8px', padding: '8px 12px', backgroundColor: '#f0f0f0', border: '1px solid #ddd', borderRadius: '5px', textDecoration: 'none', color: '#337ab7', fontWeight: 'normal', fontSize: '14px' },
    previewArea: { display: 'flex', alignItems: 'center', padding: '8px 15px', borderTop: '1px solid #e0e0e0', backgroundColor: '#f8f9fa', gap: '10px', flexShrink: 0 },
    previewImage: { maxHeight: '40px', maxWidth: '60px', borderRadius: '4px', objectFit: 'cover' },
    previewVideo: { maxHeight: '40px', maxWidth: '60px', borderRadius: '4px', backgroundColor: '#000' },
    previewFileIcon: { fontSize: '24px', color: '#6c757d' },
    previewFilename: { flexGrow: 1, fontSize: '13px', color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    cancelPreviewButton: { background: 'none', border: 'none', fontSize: '20px', color: '#888', cursor: 'pointer', padding: '0 5px', lineHeight: 1 },
    messageForm: { display: 'flex', padding: '15px', borderTop: '1px solid #e0e0e0', backgroundColor: '#ffffff', alignItems: 'center', gap: '10px', flexShrink: 0 },
    attachButton: { padding: '8px', backgroundColor: '#f0f0f0', color: '#495057', border: '1px solid #ced4da', borderRadius: '50%', cursor: 'pointer', fontSize: '18px', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '38px', height: '38px', transition: 'background-color 0.2s ease', flexShrink: 0 },
    messageInput: { flexGrow: 1, height: '38px', padding: '8px 15px', border: '1px solid #d0d0d0', borderRadius: '18px', fontSize: '15px', outline: 'none', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.075)', transition: 'border-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out', boxSizing: 'border-box' },
    sendButton: { height: '38px', padding: '0 18px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '18px', cursor: 'pointer', fontSize: '15px', fontWeight: '500', transition: 'background-color 0.2s ease-in-out, opacity 0.2s ease', outline: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '70px', boxSizing: 'border-box', flexShrink: 0 },
    sendButtonDisabled: { backgroundColor: '#6c757d', cursor: 'not-allowed', opacity: 0.65 },
};

export default Chat;