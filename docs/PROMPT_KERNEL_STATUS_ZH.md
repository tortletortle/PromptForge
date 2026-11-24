# PromptForge Prompt Kernel V0.2 研发状态

> 当前状态以本分支最新可复跑 CI 证据为准。自动化通过不等于已合并或已完成外部平台兼容性验收。

## 分支与基线

- 仓库：`tortletortle/PromptForge`
- 功能分支：`develop/prompt-kernel`
- 基线：`develop/v0.1` @ `623487200b8e343ebe23c54660af96681da78939`
- 已验证提交：`5994b3e263cae8306947960127c791e5c395d665`
- Draft PR：[#3](https://github.com/tortletortle/PromptForge/pull/3)
- V0.1 主线 PR：[#1](https://github.com/tortletortle/PromptForge/pull/1)，保持 Draft；本专项未合并。

## 自动化验收证据

GitHub Actions [Run #50](https://github.com/tortletortle/PromptForge/actions/runs/45349438615)：Success。

| 验收项 | 结果 | 证据 |
|---|---:|---|
| Core TypeScript | 通过 | Run #50 |
| API TypeScript | 通过 | Run #50 |
| Web TypeScript | 通过 | Run #50 |
| Core 单元测试 | 21/21 | compiler 17 + adapters 4 |
| API 集成测试 | 9/9 | 含 v2→v4 迁移、角色持久化、历史 manifest |
| Core / API / Web 生产构建 | 通过 | Run #50 |
| Playwright 浏览器 smoke test | 1/1 | 资产 → 项目/任务 → 上下文 → 编译 → 导出 → 历史 |
| 浏览器报告 | 已上传 | [Artifact](https://github.com/tortletortle/PromptForge/actions/runs/45349438615/artifacts/14899338057) |

## 内核模块状态

| 子系统 | 目标 | 当前状态 |
|---|---|---|
| 资产角色 | system / developer / user | 自动化验收通过 |
| 依赖图 | 显式选择、传递依赖、环检测、稳定拓扑顺序 | 自动化验收通过 |
| 角色顺序 | system → developer → user；冲突依赖失败关闭 | 自动化验收通过 |
| 冲突规则 | 双向声明冲突均拒绝 | 自动化验收通过 |
| 变量合并 | 默认值冲突升级为错误；required=true 优先 | 自动化验收通过 |
| 模板渲染 | 未声明变量、空必填值、格式错误占位符拒绝；不递归执行 | 自动化验收通过 |
| TokenCounter | 可注入计数器，明确估算器 ID | 自动化验收通过 |
| 编译消息 | 结构化角色消息并保留资产来源 ID | 自动化验收通过 |
| 编译清单 | 完整已解析资产快照、版本、变量 schema | 自动化验收通过 |
| SQLite 迁移 | schema v2 → v4，旧资产默认 system | 自动化验收通过 |
| 编译历史 | 持久化结构化消息与 manifest | 自动化验收通过 |
| 前端角色编辑 | 不在本轮范围 | 未开始 |

## 当前边界

- 本轮不做 UI 重构，不做 IDE 插件，不连接模型服务。
- API 适配器只生成结构化 messages JSON，不会发送请求。
- 默认 `heuristic-v2` 仍是近似估算，不代表任意模型的精确 token 数。
- 角色编辑 UI 暂未接入；未指定角色的新资产仍默认为 system。
- 历史 v0.1 编译记录没有原始 manifest，迁移后标记为 `legacy-unknown`，不会伪造快照。
- 自动化通过不代表 Cursor Rules / Claude Code 文件已在真实外部项目中完成兼容性验收。

## 下一步

1. 审查 PR #3 的数据模型、迁移和编译契约，保持 Draft，不自动合并。
2. 在前端增加角色编辑和结构化消息预览。
3. 为不同模型接入独立 TokenCounter 实现，并用真实 tokenizer 对照 heuristic-v2。
4. 验证 Cursor Rules 与 Claude Code 目标文件在真实项目中的加载行为。
5. 设计提示词资产 JSON 导入/导出和数据库备份恢复。
