import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import express, { type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import {
  applyTelemetryEvent,
  buildWidgetSummary,
  createInitialDemoSnapshot,
  formatSwiftBarOutput,
  normalizeAdapter,
  normalizeUsage,
  parseAgentLog,
  type AgentAdapter,
  type AgentRole,
  type AgentStatus,
  type TelemetryEvent,
  type TelemetrySnapshot,
} from './src/lib/telemetry.ts';
import {
  generateCodexConfigToml,
  generateCodexMcpServerScript,
  generateDesktopWidgetElectronScript,
  generateRainmeterSkinIni,
  generateSwiftBarPluginScript,
  generateTrayAndTaskbarWidgetScript,
  generateUniversalWatcherScript,
  generateWaybarModuleConfig,
} from './src/lib/pluginTemplates.ts';

const PORT = Number(process.env.PORT) || 3000;
const INGEST_TOKEN = (process.env.CODEXSCOPE_INGEST_TOKEN || '').trim();
const MAX_SSE_CLIENTS = 50;

let snapshot: TelemetrySnapshot = createInitialDemoSnapshot();
const sseClients = new Set<Response>();
let eventCounter = 1;

function nextEventId(prefix = 'evt'): string {
  eventCounter += 1;
  return `${prefix}-${Date.now()}-${eventCounter}`;
}

function verifyIngestToken(req: Request): boolean {
  if (!INGEST_TOKEN) return true;
  const headerToken = String(
    req.header('x-codexscope-token') ||
      (req.header('authorization') || '').replace(/^Bearer\s+/i, ''),
  ).trim();
  if (!headerToken) return false;
  const a = Buffer.from(headerToken, 'utf8');
  const b = Buffer.from(INGEST_TOKEN, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function broadcastSnapshot(eventType: 'snapshot' | 'update' = 'update') {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(snapshot)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}

const SIM_NOTES: Record<string, string[]> = {
  'codex-root-01': [
    '调度子代理进度并整合补丁差异',
    '检查子代理返回的验证结果',
    '更新任务规划并同步上下文摘要',
  ],
  'sub-api-builder': [
    '重构会话刷新接口与错误码处理',
    '应用 diff 补丁并校验类型定义',
    '读取控制器依赖与路由中间件',
  ],
  'sub-diff-reviewer': [
    '推理检查竞态锁与重放窗口',
    '审查令牌签名校验路径',
    '核对敏感错误响应字段脱敏',
  ],
  'claude-root-01': [
    '拆解前端状态模块并委派子代理',
    '审阅 Task 子代理生成的测试补丁',
    '合并组件重构改动',
  ],
  'claude-sub-tests': [
    '补充边界状态回归测试',
    '执行 vitest 并修复断言偏差',
    '验证异步流重连用例',
  ],
};

function runSimulationTick(forceAllRunning = false): TelemetryEvent | null {
  const runningAgents = snapshot.agents.filter((a) => a.status === 'running');
  if (runningAgents.length === 0) return null;

  const picked = forceAllRunning
    ? runningAgents
    : [runningAgents[eventCounter % runningAgents.length]];

  let lastEvent: TelemetryEvent | null = null;
  for (const agent of picked) {
    const isHeavy =
      (agent.model.includes('5.3-codex') && !agent.model.includes('mini')) ||
      agent.model.includes('sonnet') ||
      agent.model.includes('opus');
    const isReasoning = agent.model.startsWith('o4') || agent.model.startsWith('o3');
    const seed = (eventCounter * 7919 + agent.id.length * 131) % 100;

    const inputDelta = isHeavy
      ? 3600 + seed * 58
      : isReasoning
        ? 2200 + seed * 38
        : 1600 + seed * 32;
    const cachedRatio = isReasoning ? 0.52 : 0.72;
    const cachedDelta = Math.round(inputDelta * cachedRatio);
    const outputDelta = isReasoning
      ? 680 + seed * 14
      : isHeavy
        ? 520 + seed * 11
        : 310 + seed * 8;
    const reasoningDelta = isReasoning
      ? Math.round(outputDelta * 0.72)
      : Math.round(outputDelta * 0.25);

    const notes = SIM_NOTES[agent.id] || ['执行工具调用并生成代码补丁'];
    const note = notes[eventCounter % notes.length];

    const ev: TelemetryEvent = {
      id: nextEventId('sim'),
      timestamp: Date.now(),
      agentId: agent.id,
      parentId: agent.parentId,
      adapter: agent.adapter,
      agentName: agent.name,
      role: agent.role,
      model: agent.model,
      status: 'running',
      mode: 'delta',
      usage: normalizeUsage({
        input: inputDelta,
        cachedInput: cachedDelta,
        output: outputDelta,
        reasoningOutput: reasoningDelta,
      }),
      latencyMs: isReasoning ? 1420 + seed * 9 : 620 + seed * 7,
      note,
      source: agent.source,
    };

    snapshot = applyTelemetryEvent(snapshot, ev);
    lastEvent = ev;
  }

  broadcastSnapshot('update');
  return lastEvent;
}

const SPAWN_PRESETS: Array<{
  adapter: AgentAdapter;
  name: string;
  model: string;
  task: string;
}> = [
  {
    adapter: 'codex',
    name: 'sub-lint-fixer',
    model: 'gpt-5-codex-spark',
    task: 'Codex 子代理：快速修复 TypeScript 类型告警',
  },
  {
    adapter: 'claude-code',
    name: 'claude-sub-sec',
    model: 'claude-sonnet-4.5',
    task: 'Claude Task 子代理：审查鉴权与输入校验',
  },
  {
    adapter: 'cline',
    name: 'cline-ui-worker',
    model: 'deepseek-r1',
    task: 'Cline 代理：重构样式变量并验证对比度',
  },
  {
    adapter: 'opencode',
    name: 'opencode-bench',
    model: 'gpt-5.3-codex-mini',
    task: 'OpenCode 子代理：基准测试热路径延迟',
  },
  {
    adapter: 'gemini-cli',
    name: 'gemini-sub-docs',
    model: 'gemini-2.5-flash',
    task: 'Gemini CLI：同步生成接口文档摘要',
  },
];

let spawnIndex = 0;

function sanitizeString(value: unknown, maxLen: number, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, maxLen) || fallback;
}

function getRequestOrigin(req: Request): string {
  const configured = (process.env.APP_URL || '').trim();
  if (configured && /^https?:\/\//i.test(configured)) {
    return configured.replace(/\/+$/, '');
  }
  const proto = req.header('x-forwarded-proto') || req.protocol || 'http';
  const host = req.header('x-forwarded-host') || req.get('host') || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '512kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, agents: snapshot.agents.length });
  });

  app.get('/api/snapshot', (_req, res) => {
    res.json(snapshot);
  });

  app.get('/api/widget/summary', (_req, res) => {
    res.json(buildWidgetSummary(snapshot));
  });

  app.get('/api/widget/taskbar', (req, res) => {
    const format = String(req.query.format || 'text').toLowerCase();
    if (format === 'swiftbar') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(formatSwiftBarOutput(snapshot, getRequestOrigin(req)));
      return;
    }
    if (format === 'waybar') {
      const summary = buildWidgetSummary(snapshot);
      res.json({
        text: `⚡ ${summary.text}`,
        alt: summary.alt,
        tooltip: summary.tooltip,
        class: summary.class,
      });
      return;
    }
    const summary = buildWidgetSummary(snapshot);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(summary.text);
  });

  app.get('/api/stream', (req, res) => {
    if (sseClients.size >= MAX_SSE_CLIENTS) {
      res.status(503).json({ error: '实时连接数已达上限，请稍后重试' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    sseClients.add(res);
    res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);

    const keepAlive = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(keepAlive);
        sseClients.delete(res);
      }
    }, 20_000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
    });
  });

  app.post('/api/ingest', (req, res) => {
    if (!verifyIngestToken(req)) {
      res.status(401).json({ error: '缺少或无效的 X-CodexScope-Token' });
      return;
    }

    const body = req.body;
    const rawItems: unknown[] = Array.isArray(body) ? body.slice(0, 50) : [body];
    let accepted = 0;

    for (const item of rawItems) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const obj = item as Record<string, unknown>;
      const agentId = sanitizeString(obj.agentId ?? obj.agent_id, 80);
      if (!agentId) continue;

      const parentId = sanitizeString(obj.parentId ?? obj.parent_id, 80) || null;
      const adapter = normalizeAdapter(obj.adapter, 'codex');
      const role: AgentRole =
        obj.role === 'root' || obj.role === 'subagent'
          ? obj.role
          : parentId
            ? 'subagent'
            : 'root';
      const status: AgentStatus =
        obj.status === 'running' ||
        obj.status === 'idle' ||
        obj.status === 'completed' ||
        obj.status === 'error'
          ? obj.status
          : 'running';

      const usage = normalizeUsage({
        input: Number(obj.input_tokens ?? obj.input ?? 0),
        cachedInput: Number(obj.cached_input_tokens ?? obj.cachedInput ?? 0),
        output: Number(obj.output_tokens ?? obj.output ?? 0),
        reasoningOutput: Number(
          obj.reasoning_output_tokens ?? obj.reasoningOutput ?? 0,
        ),
        total: Number(obj.total_tokens ?? obj.total ?? 0),
      });

      const ev: TelemetryEvent = {
        id: nextEventId('live'),
        timestamp: Date.now(),
        agentId,
        parentId,
        adapter,
        agentName: sanitizeString(obj.agentName ?? obj.agent_name, 64, agentId),
        role,
        task: sanitizeString(obj.task, 120, '外部 Agent 实时上报任务'),
        model: sanitizeString(obj.model, 64, 'gpt-5.3-codex'),
        status,
        mode: obj.mode === 'cumulative' ? 'cumulative' : 'delta',
        usage,
        contextLimit: Number(obj.contextLimit) || undefined,
        latencyMs: Number(obj.latencyMs) || 520,
        note: sanitizeString(obj.note, 100, '实时插件推送'),
        source: 'live',
      };

      snapshot = applyTelemetryEvent(snapshot, ev);
      accepted += 1;
    }

    if (accepted === 0) {
      res.status(400).json({ error: '请提供包含有效 agentId 的 JSON 事件体' });
      return;
    }

    broadcastSnapshot('update');
    res.json({ ok: true, accepted, agentCount: snapshot.agents.length });
  });

  app.post('/api/import-jsonl', (req, res) => {
    const rawText = req.body?.jsonl;
    if (typeof rawText !== 'string' || !rawText.trim()) {
      res.status(400).json({ error: '请粘贴有效的 Agent 日志内容（支持 Codex / Claude Code / Gemini CLI）' });
      return;
    }
    if (rawText.length > 400_000) {
      res.status(413).json({ error: '单次导入内容超出 400KB 限制' });
      return;
    }

    const parsed = parseAgentLog(rawText);
    if (parsed.events.length === 0) {
      res.status(400).json({
        error:
          parsed.errors[0] ||
          '未解析到包含 Token 字段的记录，请检查日志格式',
        errors: parsed.errors.slice(0, 5),
      });
      return;
    }

    for (const ev of parsed.events) {
      snapshot = applyTelemetryEvent(snapshot, ev);
    }
    broadcastSnapshot('update');
    res.json({
      ok: true,
      importedEvents: parsed.events.length,
      parsedLines: parsed.parsedLines,
      ignoredLines: parsed.ignoredLines,
      detectedAdapters: parsed.detectedAdapters,
      errors: parsed.errors.slice(0, 5),
      snapshot,
    });
  });

  app.post('/api/simulator/toggle', (req, res) => {
    const requested = req.body?.running;
    snapshot = {
      ...snapshot,
      simulationRunning:
        typeof requested === 'boolean' ? requested : !snapshot.simulationRunning,
    };
    broadcastSnapshot('update');
    res.json({ ok: true, simulationRunning: snapshot.simulationRunning });
  });

  app.post('/api/simulator/burst', (_req, res) => {
    runSimulationTick(true);
    res.json({ ok: true, snapshot });
  });

  app.post('/api/simulator/spawn', (req, res) => {
    const preset = SPAWN_PRESETS[spawnIndex % SPAWN_PRESETS.length];
    spawnIndex += 1;

    const customName = sanitizeString(req.body?.name, 48);
    const customModel = sanitizeString(req.body?.model, 64);
    const customTask = sanitizeString(req.body?.task, 120);
    const adapter = normalizeAdapter(req.body?.adapter, preset.adapter);

    const parentCandidate =
      snapshot.agents.find((a) => a.adapter === adapter && a.role === 'root') ||
      snapshot.agents.find((a) => a.role === 'root') ||
      snapshot.agents[0];
    const agentId = `${customName || preset.name}-${spawnIndex}`;
    const ev: TelemetryEvent = {
      id: nextEventId('spawn'),
      timestamp: Date.now(),
      agentId,
      parentId: parentCandidate && parentCandidate.adapter === adapter ? parentCandidate.id : null,
      adapter,
      agentName: customName || `${preset.name}-${spawnIndex}`,
      role: parentCandidate && parentCandidate.adapter === adapter ? 'subagent' : 'root',
      task: customTask || preset.task,
      model: customModel || preset.model,
      status: 'running',
      mode: 'delta',
      usage: normalizeUsage({
        input: 6400 + spawnIndex * 510,
        cachedInput: 3200 + spawnIndex * 240,
        output: 920 + spawnIndex * 85,
        reasoningOutput: 280 + spawnIndex * 35,
      }),
      latencyMs: 740,
      note: 'spawn_agent 启动新子代理',
      source: 'demo',
    };

    snapshot = applyTelemetryEvent(snapshot, ev);
    broadcastSnapshot('update');
    res.json({ ok: true, agentId, snapshot });
  });

  app.post('/api/session/clear', (_req, res) => {
    snapshot = {
      sessionId: `agent-hud-${Date.now().toString(36)}`,
      sessionStartedAt: Date.now(),
      simulationRunning: false,
      agents: [],
      events: [],
      rateHistory: [],
    };
    broadcastSnapshot('snapshot');
    res.json({ ok: true, snapshot });
  });

  app.post('/api/session/load-demo', (_req, res) => {
    snapshot = createInitialDemoSnapshot();
    broadcastSnapshot('snapshot');
    res.json({ ok: true, snapshot });
  });

  app.get('/api/plugin/download/:filename', (req, res) => {
    const origin = getRequestOrigin(req);
    const filename = req.params.filename;
    const files: Record<string, { content: string; mime: string }> = {
      'universal-agent-watcher.mjs': {
        content: generateUniversalWatcherScript(origin),
        mime: 'application/javascript; charset=utf-8',
      },
      'codex-token-watcher.mjs': {
        content: generateUniversalWatcherScript(origin),
        mime: 'application/javascript; charset=utf-8',
      },
      'codexscope-tray-widget.mjs': {
        content: generateTrayAndTaskbarWidgetScript(origin),
        mime: 'application/javascript; charset=utf-8',
      },
      'desktop-widget.mjs': {
        content: generateDesktopWidgetElectronScript(origin),
        mime: 'application/javascript; charset=utf-8',
      },
      'codexscope.2s.sh': {
        content: generateSwiftBarPluginScript(origin),
        mime: 'text/x-shellscript; charset=utf-8',
      },
      'CodexScope.ini': {
        content: generateRainmeterSkinIni(origin),
        mime: 'text/plain; charset=utf-8',
      },
      'waybar-codexscope.jsonc': {
        content: generateWaybarModuleConfig(origin),
        mime: 'application/json; charset=utf-8',
      },
      'codex-mcp-monitor.mjs': {
        content: generateCodexMcpServerScript(origin),
        mime: 'application/javascript; charset=utf-8',
      },
      'config.toml': {
        content: generateCodexConfigToml(origin),
        mime: 'text/plain; charset=utf-8',
      },
    };

    const target = files[filename];
    if (!target) {
      res.status(404).json({ error: '未知的插件文件' });
      return;
    }

    res.setHeader('Content-Type', target.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(target.content);
  });

  setInterval(() => {
    if (snapshot.simulationRunning && snapshot.agents.length > 0) {
      runSimulationTick(false);
    }
  }, 2200);

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`CodexScope server running at http://0.0.0.0:${PORT}`);
  });
}

void startServer();
