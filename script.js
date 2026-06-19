const workspaces = ["Weekly Map", "Daily + 4H Setup", "1H Timing", "MTF Summary"];
const details = ["Indicator", "Pattern Summary", "Scenario Plan", "Structure", "FVG", "S/R", "Channel", "Confluence", "Reaction Study", "Table"];
const summary = { "Weekly Bias": "Bullish", "Daily Context": "Confirm", "4H Setup": "Valid", "1H Timing": "Early", "Top Scenario": "Bullish 8/10", Risk: "Medium" };
let activeWorkspace = "Weekly Map";
let activeDetail = "Indicator";

const qs = (s) => document.querySelector(s);
const card = (label, value) => `<article class="card"><div class="card-label">${label}</div><div class="card-value">${value}</div></article>`;
const metric = (text) => `<span class="metric">${text}</span>`;

function renderTabs(target, items, active, onClickName) {
  qs(target).innerHTML = items.map((item) => `<button type="button" class="${item === active ? 'active' : ''}" onclick="${onClickName}('${item.replaceAll("'", "\\'")}')">${item}</button>`).join("");
}

function renderSummary() {
  qs('.summary-grid').innerHTML = Object.entries(summary).map(([k, v]) => `<article class="summary-card"><div class="card-label">${k}</div><div class="card-value">${v}</div></article>`).join('');
}

function chart(title, strip = []) {
  const heights = [58, 76, 45, 86, 115, 92, 132, 109, 146, 124, 168, 138, 188, 152, 178, 142, 202, 170, 214, 184, 232, 198, 248, 210];
  return `${strip.length ? `<div class="context-strip">${strip.map(metric).join('')}</div>` : ''}
  <div class="chart-panel">
    <div class="chart-title"><h2>${title}</h2><p>Candlestick placeholder • MA20 / MA50 / MA200 • HH / HL / LH / LL</p></div>
    <div class="annotation a1">FVG Zone</div><div class="annotation a2">Support / Resistance</div><div class="annotation a3">Channel Projection</div>
    <div class="candle-wrap">${heights.map((h, i) => `<div class="candle ${i % 5 === 2 ? 'down' : 'up'}" style="height:${h}px"></div>`).join('')}</div>
  </div>`;
}

function renderWorkspace() {
  const el = qs('#workspace-content');
  if (activeWorkspace === 'Weekly Map') el.innerHTML = chart('Weekly Map — Macro View');
  if (activeWorkspace === 'Daily + 4H Setup') el.innerHTML = chart('4H Setup Chart with Daily Context', ['Daily Bias', 'Daily FVG', 'Daily S/R', 'Daily Channel', 'Daily Warning']);
  if (activeWorkspace === '1H Timing') el.innerHTML = chart('1H Timing Chart', ['Weekly Bias', 'Daily Context', '4H Setup', 'Nearest Confluence']);
  if (activeWorkspace === 'MTF Summary') el.innerHTML = `<div class="mtf-grid">${[
    ['Weekly Macro Bias', 'Bullish macro HH-HL still intact'], ['Daily Confirmation', 'Confirm with active daily FVG'], ['4H Setup', 'Valid retest around confluence'], ['1H Timing', 'Early, waiting confirmation']
  ].map(([a,b]) => card(a,b)).join('')}</div><div class="summary-box card">Large MTF summary workspace placeholder. Use this view to compare timeframe alignment without a right sidebar.</div>`;
}

function setWorkspace(name) { activeWorkspace = name; renderTabs('.workspace-tabs', workspaces, activeWorkspace, 'setWorkspace'); renderWorkspace(); }
function setDetail(name) { activeDetail = name; renderTabs('.detail-tabs', details, activeDetail, 'setDetail'); renderDetail(); }

function renderDetail() {
  const el = qs('#detail-content');
  const grid = (items, cls='detail-grid') => `<div class="${cls}">${items.map(([a,b]) => card(a,b)).join('')}</div>`;
  const data = {
    'Indicator': `<div class="selector-row">${['Volume','RSI','MACD','ATR','Volatility','Structure'].map(metric).join('')}</div>${grid([['Volume Status','Strong'],['Rel Volume','1.8x'],['RSI','58 Neutral-Bullish'],['ATR','Normal'],['Volatility','Medium']], 'detail-grid six')}<div class="mini-chart"></div>`,
    'Pattern Summary': `${grid([['Trend','Uptrend'],['Structure','HH-HL valid'],['Nearest Zone','103,800 – 104,500'],['FVG Status','Active Bullish FVG'],['Channel Position','Near Midline'],['Warning','Resistance Nearby']], 'detail-grid six')}<div class="summary-box card">Dummy summary: market structure remains constructive while price is watching the nearest bullish confluence zone.</div>`,
    'Scenario Plan': `<h2>Multi-Scenario Planning</h2><p class="subtitle">Read-only planning context • not financial advice or a direct trading signal.</p><div class="chip-row">${['Bullish 8/10','Breakout 6/10','Wait 5/10','Bearish 4/10','Breakdown 2/10'].map((x,i)=>`<span class="chip ${i===0?'active':''}">${x}</span>`).join('')}</div><article class="card"><h2>Top Scenario: Bullish — 8/10</h2><div class="scenario-card">${[['Current Price','104,500'],['Watch Area','103,800 – 104,500'],['SL / Invalid','101,200'],['TP1','106,800'],['TP2','110,200'],['TP3','114,500'],['RR','1.2R / 2.4R / 3.6R'],['Status','Waiting Confirmation']].map(([a,b])=>`<div><span class="card-label">${a}</span><div class="card-value">${b}</div></div>`).join('')}</div></article>${grid([['Reason','Weekly HH-HL valid'],['Reason','4H bullish FVG active'],['Reason','Near support/channel'],['Risk','Invalid if close below SL']])}`,
    'Structure': `${grid([['Current Bias','Bullish'],['Last Swing High','108,000'],['Last Swing Low','101,200'],['Last Label','HL'],['BOS / CHoCH','None'],['Structure Risk','Medium']], 'detail-grid six')}<div class="sequence">HL → HH → HL → HH</div>`,
    'FVG': grid([['Nearest FVG','TF: 4H<br>Type: Bullish<br>Zone: 103,800 – 104,500<br>Status: Active'],['Daily FVG','Type: Bullish<br>Zone: 102,500 – 105,000<br>Status: Active'],['D+4H Confluence','Status: Active<br>Overlap: 103,800 – 104,500<br>Strength: Strong']]),
    'S/R': grid([['Nearest Support','Zone: 101,200 – 103,000<br>Source: 4H swing + Daily support<br>Distance: 1.1%'],['Nearest Resistance','Zone: 106,800 – 108,500<br>Source: Weekly resistance + EQH<br>Distance: 2.4%'],['Retest Zone','Zone: 103,800 – 104,500<br>Status: Watching']]),
    'Channel': grid([['Weekly Channel','Direction: Up<br>Position: Near Midline<br>Upper: 116,000<br>Mid: 104,500<br>Lower: 93,000'],['Daily Channel','Direction: Sideways<br>Status: No clear breakout'],['4H Channel','Direction: Up<br>Position: Near Lower Bound<br>Status: Active']]),
    'Confluence': grid([['Zone 1 — Strong','Area: 103,800 – 104,500<br>Sources: Daily FVG + 4H FVG + Support<br>Score: 8/10'],['Zone 2 — Moderate','Area: 100,000 – 101,200<br>Sources: Channel lower + S/R<br>Score: 6/10'],['Zone 3 — Risk Area','Area: 106,800 – 108,500<br>Sources: EQH + Resistance + Upper Channel<br>Score: 7/10']]),
    'Reaction Study': `<div class="selector-row">${['Event Type','Outcome Window','Target %','Range Basis'].map(metric).join('')}</div>${grid([['Total Events','18'],['Success Rate','61%'],['Failed','7'],['Avg Upside','12.4%'],['Avg Drawdown','-5.8%'],['Median Reaction','6 candles']], 'detail-grid six')}`,
    'Table': `<div class="table-wrap"><table><thead><tr>${['Date','Close','Change %','Volume','Rel Vol','Structure','FVG Event','Pattern'].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${Array.from({length:8},(_,i)=>`<tr><td>2026-06-${18-i}</td><td>${(104500-i*430).toLocaleString()}</td><td>${i%2?'-0.8%':'+1.4%'}</td><td>${(18200+i*700).toLocaleString()}</td><td>${(1.1+i*.1).toFixed(1)}x</td><td>${i%3?'HL':'HH'}</td><td>${i%2?'Filled':'Active'}</td><td>${i%2?'Retest':'Impulse'}</td></tr>`).join('')}</tbody></table></div>`
  };
  el.innerHTML = data[activeDetail];
}

renderSummary();
setWorkspace(activeWorkspace);
setDetail(activeDetail);
