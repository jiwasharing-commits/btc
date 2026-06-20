(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.chart = window.BtcDash.chart || {};
  window.BtcDash.chart.overlays = window.BtcDash.chart.overlays || {};

  function createOverlayRegistry() {
    return { overlays: new Map(), warnings: [], createdAt: new Date().toISOString() };
  }

  function getOverlayRegistry() {
    const state = window.BtcDash.state;
    if (!state.chartRuntime) state.chartRuntime = { warnings: [] };
    if (!state.chartRuntime.overlayRegistry) state.chartRuntime.overlayRegistry = createOverlayRegistry();
    return state.chartRuntime.overlayRegistry;
  }

  function cleanupOverlay(overlay) {
    try {
      if (overlay?.chartObject) {
        if (typeof overlay.chartObject.remove === "function") overlay.chartObject.remove();
        else if (typeof overlay.chartObject.delete === "function") overlay.chartObject.delete();
      }
      if (overlay?.domElement?.parentNode) overlay.domElement.parentNode.removeChild(overlay.domElement);
    } catch (error) {
      getOverlayRegistry().warnings.push(`Overlay cleanup failed: ${error.message}`);
      window.BtcDash.state?.chartRuntime?.warnings?.push(error.message);
      console.warn("[Overlay Registry] cleanup failed", error);
    }
  }

  function buildOverlayKey(overlay) {
    const fields = window.BtcDash.config?.OVERLAY_RENDER_CONFIG?.duplicateKeyFields || ["layer", "timeframe", "source", "sourceId", "type", "price", "startTime", "endTime"];
    return fields.map((field) => overlay?.[field] ?? "").join("|");
  }

  function registerOverlay(overlay) {
    const registry = getOverlayRegistry();
    if (!overlay?.layer || !overlay?.timeframe) {
      registry.warnings.push("Overlay skipped: layer/timeframe required");
      return null;
    }
    const key = overlay.key || buildOverlayKey(overlay);
    const existing = registry.overlays.get(key);
    const now = new Date().toISOString();
    if (existing) {
      const updated = { ...existing, ...overlay, key, updatedAt: now };
      registry.overlays.set(key, updated);
      return updated;
    }
    const record = {
      id: overlay.id || `overlay-${registry.overlays.size + 1}-${Date.now()}`,
      key,
      layer: overlay.layer,
      timeframe: overlay.timeframe,
      workspace: overlay.workspace || window.BtcDash.state?.activeWorkspace,
      source: overlay.source || overlay.layer,
      sourceId: overlay.sourceId || null,
      type: overlay.type || overlay.layer,
      drawPolicy: overlay.drawPolicy || window.BtcDash.config?.CHART_LAYER_CONFIG?.defaultDrawPolicy || "show",
      price: overlay.price ?? null,
      zoneLow: overlay.zoneLow ?? null,
      zoneHigh: overlay.zoneHigh ?? null,
      startTime: overlay.startTime ?? null,
      endTime: overlay.endTime ?? null,
      chartObject: overlay.chartObject || null,
      domElement: overlay.domElement || null,
      createdAt: now,
      updatedAt: now,
      meta: overlay.meta || {}
    };
    registry.overlays.set(key, record);
    return record;
  }

  function removeOverlay(idOrKey) {
    const registry = getOverlayRegistry();
    let key = idOrKey;
    if (!registry.overlays.has(key)) {
      const found = [...registry.overlays.entries()].find(([, overlay]) => overlay.id === idOrKey);
      key = found?.[0];
    }
    if (!key || !registry.overlays.has(key)) return false;
    cleanupOverlay(registry.overlays.get(key));
    registry.overlays.delete(key);
    return true;
  }

  function clearWhere(predicate) {
    const registry = getOverlayRegistry();
    [...registry.overlays.entries()].forEach(([key, overlay]) => {
      if (predicate(overlay)) {
        cleanupOverlay(overlay);
        registry.overlays.delete(key);
      }
    });
  }

  function clearLayer(layer) { clearWhere((overlay) => overlay.layer === layer); }
  function clearTimeframe(timeframe) { clearWhere((overlay) => overlay.timeframe === timeframe); }
  function clearWorkspace(workspace) { clearWhere((overlay) => overlay.workspace === workspace); }
  function clearAllOverlays() { clearWhere(() => true); }
  function hasOverlay(key) { return getOverlayRegistry().overlays.has(key); }
  function snapshotOverlayRegistry() { return [...getOverlayRegistry().overlays.values()].map((overlay) => ({ ...overlay, chartObject: Boolean(overlay.chartObject), domElement: Boolean(overlay.domElement) })); }
  function getOverlaySnapshot() { return snapshotOverlayRegistry(); }
  function getOverlaysByLayer(layer) { return snapshotOverlayRegistry().filter((overlay) => overlay.layer === layer); }
  function getOverlaysByTimeframe(timeframe) { return snapshotOverlayRegistry().filter((overlay) => overlay.timeframe === timeframe); }
  function getDuplicateOverlayKeys() {
    const counts = {};
    snapshotOverlayRegistry().forEach((overlay) => { counts[overlay.key] = (counts[overlay.key] || 0) + 1; });
    return Object.entries(counts).filter(([, count]) => count > 1).map(([key, count]) => ({ key, count }));
  }
  function getLayerOffResidue(layerState = {}) {
    const disabled = Object.entries(layerState).filter(([, enabled]) => !enabled).map(([layer]) => layer);
    return snapshotOverlayRegistry().filter((overlay) => disabled.includes(overlay.layer));
  }

  function getOverlayStats() {
    const overlays = snapshotOverlayRegistry();
    return overlays.reduce((stats, overlay) => {
      stats.total += 1;
      stats.byLayer[overlay.layer] = (stats.byLayer[overlay.layer] || 0) + 1;
      stats.byTimeframe[overlay.timeframe] = (stats.byTimeframe[overlay.timeframe] || 0) + 1;
      return stats;
    }, { total: 0, byLayer: {}, byTimeframe: {}, warnings: getOverlayRegistry().warnings.slice() });
  }

  window.BtcDash.chart.overlayRegistry = { createOverlayRegistry, getOverlayRegistry, registerOverlay, removeOverlay, clearLayer, clearTimeframe, clearWorkspace, clearAllOverlays, hasOverlay, buildOverlayKey, getOverlayStats, snapshotOverlayRegistry, getOverlaySnapshot, getOverlaysByLayer, getOverlaysByTimeframe, getDuplicateOverlayKeys, getLayerOffResidue };
})();
