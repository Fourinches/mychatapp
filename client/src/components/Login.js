// src/components/Login.js
import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import setAuthToken from '../utils/setAuthToken';

// --- Import the CSS Module ---
// Ensure the CSS file is named Login.module.css and in the same directory
import styles from './Login.module.css';

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
                setAuthToken(res.data.token);

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
            setAuthToken(null); // 登录失败也要清除 Axios 请求头
        }
    };

    return (
        // --- Apply styles using className from the imported CSS Module ---
        <div className={styles.container}> {/* Full page container with background */}
            <div className={styles.loginBox}> {/* Inner box with acrylic effect */}
                <h2 className={styles.title}>登录</h2> {/* Title style */}
                {error && <p className={styles.error}>{error}</p>} {/* Error message style */}
                <form onSubmit={onSubmit} className={styles.form}> {/* Form style */}
                    <div className={styles.inputGroup}> {/* Input group style */}
                        <label className={styles.label} htmlFor="email">邮箱:</label> {/* Label style */}
                        <input
                            className={styles.input} // Input style
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
                    <div className={styles.inputGroup}> {/* Input group style */}
                        <label className={styles.label} htmlFor="password">密码:</label> {/* Label style */}
                        <input
                            className={styles.input} // Input style
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
                        // Dynamically apply base and disabled classes using template literal
                        className={`${styles.button} ${loading ? styles.buttonDisabled : ''}`}
                        disabled={loading}
                    >
                        {loading ? '正在登录...' : '登录'}
                    </button>
                </form>
                {/* Registration link */}
                <p className={styles.registerLink}> {/* Register link container style */}
                    还没有账户？ <Link to="/register">点此注册</Link>
                </p>
            </div>
        </div>
    );
}

// The old inline styles object 'stylesLogin' is no longer needed and has been removed.

export default Login;
