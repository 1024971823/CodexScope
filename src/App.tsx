import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  AlertTriangle,
  AppWindow,
  Cpu,
  ListTree,
  Menu,
  Moon,
  Pause,
  PictureInPicture2,
  Play,
  Plug,
  Sun,
  X,
} from 'lucide-react';
import {
  aggregateByModel,
  createInitialDemoSnapshot,
  evaluateSubagentBudgets,
  formatCompactTokens,
  type AgentAdapter,
  type SubagentBudgetAlert,
  type TelemetrySnapshot,
} from './lib/telemetry';
import {
  DesktopHudWidget,
  type WidgetSizeMode,
} from './components/DesktopHudWidget';
import { DesktopWidgetStudio } from './components/DesktopWidgetStudio';
import { MonitorView } from './components/MonitorView';
import { ModelsView } from './components/ModelsView';
import { EventStreamView } from './components/EventStreamView';
import { PluginSetupView } from './components/PluginSetupView';
import { AgentDetailDrawer } from './components/AgentDetailDrawer';

type NavView = 'widget' | 'monitor' | 'models' | 'events' | 'plugin';

const NAV_ITEMS: Array<{
  id: NavView;
  label: string;
  icon: typeof Activity;
}> = [
  { id: 'widget', label: '桌面小窗', icon: AppWindow },
  { id: 'monitor', label: '完整工作台', icon: Activity },
  { id: 'models', label: '模型与成本', icon: Cpu },
  { id: 'events', label: '原始事件流', icon: ListTree },
  { id: 'plugin', label: '多 Agent 接入', icon: Plug },
];

interface DocumentPictureInPictureApi {
  requestWindow: (opts: { width: number; height: number }) => Promise<Window>;
}

export default function App() {
  const standaloneConfig = useMemo<{
    enabled: boolean;
    initialMode: WidgetSizeMode;
  }>(() => {
    if (typeof window === 'undefined') {
      return { enabled: false, initialMode: 'hud' };
    }
    const params = new URLSearchParams(window.location.search);
    const modeParam = params.get('mode');
    if (
      modeParam === 'taskbar' ||
      modeParam === 'desktop-widget' ||
      modeParam === 'mini' ||
      modeParam === 'hud'
    ) {
      return { enabled: true, initialMode: modeParam };
    }
    if (params.get('widget') === '1') {
      return { enabled: true, initialMode: 'hud' };
    }
    return { enabled: false, initialMode: 'hud' };
  }, []);

  const isStandaloneWidget = standaloneConfig.enabled;

  const [activeView, setActiveView] = useState<NavView>('widget');
  const [snapshot, setSnapshot] = useState<TelemetrySnapshot>(() =>
    createInitialDemoSnapshot(),
  );
  const [connectionState, setConnectionState] = useState<
    'connecting' | 'connected' | 'reconnecting'
  >('connecting');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [modelFilter, setModelFilter] = useState<string>('all');
  const [adapterFilter, setAdapterFilter] = useState<'all' | AgentAdapter>('all');
  const [widgetSizeMode, setWidgetSizeMode] = useState<WidgetSizeMode>(
    standaloneConfig.initialMode,
  );
  const [opacityPct, setOpacityPct] = useState<number>(96);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(isStandaloneWidget);

  // Sub-agent Token budget threshold & visual alert state
  const [subagentBudgetTokens, setSubagentBudgetTokens] = useState<number>(() => {
    if (typeof window === 'undefined') return 150_000;
    try {
      const saved = window.localStorage.getItem('codexscope:subagent-budget-v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.budgetTokens === 'number' && parsed.budgetTokens > 0) {
          return Math.floor(parsed.budgetTokens);
        }
      }
    } catch {
      // Ignore malformed storage
    }
    return 150_000;
  });
  const [budgetAlertEnabled, setBudgetAlertEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const saved = window.localStorage.getItem('codexscope:subagent-budget-v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.enabled === 'boolean') return parsed.enabled;
      }
    } catch {
      // Ignore malformed storage
    }
    return true;
  });
  const [activeToastAlert, setActiveToastAlert] = useState<SubagentBudgetAlert | null>(null);
  const notifiedExceededRef = useRef<Set<string>>(new Set());
  const budgetHydratedRef = useRef(false);

  // Real Document PiP + In-Page Corner Pin fallback
  const [pipContainer, setPipContainer] = useState<HTMLElement | null>(null);
  const pipWindowRef = useRef<Window | null>(null);
  const [pinnedOverlay, setPinnedOverlay] = useState(false);
  const [pipStatusMessage, setPipStatusMessage] = useState('');

  const budgetEvaluation = useMemo(
    () =>
      evaluateSubagentBudgets(
        snapshot.agents,
        subagentBudgetTokens,
        budgetAlertEnabled,
      ),
    [snapshot.agents, subagentBudgetTokens, budgetAlertEnabled],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        'codexscope:subagent-budget-v1',
        JSON.stringify({
          budgetTokens: subagentBudgetTokens,
          enabled: budgetAlertEnabled,
        }),
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [subagentBudgetTokens, budgetAlertEnabled]);

  useEffect(() => {
    if (!budgetAlertEnabled || budgetEvaluation.alerts.length === 0) {
      notifiedExceededRef.current.clear();
      setActiveToastAlert(null);
      budgetHydratedRef.current = true;
      return;
    }

    const currentExceeded = new Set(budgetEvaluation.exceededIds);
    // Prune agents that are no longer over budget
    for (const id of Array.from(notifiedExceededRef.current)) {
      if (!currentExceeded.has(id)) {
        notifiedExceededRef.current.delete(id);
      }
    }

    const newlyExceeded = budgetEvaluation.alerts.filter(
      (alert) => !notifiedExceededRef.current.has(alert.agentId),
    );

    if (newlyExceeded.length > 0) {
      for (const alert of newlyExceeded) {
        notifiedExceededRef.current.add(alert.agentId);
      }
      // Show visual toast whenever a sub-agent crosses threshold (including after user lowers threshold)
      if (budgetHydratedRef.current && !isStandaloneWidget) {
        setActiveToastAlert(newlyExceeded[0]);
      }
    }

    budgetHydratedRef.current = true;
  }, [budgetAlertEnabled, budgetEvaluation, isStandaloneWidget]);

  useEffect(() => {
    if (!activeToastAlert) return;
    const timer = window.setTimeout(() => {
      setActiveToastAlert(null);
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [activeToastAlert]);

  function handleUpdateBudget(next: { budgetTokens?: number; enabled?: boolean }) {
    if (typeof next.budgetTokens === 'number' && next.budgetTokens > 0) {
      setSubagentBudgetTokens(Math.floor(next.budgetTokens));
    }
    if (typeof next.enabled === 'boolean') {
      setBudgetAlertEnabled(next.enabled);
    }
  }

  // Sync Tailwind .dark class on <html> and optional PiP window
  useEffect(() => {
    const applyDark = (doc: Document) => {
      if (darkMode) doc.documentElement.classList.add('dark');
      else doc.documentElement.classList.remove('dark');
    };
    applyDark(document);
    if (pipWindowRef.current && !pipWindowRef.current.closed) {
      applyDark(pipWindowRef.current.document);
    }
  }, [darkMode]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [activeView]);

  // Connect to live SSE stream from Express backend
  useEffect(() => {
    let closed = false;
    let source: EventSource | null = null;

    async function fetchInitial() {
      try {
        const res = await fetch('/api/snapshot');
        if (res.ok && !closed) {
          const data: TelemetrySnapshot = await res.json();
          setSnapshot(data);
        }
      } catch {
        // Keep local seed snapshot if backend is momentarily restarting
      }
    }

    void fetchInitial();

    try {
      source = new EventSource('/api/stream');
      source.onopen = () => {
        if (!closed) setConnectionState('connected');
      };
      const handleData = (evt: MessageEvent) => {
        if (closed) return;
        try {
          const next: TelemetrySnapshot = JSON.parse(evt.data);
          setSnapshot(next);
          setConnectionState('connected');
        } catch {
          // Ignore malformed SSE frames
        }
      };
      source.addEventListener('snapshot', handleData);
      source.addEventListener('update', handleData);
      source.onerror = () => {
        if (!closed) setConnectionState('reconnecting');
      };
    } catch {
      setConnectionState('reconnecting');
    }

    return () => {
      closed = true;
      source?.close();
    };
  }, []);

  // Cleanup PiP window on unmount
  useEffect(() => {
    return () => {
      if (pipWindowRef.current && !pipWindowRef.current.closed) {
        pipWindowRef.current.close();
      }
    };
  }, []);

  const selectedAgent = useMemo(
    () => snapshot.agents.find((a) => a.id === selectedAgentId) || null,
    [snapshot.agents, selectedAgentId],
  );

  const selectedParentName = useMemo(() => {
    if (!selectedAgent?.parentId) return null;
    return (
      snapshot.agents.find((a) => a.id === selectedAgent.parentId)?.name ||
      selectedAgent.parentId
    );
  }, [snapshot.agents, selectedAgent]);

  const modelSummaries = useMemo(
    () => aggregateByModel(snapshot.agents),
    [snapshot.agents],
  );

  async function postAction(endpoint: string, body?: Record<string, unknown>) {
    setBusyAction(endpoint);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.snapshot) {
          setSnapshot(data.snapshot);
        } else if (typeof data.simulationRunning === 'boolean') {
          setSnapshot((prev) => ({
            ...prev,
            simulationRunning: data.simulationRunning,
          }));
        }
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function handlePopOutAlwaysOnTop() {
    // Close existing PiP window or unpin corner overlay
    if (pipWindowRef.current && !pipWindowRef.current.closed) {
      pipWindowRef.current.close();
      pipWindowRef.current = null;
      setPipContainer(null);
      setPipStatusMessage('已收回系统置顶小窗。');
      return;
    }
    if (pinnedOverlay) {
      setPinnedOverlay(false);
      setPipStatusMessage('已收回页面右下角悬浮小窗。');
      return;
    }

    const docPip = (
      window as unknown as { documentPictureInPicture?: DocumentPictureInPictureApi }
    ).documentPictureInPicture;

    if (docPip && typeof docPip.requestWindow === 'function') {
      try {
        const pipSize =
          widgetSizeMode === 'taskbar'
            ? { width: 356, height: 48 }
            : widgetSizeMode === 'desktop-widget'
              ? { width: 340, height: 308 }
              : widgetSizeMode === 'mini'
                ? { width: 384, height: 88 }
                : { width: 384, height: 540 };
        const pipWin = await docPip.requestWindow(pipSize);
        pipWindowRef.current = pipWin;
        pipWin.document.title = 'CodexScope 置顶监控';
        if (darkMode) pipWin.document.documentElement.classList.add('dark');

        // Clone active styles into PiP window
        for (const sheet of Array.from(document.styleSheets)) {
          try {
            if (sheet.href) {
              const link = pipWin.document.createElement('link');
              link.rel = 'stylesheet';
              link.href = sheet.href;
              pipWin.document.head.appendChild(link);
            } else if (sheet.cssRules) {
              const style = pipWin.document.createElement('style');
              style.textContent = Array.from(sheet.cssRules)
                .map((r) => r.cssText)
                .join('\n');
              pipWin.document.head.appendChild(style);
            }
          } catch {
            // Skip cross-origin font stylesheets that disallow cssRules read
          }
        }

        const mount = pipWin.document.createElement('div');
        pipWin.document.body.style.margin = '0';
        pipWin.document.body.className =
          'bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100';
        pipWin.document.body.appendChild(mount);

        pipWin.addEventListener('pagehide', () => {
          pipWindowRef.current = null;
          setPipContainer(null);
        });

        setPipContainer(mount);
        setPipStatusMessage('已弹出浏览器系统级置顶小窗，可悬浮在任意编辑器与终端上方。');
        return;
      } catch {
        // Sandboxed iframe or user gesture restriction -> gracefully fall back to pinned floating overlay
      }
    }

    setPinnedOverlay(true);
    setPipStatusMessage(
      '当前预览环境限制浏览器画中画弹窗，已切换为全站右下角悬浮置顶小窗；如需系统级跨软件置顶，可下载并运行 desktop-widget.mjs。',
    );
  }

  // Standalone native widget window mode (`/?widget=1` for Electron desktop-widget.mjs)
  if (isStandaloneWidget) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <DesktopHudWidget
          snapshot={snapshot}
          connectionState={connectionState}
          adapterFilter={adapterFilter}
          onAdapterFilterChange={setAdapterFilter}
          sizeMode={widgetSizeMode}
          onSizeModeChange={setWidgetSizeMode}
          standalone
          exceededAgentIds={budgetEvaluation.exceededIds}
          onToggleStream={() =>
            void postAction('/api/simulator/toggle', {
              running: !snapshot.simulationRunning,
            })
          }
          onTriggerBurst={() => void postAction('/api/simulator/burst')}
          onSpawnSubagent={() => void postAction('/api/simulator/spawn')}
        />
      </div>
    );
  }

  const isPoppedOut = Boolean(pipContainer) || pinnedOverlay;
  const activeNavLabel =
    NAV_ITEMS.find((item) => item.id === activeView)?.label || '桌面小窗';

  return (
    <div className="min-h-screen overflow-x-clip bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="flex min-h-screen w-full">
        {/* Desktop Sidebar */}
        <aside className="hidden w-60 shrink-0 flex-col justify-between border-r border-slate-200 bg-white lg:flex dark:border-slate-800 dark:bg-slate-900">
          <div>
            <div className="flex h-14 items-center border-b border-slate-200 px-5 dark:border-slate-800">
              <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap dark:text-slate-100">
                CodexScope
              </span>
            </div>

            <nav aria-label="主导航" className="space-y-1 p-3">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => setActiveView(item.id)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                      isActive
                        ? 'bg-slate-100 text-slate-950 dark:bg-slate-800 dark:text-white'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="border-t border-slate-200 p-4 text-xs dark:border-slate-800">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  connectionState === 'connected'
                    ? 'bg-emerald-500'
                    : 'bg-amber-500'
                }`}
                aria-hidden="true"
              />
              <span>
                {connectionState === 'connected'
                  ? 'SSE 实时通道已连接'
                  : '正在重连实时通道'}
              </span>
            </div>
            <div className="mt-1.5 truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
              会话 {snapshot.sessionId}
            </div>
          </div>
        </aside>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 z-40 flex bg-slate-950/40 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          >
            <aside
              className="flex h-full w-64 flex-col justify-between border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div>
                <div className="flex h-14 items-center justify-between border-b border-slate-200 px-5 dark:border-slate-800">
                  <span className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100">
                    CodexScope
                  </span>
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(false)}
                    aria-label="关闭导航菜单"
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <nav aria-label="移动端主导航" className="space-y-1 p-3">
                  {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeView === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-current={isActive ? 'page' : undefined}
                        onClick={() => {
                          setActiveView(item.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium whitespace-nowrap ${
                          isActive
                            ? 'bg-slate-100 text-slate-950 dark:bg-slate-800 dark:text-white'
                            : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </nav>
              </div>
              <div className="border-t border-slate-200 p-4 font-mono text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                会话 {snapshot.sessionId}
              </div>
            </aside>
          </div>
        )}

        {/* Workspace Main Column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-xs sm:px-6 dark:border-slate-800 dark:bg-slate-900/95">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="打开导航菜单"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 lg:hidden dark:border-slate-700 dark:text-slate-300"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <span className="hidden text-slate-400 lg:inline dark:text-slate-500">
                  工作台
                </span>
                <span
                  className="hidden text-slate-300 lg:inline dark:text-slate-700"
                  aria-hidden="true"
                >
                  /
                </span>
                <span className="truncate font-semibold text-slate-900 lg:font-medium lg:text-slate-800 dark:text-slate-100 dark:lg:text-slate-200">
                  {activeNavLabel}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {budgetEvaluation.alerts.length > 0 && (
                <button
                  type="button"
                  data-testid="header-budget-alert-btn"
                  onClick={() => {
                    setActiveView('monitor');
                    setSelectedAgentId(budgetEvaluation.alerts[0].agentId);
                  }}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-2.5 text-xs font-medium text-red-700 whitespace-nowrap transition-colors hover:bg-red-100 dark:border-red-800 dark:bg-red-950/60 dark:text-red-300 dark:hover:bg-red-900/60"
                >
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>预算超额 ({budgetEvaluation.alerts.length})</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setDarkMode((prev) => !prev)}
                aria-label={darkMode ? '切换到浅色模式' : '切换到深色模式'}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>

              <button
                type="button"
                onClick={() => void handlePopOutAlwaysOnTop()}
                aria-label={isPoppedOut ? '收回悬浮小窗' : '置顶悬浮小窗'}
                className={`hidden h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium whitespace-nowrap transition-colors sm:inline-flex ${
                  isPoppedOut
                    ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-300'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                <PictureInPicture2 className="h-3.5 w-3.5" />
                {isPoppedOut ? '收回小窗' : '置顶小窗'}
              </button>

              <button
                type="button"
                onClick={() =>
                  void postAction('/api/simulator/toggle', {
                    running: !snapshot.simulationRunning,
                  })
                }
                disabled={busyAction !== null}
                className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-xs font-medium whitespace-nowrap transition-colors disabled:opacity-50 ${
                  snapshot.simulationRunning
                    ? 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {snapshot.simulationRunning ? (
                  <>
                    <Pause className="h-3.5 w-3.5" />
                    暂停实时流
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" />
                    恢复实时流
                  </>
                )}
              </button>
            </div>
          </header>

          <main className="mx-auto w-full min-w-0 max-w-[1360px] flex-1 px-4 py-6 sm:px-6">
            {activeView === 'widget' && (
              <DesktopWidgetStudio
                snapshot={snapshot}
                connectionState={connectionState}
                adapterFilter={adapterFilter}
                onAdapterFilterChange={setAdapterFilter}
                sizeMode={widgetSizeMode}
                onSizeModeChange={setWidgetSizeMode}
                opacityPct={opacityPct}
                onOpacityChange={setOpacityPct}
                isFloatingPinned={isPoppedOut}
                pipStatusMessage={pipStatusMessage}
                exceededAgentIds={budgetEvaluation.exceededIds}
                onPopOutAlwaysOnTop={() => void handlePopOutAlwaysOnTop()}
                onToggleStream={() =>
                  void postAction('/api/simulator/toggle', {
                    running: !snapshot.simulationRunning,
                  })
                }
                onTriggerBurst={() => void postAction('/api/simulator/burst')}
                onSpawnSubagent={() => void postAction('/api/simulator/spawn')}
                onOpenFullConsole={() => setActiveView('monitor')}
                onNavigatePlugin={() => setActiveView('plugin')}
              />
            )}

            {activeView === 'monitor' && (
              <MonitorView
                snapshot={snapshot}
                modelFilter={modelFilter}
                onModelFilterChange={setModelFilter}
                adapterFilter={adapterFilter}
                onAdapterFilterChange={setAdapterFilter}
                subagentBudgetTokens={subagentBudgetTokens}
                budgetAlertEnabled={budgetAlertEnabled}
                budgetEvaluation={budgetEvaluation}
                onUpdateBudget={handleUpdateBudget}
                onSelectAgent={(id) => setSelectedAgentId(id)}
                onTriggerBurst={() => void postAction('/api/simulator/burst')}
                onSpawnSubagent={() => void postAction('/api/simulator/spawn')}
                onClearSession={() => {
                  setSelectedAgentId(null);
                  void postAction('/api/session/clear');
                }}
                onLoadDemo={() => void postAction('/api/session/load-demo')}
                onNavigatePlugin={() => setActiveView('plugin')}
                busyAction={busyAction}
              />
            )}

            {activeView === 'models' && (
              <ModelsView
                models={modelSummaries}
                onSelectModelFilter={(model) => {
                  setModelFilter(model);
                  setActiveView('monitor');
                }}
              />
            )}

            {activeView === 'events' && (
              <EventStreamView
                events={snapshot.events}
                onInspectAgent={(id) => setSelectedAgentId(id)}
              />
            )}

            {activeView === 'plugin' && (
              <PluginSetupView
                onImportSuccess={() => {
                  setModelFilter('all');
                  setAdapterFilter('all');
                }}
              />
            )}
          </main>
        </div>
      </div>

      {/* Real OS Always-On-Top Document Picture-in-Picture Portal */}
      {pipContainer &&
        createPortal(
          <DesktopHudWidget
            snapshot={snapshot}
            connectionState={connectionState}
            adapterFilter={adapterFilter}
            onAdapterFilterChange={setAdapterFilter}
            sizeMode={widgetSizeMode}
            onSizeModeChange={setWidgetSizeMode}
            standalone
            exceededAgentIds={budgetEvaluation.exceededIds}
            onToggleStream={() =>
              void postAction('/api/simulator/toggle', {
                running: !snapshot.simulationRunning,
              })
            }
            onTriggerBurst={() => void postAction('/api/simulator/burst')}
            onSpawnSubagent={() => void postAction('/api/simulator/spawn')}
          />,
          pipContainer,
        )}

      {/* Fallback Pinned Bottom-Right Floating Overlay across all views */}
      {pinnedOverlay && !pipContainer && (
        <div
          data-testid="pinned-floating-overlay"
          className="fixed right-4 bottom-4 z-30 max-w-[calc(100vw-2rem)]"
        >
          <DesktopHudWidget
            snapshot={snapshot}
            connectionState={connectionState}
            adapterFilter={adapterFilter}
            onAdapterFilterChange={setAdapterFilter}
            sizeMode={widgetSizeMode}
            onSizeModeChange={setWidgetSizeMode}
            opacityPct={opacityPct}
            isPoppedOut
            exceededAgentIds={budgetEvaluation.exceededIds}
            onPopOut={() => setPinnedOverlay(false)}
            onToggleStream={() =>
              void postAction('/api/simulator/toggle', {
                running: !snapshot.simulationRunning,
              })
            }
            onTriggerBurst={() => void postAction('/api/simulator/burst')}
            onSpawnSubagent={() => void postAction('/api/simulator/spawn')}
            onOpenFullConsole={() => setActiveView('monitor')}
          />
        </div>
      )}

      {/* Non-blocking Visual Budget Alert Toast */}
      {activeToastAlert && (
        <div
          role="alert"
          data-testid="budget-alert-toast"
          className={`fixed right-4 z-50 w-[348px] max-w-[calc(100vw-2rem)] rounded-xl border border-red-300 bg-white/95 p-3.5 shadow-xl backdrop-blur-md dark:border-red-800 dark:bg-slate-900/95 ${
            pinnedOverlay ? 'top-16' : 'bottom-4'
          }`}
        >
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex items-start gap-2.5 min-w-0">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-red-900 dark:text-red-200">
                  子 Agent 触发预算超额提醒
                </div>
                <div className="mt-0.5 truncate font-mono text-xs text-slate-900 dark:text-slate-100">
                  {activeToastAlert.agentName} · {activeToastAlert.model}
                </div>
                <div className="mt-0.5 font-mono text-[11px] tabular-nums text-red-700 dark:text-red-400">
                  已用 {formatCompactTokens(activeToastAlert.usedTokens)} / 预算{' '}
                  {formatCompactTokens(activeToastAlert.budgetTokens)}（超额 +
                  {formatCompactTokens(activeToastAlert.overageTokens)}）
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveView('monitor');
                      setSelectedAgentId(activeToastAlert.agentId);
                      setActiveToastAlert(null);
                    }}
                    className="rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white whitespace-nowrap transition-colors hover:bg-red-700"
                  >
                    查看该子代理
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveToastAlert(null)}
                    className="text-[11px] text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    暂不提醒
                  </button>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveToastAlert(null)}
              aria-label="关闭预算预警提示"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <AgentDetailDrawer
        agent={selectedAgent}
        parentAgentName={selectedParentName}
        subagentBudgetTokens={subagentBudgetTokens}
        budgetAlertEnabled={budgetAlertEnabled}
        onClose={() => setSelectedAgentId(null)}
      />
    </div>
  );
}
