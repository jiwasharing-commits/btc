(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.config = window.BtcDash.config || {};

  const DEFAULT_LAYER_STATE = {
    MA: false,
    Structure: false,
    FVG: false,
    "S/R": false,
    "EQH/EQL": false,
    Channel: false,
    Confluence: false,
    "Scenario Levels": false
  };
  const CHART_UI_CONFIG = {
    chartContainerId: "chart",
    debugModalId: "binance-debug-modal",
    planningContextOnly: true
  };
  const UI_MODULE_REGISTRY = {
    summary: "window.BtcDash.ui.renderSummary",
    workspace: "window.BtcDash.ui.renderWorkspace",
    detail: "window.BtcDash.ui.renderDetail"
  };


  const CHART_LAYER_CONFIG = {
    defaultLayerState: { ma: false, structure: false, sr: false, fvg: false, liquidity: false, channel: false, confluence: false, scenario: false },
    layerOrder: ["ma", "structure", "sr", "fvg", "liquidity", "channel", "confluence", "scenario"],
    layerLabels: { ma: "MA", structure: "Structure", sr: "S/R", fvg: "FVG", liquidity: "EQH/EQL", channel: "Channel", confluence: "Confluence", scenario: "Scenario Levels" },
    maxVisibleByLayer: { structure: 40, sr: 12, fvg: 12, liquidity: 12, channel: 8, confluence: 8, scenario: 8 },
    drawPolicyPriority: { show: 1, summaryOnly: 2, hide: 3 },
    defaultDrawPolicy: "show"
  };
  const OVERLAY_RENDER_CONFIG = {
    useRegistry: true,
    clearBeforeRender: true,
    preventDuplicate: true,
    duplicateKeyFields: ["layer", "timeframe", "source", "sourceId", "type", "zoneLow", "zoneHigh", "price", "startTime", "endTime"],
    autoscalePolicy: { candleOnlyPreferred: true, skipFarOverlayFromAutoscale: true, farOverlayFallback: "summaryOnly" },
    maxDistancePctFromVisiblePrice: { "1W": 40, "1D": 25, "4H": 15, "1H": 8 },
    maxOverlayCountTotal: 120,
    maxDomOverlayCount: 80
  };
  const UI_PANEL_CONFIG = {
    compactCards: true,
    summaryCardMaxItems: 4,
    panelRowMaxItems: 8,
    sourceTagMaxItems: 5,
    reasonMaxItems: 3,
    riskFlagMaxItems: 3,
    emptyStateText: "No data available.",
    unavailableText: "Not available yet.",
    planningOnlyText: "Planning context only.",
    referenceOnlyText: "Reference only.",
    bottomTabs: ["indicator", "pattern-summary", "scenario-plan", "structure", "fvg", "sr", "channel", "confluence", "reaction-study", "audit", "table"]
  };

  Object.assign(window.BtcDash.config, {
    DEFAULT_LAYER_STATE,
    CHART_UI_CONFIG,
    UI_MODULE_REGISTRY,
    CHART_LAYER_CONFIG,
    OVERLAY_RENDER_CONFIG,
    UI_PANEL_CONFIG
  });
})();
