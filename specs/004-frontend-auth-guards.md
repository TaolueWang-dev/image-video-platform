# Specification: Frontend Auth Guards

Status: COMPLETE

## Feature: 登录页与前端权限守卫

### Overview
为现有前端增加登录页、登录态判断、受保护页面跳转、个人中心入口和后台入口可见性控制，同时尽量保持现有工作台布局与功能。

### User Stories
- As a terminal user, I want to be redirected to login when I’m not authenticated so that protected pages stay private.
- As a logged-in user, I want to see my profile entry and account summary so that I know I’m operating in my own workspace.

## Functional Requirements

### FR-1: 登录页
**Acceptance Criteria:**
- [x] 新增登录页，支持邮箱 + 验证码两步式交互
- [x] 登录成功后可跳回原目标页或默认首页

### FR-2: 受保护页面
**Acceptance Criteria:**
- [x] `/`、`/image`、`/video`、`/recharge` 未登录时跳转到登录页
- [x] 前端启动时通过 `GET /api/me` 判断登录态
- [x] 已登录用户能继续访问现有工作台能力

### FR-3: 入口与可见性
**Acceptance Criteria:**
- [x] 新增个人中心入口
- [x] 管理后台入口仅管理员可见
- [x] 桌面和移动端布局都可用

## Dependencies
- `001-auth-foundation` 已完成
- `002-user-owned-data` 已完成
- `003-admin-user-management` 已完成

## Completion Signal

### Implementation Checklist
- [x] 更新前端页面与 `public/app.js`
- [x] 保留或更新 smoke 所需 DOM 钩子
- [x] 增加前端登录态与路由保护验证

### Validation Commands

```bash
npm run check
bash tests/smoke.sh
```

**Only when ALL checks pass, output:** `<promise>DONE</promise>`
