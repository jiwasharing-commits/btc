const marketData = { "1W": [], "1D": [], "4H": [], "1H": [] };
const runningCandles = { "1W": null, "1D": null, "4H": null, "1H": null };
const structureContexts = { "1W": null, "1D": null, "4H": null, "1H": null };
const structureDebugStats = { enabled: false, lastBuildAt: null, rawPivotCount: 0, internalSwingCount: 0, majorSwingCount: 0, displayedLabelCount: 0, rejectedRawPivotCount: 0, replacedSwingCount: 0, sweepCount: 0, bosCount: 0, chochCount: 0, warnings: [] };
const liquidityContexts = { "1W": null, "1D": null, "4H": null, "1H": null };
const liquidityDebugStats = { enabled: false, lastBuildAt: null, rawEqualHighCount: 0, rawEqualLowCount: 0, buySidePoolCount: 0, sellSidePoolCount: 0, activePoolCount: 0, sweptPoolCount: 0, brokenPoolCount: 0, reclaimedPoolCount: 0, retestedPoolCount: 0, projectedPoolCount: 0, marketZoneRowCount: 0, warnings: [] };
const srContexts = { "1W": null, "1D": null, "4H": null, "1H": null };
const srDebugStats = { enabled: false, lastBuildAt: null, rawLevelCount: 0, zoneClusterCount: 0, activeSupportCount: 0, activeResistanceCount: 0, brokenZoneCount: 0, flippedZoneCount: 0, sweptZoneCount: 0, historicalZoneCount: 0, marketZoneRowCount: 0, warnings: [] };
let marketZonesContext = { upside: [], downside: [], nearestSupport: null, nearestResistance: null, activeTimeframe: null, summary: "" };
const fvgContexts = { "1W": null, "1D": null, "4H": null, "1H": null };
const fvgDebugStats = { enabled: false, lastBuildAt: null, rawFvgCount: 0, validFvgCount: 0, hiddenSmallGapCount: 0, hiddenLowScoreCount: 0, activeCount: 0, partialCount: 0, midpointTouchedCount: 0, mitigatedCount: 0, filledCount: 0, inverseCount: 0, invalidatedCount: 0, projectedCount: 0, marketZoneRowCount: 0, warnings: [] };
const channelContexts = { "1W": null, "1D": null, "4H": null, "1H": null };
const channelDebugStats = { enabled: false, lastBuildAt: null, candidateChannelCount: 0, activeChannelCount: 0, historicalChannelCount: 0, projectedChannelCount: 0, noClearChannelCount: 0, rejectedRawPivotCount: 0, marketZoneRowCount: 0, warnings: [] };
let confluenceContext = { available: false, activeTimeframe: null, candidates: [], strongestCandidate: null, upsideCandidates: [], downsideCandidates: [], mixedCandidates: [], summary: "No confluence candidate detected" };
let scenarioContext = { available: false, activeTimeframe: null, scenarios: [], primaryScenario: null, bullishScenario: null, bearishScenario: null, breakoutScenario: null, breakdownScenario: null, waitScenario: null, summary: "Scenario context not available" };
let reactionStudyContext = { available: false, activeTimeframe: null, studiedZones: [], strongestReaction: null, supportReactions: [], resistanceReactions: [], fvgReactions: [], channelReactions: [], watchAreaReaction: null, summary: "Reaction study not available" };
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
const activeLayers = { MA: false, Structure: false, FVG: false, "S/R": false, "EQH/EQL": false, Channel: false, Confluence: false, "Scenario Levels": false };
const chartRuntime = {
  activeWorkspace: null,
  activeTimeframe: null,
  activeRange: null,
  layerState: { ma: false, structure: false, sr: false, fvg: false, liquidity: false, channel: false, confluence: false, scenario: false },
  overlayRegistry: null,
  lastRenderAt: null,
  renderCount: 0,
  warnings: []
};
const uiRuntime = {
  activeBottomTab: null,
  activeWorkspace: null,
  lastRenderAt: null,
  renderCount: 0,
  warnings: []
};
const auditQualityContext = {
  available: false,
  status: "Not Run",
  severity: "info",
  lastRunAt: null,
  lastRunReason: null,
  summary: { criticalCount: 0, warningCount: 0, infoCount: 0, totalIssues: 0 },
  dataAudit: {},
  runningCandleAudit: {},
  contextAudit: {},
  scoreAudit: {},
  rebuildAudit: {},
  overlayAudit: {},
  autoscaleAudit: {},
  marketZoneAudit: {},
  mtfAudit: {},
  performanceAudit: {},
  issues: [],
  criticalIssues: [],
  warningIssues: [],
  infoIssues: [],
  debugStats: {},
  message: "Audit not run yet."
};
const auditRuntime = {
  rebuildStack: [],
  rebuildHistory: [],
  lastPipelineSnapshot: null,
  lastOverlaySnapshot: null,
  lastLayerStateSnapshot: null,
  lastAuditRunAt: null,
  runCount: 0,
  warnings: []
};

window.BtcDash = window.BtcDash || {};
window.BtcDash.state = {
  ...window.BtcDash.state,
  marketData,
  runningCandles,
  structureContexts,
  structureDebugStats,
  liquidityContexts,
  liquidityDebugStats,
  srContexts,
  srDebugStats,
  fvgContexts,
  fvgDebugStats,
  channelContexts,
  channelDebugStats,
  get confluenceContext() { return confluenceContext; },
  set confluenceContext(value) { confluenceContext = value; },
  get scenarioContext() { return scenarioContext; },
  set scenarioContext(value) { scenarioContext = value; },
  get reactionStudyContext() { return reactionStudyContext; },
  set reactionStudyContext(value) { reactionStudyContext = value; },
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
  channelSeries,
  chartRuntime,
  uiRuntime,
  auditQualityContext,
  auditRuntime
};
