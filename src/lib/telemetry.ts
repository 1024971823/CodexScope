export type AgentStatus = 'running' | 'idle' | 'completed' | 'error';
export type AgentRole = 'root' | 'subagent';
export type TelemetrySource = 'live' | 'jsonl' | 'demo';
export type AgentAdapter =
  | 'codex'
  | 'claude-code'
  | 'cursor'
  | 'cline'
  | 'opencode'
  | 'gemini-cli'
  | 'custom';

export interface AdapterMeta {
  id: AgentAdapter;
  name: string;
  shortName: string;
  logPath: string;
  accentClass: string;
}

export const ADAPTER_CATALOG: Record<AgentAdapter, AdapterMeta> = {
  codex: {
    id: 'codex',
    name: 'OpenAI Codex',
    shortName: 'Codex',
    logPath: '~/.codex/sessions/**/*.jsonl',
    accentClass: 'text-blue-700 dark:text-blue-400',
  },
  'claude-code': {
    id: 'claude-code',
    name: 'Claude Code',
    shortName: 'Claude Code',
    logPath: '~/.claude/projects/**/*.jsonl',
    accentClass: 'text-amber-700 dark:text-amber-400',
  },
  cursor: {
    id: 'cursor',
    name: 'Cursor Agent',
    shortName: 'Cursor',
    logPath: 'OTel / Hook -> /api/ingest',
    accentClass: 'text-slate-800 dark:text-slate-200',
  },
  cline: {
    id: 'cline',
    name: 'Cline / Roo Code',
    shortName: 'Cline',
    logPath: 'tasks/*/api_conversation_history.json',
    accentClass: 'text-emerald-700 dark:text-emerald-400',
  },
  opencode: {
    id: 'opencode',
    name: 'OpenCode',
    shortName: 'OpenCode',
    logPath: '~/.local/share/opencode/storage/**/*.json',
    accentClass: 'text-indigo-700 dark:text-indigo-400',
  },
  'gemini-cli': {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    shortName: 'Gemini CLI',
    logPath: '~/.gemini/tmp/*/chats/session-*.json',
    accentClass: 'text-sky-700 dark:text-sky-400',
  },
  custom: {
    id: 'custom',
    name: '自定义 Agent',
    shortName: 'Custom',
    logPath: 'POST /api/ingest',
    accentClass: 'text-slate-600 dark:text-slate-400',
  },
};

export interface TokenCounts {
  input: number;
  cachedInput: number;
  output: number;
  reasoningOutput: number;
  total: number;
}

export interface AgentTurn {
  id: string;
  timestamp: number;
  model: string;
  delta: TokenCounts;
  latencyMs: number;
  note: string;
}

export interface AgentRecord {
  id: string;
  parentId: string | null;
  adapter: AgentAdapter;
  name: string;
  role: AgentRole;
  task: string;
  model: string;
  status: AgentStatus;
  contextLimit: number;
  contextUsed: number;
  tokens: TokenCounts;
  lastDelta: TokenCounts;
  lastUpdatedAt: number;
  startedAt: number;
  turns: AgentTurn[];
  source: TelemetrySource;
}

export interface TelemetryEvent {
  id: string;
  timestamp: number;
  agentId: string;
  parentId: string | null;
  adapter?: AgentAdapter;
  agentName: string;
  role: AgentRole;
  task?: string;
  model: string;
  status?: AgentStatus;
  mode: 'delta' | 'cumulative';
  usage: TokenCounts;
  contextLimit?: number;
  latencyMs?: number;
  note?: string;
  source?: TelemetrySource;
}

export interface RatePoint {
  timestamp: number;
  label: string;
  inputDelta: number;
  cachedDelta: number;
  outputDelta: number;
  reasoningDelta: number;
  totalDelta: number;
  activeAgents: number;
}

export interface TelemetrySnapshot {
  sessionId: string;
  sessionStartedAt: number;
  simulationRunning: boolean;
  agents: AgentRecord[];
  events: TelemetryEvent[];
  rateHistory: RatePoint[];
}

export interface ModelPricing {
  model: string;
  label: string;
  tier: string;
  inputPer1M: number;
  cachedInputPer1M: number;
  outputPer1M: number;
  contextLimit: number;
}

export interface ModelSummary {
  model: string;
  label: string;
  tier: string;
  agentCount: number;
  runningCount: number;
  tokens: TokenCounts;
  costUsd: number;
  sharePct: number;
  cacheHitPct: number;
}

export interface AgentTreeNode {
  agent: AgentRecord;
  depth: number;
  childCount: number;
}

export interface ParseJsonlResult {
  events: TelemetryEvent[];
  parsedLines: number;
  ignoredLines: number;
  detectedAdapters: AgentAdapter[];
  errors: string[];
}

const MAX_AGENTS = 100;
const MAX_EVENTS = 250;
const MAX_TURNS_PER_AGENT = 120;
const MAX_RATE_POINTS = 30;

export const MODEL_PRICING_TABLE: Record<string, ModelPricing> = {
  'gpt-5.3-codex': {
    model: 'gpt-5.3-codex',
    label: 'GPT-5.3 Codex',
    tier: 'OpenAI 旗舰编程模型',
    inputPer1M: 1.75,
    cachedInputPer1M: 0.175,
    outputPer1M: 14.0,
    contextLimit: 400_000,
  },
  'gpt-5.3-codex-mini': {
    model: 'gpt-5.3-codex-mini',
    label: 'GPT-5.3 Codex Mini',
    tier: 'OpenAI 高性价比子代理',
    inputPer1M: 0.35,
    cachedInputPer1M: 0.035,
    outputPer1M: 2.8,
    contextLimit: 256_000,
  },
  'gpt-5-codex-spark': {
    model: 'gpt-5-codex-spark',
    label: 'GPT-5 Codex Spark',
    tier: '超低延迟探索',
    inputPer1M: 0.2,
    cachedInputPer1M: 0.02,
    outputPer1M: 1.2,
    contextLimit: 128_000,
  },
  'o4-mini': {
    model: 'o4-mini',
    label: 'o4-mini',
    tier: '推理审查与验证',
    inputPer1M: 1.1,
    cachedInputPer1M: 0.275,
    outputPer1M: 4.4,
    contextLimit: 200_000,
  },
  o3: {
    model: 'o3',
    label: 'o3',
    tier: '深度架构推理',
    inputPer1M: 2.0,
    cachedInputPer1M: 0.5,
    outputPer1M: 8.0,
    contextLimit: 200_000,
  },
  'claude-opus-4.5': {
    model: 'claude-opus-4.5',
    label: 'Claude Opus 4.5',
    tier: 'Anthropic 旗舰编程',
    inputPer1M: 5.0,
    cachedInputPer1M: 0.5,
    outputPer1M: 25.0,
    contextLimit: 200_000,
  },
  'claude-sonnet-4.5': {
    model: 'claude-sonnet-4.5',
    label: 'Claude Sonnet 4.5',
    tier: 'Anthropic 主力编码',
    inputPer1M: 3.0,
    cachedInputPer1M: 0.3,
    outputPer1M: 15.0,
    contextLimit: 200_000,
  },
  'claude-haiku-4.5': {
    model: 'claude-haiku-4.5',
    label: 'Claude Haiku 4.5',
    tier: 'Anthropic 极速子代理',
    inputPer1M: 1.0,
    cachedInputPer1M: 0.1,
    outputPer1M: 5.0,
    contextLimit: 200_000,
  },
  'gemini-2.5-pro': {
    model: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    tier: 'Google 长上下文编码',
    inputPer1M: 1.25,
    cachedInputPer1M: 0.31,
    outputPer1M: 10.0,
    contextLimit: 1_000_000,
  },
  'gemini-2.5-flash': {
    model: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    tier: 'Google 高速子代理',
    inputPer1M: 0.3,
    cachedInputPer1M: 0.075,
    outputPer1M: 2.5,
    contextLimit: 1_000_000,
  },
  'deepseek-r1': {
    model: 'deepseek-r1',
    label: 'DeepSeek R1',
    tier: '开源深度推理',
    inputPer1M: 0.55,
    cachedInputPer1M: 0.14,
    outputPer1M: 2.19,
    contextLimit: 128_000,
  },
};

export function normalizeAdapter(value: unknown, fallback: AgentAdapter = 'codex'): AgentAdapter {
  if (typeof value !== 'string') return fallback;
  const v = value.trim().toLowerCase();
  if (v === 'codex' || v === 'openai-codex') return 'codex';
  if (v === 'claude-code' || v === 'claude' || v === 'claudecode') return 'claude-code';
  if (v === 'cursor') return 'cursor';
  if (v === 'cline' || v === 'roo' || v === 'roo-code') return 'cline';
  if (v === 'opencode') return 'opencode';
  if (v === 'gemini-cli' || v === 'gemini') return 'gemini-cli';
  if (v === 'custom') return 'custom';
  return fallback;
}

export function getAdapterMeta(adapter: AgentAdapter): AdapterMeta {
  return ADAPTER_CATALOG[adapter] || ADAPTER_CATALOG.custom;
}

export function emptyTokenCounts(): TokenCounts {
  return {
    input: 0,
    cachedInput: 0,
    output: 0,
    reasoningOutput: 0,
    total: 0,
  };
}

export function getModelPricing(model: string): ModelPricing {
  const normalized = model.trim().toLowerCase();
  if (MODEL_PRICING_TABLE[normalized]) {
    return MODEL_PRICING_TABLE[normalized];
  }
  const matchedKey = Object.keys(MODEL_PRICING_TABLE).find((k) =>
    normalized.includes(k),
  );
  if (matchedKey) {
    return {
      ...MODEL_PRICING_TABLE[matchedKey],
      model: model.trim() || matchedKey,
    };
  }
  if (normalized.includes('claude') && normalized.includes('sonnet')) {
    return { ...MODEL_PRICING_TABLE['claude-sonnet-4.5'], model: model.trim() };
  }
  if (normalized.includes('claude') && normalized.includes('haiku')) {
    return { ...MODEL_PRICING_TABLE['claude-haiku-4.5'], model: model.trim() };
  }
  if (normalized.includes('claude') && normalized.includes('opus')) {
    return { ...MODEL_PRICING_TABLE['claude-opus-4.5'], model: model.trim() };
  }
  if (normalized.includes('gemini') && normalized.includes('flash')) {
    return { ...MODEL_PRICING_TABLE['gemini-2.5-flash'], model: model.trim() };
  }
  if (normalized.includes('gemini')) {
    return { ...MODEL_PRICING_TABLE['gemini-2.5-pro'], model: model.trim() };
  }
  return {
    model: model.trim() || 'unknown-model',
    label: model.trim() || '自定义模型',
    tier: '自定义 / 兼容模型',
    inputPer1M: 1.25,
    cachedInputPer1M: 0.25,
    outputPer1M: 5.0,
    contextLimit: 200_000,
  };
}

function clampNonNegativeInt(val: unknown): number {
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.min(Math.floor(num), 1_000_000_000);
}

export function normalizeUsage(raw: Partial<TokenCounts> | undefined): TokenCounts {
  const input = clampNonNegativeInt(raw?.input);
  const cachedInput = Math.min(clampNonNegativeInt(raw?.cachedInput), input);
  const output = clampNonNegativeInt(raw?.output);
  const reasoningOutput = Math.min(clampNonNegativeInt(raw?.reasoningOutput), output);
  const computedTotal = input + output;
  const total = Math.max(clampNonNegativeInt(raw?.total), computedTotal);
  return {
    input,
    cachedInput,
    output,
    reasoningOutput,
    total,
  };
}

export function addTokenCounts(a: TokenCounts, b: TokenCounts): TokenCounts {
  const input = a.input + b.input;
  const cachedInput = Math.min(a.cachedInput + b.cachedInput, input);
  const output = a.output + b.output;
  const reasoningOutput = Math.min(a.reasoningOutput + b.reasoningOutput, output);
  return {
    input,
    cachedInput,
    output,
    reasoningOutput,
    total: input + output,
  };
}

export function calculateTokenCost(tokens: TokenCounts, model: string): number {
  const pricing = getModelPricing(model);
  const uncachedInput = Math.max(0, tokens.input - tokens.cachedInput);
  const inputCost = (uncachedInput / 1_000_000) * pricing.inputPer1M;
  const cachedCost = (tokens.cachedInput / 1_000_000) * pricing.cachedInputPer1M;
  const outputCost = (tokens.output / 1_000_000) * pricing.outputPer1M;
  return Number((inputCost + cachedCost + outputCost).toFixed(6));
}

export function formatTimeLabel(timestamp: number): string {
  const d = new Date(timestamp);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function formatCompactTokens(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (abs >= 10_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  return Math.round(value).toLocaleString('en-US');
}

export function formatExactTokens(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Math.round(value).toLocaleString('en-US');
}

export function formatUsd(cost: number): string {
  if (!Number.isFinite(cost) || cost <= 0) return '$0.0000';
  if (cost >= 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(4)}`;
}

export function applyTelemetryEvent(
  state: TelemetrySnapshot,
  rawEvent: TelemetryEvent,
): TelemetrySnapshot {
  const usage = normalizeUsage(rawEvent.usage);
  const pricing = getModelPricing(rawEvent.model);
  const adapter = normalizeAdapter(rawEvent.adapter, 'codex');
  const agents = [...state.agents];
  const existingIdx = agents.findIndex((a) => a.id === rawEvent.agentId);

  let delta: TokenCounts;
  let updatedAgent: AgentRecord;

  if (existingIdx === -1) {
    if (agents.length >= MAX_AGENTS) {
      return state;
    }
    delta = usage;
    const contextLimit = rawEvent.contextLimit || pricing.contextLimit;
    const turn: AgentTurn = {
      id: `${rawEvent.id}-t1`,
      timestamp: rawEvent.timestamp,
      model: rawEvent.model,
      delta,
      latencyMs: clampNonNegativeInt(rawEvent.latencyMs) || 840,
      note: rawEvent.note || (rawEvent.role === 'root' ? '主会话初始化' : '子代理启动'),
    };
    updatedAgent = {
      id: rawEvent.agentId,
      parentId: rawEvent.parentId,
      adapter,
      name: rawEvent.agentName || rawEvent.agentId,
      role: rawEvent.role,
      task: rawEvent.task || '执行 Agent 子任务',
      model: rawEvent.model,
      status: rawEvent.status || 'running',
      contextLimit,
      contextUsed: Math.min(contextLimit, usage.input),
      tokens: usage,
      lastDelta: delta,
      lastUpdatedAt: rawEvent.timestamp,
      startedAt: rawEvent.timestamp,
      turns: delta.total > 0 ? [turn] : [],
      source: rawEvent.source || 'live',
    };
    agents.push(updatedAgent);
  } else {
    const prev = agents[existingIdx];
    if (rawEvent.mode === 'cumulative') {
      const inputDiff = Math.max(0, usage.input - prev.tokens.input);
      const cachedDiff = Math.max(0, usage.cachedInput - prev.tokens.cachedInput);
      const outputDiff = Math.max(0, usage.output - prev.tokens.output);
      const reasoningDiff = Math.max(
        0,
        usage.reasoningOutput - prev.tokens.reasoningOutput,
      );
      delta = normalizeUsage({
        input: inputDiff,
        cachedInput: Math.min(cachedDiff, inputDiff),
        output: outputDiff,
        reasoningOutput: Math.min(reasoningDiff, outputDiff),
      });
    } else {
      delta = usage;
    }

    const nextTokens =
      rawEvent.mode === 'cumulative'
        ? normalizeUsage({
            input: Math.max(prev.tokens.input, usage.input),
            cachedInput: Math.max(prev.tokens.cachedInput, usage.cachedInput),
            output: Math.max(prev.tokens.output, usage.output),
            reasoningOutput: Math.max(
              prev.tokens.reasoningOutput,
              usage.reasoningOutput,
            ),
          })
        : addTokenCounts(prev.tokens, delta);

    const nextContextLimit =
      rawEvent.contextLimit ||
      (rawEvent.model !== prev.model ? pricing.contextLimit : prev.contextLimit);
    const uncachedDelta = Math.max(0, delta.input - delta.cachedInput);
    const nextContextUsed = Math.min(
      nextContextLimit,
      delta.total > 0
        ? prev.contextUsed + uncachedDelta + delta.output
        : prev.contextUsed,
    );

    const nextTurns =
      delta.total > 0
        ? [
            {
              id: rawEvent.id,
              timestamp: rawEvent.timestamp,
              model: rawEvent.model || prev.model,
              delta,
              latencyMs: clampNonNegativeInt(rawEvent.latencyMs) || 680,
              note: rawEvent.note || '模型响应完成',
            },
            ...prev.turns,
          ].slice(0, MAX_TURNS_PER_AGENT)
        : prev.turns;

    updatedAgent = {
      ...prev,
      parentId: rawEvent.parentId ?? prev.parentId,
      adapter: rawEvent.adapter ? adapter : prev.adapter,
      name: rawEvent.agentName || prev.name,
      task: rawEvent.task || prev.task,
      model: rawEvent.model || prev.model,
      status: rawEvent.status || prev.status,
      contextLimit: nextContextLimit,
      contextUsed: nextContextUsed,
      tokens: nextTokens,
      lastDelta: delta.total > 0 ? delta : prev.lastDelta,
      lastUpdatedAt: rawEvent.timestamp,
      turns: nextTurns,
      source: rawEvent.source || prev.source,
    };
    agents[existingIdx] = updatedAgent;
  }

  const normalizedEvent: TelemetryEvent = {
    ...rawEvent,
    adapter: updatedAgent.adapter,
    usage: delta,
    mode: 'delta',
    agentName: updatedAgent.name,
    model: updatedAgent.model,
    status: updatedAgent.status,
  };

  const events = [normalizedEvent, ...state.events].slice(0, MAX_EVENTS);

  const activeAgents = agents.filter((a) => a.status === 'running').length;
  const rateHistory = [...state.rateHistory];
  if (delta.total > 0) {
    const lastPoint = rateHistory[rateHistory.length - 1];
    const bucketGapMs = 1800;
    if (lastPoint && rawEvent.timestamp - lastPoint.timestamp < bucketGapMs) {
      rateHistory[rateHistory.length - 1] = {
        ...lastPoint,
        inputDelta: lastPoint.inputDelta + delta.input,
        cachedDelta: lastPoint.cachedDelta + delta.cachedInput,
        outputDelta: lastPoint.outputDelta + delta.output,
        reasoningDelta: lastPoint.reasoningDelta + delta.reasoningOutput,
        totalDelta: lastPoint.totalDelta + delta.total,
        activeAgents,
      };
    } else {
      rateHistory.push({
        timestamp: rawEvent.timestamp,
        label: formatTimeLabel(rawEvent.timestamp),
        inputDelta: delta.input,
        cachedDelta: delta.cachedInput,
        outputDelta: delta.output,
        reasoningDelta: delta.reasoningOutput,
        totalDelta: delta.total,
        activeAgents,
      });
    }
  }

  return {
    ...state,
    agents,
    events,
    rateHistory: rateHistory.slice(-MAX_RATE_POINTS),
  };
}

export function sumAllTokens(agents: AgentRecord[]): TokenCounts {
  return agents.reduce((acc, a) => addTokenCounts(acc, a.tokens), emptyTokenCounts());
}

export function sumAllCost(agents: AgentRecord[]): number {
  return Number(
    agents
      .reduce((acc, a) => acc + calculateTokenCost(a.tokens, a.model), 0)
      .toFixed(6),
  );
}

export function aggregateByModel(agents: AgentRecord[]): ModelSummary[] {
  const totalSessionTokens = sumAllTokens(agents).total;
  const map = new Map<
    string,
    { agentCount: number; runningCount: number; tokens: TokenCounts; costUsd: number }
  >();

  for (const agent of agents) {
    const key = agent.model || 'unknown-model';
    const current = map.get(key) || {
      agentCount: 0,
      runningCount: 0,
      tokens: emptyTokenCounts(),
      costUsd: 0,
    };
    current.agentCount += 1;
    if (agent.status === 'running') current.runningCount += 1;
    current.tokens = addTokenCounts(current.tokens, agent.tokens);
    current.costUsd += calculateTokenCost(agent.tokens, agent.model);
    map.set(key, current);
  }

  return Array.from(map.entries())
    .map(([model, entry]) => {
      const pricing = getModelPricing(model);
      const sharePct =
        totalSessionTokens > 0
          ? Number(((entry.tokens.total / totalSessionTokens) * 100).toFixed(1))
          : 0;
      const cacheHitPct =
        entry.tokens.input > 0
          ? Number(((entry.tokens.cachedInput / entry.tokens.input) * 100).toFixed(1))
          : 0;
      return {
        model,
        label: pricing.label,
        tier: pricing.tier,
        agentCount: entry.agentCount,
        runningCount: entry.runningCount,
        tokens: entry.tokens,
        costUsd: Number(entry.costUsd.toFixed(6)),
        sharePct,
        cacheHitPct,
      };
    })
    .sort((a, b) => b.tokens.total - a.tokens.total);
}

export function buildAgentTree(agents: AgentRecord[]): AgentTreeNode[] {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const childrenMap = new Map<string | null, AgentRecord[]>();

  for (const agent of agents) {
    const effectiveParent =
      agent.parentId && byId.has(agent.parentId) && agent.parentId !== agent.id
        ? agent.parentId
        : null;
    const list = childrenMap.get(effectiveParent) || [];
    list.push(agent);
    childrenMap.set(effectiveParent, list);
  }

  for (const [, list] of childrenMap) {
    list.sort((a, b) => {
      if (a.role !== b.role) return a.role === 'root' ? -1 : 1;
      return b.tokens.total - a.tokens.total;
    });
  }

  const ordered: AgentTreeNode[] = [];
  const visited = new Set<string>();

  function walk(parentId: string | null, depth: number) {
    const children = childrenMap.get(parentId) || [];
    for (const child of children) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      const grandChildren = childrenMap.get(child.id) || [];
      ordered.push({
        agent: child,
        depth,
        childCount: grandChildren.length,
      });
      walk(child.id, Math.min(depth + 1, 4));
    }
  }

  walk(null, 0);

  for (const agent of agents) {
    if (!visited.has(agent.id)) {
      ordered.push({ agent, depth: 0, childCount: 0 });
    }
  }

  return ordered;
}

export interface WidgetSummaryPayload {
  text: string;
  alt: string;
  tooltip: string;
  class: 'active' | 'idle';
  totalTokens: number;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  deltaTokens: number;
  costUsd: number;
  runningAgents: number;
  totalAgents: number;
  topModel: string;
  topAgent: {
    id: string;
    name: string;
    adapter: AgentAdapter;
    model: string;
    total: number;
  } | null;
  agents: Array<{
    id: string;
    name: string;
    adapter: AgentAdapter;
    role: AgentRole;
    model: string;
    status: AgentStatus;
    input: number;
    cachedInput: number;
    output: number;
    reasoningOutput: number;
    total: number;
    deltaInput: number;
    deltaOutput: number;
    costUsd: number;
  }>;
}

function cleanSingleLine(text: string): string {
  return text.replace(/[\r\n|]+/g, ' ').trim();
}

export function buildWidgetSummary(snapshot: TelemetrySnapshot): WidgetSummaryPayload {
  const totals = sumAllTokens(snapshot.agents);
  const costUsd = sumAllCost(snapshot.agents);
  const runningAgents = snapshot.agents.filter((a) => a.status === 'running').length;
  const latestRate = snapshot.rateHistory[snapshot.rateHistory.length - 1];
  const deltaTokens = latestRate ? latestRate.totalDelta : 0;

  const sortedByTotal = [...snapshot.agents].sort(
    (a, b) => b.tokens.total - a.tokens.total,
  );
  const top = sortedByTotal[0] || null;
  const topModel = top ? top.model : 'idle';

  const compactTotal = formatCompactTokens(totals.total);
  const compactIn = formatCompactTokens(totals.input);
  const compactOut = formatCompactTokens(totals.output);
  const deltaSuffix = deltaTokens > 0 ? ` +${formatCompactTokens(deltaTokens)}` : '';

  const text = `${compactTotal}${deltaSuffix} · ↑${compactIn} ↓${compactOut} · ${formatUsd(costUsd)}`;
  const tooltipLines = [
    `CodexScope 实时统计 (${runningAgents}/${snapshot.agents.length} 活跃)`,
    `总计: ${formatExactTokens(totals.total)} Token · ${formatUsd(costUsd)}`,
    `输入: ${formatExactTokens(totals.input)} (缓存 ${formatCompactTokens(totals.cachedInput)})`,
    `输出: ${formatExactTokens(totals.output)} (推理 ${formatCompactTokens(totals.reasoningOutput)})`,
    ...sortedByTotal.slice(0, 6).map((a) => {
      const adapterShort = getAdapterMeta(a.adapter).shortName;
      return `${a.role === 'subagent' ? '└ ' : ''}${cleanSingleLine(a.name)} [${adapterShort} · ${cleanSingleLine(a.model)}]: ${formatCompactTokens(a.tokens.total)} (入 ${formatCompactTokens(a.tokens.input)} / 出 ${formatCompactTokens(a.tokens.output)})`;
    }),
  ];

  return {
    text,
    alt: topModel,
    tooltip: tooltipLines.join('\n'),
    class: runningAgents > 0 ? 'active' : 'idle',
    totalTokens: totals.total,
    inputTokens: totals.input,
    cachedTokens: totals.cachedInput,
    outputTokens: totals.output,
    reasoningTokens: totals.reasoningOutput,
    deltaTokens,
    costUsd,
    runningAgents,
    totalAgents: snapshot.agents.length,
    topModel,
    topAgent: top
      ? {
          id: top.id,
          name: top.name,
          adapter: top.adapter,
          model: top.model,
          total: top.tokens.total,
        }
      : null,
    agents: sortedByTotal.map((a) => ({
      id: a.id,
      name: a.name,
      adapter: a.adapter,
      role: a.role,
      model: a.model,
      status: a.status,
      input: a.tokens.input,
      cachedInput: a.tokens.cachedInput,
      output: a.tokens.output,
      reasoningOutput: a.tokens.reasoningOutput,
      total: a.tokens.total,
      deltaInput: a.lastDelta.input,
      deltaOutput: a.lastDelta.output,
      costUsd: calculateTokenCost(a.tokens, a.model),
    })),
  };
}

export function formatSwiftBarOutput(
  snapshot: TelemetrySnapshot,
  dashboardOrigin: string,
): string {
  const summary = buildWidgetSummary(snapshot);
  const safeOrigin = dashboardOrigin.replace(/[\r\n]+/g, '').replace(/\/+$/, '');
  const titleDelta =
    summary.deltaTokens > 0 ? ` +${formatCompactTokens(summary.deltaTokens)}` : '';
  const lines = [
    `⚡ ${formatCompactTokens(summary.totalTokens)}${titleDelta} · ${formatUsd(summary.costUsd)} | sfimage=cpu`,
    '---',
    `总消耗: ${formatExactTokens(summary.totalTokens)} Token (${formatUsd(summary.costUsd)}) | font=Menlo size=12`,
    `输入: ${formatExactTokens(summary.inputTokens)} (缓存 ${formatCompactTokens(summary.cachedTokens)}) | font=Menlo size=11`,
    `输出: ${formatExactTokens(summary.outputTokens)} (推理 ${formatCompactTokens(summary.reasoningTokens)}) | font=Menlo size=11`,
    '---',
  ];

  const tree = buildAgentTree(snapshot.agents);
  for (const { agent, depth } of tree) {
    const indent = depth > 0 ? '  '.repeat(depth) + '└ ' : '';
    const adapterShort = getAdapterMeta(agent.adapter).shortName;
    lines.push(
      `${indent}${cleanSingleLine(agent.name)} (${adapterShort} · ${cleanSingleLine(agent.model)}) — ${formatCompactTokens(agent.tokens.total)} [入 ${formatCompactTokens(agent.tokens.input)} / 出 ${formatCompactTokens(agent.tokens.output)}] | font=Menlo size=11`,
    );
  }

  lines.push('---');
  lines.push(`打开独立桌面小窗 | href=${safeOrigin}/?widget=1`);
  lines.push(`打开完整工作台 | href=${safeOrigin}`);
  return lines.join('\n') + '\n';
}

/**
 * Universal multi-agent log parser supporting:
 * 1. OpenAI Codex CLI rollout JSONL (`~/.codex/sessions/.../rollout-*.jsonl`)
 * 2. Claude Code session JSONL (`~/.claude/projects/.../*.jsonl`)
 * 3. Gemini CLI session JSON (`~/.gemini/tmp/.../chats/session-*.json`)
 * 4. Direct / Universal watcher normalized JSONL (Cursor, Cline, OpenCode, Custom)
 */
export function parseAgentLog(
  rawText: string,
  defaultAgentId = 'agent-imported',
): ParseJsonlResult {
  const events: TelemetryEvent[] = [];
  const errors: string[] = [];
  const detectedSet = new Set<AgentAdapter>();
  let parsedLines = 0;
  let ignoredLines = 0;

  const trimmed = rawText.trim();
  if (!trimmed) {
    return { events, parsedLines, ignoredLines, detectedAdapters: [], errors };
  }

  // Try whole-document JSON first (Gemini CLI session-*.json or Cline JSON)
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const doc = JSON.parse(trimmed) as Record<string, unknown>;
      if (Array.isArray(doc.messages)) {
        const sessionId =
          typeof doc.sessionId === 'string' && doc.sessionId.trim()
            ? doc.sessionId.trim().slice(0, 64)
            : 'gemini-cli-session';
        const msgs = doc.messages as Array<Record<string, unknown>>;
        msgs.forEach((msg, idx) => {
          const tokensObj =
            msg.tokens && typeof msg.tokens === 'object'
              ? (msg.tokens as Record<string, unknown>)
              : null;
          if (!tokensObj) return;
          const model =
            typeof msg.model === 'string' && msg.model.trim()
              ? msg.model.trim().slice(0, 64)
              : 'gemini-2.5-pro';
          const ts =
            typeof msg.timestamp === 'string'
              ? Date.parse(msg.timestamp) || Date.now() + idx
              : Date.now() + idx;
          const input = clampNonNegativeInt(tokensObj.input);
          const cached = clampNonNegativeInt(tokensObj.cached);
          const output = clampNonNegativeInt(tokensObj.output);
          const thoughts = clampNonNegativeInt(tokensObj.thoughts);
          const totalOutput = output + thoughts;
          events.push({
            id: `gemini-${ts}-${idx}`,
            timestamp: ts,
            agentId: sessionId,
            parentId: null,
            adapter: 'gemini-cli',
            agentName:
              typeof doc.agentName === 'string' && doc.agentName.trim()
                ? doc.agentName.trim().slice(0, 64)
                : sessionId,
            role: doc.parentId ? 'subagent' : 'root',
            task: 'Gemini CLI 会话日志导入',
            model,
            status: 'running',
            mode: 'delta',
            usage: normalizeUsage({
              input,
              cachedInput: cached,
              output: totalOutput,
              reasoningOutput: thoughts,
            }),
            note: 'Gemini CLI session tokens',
            source: 'jsonl',
          });
          detectedSet.add('gemini-cli');
          parsedLines += 1;
        });

        if (events.length > 0) {
          return {
            events,
            parsedLines,
            ignoredLines,
            detectedAdapters: Array.from(detectedSet),
            errors,
          };
        }
      }
    } catch {
      // Fall through to line-by-line JSONL parsing
    }
  }

  const lines = rawText.split(/\r?\n/);
  let currentAgentId = defaultAgentId;
  let currentParentId: string | null = null;
  let currentAgentName = 'imported-agent';
  let currentRole: AgentRole = 'root';
  let currentTask = '导入的 Agent 会话';
  let currentModel = 'gpt-5.3-codex';
  let currentAdapter: AgentAdapter = 'codex';
  let currentContextLimit: number | undefined;

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    let obj: Record<string, unknown>;
    try {
      const parsed = JSON.parse(rawLine);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        errors.push(`第 ${i + 1} 行不是有效的 JSON 对象`);
        continue;
      }
      obj = parsed as Record<string, unknown>;
    } catch {
      errors.push(`第 ${i + 1} 行 JSON 解析失败`);
      continue;
    }

    const ts =
      typeof obj.timestamp === 'string'
        ? Date.parse(obj.timestamp) || Date.now()
        : typeof obj.timestamp === 'number'
          ? obj.timestamp
          : Date.now() + i;

    // 1. OpenAI Codex CLI session_meta
    if (obj.type === 'session_meta' && obj.payload && typeof obj.payload === 'object') {
      currentAdapter = 'codex';
      detectedSet.add('codex');
      const p = obj.payload as Record<string, unknown>;
      if (typeof p.id === 'string' && p.id.trim()) {
        currentAgentId = p.id.trim().slice(0, 80);
      }
      const sourceObj =
        p.source && typeof p.source === 'object'
          ? (p.source as Record<string, unknown>)
          : null;
      const subagentInfo =
        sourceObj?.subagent && typeof sourceObj.subagent === 'object'
          ? (sourceObj.subagent as Record<string, unknown>)
          : null;
      const threadSpawn =
        subagentInfo?.thread_spawn && typeof subagentInfo.thread_spawn === 'object'
          ? (subagentInfo.thread_spawn as Record<string, unknown>)
          : null;

      const parentThread =
        (typeof threadSpawn?.parent_thread_id === 'string' && threadSpawn.parent_thread_id) ||
        (typeof p.parent_thread_id === 'string' && p.parent_thread_id) ||
        (typeof p.forked_from_id === 'string' && p.forked_from_id) ||
        null;

      if (parentThread || subagentInfo || p.agent_role === 'subagent') {
        currentRole = 'subagent';
        currentParentId = parentThread;
      } else {
        currentRole = 'root';
        currentParentId = null;
      }

      const nickname =
        (typeof p.agent_nickname === 'string' && p.agent_nickname) ||
        (typeof p.agent_name === 'string' && p.agent_name) ||
        (typeof threadSpawn?.agent_nickname === 'string' && threadSpawn.agent_nickname) ||
        (typeof p.name === 'string' && p.name);
      currentAgentName = (nickname || currentAgentId).slice(0, 64);

      if (typeof p.model === 'string' && p.model.trim()) {
        currentModel = p.model.trim().slice(0, 64);
      }
      if (typeof p.task === 'string' && p.task.trim()) {
        currentTask = p.task.trim().slice(0, 120);
      } else if (typeof p.cwd === 'string' && p.cwd.trim()) {
        currentTask = `工作目录: ${p.cwd.trim().slice(0, 100)}`;
      }
      parsedLines += 1;
      continue;
    }

    // 2. OpenAI Codex CLI turn_context
    if (obj.type === 'turn_context' && obj.payload && typeof obj.payload === 'object') {
      const p = obj.payload as Record<string, unknown>;
      if (typeof p.model === 'string' && p.model.trim()) {
        currentModel = p.model.trim().slice(0, 64);
      }
      if (typeof p.agent_id === 'string' && p.agent_id.trim()) {
        currentAgentId = p.agent_id.trim().slice(0, 80);
      }
      parsedLines += 1;
      continue;
    }

    // 3. OpenAI Codex CLI event_msg -> token_count
    if (obj.type === 'event_msg' && obj.payload && typeof obj.payload === 'object') {
      const p = obj.payload as Record<string, unknown>;
      if (p.type === 'token_count' && p.info && typeof p.info === 'object') {
        const info = p.info as Record<string, unknown>;
        const lastUsage =
          info.last_token_usage && typeof info.last_token_usage === 'object'
            ? (info.last_token_usage as Record<string, unknown>)
            : null;
        const totalUsage =
          info.total_token_usage && typeof info.total_token_usage === 'object'
            ? (info.total_token_usage as Record<string, unknown>)
            : null;
        const useCumulative = !lastUsage && Boolean(totalUsage);
        const rawUsage = lastUsage || totalUsage;

        if (rawUsage) {
          if (typeof info.model_context_window === 'number') {
            currentContextLimit = clampNonNegativeInt(info.model_context_window);
          }
          if (typeof info.model === 'string' && info.model.trim()) {
            currentModel = info.model.trim().slice(0, 64);
          }
          const usage = normalizeUsage({
            input: clampNonNegativeInt(rawUsage.input_tokens),
            cachedInput: clampNonNegativeInt(rawUsage.cached_input_tokens),
            output: clampNonNegativeInt(rawUsage.output_tokens),
            reasoningOutput: clampNonNegativeInt(rawUsage.reasoning_output_tokens),
            total: clampNonNegativeInt(rawUsage.total_tokens),
          });
          detectedSet.add(currentAdapter);
          events.push({
            id: `jsonl-${ts}-${i}`,
            timestamp: ts,
            agentId: currentAgentId,
            parentId: currentParentId,
            adapter: currentAdapter,
            agentName: currentAgentName,
            role: currentRole,
            task: currentTask,
            model: currentModel,
            status: 'running',
            mode: useCumulative ? 'cumulative' : 'delta',
            usage,
            contextLimit: currentContextLimit,
            note: 'Codex JSONL token_count',
            source: 'jsonl',
          });
          parsedLines += 1;
          continue;
        }
      }
      ignoredLines += 1;
      continue;
    }

    // 4. Claude Code JSONL (`type === 'assistant'` with `message.usage`)
    if (
      obj.type === 'assistant' &&
      obj.message &&
      typeof obj.message === 'object'
    ) {
      const msg = obj.message as Record<string, unknown>;
      const usageObj =
        msg.usage && typeof msg.usage === 'object'
          ? (msg.usage as Record<string, unknown>)
          : null;
      if (usageObj) {
        const isSub = Boolean(obj.isSidechain || obj.agentId);
        const sessionId =
          typeof obj.sessionId === 'string' && obj.sessionId.trim()
            ? obj.sessionId.trim().slice(0, 64)
            : 'claude-code-root';
        const agentId =
          typeof obj.agentId === 'string' && obj.agentId.trim()
            ? obj.agentId.trim().slice(0, 64)
            : isSub
              ? `${sessionId}-sub`
              : sessionId;
        const parentId = isSub ? sessionId : null;
        const agentName =
          (typeof obj.agentName === 'string' && obj.agentName.trim()) ||
          (typeof obj.slug === 'string' && obj.slug.trim()) ||
          agentId;
        const model =
          typeof msg.model === 'string' && msg.model.trim()
            ? msg.model.trim().slice(0, 64)
            : 'claude-sonnet-4.5';

        const baseInput = clampNonNegativeInt(usageObj.input_tokens);
        const cacheRead = clampNonNegativeInt(usageObj.cache_read_input_tokens);
        const cacheCreate = clampNonNegativeInt(
          usageObj.cache_creation_input_tokens,
        );
        const totalInput = baseInput + cacheRead + cacheCreate;
        const output = clampNonNegativeInt(usageObj.output_tokens);

        detectedSet.add('claude-code');
        events.push({
          id: `claude-${ts}-${i}`,
          timestamp: ts,
          agentId,
          parentId: parentId !== agentId ? parentId : null,
          adapter: 'claude-code',
          agentName: agentName.slice(0, 64),
          role: isSub ? 'subagent' : 'root',
          task:
            typeof obj.cwd === 'string' && obj.cwd.trim()
              ? `Claude Code · ${obj.cwd.trim().slice(0, 90)}`
              : 'Claude Code 代理任务',
          model,
          status: 'running',
          mode: 'delta',
          usage: normalizeUsage({
            input: totalInput,
            cachedInput: cacheRead,
            output,
            reasoningOutput: clampNonNegativeInt(usageObj.thinking_tokens),
          }),
          note: isSub ? 'Claude Code 子代理调用' : 'Claude Code 主会话调用',
          source: 'jsonl',
        });
        parsedLines += 1;
        continue;
      }
    }

    // 5. Simplified direct telemetry JSON line (Universal watcher / Cursor / Cline / OpenCode / curl)
    if (
      typeof obj.agentId === 'string' ||
      typeof obj.input_tokens === 'number' ||
      typeof obj.output_tokens === 'number'
    ) {
      const adapter = normalizeAdapter(obj.adapter, currentAdapter);
      const agentId =
        typeof obj.agentId === 'string' && obj.agentId.trim()
          ? obj.agentId.trim().slice(0, 80)
          : currentAgentId;
      const parentId =
        typeof obj.parentId === 'string' && obj.parentId.trim()
          ? obj.parentId.trim().slice(0, 80)
          : currentParentId;
      const role: AgentRole =
        obj.role === 'root' || obj.role === 'subagent'
          ? obj.role
          : parentId
            ? 'subagent'
            : 'root';
      const model =
        typeof obj.model === 'string' && obj.model.trim()
          ? obj.model.trim().slice(0, 64)
          : currentModel;
      const agentName =
        typeof obj.agentName === 'string' && obj.agentName.trim()
          ? obj.agentName.trim().slice(0, 64)
          : agentId;
      const status: AgentStatus =
        obj.status === 'running' ||
        obj.status === 'idle' ||
        obj.status === 'completed' ||
        obj.status === 'error'
          ? obj.status
          : 'running';

      const usage = normalizeUsage({
        input: clampNonNegativeInt(obj.input_tokens ?? obj.input),
        cachedInput: clampNonNegativeInt(obj.cached_input_tokens ?? obj.cachedInput),
        output: clampNonNegativeInt(obj.output_tokens ?? obj.output),
        reasoningOutput: clampNonNegativeInt(
          obj.reasoning_output_tokens ?? obj.reasoningOutput,
        ),
        total: clampNonNegativeInt(obj.total_tokens ?? obj.total),
      });

      detectedSet.add(adapter);
      events.push({
        id: `ingest-${ts}-${i}`,
        timestamp: ts,
        agentId,
        parentId,
        adapter,
        agentName,
        role,
        task:
          typeof obj.task === 'string' && obj.task.trim()
            ? obj.task.trim().slice(0, 120)
            : currentTask,
        model,
        status,
        mode: obj.mode === 'cumulative' ? 'cumulative' : 'delta',
        usage,
        latencyMs: clampNonNegativeInt(obj.latencyMs),
        note:
          typeof obj.note === 'string' && obj.note.trim()
            ? obj.note.trim().slice(0, 100)
            : '外部事件推送',
        source: 'jsonl',
      });
      parsedLines += 1;
      continue;
    }

    ignoredLines += 1;
  }

  return {
    events,
    parsedLines,
    ignoredLines,
    detectedAdapters: Array.from(detectedSet),
    errors,
  };
}

// Preserve backwards-compatible alias
export function parseCodexJsonl(
  jsonlText: string,
  defaultAgentId = 'codex-imported',
): ParseJsonlResult {
  return parseAgentLog(jsonlText, defaultAgentId);
}

export interface AgentHourlyRatePoint {
  timestamp: number;
  label: string;
  tokensPerMin: number;
  inputPerMin: number;
  outputPerMin: number;
  turnCount: number;
}

export interface AgentHourlyRateSummary {
  points: AgentHourlyRatePoint[];
  currentPerMin: number;
  peakPerMin: number;
  avgPerMin: number;
  totalLastHour: number;
  bucketMinutes: number;
}

function formatHourMinuteLabel(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function buildAgentHourlyRateSeries(
  agent: AgentRecord,
  now = Date.now(),
  bucketCount = 12,
): AgentHourlyRateSummary {
  const safeBuckets = Math.max(4, Math.min(60, Math.floor(bucketCount)));
  const windowMinutes = 60;
  const bucketMinutes = windowMinutes / safeBuckets;
  const bucketMs = bucketMinutes * 60_000;
  const windowStart = now - windowMinutes * 60_000;

  const accumulators = Array.from({ length: safeBuckets }, () => ({
    input: 0,
    output: 0,
    total: 0,
    turnCount: 0,
  }));

  let totalLastHour = 0;

  for (const turn of agent.turns) {
    if (turn.timestamp < windowStart || turn.timestamp > now + 60_000) {
      continue;
    }
    const rawIndex = Math.floor((turn.timestamp - windowStart) / bucketMs);
    const idx = Math.min(safeBuckets - 1, Math.max(0, rawIndex));
    const bucket = accumulators[idx];
    bucket.input += turn.delta.input;
    bucket.output += turn.delta.output;
    bucket.total += turn.delta.total;
    bucket.turnCount += 1;
    totalLastHour += turn.delta.total;
  }

  const points: AgentHourlyRatePoint[] = accumulators.map((b, i) => {
    const timestamp = windowStart + (i + 1) * bucketMs;
    return {
      timestamp,
      label: formatHourMinuteLabel(timestamp),
      tokensPerMin: Math.round(b.total / bucketMinutes),
      inputPerMin: Math.round(b.input / bucketMinutes),
      outputPerMin: Math.round(b.output / bucketMinutes),
      turnCount: b.turnCount,
    };
  });

  const currentPerMin = points[points.length - 1]?.tokensPerMin ?? 0;
  const peakPerMin = points.reduce((max, p) => Math.max(max, p.tokensPerMin), 0);
  const avgPerMin = Math.round(totalLastHour / windowMinutes);

  return {
    points,
    currentPerMin,
    peakPerMin,
    avgPerMin,
    totalLastHour,
    bucketMinutes,
  };
}

export interface SubagentBudgetAlert {
  agentId: string;
  agentName: string;
  adapter: AgentAdapter;
  model: string;
  usedTokens: number;
  budgetTokens: number;
  overageTokens: number;
  usagePct: number;
}

export interface BudgetEvaluationResult {
  enabled: boolean;
  budgetTokens: number;
  exceededIds: string[];
  alerts: SubagentBudgetAlert[];
}

export function evaluateSubagentBudgets(
  agents: AgentRecord[],
  budgetTokens: number,
  enabled = true,
): BudgetEvaluationResult {
  const safeBudget =
    Number.isFinite(budgetTokens) && budgetTokens > 0
      ? Math.floor(budgetTokens)
      : 0;

  if (!enabled || safeBudget <= 0) {
    return {
      enabled,
      budgetTokens: safeBudget,
      exceededIds: [],
      alerts: [],
    };
  }

  const alerts: SubagentBudgetAlert[] = [];
  for (const agent of agents) {
    if (agent.role !== 'subagent') continue;
    if (agent.tokens.total > safeBudget) {
      const overageTokens = agent.tokens.total - safeBudget;
      alerts.push({
        agentId: agent.id,
        agentName: agent.name,
        adapter: agent.adapter,
        model: agent.model,
        usedTokens: agent.tokens.total,
        budgetTokens: safeBudget,
        overageTokens,
        usagePct: Math.round((agent.tokens.total / safeBudget) * 100),
      });
    }
  }

  alerts.sort((a, b) => b.overageTokens - a.overageTokens);

  return {
    enabled: true,
    budgetTokens: safeBudget,
    exceededIds: alerts.map((a) => a.agentId),
    alerts,
  };
}

function buildPastHourSeedTurns(
  prefix: string,
  model: string,
  now: number,
  latestTurn: AgentTurn,
  schedule: Array<{
    minsAgo: number;
    input: number;
    cachedRatio: number;
    output: number;
    reasoningRatio: number;
    latencyMs: number;
    note: string;
  }>,
): AgentTurn[] {
  const historical: AgentTurn[] = schedule.map((item, idx) => {
    const cachedInput = Math.round(item.input * item.cachedRatio);
    const reasoningOutput = Math.round(item.output * item.reasoningRatio);
    return {
      id: `${prefix}-h-${idx + 1}`,
      timestamp: now - item.minsAgo * 60_000,
      model,
      delta: normalizeUsage({
        input: item.input,
        cachedInput,
        output: item.output,
        reasoningOutput,
      }),
      latencyMs: item.latencyMs,
      note: item.note,
    };
  });
  return [latestTurn, ...historical].sort((a, b) => b.timestamp - a.timestamp);
}

export function createInitialDemoSnapshot(now = Date.now()): TelemetrySnapshot {
  const sessionStartedAt = now - 1000 * 60 * 54;
  const seedAgents: AgentRecord[] = [
    {
      id: 'codex-root-01',
      parentId: null,
      adapter: 'codex',
      name: 'codex-orchestrator',
      role: 'root',
      task: '统筹重构认证中间件并分发子任务',
      model: 'gpt-5.3-codex',
      status: 'running',
      contextLimit: 400_000,
      contextUsed: 112_400,
      tokens: normalizeUsage({
        input: 184_200,
        cachedInput: 128_900,
        output: 19_840,
        reasoningOutput: 7_420,
      }),
      lastDelta: normalizeUsage({
        input: 4_820,
        cachedInput: 3_600,
        output: 612,
        reasoningOutput: 240,
      }),
      lastUpdatedAt: now - 1400,
      startedAt: sessionStartedAt,
      source: 'demo',
      turns: buildPastHourSeedTurns(
        'seed-root',
        'gpt-5.3-codex',
        now,
        {
          id: 'seed-root-3',
          timestamp: now - 1400,
          model: 'gpt-5.3-codex',
          delta: normalizeUsage({
            input: 4_820,
            cachedInput: 3_600,
            output: 612,
            reasoningOutput: 240,
          }),
          latencyMs: 1120,
          note: '汇总 sub-api-builder 与 sub-diff-reviewer 结果',
        },
        [
          { minsAgo: 4, input: 14_200, cachedRatio: 0.72, output: 1_840, reasoningRatio: 0.36, latencyMs: 1280, note: '校验子代理变更合并计划' },
          { minsAgo: 11, input: 19_600, cachedRatio: 0.7, output: 2_310, reasoningRatio: 0.38, latencyMs: 1460, note: '分派 JWT 刷新重构子任务' },
          { minsAgo: 18, input: 11_400, cachedRatio: 0.65, output: 1_260, reasoningRatio: 0.32, latencyMs: 980, note: '检索中间件调用链与路由表' },
          { minsAgo: 27, input: 24_800, cachedRatio: 0.74, output: 2_920, reasoningRatio: 0.4, latencyMs: 1620, note: '生成鉴权接口契约与回滚方案' },
          { minsAgo: 36, input: 16_900, cachedRatio: 0.68, output: 1_940, reasoningRatio: 0.35, latencyMs: 1190, note: '扫描仓库安全边界与测试基线' },
          { minsAgo: 46, input: 9_800, cachedRatio: 0.58, output: 1_180, reasoningRatio: 0.3, latencyMs: 910, note: '初始化主任务上下文与工具权限' },
        ],
      ),
    },
    {
      id: 'sub-api-builder',
      parentId: 'codex-root-01',
      adapter: 'codex',
      name: 'sub-api-builder',
      role: 'subagent',
      task: '重写 JWT 刷新与会话校验逻辑',
      model: 'gpt-5.3-codex',
      status: 'running',
      contextLimit: 400_000,
      contextUsed: 158_600,
      tokens: normalizeUsage({
        input: 242_800,
        cachedInput: 171_400,
        output: 31_450,
        reasoningOutput: 12_300,
      }),
      lastDelta: normalizeUsage({
        input: 8_420,
        cachedInput: 6_510,
        output: 1_280,
        reasoningOutput: 490,
      }),
      lastUpdatedAt: now - 900,
      startedAt: sessionStartedAt + 22_000,
      source: 'demo',
      turns: buildPastHourSeedTurns(
        'seed-api',
        'gpt-5.3-codex',
        now,
        {
          id: 'seed-api-2',
          timestamp: now - 900,
          model: 'gpt-5.3-codex',
          delta: normalizeUsage({
            input: 8_420,
            cachedInput: 6_510,
            output: 1_280,
            reasoningOutput: 490,
          }),
          latencyMs: 1640,
          note: 'apply_patch 修改 src/auth/session.ts',
        },
        [
          { minsAgo: 3, input: 18_400, cachedRatio: 0.74, output: 2_680, reasoningRatio: 0.39, latencyMs: 1540, note: '补充刷新令牌轮换并发锁' },
          { minsAgo: 9, input: 26_900, cachedRatio: 0.72, output: 3_520, reasoningRatio: 0.42, latencyMs: 1780, note: '重写 cookie 签名校验模块' },
          { minsAgo: 16, input: 31_200, cachedRatio: 0.71, output: 4_140, reasoningRatio: 0.4, latencyMs: 1920, note: '批量更新 API 鉴权错误处理' },
          { minsAgo: 23, input: 15_600, cachedRatio: 0.69, output: 2_120, reasoningRatio: 0.35, latencyMs: 1240, note: '执行认证单元测试并定位失败用例' },
          { minsAgo: 32, input: 22_400, cachedRatio: 0.67, output: 2_890, reasoningRatio: 0.38, latencyMs: 1490, note: '读取旧版会话存储与过期策略' },
          { minsAgo: 41, input: 12_800, cachedRatio: 0.62, output: 1_640, reasoningRatio: 0.32, latencyMs: 1080, note: '梳理 Express 中间件依赖图' },
          { minsAgo: 51, input: 8_200, cachedRatio: 0.55, output: 1_090, reasoningRatio: 0.28, latencyMs: 890, note: '加载子代理上下文与任务约束' },
        ],
      ),
    },
    {
      id: 'sub-diff-reviewer',
      parentId: 'sub-api-builder',
      adapter: 'codex',
      name: 'sub-diff-reviewer',
      role: 'subagent',
      task: '二级子代理：静态审查权限绕过与并发竞态',
      model: 'o4-mini',
      status: 'running',
      contextLimit: 200_000,
      contextUsed: 64_100,
      tokens: normalizeUsage({
        input: 74_900,
        cachedInput: 38_400,
        output: 22_640,
        reasoningOutput: 15_900,
      }),
      lastDelta: normalizeUsage({
        input: 3_180,
        cachedInput: 1_920,
        output: 1_140,
        reasoningOutput: 860,
      }),
      lastUpdatedAt: now - 2200,
      startedAt: sessionStartedAt + 74_000,
      source: 'demo',
      turns: buildPastHourSeedTurns(
        'seed-rev',
        'o4-mini',
        now,
        {
          id: 'seed-rev-1',
          timestamp: now - 2200,
          model: 'o4-mini',
          delta: normalizeUsage({
            input: 3_180,
            cachedInput: 1_920,
            output: 1_140,
            reasoningOutput: 860,
          }),
          latencyMs: 1890,
          note: '深度推理分析 token 轮换锁顺序',
        },
        [
          { minsAgo: 7, input: 11_200, cachedRatio: 0.56, output: 3_420, reasoningRatio: 0.72, latencyMs: 2140, note: '排查并发刷新下的重放攻击窗口' },
          { minsAgo: 17, input: 16_400, cachedRatio: 0.54, output: 4_850, reasoningRatio: 0.7, latencyMs: 2480, note: '静态推导 RBAC 鉴权边界条件' },
          { minsAgo: 29, input: 9_800, cachedRatio: 0.5, output: 2_910, reasoningRatio: 0.68, latencyMs: 1760, note: '审查会话失效清理与异常路径' },
          { minsAgo: 42, input: 7_400, cachedRatio: 0.45, output: 2_180, reasoningRatio: 0.65, latencyMs: 1520, note: '初始化二级审查代理上下文' },
        ],
      ),
    },
    {
      id: 'claude-root-01',
      parentId: null,
      adapter: 'claude-code',
      name: 'claude-refactor',
      role: 'root',
      task: '重构前端状态管理并拆分子任务给 Haiku',
      model: 'claude-sonnet-4.5',
      status: 'running',
      contextLimit: 200_000,
      contextUsed: 86_400,
      tokens: normalizeUsage({
        input: 148_500,
        cachedInput: 109_200,
        output: 14_620,
        reasoningOutput: 3_400,
      }),
      lastDelta: normalizeUsage({
        input: 5_120,
        cachedInput: 3_950,
        output: 740,
        reasoningOutput: 180,
      }),
      lastUpdatedAt: now - 1600,
      startedAt: sessionStartedAt + 30_000,
      source: 'demo',
      turns: buildPastHourSeedTurns(
        'seed-claude',
        'claude-sonnet-4.5',
        now,
        {
          id: 'seed-claude-1',
          timestamp: now - 1600,
          model: 'claude-sonnet-4.5',
          delta: normalizeUsage({
            input: 5_120,
            cachedInput: 3_950,
            output: 740,
            reasoningOutput: 180,
          }),
          latencyMs: 980,
          note: '调用 Task 子代理生成单元测试',
        },
        [
          { minsAgo: 6, input: 16_800, cachedRatio: 0.76, output: 1_920, reasoningRatio: 0.24, latencyMs: 1120, note: '整理前端状态切片并验证类型推导' },
          { minsAgo: 14, input: 22_400, cachedRatio: 0.74, output: 2_480, reasoningRatio: 0.22, latencyMs: 1340, note: '重构侧边抽屉与过滤联动逻辑' },
          { minsAgo: 24, input: 14_900, cachedRatio: 0.72, output: 1_650, reasoningRatio: 0.2, latencyMs: 1050, note: '拆分可复用数据计算模块' },
          { minsAgo: 38, input: 19_200, cachedRatio: 0.7, output: 2_040, reasoningRatio: 0.25, latencyMs: 1210, note: '分析组件重渲染热点与依赖树' },
        ],
      ),
    },
    {
      id: 'claude-sub-tests',
      parentId: 'claude-root-01',
      adapter: 'claude-code',
      name: 'sub-vitest-gen',
      role: 'subagent',
      task: 'Claude Task 子代理：批量补齐组件回归测试',
      model: 'claude-haiku-4.5',
      status: 'running',
      contextLimit: 200_000,
      contextUsed: 42_100,
      tokens: normalizeUsage({
        input: 89_400,
        cachedInput: 61_000,
        output: 11_280,
        reasoningOutput: 1_120,
      }),
      lastDelta: normalizeUsage({
        input: 2_890,
        cachedInput: 2_140,
        output: 520,
        reasoningOutput: 60,
      }),
      lastUpdatedAt: now - 2100,
      startedAt: sessionStartedAt + 50_000,
      source: 'demo',
      turns: buildPastHourSeedTurns(
        'seed-claude-sub',
        'claude-haiku-4.5',
        now,
        {
          id: 'seed-claude-sub-1',
          timestamp: now - 2100,
          model: 'claude-haiku-4.5',
          delta: normalizeUsage({
            input: 2_890,
            cachedInput: 2_140,
            output: 520,
            reasoningOutput: 60,
          }),
          latencyMs: 540,
          note: '批量生成 8 个边界断言用例',
        },
        [
          { minsAgo: 5, input: 12_400, cachedRatio: 0.7, output: 1_620, reasoningRatio: 0.1, latencyMs: 590, note: '补充筛选器与空态快照测试' },
          { minsAgo: 15, input: 18_200, cachedRatio: 0.68, output: 2_380, reasoningRatio: 0.12, latencyMs: 640, note: '批量生成表单校验回归用例' },
          { minsAgo: 28, input: 10_600, cachedRatio: 0.66, output: 1_410, reasoningRatio: 0.08, latencyMs: 510, note: '校验测试夹具与模拟事件流' },
        ],
      ),
    },
    {
      id: 'cursor-composer-01',
      parentId: null,
      adapter: 'cursor',
      name: 'cursor-composer',
      role: 'root',
      task: '跨文件补全类型声明与 CSS 布局调优',
      model: 'gpt-5.3-codex-mini',
      status: 'idle',
      contextLimit: 256_000,
      contextUsed: 54_800,
      tokens: normalizeUsage({
        input: 94_200,
        cachedInput: 66_400,
        output: 8_940,
        reasoningOutput: 1_820,
      }),
      lastDelta: normalizeUsage({
        input: 1_960,
        cachedInput: 1_420,
        output: 340,
        reasoningOutput: 70,
      }),
      lastUpdatedAt: now - 19_000,
      startedAt: sessionStartedAt + 64_000,
      source: 'demo',
      turns: [
        {
          id: 'seed-cursor-1',
          timestamp: now - 19_000,
          model: 'gpt-5.3-codex-mini',
          delta: normalizeUsage({
            input: 1_960,
            cachedInput: 1_420,
            output: 340,
            reasoningOutput: 70,
          }),
          latencyMs: 620,
          note: '等待用户确认 Apply 变更',
        },
      ],
    },
    {
      id: 'gemini-cli-01',
      parentId: null,
      adapter: 'gemini-cli',
      name: 'gemini-repo-audit',
      role: 'root',
      task: '全仓百万上下文依赖分析与性能报告',
      model: 'gemini-2.5-pro',
      status: 'completed',
      contextLimit: 1_000_000,
      contextUsed: 186_000,
      tokens: normalizeUsage({
        input: 196_400,
        cachedInput: 112_800,
        output: 12_400,
        reasoningOutput: 4_850,
      }),
      lastDelta: normalizeUsage({
        input: 4_200,
        cachedInput: 2_900,
        output: 690,
        reasoningOutput: 290,
      }),
      lastUpdatedAt: now - 42_000,
      startedAt: sessionStartedAt + 12_000,
      source: 'demo',
      turns: [
        {
          id: 'seed-gemini-1',
          timestamp: now - 42_000,
          model: 'gemini-2.5-pro',
          delta: normalizeUsage({
            input: 4_200,
            cachedInput: 2_900,
            output: 690,
            reasoningOutput: 290,
          }),
          latencyMs: 1320,
          note: '完成全仓模块耦合度汇总',
        },
      ],
    },
  ];

  const rateHistory: RatePoint[] = [];
  const samplePattern = [
    [6200, 4100, 980, 310],
    [9400, 6200, 1420, 480],
    [11800, 8100, 1890, 640],
    [7600, 5200, 1210, 390],
    [14200, 9800, 2340, 820],
    [16800, 11400, 2860, 1120],
    [10400, 7200, 1680, 580],
    [12900, 8900, 2110, 760],
    [15100, 10800, 2640, 940],
    [11200, 7900, 1840, 620],
    [18400, 13100, 3190, 1280],
    [13600, 9500, 2240, 810],
    [9800, 6800, 1590, 540],
    [16200, 11900, 2780, 1040],
    [14900, 10500, 2410, 890],
    [19200, 13800, 3420, 1350],
    [12400, 8800, 1980, 690],
    [15600, 11200, 2590, 960],
  ];

  for (let i = 0; i < samplePattern.length; i += 1) {
    const [inp, cached, out, reason] = samplePattern[i];
    const ts = now - (samplePattern.length - i) * 2000;
    rateHistory.push({
      timestamp: ts,
      label: formatTimeLabel(ts),
      inputDelta: inp,
      cachedDelta: cached,
      outputDelta: out,
      reasoningDelta: reason,
      totalDelta: inp + out,
      activeAgents: 5,
    });
  }

  const seedEvents: TelemetryEvent[] = [
    {
      id: 'evt-seed-1',
      timestamp: now - 900,
      agentId: 'sub-api-builder',
      parentId: 'codex-root-01',
      adapter: 'codex',
      agentName: 'sub-api-builder',
      role: 'subagent',
      model: 'gpt-5.3-codex',
      status: 'running',
      mode: 'delta',
      usage: seedAgents[1].lastDelta,
      latencyMs: 1640,
      note: 'apply_patch 修改 src/auth/session.ts',
      source: 'demo',
    },
    {
      id: 'evt-seed-2',
      timestamp: now - 1600,
      agentId: 'claude-root-01',
      parentId: null,
      adapter: 'claude-code',
      agentName: 'claude-refactor',
      role: 'root',
      model: 'claude-sonnet-4.5',
      status: 'running',
      mode: 'delta',
      usage: seedAgents[3].lastDelta,
      latencyMs: 980,
      note: '调用 Task 子代理生成单元测试',
      source: 'demo',
    },
    {
      id: 'evt-seed-3',
      timestamp: now - 2100,
      agentId: 'claude-sub-tests',
      parentId: 'claude-root-01',
      adapter: 'claude-code',
      agentName: 'sub-vitest-gen',
      role: 'subagent',
      model: 'claude-haiku-4.5',
      status: 'running',
      mode: 'delta',
      usage: seedAgents[4].lastDelta,
      latencyMs: 540,
      note: '批量生成 8 个边界断言用例',
      source: 'demo',
    },
    {
      id: 'evt-seed-4',
      timestamp: now - 2200,
      agentId: 'sub-diff-reviewer',
      parentId: 'sub-api-builder',
      adapter: 'codex',
      agentName: 'sub-diff-reviewer',
      role: 'subagent',
      model: 'o4-mini',
      status: 'running',
      mode: 'delta',
      usage: seedAgents[2].lastDelta,
      latencyMs: 1890,
      note: '深度推理分析 token 轮换锁顺序',
      source: 'demo',
    },
  ];

  return {
    sessionId: 'agent-hud-20261124-f8c1',
    sessionStartedAt,
    simulationRunning: true,
    agents: seedAgents,
    events: seedEvents,
    rateHistory,
  };
}
