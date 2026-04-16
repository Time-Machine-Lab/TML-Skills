# bilibili-api-skill 二期核心接口能力

## 文档目标

这份文档只保留二期最核心的底层接口能力。

标准很简单：

- 没有它，这个 skill 的最小闭环跑不起来
- 有了它，调度、watch、campaign、candidate pool 都可以建立在上面

## 重要说明

文档里的返回示例只用于帮助理解接口大概会返回什么字段。

它们：

- 不代表最终结果一定长这样
- 不代表字段已经完全定稿
- 不代表实现时必须 100% 按这个 JSON 输出

这份文档的重点是：

- 先把接口能力边界定清楚
- 先把最关键的入参和结果形态表达清楚

真正动工时，输出结构仍然可以按实现需要再做微调。

## 核心接口分组

二期核心接口一共 6 组，15 个：

1. 登录与会话
2. 账号信息
3. 视频
4. 评论
5. 通知
6. 私信

---

## 1. 登录与会话

### 1. `auth.qr_start`

作用：
启动二维码登录。

入参：

```json
{}
```

字段说明：

- 无必填字段

返回示例：

```json
{
  "qrcodeKey": "9b5a6b7c8d",
  "loginUrl": "https://passport.bilibili.com/...",
  "qrAscii": "██  ██ ..."
}
```

### 2. `auth.qr_poll`

作用：
轮询二维码登录结果。

入参：

```json
{
  "qrcodeKey": "9b5a6b7c8d"
}
```

字段说明：

- `qrcodeKey`
  - 二维码登录 key

返回示例：

```json
{
  "status": "success",
  "sessionId": "sess_xxx",
  "mid": "3546552512345678",
  "uname": "example_user"
}
```

### 3. `auth.session_get`

作用：
查看当前 session 是否可用。

入参：

```json
{
  "sessionId": "sess_xxx"
}
```

字段说明：

- `sessionId`
  - 本地 session 标识

返回示例：

```json
{
  "sessionId": "sess_xxx",
  "valid": true,
  "refreshable": true
}
```

### 4. `auth.session_refresh`

作用：
刷新当前 session。

入参：

```json
{
  "sessionId": "sess_xxx"
}
```

字段说明：

- `sessionId`
  - 本地 session 标识

返回示例：

```json
{
  "sessionId": "sess_xxx",
  "refreshed": true,
  "valid": true
}
```

---

## 2. 账号信息

### 5. `account.self_get`

作用：
获取当前登录账号信息。

入参：

```json
{
  "sessionId": "sess_xxx"
}
```

字段说明：

- `sessionId`
  - 当前登录会话

返回示例：

```json
{
  "mid": "3546552512345678",
  "uname": "example_user",
  "level": 6,
  "avatar": "https://i0.hdslb.com/..."
}
```

---

## 3. 视频

### 6. `video.search`

作用：
按关键词搜索视频。

说明：
这一层建议直接对齐 `scripts/bilibili-mcp-lite.mjs` 的 `searchVideos()` 能力，不要额外发明复杂入参。

入参：

```json
{
  "keyword": "AI编程",
  "page": 1,
  "limit": 10,
  "raw": false
}
```

字段说明：

- `keyword`
  - 搜索关键词
- `page`
  - 页码，从 1 开始
- `limit`
  - 返回数量上限
  - 建议 1 到 20
- `raw`
  - 是否返回 B 站原始搜索结果
  - `false` 时返回标准化结果
  - `true` 时返回原始字段

返回示例：

```json
{
  "items": [
    {
      "aid": 123456789,
      "bvid": "BV1xx411c7mD",
      "title": "AI 编程工作流实战",
      "author": "UP主昵称",
      "author_mid": 987654321,
      "category": {
        "id": 172,
        "name": "资讯"
      },
      "play_count": 12345,
      "like_count": 678,
      "favorite_count": 90,
      "comment_count": 34,
      "danmaku_count": 56,
      "duration": "5:21",
      "publish_date": "2026-04-10",
      "publish_ts": 1712743200,
      "description": "视频简介",
      "rank_index": 0,
      "tags": "AI编程,工作流",
      "arcurl": "https://www.bilibili.com/video/BV1xx411c7mD"
    }
  ],
  "page": 1,
  "limit": 10
}
```

`raw = true` 时返回示例：

```json
{
  "items": [
    {
      "bvid": "BV1xx411c7mD",
      "title": "<em class=\"keyword\">AI</em> 编程工作流实战",
      "author": "UP主昵称",
      "play": "12345"
    }
  ],
  "page": 1,
  "limit": 10
}
```

### 7. `video.detail_get`

作用：
获取单个视频详情。

入参：

```json
{
  "bvid": "BV1xx411c7mD"
}
```

或：

```json
{
  "aid": 123456789
}
```

字段说明：

- `bvid`
  - 视频 BV 号
- `aid`
  - 视频 aid
- `bvid` 和 `aid` 二选一

返回示例：

```json
{
  "bvid": "BV1xx411c7mD",
  "aid": 123456789,
  "title": "AI 编程工作流实战",
  "description": "视频简介",
  "author": "UP主昵称",
  "authorMid": "987654321",
  "view": 12345,
  "like": 678,
  "favorite": 90,
  "reply": 34
}
```

---

## 4. 评论

### 8. `comment.roots_list`

作用：
获取视频下的主评论列表。

入参：

```json
{
  "bvid": "BV1xx411c7mD",
  "page": 1,
  "pageSize": 20
}
```

字段说明：

- `bvid`
  - 视频 BV 号
- `page`
  - 页码
- `pageSize`
  - 每页评论数量

返回示例：

```json
{
  "items": [
    {
      "rpid": "998877665544332211",
      "mid": "44556677",
      "uname": "comment_user",
      "message": "评论正文",
      "like": 12,
      "replyCount": 3,
      "createdAt": "2026-04-16T09:30:00.000Z"
    }
  ],
  "hasMore": true
}
```

### 9. `comment.replies_list`

作用：
获取某条主评论下面的子回复。

入参：

```json
{
  "bvid": "BV1xx411c7mD",
  "rootRpid": "998877665544332211",
  "page": 1,
  "pageSize": 20
}
```

字段说明：

- `bvid`
  - 视频 BV 号
- `rootRpid`
  - 主评论 ID
- `page`
  - 页码
- `pageSize`
  - 每页回复数量

返回示例：

```json
{
  "items": [
    {
      "rpid": "998877665544332299",
      "rootRpid": "998877665544332211",
      "parentRpid": "998877665544332211",
      "mid": "99887766",
      "uname": "reply_user",
      "message": "子回复正文",
      "like": 5,
      "createdAt": "2026-04-16T10:30:00.000Z"
    }
  ],
  "hasMore": false
}
```

### 10. `comment.send`

作用：
发送评论。

支持：

- 发视频主评论
- 回复某条评论

#### 发视频主评论

入参：

```json
{
  "sessionId": "sess_xxx",
  "bvid": "BV1xx411c7mD",
  "message": "这条视频讲得挺清楚的。"
}
```

字段说明：

- `sessionId`
  - 当前登录会话
- `bvid`
  - 视频 BV 号
- `message`
  - 评论内容

返回示例：

```json
{
  "success": true,
  "bvid": "BV1xx411c7mD",
  "message": "这条视频讲得挺清楚的。"
}
```

#### 回复评论

入参：

```json
{
  "sessionId": "sess_xxx",
  "bvid": "BV1xx411c7mD",
  "rootRpid": "998877665544332211",
  "message": "这点我也比较关注。"
}
```

字段说明：

- `sessionId`
  - 当前登录会话
- `bvid`
  - 视频 BV 号
- `rootRpid`
  - 要回复的根评论 ID
- `message`
  - 回复内容

返回示例：

```json
{
  "success": true,
  "bvid": "BV1xx411c7mD",
  "rootRpid": "998877665544332211",
  "message": "这点我也比较关注。"
}
```

---

## 5. 通知

### 11. `notification.unread_get`

作用：
获取当前账号未读消息摘要。

入参：

```json
{
  "sessionId": "sess_xxx"
}
```

字段说明：

- `sessionId`
  - 当前登录会话

返回示例：

```json
{
  "total": 4,
  "reply": 1,
  "at": 0,
  "like": 0,
  "system": 0,
  "dmThreads": 2,
  "dmMessages": 3
}
```

### 12. `notification.reply_notifications_list`

作用：
获取评论回复通知列表。

入参：

```json
{
  "sessionId": "sess_xxx",
  "pageSize": 20
}
```

字段说明：

- `sessionId`
  - 当前登录会话
- `pageSize`
  - 拉取数量

返回示例：

```json
{
  "items": [
    {
      "notificationId": "reply_1234567890",
      "mid": "44556677",
      "uname": "comment_user",
      "bvid": "BV1xx411c7mD",
      "videoTitle": "视频标题",
      "rootRpid": "998877665544332211",
      "parentRpid": "998877665544332299",
      "targetReplyContent": "对方回复了什么",
      "sourceContent": "我原先发的内容",
      "createdAt": "2026-04-16T10:00:00.000Z"
    }
  ]
}
```

---

## 6. 私信

### 13. `dm.sessions_list`

作用：
获取私信会话列表。

入参：

```json
{
  "sessionId": "sess_xxx",
  "pageSize": 20
}
```

字段说明：

- `sessionId`
  - 当前登录会话
- `pageSize`
  - 拉取数量

返回示例：

```json
{
  "items": [
    {
      "talkerMid": "44556677",
      "talkerName": "dm_user",
      "unreadCount": 2,
      "lastMessagePreview": "你好，我想问一下...",
      "lastMessageAt": "2026-04-16T10:10:00.000Z"
    }
  ]
}
```

### 14. `dm.messages_list`

作用：
获取某个私信会话的消息历史。

入参：

```json
{
  "sessionId": "sess_xxx",
  "talkerMid": "44556677",
  "pageSize": 20
}
```

字段说明：

- `sessionId`
  - 当前登录会话
- `talkerMid`
  - 对方用户 mid
- `pageSize`
  - 拉取消息数量

返回示例：

```json
{
  "items": [
    {
      "msgKey": "msg_998877",
      "msgSeqno": 8888,
      "senderMid": "44556677",
      "direction": "inbound",
      "text": "你好，我想问一下...",
      "sentAt": "2026-04-16T10:10:00.000Z"
    }
  ]
}
```

### 15. `dm.send_text`

作用：
发送文本私信。

入参：

```json
{
  "sessionId": "sess_xxx",
  "talkerMid": "44556677",
  "message": "你好，这边可以详细聊一下你的需求。"
}
```

字段说明：

- `sessionId`
  - 当前登录会话
- `talkerMid`
  - 对方用户 mid
- `message`
  - 私信正文

返回示例：

```json
{
  "success": true,
  "talkerMid": "44556677",
  "message": "你好，这边可以详细聊一下你的需求。",
  "msgKey": "msg_123456789"
}
```

---

## 最后结论

二期核心接口能力就先定这 15 个。

它们已经足够支撑最小闭环：

1. 登录
2. 获取账号
3. 搜视频
4. 看视频详情
5. 读评论
6. 发评论
7. 看通知
8. 看私信
9. 发私信

后面的所有高层能力，都应该建立在这 15 个接口之上。

---

## 二期增强型原子接口

下面这些接口不是最小闭环必须，但我建议也一起记录在这份文档里，方便后续动工时统一参考。

它们的定位是：

- 不是第一批最核心接口
- 但仍然是有价值的原子能力
- 后续很可能会进入二期增强实现

## 7. 评论增强

### 16. `comment.main_scan`

作用：
扫描评论区主流评论流，适合做评论发现、评论筛选、root 评论定位增强。

入参：

```json
{
  "bvid": "BV1xx411c7mD",
  "mode": 3,
  "seekRpid": ""
}
```

字段说明：

- `bvid`
  - 视频 BV 号
- `mode`
  - 评论扫描模式
- `seekRpid`
  - 可选
  - 如果要定向查某条 root 评论，可以传这个值

返回示例：

```json
{
  "items": [
    {
      "rpid": "998877665544332211",
      "mid": "44556677",
      "uname": "comment_user",
      "message": "评论正文",
      "like": 12,
      "replyCount": 3
    }
  ],
  "cursor": {
    "offset": "next_offset_xxx"
  }
}
```

### 17. `comment.hot_replies_list`

作用：
获取某条主评论下面的热门回复。

入参：

```json
{
  "bvid": "BV1xx411c7mD",
  "rootRpid": "998877665544332211",
  "page": 1,
  "pageSize": 10
}
```

字段说明：

- `bvid`
  - 视频 BV 号
- `rootRpid`
  - 主评论 ID
- `page`
  - 页码
- `pageSize`
  - 每页热门回复数量

返回示例：

```json
{
  "items": [
    {
      "rpid": "998877665544332299",
      "rootRpid": "998877665544332211",
      "mid": "99887766",
      "uname": "reply_user",
      "message": "热门回复正文",
      "like": 56
    }
  ]
}
```

### 18. `comment.reaction_set`

作用：
给评论点赞或点踩。

入参：

```json
{
  "sessionId": "sess_xxx",
  "bvid": "BV1xx411c7mD",
  "rpid": "998877665544332211",
  "action": "like"
}
```

字段说明：

- `sessionId`
  - 当前登录会话
- `bvid`
  - 视频 BV 号
- `rpid`
  - 评论 ID
- `action`
  - `like` 或 `dislike`

返回示例：

```json
{
  "success": true,
  "rpid": "998877665544332211",
  "action": "like"
}
```

## 8. 私信增强

### 19. `dm.session_ack`

作用：
将私信会话推进到已读状态。

入参：

```json
{
  "sessionId": "sess_xxx",
  "talkerMid": "44556677",
  "ackSeqno": 8888
}
```

字段说明：

- `sessionId`
  - 当前登录会话
- `talkerMid`
  - 对方用户 mid
- `ackSeqno`
  - 已读推进到的消息序号

返回示例：

```json
{
  "success": true,
  "talkerMid": "44556677",
  "ackSeqno": 8888
}
```

### 20. `media.image_upload`

作用：
上传图片，拿到图片资源地址。

入参：

```json
{
  "sessionId": "sess_xxx",
  "imagePath": "/absolute/path/to/image.png"
}
```

字段说明：

- `sessionId`
  - 当前登录会话
- `imagePath`
  - 本地图片绝对路径

返回示例：

```json
{
  "success": true,
  "url": "https://i0.hdslb.com/bfs/new_dyn/xxx.png",
  "width": 1280,
  "height": 720,
  "imageType": "png"
}
```

### 21. `dm.send_image`

作用：
发送图片私信。

入参：

```json
{
  "sessionId": "sess_xxx",
  "talkerMid": "44556677",
  "imagePath": "/absolute/path/to/image.png"
}
```

字段说明：

- `sessionId`
  - 当前登录会话
- `talkerMid`
  - 对方用户 mid
- `imagePath`
  - 本地图片绝对路径

返回示例：

```json
{
  "success": true,
  "talkerMid": "44556677",
  "msgKey": "msg_123456789",
  "imageUrl": "https://i0.hdslb.com/bfs/new_dyn/xxx.png"
}
```

---

## 最后的分层建议

### 第一层：最小核心接口

就是前面的 15 个接口。

### 第二层：增强型原子接口

就是后面补充的 6 个接口：

- `comment.main_scan`
- `comment.hot_replies_list`
- `comment.reaction_set`
- `dm.session_ack`
- `media.image_upload`
- `dm.send_image`

这样后续动工时就不会只盯住核心接口，而忽略这些后面大概率还会用到的底层能力。
