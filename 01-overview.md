# 01 全景

## 一个 harness 需要哪些东西

总判断:模型是不稳定部件,harness 是围绕这个前提建的控制结构。Prompt 决定它怎么说话,harness 决定它怎么做事。七部件框架基于源码逐项验证。

```
用户会话                     系统内层
──────────────────          ─────────────────────────────
system prompt 装配      →   ① 静态段(身份/规则/纪律) ═ BOUNDARY ═ 动态段
query loop              →   ② 每轮: 输入治理 → 流式消费 → 工具调度 → 恢复/停止
tool_use                →   ③ 调度(并发/串行) → 权限(allow/deny/ask) → 执行
上下文逼近窗口           →   ④ 分层记忆 + 预算 + compact 重建工作语义
出错(PTL/MOT/中断)       →   ⑤ withheld 扣留 → 分层恢复 → 熔断 → 防死循环
任务变大                →   ⑥ fork(cache-safe/隔离) + 独立验证
团队采用                →   ⑦ 制度化(CLAUDE.md 分层/skill/hook/transcript)
```

| # | 部件 | 核心问题 | 硬约束(源码不变式) |
| --- | --- | --- | --- |
| ① | Prompt 控制面 | 它能做什么, 谁说了算 | 优先级链 override>coordinator>agent\|custom>default; append 只追加 |
| ② | Query Loop | 多轮后还知不知道自己在做什么 | 跨轮状态对象; 每个 tool_use 必有 tool_result; turnCount 单调 |
| ③ | 工具系统 | 谁决定工具怎么跑 | 权限三态不塌缩; ask 不自动升级; 并发保持因果顺序 |
| ④ | 上下文治理 | 怎么不被记住的东西拖死 | MEMORY.md ≤200 行; session memory 单节≤2k/总≤12k; compact 预留 20k+13k |
| ⑤ | 错误与恢复 | 出错后还能不能继续干活 | 恢复分层; 连败 3 次熔断; 恢复自身防死循环 |
| ⑥ | 多代理与验证 | 不确定性怎么分区 | fork 不破缓存; 默认隔离显式共享; 验证者≠实现者 |
| ⑦ | 团队制度 | 高手经验怎么可重复 | 先画最低边界再造 skill; 新人无需旁站=成熟 |

## 两条贯穿机制

```
静态通道: system prompt(会话装配一次)
   身份/规则/纪律/工具用法/语气      → 缓存前缀, 不变即命中
   ═══════════ BOUNDARY MARKER(界碑) ═══════════
动态通道: system-reminder(每 turn 约 25 个探测器扫描)
   skill 索引/todo/日期/文件态/MCP delta → 增量注入, 缓存前缀不动
```

- **双通道注入**:静态层 system prompt + 动态层 system-reminder,缓存语义分离。
- **渐进披露**:入口短、正文按需、增量优先——skills(索引一行+调用才展开)、MEMORY.md(索引/正文分离)、deferred tools(只发增量)同一语法。
