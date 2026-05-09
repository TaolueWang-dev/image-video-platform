# Specification: User Owned Data

Status: COMPLETE

## Feature: 用户归属的数据与充值入账

### Overview
将当前全站共享账户和业务记录切换为按 `user_id` 归属。充值、订单、图像历史、视频任务、支付事件都必须关联到用户，支付回调入账只能影响订单所属用户。

### User Stories
- As a terminal user, I want to see only my own balance and records so that my data is isolated from others.
- As an operator, I want payment completion to credit only the correct user so that finance data stays accurate.

## Functional Requirements

### FR-1: 账户和订单归属
**Acceptance Criteria:**
- [x] 数据层新增或扩展 `accounts` 与 `orders` 的 `userId`
- [x] 新充值订单必须记录 `userId`
- [x] `GET /api/account` 仅返回当前用户账户
- [x] `GET /api/recharge/orders` 仅返回当前用户订单

### FR-2: 图像和视频记录归属
**Acceptance Criteria:**
- [x] 图像历史只返回当前用户数据
- [x] 视频任务与视频历史只返回当前用户数据
- [x] 现有写入路径在不改业务能力的前提下自动带上当前用户归属

### FR-3: 支付回调入账
**Acceptance Criteria:**
- [x] 君徕支付成功回调只给订单所属用户入账
- [x] 支付事件幂等仍然有效
- [x] 历史共享 JSON 数据不自动迁移给新用户

## Dependencies
- `001-auth-foundation` 已完成

## Completion Signal

### Implementation Checklist
- [x] 重构存储层查询接口为按用户读取
- [x] 重构支付与媒体服务以传递当前用户上下文
- [x] 补充用户隔离与支付入账测试

### Validation Commands

```bash
npm run check
bash tests/smoke.sh
SMOKE_WRITE=1 bash tests/smoke.sh
```

**Only when ALL checks pass, output:** `<promise>DONE</promise>`
