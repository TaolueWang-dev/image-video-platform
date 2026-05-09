# 登录系统与用户管理系统设计方案

## Summary

为现有平台新增一套面向终端用户的正式账号体系，并同时提供后台用户管理能力。首版以 PostgreSQL 为目标，采用“管理员创建账号 + 邮箱验证码登录 + Cookie 会话”的无密码方案；终端用户拥有自己的余额、订单、图像历史、视频任务与会话，后台采用 `super_admin` / `operator` 两级权限。现有 JSON 共享数据保留为系统历史数据，不自动迁移到任何用户。

## Key Changes

### 账号与权限模型

- 新增用户主体 `users`，核心字段至少包含：`id`、`email`、`status`、`display_name`、`created_at`、`last_login_at`。
- `users.status` 首版固定支持：`pending_activation`、`active`、`disabled`。
- 新增后台管理员角色模型，首版只支持两级：`super_admin`、`operator`。
- 用户与后台管理员分开建模：
  终端用户是业务用户；管理员通过单独的 `admin_users` 或 `user_roles` 视图持有后台权限，避免把所有终端用户都暴露为后台主体。
- 第一个 `super_admin` 通过环境变量种子幂等创建；服务启动时检测，不存在则自动创建。

### 登录与会话

- 采用邮箱验证码登录，不做密码体系，不做短信，不做微信 OAuth。
- 注册策略为“管理员创建账号”：
  后台先创建用户并写入邮箱，用户首次通过邮箱验证码完成激活和登录。
- 登录流程拆成两步：
  `POST /api/auth/email/request-code`
  `POST /api/auth/email/verify-code`
- 验证码表 `email_login_codes` 至少记录：`user_id`、`email`、`code_hash`、`purpose`、`expires_at`、`used_at`、`attempt_count`。
- 验证码只发给已存在且未禁用的账号；未存在账号不自动注册。
- 会话采用服务端会话 + HttpOnly Cookie：
  新增 `sessions` 表，字段至少含 `id`、`subject_type`、`subject_id`、`expires_at`、`revoked_at`、`ip`、`user_agent`。
- Cookie 首版默认：
  `HttpOnly`、`SameSite=Lax`、生产环境 `Secure`、服务端可撤销。
- 新增认证相关接口最少包括：
  `POST /api/auth/email/request-code`
  `POST /api/auth/email/verify-code`
  `POST /api/auth/logout`
  `GET /api/me`
- 后台会话和终端用户会话可共用同一会话表，但 `subject_type` 必须区分 `user` / `admin`。

### 用户管理与数据归属

- 用户自助侧首版包含：
  查看个人资料、查看余额、查看自己的充值订单、查看自己的图像历史、查看自己的视频任务与会话。
- 后台管理侧首版包含：
  用户列表、用户详情、禁用/启用用户、手动创建用户、查看用户订单、查看用户资产、余额调整。
- 余额从“全站单账户”改为“每用户一账户”：
  新增 `accounts` 表，按 `user_id` 一对一关联。
- 订单、图像历史、视频任务、支付事件全部改为显式挂 `user_id`。
- 现有 `account.json`、`orders.json`、`image-history.json`、`video-tasks.json`、`payment-events.json` 不做自动归属迁移：
  上线后视为系统历史数据，只允许后台通过单独“历史数据”视图查看或导出。
- 君徕充值成功后的入账逻辑改为：
  根据订单上的 `user_id` 增加对应用户账户余额，而不是全站共享余额。

### 数据库与接口边界

- 首版目标数据库为 PostgreSQL。
- 推荐新增核心表：
  `users`
  `admin_users` 或 `user_roles`
  `accounts`
  `sessions`
  `email_login_codes`
  `recharge_orders`
  `payment_events`
  `image_histories`
  `video_tasks`
  `audit_logs`
- 所有业务查询接口默认切到“按当前登录用户隔离”：
  `GET /api/account` 只返回当前用户账户
  `GET /api/recharge/orders` 只返回当前用户订单
  图像/视频历史接口只返回当前用户数据
- 后台管理接口统一走 `/api/admin/*` 命名空间，避免和终端用户 API 混用。
- 推荐新增后台接口最少包括：
  `GET /api/admin/users`
  `POST /api/admin/users`
  `GET /api/admin/users/:id`
  `POST /api/admin/users/:id/disable`
  `POST /api/admin/users/:id/enable`
  `POST /api/admin/users/:id/balance-adjustments`
  `GET /api/admin/users/:id/orders`
- 所有高风险后台操作写 `audit_logs`：
  用户创建、禁用/启用、角色变更、余额调整、管理员登录。

### 前端形态

- 新增独立登录页，采用邮箱输入 + 验证码输入的两步式交互。
- 现有 `/`、`/image`、`/video`、`/recharge` 页面改成受保护页面，未登录统一跳转登录页。
- 前端启动时先请求 `GET /api/me` 判断登录态，不再假设默认存在全站共享账户。
- 新增用户个人中心入口，展示邮箱、昵称、账户余额、最近订单。
- 新增后台管理入口，仅 `super_admin` / `operator` 可见。
- 后台 UI 首版只需列表与详情管理，不要求复杂 BI 面板。
- 终端用户和后台管理员可共用同一前端项目，但路由和权限守卫必须分开。

### 基础设施默认

- 邮件发送首版按 SMTP 配置设计，环境变量提供 SMTP 主机、端口、用户名、密码、发件人。
- 验证码默认 6 位数字，5 分钟过期，单次只能使用一次。
- 验证码请求要按邮箱和 IP 限流。
- `super_admin` 种子账号通过环境变量提供邮箱，服务启动时幂等创建为激活态。

## Test Plan

- 认证流程：
  已存在用户可请求邮箱验证码并完成登录。
  不存在用户请求验证码返回统一失败响应，不泄露用户存在性。
  禁用用户无法登录。
  验证码过期、重复使用、连续输错都被拒绝。
  登出后会话失效。
- 权限隔离：
  普通用户只能看到自己的账户、订单、图像历史、视频任务。
  `operator` 可查用户，但不能做余额调整和角色管理。
  `super_admin` 可创建用户、禁用用户、调余额。
- 数据归属：
  新建充值订单必须带 `user_id`。
  君徕回调成功后，只给订单所属用户入账。
  历史共享 JSON 数据不自动落到任一新用户。
- 前端体验：
  未登录访问工作台页面会跳转登录。
  登录后可返回原目标页。
  后台入口仅在管理员登录态可见。
- 迁移与兼容：
  新数据库表可独立建好，不依赖现有 JSON 文件继续作为主存储。
  旧 smoke 需拆分为未登录场景和已登录场景两套。

## Assumptions

- 首版不做公开注册，所有终端用户都由管理员创建。
- 首版不做密码，不做短信，不做微信登录，只做邮箱验证码登录。
- 首版使用 PostgreSQL 作为正式目标数据库。
- 首版使用服务端会话 Cookie，不采用纯 JWT。
- 首版邮件能力通过 SMTP 提供，不绑定特定邮件服务商。
- 首版保留现有共享 JSON 数据作为历史数据，不做自动归属迁移。
- 首个 `super_admin` 由环境变量种子自动创建。
