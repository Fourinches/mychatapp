// client/src/components/Chat.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import setAuthToken from '../utils/setAuthToken';
import './mycss.css'
const SOCKET_SERVER_URL = 'http://localhost:5000';

function Chat() {
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [error, setError] = useState('');
    const [isConnected, setIsConnected] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const socketRef = useRef(null);
    const messagesEndRef = useRef(null);
    const navigate = useNavigate();

    // --- 解码 Token (保持不变) ---
    const decodeTokenAndSetUser = useCallback(() => {
        const token = localStorage.getItem('token');
        if (token) {
            try {
                const decoded = jwtDecode(token);
                if (decoded.user && decoded.user.id && decoded.user.username) {
                    setCurrentUser({ id: decoded.user.id, username: decoded.user.username });
                } else { throw new Error("无效的 Token 格式"); }
            } catch (decodeError) { /* ... 错误处理 ... */ localStorage.removeItem('token'); setAuthToken(null); navigate('/login'); }
        } else { /* ... 未认证处理 ... */ navigate('/login'); }
    }, [navigate]);

    // --- WebSocket Effect (保持不变) ---
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) { navigate('/login'); return; }
        decodeTokenAndSetUser();
        if (socketRef.current) return;

        socketRef.current = io(SOCKET_SERVER_URL, { auth: { token: token } });
        const socket = socketRef.current;

        socket.on('connect', () => { setIsConnected(true); setError(''); });
        socket.on('disconnect', (reason) => { setIsConnected(false); if (reason !== 'io client disconnect') setError('连接已断开...'); });
        socket.on('connect_error', (err) => { setError(`连接失败: ${err.message}.`); setIsConnected(false); if (err.message?.toLowerCase().includes('authentication error')) { localStorage.removeItem('token'); setAuthToken(null); navigate('/login'); }});
        socket.on('loadHistory', (history) => { if (Array.isArray(history)) setMessages(history); });
        socket.on('newMessage', (message) => { if (message?._id && message.content && message.sender?.username) setMessages((prev) => [...prev, message]); else console.warn("收到格式错误的新消息:", message); });
        socket.on('messageError', (errorData) => { setError(`发送错误: ${errorData.error || '未知错误'}`); setTimeout(() => setError(''), 5000); });

        return () => { socketRef.current?.disconnect(); socketRef.current = null; setIsConnected(false); };
    }, [navigate, decodeTokenAndSetUser]);

    // --- 自动滚动 (保持不变) ---
    const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    useEffect(scrollToBottom, [messages]);

    // --- 发送消息 (保持不变) ---
    const handleSendMessage = (e) => {
        e.preventDefault();
        const messageText = newMessage.trim();
        if (!isConnected) { setError("未连接"); return; }
        if (!messageText) { setError("不能发送空消息"); setTimeout(() => setError(''), 3000); return; }
        if (socketRef.current) { socketRef.current.emit('sendMessage', { text: messageText }); setNewMessage(''); setError(''); }
    };

    // --- 登出 (保持不变) ---
    const handleLogout = () => { localStorage.removeItem('token'); setAuthToken(null); socketRef.current?.disconnect(); navigate('/login'); };

    // --- JSX 渲染 (仅修改输入框和按钮样式引用) ---
    return (
        <div style={stylesChat.chatContainer}>
            {/* 顶部栏 */}
            <div style={stylesChat.header}>
                <h2 style={{ margin: 0 }}>聊天室</h2>
                <div style={stylesChat.headerRight}>
                    {currentUser && <span style={stylesChat.usernameDisplay}>你好, {currentUser.username}</span>}
                    <div style={stylesChat.status}>
                        状态: {isConnected ? <span style={{color: 'green'}}>已连接</span> : <span style={{color: 'red'}}>已断开</span>}
                    </div>
                    <button onClick={handleLogout} style={stylesChat.logoutButton}>
                        登出
                    </button>
                </div>
            </div>
            {/* 错误提示 */}
            {error && <p style={stylesChat.errorText}>{error}</p>}
            {/* 消息列表 */}
            <div style={stylesChat.messageList}>
                {messages.length === 0 && !error && (<p style={{ textAlign: 'center', color: '#888', marginTop: '20px' }}>{isConnected ? '还没有消息...' : '正在连接...'}</p>)}
                {messages.map((msg) => (
                    <div key={msg._id} style={{ ...stylesChat.messageBubble, alignSelf: msg.sender?._id === currentUser?.id ? 'flex-end' : 'flex-start', backgroundColor: msg.sender?._id === currentUser?.id ? '#dcf8c6' : '#eee', }}>
                        {msg.sender?._id !== currentUser?.id && (<strong style={stylesChat.senderName}>{msg.sender?.username || '用户'}</strong>)}
                        <span style={stylesChat.messageContent}>{msg.content}</span>
                        {msg.timestamp && (<span style={{...stylesChat.timestamp, textAlign: msg.sender?._id === currentUser?.id ? 'right' : 'left'}}>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>)}
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* 消息输入表单 (使用更新后的样式) */}
            <form onSubmit={handleSendMessage} style={stylesChat.messageForm}>
                <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="输入消息..."
                    style={stylesChat.messageInput} // <--- 应用新样式
                    disabled={!isConnected}
                    aria-label="消息输入框"
                />
                <button
                    type="submit"
                    disabled={!isConnected || !newMessage.trim()}
                    style={{
                        ...stylesChat.sendButton, // <--- 应用新样式
                        ...((!isConnected || !newMessage.trim()) ? stylesChat.sendButtonDisabled : {})
                    }}
                >
                    发送 {/* 或者用图标 <SendIcon /> */}
                </button>
            </form>
        </div>
    );
}

// --- 样式对象 (重点修改底部输入区域样式) ---
const stylesChat = {
    // ... (保留之前的 chatContainer, header, messageList, messageBubble 等样式) ...
    chatContainer: { display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', maxWidth: '800px', margin: '20px auto', border: '1px solid #ccc', borderRadius: '8px', overflow: 'hidden', fontFamily: 'Arial, sans-serif', boxShadow: '0 2px 5px rgba(0,0,0,0.1)', },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 15px', borderBottom: '1px solid #dee2e6', backgroundColor: '#f8f9fa', },
    headerRight: { display: 'flex', alignItems: 'center', gap: '15px', },
    usernameDisplay: { fontSize: '14px', fontWeight: 'bold', color: '#555', },
    status: { fontSize: '14px', color: '#6c757d', },
    logoutButton: { padding: '5px 10px', fontSize: '12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', transition: 'background-color 0.2s ease', },
    errorText: { color: '#dc3545', textAlign: 'center', padding: '10px 15px', backgroundColor: '#f8d7da', borderBottom: '1px solid #f5c6cb', fontSize: '14px', margin: 0, },
    messageList: { flexGrow: 1, overflowY: 'auto', padding: '15px', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', },
    messageBubble: { maxWidth: '75%', padding: '8px 12px', borderRadius: '15px', marginBottom: '10px', wordWrap: 'break-word', lineHeight: '1.4', fontSize: '15px', position: 'relative', alignSelf: 'flex-start', backgroundColor: '#eee', color: '#333', },
    senderName: { fontWeight: 'bold', marginRight: '5px', color: '#007bff', fontSize: '13px', display: 'block', marginBottom: '3px',},
    messageContent: { fontSize: '15px',},
    timestamp: { fontSize: '10px', color: '#999', display: 'block', marginTop: '4px', },

    // --- 修改底部表单区域样式 ---
    messageForm: {
        display: 'flex',
        padding: '15px', // 增加内边距，让区域看起来更舒适
        borderTop: '1px solid #e0e0e0', // 顶部边框颜色变浅
        backgroundColor: '#ffffff', // 背景改为白色，更简洁
        alignItems: 'center',
        gap: '10px', // 输入框和按钮之间的间距
    },
    messageInput: {
        flexGrow: 1,
        padding: '10px 15px', // 调整内边距
        border: '1px solid #d0d0d0', // 边框颜色变浅
        borderRadius: '18px', // 可以稍微减小圆角，或者保持 25px
        fontSize: '15px',
        outline: 'none', // 移除默认的外框
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.075)', // 添加细微的内阴影
        transition: 'border-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out', // 添加过渡效果
    },
    // 可以添加 :focus 样式，但内联样式比较麻烦，这里省略，可以通过 CSS 类实现
    // messageInputFocus: {
    //   borderColor: '#80bdff',
    //   boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.075), 0 0 0 0.2rem rgba(0,123,255,.25)',
    // },
    sendButton: {
        padding: '10px 18px', // 调整内边距，与输入框更协调
        backgroundColor: '#007bff', // 保持蓝色主调
        color: 'white',
        border: 'none',
        borderRadius: '18px', // 与输入框保持一致
        cursor: 'pointer',
        fontSize: '15px',
        fontWeight: '500', // 字体可以不加粗，或者用 500/600
        transition: 'background-color 0.2s ease-in-out, opacity 0.2s ease', // 添加透明度过渡
        outline: 'none', // 移除外框
        display: 'flex', // 如果想加图标，方便对齐
        alignItems: 'center', // 如果想加图标，方便对齐
        justifyContent: 'center', // 如果想加图标，方便对齐
    },
    sendButtonDisabled: { // 禁用状态样式
        backgroundColor: '#6c757d', // 灰色
        cursor: 'not-allowed',
        opacity: 0.65, // 更明显的禁用状态
    },
};

export default Chat;