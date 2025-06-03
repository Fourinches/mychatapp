// src/App.js
import React from 'react';
// 确保导入 Navigate 用于重定向
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
// 不再需要在此导入 axios
import Login from './components/Login';
import Register from './components/Register';
import Chat from './components/Chat';
import setAuthToken from "./utils/setAuthToken"; // <--- 导入工具函数
import './App.css'; // 引入全局样式（如果需要）

// --- 初始 Token 检查 ---
// 检查 localStorage 中是否已有 token (例如用户刷新页面后)
const token = localStorage.getItem('token');
if (token) {
  setAuthToken(token); // <--- 调用导入的函数
}
// --- 结束检查 ---

function App() {
  // 登出函数示例 (实际应用中可能放在 Context 或 Redux 中)
  // const handleLogout = (navigate) => { // 需要传入 navigate hook
  //   localStorage.removeItem('token');
  //   setAuthToken(null); // <--- 调用导入的函数来清除 header
  //   navigate('/login');
  // };

  return (
      <Router>
        <div className="App">
          {/* 你可以在这里添加一个全局的 Header/Navbar */}
          <Routes>
            {/* 使用 Navigate 将根路径重定向到登录页 */}
            <Route path="/" element={<Navigate to="/login" replace />} />

            {/* 登录页路由 */}
            <Route path="/login" element={<Login />} />

            {/* 注册页路由 */}
            <Route path="/register" element={<Register />} />

            {/* 聊天页路由 (后续可能需要添加保护逻辑) */}
            {/* <Route path="/chat.css" element={<ProtectedRoute><Chat /></ProtectedRoute>} /> */}
            <Route path="/chat" element={<Chat />} />

            {/* 可以添加一个 404 Not Found 页面 */}
            {/* <Route path="*" element={<div>404 - 页面未找到</div>} /> */}
          </Routes>
        </div>
      </Router>
  );
}

export default App;