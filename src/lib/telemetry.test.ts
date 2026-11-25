import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateByModel,
  applyTelemetryEvent,
  buildAgentTree,
  calculateTokenCost,
  createInitialDemoSnapshot,
  normalizeUsage,
  parseAgentLog,
  parseCodexJsonl,
  sumAllTokens,
} from './telemetry';

test('parseCodexJsonl parses authentic Codex rollout session_meta, turn_context and token_count', () => {
  const sampleJsonl = [
    JSON.stringify({
      timestamp: '2026-11-24T03:20:00.000Z',
      type: 'session_meta',
      payload: {
        id: 'thread-sub-42',
        agent_nickname: 'sub-sql-auditor',
        cwd: '/workspace/api',
        source: {
          subagent: {
            thread_spawn: {
              parent_thread_id: 'thread-root-01',
              agent_nickname: 'sub-sql-auditor',
            },
          },
        },
      },
    }),
    JSON.stringify({
      timestamp: '2026-11-24T03:20:01.000Z',
      type: 'turn_context',
      payload: {
        model: 'gpt-5.3-codex-mini',
      },
    }),
    JSON.stringify({
      timestamp: '2026-11-24T03:20:03.000Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          model_context_window: 256000,
          last_token_usage: {
            input_tokens: 12000,
            cached_input_tokens: 8000,
            output_tokens: 1500,
            reasoning_output_tokens: 400,
            total_tokens: 13500,
          },
        },
      },
    }),
    'not-valid-json',
  ].join('\n');

  const result = parseCodexJsonl(sampleJsonl);
  assert.equal(result.parsedLines, 3);
  assert.equal(result.errors.length, 1);
  assert.equal(result.events.length, 1);

  const ev = result.events[0];
  assert.equal(ev.adapter, 'codex');
  assert.equal(ev.agentId, 'thread-sub-42');
  assert.equal(ev.parentId, 'thread-root-01');
  assert.equal(ev.agentName, 'sub-sql-auditor');
  assert.equal(ev.role, 'subagent');
  assert.equal(ev.model, 'gpt-5.3-codex-mini');
  assert.equal(ev.usage.input, 12000);
  assert.equal(ev.usage.cachedInput, 8000);
  assert.equal(ev.usage.output, 1500);
  assert.equal(ev.usage.reasoningOutput, 400);
  assert.equal(ev.usage.total, 13500);
});

test('parseAgentLog parses Claude Code sidechain sub-agent JSONL and Gemini CLI JSON', () => {
  const claudeLine = JSON.stringify({
    timestamp: '2026-11-24T04:01:00.000Z',
    type: 'assistant',
    sessionId: 'claude-sess-99',
    agentId: 'claude-sub-lint',
    slug: 'claude-sub-lint',
    isSidechain: true,
    cwd: '/workspace/web',
    message: {
      model: 'claude-sonnet-4.5',
      usage: {
        input_tokens: 4200,
        cache_read_input_tokens: 9800,
        cache_creation_input_tokens: 1000,
        output_tokens: 1850,
      },
    },
  });

  const claudeRes = parseAgentLog(claudeLine);
  assert.equal(claudeRes.events.length, 1);
  assert.deepEqual(claudeRes.detectedAdapters, ['claude-code']);
  assert.equal(claudeRes.events[0].role, 'subagent');
  assert.equal(claudeRes.events[0].parentId, 'claude-sess-99');
  assert.equal(claudeRes.events[0].model, 'claude-sonnet-4.5');
  assert.equal(claudeRes.events[0].usage.input, 15000);
  assert.equal(claudeRes.events[0].usage.cachedInput, 9800);
  assert.equal(claudeRes.events[0].usage.output, 1850);

  const geminiDoc = JSON.stringify({
    sessionId: 'gemini-sess-07',
    messages: [
      {
        timestamp: '2026-11-24T04:02:00.000Z',
        type: 'gemini',
        model: 'gemini-2.5-pro',
        tokens: { input: 22000, cached: 12000, output: 1600, thoughts: 900 },
      },
    ],
  });

  const geminiRes = parseAgentLog(geminiDoc);
  assert.equal(geminiRes.events.length, 1);
  assert.deepEqual(geminiRes.detectedAdapters, ['gemini-cli']);
  assert.equal(geminiRes.events[0].model, 'gemini-2.5-pro');
  assert.equal(geminiRes.events[0].usage.input, 22000);
  assert.equal(geminiRes.events[0].usage.cachedInput, 12000);
  assert.equal(geminiRes.events[0].usage.output, 2500);
  assert.equal(geminiRes.events[0].usage.reasoningOutput, 900);
});

test('applyTelemetryEvent avoids double-counting cumulative snapshots and updates context monotonically', () => {
  const base = createInitialDemoSnapshot(1_700_000_000_000);
  const s1 = applyTelemetryEvent(base, {
    id: 'e-cum-1',
    timestamp: 1_700_000_005_000,
    agentId: 'sub-new-1',
    parentId: 'codex-root-01',
    adapter: 'codex',
    agentName: 'sub-new-1',
    role: 'subagent',
    model: 'o4-mini',
    status: 'running',
    mode: 'cumulative',
    usage: normalizeUsage({
      input: 10_000,
      cachedInput: 4_000,
      output: 2_000,
      reasoningOutput: 1_000,
    }),
  });

  const s2 = applyTelemetryEvent(s1, {
    id: 'e-cum-2',
    timestamp: 1_700_000_008_000,
    agentId: 'sub-new-1',
    parentId: 'codex-root-01',
    adapter: 'codex',
    agentName: 'sub-new-1',
    role: 'subagent',
    model: 'o4-mini',
    status: 'running',
    mode: 'cumulative',
    usage: normalizeUsage({
      input: 15_000,
      cachedInput: 7_000,
      output: 3_500,
      reasoningOutput: 1_800,
    }),
  });

  const agent = s2.agents.find((a) => a.id === 'sub-new-1');
  assert.ok(agent);
  assert.equal(agent.tokens.input, 15_000);
  assert.equal(agent.tokens.output, 3_500);
  assert.equal(agent.lastDelta.input, 5_000);
  assert.equal(agent.lastDelta.cachedInput, 3_000);
  assert.equal(agent.lastDelta.output, 1_500);
  assert.equal(agent.lastDelta.reasoningOutput, 800);
  assert.equal(agent.contextUsed, 13_500);
});

test('calculateTokenCost separates cached vs uncached input tokens accurately across providers', () => {
  const tokens = normalizeUsage({
    input: 1_000_000,
    cachedInput: 600_000,
    output: 100_000,
    reasoningOutput: 20_000,
  });
  assert.equal(calculateTokenCost(tokens, 'gpt-5.3-codex'), 2.205);
  // claude-sonnet-4.5: 400k * $3 + 600k * $0.3 + 100k * $15 = 1.2 + 0.18 + 1.5 = $2.88
  assert.equal(calculateTokenCost(tokens, 'claude-sonnet-4.5'), 2.88);
});

test('buildAgentTree orders parent before nested sub-agents and aggregateByModel sums match global totals', () => {
  const snap = createInitialDemoSnapshot(1_700_000_000_000);
  const tree = buildAgentTree(snap.agents);

  const reviewer = tree.find((n) => n.agent.id === 'sub-diff-reviewer');
  assert.ok(reviewer);
  assert.equal(reviewer.depth, 2);

  const claudeSub = tree.find((n) => n.agent.id === 'claude-sub-tests');
  assert.ok(claudeSub);
  assert.equal(claudeSub.depth, 1);

  const byModel = aggregateByModel(snap.agents);
  const globalSum = sumAllTokens(snap.agents);
  const modelTotal = byModel.reduce((acc, m) => acc + m.tokens.total, 0);
  assert.equal(modelTotal, globalSum.total);
});

test('buildWidgetSummary and formatSwiftBarOutput generate clean taskbar/widget payloads', async () => {
  const { buildWidgetSummary, formatSwiftBarOutput } = await import('./telemetry');
  const snap = createInitialDemoSnapshot(1_700_000_000_000);
  const summary = buildWidgetSummary(snap);

  assert.equal(summary.totalAgents, snap.agents.length);
  assert.ok(summary.totalTokens > 0);
  assert.equal(summary.class, 'active');
  assert.ok(summary.text.includes('↑') && summary.text.includes('↓'));
  assert.ok(summary.tooltip.includes('sub-api-builder'));

  const swiftbar = formatSwiftBarOutput(snap, 'http://localhost:3000');
  assert.ok(swiftbar.includes('---'));
  assert.ok(swiftbar.includes('gpt-5.3-codex'));
  assert.ok(swiftbar.includes('href=http://localhost:3000/?widget=1'));
});

test('buildAgentHourlyRateSeries computes accurate Tokens/min buckets over the past hour', async () => {
  const { buildAgentHourlyRateSeries } = await import('./telemetry');
  const now = Date.UTC(2026, 10, 24, 12, 0, 0);
  const snap = createInitialDemoSnapshot(now);
  const baseAgent = snap.agents[0];

  const customAgent = {
    ...baseAgent,
    turns: [
      // Inside rightmost 5-min bucket [11:55, 12:00]: 12,500 + 2,500 = 15,000 -> 3,000 Tokens/min
      {
        id: 't-recent-1',
        timestamp: now - 60_000,
        model: baseAgent.model,
        delta: normalizeUsage({ input: 10_000, cachedInput: 5_000, output: 2_500, reasoningOutput: 500 }),
        latencyMs: 800,
        note: 'recent 1',
      },
      {
        id: 't-recent-2',
        timestamp: now - 120_000,
        model: baseAgent.model,
        delta: normalizeUsage({ input: 2_000, cachedInput: 1_000, output: 500, reasoningOutput: 100 }),
        latencyMs: 600,
        note: 'recent 2',
      },
      // Inside bucket ~30 mins ago: 30,000 total -> 6,000 Tokens/min (peak)
      {
        id: 't-mid',
        timestamp: now - 27 * 60_000,
        model: baseAgent.model,
        delta: normalizeUsage({ input: 25_000, cachedInput: 15_000, output: 5_000, reasoningOutput: 1_000 }),
        latencyMs: 1100,
        note: 'mid',
      },
      // Outside 1-hour window (65 mins ago) -> must be ignored
      {
        id: 't-old',
        timestamp: now - 65 * 60_000,
        model: baseAgent.model,
        delta: normalizeUsage({ input: 50_000, cachedInput: 0, output: 10_000, reasoningOutput: 0 }),
        latencyMs: 1200,
        note: 'expired',
      },
    ],
  };

  const summary = buildAgentHourlyRateSeries(customAgent, now, 12);
  assert.equal(summary.points.length, 12);
  assert.equal(summary.bucketMinutes, 5);
  assert.equal(summary.currentPerMin, 3000);
  assert.equal(summary.peakPerMin, 6000);
  assert.equal(summary.totalLastHour, 45_000);
  assert.equal(summary.avgPerMin, 750);
  assert.equal(summary.points[11].turnCount, 2);
  assert.equal(summary.points[11].inputPerMin, 2400);
  assert.equal(summary.points[11].outputPerMin, 600);

  // Empty turns edge case
  const emptySummary = buildAgentHourlyRateSeries({ ...baseAgent, turns: [] }, now, 12);
  assert.equal(emptySummary.points.length, 12);
  assert.equal(emptySummary.currentPerMin, 0);
  assert.equal(emptySummary.peakPerMin, 0);
  assert.equal(emptySummary.avgPerMin, 0);
  assert.equal(emptySummary.totalLastHour, 0);
});

test('evaluateSubagentBudgets flags only over-budget sub-agents sorted by overage', async () => {
  const { evaluateSubagentBudgets } = await import('./telemetry');
  const snap = createInitialDemoSnapshot(Date.UTC(2026, 10, 24, 12, 0, 0));

  // In demo seed:
  // codex-orchestrator (root): 204,040
  // sub-api-builder (subagent): 274,250
  // sub-diff-reviewer (subagent): 97,540
  // claude-sub-tests (subagent): 100,680
  const res150k = evaluateSubagentBudgets(snap.agents, 150_000, true);
  assert.deepEqual(res150k.exceededIds, ['sub-api-builder']);
  assert.equal(res150k.alerts.length, 1);
  assert.equal(res150k.alerts[0].overageTokens, 274_250 - 150_000);
  assert.equal(res150k.alerts[0].usagePct, 183);

  // Lower budget to 99,000 -> sub-api-builder & claude-sub-tests exceed; root agents stay excluded
  const res99k = evaluateSubagentBudgets(snap.agents, 99_000, true);
  assert.deepEqual(res99k.exceededIds, ['sub-api-builder', 'claude-sub-tests']);

  // Exact equality should NOT trigger over-budget
  const resExact = evaluateSubagentBudgets(snap.agents, 274_250, true);
  assert.equal(resExact.alerts.length, 0);

  // Disabled or zero budget returns empty alerts
  assert.equal(evaluateSubagentBudgets(snap.agents, 10_000, false).alerts.length, 0);
  assert.equal(evaluateSubagentBudgets(snap.agents, 0, true).alerts.length, 0);
  assert.equal(evaluateSubagentBudgets(snap.agents, Number.NaN, true).alerts.length, 0);
});


