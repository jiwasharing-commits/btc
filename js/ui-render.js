function renderTabs(target, items, active, onClickName) {
  qs(target).innerHTML = items.map((item) => `<button type="button" class="${item === active ? 'active' : ''}" onclick="${onClickName}('${item.replaceAll("'", "\\'")}')">${item}</button>`).join("");
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

function getZoneRiskLabel(timeframe = getActiveTimeframe()) {
  const context = srContexts[timeframe];
  if (!context?.available) return "No Clear Zone";
  const supportDistance = context.nearestSupport?.distancePct;
  const resistanceDistance = context.nearestResistance?.distancePct;
  if (Number.isFinite(resistanceDistance) && resistanceDistance <= 1.5) return "Near Resistance";
  if (Number.isFinite(supportDistance) && supportDistance <= 1.5) return "Near Support";
  return "Between Zones";
}

function renderSummary() {
  const latest = getGlobalLatestPrice();
  const oneHour = marketData["1H"];
  const oneHourTiming = oneHour.length > 1 && oneHour.at(-1).close > oneHour.at(-2).close ? "Early Up" : oneHour.length > 1 ? "Early Down" : "Neutral";
  const weekly = structureContexts["1W"] ?? createEmptyStructureContext("1W");
  const daily = structureContexts["1D"] ?? createEmptyStructureContext("1D");
  const fourH = structureContexts["4H"] ?? createEmptyStructureContext("4H");
  const oneH = structureContexts["1H"] ?? createEmptyStructureContext("1H");
  const channel = channelContexts[getActiveTimeframe()] ?? createEmptyChannelContext(getActiveTimeframe());
  const summary = {
    "Latest BTC Price": `${fmtPrice(latest.price)}<small>Source: ${latest.source}</small>`,
    "Weekly Bias": `${weekly.bias}<small>${weekly.status}</small>`,
    "Daily Context": `${daily.bias}<small>${daily.status}</small>`,
    "4H Setup": `${fourH.bias}<small>${fourH.bosChoch.status}</small>`,
    "1H Timing": `${oneH.bias}<small>${oneH.bosChoch.status}</small>`,
    "FVG Confluence": daily4hFvgConfluence.status === "Active Confluence" ? `Active D+4H ${daily4hFvgConfluence.type}` : daily4hFvgConfluence.status === "Conflict" ? "Conflict" : "No FVG Confluence",
    "Channel": channel.status,
    "Top Scenario": "Bullish 8/10",
    "Risk": getZoneRiskLabel()
  };
  qs('.summary-grid').innerHTML = Object.entries(summary).map(([k, v]) => `<article class="summary-card"><div class="card-label">${k}</div><div class="card-value">${v}</div></article>`).join('');
}

function rangeSelector(config) {
  if (!config?.ranges) return "";
  return `<div class="range-row">${config.ranges.map((range) => `<button type="button" class="${rangeState[activeWorkspace] === range ? 'active' : ''}" onclick="setRange('${range}')">${range}</button>`).join('')}</div>`;
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
      const sr = srContexts[tf] ?? createEmptySrContext(tf);
      const fvg = fvgContexts[tf] ?? createEmptyFvgContext(tf);
      const channel = channelContexts[tf] ?? createEmptyChannelContext(tf);
      return card(tf === "1W" ? "Weekly" : tf === "1D" ? "Daily" : tf, `Total candles: ${candles.length}<br>Last close: ${fmtPrice(candles.at(-1)?.close)}<br>${structure.status}<br>BOS/CHoCH: ${structure.bosChoch.status}<br>S/R: Support ${formatZone(sr.nearestSupport)} | Resistance ${formatZone(sr.nearestResistance)}<br>FVG: ${fvg.nearestFvg ? `${fvg.nearestFvg.status} ${fvg.nearestFvg.type}` : "None"}<br>Channel: ${channel.status}`);
    }).join('')}</div>`;
    return;
  }
  const config = getActiveConfig();
  el.innerHTML = chart(config.title, config.timeframe, getActiveCandles(), config.strip ?? []);
  requestAnimationFrame(renderTradingChart);
}
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

function getCurrentChannelReactionZone() {
  const context = channelContexts[getActiveTimeframe()];
  const price = marketData[getActiveTimeframe()]?.at(-1)?.close;
  if (!context?.available || !context.projectedLevels || !price) return null;
  const mid = context.projectedLevels.mid;
  return { lower: mid * 0.999, upper: mid * 1.001, status: context.status, distancePct: distanceToZonePct({ lower: mid, upper: mid }, price), strengthScore: 6, label: `${context.timeframe} Channel Midline` };
}

function renderMarketZonesCards() {
  const upside = marketZonesContext.upside[0];
  const downside = marketZonesContext.downside[0];
  const reaction = getCurrentChannelReactionZone();
  const zoneCard = (title, zone, type) => `<article class="market-zone-card"><div class="card-label">${title}</div><div class="sr-zone-value">${zone ? formatZone(zone) : "—"}</div><span class="zone-status">${zone?.status ?? "No Clear Zone"}</span><div class="zone-distance">${type ? `Type: ${type}<br>` : ""}Distance: ${formatDistance(zone?.distancePct)}<br>Strength: ${zone?.strengthScore ?? "—"}/10</div></article>`;
  return `<div class="summary-box card"><strong>MARKET ZONES</strong><br>${marketZonesContext.summary}</div><div class="market-zones-grid">${zoneCard("Upside Watch", upside, upside?.label)}${zoneCard("Downside Watch", downside, downside?.label)}${zoneCard("Current Reaction", reaction, reaction?.label)}</div>`;
}

function renderSrTab() {
  const activeTf = getActiveTimeframe();
  const context = srContexts[activeTf] ?? createEmptySrContext(activeTf);
  if (!context.available) return `<div class="summary-box card">${context.summary}</div>${renderMtfSrCards()}`;
  const zoneDetails = (zone) => zone ? `Zone: ${formatZone(zone)}<br>TF: ${zone.timeframe}<br>Status: ${zone.status}<br>Distance: ${formatDistance(zone.distancePct)}<br>Strength: ${zone.strengthScore}/10` : "No clear support/resistance detected";
  return `<div class="sr-card-grid">${[
    ["Nearest Support", zoneDetails(context.nearestSupport)],
    ["Nearest Resistance", zoneDetails(context.nearestResistance)],
    ["Strongest Support", context.strongestSupport ? `Zone: ${formatZone(context.strongestSupport)}<br>Touches: ${context.strongestSupport.touches}<br>Source: ${context.strongestSupport.source}` : "—"],
    ["Strongest Resistance", context.strongestResistance ? `Zone: ${formatZone(context.strongestResistance)}<br>Touches: ${context.strongestResistance.touches}<br>Source: ${context.strongestResistance.source}` : "—"]
  ].map(([title, body]) => `<article class="sr-card"><div class="card-label">${title}</div><div class="sr-zone-value">${body}</div></article>`).join('')}</div>${renderMtfSrCards()}`;
}

function renderMtfSrCards() {
  return `<div class="sr-card-grid">${["1W", "1D", "4H", "1H"].map((timeframe) => {
    const context = srContexts[timeframe] ?? createEmptySrContext(timeframe);
    return `<article class="sr-card"><div class="card-label">${timeframe === "1W" ? "Weekly S/R" : timeframe === "1D" ? "Daily S/R" : `${timeframe} S/R`}</div><div class="sr-zone-value">Support: ${formatZone(context.nearestSupport)}<br>Resistance: ${formatZone(context.nearestResistance)}</div><span class="sr-badge">${context.available ? "Active" : "Unavailable"}</span></article>`;
  }).join('')}</div>`;
}

function renderFvgTab() {
  const activeTf = getActiveTimeframe();
  const context = fvgContexts[activeTf] ?? createEmptyFvgContext(activeTf);
  const daily = fvgContexts["1D"]?.nearestFvg;
  const confluence = daily4hFvgConfluence;
  const detail = (fvg, tf = activeTf) => fvg ? `TF: ${tf}<br>Type: ${fvg.type}<br>Zone: ${formatZone(fvg)}<br>Status: ${fvg.status}<br>Distance: ${formatDistance(fvg.distancePct)}` : "No active FVG detected";
  const overlap = confluence.overlapLower ? `${fmtPrice(confluence.overlapLower)} – ${fmtPrice(confluence.overlapUpper)}` : "—";
  return `<div class="fvg-card-grid">${[
    ["Nearest FVG", detail(context.nearestFvg)],
    ["Daily FVG", detail(daily, "1D")],
    ["D+4H Confluence", `Status: ${confluence.status}<br>Overlap: ${overlap}<br>Strength: ${confluence.strength}<br>${confluence.note}`]
  ].map(([title, body]) => `<article class="fvg-card"><div class="card-label">${title}</div><div class="fvg-zone-value">${body}</div></article>`).join('')}</div>${renderMtfFvgCards()}`;
}

function renderMtfFvgCards() {
  return `<div class="fvg-card-grid">${["1W", "1D", "4H", "1H"].map((timeframe) => {
    const context = fvgContexts[timeframe] ?? createEmptyFvgContext(timeframe);
    const nearest = context.nearestFvg;
    return `<article class="fvg-card"><div class="card-label">${timeframe} FVG</div><span class="fvg-badge">${nearest ? nearest.status : "None"}</span><div class="fvg-zone-value">Nearest: ${nearest ? `${nearest.type} ${formatZone(nearest)}` : "No active FVG"}</div></article>`;
  }).join('')}</div>`;
}


function slopeLabel(context) {
  if (!Number.isFinite(context?.slope)) return "—";
  return context.slope > 0 ? "Up" : context.slope < 0 ? "Down" : "Flat";
}

function channelBoundaryDetail(context, key) {
  if (!context?.available || !context.projectedLevels) return "No clear channel detected";
  const price = context.projectedLevels[key];
  const currentPrice = marketData[context.timeframe]?.at(-1)?.close;
  return `Price: ${fmtPrice(price)}<br>Distance: ${formatDistance(distanceToZonePct({ lower: price, upper: price }, currentPrice))}`;
}

function renderMtfChannelCards() {
  return `<div class="channel-card-grid">${["1W", "1D", "4H", "1H"].map((timeframe) => {
    const context = channelContexts[timeframe] ?? createEmptyChannelContext(timeframe);
    return `<article class="channel-card"><div class="card-label">${timeframe === "1W" ? "Weekly Channel" : timeframe === "1D" ? "Daily Channel" : `${timeframe} Channel`}</div><span class="channel-badge">${context.status}</span><div class="channel-zone-value">Upper: ${fmtPrice(context.projectedLevels?.upper)}<br>Mid: ${fmtPrice(context.projectedLevels?.mid)}<br>Lower: ${fmtPrice(context.projectedLevels?.lower)}</div><div class="channel-note">${context.summary}</div></article>`;
  }).join('')}</div>`;
}

function renderChannelTab() {
  const activeTf = getActiveTimeframe();
  const context = channelContexts[activeTf] ?? createEmptyChannelContext(activeTf);
  if (!context.available) return `<div class="summary-box card">${context.summary}</div>${renderMtfChannelCards()}`;
  return `<div class="channel-card-grid">${[
    ["Active Channel", `TF: ${activeTf}<br>Direction: ${context.direction}<br>Status: ${context.status}<br>Position: ${context.position}<br>Width: ${formatDistance(context.widthPct)}<br>Slope: ${slopeLabel(context)}`],
    ["Upper Boundary", channelBoundaryDetail(context, "upper")],
    ["Midline", channelBoundaryDetail(context, "mid")],
    ["Lower Boundary", channelBoundaryDetail(context, "lower")]
  ].map(([title, body]) => `<article class="channel-card"><div class="card-label">${title}</div><div class="channel-zone-value">${body}</div></article>`).join('')}</div>${renderMtfChannelCards()}`;
}

function renderDetail() {
  const el = qs('#detail-content');
  const grid = (items, cls='detail-grid') => `<div class="${cls}">${items.map(([a,b]) => card(a,b)).join('')}</div>`;
  const last = getLast(getActiveTimeframe());
  const latest = getGlobalLatestPrice();
  const data = {
    'Indicator': `<div class="selector-row">${['Volume','RSI','MACD','ATR','Volatility','Structure'].map(metric).join('')}</div>${grid([['Volume Status', last ? 'Loaded' : 'Waiting Data'],['Last Volume', fmtVolume(last?.volume)],['RSI','Placeholder'],['ATR','Placeholder'],['Volatility','Placeholder']], 'detail-grid six')}<div class="mini-chart"></div>`,
    'Pattern Summary': `${grid([['Trend', simpleTrend(getActiveTimeframe(), 'Uptrend', 'Downtrend')],['Structure','HH-HL placeholder'],['Nearest Zone','Pending logic'],['FVG Status','Placeholder'],['Channel Position', (channelContexts[getActiveTimeframe()] ?? createEmptyChannelContext(getActiveTimeframe())).status],['Warning','Real logic pending']], 'detail-grid six')}<div class="summary-box card">Chart and table now use real repository candles; pattern analysis cards remain placeholders for the next phase.</div>${renderMarketZonesCards()}`,
    'Scenario Plan': `<h2>Multi-Scenario Planning</h2><p class="subtitle">Read-only planning context • not financial advice or a direct trading signal.</p><div class="chip-row">${['Bullish 8/10','Breakout 6/10','Wait 5/10','Bearish 4/10','Breakdown 2/10'].map((x,i)=>`<span class="chip ${i===0?'active':''}">${x}</span>`).join('')}</div><article class="card"><h2>Top Scenario: Bullish — 8/10</h2><div class="scenario-card">${[['Latest BTC Price',fmtPrice(latest.price)],['Watch Area','103,800 – 104,500'],['SL / Invalid','101,200'],['TP1','106,800'],['TP2','110,200'],['TP3','114,500'],['RR','1.2R / 2.4R / 3.6R'],['Status','Waiting Confirmation']].map(([a,b])=>`<div><span class="card-label">${a}</span><div class="card-value">${b}</div></div>`).join('')}</div></article>${grid([['Reason','Weekly HH-HL valid'],['Reason','4H bullish FVG active'],['Reason','Near support/channel'],['Risk','Invalid if close below SL']])}`,
    'Structure': (() => {
      const context = structureContexts[getActiveTimeframe()] ?? createEmptyStructureContext(getActiveTimeframe());
      return `${grid([['Active TF Bias', context.bias],['Structure Status', context.status],['Last Swing High', fmtPrice(context.lastSwingHigh?.price)],['Last Swing Low', fmtPrice(context.lastSwingLow?.price)],['BOS / CHoCH', context.bosChoch.status],['Sequence', formatStructureSequence(context)]], 'detail-grid six')}<div class="structure-note card">${context.summary}</div>${renderMtfStructureCards()}`;
    })(),
    'FVG': renderFvgTab(),
    'S/R': renderSrTab(),
    'Channel': renderChannelTab(),
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

window.BtcDash = window.BtcDash || {};
window.BtcDash.ui = {
  renderTabs,
  renderDataStatus,
  renderBinanceDebug,
  renderSummary,
  renderWorkspace,
  renderDetail,
  renderAll,
  renderTable,
  renderMarketZonesCards,
  renderSrTab,
  renderFvgTab,
  renderMtfStructureCards,
  renderMtfSrCards,
  renderMtfFvgCards,
  renderChannelTab,
  renderMtfChannelCards
};
