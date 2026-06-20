(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.chart = window.BtcDash.chart || {};
  window.BtcDash.chart.overlays = window.BtcDash.chart.overlays || {};

  let lastFvgBoundaryStats = { renderedCount: 0, skippedCount: 0, coordinateFailedCount: 0, skipReasons: [] };

  function isLayerEnabled() {
    const state = window.BtcDash.state;
    return Boolean(state?.chartRuntime?.layerState?.fvg || state?.activeLayers?.FVG);
  }

  function getConfig() { return window.BtcDash.config?.FVG_BOUNDARY_DISPLAY_CONFIG || {}; }
  function getActiveTimeframe(timeframe) { return timeframe || window.BtcDash.chart?.getActiveChartTimeframe?.() || window.BtcDash.chart?.getActiveTimeframe?.() || "1W"; }

  function getFvgSource(timeframe) {
    const context = window.BtcDash.state?.fvgContexts?.[timeframe];
    return { context, rows: context?.visibleBoundaryFvgs || [], visibleCount: context?.visibleBoundaryFvgs?.length || 0 };
  }

  function getOverlayRoot() { return window.BtcDash.chart.overlays.zone?.getOverlayRoot?.() || null; }
  function toChartTime(value) { return window.BtcDash.utils?.normalizeChartTime?.(value) ?? value; }

  function intervalSeconds(timeframe) {
    const candles = window.BtcDash.state?.marketData?.[timeframe] || [];
    const a = Number(candles.at(-1)?.open_time ?? Date.parse(candles.at(-1)?.time));
    const b = Number(candles.at(-2)?.open_time ?? Date.parse(candles.at(-2)?.time));
    const ms = Number.isFinite(a) && Number.isFinite(b) && a > b ? a - b : 3600000;
    return Math.max(60, Math.floor(ms / 1000));
  }

  function buildFvgBoundaryOverlayData(visibleBoundaryFvgs = [], timeframe = getActiveTimeframe()) {
    const cfg = getConfig();
    const extendBars = cfg.boundaryRender?.extendBars?.[timeframe] || 40;
    const step = intervalSeconds(timeframe);
    return visibleBoundaryFvgs.slice(0, cfg.visibleLimit?.maxTotalAll || 6).filter((fvg) => fvg.renderPolicy === "boundary" && !["filled", "mitigated", "invalidated", "historical"].includes(fvg.status)).map((fvg) => {
      const start = toChartTime(fvg.startTime || fvg.createdAtTime || fvg.candle3Time);
      const end = toChartTime(fvg.endTime || (Number(start) + extendBars * step));
      return {
        id: fvg.id,
        layer: "fvg",
        timeframe,
        source: "FVG",
        sourceId: fvg.id,
        direction: fvg.direction,
        type: fvg.direction,
        label: fvg.label || `${fvg.sourceTimeframe || fvg.timeframe} ${fvg.direction} FVG`,
        lowerBound: Number(fvg.lowerBound ?? fvg.zoneLow),
        upperBound: Number(fvg.upperBound ?? fvg.zoneHigh),
        zoneLow: Number(fvg.zoneLow ?? fvg.lowerBound),
        zoneHigh: Number(fvg.zoneHigh ?? fvg.upperBound),
        price: Number(fvg.centerPrice ?? fvg.midpoint),
        startTime: start,
        endTime: end,
        isHTFProjection: Boolean(fvg.isHTFProjection),
        status: fvg.status,
        score: fvg.score,
        lineStyle: fvg.isHTFProjection ? "dashed" : "solid",
        opacity: fvg.isHTFProjection ? (cfg.projection?.htfOpacity ?? 0.35) : (cfg.projection?.localOpacity ?? 0.85),
        renderPolicy: fvg.renderPolicy,
        sourceTimeframe: fvg.sourceTimeframe || fvg.timeframe,
        raw: fvg
      };
    });
  }

  function coordinateForBoundary(item) {
    const chart = window.BtcDash.chart?.getActiveChart?.();
    const series = window.BtcDash.chart?.getActiveCandleSeries?.();
    const container = window.BtcDash.chart?.getActiveChartContainer?.();
    const adapter = window.BtcDash.chart?.adapter;
    const reasons = [];
    if (!chart) reasons.push("missing-active-chart");
    if (!series) reasons.push("missing-candle-series");
    if (!container) reasons.push("missing-chart-container");
    if (reasons.length) return { valid: false, reasons };
    const xStart = adapter?.timeToCoordinateSafe?.(chart, item.startTime) || { valid: false, reason: "time-adapter-unavailable" };
    const xEnd = adapter?.timeToCoordinateSafe?.(chart, item.endTime) || { valid: false, reason: "time-adapter-unavailable" };
    const yUpper = adapter?.priceToCoordinateSafe?.(series, item.upperBound) || { valid: false, reason: "price-adapter-unavailable" };
    const yLower = adapter?.priceToCoordinateSafe?.(series, item.lowerBound) || { valid: false, reason: "price-adapter-unavailable" };
    if (!xStart.valid) reasons.push(`start:${xStart.reason}`);
    if (!xEnd.valid) reasons.push(`end:${xEnd.reason}`);
    if (!yUpper.valid) reasons.push(`upper:${yUpper.reason}`);
    if (!yLower.valid) reasons.push(`lower:${yLower.reason}`);
    if (!xStart.valid || !xEnd.valid || !yUpper.valid || !yLower.valid) return { valid: false, reasons };
    const left = Math.max(0, Math.min(xStart.value, xEnd.value));
    const right = Math.min(container.clientWidth || 0, Math.max(xStart.value, xEnd.value));
    return { valid: true, left, width: Math.max(12, right - left), yUpper: yUpper.value, yLower: yLower.value };
  }

  function renderFvgBoundaryOverlay(chart, candleSeries, overlayRoot, overlayData = []) {
    lastFvgBoundaryStats = { renderedCount: 0, skippedCount: 0, coordinateFailedCount: 0, skipReasons: [] };
    const root = overlayRoot || getOverlayRoot();
    if (!root) { lastFvgBoundaryStats.skipReasons.push("missing-overlay-root"); return []; }
    const rendered = [];
    overlayData.forEach((item) => {
      const coordinates = coordinateForBoundary(item);
      if (!coordinates.valid) {
        lastFvgBoundaryStats.coordinateFailedCount += 1;
        lastFvgBoundaryStats.skippedCount += 1;
        lastFvgBoundaryStats.skipReasons.push(...coordinates.reasons);
        return;
      }
      const zone = document.createElement("div");
      zone.className = `fvg-boundary-zone fvg-boundary-${item.direction} ${item.isHTFProjection ? "fvg-boundary-htf" : "fvg-boundary-local"} fvg-boundary-${item.status}`;
      zone.dataset.overlayType = "fvg";
      zone.dataset.overlayKey = item.id;
      zone.style.left = `${coordinates.left}px`;
      zone.style.top = `${Math.min(coordinates.yUpper, coordinates.yLower)}px`;
      zone.style.width = `${coordinates.width}px`;
      zone.style.height = `${Math.max(2, Math.abs(coordinates.yLower - coordinates.yUpper))}px`;
      zone.style.opacity = String(item.opacity ?? 0.85);
      const dash = item.lineStyle === "dashed" ? " fvg-boundary-line-dashed" : "";
      zone.innerHTML = `<div class="fvg-boundary-line fvg-boundary-line-upper${dash}"></div><div class="fvg-boundary-line fvg-boundary-line-lower${dash}"></div><span class="fvg-boundary-label">${item.label}</span>`;
      root.appendChild(zone);
      const overlay = { ...item, key: window.BtcDash.chart.overlayRegistry?.buildOverlayKey?.(item) || item.id, domElement: zone, meta: { coordinates, boundaryOnly: true } };
      rendered.push(window.BtcDash.chart.overlayRegistry?.registerOverlay?.(overlay) || overlay);
      lastFvgBoundaryStats.renderedCount += 1;
    });
    return rendered;
  }

  function buildFvgOverlayItems(timeframe) {
    const tf = getActiveTimeframe(timeframe);
    const { context, rows } = getFvgSource(tf);
    if (!context?.available) return [];
    return buildFvgBoundaryOverlayData(rows, tf);
  }

  function clearFvgOverlay(timeframe = null) {
    window.BtcDash.chart.overlays.zone?.clearZoneOverlayLayer?.("fvg", timeframe);
    window.BtcDash.chart.overlayRegistry?.clearLayer?.("fvg-boundary");
  }

  function renderFvgOverlay(timeframe) {
    const tf = getActiveTimeframe(timeframe);
    clearFvgOverlay(tf);
    if (!isLayerEnabled()) return [];
    const baseStatus = window.BtcDash.chart.assertBaseChartReady?.() || { ready: true };
    if (!baseStatus.ready) { lastFvgBoundaryStats = { renderedCount: 0, skippedCount: 0, coordinateFailedCount: 0, skipReasons: ["base-chart-not-ready", baseStatus.reason] }; return []; }
    return renderFvgBoundaryOverlay(window.BtcDash.chart.getActiveChart?.(), window.BtcDash.chart.getActiveCandleSeries?.(), getOverlayRoot(), buildFvgOverlayItems(tf));
  }

  function debugFvgOverlay(timeframe) {
    const tf = getActiveTimeframe(timeframe);
    const src = getFvgSource(tf);
    const items = buildFvgOverlayItems(tf);
    const binding = window.BtcDash.chart.getChartBindingDiagnostics?.() || {};
    return { layer: "fvg", mode: "boundary_only", timeframe: tf, activeTimeframe: binding.activeTimeframe, chartBindingValid: Boolean(binding.hasChart && binding.hasCandleSeries), contextAvailable: Boolean(src.context?.available), candidateCount: items.length, visibleBoundaryFvgs: src.visibleCount, renderedCount: window.BtcDash.chart.overlayRegistry?.getOverlayCountByLayer?.("fvg") || 0, skippedCount: Math.max(0, src.rows.length - items.length) + lastFvgBoundaryStats.skippedCount, coordinateFailedCount: lastFvgBoundaryStats.coordinateFailedCount, skipReasons: [...new Set(lastFvgBoundaryStats.skipReasons)] };
  }

  window.BtcDash.chart.overlays.fvg = { renderFvgOverlay, clearFvgOverlay, buildFvgOverlayItems, buildFvgBoundaryOverlayData, renderFvgBoundaryOverlay, debugFvgOverlay };
  window.BtcDash.debugFvgOverlay = debugFvgOverlay;
})();
