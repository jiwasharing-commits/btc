const marketData = { "1W": [], "1D": [], "4H": [], "1H": [] };
const runningCandles = { "1W": null, "1D": null, "4H": null, "1H": null };
const structureContexts = { "1W": null, "1D": null, "4H": null, "1H": null };
const srContexts = { "1W": null, "1D": null, "4H": null, "1H": null };
let marketZonesContext = { upside: [], downside: [], nearestSupport: null, nearestResistance: null, activeTimeframe: null, summary: "" };
const fvgContexts = { "1W": null, "1D": null, "4H": null, "1H": null };
const channelContexts = { "1W": null, "1D": null, "4H": null, "1H": null };
let confluenceContext = { available: false, activeTimeframe: null, candidates: [], strongestCandidate: null, upsideCandidates: [], downsideCandidates: [], mixedCandidates: [], summary: "No confluence candidate detected" };
let scenarioContext = { available: false, activeTimeframe: null, scenarios: [], primaryScenario: null, bullishScenario: null, bearishScenario: null, breakoutScenario: null, breakdownScenario: null, waitScenario: null, summary: "Scenario context not available" };
let daily4hFvgConfluence = { status: "None", type: null, overlapLower: null, overlapUpper: null, dailyFvg: null, h4Fvg: null, strength: "Moderate", note: "No FVG confluence" };
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

window.BtcDash = window.BtcDash || {};
window.BtcDash.state = {
  marketData,
  runningCandles,
  structureContexts,
  srContexts,
  fvgContexts,
  channelContexts,
  get confluenceContext() { return confluenceContext; },
  set confluenceContext(value) { confluenceContext = value; },
  get scenarioContext() { return scenarioContext; },
  set scenarioContext(value) { scenarioContext = value; },
  activeLayers,
  rangeState,
  get marketZonesContext() { return marketZonesContext; },
  set marketZonesContext(value) { marketZonesContext = value; },
  get daily4hFvgConfluence() { return daily4hFvgConfluence; },
  set daily4hFvgConfluence(value) { daily4hFvgConfluence = value; },
  get activeWorkspace() { return activeWorkspace; },
  set activeWorkspace(value) { activeWorkspace = value; },
  get activeDetail() { return activeDetail; },
  set activeDetail(value) { activeDetail = value; },
  get cacheMeta() { return cacheMeta; },
  set cacheMeta(value) { cacheMeta = value; },
  get autoUpdateEnabled() { return autoUpdateEnabled; },
  set autoUpdateEnabled(value) { autoUpdateEnabled = value; },
  get binanceDebug() { return binanceDebug; },
  set binanceDebug(value) { binanceDebug = value; },
  get loading() { return loading; },
  set loading(value) { loading = value; },
  get loadError() { return loadError; },
  set loadError(value) { loadError = value; },
  get dataStatusMessage() { return dataStatusMessage; },
  set dataStatusMessage(value) { dataStatusMessage = value; },
  get tradingChart() { return tradingChart; },
  set tradingChart(value) { tradingChart = value; },
  get candleSeries() { return candleSeries; },
  set candleSeries(value) { candleSeries = value; },
  get resizeObserver() { return resizeObserver; },
  set resizeObserver(value) { resizeObserver = value; },
  channelSeries
};
