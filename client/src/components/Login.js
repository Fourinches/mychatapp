// src/components/Login.js
import React, { useState } from 'react';
import axios from 'axios';
// 导入 Link 用于跳转到注册页
import { useNavigate, Link } from 'react-router-dom';
// 导入 setAuthToken 工具函数
import setAuthToken from '../utils/setAuthToken';

function Login() {
    const [formData, setFormData] = useState({
        email: '',
        password: '',
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const { email, password } = formData;

    const onChange = (e) =>
        setFormData({ ...formData, [e.target.name]: e.target.value });

    const onSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await axios.post('/api/auth/login', { email, password });

            console.log('登录成功:', res.data);

            if (res.data && res.data.token) {
                // --- 保存 Token ---
                localStorage.setItem('token', res.data.token);

                // --- 设置 Axios 请求头 ---
                setAuthToken(res.data.token); // <--- 调用导入的函数

                setLoading(false);
                navigate('/chat'); // 跳转到聊天页
            } else {
                throw new Error('登录响应无效，未收到 Token。');
            }

        } catch (err) {
            setLoading(false);
            const errorMsg = err.response?.data?.msg || err.message || '登录失败，请检查邮箱或密码。';
            console.error('登录错误:', err.response || err);
            setError(errorMsg);
            localStorage.removeItem('token'); // 登录失败清除 token
            setAuthToken(null); // <--- 登录失败也要清除 Axios 请求头
        }
    };

    return (
        <div style={stylesLogin.container}>
            <h2 style={stylesLogin.title}>登录</h2>
            {error && <p style={stylesLogin.error}>{error}</p>}
            <form onSubmit={onSubmit} style={stylesLogin.form}>
                <div style={stylesLogin.inputGroup}>
                    <label style={stylesLogin.label} htmlFor="email">邮箱:</label>
                    <input
                        style={stylesLogin.input}
                        type="email"
                        id="email"
                        name="email"
                        value={email}
                        onChange={onChange}
                        required
                        disabled={loading}
                        aria-required="true"
                    />
                </div>
                <div style={stylesLogin.inputGroup}>
                    <label style={stylesLogin.label} htmlFor="password">密码:</label>
                    <input
                        style={stylesLogin.input}
                        type="password"
                        id="password"
                        name="password"
                        value={password}
                        onChange={onChange}
                        required
                        disabled={loading}
                        aria-required="true"
                    />
                </div>
                <button
                    type="submit"
                    style={loading ? { ...stylesLogin.button, ...stylesLogin.buttonDisabled } : stylesLogin.button}
                    disabled={loading}
                >
                    {loading ? '正在登录...' : '登录'}
                </button>
            </form>
            {/* *** 添加注册链接 *** */}
            <p style={stylesLogin.registerLink}>
                还没有账户？ <Link to="/register">点此注册</Link>
            </p>
        </div>
    );
}

// 内联样式对象 (保持不变)
const stylesLogin = {
    container: { maxWidth: '400px', margin: '50px auto', padding: '30px', border: '1px solid #ccc', borderRadius: '8px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)', fontFamily: 'Arial, sans-serif', backgroundColor: '#f9f9f9', },
    title: { textAlign: 'center', color: '#333', marginBottom: '25px', },
    form: { display: 'flex', flexDirection: 'column', },
    inputGroup: { marginBottom: '20px', },
    label: { display: 'block', marginBottom: '5px', color: '#555', fontWeight: 'bold', },
    input: { width: '100%', padding: '12px 15px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box', fontSize: '16px', },
    button: { padding: '12px 20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', transition: 'background-color 0.2s ease', marginTop: '10px', },
    buttonDisabled: { backgroundColor: '#aaa', cursor: 'not-allowed', },
    error: { color: '#dc3545', backgroundColor: '#f8d7da', border: '1px solid #f5c6cb', padding: '10px', borderRadius: '4px', textAlign: 'center', marginBottom: '20px', fontSize: '14px', },
    registerLink: { textAlign: 'center', marginTop: '20px', fontSize: '14px', }
};

export default Login;