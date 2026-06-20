(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.ui = window.BtcDash.ui || {};
  window.BtcDash.ui.panels = window.BtcDash.ui.panels || {};
  function normalize(layer) { return window.BtcDash.chart?.normalizeLayerKey?.(layer) || String(layer || "").trim().toLowerCase(); }
  const labels = { ma: "MA", structure: "Structure", sr: "S/R", fvg: "FVG", liquidity: "EQH/EQL", channel: "Channel", confluence: "Confluence", scenario: "Scenario Levels" };
  function setLayerEnabled(layer, enabled) { return window.BtcDash.chart?.setLayerState?.(normalize(layer), enabled, { reason: "layer-toggle" }); }
  function getLayerEnabled(layer) { return Boolean(window.BtcDash.state?.chartRuntime?.layerState?.[normalize(layer)]); }
  function syncLayerControls() { return window.BtcDash.chart?.syncLayerControlsToState?.(); }
  function renderLayerControls() { document.querySelectorAll?.('.layer-control [data-layer]')?.forEach((button) => { const key = normalize(button.dataset.layer || button.textContent); button.dataset.layer = key; button.classList.toggle('active', getLayerEnabled(key)); button.textContent = labels[key] || button.textContent; }); return true; }
  function bindLayerControls() { return true; }
  window.BtcDash.ui.panels.layerControls = { renderLayerControls, bindLayerControls, setLayerEnabled, getLayerEnabled, syncLayerControls, normalizeLayerKey: normalize };
})();
