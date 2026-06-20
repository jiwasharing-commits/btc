(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.ui = window.BtcDash.ui || {};
  window.BtcDash.ui.panels = window.BtcDash.ui.panels || {};
  const labels = { "1W": "Weekly Macro", "1D": "Daily Context", "4H": "4H Setup", "1H": "1H Timing" };
  function price(v) { return window.BtcDash.ui.formatters?.formatPrice?.(v) || (v ? Number(v).toLocaleString() : "—"); }
  function lastLabel(c) { return (c?.analysisSwings || c?.analysisLabels || c?.labels || []).at(-1)?.label || "—"; }
  function lqText(c) { if (!c?.available) return "No clear liquidity"; return `Buy-side ${price(c.nearestBuySideLiquidity?.centerPrice)} · Sell-side ${price(c.nearestSellSideLiquidity?.centerPrice)}${c.currentSweep ? ` · Sweep ${c.currentSweep.type}` : ""}`; }
  function srText(c) { if (!c?.available) return "No clear S/R"; return `Support ${price(c.nearestSupport?.centerPrice)} · Resistance ${price(c.nearestResistance?.centerPrice)}${c.flippedZones?.[0] ? " · Flip reference" : ""}`; }
  function buildPanelData() { const state = window.BtcDash.state || {}; return Object.keys(labels).map((tf) => { const st = state.structureContexts?.[tf] || {}; return { title: labels[tf], rows: [["Structure", `${st.bias || "Neutral"} · Last ${lastLabel(st)}`], ["BOS / Sweep", `${st.bosChoch?.type || "None"} · ${st.sweepStatus?.hasSweep ? "Sweep Context" : "No sweep"}`], ["Liquidity", lqText(state.liquidityContexts?.[tf])], ["S/R", srText(state.srContexts?.[tf])]] }; }); }
  function renderEmptyState(container, message = "No pattern summary available.") { const html = `<div class="panel-empty-state">${message}</div>`; if (container) container.innerHTML = html; return html; }
  function renderPanel(container = null) { const html = `<section class="compact-panel-card"><h3>Pattern Summary</h3><div class="structure-card-grid">${buildPanelData().map((card) => `<article class="structure-card"><div class="card-label">${card.title}</div><div class="compact-panel-grid">${card.rows.map(([label, value]) => `<div><span>${label}</span><strong>${value || "—"}</strong></div>`).join("")}</div></article>`).join("")}</div><p class="structure-debug-note">Reference only. 1H is timing context and does not override Weekly/Daily bias.</p></section>`; if (container) container.innerHTML = html; return html; }
  window.BtcDash.ui.panels.patternSummary = { renderPanel, buildPanelData, renderEmptyState };
})();
