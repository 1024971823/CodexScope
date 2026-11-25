export function generateUniversalWatcherScript(endpointOrigin: string): string {
  const safeOrigin = endpointOrigin.replace(/\/+$/, '');
  return `#!/usr/bin/env node
/**
 * CodexScope Universal Agent Watcher (零依赖多 Agent 通用监听器)
 * 自动同时监听本机主流 AI 编程代理的本地会话日志，并实时推送到置顶桌面小窗：
 *   1. OpenAI Codex CLI   -> ~/.codex/sessions/**/*.jsonl
 *   2. Claude Code        -> ~/.claude/projects/**/*.jsonl
 *   3. Gemini CLI         -> ~/.gemini/tmp/*/chats/session-*.json
 *   4. OpenCode           -> ~/.local/share/opencode/storage/message/**/*.json
 *
 * 运行方式:
 *   node universal-agent-watcher.mjs
 *   CODEXSCOPE_URL=${safeOrigin} node universal-agent-watcher.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOME = os.homedir();
const ENDPOINT = (process.env.CODEXSCOPE_URL || '${safeOrigin}') + '/api/ingest';
const TOKEN = process.env.CODEXSCOPE_INGEST_TOKEN || '';

const WATCH_TARGETS = [
  { adapter: 'codex', dir: process.env.CODEX_HOME ? path.join(process.env.CODEX_HOME, 'sessions') : path.join(HOME, '.codex', 'sessions'), ext: '.jsonl' },
  { adapter: 'claude-code', dir: path.join(HOME, '.claude', 'projects'), ext: '.jsonl' },
  { adapter: 'gemini-cli', dir: path.join(HOME, '.gemini', 'tmp'), ext: '.json' },
  { adapter: 'opencode', dir: path.join(HOME, '.local', 'share', 'opencode', 'storage', 'message'), ext: '.json' },
];

const offsets = new Map();
const fileMeta = new Map();
const seenJsonMessages = new Set();

function walk(dir, ext, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, ext, out);
    else if (entry.name.endsWith(ext)) out.push(full);
  }
  return out;
}

async function push(payload) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (TOKEN) headers['X-CodexScope-Token'] = TOKEN;
    await fetch(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(payload) });
  } catch {
    // 等待面板重连
  }
}

function handleCodexLine(filePath, obj) {
  const meta = fileMeta.get(filePath) || {
    agentId: path.basename(filePath, '.jsonl'),
    parentId: null,
    agentName: path.basename(filePath, '.jsonl'),
    role: 'root',
    model: 'gpt-5.3-codex',
    task: 'Codex Session',
  };

  if (obj.type === 'session_meta' && obj.payload) {
    const p = obj.payload;
    if (p.id) meta.agentId = p.id;
    const spawn = p.source?.subagent?.thread_spawn;
    if (spawn?.parent_thread_id || p.parent_thread_id || p.source?.subagent) {
      meta.role = 'subagent';
      meta.parentId = spawn?.parent_thread_id || p.parent_thread_id || null;
    }
    meta.agentName = p.agent_nickname || spawn?.agent_nickname || meta.agentId;
    if (p.model) meta.model = p.model;
    if (p.cwd) meta.task = 'Codex · ' + path.basename(p.cwd);
    fileMeta.set(filePath, meta);
    return;
  }

  if (obj.type === 'turn_context' && obj.payload?.model) {
    meta.model = obj.payload.model;
    fileMeta.set(filePath, meta);
    return;
  }

  if (obj.type === 'event_msg' && obj.payload?.type === 'token_count') {
    const info = obj.payload.info || {};
    const u = info.last_token_usage || info.total_token_usage;
    if (!u) return;
    void push({
      adapter: 'codex',
      agentId: meta.agentId,
      parentId: meta.parentId,
      agentName: meta.agentName,
      role: meta.role,
      task: meta.task,
      model: info.model || meta.model,
      mode: info.last_token_usage ? 'delta' : 'cumulative',
      input_tokens: u.input_tokens || 0,
      cached_input_tokens: u.cached_input_tokens || 0,
      output_tokens: u.output_tokens || 0,
      reasoning_output_tokens: u.reasoning_output_tokens || 0,
      contextLimit: info.model_context_window,
      note: 'Codex rollout token_count',
    });
  }
}

function handleClaudeLine(filePath, obj) {
  if (obj.type !== 'assistant' || !obj.message?.usage) return;
  const u = obj.message.usage;
  const isSub = Boolean(obj.isSidechain || obj.agentId);
  const sessionId = obj.sessionId || path.basename(filePath, '.jsonl');
  const agentId = obj.agentId || (isSub ? sessionId + '-sub' : sessionId);
  const input = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
  void push({
    adapter: 'claude-code',
    agentId,
    parentId: isSub && agentId !== sessionId ? sessionId : null,
    agentName: obj.slug || obj.agentName || agentId,
    role: isSub ? 'subagent' : 'root',
    task: obj.cwd ? 'Claude Code · ' + path.basename(obj.cwd) : 'Claude Code 任务',
    model: obj.message.model || 'claude-sonnet-4.5',
    mode: 'delta',
    input_tokens: input,
    cached_input_tokens: u.cache_read_input_tokens || 0,
    output_tokens: u.output_tokens || 0,
    reasoning_output_tokens: u.thinking_tokens || 0,
    note: isSub ? 'Claude Code 子代理' : 'Claude Code 主会话',
  });
}

function handleJsonSnapshot(adapter, filePath) {
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return;
  }

  if (adapter === 'gemini-cli' && Array.isArray(doc.messages)) {
    const sid = doc.sessionId || path.basename(filePath, '.json');
    doc.messages.forEach((m, idx) => {
      const key = filePath + ':' + idx;
      if (!m?.tokens || seenJsonMessages.has(key)) return;
      seenJsonMessages.add(key);
      void push({
        adapter: 'gemini-cli',
        agentId: sid,
        parentId: null,
        agentName: sid,
        role: 'root',
        task: 'Gemini CLI 会话',
        model: m.model || 'gemini-2.5-pro',
        mode: 'delta',
        input_tokens: m.tokens.input || 0,
        cached_input_tokens: m.tokens.cached || 0,
        output_tokens: (m.tokens.output || 0) + (m.tokens.thoughts || 0),
        reasoning_output_tokens: m.tokens.thoughts || 0,
        note: 'Gemini CLI 轮次上报',
      });
    });
  }

  if (adapter === 'opencode' && doc.tokens && !seenJsonMessages.has(filePath)) {
    seenJsonMessages.add(filePath);
    void push({
      adapter: 'opencode',
      agentId: doc.sessionID || 'opencode-session',
      parentId: doc.parentID || null,
      agentName: doc.agent || doc.sessionID || 'opencode',
      role: doc.parentID ? 'subagent' : 'root',
      task: 'OpenCode 代理任务',
      model: doc.modelID || 'gpt-5.3-codex',
      mode: 'delta',
      input_tokens: (doc.tokens.input || 0) + (doc.tokens.cache?.read || 0),
      cached_input_tokens: doc.tokens.cache?.read || 0,
      output_tokens: (doc.tokens.output || 0) + (doc.tokens.reasoning || 0),
      reasoning_output_tokens: doc.tokens.reasoning || 0,
      note: 'OpenCode message tokens',
    });
  }
}

function scanAll() {
  for (const target of WATCH_TARGETS) {
    const files = walk(target.dir, target.ext);
    for (const file of files) {
      let stat;
      try { stat = fs.statSync(file); } catch { continue; }
      const prev = offsets.get(file) || 0;
      if (stat.size <= prev) continue;

      if (target.ext === '.jsonl') {
        const fd = fs.openSync(file, 'r');
        const buf = Buffer.alloc(stat.size - prev);
        fs.readSync(fd, buf, 0, buf.length, prev);
        fs.closeSync(fd);
        offsets.set(file, stat.size);
        for (const line of buf.toString('utf8').split(/\\r?\\n/)) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line);
            if (target.adapter === 'codex') handleCodexLine(file, obj);
            else if (target.adapter === 'claude-code') handleClaudeLine(file, obj);
          } catch {}
        }
      } else {
        offsets.set(file, stat.size);
        handleJsonSnapshot(target.adapter, file);
      }
    }
  }
}

console.log('[CodexScope] 多 Agent 通用监听器已启动 -> ' + ENDPOINT);
scanAll();
setInterval(scanAll, 1000);
`;
}

export function generateDesktopWidgetElectronScript(endpointOrigin: string): string {
  const safeOrigin = endpointOrigin.replace(/\/+$/, '');
  return `/**
 * CodexScope Desktop Floating HUD (原生置顶桌面小窗口 / 桌宠模式)
 * 基于 Electron 启动一个无边框、始终置顶、跨工作区悬浮的小巧桌面窗口，
 * 悬浮在 VS Code / Cursor / Terminal 之上，实时查看所有 Agent 的 Token 消耗。
 *
 * 快速启动:
 *   npm i -D electron
 *   npx electron desktop-widget.mjs
 */

import { app, BrowserWindow, screen } from 'electron';

const WIDGET_URL = (process.env.CODEXSCOPE_URL || '${safeOrigin}') + '/?widget=1';

app.whenReady().then(() => {
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width: 376,
    height: 520,
    x: width - 396,
    y: 48,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: false,
    hasShadow: true,
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // macOS 上在所有桌面空间/全屏应用之上悬浮
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  void win.loadURL(WIDGET_URL);
});

app.on('window-all-closed', () => app.quit());
`;
}

export function generateCodexMcpServerScript(endpointOrigin: string): string {
  const safeOrigin = endpointOrigin.replace(/\/+$/, '');
  return `#!/usr/bin/env node
/**
 * CodexScope MCP Server Plugin (兼容 Codex / Claude Code / Cursor / Cline / OpenCode)
 * 挂载后，任意支持 MCP 的 Agent 均可调用 get_subagent_tokens 查询各子代理消耗。
 */

import readline from 'node:readline';

const API_BASE = process.env.CODEXSCOPE_URL || '${safeOrigin}';
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\\n');
}

rl.on('line', async (line) => {
  if (!line.trim()) return;
  let req;
  try { req = JSON.parse(line); } catch { return; }

  if (req.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: req.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'codexscope-mcp', version: '2.0.0' },
      },
    });
    return;
  }

  if (req.method === 'tools/list') {
    send({
      jsonrpc: '2.0',
      id: req.id,
      result: {
        tools: [
          {
            name: 'get_subagent_tokens',
            description: '获取 Codex / Claude Code / Cursor / Gemini CLI 等所有子 Agent 的输入输出 Token 与模型消耗',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
      },
    });
    return;
  }

  if (req.method === 'tools/call' && req.params?.name === 'get_subagent_tokens') {
    try {
      const res = await fetch(API_BASE + '/api/snapshot');
      const data = await res.json();
      const summary = (data.agents || []).map((a) => ({
        adapter: a.adapter,
        name: a.name,
        role: a.role,
        model: a.model,
        status: a.status,
        input: a.tokens.input,
        cachedInput: a.tokens.cachedInput,
        output: a.tokens.output,
        reasoningOutput: a.tokens.reasoningOutput,
        total: a.tokens.total,
      }));
      send({
        jsonrpc: '2.0',
        id: req.id,
        result: { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] },
      });
    } catch (err) {
      send({
        jsonrpc: '2.0',
        id: req.id,
        result: { isError: true, content: [{ type: 'text', text: '连接失败: ' + String(err) }] },
      });
    }
  }
});
`;
}

export function generateCodexConfigToml(endpointOrigin: string): string {
  const safeOrigin = endpointOrigin.replace(/\/+$/, '');
  return `# =========================================================
# 1. OpenAI Codex CLI (~/.codex/config.toml)
# =========================================================
[mcp_servers.codexscope]
command = "node"
args = ["~/.codex/plugins/codex-mcp-monitor.mjs"]

[mcp_servers.codexscope.env]
CODEXSCOPE_URL = "${safeOrigin}"

[features]
multi_agent = true

# =========================================================
# 2. Claude Code / Cursor / Cline (mcp.json 通用片段)
# =========================================================
# {
#   "mcpServers": {
#     "codexscope": {
#       "command": "node",
#       "args": ["/path/to/codex-mcp-monitor.mjs"],
#       "env": { "CODEXSCOPE_URL": "${safeOrigin}" }
#     }
#   }
# }

# =========================================================
# 3. 启动多 Agent 通用监听 + 原生置顶小窗口:
#    CODEXSCOPE_URL="${safeOrigin}" node universal-agent-watcher.mjs
#    CODEXSCOPE_URL="${safeOrigin}" npx electron desktop-widget.mjs
# =========================================================
`;
}

export const SAMPLE_CODEX_JSONL = [
  JSON.stringify({
    timestamp: '2026-11-24T03:25:10.000Z',
    type: 'session_meta',
    payload: {
      id: 'sub-security-audit-09',
      agent_nickname: 'sub-security-audit',
      cwd: '/workspace/backend',
      source: {
        subagent: {
          thread_spawn: {
            parent_thread_id: 'codex-root-01',
            agent_nickname: 'sub-security-audit',
          },
        },
      },
    },
  }),
  JSON.stringify({
    timestamp: '2026-11-24T03:25:11.000Z',
    type: 'turn_context',
    payload: {
      model: 'o3',
    },
  }),
  JSON.stringify({
    timestamp: '2026-11-24T03:25:14.000Z',
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        model_context_window: 200000,
        last_token_usage: {
          input_tokens: 18600,
          cached_input_tokens: 9200,
          output_tokens: 3420,
          reasoning_output_tokens: 2180,
          total_tokens: 22020,
        },
      },
    },
  }),
].join('\n');

export const SAMPLE_CLAUDE_JSONL = JSON.stringify({
  timestamp: '2026-11-24T04:05:10.000Z',
  type: 'assistant',
  sessionId: 'claude-root-01',
  agentId: 'claude-sub-ui-polish',
  slug: 'claude-sub-ui-polish',
  isSidechain: true,
  cwd: '/workspace/frontend',
  message: {
    model: 'claude-sonnet-4.5',
    usage: {
      input_tokens: 5800,
      cache_read_input_tokens: 14200,
      cache_creation_input_tokens: 1200,
      output_tokens: 2460,
    },
  },
});

export const SAMPLE_GEMINI_JSON = JSON.stringify(
  {
    sessionId: 'gemini-sub-docs',
    messages: [
      {
        timestamp: '2026-11-24T04:06:00.000Z',
        type: 'gemini',
        model: 'gemini-2.5-flash',
        tokens: {
          input: 16400,
          cached: 9800,
          output: 1920,
          thoughts: 640,
        },
      },
    ],
  },
  null,
  2,
);

export function generateTrayAndTaskbarWidgetScript(endpointOrigin: string): string {
  const safeOrigin = endpointOrigin.replace(/\/+$/, '');
  return `/**
 * CodexScope OS 任务栏 / 菜单栏 / 桌面小组件三合一原生客户端 (macOS & Windows)
 * 功能:
 *   1. macOS 顶部菜单栏实时显示 Token 消耗文字，点击弹出紧凑面板
 *   2. Windows 任务栏右下角系统托盘 + 任务栏贴边嵌入条 (/?mode=taskbar)
 *   3. 一键切换「任务栏贴边条 / 桌面小组件 / 置顶悬浮小窗」三种形态
 *
 * 运行方式:
 *   npm i -D electron
 *   npx electron codexscope-tray-widget.mjs
 */

import { app, BrowserWindow, Menu, Tray, nativeImage, screen } from 'electron';

const BASE_URL = (process.env.CODEXSCOPE_URL || '${safeOrigin}').replace(/\\/+$/, '');

let tray = null;
let widgetWin = null;
let currentMode = 'taskbar'; // 'taskbar' | 'desktop-widget' | 'floating'

function createIcon() {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">' +
    '<rect x="2" y="2" width="14" height="14" rx="4" fill="#2563EB"/>' +
    '<path d="M5.5 11.5L8 6.5L10.5 10L12.5 7.5" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';
  return nativeImage.createFromDataURL(
    'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'),
  );
}

function createWindowForMode(mode) {
  currentMode = mode;
  if (widgetWin && !widgetWin.isDestroyed()) {
    widgetWin.close();
  }

  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  const { x: wx, y: wy } = display.workArea;

  const presets = {
    taskbar: {
      width: 344,
      height: 44,
      x: wx + width - 356,
      y: wy + height - 48,
      url: BASE_URL + '/?mode=taskbar',
      alwaysOnTop: true,
      skipTaskbar: true,
    },
    'desktop-widget': {
      width: 340,
      height: 296,
      x: wx + width - 360,
      y: wy + 24,
      url: BASE_URL + '/?mode=desktop-widget',
      alwaysOnTop: false,
      skipTaskbar: true,
    },
    floating: {
      width: 384,
      height: 520,
      x: wx + width - 404,
      y: wy + 48,
      url: BASE_URL + '/?widget=1',
      alwaysOnTop: true,
      skipTaskbar: false,
    },
  };

  const cfg = presets[mode] || presets.taskbar;

  widgetWin = new BrowserWindow({
    width: cfg.width,
    height: cfg.height,
    x: cfg.x,
    y: cfg.y,
    frame: false,
    transparent: false,
    resizable: mode !== 'taskbar',
    skipTaskbar: cfg.skipTaskbar,
    alwaysOnTop: cfg.alwaysOnTop,
    hasShadow: true,
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (cfg.alwaysOnTop) {
    widgetWin.setAlwaysOnTop(true, 'floating');
    widgetWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else if (process.platform === 'darwin') {
    // macOS 桌面小组件贴合桌面层级
    widgetWin.setVisibleOnAllWorkspaces(true);
  }

  void widgetWin.loadURL(cfg.url);
}

async function pollTraySummary() {
  if (!tray) return;
  try {
    const res = await fetch(BASE_URL + '/api/widget/summary');
    if (!res.ok) return;
    const data = await res.json();
    if (process.platform === 'darwin') {
      tray.setTitle(' ' + data.text);
    }
    tray.setToolTip(data.tooltip || data.text);
  } catch {
    if (process.platform === 'darwin') tray.setTitle(' CodexScope');
  }
}

app.whenReady().then(() => {
  tray = new Tray(createIcon());
  tray.setToolTip('CodexScope 实时子 Agent Token 监控');

  const menu = Menu.buildFromTemplate([
    { label: '任务栏贴边嵌入条', type: 'radio', checked: true, click: () => createWindowForMode('taskbar') },
    { label: '桌面小组件卡片', type: 'radio', click: () => createWindowForMode('desktop-widget') },
    { label: '置顶悬浮小窗', type: 'radio', click: () => createWindowForMode('floating') },
    { type: 'separator' },
    {
      label: '显示 / 隐藏窗口',
      click: () => {
        if (!widgetWin || widgetWin.isDestroyed()) createWindowForMode(currentMode);
        else if (widgetWin.isVisible()) widgetWin.hide();
        else widgetWin.show();
      },
    },
    { label: '退出 CodexScope', role: 'quit' },
  ]);

  tray.setContextMenu(menu);
  tray.on('click', () => {
    if (!widgetWin || widgetWin.isDestroyed()) createWindowForMode(currentMode);
    else if (widgetWin.isVisible()) widgetWin.hide();
    else widgetWin.show();
  });

  createWindowForMode('taskbar');
  void pollTraySummary();
  setInterval(pollTraySummary, 2000);
});

app.on('window-all-closed', (e) => {
  // 保持托盘常驻不退出
  e.preventDefault();
});
`;
}

export function generateSwiftBarPluginScript(endpointOrigin: string): string {
  const safeOrigin = endpointOrigin.replace(/\/+$/, '');
  return `#!/bin/bash
# <bitbar.title>CodexScope Token Monitor</bitbar.title>
# <bitbar.version>v2.0</bitbar.version>
# <bitbar.desc>在 macOS 顶部菜单栏实时显示 Codex / Claude Code / Cursor / Gemini CLI 子 Agent Token 消耗</bitbar.desc>
# <swiftbar.hideAbout>true</swiftbar.hideAbout>
# <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>
#
# 安装方式 (macOS):
#   1. brew install --cask swiftbar
#   2. 将此文件保存为 codexscope.2s.sh 放入 SwiftBar 插件目录
#   3. chmod +x codexscope.2s.sh

CODEXSCOPE_URL="\${CODEXSCOPE_URL:-${safeOrigin}}"
curl -fsS --max-time 2 "\${CODEXSCOPE_URL}/api/widget/taskbar?format=swiftbar" || echo "⚡ CodexScope 离线"
`;
}

export function generateRainmeterSkinIni(endpointOrigin: string): string {
  const safeOrigin = endpointOrigin.replace(/\/+$/, '');
  return `; =========================================================
; CodexScope Windows 桌面小组件皮肤 (Rainmeter)
; 安装方式 (Windows 10/11):
;   1. 安装 Rainmeter (https://www.rainmeter.net/)
;   2. 将本文件保存至 Documents\\Rainmeter\\Skins\\CodexScope\\CodexScope.ini
;   3. 刷新并加载皮肤，即可直接嵌入 Windows 桌面壁纸层
; =========================================================

[Rainmeter]
Update=2000
AccurateText=1
DynamicWindowSize=1
BackgroundMode=2
SolidColor=15,23,42,235

[Metadata]
Name=CodexScope Desktop Widget
Information=实时显示 Codex / Claude Code / Cursor / Gemini CLI 子 Agent Token 消耗
Version=2.0

[Variables]
ApiUrl=${safeOrigin}/api/widget/summary

[MeasureSummary]
Measure=WebParser
URL=#ApiUrl#
UpdateRate=1
RegExp=(?siU)"text":"([^"]*)".*"topModel":"([^"]*)".*"runningAgents":([0-9]+).*"totalAgents":([0-9]+)

[MeasureText]
Measure=WebParser
URL=[MeasureSummary]
StringIndex=1

[MeasureModel]
Measure=WebParser
URL=[MeasureSummary]
StringIndex=2

[MeasureRunning]
Measure=WebParser
URL=[MeasureSummary]
StringIndex=3

[MeasureTotalAgents]
Measure=WebParser
URL=[MeasureSummary]
StringIndex=4

[MeterTitle]
Meter=String
X=14
Y=10
FontFace=Segoe UI
FontSize=9
FontWeight=600
FontColor=148,163,184,255
Text=CodexScope · [MeasureRunning]/[MeasureTotalAgents] 运行中 · [MeasureModel]
DynamicVariables=1
AntiAlias=1

[MeterTokens]
Meter=String
MeasureName=MeasureText
X=14
Y=30
W=330
H=24
FontFace=Consolas
FontSize=11
FontWeight=700
FontColor=248,250,252,255
AntiAlias=1
LeftMouseUpAction=["${safeOrigin}/?widget=1"]
`;
}

export function generateWaybarModuleConfig(endpointOrigin: string): string {
  const safeOrigin = endpointOrigin.replace(/\/+$/, '');
  return `// 将以下模块添加到 Linux Waybar 配置 (~/.config/waybar/config.jsonc)
{
  "modules-right": ["custom/codexscope", "clock"],

  "custom/codexscope": {
    "exec": "curl -fsS --max-time 2 '${safeOrigin}/api/widget/taskbar?format=waybar' || echo '{\\"text\\":\\"CodexScope 离线\\",\\"class\\":\\"idle\\"}'",
    "return-type": "json",
    "interval": 2,
    "tooltip": true,
    "on-click": "xdg-open '${safeOrigin}/?widget=1'"
  }
}
`;
}

