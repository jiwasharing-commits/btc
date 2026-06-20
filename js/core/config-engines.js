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
    "4H": { role: "setup", pivotLeft: 4, pivotRight: 4, minMovePct: 3.0, atrLength: 14, atrMultiplier: 1.7, minBarGap: 14, eqTolerancePct: 0.5, breakBufferPct: 0.15, weakBreakBufferPct: 0.08, maxRawPivots: 160, maxInternalSwings: 28, maxMajorSwings: 14, displayMaxLabels: 11, protectedLevelLookback: 16, layerRules: { internal: { minMoveScale: 0.80, minBarGapScale: 0.85, maxSwings: 28 }, major: { minMoveScale: 1.25, minBarGapScale: 1.20, maxSwings: 14 } }, label: "4H Setup Structure" },
    "1H": { role: "timing", pivotLeft: 5, pivotRight: 5, minMovePct: 1.6, atrLength: 14, atrMultiplier: 1.5, minBarGap: 18, eqTolerancePct: 0.3, breakBufferPct: 0.10, weakBreakBufferPct: 0.05, maxRawPivots: 200, maxInternalSwings: 34, maxMajorSwings: 16, displayMaxLabels: 14, protectedLevelLookback: 20, layerRules: { internal: { minMoveScale: 0.85, minBarGapScale: 0.90, maxSwings: 34 }, major: { minMoveScale: 1.35, minBarGapScale: 1.35, maxSwings: 16 } }, label: "1H Timing Structure" },
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


  const FVG_V2_CONFIG = {
    enabled: true,
    timeframes: ["1W", "1D", "4H", "1H"],
    "1W": { role: "macro", atrLength: 14, minGapPct: 1.25, minGapAtr: 0.45, displacementBodyPct: 55, displacementAtrMultiplier: 1.20, requireDisplacementCandle: true, midpointEnabled: true, minScoreToDisplay: 5.2, minScoreForMarketZone: 6.0, maxActiveBullish: 3, maxActiveBearish: 3, maxHistoricalFvgs: 6, maxFvgAgeBars: 80, recentTouchBars: 30, recencyHalfLifeBars: 45, partialFillThresholdPct: 25, midpointFillThresholdPct: 50, deepFillThresholdPct: 70, filledThresholdPct: 95, breakBufferPct: 0.35, weakBreakBufferPct: 0.15, mitigationCloseRequired: true, inverseFvgEnabled: true, inverseRetestBars: 12, overlapSuppressionEnabled: true, maxOverlapDistancePct: 1.50, maxProjectedDistancePct: 999, label: "Weekly Macro FVG" },
    "1D": { role: "context", atrLength: 14, minGapPct: 0.70, minGapAtr: 0.35, displacementBodyPct: 52, displacementAtrMultiplier: 1.05, requireDisplacementCandle: true, midpointEnabled: true, minScoreToDisplay: 5.0, minScoreForMarketZone: 5.8, maxActiveBullish: 3, maxActiveBearish: 3, maxHistoricalFvgs: 8, maxFvgAgeBars: 120, recentTouchBars: 45, recencyHalfLifeBars: 70, partialFillThresholdPct: 25, midpointFillThresholdPct: 50, deepFillThresholdPct: 70, filledThresholdPct: 95, breakBufferPct: 0.25, weakBreakBufferPct: 0.12, mitigationCloseRequired: true, inverseFvgEnabled: true, inverseRetestBars: 18, overlapSuppressionEnabled: true, maxOverlapDistancePct: 0.90, maxProjectedDistancePct: 24, label: "Daily Context FVG" },
    "4H": { role: "setup", atrLength: 14, minGapPct: 0.35, minGapAtr: 0.28, displacementBodyPct: 50, displacementAtrMultiplier: 0.90, requireDisplacementCandle: true, midpointEnabled: true, minScoreToDisplay: 4.8, minScoreForMarketZone: 5.6, maxActiveBullish: 3, maxActiveBearish: 3, maxHistoricalFvgs: 10, maxFvgAgeBars: 180, recentTouchBars: 70, recencyHalfLifeBars: 100, partialFillThresholdPct: 25, midpointFillThresholdPct: 50, deepFillThresholdPct: 70, filledThresholdPct: 95, breakBufferPct: 0.15, weakBreakBufferPct: 0.08, mitigationCloseRequired: true, inverseFvgEnabled: true, inverseRetestBars: 24, overlapSuppressionEnabled: true, maxOverlapDistancePct: 0.55, maxProjectedDistancePct: 12, label: "4H Setup FVG" },
    "1H": { role: "timing", atrLength: 14, minGapPct: 0.18, minGapAtr: 0.22, displacementBodyPct: 48, displacementAtrMultiplier: 0.75, requireDisplacementCandle: false, midpointEnabled: true, minScoreToDisplay: 4.5, minScoreForMarketZone: 5.3, maxActiveBullish: 3, maxActiveBearish: 3, maxHistoricalFvgs: 12, maxFvgAgeBars: 240, recentTouchBars: 90, recencyHalfLifeBars: 130, partialFillThresholdPct: 25, midpointFillThresholdPct: 50, deepFillThresholdPct: 70, filledThresholdPct: 95, breakBufferPct: 0.10, weakBreakBufferPct: 0.05, mitigationCloseRequired: true, inverseFvgEnabled: true, inverseRetestBars: 36, overlapSuppressionEnabled: true, maxOverlapDistancePct: 0.30, maxProjectedDistancePct: 6, label: "1H Timing FVG" }
  };

  const CHANNEL_V2_CONFIG = {
    enabled: true,
    timeframes: ["1W", "1D", "4H", "1H"],
    "1W": { role: "macro", sourceSwingLayer: "major", minAnchorSwings: 4, minTouchesTotal: 3, minTouchesMainSide: 2, requireAdditionalTouchAfterAnchors: true, maxActiveChannels: 1, maxHistoricalChannels: 3, maxProjectionBars: 24, maxProjectedDistancePct: 999, minChannelWidthAtr: 1.5, maxChannelWidthPct: 45, slopeTolerancePct: 0.8, breakBufferPct: 0.40, weakBreakBufferPct: 0.15, nearBoundaryPct: 2.5, toleranceAtrMultiplier: 0.60, maxFitErrorAtr: 1.40, minInlierRatio: 0.45, maxAnchorAgeBars: 100, maxRecentTouchBars: 40, minScoreToDisplay: 6.5, minScoreForMarketZone: 6.2, useZoneBands: true, autoscalePolicy: "candleOnly", label: "Weekly Macro Channel" },
    "1D": { role: "context", sourceSwingLayer: "major", minAnchorSwings: 4, minTouchesTotal: 3, minTouchesMainSide: 2, requireAdditionalTouchAfterAnchors: true, maxActiveChannels: 1, maxHistoricalChannels: 4, maxProjectionBars: 40, maxProjectedDistancePct: 35, minChannelWidthAtr: 1.4, maxChannelWidthPct: 30, slopeTolerancePct: 0.6, breakBufferPct: 0.25, weakBreakBufferPct: 0.12, nearBoundaryPct: 1.5, toleranceAtrMultiplier: 0.55, maxFitErrorAtr: 1.30, minInlierRatio: 0.45, maxAnchorAgeBars: 160, maxRecentTouchBars: 80, minScoreToDisplay: 6.2, minScoreForMarketZone: 6.0, useZoneBands: true, autoscalePolicy: "candleOnly", label: "Daily Context Channel" },
    "4H": { role: "setup", sourceSwingLayer: "internal", minAnchorSwings: 5, minTouchesTotal: 3, minTouchesMainSide: 2, requireAdditionalTouchAfterAnchors: true, maxActiveChannels: 1, maxHistoricalChannels: 5, maxProjectionBars: 60, maxProjectedDistancePct: 18, minChannelWidthAtr: 1.2, maxChannelWidthPct: 18, slopeTolerancePct: 0.45, breakBufferPct: 0.15, weakBreakBufferPct: 0.08, nearBoundaryPct: 0.8, toleranceAtrMultiplier: 0.50, maxFitErrorAtr: 1.20, minInlierRatio: 0.45, maxAnchorAgeBars: 240, maxRecentTouchBars: 120, minScoreToDisplay: 6.0, minScoreForMarketZone: 5.8, useZoneBands: true, autoscalePolicy: "candleOnly", label: "4H Setup Channel" },
    "1H": { role: "timing", sourceSwingLayer: "internal", minAnchorSwings: 6, minTouchesTotal: 3, minTouchesMainSide: 2, requireAdditionalTouchAfterAnchors: true, maxActiveChannels: 1, maxHistoricalChannels: 5, maxProjectionBars: 80, maxProjectedDistancePct: 10, minChannelWidthAtr: 1.0, maxChannelWidthPct: 10, slopeTolerancePct: 0.35, breakBufferPct: 0.10, weakBreakBufferPct: 0.05, nearBoundaryPct: 0.45, toleranceAtrMultiplier: 0.45, maxFitErrorAtr: 1.10, minInlierRatio: 0.45, maxAnchorAgeBars: 360, maxRecentTouchBars: 180, minScoreToDisplay: 5.8, minScoreForMarketZone: 5.6, useZoneBands: true, autoscalePolicy: "candleOnly", label: "1H Timing Channel" }
  };

  const PERFORMANCE_CONFIG = {
    enabled: true,
    initialLoad: { buildHeavyEnginesImmediately: false, heavyEngines: ["fvg", "channel"], deferHeavyEnginesMs: 250, allowProgressiveBuild: true },
    rebuild: { debounceMs: 120, minIntervalMs: 250, skipIfInputHashUnchanged: true, maxPipelineRunsPerSecond: 2 },
    binanceUpdate: { incrementalOnly: true, rebuildOnlyChangedTimeframes: true, skipRebuildIfNoClosedCandleChanged: true, runningCandleDoesNotTriggerAnalysisRebuild: true, debounceMs: 250 },
    ui: { tabSwitchRebuildsEngine: false, layerToggleRebuildsEngine: false, workspaceSwitchCanRerenderChartOnly: true, renderOnlyActiveBottomPanel: true, skipUnchangedSummaryRender: true },
    audit: { runDeepScanInPipeline: false, runLightAuditInPipeline: true, deepScanManualOnly: true, maxIssuesInNormalRun: 80 },
    fvg: { maxScanCandles: { "1W": 260, "1D": 520, "4H": 700, "1H": 900 }, maxRawFvgs: { "1W": 80, "1D": 120, "4H": 160, "1H": 200 }, maxVisibleFvgs: 6 },
    channel: { maxSourceSwings: { "1W": 16, "1D": 24, "4H": 32, "1H": 40 }, maxCandidatePairs: { "1W": 80, "1D": 120, "4H": 180, "1H": 240 }, maxActiveChannels: 1, skipCandidateIfTooOld: true },
    overlay: { maxMarkersPerLayer: 80, maxZonesPerLayer: 24, clearBeforeRender: true, preventDuplicate: true },
    debug: { enablePerformanceMarks: true, logSlowSteps: true, slowStepMs: 150, exposePerformanceSnapshot: true }
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
        fvgContexts: ["available", "timeframe", "rawFvgs", "validFvgs", "activeBullish", "activeBearish", "visibleFvgs", "marketZoneRows", "summary", "status"],
        channelContexts: ["available", "timeframe", "localChannel", "projectedChannels", "historicalChannels", "nearestBoundary", "marketZoneRows", "summary", "status"],
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
    FVG_V2_CONFIG,
    CHANNEL_V2_CONFIG,
    PERFORMANCE_CONFIG,
    AUDIT_QUALITY_CONFIG
  });
})();
