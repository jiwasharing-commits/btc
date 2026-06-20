(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.ui = window.BtcDash.ui || {};
  window.BtcDash.ui.panels = window.BtcDash.ui.panels || {};

  const labels = { "1W": "Weekly Macro Structure", "1D": "Daily Context Structure", "4H": "4H Setup Structure", "1H": "1H Timing Structure" };
  function lastLabel(context) { return (context?.analysisSwings || context?.analysisLabels || context?.labels || []).at(-1)?.label || "—"; }
  function protectedRef(context) { return context?.protectedHigh?.price || context?.protectedLow?.price || null; }
  function price(value) { return window.BtcDash.ui.formatters?.formatPrice?.(value) || (value ? Number(value).toLocaleString() : "—"); }

  function buildPanelData() {
    const contexts = window.BtcDash.state?.structureContexts || {};
    return Object.keys(labels).map((timeframe) => {
      const context = contexts[timeframe] || {};
      return {
        title: labels[timeframe],
        rows: [
          ["Bias / Status", `${context.bias || "Neutral"} · ${context.status || "No Clear Structure"}`],
          ["Last Label", lastLabel(context)],
          ["BOS / CHoCH", `${context.bosChoch?.type || "None"} · ${context.bosChoch?.confirmation || "None"}`],
          ["Sweep", context.sweepStatus?.hasSweep ? context.sweepStatus.note : "No sweep context"],
          ["Protected Reference", price(protectedRef(context))]
        ]
      };
    });
  }

  function renderEmptyState(container, message = "No pattern summary available.") { const html = `<div class="panel-empty-state">${message}</div>`; if (container) container.innerHTML = html; return html; }
  function renderPanel(container = null) {
    const html = `<section class="compact-panel-card"><h3>Pattern Summary</h3><div class="structure-card-grid">${buildPanelData().map((card) => `<article class="structure-card"><div class="card-label">${card.title}</div><div class="compact-panel-grid">${card.rows.map(([label, value]) => `<div><span>${label}</span><strong>${value || "—"}</strong></div>`).join("")}</div></article>`).join("")}</div><p class="structure-debug-note">Reference only. 1H is timing context and does not override Weekly/Daily bias.</p></section>`;
    if (container) container.innerHTML = html;
    return html;
  }

  window.BtcDash.ui.panels.patternSummary = { renderPanel, buildPanelData, renderEmptyState };
})();
