import { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import {
  calculateTokenCost,
  formatCompactTokens,
  formatExactTokens,
  formatTimeLabel,
  formatUsd,
  getAdapterMeta,
  getModelPricing,
  type AgentRecord,
} from '../lib/telemetry';
import { AgentHourlyRateChart } from './AgentHourlyRateChart';

interface AgentDetailDrawerProps {
  agent: AgentRecord | null;
  parentAgentName: string | null;
  subagentBudgetTokens?: number;
  budgetAlertEnabled?: boolean;
  onClose: () => void;
}

const STATUS_LABELS: Record<AgentRecord['status'], string> = {
  running: '运行中',
  idle: '等待调度',
  completed: '已完成',
  error: '异常中断',
};

const SOURCE_LABELS: Record<AgentRecord['source'], string> = {
  live: '实时插件推送',
  jsonl: '日志导入',
  demo: '模拟会话流',
};

export function AgentDetailDrawer({
  agent,
  parentAgentName,
  subagentBudgetTokens = 0,
  budgetAlertEnabled = false,
  onClose,
}: AgentDetailDrawerProps) {
  useEffect(() => {
    if (!agent) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [agent, onClose]);

  if (!agent) return null;

  const adapterMeta = getAdapterMeta(agent.adapter);
  const pricing = getModelPricing(agent.model);
  const cost = calculateTokenCost(agent.tokens, agent.model);
  const uncachedInput = Math.max(0, agent.tokens.input - agent.tokens.cachedInput);
  const visibleOutput = Math.max(0, agent.tokens.output - agent.tokens.reasoningOutput);
  const cacheRate =
    agent.tokens.input > 0
      ? ((agent.tokens.cachedInput / agent.tokens.input) * 100).toFixed(1)
      : '0.0';
  const contextPct =
    agent.contextLimit > 0
      ? Math.min(100, Number(((agent.contextUsed / agent.contextLimit) * 100).toFixed(1)))
      : 0;
  const ioRatio =
    agent.tokens.output > 0
      ? (agent.tokens.input / agent.tokens.output).toFixed(1)
      : '—';
  const isOverBudget =
    budgetAlertEnabled &&
    subagentBudgetTokens > 0 &&
    agent.role === 'subagent' &&
    agent.tokens.total > subagentBudgetTokens;
  const overageTokens = isOverBudget ? agent.tokens.total - subagentBudgetTokens : 0;
  const budgetPct =
    isOverBudget && subagentBudgetTokens > 0
      ? Math.round((agent.tokens.total / subagentBudgetTokens) * 100)
      : 0;

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-slate-950/35 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Agent 详情: ${agent.name}`}
        className="flex h-full w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5 dark:border-slate-800">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className={`font-medium ${adapterMeta.accentClass}`}>
                {adapterMeta.name}
              </span>
              <span aria-hidden="true">·</span>
              <span>{agent.role === 'root' ? '主代理' : '子代理'}</span>
              <span aria-hidden="true">·</span>
              <span>{STATUS_LABELS[agent.status]}</span>
              <span aria-hidden="true">·</span>
              <span>{SOURCE_LABELS[agent.source]}</span>
            </div>
            <h2 className="mt-1 truncate font-mono text-lg font-semibold text-slate-900 dark:text-slate-100">
              {agent.name}
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {agent.task}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭详情面板"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {isOverBudget && (
            <div
              role="alert"
              data-testid="drawer-budget-alert"
              className="flex items-start gap-2.5 rounded-lg border border-red-300 bg-red-50/90 px-3.5 py-2.5 text-xs text-red-900 dark:border-red-900/80 dark:bg-red-950/50 dark:text-red-200"
            >
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div className="font-semibold">
                  已超出子 Agent Token 预算（{budgetPct}%）
                </div>
                <div className="mt-0.5 font-mono text-[11px] tabular-nums text-red-800/90 dark:text-red-300/90">
                  当前消耗 {formatExactTokens(agent.tokens.total)} · 预算上限{' '}
                  {formatExactTokens(subagentBudgetTokens)} · 超额 +
                  {formatExactTokens(overageTokens)}
                </div>
              </div>
            </div>
          )}

          {/* Model & Parent Metadata */}
          <dl className="grid grid-cols-2 gap-4 border-b border-slate-200 pb-5 text-sm dark:border-slate-800">
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">当前模型</dt>
              <dd className="mt-1 font-mono font-medium text-slate-900 dark:text-slate-100">
                {agent.model}
              </dd>
              <dd className="text-xs text-slate-500 dark:text-slate-400">
                {pricing.tier}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">上级代理 / 费用</dt>
              <dd className="mt-1 font-mono text-slate-900 dark:text-slate-100">
                {parentAgentName || '无（根会话）'}
              </dd>
              <dd className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                累计预估 {formatUsd(cost)} · 输/出比 {ioRatio}:1
              </dd>
            </div>
          </dl>

          {/* Context Window Usage */}
          <div>
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                上下文窗口占用
              </span>
              <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                {formatCompactTokens(agent.contextUsed)} / {formatCompactTokens(agent.contextLimit)} ({contextPct}%)
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  contextPct >= 80
                    ? 'bg-red-600 dark:bg-red-500'
                    : contextPct >= 55
                      ? 'bg-amber-500'
                      : 'bg-blue-600 dark:bg-blue-500'
                }`}
                style={{ width: `${Math.max(2, contextPct)}%` }}
              />
            </div>
          </div>

          {/* Past-Hour Token Rate Line Chart (Recharts) */}
          <AgentHourlyRateChart agent={agent} />

          {/* 4-Way Token Breakdown */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Token 构成明细
            </h3>
            <div className="mt-3 grid grid-cols-2 divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800 sm:divide-y-0 sm:divide-x">
              <div className="p-3.5">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  输入总计（缓存命中 {cacheRate}%）
                </div>
                <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {formatExactTokens(agent.tokens.input)}
                </div>
                <div className="mt-1.5 space-y-0.5 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                  <div>新输入: {formatExactTokens(uncachedInput)}</div>
                  <div>缓存命中: {formatExactTokens(agent.tokens.cachedInput)}</div>
                </div>
              </div>
              <div className="p-3.5">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  输出总计（含推理链路）
                </div>
                <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {formatExactTokens(agent.tokens.output)}
                </div>
                <div className="mt-1.5 space-y-0.5 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                  <div>常规输出: {formatExactTokens(visibleOutput)}</div>
                  <div>推理 Token: {formatExactTokens(agent.tokens.reasoningOutput)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Turn History */}
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                逐轮调用增量记录
              </h3>
              <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                共 {agent.turns.length} 轮
              </span>
            </div>

            {agent.turns.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                尚无逐轮调用记录。
              </p>
            ) : (
              <div className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {agent.turns.map((turn) => (
                  <div
                    key={turn.id}
                    className="flex flex-col gap-1.5 px-3.5 py-3 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {turn.note}
                      </span>
                      <span className="shrink-0 font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {formatTimeLabel(turn.timestamp)} · {turn.latencyMs}ms
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      <span>{turn.model}</span>
                      <span>
                        <span className="text-blue-700 dark:text-blue-400">
                          +{formatExactTokens(turn.delta.input)} in
                        </span>
                        {' / '}
                        <span className="text-emerald-700 dark:text-emerald-400">
                          +{formatExactTokens(turn.delta.output)} out
                        </span>
                        {turn.delta.reasoningOutput > 0 && (
                          <span className="text-amber-700 dark:text-amber-400">
                            {' '}
                            (推理 {formatExactTokens(turn.delta.reasoningOutput)})
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
