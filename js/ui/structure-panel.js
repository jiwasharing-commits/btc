(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.ui = window.BtcDash.ui || {};
  window.BtcDash.ui.panels = window.BtcDash.ui.panels || {};

  const timeframes = ["1W", "1D", "4H", "1H"];
  const labelMap = { "1W": "Weekly Macro Structure", "1D": "Daily Context Structure", "4H": "4H Setup Structure", "1H": "1H Timing Structure" };
  const fmt = () => window.BtcDash.ui.formatters || {};
  function price(value) { return fmt().formatPrice ? fmt().formatPrice(value) : (value ? Number(value).toLocaleString() : "—"); }
  function sequence(context) { return (context?.sequence || []).slice(-8).map((item) => typeof item === "string" ? item : item.label).filter(Boolean).join(" → ") || "No clear sequence"; }

  function buildPanelData() {
    const contexts = window.BtcDash.state?.structureContexts || {};
    return timeframes.map((timeframe) => {
      const context = contexts[timeframe] || window.BtcDash.engines?.structure?.createEmptyStructureContext?.(timeframe);
      return {
        timeframe,
        title: labelMap[timeframe],
        context,
        rows: [
          ["Bias / Trend", `${context?.bias || "Neutral"} · ${context?.trendState || "Unknown"}`],
          ["Raw Pivots", context?.rawPivots?.length ?? 0],
          ["Internal / Major", `${context?.internalSwings?.length || 0} / ${context?.majorSwings?.length || 0}`],
          ["Display Labels", context?.displaySwings?.length || context?.labels?.length || 0],
          ["BOS / CHoCH", `${context?.bosChoch?.type || "None"} · ${context?.bosChoch?.confirmation || "None"}`],
          ["Sweep", context?.sweepStatus?.hasSweep ? `${context.sweepStatus.direction} sweep @ ${price(context.sweepStatus.sweptLevel)}` : "No sweep context"],
          ["Protected High", price(context?.protectedHigh?.price)],
          ["Protected Low", price(context?.protectedLow?.price)],
          ["Sequence", sequence(context)]
        ]
      };
    });
  }

  function renderEmptyState(container, message = "No structure data available.") {
    const html = `<div class="panel-empty-state">${message}</div>`;
    if (container) container.innerHTML = html;
    return html;
  }

  function renderPanel(container = null) {
    const data = buildPanelData();
    if (!data.length) return renderEmptyState(container);
    const html = `<section class="compact-panel-card structure-v2-panel"><h3>Market Structure V2</h3><p class="structure-debug-note">Raw Pivot is not structure. HH/HL/LH/LL labels are assigned only after structural filters and confirmed pivot delay. Planning context only.</p><div class="structure-card-grid">${data.map((item) => `<article class="structure-card"><div class="card-label">${item.title}</div><span class="structure-layer-badge">${item.context?.role || "context"}</span><div class="compact-panel-grid">${item.rows.map(([label, value]) => `<div><span>${label}</span><strong>${value || "—"}</strong></div>`).join("")}</div><small>${item.context?.summary || "Reference only."}</small></article>`).join("")}</div></section>`;
    if (container) container.innerHTML = html;
    return html;
  }

  window.BtcDash.ui.panels.structure = { renderPanel, buildPanelData, renderEmptyState };
})();
