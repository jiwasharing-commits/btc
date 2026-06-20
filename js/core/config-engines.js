(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.config = window.BtcDash.config || {};

  const ENGINE_MODULE_NAMES = [
    "structure",
    "liquidity",
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
    "Liquidity",
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


  const LIQUIDITY_V2_CONFIG = {
    enabled: true,
    timeframes: ["1W", "1D", "4H", "1H"],
    "1W": { role: "macro", sourceSwingLayer: "major", atrLength: 14, equalHighTolerancePct: 1.25, equalLowTolerancePct: 1.25, zoneAtrMultiplier: 0.75, minTouchesForPool: 2, minSwingGapBars: 3, sweepBufferPct: 0.20, breakBufferPct: 0.40, weakBreakBufferPct: 0.15, reclaimBars: 6, retestBars: 10, maxPoolAgeBars: 120, recentSweepBars: 30, recencyHalfLifeBars: 60, minScoreToDisplay: 5.0, minScoreForMarketZone: 5.8, maxActiveBuySidePools: 3, maxActiveSellSidePools: 3, maxHistoricalPools: 6, maxProjectedDistancePct: 999, label: "Weekly Macro Liquidity" },
    "1D": { role: "context", sourceSwingLayer: "major", atrLength: 14, equalHighTolerancePct: 0.75, equalLowTolerancePct: 0.75, zoneAtrMultiplier: 0.60, minTouchesForPool: 2, minSwingGapBars: 4, sweepBufferPct: 0.12, breakBufferPct: 0.25, weakBreakBufferPct: 0.10, reclaimBars: 8, retestBars: 14, maxPoolAgeBars: 180, recentSweepBars: 45, recencyHalfLifeBars: 90, minScoreToDisplay: 4.8, minScoreForMarketZone: 5.6, maxActiveBuySidePools: 3, maxActiveSellSidePools: 3, maxHistoricalPools: 8, maxProjectedDistancePct: 24, label: "Daily Context Liquidity" },
    "4H": { role: "setup", sourceSwingLayer: "internal", atrLength: 14, equalHighTolerancePct: 0.40, equalLowTolerancePct: 0.40, zoneAtrMultiplier: 0.50, minTouchesForPool: 2, minSwingGapBars: 6, sweepBufferPct: 0.08, breakBufferPct: 0.15, weakBreakBufferPct: 0.06, reclaimBars: 10, retestBars: 18, maxPoolAgeBars: 260, recentSweepBars: 70, recencyHalfLifeBars: 130, minScoreToDisplay: 4.6, minScoreForMarketZone: 5.4, maxActiveBuySidePools: 3, maxActiveSellSidePools: 3, maxHistoricalPools: 10, maxProjectedDistancePct: 12, label: "4H Setup Liquidity" },
    "1H": { role: "timing", sourceSwingLayer: "internal", atrLength: 14, equalHighTolerancePct: 0.25, equalLowTolerancePct: 0.25, zoneAtrMultiplier: 0.40, minTouchesForPool: 2, minSwingGapBars: 8, sweepBufferPct: 0.05, breakBufferPct: 0.10, weakBreakBufferPct: 0.04, reclaimBars: 12, retestBars: 24, maxPoolAgeBars: 360, recentSweepBars: 90, recencyHalfLifeBars: 180, minScoreToDisplay: 4.4, minScoreForMarketZone: 5.2, maxActiveBuySidePools: 3, maxActiveSellSidePools: 3, maxHistoricalPools: 12, maxProjectedDistancePct: 6, label: "1H Timing Liquidity" }
  };

  const SR_V2_CONFIG = {
    enabled: true,
    timeframes: ["1W", "1D", "4H", "1H"],
    "1W": { role: "macro", sourceSwingLayer: "major", atrLength: 14, zoneAtrMultiplier: 0.75, zonePctTolerance: 1.25, mergePctTolerance: 1.75, breakBufferPct: 0.35, sweepBufferPct: 0.20, weakBreakBufferPct: 0.15, retestTolerancePct: 1.25, confirmationCloseCount: 2, minTouchesForFreshZone: 1, minTouchesForConfirmedZone: 2, minScoreToDisplay: 4.8, minScoreForMarketZone: 5.8, maxActiveSupport: 3, maxActiveResistance: 3, maxHistoricalZones: 6, maxZoneAgeBars: 120, recentTouchBars: 40, recencyHalfLifeBars: 60, htfPriorityWeight: 1.50, reactionWeight: 1.30, confluenceWeight: 1.20, maxProjectedDistancePct: 999, label: "Weekly Macro S/R" },
    "1D": { role: "context", sourceSwingLayer: "major", atrLength: 14, zoneAtrMultiplier: 0.65, zonePctTolerance: 0.80, mergePctTolerance: 1.10, breakBufferPct: 0.25, sweepBufferPct: 0.15, weakBreakBufferPct: 0.10, retestTolerancePct: 0.80, confirmationCloseCount: 2, minTouchesForFreshZone: 1, minTouchesForConfirmedZone: 2, minScoreToDisplay: 4.6, minScoreForMarketZone: 5.6, maxActiveSupport: 3, maxActiveResistance: 3, maxHistoricalZones: 8, maxZoneAgeBars: 180, recentTouchBars: 60, recencyHalfLifeBars: 90, htfPriorityWeight: 1.35, reactionWeight: 1.25, confluenceWeight: 1.15, maxProjectedDistancePct: 25, label: "Daily Context S/R" },
    "4H": { role: "setup", sourceSwingLayer: "internal", atrLength: 14, zoneAtrMultiplier: 0.55, zonePctTolerance: 0.45, mergePctTolerance: 0.65, breakBufferPct: 0.15, sweepBufferPct: 0.10, weakBreakBufferPct: 0.06, retestTolerancePct: 0.45, confirmationCloseCount: 2, minTouchesForFreshZone: 1, minTouchesForConfirmedZone: 2, minScoreToDisplay: 4.4, minScoreForMarketZone: 5.4, maxActiveSupport: 3, maxActiveResistance: 3, maxHistoricalZones: 10, maxZoneAgeBars: 260, recentTouchBars: 90, recencyHalfLifeBars: 130, htfPriorityWeight: 1.20, reactionWeight: 1.20, confluenceWeight: 1.10, maxProjectedDistancePct: 12, label: "4H Setup S/R" },
    "1H": { role: "timing", sourceSwingLayer: "internal", atrLength: 14, zoneAtrMultiplier: 0.45, zonePctTolerance: 0.25, mergePctTolerance: 0.40, breakBufferPct: 0.10, sweepBufferPct: 0.06, weakBreakBufferPct: 0.04, retestTolerancePct: 0.30, confirmationCloseCount: 2, minTouchesForFreshZone: 1, minTouchesForConfirmedZone: 2, minScoreToDisplay: 4.2, minScoreForMarketZone: 5.2, maxActiveSupport: 3, maxActiveResistance: 3, maxHistoricalZones: 12, maxZoneAgeBars: 360, recentTouchBars: 120, recencyHalfLifeBars: 180, htfPriorityWeight: 1.05, reactionWeight: 1.15, confluenceWeight: 1.05, maxProjectedDistancePct: 7, label: "1H Timing S/R" }
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
        liquidityContexts: ["available", "timeframe", "rawEqualHighs", "rawEqualLows", "buySidePools", "sellSidePools", "activeBuySidePools", "activeSellSidePools", "visiblePools", "marketZoneRows", "summary", "status"],
        srContexts: ["available", "timeframe", "rawLevels", "zoneClusters", "zones", "activeSupports", "activeResistances", "nearestSupport", "nearestResistance", "visibleZones", "marketZoneRows", "summary", "status"],
        fvgContexts: ["available", "timeframe", "activeFvgs", "nearestFvg", "summary"],
        channelContexts: ["available", "timeframe", "status", "direction", "summary"],
        marketZoneContexts: ["activeTimeframe", "upside", "downside", "summary"]
      }
    },
    rebuildRules: { enabled: true, maxRebuildsPerSecond: 4, maxSameEngineRebuildsPerSecond: 2, detectCircularRebuild: true, circularWindowMs: 1500, maxRebuildDepth: 12, idealPipeline: ["Data Ready", "Structure", "Liquidity", "S/R", "FVG", "Channel", "Market Zones Base", "Confluence", "Scenario", "Risk", "Reaction", "Market Zones Enriched", "Audit Quality", "UI Render"] },
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
    LIQUIDITY_V2_CONFIG,
    SR_V2_CONFIG,
    AUDIT_QUALITY_CONFIG
  });
})();
