# MyChatApp - 高并发实时聊天室

[![Go Version](https://img.shields.io/badge/Go-1.21+-blue.svg)](https://golang.org)
[![WebSocket](https://img.shields.io/badge/WebSocket-实时通讯-green.svg)](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> 基于Go语言开发的高性能实时聊天系统，支持私聊、群聊、历史消息存储，已部署上线稳定运行。

## 🚀 在线体验
- **演示地址**：http://your-domain.com （你的域名）
- **测试账号**：test / 123456

## 📸 功能展示
![聊天界面](screenshots/chat.png)
![用户列表](screenshots/users.png)

## 🛠️ 技术架构

### 后端技术栈 (Go)
- **核心框架**：Go + Gin Web Framework
- **实时通讯**：WebSocket (gorilla/websocket)
- **数据存储**：MySQL (消息持久化) + Redis (在线状态/缓存)
- **并发处理**：Goroutine + Channel 实现高并发消息广播
- **部署运维**：Docker容器化 + Nginx反向代理 + 云服务器

### 前端技术栈
- **框架**：Vue 3 + Vite
- **UI组件**：Element Plus
- **实时通讯**：原生 WebSocket API

## ✨ 核心功能

### 已实现功能
- [x] **用户系统**：注册/登录/头像上传，JWT Token身份认证
- [x] **实时通讯**：WebSocket全双工通信，消息实时推送
- [x] **消息类型**：文本/表情/图片消息，支持消息撤回
- [x] **群聊管理**：创建群聊、邀请成员、群成员管理
- [x] **历史消息**：MySQL持久化存储，支持消息分页查询
- [x] **在线状态**：Redis记录用户在线状态，实时更新好友列表
- [x] **消息已读**：单聊消息已读回执，群聊已读人数统计

### 性能优化
- **高并发处理**：使用Goroutine池管理WebSocket连接，单机支持1000+并发连接
- **消息广播优化**：Channel解耦消息接收与广播，减少锁竞争
- **数据库优化**：消息表按时间分表，建立联合索引提升查询性能
- **缓存策略**：热点会话缓存于Redis，减少数据库查询压力

- ## 🚀 快速开始

### 环境要求
- Go 1.21+
- MySQL 5.7+
- Redis 6.0+
- Node.js 18+ (前端)

### 后端启动
```bash
cd backend
# 修改 config.yaml 中的数据库配置
go mod tidy
go run main.go
# 或编译运行
go build -o mychatapp && ./mychatapp
### 前端启动
cd frontend
npm install
npm run dev
