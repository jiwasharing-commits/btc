(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.pipeline = window.BtcDash.pipeline || {};
  window.BtcDash.engines = window.BtcDash.engines || {};

  const pipelineSteps = [];
  const lastHashes = {};
  let pendingTimer = null;
  let pipelineStatus = { lastRunAt: null, reason: null, activeTimeframe: null, changedTimeframes: [], steps: [], warnings: [], errors: [] };
  let performanceSnapshot = { lastRunAt: null, totalDurationMs: 0, stepDurations: {}, skippedSteps: [], slowSteps: [], rebuildReason: null, changedTimeframes: [] };

  const perf = () => window.BtcDash.config?.PERFORMANCE_CONFIG || {};
  const nowMs = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
  function getActiveTimeframeSafe() { try { return window.BtcDash.utils?.getActiveTimeframe?.() || (typeof getActiveTimeframe === "function" ? getActiveTimeframe() : null) || window.BtcDash.config?.DEFAULT_TIMEFRAME || "1W"; } catch (_) { return "1W"; } }
  function resolveFunction(name) { return window.BtcDash.analysis?.[name] || window[name]; }
  function registerPipelineStep(step) { if (!step?.name || typeof step.run !== "function") return null; const i = pipelineSteps.findIndex((x) => x.name === step.name); if (i >= 0) pipelineSteps.splice(i, 1, step); else pipelineSteps.push(step); return step; }
  function getPipelineSteps() { return pipelineSteps.slice(); }
  function getPipelineStatus() { return { ...pipelineStatus, steps: pipelineStatus.steps.slice(), warnings: pipelineStatus.warnings.slice(), errors: pipelineStatus.errors.slice() }; }
  function getPerformanceSnapshot() { return { ...performanceSnapshot, stepDurations: { ...performanceSnapshot.stepDurations }, skippedSteps: performanceSnapshot.skippedSteps.slice(), slowSteps: performanceSnapshot.slowSteps.slice(), changedTimeframes: performanceSnapshot.changedTimeframes.slice() }; }
  function runNamedAnalysisFunction(name, args = []) { const fn = resolveFunction(name); if (typeof fn !== "function") return { skipped: true, message: `${name} is not available` }; fn(...args); return { skipped: false, message: `${name} completed` }; }
  function hashTimeframe(tf) { const rows = window.BtcDash.state?.marketData?.[tf] || []; const last = rows.at(-1); return `${tf}:${rows.length}:${last?.open_time || last?.time || ""}:${last?.close_time || ""}:${last?.close || ""}`; }
  function shouldRenderOnly(reason) { return /layer-toggle|bottom-tab-switch|workspace-switch|range-change|render-only|running-candle/i.test(reason || ""); }

  function setMarketZonesContext(context) { const state = window.BtcDash.state; if (state) state.marketZonesContext = context; try { marketZonesContext = context; } catch (_) {} }
  function runPipelineStep(step, context) {
    const startMs = nowMs();
    const record = { name: step.name, available: true, status: "pending", startedAt: new Date().toISOString(), finishedAt: null, durationMs: 0, message: "" };
    try {
      const available = typeof step.available === "function" ? Boolean(step.available(context)) : true;
      record.available = available;
      if (!available) { record.status = "skipped"; record.message = "Step function is not available"; return record; }
      const result = step.run(context) || {};
      record.status = result.status || (result.skipped ? "skipped" : "success");
      record.message = result.message || record.status;
      if (record.status === "warning") pipelineStatus.warnings.push(`${step.name}: ${record.message}`);
      return record;
    } catch (error) {
      record.status = "failed"; record.message = error.message; pipelineStatus.errors.push(`${step.name}: ${error.message}`); console.warn(`[Pipeline] ${step.name} failed`, error); return record;
    } finally {
      record.finishedAt = new Date().toISOString(); record.durationMs = Number((nowMs() - startMs).toFixed(1));
      if (record.durationMs > (perf().debug?.slowStepMs || 150)) pipelineStatus.warnings.push(`${step.name} slow: ${record.durationMs}ms`);
    }
  }

  function startStatus(context) { pipelineStatus = { lastRunAt: new Date().toISOString(), reason: context.reason, activeTimeframe: context.activeTimeframe, changedTimeframes: context.changedTimeframes || [], steps: [], warnings: [], errors: [] }; }
  function finishSnapshot(context, started) { const stepDurations = {}; const skippedSteps = []; const slowSteps = []; pipelineStatus.steps.forEach((s) => { stepDurations[s.name] = s.durationMs; if (s.status === "skipped") skippedSteps.push(s.name); if (s.durationMs > (perf().debug?.slowStepMs || 150)) slowSteps.push(s.name); }); performanceSnapshot = { lastRunAt: pipelineStatus.lastRunAt, totalDurationMs: Number((nowMs() - started).toFixed(1)), stepDurations, skippedSteps, slowSteps, rebuildReason: context.reason, changedTimeframes: context.changedTimeframes || [] }; }

  function rebuildAllAnalysis(options = {}) {
    const reason = options.reason || "manual";
    if (shouldRenderOnly(reason)) return renderOnly(reason);
    const changedTimeframes = options.changedTimeframes || ["1W", "1D", "4H", "1H"];
    const hash = changedTimeframes.map(hashTimeframe).join("|");
    if (perf().rebuild?.skipIfInputHashUnchanged && options.reason !== "manual" && lastHashes.all === hash) return { ...getPipelineStatus(), skipped: true, reason, message: "Skipped unchanged analysis input" };
    lastHashes.all = hash;
    const context = { reason, activeTimeframe: options.activeTimeframe || getActiveTimeframeSafe(), changedTimeframes, render: options.render !== false, mode: options.mode || "full" };
    const started = nowMs(); startStatus(context);
    pipelineSteps.forEach((step) => { const result = runPipelineStep(step, context); pipelineStatus.steps.push(result); });
    finishSnapshot(context, started); return getPipelineStatus();
  }

  function rebuildForChangedTimeframes(timeframes = [], options = {}) {
    const unique = [...new Set((timeframes || []).filter(Boolean))];
    if (!unique.length) return renderOnly(options.reason || "no-closed-candle-change");
    const context = { reason: options.reason || "changed-timeframes", activeTimeframe: options.activeTimeframe || unique[0] || getActiveTimeframeSafe(), changedTimeframes: unique, render: options.render !== false, mode: "incremental" };
    const hash = unique.map(hashTimeframe).join("|");
    if (perf().rebuild?.skipIfInputHashUnchanged && lastHashes[unique.join(",")] === hash) return { ...getPipelineStatus(), skipped: true, reason: context.reason, message: "Skipped unchanged timeframes" };
    lastHashes[unique.join(",")] = hash;
    const started = nowMs(); startStatus(context);
    pipelineSteps.forEach((step) => { const result = runPipelineStep(step, context); pipelineStatus.steps.push(result); });
    finishSnapshot(context, started); return getPipelineStatus();
  }

  function rebuildForTimeframe(activeTimeframe, options = {}) { return rebuildForChangedTimeframes([activeTimeframe || getActiveTimeframeSafe()], { ...options, reason: options.reason || "timeframe-change" }); }
  function renderOnly(reason = "render-only") { const context = { reason, activeTimeframe: getActiveTimeframeSafe(), changedTimeframes: [], render: true, mode: "render-only" }; const started = nowMs(); startStatus(context); const ui = pipelineSteps.find((s) => s.name === "UI Render"); if (ui) pipelineStatus.steps.push(runPipelineStep(ui, context)); finishSnapshot(context, started); return getPipelineStatus(); }
  function rerenderActiveView(reason = "active-view") { window.BtcDash.ui?.renderWorkspace?.(); window.BtcDash.ui?.renderDetail?.(); return renderOnly(reason); }
  function debounceRebuild(fn, delay = perf().rebuild?.debounceMs || 120) { clearTimeout(pendingTimer); pendingTimer = setTimeout(fn, delay); return pendingTimer; }

  registerPipelineStep({ name: "Data Ready", run: () => ({ status: "success", message: "Closed-candle data state ready" }) });
  registerPipelineStep({ name: "Structure", available: () => typeof window.BtcDash.engines?.structure?.rebuildStructureContexts === "function" || typeof resolveFunction("rebuildAllStructureContexts") === "function", run: (ctx) => { const e = window.BtcDash.engines?.structure; if (ctx.mode === "incremental" && typeof e?.rebuildStructureForTimeframe === "function") ctx.changedTimeframes.forEach((tf) => e.rebuildStructureForTimeframe(tf, { reason: ctx.reason })); else if (typeof e?.rebuildStructureContexts === "function") e.rebuildStructureContexts({ reason: ctx.reason }); else return runNamedAnalysisFunction("rebuildAllStructureContexts"); return { status: "success", message: "Structure contexts rebuilt" }; } });
  registerPipelineStep({ name: "Liquidity", available: () => typeof window.BtcDash.engines?.liquidity?.rebuildLiquidityContexts === "function", run: (ctx) => { const e = window.BtcDash.engines.liquidity; if (ctx.mode === "incremental" && typeof e.rebuildLiquidityForTimeframe === "function") ctx.changedTimeframes.forEach((tf) => e.rebuildLiquidityForTimeframe(tf, { reason: ctx.reason })); else e.rebuildLiquidityContexts({ reason: ctx.reason }); return { status: "success", message: "Liquidity contexts rebuilt" }; } });
  registerPipelineStep({ name: "S/R", available: () => typeof window.BtcDash.engines?.sr?.rebuildSrContexts === "function" || typeof resolveFunction("rebuildAllSrContexts") === "function", run: (ctx) => { const e = window.BtcDash.engines?.sr; if (ctx.mode === "incremental" && typeof e?.rebuildSrForTimeframe === "function") ctx.changedTimeframes.forEach((tf) => e.rebuildSrForTimeframe(tf, { reason: ctx.reason })); else if (typeof e?.rebuildSrContexts === "function") e.rebuildSrContexts({ reason: ctx.reason }); else return runNamedAnalysisFunction("rebuildAllSrContexts"); return { status: "success", message: "S/R contexts rebuilt" }; } });
  registerPipelineStep({ name: "FVG", available: () => typeof window.BtcDash.engines?.fvg?.rebuildFvgContexts === "function" || typeof resolveFunction("rebuildAllFvgContexts") === "function", run: (ctx) => { const e = window.BtcDash.engines?.fvg; if (ctx.mode === "incremental" && typeof e?.rebuildFvgForTimeframe === "function") ctx.changedTimeframes.forEach((tf) => e.rebuildFvgForTimeframe(tf, { reason: ctx.reason })); else if (typeof e?.rebuildFvgContexts === "function") e.rebuildFvgContexts({ reason: ctx.reason }); else return runNamedAnalysisFunction("rebuildAllFvgContexts"); return { status: "success", message: "FVG contexts rebuilt" }; } });
  registerPipelineStep({ name: "Channel", available: () => typeof window.BtcDash.engines?.channel?.rebuildChannelContexts === "function" || typeof resolveFunction("rebuildAllChannelContexts") === "function", run: (ctx) => { const e = window.BtcDash.engines?.channel; if (ctx.mode === "incremental" && typeof e?.rebuildChannelForTimeframe === "function") ctx.changedTimeframes.forEach((tf) => e.rebuildChannelForTimeframe(tf, { reason: ctx.reason })); else if (typeof e?.rebuildChannelContexts === "function") e.rebuildChannelContexts({ reason: ctx.reason }); else return runNamedAnalysisFunction("rebuildAllChannelContexts"); return { status: "success", message: "Channel contexts rebuilt" }; } });
  registerPipelineStep({ name: "Market Zones Base", available: () => typeof resolveFunction("buildMarketZonesContext") === "function", run: (ctx) => { setMarketZonesContext(resolveFunction("buildMarketZonesContext")(ctx.activeTimeframe)); return { status: "success", message: "Market zones base rebuilt" }; } });
  registerPipelineStep({ name: "Confluence", available: () => typeof resolveFunction("rebuildConfluenceContext") === "function", run: (ctx) => runNamedAnalysisFunction("rebuildConfluenceContext", [ctx.activeTimeframe]) });
  registerPipelineStep({ name: "Scenario", available: () => typeof resolveFunction("rebuildScenarioContext") === "function", run: (ctx) => runNamedAnalysisFunction("rebuildScenarioContext", [ctx.activeTimeframe]) });
  registerPipelineStep({ name: "Risk", run: () => ({ status: "success", message: "Risk plan is rebuilt inside Scenario step" }) });
  registerPipelineStep({ name: "Reaction", available: () => typeof resolveFunction("rebuildReactionStudyContext") === "function", run: (ctx) => runNamedAnalysisFunction("rebuildReactionStudyContext", [ctx.activeTimeframe]) });
  registerPipelineStep({ name: "Market Zones Enriched", run: () => ({ status: "success", message: "Market zones enrichment preserved from existing contexts" }) });
  registerPipelineStep({ name: "Audit Quality", available: () => typeof window.BtcDash.engines?.auditQuality?.runAuditQuality === "function", run: () => { const context = window.BtcDash.engines.auditQuality.runAuditQuality({ reason: "pipeline", triggeredByPipeline: true, includeDeepScan: false, mode: "light" }); return { status: context?.status === "Critical" ? "warning" : "success", message: `Audit Quality light: ${context?.status || "Not Run"}` }; } });
  registerPipelineStep({ name: "UI Render", available: (ctx) => !ctx.render || typeof window.BtcDash.ui?.renderDashboardUi === "function" || typeof window.BtcDash.ui?.renderAll === "function" || typeof window.renderAll === "function", run: (ctx) => { if (!ctx.render) return { status: "skipped", message: "Render skipped by caller" }; const render = window.BtcDash.ui?.renderDashboardUi || window.BtcDash.ui?.renderAll || window.renderAll; if (typeof render !== "function") return { status: "skipped", message: "renderAll is not available" }; render(ctx.mode === "render-only" ? { activeOnly: true } : undefined); return { status: "success", message: "UI rendered" }; } });

  Object.assign(window.BtcDash.pipeline, { rebuildAllAnalysis, rebuildForTimeframe, rebuildForChangedTimeframes, renderOnly, rerenderActiveView, debounceRebuild, registerPipelineStep, getPipelineSteps, getPipelineStatus, getPerformanceSnapshot });
  window.BtcDash.engines.rebuildAllAnalysis = rebuildAllAnalysis; window.BtcDash.engines.rebuildForTimeframe = rebuildForTimeframe;
  if (window.BtcDash.analysis) { window.BtcDash.analysis.rebuildAllAnalysis = rebuildAllAnalysis; window.BtcDash.analysis.rebuildForTimeframe = rebuildForTimeframe; }
  window.rebuildAllAnalysis = rebuildAllAnalysis; window.rebuildForTimeframe = rebuildForTimeframe;
})();
