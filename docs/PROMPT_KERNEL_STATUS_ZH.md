# PromptForge Prompt Kernel V0.2 研发状态

> 当前内核已合入集成开发分支。自动化通过不等于前端功能完整或外部平台兼容性验收通过。

## 分支与合并记录

- 仓库：`tortletortle/PromptForge`
- 集成分支：`develop/v0.1`
- 当前集成候选：`ac1529cb6427a9342f43ed771ff374a9f4fcdc23`
- PR #4 压力测试已合入 `develop/prompt-kernel`：`2e2b349136f433c320870ce3996ac98f7586a8db`
- PR #3 Kernel V0.2 已合入 `develop/v0.1`：`d6d33f4d0827a88d5447d4b21a216bc5b10ef8ea`
- PR #1 产品基础仍在 Draft，尚未合入 `main`。

## 最新自动化验收证据

[GitHub Actions Run #94：Success](https://github.com/tortletortle/PromptForge/actions/runs/45384611003)，对应当前集成候选提交。

| 验收项 | 结果 |
|---|---:|
| Core TypeScript | 通过 |
| API TypeScript | 通过 |
| Web TypeScript | 通过 |
| Core 测试 | 31/31 |
| API 测试 | 14/14 |
| Core / API / Web 生产构建 | 通过 |
| Playwright 浏览器 smoke test | 1/1 |
| 非 loopback HOST 拒绝测试 | 通过 |
| v1→v4 / v2→v4 数据迁移测试 | 通过 |
| 损坏快照迁移回滚测试 | 通过 |
| 源资产编辑/删除后的历史快照测试 | 通过 |

## 内核模块状态

| 子系统 | 目标 | 当前状态 |
|---|---|---|
| 资产角色 | system / developer / user | 自动化验收通过 |
| 依赖图 | 显式选择、传递依赖、环检测、稳定拓扑顺序 | 自动化验收通过 |
| 角色顺序 | system → developer → user | 自动化验收通过 |
| 冲突规则 | 双向声明冲突均拒绝 | 自动化验收通过 |
| 变量合并 | 默认值冲突升级为错误；required=true 优先 | 自动化验收通过 |
| 模板渲染 | 未声明变量、空必填值、格式错误占位符拒绝；不递归执行 | 自动化验收通过 |
| TokenCounter | 可注入计数器，明确估算器 ID | 自动化验收通过 |
| 编译消息 | 结构化角色消息并保留资产来源 ID | 自动化验收通过 |
| 编译清单 | 完整已解析资产快照、版本、变量 schema | 自动化验收通过 |
| 历史可追溯 | 输入变量、messages、Manifest、输出持久化 | 自动化验收通过 |
| SQLite 迁移 | v1/v2 → v4，DDL 和数据回填原子提交 | 自动化验收通过 |
| 迁移失败恢复 | 损坏快照触发回滚，数据库句柄关闭 | 自动化验收通过 |
| 前端角色编辑 | system / developer / user 选择和修改 | 未开始 |
| 结构化消息预览 | 分角色显示、来源定位 | 未开始 |
| 外部平台实机兼容性 | Cursor / Claude Code 真实项目加载 | 未开始 |

## 关键设计边界

- Kernel 不依赖数据库、HTTP、文件系统、IDE、模型 SDK 或 LLM。
- 资产必须显式选择；依赖自动展开，不进行语义自动选择。
- 角色顺序与依赖顺序冲突时失败关闭。
- 变量值按纯文本处理，不执行或递归解析注入内容。
- Manifest 保存解析资产快照；编译历史的 input 保存变量值。
- 默认 heuristic-v2 仅为近似 Token 估算。
- API 适配器只生成结构化 messages JSON，不会发送模型请求。
- Cursor / Claude Code 适配器只生成建议文件，不会自动写入外部项目。

## 压力测试

详见 [压力测试报告](PROMPT_KERNEL_STRESS_REPORT_ZH.md)。

已覆盖 10k 平铺资产、20k 深度链/环、10k 宽依赖、50k 根选择、5k 冲突对、8k 变量、2.075 MB Unicode 模板和 100 条 API 编译历史。

仍未覆盖多进程 SQLite 写竞争、真实网络压测、长期 Soak、峰值 RSS/GC/CPU profile；不能据此宣称生产 SLA。

## 下一步

1. 实现前端角色编辑和结构化消息预览。
2. 增加 Manifest 历史详情、变量输入回放和版本差异。
3. 接入真实模型 tokenizer 并对照 heuristic-v2。
4. 在真实 Cursor / Claude Code 项目中验证导出文件加载行为。
5. 完成 JSON Bundle 导入/导出、数据库备份恢复。
