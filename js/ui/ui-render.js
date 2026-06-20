function renderTabs(target, items, active, onClickName) {
  const el = qs(target);
  if (!el) return;
  el.innerHTML = items.map((item) => `<button type="button" class="${item === active ? 'active' : ''}" onclick="${onClickName}('${item.replaceAll("'", "\\'")}')">${item}</button>`).join("");
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
  const autoUpdateButton = qs('#auto-update');
  if (autoUpdateButton) {
    autoUpdateButton.textContent = `Auto Update: ${autoUpdateEnabled ? "ON" : "OFF"}`;
    autoUpdateButton.classList.toggle('active', autoUpdateEnabled);
  }
}

function renderBinanceDebug() {
  const el = qs('#binance-debug-modal-body') || qs('#binance-debug');
  if (!el) return;
  const rows = ["1W", "1D", "4H", "1H"].map((timeframe) => {
    const debug = binanceDebug[timeframe];
    if (!debug) return `<div><strong>${timeframe}:</strong> waiting</div>`;
    if (debug.error) return `<div><strong>${timeframe}:</strong> failed — ${debug.error}</div>`;
    return `<div><strong>${timeframe}:</strong> last local close: ${debug.lastLocalClose ? new Date(debug.lastLocalClose).toLocaleString() : "—"} | fetched: ${debug.fetchedRows ?? 0} | added closed: ${debug.addedClosed ?? 0} | running: ${debug.running ? "yes" : "no"} | endpoint: ${debug.endpoint ?? "—"}</div>`;
  }).join('');
  el.innerHTML = `<div class="debug-title">Binance Debug</div>${rows}`;
}

function renderLayerControls() {
  document.querySelectorAll('.layer-control [data-layer]').forEach((button) => {
    button.classList.toggle('active', Boolean(activeLayers[button.dataset.layer]));
  });
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
    "Channel": channel.status,
    "Confluence": confluenceContext.strongestCandidate ? `${confluenceContext.strongestCandidate.scoreLabel.replace(" Context", "")} ${confluenceContext.strongestCandidate.score}/10` : "No Candidate",
    "Top Scenario": scenarioContext.primaryScenario ? `${scenarioContext.primaryScenario.label} ${scenarioContext.primaryScenario.score}/10<small>RR ${scenarioContext.primaryScenario.riskPlan?.quality || "Unavailable"} · Planning</small>` : "Scenario context not available",
    "Reaction": reactionStudyContext.strongestReaction ? `${reactionStudyContext.strongestReaction.reactionLabel.replace(" Historical Reaction", "")} ${reactionStudyContext.strongestReaction.reactionScore}/10` : "Reaction study not available",
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
      return card(tf === "1W" ? "Weekly" : tf === "1D" ? "Daily" : tf, `Total candles: ${candles.length}<br>Last close: ${fmtPrice(candles.at(-1)?.close)}<br>${structure.status}<br>BOS/CHoCH: ${structure.bosChoch.status}<br>S/R: Support ${formatZone(sr.nearestSupport)} | Resistance ${formatZone(sr.nearestResistance)}<br>FVG: ${fvg.nearestFvg ? `${fvg.nearestFvg.status} ${fvg.nearestFvg.type}` : "None"}<br>Channel: ${channel.status}<br>Confluence: ${confluenceContext.summary}<br>Scenario: ${scenarioContext.summary}<br>Risk Plan: ${scenarioContext.primaryScenario?.riskPlan?.available ? `Watch area available · RR ${scenarioContext.primaryScenario.riskPlan.quality}` : "Risk plan not available"}<br>Reaction: ${reactionStudyContext.summary}`);
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
  const sequence = context?.sequence || [];
  if (!sequence.length) return "No clear structure detected";
  return sequence.map((swing) => typeof swing === "string" ? swing : swing.label).filter(Boolean).join(" → ");
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

function getZoneConfluenceNote(zone) {
  if (!zone || !confluenceContext?.candidates?.length) return zone?.note ?? "—";
  const match = confluenceContext.candidates.find((candidate) => zone.midpoint >= candidate.lower && zone.midpoint <= candidate.upper);
  return match ? `Confluence Candidate · Score ${match.score}/10` : (zone.note ?? "—");
}

function getZoneReactionNote(zone) {
  if (!zone || !reactionStudyContext?.studiedZones?.length) return "";
  const match = reactionStudyContext.studiedZones.find((reaction) => zone.midpoint >= reaction.lower && zone.midpoint <= reaction.upper);
  return match ? `<br>Reaction: ${match.reactionLabel}` : "";
}

function renderMarketZonesCards() {
  const reaction = getCurrentChannelReactionZone();
  const strongest = confluenceContext.strongestCandidate;
  const zoneLine = (zone) => `<div class="market-zone-row"><strong>${zone.label}</strong><br>${formatZone(zone)} · ${formatDistance(zone.distancePct)}${getZoneReactionNote(zone)}</div>`;
  const zoneListCard = (title, rows) => `<article class="market-zone-card"><div class="card-label">${title}</div>${rows.length ? rows.slice(0, 3).map(zoneLine).join('') : '<div class="sr-zone-value">—</div>'}</article>`;
  const reactionCard = `<article class="market-zone-card"><div class="card-label">Current Reaction</div><div class="sr-zone-value">${reaction ? formatZone(reaction) : "—"}</div><span class="zone-status">${reaction?.status ?? "No Clear Zone"}</span><div class="zone-distance">Type: ${reaction?.label ?? "—"}<br>Note: ${getZoneConfluenceNote(reaction)}${getZoneReactionNote(reaction)}</div></article>`;
  const confluenceCard = `<article class="market-zone-card"><div class="card-label">Confluence Highlight</div><div class="sr-zone-value">${strongest ? formatZone(strongest) : "—"}</div><span class="zone-status">${strongest?.status ?? "No Candidate"}</span><div class="zone-distance">${strongest ? `${strongest.scoreLabel} ${strongest.score}/10<br>${strongest.label}` : "Planning context only"}</div></article>`;
  return `<div class="summary-box card"><strong>MARKET ZONES</strong><br>${marketZonesContext.summary}</div><div class="market-zones-grid">${zoneListCard("Upside Watch", marketZonesContext.upside)}${zoneListCard("Downside Watch", marketZonesContext.downside)}${reactionCard}${confluenceCard}</div>`;
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


function confluenceBadgeClass(status = "") {
  if (status.includes("Strong")) return "strong";
  if (status.includes("MTF")) return "mtf";
  if (status.includes("Mixed")) return "mixed";
  return "";
}

function renderConfluenceCandidateCard(title, candidate) {
  if (!candidate) {
    return `<article class="confluence-card"><div class="card-label">${title}</div><div class="confluence-zone-value">No confluence candidate detected</div><div class="confluence-note">For planning context only.</div></article>`;
  }
  const visibleSources = candidate.zones.slice(0, 4).map((zone) => `${zone.timeframe} ${zone.label}`);
  const sources = `${visibleSources.join(', ')}${candidate.zones.length > 4 ? ` +${candidate.zones.length - 4} more` : ''}`;
  const factors = candidate.scoreFactors?.slice(0, 3).map((factor) => `<li>${factor}</li>`).join('') || '<li>No score factors available</li>';
  const risks = candidate.riskFlags?.length ? `<ul class="confluence-risk-list">${candidate.riskFlags.slice(0, 3).map((risk) => `<li>${risk}</li>`).join('')}</ul>` : '<div class="confluence-note">Risk: No major conflict flags.</div>';
  return `<article class="confluence-card"><div class="card-label">${title}</div><span class="confluence-badge ${confluenceBadgeClass(candidate.status)}">${candidate.status}</span><div class="confluence-score"><span class="confluence-score-value">${candidate.score}/10</span><span class="confluence-score-label">${candidate.scoreLabel}</span></div><div class="confluence-zone-value">Zone: ${formatZone(candidate)}<br>Distance: ${formatDistance(candidate.distancePct)}<br>Relation: ${candidate.relation}</div><div class="confluence-source-list">Sources: ${sources}</div><ul class="confluence-factor-list">${factors}</ul>${risks}<div class="confluence-note">${candidate.note}</div></article>`;
}

function renderConfluenceTab() {
  const context = confluenceContext?.activeTimeframe === getActiveTimeframe() ? confluenceContext : rebuildConfluenceContext(getActiveTimeframe());
  if (!context.available) return `<div class="summary-box card">${context.summary}<br>For planning context only.</div>`;
  return `<div class="summary-box card"><strong>Confluence Candidate</strong><br>${context.summary}<br>For planning context only.</div><div class="confluence-card-grid">${[
    renderConfluenceCandidateCard("Strongest Candidate", context.strongestCandidate),
    renderConfluenceCandidateCard("Upside Candidate", context.upsideCandidates[0]),
    renderConfluenceCandidateCard("Downside Candidate", context.downsideCandidates[0]),
    renderConfluenceCandidateCard("Mixed / Conflict", context.mixedCandidates[0])
  ].join('')}</div>`;
}

function renderReactionCard(title, reaction) {
  if (!reaction) {
    return `<article class="reaction-card"><div class="card-label">${title}</div><div class="reaction-note">Reaction study not available</div></article>`;
  }
  const risk = reaction.riskFlags?.length ? `<ul class="reaction-risk-list">${reaction.riskFlags.slice(0, 2).map((flag) => `<li>${flag}</li>`).join('')}</ul>` : '<div class="reaction-note">Risk: No dominant historical failure flag.</div>';
  const notes = reaction.reactionNotes?.length ? `<div class="reaction-note">${reaction.reactionNotes.slice(0, 2).join(' ')}</div>` : `<div class="reaction-note">${reaction.note || "Historical reaction context."}</div>`;
  return `<article class="reaction-card"><div class="card-label">${title}</div><div class="reaction-zone-value">Zone: ${formatZone(reaction)}<br>Type: ${reaction.timeframe} ${reaction.zoneType}<br>Source: ${reaction.source}</div><div class="reaction-score"><span>${reaction.reactionScore}/10</span><span class="reaction-score-label">${reaction.reactionLabel}</span></div><ul class="reaction-stat-list"><li>Touches: ${reaction.touches}</li><li>Positive Reaction: ${reaction.positiveCount}</li><li>Break/Fail: ${reaction.breakCount}</li><li>Avg Move: ${formatDistance(reaction.averageMovePct)}</li><li>Avg Adverse: ${formatDistance(reaction.averageAdverseMovePct)}</li></ul>${risk}${notes}</article>`;
}

function renderReactionStudyTab() {
  const context = reactionStudyContext?.activeTimeframe === getActiveTimeframe() ? reactionStudyContext : rebuildReactionStudyContext(getActiveTimeframe());
  if (!context.available) return `<div class="summary-box card">${context.summary}<br>Historical reaction context · Planning context only.</div>`;
  return `<h2>Reaction Study</h2><p class="subtitle">Historical reaction context · Planning context only · For review only · No execution instruction.</p><div class="summary-box card"><strong>Reaction Quality</strong><br>${context.summary}</div><div class="reaction-card-grid">${[
    renderReactionCard("Strongest Reaction", context.strongestReaction),
    renderReactionCard("Watch Area Reaction", context.watchAreaReaction),
    renderReactionCard("Support Reaction", context.supportReactions[0]),
    renderReactionCard("Resistance Reaction", context.resistanceReactions[0]),
    renderReactionCard("FVG Reaction", context.fvgReactions[0]),
    renderReactionCard("Channel Reaction", context.channelReactions[0])
  ].join('')}</div>`;
}


function scenarioChipLabel(scenario) {
  const shortLabel = scenario.type.charAt(0).toUpperCase() + scenario.type.slice(1);
  return `${shortLabel} ${scenario.score}/10 · ${scenario.riskPlan?.available ? `RR ${scenario.riskPlan.quality}` : "No plan"}`;
}

function riskPlanTargetList(riskPlan) {
  if (!riskPlan?.targets?.length) return '<div class="risk-plan-note">Risk plan not available</div>';
  return `<ul class="risk-plan-target-list">${riskPlan.targets.map((target) => {
    const rr = riskPlan.rr?.targetRrs?.find((item) => item.id === target.id)?.rr;
    return `<li>${target.label}: ${fmtPrice(target.level)} | RR ${rr ?? '—'}</li>`;
  }).join('')}</ul>`;
}

function renderRiskPlanCards(riskPlan) {
  if (!riskPlan?.available) return `<div class="risk-plan-grid"><article class="risk-plan-card"><div class="card-label">Risk Plan</div><div class="risk-plan-note">${riskPlan?.notes?.[0] || 'Risk plan not available'}</div></article></div>`;
  return `<div class="risk-plan-grid">${[
    ['Watch Area', `<div class="risk-plan-zone">Zone: ${formatZone(riskPlan.watchArea)}<br>Source: ${riskPlan.watchArea.source}<br>Note: Reference only</div>`],
    ['Invalidation', `<div class="risk-plan-level">${riskPlan.invalidation.label}<br>Level: ${fmtPrice(riskPlan.invalidation.level)}<br>Note: ${riskPlan.invalidation.note}</div>`],
    ['Target Ladder', riskPlanTargetList(riskPlan)],
    ['RR Reference', `<div class="risk-plan-rr">Risk: ${formatDistance(riskPlan.rr?.riskPct)}<br>Best RR: ${riskPlan.rr?.bestRr ?? '—'}<br>Quality: ${riskPlan.quality}</div>`]
  ].map(([title, body]) => `<article class="risk-plan-card"><div class="card-label">${title}</div>${body}</article>`).join('')}</div>`;
}

function renderScenarioPlanTab() {
  const context = scenarioContext?.activeTimeframe === getActiveTimeframe() ? scenarioContext : rebuildScenarioContext(getActiveTimeframe());
  if (!context.available) return `<div class="summary-box card">${context.summary}<br>Planning context only.</div>`;
  const primary = context.primaryScenario || context.waitScenario;
  const chips = context.scenarios.map((scenario) => `<span class="scenario-chip ${scenario.isPrimary ? 'primary' : ''}">${scenarioChipLabel(scenario)}</span>`).join('');
  const list = (items, cls) => `<ul class="${cls}">${(items?.length ? items : ['Pending confirmation']).map((item) => `<li>${item}</li>`).join('')}</ul>`;
  const confluence = primary.confluenceCandidate ? `${primary.confluenceCandidate.scoreLabel} ${primary.confluenceCandidate.score}/10` : (confluenceContext.strongestCandidate ? `${confluenceContext.strongestCandidate.scoreLabel} ${confluenceContext.strongestCandidate.score}/10` : 'No confluence candidate');
  const watchReaction = reactionStudyContext.watchAreaReaction ? `Watch area reaction: ${reactionStudyContext.watchAreaReaction.reactionScore}/10 ${reactionStudyContext.watchAreaReaction.reactionLabel}` : "Watch area reaction not available";
  return `<h2>Multi-Scenario Planning</h2><p class="subtitle">Planning context only • For review only • No execution instruction.</p><div class="scenario-chip-grid">${chips}</div><article class="scenario-card primary"><div class="card-label">Primary Scenario</div><h2>${primary.label}</h2><div class="scenario-score">Score: ${primary.score}/10 — ${primary.scoreLabel}</div><p>${primary.status}</p><div class="channel-zone-value">Reference Zone: ${formatZone(primary.riskPlan?.watchArea || primary.referenceZone)}<br>Risk Plan: ${primary.riskPlan?.available ? `RR ${primary.riskPlan.quality}` : 'No directional plan'}<br>Reaction Study: ${watchReaction}<br>Scenario context: ${primary.summary}</div></article>${renderRiskPlanCards(primary.riskPlan)}<div class="scenario-card-grid">${[
    ['Scenario Zone', `Reference zone only<br>${formatZone(primary.riskPlan?.watchArea || primary.referenceZone)}<br><span class="scenario-pending-note">Exact execution area remains for later review</span>`],
    ['Confirmation Needed', list(primary.confirmationNeeds, 'scenario-reason-list')],
    ['Confluence', confluence],
    ['Risk Notes', `${list(primary.riskNotes, 'scenario-risk-list')}<div class="scenario-pending-note">Risk references are planning context only.</div>`]
  ].map(([title, body]) => `<article class="scenario-card"><div class="card-label">${title}</div><div>${body}</div></article>`).join('')}</div><div class="scenario-card-grid"><article class="scenario-card"><div class="card-label">Reasons</div>${list(primary.reasons, 'scenario-reason-list')}</article><article class="scenario-card"><div class="card-label">Pending Items</div>${list(primary.pendingItems, 'scenario-reason-list')}</article></div>`;
}

function renderDetail() {
  const el = qs('#detail-content');
  const grid = (items, cls='detail-grid') => `<div class="${cls}">${items.map(([a,b]) => card(a,b)).join('')}</div>`;
  const last = getLast(getActiveTimeframe());
  const latest = getGlobalLatestPrice();
  const data = {
    'Indicator': `<div class="selector-row">${['Volume','RSI','MACD','ATR','Volatility','Structure'].map(metric).join('')}</div>${grid([['Volume Status', last ? 'Loaded' : 'Waiting Data'],['Last Volume', fmtVolume(last?.volume)],['RSI','Placeholder'],['ATR','Placeholder'],['Volatility','Placeholder']], 'detail-grid six')}<div class="mini-chart"></div>`,
    'Pattern Summary': window.BtcDash.ui.panels?.patternSummary?.renderPanel?.() || `<div class="panel-empty-state">Pattern summary not available.</div>`,
    'Scenario Plan': renderScenarioPlanTab(),
    'Structure': window.BtcDash.ui.panels?.structure?.renderPanel?.() || (() => {
      const context = structureContexts[getActiveTimeframe()] ?? createEmptyStructureContext(getActiveTimeframe());
      return `${grid([['Active TF Bias', context.bias],['Structure Status', context.status],['Last Swing High', fmtPrice(context.lastSwingHigh?.price)],['Last Swing Low', fmtPrice(context.lastSwingLow?.price)],['BOS / CHoCH', context.bosChoch?.status],['Sequence', formatStructureSequence(context)]], 'detail-grid six')}<div class="structure-note card">${context.summary}</div>${renderMtfStructureCards()}`;
    })(),
    'FVG': renderFvgTab(),
    'S/R': renderSrTab(),
    'Channel': renderChannelTab(),
    'Confluence': renderConfluenceTab(),
    'Reaction Study': renderReactionStudyTab(),
    'Audit': window.BtcDash.ui.panels?.audit?.renderPanel?.() || '<div class="panel-empty-state">Audit not available.</div>',
    'Table': renderTable()
  };
  el.innerHTML = data[activeDetail];
}

function renderAuditCriticalBanner() {
  const existing = qs('#audit-critical-banner');
  const audit = window.BtcDash.state?.auditQualityContext;
  if (!audit?.criticalIssues?.length) { if (existing) existing.remove(); return; }
  const html = window.BtcDash.config?.AUDIT_QUALITY_CONFIG?.wording?.criticalBanner || "Analysis quality warning — review debug audit before relying on context.";
  if (existing) { existing.textContent = html; return; }
  const target = qs('.summary-grid') || qs('.workspace-tabs');
  if (!target?.parentNode) return;
  const banner = document.createElement('div');
  banner.id = 'audit-critical-banner';
  banner.className = 'audit-critical-banner';
  banner.textContent = html;
  target.parentNode.insertBefore(banner, target);
}

function renderAll() {
  renderTabs('.workspace-tabs', workspaces, activeWorkspace, 'setWorkspace');
  renderTabs('.detail-tabs', details, activeDetail, 'setDetail');
  renderLayerControls();
  renderDataStatus();
  renderBinanceDebug();
  renderAuditCriticalBanner();
  renderSummary();
  renderWorkspace();
  renderDetail();
}

function renderDashboardUi() {
  renderAll();
  const runtime = window.BtcDash.state?.uiRuntime;
  if (runtime) {
    runtime.activeBottomTab = activeDetail;
    runtime.activeWorkspace = activeWorkspace;
    runtime.lastRenderAt = new Date().toISOString();
    runtime.renderCount += 1;
  }
}
function renderHeader() { return true; }
function renderGlobalSummary() { return renderSummary(); }
function renderBottomTabs() { return renderTabs('.detail-tabs', details, activeDetail, 'setDetail'); }
function renderActivePanel() { return renderDetail(); }
function rerenderUi(reason = "manual") { renderDashboardUi(); return { reason, rendered: true }; }

window.BtcDash = window.BtcDash || {};
window.BtcDash.ui = {
  ...window.BtcDash.ui,
  renderTabs,
  renderDataStatus,
  renderBinanceDebug,
  renderLayerControls,
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
  renderMtfChannelCards,
  renderConfluenceTab,
  renderScenarioPlanTab,
  renderReactionStudyTab,
  renderAuditCriticalBanner,
  renderDashboardUi,
  renderHeader,
  renderGlobalSummary,
  renderBottomTabs,
  renderActivePanel,
  rerenderUi
};
window.BtcDash.ui.renderDashboard = renderDashboardUi;
window.renderDashboard = renderDashboardUi;
window.renderUi = renderDashboardUi;
