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

const STRUCTURE_CONFIG = {
  "1W": { swingLeft: 2, swingRight: 2, minCandles: 30, maxSwings: 30, label: "Weekly Macro Structure" },
  "1D": { swingLeft: 3, swingRight: 3, minCandles: 60, maxSwings: 40, label: "Daily Context Structure" },
  "4H": { swingLeft: 3, swingRight: 3, minCandles: 80, maxSwings: 50, label: "4H Setup Structure" },
  "1H": { swingLeft: 4, swingRight: 4, minCandles: 120, maxSwings: 60, label: "1H Timing Structure" }
};
const SR_CONFIG = {
  "1W": { maxZones: 8, mergeTolerancePct: 3.0, recentLookbackSwings: 24, minTouches: 1, label: "Weekly Major S/R" },
  "1D": { maxZones: 10, mergeTolerancePct: 1.8, recentLookbackSwings: 32, minTouches: 1, label: "Daily Context S/R" },
  "4H": { maxZones: 12, mergeTolerancePct: 1.0, recentLookbackSwings: 40, minTouches: 1, label: "4H Setup S/R" },
  "1H": { maxZones: 10, mergeTolerancePct: 0.6, recentLookbackSwings: 48, minTouches: 1, label: "1H Timing S/R" }
};
const FVG_CONFIG = {
  "1W": { maxActiveZones: 8, minGapPct: 0.8, lookbackCandles: 220, label: "Weekly FVG" },
  "1D": { maxActiveZones: 10, minGapPct: 0.35, lookbackCandles: 260, label: "Daily FVG" },
  "4H": { maxActiveZones: 12, minGapPct: 0.18, lookbackCandles: 420, label: "4H FVG" },
  "1H": { maxActiveZones: 10, minGapPct: 0.10, lookbackCandles: 600, label: "1H FVG" }
};

const CHANNEL_CONFIG = {
  "1W": { minSwingPairs: 2, maxLookbackSwings: 24, maxChannelAgeCandles: 180, maxWidthPct: 65, minWidthPct: 8, touchTolerancePct: 3.0, breakConfirmPct: 1.0, label: "Weekly Major Channel" },
  "1D": { minSwingPairs: 2, maxLookbackSwings: 32, maxChannelAgeCandles: 220, maxWidthPct: 28, minWidthPct: 4, touchTolerancePct: 1.6, breakConfirmPct: 0.7, label: "Daily Context Channel" },
  "4H": { minSwingPairs: 2, maxLookbackSwings: 40, maxChannelAgeCandles: 260, maxWidthPct: 16, minWidthPct: 2, touchTolerancePct: 0.9, breakConfirmPct: 0.45, label: "4H Setup Channel" },
  "1H": { minSwingPairs: 2, maxLookbackSwings: 48, maxChannelAgeCandles: 320, maxWidthPct: 10, minWidthPct: 1, touchTolerancePct: 0.55, breakConfirmPct: 0.25, label: "1H Timing Channel" }
};

const CONFLUENCE_CONFIG = {
  proximityPct: { "1W": 3.0, "1D": 1.8, "4H": 1.0, "1H": 0.6 },
  maxCandidates: 8,
  minSourcesForStrong: 3,
  minSourcesForCandidate: 2,
  overlapBonusLabel: "Overlap",
  proximityLabel: "Nearby"
};

const CONFLUENCE_SCORE_CONFIG = {
  maxScore: 10,
  weights: {
    sourceCount: 2.0,
    timeframeCount: 1.5,
    overlap: 1.5,
    proximity: 0.75,
    structureAlignment: 1.5,
    channelSupport: 0.75,
    srSupport: 0.75,
    fvgSupport: 0.75,
    nearCurrentPrice: 0.75,
    conflictPenalty: -2.0,
    weakDistancePenalty: -1.0
  },
  distanceQualityPct: { "1W": 6.0, "1D": 3.0, "4H": 1.8, "1H": 1.0 },
  labels: [
    { min: 8, label: "Very Strong Context" },
    { min: 6.5, label: "Strong Context" },
    { min: 5, label: "Developing Context" },
    { min: 3, label: "Weak Context" },
    { min: 0, label: "Very Weak Context" }
  ]
};

window.BtcDash = window.BtcDash || {};
window.BtcDash.config = {
  DATA_FILES,
  workspaces,
  details,
  workspaceConfig,
  BINANCE_INTERVALS,
  BINANCE_INTERVAL_MS,
  BINANCE_BASE_URLS,
  BINANCE_SYMBOL,
  DATA_CACHE_KEY,
  RUNNING_CACHE_KEY,
  CACHE_META_KEY,
  AUTO_UPDATE_KEY,
  STRUCTURE_CONFIG,
  SR_CONFIG,
  FVG_CONFIG,
  CHANNEL_CONFIG,
  CONFLUENCE_CONFIG,
  CONFLUENCE_SCORE_CONFIG
};
