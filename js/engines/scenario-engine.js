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

  window.BtcDash.engines.scenario = {
    // Rebuild scenario context.
    rebuildScenarioContext: proxy("rebuildScenarioContext"),
    // Build scenario context.
    buildScenarioContext: proxy("buildScenarioContext"),
    // Build bullish scenario.
    buildBullishScenario: proxy("buildBullishScenario"),
    // Build bearish scenario.
    buildBearishScenario: proxy("buildBearishScenario"),
    // Build breakout scenario.
    buildBreakoutScenario: proxy("buildBreakoutScenario"),
    // Build breakdown scenario.
    buildBreakdownScenario: proxy("buildBreakdownScenario"),
    // Build wait scenario.
    buildWaitScenario: proxy("buildWaitScenario"),
  };
})();
