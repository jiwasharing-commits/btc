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

  window.BtcDash.engines.confluence = {
    // Rebuild confluence context.
    rebuildConfluenceContext: proxy("rebuildConfluenceContext"),
    // Build confluence context.
    buildConfluenceContext: proxy("buildConfluenceContext"),
    // Build confluence candidates.
    buildConfluenceCandidates: proxy("buildConfluenceCandidates"),
    // Score confluence.
    deriveConfluenceScore: proxy("deriveConfluenceScore"),
    // Collect confluence zones.
    collectConfluenceZones: proxy("collectConfluenceZones"),
  };
})();
