# 02 时间轴流程

## 时间轴总览

### 上半场:用户输入之前(会话启动)

```
T0  CLI 启动
     ├─ 配置 / 插件 / MCP 连接加载
     ├─ SessionStart hooks 后台开跑(~500ms, 不阻塞)          [会话层 hook]
     └─ REPL 立即渲染, 用户开始打字

T0' 打字期间(后台异步)
     ├─ SessionStart 完成 → hook 消息 prepend 到消息流最顶部
     ├─ system prompt 首次解析: 静态段拼接 + 动态段计算(段级缓存建立)
     └─ memory prefetch / skill discovery prefetch 预热
```

### 下半场:用户按下回车之后(一个完整 turn)

```
T1  ① slash 命令 / @提及 展开                              processUserInput base
      └─ /cmd → skill prompt 展开;  @file → 文件引用解析

   ② UserPromptSubmit hooks                                [输入层 hook] :182
      ├─ blockingError       → 整条输入作废, turn 终止(③-⑨全不发生)
      ├─ preventContinuation → 保留原输入但停止
      └─ additionalContexts  → hook_additional_context attachment

   ③ attachment 批生成(25 探测器并行, 整体 1s 预算)           [turn 层] :504
      ├─ 输入响应:  @文件 / @MCP资源 / @agent / skill_discovery(仅 turn 0)
      ├─ 状态增量:  skill_listing(仅新 skill) / tools·agents·mcp delta / 日期
      ├─ 文件记忆:  changed_files / nested_memory / relevant_memories
      ├─ 模式协作:  plan·auto(_exit) / teammate_mailbox / agent_pending
      └─ 提醒:      todo / task(双重节流: 距上次使用≥10轮 且 距上次提醒≥10轮)

   ④ 组装请求
      system   = [静态 7 段 | 界碑 | 动态 13 段]              ← 段级缓存命中
      messages = [SessionStart hook 上下文(仅首 turn 置顶)]
                + [本 turn attachment 批(渲染为 <system-reminder>)]
                + [用户输入]

T2  ⑤ 流式响应(事件流: 文本块 / tool_use / usage / stop_reason)

   ⑥ 工具调度  runTools → partitionToolCalls(按并发安全性分批)
      对每个 tool_use:
        PreToolUse hooks ──block──→ 拒绝                     [工具层 hook]
        权限判定:  allow → 执行
                   deny  → 拒绝(sticky, 同一 id 不许重试为 allow)
                   ask   → 协调器 / 分类器 / 交互式审批
        PostToolUse hooks                                    [工具层 hook]
      并发批: contextModifier 先缓存, 再按原始 block 顺序回放(因果序保持)

   ⑦ tool_result 回流
      循环内 attachment 注入: task 通知 / memory prefetch 消费  [循环层]

   ⑧ 有 tool_use → 回到 ⑤(不重跑①②③);  无 → 进入停止

   ⑨ Stop hooks                                             [停止层 hook]
      block → 强制回到 ⑤ 继续;  放行 → turn 结束
```

### compact 支线(长会话, 插在 ⑤ 之前的输入治理段)

```
每轮 query 前检查上下文逼近阈值(输入治理先于模型调用)
  → PreCompact hooks                                       [压缩层 hook]
  → 压缩执行(LLM 摘要 / session memory 方案)
  → PostCompact
  → SessionStart('compact') 重放                            [会话层再入场]
  → 恢复批: invoked_skills 全文 / CLAUDE.md / 关键文件 attachment
  → 目标: 重建可继续工作的工作语义, 不是聊天总结
```

### hook 层级总表

| 层级 | hook | 挂在哪个阶段 | 权力 |
| --- | --- | --- | --- |
| 会话层 | SessionStart / SessionEnd / Setup | T0 启动 + compact/clear/resume 重放 | 注入上下文(置顶) |
| 输入层 | UserPromptSubmit | T1-②, slash 展开后 | 作废输入 / 改写 / 附加 |
| 工具层 | PreToolUse / PostToolUse(Failure) | T2-⑥, 每次工具调用前后 | block 工具 / 注入 |
| 停止层 | Stop / StopFailure | T2-⑨ | block 强制继续 |
| 压缩层 | PreCompact / PostCompact | compact 支线 | 参与压缩 |
| 子代理层 | SubagentStart / SubagentStop | Agent 工具 fork 生命周期 | 观测 / exit 2 回灌 |
| 权限层 | PermissionRequest / Denied | T2-⑥ 权限判定时 | 通知 |
| 其它 | Notification / TeammateIdle | 事件通知 | 通知 |

### 三个关键时序事实

- system-reminder 出现在 T2-④ 组装的 messages 里:①②③ 的产物在发请求前统一渲染成文本块,插在用户输入前。
- system prompt 只在每轮 query 组装时 resolve,段级缓存使其毫秒级——动态区不重算,attachment 每轮新生产。
- 同一 turn 内的循环(⑤-⑧)不重跑①②③——输入层的门卫只看人,不看模型。

## T1 输入提交:从回车到请求发出之前

用户按下回车后、API 请求发出前,依次发生三步。门卫(UserPromptSubmit)在装配线(attachment)之前——block 时省掉全部后续工作。

```
T1  输入提交
  ① slash 命令 / @提及 展开                    (processUserInput base)
  ② UserPromptSubmit hooks                     [输入层 hook] processUserInput.ts:182
  ③ attachment 批生成(25 探测器, 1s 预算)        [turn 层] processUserInput.ts:504
```

### ① slash / @ 展开

slash 命令展开为 skill prompt、@提及解析为文件引用。注意顺序:展开在 UserPromptSubmit 之前(base 处理先行完成)。

### ② UserPromptSubmit hooks

```
blockingError     → 整条输入作废, 替换为错误消息
                    (原输入不进上下文, ③-⑨ 全部不发生)   ← 一票否决 + 省工作量
preventContinuation → 保留原输入但停止
additionalContexts → 包成 hook_additional_context attachment
```

- 注入顺序即话语顺序: hook 的 additionalContext 排在 attachment 批之前 — 用户/插件想说的先到, harness 系统提醒后到
- 细节: blockingError 分支注释里有 "TODO: Make this an attachment message" — 一切注入尽量走 attachment 管道是方向, 尚未改完

### ③ attachment 批:25 个探测器(getAttachments, attachments.ts:743)

每 turn 并行扫描全部探测器,整体 1s 超时(慢的丢弃,不阻塞用户)。条件分五类:

| 类 | 附件 | 触发 |
| --- | --- | --- |
| 输入响应 | at_mentioned_files / mcp_resources / agent_mentions / skill_discovery(仅 turn 0) | 输入含 @… |
| 状态增量 | skill_listing(新 skill 才发) / deferred_tools_delta / agent_listing_delta / mcp_instructions_delta / date_change | 列表变化 |
| 文件记忆 | changed_files / nested_memory / relevant_memories | 文件系统/规则命中 |
| 模式协作 | plan_mode(_exit) / auto_mode(_exit) / teammate_mailbox / team_context / agent_pending_messages | 模式切换/消息到达 |
| 提醒 nudge | todo_reminders / task_reminders / queued_commands / compaction_reminder | 超阈值/事件 |

todo 提醒的双重节流(attachments.ts:3266-3310):TodoWrite 工具存在 且 BriefTool 不在(主沟通渠道时不打扰)且 距上次使用 ≥10 轮 且 距上次提醒 ≥10 轮——防连环轰炸。计数细节:先检查 tool_use 再计数,不把 TodoWrite 消息本身算一轮。

### skills 的四个展示位

```
① skill_listing     → 模型自主调用的索引        → system-reminder(增量)
② invoked_skills    → 已调用 skill 的全文恢复    → compact 后 attachment
③ skill_discovery   → [实验] 每轮主动浮现相关 skill
④ slash 补全面板     → 用户敲 / 看到的(user-invocable) → 终端 UI
```

skill_listing 规则:
- 初始批一次(首个 turn 全量索引)
- 之后只发增量(sentSkillNames 按 agent 记忆)
- compact 后不重发 — 4K tokens 纯 cache_creation 浪费, 用过的靠 invoked_skills 恢复
- 预算裁剪: 一行 = name + description; bundled 永不截断; 极端降级 names-only; 实验模式只列 bundled+MCP ≤30

### 渲染管道:attachment → system-reminder

```
① 定义   getAttachments(attachments.ts:743)
② 调用   三个调用点:
           processUserInput.ts:504(每条输入) / query.ts:1580(循环内) / compact.ts(恢复)
③ 持有   Attachment 对象(union: skill_listing / todo_reminder / hook_additional_context / …)
④ 渲染   messages.ts(:3503-3734) 每个 case 转成 <system-reminder> 文本
⑤ 发送   api.ts 组装请求
```

渲染层会把相邻的 system-reminder 块合并,并伺机折叠进邻近的 tool_result(messages.ts:1791-1850)。

### hook 与动态组装的关系(本阶段总纲)

```
动态内容的生产者
├─ 内置探测器(getAttachments 的 ~25 个)      ← harness 自知的内容
└─ 用户 hook(SessionStart / UserPromptSubmit…) ← harness 不知道的用户内容
     ↓ 同一条 attachment 渲染管道(hook_additional_context 与
       skill_listing 是同一 union 的兄弟类型)
     ↓ <system-reminder> 注入对话流

控制反向流(仅 hook 有):PreToolUse 拦工具 / Stop 拦停止 / UserPromptSubmit 作废输入
```

三条咬合:通道咬合(汇入同一管道);协议咬合(静态 System 段预先声明"hook 反馈当作用户;被 block 先自查");生命周期咬合(SessionStart 在四时机重放)。一条边界:没有任何 hook 能改 system prompt——宪法定义权不下放给事件回调。说与拦分离,注入与控制分离。

## T2 API 请求:从发出到 turn 结束

### ④ 组装请求

```
system   = [静态区 | 界碑 | 动态区](段级缓存命中, 毫秒级)
messages = [SessionStart hook 上下文(仅首 turn 在最顶)]
           + [本 turn attachment 批]
           + [用户输入]
```

"对话流侧"= messages 数组(每 turn 增长),与 system 侧(装配一次)相对。模型实际收到的 user 消息 content:

```
{ "role": "user", "content": [
  { "type": "text",
    "text": "<system-reminder>\nThe following skills are available...\n</system-reminder>" },
  { "type": "text",
    "text": "<system-reminder>\nTask tools haven't been used recently...\n</system-reminder>" },
  { "type": "text",
    "text": "用户敲下的原始输入" }
]}
```

三种来源同框:会话层 hook 上下文 → turn 层 attachment 批 → 用户输入。

## 附:Anthropic Messages API 完整请求示例(官方形态参照)

```
POST https://api.anthropic.com/v1/messages
Headers:
  x-api-key: sk-ant-api03-xxxxxxxx      (示例, 已打码)
  anthropic-version: 2023-06-01
  content-type: application/json
```

```
{
  "model": "claude-sonnet-4-5-20250929",
  "max_tokens": 4096,
  "system": [
    {
      "type": "text",
      "text": "You are a weather assistant. Be concise.",
      "cache_control": { "type": "ephemeral" }
    }
  ],
  "messages": [
    { "role": "user", "content": [
      { "type": "text", "text": "帮我看下东京现在天气, 这里是截图:" },
      { "type": "image", "source": {
        "type": "base64", "media_type": "image/png",
        "data": "iVBORw0KGgo..." } }
    ]},
    { "role": "assistant", "content": [
      { "type": "text", "text": "我来查一下东京的实时天气。" },
      { "type": "tool_use", "id": "toolu_01A09q90...",
        "name": "get_weather",
        "input": { "location": "Tokyo, JP", "unit": "celsius" } }
    ]},
    { "role": "user", "content": [
      { "type": "tool_result", "tool_use_id": "toolu_01A09q90...",
        "content": [ { "type": "text",
          "text": "{\"temp_c\": 22, \"condition\": \"clear\", \"humidity\": 48}" } ],
        "is_error": false }
    ]}
  ],
  "tools": [
    { "name": "get_weather",
      "description": "Get the current weather for a given location.",
      "input_schema": {
        "type": "object",
        "properties": {
          "location": { "type": "string",
            "description": "City and country, e.g. 'Tokyo, JP'" },
          "unit": { "type": "string",
            "enum": ["celsius", "fahrenheit"], "default": "celsius" } },
        "required": ["location"] } }
  ],
  "tool_choice": { "type": "auto", "disable_parallel_tool_use": false },
  "temperature": 1.0, "top_p": 1.0, "top_k": 40,
  "stop_sequences": ["\n\nHuman:"],
  "stream": true,
  "metadata": { "user_id": "user_abc123" },
  "thinking": { "type": "enabled", "budget_tokens": 2048 }
}
```

字段要点:

| 字段 | 必填 |
| --- | --- |
| model | 是 | 模型 ID |
| max_tokens | 是 | 输出上限, 不含 thinking token |
| system | 否 | 字符串或 text block 数组(数组形式才能挂 cache_control) |
| messages | 是 | user/assistant 交替, 首条 user; 同角色连续需合并 |
| tools | 否 | 工具定义, input_schema 为 JSON Schema, 可加 cache_control |
| tool_choice | 否 | auto/any/tool/none; disable_parallel_tool_use 关闭并行调用 |
| temperature/top_p/top_k | 否 | 采样参数, 三者建议只调一个 |
| stream | 否 | true 走 SSE |
| thinking | 否 | 开启后 temperature 必须为 1, 且 top_p/top_k 不可设置 |

content block 类型速查:

```
text       → { "type": "text", "text": "..." }
image      → source 支持 base64 / url / file(Files API)
document   → PDF, 同 image 的 source 形式
tool_use   → 仅 assistant 输出: id / name / input
tool_result→ 仅 user 输入: tool_use_id / content / is_error,
             必须紧跟对应 tool_use 之后(账本闭环的 API 层保证)
thinking   → 多轮续写时要原样回传(含 signature)
```

响应体(非流式)要点:content 数组可含 thinking/text/tool_use;stop_reason 取值 end_turn / max_tokens / stop_sequence / tool_use / pause_turn / refusal;usage 含 cache_creation_input_tokens 与 cache_read_input_tokens(缓存命中计量)。

流式事件顺序(stream: true):

```
message_start → content_block_start → content_block_delta* → content_block_stop
  → (重复 content_block_*) → message_delta → message_stop
  (夹杂 ping 保活)

delta 类型: text_delta / input_json_delta(工具入参分片)
          / thinking_delta / signature_delta
```

与本文档的对应:④ 组装请求生成的 system/messages/tools 就是此形态;⑥ 工具调度消费的 tool_use/tool_result 配对即 content block 速查中的账本约束;⑤ 流式响应消费的正是上述事件流。

### ⑤ 流式响应

模型输出是事件流(非同步整体返回):文本块 / tool_use / usage / stop_reason / API 错误。StreamingToolExecutor 允许边流边把工具送去执行——流式的意义不只是早看到字,而是运行时在模型结束前就安排下一步。

### ⑥ 工具调度与权限

```
runTools(toolOrchestration.ts:19)
  partitionToolCalls(:91): isConcurrencySafe() 判定 → 并发批 / 串行单元
  并发路径: contextModifier 先缓存再按原始 block 顺序回放(:31-:63)
            → 执行并发, 语义上的上下文演化保持确定顺序

对每个 tool_use:
  PreToolUse hooks          [工具层 hook] ← 可 block
  权限判定 useCanUseTool:
    allow → 执行
    deny  → 拒绝(sticky, 同一 tool_use_id 不得重试为 allow)
    ask   → 协调器/分类器/交互式审批(不得自动升级为 allow)
  执行(执行前后: 校验/telemetry/synthetic error 包裹)
  PostToolUse hooks         [工具层 hook]
```

- 权限三态是独立运行时语义(PermissionResult.ts): 系统能明确表达"为什么这一步没有继续"
- Bash 特殊高压治理(bashPermissions.ts): shell 语义 / 命令前缀 / 重定向 / subcommand 数量上限
- 原则: 高危能力不享受通用工具的待遇

### ⑦⑧ 循环层

```
tool_result 回流
  循环内 attachment 注入(task 通知 / memory prefetch 消费)   query.ts:1580
有 tool_use → 回到 ⑤(下一轮 query, 不重跑①②③)
无 tool_use → 进入停止
```

关键事实:同一 turn 内的循环不重跑输入处理——输入层的门卫只看人,不看模型。

### ⑨ Stop hooks 与停止条件

```
Stop hooks                                    [停止层 hook]
  block → 强制回到 ⑤ 继续
  放行  → turn 结束
```

停止条件至少区分:
- 正常完成有 tool_use → follow-up 续
- 无 tool_use → 停
- 用户中断 → 补 synthetic tool_result 账本
- prompt_too_long / max_output_tokens → 恢复分支
- stop hook 阻塞 → 重进循环
- API 错误 → 直接返回

中断是一等语义: 已发出的 tool_use 必须有配套 tool_result, 哪怕内容是"被中断了"。

### compact 支线(插在 ⑤ 之前的输入治理段)

```
每轮 query 前检查上下文逼近阈值
  → PreCompact hooks                          [压缩层 hook]
  → 压缩执行(LLM 摘要 / session memory 方案)
  → PostCompact
  → SessionStart('compact') 重放               [会话层 hook 再入场]
  → 恢复批: invoked_skills 全文 / CLAUDE.md / 关键文件 attachment
```

输入治理先于模型调用(每轮 query 前, query.ts):
- compact boundary 之后的消息截取
- tool result budget
- history snip / microcompact / context collapse
- autocompact 检查

原则: 先把现场整理干净再交给模型, 不把整理责任转嫁给概率分布。

### 设计原则汇总

- **缓存分层**:每类内容住进匹配变化频率的层;界碑前的每个 if 都是给全局缓存分桶(2^N)。
- **渐进披露**:入口短、正文按需、增量优先。
- **机制预告**:运行时对上下文的一切非常规操作必须在 prompt 里预先买票。
- **说拦分离**:注入(说)与控制(拦)是两套机制;hook 有拦的权力,没有立法权。
- **等待推迟**:耗时内容先 kick 后 join,推迟到最后可推迟位置(首次 API 调用前)。
- **生命周期重放**:会话级上下文(SessionStart/CLAUDE.md/invoked skills)在 compact 后重放。
