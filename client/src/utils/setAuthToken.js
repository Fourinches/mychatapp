// src/utils/setAuthToken.js
import axios from 'axios';

const setAuthToken = token => {
    if (token) {
        // 如果 token 存在，应用到每个请求的 Authorization 头
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        console.log("Axios default header set with token.");
    } else {
        // 如果 token 不存在 (比如登出)，则删除该头
        delete axios.defaults.headers.common['Authorization'];
        console.log("Axios default header removed.");
    }
};

export default setAuthToken; // 导出函数