import { useMemo, useState, type PointerEvent } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Maximize2,
  Minimize2,
  Pause,
  PictureInPicture2,
  Play,
  Plus,
  Zap,
} from 'lucide-react';
import {
  ADAPTER_CATALOG,
  buildAgentTree,
  calculateTokenCost,
  formatCompactTokens,
  formatExactTokens,
  formatUsd,
  getAdapterMeta,
  sumAllCost,
  sumAllTokens,
  type AgentAdapter,
  type TelemetrySnapshot,
} from '../lib/telemetry';

export type WidgetSizeMode = 'hud' | 'mini' | 'taskbar' | 'desktop-widget';

interface DesktopHudWidgetProps {
  snapshot: TelemetrySnapshot;
  connectionState: 'connecting' | 'connected' | 'reconnecting';
  adapterFilter: 'all' | AgentAdapter;
  onAdapterFilterChange: (adapter: 'all' | AgentAdapter) => void;
  sizeMode: WidgetSizeMode;
  onSizeModeChange: (mode: WidgetSizeMode) => void;
  opacityPct?: number;
  isPoppedOut?: boolean;
  standalone?: boolean;
  exceededAgentIds?: string[];
  onPopOut?: () => void;
  onToggleStream: () => void;
  onTriggerBurst: () => void;
  onSpawnSubagent: () => void;
  onOpenFullConsole?: () => void;
  onDragPointerDown?: (e: PointerEvent<HTMLDivElement>) => void;
}

const STATUS_DOT_LABEL: Record<string, { text: string; cls: string }> = {
  running: { text: '运行', cls: 'text-emerald-600 dark:text-emerald-400' },
  idle: { text: '待命', cls: 'text-amber-600 dark:text-amber-400' },
  completed: { text: '完成', cls: 'text-slate-500 dark:text-slate-400' },
  error: { text: '异常', cls: 'text-red-600 dark:text-red-400' },
};

export function DesktopHudWidget({
  snapshot,
  connectionState,
  adapterFilter,
  onAdapterFilterChange,
  sizeMode,
  onSizeModeChange,
  opacityPct = 100,
  isPoppedOut = false,
  standalone = false,
  exceededAgentIds = [],
  onPopOut,
  onToggleStream,
  onTriggerBurst,
  onSpawnSubagent,
  onOpenFullConsole,
  onDragPointerDown,
}: DesktopHudWidgetProps) {
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);
  const exceededSet = useMemo(() => new Set(exceededAgentIds), [exceededAgentIds]);

  const availableAdapters = useMemo(() => {
    const present = new Set<AgentAdapter>();
    for (const a of snapshot.agents) present.add(a.adapter);
    const ordered: AgentAdapter[] = [
      'codex',
      'claude-code',
      'cursor',
      'gemini-cli',
      'cline',
      'opencode',
      'custom',
    ];
    return ordered.filter((id) => present.has(id));
  }, [snapshot.agents]);

  const filteredAgents = useMemo(() => {
    if (adapterFilter === 'all') return snapshot.agents;
    return snapshot.agents.filter((a) => a.adapter === adapterFilter);
  }, [snapshot.agents, adapterFilter]);

  const tree = useMemo(() => buildAgentTree(filteredAgents), [filteredAgents]);
  const totals = useMemo(() => sumAllTokens(filteredAgents), [filteredAgents]);
  const totalCost = useMemo(() => sumAllCost(filteredAgents), [filteredAgents]);

  const runningCount = filteredAgents.filter((a) => a.status === 'running').length;
  const cachePct =
    totals.input > 0 ? Math.round((totals.cachedInput / totals.input) * 100) : 0;
  const reasonPct =
    totals.output > 0
      ? Math.round((totals.reasoningOutput / totals.output) * 100)
      : 0;
  const inputSharePct =
    totals.total > 0 ? Math.round((totals.input / totals.total) * 100) : 50;

  const sparkBars = useMemo(() => {
    const slice = snapshot.rateHistory.slice(-16);
    const maxVal = Math.max(1000, ...slice.map((p) => p.totalDelta));
    return slice.map((p) => ({
      ts: p.timestamp,
      pct: Math.max(12, Math.round((p.totalDelta / maxVal) * 100)),
      total: p.totalDelta,
    }));
  }, [snapshot.rateHistory]);

  const topActiveAgents = useMemo(() => {
    return [...filteredAgents]
      .sort((a, b) => {
        const aRun = a.status === 'running' ? 1 : 0;
        const bRun = b.status === 'running' ? 1 : 0;
        if (bRun !== aRun) return bRun - aRun;
        return b.tokens.total - a.tokens.total;
      })
      .slice(0, 3);
  }, [filteredAgents]);

  const latestRate = snapshot.rateHistory[snapshot.rateHistory.length - 1];
  const primaryModel = topActiveAgents[0]?.model || filteredAgents[0]?.model || '—';

  const containerStyle =
    opacityPct < 100 ? { opacity: Math.max(0.68, opacityPct / 100) } : undefined;

  // Ultra-compact OS Taskbar / Menu Bar Embedded Strip mode (/?mode=taskbar)
  if (sizeMode === 'taskbar') {
    return (
      <section
        aria-label="系统任务栏嵌入条"
        data-testid="desktop-hud-taskbar"
        style={containerStyle}
        className={`flex items-center justify-between gap-2 select-none border border-slate-700/80 bg-slate-900/95 px-3 text-slate-100 backdrop-blur-md ${
          standalone
            ? 'h-screen w-full rounded-none border-0'
            : 'h-[40px] w-[396px] max-w-full rounded-lg shadow-md'
        }`}
      >
        <div
          onPointerDown={onDragPointerDown}
          className={`flex min-w-0 items-center gap-2 ${
            onDragPointerDown ? 'cursor-grab active:cursor-grabbing' : ''
          }`}
        >
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              connectionState === 'connected' && snapshot.simulationRunning
                ? 'bg-emerald-400'
                : 'bg-amber-400'
            }`}
            aria-hidden="true"
          />
          <span
            data-testid="hud-taskbar-total"
            className="font-mono text-xs font-bold tabular-nums text-white whitespace-nowrap"
          >
            {formatCompactTokens(totals.total)}
          </span>
          {latestRate && (
            <span className="font-mono text-[11px] font-medium tabular-nums text-blue-400 whitespace-nowrap">
              +{formatCompactTokens(latestRate.totalDelta)}
            </span>
          )}
          <span className="text-slate-600" aria-hidden="true">
            |
          </span>
          <span className="truncate font-mono text-[11px] tabular-nums text-slate-300">
            ↑{formatCompactTokens(totals.input)} ↓{formatCompactTokens(totals.output)}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden font-mono text-[11px] tabular-nums text-slate-400 sm:inline whitespace-nowrap">
            {formatUsd(totalCost)}
          </span>
          <div className="flex h-4 items-end gap-[2px]" aria-hidden="true">
            {sparkBars.slice(-6).map((bar, idx) => (
              <span
                key={`${bar.ts}-${idx}`}
                className={`w-[2.5px] rounded-xs ${
                  idx === Math.min(5, sparkBars.length - 1)
                    ? 'bg-emerald-400'
                    : 'bg-blue-400/80'
                }`}
                style={{ height: `${bar.pct}%` }}
              />
            ))}
          </div>
          {!standalone && (
            <button
              type="button"
              onClick={() => onSizeModeChange('hud')}
              aria-label="展开标准监控小窗"
              title="展开标准监控小窗"
              className="flex h-6 w-6 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <Maximize2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </section>
    );
  }

  // Wallpaper-style OS Desktop Widget Tile mode (/?mode=desktop-widget)
  if (sizeMode === 'desktop-widget') {
    return (
      <section
        aria-label="系统桌面小组件"
        data-testid="desktop-hud-desktop-widget"
        style={containerStyle}
        className={`flex flex-col justify-between overflow-hidden select-none border border-slate-200/90 bg-white/92 backdrop-blur-md dark:border-slate-700/90 dark:bg-slate-900/92 ${
          standalone
            ? 'h-screen w-full rounded-none border-0 shadow-none'
            : 'w-[340px] max-w-full rounded-2xl shadow-lg'
        }`}
      >
        <div
          onPointerDown={onDragPointerDown}
          className={`flex items-center justify-between gap-2 border-b border-slate-200/80 px-3.5 py-2 dark:border-slate-800 ${
            onDragPointerDown ? 'cursor-grab active:cursor-grabbing' : ''
          }`}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                connectionState === 'connected' && snapshot.simulationRunning
                  ? 'bg-emerald-500'
                  : 'bg-amber-500'
              }`}
              aria-hidden="true"
            />
            <span className="text-xs font-bold tracking-tight text-slate-900 whitespace-nowrap dark:text-slate-100">
              CodexScope
            </span>
            <span className="truncate font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              {runningCount}/{filteredAgents.length} 运行 · {primaryModel}
            </span>
          </div>

          <div
            className="flex shrink-0 items-center gap-1"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onToggleStream}
              aria-label={snapshot.simulationRunning ? '暂停小组件实时流' : '恢复小组件实时流'}
              className="flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              {snapshot.simulationRunning ? (
                <Pause className="h-3 w-3" />
              ) : (
                <Play className="h-3 w-3" />
              )}
            </button>
            {!standalone && (
              <button
                type="button"
                onClick={() => onSizeModeChange('hud')}
                aria-label="切换标准小窗"
                className="flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <Maximize2 className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        <div className="px-3.5 py-2.5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                实时总消耗 Token · {formatUsd(totalCost)}
              </div>
              <div className="mt-0.5 flex items-baseline gap-2">
                <span
                  data-testid="hud-desktop-widget-total"
                  className="font-mono text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-white"
                >
                  {formatCompactTokens(totals.total)}
                </span>
                {latestRate && (
                  <span
                    key={latestRate.timestamp}
                    className="animate-delta font-mono text-xs font-medium tabular-nums text-blue-600 dark:text-blue-400"
                  >
                    +{formatCompactTokens(latestRate.totalDelta)}
                  </span>
                )}
              </div>
            </div>

            <div className="flex h-7 items-end gap-[2px]" aria-hidden="true">
              {sparkBars.slice(-12).map((bar, idx) => (
                <span
                  key={`${bar.ts}-${idx}`}
                  className={`w-[3.5px] rounded-xs transition-all duration-200 ${
                    idx === Math.min(11, sparkBars.length - 1)
                      ? 'bg-emerald-500 dark:bg-emerald-400'
                      : 'bg-blue-600/70 dark:bg-blue-400/75'
                  }`}
                  style={{ height: `${bar.pct}%` }}
                />
              ))}
            </div>
          </div>

          <div className="mt-2">
            <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className="h-full bg-blue-600 dark:bg-blue-400"
                style={{ width: `${Math.max(4, Math.min(96, inputSharePct))}%` }}
              />
              <div className="h-full flex-1 bg-emerald-500 dark:bg-emerald-400" />
            </div>
            <div className="mt-1 flex items-center justify-between font-mono text-[11px] tabular-nums">
              <span className="text-blue-700 dark:text-blue-400">
                输入 {formatCompactTokens(totals.input)} (缓存 {cachePct}%)
              </span>
              <span className="text-emerald-700 dark:text-emerald-400">
                输出 {formatCompactTokens(totals.output)} (推理 {reasonPct}%)
              </span>
            </div>
          </div>
        </div>

        <div className="divide-y divide-slate-100 border-t border-slate-200/80 dark:divide-slate-800/80 dark:border-slate-800">
          {topActiveAgents.map((agent) => {
            const adapterMeta = getAdapterMeta(agent.adapter);
            return (
              <div
                key={agent.id}
                className="flex items-center justify-between gap-2 px-3.5 py-1.5 text-[11px]"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {agent.name}
                    </span>
                    <span className={`shrink-0 text-[10px] font-medium ${adapterMeta.accentClass}`}>
                      {adapterMeta.shortName}
                    </span>
                  </div>
                  <div className="truncate font-mono text-[10px] text-slate-500 dark:text-slate-400">
                    {agent.model}
                  </div>
                </div>

                <div className="shrink-0 text-right font-mono tabular-nums">
                  <div className="font-semibold text-slate-900 dark:text-slate-100">
                    {formatCompactTokens(agent.tokens.total)}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    入 {formatCompactTokens(agent.tokens.input)} / 出{' '}
                    {formatCompactTokens(agent.tokens.output)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  // Compact Desktop-Pet Mini Bar mode
  if (sizeMode === 'mini') {
    return (
      <section
        aria-label="迷你悬浮条"
        data-testid="desktop-hud-mini"
        style={containerStyle}
        className={`select-none rounded-2xl border border-slate-200/90 bg-white/95 shadow-lg backdrop-blur-md dark:border-slate-700/90 dark:bg-slate-900/95 ${
          standalone ? 'w-full' : 'w-[356px] max-w-full'
        }`}
      >
        <div
          onPointerDown={onDragPointerDown}
          className={`flex items-center justify-between gap-3 px-3.5 py-2.5 ${
            onDragPointerDown ? 'cursor-grab active:cursor-grabbing' : ''
          }`}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                connectionState === 'connected' && snapshot.simulationRunning
                  ? 'bg-emerald-500'
                  : 'bg-amber-500'
              }`}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <div className="flex items-baseline gap-2 font-mono tabular-nums">
                <span
                  data-testid="hud-mini-total"
                  className="text-sm font-bold text-slate-900 dark:text-white"
                >
                  {formatCompactTokens(totals.total)}
                </span>
                {latestRate && (
                  <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
                    +{formatCompactTokens(latestRate.totalDelta)}
                  </span>
                )}
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {formatUsd(totalCost)}
                </span>
              </div>
              <div className="truncate font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                入 {formatCompactTokens(totals.input)} · 出{' '}
                {formatCompactTokens(totals.output)} · {primaryModel}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {/* Live 8-bar micro waveform */}
            <div
              className="flex h-6 items-end gap-[2px] pr-1"
              aria-hidden="true"
            >
              {sparkBars.slice(-8).map((bar, idx) => (
                <span
                  key={`${bar.ts}-${idx}`}
                  className="w-[3px] rounded-xs bg-blue-600/80 transition-all duration-200 dark:bg-blue-400/85"
                  style={{ height: `${bar.pct}%` }}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={onToggleStream}
              aria-label={snapshot.simulationRunning ? '暂停小窗实时流' : '恢复小窗实时流'}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              {snapshot.simulationRunning ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => onSizeModeChange('hud')}
              aria-label="展开桌面小窗"
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </section>
    );
  }

  // Full Compact Floating HUD Card mode
  return (
    <section
      aria-label="置顶桌面监控小窗"
      data-testid="desktop-hud-widget"
      style={containerStyle}
      className={`flex flex-col overflow-hidden rounded-2xl border border-slate-200/95 bg-white/95 shadow-xl backdrop-blur-md dark:border-slate-700/90 dark:bg-slate-900/95 ${
        standalone ? 'h-screen w-full rounded-none border-0 shadow-none' : 'w-[384px] max-w-full'
      }`}
    >
      {/* Compact Draggable Window Titlebar */}
      <div
        onPointerDown={onDragPointerDown}
        className={`flex items-center justify-between gap-2 border-b border-slate-200/90 bg-slate-50/90 px-3.5 py-2.5 select-none dark:border-slate-800 dark:bg-slate-950/70 ${
          onDragPointerDown ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              connectionState === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
            aria-hidden="true"
          />
          <span className="text-xs font-bold tracking-tight text-slate-900 whitespace-nowrap dark:text-slate-100">
            CodexScope
          </span>
          <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
            ·
          </span>
          <span className="truncate font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
            {runningCount} 运行 / {filteredAgents.length} 代理
          </span>
        </div>

        <div
          className="flex shrink-0 items-center gap-1"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onToggleStream}
            aria-label={snapshot.simulationRunning ? '暂停小窗实时流' : '恢复小窗实时流'}
            title={snapshot.simulationRunning ? '暂停实时流' : '恢复实时流'}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            {snapshot.simulationRunning ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
          </button>

          {onPopOut && !standalone && (
            <button
              type="button"
              onClick={onPopOut}
              aria-label={isPoppedOut ? '收回悬浮置顶小窗' : '弹出置顶小窗'}
              title={isPoppedOut ? '收回悬浮置顶小窗' : '弹出系统置顶小窗'}
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                isPoppedOut
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'text-slate-500 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
              }`}
            >
              <PictureInPicture2 className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => onSizeModeChange('mini')}
            aria-label="收起为迷你条"
            title="收起为迷你条"
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <Minimize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* High-Integration KPI + Live Sparkline Header */}
      <div className="border-b border-slate-200/80 px-3.5 py-3 dark:border-slate-800">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              实时总消耗 Token
            </div>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span
                data-testid="hud-total-tokens"
                className="font-mono text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-white"
              >
                {formatExactTokens(totals.total)}
              </span>
              {latestRate && (
                <span
                  key={latestRate.timestamp}
                  className="animate-delta font-mono text-xs font-medium tabular-nums text-blue-600 dark:text-blue-400"
                >
                  +{formatCompactTokens(latestRate.totalDelta)}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end">
            <span className="font-mono text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200">
              {formatUsd(totalCost)}
            </span>
            <div
              className="mt-1.5 flex h-7 items-end gap-[2px]"
              aria-label="实时速率柱状微图"
            >
              {sparkBars.length === 0 ? (
                <span className="text-[10px] text-slate-400">待机</span>
              ) : (
                sparkBars.map((bar, idx) => (
                  <span
                    key={`${bar.ts}-${idx}`}
                    className={`w-[4px] rounded-xs transition-all duration-200 ${
                      idx === sparkBars.length - 1
                        ? 'bg-emerald-500 dark:bg-emerald-400'
                        : 'bg-blue-600/65 dark:bg-blue-400/70'
                    }`}
                    style={{ height: `${bar.pct}%` }}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2 font-mono text-[11px] tabular-nums dark:border-slate-800/80">
          <div className="flex items-baseline justify-between pr-1">
            <span className="text-slate-500 dark:text-slate-400">输入 (缓存 {cachePct}%)</span>
            <span className="font-semibold text-blue-700 dark:text-blue-400">
              {formatCompactTokens(totals.input)}
            </span>
          </div>
          <div className="flex items-baseline justify-between border-l border-slate-100 pl-2 dark:border-slate-800/80">
            <span className="text-slate-500 dark:text-slate-400">输出 (推理 {reasonPct}%)</span>
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
              {formatCompactTokens(totals.output)}
            </span>
          </div>
        </div>
      </div>

      {/* Multi-Agent Software Filter Strip */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200/80 bg-slate-50/60 px-3 py-1.5 dark:border-slate-800 dark:bg-slate-950/40">
        <button
          type="button"
          onClick={() => onAdapterFilterChange('all')}
          className={`rounded-md px-2 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
            adapterFilter === 'all'
              ? 'bg-slate-900 text-white dark:bg-blue-600'
              : 'text-slate-600 hover:bg-slate-200/70 dark:text-slate-400 dark:hover:bg-slate-800'
          }`}
        >
          全部 ({snapshot.agents.length})
        </button>
        {availableAdapters.map((adapterId) => {
          const meta = ADAPTER_CATALOG[adapterId];
          const count = snapshot.agents.filter((a) => a.adapter === adapterId).length;
          const active = adapterFilter === adapterId;
          return (
            <button
              key={adapterId}
              type="button"
              onClick={() => onAdapterFilterChange(active ? 'all' : adapterId)}
              className={`rounded-md px-2 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
                active
                  ? 'bg-slate-900 text-white dark:bg-blue-600'
                  : 'text-slate-600 hover:bg-slate-200/70 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              {meta.shortName} ({count})
            </button>
          );
        })}
      </div>

      {/* Compact Scrollable Sub-Agent Live Rows */}
      <div
        className={`divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800/80 ${
          standalone ? 'flex-1' : 'max-h-[312px]'
        }`}
      >
        {tree.length === 0 ? (
          <div className="px-4 py-10 text-center text-xs text-slate-500 dark:text-slate-400">
            当前筛选下暂无 Agent 消耗记录
          </div>
        ) : (
          tree.map(({ agent, depth }) => {
            const adapterMeta = getAdapterMeta(agent.adapter);
            const statusInfo = STATUS_DOT_LABEL[agent.status] || STATUS_DOT_LABEL.running;
            const isExpanded = expandedAgentId === agent.id;
            const sharePct =
              totals.total > 0
                ? Math.min(100, Math.round((agent.tokens.total / totals.total) * 100))
                : 0;
            const ctxPct =
              agent.contextLimit > 0
                ? Math.min(100, Math.round((agent.contextUsed / agent.contextLimit) * 100))
                : 0;
            const cost = calculateTokenCost(agent.tokens, agent.model);
            const isOverBudget = exceededSet.has(agent.id);

            return (
              <div
                key={agent.id}
                data-testid={`hud-agent-${agent.id}`}
                data-over-budget={isOverBudget ? 'true' : 'false'}
                className={`transition-colors ${
                  isOverBudget
                    ? 'bg-red-50/75 hover:bg-red-50 dark:bg-red-950/35 dark:hover:bg-red-950/50'
                    : 'hover:bg-slate-50/90 dark:hover:bg-slate-800/40'
                }`}
              >
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() =>
                    setExpandedAgentId((prev) => (prev === agent.id ? null : agent.id))
                  }
                  className="block w-full px-3.5 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-600"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div
                      className="flex min-w-0 items-center gap-1.5"
                      style={{ paddingLeft: `${depth * 12}px` }}
                    >
                      {depth > 0 && (
                        <span
                          className="font-mono text-[11px] text-slate-400 dark:text-slate-600"
                          aria-hidden="true"
                        >
                          └
                        </span>
                      )}
                      {isOverBudget && (
                        <AlertTriangle
                          className="h-3 w-3 shrink-0 text-red-600 dark:text-red-400"
                          aria-hidden="true"
                        />
                      )}
                      <span className="truncate font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {agent.name}
                      </span>
                      <span className={`shrink-0 text-[10px] font-medium ${adapterMeta.accentClass}`}>
                        {adapterMeta.shortName}
                      </span>
                      {isOverBudget && (
                        <span className="shrink-0 text-[10px] font-semibold text-red-600 dark:text-red-400">
                          超预算
                        </span>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="max-w-[116px] truncate font-mono text-[11px] text-slate-600 dark:text-slate-300">
                        {agent.model}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                      )}
                    </div>
                  </div>

                  <div className="mt-1 flex items-center justify-between gap-2 font-mono text-[11px] tabular-nums">
                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                      <span>入 {formatCompactTokens(agent.tokens.input)}</span>
                      <span aria-hidden="true">·</span>
                      <span>出 {formatCompactTokens(agent.tokens.output)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {formatCompactTokens(agent.tokens.total)}
                      </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {agent.lastDelta.total > 0 && (
                        <span
                          key={agent.lastUpdatedAt}
                          className="animate-delta text-blue-600 dark:text-blue-400"
                        >
                          +{formatCompactTokens(agent.lastDelta.input)}/+
                          {formatCompactTokens(agent.lastDelta.output)}
                        </span>
                      )}
                      <span className={`text-[10px] font-sans font-medium ${statusInfo.cls}`}>
                        {statusInfo.text}
                      </span>
                    </div>
                  </div>

                  <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-blue-600/80 transition-all duration-300 dark:bg-blue-400/85"
                      style={{ width: `${Math.max(3, sharePct)}%` }}
                    />
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/80 px-3.5 py-2.5 text-[11px] dark:border-slate-800/80 dark:bg-slate-950/60">
                    <div className="truncate text-slate-600 dark:text-slate-300">
                      {agent.task}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      <div>缓存命中: {formatCompactTokens(agent.tokens.cachedInput)}</div>
                      <div>推理输出: {formatCompactTokens(agent.tokens.reasoningOutput)}</div>
                      <div>
                        上下文: {formatCompactTokens(agent.contextUsed)} /{' '}
                        {formatCompactTokens(agent.contextLimit)} ({ctxPct}%)
                      </div>
                      <div>预估费用: {formatUsd(cost)}</div>
                    </div>
                    {agent.turns[0] && (
                      <div className="mt-1.5 truncate text-slate-500 dark:text-slate-400">
                        最近轮次: {agent.turns[0].note} ({agent.turns[0].latencyMs}ms)
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Compact Footer Actions */}
      <div className="flex items-center justify-between gap-2 border-t border-slate-200/90 bg-slate-50/90 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/70">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onTriggerBurst}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 whitespace-nowrap transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Zap className="h-3 w-3 text-blue-600 dark:text-blue-400" />
            模拟调用
          </button>
          <button
            type="button"
            onClick={onSpawnSubagent}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 whitespace-nowrap transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Plus className="h-3 w-3" />
            新增子代理
          </button>
        </div>

        {onOpenFullConsole && !standalone && (
          <button
            type="button"
            onClick={onOpenFullConsole}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 whitespace-nowrap hover:underline dark:text-blue-400"
          >
            完整面板
            <ExternalLink className="h-3 w-3" />
          </button>
        )}
      </div>
    </section>
  );
}
