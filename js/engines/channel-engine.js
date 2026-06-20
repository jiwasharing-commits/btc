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

  window.BtcDash.engines.channel = {
    // Rebuild all channel contexts.
    rebuildAllChannelContexts: proxy("rebuildAllChannelContexts"),
    // Build one channel context.
    buildChannelContext: proxy("buildChannelContext"),
    // Project channel at time.
    projectChannelAtTime: proxy("projectChannelAtTime"),
    // Resolve HTF channel projections.
    getProjectedChannelContextsForActiveTimeframe: proxy("getProjectedChannelContextsForActiveTimeframe"),
  };
})();
