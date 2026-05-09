# Specification: Admin User Management

Status: COMPLETE

## Feature: 后台用户管理接口

### Overview
新增后台用户管理 API，支持创建用户、列表、详情、禁用/启用、查看订单和受控余额调整，并区分 `operator` 与 `super_admin` 权限。

### User Stories
- As an operator, I want to list and inspect users so that I can support operations.
- As a super admin, I want to create users and adjust balances so that I can manage onboarding and manual corrections.

## Functional Requirements

### FR-1: 后台用户 API
**Acceptance Criteria:**
- [x] 提供 `GET /api/admin/users`
- [x] 提供 `POST /api/admin/users`
- [x] 提供 `GET /api/admin/users/:id`
- [x] 提供 `POST /api/admin/users/:id/disable`
- [x] 提供 `POST /api/admin/users/:id/enable`
- [x] 提供 `GET /api/admin/users/:id/orders`

### FR-2: 后台余额调整
**Acceptance Criteria:**
- [x] 提供 `POST /api/admin/users/:id/balance-adjustments`
- [x] `operator` 无法做余额调整
- [x] `super_admin` 可执行余额调整并生成审计记录

### FR-3: 权限保护
**Acceptance Criteria:**
- [x] `/api/admin/*` 需要管理员会话
- [x] `operator` 与 `super_admin` 权限边界明确

## Dependencies
- `001-auth-foundation` 已完成
- `002-user-owned-data` 已完成

## Completion Signal

### Implementation Checklist
- [x] 增加后台用户管理路由与服务
- [x] 增加管理员权限校验
- [x] 增加管理接口测试

### Validation Commands

```bash
npm run check
bash tests/smoke.sh
```

**Only when ALL checks pass, output:** `<promise>DONE</promise>`
