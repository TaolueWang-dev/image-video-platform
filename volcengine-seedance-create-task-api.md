# 火山引擎视频生成接口文档

## 1. 接口概述

该接口用于创建一个异步视频生成任务。模型会根据输入的文本、图片、视频、音频或样片任务信息生成视频内容。

- 接口地址：`POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks`
- 接口类型：异步任务创建
- 鉴权方式：`API Key`
- 适用模型：`seedance 2.0`、`seedance 2.0 fast`、`seedance 1.5 pro`、`seedance 1.0 pro`、`seedance 1.0 pro fast`、`seedance 1.0 lite`

调用成功后仅返回任务 ID。实际视频结果需要通过“查询视频生成任务”接口轮询，或通过 `callback_url` 接收任务状态回调。

## 2. 使用前提

- 账户余额需大于等于 200 元，或已购买对应资源包。
- 已在火山方舟控制台开通目标模型。
- 已获取有效 API Key。

## 3. 鉴权说明

本接口仅支持 API Key 鉴权。

请求头示例：

```http
Content-Type: application/json
Authorization: Bearer <YOUR_API_KEY>
```

## 4. 调用流程

1. 调用本接口创建视频生成任务。
2. 获取响应中的任务 ID。
3. 通过查询任务接口获取任务状态与最终 `video_url`。
4. 如果配置了 `callback_url`，平台会在任务状态变化时主动推送结果。

## 5. 请求定义

### 5.1 Request

```http
POST /api/v3/contents/generations/tasks HTTP/1.1
Host: ark.cn-beijing.volces.com
Content-Type: application/json
Authorization: Bearer <YOUR_API_KEY>
```

### 5.2 Body 参数

#### 必填参数

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `model` | `string` | 是 | 模型 ID 或 Endpoint ID。 |
| `content` | `object[]` | 是 | 输入内容数组，支持文本、图片、视频、音频、样片任务 ID。 |

#### 可选参数

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `callback_url` | `string` | - | 任务状态回调地址。 |
| `return_last_frame` | `boolean` | `false` | 是否返回生成视频尾帧。 |
| `service_tier` | `string` | `default` | 服务等级，`default` 或 `flex`。 |
| `execution_expires_after` | `integer` | `172800` | 任务过期时间，单位秒，范围 `[3600, 259200]`。 |
| `generate_audio` | `boolean` | `true` | 是否生成音频。仅部分模型支持。 |
| `draft` | `boolean` | `false` | 是否开启样片模式。仅 `seedance 1.5 pro` 支持。 |
| `tools` | `object[]` | - | 模型工具配置，仅 `seedance 2.0` / `2.0 fast` 支持。 |
| `safety_identifier` | `string` | - | 终端用户唯一标识，建议传哈希值。 |
| `resolution` | `string` | 模型相关 | 输出分辨率。 |
| `ratio` | `string` | 模型相关 | 输出宽高比。 |
| `duration` | `integer` | `5` | 输出视频时长（秒）。 |
| `frames` | `integer` | - | 输出帧数，优先级高于 `duration`。 |
| `seed` | `integer` | `-1` | 随机种子。 |
| `camera_fixed` | `boolean` | `false` | 是否固定镜头。 |
| `watermark` | `boolean` | `false` | 是否添加水印。 |

## 6. content 输入结构

`content` 是一个数组，不同元素通过 `type` 区分。

### 6.1 文本输入

```json
{
  "type": "text",
  "text": "小猫对着镜头打哈欠"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `type` | `string` | 是 | 固定为 `text` |
| `text` | `string` | 是 | 提示词内容 |

补充说明：

- 支持中英文提示词。
- `seedance 2.0` / `2.0 fast` 额外支持日语、印尼语、西班牙语、葡萄牙语。
- 建议中文不超过 500 字，英文不超过 1000 词。

### 6.2 图片输入

```json
{
  "type": "image_url",
  "image_url": {
    "url": "https://example.com/first-frame.png"
  },
  "role": "first_frame"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `type` | `string` | 是 | 固定为 `image_url` |
| `image_url.url` | `string` | 是 | 图片 URL、Base64 或素材 ID |
| `role` | `string` | 条件必填 | 图片用途 |

`role` 支持值：

- `first_frame`：首帧图
- `last_frame`：尾帧图
- `reference_image`：参考图

图片要求：

- 格式：`jpeg`、`png`、`webp`、`bmp`、`tiff`、`gif`
- `seedance 1.5 pro` 额外支持：`heic`、`heif`
- 宽高比范围：`(0.4, 2.5)`
- 宽高范围：`300 ~ 6000 px`
- 单图大小：小于 `30 MB`
- 请求体总大小：不超过 `64 MB`

数量要求：

- 首帧生视频：1 张
- 首尾帧生视频：2 张
- `seedance 2.0` / `2.0 fast` 多模态参考：1~9 张
- `seedance 1.0 lite` 参考图场景：1~4 张

### 6.3 视频输入

```json
{
  "type": "video_url",
  "video_url": {
    "url": "https://example.com/reference.mp4"
  },
  "role": "reference_video"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `type` | `string` | 是 | 固定为 `video_url` |
| `video_url.url` | `string` | 是 | 视频 URL 或素材 ID |
| `role` | `string` | 是 | 当前仅支持 `reference_video` |

视频要求：

- 仅 `seedance 2.0` / `2.0 fast` 支持视频输入
- 格式：`mp4`、`mov`
- 分辨率：`480p`、`720p`、`1080p`
- 单视频时长：`2~15s`
- 最多：3 个参考视频
- 所有参考视频总时长：不超过 `15s`
- 单视频大小：不超过 `50 MB`
- FPS 范围：`24~60`

### 6.4 音频输入

```json
{
  "type": "audio_url",
  "audio_url": {
    "url": "https://example.com/reference.wav"
  },
  "role": "reference_audio"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `type` | `string` | 是 | 固定为 `audio_url` |
| `audio_url.url` | `string` | 是 | 音频 URL、Base64 或素材 ID |
| `role` | `string` | 是 | 当前仅支持 `reference_audio` |

音频要求：

- 仅 `seedance 2.0` / `2.0 fast` 支持音频输入
- 不可单独输入音频，至少要搭配 1 个图片或视频
- 格式：`wav`、`mp3`
- 单音频时长：`2~15s`
- 最多：3 段参考音频
- 所有音频总时长：不超过 `15s`
- 单音频大小：不超过 `15 MB`

### 6.5 样片任务输入

```json
{
  "type": "draft_task",
  "draft_task": {
    "id": "task_xxx"
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `type` | `string` | 是 | 固定为 `draft_task` |
| `draft_task.id` | `string` | 是 | Draft 样片任务 ID |

说明：

- 仅 `seedance 1.5 pro` 支持
- 可基于已生成 Draft 视频创建正式视频
- 平台会自动复用 Draft 的部分参数，例如：`model`、`content.text`、`content.image_url`、`generate_audio`、`seed`、`ratio`、`duration`、`camera_fixed`

## 7. 支持的典型输入组合

支持的 `content` 组合包括：

- 文本
- 文本 + 图片
- 文本 + 视频
- 文本 + 图片 + 音频
- 文本 + 图片 + 视频
- 文本 + 视频 + 音频
- 文本 + 图片 + 视频 + 音频
- 样片任务 ID

注意：

- 文本在部分场景下可省略，但强烈建议保留。
- 首帧/首尾帧/多模态参考三种场景互斥，不可混用。

## 8. 输出控制参数

### 8.1 resolution

可选值：

- `480p`
- `720p`
- `1080p`

说明：

- `seedance 2.0 fast` 不支持 `1080p`
- `seedance 1.0 lite` 参考图场景不支持 `1080p`

### 8.2 ratio

可选值：

- `16:9`
- `4:3`
- `1:1`
- `3:4`
- `9:16`
- `21:9`
- `adaptive`

`adaptive` 说明：

- 文生视频：根据提示词自动选择
- 首帧/首尾帧：根据首帧图片自动适配
- 多模态参考：优先根据用户意图，其次按首个媒体文件适配

### 8.3 duration / frames

- `duration` 与 `frames` 二选一
- `frames` 优先级高于 `duration`
- 如果需要整数秒，优先使用 `duration`
- 如果需要小数秒，使用 `frames`

### 8.4 seed

- 范围：`[-1, 2^32-1]`
- `-1` 表示随机种子
- 同一请求使用相同种子，结果相似但不保证完全一致

### 8.5 generate_audio

- `true`：生成带同步音频的视频
- `false`：生成无声视频

说明：

- 仅 `seedance 2.0` / `2.0 fast` / `1.5 pro` 支持
- 生成的音频为单声道

## 9. tools 参数

仅 `seedance 2.0` / `2.0 fast` 支持。

目前支持：

```json
{
  "type": "web_search"
}
```

说明：

- 开启后模型可按需联网搜索
- 适合涉及时效性内容的提示词
- 会带来额外延迟

## 10. 响应定义

### 10.1 成功响应

```json
{
  "id": "task_1234567890"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `string` | 视频生成任务 ID |

说明：

- 任务 ID 保留 7 天
- 如果 `draft=true`，返回的是 Draft 视频任务 ID
- 如果 `draft=false`，返回的是正式视频任务 ID

## 11. 回调状态

如果传入 `callback_url`，平台会在任务状态变化时回调。

状态枚举：

- `queued`：排队中
- `running`：运行中
- `succeeded`：成功
- `failed`：失败
- `expired`：超时

成功或失败回调在 5 秒内未收到确认时，平台会重试 3 次。

## 12. 请求示例

### 12.1 文生视频

```json
{
  "model": "doubao-seedance-2-0-250428",
  "content": [
    {
      "type": "text",
      "text": "一只橘猫坐在窗台上看雨，电影感，柔和逆光"
    }
  ],
  "resolution": "720p",
  "ratio": "16:9",
  "duration": 5,
  "generate_audio": true,
  "watermark": false
}
```

### 12.2 图生视频（首帧）

```json
{
  "model": "doubao-seedance-2-0-fast-250428",
  "content": [
    {
      "type": "text",
      "text": "女孩转头看向镜头，微风吹动头发，真实电影风格"
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://example.com/first-frame.png"
      },
      "role": "first_frame"
    }
  ],
  "resolution": "720p",
  "ratio": "adaptive",
  "duration": 5,
  "generate_audio": true
}
```

### 12.3 图生视频（首尾帧）

```json
{
  "model": "doubao-seedance-1-5-pro-251215",
  "content": [
    {
      "type": "text",
      "text": "镜头从人物背后推进到海边日落场景"
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://example.com/start.png"
      },
      "role": "first_frame"
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://example.com/end.png"
      },
      "role": "last_frame"
    }
  ],
  "resolution": "720p",
  "duration": 5,
  "generate_audio": false
}
```

### 12.4 多模态参考生视频

```json
{
  "model": "doubao-seedance-2-0-250428",
  "content": [
    {
      "type": "text",
      "text": "[图1]中的女孩在[视频1]的街景里边走边说：\"今晚见。\"，延续[音频1]的语气和节奏"
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://example.com/character.png"
      },
      "role": "reference_image"
    },
    {
      "type": "video_url",
      "video_url": {
        "url": "https://example.com/street.mp4"
      },
      "role": "reference_video"
    },
    {
      "type": "audio_url",
      "audio_url": {
        "url": "https://example.com/voice.wav"
      },
      "role": "reference_audio"
    }
  ],
  "resolution": "720p",
  "ratio": "adaptive",
  "duration": 6,
  "generate_audio": true,
  "tools": [
    {
      "type": "web_search"
    }
  ]
}
```

## 13. 常见约束与注意事项

1. `seedance 2.0` 系列不支持直接上传含真人人脸的参考图/视频，需遵循平台授权与素材规则。
2. 音频不能单独作为输入。
3. `seedance 2.0` / `2.0 fast` 不支持离线推理，即不支持 `service_tier=flex`。
4. `draft=true` 时：
   - 仅 `seedance 1.5 pro` 支持
   - 仅支持 `480p`
   - 不支持尾帧返回
   - 不支持离线推理
5. `camera_fixed`：
   - 参考图场景不支持
   - `seedance 2.0` / `2.0 fast` 暂不支持
6. `frames`：
   - `seedance 2.0` / `2.0 fast` / `1.5 pro` 暂不支持
7. 建议优先使用请求体中的显式字段，不建议继续使用提示词后拼接参数的旧方式。

## 14. 建议的最小接入方案

如果只是快速接入，建议最少传以下字段：

```json
{
  "model": "doubao-seedance-2-0-250428",
  "content": [
    {
      "type": "text",
      "text": "你的提示词"
    }
  ],
  "resolution": "720p",
  "ratio": "16:9",
  "duration": 5,
  "generate_audio": true
}
```

## 15. 配套接口

- 创建任务：`POST /api/v3/contents/generations/tasks`
- 查询任务：用于查询任务状态、获取 `video_url`、`ratio`、`duration`、尾帧等结果信息

## 16. 文档说明

本文档基于你提供的火山引擎官方文档内容整理，目的是便于研发联调、SDK 封装和内部对接使用。若后续你需要，我可以继续补：

- Java / Python / Node.js 调用示例
- 查询任务接口文档
- 回调通知文档
- 一份适合给前端/后端直接对接的 OpenAPI 风格定义
