(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.chart = window.BtcDash.chart || {};

  function getVisiblePriceRange(candles = []) {
    const highs = candles.map((c) => Number(c.high)).filter(Number.isFinite);
    const lows = candles.map((c) => Number(c.low)).filter(Number.isFinite);
    if (!highs.length || !lows.length) return null;
    return { high: Math.max(...highs), low: Math.min(...lows), midpoint: (Math.max(...highs) + Math.min(...lows)) / 2 };
  }
  function getCurrentClosedPrice(timeframe) {
    const candles = window.BtcDash.state?.marketData?.[timeframe] || [];
    const last = candles[candles.length - 1];
    return Number(last?.close) || null;
  }
  function overlayMidpoint(overlay) { return Number(overlay.price ?? ((Number(overlay.zoneLow) + Number(overlay.zoneHigh)) / 2)); }
  function isOverlayFarFromPrice(overlay, timeframe) {
    const price = getCurrentClosedPrice(timeframe);
    const midpoint = overlayMidpoint(overlay);
    if (!price || !Number.isFinite(midpoint)) return false;
    const distancePct = Math.abs(midpoint - price) / price * 100;
    const max = window.BtcDash.config?.OVERLAY_RENDER_CONFIG?.maxDistancePctFromVisiblePrice?.[timeframe] ?? 20;
    return distancePct > max;
  }
  function resolveOverlayDrawPolicy(overlay, timeframe) {
    if (overlay?.drawPolicy === "hide") return "hide";
    if (isOverlayFarFromPrice(overlay, timeframe)) return window.BtcDash.config?.OVERLAY_RENDER_CONFIG?.autoscalePolicy?.farOverlayFallback || "summaryOnly";
    return overlay?.drawPolicy || "show";
  }
  function filterAutoscaleSafeOverlays(overlays = [], timeframe) {
    return overlays.map((overlay) => ({ ...overlay, drawPolicy: resolveOverlayDrawPolicy(overlay, timeframe) })).filter((overlay) => overlay.drawPolicy === "show");
  }

  window.BtcDash.chart.autoscaleGuard = { getVisiblePriceRange, getCurrentClosedPrice, isOverlayFarFromPrice, resolveOverlayDrawPolicy, filterAutoscaleSafeOverlays };
})();
