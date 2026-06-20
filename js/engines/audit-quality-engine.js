(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.engines = window.BtcDash.engines || {};

  const CATEGORY_LIMIT_KEYS = ["data", "running_candle", "context", "score", "rebuild", "overlay", "autoscale", "market_zone", "mtf", "performance"];

  function cfg() { return window.BtcDash.config?.AUDIT_QUALITY_CONFIG || {}; }
  function state() { return window.BtcDash.state || {}; }
  function nowIso() { return new Date().toISOString(); }
  function slug(value) { return String(value || "audit").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60); }

  function createAuditIssue({ severity = "info", category = "context", timeframe = null, engine = null, message = "Audit issue", detail = null, value = null, expected = null, path = null, suggestion = null } = {}) {
    const createdAt = nowIso();
    return { id: `${slug(category)}-${slug(timeframe || engine || "global")}-${slug(message)}-${Date.now().toString(36)}`, severity, category, timeframe, engine, message, detail, value, expected, path, createdAt, suggestion };
  }

  function createEmptyAuditQualityContext(reason = "Audit not run") {
    return { available: false, status: "Not Run", severity: "info", lastRunAt: null, lastRunReason: reason, summary: { criticalCount: 0, warningCount: 0, infoCount: 0, totalIssues: 0 }, dataAudit: {}, runningCandleAudit: {}, contextAudit: {}, scoreAudit: {}, rebuildAudit: {}, overlayAudit: {}, autoscaleAudit: {}, marketZoneAudit: {}, mtfAudit: {}, performanceAudit: {}, issues: [], criticalIssues: [], warningIssues: [], infoIssues: [], debugStats: {}, message: reason };
  }

  function safeDeepScan(root, visitor, options = {}) {
    const rules = cfg().safeScanRules || {};
    const maxDepth = options.maxDepth ?? rules.maxDepth ?? 8;
    const maxItemsPerArray = options.maxItemsPerArray ?? rules.maxItemsPerArray ?? 250;
    const visited = new WeakSet();
    function scan(value, path = "root", depth = 0) {
      if (depth > maxDepth || value === null || value === undefined) return;
      if (typeof value === "function") return;
      if (typeof Element !== "undefined" && value instanceof Element) return;
      if (typeof value === "object") {
        if (visited.has(value)) return;
        visited.add(value);
      }
      visitor(value, path, depth);
      if (Array.isArray(value)) value.slice(0, maxItemsPerArray).forEach((item, index) => scan(item, `${path}[${index}]`, depth + 1));
      else if (typeof value === "object") Object.keys(value).slice(0, maxItemsPerArray).forEach((key) => scan(value[key], `${path}.${key}`, depth + 1));
    }
    scan(root);
  }

  function auditMarketDataIntegrity() {
    const issues = [];
    const stats = {};
    const data = state().marketData || {};
    const rules = cfg().dataRules || {};
    (cfg().timeframes || ["1W", "1D", "4H", "1H"]).forEach((timeframe) => {
      const candles = data[timeframe];
      const tfStats = { timeframe, candleCount: Array.isArray(candles) ? candles.length : 0, duplicateCount: 0, outOfOrderCount: 0, invalidOhlcCount: 0, negativeVolumeCount: 0 };
      stats[timeframe] = tfStats;
      if (!Array.isArray(candles) || !candles.length) {
        issues.push(createAuditIssue({ severity: "critical", category: "data", timeframe, engine: "Data", message: "Market data is empty", expected: "Closed candle array" }));
        return;
      }
      if (candles.length < (rules.minCandles?.[timeframe] || 0)) issues.push(createAuditIssue({ severity: "warning", category: "data", timeframe, engine: "Data", message: "Candle count below audit minimum", value: candles.length, expected: rules.minCandles?.[timeframe] }));
      const seen = new Set();
      let prevTime = -Infinity;
      candles.forEach((candle, index) => {
        if (!candle) { issues.push(createAuditIssue({ severity: "critical", category: "data", timeframe, engine: "Data", message: "Null candle object", path: `state.marketData.${timeframe}[${index}]` })); return; }
        const openTime = Number(candle.open_time ?? Date.parse(candle.time));
        if (!Number.isFinite(openTime)) issues.push(createAuditIssue({ severity: "critical", category: "data", timeframe, engine: "Data", message: "Invalid candle time", path: `state.marketData.${timeframe}[${index}]` }));
        if (seen.has(openTime)) { tfStats.duplicateCount += 1; issues.push(createAuditIssue({ severity: "critical", category: "data", timeframe, engine: "Data", message: "Duplicate candle time", value: openTime, path: `state.marketData.${timeframe}[${index}]` })); }
        seen.add(openTime);
        if (openTime < prevTime) { tfStats.outOfOrderCount += 1; issues.push(createAuditIssue({ severity: "critical", category: "data", timeframe, engine: "Data", message: "Candle out of order", value: openTime, expected: `>= ${prevTime}`, path: `state.marketData.${timeframe}[${index}]` })); }
        prevTime = Math.max(prevTime, openTime);
        const o = Number(candle.open), h = Number(candle.high), l = Number(candle.low), c = Number(candle.close);
        if (![o, h, l, c].every(Number.isFinite) || h < l || o < l || o > h || c < l || c > h) { tfStats.invalidOhlcCount += 1; issues.push(createAuditIssue({ severity: "critical", category: "data", timeframe, engine: "Data", message: "Invalid OHLC candle", path: `state.marketData.${timeframe}[${index}]` })); }
        if (Number(candle.volume) < 0) { tfStats.negativeVolumeCount += 1; issues.push(createAuditIssue({ severity: "warning", category: "data", timeframe, engine: "Data", message: "Negative candle volume", path: `state.marketData.${timeframe}[${index}]` })); }
        if (candle.isRunning || candle.is_running_preview || candle.isClosed === false || candle.isFinal === false) issues.push(createAuditIssue({ severity: "critical", category: "running_candle", timeframe, engine: "Data", message: "Running candle marker detected inside marketData", path: `state.marketData.${timeframe}[${index}]`, expected: "Closed candles only" }));
      });
    });
    return { status: issues.some((x) => x.severity === "critical") ? "Critical" : issues.length ? "Warning" : "OK", issues, stats };
  }

  function looksRunning(value) {
    if (!value || typeof value !== "object") return false;
    if (value.isRunning === true || value.isClosed === false || value.isFinal === false || value.x === false || value.is_running_preview === true) return true;
    return [value.source, value.status, value.label, value.note, value.summary].filter(Boolean).some((text) => /running|preview|live/i.test(String(text)));
  }

  function auditRunningCandleLeak() {
    const issues = [];
    const contexts = cfg().runningCandleRules?.forbiddenAnalysisContexts || [];
    contexts.forEach((contextName) => {
      const root = state()[contextName];
      if (!root) return;
      safeDeepScan(root, (value, path) => {
        if (looksRunning(value)) issues.push(createAuditIssue({ severity: "critical", category: "running_candle", engine: contextName, message: "Running candle marker detected inside analysis context", path: `state.${contextName}${path.replace(/^root/, "")}`, expected: "Analysis contexts must use closed candles only", suggestion: "Keep running candle in preview/chart state only." }));
      });
    });
    return { status: issues.length ? "Critical" : "OK", issues, scannedContexts: contexts.length };
  }

  function auditContextShapes() {
    const issues = [];
    const required = cfg().contextRules?.requiredByContext || {};
    Object.entries(required).forEach(([contextName, fields]) => {
      const root = contextName === "marketZoneContexts" ? state().marketZonesContext : state()[contextName];
      if (!root) { issues.push(createAuditIssue({ severity: "warning", category: "context", engine: contextName, message: "Context missing", path: `state.${contextName}` })); return; }
      const contexts = root && typeof root === "object" && !Array.isArray(root) && ["1W", "1D", "4H", "1H"].some((tf) => root[tf]) ? Object.entries(root) : [[root.timeframe || "active", root]];
      contexts.forEach(([timeframe, context]) => {
        if (!context || typeof context !== "object") { issues.push(createAuditIssue({ severity: "warning", category: "context", timeframe, engine: contextName, message: "Context is not an object" })); return; }
        fields.forEach((field) => { if (!(field in context)) issues.push(createAuditIssue({ severity: context.available ? "warning" : "info", category: "context", timeframe, engine: contextName, message: "Required context field missing", path: `state.${contextName}.${timeframe}.${field}`, expected: field })); });
        if (context.available === true && !context.summary && !context.status) issues.push(createAuditIssue({ severity: "warning", category: "context", timeframe, engine: contextName, message: "Available context has no summary/status" }));
      });
    });
    return { status: issues.some((x) => x.severity === "warning") ? "Warning" : "OK", issues };
  }

  function auditScoreSanity() {
    const issues = [];
    const keys = cfg().scoreRules?.scoreKeys || [];
    const min = cfg().scoreRules?.minScore ?? 0;
    const max = cfg().scoreRules?.maxScore ?? 10;
    ["confluenceContext", "scenarioContext", "reactionStudyContext", "marketZonesContext"].forEach((name) => {
      safeDeepScan(state()[name], (value, path) => {
        if (!value || typeof value !== "object") return;
        keys.forEach((key) => {
          if (!(key in value)) return;
          const score = Number(value[key]);
          if (!Number.isFinite(score)) issues.push(createAuditIssue({ severity: "critical", category: "score", engine: name, message: "Score is not finite", path: `state.${name}${path.replace(/^root/, "")}.${key}`, value: value[key] }));
          else if (score < min || score > max) issues.push(createAuditIssue({ severity: "warning", category: "score", engine: name, message: "Score outside audit range", path: `state.${name}${path.replace(/^root/, "")}.${key}`, value: score, expected: `${min}-${max}` }));
        });
      });
    });
    return { status: issues.some((x) => x.severity === "critical") ? "Critical" : issues.length ? "Warning" : "OK", issues };
  }

  function auditRebuildPipeline() {
    const issues = [];
    const status = window.BtcDash.pipeline?.getPipelineStatus?.();
    const stepNames = (status?.steps || []).map((step) => step.name);
    const ideal = cfg().rebuildRules?.idealPipeline || [];
    if (!status) issues.push(createAuditIssue({ severity: "warning", category: "rebuild", engine: "Pipeline", message: "Pipeline status unavailable" }));
    if (status && ideal.length && stepNames.length) {
      ideal.forEach((name, index) => { if (stepNames[index] !== name) issues.push(createAuditIssue({ severity: "warning", category: "rebuild", engine: "Pipeline", message: "Pipeline order differs from ideal", value: stepNames[index], expected: name, path: `pipeline.steps[${index}]` })); });
      (status.steps || []).filter((step) => step.status === "failed").forEach((step) => issues.push(createAuditIssue({ severity: "critical", category: "rebuild", engine: "Pipeline", message: "Pipeline step failed", detail: step.message, path: step.name })));
    }
    const history = state().auditRuntime?.rebuildHistory || [];
    const recent = history.filter((item) => Date.now() - item.at < 1000);
    if (recent.length > (cfg().rebuildRules?.maxRebuildsPerSecond || 4)) issues.push(createAuditIssue({ severity: "warning", category: "rebuild", engine: "Pipeline", message: "Rebuild frequency above audit threshold", value: recent.length }));
    return { status: issues.some((x) => x.severity === "critical") ? "Critical" : issues.length ? "Warning" : "OK", issues, stepNames };
  }

  function auditOverlayRegistry() {
    const issues = [];
    const registry = window.BtcDash.chart?.overlayRegistry;
    if (!registry) return { status: "Warning", issues: [createAuditIssue({ severity: "warning", category: "overlay", engine: "Overlay Registry", message: "Overlay registry unavailable" })] };
    const snapshot = registry.getOverlaySnapshot?.() || registry.snapshotOverlayRegistry?.() || [];
    const duplicates = registry.getDuplicateOverlayKeys?.() || [];
    duplicates.forEach((item) => issues.push(createAuditIssue({ severity: "warning", category: "overlay", engine: "Overlay Registry", message: "Duplicate overlay key", value: item.key })));
    snapshot.forEach((overlay, index) => {
      if (!overlay.layer) issues.push(createAuditIssue({ severity: "warning", category: "overlay", engine: "Overlay Registry", message: "Overlay missing layer", path: `overlay[${index}]` }));
      if (!overlay.timeframe) issues.push(createAuditIssue({ severity: "warning", category: "overlay", engine: "Overlay Registry", message: "Overlay missing timeframe", path: `overlay[${index}]` }));
    });
    (registry.getLayerOffResidue?.(state().chartRuntime?.layerState || {}) || []).forEach((overlay) => issues.push(createAuditIssue({ severity: "critical", category: "overlay", engine: "Overlay Registry", message: "Layer OFF still has registered overlay", value: overlay.key, expected: "Layer OFF clears registry" })));
    const stats = registry.getOverlayStats?.() || { total: snapshot.length, byLayer: {} };
    Object.entries(stats.byLayer || {}).forEach(([layer, count]) => { const max = cfg().overlayRules?.maxOverlayCountByLayer?.[layer]; if (max && count > max) issues.push(createAuditIssue({ severity: "warning", category: "overlay", engine: "Overlay Registry", message: "Overlay count above layer limit", value: count, expected: max, path: layer })); });
    return { status: issues.some((x) => x.severity === "critical") ? "Critical" : issues.length ? "Warning" : "OK", issues, stats };
  }

  function auditAutoscaleRisk() {
    const issues = [];
    const guard = window.BtcDash.chart?.autoscaleGuard;
    const overlays = window.BtcDash.chart?.overlayRegistry?.getOverlaySnapshot?.() || [];
    overlays.forEach((overlay) => {
      const risk = guard?.getAutoscaleRiskForOverlay?.(overlay, overlay.timeframe);
      if (!risk) return;
      if (!Number.isFinite(risk.distancePct) && overlay.price !== null) issues.push(createAuditIssue({ severity: "warning", category: "autoscale", timeframe: overlay.timeframe, engine: "Autoscale", message: "Overlay has invalid price for autoscale", value: overlay.price }));
      if (risk.isFar && overlay.drawPolicy === "show") issues.push(createAuditIssue({ severity: "warning", category: "autoscale", timeframe: overlay.timeframe, engine: "Autoscale", message: "Far overlay still uses show draw policy", value: risk.distancePct, expected: "summaryOnly or hide" }));
    });
    return { status: issues.length ? "Warning" : "OK", issues, checked: overlays.length };
  }

  function auditMarketZoneQuality() {
    const issues = [];
    const ctx = state().marketZonesContext || {};
    const rules = cfg().marketZoneRules || {};
    if ((ctx.upside || []).length > rules.maxUpsideWatch) issues.push(createAuditIssue({ severity: "warning", category: "market_zone", engine: "Market Zones", message: "Upside watch exceeds UI limit", value: ctx.upside.length, expected: rules.maxUpsideWatch }));
    if ((ctx.downside || []).length > rules.maxDownsideWatch) issues.push(createAuditIssue({ severity: "warning", category: "market_zone", engine: "Market Zones", message: "Downside watch exceeds UI limit", value: ctx.downside.length, expected: rules.maxDownsideWatch }));
    const seen = new Set();
    [...(ctx.upside || []), ...(ctx.downside || [])].forEach((row) => { const key = `${Math.round(Number(row.lower || row.midpoint || 0))}-${Math.round(Number(row.upper || row.midpoint || 0))}-${row.zoneType}`; if (seen.has(key)) issues.push(createAuditIssue({ severity: "warning", category: "market_zone", engine: "Market Zones", message: "Duplicate market zone row", value: key })); seen.add(key); if (looksRunning(row)) issues.push(createAuditIssue({ severity: "critical", category: "running_candle", engine: "Market Zones", message: "Running marker detected in market zones", value: row.label })); });
    return { status: issues.some((x) => x.severity === "critical") ? "Critical" : issues.length ? "Warning" : "OK", issues };
  }

  function auditMtfGuard() {
    const issues = [];
    const scenario = state().scenarioContext?.primaryScenario;
    if (scenario?.summary && /1H.*(macro|weekly|daily)/i.test(scenario.summary)) issues.push(createAuditIssue({ severity: "warning", category: "mtf", timeframe: "1H", engine: "Scenario", message: "Scenario summary may overuse 1H for higher timeframe context", expected: "1H remains timing-only" }));
    return { status: issues.length ? "Warning" : "OK", issues };
  }


  function auditStructureHierarchy() {
    const issues = [];
    const contexts = state().structureContexts || {};
    const fourH = contexts["4H"];
    const oneH = contexts["1H"];
    function warn(timeframe, message, path, value, expected) {
      issues.push(createAuditIssue({ severity: "warning", category: "context", timeframe, engine: "Structure", message, path, value, expected }));
    }
    function hasConsecutiveSameType(path = []) { return path.some((swing, index) => index > 0 && swing?.type === path[index - 1]?.type); }
    if (fourH?.available) {
      if (fourH.analysisSource !== "setupOperationalSwings") warn("4H", "4H operational path warning: analysisSource is not setupOperationalSwings.", "state.structureContexts.4H.analysisSource", fourH.analysisSource, "setupOperationalSwings");
      if (fourH.displaySource !== "setupOperationalSwings") warn("4H", "4H operational path warning: displaySource is not setupOperationalSwings.", "state.structureContexts.4H.displaySource", fourH.displaySource, "setupOperationalSwings");
      if ((fourH.setupOperationalSwings || []).length > 0 && (fourH.setupOperationalSwings || []).length < 6) warn("4H", "4H operational path warning: setupOperationalSwings count is low for visual continuity.", "state.structureContexts.4H.setupOperationalSwings", fourH.setupOperationalSwings.length, ">= 6");
      if (hasConsecutiveSameType(fourH.operationalSwingPath || [])) warn("4H", "4H operational path warning: consecutive same-type swing detected.", "state.structureContexts.4H.operationalSwingPath", "same-type", "alternating high-low path");
      if (/internal/i.test(String(fourH.protectedHigh?.id || fourH.protectedHigh?.sourceHierarchy || ""))) warn("4H", "Structure hierarchy warning: 4H protectedHigh uses internal swing. Expected setup operational swing.", "state.structureContexts.4H.protectedHigh", fourH.protectedHigh?.sourceHierarchy, "setupOperational");
      if (/internal/i.test(String(fourH.protectedLow?.id || fourH.protectedLow?.sourceHierarchy || ""))) warn("4H", "Structure hierarchy warning: 4H protectedLow uses internal swing. Expected setup operational swing.", "state.structureContexts.4H.protectedLow", fourH.protectedLow?.sourceHierarchy, "setupOperational");
      if (fourH.analysisSwings === fourH.internalSwings) warn("4H", "Structure hierarchy warning: 4H analysisSwings references internalSwings directly.", "state.structureContexts.4H.analysisSwings", fourH.analysisSource, "setupOperationalSwings");
      if ((fourH.displaySwings || []).length && (fourH.displaySwings || []).every((swing) => /internal/i.test(String(swing.hierarchy || swing.layer || swing.id)))) warn("4H", "Structure hierarchy warning: 4H displaySwings all come from internal hierarchy.", "state.structureContexts.4H.displaySwings", fourH.displaySource, "setupOperationalSwings");
      if (fourH.bosChoch?.status === "None" && /^(Bullish|Bearish) Setup$/.test(String(fourH.status))) warn("4H", "Structure status warning: final 4H bullish/bearish setup shown without close-confirmed BOS/CHoCH.", "state.structureContexts.4H.status", fourH.status, "Leaning/Range/Recovery wording");
      if (fourH.operationalBosChoch?.isCloseConfirmed && /wick|sweep/i.test(String(fourH.operationalBosChoch?.confirmation || fourH.operationalBosChoch?.status))) warn("4H", "4H BOS/CHoCH warning: wick-only break is marked close-confirmed.", "state.structureContexts.4H.operationalBosChoch", fourH.operationalBosChoch.confirmation, "Close-confirmed BOS or sweep-only event");
    }
    if (oneH?.available) {
      if (oneH.analysisSource !== "timingOperationalSwings") warn("1H", "1H operational path warning: analysisSource is not timingOperationalSwings.", "state.structureContexts.1H.analysisSource", oneH.analysisSource, "timingOperationalSwings");
      if (oneH.displaySource !== "timingOperationalSwings") warn("1H", "1H operational path warning: displaySource is not timingOperationalSwings.", "state.structureContexts.1H.displaySource", oneH.displaySource, "timingOperationalSwings");
      if (hasConsecutiveSameType(oneH.operationalSwingPath || [])) warn("1H", "1H operational path warning: consecutive same-type swing detected.", "state.structureContexts.1H.operationalSwingPath", "same-type", "alternating high-low path");
      if (oneH.protectedHigh && oneH.protectedHigh.isTimingOnly !== true) warn("1H", "Structure hierarchy warning: 1H protectedHigh must be timing-only.", "state.structureContexts.1H.protectedHigh", oneH.protectedHigh?.isTimingOnly, true);
      if (oneH.protectedLow && oneH.protectedLow.isTimingOnly !== true) warn("1H", "Structure hierarchy warning: 1H protectedLow must be timing-only.", "state.structureContexts.1H.protectedLow", oneH.protectedLow?.isTimingOnly, true);
      if (oneH.canOverrideHtf === true || oneH.protectedHigh?.canOverrideHtf === true || oneH.protectedLow?.canOverrideHtf === true) warn("1H", "1H operational path warning: timing structure attempted to override HTF.", "state.structureContexts.1H.canOverrideHtf", true, false);
      if (oneH.operationalBosChoch?.isCloseConfirmed && /wick|sweep/i.test(String(oneH.operationalBosChoch?.confirmation || oneH.operationalBosChoch?.status))) warn("1H", "1H BOS/CHoCH warning: wick-only break is marked close-confirmed.", "state.structureContexts.1H.operationalBosChoch", oneH.operationalBosChoch.confirmation, "Close-confirmed BOS or sweep-only event");
    }
    Object.entries(contexts).forEach(([timeframe, ctx]) => {
      (ctx?.analysisSwings || []).forEach((swing, index) => {
        if (!["HH", "HL", "LH", "LL"].includes(swing?.label)) return;
        if (!swing.comparedTo) warn(timeframe, "Structure classification warning: labeled swing missing comparedTo.", `state.structureContexts.${timeframe}.analysisSwings[${index}].comparedTo`, swing.id, "reference swing id");
        if (!swing.classificationReason) warn(timeframe, "Structure classification warning: labeled swing missing classificationReason.", `state.structureContexts.${timeframe}.analysisSwings[${index}].classificationReason`, swing.id, "reason text");
      });
    });
    return { status: issues.length ? "Warning" : "OK", issues };
  }


  function auditFvgBoundaryQuality() {
    const issues = [];
    const config = window.BtcDash.config?.FVG_BOUNDARY_DISPLAY_CONFIG || {};
    const maxVisible = config.visibleLimit?.maxTotalAll || 6;
    const contexts = state().fvgContexts || {};
    Object.entries(contexts).forEach(([timeframe, ctx]) => {
      const visible = ctx?.visibleBoundaryFvgs || ctx?.visibleFvgs || [];
      if (visible.length > maxVisible) issues.push(createAuditIssue({ severity: "warning", category: "overlay", timeframe, engine: "FVG", message: "FVG visual warning: visible FVG count above boundary limit", value: visible.length, expected: maxVisible }));
      visible.forEach((fvg, index) => {
        if (["filled", "mitigated", "invalidated", "historical", "Filled", "Mitigated"].includes(fvg.status)) issues.push(createAuditIssue({ severity: "warning", category: "overlay", timeframe, engine: "FVG", message: "FVG visual warning: filled/mitigated/historical FVG rendered on chart. Expected renderPolicy=hide.", value: fvg.status, path: `state.fvgContexts.${timeframe}.visibleBoundaryFvgs[${index}]` }));
        if (fvg.renderPolicy !== "boundary") issues.push(createAuditIssue({ severity: "warning", category: "overlay", timeframe, engine: "FVG", message: "FVG visual warning: visible FVG renderPolicy is not boundary", value: fvg.renderPolicy, expected: "boundary" }));
        if (fvg.hiddenReason === "distance") issues.push(createAuditIssue({ severity: "warning", category: "overlay", timeframe, engine: "FVG", message: "FVG visual warning: far FVG is visible", value: fvg.distancePct }));
      });
      if ((ctx?.suppressedFvgs || []).some((fvg) => visible.some((row) => row.id === fvg.id))) issues.push(createAuditIssue({ severity: "warning", category: "overlay", timeframe, engine: "FVG", message: "FVG visual warning: suppressed duplicate is still visible" }));
      const projectedCount = visible.filter((fvg) => fvg.isHTFProjection).length;
      const maxProjected = config.visibleLimit?.maxTotalProjected || 2;
      if (projectedCount > maxProjected) issues.push(createAuditIssue({ severity: "warning", category: "overlay", timeframe, engine: "FVG", message: "FVG visual warning: too many HTF projections visible", value: projectedCount, expected: maxProjected }));
    });
    const layerState = state().chartRuntime?.layerState || {};
    const fvgOverlayCount = window.BtcDash.chart?.overlayRegistry?.getOverlayCountByLayer?.("fvg") || 0;
    if (layerState.fvg === false && fvgOverlayCount > 0) issues.push(createAuditIssue({ severity: "critical", category: "overlay", engine: "FVG", message: "FVG layer OFF but overlay registry still has FVG overlays", value: fvgOverlayCount, expected: 0 }));
    return { status: issues.some((x) => x.severity === "critical") ? "Critical" : issues.length ? "Warning" : "OK", issues };
  }

  function auditPerformanceLimits() {
    const issues = [];
    const limits = cfg().performanceRules || {};
    Object.entries(state().structureContexts || {}).forEach(([tf, ctx]) => { if ((ctx?.labels || []).length > limits.maxRawPivotsPerTimeframe) issues.push(createAuditIssue({ severity: "warning", category: "performance", timeframe: tf, engine: "Structure", message: "Structure labels above limit", value: ctx.labels.length, expected: limits.maxRawPivotsPerTimeframe })); });
    Object.entries(state().fvgContexts || {}).forEach(([tf, ctx]) => { if ((ctx?.activeFvgs || []).length > limits.maxFvgsPerTimeframe) issues.push(createAuditIssue({ severity: "warning", category: "performance", timeframe: tf, engine: "FVG", message: "FVG count above limit", value: ctx.activeFvgs.length, expected: limits.maxFvgsPerTimeframe })); });
    const overlayCount = window.BtcDash.chart?.overlayRegistry?.getOverlayStats?.().total || 0;
    if (overlayCount > limits.maxOverlayRegistryItems) issues.push(createAuditIssue({ severity: "warning", category: "performance", engine: "Overlay Registry", message: "Overlay registry item count above limit", value: overlayCount, expected: limits.maxOverlayRegistryItems }));
    return { status: issues.length ? "Warning" : "OK", issues, overlayCount };
  }

  function limitIssues(issues) {
    const rules = cfg().safeScanRules || {};
    const byCategory = {};
    return issues.filter((issue) => {
      byCategory[issue.category] = (byCategory[issue.category] || 0) + 1;
      return byCategory[issue.category] <= (rules.maxIssuesPerCategory || 80);
    }).slice(0, rules.maxTotalIssues || 300);
  }

  function runAuditQuality(options = {}) {
    const started = performance.now();
    const config = cfg();
    const perfAudit = window.BtcDash.config?.PERFORMANCE_CONFIG?.audit || {};
    const isPipelineLight = options.triggeredByPipeline && options.includeDeepScan !== true && options.mode !== "deep";
    if (config.enabled === false) return createEmptyAuditQualityContext("Audit disabled");
    const runtime = state().auditRuntime;
    const at = Date.now();
    if (runtime) { runtime.runCount += 1; runtime.lastAuditRunAt = nowIso(); runtime.rebuildHistory = [...(runtime.rebuildHistory || []), { at, reason: options.reason || "manual" }].slice(-50); runtime.lastPipelineSnapshot = window.BtcDash.pipeline?.getPipelineStatus?.() || null; runtime.lastOverlaySnapshot = window.BtcDash.chart?.overlayRegistry?.getOverlaySnapshot?.() || []; runtime.lastLayerStateSnapshot = { ...(state().chartRuntime?.layerState || {}) }; }
    try {
      const dataAudit = auditMarketDataIntegrity();
      const runningCandleAudit = auditRunningCandleLeak();
      const contextAudit = auditContextShapes();
      const scoreAudit = auditScoreSanity();
      const rebuildAudit = auditRebuildPipeline();
      const overlayAudit = auditOverlayRegistry();
      const autoscaleAudit = isPipelineLight ? { issues: [] } : auditAutoscaleRisk();
      const marketZoneAudit = isPipelineLight ? { issues: [] } : auditMarketZoneQuality();
      const mtfAudit = isPipelineLight ? { issues: [] } : auditMtfGuard();
      const structureHierarchyAudit = auditStructureHierarchy();
      const fvgBoundaryAudit = auditFvgBoundaryQuality();
      const performanceAudit = auditPerformanceLimits();
      let issues = limitIssues([dataAudit, runningCandleAudit, contextAudit, scoreAudit, rebuildAudit, overlayAudit, autoscaleAudit, marketZoneAudit, mtfAudit, structureHierarchyAudit, fvgBoundaryAudit, performanceAudit].flatMap((x) => x.issues || []));
      if (isPipelineLight) issues = issues.slice(0, perfAudit.maxIssuesInNormalRun || 80);
      const criticalIssues = issues.filter((issue) => issue.severity === "critical");
      const warningIssues = issues.filter((issue) => issue.severity === "warning");
      const infoIssues = issues.filter((issue) => issue.severity === "info");
      const status = criticalIssues.length ? "Critical" : warningIssues.length ? "Warning" : "OK";
      const context = { available: true, status, severity: criticalIssues.length ? "critical" : warningIssues.length ? "warning" : "info", lastRunAt: nowIso(), lastRunReason: options.reason || "manual", summary: { criticalCount: criticalIssues.length, warningCount: warningIssues.length, infoCount: infoIssues.length, totalIssues: issues.length }, dataAudit, runningCandleAudit, contextAudit, scoreAudit, rebuildAudit, overlayAudit, autoscaleAudit, marketZoneAudit, mtfAudit, structureHierarchyAudit, fvgBoundaryAudit, performanceAudit, issues, criticalIssues, warningIssues, infoIssues, debugStats: { triggeredByPipeline: Boolean(options.triggeredByPipeline), includeDeepScan: Boolean(options.includeDeepScan), mode: isPipelineLight ? "light" : (options.mode || "deep"), durationMs: Number((performance.now() - started).toFixed(1)), issueLimit: isPipelineLight ? (perfAudit.maxIssuesInNormalRun || 80) : (config.safeScanRules?.maxTotalIssues || 300) }, message: status === "OK" ? "Audit OK. Planning context only." : config.wording?.criticalBanner || "Review debug audit before relying on context." };
      state().auditQualityContext = context;
      return context;
    } catch (error) {
      const issue = createAuditIssue({ severity: "critical", category: "performance", engine: "Audit Quality", message: "Audit failed safely", detail: error.message });
      const context = { ...createEmptyAuditQualityContext(error.message), available: true, status: "Critical", severity: "critical", lastRunAt: nowIso(), issues: [issue], criticalIssues: [issue], summary: { criticalCount: 1, warningCount: 0, infoCount: 0, totalIssues: 1 }, message: "Audit failed safely. Planning context only." };
      state().auditQualityContext = context;
      return context;
    }
  }

  function getAuditQualityContext() { return state().auditQualityContext || createEmptyAuditQualityContext(); }

  window.BtcDash.engines.auditQuality = { runAuditQuality, createEmptyAuditQualityContext, createAuditIssue, auditMarketDataIntegrity, auditRunningCandleLeak, auditContextShapes, auditScoreSanity, auditRebuildPipeline, auditOverlayRegistry, auditAutoscaleRisk, auditMarketZoneQuality, auditMtfGuard, auditStructureHierarchy, auditFvgBoundaryQuality, auditPerformanceLimits, getAuditQualityContext };
  window.BtcDash.auditQuality = window.BtcDash.engines.auditQuality;
  window.runAuditQuality = runAuditQuality;
})();
