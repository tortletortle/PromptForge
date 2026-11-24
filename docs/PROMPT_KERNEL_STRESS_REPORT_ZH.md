# PromptForge Prompt Kernel 压力测试报告

> 测试类型：自动化规模、依赖图、变量、输入安全、确定性与 API 并发请求压力测试。
> 结论只适用于本报告记录的提交和测试环境；不等同于生产环境容量承诺。

## 1. 测试基线与复现

- 仓库：\`tortletortle/PromptForge\`
- 被测内核基线：\`develop/prompt-kernel\` @ \`7211fa2c85041bfd6e4f5f0afedc7cbeb4a67f09\`
- 压力测试分支：\`develop/kernel-stress\`
- 最终测试提交：\`0d47b9498361c7991e2b7afcc6cdb905e397f9fb\`
- 固定数据种子：\`20261124\`
- CI： [GitHub Actions Run #62](https://github.com/tortletortle/PromptForge/actions/runs/45354644558)
- Draft PR：[#4](https://github.com/tortletortle/PromptForge/pull/4)
- 运行环境：GitHub Actions \`ubuntu-24.04\`，Node.js 22。
- 复现命令：\`npm run check\`（包含 Core/API 测试），\`npm run e2e\`。

## 2. 首轮故障与修复

初始压力测试提交 \`32a17d350960b3a53af1968d4bc48290337ef8cc\` 在 20,000 节点深层依赖链上失败：

\`\`\`text
RangeError: Maximum call stack size exceeded
\`\`\`

故障根因：依赖解析使用递归 DFS；深度达到 20,000 时触发 JavaScript 调用栈上限。

同一轮还暴露出两个平方级热点：
- 重复选择检测通过对每个 ID 调用 \`indexOf\`，最坏为 O(n²)。
- 冲突检测对所有已解析资产做两两比较，最坏为 O(n²)。

修复提交：\`acfd577ebeb7e4f0e929200925166906f0333f4b\`

修复内容：
1. 递归 DFS 改为显式帧栈的迭代 DFS。
2. 使用活动路径索引 Map 识别回边和生成循环路径，避免递归及线性回溯查找。
3. 冲突检测改为 ID Map + 冲突边集合，按冲突对去重并稳定排序。
4. 重复根节点检测改为 Set 单次扫描。

## 3. 规模与性能结果

以下时间来自 Run #62 单次执行，单位为毫秒；不是多轮统计中位数，也不是生产容量 SLA。

| 场景 | 输入规模 | 实测时间 | 结果 |
|---|---:|---:|---|
| 平铺资产编译 | 100 assets | 12.24 ms | 通过 |
| 平铺资产编译 | 1,000 assets | 14.89 ms | 通过 |
| 平铺资产编译 | 5,000 assets | 75.26 ms | 通过 |
| 平铺资产编译 | 10,000 assets | 53.66 ms | 通过 |
| 深层依赖链 | 20,000 nodes | 88.15 ms | 通过 |
| 宽依赖扇出 | 10,001 nodes / 10,000 edges | 63.61 ms | 通过 |
| 重复选择去重 | 50,000 entries / 5,000 unique roots | 16.01 ms | 通过 |
| 深层循环依赖 | 20,000 nodes / 20,001 path entries | 26.89 ms | 正确拒绝并返回循环诊断 |
| 冲突边检测 | 10,000 assets / 5,000 disjoint conflicts | 39.87 ms | 正确返回 5,000 个冲突 |
| 变量处理 | 1,000 assets / 8,000 variables | 21.72 ms | 通过 |
| Unicode 模板 | 2,075,000 input bytes / 25,000 repetitions | 50.19 ms | 通过 |
| 确定性 | 2,000 assets / seeded permutations | — | 消息、文本、Manifest 完全一致 |
| API 并发请求 | 100 requests / 30 assets per compile | 102.54 ms | 100 条唯一历史记录完整持久化 |

### 与初始实现对比

| 场景 | 优化前 | 优化后 | 变化 |
|---|---:|---:|---:|
| 10,000 平铺资产 | 622.05 ms | 53.66 ms | 约快 11.6 倍 |
| 10,001 节点宽依赖图 | 495.21 ms | 63.61 ms | 约快 7.8 倍 |
| 50,000 选择记录 | 472.22 ms | 16.01 ms | 约快 29.5 倍 |
| 20,000 深度链 | 调用栈溢出 | 88.15 ms | 从失败变为通过 |

不同运行可能受到 CI 机器负载、JIT 和垃圾回收影响。上表用于确认优化方向和量级，不应用作严格性能承诺。

## 4. 正确性与安全性覆盖

- 20,000 层依赖链可完成拓扑解析，依赖优先顺序保持正确。
- 20,000 节点循环依赖可被检测，不发生调用栈溢出。
- 冲突由任一侧声明均能识别；双侧声明只生成一条冲突诊断。
- 50,000 个根选择条目可以稳定去重。
- 8,000 个独立变量可合并和渲染。
- 约 2.08 MB 中文/Unicode 内容可以完成模板替换。
- 变量值中的 \`{{ ... }}\` 被当作普通文本，不进行二次递归插值。
- 固定种子打乱资产和根选择顺序后，消息、显示文本和 Manifest 保持完全一致。
- 畸形依赖元数据会返回结构化错误，不应抛出未处理异常。
- 100 个并发 API 注入请求均返回成功，生成 100 个唯一编译记录；每条记录保留 30 个资产的 Manifest 快照。

## 5. CI 验收

Run #62：Success。

| 检查 | 结果 |
|---|---:|
| Core TypeScript | 通过 |
| API TypeScript | 通过 |
| Web TypeScript | 通过 |
| Core 测试 | 31/31 |
| API 测试 | 10/10 |
| Core/API/Web 生产构建 | 通过 |
| Playwright 浏览器 smoke test | 1/1 |
| Playwright 报告 | [Artifact](https://github.com/tortletortle/PromptForge/actions/runs/45354644558/artifacts/14901827290) |

## 6. 指标解释与尚未覆盖范围

### 内存数据限制

平铺规模测试记录了执行前后的 \`heapUsed\` 差值。该值会受到垃圾回收时机影响，不能当作峰值内存或 RSS 峰值。本轮没有采集连续内存曲线。

### 并发测试边界

100 并发测试使用同一 Node.js 进程中的 Fastify \`app.inject\` 和同一个 SQLite 连接。它验证请求扇入、记录 ID 唯一性和历史持久化，不等于多进程、多主机或真实网络负载测试。

### 尚未覆盖

- 多进程/多实例同时写同一个 SQLite 文件及 SQLITE_BUSY 行为。
- 真实网络压测（wrk、k6、autocannon）和持续负载/长时间 soak test。
- 1 GB 级别内容、百万级资产和超大变量字典。
- Node.js RSS 峰值、GC pause、CPU profile 和 heap snapshot。
- 不同 Node.js 版本、Windows/macOS 环境的性能对照。
- 不同供应商真实 tokenizer 的准确性和高并发外部调用。
- HTTP 请求体大小上限、单资产内容上限、编译总输出上限的统一产品级策略。

## 7. 结论

本轮确认并修复了一个确定的正确性故障（20k 深度递归栈溢出）和两个平方级算法热点。当前版本通过了 10k 资产、20k 依赖深度、10k 宽依赖、50k 选择条目、8k 变量、2 MB Unicode 模板及 100 并发 API 请求的自动化压力场景。

结论：**本轮定义的压力场景全部通过；内核尚未完成多进程/真实网络/长期 soak/峰值内存验收。**

PR #4 保持 Draft，尚未合并到 \`develop/prompt-kernel\` 或 \`main\`。
