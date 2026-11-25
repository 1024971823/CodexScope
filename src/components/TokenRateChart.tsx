import { useState } from 'react';
import {
  formatCompactTokens,
  formatExactTokens,
  type RatePoint,
} from '../lib/telemetry';

interface TokenRateChartProps {
  points: RatePoint[];
  isStreaming: boolean;
}

export function TokenRateChart({ points, isStreaming }: TokenRateChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const width = 680;
  const height = 210;
  const padLeft = 48;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 28;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const latest = points[points.length - 1];
  const activePoint =
    hoveredIdx !== null && points[hoveredIdx] ? points[hoveredIdx] : latest;

  const maxVal = Math.max(
    1000,
    ...points.map((p) => Math.max(p.inputDelta, p.outputDelta)),
  );
  const niceMax = Math.ceil(maxVal / 2000) * 2000;

  const getX = (idx: number) => {
    if (points.length <= 1) return padLeft + plotW;
    return padLeft + (idx / (points.length - 1)) * plotW;
  };

  const getY = (val: number) => {
    return padTop + plotH - Math.min(1, val / niceMax) * plotH;
  };

  const inputLine = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(p.inputDelta).toFixed(1)}`)
    .join(' ');

  const inputArea =
    points.length > 0
      ? `${inputLine} L ${getX(points.length - 1).toFixed(1)} ${(padTop + plotH).toFixed(1)} L ${getX(0).toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`
      : '';

  const outputLine = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(p.outputDelta).toFixed(1)}`)
    .join(' ');

  const yTicks = [0, 0.5, 1].map((ratio) => ({
    value: Math.round(niceMax * ratio),
    y: padTop + plotH * (1 - ratio),
  }));

  return (
    <section
      aria-label="实时 Token 变化趋势"
      className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            实时输入 / 输出增量趋势
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            最近 {points.length} 次采样窗口 · {isStreaming ? '实时更新中' : '已暂停推送'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs tabular-nums">
          <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
            <span className="inline-block h-2 w-2 rounded-xs bg-blue-600 dark:bg-blue-400" aria-hidden="true" />
            <span>输入</span>
            <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
              {activePoint ? `+${formatExactTokens(activePoint.inputDelta)}` : '0'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
            <span className="inline-block h-2 w-2 rounded-xs bg-emerald-600 dark:bg-emerald-400" aria-hidden="true" />
            <span>输出</span>
            <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
              {activePoint ? `+${formatExactTokens(activePoint.outputDelta)}` : '0'}
            </span>
          </div>
          {activePoint && (
            <span className="font-mono text-slate-500 dark:text-slate-400">
              {activePoint.label}
            </span>
          )}
        </div>
      </div>

      {points.length === 0 ? (
        <div className="mt-4 flex flex-1 min-h-[190px] items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
          暂无实时增量采样，等待 Codex 子代理上报 Token 事件
        </div>
      ) : (
        <div className="mt-4 flex-1">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="aspect-[680/210] max-h-[220px] w-full overflow-hidden"
            role="img"
            aria-label="输入与输出 Token 实时变化折线图"
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <defs>
              <linearGradient id="codexInputFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563EB" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#2563EB" stopOpacity="0.01" />
              </linearGradient>
            </defs>

            {yTicks.map((tick) => (
              <g key={tick.value}>
                <line
                  x1={padLeft}
                  y1={tick.y}
                  x2={width - padRight}
                  y2={tick.y}
                  className="stroke-slate-200 dark:stroke-slate-800"
                  strokeWidth="1"
                  strokeDasharray={tick.value === 0 ? undefined : '3 3'}
                />
                <text
                  x={padLeft - 8}
                  y={tick.y + 4}
                  textAnchor="end"
                  className="fill-slate-400 font-mono text-[10px] tabular-nums dark:fill-slate-500"
                >
                  {formatCompactTokens(tick.value)}
                </text>
              </g>
            ))}

            {inputArea && <path d={inputArea} fill="url(#codexInputFill)" />}
            {inputLine && (
              <path
                d={inputLine}
                fill="none"
                className="stroke-blue-600 dark:stroke-blue-400"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {outputLine && (
              <path
                d={outputLine}
                fill="none"
                className="stroke-emerald-600 dark:stroke-emerald-400"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}

            {points.map((p, idx) => {
              const x = getX(idx);
              const step = plotW / Math.max(points.length, 1);
              const rectX = Math.max(padLeft, x - step / 2);
              const rectW = Math.max(1, Math.min(width - padRight - rectX, step));
              const showLabel =
                idx === 0 ||
                idx === points.length - 1 ||
                idx === Math.floor(points.length / 2);
              const isHovered = hoveredIdx === idx;
              return (
                <g key={`${p.timestamp}-${idx}`}>
                  {isHovered && (
                    <line
                      x1={x}
                      y1={padTop}
                      x2={x}
                      y2={padTop + plotH}
                      className="stroke-slate-300 dark:stroke-slate-700"
                      strokeWidth="1"
                    />
                  )}
                  <circle
                    cx={x}
                    cy={getY(p.inputDelta)}
                    r={isHovered ? 4 : 2.2}
                    className="fill-blue-600 dark:fill-blue-400"
                  />
                  <circle
                    cx={x}
                    cy={getY(p.outputDelta)}
                    r={isHovered ? 4 : 2.2}
                    className="fill-emerald-600 dark:fill-emerald-400"
                  />
                  {showLabel && (
                    <text
                      x={x}
                      y={height - 6}
                      textAnchor={
                        idx === 0
                          ? 'start'
                          : idx === points.length - 1
                            ? 'end'
                            : 'middle'
                      }
                      className="fill-slate-400 font-mono text-[10px] tabular-nums dark:fill-slate-500"
                    >
                      {p.label}
                    </text>
                  )}
                  <rect
                    x={rectX}
                    y={padTop}
                    width={rectW}
                    height={plotH}
                    fill="transparent"
                    onMouseEnter={() => setHoveredIdx(idx)}
                  />
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </section>
  );
}
