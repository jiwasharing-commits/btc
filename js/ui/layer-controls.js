(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.ui = window.BtcDash.ui || {};
  window.BtcDash.ui.panels = window.BtcDash.ui.panels || {};
  const map = { ma: "MA", structure: "Structure", sr: "S/R", fvg: "FVG", liquidity: "EQH/EQL", channel: "Channel", confluence: "Confluence", scenario: "Scenario Levels" };
  function setLayerEnabled(layer, enabled) { return window.BtcDash.chart?.setLayerState?.(layer, enabled); }
  function getLayerEnabled(layer) { const canonical = map[layer] ? layer : Object.entries(map).find(([, legacy]) => legacy === layer)?.[0] || layer; return Boolean(window.BtcDash.state?.chartRuntime?.layerState?.[canonical]); }
  function syncLayerControls() { return window.BtcDash.chart?.syncLayerControlsToState?.(); }
  function renderLayerControls() { return window.BtcDash.ui?.renderLayerControls?.(); }
  function bindLayerControls() { return true; }
  window.BtcDash.ui.panels.layerControls = { renderLayerControls, bindLayerControls, setLayerEnabled, getLayerEnabled, syncLayerControls };
})();
