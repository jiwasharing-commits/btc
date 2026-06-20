(function () {
  function rebuildActiveAnalysis(reason) {
    if (window.BtcDash?.pipeline?.rebuildForTimeframe) {
      window.BtcDash.pipeline.rebuildForTimeframe(getActiveTimeframe(), { reason, render: false });
      return;
    }
    marketZonesContext = buildMarketZonesContext(getActiveTimeframe());
    rebuildConfluenceContext(getActiveTimeframe());
    rebuildScenarioContext(getActiveTimeframe());
    rebuildReactionStudyContext(getActiveTimeframe());
  }

  function setWorkspace(name) {
    activeWorkspace = name;
    rebuildActiveAnalysis("workspace-change");
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
    rebuildActiveAnalysis("range-change");
    renderSummary();
    renderWorkspace();
    renderDetail();
  }

  function bindEventHandlers() {
    ensureBinanceDebugModal();
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
      const enabled = !activeLayers[layer];
      window.BtcDash.chart?.setLayerState?.(layer, enabled);
      activeLayers[layer] = enabled;
      button.classList.toggle('active', activeLayers[layer]);
      renderWorkspace();
    });
  }

  function ensureBinanceDebugModal() {
    if (!qs('#binance-debug-button')) {
      const button = document.createElement('button');
      button.id = 'binance-debug-button';
      button.type = 'button';
      button.className = 'ghost';
      button.textContent = 'Binance Debug';
      qs('#reset-cache')?.insertAdjacentElement('afterend', button);
      button.addEventListener('click', () => {
        renderBinanceDebug();
        qs('#binance-debug-modal')?.classList.add('open');
      });
    }
    if (!qs('#binance-debug-modal')) {
      const modal = document.createElement('div');
      modal.id = 'binance-debug-modal';
      modal.className = 'debug-modal';
      modal.innerHTML = `<div class="debug-modal-card"><button type="button" class="debug-modal-close" aria-label="Close Binance Debug">×</button><div id="binance-debug-modal-body" class="binance-debug"></div></div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', (event) => {
        if (event.target === modal || event.target.closest('.debug-modal-close')) modal.classList.remove('open');
      });
    }
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
  window.BtcDash.app = { initDashboard, bindEventHandlers, setWorkspace, setDetail, setRange, ensureBinanceDebugModal, rebuildActiveAnalysis };

  document.addEventListener('DOMContentLoaded', initDashboard);
})();
