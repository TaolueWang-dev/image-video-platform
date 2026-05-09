# Junliai Aggregated Payments

本地充值接口统一对接君徕聚合支付，微信/支付宝官方直连视为废弃路径。这里记录仓库内部约定，避免前后端和回调处理各自发散。

## 本地接口

### 创建充值单

- 路径：`POST /api/recharge/orders`
- 请求体：

```json
{
  "channel": "alipay",
  "amount": 5000,
  "subject": "账户充值 50 元",
  "metadata": {
    "source": "web"
  }
}
```

约定：

- `channel` 继续表示用户选择的支付方式，只接受 `alipay` 或 `wechat`。
- 服务端把 `channel=wechat` 映射为君徕上游 `type=wxpay`。
- `amount` 仍使用分为单位；调用上游时转成元字符串，如 `5000 -> "50.00"`。
- `subject` 映射到上游 `name`。
- `metadata` 只用于本地订单落库，不参与上游签名。

期望返回：

- 本地订单字段：`id`、`outTradeNo`、`status`、`amount`、`channel`、`paymentPayload`。
- `paymentPayload` 至少要保留上游原始响应中的 `pay_type`、`pay_info`、`trade_no` 或等价字段，前端按返回形态渲染，不要写死二维码流程。
- 如果本地未配置完整的君徕商户密钥，服务端会返回 `integrationMode: "skeleton"` 的占位回执；这条路径只用于本地联调与 smoke，不会请求上游。

### 查询订单

- 路径：`GET /api/recharge/orders`
- 用途：本地列单；必要时服务端可结合君徕查单结果做补单。

### 异步通知

- 路径：`GET /api/payments/junliai/notify`
- 要求：验签成功且确认支付成功后，执行本地入账与订单状态更新。
- 响应：纯文本 `success`。

## 上游接口

默认上游文档域名：`https://pay.junliai.com`

- 创建订单：`POST /api/pay/create`
- 查询订单：`POST /api/pay/query`
- 页面跳转支付：`GET /api/pay/submit`

本地实现应优先封装 `create` 和 `query`；`submit` 只在需要直接跳转收银台时使用。

## 签名规则

君徕这套接口的核心不是 JSON 结构，而是签名拼接必须一致：

1. 只取非空参数。
2. 排除 `sign` 和 `sign_type`。
3. 按参数名 ASCII 升序排序。
4. 拼成 `key=value&key2=value2` 字符串。
5. 使用商户私钥做 `SHA256WithRSA` 签名，结果一般为 Base64。
6. 回调和查单响应使用平台公钥按同样的待签名串规则验签。

建议：

- 明确封装一个稳定的 `buildSignContent(params)`，下单、查单、回调验签共用。
- 任何空串、`undefined`、`null` 字段都不要参与签名。
- 签名前后的参数快照要可审计，但日志里不要直接打完整私钥内容。

## 上游字段映射

本地下单到君徕上游的最小字段集建议如下：

- `pid`: `JUNLIAI_PAY_PID`
- `type`: `alipay` 或 `wxpay`
- `out_trade_no`: 本地订单号
- `notify_url`: `JUNLIAI_PAY_NOTIFY_URL`，未配置时可由 `PUBLIC_BASE_URL + /api/payments/junliai/notify` 生成
- `return_url`: `JUNLIAI_PAY_RETURN_URL`
- `name`: 本地 `subject`
- `money`: 本地 `amount` 换算后的元字符串
- `clientip`: 请求来源 IP
- `timestamp`: Unix 秒级时间戳
- `sign`: 商户私钥签名

如果上游实现要求 `method`，本地默认按文档推荐值配置，不要让前端感知该字段。

## 推荐环境变量

- `JUNLIAI_PAY_PID`: 商户号
- `JUNLIAI_PAY_PRIVATE_KEY`: 商户 RSA 私钥
- `JUNLIAI_PAY_PLATFORM_PUBLIC_KEY`: 君徕平台公钥
- `JUNLIAI_PAY_NOTIFY_URL`: 异步通知地址
- `JUNLIAI_PAY_RETURN_URL`: 前端支付完成返回地址
- `JUNLIAI_PAY_CREATE_URL`: 默认 `https://pay.junliai.com/api/pay/create`
- `JUNLIAI_PAY_QUERY_URL`: 默认 `https://pay.junliai.com/api/pay/query`
- `JUNLIAI_PAY_SUBMIT_URL`: 默认 `https://pay.junliai.com/api/pay/submit`

## 回调处理约定

- 只要收到回调，先验签，再查本地订单，再决定是否补一次上游查单。
- 只有 `trade_status=TRADE_SUCCESS` 才能入账；其他状态只记事件，不改余额。
- 用 `out_trade_no` 作为本地订单匹配键，用 `trade_no` 作为上游流水号落库。
- 回调处理必须幂等；同一 `trade_no` 或同一成功事件重复到达时，余额不能重复增加。
- 成功处理后返回纯文本 `success`；其他内容会导致上游重复通知。
