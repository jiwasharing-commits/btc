(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.chart = window.BtcDash.chart || {};
  window.BtcDash.chart.overlays = window.BtcDash.chart.overlays || {};

  function isLayerEnabled() {
    const state = window.BtcDash.state;
    const runtime = state?.chartRuntime?.layerState?.sr;
    const legacyMap = { structure: "Structure", sr: "S/R", fvg: "FVG", liquidity: "EQH/EQL", channel: "Channel", confluence: "Confluence", scenario: "Scenario Levels" };
    return Boolean(runtime || state?.activeLayers?.[legacyMap["sr"]]);
  }

  function buildSrOverlayItems(timeframe) {
    const state = window.BtcDash.state || {};
    if ("sr" === "structure") return (state.structureContexts?.[timeframe]?.labels || []).slice(-40).map((item) => ({ layer: "structure", timeframe, source: "structure", sourceId: `${item.time}-${item.label}`, type: item.type, price: item.price, startTime: item.time, endTime: item.time, label: item.label }));
    if ("sr" === "sr") return (typeof window.BtcDash.chart?.buildSrVisualItems === "function" ? window.BtcDash.chart.buildSrVisualItems(timeframe) : []).map((item) => ({ ...item, layer: "sr", timeframe, zoneLow: item.lower, zoneHigh: item.upper, label: item.kind === "support" ? `${timeframe} Support` : `${timeframe} Resistance` }));
    if ("sr" === "fvg") return (typeof window.BtcDash.chart?.buildFvgVisualItems === "function" ? window.BtcDash.chart.buildFvgVisualItems(timeframe) : []).map((item) => ({ ...item.zone, layer: "fvg", timeframe: item.timeframe || timeframe, zoneLow: item.zone.lower, zoneHigh: item.zone.upper, startTime: item.startTime, endTime: item.endTime, label: `${item.timeframe || timeframe} ${item.zone.type === "bearish" ? "Bear" : "Bull"} FVG` }));
    if ("sr" === "channel") return Object.entries(state.channelContexts || {}).filter(([, context]) => context?.available).slice(0, 4).map(([tf, context]) => ({ layer: "channel", timeframe: tf, source: "channel", sourceId: tf, type: context.status, price: context.projectedLevels?.mid, label: `${tf} Channel` }));
    if ("sr" === "confluence") return (state.confluenceContext?.candidates || []).slice(0, 4).map((item) => ({ ...item, layer: "confluence", timeframe: item.timeframes?.[0] || timeframe, zoneLow: item.lower, zoneHigh: item.upper, label: item.status }));
    if ("sr" === "scenario") {
      const plan = state.scenarioContext?.primaryScenario?.riskPlan;
      if (!plan?.available) return [];
      return [plan.watchArea, plan.invalidation, ...(plan.targets || [])].filter(Boolean).map((item, index) => ({ ...item, layer: "scenario", timeframe, source: "scenario", sourceId: item.id || index, price: item.level || item.midpoint, zoneLow: item.lower || item.zoneLower || item.level, zoneHigh: item.upper || item.zoneUpper || item.level, label: item.label || "Reference" }));
    }
    return [];
  }

  function clearSrOverlay(timeframe = null) {
    window.BtcDash.chart.overlayRegistry?.clearLayer("sr");
    window.BtcDash.chart.clearChartOverlayLayer?.("sr");
  }

  function renderSrOverlay(timeframe) {
    clearSrOverlay(timeframe);
    if (!isLayerEnabled()) return [];
    const items = buildSrOverlayItems(timeframe);
    if ("sr" === "sr" || "sr" === "fvg" || "sr" === "confluence" || "sr" === "scenario") return window.BtcDash.chart.overlays.zone?.renderZoneOverlayBatch(items, { layer: "sr", timeframe }) || [];
    return items.map((item) => window.BtcDash.chart.overlayRegistry?.registerOverlay({ ...item, layer: "sr", timeframe: item.timeframe || timeframe, drawPolicy: item.drawPolicy || "summaryOnly" })).filter(Boolean);
  }

  window.BtcDash.chart.overlays.sr = { renderSrOverlay, clearSrOverlay, buildSrOverlayItems };
})();
