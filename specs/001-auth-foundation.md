# Specification: Auth Foundation

Status: COMPLETE

## Feature: 登录与会话基础设施

### Overview
为平台建立最小可用的认证基础设施，包括用户与管理员主体、邮箱验证码登录、服务端会话、`GET /api/me`、`POST /api/auth/logout`，并保持现有业务接口在未接入前端登录页之前尽量少破坏。

### User Stories
- As a terminal user, I want to receive an email verification code for an existing account so that I can log in without a password.
- As a super admin, I want a seed admin account so that the system can be initialized without manual data seeding.

## Functional Requirements

### FR-1: 用户与管理员模型
**Acceptance Criteria:**
- [x] 数据层新增 `users`、`admin_users`、`sessions`、`email_login_codes`
- [x] `users.status` 支持 `pending_activation`、`active`、`disabled`
- [x] `super_admin` 种子账号可通过环境变量幂等创建

### FR-2: 邮箱验证码认证
**Acceptance Criteria:**
- [x] 提供 `POST /api/auth/email/request-code`
- [x] 提供 `POST /api/auth/email/verify-code`
- [x] 提供 `POST /api/auth/logout`
- [x] 提供 `GET /api/me`
- [x] 不存在或禁用用户不能完成登录
- [x] 会话通过 `HttpOnly` Cookie 持有并可服务端撤销

### FR-3: 基础限制与审计
**Acceptance Criteria:**
- [x] 验证码默认 6 位数字、5 分钟过期、单次可用
- [x] 请求验证码对邮箱和 IP 做最小限流
- [x] 管理员登录与用户登录写入审计日志或等价事件记录

## Dependencies
- SMTP 配置或本地开发降级方案
- 现有 JSON 数据目录 `data/`

## Assumptions
- 首版继续使用本地 JSON 存储，不在本 spec 中引入 PostgreSQL
- 首版允许开发环境通过日志观察验证码，不强依赖真实邮件投递

## Relevant Files
- `src/store.js`
- `src/api-router.js`
- `src/config.js`
- `src/server.js`
- `src/utils.js`
- `tests/smoke.sh`
- `README.md`
- `.env.example`

Avoid exploring unrelated directories such as `page/` and `SDK/` for this spec.

## Completion Signal

### Implementation Checklist
- [x] 扩展存储层支持用户、管理员、验证码、会话、审计
- [x] 实现认证服务和认证路由
- [x] 配置项支持管理员种子和 SMTP/开发模式验证码发送
- [x] 为认证接口补充测试

### Validation Commands

```bash
npm run check
bash tests/smoke.sh
```

**Only when ALL checks pass, output:** `<promise>DONE</promise>`
