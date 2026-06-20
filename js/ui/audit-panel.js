(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.ui = window.BtcDash.ui || {};
  window.BtcDash.ui.panels = window.BtcDash.ui.panels || {};

  const sectionMap = [
    ["Data", "dataAudit"],
    ["Running Candle", "runningCandleAudit"],
    ["Context", "contextAudit"],
    ["Score", "scoreAudit"],
    ["Pipeline", "rebuildAudit"],
    ["Overlay", "overlayAudit"],
    ["Autoscale", "autoscaleAudit"],
    ["Market Zones", "marketZoneAudit"],
    ["MTF Guard", "mtfAudit"],
    ["Performance", "performanceAudit"]
  ];

  function getContext() { return window.BtcDash.state?.auditQualityContext || window.BtcDash.engines?.auditQuality?.createEmptyAuditQualityContext?.() || { status: "Not Run", summary: {}, issues: [] }; }
  function buildPanelData(options = {}) { return { context: getContext(), config: window.BtcDash.config?.AUDIT_QUALITY_CONFIG || {} }; }
  function issueClass(issue) { return `audit-issue-item audit-issue-${issue.severity || "info"}`; }
  function renderIssue(issue) { return `<li class="${issueClass(issue)}"><strong>${issue.severity?.toUpperCase?.() || "INFO"}</strong><span>${issue.category || "audit"}</span><p>${issue.message || "Audit issue"}</p>${issue.path ? `<small>${issue.path}</small>` : ""}${issue.suggestion ? `<em>${issue.suggestion}</em>` : ""}</li>`; }
  function renderAuditIssues(container, issues = []) {
    const html = `<ul class="audit-issue-list">${issues.map(renderIssue).join("") || '<li class="audit-issue-item audit-issue-info">No issues in this section.</li>'}</ul>`;
    if (container) container.innerHTML = html;
    return html;
  }
  function renderAuditSummary(container, context = getContext()) {
    const summary = context.summary || {};
    const html = `<section class="audit-summary-card audit-status-${String(context.status || "not-run").toLowerCase().replace(/\s+/g, '-')}"><h3>Audit Quality</h3><strong>${context.status || "Not Run"}</strong><p>${context.message || "Audit not run yet."}</p><div class="audit-debug-meta"><span>Critical: ${summary.criticalCount || 0}</span><span>Warning: ${summary.warningCount || 0}</span><span>Info: ${summary.infoCount || 0}</span><span>Total: ${summary.totalIssues || 0}</span></div><small>Planning context only. Review debug audit before relying on context.</small></section>`;
    if (container) container.innerHTML = html;
    return html;
  }
  function renderAuditSection(container, title, auditData = {}) {
    const html = `<article class="audit-section"><h4>${title}</h4><p>Status: ${auditData.status || "Not Run"}</p><small>Issues: ${(auditData.issues || []).length}</small></article>`;
    if (container) container.innerHTML = html;
    return html;
  }
  function renderEmptyState(container, message = "Audit not run yet.") { const html = `<div class="panel-empty-state">${message}</div>`; if (container) container.innerHTML = html; return html; }
  function renderPanel(container = null, options = {}) {
    const { context } = buildPanelData(options);
    if (!context) return renderEmptyState(container);
    const max = window.BtcDash.config?.AUDIT_QUALITY_CONFIG?.ui?.maxIssuesPerPanel || 12;
    const critical = (context.criticalIssues || []).slice(0, max);
    const warnings = (context.warningIssues || []).slice(0, max);
    const banner = (context.criticalIssues || []).length ? `<div class="audit-critical-banner">${window.BtcDash.config?.AUDIT_QUALITY_CONFIG?.wording?.criticalBanner || "Analysis quality warning — review debug audit before relying on context."}</div>` : "";
    const sections = sectionMap.map(([title, key]) => renderAuditSection(null, title, context[key])).join("");
    const html = `${banner}${renderAuditSummary(null, context)}<div class="audit-section-grid">${sections}</div><h4>Critical Issues</h4>${renderAuditIssues(null, critical)}<h4>Warning Issues</h4>${renderAuditIssues(null, warnings)}<div class="audit-debug-meta"><span>Last run: ${context.lastRunAt || "—"}</span><span>Reason: ${context.lastRunReason || "—"}</span><span>Planning context only.</span></div>`;
    if (container) container.innerHTML = html;
    return html;
  }

  window.BtcDash.ui.panels.audit = { renderPanel, buildPanelData, renderAuditSummary, renderAuditIssues, renderAuditSection, renderEmptyState };
})();
