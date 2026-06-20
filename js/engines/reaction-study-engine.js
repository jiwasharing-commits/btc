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

  window.BtcDash.engines.reactionstudy = {
    // Rebuild reaction study context.
    rebuildReactionStudyContext: proxy("rebuildReactionStudyContext"),
    // Build reaction study context.
    buildReactionStudyContext: proxy("buildReactionStudyContext"),
    // Collect reaction zones.
    collectReactionStudyZones: proxy("collectReactionStudyZones"),
    // Study zone reaction.
    studyZoneReaction: proxy("studyZoneReaction"),
    // Score historical reaction.
    deriveReactionScore: proxy("deriveReactionScore"),
  };
})();
