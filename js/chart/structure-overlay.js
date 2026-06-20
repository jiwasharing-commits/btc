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
    const swings = getDisplaySwings(context).slice(-40).map((item) => ({
      layer: "structure",
      timeframe,
      source: "structure-v2",
      sourceId: item.id || `${item.time}-${item.label}`,
      type: item.type || "swing",
      price: item.price,
      startTime: item.time,
      endTime: item.time,
      label: item.label,
      drawPolicy: "summaryOnly",
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
    const markers = items.map((item) => ({ time: item.startTime, price: item.price, text: item.label, shape: item.type === "low" ? "arrowUp" : "arrowDown", type: item.type, label: item.label }));
    window.BtcDash.chart.markers?.renderMarkers?.(timeframe, { structure: markers });
    return items.map((item) => window.BtcDash.chart.overlayRegistry?.registerOverlay({ ...item, key: `${item.layer}|${item.timeframe}|${item.sourceId}|${item.type}|${item.price}` })).filter(Boolean);
  }

  window.BtcDash.chart.overlays.structure = { renderStructureOverlay, clearStructureOverlay, buildStructureOverlayItems };
})();
