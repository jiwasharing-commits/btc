(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.chart = window.BtcDash.chart || {};
  window.BtcDash.chart.overlays = window.BtcDash.chart.overlays || {};

  function buildZoneLabel(row) { return row.label || row.zoneType || row.type || row.layer || "Zone"; }
  function resolveZoneStyle(row, options = {}) { return { className: options.className || `${row.layer || "zone"}-zone-box`, layer: options.layer || row.layer || "zone" }; }
  function normalizeZoneOverlay(row, options = {}) {
    if (!row) return null;
    const midpoint = Number(row.midpoint ?? row.price ?? ((Number(row.lower ?? row.zoneLow) + Number(row.upper ?? row.zoneHigh)) / 2));
    if (!Number.isFinite(midpoint)) return null;
    const lower = Number(row.lower ?? row.zoneLow ?? midpoint * 0.999);
    const upper = Number(row.upper ?? row.zoneHigh ?? midpoint * 1.001);
    const pad = Math.max(midpoint * 0.001, Math.abs(upper - lower) / 2);
    const normalized = {
      layer: options.layer || row.layer || row.zoneType || "zone",
      timeframe: options.timeframe || row.timeframe || window.BtcDash.utils?.getActiveTimeframe?.() || "1W",
      workspace: options.workspace || window.BtcDash.state?.activeWorkspace,
      source: row.source || options.source || "zone",
      sourceId: row.id || row.sourceId || null,
      type: row.type || row.zoneType || "zone",
      label: buildZoneLabel(row),
      zoneLow: lower === upper ? midpoint - pad : Math.min(lower, upper),
      zoneHigh: lower === upper ? midpoint + pad : Math.max(lower, upper),
      price: midpoint,
      startTime: row.startTime || row.firstTime || row.createdAtTime || options.startTime || null,
      endTime: row.endTime || row.lastTime || options.endTime || null,
      drawPolicy: row.drawPolicy || options.drawPolicy || "show",
      meta: { raw: row }
    };
    normalized.key = window.BtcDash.chart.overlayRegistry?.buildOverlayKey(normalized) || `${normalized.layer}|${normalized.timeframe}|${normalized.sourceId}|${normalized.price}`;
    return normalized;
  }
  function renderZoneOverlay(row, options = {}) {
    const overlay = normalizeZoneOverlay(row, options);
    if (!overlay) return null;
    overlay.drawPolicy = window.BtcDash.chart.autoscaleGuard?.resolveOverlayDrawPolicy(overlay, overlay.timeframe) || overlay.drawPolicy;
    if (overlay.drawPolicy !== "show") return null;
    if (typeof window.BtcDash.chart?.addBoundedZoneBox === "function") {
      const style = resolveZoneStyle({ ...row, layer: overlay.layer }, options);
      const element = window.BtcDash.chart.addBoundedZoneBox({ type: overlay.layer, className: style.className, label: overlay.label, lower: overlay.zoneLow, upper: overlay.zoneHigh, startTime: overlay.startTime, endTime: overlay.endTime, overlayKey: overlay.key });
      overlay.domElement = element || null;
    }
    return window.BtcDash.chart.overlayRegistry?.registerOverlay(overlay) || overlay;
  }
  function renderZoneOverlayBatch(rows = [], options = {}) { const max = window.BtcDash.config?.PERFORMANCE_CONFIG?.overlay?.maxZonesPerLayer || 24; return rows.filter((row) => (row?.drawPolicy || options.drawPolicy || "show") === "show").slice(0, max).map((row) => renderZoneOverlay(row, options)).filter(Boolean); }
  function clearZoneOverlayLayer(layer, timeframe = null) {
    if (timeframe) window.BtcDash.chart.overlayRegistry?.clearTimeframe(timeframe);
    else window.BtcDash.chart.overlayRegistry?.clearLayer(layer);
    if (typeof window.BtcDash.chart?.clearChartOverlayLayer === "function") window.BtcDash.chart.clearChartOverlayLayer(layer);
  }

  window.BtcDash.chart.overlays.zone = { normalizeZoneOverlay, renderZoneOverlay, renderZoneOverlayBatch, clearZoneOverlayLayer, buildZoneLabel, resolveZoneStyle };
})();
