# PromptForge 项目进度看板

> 看板状态必须对应真实分支、完整 commit SHA 和可复跑证据。计划、代码存在、局部测试通过不能代替完整验收。

## 当前研发基线

- 仓库：`tortletortle/PromptForge`
- 稳定集成分支：`main` @ `abba0f13362df5a7b2b46adf31739705869dcdfe`
- 开发分支：`develop/v0.1` @ `3262b16f3eb912414ee170e39da38b6854f5c576`
- 技术栈：Node.js 22、TypeScript、React、Fastify、SQLite、Vite。

### PR 收敛状态

| PR | 目标分支 | 状态 | 合并提交 |
|---|---|---|---|
| [#4 Kernel 压力测试](https://github.com/tortletortle/PromptForge/pull/4) | develop/prompt-kernel | 已合并 | `2e2b349136f433c320870ce3996ac98f7586a8db` |
| [#3 Prompt Kernel V0.2](https://github.com/tortletortle/PromptForge/pull/3) | develop/v0.1 | 已合并 | `d6d33f4d0827a88d5447d4b21a216bc5b10ef8ea` |
| [#1 V0.1 产品基础](https://github.com/tortletortle/PromptForge/pull/1) | main | 已合并 | `abba0f13362df5a7b2b46adf31739705869dcdfe` |

**P0 主线收敛已经完成。** V0.1 产品基础、V0.2 Kernel 和压力测试成果均已进入 main。当前仍是初始开发基线，不是正式发布版本。

## 最新主线自动化验收

- main 提交：`abba0f13362df5a7b2b46adf31739705869dcdfe`
- [GitHub Actions Run #101：Success](https://github.com/tortletortle/PromptForge/actions/runs/45385688286)
- Core 测试：31/31。
- API 测试：14/14。
- Core / API / Web TypeScript 检查：通过。
- Core / API / Web 生产构建：通过。
- Playwright 浏览器 smoke test：1/1。
- 浏览器报告由 CI 上传。

以上是该精确主线提交的自动化证据，不代表已经完成真实平台兼容性或生产环境验收。

## V0.1 产品基础

| 模块 | 当前状态 | 说明 |
|---|---|---|
| 提示词资产 CRUD | 自动化验收通过 | 创建、读取、编辑、删除、搜索 |
| 资产版本 | 自动化验收通过 | 不可变快照、恢复旧版本为新版本 |
| 项目管理 | 自动化验收通过 | 项目和默认 Token 预算 |
| 任务上下文 | 自动化验收通过 | 字符串变量、任务选择资产 |
| 依赖解析 | 自动化验收通过 | 显式选择、传递依赖、稳定顺序 |
| 冲突检测 | 自动化验收通过 | 双向声明均可阻止编译 |
| 模板引擎 | 自动化验收通过 | 必填值、默认值、严格模板语法 |
| Token 预算 | 自动化验收通过 | heuristic-v2 近似估算 |
| 编译历史 | 自动化验收通过 | 输入、输出、消息、Manifest、诊断 |
| 平台适配器 | 自动化验收通过 | 生成可下载文件，不是 IDE 插件 |
| 前端主流程 | Playwright 通过 | 资产 → 项目/任务 → 编译 → 导出 → 历史 |

## V0.2 Prompt Kernel

| 子系统 | 状态 | 说明 |
|---|---|---|
| system / developer / user 角色 | 自动化验收通过 | 角色化消息 |
| 依赖图 | 自动化验收通过 | 迭代 DFS、环检测、缺失依赖诊断 |
| 角色顺序 | 自动化验收通过 | 不可满足的依赖关系失败关闭 |
| 冲突规则 | 自动化验收通过 | 冲突边索引、去重 |
| 变量合并 | 自动化验收通过 | 默认值冲突拒绝、必填约束 |
| 模板渲染 | 自动化验收通过 | 不执行代码、不递归展开注入值 |
| TokenCounter | 自动化验收通过 | 可注入，默认 heuristic-v2 |
| Compile Manifest | 自动化验收通过 | 完整解析资产快照 |
| 历史快照 | 自动化验收通过 | 源资产修改或删除后历史不变 |
| SQLite v1/v2 → v4 | 自动化验收通过 | 原子迁移、损坏快照回滚 |
| 前端角色编辑 | 未开始 | 下一阶段任务 |
| 结构化消息预览 | 未开始 | 下一阶段任务 |

## 性能与压力测试证据

专项报告：[Prompt Kernel 压力测试报告](PROMPT_KERNEL_STRESS_REPORT_ZH.md)。

已通过的压力场景：
- 10,000 个平铺资产。
- 20,000 节点依赖链和循环依赖。
- 10,001 节点宽依赖图。
- 50,000 条根选择记录。
- 10,000 个资产、5,000 对冲突。
- 8,000 个变量。
- 约 2.075 MB Unicode 模板。
- 100 个 API 请求及 100 条唯一编译历史。

这些结果来自单次 CI 测量，不构成生产 SLA。

## 当前安全与可靠性边界

1. API 默认监听 loopback；非 loopback 的 `HOST` 覆盖会被拒绝。
2. API 尚无认证，不支持公网或不可信局域网暴露。
3. 编译器不发送提示词到外部模型。
4. 适配器只生成文件，不会自动覆盖外部项目。
5. Token 估算不是具体模型的精确 tokenizer。
6. 尚未完成多进程 SQLite 写竞争、独立进程重启、真实网络压力、长期 Soak、峰值 RSS/GC/CPU profiling。
7. npm lockfile 尚未纳入仓库，跨时间安装的传递依赖版本还不能完全锁定。
8. API 备份恢复和完整数据导入/导出仍需补齐。

## 下一阶段执行顺序

| 任务 | 优先级 | 状态 | 验收目标 |
|---|---|---|---|
| PF-004 前端角色编辑 | P0 | 待启动 | 能创建和编辑三种角色资产 |
| PF-005 结构化预览与 Manifest 历史查看 | P1 | 待启动 | 能定位消息来源并复现历史输入 |
| PF-006 SQLite 多进程竞争与恢复 | P0 | 待启动 | 无静默丢失、迁移可恢复 |
| PF-007 API 输入与资源限制 | P0 | 待启动 | 超限有结构化错误，不导致进程失控 |
| PF-008 真实网络压测与 Soak | P0 | 阻塞中 | 有可复跑脚本、原始数据和性能报告 |
| PF-009 备份恢复 | P1 | 待启动 | 数据库往返恢复通过 |
| PF-010 JSON Bundle 导入/导出 | P1 | 待启动 | 往返一致、失败回滚 |
| PF-011 Cursor / Claude Code 兼容性 | P1 | 待启动 | 真实目标环境验证 |
| PF-012 ChatGPT / API / Local 适配器验收 | P1 | 待启动 | 契约与实际使用验证 |
| PF-013 真实 TokenCounter | P1 | 待启动 | tokenizer 误差对照 |
| PF-014 桌面安装包选型 | P2 | 待启动 | 干净环境安装与升级验收 |
| PF-015 npm lockfile 与 npm ci | P0 | 待启动 | 依赖版本锁定、干净安装通过 |

**当前结论：** main 已具备可持续开发的初始产品基线，并通过 Run #101。下一阶段优先完成角色化前端和可靠性专项；尚未达到正式发布条件。
