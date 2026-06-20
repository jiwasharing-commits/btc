(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.chart = window.BtcDash.chart || {};
  window.BtcDash.chart.overlays = window.BtcDash.chart.overlays || {};
  function buildMaOverlayItems(timeframe) { return window.BtcDash.chart.buildMaOverlayItems?.(timeframe) || []; }
  function clearMaOverlay(timeframe) { return window.BtcDash.chart.clearMaOverlay?.(timeframe) || []; }
  function renderMaOverlay(timeframe) { return window.BtcDash.chart.renderMaOverlay?.(timeframe) || []; }
  function getMaDebugState() { return window.BtcDash.chart.getMaDebugState?.() || { seriesCount: 0, overlayCount: 0, apiMode: window.BtcDash.chart.adapter?.detectChartApiMode?.()?.mode || "unknown" }; }
  window.BtcDash.chart.overlays.ma = { renderMaOverlay, clearMaOverlay, buildMaOverlayItems, getMaDebugState };
})();
