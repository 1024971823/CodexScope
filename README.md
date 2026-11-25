# CodexScope

**CodexScope** 是一款面向 **OpenAI Codex CLI** 及主流编码 Agent 软件的实时子 Agent Token 监控插件、置顶悬浮桌面小窗与系统任务栏/桌面小组件工作台。通过 SSE 实时数据流，清晰追踪每个主代理与嵌套子代理的输入/缓存、输出/推理 Token、使用模型、上下文窗口占用、估算费用以及过去 1 小时消耗速率（`Tokens/min`）。

---

## 核心特性

- **实时子 Agent 层级监控**：自动构建主代理与多级子代理调用树，细分展示 `Input`（含缓存命中率）、`Output`（含推理链路占比）、最近单轮增量、使用模型及预估成本。
- **主流编码 Agent 兼容**：一套零依赖通用监听器与标准接口同时兼容 **OpenAI Codex**、**Claude Code**、**Cursor**、**Cline / Roo Code**、**OpenCode**、**Gemini CLI** 及任意自定义 Agent（Webhook / MCP）。
- **置顶桌面小窗与任务栏/桌面小组件**：
  - 支持四种高集成形态：**标准置顶小窗**、**桌宠迷你条**、**系统任务栏嵌入条（40px）**与**桌面壁纸小组件卡片**；
  - 支持浏览器 Document Picture-in-Picture 一键弹出置顶、PWA 固定到任务栏，以及 Electron 系统托盘、macOS SwiftBar、Windows Rainmeter、Linux Waybar 原生嵌入。
- **子 Agent 预算阈值与超额预警**：支持自定义单子 Agent Token 预算上限（带 `50k / 100k / 150k / 300k` 快捷预设与本地持久化）；任一子代理超额时自动高亮卡片、表格行、HUD 条目与详情抽屉，并触发预警横幅与非阻塞视觉提醒。
- **过去 1 小时消耗速率趋势（Recharts）**：在 Agent 详情抽屉中内置基于 Recharts 的小型折线图，按 5 分钟窗口统计 `Tokens/min`（当前 / 峰值 / 均值），悬停查看输入输出速率与调用轮次。
- **多格式日志导入与深浅色主题**：支持直接粘贴或导入 Codex JSONL、Claude Code JSONL、Gemini CLI JSON 会话日志；全局适配 Light / Dark 双主题。

---

## 技术栈

- **前端**：React 19、TypeScript、Vite 8、Tailwind CSS v4、Recharts、Lucide React
- **后端**：Express 4、Node.js（SSE 实时推送 + 内存遥测状态引擎 + 插件模板分发）
- **测试**：Node.js 原生测试框架（`node:test` + `tsx`）

---

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量（可选）

参考 `.env.example` 创建本地 `.env` 文件：

| 变量名 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 服务监听端口 |
| `APP_URL` | 当前请求来源 | 用于生成下载脚本与 SwiftBar/Waybar 回调地址 |
| `CODEXSCOPE_INGEST_TOKEN` | 空（不校验） | 可选鉴权令牌；配置后调用 `POST /api/ingest` 需携带 `X-CodexScope-Token` 或 `Authorization: Bearer <token>` |

### 3. 启动开发环境

```bash
npm run dev
```

启动后访问 `http://localhost:3000`。服务内置演示多代理会话流，可立即体验实时数据变化、置顶小窗、任务栏预览与预算预警。

### 4. 构建、类型检查与测试

```bash
# 运行核心遥测与预算逻辑单元测试
npx tsx --test src/lib/telemetry.test.ts

# TypeScript 类型检查
npm run lint

# 生产构建
npm run build

# 启动生产服务
NODE_ENV=production npm start
```

---

## 接入本地编码 Agent

在界面进入 **「多 Agent 接入」** 页面，或直接通过下载接口获取对应脚本：

| 工具 / 来源 | 监听路径 / 接入方式 | 说明 |
| --- | --- | --- |
| **OpenAI Codex** | `~/.codex/sessions/**/*.jsonl` | 自动解析 `session_meta`、`turn_context`、`token_count` 与子代理派生关系 |
| **Claude Code** | `~/.claude/projects/**/*.jsonl` | 自动识别主会话与 `isSidechain` 子代理消耗及缓存读写 |
| **Gemini CLI** | `~/.gemini/tmp/*/chats/session-*.json` | 解析消息级输入、缓存、输出与 `thoughts` 推理 Token |
| **OpenCode** | `~/.local/share/opencode/storage/**/*.json` | 自动追踪本地存储会话统计 |
| **Cursor / Cline / 自定义** | `POST /api/ingest` 或 MCP 插件 | 通过 HTTP Webhook 或 `codex-mcp-monitor.mjs` 实时上报 |

运行零依赖本地监听器（自动扫描本机 Codex / Claude Code / Gemini CLI / OpenCode 日志）：

```bash
curl -fsSLO http://localhost:3000/api/plugin/download/universal-agent-watcher.mjs
node universal-agent-watcher.mjs
```

如需让 Codex / Claude Code / Cursor 代理自查子 Agent Token 消耗，可下载 `codex-mcp-monitor.mjs` 与 `config.toml` 并添加到对应 MCP 配置中。

---

## 嵌入电脑任务栏与桌面小组件

### 独立无边框视图地址

| 路由 | 形态 | 适用场景 |
| --- | --- | --- |
| `/?widget=1` | 标准悬浮小窗（384×520） | Electron 置顶悬浮窗 / 浏览器独立窗口 |
| `/?mode=mini` | 桌宠迷你条（356px） | 桌面角落极简悬浮条 |
| `/?mode=taskbar` | 任务栏嵌入条（344×44） | Windows 任务栏右下角贴边嵌入 / 侧边栏 |
| `/?mode=desktop-widget` | 桌面小组件卡片（340×296） | 桌面壁纸层常驻瓷贴 |

### 跨平台原生集成脚本

可通过 `GET /api/plugin/download/<文件名>` 直接下载，或在首页右侧 **「嵌入系统任务栏 / 桌面小组件」** 面板一键获取：

- **全平台托盘三合一（Windows / macOS）**：下载 `codexscope-tray-widget.mjs`，执行 `npx electron codexscope-tray-widget.mjs`。macOS 顶部菜单栏实时滚动 Token 文字，Windows 任务栏右下角贴边嵌入，右键托盘可在三种形态间自由切换。
- **macOS SwiftBar / xbar 菜单栏**：下载 `codexscope.2s.sh` 放入 SwiftBar 插件目录并赋予执行权限（`chmod +x codexscope.2s.sh`）。
- **Windows Rainmeter 桌面组件**：下载 `CodexScope.ini` 放入 `Documents\Rainmeter\Skins\CodexScope\` 后刷新加载。
- **Linux Waybar 状态栏**：下载 `waybar-codexscope.jsonc` 合并到 `~/.config/waybar/config.jsonc`。
- **浏览器固定到任务栏**：项目内置 `/manifest.webmanifest`，在 Chrome / Edge 点击地址栏安装图标即可安装并固定到系统任务栏或 Dock。

---

## API 接口一览

| 方法与路径 | 说明 |
| --- | --- |
| `GET /api/health` | 服务健康检查与当前活跃 Agent 数量 |
| `GET /api/snapshot` | 获取当前完整遥测快照（Agent 树、事件流、速率历史） |
| `GET /api/stream` | SSE 实时推送通道（`snapshot` / `update` 事件） |
| `GET /api/widget/summary` | 获取轻量级桌面小组件 / 托盘 JSON 摘要 |
| `GET /api/widget/taskbar?format=text\|swiftbar\|waybar` | 获取任务栏纯文本、SwiftBar 菜单栏或 Waybar JSON 输出 |
| `POST /api/ingest` | 接收单条或批量（最多 50 条）实时 Token 上报事件 |
| `POST /api/import-jsonl` | 解析并导入 Codex / Claude Code / Gemini CLI 日志文本（上限 400KB） |
| `POST /api/simulator/toggle` | 暂停或恢复内置实时模拟流 |
| `POST /api/simulator/burst` | 触发一次全活跃代理调用脉冲 |
| `POST /api/simulator/spawn` | 派生一个新的演示子 Agent |
| `POST /api/session/clear` | 清空当前会话数据 |
| `POST /api/session/load-demo` | 重新加载内置演示会话 |
| `GET /api/plugin/download/:filename` | 按静态白名单下载监听器、MCP、托盘及任务栏集成脚本 |

### `POST /api/ingest` 请求示例

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "adapter": "codex",
    "agentId": "sub-schema-validator",
    "parentId": "codex-root-01",
    "agentName": "sub-schema-validator",
    "role": "subagent",
    "model": "gpt-5.3-codex-mini",
    "status": "running",
    "mode": "delta",
    "input_tokens": 14500,
    "cached_input_tokens": 8000,
    "output_tokens": 2380,
    "reasoning_output_tokens": 720,
    "note": "校验 API Schema 变更"
  }'
```

---

## 目录结构

```text
.
├── server.ts                         # Express 服务、SSE 实时广播、遥测接口与插件下载路由
├── index.html                        # HTML 入口与字体 / Manifest 配置
├── public/
│   └── manifest.webmanifest          # PWA 清单（支持固定到任务栏 / Dock）
└── src/
    ├── App.tsx                       # 应用根壳、SSE 订阅、预算阈值状态与 PiP/独立模式路由
    ├── index.css                     # Tailwind CSS v4 样式与深色主题变量
    ├── lib/
    │   ├── telemetry.ts              # 遥测聚合、多格式日志解析、速率分桶与预算评估纯逻辑
    │   ├── telemetry.test.ts         # 核心逻辑单元测试（node:test）
    │   └── pluginTemplates.ts        # 监听器、MCP、Electron 托盘、SwiftBar、Rainmeter、Waybar 模板
    └── components/
        ├── DesktopWidgetStudio.tsx   # 桌面小窗与任务栏交互式预览工作台
        ├── DesktopHudWidget.tsx      # 标准小窗 / 迷你条 / 任务栏条 / 桌面小组件四形态组件
        ├── MonitorView.tsx           # 完整监控工作台、预算阈值栏、子 Agent 卡片与层级表
        ├── AgentDetailDrawer.tsx     # Agent 详情抽屉与逐轮调用记录
        ├── AgentHourlyRateChart.tsx  # 过去 1 小时 Tokens/min 速率折线图（Recharts）
        ├── TokenRateChart.tsx        # 全局实时输入/输出速率趋势图
        ├── ModelsView.tsx            # 模型维度消耗与成本分布视图
        ├── EventStreamView.tsx       # 原始遥测事件流视图
        └── PluginSetupView.tsx       # 插件代码预览、下载、日志导入与 Webhook 测试
```

---

## 安全说明

- `/api/plugin/download/:filename` 仅允许静态白名单中的模板文件名，防止任意文件读取或路径穿越。
- 可通过设置 `CODEXSCOPE_INGEST_TOKEN` 保护 `/api/ingest`，服务端使用常量时间比较校验令牌。
- `/api/import-jsonl` 对输入体长度与批量上报条数均做了上限校验，任务栏与 SwiftBar 文本输出在服务端清洗换行符与分隔符。
