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
    <div class="running-overlay ${hasRunningPreview ? '' : 'is-hidden'}"><span>Running Preview<br><small>Preview Only</small></span></div>
    <div class="chart-watermark">${timeframe} • BTCUSDT</div>
  </div>`;
}

function clearTradingChart() {
  qs('#main-chart')?.querySelectorAll('.fvg-zone-box').forEach((node) => node.remove());
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
  if (activeLayers["S/R"]) {
    addSrSegmentOverlays(closedCandles, timeframe);
  }

  if (activeLayers.Confluence) {
    const candidate = confluenceContext?.strongestCandidate;
    if (candidate) {
      candleSeries.createPriceLine({ price: candidate.midpoint, color: "rgba(45, 212, 191, .75)", lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted, axisLabelVisible: true, title: "Confluence" });
    }
  }

  if (activeLayers["Scenario Levels"]) {
    addScenarioLevelPriceLines();
  }
}

function addScenarioLevelPriceLines() {
  const riskPlan = scenarioContext?.primaryScenario?.riskPlan;
  if (!candleSeries || !riskPlan?.available) return;
  candleSeries.createPriceLine({ price: riskPlan.watchArea.midpoint, color: "rgba(34, 197, 94, .75)", lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: true, title: "Watch Area" });
  candleSeries.createPriceLine({ price: riskPlan.invalidation.level, color: "rgba(248, 113, 113, .78)", lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted, axisLabelVisible: true, title: "Invalidation Ref" });
  riskPlan.targets.slice(0, 3).forEach((target, index) => {
    candleSeries.createPriceLine({ price: target.level, color: "rgba(125, 211, 252, .68)", lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted, axisLabelVisible: true, title: `TP${index + 1} Ref` });
  });
}

function addLimitedSegment(candles, price, color, title, lineStyle = LightweightCharts.LineStyle.Dashed) {
  if (!tradingChart || candles.length < 2 || !Number.isFinite(Number(price))) return;
  const startIndex = Math.max(0, candles.length - Math.max(16, Math.round(candles.length * 0.28)));
  const start = candles[startIndex].open_time;
  const interval = candles.at(-1).open_time - candles.at(-2).open_time || 3600000;
  const end = candles.at(-1).open_time + interval * 10;
  const series = tradingChart.addLineSeries({ color, lineWidth: 1, lineStyle, priceLineVisible: false, lastValueVisible: true, title });
  series.setData([{ time: Math.floor(start / 1000), value: price }, { time: Math.floor(end / 1000), value: price }]);
  channelSeries.push(series);
}

function addSrSegmentOverlays(candles, timeframe) {
  const sr = srContexts[timeframe];
  if (!sr?.available) return;
  [sr.nearestSupport, sr.strongestSupport].filter(Boolean).slice(0, 2).forEach((zone) => {
    addLimitedSegment(candles, zone.upper, "rgba(34, 197, 94, .82)", "S", LightweightCharts.LineStyle.Dashed);
    addLimitedSegment(candles, zone.lower, "rgba(34, 197, 94, .42)", "", LightweightCharts.LineStyle.Dotted);
  });
  [sr.nearestResistance, sr.strongestResistance].filter(Boolean).slice(0, 2).forEach((zone) => {
    addLimitedSegment(candles, zone.lower, "rgba(249, 115, 22, .86)", "R", LightweightCharts.LineStyle.Dashed);
    addLimitedSegment(candles, zone.upper, "rgba(249, 115, 22, .42)", "", LightweightCharts.LineStyle.Dotted);
  });
}

function fvgLabel(timeframe, zone) {
  const prefix = timeframe === "1W" ? "W" : timeframe === "1D" ? "D" : timeframe;
  const side = zone.type === "bullish" ? "Bull" : zone.type === "bearish" ? "Bear" : "Inv";
  return `${prefix} ${side} FVG`;
}

function addFvgZoneBoxes(candles, timeframe) {
  const container = qs('#main-chart');
  container?.querySelectorAll('.fvg-zone-box').forEach((node) => node.remove());
  if (!tradingChart || !candleSeries || !activeLayers.FVG || candles.length < 2 || !container) return;
  const zones = (fvgContexts[timeframe]?.activeFvgs || []).slice(0, 3).map((zone) => ({ zone, timeframe, isHtf: false }));
  if (activeWorkspace === "Daily + 4H Setup" && fvgContexts["1D"]?.activeFvgs?.[0]) {
    zones.push({ zone: fvgContexts["1D"].activeFvgs[0], timeframe: "1D", isHtf: true });
  }
  const startCandle = candles[Math.max(0, candles.length - 28)];
  const firstX = tradingChart.timeScale().timeToCoordinate(Math.floor(startCandle.open_time / 1000));
  const lastX = tradingChart.timeScale().timeToCoordinate(Math.floor(candles.at(-1).open_time / 1000));
  if (!Number.isFinite(firstX) || !Number.isFinite(lastX)) return;
  zones.forEach(({ zone, timeframe: zoneTf, isHtf }, index) => {
    const top = candleSeries.priceToCoordinate(zone.upper);
    const bottom = candleSeries.priceToCoordinate(zone.lower);
    if (!Number.isFinite(top) || !Number.isFinite(bottom)) return;
    const box = document.createElement('div');
    box.className = `fvg-zone-box ${zone.type === "bullish" ? "bullish" : "bearish"} ${zone.status === "Partially Filled" ? "partial" : ""} ${isHtf ? "htf" : ""}`;
    box.style.left = `${Math.max(0, firstX + index * 10)}px`;
    box.style.width = `${Math.max(82, lastX - firstX + 72 - index * 8)}px`;
    box.style.top = `${Math.min(top, bottom)}px`;
    box.style.height = `${Math.max(16, Math.abs(bottom - top))}px`;
    box.innerHTML = `<span>${fvgLabel(zoneTf, zone)}</span>`;
    container.appendChild(box);
  });
}

function addDummyMarkers(closedCandles, running, timeframe) {
  if (!candleSeries) return;
  const markers = [];
  const firstVisibleTime = closedCandles[0]?.open_time ?? 0;
  const context = structureContexts[timeframe];
  if (activeLayers.Structure && context?.available) {
    markers.push(...context.labels
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
  requestAnimationFrame(() => addFvgZoneBoxes(closedCandles, timeframe));

  resizeObserver = new ResizeObserver(() => {
    if (!tradingChart || !container.clientWidth || !container.clientHeight) return;
    tradingChart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
    requestAnimationFrame(() => addFvgZoneBoxes(closedCandles, timeframe));
  });
  resizeObserver.observe(container);
}

window.BtcDash = window.BtcDash || {};
window.BtcDash.chart = {
  toChartCandles,
  chart,
  clearTradingChart,
  addDummyPriceLines,
  addScenarioLevelPriceLines,
  addSrSegmentOverlays,
  addFvgZoneBoxes,
  addDummyMarkers,
  addChannelOverlays,
  renderTradingChart
};
