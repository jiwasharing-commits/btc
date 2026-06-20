(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.ui = window.BtcDash.ui || {};
  window.BtcDash.ui.panels = window.BtcDash.ui.panels || {};
  function getActiveWorkspace() { return window.BtcDash.state?.activeWorkspace || "Weekly Map"; }
  function setActiveWorkspace(workspace) { if (typeof window.setWorkspace === "function") window.setWorkspace(workspace); else if (window.BtcDash.state) window.BtcDash.state.activeWorkspace = workspace; return getActiveWorkspace(); }
  function renderWorkspaceTabs() { return window.BtcDash.ui?.renderTabs?.('.workspace-tabs', window.BtcDash.config?.workspaces || [], getActiveWorkspace(), 'setWorkspace'); }
  function bindWorkspaceTabs() { return true; }
  window.BtcDash.ui.panels.workspaceTabs = { renderWorkspaceTabs, bindWorkspaceTabs, setActiveWorkspace, getActiveWorkspace };
})();
