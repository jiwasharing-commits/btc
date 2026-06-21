(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.engines = window.BtcDash.engines || {};

  function proxy(name) {
    return (...args) => {
      const fn = window.BtcDash.analysis?.[name] || window[name];
      if (typeof fn !== "function") {
        console.warn(`[Engine Facade] ${name} is not available yet.`);
        return null;
      }
      return fn(...args);
    };
  }

  window.BtcDash.engines.marketzones = {
    // Build market zones context.
    buildMarketZonesContext: proxy("buildMarketZonesContext"),
    // Dedupe market zone rows.
    dedupeMarketZoneRows: proxy("dedupeMarketZoneRows"),
    // Convert zone to market row.
    zoneToMarketRow: proxy("zoneToMarketRow"),
  };
})();
