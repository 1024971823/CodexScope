import { useMemo, useRef, useState, type PointerEvent } from 'react';
import {
  Check,
  Code2,
  Copy,
  Download,
  ExternalLink,
  LayoutGrid,
  Monitor,
  PictureInPicture2,
  RotateCcw,
  Terminal,
} from 'lucide-react';
import {
  ADAPTER_CATALOG,
  buildWidgetSummary,
  formatCompactTokens,
  sumAllTokens,
  type AgentAdapter,
  type TelemetrySnapshot,
} from '../lib/telemetry';
import {
  DesktopHudWidget,
  type WidgetSizeMode,
} from './DesktopHudWidget';

interface DesktopWidgetStudioProps {
  snapshot: TelemetrySnapshot;
  connectionState: 'connecting' | 'connected' | 'reconnecting';
  adapterFilter: 'all' | AgentAdapter;
  onAdapterFilterChange: (adapter: 'all' | AgentAdapter) => void;
  sizeMode: WidgetSizeMode;
  onSizeModeChange: (mode: WidgetSizeMode) => void;
  opacityPct: number;
  onOpacityChange: (val: number) => void;
  isFloatingPinned: boolean;
  pipStatusMessage: string;
  exceededAgentIds?: string[];
  onPopOutAlwaysOnTop: () => void;
  onToggleStream: () => void;
  onTriggerBurst: () => void;
  onSpawnSubagent: () => void;
  onOpenFullConsole: () => void;
  onNavigatePlugin: () => void;
}

type OsEmbedTarget = 'tray' | 'swiftbar' | 'rainmeter' | 'waybar';

const SUPPORTED_ADAPTERS: AgentAdapter[] = [
  'codex',
  'claude-code',
  'cursor',
  'cline',
  'opencode',
  'gemini-cli',
];

const MODE_OPTIONS: Array<{ id: WidgetSizeMode; label: string }> = [
  { id: 'hud', label: '标准小窗' },
  { id: 'mini', label: '桌宠迷你条' },
  { id: 'taskbar', label: '任务栏嵌入条' },
  { id: 'desktop-widget', label: '桌面小组件' },
];

export function DesktopWidgetStudio({
  snapshot,
  connectionState,
  adapterFilter,
  onAdapterFilterChange,
  sizeMode,
  onSizeModeChange,
  opacityPct,
  onOpacityChange,
  isFloatingPinned,
  pipStatusMessage,
  exceededAgentIds = [],
  onPopOutAlwaysOnTop,
  onToggleStream,
  onTriggerBurst,
  onSpawnSubagent,
  onOpenFullConsole,
  onNavigatePlugin,
}: DesktopWidgetStudioProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [embedTarget, setEmbedTarget] = useState<OsEmbedTarget>('tray');
  const [copiedCmd, setCopiedCmd] = useState(false);

  const dragState = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  }>({ dragging: false, startX: 0, startY: 0, originX: 0, originY: 0 });

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const widgetSummary = useMemo(() => buildWidgetSummary(snapshot), [snapshot]);

  const embedMeta = useMemo(() => {
    const map: Record<
      OsEmbedTarget,
      {
        tabLabel: string;
        title: string;
        desc: string;
        command: string;
        downloadFile: string;
        downloadLabel: string;
      }
    > = {
      tray: {
        tabLabel: '全平台托盘',
        title: 'Windows 任务栏贴边 + macOS 菜单栏三合一',
        desc: '自动常驻系统托盘，macOS 菜单栏直接滚动实时 Token 文字，Windows 任务栏右下角贴边嵌入（/?mode=taskbar），托盘右键可切换桌面小组件与悬浮小窗。',
        command: 'npx electron codexscope-tray-widget.mjs',
        downloadFile: 'codexscope-tray-widget.mjs',
        downloadLabel: '下载托盘整合脚本',
      },
      swiftbar: {
        tabLabel: 'macOS 菜单栏',
        title: 'macOS SwiftBar / xbar 原生菜单栏插件',
        desc: '零常驻内存，每 2 秒拉取 /api/widget/taskbar?format=swiftbar，在顶部状态栏显示实时总消耗，点击下拉展开各子 Agent 模型与 I/O 明细。',
        command: `curl -fsS "${origin}/api/widget/taskbar?format=swiftbar"`,
        downloadFile: 'codexscope.2s.sh',
        downloadLabel: '下载 codexscope.2s.sh',
      },
      rainmeter: {
        tabLabel: 'Windows 桌面',
        title: 'Windows 10/11 Rainmeter 桌面壁纸小组件',
        desc: '将 CodexScope.ini 放入 Documents\\Rainmeter\\Skins\\CodexScope 后刷新，即可直接贴合 Windows 桌面壁纸层，点击组件即可弹出完整悬浮窗。',
        command: `${origin}/api/widget/summary`,
        downloadFile: 'CodexScope.ini',
        downloadLabel: '下载 CodexScope.ini',
      },
      waybar: {
        tabLabel: 'Linux 任务栏',
        title: 'Linux Waybar / Polybar 状态栏模块',
        desc: '直接消费 /api/widget/taskbar?format=waybar 返回的 JSON 载荷（含 text、tooltip 与 class），原生嵌入 Hyprland / Sway 顶部或底部状态栏。',
        command: `curl -fsS "${origin}/api/widget/taskbar?format=waybar"`,
        downloadFile: 'waybar-codexscope.jsonc',
        downloadLabel: '下载 Waybar 配置',
      },
    };
    return map[embedTarget];
  }, [embedTarget, origin]);

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    if (sizeMode === 'taskbar') return;
    dragState.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    const onMove = (ev: globalThis.PointerEvent) => {
      if (!dragState.current.dragging) return;
      const dx = ev.clientX - dragState.current.startX;
      const dy = ev.clientY - dragState.current.startY;
      setOffset({
        x: Math.max(-180, Math.min(180, dragState.current.originX + dx)),
        y: Math.max(-120, Math.min(160, dragState.current.originY + dy)),
      });
    };
    const onUp = () => {
      dragState.current.dragging = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  async function handleCopyCommand() {
    try {
      await navigator.clipboard.writeText(embedMeta.command);
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 1800);
    } catch {
      setCopiedCmd(false);
    }
  }

  const nowTimeStr = useMemo(() => {
    const d = new Date(
      snapshot.rateHistory[snapshot.rateHistory.length - 1]?.timestamp || Date.now(),
    );
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }, [snapshot.rateHistory]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            桌面小窗与任务栏嵌入 · 多 Agent 实时 HUD
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            支持系统任务栏内嵌、桌面壁纸小组件与跨软件置顶悬浮窗，实时盯紧 Codex、Claude Code、Cursor、Gemini CLI 的输入输出与模型消耗。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onPopOutAlwaysOnTop}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white whitespace-nowrap transition-colors hover:bg-blue-700"
          >
            <PictureInPicture2 className="h-3.5 w-3.5" />
            {isFloatingPinned ? '收回置顶悬浮窗' : '弹出置顶小窗'}
          </button>
          <a
            href="/api/plugin/download/codexscope-tray-widget.mjs"
            download="codexscope-tray-widget.mjs"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 whitespace-nowrap transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Download className="h-3.5 w-3.5" />
            下载任务栏托盘客户端
          </a>
        </div>
      </div>

      {pipStatusMessage && (
        <div
          role="status"
          className="rounded-lg border border-blue-200 bg-blue-50/70 px-4 py-2.5 text-xs text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200"
        >
          {pipStatusMessage}
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* Left: Interactive Desktop / Taskbar Canvas Stage */}
        <section
          ref={stageRef}
          aria-label="桌面悬浮小窗与任务栏实时预览区"
          className="relative flex min-h-[580px] flex-col items-center justify-between overflow-hidden rounded-xl border border-slate-200 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:18px_18px] bg-slate-100/70 p-4 sm:p-5 lg:col-span-7 dark:border-slate-800 dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] dark:bg-slate-950"
        >
          {/* Stage Controls Bar */}
          <div className="z-10 flex w-full flex-wrap items-center justify-between gap-2 text-xs">
            <div
              role="tablist"
              aria-label="小窗形态切换"
              className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200/80 bg-white/92 p-0.5 backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/92"
            >
              {MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  aria-selected={sizeMode === opt.id}
                  onClick={() => {
                    onSizeModeChange(opt.id);
                    if (opt.id === 'taskbar') setOffset({ x: 0, y: 0 });
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                    sizeMode === opt.id
                      ? 'bg-slate-900 text-white dark:bg-blue-600'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-slate-200/80 bg-white/92 px-2.5 py-1 backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/92">
              <label
                htmlFor="hud-opacity-range"
                className="text-[11px] text-slate-500 whitespace-nowrap dark:text-slate-400"
              >
                不透明度 {opacityPct}%
              </label>
              <input
                id="hud-opacity-range"
                type="range"
                min="72"
                max="100"
                value={opacityPct}
                onChange={(e) => onOpacityChange(Number(e.target.value))}
                className="w-16 accent-blue-600"
              />
              {(offset.x !== 0 || offset.y !== 0) && sizeMode !== 'taskbar' && (
                <button
                  type="button"
                  onClick={() => setOffset({ x: 0, y: 0 })}
                  aria-label="复位小窗位置"
                  className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Center Preview Area */}
          {sizeMode === 'taskbar' ? (
            <div className="my-auto flex w-full flex-col justify-between gap-8 pt-6">
              {/* Simulated Desktop IDE Workspace Backdrop */}
              <div className="mx-auto w-full max-w-[540px] rounded-xl border border-slate-200/90 bg-white/80 p-4 shadow-xs backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/70">
                <div className="flex items-center justify-between border-b border-slate-200/70 pb-2 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <span className="font-mono font-medium text-slate-700 dark:text-slate-200">
                    macOS 菜单栏 / Linux Waybar 实时文本输出预览
                  </span>
                  <a
                    href="/?mode=taskbar"
                    className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    独立视图
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div
                  data-testid="live-taskbar-text-preview"
                  className="mt-2.5 overflow-x-auto rounded-lg bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100"
                >
                  {widgetSummary.text}
                </div>
                <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                  下方演示 Windows / Linux 底部任务栏右侧托盘区的原生内嵌效果，数据通过 SSE 与 /api/widget/summary 秒级同步。
                </p>
              </div>

              {/* Simulated OS Bottom Taskbar Dock */}
              <div
                data-testid="simulated-os-taskbar"
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700/90 bg-slate-950/95 px-3 py-1.5 shadow-xl"
              >
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-800 text-blue-400"
                    aria-hidden="true"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </span>
                  <span className="hidden items-center gap-1.5 rounded-md bg-slate-800/80 px-2 py-1 font-mono text-[11px] text-slate-300 sm:inline-flex">
                    <Code2 className="h-3 w-3 text-sky-400" />
                    IDE
                  </span>
                  <span className="hidden items-center gap-1.5 rounded-md bg-slate-800/80 px-2 py-1 font-mono text-[11px] text-slate-300 md:inline-flex">
                    <Terminal className="h-3 w-3 text-emerald-400" />
                    codex
                  </span>
                </div>

                <div className="flex min-w-0 flex-1 items-center justify-end gap-2.5 sm:flex-none">
                  <DesktopHudWidget
                    snapshot={snapshot}
                    connectionState={connectionState}
                    adapterFilter={adapterFilter}
                    onAdapterFilterChange={onAdapterFilterChange}
                    sizeMode="taskbar"
                    onSizeModeChange={onSizeModeChange}
                    opacityPct={opacityPct}
                    onToggleStream={onToggleStream}
                    onTriggerBurst={onTriggerBurst}
                    onSpawnSubagent={onSpawnSubagent}
                  />
                  <div className="hidden border-l border-slate-800 pl-2.5 text-right font-mono text-[11px] leading-tight text-slate-300 sm:block">
                    <div>{nowTimeStr}</div>
                    <div className="text-[10px] text-slate-500">ZH</div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div
              className="my-auto max-w-full py-6 transition-transform duration-75"
              style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }}
            >
              <DesktopHudWidget
                snapshot={snapshot}
                connectionState={connectionState}
                adapterFilter={adapterFilter}
                onAdapterFilterChange={onAdapterFilterChange}
                sizeMode={sizeMode}
                onSizeModeChange={onSizeModeChange}
                opacityPct={opacityPct}
                isPoppedOut={isFloatingPinned}
                exceededAgentIds={exceededAgentIds}
                onPopOut={onPopOutAlwaysOnTop}
                onToggleStream={onToggleStream}
                onTriggerBurst={onTriggerBurst}
                onSpawnSubagent={onSpawnSubagent}
                onOpenFullConsole={onOpenFullConsole}
                onDragPointerDown={handlePointerDown}
              />
            </div>
          )}

          {/* Bottom Stage Hint & Direct Standalone Links */}
          <div className="z-10 flex w-full flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              {sizeMode === 'taskbar'
                ? '独立嵌入地址: /?mode=taskbar · 高度 40px 无边框自适应'
                : sizeMode === 'desktop-widget'
                  ? '独立桌面组件地址: /?mode=desktop-widget · 适合贴合桌面右上角壁纸层'
                  : '按住顶部标题栏可在画布自由拖动 · 点击子代理行展开上下文与推理明细'}
            </span>
            <div className="flex items-center gap-3 font-mono">
              <a
                href="/?mode=taskbar"
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                /?mode=taskbar
              </a>
              <a
                href="/?mode=desktop-widget"
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                /?mode=desktop-widget
              </a>
            </div>
          </div>
        </section>

        {/* Right: OS Taskbar & Desktop Widget Embedding + Compatibility Matrix */}
        <div className="space-y-5 lg:col-span-5">
          {/* OS Taskbar & Desktop Widget Embed Hub */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Monitor
                  className="h-4 w-4 text-blue-600 dark:text-blue-400"
                  aria-hidden="true"
                />
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  嵌入系统任务栏 / 桌面小组件
                </h2>
              </div>
              <button
                type="button"
                onClick={onNavigatePlugin}
                className="text-xs font-medium text-blue-600 whitespace-nowrap hover:underline dark:text-blue-400"
              >
                查看源码
              </button>
            </div>

            <div
              role="tablist"
              aria-label="操作系统嵌入方式"
              className="mt-3 flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800"
            >
              {(
                [
                  ['tray', '全平台托盘'],
                  ['swiftbar', 'macOS 菜单栏'],
                  ['rainmeter', 'Windows 桌面'],
                  ['waybar', 'Linux 任务栏'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={embedTarget === id}
                  onClick={() => {
                    setEmbedTarget(id);
                    setCopiedCmd(false);
                  }}
                  className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium whitespace-nowrap transition-colors ${
                    embedTarget === id
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-3.5 space-y-2.5">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                {embedMeta.title}
              </div>
              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {embedMeta.desc}
              </p>

              <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-950 px-3 py-2 dark:border-slate-700">
                <code className="truncate font-mono text-[11px] text-slate-100">
                  {embedMeta.command}
                </code>
                <button
                  type="button"
                  onClick={() => void handleCopyCommand()}
                  aria-label="复制启动命令或接口地址"
                  className="inline-flex shrink-0 items-center gap-1 rounded-md bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-200 transition-colors hover:bg-slate-700"
                >
                  {copiedCmd ? (
                    <Check className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  {copiedCmd ? '已复制' : '复制'}
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <a
                  href={`/api/plugin/download/${embedMeta.downloadFile}`}
                  download={embedMeta.downloadFile}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white whitespace-nowrap transition-colors hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500"
                >
                  <Download className="h-3.5 w-3.5" />
                  {embedMeta.downloadLabel}
                </a>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Chrome / Edge 也可点击地址栏安装图标固定至任务栏
                </span>
              </div>
            </div>
          </section>

          {/* Multi-Agent Software Compatibility Matrix */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                主流 Agent 软件兼容矩阵
              </h2>
              {adapterFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => onAdapterFilterChange('all')}
                  className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  显示全部
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              单一通用监听器自动识别以下主流编码 Agent，点击卡片即可聚焦该工具实时消耗。
            </p>

            <div className="mt-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {SUPPORTED_ADAPTERS.map((id) => {
                const meta = ADAPTER_CATALOG[id];
                const agentsForTool = snapshot.agents.filter((a) => a.adapter === id);
                const toolTokens = sumAllTokens(agentsForTool);
                const active = adapterFilter === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onAdapterFilterChange(active ? 'all' : id)}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      active
                        ? 'border-blue-600 bg-blue-50/60 dark:border-blue-500 dark:bg-blue-950/30'
                        : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs font-semibold ${meta.accentClass}`}>
                        {meta.name}
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                        {agentsForTool.length > 0
                          ? `${agentsForTool.length} 代理`
                          : '就绪'}
                      </span>
                    </div>
                    <div className="mt-1 truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {meta.logPath}
                    </div>
                    <div className="mt-1.5 font-mono text-xs font-medium tabular-nums text-slate-900 dark:text-slate-100">
                      {toolTokens.total > 0
                        ? `${formatCompactTokens(toolTokens.total)} Token`
                        : '等待本机日志上报'}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <a
                href="/api/plugin/download/universal-agent-watcher.mjs"
                download="universal-agent-watcher.mjs"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                <Download className="h-3.5 w-3.5" />
                下载多 Agent 通用监听器
              </a>
              <button
                type="button"
                onClick={onNavigatePlugin}
                className="text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              >
                导入日志 / 接口测试 →
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
