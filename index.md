---
layout: home

hero:
  name: Claude Code Harness 设计分析
  text: 基于 vendored 源码的逐层机制还原
  tagline: 注释级因果论证 · 事故数字保留 · 每个机制标注 file:line
  actions:
    - theme: brand
      text: 开始阅读 —— 01 全景
      link: /01-overview
    - theme: alt
      text: 3.3 query loop
      link: /03.3-query-loop
    - theme: alt
      text: GitHub
      link: https://github.com/3dot141/harness-design

features:
  - icon: 🔁
    title: query loop
    details: 壳与芯 / 五段子页(预取·治理·流式·分派·收集)/ 413 两级抢救 / 死循环防护
  - icon: 🔧
    title: 工具和权限
    details: Tool 行为契约 / 批式到流式的演进 / ask 寻址链 / Bash 三层防线 / MCP 接入
  - icon: 📦
    title: 上下文治理
    details: CLAUDE.md 分层 / 预算阈值全景 / compact 受控重启 / SessionMemory 双链
  - icon: 🛡️
    title: 错误与恢复
    details: 恢复失败矩阵 / 熔断五不变式 / 七处回退同构 / checkpoint 代码回退
  - icon: ⚡
    title: skills
    details: 渐进披露三层 / 两条调用路径的注入 / addInvokedSkill 存与读
  - icon: 📝
    title: system-reminder
    details: 五大产生源 / 25 探测器明细 / FileRead 三处注入 / 合并机制
---
