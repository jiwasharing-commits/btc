(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.config = window.BtcDash.config || {};

  const ENGINE_MODULE_NAMES = [
    "structure",
    "sr",
    "fvg",
    "channel",
    "marketZones",
    "confluence",
    "scenario",
    "riskPlan",
    "reactionStudy"
  ];
  const ENGINE_PIPELINE_ORDER = [
    "Data Ready",
    "Structure",
    "S/R",
    "FVG",
    "Channel",
    "Market Zones Base",
    "Confluence",
    "Scenario",
    "Risk",
    "Reaction",
    "Market Zones Enriched",
    "UI Render"
  ];
  const FUTURE_ENGINE_FLAGS = {
    liquidity: false,
    regime: false,
    volumeReaction: false,
    auditQuality: false,
    outcomeStudy: false
  };

  Object.assign(window.BtcDash.config, {
    ENGINE_MODULE_NAMES,
    ENGINE_PIPELINE_ORDER,
    FUTURE_ENGINE_FLAGS
  });
})();
