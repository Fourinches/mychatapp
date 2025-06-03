// src/components/Register.js
import React, { useState } from 'react';
import axios from 'axios';
// 导入 Link 用于跳转回登录页
import { useNavigate, Link } from 'react-router-dom';
// 导入 setAuthToken 工具函数
import setAuthToken from '../utils/setAuthToken';

function Register() {
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        password2: '', // 用于确认密码
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const { username, email, password, password2 } = formData;

    const onChange = (e) =>
        setFormData({ ...formData, [e.target.name]: e.target.value });

    const onSubmit = async (e) => {
        e.preventDefault();
        setError(''); // 清除之前的错误

        // 基本验证
        if (!username || !email || !password || !password2) {
            setError('请填写所有字段。');
            return;
        }
        if (password !== password2) {
            setError('两次输入的密码不匹配。');
            return;
        }
        if (password.length < 6) {
            setError('密码长度至少需要6位。');
            return;
        }

        setLoading(true); // 开始加载
        try {
            const newUser = {
                username,
                email,
                password,
            };

            const res = await axios.post('/api/auth/register', newUser);

            console.log('注册成功:', res.data);

            if (res.data && res.data.token) {
                // 注册成功，存储 token (用户自动登录)
                localStorage.setItem('token', res.data.token);

                // --- 设置 Axios 请求头 ---
                setAuthToken(res.data.token); // <--- 调用导入的函数

                setLoading(false); // 停止加载
                navigate('/chat'); // 跳转到聊天页面
            } else {
                // 可能后端没有在注册成功后返回 token，根据你的后端逻辑处理
                throw new Error("注册成功，但未收到 Token。可能需要跳转到登录页。");
                // 或者直接 navigate('/login');
            }

        } catch (err) {
            setLoading(false); // 出错时停止加载
            console.error('注册错误:', err.response ? err.response.data : err.message);

            const errorMsg = err.response?.data?.msg || err.message || '注册失败，请重试。';
            setError(errorMsg);

            // 确保注册失败时移除 token
            localStorage.removeItem('token');
            // --- 清除 Axios 请求头 ---
            setAuthToken(null); // <--- 注册失败也要清除 Axios 请求头
        }
    };

    return (
        <div style={styles.container}>
            <h2>注册</h2>
            {error && <p style={styles.errorText}>{error}</p>}
            <form onSubmit={onSubmit} style={styles.form}>
                <div style={styles.formGroup}>
                    <label htmlFor="username" style={styles.label}>用户名:</label>
                    <input
                        type="text"
                        id="username"
                        name="username"
                        value={username}
                        onChange={onChange}
                        required
                        style={styles.input}
                        disabled={loading}
                    />
                </div>
                <div style={styles.formGroup}>
                    <label htmlFor="email" style={styles.label}>邮箱:</label>
                    <input
                        type="email"
                        id="email"
                        name="email"
                        value={email}
                        onChange={onChange}
                        required
                        style={styles.input}
                        disabled={loading}
                    />
                </div>
                <div style={styles.formGroup}>
                    <label htmlFor="password" style={styles.label}>密码:</label>
                    <input
                        type="password"
                        id="password"
                        name="password"
                        value={password}
                        onChange={onChange}
                        required
                        minLength="6"
                        style={styles.input}
                        disabled={loading}
                    />
                </div>
                <div style={styles.formGroup}>
                    <label htmlFor="password2" style={styles.label}>确认密码:</label>
                    <input
                        type="password"
                        id="password2"
                        name="password2"
                        value={password2}
                        onChange={onChange}
                        required
                        minLength="6"
                        style={styles.input}
                        disabled={loading}
                    />
                </div>
                <button type="submit" disabled={loading} style={loading ? {...styles.button, ...styles.buttonDisabled} : styles.button}>
                    {loading ? '正在注册...' : '注册'}
                </button>
            </form>
            {/* *** 添加登录链接 *** */}
            <p style={styles.linkText}>
                已有账户？ <Link to="/login">点此登录</Link>
            </p>
        </div>
    );
}

// 内联样式对象 (保持不变)
const styles = {
    container: { maxWidth: '400px', margin: '50px auto', padding: '30px', border: '1px solid #ccc', borderRadius: '8px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)', fontFamily: 'Arial, sans-serif', backgroundColor: '#f9f9f9', textAlign: 'center',},
    form: { display: 'flex', flexDirection: 'column', },
    formGroup: { marginBottom: '20px', textAlign: 'left', },
    label: { display: 'block', marginBottom: '5px', color: '#555', fontWeight: 'bold', },
    input: { width: '100%', padding: '12px 15px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box', fontSize: '16px', },
    button: { padding: '12px 20px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', transition: 'background-color 0.2s ease', marginTop: '10px', },
    buttonDisabled: { backgroundColor: '#aaa', cursor: 'not-allowed', },
    errorText: { color: '#dc3545', backgroundColor: '#f8d7da', border: '1px solid #f5c6cb', padding: '10px', borderRadius: '4px', textAlign: 'center', marginBottom: '20px', fontSize: '14px', },
    linkText: { textAlign: 'center', marginTop: '20px', fontSize: '14px', } // 添加链接样式
};


export default Register;
