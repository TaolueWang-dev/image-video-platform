# Image Video Platform

一个面向中文场景的聚合站点骨架，当前提供：

- 邮箱验证码登录、服务端会话与种子超级管理员
- OpenAI 兼容文生图代理
- SeedDance 文生视频任务创建、查询、回调入库
- 君徕聚合支付充值下单、查单与异步通知入账
- 人民币余额账户、账单流水与生成扣费
- 单页前端工作台
- 纯 Node.js built-ins 后端，便于直接容器化
- 可配置 SMTP 验证码发信

## 目录结构

```text
src/                  后端服务
public/               单页前端
data/                 本地 JSON 数据
deploy/               部署样例
scripts/              多 agent 与运维脚本
tests/smoke.sh        HTTP 烟测
```

## 本地运行

```bash
cp .env.example .env
node src/server.js
```

默认地址是 `http://localhost:3000`。

## 认证基础设施

当前仓库已经落地最小可用认证层：

- `users.json`、`admin-users.json`、`sessions.json`、`email-login-codes.json`、`audit-log.json`
- `POST /api/auth/register`
- `POST /api/auth/password/login`
- `POST /api/auth/email/request-code`
- `POST /api/auth/email/verify-code`
- `POST /api/auth/logout`
- `GET /api/me`
- `/login` 登录页与前端路由守卫
- `/profile` 个人中心入口
- `/admin` 管理后台入口（仅管理员可见）

登录方式现在分成两条：

- 普通用户：可在 `/login` 直接公开注册并设置密码；注册时需要邮箱验证码激活，激活后仅支持密码登录
- 管理员：不开放公开注册；可为种子管理员配置固定密码直接登录

主体约束：

- 普通用户：必须是 `status=active` 的 `users` 记录
- 管理员：必须是 `status=active` 的 `admin_users` 记录

会话通过 `HttpOnly` Cookie 保存，服务端可撤销。当前前端在启动时会通过 `GET /api/me` 判断登录态，未登录访问 `/`、`/image`、`/video`、`/recharge`、`/profile`、`/admin` 时会跳转到 `/login`。

密码策略默认通过环境变量控制：

```bash
AUTH_REGISTRATION_ENABLED=true
AUTH_PASSWORD_MIN_LENGTH=8
```

### 超级管理员种子

如果设置了 `SUPER_ADMIN_EMAIL`，服务启动时会幂等写入一个 `role=super_admin` 的管理员账号。如果同时设置了 `SUPER_ADMIN_PASSWORD`，则可以直接用邮箱和密码登录，不需要额外手工灌库。

### 本地开发验证码

开发环境推荐：

```bash
AUTH_EMAIL_DELIVERY_MODE=log
AUTH_EXPOSE_DEV_CODE=true
SUPER_ADMIN_EMAIL=admin@example.com
SUPER_ADMIN_PASSWORD=change-me-now
```

这样请求验证码时会：

- 在服务日志里打印验证码
- 在接口响应的 `delivery.devCode` 中返回验证码，方便 smoke 或手工联调

生产环境建议：

- `AUTH_EMAIL_DELIVERY_MODE=smtp`
- `AUTH_EXPOSE_DEV_CODE=false`
- 配置真实 SMTP 发件账号

### SMTP 发信配置

如果要把验证码真正发送到邮箱，至少配置：

```bash
AUTH_EMAIL_DELIVERY_MODE=smtp
AUTH_EXPOSE_DEV_CODE=false
AUTH_EMAIL_SMTP_HOST=smtp.example.com
AUTH_EMAIL_SMTP_PORT=587
AUTH_EMAIL_SMTP_SECURE=false
AUTH_EMAIL_SMTP_USERNAME=mailer@example.com
AUTH_EMAIL_SMTP_PASSWORD=your-smtp-password
AUTH_EMAIL_SMTP_FROM_EMAIL=mailer@example.com
AUTH_EMAIL_SMTP_FROM_NAME=Astral Forge
```

可选字段：

- `AUTH_EMAIL_SMTP_REPLY_TO`
- `AUTH_EMAIL_SMTP_SECURE=true`：常用于 465 端口

当前 SMTP 发送链路会覆盖：

- 用户注册激活验证码
- 邮箱验证码请求接口 `POST /api/auth/email/request-code`

## 快速验活

服务启动后执行：

```bash
npm run smoke
```

默认会检查登录页、个人中心、后台入口以及主要工作台页面和只读接口：

- `GET /`
- `GET /login`
- `GET /profile`
- `GET /admin`
- `GET /image`
- `GET /video`
- `GET /recharge`

- 前端受保护页面的登录前置逻辑（`public/app.js` 中的 `redirectToLogin` 合约）
- `GET /api/health`
- `GET /api/config`
- `GET /api/me`
- `POST /api/auth/logout`
- `GET /api/account`
- `GET /api/images/history?limit=1`
- `GET /api/videos/tasks?limit=1`
- `GET /api/videos/history?limit=1`
- `GET /api/recharge/orders?limit=1`
- `GET /api/billing/events?limit=1`

## 人民币计费规则

- 账户余额统一按人民币分存储，前端按元展示
- 图片生成按 `¥0.15 * n` 预估与扣费
- 视频生成按 `¥1.50 * durationSeconds` 预估与扣费
- 充值成功、图片扣费、视频扣费、管理员调账都会写入 `billing-events.json`
- 用户可通过 `GET /api/billing/events` 查看自己的最近账单流水

如果你要顺便验证充值下单链路：

```bash
SMOKE_WRITE=1 npm run smoke
```

这会额外调用：

- `POST /api/recharge/orders`

如果你希望 smoke 顺便跑一遍邮箱验证码登录链路，先确保：

- `.env` 里有 `SUPER_ADMIN_EMAIL`
- `AUTH_EXPOSE_DEV_CODE=true`

然后 `tests/smoke.sh` 会自动读取 `.env` 中的 `SUPER_ADMIN_EMAIL` 来请求验证码并完成一次登录校验。也可以显式覆盖：

```bash
SMOKE_AUTH_EMAIL=admin@example.com SMOKE_AUTH_SUBJECT_TYPE=admin npm run smoke
```

默认的 in-process smoke 会使用临时数据目录，并强制充值链路走 `integrationMode=skeleton`，这样本地可以重复执行，不会污染正式 `data/`，也不会依赖外网支付网关。

写链路 smoke 还会校验回执里至少保留这些字段形状，避免页面替换后财务中心拿不到基础支付信息：

- `id`
- `channel=alipay`
- `amount=100`
- `paymentProvider=junliai`

## Docker 部署

### 构建镜像

```bash
docker build -t image-video-platform .
```

### 直接运行

```bash
docker run --rm \
  -p 3000:3000 \
  --env-file .env \
  -v image-video-platform-data:/app/data \
  image-video-platform
```

### Compose 运行

样例文件见 [deploy/docker-compose.yml](deploy/docker-compose.yml)。

```bash
cp .env.example .env
cp deploy/.env.example deploy/.env
cd deploy
docker compose up -d --build
```

首次对外部署 HTTPS 时，直接按下面的“单机 HTTPS 配置”执行，不要跳过域名和证书准备步骤。

默认会启动：

- `app`: Node 服务
- `nginx`: 反向代理

反向代理样例见 [deploy/nginx.conf](deploy/nginx.conf)。

### 单机 HTTPS 配置

根目录 `.env` 负责应用本身，至少需要把 `PUBLIC_BASE_URL` 改成外部可访问域名：

```bash
PUBLIC_BASE_URL=https://your-domain.example
```

`deploy/.env` 负责 Nginx 和 Certbot，至少需要设置：

```bash
NGINX_SERVER_NAME=your-domain.example
NGINX_SSL_CERTIFICATE=/etc/letsencrypt/live/your-domain.example/fullchain.pem
NGINX_SSL_CERTIFICATE_KEY=/etc/letsencrypt/live/your-domain.example/privkey.pem
CERTBOT_EMAIL=ops@your-domain.example
CERTBOT_DOMAINS=your-domain.example
```

推荐先在宿主机安装 `certbot`，然后使用当前仓库自带的脚本初始化 HTTPS。脚本会优先使用宿主机 `certbot`，只有在宿主机没有安装而且本地已有 `certbot/certbot` 镜像时，才会回退到 Docker 方式。

1. 先确认域名已经解析到这台服务器，并且 80/443 端口已放通。
2. 复制并修改配置文件：

```bash
cp .env.example .env
cp deploy/.env.example deploy/.env
```

3. 在服务器上安装 `certbot`：

```bash
apt-get update
apt-get install -y certbot
```

4. 修改根目录 `.env` 中的 `PUBLIC_BASE_URL`，以及 `deploy/.env` 中的域名、证书路径和 `CERTBOT_EMAIL`。
5. 运行初始化脚本。脚本会自动：
   - 创建 `certbot` 目录
   - 生成临时自签名证书
   - 启动 `app` 和 `nginx`
   - 调用 Certbot 申请正式证书
   - 重启 `nginx` 载入正式证书

```bash
cd deploy
./setup-https.sh
```

如果你只想先验证流程、不触发正式签发，可以在 `deploy/.env` 里设置：

```bash
CERTBOT_STAGING=1
```

证书续期时执行：

```bash
cd deploy
./renew-https.sh
```

后续常规更新代码并重启服务时执行：

```bash
cd deploy
./server-up.sh
```

如果你已经有现成证书，也可以只改 `deploy/.env` 里的 `NGINX_SSL_CERTIFICATE` 和 `NGINX_SSL_CERTIFICATE_KEY` 指向挂载后的容器内路径，然后直接启动：

```bash
cd deploy
./server-up.sh
```

当前 Nginx 配置已经模板化，不需要再手工修改 [deploy/nginx.conf](deploy/nginx.conf) 里的域名；改 `deploy/.env` 即可。

这些脚本会优先使用 `docker compose`，如果服务器还是老版本 Docker，也会自动回退到 `docker-compose`。对于 `docker-compose 1.29.x`，脚本会先清理旧服务容器，绕过常见的 `ContainerConfig` 重建错误。证书申请则优先使用宿主机 `certbot`，如果宿主机没有安装，才会尝试使用本地已有的 `certbot/certbot` 镜像。

## 环境变量

建议至少配置下面这些字段：

### 基础运行

- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `PORT=3000`
- `DATA_DIR=data`
- `PUBLIC_BASE_URL=https://your-domain.example`

`PUBLIC_BASE_URL` 会被用来生成：

- 视频任务回调地址
- 聚合支付通知地址

HTTPS 反向代理相关参数见 [deploy/.env.example](deploy/.env.example)。

### 认证与管理员

- `AUTH_SESSION_COOKIE_NAME`
- `AUTH_SESSION_TTL_MS`
- `AUTH_CODE_LENGTH`
- `AUTH_CODE_TTL_MS`
- `AUTH_EMAIL_REQUEST_LIMIT_WINDOW_MS`
- `AUTH_EMAIL_REQUEST_LIMIT_PER_EMAIL`
- `AUTH_EMAIL_REQUEST_LIMIT_PER_IP`
- `AUTH_EMAIL_DELIVERY_MODE`
- `AUTH_EXPOSE_DEV_CODE`
- `AUTH_EMAIL_SMTP_HOST`
- `AUTH_EMAIL_SMTP_PORT`
- `AUTH_EMAIL_SMTP_SECURE`
- `AUTH_EMAIL_SMTP_USERNAME`
- `AUTH_EMAIL_SMTP_PASSWORD`
- `AUTH_EMAIL_SMTP_FROM_EMAIL`
- `AUTH_EMAIL_SMTP_FROM_NAME`
- `AUTH_EMAIL_SMTP_REPLY_TO`
- `SUPER_ADMIN_EMAIL`
- `SUPER_ADMIN_ROLE`

### 文生图

- `OPENAI_IMAGE_BASE_URL`
- `OPENAI_IMAGE_API_KEY`
- `OPENAI_IMAGE_MODEL`

兼容旧字段：

- `base_url`
- `api_key`
- `model_name`

### 文生视频

- `SEEDDANCE_API_KEY`
- `SEEDDANCE_MODEL`

### 君徕聚合支付

- `JUNLIAI_PAY_PID`
- `JUNLIAI_PAY_PRIVATE_KEY`
- `JUNLIAI_PAY_PLATFORM_PUBLIC_KEY`
- `JUNLIAI_PAY_NOTIFY_URL`
- `JUNLIAI_PAY_RETURN_URL`
- `JUNLIAI_PAY_CREATE_URL`
- `JUNLIAI_PAY_QUERY_URL`
- `JUNLIAI_PAY_SUBMIT_URL`

完整样例见 [.env.example](/Users/wangtaolve/image-video-platform/.env.example:1)。

## 页面与接口对齐

当前前端工作区拆成四个页面入口：

- `/`：概览看板，依赖账户摘要、最近订单、最近视频任务
- `/image`：图像生成工作台，依赖运行时配置、图像历史、图像生成接口
- `/video`：视频生成工作台，依赖视频任务列表、视频历史、视频生成接口
- `/recharge`：财务中心，依赖账户信息、订单列表、充值下单接口

页面替换时至少要保留这些契约：

- 静态路由 `/`、`/image`、`/video`、`/recharge` 必须继续返回对应 HTML 页面
- `public/app.js` 依赖的核心挂载点不能删除，例如表单、线程容器、最近订单/任务容器、支付回执容器
- 财务中心提交 `POST /api/recharge/orders` 后，前端至少假设响应里能拿到订单标识、充值金额、支付渠道和 `paymentProvider`

## 已实现接口

- `GET /api/health`
- `GET /api/me`
- `GET /api/account`
- `POST /api/auth/email/request-code`
- `POST /api/auth/email/verify-code`
- `POST /api/auth/logout`
- `POST /api/images/generations`
- `POST /api/videos/generations`
- `GET /api/videos/tasks/:taskId`
- `POST /api/videos/tasks/callback`
- `GET /api/recharge/orders`
- `POST /api/recharge/orders`
- `GET /api/payments/junliai/notify`

`POST /api/videos/generations` 兼容两种入参：

- 纯文本：继续传 `prompt`，后端会转成 SeedDance `content: [{ type: "text", text: "..." }]`
- 图文混合：可在 `prompt` 之外附带 `attachments`（也兼容 `inputAttachments`、`imageAttachments`）数组；每项需要 `role`（`first_frame` / `last_frame` / `reference_image`）以及图片地址字段之一：`url`、`image_url`、`dataUrl`、`data_url`、`src`

示例：

```json
{
  "prompt": "让人物从静止逐渐转身看向镜头",
  "attachments": [
    {
      "role": "first_frame",
      "url": "data:image/png;base64,..."
    },
    {
      "role": "reference_image",
      "image_url": "https://example.com/reference.png"
    }
  ]
}
```

## 支付接入说明

- 充值入口统一走君徕聚合支付，不再保留微信/支付宝官方直连。
- 本地接口建议继续使用 `POST /api/recharge/orders`，前端仍传 `channel`，当前约定值为 `alipay` 或 `wechat`；服务端把 `wechat` 映射到上游 `wxpay`。
- 下单后前端不要假设一定拿到二维码，按 `pay_type` 和 `pay_info` 渲染即可，可能是二维码内容、跳转链接或表单片段。
- 如果本地没有配置君徕商户密钥，`POST /api/recharge/orders` 仍会返回一个 `integrationMode=skeleton` 的聚合支付回执，方便联调前端和跑 smoke。
- 详细字段、签名规则、查单和回调约定见 [docs/junliai-payments.md](/Users/wangtaolve/image-video-platform/docs/junliai-payments.md:1)。

生产上要重点确认：

- 回调地址公网可达
- 商户私钥和平台公钥格式正确
- 君徕商户后台的异步通知地址已和本地配置一致
- Nginx 或云负载均衡已正确透传 `Host` 和 `X-Forwarded-*`

## 数据与持久化

默认会在 `data/` 目录落盘：

- `account.json`
- `users.json`
- `admin-users.json`
- `sessions.json`
- `email-login-codes.json`
- `audit-log.json`
- `orders.json`
- `video-tasks.json`

容器部署时请把 `/app/data` 挂载到持久卷，否则容器重建会丢数据。

## 生产建议

当前这版已经能作为首个线上 MVP，但还不是完整业务后台。建议上线前补齐：

1. 用户体系和鉴权，不要把余额做成全站单账户。
2. 数据库替换本地 JSON，至少覆盖账户、订单、任务三张表。
3. 支付回调幂等控制与签名异常审计。
4. 限流、访问日志、错误日志和告警。
5. 订单查询页、退款流程和对账脚本。
6. HTTPS 证书与域名配置。

## 运维 Runbook

### 健康检查

```bash
curl -s http://127.0.0.1:3000/api/health
```

### 查看多 agent 协作状态

```bash
scripts/dashboard.sh
scripts/poll-status.sh
```

### 发布前检查

```bash
npm run check
npm run smoke
```

### 回滚思路

- 容器部署：回滚到上一版镜像 tag。
- 非容器部署：保留上一版目录并切换进程指向。
- 数据目录 `data/` 单独备份，不跟随代码一起覆盖。
