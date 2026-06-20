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



  const STRUCTURE_V2_CONFIG = {
    enabled: true,
    timeframes: ["1W", "1D", "4H", "1H"],
    "1W": { role: "macro", pivotLeft: 4, pivotRight: 4, minMovePct: 8.0, atrLength: 14, atrMultiplier: 1.8, minBarGap: 5, eqTolerancePct: 1.5, breakBufferPct: 0.40, weakBreakBufferPct: 0.15, maxRawPivots: 80, maxInternalSwings: 16, maxMajorSwings: 8, displayMaxLabels: 6, protectedLevelLookback: 8, layerRules: { internal: { minMoveScale: 0.75, minBarGapScale: 0.75, maxSwings: 16 }, major: { minMoveScale: 1.00, minBarGapScale: 1.00, maxSwings: 8 } }, label: "Weekly Macro Structure" },
    "1D": { role: "context", pivotLeft: 4, pivotRight: 4, minMovePct: 4.0, atrLength: 14, atrMultiplier: 1.6, minBarGap: 6, eqTolerancePct: 0.9, breakBufferPct: 0.25, weakBreakBufferPct: 0.12, maxRawPivots: 120, maxInternalSwings: 24, maxMajorSwings: 12, displayMaxLabels: 12, protectedLevelLookback: 12, layerRules: { internal: { minMoveScale: 0.70, minBarGapScale: 0.75, maxSwings: 24 }, major: { minMoveScale: 1.00, minBarGapScale: 1.00, maxSwings: 12 } }, label: "Daily Context Structure" },
    "4H": { role: "setup", pivotLeft: 4, pivotRight: 4, minMovePct: 2.0, atrLength: 14, atrMultiplier: 1.4, minBarGap: 10, eqTolerancePct: 0.5, breakBufferPct: 0.15, weakBreakBufferPct: 0.08, maxRawPivots: 160, maxInternalSwings: 32, maxMajorSwings: 16, displayMaxLabels: 14, protectedLevelLookback: 16, layerRules: { internal: { minMoveScale: 0.65, minBarGapScale: 0.70, maxSwings: 32 }, major: { minMoveScale: 1.15, minBarGapScale: 1.15, maxSwings: 16 } }, label: "4H Setup Structure" },
    "1H": { role: "timing", pivotLeft: 5, pivotRight: 5, minMovePct: 1.0, atrLength: 14, atrMultiplier: 1.2, minBarGap: 12, eqTolerancePct: 0.3, breakBufferPct: 0.10, weakBreakBufferPct: 0.05, maxRawPivots: 200, maxInternalSwings: 40, maxMajorSwings: 18, displayMaxLabels: 18, protectedLevelLookback: 20, layerRules: { internal: { minMoveScale: 0.65, minBarGapScale: 0.70, maxSwings: 40 }, major: { minMoveScale: 1.20, minBarGapScale: 1.20, maxSwings: 18 } }, label: "1H Timing Structure" },
    biasRules: { bullishLabels: ["HH", "HL"], bearishLabels: ["LH", "LL"], requireCloseConfirmedBreak: true, wickBreakIsSweep: true, weakBreakNeedsConfirmation: true, oneHourCannotOverrideHigherBias: true, weeklyBiasOnlyFromWeeklyStructure: true },
    displayRules: { rawPivotDefaultVisible: false, showInternalStructure: true, showMajorStructure: true, showBosChochMarkers: true, showSweepMarkers: true, maxLabelsFallback: 12 },
    wording: { rawPivot: "Raw Pivot", internalStructure: "Internal Structure", majorStructure: "Major Structure", closeConfirmed: "Close Confirmed", wickOnly: "Wick Only / Sweep Context", needsConfirmation: "Needs Confirmation", planningOnly: "Planning context only.", referenceOnly: "Reference only." }
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
        structureContexts: ["available", "timeframe", "rawPivots", "internalSwings", "majorSwings", "analysisSwings", "displaySwings", "labels", "trendState", "bias", "bosChoch", "summary"],
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
    STRUCTURE_V2_CONFIG,
    AUDIT_QUALITY_CONFIG
  });
})();
