(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.chart = window.BtcDash.chart || {};
  window.BtcDash.chart.overlays = window.BtcDash.chart.overlays || {};

  function isLayerEnabled() {
    const state = window.BtcDash.state;
    return Boolean(state?.chartRuntime?.layerState?.structure || state?.activeLayers?.Structure);
  }

  function getDisplaySwings(context) {
    const timeframe = context?.timeframe || window.BtcDash.chart?.getActiveChartTimeframe?.();
    return window.BtcDash.getRenderableStructureLabels?.(timeframe, context) || context?.visibleStructureLabels || [];
  }

  function buildStructureOverlayItems(timeframe) {
    const context = window.BtcDash.state?.structureContexts?.[timeframe];
    if (!context?.available) return [];
    const swings = getDisplaySwings(context).filter((item) => (item?.displayLabel || item?.microDisplayLabel || item?.label) && item?.price && item?.time).slice(-(window.BtcDash.config?.PERFORMANCE_CONFIG?.overlay?.maxMarkersPerLayer || 80)).map((item) => ({
      layer: "structure",
      timeframe,
      source: "structure-v2",
      sourceId: item.id || `${item.time}-${item.label}`,
      type: item.type || "swing",
      price: item.price,
      startTime: item.time,
      endTime: item.time,
      label: item.displayLabel || item.microDisplayLabel || item.label,
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

  function renderStructureOverlay(timeframe = window.BtcDash.chart?.getActiveChartTimeframe?.()) {
    clearStructureOverlay(timeframe);
    if (!isLayerEnabled()) return [];
    const baseStatus = window.BtcDash.chart.assertBaseChartReady?.() || { ready: false, reason: "base-chart-ready-guard-unavailable" };
    if (!baseStatus.ready) { window.BtcDash.chart._lastStructureMarkerRender = { timeframe, markerCount: 0, markerStatus: { warning: "base-chart-not-ready", baseChartStatus: baseStatus }, lastRenderAt: new Date().toISOString() }; return []; }
    const activeTimeframe = window.BtcDash.chart?.getActiveChartTimeframe?.() || timeframe;
    const items = buildStructureOverlayItems(timeframe || activeTimeframe);
    const markers = items.map((item) => ({
      time: item.startTime,
      price: item.price,
      text: item.displayLabel || item.microDisplayLabel || item.label,
      shape: item.type === "low" || item.label === "HL" || item.label === "LL" ? "arrowUp" : "arrowDown",
      position: item.type === "low" || item.label === "HL" || item.label === "LL" ? "belowBar" : "aboveBar",
      color: item.type === "low" || item.label === "HL" || item.label === "LL" ? "#facc15" : "#38bdf8",
      type: item.type,
      label: item.displayLabel || item.microDisplayLabel || item.label
    }));
    const markerStatus = window.BtcDash.chart.markers?.renderMarkers?.("structure", timeframe || activeTimeframe, markers);
    const registered = items.map((item) => window.BtcDash.chart.overlayRegistry?.registerOverlay({ ...item, key: `${item.layer}|${item.timeframe}|${item.sourceId}|${item.type}|${item.price}`, meta: { ...item.meta, markerStatus } })).filter(Boolean);
    window.BtcDash.chart._lastStructureMarkerRender = { timeframe: timeframe || activeTimeframe, markerCount: markers.length, markerStatus, lastRenderAt: new Date().toISOString() };
    return registered;
  }

  function debugStructureMarkers(timeframe = window.BtcDash.chart?.getActiveChartTimeframe?.()) {
    const activeTimeframe = window.BtcDash.chart?.getActiveChartTimeframe?.() || timeframe;
    const context = window.BtcDash.state?.structureContexts?.[timeframe || activeTimeframe];
    const displaySwings = getDisplaySwings(context);
    const layerEnabled = isLayerEnabled();
    const registryCount = window.BtcDash.chart.overlayRegistry?.getOverlaysByLayer?.("structure")?.length || 0;
    const markerStats = window.BtcDash.chart.markers?.getMarkerStats?.() || {};
    const markerLayer = markerStats.byLayer?.structure || 0;
    const binding = window.BtcDash.chart?.getChartBindingDiagnostics?.() || {};
    const apiMode = window.BtcDash.chart?.adapter?.detectChartApiMode?.(window.BtcDash.chart?.getActiveChart?.()) || { mode: "unknown" };
    const last = window.BtcDash.chart._lastStructureMarkerRender || {};
    const warnings = [];
    if (!binding.hasChart || !binding.hasCandleSeries) warnings.push("missing-active-chart-binding");
    if (layerEnabled && !markerLayer) warnings.push("No structure markers rendered for active layer.");
    return {
      timeframe: timeframe || activeTimeframe,
      activeTimeframe,
      layerEnabled,
      chartBindingValid: Boolean(binding.hasChart && binding.hasCandleSeries),
      apiMode: apiMode.mode,
      contextAvailable: Boolean(context?.available),
      displaySwingsCount: (context?.displaySwings || []).length,
      displayLabelsCount: (context?.displayLabels || []).length,
      labelsCount: (context?.labels || []).length,
      displaySwings: displaySwings.length,
      markerBuiltCount: last.markerCount || 0,
      markerApplyMode: last.markerStatus?.applyStatus?.mode || last.markerStatus?.mode || markerStats.applyMode || null,
      markerApplySuccess: last.markerStatus?.applyStatus?.success ?? markerStats.applySuccess ?? null,
      markerCount: markerLayer,
      markerStats,
      registryCount,
      lastRenderAt: last.lastRenderAt || null,
      warnings
    };
  }

  window.BtcDash.chart.debugStructureMarkers = debugStructureMarkers;
  window.BtcDash.chart.overlays.structure = { renderStructureOverlay, clearStructureOverlay, buildStructureOverlayItems, debugStructureMarkers };
})();
