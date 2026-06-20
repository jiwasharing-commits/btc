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

  window.BtcDash.engines.structure = {
    // Rebuild all structure contexts.
    rebuildAllStructureContexts: proxy("rebuildAllStructureContexts"),
    // Build one structure context.
    buildMarketStructureContext: proxy("buildMarketStructureContext"),
    // Detect swing points.
    detectSwingPoints: proxy("detectSwingPoints"),
    // Classify HH/HL/LH/LL.
    classifySwingLabels: proxy("classifySwingLabels"),
    // Derive structure bias.
    deriveStructureBias: proxy("deriveStructureBias"),
    // Derive BOS/CHoCH.
    deriveBosChoch: proxy("deriveBosChoch"),
  };
})();
