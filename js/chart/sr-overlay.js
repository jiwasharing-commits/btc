(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.chart = window.BtcDash.chart || {};
  window.BtcDash.chart.overlays = window.BtcDash.chart.overlays || {};
  function isLayerEnabled() { const state = window.BtcDash.state; return Boolean(state?.chartRuntime?.layerState?.sr || state?.activeLayers?.["S/R"]); }
  function buildSrOverlayItems(timeframe) {
    const context = window.BtcDash.state?.srContexts?.[timeframe];
    if (!context?.available) return [];
    return (context.visibleZones || [])
      .filter((zone) => !["Broken Zone", "Historical Reaction Zone"].includes(zone.status))
      .slice(0, 6)
      .map((zone) => ({ ...zone, layer: "sr", timeframe, source: "S/R", sourceId: zone.id, type: zone.activeType, label: zone.label || `${timeframe} ${zone.activeType}`, zoneLow: zone.zoneLow, zoneHigh: zone.zoneHigh, price: zone.centerPrice, startTime: zone.firstSeenTime, endTime: zone.lastTouchTime, drawPolicy: zone.drawPolicy || "show" }));
  }
  function clearSrOverlay() { window.BtcDash.chart.overlays.zone?.clearZoneOverlayLayer?.("sr"); window.BtcDash.chart.overlayRegistry?.clearLayer("sr"); }
  function renderSrOverlay(timeframe) { clearSrOverlay(timeframe); if (!isLayerEnabled()) return []; return window.BtcDash.chart.overlays.zone?.renderZoneOverlayBatch(buildSrOverlayItems(timeframe), { layer: "sr", timeframe, source: "S/R", className: "sr-zone-box" }) || []; }
  window.BtcDash.chart.overlays.sr = { renderSrOverlay, clearSrOverlay, buildSrOverlayItems };
})();
