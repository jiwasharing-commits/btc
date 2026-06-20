function toChartCandles(candles) {
  return candles.map((candle) => ({
    time: Math.floor(candle.open_time / 1000),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close
  }));
}

function chart(title, timeframe, closedCandles, strip = []) {
  const allCount = marketData[timeframe]?.length ?? 0;
  const lastClosed = marketData[timeframe]?.at(-1);
  const running = runningCandles[timeframe];
  const hasRunningPreview = Boolean(running && closedCandles.length && running.open_time > closedCandles.at(-1).open_time);
  const countLabel = hasRunningPreview ? `${allCount} closed + 1 running preview` : `${allCount}`;
  const runningLabel = hasRunningPreview ? ` • Running preview: ${fmtPrice(running.close)}` : '';
  const dailyContext = activeWorkspace === 'Daily + 4H Setup' ? (structureContexts['1D'] ?? createEmptyStructureContext('1D')) : null;
  const stripItems = dailyContext ? [`Daily Bias: ${dailyContext.bias}`, `Daily Structure: ${dailyContext.status}`, `Daily BOS/CHoCH: ${dailyContext.bosChoch.status}`, ...strip.slice(3)] : strip;
  return `${stripItems.length ? `<div class="context-strip">${stripItems.map(metric).join('')}</div>` : ''}
  ${rangeSelector(getActiveConfig())}
  <div class="chart-panel tradingview-panel">
    <div class="chart-title"><h2>${title}</h2><p>Candles loaded: ${countLabel} • Visible closed: ${closedCandles.length} • Active TF last closed: ${fmtPrice(lastClosed?.close)}${runningLabel}</p></div>
    <div id="main-chart" class="trading-chart" aria-label="TradingView-style candlestick chart"></div>
    <div id="chart-overlay-layer" class="chart-overlay-layer" aria-hidden="true"></div>
    <div class="running-overlay ${hasRunningPreview ? '' : 'is-hidden'}"><span>Running Preview<br><small>Preview Only</small></span></div>
    <div class="chart-watermark">${timeframe} • BTCUSDT</div>
  </div>`;
}

function clearTradingChart() {
  clearChartOverlays();
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (tradingChart) {
    tradingChart.remove();
    tradingChart = null;
  }
  candleSeries = null;
  channelSeries = [];
}

function addDummyPriceLines(closedCandles, running) {
  if (!candleSeries || !closedCandles.length) return;
  const lastClosed = closedCandles.at(-1).close;
  candleSeries.createPriceLine({
    price: lastClosed,
    color: "#ef4444",
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dotted,
    axisLabelVisible: true,
    title: ""
  });

  if (running && running.open_time > closedCandles.at(-1).open_time) {
    candleSeries.createPriceLine({
      price: running.close,
      color: "#facc15",
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dotted,
      axisLabelVisible: true,
      title: "Run"
    });
  }

  const timeframe = getActiveTimeframe();
  if (activeLayers.Confluence) {
    const candidate = confluenceContext?.strongestCandidate;
    if (candidate) {
      const line = candleSeries.createPriceLine({ price: candidate.midpoint, color: "rgba(45, 212, 191, .75)", lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted, axisLabelVisible: true, title: "Confluence" });
      window.BtcDash.chart?.overlayRegistry?.registerOverlay?.({ layer: "confluence", timeframe, workspace: activeWorkspace, source: "confluence", sourceId: candidate.id || candidate.label, type: "price-line", price: candidate.midpoint, chartObject: { remove: () => candleSeries?.removePriceLine?.(line) } });
    }
  }

  if (activeLayers["Scenario Levels"]) {
    addScenarioLevelPriceLines();
  }
}

function addScenarioLevelPriceLines() {
  const riskPlan = scenarioContext?.primaryScenario?.riskPlan;
  if (!candleSeries || !riskPlan?.available) return;
  const watchLine = candleSeries.createPriceLine({ price: riskPlan.watchArea.midpoint, color: "rgba(34, 197, 94, .75)", lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: true, title: "Watch Area" });
  window.BtcDash.chart?.overlayRegistry?.registerOverlay?.({ layer: "scenario", timeframe: getActiveTimeframe(), workspace: activeWorkspace, source: "scenario", sourceId: "watch-area", type: "price-line", price: riskPlan.watchArea.midpoint, chartObject: { remove: () => candleSeries?.removePriceLine?.(watchLine) } });
  const invalidationLine = candleSeries.createPriceLine({ price: riskPlan.invalidation.level, color: "rgba(248, 113, 113, .78)", lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted, axisLabelVisible: true, title: "Invalidation Ref" });
  window.BtcDash.chart?.overlayRegistry?.registerOverlay?.({ layer: "scenario", timeframe: getActiveTimeframe(), workspace: activeWorkspace, source: "scenario", sourceId: "invalidation", type: "price-line", price: riskPlan.invalidation.level, chartObject: { remove: () => candleSeries?.removePriceLine?.(invalidationLine) } });
  riskPlan.targets.slice(0, 3).forEach((target, index) => {
    const targetLine = candleSeries.createPriceLine({ price: target.level, color: "rgba(125, 211, 252, .68)", lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted, axisLabelVisible: true, title: `TP${index + 1} Ref` });
    window.BtcDash.chart?.overlayRegistry?.registerOverlay?.({ layer: "scenario", timeframe: getActiveTimeframe(), workspace: activeWorkspace, source: "scenario", sourceId: target.id || `tp-${index + 1}`, type: "price-line", price: target.level, chartObject: { remove: () => candleSeries?.removePriceLine?.(targetLine) } });
  });
}

function getChartOverlayLayer() {
  return qs('#chart-overlay-layer');
}

function clearChartOverlayLayer(type = null) {
  if (type) window.BtcDash.chart?.overlayRegistry?.clearLayer?.(type);
  else window.BtcDash.chart?.overlayRegistry?.clearAllOverlays?.();
  const layer = getChartOverlayLayer();
  if (!layer) return;
  const selector = type ? `[data-overlay-type="${type}"]` : '[data-overlay-type]';
  layer.querySelectorAll(selector).forEach((node) => node.remove());
}

function addBoundedZoneBox({ type, className, label, lower, upper, startTime, endTime, overlayKey = null }) {
  const layer = getChartOverlayLayer();
  const container = qs('#main-chart');
  if (!layer || !container || !tradingChart || !candleSeries) return;
  const firstVisible = tradingChart.timeScale().timeToCoordinate(Math.floor(startTime / 1000));
  const lastVisible = tradingChart.timeScale().timeToCoordinate(Math.floor(endTime / 1000));
  const fallbackStart = startTime <= (getActiveCandles()[0]?.open_time ?? startTime) ? 0 : firstVisible;
  const fallbackEnd = endTime >= (getActiveCandles().at(-1)?.open_time ?? endTime) ? container.clientWidth - 8 : lastVisible;
  const x1 = Number.isFinite(firstVisible) ? firstVisible : fallbackStart;
  const x2 = Number.isFinite(lastVisible) ? lastVisible : fallbackEnd;
  const y1 = candleSeries.priceToCoordinate(upper);
  const y2 = candleSeries.priceToCoordinate(lower);
  if (![x1, x2, y1, y2].every(Number.isFinite) || x2 <= 0 || x1 >= container.clientWidth || x2 <= x1) return null;
  const box = document.createElement('div');
  box.dataset.overlayType = type;
  box.className = className;
  box.style.left = `${Math.max(0, x1)}px`;
  box.style.width = `${Math.min(container.clientWidth, x2) - Math.max(0, x1)}px`;
  box.style.top = `${Math.min(y1, y2)}px`;
  box.style.height = `${Math.max(8, Math.abs(y2 - y1))}px`;
  box.innerHTML = `<span>${label}</span>`;
  layer.appendChild(box);
  if (overlayKey) box.dataset.overlayKey = overlayKey;
  window.BtcDash.chart?.overlayRegistry?.registerOverlay?.({
    key: overlayKey || `${type}|${getActiveTimeframe()}|${label}|${lower}|${upper}|${startTime}|${endTime}`,
    layer: type,
    timeframe: getActiveTimeframe(),
    workspace: activeWorkspace,
    source: type,
    sourceId: label,
    type,
    zoneLow: lower,
    zoneHigh: upper,
    startTime,
    endTime,
    domElement: box
  });
  return box;
}

function buildSrVisualItems(timeframe) {
  const sr = srContexts[timeframe];
  const candles = getActiveCandles();
  const lastTime = candles.at(-1)?.open_time;
  const interval = candles.length > 1 ? candles.at(-1).open_time - candles.at(-2).open_time : BINANCE_INTERVAL_MS[timeframe];
  if (!sr?.available || !lastTime) return [];
  const normalize = (zone, kind) => {
    const lower = zone.lower ?? zone.zoneLow ?? zone.centerPrice ?? zone.price;
    const upper = zone.upper ?? zone.zoneHigh ?? zone.centerPrice ?? zone.price;
    const midpoint = zone.midpoint || zone.centerPrice || ((lower + upper) / 2);
    const visualPad = Math.max(midpoint * 0.0015, Math.abs(upper - lower) / 2);
    return {
      ...zone,
      lower: lower === upper ? midpoint - visualPad : lower,
      upper: lower === upper ? midpoint + visualPad : upper,
      kind,
      startTime: zone.lastTime || zone.lastTouchTime || zone.firstTime || zone.firstSeenTime || candles[Math.max(0, candles.length - 36)].open_time,
      endTime: lastTime + interval * 8
    };
  };
  return [
    ...(sr.activeSupports || sr.supportZones || []).sort((a, b) => (a.distancePct ?? 999) - (b.distancePct ?? 999)).slice(0, 3).map((zone) => normalize(zone, "support")),
    ...(sr.activeResistances || sr.resistanceZones || []).sort((a, b) => (a.distancePct ?? 999) - (b.distancePct ?? 999)).slice(0, 3).map((zone) => normalize(zone, "resistance"))
  ];
}

function renderSrZoneSegments(activeTimeframe) {
  clearChartOverlayLayer("sr");
  if (!activeLayers["S/R"]) return;
  buildSrVisualItems(activeTimeframe).forEach((zone) => {
    const prefix = activeTimeframe === "1W" ? "W" : activeTimeframe === "1D" ? "D" : activeTimeframe;
    const label = `${prefix} ${zone.kind === "support" ? "Support" : "Resistance"}`;
    addBoundedZoneBox({ type: "sr", className: `sr-zone-box ${zone.kind} ${zone.status === "broken" ? "broken" : ""} ${zone.status === "retest" ? "retest" : ""}`, label, lower: zone.lower, upper: zone.upper, startTime: zone.startTime, endTime: zone.endTime });
  });
}

function fvgLabel(timeframe, zone) {
  const prefix = timeframe === "1W" ? "W" : timeframe === "1D" ? "D" : timeframe;
  const side = zone.type === "bullish" ? "Bull" : zone.type === "bearish" ? "Bear" : "Inv";
  return `${prefix} ${side} FVG`;
}

function deriveFvgVisualEndTime(fvg, candles, activeTimeframe) {
  const startIndex = candles.findIndex((candle) => candle.open_time >= (fvg.createdAtTime || fvg.startTime || 0));
  const after = startIndex >= 0 ? candles.slice(startIndex + 1) : [];
  const lower = fvg.lower ?? fvg.zoneLow;
  const upper = fvg.upper ?? fvg.zoneHigh;
  const filled = after.find((candle) => fvg.type === "bullish" ? candle.low <= lower : candle.high >= upper);
  if (filled && fvg.status === "Filled") return filled.open_time;
  const last = candles.at(-1)?.open_time ?? fvg.endTime;
  const interval = candles.length > 1 ? candles.at(-1).open_time - candles.at(-2).open_time : BINANCE_INTERVAL_MS[activeTimeframe];
  return last + interval * 8;
}

function buildFvgVisualItems(activeTimeframe) {
  const candles = getActiveCandles();
  const byType = { bullish: [], bearish: [] };
  const add = (zone, timeframe = activeTimeframe, isHtf = false) => {
    if (!zone || zone.status === "Invalid") return;
    const bucket = zone.type === "bearish" ? byType.bearish : byType.bullish;
    bucket.push({ zone, timeframe, isHtf, distance: zone.distancePct ?? 999 });
  };
  (fvgContexts[activeTimeframe]?.activeFvgs || fvgContexts[activeTimeframe]?.visibleFvgs || []).forEach((zone) => add(zone));
  if (activeWorkspace === "Daily + 4H Setup") add(fvgContexts["1D"]?.nearestFvg, "1D", true);
  if (activeWorkspace === "1H Timing") add(fvgContexts["4H"]?.nearestFvg, "4H", true);
  return [...byType.bullish.sort((a, b) => a.distance - b.distance).slice(0, 3), ...byType.bearish.sort((a, b) => a.distance - b.distance).slice(0, 3)]
    .map((item) => ({ ...item, startTime: item.zone.createdAtTime || item.zone.startTime, endTime: deriveFvgVisualEndTime(item.zone, candles, activeTimeframe) }))
    .filter((item) => item.startTime && item.endTime);
}

function renderFvgZoneBoxes(activeTimeframe) {
  clearChartOverlayLayer("fvg");
  if (!activeLayers.FVG) return;
  buildFvgVisualItems(activeTimeframe).forEach(({ zone, timeframe, isHtf, startTime, endTime }) => {
    addBoundedZoneBox({ type: "fvg", className: `fvg-zone-box ${zone.type === "bullish" ? "bullish" : "bearish"} ${zone.status === "Partially Filled" ? "partial" : ""} ${zone.status === "Filled" ? "filled" : ""} ${isHtf ? "htf" : ""}`, label: fvgLabel(timeframe, zone), lower: zone.lower ?? zone.zoneLow, upper: zone.upper ?? zone.zoneHigh, startTime, endTime });
  });
}

function addDummyMarkers(closedCandles, running, timeframe) {
  if (!candleSeries) return;
  const markers = [];
  const firstVisibleTime = closedCandles[0]?.open_time ?? 0;
  const context = structureContexts[timeframe];
  if (activeLayers.Structure && context?.available) {
    const structureLabels = context.displaySwings || context.displayLabels || context.labels || [];
    markers.push(...structureLabels
      .filter((label) => label.time >= firstVisibleTime)
      .slice(-28)
      .map((label) => ({
        time: Math.floor(label.time / 1000),
        position: label.type === "high" ? "aboveBar" : "belowBar",
        color: label.type === "high" ? "#38bdf8" : "#facc15",
        shape: label.type === "high" ? "arrowDown" : "arrowUp",
        text: label.label
      })));
  }
  if (running && closedCandles.length && running.open_time > closedCandles.at(-1).open_time) {
    markers.push({ time: Math.floor(running.open_time / 1000), position: "aboveBar", color: "#facc15", shape: "circle", text: `Running ${timeframe === "1W" ? "W" : timeframe}` });
  }
  candleSeries.setMarkers(markers);
}

function applyLayerMarkers(layer, markers = []) {
  if (!candleSeries) return [];
  const normalized = (markers || []).slice(0, window.BtcDash.config?.PERFORMANCE_CONFIG?.overlay?.maxMarkersPerLayer || 80).map((marker) => ({
    time: typeof marker.time === "number" && marker.time > 10000000000 ? Math.floor(marker.time / 1000) : marker.time,
    position: marker.position || (marker.type === "low" ? "belowBar" : "aboveBar"),
    color: marker.color || (marker.type === "low" ? "#facc15" : "#38bdf8"),
    shape: marker.shape || (marker.type === "low" ? "arrowUp" : "arrowDown"),
    text: marker.text || marker.label || ""
  })).filter((marker) => marker.time && marker.text);
  const existing = Object.entries(window.BtcDash.chart?.markers?.getMarkerState?.()?.byLayer || {}).flatMap(([key, rows]) => key === layer ? [] : rows || []).map((m) => ({ time: m.chartTime || m.time, position: m.position, color: m.color, shape: m.shape, text: m.text || m.label || "" }));
  candleSeries.setMarkers([...existing, ...normalized]);
  return normalized;
}

function clearLayerMarkers(layer) {
  if (!candleSeries) return;
  const existing = Object.entries(window.BtcDash.chart?.markers?.getMarkerState?.()?.byLayer || {}).flatMap(([key, rows]) => key === layer ? [] : rows || []).map((m) => ({ time: m.chartTime || m.time, position: m.position, color: m.color, shape: m.shape, text: m.text || m.label || "" }));
  candleSeries.setMarkers(existing);
}

function channelSeriesPoint(line, time) {
  const value = projectLineAtTime(line, time);
  return Number.isFinite(value) ? { time: Math.floor(time / 1000), value } : null;
}

function addChannelLine(line, startTime, endTime, color, lineWidth, title) {
  const start = channelSeriesPoint(line, startTime);
  const end = channelSeriesPoint(line, endTime);
  if (!start || !end) return;
  const series = tradingChart.addLineSeries({ color, lineWidth, priceLineVisible: false, lastValueVisible: false, title });
  series.setData([start, end]);
  channelSeries.push(series);
  window.BtcDash.chart?.overlayRegistry?.registerOverlay?.({
    layer: "channel",
    timeframe: getActiveTimeframe(),
    workspace: activeWorkspace,
    source: "channel",
    sourceId: title,
    type: "line",
    price: start.value,
    startTime,
    endTime,
    chartObject: { remove: () => tradingChart?.removeSeries?.(series) }
  });
}

function addChannelOverlays(candles, timeframe) {
  if (!tradingChart || !activeLayers.Channel || candles.length < 2) return;
  const firstTime = candles[0].open_time;
  const lastTime = candles.at(-1).open_time;
  getProjectedChannelContextsForActiveTimeframe(timeframe).forEach(({ timeframe: channelTimeframe, context, isLocal }) => {
    if (!context?.available) return;
    const prefix = channelTimeframe === "1W" ? "W" : channelTimeframe === "1D" ? "D" : channelTimeframe;
    const mainColor = isLocal ? "rgba(56, 189, 248, 0.9)" : "rgba(148, 163, 184, 0.45)";
    const lowerColor = isLocal ? "rgba(167, 139, 250, 0.85)" : "rgba(148, 163, 184, 0.35)";
    const midColor = isLocal ? "rgba(250, 204, 21, 0.65)" : "rgba(148, 163, 184, 0.25)";
    addChannelLine(context.upperLine, firstTime, lastTime, mainColor, isLocal ? 2 : 1, `${prefix} Upper`);
    addChannelLine(context.lowerLine, firstTime, lastTime, lowerColor, isLocal ? 2 : 1, `${prefix} Lower`);
    if (isLocal) addChannelLine(context.midLine, firstTime, lastTime, midColor, 1, `${prefix} Mid`);
  });
}

function renderTradingChart() {
  clearTradingChart();
  const container = qs('#main-chart');
  if (!container || activeWorkspace === 'MTF Summary') return;
  if (!window.LightweightCharts) {
    container.innerHTML = `<div class="status-panel error">Failed to load TradingView Lightweight Charts CDN.</div>`;
    return;
  }
  const config = getActiveConfig();
  const timeframe = config.timeframe;
  const closedCandles = getActiveCandles();
  const running = runningCandles[timeframe];
  const displayCandles = getDisplayCandlesForChart(timeframe, closedCandles);
  if (!closedCandles.length) {
    container.innerHTML = `<div class="status-panel">No candles in selected range.</div>`;
    return;
  }

  tradingChart = LightweightCharts.createChart(container, {
    width: container.clientWidth,
    height: container.clientHeight,
    layout: { background: { color: "#0b1220" }, textColor: "#cbd5e1", fontFamily: "Inter, system-ui, sans-serif" },
    grid: {
      vertLines: { color: "rgba(148, 163, 184, 0.12)" },
      horzLines: { color: "rgba(148, 163, 184, 0.12)" }
    },
    rightPriceScale: { borderColor: "rgba(148, 163, 184, 0.25)", visible: true, scaleMargins: { top: 0.12, bottom: 0.12 } },
    timeScale: { borderColor: "rgba(148, 163, 184, 0.25)", timeVisible: true, secondsVisible: false, rightOffset: 8, barSpacing: 8 },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    handleScale: { axisPressedMouseMove: true, mouseWheel: false, pinch: true }
  });

  candleSeries = tradingChart.addCandlestickSeries({
    upColor: "#22c55e",
    downColor: "#ef4444",
    borderUpColor: "#22c55e",
    borderDownColor: "#ef4444",
    wickUpColor: "#86efac",
    wickDownColor: "#fca5a5",
    priceLineVisible: false
  });
  candleSeries.setData(toChartCandles(displayCandles));
  addDummyPriceLines(closedCandles, running);
  addDummyMarkers(closedCandles, running, timeframe);
  addChannelOverlays(closedCandles, timeframe);
  tradingChart.timeScale().fitContent();
  requestAnimationFrame(() => {
    renderFvgZoneBoxes(timeframe);
    renderSrZoneSegments(timeframe);
  });

  resizeObserver = new ResizeObserver(() => {
    if (!tradingChart || !container.clientWidth || !container.clientHeight) return;
    tradingChart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
    requestAnimationFrame(() => {
      renderFvgZoneBoxes(timeframe);
      renderSrZoneSegments(timeframe);
    });
  });
  resizeObserver.observe(container);
}

function initChart() {
  renderTradingChart();
  return { chart: tradingChart, candleSeries };
}

function renderChart(timeframe = getActiveTimeframe(), options = {}) {
  clearChartOverlays();
  renderTradingChart();
  const state = window.BtcDash.state;
  if (state?.chartRuntime) {
    state.chartRuntime.activeWorkspace = activeWorkspace;
    state.chartRuntime.activeTimeframe = timeframe;
    state.chartRuntime.activeRange = rangeState[activeWorkspace] || null;
    state.chartRuntime.lastRenderAt = new Date().toISOString();
    state.chartRuntime.renderCount += 1;
  }
  return { timeframe, overlays: window.BtcDash.chart?.overlayRegistry?.getOverlayStats?.() || null, options };
}

function rerenderActiveChart(reason = "manual") {
  return renderChart(getActiveTimeframe(), { reason });
}

function clearChartOverlays() {
  window.BtcDash.chart?.overlayRegistry?.clearAllOverlays?.();
  const layer = getChartOverlayLayer();
  if (layer) layer.querySelectorAll('[data-overlay-type]').forEach((node) => node.remove());
  channelSeries.forEach((series) => { try { tradingChart?.removeSeries?.(series); } catch (error) { /* ignored */ } });
  channelSeries = [];
}

function renderActiveLayers(timeframe = getActiveTimeframe()) {
  const overlays = window.BtcDash.chart.overlays || {};
  overlays.structure?.renderStructureOverlay?.(timeframe);
  overlays.sr?.renderSrOverlay?.(timeframe);
  overlays.fvg?.renderFvgOverlay?.(timeframe);
  overlays.liquidity?.renderLiquidityOverlay?.(timeframe);
  overlays.channel?.renderChannelOverlay?.(timeframe);
  overlays.confluence?.renderConfluenceOverlay?.(timeframe);
  overlays.scenario?.renderScenarioOverlay?.(timeframe);
  return window.BtcDash.chart.overlayRegistry?.getOverlayStats?.();
}

const layerNameMap = { MA: "ma", Structure: "structure", "S/R": "sr", FVG: "fvg", "EQH/EQL": "liquidity", Channel: "channel", Confluence: "confluence", "Scenario Levels": "scenario" };
const reverseLayerNameMap = Object.fromEntries(Object.entries(layerNameMap).map(([legacy, canonical]) => [canonical, legacy]));

function setLayerState(layer, enabled) {
  const canonical = layerNameMap[layer] || layer;
  const legacy = reverseLayerNameMap[canonical] || layer;
  if (window.BtcDash.state?.chartRuntime?.layerState) window.BtcDash.state.chartRuntime.layerState[canonical] = Boolean(enabled);
  if (activeLayers && legacy in activeLayers) activeLayers[legacy] = Boolean(enabled);
  if (!enabled) {
    window.BtcDash.chart.overlayRegistry?.clearLayer?.(canonical);
    clearChartOverlayLayer(canonical);
  } else {
    renderActiveLayers(getActiveTimeframe());
  }
  return getLayerState();
}

function getLayerState() {
  return { ...(window.BtcDash.state?.chartRuntime?.layerState || {}) };
}

function syncLayerControlsToState() {
  Object.entries(layerNameMap).forEach(([legacy, canonical]) => {
    if (window.BtcDash.state?.chartRuntime?.layerState) window.BtcDash.state.chartRuntime.layerState[canonical] = Boolean(activeLayers?.[legacy]);
  });
  return getLayerState();
}

window.BtcDash = window.BtcDash || {};
window.BtcDash.chart = {
  ...window.BtcDash.chart,
  toChartCandles,
  chart,
  clearTradingChart,
  addDummyPriceLines,
  addScenarioLevelPriceLines,
  clearChartOverlayLayer,
  buildSrVisualItems,
  renderSrZoneSegments,
  buildFvgVisualItems,
  deriveFvgVisualEndTime,
  renderFvgZoneBoxes,
  addDummyMarkers,
  addChannelOverlays,
  renderTradingChart,
  initChart,
  renderChart,
  rerenderActiveChart,
  clearChartOverlays,
  renderActiveLayers,
  setLayerState,
  getLayerState,
  applyLayerMarkers,
  clearLayerMarkers,
  syncLayerControlsToState
};
window.BtcDash.renderChart = renderChart;
window.renderChart = renderChart;
