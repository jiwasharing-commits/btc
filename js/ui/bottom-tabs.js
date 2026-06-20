(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.ui = window.BtcDash.ui || {};
  window.BtcDash.ui.panels = window.BtcDash.ui.panels || {};
  function setActiveBottomTab(tab) { if (typeof window.setDetail === "function") window.setDetail(tab); else if (window.BtcDash.state) window.BtcDash.state.activeDetail = tab; return window.BtcDash.state?.activeDetail; }
  function renderBottomTabs() { return window.BtcDash.ui?.renderTabs?.('.detail-tabs', window.BtcDash.config?.details || [], window.BtcDash.state?.activeDetail, 'setDetail'); }
  function renderActiveBottomTab() { return window.BtcDash.ui?.renderDetail?.(); }
  function bindBottomTabs() { return true; }
  window.BtcDash.ui.panels.bottomTabs = { renderBottomTabs, bindBottomTabs, setActiveBottomTab, renderActiveBottomTab };
})();
