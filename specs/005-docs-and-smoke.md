# Specification: Docs And Smoke

Status: COMPLETE

## Feature: 文档、环境变量和验收收口

### Overview
更新项目文档、环境变量说明、运行说明与 smoke，使新的用户体系、后台管理和支付归属流程可被开发与运维人员理解和验证。

### User Stories
- As a maintainer, I want the new auth and user management flow documented so that I can deploy and operate it.

## Functional Requirements

### FR-1: 文档更新
**Acceptance Criteria:**
- [x] README 说明新的登录方式、管理员种子、受保护页面和数据归属
- [x] `.env.example` 覆盖认证和管理员相关配置
- [x] 如有必要，新增专门的登录/用户管理文档

### FR-2: Smoke 与验证
**Acceptance Criteria:**
- [x] smoke 覆盖未登录跳转或登录前置行为
- [x] smoke 覆盖至少一条认证后的核心读取链路
- [x] 如实现了开发模式验证码，提供可重复的本地验证方式

## Dependencies
- `001-auth-foundation` 已完成
- `002-user-owned-data` 已完成
- `003-admin-user-management` 已完成
- `004-frontend-auth-guards` 已完成

## Completion Signal

### Implementation Checklist
- [x] 更新 README 与 `.env.example`
- [x] 调整 smoke 和相关脚本
- [x] 将所有已完成 spec 标记为 `Status: COMPLETE`

### Validation Commands

```bash
npm run check
bash tests/smoke.sh
SMOKE_WRITE=1 bash tests/smoke.sh
```

**Only when ALL checks pass, output:** `<promise>DONE</promise>`
