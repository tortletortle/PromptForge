# PromptForge V0.1 项目进度看板

> 看板状态必须对应当前分支、提交和可复跑证据。代码写入不等于功能验收。

## 当前基线

- 仓库：`tortletortle/PromptForge`
- 稳定分支：`main`
- V0.1 开发分支：`develop/v0.1`
- V0.2 内核分支：`develop/prompt-kernel`
- 技术栈：TypeScript + React + SQLite
- V0.1 PR：[#1](https://github.com/tortletortle/PromptForge/pull/1)，Draft，未合并。
- V0.2 内核 PR：[#3](https://github.com/tortletortle/PromptForge/pull/3)，Draft，未合并。

## V0.2 Prompt Kernel 自动化验收

已验证提交：`5994b3e263cae8306947960127c791e5c395d665`

- GitHub Actions [Run #50：Success](https://github.com/tortletortle/PromptForge/actions/runs/45349438615)。
- Core / API / Web TypeScript 检查全部通过。
- Core 测试：21/21；API 测试：9/9。
- Core / API / Web 生产构建全部通过。
- Playwright 浏览器 smoke test：1/1 通过。
- [Playwright 报告 Artifact](https://github.com/tortletortle/PromptForge/actions/runs/45349438615/artifacts/14899338057)。

详细设计与专项看板：
- [Prompt Kernel 设计规范](PROMPT_KERNEL_DESIGN.md)
- [Prompt Kernel 研发状态](PROMPT_KERNEL_STATUS_ZH.md)

## V0.1 功能看板

| 模块 | 当前状态 | 说明/边界 |
|---|---|---|
| 提示词资产 CRUD | 已实现 | 分类、标签、搜索、优先级 |
| 资产版本 | 已实现 | 每次保存生成快照；恢复旧快照会创建新版本 |
| 项目管理 | 已实现 | 项目默认 Token 预算 |
| 任务上下文 | 已实现 | 字符串变量、任务选择的资产 ID |
| 依赖解析 | 已实现 | 自动展开、依赖优先、确定性排序 |
| 冲突检测 | 已实现 | 任一侧声明冲突即可阻止编译 |
| 模板引擎 | 已实现 | 必填变量、默认值、缺失变量诊断 |
| Token 预算 | 已实现 | heuristic-v2 近似估算，不是模型 tokenizer |
| 编译记录 | 已实现 | 成功/失败历史 |
| 平台适配器 | 已实现 | 当前生成可下载文件，不是 IDE 插件或自动写入 |
| 前端 | 已实现 | 资产、项目/任务、编译、下载和历史主流程通过 Playwright |

## V0.2 内核能力

| 子系统 | 状态 | 说明 |
|---|---|---|
| 角色化消息 | 自动化验收通过 | system / developer / user |
| 确定性依赖图 | 自动化验收通过 | 传递依赖、环检测、稳定顺序 |
| 角色顺序约束 | 自动化验收通过 | 不可满足的跨角色依赖失败关闭 |
| 严格变量 schema | 自动化验收通过 | 未声明变量、空必填值、默认值冲突均有诊断 |
| TokenCounter | 自动化验收通过 | 可注入，默认 heuristic-v2 |
| Compile Manifest | 自动化验收通过 | 完整 resolved asset snapshots |
| 历史可追溯 | 自动化验收通过 | 保存 messages 和 manifest |
| SQLite v2→v4 | 自动化验收通过 | 旧资产和快照默认 system |
| 前端角色编辑 | 未开始 | 后续单独开发 |
| 外部平台实机兼容性 | 未开始 | 需要 Cursor / Claude Code 真实项目验收 |

## 当前限制与风险

1. **Token 估算：** heuristic-v2 不能保证与具体模型 tokenizer 一致。
2. **目标平台集成：** Cursor、Claude Code、ChatGPT、本地模型适配器当前生成可下载文件或可复制文本，不会直接写入外部项目，也不会调用模型服务。
3. **API 适配器：** 当前只生成结构化 messages JSON，不发送模型请求。
4. **安全：** 本地 API 默认监听 `127.0.0.1`，无认证；禁止直接暴露到公网或不可信局域网。
5. **人工验收：** 自动化通过后仍需维护者审查 PR，并在实际使用环境中确认导出文件兼容性。

## 下一步

1. 人工审查 [PR #3](https://github.com/tortletortle/PromptForge/pull/3)，保持 Draft，不自动合并。
2. 增加前端角色编辑和结构化消息预览。
3. 为目标模型接入真实 tokenizer，并与 heuristic-v2 对照。
4. 对 Cursor Rules 与 Claude Code 目标文件做真实项目兼容性验证。
5. 设计提示词资产 JSON 导入/导出与数据库备份恢复。


## Prompt Kernel 压力测试（2026-11-24）

- 专项报告：[PROMPT_KERNEL_STRESS_REPORT_ZH.md](PROMPT_KERNEL_STRESS_REPORT_ZH.md)
- 压力测试 PR：[#4](https://github.com/tortletortle/PromptForge/pull/4)，Draft，基于 \`develop/prompt-kernel\`。
- [GitHub Actions Run #62：Success](https://github.com/tortletortle/PromptForge/actions/runs/45354644558)。
- Core 31/31、API 10/10、Playwright 1/1；所有类型检查和生产构建通过。
- 20,000 节点深度依赖从调用栈溢出修复为 88.15 ms 完成。
- 10,000 资产平铺编译 53.66 ms；10,001 节点宽依赖 63.61 ms。
- 50,000 个根选择条目去重 16.01 ms；10,000 资产中 5,000 对冲突检测 39.87 ms。
- 100 个并发 API 编译请求在 102.54 ms 内完成，100 条唯一历史记录均持久化。
- 以上为单次 GitHub Actions 测量，不构成生产 SLA。
- 仍待进行：多进程 SQLite 竞争、真实网络压力、长时间 soak、峰值 RSS/GC/CPU 分析。
