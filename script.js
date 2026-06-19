(function () {
  function setWorkspace(name) {
    activeWorkspace = name;
    marketZonesContext = buildMarketZonesContext(getActiveTimeframe());
    rebuildConfluenceContext(getActiveTimeframe());
    rebuildScenarioContext(getActiveTimeframe());
    rebuildReactionStudyContext(getActiveTimeframe());
    renderTabs('.workspace-tabs', workspaces, activeWorkspace, 'setWorkspace');
    renderSummary();
    renderWorkspace();
    renderDetail();
  }

  function setDetail(name) {
    activeDetail = name;
    renderTabs('.detail-tabs', details, activeDetail, 'setDetail');
    renderDetail();
  }

  function setRange(range) {
    rangeState[activeWorkspace] = range;
    marketZonesContext = buildMarketZonesContext(getActiveTimeframe());
    rebuildConfluenceContext(getActiveTimeframe());
    rebuildScenarioContext(getActiveTimeframe());
    rebuildReactionStudyContext(getActiveTimeframe());
    renderSummary();
    renderWorkspace();
    renderDetail();
  }

  function bindEventHandlers() {
    qs('#load-data')?.addEventListener('click', () => loadAllRepoData());
    qs('#update-binance')?.addEventListener('click', autoUpdateFromBinance);
    qs('#auto-update')?.addEventListener('click', () => {
      autoUpdateEnabled = !autoUpdateEnabled;
      localStorage.setItem(AUTO_UPDATE_KEY, String(autoUpdateEnabled));
      dataStatusMessage = `Auto Update ${autoUpdateEnabled ? "enabled" : "disabled"}.`;
      renderDataStatus();
    });
    qs('#reset-cache')?.addEventListener('click', async () => {
      clearDataCache();
      dataStatusMessage = "Local candle cache reset. Reloading repo data...";
      await loadAllRepoData();
    });
    qs('.layer-control')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-layer]');
      if (!button) return;
      const layer = button.dataset.layer;
      activeLayers[layer] = !activeLayers[layer];
      button.classList.toggle('active', activeLayers[layer]);
      renderWorkspace();
    });
  }

  async function initDashboard() {
    dataStatusMessage = "Loading repo/cache data...";
    renderAll();
    bindEventHandlers();
    await loadAllRepoData({ runAutoUpdate: autoUpdateEnabled });
  }

  window.setWorkspace = setWorkspace;
  window.setDetail = setDetail;
  window.setRange = setRange;

  window.BtcDash = window.BtcDash || {};
  window.BtcDash.app = { initDashboard, bindEventHandlers, setWorkspace, setDetail, setRange };

  document.addEventListener('DOMContentLoaded', initDashboard);
})();
