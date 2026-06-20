function toChartCandles(candles) {
  return candles.map((candle) => ({
    time: Math.floor(candle.open_time / 1000),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close
  }));
}

function ensureChartRuntime() {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.chart = window.BtcDash.chart || {};
  window.BtcDash.chart.runtime = window.BtcDash.chart.runtime || { chart: null, candleSeries: null, chartContainer: null, activeTimeframe: null, activeWorkspace: null, activeRange: null, chartId: null, lastChartRenderAt: null, lastCandleRenderAt: null };
  return window.BtcDash.chart.runtime;
}
function setActiveChartRuntime(runtime = {}) { const rt = ensureChartRuntime(); Object.assign(rt, runtime); return rt; }
function getActiveChartRuntime() { return ensureChartRuntime(); }
function getActiveChart() { return ensureChartRuntime().chart || tradingChart || null; }
function getActiveCandleSeries() { return ensureChartRuntime().candleSeries || candleSeries || null; }
function getActiveChartContainer() { return ensureChartRuntime().chartContainer || qs('#main-chart'); }
function getActiveChartTimeframe() { return ensureChartRuntime().activeTimeframe || getActiveTimeframe(); }
function refreshActiveChartBinding(reason = "manual") { return setActiveChartRuntime({ chart: tradingChart || null, candleSeries: candleSeries || null, chartContainer: qs('#main-chart'), activeTimeframe: getActiveTimeframe(), activeWorkspace, activeRange: rangeState[activeWorkspace] || null, chartId: ensureChartRuntime().chartId || `chart-${Date.now()}`, lastChartRenderAt: new Date().toISOString(), refreshReason: reason }); }
function getChartBindingDiagnostics() { const rt = ensureChartRuntime(); const apiMode = window.BtcDash.chart.adapter?.detectChartApiMode?.(rt.chart) || { mode: "unknown", warnings: ["adapter unavailable"] }; const warnings = []; if (!rt.chart) warnings.push("missing-active-chart"); if (!rt.candleSeries) warnings.push("missing-candle-series"); if (!rt.chartContainer) warnings.push("missing-chart-container"); return { hasChart: Boolean(rt.chart), hasCandleSeries: Boolean(rt.candleSeries), hasContainer: Boolean(rt.chartContainer), activeTimeframe: rt.activeTimeframe, activeWorkspace: rt.activeWorkspace, chartId: rt.chartId, apiMode: apiMode.mode, layerState: getLayerState?.() || {}, warnings }; }

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
  clearMaOverlay();
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
  if (window.BtcDash.state?.chartRuntime) window.BtcDash.state.chartRuntime.lastClearAction = { action: "clearChartOverlays", at: new Date().toISOString() };
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
  return qs('#chart-overlay-layer') || window.BtcDash.chart.overlays?.zone?.getOverlayRoot?.();
}

function clearChartOverlayLayer(type = null) {
  if (type) window.BtcDash.chart?.overlayRegistry?.clearLayer?.(type);
  else window.BtcDash.chart?.overlayRegistry?.clearAllOverlays?.();
  const selector = type ? `[data-overlay-type="${type}"]` : '[data-overlay-type]';
  const layer = getChartOverlayLayer();
  if (layer) layer.querySelectorAll(selector).forEach((node) => node.remove());
  const root = document.querySelector('#main-chart .btc-chart-overlay-root');
  if (root && root !== layer) root.querySelectorAll(selector).forEach((node) => node.remove());
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
  window.BtcDash.chart.markers?.renderMarkers?.("base", timeframe, markers);
}

function applyLayerMarkers(layer, markers = []) {
  return window.BtcDash.chart.markers?.renderMarkers?.(normalizeLayerKey(layer), getActiveChartTimeframe(), markers)?.markers || [];
}

function clearLayerMarkers(layer) {
  return window.BtcDash.chart.markers?.clearMarkers?.(normalizeLayerKey(layer));
}

function normalizeLayerKey(layer) {
  const key = String(layer || "").trim();
  const map = { MA: "ma", ma: "ma", Structure: "structure", structure: "structure", FVG: "fvg", fvg: "fvg", "S/R": "sr", SR: "sr", sr: "sr", supportResistance: "sr", "EQH/EQL": "liquidity", eqhEql: "liquidity", liquidity: "liquidity", Channel: "channel", channel: "channel", Confluence: "confluence", confluence: "confluence", "Scenario Levels": "scenario", scenario: "scenario", scenarioLevels: "scenario" };
  return map[key] || key.toLowerCase();
}

function getLegacyLayerKey(layer) {
  const map = { ma: "MA", structure: "Structure", fvg: "FVG", sr: "S/R", liquidity: "EQH/EQL", channel: "Channel", confluence: "Confluence", scenario: "Scenario Levels" };
  return map[normalizeLayerKey(layer)] || layer;
}

function buildMaOverlayItems(timeframe = getActiveTimeframe()) {
  const candles = (marketData[timeframe] || []).filter((c) => c && c.isRunning !== true && c.isClosed !== false && c.isFinal !== false && c.x !== false);
  return [20, 50, 200].filter((period) => candles.length >= period).map((period) => {
    const data = candles.map((c, index) => {
      if (index + 1 < period) return null;
      const windowRows = candles.slice(index + 1 - period, index + 1);
      const value = windowRows.reduce((sum, row) => sum + Number(row.close || 0), 0) / period;
      return { time: Math.floor(Number(c.open_time || new Date(c.time).getTime()) / 1000), value };
    }).filter(Boolean);
    return { period, data, label: `MA ${period}` };
  });
}

function clearMaOverlay() {
  const chart = getActiveChart();
  const list = window.BtcDash.chart._maSeries || [];
  list.forEach((series) => window.BtcDash.chart.adapter?.removeSeriesSafe?.(chart, series));
  window.BtcDash.chart._maSeries = [];
  window.BtcDash.chart.overlayRegistry?.clearLayer?.("ma");
}

function renderMaOverlay(timeframe = getActiveChartTimeframe()) {
  clearMaOverlay();
  const chart = getActiveChart();
  if (!chart) return [];
  const colors = { 20: "#38bdf8", 50: "#facc15", 200: "#f472b6" };
  const rendered = buildMaOverlayItems(timeframe).map((item) => {
    const created = window.BtcDash.chart.adapter?.createLineSeriesSafe?.(chart, { color: colors[item.period] || "#94a3b8", lineWidth: item.period === 200 ? 2 : 1, priceLineVisible: false, lastValueVisible: true, title: item.label }) || {};
    const series = created.series;
    if (!series) return null;
    window.BtcDash.chart.adapter?.setSeriesDataSafe?.(series, item.data);
    window.BtcDash.chart._maSeries = [...(window.BtcDash.chart._maSeries || []), series];
    return window.BtcDash.chart.overlayRegistry?.registerOverlay?.({ layer: "ma", timeframe, source: "MA", sourceId: item.label, type: "line-series", chartObject: { remove: () => window.BtcDash.chart.adapter?.removeSeriesSafe?.(chart, series) }, drawPolicy: "show", meta: { period: item.period, points: item.data.length, mode: created.mode, warning: created.warning } });
  }).filter(Boolean);
  return rendered;
}
function getMaDebugState() { return { seriesCount: (window.BtcDash.chart._maSeries || []).length, overlayCount: window.BtcDash.chart.overlayRegistry?.getOverlayCountByLayer?.("ma") || 0, apiMode: window.BtcDash.chart.adapter?.detectChartApiMode?.(getActiveChart())?.mode || "unknown" }; }

let lastLayerRenderStatus = {};
function countRendered(result) { return Array.isArray(result) ? result.length : Number(result?.renderedCount || 0); }
function clearLayer(layer, timeframe = getActiveTimeframe(), options = {}) {
  const key = normalizeLayerKey(layer);
  if (key === "ma") clearMaOverlay(timeframe);
  else if (key === "structure") window.BtcDash.chart.overlays.structure?.clearStructureOverlay?.(timeframe);
  else if (key === "fvg") window.BtcDash.chart.overlays.fvg?.clearFvgOverlay?.(timeframe);
  else if (key === "sr") window.BtcDash.chart.overlays.sr?.clearSrOverlay?.(timeframe);
  else if (key === "liquidity") window.BtcDash.chart.overlays.liquidity?.clearLiquidityOverlay?.(timeframe);
  else if (key === "channel") window.BtcDash.chart.overlays.channel?.clearChannelOverlay?.(timeframe);
  else if (key === "confluence") window.BtcDash.chart.overlays.confluence?.clearConfluenceOverlay?.(timeframe);
  else if (key === "scenario") window.BtcDash.chart.overlays.scenario?.clearScenarioOverlay?.(timeframe);
  else clearChartOverlayLayer(key);
  lastLayerRenderStatus[key] = { layer: key, timeframe, enabled: false, renderedCount: 0, skippedCount: 0, reason: options.reason || "clear", warnings: [] };
  return lastLayerRenderStatus[key];
}

function renderLayer(layer, timeframe = getActiveTimeframe(), options = {}) {
  const key = normalizeLayerKey(layer);
  const state = window.BtcDash.state;
  const warnings = [];
  let result = [];
  const rendererMap = { ma: renderMaOverlay, structure: window.BtcDash.chart.overlays.structure?.renderStructureOverlay, fvg: window.BtcDash.chart.overlays.fvg?.renderFvgOverlay, sr: window.BtcDash.chart.overlays.sr?.renderSrOverlay, liquidity: window.BtcDash.chart.overlays.liquidity?.renderLiquidityOverlay, channel: window.BtcDash.chart.overlays.channel?.renderChannelOverlay, confluence: window.BtcDash.chart.overlays.confluence?.renderConfluenceOverlay, scenario: window.BtcDash.chart.overlays.scenario?.renderScenarioOverlay };
  const renderer = rendererMap[key];
  if (state?.chartRuntime?.layerState) state.chartRuntime.layerState[key] = true;
  if (activeLayers && getLegacyLayerKey(key) in activeLayers) activeLayers[getLegacyLayerKey(key)] = true;
  if (typeof renderer === "function") result = renderer(timeframe, options) || [];
  else warnings.push(`Renderer unavailable for ${key}`);
  const debugMap = { fvg: window.BtcDash.chart.overlays.fvg?.debugFvgOverlay, sr: window.BtcDash.chart.overlays.sr?.debugSrOverlay, liquidity: window.BtcDash.chart.overlays.liquidity?.debugLiquidityOverlay, channel: window.BtcDash.chart.overlays.channel?.debugChannelOverlay, structure: window.BtcDash.chart.overlays.structure?.debugStructureMarkers };
  const extra = typeof debugMap[key] === "function" ? debugMap[key](timeframe) : {};
  const binding = getChartBindingDiagnostics();
  const zoneStats = window.BtcDash.chart.overlays?.zone?.getLastZoneRenderStats?.() || {};
  const registryCountAfter = window.BtcDash.chart.overlayRegistry?.getOverlayCountByLayer?.(key) || 0;
  lastLayerRenderStatus[key] = {
    ...extra,
    layer: key,
    requestedTimeframe: timeframe,
    timeframe,
    activeTimeframe: getActiveChartTimeframe(),
    chartBindingValid: Boolean(binding.hasChart && binding.hasCandleSeries),
    apiMode: binding.apiMode,
    enabled: true,
    renderedCount: countRendered(result),
    skippedCount: warnings.length ? 1 : (extra.skippedCount || 0),
    coordinateFailedCount: zoneStats.coordinateFailedCount || extra.coordinateFailedCount || 0,
    registryCountAfter,
    reason: warnings[0] || (countRendered(result) ? "rendered" : (extra.skipReasons?.[0] || zoneStats.skipReasons?.[0] || `No visible ${key} for timeframe`)),
    warnings: [...warnings, ...(binding.warnings || [])]
  };
  return lastLayerRenderStatus[key];
}


function debugOverlayCoordinates(layer, timeframe = getActiveChartTimeframe()) {
  const key = normalizeLayerKey(layer);
  const builders = {
    fvg: window.BtcDash.chart.overlays.fvg?.buildFvgOverlayItems,
    sr: window.BtcDash.chart.overlays.sr?.buildSrOverlayItems,
    liquidity: window.BtcDash.chart.overlays.liquidity?.buildLiquidityOverlayItems,
    channel: window.BtcDash.chart.overlays.channel?.buildChannelOverlayItems
  };
  const rows = typeof builders[key] === "function" ? builders[key](timeframe) : [];
  const sample = rows[0] || null;
  return { layer: key, timeframe, candidateCount: rows.length, sample: sample ? window.BtcDash.chart.overlays.zone?.resolveZoneCoordinates?.(sample, timeframe, { layer: key }) : null, reason: sample ? undefined : "no-zone-sample" };
}

function debugRealRendering() {
  const state = window.BtcDash.state;
  const activeTimeframe = getActiveChartTimeframe();
  return {
    chartBinding: getChartBindingDiagnostics(),
    apiMode: window.BtcDash.chart.adapter?.detectChartApiMode?.(getActiveChart()) || { mode: "unknown" },
    activeTimeframe,
    layerState: getLayerState(),
    overlayRegistry: window.BtcDash.chart.overlayRegistry?.getRegistryDebugSnapshot?.() || null,
    markerStats: window.BtcDash.chart.markers?.getMarkerStats?.() || null,
    maDebug: getMaDebugState(),
    lastLayerRenderStatus,
    lastClearAction: state?.chartRuntime?.lastClearAction || null,
    lastRenderAction: state?.chartRuntime?.lastRenderAction || null,
    coordinateDiagnosticsSample: debugOverlayCoordinates("sr", activeTimeframe)
  };
}

function channelSeriesPoint(line, time) {
  const value = projectLineAtTime(line, time);
  return Number.isFinite(value) ? { time: Math.floor(time / 1000), value } : null;
}

function addChannelLine(line, startTime, endTime, color, lineWidth, title) {
  const start = channelSeriesPoint(line, startTime);
  const end = channelSeriesPoint(line, endTime);
  if (!start || !end) return;
  const created = window.BtcDash.chart.adapter?.createLineSeriesSafe?.(getActiveChart(), { color, lineWidth, priceLineVisible: false, lastValueVisible: false, title }) || {};
  const series = created.series;
  if (!series) return;
  window.BtcDash.chart.adapter?.setSeriesDataSafe?.(series, [start, end]);
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
    chartObject: { remove: () => window.BtcDash.chart.adapter?.removeSeriesSafe?.(getActiveChart(), series) }
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

  const candleCreated = window.BtcDash.chart.adapter?.createCandlestickSeriesSafe?.(tradingChart, {
    upColor: "#22c55e",
    downColor: "#ef4444",
    borderUpColor: "#22c55e",
    borderDownColor: "#ef4444",
    wickUpColor: "#86efac",
    wickDownColor: "#fca5a5",
    priceLineVisible: false
  }) || {};
  candleSeries = candleCreated.series;
  if (!candleSeries) { container.innerHTML = `<div class="status-panel error">Failed to create candle series: ${candleCreated.warning || "series-api-unavailable"}</div>`; return; }
  window.BtcDash.chart.adapter?.setSeriesDataSafe?.(candleSeries, toChartCandles(displayCandles));
  setActiveChartRuntime({ chart: tradingChart, candleSeries, chartContainer: container, activeTimeframe: timeframe, activeWorkspace, activeRange: rangeState[activeWorkspace] || null, chartId: `chart-${Date.now()}`, lastChartRenderAt: new Date().toISOString(), lastCandleRenderAt: new Date().toISOString() });
  addDummyPriceLines(closedCandles, running);
  addDummyMarkers(closedCandles, running, timeframe);
  tradingChart.timeScale().fitContent();
  window.BtcDash.chart.markers?.reapplyActiveMarkers?.("candle-render");
  requestAnimationFrame(() => {
    renderActiveLayers(timeframe, { reason: "chart-render" });
  });

  resizeObserver = new ResizeObserver(() => {
    if (!tradingChart || !container.clientWidth || !container.clientHeight) return;
    tradingChart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
    requestAnimationFrame(() => {
      renderActiveLayers(timeframe, { reason: "resize" });
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
    state.chartRuntime.lastRenderAction = { action: "renderChart", timeframe, at: new Date().toISOString() };
  }
  refreshActiveChartBinding("renderChart");
  return { timeframe, overlays: window.BtcDash.chart?.overlayRegistry?.getOverlayStats?.() || null, options };
}

function rerenderActiveChart(reason = "manual") {
  return renderChart(getActiveTimeframe(), { reason });
}

function clearChartOverlays() {
  window.BtcDash.chart?.overlayRegistry?.clearAllOverlays?.();
  const layer = getChartOverlayLayer();
  if (layer) layer.querySelectorAll('[data-overlay-type]').forEach((node) => node.remove());
  const root = document.querySelector('#main-chart .btc-chart-overlay-root');
  if (root && root !== layer) root.querySelectorAll('[data-overlay-type]').forEach((node) => node.remove());
  channelSeries.forEach((series) => { try { tradingChart?.removeSeries?.(series); } catch (error) { /* ignored */ } });
  channelSeries = [];
}

function renderActiveLayers(timeframe = getActiveTimeframe(), options = {}) {
  const state = window.BtcDash.state?.chartRuntime?.layerState || {};
  return Object.entries(state).filter(([, enabled]) => enabled).map(([layer]) => renderLayer(layer, timeframe, options));
}

const layerNameMap = { MA: "ma", Structure: "structure", "S/R": "sr", FVG: "fvg", "EQH/EQL": "liquidity", Channel: "channel", Confluence: "confluence", "Scenario Levels": "scenario" };
const reverseLayerNameMap = Object.fromEntries(Object.entries(layerNameMap).map(([legacy, canonical]) => [canonical, legacy]));

function setLayerState(layer, enabled, options = {}) {
  const canonical = normalizeLayerKey(layer);
  const legacy = getLegacyLayerKey(canonical);
  const timeframe = options.timeframe || getActiveTimeframe();
  if (window.BtcDash.state?.chartRuntime?.layerState) window.BtcDash.state.chartRuntime.layerState[canonical] = Boolean(enabled);
  if (activeLayers && legacy in activeLayers) activeLayers[legacy] = Boolean(enabled);
  return enabled ? (clearLayer(canonical, timeframe, { reason: "pre-render-clear" }), renderLayer(canonical, timeframe, options)) : clearLayer(canonical, timeframe, options);
}

function getLayerState() {
  return { ...(window.BtcDash.state?.chartRuntime?.layerState || {}) };
}

function debugLayerState() {
  const layerState = getLayerState();
  const overlayCountsByLayer = Object.fromEntries(Object.keys(layerState).map((layer) => [layer, window.BtcDash.chart.overlayRegistry?.getOverlayCountByLayer?.(layer) || 0]));
  return { activeTimeframe: getActiveTimeframe(), layerState, overlayCountsByLayer, markerStats: window.BtcDash.chart.markers?.getMarkerStats?.() || null, lastLayerRenderStatus };
}

function debugLayerRender(layer, timeframe = getActiveTimeframe()) {
  const key = normalizeLayerKey(layer);
  const enabled = Boolean(window.BtcDash.state?.chartRuntime?.layerState?.[key]);
  if (!enabled) return { layer: key, timeframe, enabled: false, renderedCount: 0, skippedCount: 0, reason: "Layer is off", warnings: [] };
  return renderLayer(key, timeframe, { reason: "debug-layer-render" });
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
  normalizeLayerKey,
  renderLayer,
  clearLayer,
  debugLayerState,
  debugLayerRender,
  renderMaOverlay,
  clearMaOverlay,
  buildMaOverlayItems,
  getMaDebugState,
  getActiveChart,
  getActiveCandleSeries,
  getActiveChartContainer,
  getActiveChartTimeframe,
  getActiveChartRuntime,
  setActiveChartRuntime,
  refreshActiveChartBinding,
  getChartBindingDiagnostics,
  debugRealRendering,
  debugOverlayCoordinates,
  setLayerState,
  getLayerState,
  applyLayerMarkers,
  clearLayerMarkers,
  syncLayerControlsToState
};
window.BtcDash.chart.overlays = window.BtcDash.chart.overlays || {};
window.BtcDash.chart.overlays.ma = window.BtcDash.chart.overlays.ma || { renderMaOverlay, clearMaOverlay, buildMaOverlayItems, getMaDebugState };
window.BtcDash.renderChart = renderChart;
window.renderChart = renderChart;
