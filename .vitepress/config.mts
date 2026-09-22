import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: 'Claude Code Harness 设计分析',
  description:
    '基于 vendored Claude Code 源码的 harness 设计逐层分析 —— query loop、工具与权限、上下文治理、skills、错误与恢复',
  base: '/harness-design/',
  srcDir: '.',
  srcExclude: ['**/.claude/**', '**/README.md'],
  cleanUrls: true,

  themeConfig: {
    nav: [
      { text: '全景', link: '/01-overview' },
      { text: '时间轴流程', link: '/02-timeline' },
      { text: '功能分析', link: '/03.1-prompt' },
      {
        text: 'GitHub',
        link: 'https://github.com/3dot141/harness-design',
      },
    ],

    sidebar: [
      {
        text: '总览',
        items: [
          { text: '01 全景', link: '/01-overview' },
          { text: '02 时间轴流程', link: '/02-timeline' },
        ],
      },
      {
        text: '03 功能',
        collapsed: false,
        items: [
          { text: '3.1 prompt', link: '/03.1-prompt' },
          { text: '3.2 hook', link: '/03.2-hook' },
          {
            text: '3.3 query loop',
            collapsed: false,
            items: [
              { text: '主循环全景', link: '/03.3-query-loop' },
              { text: '3.3.0 预取段', link: '/03.3.0-prefetch' },
              { text: '3.3.1 输入治理段', link: '/03.3.1-governance' },
              { text: '3.3.2 流式消费段', link: '/03.3.2-streaming' },
              { text: '3.3.3 终局分派段', link: '/03.3.3-dispatch' },
              { text: '3.3.4 轮末收集段', link: '/03.3.4-collect' },
            ],
          },
          { text: '3.4 工具和权限', link: '/03.4-tools' },
          { text: '3.5 上下文治理', link: '/03.5-context' },
          { text: '3.6 system-reminder', link: '/03.6-sysreminder' },
          { text: '3.7 skills', link: '/03.7-skills' },
          { text: '3.8 错误与恢复', link: '/03.8-errors' },
          { text: '3.9 checkpoint 体系', link: '/03.9-checkpoint' },
        ],
      },
    ],

    outline: { level: [2, 3], label: '本页目录' },
    docFooter: { prev: '上一页', next: '下一页' },
    lastUpdated: { text: '最后更新' },
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索', buttonAriaLabel: '搜索文档' },
          modal: {
            displayDetails: '显示详细列表',
            resetButtonTitle: '清除查询',
            backButtonTitle: '关闭',
            terminateTitle: '结束',
          },
        },
      },
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/3dot141/harness-design' },
    ],
  },
})
