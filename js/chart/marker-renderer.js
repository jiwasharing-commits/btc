(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.chart = window.BtcDash.chart || {};

  function runtime() {
    const rt = window.BtcDash.state?.chartRuntime || {};
    rt.markerLayers = rt.markerLayers || {};
    rt.markerPluginHandles = rt.markerPluginHandles || {};
    if (window.BtcDash.state?.chartRuntime) {
      window.BtcDash.state.chartRuntime.markerLayers = rt.markerLayers;
      window.BtcDash.state.chartRuntime.markerPluginHandles = rt.markerPluginHandles;
    }
    return rt;
  }
  function normalizeLayer(layer) { return window.BtcDash.chart.normalizeLayerKey?.(layer) || String(layer || "other").toLowerCase(); }
  function normalizeMarker(marker, layer, timeframe) {
    const chartTime = typeof marker.time === "number" && marker.time > 10000000000 ? Math.floor(marker.time / 1000) : marker.time;
    return { ...marker, time: chartTime, chartTime, layer, timeframe, key: `${layer}|${timeframe}|${chartTime}|${marker.text || marker.label || marker.shape || "marker"}` };
  }
  function getMergedMarkers() { return Object.values(runtime().markerLayers || {}).flat().sort((a, b) => Number(a.time) - Number(b.time)); }
  function applyMergedMarkers(reason = "manual") {
    const series = window.BtcDash.chart.getActiveCandleSeries?.() || window.BtcDash.state?.candleSeries || null;
    const merged = getMergedMarkers();
    const status = window.BtcDash.chart.adapter?.createOrUpdateSeriesMarkersSafe?.(series, merged, "merged", { reason }) || { success: false, mode: "unavailable", markerCount: merged.length, warning: "adapter-unavailable" };
    runtime().lastMarkerApplyStatus = status;
    return status;
  }
  function renderMarkers(arg1, arg2, arg3) {
    if (typeof arg1 === "string" && Array.isArray(arg3)) {
      const layer = normalizeLayer(arg1), timeframe = arg2;
      runtime().markerLayers[layer] = arg3.map((marker) => normalizeMarker(marker, layer, timeframe));
      runtime().markerLayers[layer].forEach((marker) => window.BtcDash.chart.overlayRegistry?.registerOverlay({ id: marker.key, key: marker.key, layer, timeframe, source: "marker-renderer", sourceId: marker.key, type: marker.shape || marker.type || "marker", price: marker.price, startTime: marker.time, endTime: marker.time, drawPolicy: "summaryOnly", meta: marker }));
      return { layer, timeframe, markerCount: runtime().markerLayers[layer].length, applyStatus: applyMergedMarkers(`render-${layer}`) };
    }
    const timeframe = arg1, markerGroups = arg2 || {};
    Object.entries(markerGroups).forEach(([layer, markers]) => renderMarkers(layer, timeframe, markers || []));
    return getMarkerStats();
  }
  function clearMarkers(layerKey) {
    if (!layerKey) return clearAllMarkers();
    const layer = normalizeLayer(layerKey);
    runtime().markerLayers[layer] = [];
    window.BtcDash.chart.overlayRegistry?.clearLayer(layer);
    return { layer, applyStatus: applyMergedMarkers(`clear-${layer}`) };
  }
  function clearAllMarkers() {
    Object.keys(runtime().markerLayers || {}).forEach((layer) => window.BtcDash.chart.overlayRegistry?.clearLayer?.(layer));
    runtime().markerLayers = {};
    return applyMergedMarkers("clear-all");
  }
  function reapplyActiveMarkers(reason = "manual") { return applyMergedMarkers(reason); }
  function getMarkerState() { return { byLayer: { ...(runtime().markerLayers || {}) } }; }
  function getMarkerStats() {
    const byLayer = Object.fromEntries(Object.entries(runtime().markerLayers || {}).map(([layer, rows]) => [layer, rows.length]));
    const applyStatus = runtime().lastMarkerApplyStatus || null;
    return { total: Object.values(byLayer).reduce((sum, count) => sum + count, 0), byLayer, applyStatus, applyMode: applyStatus?.mode || null, applySuccess: applyStatus?.success ?? null };
  }

  window.BtcDash.chart.markers = { renderMarkers, clearMarkers, clearAllMarkers, normalizeMarker, reapplyActiveMarkers, getMergedMarkers, getMarkerState, getMarkerStats };
})();
