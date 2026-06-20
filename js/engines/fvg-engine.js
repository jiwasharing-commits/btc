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

  window.BtcDash.engines.fvg = {
    // Rebuild all FVG contexts.
    rebuildAllFvgContexts: proxy("rebuildAllFvgContexts"),
    // Build one FVG context.
    buildFvgContext: proxy("buildFvgContext"),
    // Scan FVGs.
    scanFvgForTimeframe: proxy("scanFvgForTimeframe"),
    // Derive FVG status.
    deriveFvgStatus: proxy("deriveFvgStatus"),
    // Derive D/4H FVG confluence.
    deriveDaily4hFvgConfluence: proxy("deriveDaily4hFvgConfluence"),
  };
})();
