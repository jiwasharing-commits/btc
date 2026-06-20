(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.ui = window.BtcDash.ui || {};
  window.BtcDash.ui.panels = window.BtcDash.ui.panels || {};

  function buildPanelData(options = {}) {
    const ctx = window.BtcDash.state?.marketZonesContext || {}; return { title: "Market Zones", rows: [{ label: "Upside", value: (ctx.upside || []).slice(0,3).map((x) => x.label).join(" · ") || "No upside watch" }, { label: "Downside", value: (ctx.downside || []).slice(0,3).map((x) => x.label).join(" · ") || "No downside watch" }] };
  }

  function renderEmptyState(container, message = window.BtcDash.config?.UI_PANEL_CONFIG?.emptyStateText || "No data available.") {
    const html = `<div class="panel-empty-state">${message}</div>`;
    if (container) container.innerHTML = html;
    return html;
  }

  function renderPanel(container = null, options = {}) {
    const data = buildPanelData(options);
    if (!data?.rows?.length) return renderEmptyState(container);
    const html = `<section class="compact-panel-card"><h3>${data.title}</h3><div class="compact-panel-grid">${data.rows.map((row) => `<div><span>${row.label}</span><strong>${row.value || "—"}</strong></div>`).join("")}</div></section>`;
    if (container) container.innerHTML = html;
    return html;
  }

  window.BtcDash.ui.panels.marketZones = { renderPanel, buildPanelData, renderEmptyState };
})();
