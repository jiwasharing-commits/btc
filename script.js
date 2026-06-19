const DATA_FILES = {
  "1W": "data/btc_1w.json",
  "1D": "data/btc_1d.json",
  "4H": "data/btc_4h.json",
  "1H": [
    "data/btc_1h_2017.json",
    "data/btc_1h_2018.json",
    "data/btc_1h_2019.json",
    "data/btc_1h_2020.json",
    "data/btc_1h_2021.json",
    "data/btc_1h_2022.json",
    "data/btc_1h_2023.json",
    "data/btc_1h_2024.json",
    "data/btc_1h_2025.json",
    "data/btc_1h_2026.json"
  ]
};

const workspaces = ["Weekly Map", "Daily + 4H Setup", "1H Timing", "MTF Summary"];
const details = ["Indicator", "Pattern Summary", "Scenario Plan", "Structure", "FVG", "S/R", "Channel", "Confluence", "Reaction Study", "Table"];
const workspaceConfig = {
  "Weekly Map": { timeframe: "1W", title: "Weekly Map — Macro View", ranges: ["1Y", "2Y", "3Y", "5Y", "Full"], defaultRange: "3Y" },
  "Daily + 4H Setup": { timeframe: "4H", title: "4H Setup Chart with Daily Context", ranges: ["1M", "3M", "6M"], defaultRange: "3M", strip: ["Daily Bias", "Daily FVG", "Daily S/R", "Daily Channel", "Daily Warning"] },
  "1H Timing": { timeframe: "1H", title: "1H Timing Chart", ranges: ["7D", "14D", "1M", "3M"], defaultRange: "14D", strip: ["Weekly Bias", "Daily Context", "4H Setup", "Nearest Confluence"] }
};
const BINANCE_INTERVALS = { "1W": "1w", "1D": "1d", "4H": "4h", "1H": "1h" };
const BINANCE_INTERVAL_MS = { "1W": 7 * 24 * 60 * 60 * 1000, "1D": 24 * 60 * 60 * 1000, "4H": 4 * 60 * 60 * 1000, "1H": 60 * 60 * 1000 };
const BINANCE_BASE_URLS = [
  "https://data-api.binance.vision",
  "https://api.binance.com",
  "https://api-gcp.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api3.binance.com",
  "https://api4.binance.com"
];
const BINANCE_SYMBOL = "BTCUSDT";
const DATA_CACHE_KEY = "btcPatternDashboard.marketData.v1";
const RUNNING_CACHE_KEY = "btcPatternDashboard.runningCandles.v1";
const CACHE_META_KEY = "btcPatternDashboard.cacheMeta.v1";
const AUTO_UPDATE_KEY = "btcPatternDashboard.autoUpdate.v1";
const marketData = { "1W": [], "1D": [], "4H": [], "1H": [] };
const runningCandles = { "1W": null, "1D": null, "4H": null, "1H": null };
const STRUCTURE_CONFIG = {
  "1W": { swingLeft: 2, swingRight: 2, minCandles: 30, maxSwings: 30, label: "Weekly Macro Structure" },
  "1D": { swingLeft: 3, swingRight: 3, minCandles: 60, maxSwings: 40, label: "Daily Context Structure" },
  "4H": { swingLeft: 3, swingRight: 3, minCandles: 80, maxSwings: 50, label: "4H Setup Structure" },
  "1H": { swingLeft: 4, swingRight: 4, minCandles: 120, maxSwings: 60, label: "1H Timing Structure" }
};
const structureContexts = { "1W": null, "1D": null, "4H": null, "1H": null };
const rangeState = { "Weekly Map": "3Y", "Daily + 4H Setup": "3M", "1H Timing": "14D" };
let activeWorkspace = "Weekly Map";
let activeDetail = "Indicator";
let loading = false;
let loadError = "";
let dataStatusMessage = "Loading repo/cache data...";
let cacheMeta = null;
let autoUpdateEnabled = localStorage.getItem(AUTO_UPDATE_KEY) !== "false";
let binanceDebug = {};
let tradingChart = null;
let candleSeries = null;
let resizeObserver = null;
let channelSeries = [];
const activeLayers = { MA: true, Structure: true, FVG: true, "S/R": true, "EQH/EQL": false, Channel: true, Confluence: true, "Scenario Levels": false };

const qs = (s) => document.querySelector(s);
const card = (label, value) => `<article class="card"><div class="card-label">${label}</div><div class="card-value">${value}</div></article>`;
const metric = (text) => `<span class="metric">${text}</span>`;
const fmtPrice = (value) => Number.isFinite(Number(value)) ? Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—";
const fmtVolume = (value) => Number.isFinite(Number(value)) ? Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 2 }).format(Number(value)) : "—";
const fmtDate = (candle) => candle?.time ? new Date(candle.time).toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
const getLast = (tf) => marketData[tf][marketData[tf].length - 1];

function renderTabs(target, items, active, onClickName) {
  qs(target).innerHTML = items.map((item) => `<button type="button" class="${item === active ? 'active' : ''}" onclick="${onClickName}('${item.replaceAll("'", "\\'")}')">${item}</button>`).join("");
}

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

function mergeCandles(existingCandles, newCandles) {
  return normalizeCandles([...(existingCandles ?? []), ...(newCandles ?? [])]);
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

async function loadAllRepoData({ runAutoUpdate = autoUpdateEnabled } = {}) {
  loading = true;
  loadError = "";
  dataStatusMessage = "Loading repo/cache data...";
  renderAll();
  try {
    const repoData = await loadRepoData();
    const cachedData = loadCacheData();
    applyRepoAndCache(repoData, cachedData);
    rebuildAllStructureContexts();
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

function createEmptyStructureContext(timeframe, reason = "Not enough data") {
  return {
    available: false,
    timeframe,
    status: "Unavailable",
    bias: "Unclear",
    reason,
    swings: [],
    labels: [],
    sequence: [],
    lastSwingHigh: null,
    lastSwingLow: null,
    bosChoch: { status: "None", direction: "Neutral", level: null, brokenAt: null, note: "No confirmed BOS/CHoCH" },
    summary: "No clear structure detected."
  };
}

function detectSwingPoints(candles, timeframe) {
  const config = STRUCTURE_CONFIG[timeframe];
  if (!config || candles.length < config.minCandles) return [];
  const swings = [];
  for (let index = config.swingLeft; index < candles.length - config.swingRight; index += 1) {
    const candle = candles[index];
    const left = candles.slice(index - config.swingLeft, index);
    const right = candles.slice(index + 1, index + 1 + config.swingRight);
    const isSwingHigh = left.every((c) => candle.high > c.high) && right.every((c) => candle.high > c.high);
    const isSwingLow = left.every((c) => candle.low < c.low) && right.every((c) => candle.low < c.low);
    if (isSwingHigh) swings.push({ type: "high", price: candle.high, time: candle.open_time, close_time: candle.close_time, index, candle });
    if (isSwingLow) swings.push({ type: "low", price: candle.low, time: candle.open_time, close_time: candle.close_time, index, candle });
  }
  return swings.sort((a, b) => a.time - b.time).slice(-config.maxSwings);
}

function classifySwingLabels(swings) {
  let previousHigh = null;
  let previousLow = null;
  return swings.map((swing) => {
    let label = swing.type === "high" ? "SH" : "SL";
    if (swing.type === "high") {
      if (previousHigh) label = swing.price > previousHigh.price ? "HH" : swing.price < previousHigh.price ? "LH" : "EH";
      previousHigh = swing;
    } else {
      if (previousLow) label = swing.price > previousLow.price ? "HL" : swing.price < previousLow.price ? "LL" : "EL";
      previousLow = swing;
    }
    return { ...swing, label };
  });
}

function deriveStructureBias(labeledSwings) {
  if (labeledSwings.length < 4) return { bias: "Unclear", status: "Weak Structure", sequenceText: "—", note: "Not enough confirmed swings." };
  const sequence = labeledSwings.slice(-8);
  const sequenceText = sequence.map((swing) => swing.label).join(" → ");
  const bullish = sequence.filter((swing) => swing.label === "HH" || swing.label === "HL").length;
  const bearish = sequence.filter((swing) => swing.label === "LH" || swing.label === "LL").length;
  const highs = sequence.filter((swing) => swing.type === "high").map((swing) => swing.price);
  const lows = sequence.filter((swing) => swing.type === "low").map((swing) => swing.price);
  const rangePct = highs.length && lows.length ? ((Math.max(...highs) - Math.min(...lows)) / Math.max(...highs)) * 100 : 100;
  if (rangePct < 8 && Math.abs(bullish - bearish) <= 1) return { bias: "Range", status: "Range Structure", sequenceText, note: "Recent swings remain compressed in a range." };
  if (bullish >= 4 && bullish > bearish + 1) return { bias: "Bullish", status: "Bullish Structure", sequenceText, note: "HH/HL labels dominate recent structure." };
  if (bearish >= 4 && bearish > bullish + 1) return { bias: "Bearish", status: "Bearish Structure", sequenceText, note: "LH/LL labels dominate recent structure." };
  return { bias: "Mixed", status: "Mixed Structure", sequenceText, note: "Recent structure has mixed swing labels." };
}

function deriveBosChoch(candles, labeledSwings, bias) {
  const lastClosed = candles.at(-1);
  const lastSwingHigh = [...labeledSwings].reverse().find((swing) => swing.type === "high");
  const lastSwingLow = [...labeledSwings].reverse().find((swing) => swing.type === "low");
  if (!lastClosed || !lastSwingHigh || !lastSwingLow) return { status: "None", direction: "Neutral", level: null, brokenAt: null, note: "No confirmed BOS/CHoCH" };
  if (lastClosed.close > lastSwingHigh.price) return { status: bias === "Bullish" ? "BOS Up" : "CHoCH Up", direction: "Bullish", level: lastSwingHigh.price, brokenAt: lastClosed.close_time, note: "Close confirmed above last swing high." };
  if (lastClosed.close < lastSwingLow.price) return { status: bias === "Bearish" ? "BOS Down" : "CHoCH Down", direction: "Bearish", level: lastSwingLow.price, brokenAt: lastClosed.close_time, note: "Close confirmed below last swing low." };
  if (lastClosed.high > lastSwingHigh.price || lastClosed.low < lastSwingLow.price) return { status: "Unconfirmed Break", direction: "Neutral", level: lastClosed.high > lastSwingHigh.price ? lastSwingHigh.price : lastSwingLow.price, brokenAt: lastClosed.close_time, note: "Wick crossed a swing level, but close did not confirm." };
  return { status: "None", direction: "Neutral", level: null, brokenAt: null, note: "No confirmed BOS/CHoCH" };
}

function buildMarketStructureContext(timeframe) {
  const candles = marketData[timeframe] || [];
  const config = STRUCTURE_CONFIG[timeframe];
  if (!config || candles.length < config.minCandles) return createEmptyStructureContext(timeframe, "Not enough candles");
  const swings = detectSwingPoints(candles, timeframe);
  if (swings.length < 4) return createEmptyStructureContext(timeframe, "Not enough swing points");
  const labels = classifySwingLabels(swings);
  const biasInfo = deriveStructureBias(labels);
  const bosChoch = deriveBosChoch(candles, labels, biasInfo.bias);
  const lastSwingHigh = [...labels].reverse().find((swing) => swing.type === "high") ?? null;
  const lastSwingLow = [...labels].reverse().find((swing) => swing.type === "low") ?? null;
  return { available: true, timeframe, status: biasInfo.status, bias: biasInfo.bias, swings, labels, sequence: labels.slice(-8), lastSwingHigh, lastSwingLow, bosChoch, summary: `${STRUCTURE_CONFIG[timeframe].label}: ${biasInfo.status}. ${biasInfo.note}` };
}

function rebuildAllStructureContexts() {
  ["1W", "1D", "4H", "1H"].forEach((timeframe) => {
    structureContexts[timeframe] = buildMarketStructureContext(timeframe);
    const context = structureContexts[timeframe];
    console.info("[Market Structure]", timeframe, { bias: context.bias, status: context.status, swings: context.swings.length, lastSwingHigh: context.lastSwingHigh, lastSwingLow: context.lastSwingLow, bosChoch: context.bosChoch });
  });
}

function getVisibleCandles(timeframe, range) {
  const candles = marketData[timeframe] ?? [];
  if (!candles.length || range === "Full") return candles;
  const units = { D: 86400000, M: 30 * 86400000, Y: 365 * 86400000 };
  const [, amount, unit] = range.match(/^(\d+)([DMY])$/) ?? [];
  if (!amount || !unit) return candles;
  const cutoff = candles[candles.length - 1].open_time - Number(amount) * units[unit];
  return candles.filter((candle) => candle.open_time >= cutoff);
}

function getActiveConfig() { return workspaceConfig[activeWorkspace]; }
function getActiveTimeframe() { return getActiveConfig()?.timeframe ?? "1W"; }
function getActiveCandles() { const config = getActiveConfig(); return config ? getVisibleCandles(config.timeframe, rangeState[activeWorkspace]) : []; }
function getDisplayCandlesForChart(timeframe, closed = getVisibleCandles(timeframe, rangeState[activeWorkspace])) {
  const running = runningCandles[timeframe];
  if (!running) return closed;
  const lastClosed = closed[closed.length - 1];
  if (!lastClosed) return closed;
  if (running.open_time <= lastClosed.open_time) return closed;
  return [...closed, { ...running, is_running_preview: true }];
}
function simpleTrend(tf, upText, downText, minBack = 20) {
  const candles = marketData[tf];
  if (candles.length <= minBack) return tf === "1D" ? "Warning" : "Neutral";
  return candles[candles.length - 1].close > candles[candles.length - 1 - minBack].close ? upText : downText;
}

function renderDataStatus() {
  const el = qs('#data-status');
  if (!el) return;
  const cacheState = cacheMeta ? "Active" : "Empty";
  const lastUpdate = cacheMeta?.updated_at ? new Date(cacheMeta.updated_at).toLocaleString() : "—";
  const runningPreview = ["1W", "1D", "4H", "1H"].map((tf) => `${tf} running close: ${fmtPrice(runningCandles[tf]?.close)}${runningCandles[tf] ? " (Preview Only)" : ""}`).join(" • ");
  el.innerHTML = `
    <span><strong>Data Source:</strong> Repo + Binance Runtime</span>
    <span><strong>Last Binance Update:</strong> ${lastUpdate}</span>
    <span><strong>Cache:</strong> ${cacheState}</span>
    <span><strong>Running Candle:</strong> Preview Only</span>
    <span><strong>Status:</strong> ${dataStatusMessage}</span>
    <span><strong>Running Preview:</strong> ${runningPreview}</span>
  `;
  qs('#auto-update').textContent = `Auto Update: ${autoUpdateEnabled ? "ON" : "OFF"}`;
  qs('#auto-update').classList.toggle('active', autoUpdateEnabled);
}

function renderBinanceDebug() {
  const el = qs('#binance-debug');
  if (!el) return;
  const rows = ["1W", "1D", "4H", "1H"].map((timeframe) => {
    const debug = binanceDebug[timeframe];
    if (!debug) return `<div><strong>${timeframe}:</strong> waiting</div>`;
    if (debug.error) return `<div><strong>${timeframe}:</strong> failed — ${debug.error}</div>`;
    return `<div><strong>${timeframe}:</strong> last local close: ${debug.lastLocalClose ? new Date(debug.lastLocalClose).toLocaleString() : "—"} | fetched: ${debug.fetchedRows ?? 0} | added closed: ${debug.addedClosed ?? 0} | running: ${debug.running ? "yes" : "no"} | endpoint: ${debug.endpoint ?? "—"}</div>`;
  }).join('');
  el.innerHTML = `<div class="debug-title">Binance Debug</div>${rows}`;
}

function getGlobalLatestPrice() {
  if (runningCandles["1H"]?.close) return { price: runningCandles["1H"].close, source: "Running 1H" };
  if (marketData["1H"]?.length) return { price: marketData["1H"].at(-1).close, source: "Closed 1H" };
  if (runningCandles["4H"]?.close) return { price: runningCandles["4H"].close, source: "Running 4H" };
  if (marketData["4H"]?.length) return { price: marketData["4H"].at(-1).close, source: "Closed 4H" };
  if (marketData["1D"]?.length) return { price: marketData["1D"].at(-1).close, source: "Closed 1D" };
  if (marketData["1W"]?.length) return { price: marketData["1W"].at(-1).close, source: "Closed 1W" };
  return { price: null, source: "—" };
}

function renderSummary() {
  const latest = getGlobalLatestPrice();
  const oneHour = marketData["1H"];
  const oneHourTiming = oneHour.length > 1 && oneHour.at(-1).close > oneHour.at(-2).close ? "Early Up" : oneHour.length > 1 ? "Early Down" : "Neutral";
  const weekly = structureContexts["1W"] ?? createEmptyStructureContext("1W");
  const daily = structureContexts["1D"] ?? createEmptyStructureContext("1D");
  const fourH = structureContexts["4H"] ?? createEmptyStructureContext("4H");
  const oneH = structureContexts["1H"] ?? createEmptyStructureContext("1H");
  const summary = {
    "Latest BTC Price": `${fmtPrice(latest.price)}<small>Source: ${latest.source}</small>`,
    "Weekly Bias": `${weekly.bias}<small>${weekly.status}</small>`,
    "Daily Context": `${daily.bias}<small>${daily.status}</small>`,
    "4H Setup": `${fourH.bias}<small>${fourH.bosChoch.status}</small>`,
    "1H Timing": `${oneH.bias}<small>${oneH.bosChoch.status}</small>`,
    "Top Scenario": "Bullish 8/10",
    "Risk": "Medium"
  };
  qs('.summary-grid').innerHTML = Object.entries(summary).map(([k, v]) => `<article class="summary-card"><div class="card-label">${k}</div><div class="card-value">${v}</div></article>`).join('');
}

function rangeSelector(config) {
  if (!config?.ranges) return "";
  return `<div class="range-row">${config.ranges.map((range) => `<button type="button" class="${rangeState[activeWorkspace] === range ? 'active' : ''}" onclick="setRange('${range}')">${range}</button>`).join('')}</div>`;
}

function toChartCandles(candles) {
  return candles.map((candle) => ({
    time: Math.floor(candle.open_time / 1000),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close
  }));
}

function chart(title, timeframe, closedCandles, strip = []) {
  const allCount = marketData[timeframe]?.length ?? 0;
  const lastClosed = marketData[timeframe]?.at(-1);
  const running = runningCandles[timeframe];
  const hasRunningPreview = Boolean(running && closedCandles.length && running.open_time > closedCandles.at(-1).open_time);
  const countLabel = hasRunningPreview ? `${allCount} closed + 1 running preview` : `${allCount}`;
  const runningLabel = hasRunningPreview ? ` • Running preview: ${fmtPrice(running.close)}` : '';
  const dailyContext = activeWorkspace === 'Daily + 4H Setup' ? (structureContexts['1D'] ?? createEmptyStructureContext('1D')) : null;
  const stripItems = dailyContext ? [`Daily Bias: ${dailyContext.bias}`, `Daily Structure: ${dailyContext.status}`, `Daily BOS/CHoCH: ${dailyContext.bosChoch.status}`, ...strip.slice(3)] : strip;
  return `${stripItems.length ? `<div class="context-strip">${stripItems.map(metric).join('')}</div>` : ''}
  ${rangeSelector(getActiveConfig())}
  <div class="chart-panel tradingview-panel">
    <div class="chart-title"><h2>${title}</h2><p>Candles loaded: ${countLabel} • Visible closed: ${closedCandles.length} • Active TF last closed: ${fmtPrice(lastClosed?.close)}${runningLabel}</p></div>
    <div id="main-chart" class="trading-chart" aria-label="TradingView-style candlestick chart"></div>
    <div class="running-overlay ${hasRunningPreview ? '' : 'is-hidden'}"><span>Running Preview<br><small>Preview Only</small></span></div>
    <div class="fvg-overlay ${activeLayers.FVG ? '' : 'is-hidden'}"><span>FVG Zone</span></div>
    <div class="chart-watermark">${timeframe} • BTCUSDT</div>
  </div>`;
}

function clearTradingChart() {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (tradingChart) {
    tradingChart.remove();
    tradingChart = null;
  }
  candleSeries = null;
  channelSeries = [];
}

function addDummyPriceLines(closedCandles, running) {
  if (!candleSeries || !closedCandles.length) return;
  const lastClosed = closedCandles.at(-1).close;
  candleSeries.createPriceLine({
    price: lastClosed,
    color: "#ef4444",
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dotted,
    axisLabelVisible: true,
    title: "Last Closed"
  });

  if (running && running.open_time > closedCandles.at(-1).open_time) {
    candleSeries.createPriceLine({
      price: running.close,
      color: "#facc15",
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dotted,
      axisLabelVisible: true,
      title: "Running"
    });
  }

  if (!activeLayers["S/R"]) return;
  const recent = closedCandles.slice(-80);
  const support = Math.min(...recent.map((c) => c.low));
  const resistance = Math.max(...recent.map((c) => c.high));
  candleSeries.createPriceLine({ price: support, color: "#22c55e", lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: true, title: "Support" });
  candleSeries.createPriceLine({ price: resistance, color: "#f97316", lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: true, title: "Resistance" });
}

function addDummyMarkers(closedCandles, running, timeframe) {
  if (!candleSeries) return;
  const markers = [];
  const firstVisibleTime = closedCandles[0]?.open_time ?? 0;
  const context = structureContexts[timeframe];
  if (activeLayers.Structure && context?.available) {
    markers.push(...context.labels
      .filter((label) => label.time >= firstVisibleTime)
      .slice(-28)
      .map((label) => ({
        time: Math.floor(label.time / 1000),
        position: label.type === "high" ? "aboveBar" : "belowBar",
        color: label.type === "high" ? "#38bdf8" : "#facc15",
        shape: label.type === "high" ? "arrowDown" : "arrowUp",
        text: label.label
      })));
  }
  if (running && closedCandles.length && running.open_time > closedCandles.at(-1).open_time) {
    markers.push({ time: Math.floor(running.open_time / 1000), position: "aboveBar", color: "#facc15", shape: "circle", text: `Running ${timeframe === "1W" ? "W" : timeframe}` });
  }
  candleSeries.setMarkers(markers);
}

function addDummyChannel(candles) {
  if (!tradingChart || !activeLayers.Channel || candles.length < 12) return;
  const segment = candles.slice(-60);
  const first = segment[0];
  const last = segment.at(-1);
  const upperOffset = Math.max(...segment.map((c) => c.high)) * 0.018;
  const lowerOffset = Math.max(...segment.map((c) => c.high)) * 0.018;
  const upper = tradingChart.addLineSeries({ color: "rgba(56, 189, 248, 0.72)", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
  const lower = tradingChart.addLineSeries({ color: "rgba(167, 139, 250, 0.66)", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
  upper.setData([{ time: Math.floor(first.open_time / 1000), value: first.high + upperOffset }, { time: Math.floor(last.open_time / 1000), value: last.high + upperOffset }]);
  lower.setData([{ time: Math.floor(first.open_time / 1000), value: first.low - lowerOffset }, { time: Math.floor(last.open_time / 1000), value: last.low - lowerOffset }]);
  channelSeries = [upper, lower];
}

function renderTradingChart() {
  clearTradingChart();
  const container = qs('#main-chart');
  if (!container || activeWorkspace === 'MTF Summary') return;
  if (!window.LightweightCharts) {
    container.innerHTML = `<div class="status-panel error">Failed to load TradingView Lightweight Charts CDN.</div>`;
    return;
  }
  const config = getActiveConfig();
  const timeframe = config.timeframe;
  const closedCandles = getActiveCandles();
  const running = runningCandles[timeframe];
  const displayCandles = getDisplayCandlesForChart(timeframe, closedCandles);
  if (!closedCandles.length) {
    container.innerHTML = `<div class="status-panel">No candles in selected range.</div>`;
    return;
  }

  tradingChart = LightweightCharts.createChart(container, {
    width: container.clientWidth,
    height: container.clientHeight,
    layout: { background: { color: "#0b1220" }, textColor: "#cbd5e1", fontFamily: "Inter, system-ui, sans-serif" },
    grid: {
      vertLines: { color: "rgba(148, 163, 184, 0.12)" },
      horzLines: { color: "rgba(148, 163, 184, 0.12)" }
    },
    rightPriceScale: { borderColor: "rgba(148, 163, 184, 0.25)", visible: true, scaleMargins: { top: 0.12, bottom: 0.12 } },
    timeScale: { borderColor: "rgba(148, 163, 184, 0.25)", timeVisible: true, secondsVisible: false, rightOffset: 8, barSpacing: 8 },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    handleScale: { axisPressedMouseMove: true, mouseWheel: false, pinch: true }
  });

  candleSeries = tradingChart.addCandlestickSeries({
    upColor: "#22c55e",
    downColor: "#ef4444",
    borderUpColor: "#22c55e",
    borderDownColor: "#ef4444",
    wickUpColor: "#86efac",
    wickDownColor: "#fca5a5",
    priceLineVisible: false
  });
  candleSeries.setData(toChartCandles(displayCandles));
  addDummyPriceLines(closedCandles, running);
  addDummyMarkers(closedCandles, running, timeframe);
  addDummyChannel(closedCandles);
  tradingChart.timeScale().fitContent();

  resizeObserver = new ResizeObserver(() => {
    if (!tradingChart || !container.clientWidth || !container.clientHeight) return;
    tradingChart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
  });
  resizeObserver.observe(container);
}

function mtfStatus(tf) {
  if (tf === "1H") {
    const candles = marketData[tf];
    return candles.length > 1 && candles.at(-1).close > candles.at(-2).close ? "Early Up" : candles.length > 1 ? "Early Down" : "Neutral";
  }
  return simpleTrend(tf, "Bullish", "Bearish");
}

function renderWorkspace() {
  const el = qs('#workspace-content');
  if (loading) { clearTradingChart(); el.innerHTML = `<div class="status-panel">Loading data...</div>`; return; }
  if (loadError) { clearTradingChart(); el.innerHTML = `<div class="status-panel error">${loadError}</div>`; return; }
  if (activeWorkspace === 'MTF Summary') {
    clearTradingChart();
    el.innerHTML = `<div class="mtf-grid">${["1W", "1D", "4H", "1H"].map((tf) => {
      const candles = marketData[tf];
      const structure = structureContexts[tf] ?? createEmptyStructureContext(tf);
      return card(tf === "1W" ? "Weekly" : tf === "1D" ? "Daily" : tf, `Total candles: ${candles.length}<br>Last close: ${fmtPrice(candles.at(-1)?.close)}<br>${structure.status}<br>BOS/CHoCH: ${structure.bosChoch.status}<br>Sequence: ${formatStructureSequence(structure)}`);
    }).join('')}</div>`;
    return;
  }
  const config = getActiveConfig();
  el.innerHTML = chart(config.title, config.timeframe, getActiveCandles(), config.strip ?? []);
  requestAnimationFrame(renderTradingChart);
}

function setWorkspace(name) { activeWorkspace = name; renderTabs('.workspace-tabs', workspaces, activeWorkspace, 'setWorkspace'); renderSummary(); renderWorkspace(); renderDetail(); }
function setDetail(name) { activeDetail = name; renderTabs('.detail-tabs', details, activeDetail, 'setDetail'); renderDetail(); }
function setRange(range) { rangeState[activeWorkspace] = range; renderSummary(); renderWorkspace(); renderDetail(); }

function renderTable() {
  const rows = getActiveCandles().slice(-100).reverse();
  return `<div class="table-wrap"><table><thead><tr>${['Date','Open','High','Low','Close','Change %','Volume'].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((c) => {
    const change = c.open ? ((c.close - c.open) / c.open) * 100 : 0;
    return `<tr><td>${fmtDate(c)}</td><td>${fmtPrice(c.open)}</td><td>${fmtPrice(c.high)}</td><td>${fmtPrice(c.low)}</td><td>${fmtPrice(c.close)}</td><td class="${change >= 0 ? 'positive' : 'negative'}">${change.toFixed(2)}%</td><td>${fmtVolume(c.volume)}</td></tr>`;
  }).join('') || `<tr><td colspan="7">No candle data loaded for this workspace/range.</td></tr>`}</tbody></table></div>`;
}

function formatStructureSequence(context) {
  return context?.sequence?.length ? context.sequence.map((swing) => swing.label).join(" → ") : "No clear structure detected";
}

function renderMtfStructureCards() {
  return `<div class="structure-card-grid">${["1W", "1D", "4H", "1H"].map((timeframe) => {
    const context = structureContexts[timeframe] ?? createEmptyStructureContext(timeframe);
    return `<article class="structure-card"><div class="card-label">${timeframe === "1W" ? "Weekly" : timeframe === "1D" ? "Daily" : timeframe}</div><span class="structure-badge ${context.bias.toLowerCase()}">${context.bias}</span><div class="structure-note">${context.status} • ${context.bosChoch.status}</div><div class="structure-sequence">${formatStructureSequence(context)}</div></article>`;
  }).join('')}</div>`;
}

function renderDetail() {
  const el = qs('#detail-content');
  const grid = (items, cls='detail-grid') => `<div class="${cls}">${items.map(([a,b]) => card(a,b)).join('')}</div>`;
  const last = getLast(getActiveTimeframe());
  const latest = getGlobalLatestPrice();
  const data = {
    'Indicator': `<div class="selector-row">${['Volume','RSI','MACD','ATR','Volatility','Structure'].map(metric).join('')}</div>${grid([['Volume Status', last ? 'Loaded' : 'Waiting Data'],['Last Volume', fmtVolume(last?.volume)],['RSI','Placeholder'],['ATR','Placeholder'],['Volatility','Placeholder']], 'detail-grid six')}<div class="mini-chart"></div>`,
    'Pattern Summary': `${grid([['Trend', simpleTrend(getActiveTimeframe(), 'Uptrend', 'Downtrend')],['Structure','HH-HL placeholder'],['Nearest Zone','Pending logic'],['FVG Status','Placeholder'],['Channel Position','Placeholder'],['Warning','Real logic pending']], 'detail-grid six')}<div class="summary-box card">Chart and table now use real repository candles; pattern analysis cards remain placeholders for the next phase.</div>`,
    'Scenario Plan': `<h2>Multi-Scenario Planning</h2><p class="subtitle">Read-only planning context • not financial advice or a direct trading signal.</p><div class="chip-row">${['Bullish 8/10','Breakout 6/10','Wait 5/10','Bearish 4/10','Breakdown 2/10'].map((x,i)=>`<span class="chip ${i===0?'active':''}">${x}</span>`).join('')}</div><article class="card"><h2>Top Scenario: Bullish — 8/10</h2><div class="scenario-card">${[['Latest BTC Price',fmtPrice(latest.price)],['Watch Area','103,800 – 104,500'],['SL / Invalid','101,200'],['TP1','106,800'],['TP2','110,200'],['TP3','114,500'],['RR','1.2R / 2.4R / 3.6R'],['Status','Waiting Confirmation']].map(([a,b])=>`<div><span class="card-label">${a}</span><div class="card-value">${b}</div></div>`).join('')}</div></article>${grid([['Reason','Weekly HH-HL valid'],['Reason','4H bullish FVG active'],['Reason','Near support/channel'],['Risk','Invalid if close below SL']])}`,
    'Structure': (() => {
      const context = structureContexts[getActiveTimeframe()] ?? createEmptyStructureContext(getActiveTimeframe());
      return `${grid([['Active TF Bias', context.bias],['Structure Status', context.status],['Last Swing High', fmtPrice(context.lastSwingHigh?.price)],['Last Swing Low', fmtPrice(context.lastSwingLow?.price)],['BOS / CHoCH', context.bosChoch.status],['Sequence', formatStructureSequence(context)]], 'detail-grid six')}<div class="structure-note card">${context.summary}</div>${renderMtfStructureCards()}`;
    })(),
    'FVG': grid([['Nearest FVG','TF: 4H<br>Type: Placeholder<br>Zone: Pending detection<br>Status: Pending'],['Daily FVG','Type: Placeholder<br>Zone: Pending detection<br>Status: Pending'],['D+4H Confluence','Status: Pending<br>Overlap: Pending<br>Strength: Pending']]),
    'S/R': grid([['Nearest Support','Zone: Pending detection<br>Source: Future logic<br>Distance: —'],['Nearest Resistance','Zone: Pending detection<br>Source: Future logic<br>Distance: —'],['Retest Zone','Zone: Pending detection<br>Status: Watching']]),
    'Channel': grid([['Weekly Channel','Direction: Pending<br>Position: Pending<br>Upper: —<br>Mid: —<br>Lower: —'],['Daily Channel','Direction: Pending<br>Status: No clear breakout'],['4H Channel','Direction: Pending<br>Position: Pending<br>Status: Pending']]),
    'Confluence': grid([['Zone 1 — Strong','Area: Pending<br>Sources: Pending<br>Score: —'],['Zone 2 — Moderate','Area: Pending<br>Sources: Pending<br>Score: —'],['Zone 3 — Risk Area','Area: Pending<br>Sources: Pending<br>Score: —']]),
    'Reaction Study': `<div class="selector-row">${['Event Type','Outcome Window','Target %','Range Basis'].map(metric).join('')}</div>${grid([['Total Events','Pending'],['Success Rate','Pending'],['Failed','Pending'],['Avg Upside','Pending'],['Avg Drawdown','Pending'],['Median Reaction','Pending']], 'detail-grid six')}`,
    'Table': renderTable()
  };
  el.innerHTML = data[activeDetail];
}

function renderAll() {
  renderTabs('.workspace-tabs', workspaces, activeWorkspace, 'setWorkspace');
  renderTabs('.detail-tabs', details, activeDetail, 'setDetail');
  renderDataStatus();
  renderBinanceDebug();
  renderSummary();
  renderWorkspace();
  renderDetail();
}

qs('#load-data').addEventListener('click', () => loadAllRepoData());
qs('#update-binance').addEventListener('click', autoUpdateFromBinance);
qs('#auto-update').addEventListener('click', () => {
  autoUpdateEnabled = !autoUpdateEnabled;
  localStorage.setItem(AUTO_UPDATE_KEY, String(autoUpdateEnabled));
  dataStatusMessage = `Auto Update ${autoUpdateEnabled ? "enabled" : "disabled"}.`;
  renderDataStatus();
});
qs('#reset-cache').addEventListener('click', async () => {
  clearDataCache();
  dataStatusMessage = "Local candle cache reset. Reloading repo data...";
  await loadAllRepoData();
});
qs('.layer-control').addEventListener('click', (event) => {
  const button = event.target.closest('[data-layer]');
  if (!button) return;
  const layer = button.dataset.layer;
  activeLayers[layer] = !activeLayers[layer];
  button.classList.toggle('active', activeLayers[layer]);
  renderWorkspace();
});
async function initDashboard() {
  dataStatusMessage = "Loading repo/cache data...";
  renderAll();
  await loadAllRepoData({ runAutoUpdate: autoUpdateEnabled });
}

initDashboard();
