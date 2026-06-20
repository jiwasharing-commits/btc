(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.chart = window.BtcDash.chart || {};
  window.BtcDash.chart.overlays = window.BtcDash.chart.overlays || {};
  function isLayerEnabled() { const state = window.BtcDash.state; return Boolean(state?.chartRuntime?.layerState?.liquidity || state?.activeLayers?.["EQH/EQL"]); }
  function buildLiquidityOverlayItems(timeframe) {
    const context = window.BtcDash.state?.liquidityContexts?.[timeframe];
    if (!context?.available) return [];
    return (context.visiblePools || [])
      .filter((pool) => !["Broken Liquidity", "Historical Liquidity"].includes(pool.status))
      .slice(0, 6)
      .map((pool) => ({ ...pool, layer: "liquidity", timeframe, source: "Liquidity", sourceId: pool.id, type: pool.type, label: pool.label || `${timeframe} ${pool.type}`, zoneLow: pool.zoneLow, zoneHigh: pool.zoneHigh, price: pool.centerPrice, startTime: pool.firstSeenTime, endTime: pool.lastTouchTime || pool.lastSeenTime, drawPolicy: pool.drawPolicy || "show" }));
  }
  function clearLiquidityOverlay() { window.BtcDash.chart.overlays.zone?.clearZoneOverlayLayer?.("liquidity"); window.BtcDash.chart.overlayRegistry?.clearLayer("liquidity"); }
  function renderLiquidityOverlay(timeframe) { clearLiquidityOverlay(timeframe); if (!isLayerEnabled()) return []; return window.BtcDash.chart.overlays.zone?.renderZoneOverlayBatch(buildLiquidityOverlayItems(timeframe), { layer: "liquidity", timeframe, source: "Liquidity", className: "liquidity-zone-box" }) || []; }
  window.BtcDash.chart.overlays.liquidity = { renderLiquidityOverlay, clearLiquidityOverlay, buildLiquidityOverlayItems };
})();
