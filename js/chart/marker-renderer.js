(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.chart = window.BtcDash.chart || {};
  const markerState = { byLayer: {} };

  function normalizeMarker(marker, layer, timeframe) {
    const chartTime = typeof marker.time === "number" && marker.time > 10000000000 ? Math.floor(marker.time / 1000) : marker.time;
    return { ...marker, chartTime, layer, timeframe, key: `${layer}|${timeframe}|${marker.time}|${marker.text || marker.label || marker.shape || "marker"}` };
  }

  function renderMarkers(timeframe, markerGroups = {}) {
    Object.entries(markerGroups).forEach(([layer, markers]) => {
      clearMarkers(layer);
      const normalized = (markers || []).map((marker) => normalizeMarker(marker, layer, timeframe));
      markerState.byLayer[layer] = normalized;
      window.BtcDash.chart.applyLayerMarkers?.(layer, normalized.map((marker) => ({ ...marker, time: marker.chartTime })));
      normalized.forEach((marker) => window.BtcDash.chart.overlayRegistry?.registerOverlay({
        id: marker.key,
        key: marker.key,
        layer,
        timeframe,
        source: "marker-renderer",
        sourceId: marker.key,
        type: marker.shape || marker.type || "marker",
        price: marker.price,
        startTime: marker.time,
        endTime: marker.time,
        drawPolicy: "summaryOnly",
        meta: marker
      }));
    });
    return markerState;
  }

  function clearMarkers(layer) {
    if (!layer) return clearAllMarkers();
    delete markerState.byLayer[layer];
    window.BtcDash.chart.clearLayerMarkers?.(layer);
    window.BtcDash.chart.overlayRegistry?.clearLayer(layer);
    return markerState;
  }

  function clearAllMarkers() {
    markerState.byLayer = {};
    window.BtcDash.chart.overlayRegistry?.clearAllOverlays?.();
    return markerState;
  }

  function getMarkerState() { return { byLayer: { ...markerState.byLayer } }; }
  window.BtcDash.chart.markers = { renderMarkers, clearMarkers, clearAllMarkers, normalizeMarker, getMarkerState };
})();
