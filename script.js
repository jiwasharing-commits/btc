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
const marketData = { "1W": [], "1D": [], "4H": [], "1H": [] };
const rangeState = { "Weekly Map": "3Y", "Daily + 4H Setup": "3M", "1H Timing": "14D" };
let activeWorkspace = "Weekly Map";
let activeDetail = "Indicator";
let loading = false;
let loadError = "";
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

async function loadTimeframeData(timeframe) {
  const files = Array.isArray(DATA_FILES[timeframe]) ? DATA_FILES[timeframe] : [DATA_FILES[timeframe]];
  const candlesByFile = await Promise.all(files.map(fetchCandles));
  marketData[timeframe] = normalizeCandles(candlesByFile.flat());
  return marketData[timeframe];
}

async function loadAllRepoData() {
  loading = true;
  loadError = "";
  renderAll();
  try {
    await Promise.all(Object.keys(DATA_FILES).map(loadTimeframeData));
  } catch (error) {
    loadError = error.message;
  } finally {
    loading = false;
    renderAll();
  }
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
function simpleTrend(tf, upText, downText, minBack = 20) {
  const candles = marketData[tf];
  if (candles.length <= minBack) return tf === "1D" ? "Warning" : "Neutral";
  return candles[candles.length - 1].close > candles[candles.length - 1 - minBack].close ? upText : downText;
}

function renderSummary() {
  const lastActive = getLast(getActiveTimeframe());
  const oneHour = marketData["1H"];
  const oneHourTiming = oneHour.length > 1 && oneHour.at(-1).close > oneHour.at(-2).close ? "Early Up" : oneHour.length > 1 ? "Early Down" : "Neutral";
  const summary = {
    "Current Price": fmtPrice(lastActive?.close),
    "Weekly Bias": simpleTrend("1W", "Bullish", "Bearish"),
    "Daily Context": simpleTrend("1D", "Confirm", "Warning"),
    "4H Setup": simpleTrend("4H", "Valid", "Weak"),
    "1H Timing": oneHourTiming,
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

function chart(title, timeframe, candles, strip = []) {
  const allCount = marketData[timeframe]?.length ?? 0;
  const last = marketData[timeframe]?.at(-1);
  return `${strip.length ? `<div class="context-strip">${strip.map(metric).join('')}</div>` : ''}
  ${rangeSelector(getActiveConfig())}
  <div class="chart-panel tradingview-panel">
    <div class="chart-title"><h2>${title}</h2><p>Candles loaded: ${allCount} • Visible candles: ${candles.length} • Last close: ${fmtPrice(last?.close)}</p></div>
    <div id="main-chart" class="trading-chart" aria-label="TradingView-style candlestick chart"></div>
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

function addDummyPriceLines(candles) {
  if (!candleSeries || !candles.length) return;
  const lastClose = candles.at(-1).close;
  candleSeries.createPriceLine({
    price: lastClose,
    color: "#ef4444",
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dotted,
    axisLabelVisible: true,
    title: "Last"
  });

  if (!activeLayers["S/R"]) return;
  const recent = candles.slice(-80);
  const support = Math.min(...recent.map((c) => c.low));
  const resistance = Math.max(...recent.map((c) => c.high));
  candleSeries.createPriceLine({ price: support, color: "#22c55e", lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: true, title: "Support" });
  candleSeries.createPriceLine({ price: resistance, color: "#f97316", lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: true, title: "Resistance" });
}

function addDummyMarkers(candles) {
  if (!candleSeries || !activeLayers.Structure || candles.length < 8) {
    candleSeries?.setMarkers([]);
    return;
  }
  const labels = ["HL", "HH", "HL", "LH", "LL", "HH"];
  const start = Math.max(0, candles.length - 72);
  const step = Math.max(5, Math.floor((candles.length - start) / labels.length));
  const markers = labels.map((label, index) => {
    const candle = candles[Math.min(candles.length - 1, start + index * step)];
    const above = label === "HH" || label === "LH";
    return {
      time: Math.floor(candle.open_time / 1000),
      position: above ? "aboveBar" : "belowBar",
      color: above ? "#38bdf8" : "#a78bfa",
      shape: above ? "arrowDown" : "arrowUp",
      text: label
    };
  });
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
  const candles = getActiveCandles();
  if (!candles.length) {
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
  candleSeries.setData(toChartCandles(candles));
  addDummyPriceLines(candles);
  addDummyMarkers(candles);
  addDummyChannel(candles);
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
      return card(tf === "1W" ? "Weekly" : tf === "1D" ? "Daily" : tf, `Total candles: ${candles.length}<br>First date: ${fmtDate(candles[0])}<br>Last date: ${fmtDate(candles.at(-1))}<br>Last close: ${fmtPrice(candles.at(-1)?.close)}<br>Simple status: ${mtfStatus(tf)}`);
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

function renderDetail() {
  const el = qs('#detail-content');
  const grid = (items, cls='detail-grid') => `<div class="${cls}">${items.map(([a,b]) => card(a,b)).join('')}</div>`;
  const last = getLast(getActiveTimeframe());
  const data = {
    'Indicator': `<div class="selector-row">${['Volume','RSI','MACD','ATR','Volatility','Structure'].map(metric).join('')}</div>${grid([['Volume Status', last ? 'Loaded' : 'Waiting Data'],['Last Volume', fmtVolume(last?.volume)],['RSI','Placeholder'],['ATR','Placeholder'],['Volatility','Placeholder']], 'detail-grid six')}<div class="mini-chart"></div>`,
    'Pattern Summary': `${grid([['Trend', simpleTrend(getActiveTimeframe(), 'Uptrend', 'Downtrend')],['Structure','HH-HL placeholder'],['Nearest Zone','Pending logic'],['FVG Status','Placeholder'],['Channel Position','Placeholder'],['Warning','Real logic pending']], 'detail-grid six')}<div class="summary-box card">Chart and table now use real repository candles; pattern analysis cards remain placeholders for the next phase.</div>`,
    'Scenario Plan': `<h2>Multi-Scenario Planning</h2><p class="subtitle">Read-only planning context • not financial advice or a direct trading signal.</p><div class="chip-row">${['Bullish 8/10','Breakout 6/10','Wait 5/10','Bearish 4/10','Breakdown 2/10'].map((x,i)=>`<span class="chip ${i===0?'active':''}">${x}</span>`).join('')}</div><article class="card"><h2>Top Scenario: Bullish — 8/10</h2><div class="scenario-card">${[['Current Price',fmtPrice(last?.close)],['Watch Area','103,800 – 104,500'],['SL / Invalid','101,200'],['TP1','106,800'],['TP2','110,200'],['TP3','114,500'],['RR','1.2R / 2.4R / 3.6R'],['Status','Waiting Confirmation']].map(([a,b])=>`<div><span class="card-label">${a}</span><div class="card-value">${b}</div></div>`).join('')}</div></article>${grid([['Reason','Weekly HH-HL valid'],['Reason','4H bullish FVG active'],['Reason','Near support/channel'],['Risk','Invalid if close below SL']])}`,
    'Structure': `${grid([['Current Bias', simpleTrend(getActiveTimeframe(), 'Bullish', 'Bearish')],['Last Swing High','Pending logic'],['Last Swing Low','Pending logic'],['Last Label','Placeholder'],['BOS / CHoCH','Pending logic'],['Structure Risk','Medium']], 'detail-grid six')}<div class="sequence">HL → HH → HL → HH</div>`,
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
  renderSummary();
  renderWorkspace();
  renderDetail();
}

qs('#load-data').addEventListener('click', loadAllRepoData);
qs('#reset-cache').addEventListener('click', () => { localStorage.clear(); renderAll(); });
qs('.layer-control').addEventListener('click', (event) => {
  const button = event.target.closest('[data-layer]');
  if (!button) return;
  const layer = button.dataset.layer;
  activeLayers[layer] = !activeLayers[layer];
  button.classList.toggle('active', activeLayers[layer]);
  renderWorkspace();
});
renderAll();
loadAllRepoData();
