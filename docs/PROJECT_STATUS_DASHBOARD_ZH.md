# PromptForge V0.1 项目进度看板

> 看板状态必须对应当前分支、实际提交和可复跑证据。代码写入不等于功能验收。

## 当前基线

- 仓库：`tortletortle/PromptForge`
- 稳定分支：`main`
- 开发分支：`develop/v0.1`
- 起始提交：`b4d7bef19ebad4def1ce78978cdd0afae5dea542`
- 技术栈：TypeScript + React + SQLite
- 当前阶段：V0.1 首轮 CI 已通过；正在补充资产版本快照和浏览器端到端验收。

## 自动化验证证据

首轮基线提交 `6c7e929fa7e1f452e03450cbd21e3a00e2f74a15`：

- GitHub Actions Run #11：成功。
- Core TypeScript、API TypeScript、Web TypeScript：全部通过。
- Core：11/11 测试通过。
- API：3/3 集成测试通过。
- Core、API、Web 生产构建：全部通过。
- 证据：[GitHub Actions Run #11](https://github.com/tortletortle/PromptForge/actions/runs/45303421322)。

上述证据只覆盖该基线提交。新增的版本快照与 Playwright 浏览器测试必须在后续提交重新通过 CI，不能沿用旧结果。

## 总体进度

| 工作流 | 状态 | 证据/验收 |
|---|---|---|
| 仓库初始化与分支隔离 | 已完成 | `main`、`develop/v0.1` |
| 核心依赖解析与确定性编译 | 已通过首轮验证 | Core 11 项测试 |
| 变量模板与 Token 预算 | 已通过首轮验证 | Core 测试 + CI |
| 五类目标适配器 | 已通过首轮验证 | Adapter 测试 |
| SQLite 持久化与 Fastify API | 已通过首轮验证 | API 3 项测试 |
| React 资产库与组合工作台 | 已通过类型检查和生产构建 | CI Run #11 |
| 资产版本快照与恢复 | 已实现，待新 CI 验证 | `prompt_asset_versions`、版本恢复 API |
| Playwright 浏览器全链路 | 已编写，待执行 | `apps/web/e2e/workflow.spec.ts` |
| Draft PR | 开放，未合并 | [PR #1](https://github.com/tortletortle/PromptForge/pull/1) |

## V0.1 功能看板

| 模块 | 子任务 | 当前状态 | 下一步 |
|---|---|---|---|
| 提示词资产 | CRUD、分类、标签、搜索 | 首轮实现已通过构建 | 浏览器验收 |
| 资产版本 | 每次保存生成快照、查看历史、恢复为新版本 | 已实现，待验证 | API 测试与 UI 验收 |
| 项目管理 | 项目与 Token 预算 | 首轮 API 测试通过 | 浏览器验收 |
| 任务上下文 | 任务、字符串变量、选中模块 | 首轮 API 测试通过 | 验证上下文参与编译 |
| 依赖解析 | 自动展开、依赖优先排序 | Core 测试通过 | 增加边界测试 |
| 冲突检测 | 双向冲突检查 | Core 测试通过 | 增加多模块组合测试 |
| 模板引擎 | 必填变量、默认值 | Core 测试通过 | 增加转义和异常输入测试 |
| Token 预算 | 启发式估算和超限拒绝 | Core 测试通过 | 后续接入模型 tokenizer |
| 编译记录 | 成功/失败历史 | 首轮 API 测试通过 | 验证重启后记录保留 |
| 平台适配器 | Cursor / Claude Code / ChatGPT / API / Local | 单元测试通过 | 实际目标环境兼容性测试 |
| 前端 | 资产库 / 编译工作台 / 历史 | 类型检查与构建通过 | Playwright 浏览器验收 |

## 当前阻塞与风险

1. **浏览器真实操作尚未验收。** 自动化脚本已加入，但只有 CI 实际执行成功后才算通过。
2. **Token 估算是启发式。** `heuristic-v1` 不能替代具体模型 tokenizer。
3. **适配器目前是导出器。** 尚未实现 Cursor / Claude Code 插件、自动文件写入或模型 API 调用。
4. **本地 API 无认证。** 默认只监听 `127.0.0.1`，禁止直接暴露到公网或不可信局域网。

## 下一步验收顺序

1. 运行版本快照、版本恢复和旧数据库迁移测试。
2. 运行 Playwright 浏览器全链路：创建资产 → 创建项目/任务 → 注入上下文 → 编译 → 下载导出 → 查看历史。
3. 修复所有 CI 或浏览器失败项。
4. 以新提交 SHA 和 CI Run 更新本看板。
5. 保持 PR 为 Draft，直到全链路验收和人工审查完成。
