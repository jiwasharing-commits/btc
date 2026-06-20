(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.ui = window.BtcDash.ui || {};
  window.BtcDash.ui.panels = window.BtcDash.ui.panels || {};
  function buildSummaryCardData() {
    const state = window.BtcDash.state || {};
    const tf = window.BtcDash.utils?.getActiveTimeframe?.() || "1W";
    const last = state.marketData?.[tf]?.at(-1);
    return [
      { title: "Current Price", value: window.BtcDash.ui.formatters?.formatPrice(last?.close), note: "Closed candle" },
      { title: "Structure", value: state.structureContexts?.[tf]?.bias || "Unavailable", note: state.structureContexts?.[tf]?.status || "Planning context only" },
      { title: "Confluence", value: state.confluenceContext?.strongestCandidate ? `${state.confluenceContext.strongestCandidate.score}/10` : "No Candidate", note: state.confluenceContext?.summary || "Reference only" },
      { title: "Scenario", value: state.scenarioContext?.primaryScenario?.label || "No Scenario", note: state.scenarioContext?.summary || "Planning context only" }
    ];
  }
  function renderSummaryCard(card) { return `<article class="summary-card"><span>${card.title}</span><strong>${card.value || "—"}</strong><small>${card.note || ""}</small></article>`; }
  function renderGlobalSummaryCards() { return buildSummaryCardData().map(renderSummaryCard).join(""); }
  window.BtcDash.ui.panels.summaryCards = { renderGlobalSummaryCards, buildSummaryCardData, renderSummaryCard };
})();
