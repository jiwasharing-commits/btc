function getCandleRawTime(candle) {
  return candle?.time ?? candle?.openTime ?? candle?.open_time ?? candle?.closeTime ?? candle?.close_time;
}

function formatCandlesForChart(candles = [], timeframe = getActiveTimeframe()) {
  const utils = window.BtcDash.utils || {};
  const byTime = new Map();
  const diagnostics = {
    timeframe,
    rawCount: candles.length,
    formattedCount: 0,
    duplicateTimeCount: 0,
    invalidTimeCount: 0,
    invalidOhlcCount: 0,
    firstRawTime: getCandleRawTime(candles[0]),
    lastRawTime: getCandleRawTime(candles.at(-1)),
    firstChartTime: null,
    lastChartTime: null,
    detectedFirstUnit: utils.detectTimeUnit?.(getCandleRawTime(candles[0])) || "unknown",
    detectedLastUnit: utils.detectTimeUnit?.(getCandleRawTime(candles.at(-1))) || "unknown",
    warnings: []
  };
  candles.forEach((candle) => {
    const rawTime = getCandleRawTime(candle);
    const time = utils.normalizeChartTime?.(rawTime);
    if (!Number.isFinite(time)) { diagnostics.invalidTimeCount += 1; return; }
    const row = { time, open: Number(candle.open), high: Number(candle.high), low: Number(candle.low), close: Number(candle.close) };
    if (![row.open, row.high, row.low, row.close].every(Number.isFinite) || row.high < row.low) { diagnostics.invalidOhlcCount += 1; return; }
    if (byTime.has(time)) diagnostics.duplicateTimeCount += 1;
    byTime.set(time, row);
  });
  const data = [...byTime.values()].sort((a, b) => a.time - b.time);
  diagnostics.formattedCount = data.length;
  diagnostics.firstChartTime = data[0]?.time ?? null;
  diagnostics.lastChartTime = data.at(-1)?.time ?? null;
  if (diagnostics.invalidTimeCount) diagnostics.warnings.push("invalid-time-filtered");
  if (diagnostics.invalidOhlcCount) diagnostics.warnings.push("invalid-ohlc-filtered");
  if (diagnostics.duplicateTimeCount) diagnostics.warnings.push("duplicate-time-replaced");
  if (data.some((row) => row.time > 10000000000)) diagnostics.warnings.push("chart-time-not-seconds");
  return { data, diagnostics };
}

function toChartCandles(candles) {
  return formatCandlesForChart(candles).data;
}

function getBaseCandleOptions() {
  return {
    upColor: "#22c55e",
    downColor: "#ef4444",
    borderUpColor: "#22c55e",
    borderDownColor: "#ef4444",
    wickUpColor: "#86efac",
    wickDownColor: "#fca5a5",
    priceLineVisible: false
  };
}

function ensureChartRuntime() {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.chart = window.BtcDash.chart || {};
  window.BtcDash.chart.runtime = window.BtcDash.chart.runtime || { chart: null, candleSeries: null, chartContainer: null, activeTimeframe: null, activeWorkspace: null, activeRange: null, chartId: null, lastChartRenderAt: null, lastCandleRenderAt: null };
  return window.BtcDash.chart.runtime;
}

function getOfficialChartContainer() {
  return document.getElementById("main-chart");
}

function measureChartContainer(container) {
  if (!container) return { exists: false, validForChart: false, reason: "missing-container" };
  const rect = container.getBoundingClientRect?.() || { width: container.clientWidth || 0, height: container.clientHeight || 0 };
  const style = window.getComputedStyle ? getComputedStyle(container) : {};
  const width = Math.floor(rect.width || container.clientWidth || 0);
  const height = Math.floor(rect.height || container.clientHeight || 0);
  const display = style.display || "unknown";
  const visibility = style.visibility || "unknown";
  const reason = !container.isConnected ? "container-detached" : display === "none" ? "display-none" : visibility === "hidden" ? "visibility-hidden" : width < 600 ? "container-width-invalid" : height < 400 ? "container-height-invalid" : "ready";
  return { exists: true, id: container.id || null, className: container.className || "", width, height, display, position: style.position || "unknown", visibility, isConnected: Boolean(container.isConnected), validForChart: reason === "ready", reason };
}

function applyChartContainerSizeFix(container) {
  if (!container) return;
  container.classList?.add("btc-main-chart-container");
  container.style.position = "relative";
  container.style.width = "100%";
  container.style.height = "560px";
  container.style.minHeight = "520px";
  container.style.overflow = "hidden";
}

function ensureChartContainerReady(options = {}) {
  const container = getOfficialChartContainer();
  let firstMeasure = measureChartContainer(container);
  const warnings = [];
  if (container && (!firstMeasure.validForChart || options.forceSizeFix)) {
    warnings.push(`container-size-fix:${firstMeasure.reason}`);
    applyChartContainerSizeFix(container);
  }
  const finalMeasure = measureChartContainer(container);
  return { container, firstMeasure, finalMeasure, ready: Boolean(finalMeasure.validForChart), warnings };
}

function getCanvasDiagnostics() {
  const container = getOfficialChartContainer();
  const canvases = [...(container?.querySelectorAll?.("canvas") || [])].map((canvas, index) => {
    const rect = canvas.getBoundingClientRect?.() || { width: 0, height: 0 };
    const style = window.getComputedStyle ? getComputedStyle(canvas) : {};
    return { index, widthAttr: canvas.getAttribute?.("width"), heightAttr: canvas.getAttribute?.("height"), rectWidth: Math.floor(rect.width || 0), rectHeight: Math.floor(rect.height || 0), display: style.display || "unknown", visibility: style.visibility || "unknown", opacity: style.opacity || "unknown", zIndex: style.zIndex || "auto" };
  });
  return { canvases, maxCanvasHeight: canvases.reduce((max, canvas) => Math.max(max, canvas.rectHeight || 0), 0) };
}

function setActiveChartRuntime(runtime = {}) {
  const rt = ensureChartRuntime();
  if (runtime.candleSeries === null && rt.candleSeries && runtime.renderSucceeded !== false) delete runtime.candleSeries;
  const official = getOfficialChartContainer();
  const officialMeasure = measureChartContainer(official);
  Object.assign(rt, runtime, {
    activeContainerId: official?.id || runtime.activeContainerId || null,
    activeContainerRect: officialMeasure.exists ? { width: officialMeasure.width, height: officialMeasure.height } : runtime.activeContainerRect || null,
    boundToOfficialContainer: runtime.chartContainer ? runtime.chartContainer === official : rt.chartContainer === official,
    createdAt: rt.createdAt || runtime.createdAt || new Date().toISOString()
  });
  if (window.BtcDash.state?.chartRuntime) Object.assign(window.BtcDash.state.chartRuntime, { activeContainerId: rt.activeContainerId, activeContainerRect: rt.activeContainerRect, boundToOfficialContainer: rt.boundToOfficialContainer, chartId: rt.chartId, createdAt: rt.createdAt });
  return rt;
}
function getActiveChartRuntime() { return ensureChartRuntime(); }
function getActiveChart() { return ensureChartRuntime().chart || tradingChart || null; }
function getActiveCandleSeries() { return ensureChartRuntime().candleSeries || candleSeries || null; }
function getActiveChartContainer() { return ensureChartRuntime().chartContainer || getOfficialChartContainer(); }
function getActiveChartTimeframe() { return ensureChartRuntime().activeTimeframe || getActiveTimeframe(); }
function refreshActiveChartBinding(reason = "manual") { return setActiveChartRuntime({ chart: tradingChart || null, candleSeries: candleSeries || null, chartContainer: getOfficialChartContainer(), activeTimeframe: getActiveTimeframe(), activeWorkspace, activeRange: rangeState[activeWorkspace] || null, chartId: ensureChartRuntime().chartId || `chart-${Date.now()}`, lastChartRenderAt: new Date().toISOString(), refreshReason: reason }); }
function getChartBindingDiagnostics() { const rt = ensureChartRuntime(); const apiMode = window.BtcDash.chart.adapter?.detectChartApiMode?.(rt.chart) || { mode: "unknown", warnings: ["adapter unavailable"] }; const warnings = []; if (!rt.chart) warnings.push("missing-active-chart"); if (!rt.candleSeries) warnings.push("missing-candle-series"); if (!rt.chartContainer) warnings.push("missing-chart-container"); return { hasChart: Boolean(rt.chart), hasCandleSeries: Boolean(rt.candleSeries), hasContainer: Boolean(rt.chartContainer), activeTimeframe: rt.activeTimeframe, activeWorkspace: rt.activeWorkspace, chartId: rt.chartId, apiMode: apiMode.mode, libraryVersion: apiMode.libraryVersion, layerState: getLayerState?.() || {}, warnings }; }
function assertBaseChartReady() {
  const rt = ensureChartRuntime();
  const hasChart = Boolean(rt.chart || tradingChart);
  const hasCandleSeries = Boolean(rt.candleSeries || candleSeries);
  const official = getOfficialChartContainer();
  const activeContainer = rt.chartContainer || official;
  const activeMeasure = measureChartContainer(activeContainer);
  const canvasDiag = getCanvasDiagnostics();
  const hasContainer = Boolean(activeContainer);
  const activeSameAsOfficial = Boolean(activeContainer && official && activeContainer === official);
  const setDataSuccess = rt.lastSetDataStatus ? Boolean(rt.lastSetDataStatus.success) : Boolean(hasCandleSeries);
  const formatted = getFormattedCandlesForTimeframe(getActiveChartTimeframe());
  const visibleDiagnostics = getVisibleRangeDiagnostics(getActiveChartTimeframe(), rangeState[activeWorkspace]);
  const formattedCandleCount = formatted.length;
  const hasValidTimes = Number.isFinite(formatted[0]?.time) && Number.isFinite(formatted.at(-1)?.time);
  const visibleOk = visibleDiagnostics.visibleCandlesInRange === null || visibleDiagnostics.visibleCandlesInRange > 0;
  const warnings = [...(visibleDiagnostics.warnings || [])];
  const containerOk = activeSameAsOfficial && activeMeasure.height >= 400;
  const canvasOk = canvasDiag.maxCanvasHeight === 0 || canvasDiag.maxCanvasHeight >= 400;
  const reason = !hasChart ? "missing-chart" : !hasCandleSeries ? "missing-candle-series" : !hasContainer ? "missing-chart-container" : !activeSameAsOfficial ? "active-container-not-official" : activeMeasure.height < 400 ? "active-container-height-invalid" : !setDataSuccess ? "set-data-failed" : !formattedCandleCount ? "missing-formatted-candles" : !hasValidTimes ? "invalid-chart-time" : !visibleOk ? "visible-range-has-no-candles" : !canvasOk ? "canvas-height-invalid" : "ready";
  return { ready: hasChart && hasCandleSeries && hasContainer && containerOk && canvasOk && setDataSuccess && formattedCandleCount > 0 && hasValidTimes && visibleOk, hasChart, hasCandleSeries, hasContainer, setDataSuccess, formattedCandleCount, visibleCandlesInRange: visibleDiagnostics.visibleCandlesInRange, activeContainerSameAsOfficial: activeSameAsOfficial, activeContainerHeight: activeMeasure.height, maxCanvasHeight: canvasDiag.maxCanvasHeight, reason, warnings };
}
function debugBaseChart() {
  const timeframe = getActiveChartTimeframe();
  const candles = marketData[timeframe] || [];
  const formatted = getFormattedCandlesForTimeframe(timeframe).length ? getFormattedCandlesForTimeframe(timeframe) : formatCandlesForChart(getDisplayCandlesForChart(timeframe, getActiveCandles()), timeframe).data;
  const timeScaleDebug = getVisibleRangeDiagnostics(timeframe, rangeState[activeWorkspace]);
  const rt = ensureChartRuntime();
  const chart = getActiveChart();
  const series = getActiveCandleSeries();
  const api = window.BtcDash.chart.adapter?.detectChartApiMode?.(chart) || { mode: "unknown", warnings: ["adapter unavailable"] };
  const binding = debugChartContainerBinding();
  const warnings = [...(api.warnings || []), ...(binding.warnings || [])];
  if (!chart) warnings.push("missing-chart");
  if (!candles.length) warnings.push("missing-candles");
  if (!series) warnings.push(rt.lastCandleCreateWarning || "series-create-failed");
  if (rt.lastSetDataStatus && !rt.lastSetDataStatus.success) warnings.push(`set-data-failed:${rt.lastSetDataStatus.warning}`);
  if (candles.length && !formatted.length) warnings.push("invalid-candle-format");
  return {
    activeTimeframe: timeframe,
    activeWorkspace,
    hasChart: Boolean(chart),
    hasCandleSeries: Boolean(series),
    hasChartContainer: Boolean(getActiveChartContainer()),
    apiMode: api.mode,
    libraryVersion: api.libraryVersion,
    candleCount: candles.length,
    formattedCandleCount: formatted.length,
    firstCandle: formatted[0] || null,
    lastCandle: formatted.at(-1) || null,
    firstChartTime: formatted[0]?.time ?? null,
    lastChartTime: formatted.at(-1)?.time ?? null,
    visibleRange: timeScaleDebug.visibleRange,
    visibleCandlesInRange: timeScaleDebug.visibleCandlesInRange,
    timeUnitWarnings: timeScaleDebug.warnings,
    officialContainerHeight: binding.officialContainer.height,
    activeContainerHeight: binding.activeContainer.height,
    activeContainerSameAsOfficial: binding.activeContainer.sameAsOfficial,
    maxCanvasHeight: Math.max(0, ...binding.canvases.map((canvas) => canvas.rectHeight || 0)),
    chartContainerBindingValid: binding.valid,
    chartContainerBindingReason: binding.reason,
    setDataSuccess: Boolean(rt.lastSetDataStatus?.success),
    lastCandleRenderAt: rt.lastCandleRenderAt || null,
    candleSeriesMethods: { hasSetData: typeof series?.setData === "function", hasSetMarkers: typeof series?.setMarkers === "function", hasPriceToCoordinate: typeof series?.priceToCoordinate === "function" },
    chartMethods: { hasAddCandlestickSeries: typeof chart?.addCandlestickSeries === "function", hasAddLineSeries: typeof chart?.addLineSeries === "function", hasAddSeries: typeof chart?.addSeries === "function", hasRemoveSeries: typeof chart?.removeSeries === "function" },
    warnings
  };
}


function getFormattedCandlesForTimeframe(timeframe = getActiveChartTimeframe()) {
  return window.BtcDash.state?.chartRuntime?.lastFormattedCandles?.[timeframe] || [];
}

function getVisibleRangeDiagnostics(timeframe = getActiveChartTimeframe(), rangePreset = rangeState[activeWorkspace]) {
  const chart = getActiveChart();
  const formatted = getFormattedCandlesForTimeframe(timeframe);
  const warnings = [];
  let visibleRange = null;
  let logicalRange = null;
  try { visibleRange = chart?.timeScale?.()?.getVisibleRange?.() || null; } catch (error) { warnings.push(`visible-range-error:${error.message}`); }
  try { logicalRange = chart?.timeScale?.()?.getVisibleLogicalRange?.() || null; } catch (error) { warnings.push(`logical-range-error:${error.message}`); }
  const normalizedVisibleRange = visibleRange ? window.BtcDash.utils?.normalizeVisibleRange?.(visibleRange) : null;
  const from = normalizedVisibleRange?.from;
  const to = normalizedVisibleRange?.to;
  const visibleCandlesInRange = normalizedVisibleRange?.valid ? formatted.filter((candle) => candle.time >= from && candle.time <= to).length : null;
  if (normalizedVisibleRange?.valid && visibleCandlesInRange === 0) warnings.push("visible-range-has-no-candles");
  return {
    activeTimeframe: timeframe,
    candleCount: formatted.length,
    firstChartTime: formatted[0]?.time ?? null,
    lastChartTime: formatted.at(-1)?.time ?? null,
    firstRawTime: window.BtcDash.state?.chartRuntime?.lastCandleDiagnostics?.[timeframe]?.firstRawTime ?? null,
    lastRawTime: window.BtcDash.state?.chartRuntime?.lastCandleDiagnostics?.[timeframe]?.lastRawTime ?? null,
    detectedRawUnit: window.BtcDash.state?.chartRuntime?.lastCandleDiagnostics?.[timeframe]?.detectedLastUnit || "unknown",
    detectedChartUnit: formatted[0]?.time ? window.BtcDash.utils?.detectTimeUnit?.(formatted[0].time) : "unknown",
    visibleRange,
    visibleRangeUnit: visibleRange ? window.BtcDash.utils?.normalizeVisibleRange?.(visibleRange)?.originalUnit : "unknown",
    logicalRange,
    visibleCandlesInRange,
    rangePreset,
    warnings
  };
}

function applyChartRange(timeframe = getActiveChartTimeframe(), rangeKey = rangeState[activeWorkspace]) {
  const chart = getActiveChart();
  const formatted = getFormattedCandlesForTimeframe(timeframe);
  const warnings = [];
  if (!chart?.timeScale || !formatted.length) return { applied: false, reason: "missing-chart-or-candles", warnings };
  const timeScale = chart.timeScale();
  if (!rangeKey || rangeKey === "Full") {
    timeScale.fitContent?.();
    const diagnostics = getVisibleRangeDiagnostics(timeframe, rangeKey);
    window.BtcDash.state.chartRuntime.lastVisibleRangeDiagnostics = { ...diagnostics, appliedRange: rangeKey, fallbackApplied: false };
    return { applied: true, mode: "fitContent", diagnostics, warnings };
  }
  const match = String(rangeKey).match(/^(\d+)([DMY])$/);
  if (!match) {
    timeScale.fitContent?.();
    warnings.push("unknown-range-preset-fitContent");
    const diagnostics = getVisibleRangeDiagnostics(timeframe, rangeKey);
    window.BtcDash.state.chartRuntime.lastVisibleRangeDiagnostics = { ...diagnostics, appliedRange: rangeKey, fallbackApplied: true, warnings: [...diagnostics.warnings, ...warnings] };
    return { applied: true, mode: "fitContent", diagnostics, warnings };
  }
  const units = { D: 86400, M: 30 * 86400, Y: 365 * 86400 };
  const last = formatted.at(-1).time;
  const from = last - Number(match[1]) * units[match[2]];
  const normalized = window.BtcDash.utils?.normalizeVisibleRange?.({ from, to: last });
  if (normalized?.valid) timeScale.setVisibleRange?.({ from: normalized.from, to: normalized.to });
  let diagnostics = getVisibleRangeDiagnostics(timeframe, rangeKey);
  if (diagnostics.visibleCandlesInRange === 0) {
    timeScale.fitContent?.();
    warnings.push("visible range empty; fitContent fallback applied");
    diagnostics = getVisibleRangeDiagnostics(timeframe, rangeKey);
  }
  window.BtcDash.state.chartRuntime.lastVisibleRangeDiagnostics = { ...diagnostics, appliedRange: rangeKey, fallbackApplied: warnings.length > 0, warnings: [...diagnostics.warnings, ...warnings] };
  return { applied: true, mode: normalized?.valid ? "setVisibleRange" : "fitContent", range: normalized, diagnostics, warnings };
}


function debugChartContainerBinding() {
  const official = getOfficialChartContainer();
  const active = getActiveChartContainer();
  const officialMeasure = measureChartContainer(official);
  const activeMeasure = measureChartContainer(active);
  const internal = [...(official?.querySelectorAll?.(".tv-lightweight-charts") || [])].map((node, index) => ({ index, ...measureChartContainer(node) }));
  const canvasDiag = getCanvasDiagnostics();
  const rt = ensureChartRuntime();
  const sameAsOfficial = Boolean(active && official && active === official);
  const warnings = [];
  if (!officialMeasure.exists) warnings.push("official-container-missing");
  if (officialMeasure.height < 400) warnings.push("official-container-height-invalid");
  if (!sameAsOfficial) warnings.push("active-container-not-official");
  if (canvasDiag.canvases.length && canvasDiag.maxCanvasHeight < 400) warnings.push("canvas-height-invalid");
  const valid = officialMeasure.exists && officialMeasure.height >= 400 && sameAsOfficial && Boolean(rt.chart) && Boolean(rt.candleSeries) && (!canvasDiag.canvases.length || canvasDiag.maxCanvasHeight >= 400);
  const reason = !officialMeasure.exists ? "official-container-missing" : officialMeasure.height < 400 ? "official-container-height-invalid" : !sameAsOfficial ? "active-container-not-official" : !rt.chart ? "missing-chart" : !rt.candleSeries ? "missing-candle-series" : canvasDiag.canvases.length && canvasDiag.maxCanvasHeight < 400 ? "canvas-height-invalid" : "ready";
  return {
    officialContainer: { exists: officialMeasure.exists, width: officialMeasure.width, height: officialMeasure.height, display: officialMeasure.display, position: officialMeasure.position, visibility: officialMeasure.visibility, className: officialMeasure.className },
    activeContainer: { exists: activeMeasure.exists, sameAsOfficial, width: activeMeasure.width, height: activeMeasure.height, display: activeMeasure.display, position: activeMeasure.position, visibility: activeMeasure.visibility, className: activeMeasure.className },
    lightweightInternal: { count: internal.length, rects: internal },
    canvases: canvasDiag.canvases,
    chartRuntime: { chartId: rt.chartId, activeTimeframe: rt.activeTimeframe, activeWorkspace: rt.activeWorkspace, boundToOfficialContainer: rt.boundToOfficialContainer, hasChart: Boolean(rt.chart), hasCandleSeries: Boolean(rt.candleSeries) },
    valid,
    reason,
    warnings
  };
}

function ensureCanvasHeightValid(reason = "unknown") {
  const chart = getActiveChart();
  const containerStatus = ensureChartContainerReady();
  const measure = containerStatus.finalMeasure;
  let canvasDiag = getCanvasDiagnostics();
  if (chart?.resize && measure.width && measure.height && canvasDiag.maxCanvasHeight < 400) {
    chart.resize(Math.max(600, measure.width), Math.max(420, measure.height), true);
    chart.timeScale?.()?.fitContent?.();
    canvasDiag = getCanvasDiagnostics();
  }
  return { reason, container: measure, ...canvasDiag, recovered: canvasDiag.maxCanvasHeight >= 400 };
}

function hardResetChartRuntime(reason = "manual") {
  const official = getOfficialChartContainer();
  const oldChart = getActiveChart();
  window.BtcDash.chart.overlayRegistry?.clearAllOverlays?.();
  window.BtcDash.chart.markers?.clearAllMarkers?.();
  try { oldChart?.remove?.(); } catch (error) { console.warn("[BTC Dash] chart hard reset remove failed", error); }
  tradingChart = null;
  candleSeries = null;
  channelSeries = [];
  if (official) official.innerHTML = "";
  ensureChartContainerReady({ forceSizeFix: true });
  const rendered = renderTradingChart({ hardReset: true, reason });
  return { reason, rendered, container: debugChartContainerBinding(), baseChart: debugBaseChart() };
}

function recoverVisibleChart() {
  const container = ensureChartContainerReady({ forceSizeFix: true });
  const reset = hardResetChartRuntime("manual-visible-chart-recovery");
  const canvas = ensureCanvasHeightValid("manual-visible-chart-recovery");
  return { container, reset, canvas, binding: debugChartContainerBinding(), baseChart: debugBaseChart() };
}

function debugTimeScale() {
  return getVisibleRangeDiagnostics(getActiveChartTimeframe(), rangeState[activeWorkspace]);
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
    <div id="main-chart" class="trading-chart btc-main-chart-container" aria-label="TradingView-style candlestick chart"></div>
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
  const toUnixSeconds = (value, fallbackMs) => {
    const ms = Number(fallbackMs ?? value);
    if (Number.isFinite(ms) && ms > 1e11) return Math.floor(ms / 1000);
    if (Number.isFinite(ms) && ms > 0) return Math.floor(ms);
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
  };
  const context = structureContexts[timeframe];
  if (activeLayers.Structure && context?.available) {
    const structureLabels = window.BtcDash.getRenderableStructureLabels?.(timeframe, context) || [];
    markers.push(...structureLabels
      .filter((label) => {
        const seconds = toUnixSeconds(label.time, label.timeMs ?? label.open_time);
        return seconds != null && seconds * 1000 >= firstVisibleTime;
      })
      .slice(-28)
      .map((label) => {
        const time = toUnixSeconds(label.time, label.timeMs ?? label.open_time);
        if (time == null) return null;
        return {
          time,
          position: label.type === "high" ? "aboveBar" : "belowBar",
          color: label.type === "high" ? "#38bdf8" : "#facc15",
          shape: label.type === "high" ? "arrowDown" : "arrowUp",
          text: label.displayLabel || label.microDisplayLabel || label.label
        };
      }).filter(Boolean));
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
  const baseStatus = assertBaseChartReady();
  if (!baseStatus.ready) return { renderedCount: 0, reason: "base-chart-not-ready", baseChartStatus: baseStatus };
  clearMaOverlay();
  const chart = getActiveChart();
  if (!chart) return [];
  const colors = { 20: "#38bdf8", 50: "#facc15", 200: "#f472b6" };
  const rendered = buildMaOverlayItems(timeframe).map((item) => {
    const created = window.BtcDash.chart.adapter?.createLineSeriesSafe?.(chart, { color: colors[item.period] || "#94a3b8", lineWidth: item.period === 200 ? 2 : 1, priceLineVisible: false, lastValueVisible: true, title: item.label }) || {};
    let series = created.series;
    if (!series && typeof chart.addLineSeries === "function") series = chart.addLineSeries({ color: colors[item.period] || "#94a3b8", lineWidth: item.period === 200 ? 2 : 1, priceLineVisible: false, lastValueVisible: true, title: item.label });
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
  const baseStatus = assertBaseChartReady();
  if (!baseStatus.ready) {
    lastLayerRenderStatus[key] = { layer: key, timeframe, enabled: true, renderedCount: 0, skippedCount: 1, reason: "base-chart-not-ready", baseChartStatus: baseStatus, warnings: [baseStatus.reason] };
    return lastLayerRenderStatus[key];
  }
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

function renderTradingChart(options = {}) {
  clearTradingChart();
  const containerReady = ensureChartContainerReady({ forceSizeFix: options.forceSizeFix });
  const container = containerReady.container;
  if (!container || activeWorkspace === 'MTF Summary') return { rendered: false, reason: containerReady.finalMeasure?.reason || "missing-container" };
  if (!containerReady.ready) return { rendered: false, reason: containerReady.finalMeasure?.reason || "container-not-ready", containerReady };
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

  const rect = container.getBoundingClientRect();
  const chartWidth = Math.max(600, Math.floor(rect.width || container.clientWidth || 1200));
  const chartHeight = Math.max(420, Math.floor(rect.height || container.clientHeight || 560));
  tradingChart = LightweightCharts.createChart(container, {
    width: chartWidth,
    height: chartHeight,
    autoSize: false,
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
  tradingChart.resize?.(chartWidth, chartHeight, true);

  const candleOptions = getBaseCandleOptions();
  const formatted = formatCandlesForChart(displayCandles, timeframe);
  const formattedCandles = formatted.data;
  if (window.BtcDash.state?.chartRuntime) {
    window.BtcDash.state.chartRuntime.lastFormattedCandles = window.BtcDash.state.chartRuntime.lastFormattedCandles || { "1W": [], "1D": [], "4H": [], "1H": [] };
    window.BtcDash.state.chartRuntime.lastCandleDiagnostics = window.BtcDash.state.chartRuntime.lastCandleDiagnostics || { "1W": null, "1D": null, "4H": null, "1H": null };
    window.BtcDash.state.chartRuntime.lastFormattedCandles[timeframe] = formattedCandles;
    window.BtcDash.state.chartRuntime.lastCandleDiagnostics[timeframe] = formatted.diagnostics;
  }
  const candleCreated = window.BtcDash.chart.adapter?.createCandlestickSeriesSafe?.(tradingChart, candleOptions) || {};
  candleSeries = candleCreated.series;
  if (!candleSeries && typeof tradingChart.addCandlestickSeries === "function") {
    try { candleSeries = tradingChart.addCandlestickSeries(candleOptions); candleCreated.mode = "v4-legacy-fallback"; }
    catch (error) { candleCreated.warning = error.message; }
  }
  if (!candleSeries) {
    setActiveChartRuntime({ chart: tradingChart, candleSeries: null, chartContainer: container, activeTimeframe: timeframe, activeWorkspace, activeRange: rangeState[activeWorkspace] || null, renderSucceeded: false, lastCandleCreateWarning: candleCreated.warning || "series-create-failed" });
    container.innerHTML = `<div class="status-panel error">Failed to create candle series: ${candleCreated.warning || "series-api-unavailable"}</div>`;
    return;
  }
  const setDataStatus = window.BtcDash.chart.adapter?.setSeriesDataSafe?.(candleSeries, formattedCandles) || { success: false, dataCount: 0, warning: "adapter-unavailable" };
  if (!setDataStatus.success) {
    setActiveChartRuntime({ chart: tradingChart, candleSeries: null, chartContainer: container, activeTimeframe: timeframe, activeWorkspace, activeRange: rangeState[activeWorkspace] || null, renderSucceeded: false, lastSetDataStatus: setDataStatus });
    container.innerHTML = `<div class="status-panel error">Failed to set candle data: ${setDataStatus.warning || "set-data-failed"}</div>`;
    return;
  }
  setActiveChartRuntime({ chart: tradingChart, candleSeries, chartContainer: container, activeTimeframe: timeframe, activeWorkspace, activeRange: rangeState[activeWorkspace] || null, chartId: `chart-${Date.now()}`, lastChartRenderAt: new Date().toISOString(), lastCandleRenderAt: new Date().toISOString(), lastSetDataStatus: setDataStatus, lastCandleCreateStatus: candleCreated, renderSucceeded: true });
  addDummyPriceLines(closedCandles, running);
  addDummyMarkers(closedCandles, running, timeframe);
  if (window.BtcDash.state?.chartRuntime) {
    window.BtcDash.state.chartRuntime.runningPreviewDiagnostics = running ? { rawTime: getCandleRawTime(running), chartTime: window.BtcDash.utils?.normalizeChartTime?.(getCandleRawTime(running)), detectedUnit: window.BtcDash.utils?.detectTimeUnit?.(getCandleRawTime(running)), rendered: Boolean(running && closedCandles.length && running.open_time > closedCandles.at(-1).open_time) } : { rendered: false };
  }
  tradingChart.timeScale().fitContent();
  applyChartRange(timeframe, rangeState[activeWorkspace]);
  ensureCanvasHeightValid("after-candle-render");
  requestAnimationFrame(() => {
    const r = container.getBoundingClientRect();
    tradingChart?.resize?.(Math.max(600, Math.floor(r.width || chartWidth)), Math.max(420, Math.floor(r.height || chartHeight)), true);
    tradingChart?.timeScale?.()?.fitContent?.();
    applyChartRange(timeframe, rangeState[activeWorkspace]);
  });
  window.BtcDash.chart.markers?.reapplyActiveMarkers?.("after-candle-render");
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
  formatCandlesForChart,
  getOfficialChartContainer,
  measureChartContainer,
  ensureChartContainerReady,
  ensureCanvasHeightValid,
  hardResetChartRuntime,
  recoverVisibleChart,
  debugChartContainerBinding,
  applyChartRange,
  debugTimeScale,
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
  assertBaseChartReady,
  debugBaseChart,
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
