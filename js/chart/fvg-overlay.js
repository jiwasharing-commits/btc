(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.chart = window.BtcDash.chart || {};
  window.BtcDash.chart.overlays = window.BtcDash.chart.overlays || {};

  let lastFvgBoxStats = { renderedCount: 0, skippedCount: 0, coordinateFailedCount: 0, skipReasons: [], lastRenderTime: null };

  function isLayerEnabled() {
    const state = window.BtcDash.state;
    return Boolean(state?.chartRuntime?.layerState?.fvg || state?.activeLayers?.FVG);
  }

  function getConfig() { return window.BtcDash.config?.FVG_RIGHT_EXTENDED_BOX_CONFIG || {}; }
  function getActiveTimeframe(timeframe) { return timeframe || window.BtcDash.chart?.getActiveChartTimeframe?.() || window.BtcDash.chart?.getActiveTimeframe?.() || "1W"; }
  function getFvgSource(timeframe) { const context = window.BtcDash.state?.fvgContexts?.[timeframe]; const rows = context?.visibleRightExtendedFvgs || context?.visibleBoxFvgs || context?.visibleBoundaryFvgs || []; return { context, rows, visibleCount: rows.length }; }
  function getOverlayRoot() { return window.BtcDash.chart.overlays.zone?.getOverlayRoot?.() || null; }
  function toChartTime(value) { return window.BtcDash.utils?.normalizeChartTime?.(value) ?? value; }

  function lastClosedChartTime(timeframe) {
    const candles = window.BtcDash.state?.chartRuntime?.lastFormattedCandles?.[timeframe] || window.BtcDash.state?.marketData?.[timeframe] || [];
    const last = candles.at(-1);
    return toChartTime(last?.time ?? last?.openTime ?? last?.open_time);
  }

  function getChartRightEdgeTime(timeframe) {
    const chart = window.BtcDash.chart?.getActiveChart?.();
    const range = chart?.timeScale?.()?.getVisibleRange?.();
    return toChartTime(range?.to) || lastClosedChartTime(timeframe);
  }

  function buildFvgRightExtendedBoxOverlayData(visibleFvgs = [], chartRange = null, activeTimeframe = getActiveTimeframe(), config = getConfig()) {
    const hiddenStatuses = new Set(config.hiddenChartStatuses || ["mitigated", "filled", "invalidated", "historical"]);
    const maxTotal = config.visibleLimit?.maxTotalAll || 9;
    const visibleRight = toChartTime(chartRange?.to) || getChartRightEdgeTime(activeTimeframe);
    const boxRender = config.boxRender || {};
    return visibleFvgs.slice(0, maxTotal).filter((fvg) => fvg.renderPolicy === "box_right_extend" && !hiddenStatuses.has(fvg.status)).map((fvg) => {
      const start = toChartTime(fvg.createdAtTime || fvg.candle3Time || fvg.startTime);
      const end = visibleRight || lastClosedChartTime(activeTimeframe) || start;
      const isInside = fvg.relationToPrice === "inside" || fvg.status === "inside";
      return {
        id: fvg.id,
        layer: "fvg",
        timeframe: activeTimeframe,
        source: "FVG",
        sourceId: fvg.id,
        direction: fvg.direction,
        type: fvg.direction,
        label: fvg.label || `${fvg.sourceTimeframe || fvg.timeframe} ${fvg.direction} FVG`,
        lowerBound: Number(fvg.lowerBound ?? fvg.zoneLow),
        upperBound: Number(fvg.upperBound ?? fvg.zoneHigh),
        midpoint: Number(fvg.midpoint ?? fvg.centerPrice),
        price: Number(fvg.centerPrice ?? fvg.midpoint),
        startTime: start,
        endTime: end,
        status: fvg.status,
        score: fvg.score,
        fillPct: fvg.fillState?.fillPct ?? 0,
        sourceType: fvg.sourceType || "local",
        isHTFProjection: Boolean(fvg.isHTFProjection),
        projectionDepth: fvg.projectionDepth || 0,
        renderPolicy: "box_right_extend",
        sourceTimeframe: fvg.sourceTimeframe || fvg.timeframe,
        visibleByNearestFallback: Boolean(fvg.visibleByNearestFallback),
        sourceLineage: fvg.sourceLineage || [],
        style: {
          fillOpacity: fvg.isHTFProjection ? (boxRender.htfFillOpacity ?? 0.035) : isInside ? (boxRender.currentInsideFillOpacity ?? 0.10) : (boxRender.localFillOpacity ?? 0.07),
          borderOpacity: fvg.isHTFProjection ? (boxRender.htfBorderOpacity ?? 0.40) : isInside ? (boxRender.currentInsideBorderOpacity ?? 0.95) : (boxRender.localBorderOpacity ?? 0.82),
          borderWidth: fvg.isHTFProjection ? (boxRender.htfBorderWidth ?? 1) : (boxRender.localBorderWidth ?? 1.2),
          borderStyle: fvg.isHTFProjection ? "dashed" : "solid",
          labelVisible: boxRender.showLabel !== false,
          inside: isInside
        },
        raw: fvg
      };
    });
  }

  function coordinateForBox(item) {
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
    const x1 = xStart.value;
    const x2 = Math.min(container.clientWidth || xEnd.value, xEnd.value);
    const width = x2 - x1;
    const height = Math.abs(yLower.value - yUpper.value);
    if (width <= 0) reasons.push("non-positive-box-width");
    if (height <= 0) reasons.push("non-positive-box-height");
    if (reasons.length) return { valid: false, reasons };
    return { valid: true, left: x1, width, top: Math.min(yUpper.value, yLower.value), height, yUpper: yUpper.value, yLower: yLower.value };
  }

  function colorFor(item) {
    if (item.direction === "bullish") return item.isHTFProjection ? "38, 166, 154" : "45, 212, 191";
    return item.isHTFProjection ? "239, 83, 80" : "251, 146, 60";
  }

  function renderFvgRightExtendedBoxes(chart, candleSeries, overlayRoot, overlayData = []) {
    lastFvgBoxStats = { renderedCount: 0, skippedCount: 0, coordinateFailedCount: 0, skipReasons: [], lastRenderTime: new Date().toISOString() };
    const root = overlayRoot || getOverlayRoot();
    if (!root) { lastFvgBoxStats.skipReasons.push("missing-overlay-root"); return []; }
    const rendered = [];
    overlayData.forEach((item) => {
      const coordinates = coordinateForBox(item);
      if (!coordinates.valid) { lastFvgBoxStats.coordinateFailedCount += 1; lastFvgBoxStats.skippedCount += 1; lastFvgBoxStats.skipReasons.push(...coordinates.reasons); return; }
      const rgb = colorFor(item);
      const zone = document.createElement("div");
      zone.className = `fvg-box-zone fvg-box-zone-${item.direction} ${item.isHTFProjection ? "fvg-box-zone-htf" : "fvg-box-zone-local"} fvg-box-zone-${item.status}${item.style.inside ? " fvg-box-zone-inside" : ""}`;
      zone.dataset.overlayType = "fvg";
      zone.dataset.overlayKey = item.id;
      zone.style.left = `${coordinates.left}px`;
      zone.style.top = `${coordinates.top}px`;
      zone.style.width = `${coordinates.width}px`;
      zone.style.height = `${Math.max(2, coordinates.height)}px`;
      zone.style.background = `rgba(${rgb}, ${item.style.fillOpacity})`;
      zone.style.border = `${item.style.borderWidth}px ${item.style.borderStyle} rgba(${rgb}, ${item.style.borderOpacity})`;
      zone.innerHTML = item.style.labelVisible ? `<span class="fvg-box-label">${item.label}</span>` : "";
      root.appendChild(zone);
      const overlay = { ...item, key: window.BtcDash.chart.overlayRegistry?.buildOverlayKey?.(item) || item.id, domElement: zone, meta: { coordinates, rightExtendedBox: true } };
      rendered.push(window.BtcDash.chart.overlayRegistry?.registerOverlay?.(overlay) || overlay);
      lastFvgBoxStats.renderedCount += 1;
    });
    return rendered;
  }

  function buildFvgOverlayItems(timeframe) {
    const tf = getActiveTimeframe(timeframe);
    const { context, rows } = getFvgSource(tf);
    if (!context?.available) return [];
    return buildFvgRightExtendedBoxOverlayData(rows, null, tf, getConfig());
  }

  function clearFvgOverlay(timeframe = null) {
    window.BtcDash.chart.overlays.zone?.clearZoneOverlayLayer?.("fvg", timeframe);
    window.BtcDash.chart.overlayRegistry?.clearLayer?.("fvg");
    window.BtcDash.chart.overlayRegistry?.clearLayer?.("fvg-boundary");
  }

  function renderFvgOverlay(timeframe) {
    const tf = getActiveTimeframe(timeframe);
    clearFvgOverlay(tf);
    if (!isLayerEnabled()) return [];
    const baseStatus = window.BtcDash.chart.assertBaseChartReady?.() || { ready: true };
    if (!baseStatus.ready) { lastFvgBoxStats = { renderedCount: 0, skippedCount: 0, coordinateFailedCount: 0, skipReasons: ["base-chart-not-ready", baseStatus.reason], lastRenderTime: new Date().toISOString() }; return []; }
    return renderFvgRightExtendedBoxes(window.BtcDash.chart.getActiveChart?.(), window.BtcDash.chart.getActiveCandleSeries?.(), getOverlayRoot(), buildFvgOverlayItems(tf));
  }

  function debugFvgOverlay(timeframe) {
    const tf = getActiveTimeframe(timeframe);
    const src = getFvgSource(tf);
    const items = buildFvgOverlayItems(tf);
    const nodes = Array.from(document.querySelectorAll?.('[data-overlay-type="fvg"]') || []);
    const duplicateNodeCount = nodes.length - new Set(nodes.map((node) => node.dataset.overlayKey)).size;
    const binding = window.BtcDash.chart.getChartBindingDiagnostics?.() || {};
    return { layer: "fvg", renderMode: "box_right_extend", timeframe: tf, activeTimeframe: binding.activeTimeframe, chartBindingValid: Boolean(binding.hasChart && binding.hasCandleSeries), contextAvailable: Boolean(src.context?.available), visibleBoxCount: items.length, htfBoxCount: items.filter((item) => item.isHTFProjection).length, localBoxCount: items.filter((item) => !item.isHTFProjection).length, overlayNodeCount: nodes.length, duplicateNodeCount, layerEnabled: isLayerEnabled(), lastRenderTime: lastFvgBoxStats.lastRenderTime, renderedCount: window.BtcDash.chart.overlayRegistry?.getOverlayCountByLayer?.("fvg") || 0, skippedCount: Math.max(0, src.rows.length - items.length) + lastFvgBoxStats.skippedCount, coordinateFailedCount: lastFvgBoxStats.coordinateFailedCount, warnings: [...new Set(lastFvgBoxStats.skipReasons)] };
  }

  window.BtcDash.chart.overlays.fvg = { renderFvgOverlay, clearFvgOverlay, buildFvgOverlayItems, buildFvgRightExtendedBoxOverlayData, buildFvgBoundaryOverlayData: buildFvgRightExtendedBoxOverlayData, renderFvgRightExtendedBoxes, renderFvgBoundaryOverlay: renderFvgRightExtendedBoxes, debugFvgOverlay };
  window.BtcDash.debugFvgOverlay = debugFvgOverlay;
})();
