import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BellOff,
  ChevronRight,
  GitBranch,
  Play,
  Plus,
  Search,
  Trash2,
  Zap,
} from 'lucide-react';
import {
  ADAPTER_CATALOG,
  aggregateByModel,
  buildAgentTree,
  calculateTokenCost,
  formatCompactTokens,
  formatExactTokens,
  formatUsd,
  getAdapterMeta,
  sumAllCost,
  sumAllTokens,
  type AgentAdapter,
  type AgentStatus,
  type BudgetEvaluationResult,
  type TelemetrySnapshot,
} from '../lib/telemetry';
import { TokenRateChart } from './TokenRateChart';

interface MonitorViewProps {
  snapshot: TelemetrySnapshot;
  modelFilter: string;
  onModelFilterChange: (model: string) => void;
  adapterFilter: 'all' | AgentAdapter;
  onAdapterFilterChange: (adapter: 'all' | AgentAdapter) => void;
  subagentBudgetTokens: number;
  budgetAlertEnabled: boolean;
  budgetEvaluation: BudgetEvaluationResult;
  onUpdateBudget: (next: { budgetTokens?: number; enabled?: boolean }) => void;
  onSelectAgent: (agentId: string) => void;
  onTriggerBurst: () => void;
  onSpawnSubagent: () => void;
  onClearSession: () => void;
  onLoadDemo: () => void;
  onNavigatePlugin: () => void;
  busyAction: string | null;
}

const BUDGET_PRESETS = [
  { label: '50k', value: 50_000 },
  { label: '100k', value: 100_000 },
  { label: '150k', value: 150_000 },
  { label: '300k', value: 300_000 },
];

const STATUS_META: Record<
  AgentStatus,
  { label: string; textClass: string }
> = {
  running: {
    label: '运行中',
    textClass: 'text-emerald-700 dark:text-emerald-400',
  },
  idle: {
    label: '等待调度',
    textClass: 'text-amber-700 dark:text-amber-400',
  },
  completed: {
    label: '已完成',
    textClass: 'text-slate-600 dark:text-slate-400',
  },
  error: {
    label: '异常',
    textClass: 'text-red-600 dark:text-red-400',
  },
};

const MODEL_BAR_COLORS = [
  'bg-blue-600 dark:bg-blue-500',
  'bg-emerald-600 dark:bg-emerald-500',
  'bg-amber-500 dark:bg-amber-400',
  'bg-slate-600 dark:bg-slate-400',
];

export function MonitorView({
  snapshot,
  modelFilter,
  onModelFilterChange,
  adapterFilter,
  onAdapterFilterChange,
  subagentBudgetTokens,
  budgetAlertEnabled,
  budgetEvaluation,
  onUpdateBudget,
  onSelectAgent,
  onTriggerBurst,
  onSpawnSubagent,
  onClearSession,
  onLoadDemo,
  onNavigatePlugin,
  busyAction,
}: MonitorViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | AgentStatus>('all');
  const [budgetDraft, setBudgetDraft] = useState(String(subagentBudgetTokens));
  const [budgetError, setBudgetError] = useState('');

  useEffect(() => {
    setBudgetDraft(String(subagentBudgetTokens));
    setBudgetError('');
  }, [subagentBudgetTokens]);

  const totals = useMemo(() => sumAllTokens(snapshot.agents), [snapshot.agents]);
  const totalCost = useMemo(() => sumAllCost(snapshot.agents), [snapshot.agents]);
  const modelSummaries = useMemo(
    () => aggregateByModel(snapshot.agents),
    [snapshot.agents],
  );
  const agentTree = useMemo(
    () => buildAgentTree(snapshot.agents),
    [snapshot.agents],
  );
  const exceededSet = useMemo(
    () => new Set(budgetEvaluation.exceededIds),
    [budgetEvaluation.exceededIds],
  );
  const alertMap = useMemo(
    () => new Map(budgetEvaluation.alerts.map((a) => [a.agentId, a])),
    [budgetEvaluation.alerts],
  );

  const subagentCount = snapshot.agents.filter((a) => a.role === 'subagent').length;
  const runningSubagentCount = snapshot.agents.filter(
    (a) => a.role === 'subagent' && a.status === 'running',
  ).length;

  const cacheHitPct =
    totals.input > 0
      ? ((totals.cachedInput / totals.input) * 100).toFixed(1)
      : '0.0';
  const reasoningSharePct =
    totals.output > 0
      ? ((totals.reasoningOutput / totals.output) * 100).toFixed(1)
      : '0.0';
  const latestRate = snapshot.rateHistory[snapshot.rateHistory.length - 1];

  const filteredTree = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return agentTree.filter(({ agent }) => {
      if (adapterFilter !== 'all' && agent.adapter !== adapterFilter) return false;
      if (modelFilter !== 'all' && agent.model !== modelFilter) return false;
      if (statusFilter !== 'all' && agent.status !== statusFilter) return false;
      if (
        q &&
        !agent.name.toLowerCase().includes(q) &&
        !agent.model.toLowerCase().includes(q) &&
        !agent.task.toLowerCase().includes(q) &&
        !getAdapterMeta(agent.adapter).name.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [agentTree, adapterFilter, modelFilter, statusFilter, searchQuery]);

  const subagentCards = useMemo(() => {
    return filteredTree
      .map((node) => node.agent)
      .filter((a) => a.role === 'subagent')
      .sort((a, b) => {
        const aOver = exceededSet.has(a.id) ? 1 : 0;
        const bOver = exceededSet.has(b.id) ? 1 : 0;
        if (bOver !== aOver) return bOver - aOver;
        return b.tokens.total - a.tokens.total;
      });
  }, [filteredTree, exceededSet]);

  function handleBudgetInputChange(raw: string) {
    setBudgetDraft(raw);
    const trimmed = raw.trim();
    if (!trimmed) {
      setBudgetError('请输入大于 0 的 Token 预算阈值');
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
      setBudgetError('预算阈值须为正整数 Token 数量');
      return;
    }
    setBudgetError('');
    onUpdateBudget({ budgetTokens: parsed });
  }

  if (snapshot.agents.length === 0) {
    return (
      <div className="flex min-h-[460px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-16 text-center dark:border-slate-800 dark:bg-slate-900">
        <GitBranch
          className="h-9 w-9 text-slate-400 dark:text-slate-500"
          aria-hidden="true"
        />
        <h1 className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          当前会话暂无 Agent Token 数据
        </h1>
        <p className="mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
          你可以启动本地 Codex 监听插件自动推送子 Agent 消耗，或者加载演示多代理会话立即体验实时变化。
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onLoadDemo}
            disabled={busyAction !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white whitespace-nowrap transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            加载演示会话
          </button>
          <button
            type="button"
            onClick={onNavigatePlugin}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 whitespace-nowrap transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            安装 Codex 插件 / 导入 JSONL
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 4-Column Flat KPI Strip */}
      <section
        aria-label="会话总览指标"
        className="grid grid-cols-1 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            总消耗 Token
          </div>
          <div
            data-testid="kpi-total-tokens"
            className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100"
          >
            {formatExactTokens(totals.total)}
          </div>
          <div className="mt-1 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
            最近窗口 {latestRate ? `+${formatExactTokens(latestRate.totalDelta)}` : '+0'}
          </div>
        </div>

        <div className="p-5 sm:border-l sm:border-slate-200 lg:border-l-0 dark:sm:border-slate-800">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            输入 Token (Input)
          </div>
          <div
            data-testid="kpi-input-tokens"
            className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-blue-700 dark:text-blue-400"
          >
            {formatExactTokens(totals.input)}
          </div>
          <div className="mt-1 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
            缓存命中 {cacheHitPct}% · {formatCompactTokens(totals.cachedInput)}
          </div>
        </div>

        <div className="p-5 sm:border-t sm:border-slate-200 lg:border-t-0 dark:sm:border-slate-800">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            输出 Token (Output)
          </div>
          <div
            data-testid="kpi-output-tokens"
            className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400"
          >
            {formatExactTokens(totals.output)}
          </div>
          <div className="mt-1 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
            推理占比 {reasoningSharePct}% · {formatCompactTokens(totals.reasoningOutput)}
          </div>
        </div>

        <div className="p-5 sm:border-t sm:border-l sm:border-slate-200 lg:border-t-0 lg:border-l-0 dark:sm:border-slate-800">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            子 Agent 活跃度与费用
          </div>
          <div className="mt-1.5 flex items-baseline gap-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            <span>
              {runningSubagentCount} / {subagentCount}
            </span>
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
              运行中子代理
            </span>
          </div>
          <div className="mt-1 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
            会话估算费用 {formatUsd(totalCost)} · {modelSummaries.length} 个模型
          </div>
        </div>
      </section>

      {/* Sub-Agent Budget Threshold Configuration & Active Visual Alert */}
      <section
        aria-label="子 Agent Token 预算阈值设置"
        className="space-y-3"
      >
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3.5 lg:flex-row lg:items-center lg:justify-between dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={budgetAlertEnabled}
              onClick={() => onUpdateBudget({ enabled: !budgetAlertEnabled })}
              data-testid="budget-alert-toggle"
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                budgetAlertEnabled
                  ? 'border-blue-600/30 bg-blue-50 text-blue-700 hover:bg-blue-100/70 dark:border-blue-500/40 dark:bg-blue-950/40 dark:text-blue-300'
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              {budgetAlertEnabled ? (
                <Bell className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <BellOff className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {budgetAlertEnabled ? '预算预警已开启' : '预算预警已暂停'}
            </button>

            <div className="text-xs">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                单子 Agent 预算上限
              </span>
              <span className="mx-1.5 text-slate-300 dark:text-slate-700" aria-hidden="true">
                ·
              </span>
              {budgetAlertEnabled ? (
                budgetEvaluation.alerts.length > 0 ? (
                  <span className="font-medium text-red-600 dark:text-red-400">
                    {budgetEvaluation.alerts.length} / {subagentCount} 个子代理已超预算
                  </span>
                ) : (
                  <span className="text-emerald-700 dark:text-emerald-400">
                    全部子代理均在预算内
                  </span>
                )
              ) : (
                <span className="text-slate-500 dark:text-slate-400">
                  开启后将实时高亮超额子代理
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <label
                htmlFor="subagent-budget-input"
                className="text-xs text-slate-500 whitespace-nowrap dark:text-slate-400"
              >
                阈值
              </label>
              <div className="relative">
                <input
                  id="subagent-budget-input"
                  data-testid="budget-threshold-input"
                  type="number"
                  min={1000}
                  step={10000}
                  value={budgetDraft}
                  onChange={(e) => handleBudgetInputChange(e.target.value)}
                  className="w-36 rounded-lg border border-slate-200 bg-white py-1.5 pr-12 pl-2.5 font-mono text-xs tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
                <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 font-mono text-[10px] text-slate-400">
                  tok
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
              {BUDGET_PRESETS.map((preset) => {
                const active = subagentBudgetTokens === preset.value;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => {
                      setBudgetError('');
                      onUpdateBudget({ budgetTokens: preset.value, enabled: true });
                    }}
                    className={`rounded-md px-2 py-1 font-mono text-[11px] font-medium whitespace-nowrap transition-colors ${
                      active
                        ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {budgetError && (
          <p role="alert" className="px-1 text-xs text-red-600 dark:text-red-400">
            {budgetError}
          </p>
        )}

        {budgetEvaluation.alerts.length > 0 && (
          <div
            role="alert"
            data-testid="budget-alert-banner"
            className="flex flex-col gap-2.5 rounded-xl border border-red-300 bg-red-50/90 px-4 py-3 text-xs text-red-950 sm:flex-row sm:items-center sm:justify-between dark:border-red-900/80 dark:bg-red-950/45 dark:text-red-100"
          >
            <div className="flex items-start gap-2.5 sm:items-center">
              <span className="relative mt-0.5 flex h-2.5 w-2.5 shrink-0 sm:mt-0" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600 dark:bg-red-500" />
              </span>
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-red-600 sm:mt-0 dark:text-red-400"
                aria-hidden="true"
              />
              <div>
                <span className="font-semibold">
                  预算超额预警：{budgetEvaluation.alerts.length} 个子 Agent 超出{' '}
                  {formatCompactTokens(subagentBudgetTokens)} Token 预算
                </span>
                <span className="ml-2 hidden text-red-800/85 md:inline dark:text-red-300/85">
                  点击右侧代理名可立即查看逐轮消耗与速率曲线
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {budgetEvaluation.alerts.map((alert) => (
                <button
                  key={alert.agentId}
                  type="button"
                  onClick={() => onSelectAgent(alert.agentId)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-2.5 py-1 font-mono text-[11px] font-medium text-red-800 whitespace-nowrap transition-colors hover:bg-red-100/70 dark:border-red-800 dark:bg-red-950/80 dark:text-red-200 dark:hover:bg-red-900/60"
                >
                  <span>{alert.agentName}</span>
                  <span className="text-red-600 dark:text-red-400">
                    +{formatCompactTokens(alert.overageTokens)} ({alert.usagePct}%)
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 2-Column Balanced Analytics Row */}
      <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <TokenRateChart
            points={snapshot.rateHistory}
            isStreaming={snapshot.simulationRunning}
          />
        </div>

        <section
          aria-label="模型消耗占比"
          className="flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 lg:col-span-4 dark:border-slate-800 dark:bg-slate-900"
        >
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                模型消耗占比
              </h2>
              {modelFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => onModelFilterChange('all')}
                  className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  清除模型筛选
                </button>
              )}
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              点击模型条目可筛选下方子代理列表
            </p>

            <div className="mt-4 space-y-3.5">
              {modelSummaries.map((item, idx) => {
                const isSelected = modelFilter === item.model;
                const barColor = MODEL_BAR_COLORS[idx % MODEL_BAR_COLORS.length];
                return (
                  <button
                    key={item.model}
                    type="button"
                    onClick={() =>
                      onModelFilterChange(isSelected ? 'all' : item.model)
                    }
                    className={`block w-full rounded-lg p-2 text-left transition-colors ${
                      isSelected
                        ? 'bg-blue-50/80 ring-1 ring-blue-600/30 dark:bg-blue-950/40 dark:ring-blue-400/40'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="truncate font-mono font-medium text-slate-900 dark:text-slate-100">
                        {item.model}
                      </span>
                      <span className="shrink-0 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {formatCompactTokens(item.tokens.total)} ({item.sharePct}%)
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                        style={{ width: `${Math.max(3, item.sharePct)}%` }}
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                      <span>
                        入 {formatCompactTokens(item.tokens.input)} / 出{' '}
                        {formatCompactTokens(item.tokens.output)}
                      </span>
                      <span>
                        {item.agentCount} 代理 · {formatUsd(item.costUsd)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {/* Sub-Agent Status Cards with Over-Budget Highlight */}
      {subagentCards.length > 0 && (
        <section aria-label="子 Agent 预算监控卡片" className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              子 Agent 实时监控卡片
            </h2>
            <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
              {budgetAlertEnabled
                ? `单代理预算 ${formatExactTokens(subagentBudgetTokens)} Token`
                : '预算预警未开启'}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {subagentCards.map((agent) => {
              const isOverBudget = exceededSet.has(agent.id);
              const alertInfo = alertMap.get(agent.id);
              const adapterMeta = getAdapterMeta(agent.adapter);
              const statusInfo = STATUS_META[agent.status];
              const cost = calculateTokenCost(agent.tokens, agent.model);
              const usagePct =
                subagentBudgetTokens > 0
                  ? Math.round((agent.tokens.total / subagentBudgetTokens) * 100)
                  : 0;
              const barPct = Math.min(100, Math.max(4, usagePct));

              return (
                <button
                  key={agent.id}
                  type="button"
                  data-testid={`subagent-card-${agent.id}`}
                  data-over-budget={isOverBudget ? 'true' : 'false'}
                  onClick={() => onSelectAgent(agent.id)}
                  className={`group flex flex-col justify-between rounded-xl border p-4 text-left transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                    isOverBudget
                      ? 'border-red-400 bg-red-50/75 ring-1 ring-red-500/35 hover:bg-red-50 dark:border-red-500/80 dark:bg-red-950/35 dark:ring-red-500/30 dark:hover:bg-red-950/50'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          {isOverBudget && (
                            <AlertTriangle
                              className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400"
                              aria-hidden="true"
                            />
                          )}
                          <span className="truncate font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                            {agent.name}
                          </span>
                          <span className={`shrink-0 text-[11px] font-medium ${adapterMeta.accentClass}`}>
                            {adapterMeta.shortName}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {agent.model} · {statusInfo.label}
                        </div>
                      </div>

                      {isOverBudget && alertInfo ? (
                        <span className="shrink-0 font-mono text-[11px] font-semibold tabular-nums text-red-700 dark:text-red-400">
                          超预算 +{formatCompactTokens(alertInfo.overageTokens)}
                        </span>
                      ) : (
                        <span className="shrink-0 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                          {formatUsd(cost)}
                        </span>
                      )}
                    </div>

                    <p className="mt-2 truncate text-xs text-slate-600 dark:text-slate-300">
                      {agent.task}
                    </p>
                  </div>

                  <div className="mt-3.5">
                    <div className="flex items-baseline justify-between gap-2 font-mono text-xs tabular-nums">
                      <span
                        className={`font-semibold ${
                          isOverBudget
                            ? 'text-red-700 dark:text-red-400'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {formatExactTokens(agent.tokens.total)} Token
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {budgetAlertEnabled && subagentBudgetTokens > 0
                          ? `${usagePct}% / ${formatCompactTokens(subagentBudgetTokens)}`
                          : `入 ${formatCompactTokens(agent.tokens.input)} / 出 ${formatCompactTokens(agent.tokens.output)}`}
                      </span>
                    </div>

                    {budgetAlertEnabled && subagentBudgetTokens > 0 && (
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            isOverBudget
                              ? 'bg-red-600 dark:bg-red-500'
                              : usagePct >= 80
                                ? 'bg-amber-500'
                                : 'bg-blue-600 dark:bg-blue-400'
                          }`}
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                    )}

                    <div className="mt-2 flex items-center justify-between font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                      <span>
                        入 {formatCompactTokens(agent.tokens.input)} · 出{' '}
                        {formatCompactTokens(agent.tokens.output)}
                      </span>
                      {agent.lastDelta.total > 0 && (
                        <span className="text-blue-600 dark:text-blue-400">
                          +{formatCompactTokens(agent.lastDelta.total)}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Sub-Agent Real-Time Token Table */}
      <section
        aria-label="子 Agent 实时 Token 消耗表"
        className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative w-full sm:w-56">
              <label htmlFor="agent-search" className="sr-only">
                搜索子 Agent 或模型
              </label>
              <Search
                className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                id="agent-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索子 Agent、任务或模型..."
                className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pr-3 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
              {(
                [
                  ['all', '全部'],
                  ['running', '运行中'],
                  ['idle', '等待中'],
                  ['completed', '已完成'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatusFilter(key)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                    statusFilter === key
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <label htmlFor="adapter-select-filter" className="sr-only">
              按 Agent 软件筛选
            </label>
            <select
              id="adapter-select-filter"
              value={adapterFilter}
              onChange={(e) =>
                onAdapterFilterChange(e.target.value as 'all' | AgentAdapter)
              }
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="all">全部工具</option>
              {Object.values(ADAPTER_CATALOG).map((meta) => (
                <option key={meta.id} value={meta.id}>
                  {meta.shortName}
                </option>
              ))}
            </select>

            <label htmlFor="model-select-filter" className="sr-only">
              按模型筛选
            </label>
            <select
              id="model-select-filter"
              value={modelFilter}
              onChange={(e) => onModelFilterChange(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-700 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="all">全部模型 ({modelSummaries.length})</option>
              {modelSummaries.map((m) => (
                <option key={m.model} value={m.model}>
                  {m.model}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onTriggerBurst}
              disabled={busyAction !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 whitespace-nowrap transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Zap className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              模拟一轮调用
            </button>
            <button
              type="button"
              onClick={onSpawnSubagent}
              disabled={busyAction !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 whitespace-nowrap transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Plus className="h-3.5 w-3.5" />
              派生子 Agent
            </button>
            <button
              type="button"
              onClick={onClearSession}
              disabled={busyAction !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 whitespace-nowrap transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-red-900/60 dark:hover:bg-red-950/30 dark:hover:text-red-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
              清空会话
            </button>
          </div>
        </div>

        <div className="w-full max-w-full overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                <th className="px-4 py-3">Agent 层级与任务</th>
                <th className="px-4 py-3">来源工具</th>
                <th className="px-4 py-3">使用模型</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3 text-right">输入 (含缓存)</th>
                <th className="px-4 py-3 text-right">输出 (含推理)</th>
                <th className="px-4 py-3 text-right">总计 Token</th>
                <th className="px-4 py-3 text-right">最近增量</th>
                <th className="px-4 py-3 text-right">预估费用</th>
                <th className="w-10 px-2 py-3 text-right">
                  <span className="sr-only">详情</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredTree.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
                  >
                    没有符合当前筛选条件的 Agent，请尝试清除搜索或切换模型筛选。
                  </td>
                </tr>
              ) : (
                filteredTree.map(({ agent, depth }) => {
                  const statusInfo = STATUS_META[agent.status];
                  const adapterMeta = getAdapterMeta(agent.adapter);
                  const sharePct =
                    totals.total > 0
                      ? Number(((agent.tokens.total / totals.total) * 100).toFixed(1))
                      : 0;
                  const cost = calculateTokenCost(agent.tokens, agent.model);
                  const isOverBudget = exceededSet.has(agent.id);
                  const alertInfo = alertMap.get(agent.id);
                  return (
                    <tr
                      key={agent.id}
                      data-testid={`agent-row-${agent.id}`}
                      data-over-budget={isOverBudget ? 'true' : 'false'}
                      className={`group transition-colors ${
                        isOverBudget
                          ? 'bg-red-50/70 hover:bg-red-50 dark:bg-red-950/30 dark:hover:bg-red-950/45'
                          : 'hover:bg-slate-50/90 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div
                          className="flex items-start gap-2"
                          style={{ paddingLeft: `${depth * 18}px` }}
                        >
                          {depth > 0 && (
                            <span
                              className="mt-0.5 font-mono text-xs text-slate-400 select-none dark:text-slate-600"
                              aria-hidden="true"
                            >
                              └
                            </span>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              {isOverBudget && (
                                <AlertTriangle
                                  className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400"
                                  aria-hidden="true"
                                />
                              )}
                              <button
                                type="button"
                                onClick={() => onSelectAgent(agent.id)}
                                className="truncate font-mono text-xs font-semibold text-slate-900 hover:text-blue-600 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:text-slate-100 dark:hover:text-blue-400"
                              >
                                {agent.name}
                              </button>
                              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                {agent.role === 'root' ? '主代理' : '子代理'}
                              </span>
                              {isOverBudget && alertInfo && (
                                <span className="font-mono text-[11px] font-semibold text-red-600 whitespace-nowrap dark:text-red-400">
                                  超预算 +{formatCompactTokens(alertInfo.overageTokens)}
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 max-w-[240px] truncate text-xs text-slate-500 dark:text-slate-400">
                              {agent.task}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`text-xs font-medium ${adapterMeta.accentClass}`}>
                          {adapterMeta.shortName}
                        </span>
                      </td>

                      <td className="px-4 py-3 font-mono text-xs text-slate-700 whitespace-nowrap dark:text-slate-300">
                        {agent.model}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`text-xs font-medium ${statusInfo.textClass}`}>
                          {statusInfo.label}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {formatExactTokens(agent.tokens.input)}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          缓存 {formatCompactTokens(agent.tokens.cachedInput)}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {formatExactTokens(agent.tokens.output)}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          推理 {formatCompactTokens(agent.tokens.reasoningOutput)}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                        <div
                          className={`font-semibold ${
                            isOverBudget
                              ? 'text-red-700 dark:text-red-400'
                              : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {formatExactTokens(agent.tokens.total)}
                        </div>
                        <div className="mt-1 flex items-center justify-end gap-1.5">
                          <div className="h-1 w-14 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div
                              className={`h-full rounded-full ${
                                isOverBudget
                                  ? 'bg-red-600 dark:bg-red-500'
                                  : 'bg-blue-600 dark:bg-blue-400'
                              }`}
                              style={{ width: `${Math.max(4, sharePct)}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            {sharePct}%
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                        {agent.lastDelta.total > 0 ? (
                          <div key={agent.lastUpdatedAt} className="animate-delta">
                            <span className="text-blue-700 dark:text-blue-400">
                              +{formatCompactTokens(agent.lastDelta.input)}
                            </span>
                            <span className="text-slate-400"> / </span>
                            <span className="text-emerald-700 dark:text-emerald-400">
                              +{formatCompactTokens(agent.lastDelta.output)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right font-mono text-xs tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-300">
                        {formatUsd(cost)}
                      </td>

                      <td className="px-2 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => onSelectAgent(agent.id)}
                          aria-label={`查看 ${agent.name} 详情`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-800 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
