(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.config = window.BtcDash.config || {};

  const ENGINE_MODULE_NAMES = [
    "structure",
    "sr",
    "fvg",
    "channel",
    "marketZones",
    "confluence",
    "scenario",
    "riskPlan",
    "reactionStudy",
    "auditQuality"
  ];
  const ENGINE_PIPELINE_ORDER = [
    "Data Ready",
    "Structure",
    "S/R",
    "FVG",
    "Channel",
    "Market Zones Base",
    "Confluence",
    "Scenario",
    "Risk",
    "Reaction",
    "Market Zones Enriched",
    "Audit Quality",
    "UI Render"
  ];
  const FUTURE_ENGINE_FLAGS = {
    liquidity: false,
    regime: false,
    volumeReaction: false,
    auditQuality: true,
    outcomeStudy: false
  };


  const AUDIT_QUALITY_CONFIG = {
    enabled: true,
    timeframes: ["1W", "1D", "4H", "1H"],
    severity: { info: "info", warning: "warning", critical: "critical" },
    statusLabels: { ok: "OK", warning: "Warning", critical: "Critical", notRun: "Not Run" },
    dataRules: {
      minCandles: { "1W": 80, "1D": 180, "4H": 240, "1H": 300 },
      uniqueTimeKey: "openTimeOrTime",
      allowZeroVolume: true,
      rejectNegativeVolume: true,
      maxDuplicateCandlesAllowed: 0,
      maxOutOfOrderCandlesAllowed: 0,
      requiredCandleFields: ["time", "open", "high", "low", "close"]
    },
    runningCandleRules: {
      enabled: true,
      runningPreviewKeys: ["runningCandle", "runningCandles", "previewCandle", "previewCandles", "runningPreview", "liveCandle"],
      runningFieldHints: ["isRunning", "isClosed", "isFinal", "x", "source", "status"],
      runningTextMarkers: ["Running", "running", "Preview", "preview", "Live", "live"],
      forbiddenAnalysisContexts: ["structureContexts", "srContexts", "fvgContexts", "channelContexts", "liquidityContexts", "marketZoneContexts", "confluenceContext", "scenarioContext", "riskPlanContext", "reactionStudyContext", "mtfBiasContext", "regimeContexts", "volumeReactionContexts", "outcomeStudyContexts"]
    },
    scoreRules: { minScore: 0, maxScore: 10, scoreKeys: ["score", "reactionScore", "confluenceScore", "scenarioScore", "riskScore", "qualityScore", "planningScore", "confidenceScore", "strengthScore"] },
    contextRules: {
      requiredByContext: {
        structureContexts: ["available", "timeframe", "labels", "bias", "bosChoch", "summary"],
        srContexts: ["available", "timeframe", "supportZones", "resistanceZones", "nearestSupport", "nearestResistance", "summary"],
        fvgContexts: ["available", "timeframe", "activeFvgs", "nearestFvg", "summary"],
        channelContexts: ["available", "timeframe", "status", "direction", "summary"],
        marketZoneContexts: ["activeTimeframe", "upside", "downside", "summary"]
      }
    },
    rebuildRules: { enabled: true, maxRebuildsPerSecond: 4, maxSameEngineRebuildsPerSecond: 2, detectCircularRebuild: true, circularWindowMs: 1500, maxRebuildDepth: 12, idealPipeline: ["Data Ready", "Structure", "S/R", "FVG", "Channel", "Market Zones Base", "Confluence", "Scenario", "Risk", "Reaction", "Market Zones Enriched", "Audit Quality", "UI Render"] },
    overlayRules: { enabled: true, maxOverlayCountByLayer: { ma: 20, structure: 80, sr: 40, fvg: 40, liquidity: 40, channel: 20, confluence: 20, scenario: 20, marketZones: 30 }, duplicateKeyFields: ["layer", "timeframe", "source", "sourceId", "type", "zoneLow", "zoneHigh", "price", "startTime", "endTime"], layerOffMustClearRegistry: true, detectOrphanDomOverlay: true },
    autoscaleRules: { enabled: true, maxOverlayDistancePctFromVisiblePrice: { "1W": 40, "1D": 25, "4H": 15, "1H": 8 }, farOverlayAllowedPolicies: ["summaryOnly", "hide"] },
    marketZoneRules: { maxUpsideWatch: 3, maxDownsideWatch: 3, maxCurrentReaction: 2, maxConfluenceHighlight: 1, duplicateZoneTolerancePct: 0.15 },
    mtfRules: { oneHourCannotOverrideHigherBias: true, higherBiasTimeframes: ["1W", "1D"], timingOnlyTimeframe: "1H" },
    performanceRules: { maxRawPivotsPerTimeframe: 250, maxFvgsPerTimeframe: 200, maxSrZonesPerTimeframe: 120, maxChannelCountPerTimeframe: 50, maxMarketZonesPerTimeframe: 80, maxOverlayRegistryItems: 150, maxPipelineDurationMs: 2000 },
    safeScanRules: { maxDepth: 8, maxItemsPerArray: 250, maxIssuesPerCategory: 80, maxTotalIssues: 300, useWeakSetVisitedGuard: true },
    ui: { showAuditSummaryCard: true, showDebugModal: true, showCriticalBanner: true, maxIssuesPerPanel: 12, maxWarningsPerSection: 8 },
    wording: { criticalBanner: "Analysis quality warning — review debug audit before relying on context.", planningOnly: "Planning context only.", referenceOnly: "Reference only.", notSignal: "Not a trading signal." }
  };

  Object.assign(window.BtcDash.config, {
    ENGINE_MODULE_NAMES,
    ENGINE_PIPELINE_ORDER,
    FUTURE_ENGINE_FLAGS,
    AUDIT_QUALITY_CONFIG
  });
})();
