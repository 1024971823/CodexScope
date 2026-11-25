import { useMemo, useState, type FormEvent } from 'react';
import { Check, Copy, Download, Send, Upload } from 'lucide-react';
import {
  ADAPTER_CATALOG,
  type AgentAdapter,
} from '../lib/telemetry';
import {
  generateCodexConfigToml,
  generateCodexMcpServerScript,
  generateDesktopWidgetElectronScript,
  generateRainmeterSkinIni,
  generateSwiftBarPluginScript,
  generateTrayAndTaskbarWidgetScript,
  generateUniversalWatcherScript,
  generateWaybarModuleConfig,
  SAMPLE_CLAUDE_JSONL,
  SAMPLE_CODEX_JSONL,
  SAMPLE_GEMINI_JSON,
} from '../lib/pluginTemplates';

interface PluginSetupViewProps {
  onImportSuccess: () => void;
}

type PluginTab =
  | 'watcher'
  | 'tray'
  | 'swiftbar'
  | 'rainmeter'
  | 'waybar'
  | 'desktop'
  | 'mcp'
  | 'config';

const MODEL_OPTIONS = [
  'gpt-5.3-codex',
  'gpt-5.3-codex-mini',
  'o4-mini',
  'o3',
  'claude-sonnet-4.5',
  'claude-haiku-4.5',
  'claude-opus-4.5',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'deepseek-r1',
];

export function PluginSetupView({ onImportSuccess }: PluginSetupViewProps) {
  const [activeTab, setActiveTab] = useState<PluginTab>('watcher');
  const [copied, setCopied] = useState(false);

  const [jsonlInput, setJsonlInput] = useState('');
  const [jsonlStatus, setJsonlStatus] = useState<{
    type: 'idle' | 'success' | 'error';
    message: string;
  }>({ type: 'idle', message: '' });
  const [importing, setImporting] = useState(false);

  const [adapter, setAdapter] = useState<AgentAdapter>('codex');
  const [agentName, setAgentName] = useState('sub-schema-validator');
  const [model, setModel] = useState('gpt-5.3-codex-mini');
  const [inputTokens, setInputTokens] = useState('14500');
  const [outputTokens, setOutputTokens] = useState('2380');
  const [webhookStatus, setWebhookStatus] = useState<{
    type: 'idle' | 'success' | 'error';
    message: string;
  }>({ type: 'idle', message: '' });
  const [sendingWebhook, setSendingWebhook] = useState(false);

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const tabMeta = useMemo(() => {
    const map: Record<
      PluginTab,
      { label: string; filename: string; summary: string; code: string }
    > = {
      watcher: {
        label: '多 Agent 通用监听器',
        filename: 'universal-agent-watcher.mjs',
        summary:
          '零依赖 Node.js 守护脚本，同时自动监听 Codex CLI、Claude Code、Gemini CLI 与 OpenCode 的本地会话日志，实时推送到任务栏与桌面小窗。',
        code: generateUniversalWatcherScript(origin),
      },
      tray: {
        label: '系统托盘三合一',
        filename: 'codexscope-tray-widget.mjs',
        summary:
          'macOS 顶部菜单栏实时文字 + Windows 任务栏右下角贴边条（/?mode=taskbar）+ 桌面小组件卡片（/?mode=desktop-widget）三合一原生客户端。',
        code: generateTrayAndTaskbarWidgetScript(origin),
      },
      swiftbar: {
        label: 'macOS SwiftBar',
        filename: 'codexscope.2s.sh',
        summary:
          '轻量级 macOS SwiftBar / xbar 菜单栏插件，直接订阅 /api/widget/taskbar?format=swiftbar，每 2 秒更新一次。',
        code: generateSwiftBarPluginScript(origin),
      },
      rainmeter: {
        label: 'Windows Rainmeter',
        filename: 'CodexScope.ini',
        summary:
          'Windows 10/11 Rainmeter 桌面壁纸小组件皮肤，直接调用 /api/widget/summary 在桌面常驻显示实时消耗与主力模型。',
        code: generateRainmeterSkinIni(origin),
      },
      waybar: {
        label: 'Linux Waybar',
        filename: 'waybar-codexscope.jsonc',
        summary:
          'Linux Hyprland / Sway Waybar 状态栏模块配置，消费 /api/widget/taskbar?format=waybar 的 JSON 数据流。',
        code: generateWaybarModuleConfig(origin),
      },
      desktop: {
        label: '置顶悬浮小窗',
        filename: 'desktop-widget.mjs',
        summary:
          '无边框、全局置顶、跨工作区悬浮的独立桌面小窗口启动脚本，可直接悬浮在 VS Code / Cursor / Terminal 上方。',
        code: generateDesktopWidgetElectronScript(origin),
      },
      mcp: {
        label: '通用 MCP 插件',
        filename: 'codex-mcp-monitor.mjs',
        summary:
          '兼容 Codex、Claude Code、Cursor、Cline 与 OpenCode 的标准 MCP stdio 插件，允许代理自查子 Agent Token 消耗。',
        code: generateCodexMcpServerScript(origin),
      },
      config: {
        label: '配置文件示例',
        filename: 'config.toml',
        summary:
          '包含 Codex ~/.codex/config.toml 与 Claude Code / Cursor / Cline 通用 mcp.json 配置片段。',
        code: generateCodexConfigToml(origin),
      },
    };
    return map[activeTab];
  }, [activeTab, origin]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(tabMeta.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  async function handleImportJsonl(e: FormEvent) {
    e.preventDefault();
    if (!jsonlInput.trim()) {
      setJsonlStatus({
        type: 'error',
        message: '请先粘贴日志内容，或点击上方示例按钮快速填充。',
      });
      return;
    }

    setImporting(true);
    setJsonlStatus({ type: 'idle', message: '' });
    try {
      const res = await fetch('/api/import-jsonl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonl: jsonlInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setJsonlStatus({
          type: 'error',
          message: data.error || '导入失败，请检查日志格式。',
        });
      } else {
        const adaptersText = Array.isArray(data.detectedAdapters) && data.detectedAdapters.length > 0
          ? `（识别来源: ${data.detectedAdapters.join(', ')}）`
          : '';
        setJsonlStatus({
          type: 'success',
          message: `已成功解析 ${data.parsedLines} 行并导入 ${data.importedEvents} 条 Token 记录${adaptersText}，置顶小窗与监控面板已更新。`,
        });
        onImportSuccess();
      }
    } catch {
      setJsonlStatus({
        type: 'error',
        message: '网络请求失败，请确认服务正在运行。',
      });
    } finally {
      setImporting(false);
    }
  }

  async function handleSendWebhook(e: FormEvent) {
    e.preventDefault();
    const cleanName = agentName.trim();
    const parsedIn = Number(inputTokens);
    const parsedOut = Number(outputTokens);
    if (!cleanName) {
      setWebhookStatus({ type: 'error', message: '请填写 Agent 名称。' });
      return;
    }
    if (!Number.isFinite(parsedIn) || parsedIn < 0 || !Number.isFinite(parsedOut) || parsedOut < 0) {
      setWebhookStatus({ type: 'error', message: '输入与输出 Token 必须为非负整数。' });
      return;
    }

    setSendingWebhook(true);
    setWebhookStatus({ type: 'idle', message: '' });
    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adapter,
          agentId: cleanName,
          parentId: adapter === 'codex' ? 'codex-root-01' : adapter === 'claude-code' ? 'claude-root-01' : null,
          agentName: cleanName,
          role: 'subagent',
          task: `${ADAPTER_CATALOG[adapter].shortName} 实时上报子代理`,
          model,
          status: 'running',
          mode: 'delta',
          input_tokens: Math.floor(parsedIn),
          cached_input_tokens: Math.floor(parsedIn * 0.55),
          output_tokens: Math.floor(parsedOut),
          reasoning_output_tokens: Math.floor(parsedOut * 0.3),
          note: '手动模拟本地插件上报',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWebhookStatus({ type: 'error', message: data.error || '上报失败。' });
      } else {
        setWebhookStatus({
          type: 'success',
          message: `已推送 ${ADAPTER_CATALOG[adapter].shortName} · ${cleanName}（${model}）的实时增量。`,
        });
        onImportSuccess();
      }
    } catch {
      setWebhookStatus({ type: 'error', message: '请求 /api/ingest 失败。' });
    } finally {
      setSendingWebhook(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          多 Agent 插件安装与置顶小窗接入
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          一套轻量脚本同时兼容 OpenAI Codex、Claude Code、Cursor、Cline、OpenCode 与 Gemini CLI，并支持原生置顶桌面小窗。
        </p>
      </div>

      {/* Plugin Files Section */}
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div
            role="tablist"
            aria-label="插件文件切换"
            className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800"
          >
            {(
              [
                ['watcher', '多 Agent 监听器'],
                ['tray', '系统托盘三合一'],
                ['swiftbar', 'macOS 菜单栏'],
                ['rainmeter', 'Win 桌面组件'],
                ['waybar', 'Linux Waybar'],
                ['desktop', '置顶悬浮小窗'],
                ['mcp', '通用 MCP'],
                ['config', '配置片段'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={activeTab === key}
                onClick={() => setActiveTab(key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  activeTab === key
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 whitespace-nowrap transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? '已复制代码' : '复制代码'}
            </button>
            <a
              href={`/api/plugin/download/${tabMeta.filename}`}
              download={tabMeta.filename}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white whitespace-nowrap transition-colors hover:bg-blue-700"
            >
              <Download className="h-3.5 w-3.5" />
              下载 {tabMeta.filename}
            </a>
          </div>
        </div>

        <div className="px-5 py-4">
          <p className="text-xs text-slate-600 dark:text-slate-300">
            {tabMeta.summary}
          </p>
          <pre className="mt-3 max-h-[320px] overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-100 dark:border-slate-800">
            <code>{tabMeta.code}</code>
          </pre>
        </div>
      </section>

      {/* Two-Column Multi-Format Log Importer & Live Webhook Tester */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <form
          onSubmit={handleImportJsonl}
          className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                通用多格式日志导入解析器
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                自动识别 Codex JSONL、Claude Code JSONL 与 Gemini CLI JSON 会话文件。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setJsonlInput(SAMPLE_CODEX_JSONL);
                  setJsonlStatus({ type: 'idle', message: '' });
                }}
                className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 whitespace-nowrap hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Codex 示例
              </button>
              <button
                type="button"
                onClick={() => {
                  setJsonlInput(SAMPLE_CLAUDE_JSONL);
                  setJsonlStatus({ type: 'idle', message: '' });
                }}
                className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 whitespace-nowrap hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Claude Code 示例
              </button>
              <button
                type="button"
                onClick={() => {
                  setJsonlInput(SAMPLE_GEMINI_JSON);
                  setJsonlStatus({ type: 'idle', message: '' });
                }}
                className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 whitespace-nowrap hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Gemini CLI 示例
              </button>
            </div>
          </div>

          <label htmlFor="jsonl-textarea" className="sr-only">
            Agent 日志内容
          </label>
          <textarea
            id="jsonl-textarea"
            rows={7}
            value={jsonlInput}
            onChange={(e) => setJsonlInput(e.target.value)}
            placeholder="粘贴 Codex rollout-*.jsonl、Claude Code projects/*.jsonl 或 Gemini CLI session-*.json..."
            className="mt-3 w-full flex-1 rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />

          {jsonlStatus.message && (
            <p
              role="status"
              className={`mt-2.5 text-xs ${
                jsonlStatus.type === 'error'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {jsonlStatus.message}
            </p>
          )}

          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={importing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white whitespace-nowrap transition-colors hover:bg-slate-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              <Upload className="h-3.5 w-3.5" />
              {importing ? '正在解析...' : '解析并导入实时面板'}
            </button>
          </div>
        </form>

        <form
          onSubmit={handleSendWebhook}
          className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="space-y-3.5">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                实时接口推送测试
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                向 POST /api/ingest 推送任意 Agent 工具的实时 Token 增量事件。
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="webhook-adapter"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  来源软件
                </label>
                <select
                  id="webhook-adapter"
                  value={adapter}
                  onChange={(e) => setAdapter(e.target.value as AgentAdapter)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  {Object.values(ADAPTER_CATALOG).map((meta) => (
                    <option key={meta.id} value={meta.id}>
                      {meta.shortName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="webhook-agent-name"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  子 Agent 名称
                </label>
                <input
                  id="webhook-agent-name"
                  type="text"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="webhook-model"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                使用模型
              </label>
              <select
                id="webhook-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {MODEL_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="webhook-input-tokens"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  输入 Token
                </label>
                <input
                  id="webhook-input-tokens"
                  type="number"
                  min="0"
                  value={inputTokens}
                  onChange={(e) => setInputTokens(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div>
                <label
                  htmlFor="webhook-output-tokens"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  输出 Token
                </label>
                <input
                  id="webhook-output-tokens"
                  type="number"
                  min="0"
                  value={outputTokens}
                  onChange={(e) => setOutputTokens(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
            </div>

            {webhookStatus.message && (
              <p
                role="status"
                className={`text-xs ${
                  webhookStatus.type === 'error'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {webhookStatus.message}
              </p>
            )}
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={sendingWebhook}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white whitespace-nowrap transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              {sendingWebhook ? '推送中...' : '推送测试事件'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
