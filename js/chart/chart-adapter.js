(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.chart = window.BtcDash.chart || {};

  function getLwc() { return window.LightweightCharts || null; }
  function getLightweightChartsVersion() { const lwc = getLwc(); return lwc?.version || lwc?.VERSION || "unknown"; }
  function detectChartApiMode(chart = window.BtcDash.chart?.getActiveChart?.()) {
    const lwc = getLwc();
    const hasAddSeries = typeof chart?.addSeries === "function";
    const hasAddLineSeries = typeof chart?.addLineSeries === "function";
    const hasCreateSeriesMarkers = typeof lwc?.createSeriesMarkers === "function";
    const hasLineSeriesConstructor = Boolean(lwc?.LineSeries);
    const hasCandlestickSeriesConstructor = Boolean(lwc?.CandlestickSeries);
    const warnings = [];
    if (!lwc) warnings.push("LightweightCharts unavailable");
    const mode = hasAddSeries && (hasLineSeriesConstructor || hasCandlestickSeriesConstructor) ? "v5-addSeries" : hasAddLineSeries || typeof chart?.addCandlestickSeries === "function" ? "v4-legacy" : "unknown";
    if (mode === "unknown") warnings.push("No compatible series creation API detected");
    return { available: Boolean(lwc), mode, hasAddSeries, hasAddLineSeries, hasCreateSeriesMarkers, hasLineSeriesConstructor, hasCandlestickSeriesConstructor, warnings };
  }
  function wrap(series, mode, warning = null) { return { series: series || null, mode, warning }; }
  function createLineSeriesSafe(chart, options = {}) { try { const lwc = getLwc(); if (chart?.addSeries && lwc?.LineSeries) return wrap(chart.addSeries(lwc.LineSeries, options), "v5-addSeries"); if (chart?.addLineSeries) return wrap(chart.addLineSeries(options), "v4-legacy"); return wrap(null, "unavailable", "series-api-unavailable"); } catch (error) { return wrap(null, "error", error.message); } }
  function createCandlestickSeriesSafe(chart, options = {}) { try { const lwc = getLwc(); if (chart?.addSeries && lwc?.CandlestickSeries) return wrap(chart.addSeries(lwc.CandlestickSeries, options), "v5-addSeries"); if (chart?.addCandlestickSeries) return wrap(chart.addCandlestickSeries(options), "v4-legacy"); return wrap(null, "unavailable", "series-api-unavailable"); } catch (error) { return wrap(null, "error", error.message); } }
  function createHistogramSeriesSafe(chart, options = {}) { try { const lwc = getLwc(); if (chart?.addSeries && lwc?.HistogramSeries) return wrap(chart.addSeries(lwc.HistogramSeries, options), "v5-addSeries"); if (chart?.addHistogramSeries) return wrap(chart.addHistogramSeries(options), "v4-legacy"); return wrap(null, "unavailable", "series-api-unavailable"); } catch (error) { return wrap(null, "error", error.message); } }
  function removeSeriesSafe(chart, series) { try { if (!chart || !series) return { removed: false, warning: "missing-chart-or-series" }; chart.removeSeries?.(series); return { removed: true, warning: null }; } catch (error) { return { removed: false, warning: error.message }; } }
  function setSeriesDataSafe(series, data = []) { try { if (!series?.setData) return { success: false, warning: "setData-unavailable", count: 0 }; series.setData(data); return { success: true, warning: null, count: data.length }; } catch (error) { return { success: false, warning: error.message, count: 0 }; } }
  function markerHandles() { const rt = window.BtcDash.state?.chartRuntime || {}; rt.markerPluginHandles = rt.markerPluginHandles || {}; if (window.BtcDash.state?.chartRuntime) window.BtcDash.state.chartRuntime.markerPluginHandles = rt.markerPluginHandles; return rt.markerPluginHandles; }
  function createOrUpdateSeriesMarkersSafe(series, markers = [], layerKey = "merged", options = {}) { try { const lwc = getLwc(); const handles = markerHandles(); if (lwc?.createSeriesMarkers) { const existing = handles[layerKey]; if (existing?.setMarkers) { existing.setMarkers(markers); return { success: true, mode: "plugin", markerCount: markers.length, warning: null }; } if (existing?.update) { existing.update(markers); return { success: true, mode: "plugin", markerCount: markers.length, warning: null }; } if (existing?.remove) existing.remove(); handles[layerKey] = lwc.createSeriesMarkers(series, markers, options); return { success: true, mode: "plugin", markerCount: markers.length, warning: null }; } if (series?.setMarkers) { series.setMarkers(markers); return { success: true, mode: "setMarkers", markerCount: markers.length, warning: null }; } return { success: false, mode: "unavailable", markerCount: markers.length, warning: "marker-api-unavailable" }; } catch (error) { return { success: false, mode: "error", markerCount: markers.length, warning: error.message }; } }
  function clearSeriesMarkersSafe(series, layerKey = "merged") { return createOrUpdateSeriesMarkersSafe(series, [], layerKey); }
  function priceToCoordinateSafe(series, price) { try { const value = series?.priceToCoordinate?.(Number(price)); const valid = Number.isFinite(value); return { value, valid, reason: valid ? "ok" : "price-coordinate-null" }; } catch (error) { return { value: null, valid: false, reason: error.message }; } }
  function timeToCoordinateSafe(chart, time) { try { const raw = typeof time === "number" && time > 10000000000 ? Math.floor(time / 1000) : time; const value = chart?.timeScale?.()?.timeToCoordinate?.(raw); const valid = Number.isFinite(value); return { value, valid, reason: valid ? "ok" : "time-coordinate-null" }; } catch (error) { return { value: null, valid: false, reason: error.message }; } }
  function getVisibleLogicalRangeSafe(chart) { try { return { value: chart?.timeScale?.()?.getVisibleLogicalRange?.() || null, valid: true }; } catch (error) { return { value: null, valid: false, reason: error.message }; } }
  function getVisibleTimeRangeSafe(chart) { try { return { value: chart?.timeScale?.()?.getVisibleRange?.() || null, valid: true }; } catch (error) { return { value: null, valid: false, reason: error.message }; } }
  function getChartDiagnostics(chart = window.BtcDash.chart?.getActiveChart?.(), series = window.BtcDash.chart?.getActiveCandleSeries?.()) { return { apiMode: detectChartApiMode(chart), hasChart: Boolean(chart), hasCandleSeries: Boolean(series), version: getLightweightChartsVersion() }; }
  window.BtcDash.chart.adapter = { detectChartApiMode, getLightweightChartsVersion, createCandlestickSeriesSafe, createLineSeriesSafe, createHistogramSeriesSafe, removeSeriesSafe, setSeriesDataSafe, createOrUpdateSeriesMarkersSafe, clearSeriesMarkersSafe, priceToCoordinateSafe, timeToCoordinateSafe, getVisibleLogicalRangeSafe, getVisibleTimeRangeSafe, getChartDiagnostics };
})();
