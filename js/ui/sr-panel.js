(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.ui = window.BtcDash.ui || {};
  window.BtcDash.ui.panels = window.BtcDash.ui.panels || {};
  const timeframes = ["1W", "1D", "4H", "1H"];
  function price(v) { return window.BtcDash.ui.formatters?.formatPrice?.(v) || (v ? Number(v).toLocaleString() : "—"); }
  function zoneLabel(z) { return z ? `${price(z.zoneLow)}–${price(z.zoneHigh)} · ${z.status}` : "—"; }
  function buildPanelData() { return timeframes.map((tf) => { const c = window.BtcDash.state?.srContexts?.[tf] || {}; return { timeframe: tf, context: c, rows: [["Nearest Support", zoneLabel(c.nearestSupport)], ["Nearest Resistance", zoneLabel(c.nearestResistance)], ["Strongest Support", zoneLabel(c.strongestSupport)], ["Strongest Resistance", zoneLabel(c.strongestResistance)], ["Active S/R", `${c.activeSupports?.length || 0} / ${c.activeResistances?.length || 0}`], ["Reaction / Flip", `${c.currentReactionZones?.length || 0} / ${c.flippedZones?.length || 0}`], ["Swept / Broken / Historical", `${c.sweptZones?.length || 0} / ${c.brokenZones?.length || 0} / ${c.historicalZones?.length || 0}`], ["Rows", c.marketZoneRows?.length || 0]] }; }); }
  function renderEmptyState(container, message = "No S/R data available.") { const html = `<div class="panel-empty-state">${message}</div>`; if (container) container.innerHTML = html; return html; }
  function renderPanel(container = null) { const html = `<section class="compact-panel-card"><h3>S/R V2.1</h3><p class="zone-reference-note">S/R zones are structural reference areas, not exact price signals. Planning context only.</p><div class="structure-card-grid">${buildPanelData().map((item) => `<article class="sr-card"><div class="card-label">${item.timeframe} ${item.context.role || "context"}</div><strong>${item.context.status || "No Clear S/R"}</strong><div class="compact-panel-grid">${item.rows.map(([a,b]) => `<div><span>${a}</span><strong>${b || "—"}</strong></div>`).join("")}</div><small>${item.context.summary || "Reference only."}</small></article>`).join("")}</div></section>`; if (container) container.innerHTML = html; return html; }
  window.BtcDash.ui.panels.sr = { renderPanel, buildPanelData, renderEmptyState };
})();
