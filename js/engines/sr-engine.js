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

  window.BtcDash.engines.sr = {
    // Rebuild all S/R contexts.
    rebuildAllSrContexts: proxy("rebuildAllSrContexts"),
    // Build one S/R context.
    buildSrContext: proxy("buildSrContext"),
    // Build raw S/R levels.
    buildRawSrLevelsFromSwings: proxy("buildRawSrLevelsFromSwings"),
    // Cluster S/R levels.
    clusterSrLevelsIntoZones: proxy("clusterSrLevelsIntoZones"),
    // Derive S/R zone status.
    deriveSrZoneStatus: proxy("deriveSrZoneStatus"),
  };
})();
