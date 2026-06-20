const qs = (s) => document.querySelector(s);
const card = (label, value) => `<article class="card"><div class="card-label">${label}</div><div class="card-value">${value}</div></article>`;
const metric = (text) => `<span class="metric">${text}</span>`;
const fmtPrice = (value) => Number.isFinite(Number(value)) ? Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—";
const fmtVolume = (value) => Number.isFinite(Number(value)) ? Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 2 }).format(Number(value)) : "—";
const fmtDate = (candle) => candle?.time ? new Date(candle.time).toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
const getLast = (tf) => marketData[tf][marketData[tf].length - 1];
function mergeCandles(existingCandles, newCandles) {
  return normalizeCandles([...(existingCandles ?? []), ...(newCandles ?? [])]);
}
function formatZone(zone) {
  return zone ? `${fmtPrice(zone.lower)} – ${fmtPrice(zone.upper)}` : "—";
}

function formatDistance(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)}%` : "—";
}


function detectTimeUnit(value) {
  if (value instanceof Date) return "date-string";
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return detectTimeUnit(Number(value));
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return "date-string";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "unknown";
  if (numeric > 10000000000) return "milliseconds";
  if (numeric > 1000000000) return "seconds";
  return "unknown";
}

function normalizeChartTime(value) {
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return normalizeChartTime(Number(value));
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric > 10000000000) return Math.floor(numeric / 1000);
  if (numeric > 1000000000) return Math.floor(numeric);
  return null;
}

function normalizeVisibleRange(range = {}) {
  const from = normalizeChartTime(range.from);
  const to = normalizeChartTime(range.to);
  const units = [detectTimeUnit(range.from), detectTimeUnit(range.to)].filter((unit) => unit !== "unknown");
  return { from, to, valid: Number.isFinite(from) && Number.isFinite(to) && to >= from, originalUnit: units.length ? [...new Set(units)].join("+") : "unknown", normalizedUnit: "seconds" };
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

window.BtcDash = window.BtcDash || {};
window.BtcDash.utils = {
  ...window.BtcDash.utils,
  qs,
  card,
  metric,
  fmtPrice,
  fmtVolume,
  fmtDate,
  mergeCandles,
  formatZone,
  formatDistance,
  detectTimeUnit,
  normalizeChartTime,
  normalizeVisibleRange,
  getVisibleCandles,
  getActiveConfig,
  getActiveTimeframe,
  getActiveCandles
};

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

window.BtcDash.utils.getDisplayCandlesForChart = getDisplayCandlesForChart;
window.BtcDash.utils.simpleTrend = simpleTrend;
