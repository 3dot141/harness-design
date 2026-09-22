# Claude Code Harness 设计分析

基于 vendored Claude Code 源码的 harness 设计逐层分析 —— query loop、工具与权限、上下文治理、skills、错误与恢复。

> 研究方法: 源码对照(注释级因果还原), 所有机制均标注源文件与行号。

## 目录

- [01 全景](01-overview.md)
- [02 时间轴流程](02-timeline.md)
- [3.1 prompt](03.1-prompt.md) —— 静态区/动态区/界碑/2^N 缓存碎片化
- [3.2 hook](03.2-hook.md)
- [3.3 query loop](03.3-query-loop.md)
  - [3.3.0 预取段](03.3.0-prefetch.md)
  - [3.3.1 输入治理段](03.3.1-governance.md) —— 六步管线与缓存账
  - [3.3.2 流式消费段](03.3.2-streaming.md) —— withheld/边流边调度/fallback
  - [3.3.3 终局分派段](03.3.3-dispatch.md) —— 判定链/413 两级抢救/死循环防护
  - [3.3.4 轮末收集段](03.3.4-collect.md)
- [3.4 工具和权限](03.4-tools.md) —— Tool 契约/批式到流式/权限寻址链/Bash/MCP
- [3.5 上下文治理](03.5-context.md) —— CLAUDE.md 分层/预算阈值/compact 受控重启/SessionMemory
- [3.6 system-reminder 触发场景汇总](03.6-sysreminder.md)
- [3.7 skills](03.7-skills.md) —— 渐进披露/两路径注入/addInvokedSkill
- [3.8 错误与恢复](03.8-errors.md) —— 失败矩阵/熔断不变式/回退同构
- [3.9 checkpoint 体系](03.9-checkpoint.md) —— 代码回退/fileHistory

## 贯穿性结论速览

- 上下文的形态稳定性是贯穿所有部件的设计目标: 静态区防前缀碎片(2^N), 治理段防历史变形
- 重试是被管理的行为: 保护位逐站判定, 死循环防护靠"知道什么时候不该再试"
- 恢复要可计数、可限次、可熔断 —— 否则恢复会从保险丝变成新的起火点
- 成本决定通道: 检索延迟藏进空闲, 判断智能档位与难度匹配
