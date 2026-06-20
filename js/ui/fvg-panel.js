(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.ui = window.BtcDash.ui || {};
  window.BtcDash.ui.panels = window.BtcDash.ui.panels || {};

  const tfs = ["1W", "1D", "4H", "1H"];
  function price(value) { return window.BtcDash.ui.formatters?.formatPrice?.(value) || (Number.isFinite(Number(value)) ? Number(value).toLocaleString() : "—"); }
  function zone(fvg) { return fvg ? `${price(fvg.zoneLow)}–${price(fvg.zoneHigh)} · ${fvg.status} · ${fvg.score ?? "—"}` : "—"; }

  function buildPanelData() {
    return tfs.map((timeframe) => {
      const c = window.BtcDash.state?.fvgContexts?.[timeframe] || {};
      return {
        timeframe,
        context: c,
        rows: [
          ["Raw / Valid / Visible", `${c.rawFvgs?.length || 0} / ${c.validFvgs?.length || 0} / ${c.visibleBoundaryFvgs?.length || 0}`],
          ["Nearest Bullish", zone(c.nearestBullishFvg)],
          ["Nearest Bearish", zone(c.nearestBearishFvg)],
          ["Current Reaction", zone(c.currentReactionFvg)],
          ["Active B/B", `${c.activeBullish?.length || 0} / ${c.activeBearish?.length || 0}`],
          ["Touched / Partial / Mid", `${c.touchedFvgs?.length || 0} / ${c.partialFvgs?.length || 0} / ${c.midpointTouchedFvgs?.length || 0}`],
          ["Mitigated / Filled / Historical", `${c.mitigatedFvgs?.length || 0} / ${c.filledFvgs?.length || 0} / ${c.historicalFvgs?.length || 0}`],
          ["Projected / Merged / Suppressed", `${c.projectedFvgs?.length || 0} / ${c.mergedFvgs?.length || 0} / ${c.suppressedFvgs?.length || 0}`]
        ]
      };
    });
  }

  function renderEmptyState(container, message = "No FVG data available.") {
    const html = `<div class="panel-empty-state">${message}</div>`;
    if (container) container.innerHTML = html;
    return html;
  }

  function renderPanel(container = null) {
    const html = `<section class="compact-panel-card"><h3>FVG Boundary Context</h3><p class="zone-reference-note">Only active/relevant FVG boundaries are intended for chart display. Filled, mitigated, and historical FVG remain table/reference context only. Planning context only.</p><div class="fvg-card-grid">${buildPanelData().map((item) => `<article class="fvg-card"><div class="card-label">${item.timeframe} ${item.context.role || "context"}</div><strong>${item.context.status || "No Clear FVG"}</strong><div class="compact-panel-grid">${item.rows.map(([label, value]) => `<div><span>${label}</span><strong>${value || "—"}</strong></div>`).join("")}</div><small class="fvg-debug-summary">${item.context.summary || "Reference only."}</small></article>`).join("")}</div></section>`;
    if (container) container.innerHTML = html;
    return html;
  }

  window.BtcDash.ui.panels.fvg = { renderPanel, buildPanelData, renderEmptyState };
})();
