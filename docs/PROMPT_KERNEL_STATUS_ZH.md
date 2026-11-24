# PromptForge Prompt Kernel V0.2 研发状态

> 本文件跟踪内核升级。代码已写入功能分支不等于测试通过；只有 CI 与迁移测试通过后才能更新为已验收。

## 分支与基线

- 仓库：`tortletortle/PromptForge`
- 功能分支：`feature/prompt-kernel`
- 分支基线：`develop/v0.1` @ `4b76bcc60b0465d796a24e199593c5123dd59b58`
- V0.1 主线 PR：[#1](https://github.com/tortletortle/PromptForge/pull/1)，保持 Draft，不合并本专项分支。

## 本轮内核目标

将当前“单段文本拼接器”升级为 provider-independent 的确定性 Prompt Kernel。

| 子系统 | 目标 | 当前状态 | 验收证据 |
|---|---|---|---|
| 资产角色 | system / developer / user | 已实现，待 CI | core + API 测试 |
| 依赖图 | 显式选择、传递依赖、环检测、稳定拓扑顺序 | 保留并强化 | core 测试 |
| 角色顺序 | system → developer → user；冲突依赖失败关闭 | 已实现，待 CI | core 测试 |
| 冲突规则 | 双向声明冲突均拒绝 | 保留 | core 测试 |
| 变量合并 | 默认值冲突升级为错误 | 已实现，待 CI | core 测试 |
| 模板渲染 | 未声明变量、空必填值、格式错误占位符拒绝；不递归执行 | 已实现，待 CI | core 测试 |
| TokenCounter | 可注入计数器，明确估算器 ID | 已实现，待 CI | core 测试 |
| 编译消息 | 按角色输出结构化消息并保留资产来源 ID | 已实现，待 CI | core + adapter 测试 |
| 编译清单 | 保存完整已解析资产快照和版本 | 已实现，待 CI | core 测试 |
| SQLite 迁移 | schema v2 → v4，旧资产默认 system | 已实现，待 CI | API 迁移测试 |
| 编译历史 | 持久化结构化消息与 manifest | 已实现，待 CI | API 测试 |
| 前端角色编辑 | 暂不在本轮范围 | 未开始 | 后续单独任务 |

## 当前边界

- 本轮不做 UI 重构，不做 IDE 插件，不连接模型服务。
- API 适配器只生成结构化 messages JSON，不会发送请求。
- 默认 `heuristic-v2` 仍是近似估算，不代表任意模型的精确 token 数。
- 角色编辑 UI 暂未接入；未指定角色的新资产仍默认为 system。
- 必须先通过新分支 CI，才能把本表状态从“已实现，待 CI”改成“自动化验收通过”。

## 验收顺序

1. Core / API / Web TypeScript 检查。
2. Core 测试：依赖、角色顺序、变量约束、确定性、TokenCounter、manifest。
3. API 测试：角色持久化、历史消息、旧 schema 迁移。
4. Core / API / Web 生产构建。
5. 原有浏览器主流程 smoke test。
6. 更新实际 commit SHA、CI Run 和失败记录。
