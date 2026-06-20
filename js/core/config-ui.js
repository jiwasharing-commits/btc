(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.config = window.BtcDash.config || {};

  const DEFAULT_LAYER_STATE = {
    MA: false,
    Structure: false,
    FVG: false,
    "S/R": false,
    "EQH/EQL": false,
    Channel: false,
    Confluence: false,
    "Scenario Levels": false
  };
  const CHART_UI_CONFIG = {
    chartContainerId: "chart",
    debugModalId: "binance-debug-modal",
    planningContextOnly: true
  };
  const UI_MODULE_REGISTRY = {
    summary: "window.BtcDash.ui.renderSummary",
    workspace: "window.BtcDash.ui.renderWorkspace",
    detail: "window.BtcDash.ui.renderDetail"
  };

  Object.assign(window.BtcDash.config, {
    DEFAULT_LAYER_STATE,
    CHART_UI_CONFIG,
    UI_MODULE_REGISTRY
  });
})();
