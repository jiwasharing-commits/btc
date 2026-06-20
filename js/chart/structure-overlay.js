(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.chart = window.BtcDash.chart || {};
  window.BtcDash.chart.overlays = window.BtcDash.chart.overlays || {};

  function isLayerEnabled() {
    const state = window.BtcDash.state;
    return Boolean(state?.chartRuntime?.layerState?.structure || state?.activeLayers?.Structure);
  }

  function getDisplaySwings(context) {
    return context?.displaySwings || context?.displayLabels || context?.labels || [];
  }

  function buildStructureOverlayItems(timeframe) {
    const context = window.BtcDash.state?.structureContexts?.[timeframe];
    if (!context?.available) return [];
    const swings = getDisplaySwings(context).filter((item) => item?.label && item?.price && item?.time).slice(-(window.BtcDash.config?.PERFORMANCE_CONFIG?.overlay?.maxMarkersPerLayer || 80)).map((item) => ({
      layer: "structure",
      timeframe,
      source: "structure-v2",
      sourceId: item.id || `${item.time}-${item.label}`,
      type: item.type || "swing",
      price: item.price,
      startTime: item.time,
      endTime: item.time,
      label: item.label,
      drawPolicy: "show",
      meta: { structureType: item.structureType, layer: item.layer }
    }));
    const bos = context.bosChoch;
    if (bos && bos.type && bos.type !== "None") {
      swings.push({ layer: "structure", timeframe, source: "structure-v2", sourceId: `bos-${bos.confirmedAtTime || bos.level}`, type: bos.type, price: bos.level, startTime: bos.confirmedAtTime, endTime: bos.confirmedAtTime, label: `${bos.type} ${bos.confirmation}`, drawPolicy: "summaryOnly", meta: bos });
    }
    const sweep = context.sweepStatus;
    if (sweep?.hasSweep) {
      swings.push({ layer: "structure", timeframe, source: "structure-v2", sourceId: `sweep-${sweep.sweepTime || sweep.sweptLevel}`, type: "sweep", price: sweep.sweptLevel, startTime: sweep.sweepTime, endTime: sweep.sweepTime, label: "Sweep Context", drawPolicy: "summaryOnly", meta: sweep });
    }
    return swings;
  }

  function clearStructureOverlay() {
    window.BtcDash.chart.markers?.clearMarkers?.("structure");
    window.BtcDash.chart.overlayRegistry?.clearLayer("structure");
    window.BtcDash.chart.clearChartOverlayLayer?.("structure");
  }

  function renderStructureOverlay(timeframe) {
    clearStructureOverlay(timeframe);
    if (!isLayerEnabled()) return [];
    const items = buildStructureOverlayItems(timeframe);
    const markers = items.map((item) => ({ time: item.startTime, price: item.price, text: item.label, shape: item.type === "low" ? "arrowUp" : "arrowDown", position: item.type === "low" ? "belowBar" : "aboveBar", color: item.type === "low" ? "#facc15" : "#38bdf8", type: item.type, label: item.label }));
    window.BtcDash.chart.markers?.renderMarkers?.(timeframe, { structure: markers });
    const registered = items.map((item) => window.BtcDash.chart.overlayRegistry?.registerOverlay({ ...item, key: `${item.layer}|${item.timeframe}|${item.sourceId}|${item.type}|${item.price}` })).filter(Boolean);
    window.BtcDash.chart._lastStructureMarkerRender = { timeframe, markerCount: markers.length, lastRenderAt: new Date().toISOString() };
    return registered;
  }

  function debugStructureMarkers(timeframe) {
    const context = window.BtcDash.state?.structureContexts?.[timeframe];
    const displaySwings = getDisplaySwings(context);
    const layerEnabled = isLayerEnabled();
    const registryCount = window.BtcDash.chart.overlayRegistry?.getOverlaysByLayer?.("structure")?.length || 0;
    const markerCount = window.BtcDash.chart.markers?.getMarkerState?.()?.byLayer?.structure?.length || 0;
    return { timeframe, displaySwings: displaySwings.length, markerCount, layerEnabled, registryCount, lastRenderAt: window.BtcDash.chart._lastStructureMarkerRender?.lastRenderAt || null };
  }

  window.BtcDash.chart.debugStructureMarkers = debugStructureMarkers;
  window.BtcDash.chart.overlays.structure = { renderStructureOverlay, clearStructureOverlay, buildStructureOverlayItems, debugStructureMarkers };
})();
