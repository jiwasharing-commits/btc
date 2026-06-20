(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.pipeline = window.BtcDash.pipeline || {};
  window.BtcDash.engines = window.BtcDash.engines || {};

  const pipelineSteps = [];
  let pipelineStatus = {
    lastRunAt: null,
    reason: null,
    activeTimeframe: null,
    steps: [],
    warnings: [],
    errors: []
  };

  function getActiveTimeframeSafe() {
    try {
      const fromUtils = window.BtcDash.utils?.getActiveTimeframe?.();
      if (fromUtils) return fromUtils;
      if (typeof getActiveTimeframe === "function") return getActiveTimeframe();
    } catch (error) {
      console.warn("[Pipeline] Failed to read active timeframe", error);
    }
    return window.BtcDash.config?.DEFAULT_TIMEFRAME || "1W";
  }

  function resolveFunction(name) {
    return window.BtcDash.analysis?.[name] || window[name];
  }

  function registerPipelineStep(step) {
    if (!step?.name || typeof step.run !== "function") return null;
    const existingIndex = pipelineSteps.findIndex((item) => item.name === step.name);
    if (existingIndex >= 0) pipelineSteps.splice(existingIndex, 1, step);
    else pipelineSteps.push(step);
    return step;
  }

  function getPipelineSteps() {
    return pipelineSteps.slice();
  }

  function getPipelineStatus() {
    return {
      ...pipelineStatus,
      steps: pipelineStatus.steps.slice(),
      warnings: pipelineStatus.warnings.slice(),
      errors: pipelineStatus.errors.slice()
    };
  }

  function runNamedAnalysisFunction(name, args = []) {
    const fn = resolveFunction(name);
    if (typeof fn !== "function") return { skipped: true, message: `${name} is not available` };
    fn(...args);
    return { skipped: false, message: `${name} completed` };
  }

  function setMarketZonesContext(context) {
    const state = window.BtcDash.state;
    if (state) state.marketZonesContext = context;
    try { marketZonesContext = context; } catch (error) { /* global lexical fallback may not exist in tests */ }
  }

  function runPipelineStep(step, context) {
    const startedAt = new Date().toISOString();
    const startMs = performance.now();
    const record = {
      name: step.name,
      available: true,
      status: "pending",
      startedAt,
      finishedAt: null,
      durationMs: 0,
      message: ""
    };

    try {
      const available = typeof step.available === "function" ? Boolean(step.available(context)) : true;
      record.available = available;
      if (!available) {
        record.status = "skipped";
        record.message = "Step function is not available";
        return record;
      }

      const result = step.run(context) || {};
      record.status = result.status || (result.skipped ? "skipped" : "success");
      record.message = result.message || record.status;
      if (record.status === "warning") pipelineStatus.warnings.push(`${step.name}: ${record.message}`);
      return record;
    } catch (error) {
      record.status = "failed";
      record.message = error.message;
      pipelineStatus.errors.push(`${step.name}: ${error.message}`);
      console.warn(`[Pipeline] ${step.name} failed`, error);
      return record;
    } finally {
      record.finishedAt = new Date().toISOString();
      record.durationMs = Number((performance.now() - startMs).toFixed(1));
    }
  }

  function rebuildAllAnalysis(options = {}) {
    const context = {
      reason: options.reason || "manual",
      activeTimeframe: options.activeTimeframe || getActiveTimeframeSafe(),
      render: options.render !== false
    };

    pipelineStatus = {
      lastRunAt: new Date().toISOString(),
      reason: context.reason,
      activeTimeframe: context.activeTimeframe,
      steps: [],
      warnings: [],
      errors: []
    };

    pipelineSteps.forEach((step) => {
      const result = runPipelineStep(step, context);
      pipelineStatus.steps.push(result);
    });

    return getPipelineStatus();
  }

  function rebuildForTimeframe(activeTimeframe, options = {}) {
    return rebuildAllAnalysis({
      ...options,
      activeTimeframe: activeTimeframe || getActiveTimeframeSafe(),
      reason: options.reason || "timeframe-change"
    });
  }

  registerPipelineStep({
    name: "Data Ready",
    run: () => ({ status: "success", message: "Closed-candle data state ready" })
  });
  registerPipelineStep({
    name: "Structure",
    available: () => typeof window.BtcDash.engines?.structure?.rebuildStructureContexts === "function" || typeof resolveFunction("rebuildAllStructureContexts") === "function",
    run: () => {
      const structureEngine = window.BtcDash.engines?.structure;
      if (typeof structureEngine?.rebuildStructureContexts === "function") {
        structureEngine.rebuildStructureContexts({ reason: "pipeline" });
        return { status: "success", message: "Structure V2 contexts rebuilt" };
      }
      return runNamedAnalysisFunction("rebuildAllStructureContexts");
    }
  });
  registerPipelineStep({
    name: "Liquidity",
    available: () => typeof window.BtcDash.engines?.liquidity?.rebuildLiquidityContexts === "function",
    run: () => {
      window.BtcDash.engines.liquidity.rebuildLiquidityContexts({ reason: "pipeline" });
      return { status: "success", message: "Liquidity V2 contexts rebuilt" };
    }
  });
  registerPipelineStep({
    name: "S/R",
    available: () => typeof window.BtcDash.engines?.sr?.rebuildSrContexts === "function" || typeof resolveFunction("rebuildAllSrContexts") === "function",
    run: () => {
      if (typeof window.BtcDash.engines?.sr?.rebuildSrContexts === "function") {
        window.BtcDash.engines.sr.rebuildSrContexts({ reason: "pipeline" });
        return { status: "success", message: "S/R V2.1 contexts rebuilt" };
      }
      return runNamedAnalysisFunction("rebuildAllSrContexts");
    }
  });
  registerPipelineStep({
    name: "FVG",
    available: () => typeof resolveFunction("rebuildAllFvgContexts") === "function",
    run: () => runNamedAnalysisFunction("rebuildAllFvgContexts")
  });
  registerPipelineStep({
    name: "Channel",
    available: () => typeof resolveFunction("rebuildAllChannelContexts") === "function",
    run: () => runNamedAnalysisFunction("rebuildAllChannelContexts")
  });
  registerPipelineStep({
    name: "Market Zones Base",
    available: () => typeof resolveFunction("buildMarketZonesContext") === "function",
    run: (context) => {
      const nextContext = resolveFunction("buildMarketZonesContext")(context.activeTimeframe);
      setMarketZonesContext(nextContext);
      return { status: "success", message: "Market zones base rebuilt" };
    }
  });
  registerPipelineStep({
    name: "Confluence",
    available: () => typeof resolveFunction("rebuildConfluenceContext") === "function",
    run: (context) => runNamedAnalysisFunction("rebuildConfluenceContext", [context.activeTimeframe])
  });
  registerPipelineStep({
    name: "Scenario",
    available: () => typeof resolveFunction("rebuildScenarioContext") === "function",
    run: (context) => runNamedAnalysisFunction("rebuildScenarioContext", [context.activeTimeframe])
  });
  registerPipelineStep({
    name: "Risk",
    run: () => ({ status: "success", message: "Risk plan is rebuilt inside Scenario step" })
  });
  registerPipelineStep({
    name: "Reaction",
    available: () => typeof resolveFunction("rebuildReactionStudyContext") === "function",
    run: (context) => runNamedAnalysisFunction("rebuildReactionStudyContext", [context.activeTimeframe])
  });
  registerPipelineStep({
    name: "Market Zones Enriched",
    run: () => ({ status: "success", message: "Market zones enrichment preserved from existing contexts" })
  });
  registerPipelineStep({
    name: "Audit Quality",
    available: () => typeof window.BtcDash.engines?.auditQuality?.runAuditQuality === "function",
    run: () => {
      const context = window.BtcDash.engines.auditQuality.runAuditQuality({ reason: "pipeline", triggeredByPipeline: true });
      return { status: context?.status === "Critical" ? "warning" : "success", message: `Audit Quality: ${context?.status || "Not Run"}` };
    }
  });
  registerPipelineStep({
    name: "UI Render",
    available: (context) => !context.render || typeof window.BtcDash.ui?.renderDashboardUi === "function" || typeof window.BtcDash.ui?.renderAll === "function" || typeof window.renderAll === "function",
    run: (context) => {
      if (!context.render) return { status: "skipped", message: "Render skipped by caller" };
      const render = window.BtcDash.ui?.renderDashboardUi || window.BtcDash.ui?.renderAll || window.renderAll;
      if (typeof render !== "function") return { status: "skipped", message: "renderAll is not available" };
      render();
      return { status: "success", message: "UI rendered" };
    }
  });

  Object.assign(window.BtcDash.pipeline, {
    rebuildAllAnalysis,
    rebuildForTimeframe,
    registerPipelineStep,
    getPipelineSteps,
    getPipelineStatus
  });

  window.BtcDash.engines.rebuildAllAnalysis = rebuildAllAnalysis;
  window.BtcDash.engines.rebuildForTimeframe = rebuildForTimeframe;
  if (window.BtcDash.analysis) {
    window.BtcDash.analysis.rebuildAllAnalysis = rebuildAllAnalysis;
    window.BtcDash.analysis.rebuildForTimeframe = rebuildForTimeframe;
  }
  window.rebuildAllAnalysis = rebuildAllAnalysis;
  window.rebuildForTimeframe = rebuildForTimeframe;
})();
