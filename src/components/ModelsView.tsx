import {
  formatExactTokens,
  formatUsd,
  getModelPricing,
  type ModelSummary,
} from '../lib/telemetry';

interface ModelsViewProps {
  models: ModelSummary[];
  onSelectModelFilter: (model: string) => void;
}

export function ModelsView({ models, onSelectModelFilter }: ModelsViewProps) {
  const grandTotal = models.reduce((acc, m) => acc + m.tokens.total, 0);
  const grandCost = models.reduce((acc, m) => acc + m.costUsd, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            模型消耗与单价估算
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            按模型汇总所有主代理与子 Agent 的输入、缓存命中、输出及推理 Token，点击任意模型行可返回监控表快速筛选。
          </p>
        </div>
        <div className="text-right font-mono text-sm tabular-nums text-slate-600 dark:text-slate-300">
          总消耗 {formatExactTokens(grandTotal)} Token · 估算 {formatUsd(grandCost)}
        </div>
      </div>

      {models.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          当前会话暂无模型记录，启动实时模拟或导入 Codex JSONL 后将自动按模型聚合。
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full min-w-[820px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                <th className="px-4 py-3">模型名称</th>
                <th className="px-4 py-3 text-right">代理数</th>
                <th className="px-4 py-3 text-right">输入 Token</th>
                <th className="px-4 py-3 text-right">缓存命中率</th>
                <th className="px-4 py-3 text-right">输出 Token</th>
                <th className="px-4 py-3 text-right">推理 Token</th>
                <th className="px-4 py-3 text-right">总计与占比</th>
                <th className="px-4 py-3 text-right">参考单价 ($/1M)</th>
                <th className="px-4 py-3 text-right">预估费用</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {models.map((item) => {
                const pricing = getModelPricing(item.model);
                return (
                  <tr
                    key={item.model}
                    className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <td className="px-4 py-3.5">
                      <button
                        type="button"
                        onClick={() => onSelectModelFilter(item.model)}
                        className="text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                      >
                        <div className="font-mono font-medium text-blue-700 hover:underline dark:text-blue-400">
                          {item.model}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {item.tier}
                        </div>
                      </button>
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {item.agentCount}
                      <span className="text-xs text-slate-400">
                        {' '}
                        ({item.runningCount} 活跃)
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                      {formatExactTokens(item.tokens.input)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      {item.cacheHitPct}%
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                      {formatExactTokens(item.tokens.output)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono tabular-nums text-amber-700 dark:text-amber-400">
                      {formatExactTokens(item.tokens.reasoningOutput)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono tabular-nums">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {formatExactTokens(item.tokens.total)}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {item.sharePct}%
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      入 ${pricing.inputPer1M} / 出 ${pricing.outputPer1M}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-medium tabular-nums text-slate-900 dark:text-slate-100">
                      {formatUsd(item.costUsd)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
