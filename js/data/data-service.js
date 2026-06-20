async function fetchCandles(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load ${path}`);
  const payload = await response.json();
  return Array.isArray(payload.candles) ? payload.candles : [];
}

function normalizeCandles(candles) {
  const unique = new Map();
  candles.forEach((candle) => {
    const openTime = Number(candle.open_time ?? new Date(candle.time).getTime());
    if (!Number.isFinite(openTime)) return;
    unique.set(openTime, {
      ...candle,
      open_time: openTime,
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
      volume: Number(candle.volume ?? 0)
    });
  });
  return [...unique.values()].sort((a, b) => a.open_time - b.open_time);
}
async function loadRepoData() {
  const repoData = { "1W": [], "1D": [], "4H": [], "1H": [] };
  await Promise.all(Object.keys(DATA_FILES).map(async (timeframe) => {
    const files = Array.isArray(DATA_FILES[timeframe]) ? DATA_FILES[timeframe] : [DATA_FILES[timeframe]];
    const candlesByFile = await Promise.all(files.map(fetchCandles));
    repoData[timeframe] = normalizeCandles(candlesByFile.flat());
  }));
  return repoData;
}

function readJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function loadCacheData() {
  const cachedData = readJsonStorage(DATA_CACHE_KEY, null);
  const cachedRunning = readJsonStorage(RUNNING_CACHE_KEY, null);
  cacheMeta = readJsonStorage(CACHE_META_KEY, null);
  Object.keys(runningCandles).forEach((timeframe) => {
    runningCandles[timeframe] = cachedRunning?.[timeframe] ?? null;
  });
  return cachedData;
}

function applyRepoAndCache(repoData, cachedData) {
  Object.keys(marketData).forEach((timeframe) => {
    marketData[timeframe] = mergeCandles(repoData[timeframe], cachedData?.[timeframe] ?? []);
  });
}

function saveCacheData(updateSummary = null) {
  try {
    localStorage.setItem(DATA_CACHE_KEY, JSON.stringify(marketData));
    localStorage.setItem(RUNNING_CACHE_KEY, JSON.stringify(runningCandles));
    cacheMeta = { source: "repo_plus_binance_runtime_merge", updated_at: new Date().toISOString(), updateSummary };
    localStorage.setItem(CACHE_META_KEY, JSON.stringify(cacheMeta));
  } catch (error) {
    dataStatusMessage = "Cache save failed. Data is still available for this session.";
  }
}

function clearDataCache() {
  localStorage.removeItem(DATA_CACHE_KEY);
  localStorage.removeItem(RUNNING_CACHE_KEY);
  localStorage.removeItem(CACHE_META_KEY);
  cacheMeta = null;
  Object.keys(runningCandles).forEach((timeframe) => { runningCandles[timeframe] = null; });
}

function rebuildAnalysisAfterData(reason, render = false) {
  if (window.BtcDash?.pipeline?.rebuildAllAnalysis) {
    window.BtcDash.pipeline.rebuildAllAnalysis({ reason, activeTimeframe: getActiveTimeframe(), render });
    return;
  }
  rebuildAllStructureContexts();
  rebuildAllSrContexts();
  rebuildAllFvgContexts();
  rebuildAllChannelContexts();
  marketZonesContext = buildMarketZonesContext(getActiveTimeframe());
  rebuildConfluenceContext(getActiveTimeframe());
  rebuildScenarioContext(getActiveTimeframe());
  rebuildReactionStudyContext(getActiveTimeframe());
}

async function loadAllRepoData({ runAutoUpdate = autoUpdateEnabled } = {}) {
  loading = true;
  loadError = "";
  dataStatusMessage = "Loading repo/cache data...";
  renderAll();
  try {
    const repoData = await loadRepoData();
    const cachedData = loadCacheData();
    applyRepoAndCache(repoData, cachedData);
    rebuildAnalysisAfterData("repo-data-load", false);
    dataStatusMessage = cachedData ? "Repo data loaded and merged with local cache." : "Repo data loaded.";
    loading = false;
    renderAll();
    if (runAutoUpdate) await autoUpdateFromBinance();
  } catch (error) {
    loadError = error.message;
    dataStatusMessage = "Repo/cache data load failed.";
    loading = false;
    renderAll();
  }
}

function binanceRowToCandle(row) {
  const openTime = Number(row[0]);
  const closeTime = Number(row[6]);
  return {
    time: new Date(openTime).toISOString(),
    open_time: openTime,
    close_time: closeTime,
    close_time_iso: new Date(closeTime).toISOString(),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
    quote_volume: Number(row[7]),
    trades: Number(row[8]),
    taker_buy_base_volume: Number(row[9]),
    taker_buy_quote_volume: Number(row[10])
  };
}

async function fetchBinanceKlinesWithFallback(timeframe, startTime, endTime) {
  const interval = BINANCE_INTERVALS[timeframe];
  const errors = [];

  for (const baseUrl of BINANCE_BASE_URLS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const params = new URLSearchParams({ symbol: BINANCE_SYMBOL, interval, startTime: String(startTime), limit: "1000" });
      if (endTime) params.set("endTime", String(endTime));
      const response = await fetch(`${baseUrl}/api/v3/klines?${params.toString()}`, { signal: controller.signal });
      const bodyText = await response.text();
      if (!response.ok) {
        let reason = bodyText;
        try { reason = JSON.parse(bodyText).msg ?? bodyText; } catch (error) {}
        throw new Error(`${response.status} ${reason}`.trim());
      }
      const rows = JSON.parse(bodyText);
      if (!Array.isArray(rows)) throw new Error("Unexpected Binance response");
      return { rows, endpoint: baseUrl };
    } catch (error) {
      const reason = error.name === "AbortError" ? "timeout after 10s" : error.message;
      errors.push(`${baseUrl}: ${reason}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new Error(`${timeframe} Binance failed on all endpoints: ${errors.join(" / ")}`);
}

async function fetchMissingBinanceCandles(timeframe) {
  const last = marketData[timeframe]?.at(-1);
  if (!last) return { candles: [], fetchedRows: 0, endpoint: "—", requestStartTime: null, lastLocalClose: null };

  const intervalMs = BINANCE_INTERVAL_MS[timeframe];
  let startTime = Number(last.close_time ?? last.open_time) + 1;
  const requestStartTime = startTime;
  const allCandles = [];
  let fetchedRows = 0;
  let endpoint = "—";
  let guard = 0;

  while (startTime <= Date.now() && guard < 25) {
    guard += 1;
    const { rows, endpoint: endpointUsed } = await fetchBinanceKlinesWithFallback(timeframe, startTime);
    endpoint = endpointUsed;
    fetchedRows += rows.length;
    if (!rows.length) break;
    allCandles.push(...rows.map(binanceRowToCandle));
    const lastOpenTime = Number(rows.at(-1)?.[0]);
    const nextStartTime = lastOpenTime + intervalMs;
    if (rows.length < 1000 || !Number.isFinite(nextStartTime) || nextStartTime <= startTime) break;
    startTime = nextStartTime;
  }

  return { candles: allCandles, fetchedRows, endpoint, requestStartTime, lastLocalClose: last.close_time ?? last.open_time };
}

function splitClosedAndRunning(candles) {
  const now = Date.now();
  const closed = [];
  let running = null;
  candles.forEach((candle) => {
    if (Number(candle.close_time) <= now) closed.push(candle);
    else running = candle;
  });
  return { closed, running };
}

async function updateSingleTimeframeFromBinance(timeframe) {
  const result = await fetchMissingBinanceCandles(timeframe);
  const { closed, running } = splitClosedAndRunning(result.candles);
  const beforeCount = marketData[timeframe].length;
  marketData[timeframe] = mergeCandles(marketData[timeframe], closed);
  const addedClosed = marketData[timeframe].length - beforeCount;
  runningCandles[timeframe] = running;

  const debug = {
    lastLocalClose: result.lastLocalClose,
    requestStartTime: result.requestStartTime,
    fetchedRows: result.fetchedRows,
    addedClosed,
    running: Boolean(running),
    endpoint: result.endpoint
  };
  binanceDebug[timeframe] = debug;
  console.info("[Binance Update]", timeframe, debug);
  return debug;
}

async function autoUpdateFromBinance() {
  dataStatusMessage = "Auto updating from Binance...";
  renderDataStatus();
  renderBinanceDebug();
  const updateSummary = {};

  for (const timeframe of ["1W", "1D", "4H", "1H"]) {
    try {
      updateSummary[timeframe] = await updateSingleTimeframeFromBinance(timeframe);
    } catch (error) {
      updateSummary[timeframe] = { error: error.message };
      binanceDebug[timeframe] = { error: error.message };
      console.info("[Binance Update]", timeframe, { error: error.message });
    }
    renderAll();
  }

  rebuildAllStructureContexts();
  rebuildAllSrContexts();
  rebuildAllFvgContexts();
  rebuildAllChannelContexts();
  marketZonesContext = buildMarketZonesContext(getActiveTimeframe());
  rebuildConfluenceContext(getActiveTimeframe());
  rebuildScenarioContext(getActiveTimeframe());
  rebuildReactionStudyContext(getActiveTimeframe());
  const entries = Object.entries(updateSummary);
  const successEntries = entries.filter(([, result]) => !result.error);
  const totalAdded = successEntries.reduce((sum, [, result]) => sum + (result.addedClosed ?? 0), 0);

  if (successEntries.length) {
    saveCacheData(updateSummary);
    dataStatusMessage = totalAdded
      ? `Binance update finished: 1W ${updateSummary["1W"]?.addedClosed ?? 0} new, 1D ${updateSummary["1D"]?.addedClosed ?? 0} new, 4H ${updateSummary["4H"]?.addedClosed ?? 0} new, 1H ${updateSummary["1H"]?.addedClosed ?? 0} new`
      : "Binance update finished: no new closed candles";
  } else {
    const reason = entries.map(([tf, result]) => `${tf}: ${result.error}`).join(" | ");
    dataStatusMessage = `Binance update failed. Using repo/cache data. Reason: ${reason}`;
  }

  renderAll();
}

window.BtcDash = window.BtcDash || {};
window.BtcDash.dataService = {
  fetchCandles,
  normalizeCandles,
  loadRepoData,
  readJsonStorage,
  loadCacheData,
  applyRepoAndCache,
  saveCacheData,
  clearDataCache,
  rebuildAnalysisAfterData,
  loadAllRepoData,
  binanceRowToCandle,
  fetchBinanceKlinesWithFallback,
  fetchMissingBinanceCandles,
  splitClosedAndRunning,
  updateSingleTimeframeFromBinance,
  autoUpdateFromBinance
};

window.BtcDash.data = window.BtcDash.data || {};
window.BtcDash.data.service = window.BtcDash.dataService;
window.BtcDash.data.dataService = window.BtcDash.dataService;
