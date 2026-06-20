(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.chart = window.BtcDash.chart || {};
  window.BtcDash.chart.overlays = window.BtcDash.chart.overlays || {};

  let lastZoneRenderStats = { coordinateResolvedCount: 0, coordinateFailedCount: 0, skipReasons: [] };

  function buildZoneLabel(row) { return row.label || row.zoneType || row.type || row.layer || "Zone"; }
  function resolveZoneStyle(row, options = {}) { return { className: options.className || `${row.layer || "zone"}-zone-box`, layer: options.layer || row.layer || "zone" }; }
  function activeTimeframeFallback(row, options) { return options.timeframe || row?.timeframe || window.BtcDash.chart?.getActiveChartTimeframe?.() || window.BtcDash.utils?.getActiveTimeframe?.() || "1W"; }

  function normalizeZoneOverlay(row, options = {}) {
    if (!row) return null;
    const midpoint = Number(row.midpoint ?? row.midpointPrice ?? row.centerPrice ?? row.price ?? ((Number(row.lower ?? row.zoneLow) + Number(row.upper ?? row.zoneHigh)) / 2));
    if (!Number.isFinite(midpoint)) return null;
    const lower = Number(row.lower ?? row.zoneLow ?? midpoint * 0.999);
    const upper = Number(row.upper ?? row.zoneHigh ?? midpoint * 1.001);
    const pad = Math.max(Math.abs(midpoint) * 0.001, Math.abs(upper - lower) / 2, 1);
    const tf = activeTimeframeFallback(row, options);
    const candles = window.BtcDash.state?.marketData?.[tf] || [];
    const interval = candles.length > 1 ? Number(candles.at(-1).open_time) - Number(candles.at(-2).open_time) : 3600000;
    const fallbackEnd = Number(candles.at(-1)?.open_time || Date.now());
    const fallbackStart = Number(candles[Math.max(0, candles.length - 48)]?.open_time || fallbackEnd - interval * 24);
    let start = row.startTime || row.firstTime || row.firstSeenTime || row.createdAtTime || options.startTime || fallbackStart;
    let end = row.endTime || row.lastTime || row.lastTouchTime || options.endTime || fallbackEnd + interval * 8;
    if (Number(end) <= Number(start)) end = Number(start) + interval * 8;
    const normalized = {
      layer: options.layer || row.layer || row.zoneType || "zone",
      timeframe: tf,
      workspace: options.workspace || window.BtcDash.state?.activeWorkspace,
      source: row.source || options.source || "zone",
      sourceId: row.id || row.sourceId || null,
      type: row.type || row.zoneType || "zone",
      label: buildZoneLabel(row),
      zoneLow: lower === upper ? midpoint - pad : Math.min(lower, upper),
      zoneHigh: lower === upper ? midpoint + pad : Math.max(lower, upper),
      price: midpoint,
      centerPrice: midpoint,
      startTime: start,
      endTime: end,
      drawPolicy: row.drawPolicy || options.drawPolicy || "show",
      meta: { raw: row }
    };
    normalized.key = window.BtcDash.chart.overlayRegistry?.buildOverlayKey(normalized) || `${normalized.layer}|${normalized.timeframe}|${normalized.sourceId}|${normalized.price}`;
    return normalized;
  }

  function getOverlayRoot() {
    const container = window.BtcDash.chart?.getActiveChartContainer?.() || document.querySelector("#main-chart");
    if (!container) return null;
    if (getComputedStyle(container).position === "static") container.style.position = "relative";
    let root = container.querySelector(":scope > .btc-chart-overlay-root");
    if (!root) {
      root = document.createElement("div");
      root.className = "btc-chart-overlay-root";
      root.setAttribute("aria-hidden", "true");
      container.appendChild(root);
    }
    return root;
  }

  function toChartTime(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return value;
    return numeric > 10000000000 ? Math.floor(numeric / 1000) : numeric;
  }

  function fallbackXFromCandles(time, timeframe, container, side) {
    const candles = window.BtcDash.state?.marketData?.[timeframe] || [];
    if (!candles.length || !container) return side === "end" ? container?.clientWidth || 0 : 0;
    const target = Number(time);
    const nearestIndex = candles.reduce((best, candle, index) => {
      const distance = Math.abs(Number(candle.open_time || 0) - target);
      return distance < best.distance ? { index, distance } : best;
    }, { index: side === "end" ? candles.length - 1 : 0, distance: Infinity }).index;
    const denom = Math.max(1, candles.length - 1);
    return Math.max(0, Math.min(container.clientWidth || 0, (nearestIndex / denom) * (container.clientWidth || 0)));
  }

  function resolveZoneCoordinates(zone, timeframe, options = {}) {
    const chart = window.BtcDash.chart?.getActiveChart?.();
    const series = window.BtcDash.chart?.getActiveCandleSeries?.();
    const container = window.BtcDash.chart?.getActiveChartContainer?.();
    const adapter = window.BtcDash.chart?.adapter;
    const reasons = [];
    if (!chart) reasons.push("missing-active-chart");
    if (!series) reasons.push("missing-candle-series");
    if (!container) reasons.push("missing-chart-container");
    if (reasons.length) return { valid: false, reasons };
    const tf = timeframe || zone.timeframe || window.BtcDash.chart?.getActiveChartTimeframe?.();
    const low = Number(zone.zoneLow ?? zone.lower ?? zone.price ?? zone.centerPrice);
    const high = Number(zone.zoneHigh ?? zone.upper ?? zone.price ?? zone.centerPrice);
    const priceLow = Math.min(low, high);
    const priceHigh = Math.max(low, high);
    const start = zone.startTime;
    const end = zone.endTime;
    const xStart = adapter?.timeToCoordinateSafe?.(chart, toChartTime(start)) || { valid: false, reason: "adapter-unavailable" };
    const xEnd = adapter?.timeToCoordinateSafe?.(chart, toChartTime(end)) || { valid: false, reason: "adapter-unavailable" };
    let x1 = xStart.valid ? xStart.value : fallbackXFromCandles(start, tf, container, "start");
    let x2 = xEnd.valid ? xEnd.value : fallbackXFromCandles(end, tf, container, "end");
    if (!xStart.valid) reasons.push(`start:${xStart.reason}`);
    if (!xEnd.valid) reasons.push(`end:${xEnd.reason}`);
    const yTop = adapter?.priceToCoordinateSafe?.(series, priceHigh) || { valid: false, reason: "adapter-unavailable" };
    const yBottom = adapter?.priceToCoordinateSafe?.(series, priceLow) || { valid: false, reason: "adapter-unavailable" };
    if (!yTop.valid) reasons.push(`priceHigh:${yTop.reason}`);
    if (!yBottom.valid) reasons.push(`priceLow:${yBottom.reason}`);
    if (!Number.isFinite(x1) || !Number.isFinite(x2) || !yTop.valid || !yBottom.valid) return { valid: false, reasons };
    if (x2 < x1) [x1, x2] = [x2, x1];
    const left = Math.max(0, Math.min(container.clientWidth || 0, x1));
    const right = Math.max(0, Math.min(container.clientWidth || 0, x2));
    const top = Math.max(0, Math.min(container.clientHeight || 0, Math.min(yTop.value, yBottom.value)));
    const bottom = Math.max(0, Math.min(container.clientHeight || 0, Math.max(yTop.value, yBottom.value)));
    const width = Math.max(2, right - left);
    const height = Math.max(2, bottom - top);
    return { valid: true, x1: left, x2: left + width, y1: top, y2: top + height, width, height, reasons, chartTimeStart: toChartTime(start), chartTimeEnd: toChartTime(end) };
  }

  function renderZoneOverlay(row, options = {}) {
    const overlay = normalizeZoneOverlay(row, options);
    if (!overlay) { lastZoneRenderStats.coordinateFailedCount += 1; lastZoneRenderStats.skipReasons.push("invalid-zone-row"); return null; }
    overlay.drawPolicy = window.BtcDash.chart.autoscaleGuard?.resolveOverlayDrawPolicy(overlay, overlay.timeframe) || overlay.drawPolicy || "show";
    if (overlay.drawPolicy !== "show") { lastZoneRenderStats.skipReasons.push("draw-policy-hidden"); return null; }
    const coordinates = resolveZoneCoordinates(overlay, overlay.timeframe, options);
    if (!coordinates.valid) {
      lastZoneRenderStats.coordinateFailedCount += 1;
      lastZoneRenderStats.skipReasons.push(...coordinates.reasons);
      overlay.meta.coordinateFailure = coordinates.reasons;
      return null;
    }
    const root = getOverlayRoot();
    if (!root) { lastZoneRenderStats.coordinateFailedCount += 1; lastZoneRenderStats.skipReasons.push("missing-overlay-root"); return null; }
    const style = resolveZoneStyle({ ...row, layer: overlay.layer }, options);
    const box = document.createElement("div");
    box.dataset.overlayType = overlay.layer;
    box.dataset.overlayKey = overlay.key;
    box.className = style.className;
    box.style.left = `${coordinates.x1}px`;
    box.style.width = `${coordinates.width}px`;
    box.style.top = `${coordinates.y1}px`;
    box.style.height = `${coordinates.height}px`;
    box.innerHTML = `<span>${overlay.label}</span>`;
    root.appendChild(box);
    overlay.domElement = box;
    overlay.meta.coordinates = coordinates;
    lastZoneRenderStats.coordinateResolvedCount += 1;
    return window.BtcDash.chart.overlayRegistry?.registerOverlay(overlay) || overlay;
  }

  function renderZoneOverlayBatch(rows = [], options = {}) {
    lastZoneRenderStats = { coordinateResolvedCount: 0, coordinateFailedCount: 0, skipReasons: [] };
    const max = window.BtcDash.config?.PERFORMANCE_CONFIG?.overlay?.maxZonesPerLayer || 24;
    return rows.filter((row) => (row?.drawPolicy || options.drawPolicy || "show") !== "hide" && (row?.drawPolicy || options.drawPolicy || "show") !== "summaryOnly").slice(0, max).map((row) => renderZoneOverlay(row, options)).filter(Boolean);
  }

  function clearZoneOverlayLayer(layer, timeframe = null) {
    const root = getOverlayRoot();
    if (root) root.querySelectorAll(`[data-overlay-type="${layer}"]`).forEach((node) => node.remove());
    if (timeframe) {
      const overlays = window.BtcDash.chart.overlayRegistry?.getOverlaysByLayer?.(layer) || [];
      overlays.filter((overlay) => overlay.timeframe === timeframe).forEach((overlay) => window.BtcDash.chart.overlayRegistry?.removeOverlay?.(overlay.key || overlay.id));
    } else window.BtcDash.chart.overlayRegistry?.clearLayer(layer);
  }

  function getLastZoneRenderStats() { return { ...lastZoneRenderStats, skipReasons: [...new Set(lastZoneRenderStats.skipReasons)] }; }

  window.BtcDash.chart.overlays.zone = { normalizeZoneOverlay, renderZoneOverlay, renderZoneOverlayBatch, clearZoneOverlayLayer, buildZoneLabel, resolveZoneStyle, resolveZoneCoordinates, getOverlayRoot, getLastZoneRenderStats };
})();
