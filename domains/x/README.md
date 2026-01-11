# X Agent - Twitter Management with Grok

使用 Grok (xAI) 来管理你的 X (Twitter) 内容。

## 功能

1. **监控 Mentions** - 自动抓取最近 24 小时的提及
2. **Grok 分析** - 分析情绪、优先级、生成回复建议
3. **内容生成** - 创建推文线程、回复草稿
4. **自动化管理** - 保存草稿、发送提醒

## 配置

编辑 `config.json`:

```json
{
  "xai_api_key": "xai-xxx",           // 从 console.x.ai 获取
  "x_bearer_token": "AAAA...",        // X API Bearer Token
  "account_context": "你的账号定位描述",
  "reply_tone": "friendly, helpful",
  "content_themes": ["AI", "productivity"],
  "auto_reply": false                  // 危险：设为 true 会自动发推
}
```

## 获取 API Keys

### Grok API (xAI)
1. 访问 https://console.x.ai
2. 创建 API Key
3. 设置环境变量: `export XAI_API_KEY=xai-xxx`

### X API
1. 访问 https://developer.twitter.com
2. 创建 App，获取 Bearer Token
3. 设置环境变量: `export X_BEARER_TOKEN=xxx`

## 使用

```bash
# 运行完整流程
python domains/x/agent.py

# 只分析 mentions
python domains/x/agent.py mentions

# 生成推文线程
python domains/x/agent.py thread --topic "AI agents 改变工作方式的 5 个洞见"

# 生成回复建议
python domains/x/agent.py reply --tweet "你的 AI 工具太棒了，是怎么做的？"
```

## 输出

- `drafts/YYYY-MM-DD-replies.json` - 回复草稿
- `drafts/thread-YYYY-MM-DD-HHMM.json` - 线程草稿
- `analytics/` - 分析数据

## 与其他 Agent 协同

X Agent 会发送 handoff 到：
- `personal` - 紧急提及提醒
- `content` - 将热门话题作为写作素材
