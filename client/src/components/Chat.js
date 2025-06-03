// client/src/components/Chat.js (修改版)
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import io from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import setAuthToken from '../utils/setAuthToken';
import html2canvas from "html2canvas";
import axios from 'axios';

// --- 配置 ---
const SOCKET_SERVER_URL = 'http://localhost:5000/';
const MAX_FILE_SIZE_MB = 50;
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

function Chat() {
    // --- 状态 ---
    // ... (大部分状态保持不变) ...
    const [isDownloadingText, setIsDownloadingText] = useState(false);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [error, setError] = useState('');
    const [isConnected, setIsConnected] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const [selectedFile, setSelectedFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [friends, setFriends] = useState([]);
    const [activeChat, setActiveChat] = useState({ type: 'public' }); // 默认是公共聊天室
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false); // 这个状态很重要
    const [editingFriendGroup, setEditingFriendGroup] = useState(null);
    const [newGroupNameInput, setNewGroupNameInput] = useState('');
    const [selectedGroupForMove, setSelectedGroupForMove] = useState('');
    const [isCapturing,setIsCapturing] = useState(false);

    // --- Refs & Hooks ---
    const socketRef = useRef(null);
    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const navigate = useNavigate();
    const activeChatRef = useRef(activeChat);
    const messageListRef = useRef(null);
    useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);

    // --- 解码 Token & 设置用户 ---
    const decodeTokenAndSetUser = useCallback(() => {
        // ... (无变动) ...
        const token = localStorage.getItem('token');
        if (token) {
            try {
                const decoded = jwtDecode(token);
                if (decoded.user?.id && decoded.user?.username) {
                    setCurrentUser({ id: decoded.user.id, username: decoded.user.username });
                    setAuthToken(token);
                } else throw new Error("无效 Token");
            } catch (err) { console.error("解码失败:", err); localStorage.removeItem('token'); setAuthToken(null); navigate('/login'); }
        } else navigate('/login');
    }, [navigate]);
    useEffect(() => { if (!currentUser) decodeTokenAndSetUser(); }, [currentUser, decodeTokenAndSetUser]);

    // --- WebSocket ---
    useEffect(() => {
        if (!currentUser) return;
        if (socketRef.current?.connected) return;
        if (socketRef.current) socketRef.current.disconnect();

        console.log(`连接 WS (用户: ${currentUser.username})...`);
        const socket = io(SOCKET_SERVER_URL, { auth: { token: localStorage.getItem('token') } });
        socketRef.current = socket;

        const handleConnect = () => {
            setIsConnected(true);
            setError('');
            console.log('WS 已连接');
            socket.emit('getFriendList');
            if (activeChatRef.current.type === 'public') {
                setMessages([]); // 清空可能存在的旧消息
                setIsLoadingHistory(true); // 设置加载状态
                console.log('[WS Connect] 请求公共历史...');
                socket.emit('getPublicHistory'); // <<<<<< 新增：请求公共历史记录
            } else if (activeChatRef.current.type === 'private') {
                setMessages([]); // 清空可能存在的旧消息
                setIsLoadingHistory(true);
                socket.emit('getPrivateHistory', { friendId: activeChatRef.current.friendId });
            }
        };

        const handleDisconnect = (reason) => { /* ... (无变动) ... */ setIsConnected(false); setActiveChat({ type: 'public' }); setMessages([]); setFriends([]); if (reason !== 'io client disconnect') setError('连接断开'); console.log('WS 断开:', reason); };
        const handleConnectError = (err) => { /* ... (无变动) ... */ setError(`连接失败: ${err.message}.`); setIsConnected(false); if (err.message?.toLowerCase().includes('authentication error') || err.message === '认证错误') { localStorage.removeItem('token'); setAuthToken(null); navigate('/login'); } console.error('WS 连接错误:', err.message); };
        const handleFriendListUpdate = (list) => { /* ... (无变动) ... */ console.log("好友列表更新:", list); setFriends(prev => Array.isArray(list) ? list.map(f => ({ ...f, hasUnread: prev.find(pf => pf.id === f.id)?.hasUnread || false })) : []); };
        const handleFriendStatusUpdate = ({ userId, isOnline }) => { /* ... (无变动) ... */ setFriends(prev => prev.map(f => f.id === userId ? { ...f, isOnline } : f)); };

        const handlePrivateHistory = ({ friendId, history }) => {
            // 确保只在当前私聊窗口更新历史
            if (activeChatRef.current.type === 'private' && activeChatRef.current.friendId === friendId) {
                setMessages(Array.isArray(history) ? history : []);
            }
            setIsLoadingHistory(false);
        };

        // <<<<<< 新增：处理公共历史记录的 Handler >>>>>>
        const handlePublicHistory = (data) => {
            if (activeChatRef.current.type === 'public' && data) { // 确保当前是公共聊天室
                setMessages(Array.isArray(data.history) ? data.history : []);
                console.log('[WS] 收到公共历史记录:', data.history.length, '条');
            }
            setIsLoadingHistory(false); // 关闭加载状态
        };

        const handleNewMessage = (msg) => { // 这个是服务器广播给所有人的公共消息
            if (activeChatRef.current.type === 'public' && msg) {
                setMessages(prev => [...prev, msg]);
            }
        };
        const handleReceivePrivateMessage = (msg) => { /* ... (无变动) ... */ if (!currentUser || !msg) return; const friendId = msg.sender?._id === currentUser.id ? msg.recipient : msg.sender?._id; if (!friendId) return; if (activeChatRef.current.type === 'private' && activeChatRef.current.friendId === friendId) { setMessages(prev => [...prev, msg]); setFriends(prev => prev.map(f => f.id === friendId ? { ...f, hasUnread: false } : f)); } else { setFriends(prev => prev.map(f => f.id === friendId ? { ...f, hasUnread: true } : f)); } };
        const handleMessageError = (err) => { /* ... (无变动) ... */ setError(`消息错误: ${err.error || '未知'}`); setTimeout(() => setError(''), 5000); };

        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);
        socket.on('connect_error', handleConnectError);
        socket.on('friendListUpdate', handleFriendListUpdate);
        socket.on('friendStatusUpdate', handleFriendStatusUpdate);
        socket.on('privateHistory', handlePrivateHistory);
        socket.on('publicHistory', handlePublicHistory); // <<<<<< 新增：监听公共历史记录事件
        socket.on('newMessage', handleNewMessage); // 已有，用于接收新的公共消息
        socket.on('receivePrivateMessage', handleReceivePrivateMessage);
        socket.on('messageError', handleMessageError);

        return () => {
            console.log('清理 WS...');
            socket.off('connect', handleConnect); // 确保所有监听器都被正确移除
            socket.off('disconnect', handleDisconnect);
            socket.off('connect_error', handleConnectError);
            socket.off('friendListUpdate', handleFriendListUpdate);
            socket.off('friendStatusUpdate', handleFriendStatusUpdate);
            socket.off('privateHistory', handlePrivateHistory);
            socket.off('publicHistory', handlePublicHistory); // <<<<<< 新增：移除监听
            socket.off('newMessage', handleNewMessage);
            socket.off('receivePrivateMessage', handleReceivePrivateMessage);
            socket.off('messageError', handleMessageError);
            socket.disconnect();
            socketRef.current = null;
            setIsConnected(false);
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
    }, [currentUser, navigate]); // 依赖项保持不变，因为 activeChatRef.current 用于内部判断

    // --- 自动滚动 ---
    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

    // --- 文件处理 ---
    const handleFileButtonClick = () => fileInputRef.current?.click();
    const handleFileSelect = (e) => { /* ... (无变动) ... */ const file = e.target.files?.[0]; if (!file) return; setError(''); const isAllowedExt = /\.(jpg|jpeg|png|gif|mp4|mov|webm|pdf|doc|docx)$/i.test(file.name); if (!ALLOWED_FILE_TYPES.includes(file.type) && !file.type.startsWith('image/') && !file.type.startsWith('video/') && !isAllowedExt) { setError(`不支持文件`); setTimeout(() => setError(''), 3000); e.target.value = null; return; } if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) { setError(`文件过大`); setTimeout(() => setError(''), 3000); e.target.value = null; return; } setSelectedFile(file); const objectUrl = URL.createObjectURL(file); setPreviewUrl(objectUrl); setNewMessage(''); e.target.value = null; };
    const handleCancelPreview = useCallback(() => { /* ... (无变动) ... */ console.log("取消预览"); if (previewUrl) URL.revokeObjectURL(previewUrl); setSelectedFile(null); setPreviewUrl(null); if (fileInputRef.current) fileInputRef.current.value = null; }, [previewUrl]);

    // --- 好友搜索/添加/移除 ---
    const handleSearchChange = (e) => { /* ... (无变动) ... */ const term = e.target.value; setSearchTerm(term); if (term.trim().length > 0) searchUsersAPI(term.trim()); else setSearchResults([]); };
    const searchUsersAPI = useCallback(async (query) => { /* ... (无变动) ... */ if (isSearching) return; setIsSearching(true); setError(''); try { const res = await axios.get(`/api/friends/search?query=${query}`); setSearchResults(res.data || []); } catch (err) { setError('搜索失败'); setSearchResults([]); } finally { setIsSearching(false); } }, [isSearching]);
    const handleAddFriend = useCallback(async (friendId) => { /* ... (无变动) ... */ setError(''); try { const res = await axios.post('/api/friends', { friendId }); if (res.data.friend) socketRef.current?.emit('getFriendList'); setSearchResults(prev => prev.filter(user => user._id !== friendId)); } catch (err) { setError(err.response?.data?.msg || '添加失败'); } }, []);
    const handleRemoveFriend = useCallback(async (friendId, friendUsername) => { /* ... (无变动) ... */ if (!window.confirm(`移除 ${friendUsername}?`)) return; setError(''); try { await axios.delete(`/api/friends/${friendId}`); setFriends(prev => prev.filter(f => f.id !== friendId)); if (activeChatRef.current.type === 'private' && activeChatRef.current.friendId === friendId) { setActiveChat({ type: 'public' }); setMessages([]); /* 切换到公共聊天室时，历史记录应由 handleSelectChat 中的逻辑触发 */ } } catch (err) { setError(err.response?.data?.msg || '移除失败'); } }, []);

    // --- 切换聊天 ---
    const handleSelectChat = useCallback((chatInfo) => {
        if (!isConnected) return;
        // 防止重复点击同一个聊天
        if (activeChatRef.current.type === chatInfo.type &&
            (chatInfo.type === 'public' || activeChatRef.current.friendId === chatInfo.friendId)) {
            return;
        }

        console.log("切换到:", chatInfo);
        setActiveChat(chatInfo);
        setMessages([]); // 清空消息
        setError('');
        handleCancelPreview();
        setNewMessage('');
        setIsLoadingHistory(true); // <<<<<< 统一在这里设置 isLoadingHistory 为 true

        if (chatInfo.type === 'public') {
            console.log('[SelectChat] 请求公共历史...');
            socketRef.current?.emit('getPublicHistory'); // <<<<<< 新增：请求公共历史记录
        } else if (chatInfo.type === 'private') {
            socketRef.current?.emit('getPrivateHistory', { friendId: chatInfo.friendId });
            setFriends(prev => prev.map(f => f.id === chatInfo.friendId ? { ...f, hasUnread: false } : f));
        }
    }, [isConnected, handleCancelPreview]); // 依赖项保持不变，因为 activeChatRef.current 用于内部判断

    // --- 发送消息 ---
    const handleSendMessage = async (e) => { /* ... (无变动，此部分逻辑已能正确处理公共/私聊的 recipientId) ... */ e.preventDefault(); if (!isConnected || (!newMessage.trim() && !selectedFile)) { setError("无内容发送"); return; } const currentActiveChat = activeChatRef.current; const targetRecipientId = currentActiveChat.type === 'private' ? currentActiveChat.friendId : null; console.log(`发送 类型:${selectedFile ? 'file' : 'text'} 目标:${targetRecipientId || '公共'}`); if (selectedFile) { const file = selectedFile; setIsUploading(true); setError(''); const formData = new FormData(); formData.append('file', file); try { const res = await axios.post('/api/upload', formData); if (socketRef.current && res.data.url && res.data.mimeType) { const payload = { type: 'file', recipientId: targetRecipientId, url: res.data.url, mimeType: res.data.mimeType, originalFilename: file.name }; socketRef.current.emit('sendMessage', payload); console.log("文件WS发送:", payload); handleCancelPreview(); } else throw new Error('上传响应无效'); } catch (err) { console.error('上传失败:', err); setError('上传失败'); handleCancelPreview(); } finally { setIsUploading(false); } } else { const text = newMessage.trim(); if (!text) return; if (socketRef.current) { const payload = { type: 'text', recipientId: targetRecipientId, text: text }; socketRef.current.emit('sendMessage', payload); console.log("文本WS发送:", payload); setNewMessage(''); setError(''); } } };

    // --- 登出 ---
    const handleLogout = useCallback(() => { /* ... (无变动) ... */ console.log("登出..."); localStorage.removeItem('token'); setAuthToken(null); socketRef.current?.disconnect(); setActiveChat({ type: 'public' }); setMessages([]); setFriends([]); setError(''); setCurrentUser(null); setSearchTerm(''); setSearchResults([]); handleCancelPreview(); console.log("导航到 /login"); navigate('/login'); }, [navigate, handleCancelPreview]);

    // --- 分组编辑 ---
    const handleEditGroupClick = (friendId, currentGroup) => { /* ... (无变动) ... */ setEditingFriendGroup({ friendId, currentGroup }); setNewGroupNameInput(currentGroup || '默认分组'); setSelectedGroupForMove(currentGroup || '默认分组'); };
    const handleGroupNameChange = (e) => setNewGroupNameInput(e.target.value);
    const handleGroupSelectChange = (e) => { /* ... (无变动) ... */ const value = e.target.value; setSelectedGroupForMove(value); if (value !== '--新建分组--') setNewGroupNameInput(value); else setNewGroupNameInput(''); };
    const handleSaveGroup = useCallback(async () => { /* ... (无变动) ... */ if (!editingFriendGroup) return; const friendId = editingFriendGroup.friendId; const finalGroupName = newGroupNameInput.trim() || (selectedGroupForMove !== '--新建分组--' ? selectedGroupForMove : ''); if (!finalGroupName) { setError("分组名不能为空"); return; } setError(''); console.log(`移动好友 ${friendId} 到分组 ${finalGroupName}`); try { await axios.put(`/api/friends/${friendId}/group`, { group: finalGroupName }); setFriends(prev => prev.map(f => f.id === friendId ? { ...f, group: finalGroupName } : f)); setEditingFriendGroup(null); setNewGroupNameInput(''); setSelectedGroupForMove(''); socketRef.current?.emit('getFriendList'); } catch (err) { setError('移动分组失败'); console.error("移动失败:", err); setEditingFriendGroup(null); } }, [editingFriendGroup, newGroupNameInput, selectedGroupForMove]);
    const handleCancelEditGroup = (e) => { /* ... (无变动) ... */ e?.stopPropagation(); setEditingFriendGroup(null); setNewGroupNameInput(''); setSelectedGroupForMove(''); };
    const handleNewGroupNameInputChange = (e) => { /* ... (无变动) ... */ const value = e.target.value; setNewGroupNameInput(value); if (selectedGroupForMove !== '--新建分组--' && value.trim() !== selectedGroupForMove) setSelectedGroupForMove('--新建分组--'); };
    const getChatTitle = () => activeChat.type === 'public' ? '公共聊天室' : activeChat.friendUsername || '私聊';
    // --- 计算分组数据 ---
    const groupedFriends = useMemo(() => friends.reduce((acc, friend) => { /* ... (无变动) ... */ const group = friend.group || '默认分组'; if (!acc[group]) acc[group] = []; acc[group].push(friend); return acc; }, {}), [friends]);
    const groupNames = useMemo(() => { /* ... (无变动) ... */ const names = new Set(friends.map(f => f.group || '默认分组')); return ['默认分组', ...Array.from(names).filter(name => name !== '默认分组').sort()]; }, [friends]);

    // --- 下载纯文本聊天记录 ---
    const handleDownloadTextHistory = useCallback(() => { /* ... (无变动) ... */ if (isDownloadingText || messages.length === 0) return; setIsDownloadingText(true); setError(''); try { console.log("开始准备文本聊天记录..."); const textHistory = messages .filter(msg => msg.messageType === 'text' && msg.content) .map(msg => { const date = new Date(msg.createdAt || msg.timestamp); const pad = (num) => String(num).padStart(2, '0'); const formattedTime = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`; const senderName = msg.sender?.username || '未知用户'; const content = msg.content; return `[${formattedTime}] ${senderName}: ${content}`; }) .join('\n'); if (!textHistory) { console.log("没有文本消息可供下载。"); setError("当前聊天没有文本消息。"); setTimeout(() => setError(''), 3000); setIsDownloadingText(false); return; } console.log("文本记录准备完毕，创建 Blob..."); const blob = new Blob([textHistory], { type: 'text/plain;charset=utf-8' }); const url = window.URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; const timestamp = new Date().toISOString().replace(/[:.-]/g, ''); const safeChatTitle = getChatTitle().replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_'); link.download = `聊天记录_文本_${safeChatTitle}_${timestamp}.txt`; document.body.appendChild(link); link.click(); document.body.removeChild(link); window.URL.revokeObjectURL(url); console.log("文本记录下载已触发"); } catch (err) { console.error("下载文本记录失败:", err); setError(`下载文本记录失败: ${err.message || '未知错误'}`); setTimeout(() => setError(''), 5000); } finally { setIsDownloadingText(false); } }, [isDownloadingText, messages, activeChat]);
    // --- 处理截图 ---
    const handleCaptureChat = useCallback(async () => { /* ... (无变动) ... */ if (!messageListRef.current) { return; } if (isCapturing) return; setIsCapturing(true); setError(''); try { const canvas = await html2canvas(messageListRef.current, { /* ... options ... */ }); const imageDataUrl = canvas.toDataURL('image/png'); const link = document.createElement('a'); link.href = imageDataUrl; const timestamp = new Date().toISOString().replace(/[:.-]/g, ''); link.download = `聊天记录_${getChatTitle()}_${timestamp}.png`; document.body.appendChild(link); link.click(); document.body.removeChild(link); } catch (err) { /* ... */ } finally { setIsCapturing(false); } }, [isCapturing, activeChat]);
    const handleDownloadHistory = useCallback(async () => { /* ... (无变动，此函数似乎是为旧的HTTP下载准备的，但您当前的WebSocket历史获取逻辑是主流) ... */ if (!currentUser || !isConnected) { setError("请先连接才能下载记录"); setTimeout(() => setError(''), 3000); return; } const currentActiveChat = activeChatRef.current; let downloadUrl = '/api/messages/download'; let params = {}; let defaultFilename = 'chat_history.txt'; if (currentActiveChat.type === 'public') { params.chatType = 'public'; defaultFilename = 'public_chat_history.txt'; } else if (currentActiveChat.type === 'private' && currentActiveChat.friendId) { params.chatType = 'private'; params.targetId = currentActiveChat.friendId; defaultFilename = `chat_with_${currentActiveChat.friendUsername || currentActiveChat.friendId}.txt`; } else { setError("无法确定下载目标"); setTimeout(() => setError(''), 3000); return; } setError(''); console.log(`请求下载: ${downloadUrl} ? ${new URLSearchParams(params).toString()}`); try { const response = await axios.get(downloadUrl, { params: params, responseType: 'blob', }); console.log("收到下载响应, 状态:", response.status); const contentDisposition = response.headers['content-disposition']; let filename = defaultFilename; if (contentDisposition) { /* ... */ } console.log("最终下载文件名:", filename); const blob = new Blob([response.data], { type: response.headers['content-type'] || 'text/plain;charset=utf-8' }); const url = window.URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.setAttribute('download', filename); document.body.appendChild(link); link.click(); document.body.removeChild(link); window.URL.revokeObjectURL(url); console.log("下载已触发"); } catch (err) { console.error("下载聊天记录失败:", err.response?.data || err.message); let errorMsg = '下载失败，请稍后重试'; if (err.response?.data && err.response.headers['content-type']?.includes('application/json')) { try { const errorJson = JSON.parse(await err.response.data.text()); errorMsg = errorJson.msg || '下载出错'; } catch (parseError) { /* ... */ } } else if (err.response?.statusText) { errorMsg = `下载失败 (${err.response.status} ${err.response.statusText})`; } setError(errorMsg); setTimeout(() => setError(''), 5000); } }, [currentUser, isConnected]);

    // --- JSX 渲染 ---
    return (
        // ... (JSX 结构基本无变动，仅确保 isLoadingHistory 状态被正确使用) ...
        <div style={stylesChat.appContainer}>
            {/* 侧边栏 */}
            <div style={stylesChat.sidebar}>
                {/* ... (侧边栏代码无变动) ... */}
                <div style={stylesChat.sidebarHeader}> {currentUser && <h3>你好, {currentUser.username}</h3>} <button onClick={handleLogout} style={stylesChat.logoutButtonSmall}>登出</button> </div>
                <div style={{...stylesChat.chatListItem, ...(activeChat.type === 'public' ? stylesChat.activeChatListItem : {})}} onClick={() => handleSelectChat({ type: 'public' })}>🌐 公共聊天室</div>
                <hr style={stylesChat.hr}/>
                <h4>好友列表</h4>
                {Object.keys(groupedFriends).length === 0 && <p style={stylesChat.sidebarNotice}>还没有好友</p>}
                {Object.entries(groupedFriends).sort(([gA], [gB]) => gA === '默认分组' ? -1 : (gB === '默认分组' ? 1 : gA.localeCompare(gB))).map(([groupName, friendsInGroup]) => (
                    <div key={groupName} style={stylesChat.friendGroupContainer}>
                        <h5 style={stylesChat.groupTitle}>{groupName} ({friendsInGroup.length})</h5>
                        {friendsInGroup.sort((a, b) => (b.isOnline - a.isOnline) || a.username.localeCompare(b.username)).map(friend => (
                            <div key={friend.id} style={{ ...stylesChat.chatListItem, ...(activeChat.type === 'private' && activeChat.friendId === friend.id ? stylesChat.activeChatListItem : {}) }} onClick={() => handleSelectChat({ type: 'private', friendId: friend.id, friendUsername: friend.username })} title={`与 ${friend.username} 私聊`} className="chatListItem">
                                <span style={{ ...stylesChat.statusIndicator, backgroundColor: friend.isOnline ? '#4CAF50' : '#9E9E9E' }}></span>
                                <span style={stylesChat.friendName}>{friend.username}</span>
                                {friend.hasUnread && <span style={stylesChat.unreadBadge}>!</span>}
                                {editingFriendGroup?.friendId === friend.id ? (
                                    <div style={stylesChat.editGroupInline} onClick={e=>e.stopPropagation()}>
                                        <select value={selectedGroupForMove} onChange={handleGroupSelectChange} style={stylesChat.groupSelect}> <option value="--新建分组--">-- 新建 --</option> {groupNames.map(name => <option key={name} value={name}>{name}</option>)} </select>
                                        <input type="text" value={newGroupNameInput} onChange={handleNewGroupNameInputChange} placeholder="或输新分组" style={{...stylesChat.groupSelect, width: '80px'}}/>
                                        <button onClick={handleSaveGroup} style={stylesChat.saveGroupButton} title="保存">✓</button>
                                        <button onClick={handleCancelEditGroup} style={stylesChat.cancelGroupButton} title="取消">✕</button>
                                    </div>
                                ) : (
                                    <> <span style={stylesChat.friendGroupLabel}>({friend.group})</span> <button onClick={(e) => { e.stopPropagation(); handleEditGroupClick(friend.id, friend.group); }} style={stylesChat.editGroupButton} title="移动分组" className="editGroupButton">✎</button> <button onClick={(e) => { e.stopPropagation(); handleRemoveFriend(friend.id, friend.username); }} style={stylesChat.removeFriendButton} title="移除好友" className="removeFriendButton">✕</button> </>
                                )}
                            </div>
                        ))}
                    </div>
                ))}
                <style>{`.chatListItem:hover .removeFriendButton, .chatListItem:hover .editGroupButton { display: inline-block !important; }`}</style>
                <hr style={stylesChat.hr}/>
                <h4>添加好友</h4>
                <input type="text" placeholder="搜索用户名..." value={searchTerm} onChange={handleSearchChange} style={stylesChat.searchInput} />
                <div style={stylesChat.searchResults}> {isSearching && <p style={stylesChat.sidebarNotice}>搜索中...</p>} {!isSearching && searchTerm && searchResults.length === 0 && <p style={stylesChat.sidebarNotice}>未找到用户</p>} {searchResults.map(user => ( <div key={user._id} style={stylesChat.searchResultItem}><span>{user.username}</span><button onClick={() => handleAddFriend(user._id)} style={stylesChat.addButton}>添加</button></div> ))} </div>
            </div>

            <div style={stylesChat.chatArea}>
                <div style={stylesChat.header}>
                    <h2 style={{ margin: 0 }}>{getChatTitle()}</h2>
                    <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                        <button onClick={handleCaptureChat} disabled={isCapturing || messages.length === 0} style={{ ...stylesChat.captureButton, ...((isCapturing || messages.length === 0) ? stylesChat.captureButtonDisabled : {}) }} title="截取当前聊天记录长图" > {isCapturing ? '截图中...' : '截图'} </button>
                        <button onClick={handleDownloadTextHistory} disabled={isDownloadingText || messages.length === 0} style={{ ...stylesChat.downloadTextButton, ...((isDownloadingText || messages.length === 0) ? stylesChat.downloadTextButtonDisabled : {}) }} title="下载纯文本聊天记录" > {isDownloadingText ? '下载中...' : '下载文本'} </button>
                        <div style={stylesChat.status}>状态: {isConnected ? <span style={{color: 'green'}}>已连接</span> : <span style={{color: 'red'}}>已断开</span>}</div>
                    </div>
                </div>
                {error && <p style={stylesChat.errorText}>{error}</p>}
                <div ref={messageListRef} style={stylesChat.messageList} className="message-list-scrollbar" >
                    {isLoadingHistory && <p style={stylesChat.noticeText}>加载历史记录中...</p>}
                    {/* ^^^ 使用 isLoadingHistory 显示加载提示 */}
                    {!isLoadingHistory && messages.length === 0 && (<p style={stylesChat.noticeText}>{activeChat.type === 'public' ? '公共聊天室暂无消息' : `与 ${activeChat.friendUsername || '好友'} 开始聊天吧`}</p>)}
                    {Array.isArray(messages) && messages.map((msg) => {
                        if (!msg?._id) return null;
                        return (
                            <div key={msg._id} style={{...stylesChat.messageBubble, alignSelf: msg.sender?._id === currentUser?.id ? 'flex-end' : 'flex-start', backgroundColor: msg.sender?._id === currentUser?.id ? '#dcf8c6' : '#eee'}}>
                                {activeChat.type === 'public' && msg.sender?._id !== currentUser?.id && (<strong style={stylesChat.senderName}>{msg.sender?.username || '用户'}</strong>)}
                                {msg.messageType === 'text' && ( <span style={stylesChat.messageContent}>{msg.content}</span> )}
                                {(msg.messageType === 'image' || msg.mimeType?.startsWith('image/')) && ( <img src={msg.fileUrl} alt={msg.originalFilename || '图片'} style={stylesChat.messageImage} /> )}
                                {(msg.messageType === 'video' || msg.mimeType?.startsWith('video/')) && ( <video src={msg.fileUrl} controls style={stylesChat.messageVideo} /> )}
                                {msg.messageType === 'file' && !msg.mimeType?.startsWith('image/') && !msg.mimeType?.startsWith('video/') && ( <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer" style={stylesChat.messageFileLink} download={msg.originalFilename || true}>📄 下载 {msg.originalFilename || '文件'}</a> )}
                                {msg.createdAt && (() => { const date = new Date(msg.createdAt); const pad = (num) => String(num).padStart(2, '0'); const formattedTime = `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`; return ( <span style={{...stylesChat.timestamp, textAlign: msg.sender?._id === currentUser?.id ? 'right' : 'left'}}> {formattedTime} </span> ); })()}
                            </div>
                        );
                    })}
                    <div ref={messagesEndRef} />
                    {/* 重复的加载和空消息提示可以移除，因为上面已经有了 */}
                </div>
                {previewUrl && ( <div style={stylesChat.previewArea}> <span style={stylesChat.previewFilename}>{selectedFile?.name}</span> <button onClick={handleCancelPreview} style={stylesChat.cancelPreviewButton} title="取消选择">×</button> </div> )}
                <form onSubmit={handleSendMessage} style={stylesChat.messageForm}> <input type="file" ref={fileInputRef} onChange={handleFileSelect} style={{ display: 'none' }} accept={ALLOWED_FILE_TYPES.join(',')} /> <button type="button" onClick={handleFileButtonClick} style={stylesChat.attachButton} disabled={isUploading || !isConnected} title="选择文件" > + </button> <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder={activeChat.type === 'public' ? "公共发言..." : `给 ${activeChat.friendUsername || '好友'} 发消息...`} style={stylesChat.messageInput} disabled={isUploading || !isConnected || !!selectedFile} aria-label="输入框" /> <button type="submit" disabled={isUploading || !isConnected || (!newMessage.trim() && !selectedFile)} style={{...stylesChat.sendButton, ...((isUploading || !isConnected || (!newMessage.trim() && !selectedFile)) ? stylesChat.sendButtonDisabled : {}) }} >{isUploading ? '上传中...' : '发送'}</button> </form>
            </div>
        </div>
    );
}

// --- 样式对象 ---
// ... (stylesChat 对象无变动，保持原样) ...
const stylesChat = {
    appContainer: { display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'Arial, sans-serif', backgroundColor: '#f0f0f0' },
    sidebar: { width: '280px', flexShrink: 0, display: 'flex', flexDirection: 'column', backgroundColor: '#f8f9fa', borderRight: '1px solid #dee2e6', padding: '10px', overflowY: 'auto' },
    sidebarHeader: { padding: '10px 5px', borderBottom: '1px solid #dee2e6', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    logoutButtonSmall: { padding: '4px 8px', fontSize: '12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' },
    hr: { border: 'none', borderTop: '1px solid #e0e0e0', margin: '10px 0' },
    chatListItem: { display: 'flex', alignItems: 'center', padding: '8px', borderRadius: '6px', cursor: 'pointer', marginBottom: '5px', transition: 'background-color 0.2s ease', position: 'relative', minHeight: '38px' },
    activeChatListItem: { backgroundColor: '#d4edda', fontWeight: 'bold' },
    statusIndicator: { width: '10px', height: '10px', borderRadius: '50%', marginRight: '10px', flexShrink: 0 },
    unreadBadge: { backgroundColor: 'red', color: 'white', borderRadius: '50%', padding: '2px 6px', fontSize: '10px', fontWeight: 'bold', marginLeft: 'auto', marginRight: '5px' },
    friendList: { flexGrow: 1, overflowY: 'auto', minHeight: '100px' },
    sidebarNotice: { color: '#6c757d', fontSize: '13px', textAlign: 'center', padding: '10px 0' },
    removeFriendButton: { background: 'none', border: 'none', color: '#dc3545', cursor: 'pointer', fontSize: '16px', padding: '0 3px', marginLeft: '5px', display: 'none', opacity: 0.7 },
    searchInput: { width: '100%', padding: '8px 10px', borderRadius: '4px', border: '1px solid #ced4da', marginBottom: '10px', boxSizing: 'border-box' },
    searchResults: { maxHeight: '150px', overflowY: 'auto', marginBottom: '10px' },
    searchResultItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', fontSize: '14px', borderBottom: '1px solid #f0f0f0' },
    addButton: { padding: '3px 8px', fontSize: '12px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' },
    friendGroupContainer: { marginBottom: '10px' },
    groupTitle: { fontSize: '14px', fontWeight: 'bold', color: '#495057', margin: '5px 0 5px 5px', textTransform: 'uppercase' },
    friendName: { flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '5px' },
    friendGroupLabel: { fontSize: '11px', color: '#6c757d', marginLeft: 'auto', marginRight: '5px', fontStyle: 'italic' },
    editGroupButton: { background: 'none', border: 'none', color: '#6c757d', cursor: 'pointer', fontSize: '14px', padding: '0 3px', marginLeft: '5px', display: 'none' },
    editGroupInline: { display: 'flex', alignItems: 'center', marginLeft: 'auto', gap: '5px' },
    groupSelect: { fontSize: '12px', padding: '2px 4px', borderRadius: '3px', border: '1px solid #ced4da', maxWidth: '100px' },
    saveGroupButton: { padding: '2px 6px', fontSize: '11px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' },
    cancelGroupButton: { padding: '2px 6px', fontSize: '11px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' },
    chatArea: {
        flexGrow: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        backgroundColor: '#ffffff',
    },
    captureButton: {
        padding: '5px 10px',
        fontSize: '12px',
        backgroundColor: '#17a2b8',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        transition: 'background-color 0.2s ease, opacity 0.2s ease',
    },
    captureButtonDisabled: { // 需要您自己定义禁用样式
        opacity: 0.5,
        cursor: 'not-allowed',
    },
    downloadTextButton: { // 假设一个样式
        padding: '5px 10px',
        fontSize: '12px',
        backgroundColor: '#007bff',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
    },
    downloadTextButtonDisabled: { // 禁用样式
        opacity: 0.5,
        cursor: 'not-allowed',
    },
    errorText: { color: '#dc3545', textAlign: 'center', padding: '10px 15px', backgroundColor: '#f8d7da', borderBottom: '1px solid #f5c6cb', fontSize: '14px', margin: 0, flexShrink: 0 },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 15px', borderBottom: '1px solid #dee2e6', backgroundColor: '#f8f9fa', flexShrink: 0 },
    status: { fontSize: '14px', color: '#6c757d' },
    downloadButton: { padding: '5px 10px', fontSize: '12px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', transition: 'background-color 0.2s ease', marginLeft: 'auto' },
    messageList: {
        flexGrow: 1,
        overflowY: 'auto',
        padding: '15px',
        backgroundColor: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
    },
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