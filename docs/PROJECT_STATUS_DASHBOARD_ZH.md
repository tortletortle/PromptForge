# PromptForge V0.1 项目进度看板

> 状态只根据当前分支、提交和可复跑证据更新。代码写入不等于功能验收。

## 当前基线

- 仓库：`tortletortle/PromptForge`
- 稳定分支：`main`
- 开发分支：`develop/v0.1`
- 功能验收提交：`c45216913a2ad99b02a570da56a4f5d72e6d213d`
- 技术栈：TypeScript + React + SQLite
- 阶段：V0.1 首轮功能与自动化全链路验收通过；Draft PR 等待人工审查。

## 自动化验证证据

当前提交 `c45216913a2ad99b02a570da56a4f5d72e6d213d`：

- GitHub Actions Run #17：成功。
- Core / API / Web TypeScript 检查：全部通过。
- Core 单元测试：11/11 通过。
- API 集成测试：4/4 通过，覆盖资产版本快照、版本恢复、编译历史、SQLite 重启持久化及项目任务上下文。
- Core / API / Web 生产构建：全部通过。
- Playwright 浏览器端到端：1/1 通过，覆盖资产创建 → 项目/任务 → 上下文变量注入 → 编译 → 文件下载 → 历史记录。
- [GitHub Actions Run #17](https://github.com/tortletortle/PromptForge/actions/runs/45306862641)
- [Playwright 报告与运行附件](https://github.com/tortletortle/PromptForge/actions/runs/45306862641/artifacts/14881222585)

首轮基础提交也通过了 CI Run #11；Run #17 覆盖功能验收提交。随后仅更新了项目看板和 PR 描述，没有修改产品源代码。

## 总体进度

| 工作流 | 状态 | 证据 |
|---|---|---|
| 仓库初始化与分支隔离 | 已完成 | `main`、`develop/v0.1` |
| 核心依赖解析与确定性编译 | 自动化验收通过 | Core 11 项测试 |
| 变量模板与 Token 预算 | 自动化验收通过 | Core 测试 + CI |
| 五类目标适配器 | 单元测试通过 | Cursor / Claude Code / ChatGPT / API / Local |
| SQLite 持久化与 Fastify API | 自动化验收通过 | API 4 项测试 |
| 资产版本快照与恢复 | 自动化验收通过 | 版本 API 测试 + 前端恢复入口 |
| React 资产库与组合工作台 | 自动化验收通过 | TypeScript + Vite build |
| 浏览器完整工作流 | 自动化验收通过 | Playwright 1/1 |
| Draft PR | 开放，未合并 | [PR #1](https://github.com/tortletortle/PromptForge/pull/1) |

## V0.1 功能看板

| 模块 | 当前状态 | 说明/边界 |
|---|---|---|
| 提示词资产 CRUD | 已实现并通过自动化验收 | 分类、标签、搜索、优先级 |
| 资产版本 | 已实现并通过 API 验收 | 每次保存生成快照；恢复旧快照会创建新版本 |
| 项目管理 | 已实现并通过 API 验收 | 项目默认 Token 预算 |
| 任务上下文 | 已实现并通过 API 与 E2E 验收 | 字符串变量、任务选择的资产 ID |
| 依赖解析 | 已实现并通过单元测试 | 自动展开、依赖优先、确定性排序 |
| 冲突检测 | 已实现并通过单元测试 | 任一侧声明冲突即可阻止编译 |
| 模板引擎 | 已实现并通过单元测试 | 必填变量、默认值、缺失变量诊断 |
| Token 预算 | 已实现并通过单元测试 | `heuristic-v1` 仅为粗略估算，不是模型 tokenizer |
| 编译历史 | 已实现并通过 API 测试 | 保存成功/失败、输入快照、输出和诊断 |
| 平台适配器 | 已实现并通过单元测试 | 当前是目标格式导出，不是 IDE 插件或自动写入 |
| 前端 | 已实现并通过 Playwright | 资产、项目/任务、编译、下载和历史链路 |

## 当前限制与风险

1. **API 适配器边界：** 当前生成通用 Chat Completions 风格 JSON，并将整包作为 system message；尚未实现 system/developer/user 分角色资产编译。
2. **目标平台集成：** Cursor、Claude Code、ChatGPT、本地模型适配器当前生成可下载文件或可复制文本，不会直接写入外部项目，也不会调用模型服务。
3. **Token 估算：** `heuristic-v1` 不能保证与具体模型 tokenizer 一致。
4. **安全：** 本地 API 默认监听 `127.0.0.1`，无认证；禁止直接暴露到公网或不可信局域网。
5. **人工验收：** CI 已通过，但仍需维护者审阅 PR 和在实际使用环境中确认导出文件兼容性。

## 总体开发计划与当前执行阶段

完整路线图：[DEVELOPMENT_PLAN_ZH.md](DEVELOPMENT_PLAN_ZH.md)。

### 当前分支链

| PR | 目标分支 | 当前状态 | 说明 |
|---|---|---|---|
| [#4 压力测试](https://github.com/tortletortle/PromptForge/pull/4) | develop/prompt-kernel | Draft，未合并 | 20k 深度链修复及规模/并发测试；Run #68 Success |
| [#3 Prompt Kernel V0.2](https://github.com/tortletortle/PromptForge/pull/3) | develop/v0.1 | Draft，未合并 | 角色化确定性内核 |
| [#1 V0.1 产品基础](https://github.com/tortletortle/PromptForge/pull/1) | main | Draft，未合并 | 当前 main 仍为仓库初始化基线 |

推荐收敛顺序：PR #4 → PR #3 → PR #1。每一步都必须先审查、复跑 CI、核对完整 SHA；本看板不代表授权自动合并。

### 下一阶段任务

1. P0：完成 PR #4、#3、#1 的依赖顺序审查和基线收敛。
2. P1：将 Kernel V0.2 接入前端，完成角色编辑、结构化消息预览和 Manifest 历史查看。
3. P2：进行 SQLite 多进程写竞争、API 资源限额、真实网络压测、Soak 和备份恢复。
4. P3/P4：完善资产库、依赖编辑、变量工作台及版本化 JSON 导入/导出。
5. P5：逐个平台验证 Cursor、Claude Code、ChatGPT、通用 API 和本地 AI 的实际兼容性。
6. P6：最后评估桌面安装包和正式发布。

未达到对应验收门槛的能力保持“待开发/待验证”，不提前标记完成。
