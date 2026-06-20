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

  window.BtcDash.engines.riskplan = {
    // Build scenario risk plan.
    buildScenarioRiskPlan: proxy("buildScenarioRiskPlan"),
    // Derive watch area.
    deriveScenarioWatchArea: proxy("deriveScenarioWatchArea"),
    // Derive invalidation reference.
    deriveScenarioInvalidation: proxy("deriveScenarioInvalidation"),
    // Derive target ladder.
    deriveScenarioTargetLadder: proxy("deriveScenarioTargetLadder"),
    // Calculate RR reference.
    calculateRiskReward: proxy("calculateRiskReward"),
  };
})();
