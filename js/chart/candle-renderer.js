(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.chart = window.BtcDash.chart || {};

  function renderCandles(timeframe, options = {}) {
    if (typeof window.BtcDash.chart?.renderChart === "function" && options.delegate !== false && !options.skipChartRender) window.BtcDash.chart.renderChart(timeframe, { reason: options.reason || "candle-renderer", skipCandleDelegate: true });
    else if (typeof window.BtcDash.chart?.renderTradingChart === "function" && options.delegate !== false) window.BtcDash.chart.renderTradingChart();
    return { ...getChartSeries(), baseChart: window.BtcDash.chart?.debugBaseChart?.() || null };
  }
  function renderRunningCandlePreview(timeframe, options = {}) { return { timeframe, preview: window.BtcDash.state?.runningCandles?.[timeframe] || null, options }; }
  function clearRunningCandlePreview() { return true; }
  function getChartSeries() { return { chart: window.BtcDash.chart?.getActiveChart?.() || window.BtcDash.state?.tradingChart || null, candleSeries: window.BtcDash.chart?.getActiveCandleSeries?.() || window.BtcDash.state?.candleSeries || null }; }
  function updateChartRange(range) { return { range, updated: true }; }

  window.BtcDash.chart.candles = { renderCandles, renderRunningCandlePreview, clearRunningCandlePreview, getChartSeries, updateChartRange };
})();
