import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  buildAgentHourlyRateSeries,
  formatCompactTokens,
  formatExactTokens,
  type AgentHourlyRatePoint,
  type AgentRecord,
} from '../lib/telemetry';

interface AgentHourlyRateChartProps {
  agent: AgentRecord;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: AgentHourlyRatePoint }>;
}

function HourlyRateTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-md backdrop-blur-xs dark:border-slate-700 dark:bg-slate-900/95">
      <div className="flex items-center justify-between gap-4 font-mono text-[11px] text-slate-500 dark:text-slate-400">
        <span>截至 {point.label}（5 分钟窗口）</span>
        <span>{point.turnCount} 轮</span>
      </div>
      <div className="mt-1.5 space-y-0.5 font-mono tabular-nums">
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-600 dark:text-slate-300">总速率</span>
          <span className="font-semibold text-blue-600 dark:text-blue-400">
            {formatExactTokens(point.tokensPerMin)} tok/min
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 text-[11px]">
          <span className="text-slate-500 dark:text-slate-400">输入速率</span>
          <span className="text-slate-800 dark:text-slate-200">
            {formatExactTokens(point.inputPerMin)} /min
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 text-[11px]">
          <span className="text-slate-500 dark:text-slate-400">输出速率</span>
          <span className="text-emerald-700 dark:text-emerald-400">
            {formatExactTokens(point.outputPerMin)} /min
          </span>
        </div>
      </div>
    </div>
  );
}

export function AgentHourlyRateChart({ agent }: AgentHourlyRateChartProps) {
  const summary = useMemo(() => {
    const referenceNow = Math.max(Date.now(), agent.lastUpdatedAt);
    return buildAgentHourlyRateSeries(agent, referenceNow, 12);
  }, [agent]);

  return (
    <section aria-label="过去一小时 Token 消耗速率">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            过去 1 小时消耗速率
          </h3>
          <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
            Tokens/min
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
          <span>
            当前{' '}
            <strong className="font-semibold text-blue-600 dark:text-blue-400">
              {formatCompactTokens(summary.currentPerMin)}/m
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            峰值{' '}
            <strong className="font-semibold text-slate-800 dark:text-slate-200">
              {formatCompactTokens(summary.peakPerMin)}/m
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            均值{' '}
            <strong className="font-semibold text-slate-800 dark:text-slate-200">
              {formatCompactTokens(summary.avgPerMin)}/m
            </strong>
          </span>
        </div>
      </div>

      <div
        data-testid="agent-hourly-rate-chart"
        className="mt-2.5 h-[168px] w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50/70 px-2 pt-3 pb-1 dark:border-slate-800 dark:bg-slate-950/60 [&_.recharts-cartesian-axis-tick-value]:fill-slate-500 dark:[&_.recharts-cartesian-axis-tick-value]:fill-slate-400"
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart
            data={summary.points}
            margin={{ top: 6, right: 10, left: -6, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="rgba(148, 163, 184, 0.24)"
            />
            <XAxis
              dataKey="label"
              interval={2}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }}
              dy={4}
            />
            <YAxis
              width={46}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              tickFormatter={(val: number) => formatCompactTokens(Number(val))}
              tick={{ fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }}
            />
            <Tooltip
              content={<HourlyRateTooltip />}
              cursor={{ stroke: '#3b82f6', strokeWidth: 1, strokeDasharray: '3 3' }}
            />
            <Line
              type="monotone"
              dataKey="tokensPerMin"
              name="总速率 (Tokens/min)"
              stroke="#2563eb"
              strokeWidth={2}
              dot={{ r: 2.5, fill: '#2563eb', strokeWidth: 0 }}
              activeDot={{ r: 4.5, fill: '#2563eb', stroke: '#ffffff', strokeWidth: 1.5 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {summary.totalLastHour === 0 && (
        <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          该代理过去 1 小时内暂无新的 Token 增量记录，新调用到达后曲线将实时更新。
        </p>
      )}
    </section>
  );
}
