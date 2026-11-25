# PRD：Sapientia 插件

- **产品名称**：Sapientia
- **文档版本**：v0.2（精简限制性表述，新增参考项目）
- **状态**：初稿
- **产品形态**：Zotero 桌面端插件
- **核心协议**：Agent Client Protocol（ACP）
- **目标用户**：使用 Zotero 管理学术文献，并希望通过自己的 AI Agent 辅助科研工作的用户

---

## 1. 产品概述

### 1.1 产品定位

Sapientia 是一个连接 Zotero 与用户自有 AI Agent 的轻量级插件。

插件通过 ACP（Agent Client Protocol）连接用户指定的 Agent，将 Zotero 中的论文、PDF 文本、选中文本、批注等上下文提供给 Agent，并将 Agent 生成的内容通过 Zotero API 写入笔记、标签等数据。

**核心理念：让用户自己的 Agent 操作 Zotero。**

Zotero 插件承担三个职责：

1. 提供 Zotero 上下文。
2. 提供 Agent 交互界面。
3. 提供受控的 Zotero 数据操作能力。

Agent 自身负责模型调用、推理、论文分析、内容生成和任务规划。

### 1.2 要解决的问题

当前用户使用 AI 辅助文献管理时，通常需要在 Zotero 和 AI 工具之间反复切换：

- 将 PDF 内容复制到 AI 对话框。
- 手动提供论文标题、作者和摘要。
- 将 AI 生成的笔记复制回 Zotero。
- 手动整理和添加论文标签。
- 无法让自己已经配置好的 Agent 直接获取 Zotero 上下文。

本产品希望消除这些重复操作，让用户能够直接在 Zotero 中调用自己的 Agent。

### 1.3 核心使用场景

用户在 Zotero 中打开一篇论文，可以：

1. 让 Agent 阅读当前 PDF。
2. 在侧边栏向 Agent 提问。
3. 让 Agent 生成或整理 Zotero 笔记。
4. 让 Agent 分析论文并添加标签。

---

## 2. 产品目标与参考项目

### 2.1 产品目标

| 目标 | 描述 |
|---|---|
| Agent 接入 | 通过 ACP 连接用户自己的 Agent |
| 文献上下文 | 让 Agent 获取当前论文及其 PDF 内容 |
| 交互问答 | 在 Zotero 侧边栏中与 Agent 对话 |
| 笔记管理 | 让 Agent 创建、整理和修改 Zotero 笔记 |
| 标签管理 | 让 Agent 分析论文并建议、添加标签 |
| 数据安全 | 对写入和修改 Zotero 数据的操作进行权限控制 |

### 2.2 参考项目

| 项目 | 定位 | 对本项目的参考价值 |
|---|---|---|
| [54yyyu/zotero-mcp](https://github.com/54yyyu/zotero-mcp) | 将 Zotero 文献库开放给各类 AI Agent 的 MCP Server，同时提供 `zotero-cli`、Agent Skill，以及 Zotero 内的 "Zotero Agent" 聊天面板插件 | Zotero 工具集设计；PDF 按页读取；批注与笔记读写；本地 API 与 Web API 的读写模式；"聊天面板 + 用户自有 Agent" 的产品形态；引用链接跳转 |
| [yilewang/llm-for-zotero](https://github.com/yilewang/llm-for-zotero) | 在 Zotero 阅读器中接入 LLM 的研究 Agent 插件，支持 API Provider、本地模型、Codex App Server 与 Claude Code | 阅读器侧边栏 UI；选中文本、截图等上下文入口；Agent 模式下的读写工具分级、确认卡片与撤销；通过本地 Bridge 接入外部 Agent；基于 zotero-plugin-template 的插件工程 |

#### 可借鉴的具体设计

**来自 zotero-mcp**

- **工具集**：检索、读取元数据与全文、按页范围读取、批注提取与创建、笔记、标签、集合等，可作为 Zotero 工具接口（第 5 章）的参照。
- **Zotero Agent 面板**：由用户自己的 Claude Code、Codex 等驱动，感知当前打开的条目、页码和选区；回答中的引用使用 `zotero://` 链接，点击即可打开 PDF 对应页。
- **读写通道**：本地模式下读取直接来自 Zotero 本地数据，写入通过运行中的 Zotero（本地授权）或 Web API 完成。
- **按需加载**：工具分组（toolsets）与 CLI + Skill 的方式可以降低上下文开销，工具暴露策略可参考。
- **许可证**：MCP Server 与 CLI 为 MIT，Zotero Agent 插件部分为 AGPL-3.0-or-later；复用代码前需按对应许可证处理。

**来自 llm-for-zotero**

- **阅读器侧边栏**：当前 PDF、选中文本、截图、附加文件都可作为对话上下文；选中文本可一键加入对话。
- **引用跳转**：回答中的引用可点击跳回 Zotero 中的原文位置。
- **读写分级**：读取类工具不受限制；写入类工具通过确认卡片审阅，并记录变更历史，支持撤销。
- **外部 Agent 接入**：Claude Code 通过独立的本地 Bridge（Node.js 适配器）接入，可作为本项目 Sidecar 方案的先例；其 README 说明该模式目前尚不支持原生 Zotero API 操作，本项目需在工具通道上补齐这一点。
- **笔记体验**：支持保存回答到 Zotero 笔记，也支持写入 Obsidian / Logseq 等本地 Markdown 目录。
- **PDF 解析**：可选接入 MinerU，提升表格、公式、图表的解析质量。
- **外部 MCP 入口**：插件在 Zotero 运行期间提供带 Bearer 认证的 MCP 端点，供外部 MCP 客户端使用。
- **工程基础**：基于 [zotero-plugin-template](https://github.com/windingwind/zotero-plugin-template) 构建。

#### 本项目的差异点

两个参考项目的 README 中均未提及 ACP。本项目以 **ACP 作为统一的 Agent 接入协议**，让任何支持 ACP 的 Agent 都能在 Zotero 中使用，Zotero 工具能力则优先通过 MCP 复用现有成果（如 zotero-mcp）。

---

## 3. 用户角色与使用场景

### 3.1 用户角色

目标用户是已经使用或计划使用 AI Agent 辅助科研工作的 Zotero 用户。

用户可以自行配置 Agent，例如：

- 本地运行的 Agent。
- 远程运行的 Agent。
- 支持 ACP 的第三方 Agent。
- 用户自己开发的 Agent。

插件支持任意模型和任意兼容 ACP 的 Agent 产品。

### 3.2 典型场景

#### 场景 A：阅读论文

1. 用户在 Zotero 中打开一篇 PDF。
2. 用户打开 ACP Agent 侧边栏。
3. 用户向 Agent 发送阅读请求。
4. 插件提供当前论文的基本信息及 PDF 文本访问能力。
5. Agent 阅读论文并返回分析结果。
6. 用户继续追问。

#### 场景 B：论文问答

1. 用户打开一篇论文。
2. 用户在侧边栏输入问题。
3. 插件将问题与当前论文上下文发送给 Agent。
4. Agent 根据论文内容回答。
5. 用户可以继续追问，也可以要求 Agent 引用具体章节或页码。

#### 场景 C：生成 Zotero 笔记

1. 用户选择一篇论文。
2. 用户要求 Agent 总结论文并生成阅读笔记。
3. Agent 阅读论文并生成笔记内容。
4. 插件展示生成结果。
5. 用户确认后，插件将内容写入 Zotero。

#### 场景 D：论文标签管理

1. 用户选择一篇或多篇论文。
2. 用户要求 Agent 分析论文并生成标签。
3. Agent 根据论文主题、研究方法、领域等信息提出标签。
4. 插件展示建议标签。
5. 用户确认后，插件将标签添加到对应论文。

---

## 4. 功能需求

## 4.1 ACP Agent 连接管理

**优先级：P0**

### 功能描述

插件通过 ACP 与用户指定的 Agent 建立连接，并管理 Agent 会话。

### 功能要求

- 支持配置 Agent 启动命令及参数。
- 支持配置 Agent 所需的环境变量。
- 支持连接、断开和重新连接。
- 支持 ACP 初始化和能力协商。
- 支持创建和恢复会话（以 Agent 能力为准）。
- 支持向 Agent 发送 Prompt。
- 支持接收 Agent 流式消息和状态更新。
- 支持取消正在执行的任务。
- 支持展示连接状态和错误信息。

### 连接配置

至少支持以下配置：

| 配置项 | 说明 |
|---|---|
| Agent 名称 | 用户自定义名称 |
| 启动命令 | Agent 可执行程序 |
| 启动参数 | 命令行参数 |
| 环境变量 | Agent 所需环境变量 |
| 工作目录 | Agent 启动工作目录 |
| 默认 Agent | 默认使用的 Agent |

具体连接方式需要根据目标 Agent 的 ACP 实现和运行环境确定。

如果 Agent 采用 stdio 传输方式，而 Zotero 插件环境无法直接管理其进程，则通过独立的 Node.js Sidecar 负责进程启动和 ACP 通信（可参考 llm-for-zotero 通过本地 Bridge 接入 Claude Code 的做法）。

用户的 Agent 若已具备相应能力（如 MCP 工具），优先复用。

### 验收标准

- 用户能够配置一个支持 ACP 的 Agent。
- 插件能够成功初始化 ACP 连接。
- 用户能够发送消息并接收 Agent 回复。
- 用户能够取消正在执行的任务。
- Agent 断开后能够看到明确的错误状态。

---

## 4.2 PDF 阅读与文献上下文

**优先级：P0**

### 功能描述

插件负责向 Agent 提供当前论文的上下文和 PDF 内容访问能力；论文的语义分析由 Agent 完成。

### 上下文内容

插件应能够提供：

| 数据 | 说明 |
|---|---|
| Item ID | Zotero 文献标识 |
| 标题 | 论文标题 |
| 作者 | 作者信息 |
| 摘要 | 论文摘要 |
| DOI | DOI 信息 |
| 出版年份 | 论文出版年份 |
| PDF 信息 | PDF 附件信息 |
| 当前选区 | 用户当前选中的文本 |
| 批注 | 用户已有的 PDF 批注 |
| 页码 | 对应 PDF 页面 |

### PDF 内容获取

提供以下能力：

1. 获取当前论文的 PDF 文本。
2. 按页获取 PDF 文本。
3. 根据指定页码范围获取文本。
4. 获取当前选中的 PDF 文本。
5. 获取 PDF 中已有的批注和高亮。

对于较长 PDF，优先使用按页或按范围读取的方式（参考 zotero-mcp 的页范围读取），分批向 Agent 提供文本。

### 阅读方式

支持以下交互：

- 阅读当前论文。
- 总结当前论文。
- 总结指定章节。
- 解释当前选中的段落。
- 回答与当前论文相关的问题。
- 结合批注分析论文。

### 引用定位

Agent 可以在回答中提供论文页码或章节信息。

插件应尽可能保留 PDF 页面与文本之间的对应关系，并支持点击引用跳转到 PDF 对应位置（参考 zotero-mcp 的 `zotero://` 引用链接与 llm-for-zotero 的引用跳转）。

### 验收标准

- Agent 能够获取当前论文的基本信息。
- Agent 能够获取 PDF 文本。
- Agent 能够按页读取 PDF。
- Agent 能够获取用户当前选中的文本。
- Agent 能够读取已有批注。
- 长文档可分页、分范围读取。

---

## 4.3 侧边栏问答

**优先级：P0**

### 功能描述

在 Zotero 中提供独立的 Agent 对话侧边栏。

用户无需离开 Zotero，即可与自己的 Agent 交互。

### UI 布局

侧边栏主要包含：

- Agent 状态栏。
- 当前论文信息。
- 对话消息区域。
- 输入框。
- 发送按钮。
- 停止生成按钮。

### 功能要求

- 支持多轮对话。
- 支持流式输出。
- 支持 Markdown 渲染。
- 支持代码块和引用内容展示。
- 支持取消 Agent 请求。
- 支持显示 Agent 执行状态。
- 支持清空对话。
- 支持切换 Agent。
- 支持将当前论文作为对话上下文。
- 支持将选中文本作为对话上下文。

### 上下文策略

默认情况下，对话关联当前选中的 Zotero 文献。

用户切换当前论文时，插件应更新文献上下文。

需要区分：

- 当前对话消息。
- 当前论文上下文。
- 用户主动提供的额外上下文。

完整 PDF 按需分页提供，对话中复用已有上下文。

### 验收标准

- 用户能够在 Zotero 侧边栏中与 Agent 对话。
- Agent 回复能够流式显示。
- 用户可以连续追问。
- 对话能够获取当前论文上下文。
- 用户可以取消执行中的任务。

---

## 4.4 Zotero 笔记辅助

**优先级：P1**

### 功能描述

允许 Agent 创建、整理和修改 Zotero 笔记。

### 支持的操作

| 操作 | 说明 |
|---|---|
| 创建笔记 | 根据论文内容生成新笔记 |
| 阅读笔记 | 获取当前论文已有笔记 |
| 整理笔记 | 对已有笔记进行结构化整理 |
| 修改笔记 | 根据用户要求修改指定笔记 |
| 总结笔记 | 将长笔记整理为摘要 |
| 补充笔记 | 在已有笔记基础上增加内容 |

### 笔记内容建议

支持常见的科研笔记结构：

- 研究背景
- 研究问题
- 核心贡献
- 研究方法
- 实验设计
- 主要结论
- 创新点
- 局限性
- 个人思考

笔记结构由 Agent 根据用户要求决定。

### 操作流程

默认采用：

1. 用户提出笔记任务。
2. Agent 生成或修改笔记内容。
3. 插件展示修改结果。
4. 用户确认。
5. 插件调用 Zotero API 写入笔记。

### 验收标准

- Agent 能够读取论文已有笔记。
- Agent 能够生成新笔记。
- 用户确认后能够创建 Zotero 笔记。
- 用户确认后能够修改已有笔记。
- 覆盖用户原有笔记前需经用户确认，并保留原始内容。

---

## 4.5 论文标签管理

**优先级：P1**

### 功能描述

允许 Agent 根据论文内容分析主题，并为 Zotero 文献生成和添加标签。

### 支持的操作

- 分析单篇论文。
- 批量分析多篇论文。
- 生成候选标签。
- 添加标签。
- 查看已有标签。
- 对已有标签自动去重。

### 标签建议维度

Agent 可以根据论文内容提出：

| 标签类型 | 示例 |
|---|---|
| 研究领域 | Machine Learning |
| 研究主题 | RAG |
| 研究方法 | Reinforcement Learning |
| 技术方向 | Multi-Agent |
| 应用场景 | Healthcare |
| 研究类型 | Survey |
| 论文性质 | Benchmark |

以上为建议分类，标签体系由用户和 Agent 自行决定。

### 操作流程

1. 用户选择论文。
2. 用户要求 Agent 生成标签。
3. Agent 分析论文。
4. Agent 返回标签建议。
5. 插件展示标签列表。
6. 用户确认。
7. 插件将标签写入 Zotero。

### 验收标准

- Agent 能够获取论文信息。
- Agent 能够生成标签建议。
- 插件能够展示标签建议。
- 用户确认后能够添加标签。
- 已有标签自动去重。
- 支持批量处理多篇论文。

---

## 5. Agent 与 Zotero 的交互接口

### 5.1 设计原则

插件提供有限且明确的 Zotero 操作接口。

Agent 通过 ACP 与插件建立交互；Zotero 工具通过 MCP 暴露，优先复用 [zotero-mcp](https://github.com/54yyyu/zotero-mcp) 已有的工具集，由独立的 Zotero MCP Adapter 或现有 MCP Server 提供服务。

### 5.2 工具权限

工具分成两类：

**读取类：**

- 获取论文信息。
- 获取 PDF 文本。
- 获取批注。
- 获取笔记。
- 获取标签。
- 获取选中文本。

**写入类：**

- 创建笔记。
- 修改笔记。
- 添加标签。
- 删除标签（默认关闭，需在设置中开启）。

读取类操作默认允许，并提供用户可配置的权限范围。

写入类操作默认需要用户确认，确认界面参考 llm-for-zotero 的确认卡片，并记录变更历史以支持撤销。

对于批量修改，明确展示操作对象和修改内容，并允许用户取消。

---

## 6. 系统架构

### 6.1 架构原则

系统采用轻量化架构：

- 模型推理与任务规划由用户的 Agent 承担。
- 论文检索、分析等能力优先复用 Agent 已有的 MCP 工具。
- Zotero 数据读写使用 Zotero 官方 API。
- ACP 连接与 UI 交互保持解耦。

### 6.2 系统模块

```text
Sapientia
│
├── UI
│   ├── Sidebar
│   ├── Chat View
│   ├── Agent Settings
│   └── Action Confirmation
│
├── ACP Client
│   ├── Connection Manager
│   ├── Session Manager
│   ├── Prompt Handler
│   ├── Streaming Handler
│   └── Cancellation Handler
│
├── Zotero Context
│   ├── Paper Metadata
│   ├── PDF Text
│   ├── Selected Text
│   ├── Annotations
│   └── Notes
│
├── Zotero Actions
│   ├── Create Note
│   ├── Update Note
│   ├── Add Tags
│   └── Remove Tags
│
└── Optional Sidecar
    └── ACP Process / Transport Bridge
```

### 6.3 技术选型

| 模块 | 技术 |
|---|---|
| 插件开发 | TypeScript |
| 插件脚手架 | [zotero-plugin-template](https://github.com/windingwind/zotero-plugin-template)（llm-for-zotero 同款） |
| 插件运行环境 | Zotero Plugin API |
| UI | Zotero 原生 UI / DOM |
| Agent 通信 | ACP |
| 工具协议 | MCP（可选），可复用 zotero-mcp |
| 进程管理 | Node.js Sidecar（按需） |
| PDF 读取 | Zotero PDF 能力 |
| 数据持久化 | Zotero 自身数据库及插件配置 |
| 构建工具 | esbuild |

### 6.4 ACP 与 MCP 的分工

ACP 用于连接 Agent，负责会话、Prompt、消息更新和任务取消等交互。

MCP 用于向 Agent 提供工具能力，例如读取论文、获取批注、创建笔记和添加标签。

如果用户的 Agent 已经能够通过其他方式访问 Zotero 工具（例如已配置 zotero-mcp），可直接复用。

---

## 7. 交互设计

### 7.1 主界面

在 Zotero 中增加一个 Agent 侧边栏入口。

侧边栏展示：

- 当前连接的 Agent。
- 当前选中的论文。
- 对话消息。
- 用户输入框。
- Agent 执行状态。

### 7.2 上下文提示

对话区域应明确显示当前上下文，例如：

```text
当前论文：
Attention Is All You Need

上下文：
- 论文元信息
- PDF 文本可读取
- 当前选中文本：无
- 已有批注：12 条
```

### 7.3 操作确认

当 Agent 请求写入 Zotero 时，显示确认界面。

示例：

```text
Agent 请求创建笔记

目标论文：
Attention Is All You Need

笔记标题：
论文阅读笔记

操作：
创建一条新的 Zotero 笔记

[取消] [确认写入]
```

标签操作同样需要展示具体标签及其目标论文。

---

## 8. 安全与权限

### 8.1 基本原则

插件作为 Zotero 数据操作的权限边界，所有写入均通过插件的 Zotero API 完成。

### 8.2 权限要求

- 用户明确配置 Agent 连接信息。
- 日志仅记录必要信息；API 密钥和环境变量在 UI 与日志中脱敏。
- 写入操作展示具体目标。
- 批量写入提供操作预览。
- 修改笔记前保留原始内容或提供撤销能力。
- 删除类操作默认关闭，由用户显式开启。

### 8.3 数据边界

PDF 内容、论文信息和笔记可能包含用户的研究资料。

插件应明确告知用户：发送给 Agent 的内容会按照用户配置的 Agent 运行环境进行处理。

对于本地 Agent，数据可以在本地处理；对于远程 Agent，数据会按照其服务的网络和数据处理方式传输。

---

## 9. 非功能性需求

### 9.1 性能

- 侧边栏打开不应明显影响 Zotero 启动速度。
- Agent 回复采用流式展示。
- PDF 按需读取。
- 长时间任务在后台运行，保持 Zotero 主界面可用。
- 批量操作提供进度状态。

### 9.2 稳定性

- Agent 连接失败时提供错误提示。
- Agent 异常退出不影响 Zotero 正常运行。
- ACP 会话中断后能够重新连接。
- 用户取消任务后停止后续操作。
- 写入失败时保留错误信息并提示用户。

### 9.3 可扩展性

后续可以增加：

- 多 Agent 配置。
- 不同 Agent 的会话管理。
- 批量论文处理。
- 自定义笔记模板。
- 笔记导出到 Obsidian / Logseq 等本地 Markdown 目录（参考 llm-for-zotero）。
- 高保真 PDF 解析（如 MinerU，参考 llm-for-zotero）。
- 用户自定义标签规则。
- 更丰富的 Zotero 工具接口。

---

## 10. MVP 范围与开发计划

### Phase 1：ACP 基础连接

**目标：让 Zotero 能够调用用户自己的 Agent。**

开发内容：

- ACP Client。
- Agent 配置。
- 连接管理。
- 会话管理。
- Prompt 发送。
- 流式消息接收。
- 任务取消。
- 基础侧边栏 UI。

验收结果：用户可以在 Zotero 中与自己的 Agent 对话。

### Phase 2：PDF 阅读与问答

**目标：让 Agent 能够理解当前论文。**

开发内容：

- 获取当前论文元信息。
- 获取 PDF 文本。
- 按页读取 PDF。
- 获取当前选中文本。
- 获取 PDF 批注。
- 向 Agent 提供论文上下文。

验收结果：Agent 能够回答与当前 PDF 相关的问题。

### Phase 3：Zotero 笔记

**目标：让 Agent 能够帮助用户完成笔记。**

开发内容：

- 读取已有笔记。
- 创建新笔记。
- 修改已有笔记。
- 笔记预览。
- 写入确认。

验收结果：用户可以通过 Agent 生成并保存 Zotero 笔记。

### Phase 4：论文标签

**目标：让 Agent 能够帮助用户管理论文标签。**

开发内容：

- 获取已有标签。
- 生成标签建议。
- 添加标签。
- 标签去重。
- 批量标签处理。
- 操作确认。

验收结果：用户可以让 Agent 为论文生成并添加标签。

---

## 11. MVP 验收标准

MVP 完成时必须满足以下条件：

- [ ] 用户可以配置自己的 ACP Agent。
- [ ] Zotero 可以成功连接 Agent。
- [ ] 用户可以在侧边栏与 Agent 对话。
- [ ] Agent 回复支持流式展示。
- [ ] Agent 可以获取当前论文基本信息。
- [ ] Agent 可以读取当前 PDF 文本。
- [ ] Agent 可以获取用户当前选中的文本。
- [ ] Agent 可以回答当前论文相关问题。
- [ ] Agent 可以生成 Zotero 笔记。
- [ ] 用户确认后可以将笔记写入 Zotero。
- [ ] Agent 可以生成论文标签建议。
- [ ] 用户确认后可以将标签写入 Zotero。
- [ ] 写入操作具备权限控制。
- [ ] Agent 异常退出后 Zotero 保持稳定。

---

## 12. 风险与待确认事项

### 12.1 ACP 进程管理

需要确认目标 Agent 的 ACP 传输方式。

如果目标 Agent 使用 stdio，需验证 Zotero 插件运行环境是否能够稳定启动和管理子进程。

如果不能，采用 Node.js Sidecar；可参考 llm-for-zotero 的 Claude Code Bridge 方案。

### 12.2 PDF 文本获取

需要验证 Zotero 当前版本提供的 PDF 文本读取能力，以及对扫描版 PDF 的处理情况。

MVP 先支持可提取文本的 PDF。

扫描版 PDF 的 OCR 由用户 Agent 或其工具链处理；表格、公式等高保真解析可后续参考 llm-for-zotero 的 MinerU 方案接入。

### 12.3 Agent 工具调用

需要确定 Zotero 工具由哪一侧暴露：

- 通过 ACP Agent 自身支持的 MCP Server 配置（例如直接配置 zotero-mcp）。
- 通过独立的 Zotero MCP Server。
- 通过 Sidecar 转发 Zotero 工具请求。

优先采用目标 Agent 已支持的方式。可评估直接复用 zotero-mcp 的工具集，以及其本地 API 读取、本地授权写入的机制。

### 12.4 多论文上下文

需要确定用户选择多篇论文时的上下文组织方式。

MVP 优先支持单篇论文；批量论文分析作为后续能力。

### 12.5 笔记修改策略

需要确定是否支持直接覆盖已有笔记。

MVP 默认采用新建笔记，或预览确认后替换。

### 12.6 参考项目许可证

zotero-mcp 的 Zotero Agent 插件部分与 llm-for-zotero 均使用 AGPL 许可证（zotero-mcp 的 MCP Server 部分为 MIT）。若直接复用其代码，需确认本项目的许可证选择与之兼容；仅借鉴设计思路则不受影响。

---

## 13. 产品设计原则

1. **Agent First**：推理和任务执行交给用户自己的 Agent。
2. **Thin Plugin**：Zotero 插件提供上下文、界面和受控的操作接口。
3. **Protocol First**：通过 ACP 与 Agent 通信，兼容任意模型和 Agent 产品。
4. **Reuse Existing Tools**：优先复用已有 MCP 工具（如 zotero-mcp）和已验证的交互设计（如 llm-for-zotero）。
5. **User Control**：涉及 Zotero 数据修改时，用户拥有最终确认权。

## 14. 产品成功标准

核心指标是：

- 用户能否顺利连接自己的 Agent。
- Agent 能否正确获取当前论文上下文。
- 用户能否直接在 Zotero 中完成论文问答。
- 用户能否通过 Agent 完成笔记创建和整理。
- 用户能否通过 Agent 完成论文标签管理。
- 整个过程是否比手动复制、粘贴和切换工具更简单。

**最终产品目标：让用户在 Zotero 中直接使用自己已经拥有的 Agent。**

---

## 附录：参考链接

- zotero-mcp：<https://github.com/54yyyu/zotero-mcp>
- llm-for-zotero：<https://github.com/yilewang/llm-for-zotero>
- zotero-plugin-template：<https://github.com/windingwind/zotero-plugin-template>
- cc-llm4zotero-adapter（llm-for-zotero 的 Claude Code Bridge）：<https://github.com/jianghao-zhang/cc-llm4zotero-adapter>
