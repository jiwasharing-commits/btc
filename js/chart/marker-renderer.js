(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.chart = window.BtcDash.chart || {};
  const markerState = { byLayer: {} };

  function normalizeMarker(marker, layer, timeframe) { return { ...marker, layer, timeframe, key: `${layer}|${timeframe}|${marker.time}|${marker.text || marker.shape || "marker"}` }; }
  function renderMarkers(timeframe, markerGroups = {}) {
    Object.entries(markerGroups).forEach(([layer, markers]) => { markerState.byLayer[layer] = (markers || []).map((marker) => normalizeMarker(marker, layer, timeframe)); });
    return markerState;
  }
  function clearMarkers(layer) { delete markerState.byLayer[layer]; }
  function clearAllMarkers() { markerState.byLayer = {}; }

  window.BtcDash.chart.markers = { renderMarkers, clearMarkers, clearAllMarkers, normalizeMarker };
})();
