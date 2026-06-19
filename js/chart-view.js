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
    <div class="fvg-overlay ${activeLayers.FVG ? '' : 'is-hidden'}"><span>FVG Zone</span></div>
    <div class="chart-watermark">${timeframe} • BTCUSDT</div>
  </div>`;
}

function clearTradingChart() {
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
    title: "Last Closed"
  });

  if (running && running.open_time > closedCandles.at(-1).open_time) {
    candleSeries.createPriceLine({
      price: running.close,
      color: "#facc15",
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dotted,
      axisLabelVisible: true,
      title: "Running"
    });
  }

  const timeframe = getActiveTimeframe();
  if (activeLayers["S/R"]) {
    const sr = srContexts[timeframe];
    if (sr?.available) {
      sr.supportZones.slice(0, 3).forEach((zone, index) => {
        candleSeries.createPriceLine({ price: zone.upper, color: "#22c55e", lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: true, title: index === 0 ? "Support" : "S" });
        candleSeries.createPriceLine({ price: zone.lower, color: "rgba(34, 197, 94, .55)", lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted, axisLabelVisible: false, title: "" });
      });
      sr.resistanceZones.slice(0, 3).forEach((zone, index) => {
        candleSeries.createPriceLine({ price: zone.lower, color: "#f97316", lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: true, title: index === 0 ? "Resistance" : "R" });
        candleSeries.createPriceLine({ price: zone.upper, color: "rgba(249, 115, 22, .55)", lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted, axisLabelVisible: false, title: "" });
      });
    }
  }
  if (activeLayers.FVG) {
    const fvg = fvgContexts[timeframe];
    fvg?.activeFvgs?.slice(0, 3).forEach((zone, index) => {
      const color = zone.type === "bullish" ? "#14b8a6" : "#fb7185";
      candleSeries.createPriceLine({ price: zone.upper, color, lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: index === 0, title: index === 0 ? `${timeframe} FVG` : "" });
      candleSeries.createPriceLine({ price: zone.lower, color, lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted, axisLabelVisible: false, title: "" });
    });
    if (activeWorkspace === "Daily + 4H Setup") {
      const dailyFvg = fvgContexts["1D"]?.activeFvgs?.[0];
      if (dailyFvg) {
        candleSeries.createPriceLine({ price: dailyFvg.upper, color: "rgba(20, 184, 166, .55)", lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: true, title: "Daily FVG" });
        candleSeries.createPriceLine({ price: dailyFvg.lower, color: "rgba(20, 184, 166, .35)", lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted, axisLabelVisible: false, title: "" });
      }
    }
  }

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

function addDummyChannel(candles) {
  if (!tradingChart || !activeLayers.Channel || candles.length < 12) return;
  const segment = candles.slice(-60);
  const first = segment[0];
  const last = segment.at(-1);
  const upperOffset = Math.max(...segment.map((c) => c.high)) * 0.018;
  const lowerOffset = Math.max(...segment.map((c) => c.high)) * 0.018;
  const upper = tradingChart.addLineSeries({ color: "rgba(56, 189, 248, 0.72)", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
  const lower = tradingChart.addLineSeries({ color: "rgba(167, 139, 250, 0.66)", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
  upper.setData([{ time: Math.floor(first.open_time / 1000), value: first.high + upperOffset }, { time: Math.floor(last.open_time / 1000), value: last.high + upperOffset }]);
  lower.setData([{ time: Math.floor(first.open_time / 1000), value: first.low - lowerOffset }, { time: Math.floor(last.open_time / 1000), value: last.low - lowerOffset }]);
  channelSeries = [upper, lower];
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
  addDummyChannel(closedCandles);
  tradingChart.timeScale().fitContent();

  resizeObserver = new ResizeObserver(() => {
    if (!tradingChart || !container.clientWidth || !container.clientHeight) return;
    tradingChart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
  });
  resizeObserver.observe(container);
}

window.BtcDash = window.BtcDash || {};
window.BtcDash.chart = {
  toChartCandles,
  chart,
  clearTradingChart,
  addDummyPriceLines,
  addDummyMarkers,
  addDummyChannel,
  renderTradingChart
};
