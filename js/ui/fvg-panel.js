(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.ui = window.BtcDash.ui || {};
  window.BtcDash.ui.panels = window.BtcDash.ui.panels || {};

  const tfs = ["1W", "1D", "4H", "1H"];
  function price(value) { return window.BtcDash.ui.formatters?.formatPrice?.(value) || (Number.isFinite(Number(value)) ? Number(value).toLocaleString() : "—"); }
  function zone(fvg) { return fvg ? `${price(fvg.zoneLow ?? fvg.lowerBound)}–${price(fvg.zoneHigh ?? fvg.upperBound)} · ${fvg.status} · ${fvg.score ?? "—"}` : "—"; }

  function buildPanelData() {
    return tfs.map((timeframe) => {
      const c = window.BtcDash.state?.fvgContexts?.[timeframe] || {};
      const visible = c.visibleRightExtendedFvgs || c.visibleBoxFvgs || c.visibleBoundaryFvgs || [];
      const bullishBelow = visible.filter((fvg) => fvg.direction === "bullish" && fvg.relationToPrice === "belowPrice").length;
      const bearishAbove = visible.filter((fvg) => fvg.direction === "bearish" && fvg.relationToPrice === "abovePrice").length;
      const inside = visible.filter((fvg) => fvg.relationToPrice === "inside" || fvg.status === "inside")[0] || c.currentReactionFvg;
      const fallbackCount = visible.filter((fvg) => fvg.visibleByNearestFallback).length;
      return {
        timeframe,
        context: c,
        rows: [
          ["Raw / Valid / Visible Box", `${c.rawFvgs?.length || 0} / ${c.validFvgs?.length || 0} / ${visible.length}`],
          ["Bullish Below / Bearish Above", `${bullishBelow} / ${bearishAbove}`],
          ["Current Inside FVG", zone(inside)],
          ["Nearest Bullish", zone(c.nearestBullishFvg)],
          ["Nearest Bearish", zone(c.nearestBearishFvg)],
          ["Active B/B", `${c.activeBullish?.length || 0} / ${c.activeBearish?.length || 0}`],
          ["Hidden Mitigated / Filled / Historical", `${c.mitigatedFvgs?.length || 0} / ${c.filledFvgs?.length || 0} / ${c.historicalFvgs?.length || 0}`],
          ["1H Fallback / Suppressed", `${fallbackCount} / ${c.suppressedFvgs?.length || 0}`]
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
    const html = `<section class="compact-panel-card"><h3>FVG Right-Extended Box Context</h3><p class="zone-reference-note">Active unfilled FVG references render as right-extended boxes. Hidden after mitigation/fill. Planning context only.</p><div class="fvg-card-grid">${buildPanelData().map((item) => `<article class="fvg-card"><div class="card-label">${item.timeframe} ${item.context.role || "context"}</div><strong>${item.context.status || "No Clear FVG"}</strong><div class="compact-panel-grid">${item.rows.map(([label, value]) => `<div><span>${label}</span><strong>${value || "—"}</strong></div>`).join("")}</div><small class="fvg-debug-summary">${item.context.summary || "Reference only."}</small></article>`).join("")}</div></section>`;
    if (container) container.innerHTML = html;
    return html;
  }

  window.BtcDash.ui.panels.fvg = { renderPanel, buildPanelData, renderEmptyState };
})();
