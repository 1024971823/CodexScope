import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
  formatExactTokens,
  formatTimeLabel,
  type TelemetryEvent,
} from '../lib/telemetry';

interface EventStreamViewProps {
  events: TelemetryEvent[];
  onInspectAgent: (agentId: string) => void;
}

export function EventStreamView({
  events,
  onInspectAgent,
}: EventStreamViewProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return events;
    return events.filter(
      (ev) =>
        ev.agentName.toLowerCase().includes(q) ||
        ev.model.toLowerCase().includes(q) ||
        (ev.note || '').toLowerCase().includes(q),
    );
  }, [events, query]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            实时 Token 增量事件流
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            按时间倒序展示每条来自 Codex 子代理的 token_count 增量记录，便于定位突发消耗的轮次。
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <label htmlFor="event-search" className="sr-only">
            筛选事件流
          </label>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            id="event-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索 Agent、模型或摘要..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          {events.length === 0
            ? '尚无实时事件，启动模拟流或从本地 Codex 插件推送事件后将在此实时滚屏。'
            : '没有匹配当前关键词的事件记录。'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full min-w-[820px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                <th className="px-4 py-3">时间</th>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">模型</th>
                <th className="px-4 py-3 text-right">+输入 (缓存)</th>
                <th className="px-4 py-3 text-right">+输出 (推理)</th>
                <th className="px-4 py-3 text-right">耗时</th>
                <th className="px-4 py-3">轮次摘要</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filtered.map((ev) => (
                <tr
                  key={ev.id}
                  className="animate-delta transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                    {formatTimeLabel(ev.timestamp)}
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => onInspectAgent(ev.agentId)}
                      className="font-mono text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
                    >
                      {ev.agentName}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-700 dark:text-slate-300">
                    {ev.model}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-blue-700 dark:text-blue-400">
                    +{formatExactTokens(ev.usage.input)}
                    <span className="text-slate-400">
                      {' '}
                      ({formatExactTokens(ev.usage.cachedInput)})
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-emerald-700 dark:text-emerald-400">
                    +{formatExactTokens(ev.usage.output)}
                    {ev.usage.reasoningOutput > 0 && (
                      <span className="text-amber-600 dark:text-amber-400">
                        {' '}
                        ({formatExactTokens(ev.usage.reasoningOutput)})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                    {ev.latencyMs ? `${ev.latencyMs}ms` : '—'}
                  </td>
                  <td className="max-w-xs truncate px-4 py-2.5 text-xs text-slate-600 dark:text-slate-300">
                    {ev.note || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
