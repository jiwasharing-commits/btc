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

function createEmptySrContext(timeframe, reason = "No clear support/resistance detected") {
  return { available: false, timeframe, supportZones: [], resistanceZones: [], brokenZones: [], retestZones: [], nearestSupport: null, nearestResistance: null, strongestSupport: null, strongestResistance: null, summary: reason };
}

function buildRawSrLevelsFromSwings(timeframe) {
  const structure = structureContexts[timeframe];
  if (!structure?.available) return [];
  const config = SR_CONFIG[timeframe];
  return structure.labels.slice(-config.recentLookbackSwings).map((swing) => ({
    type: swing.type === "low" ? "support" : "resistance",
    price: swing.price,
    time: swing.time,
    label: `${timeframe} ${swing.label}`,
    source: "swing",
    swingLabel: swing.label
  }));
}

function clusterSrLevelsIntoZones(levels, timeframe) {
  const config = SR_CONFIG[timeframe];
  const zones = [];
  levels.sort((a, b) => a.price - b.price).forEach((level) => {
    const tolerance = level.price * (config.mergeTolerancePct / 100);
    const existing = zones.find((zone) => zone.type === level.type && Math.abs(zone.midpoint - level.price) <= tolerance);
    if (existing) {
      existing.lower = Math.min(existing.lower, level.price);
      existing.upper = Math.max(existing.upper, level.price);
      existing.midpoint = (existing.lower + existing.upper) / 2;
      existing.touches += 1;
      existing.labels = [...new Set([...existing.labels, level.swingLabel])];
      existing.lastTime = Math.max(existing.lastTime, level.time);
      existing.strengthScore = Math.min(10, existing.touches * 2 + existing.labels.length);
    } else {
      zones.push({ id: `${timeframe}-${level.type}-${zones.length + 1}`, type: level.type, lower: level.price, upper: level.price, midpoint: level.price, touches: 1, strengthScore: 3, source: `${timeframe} swings`, labels: [level.swingLabel], firstTime: level.time, lastTime: level.time, status: "active" });
    }
  });
  return zones.filter((zone) => zone.touches >= config.minTouches).sort((a, b) => b.strengthScore - a.strengthScore || b.lastTime - a.lastTime).slice(0, config.maxZones);
}

function distanceToZonePct(zone, price) {
  if (!zone || !price) return null;
  if (price >= zone.lower && price <= zone.upper) return 0;
  const edge = price < zone.lower ? zone.lower : zone.upper;
  return Math.abs(edge - price) / price * 100;
}

function deriveSrZoneStatus(zone, currentPrice, candles) {
  const last = candles.at(-1);
  const distance = distanceToZonePct(zone, currentPrice);
  if (!last || currentPrice == null) return "far";
  if (zone.type === "support" && last.close < zone.lower) return "broken";
  if (zone.type === "resistance" && last.close > zone.upper) return "broken";
  if (distance != null && distance <= 1) return "near";
  const previous = candles.at(-2);
  if (previous && zone.type === "support" && previous.close < zone.lower && last.close >= zone.lower) return "retest";
  if (previous && zone.type === "resistance" && previous.close > zone.upper && last.close <= zone.upper) return "retest";
  if (zone.type === "support" && zone.upper < currentPrice) return "active";
  if (zone.type === "resistance" && zone.lower > currentPrice) return "active";
  return "far";
}

function enrichSrZone(zone, timeframe, currentPrice, candles) {
  const status = deriveSrZoneStatus(zone, currentPrice, candles);
  return { ...zone, timeframe, status, distancePct: distanceToZonePct(zone, currentPrice) };
}

function buildSrContext(timeframe) {
  const candles = marketData[timeframe] || [];
  const structure = structureContexts[timeframe];
  if (!structure?.available || !candles.length) return createEmptySrContext(timeframe, "Structure not available");
  const currentPrice = candles.at(-1)?.close;
  const rawLevels = buildRawSrLevelsFromSwings(timeframe);
  const zones = clusterSrLevelsIntoZones(rawLevels, timeframe).map((zone) => enrichSrZone(zone, timeframe, currentPrice, candles));
  if (!zones.length) return createEmptySrContext(timeframe);
  const supportZones = zones.filter((zone) => zone.type === "support" && zone.status !== "broken").sort((a, b) => (a.distancePct ?? 999) - (b.distancePct ?? 999));
  const resistanceZones = zones.filter((zone) => zone.type === "resistance" && zone.status !== "broken").sort((a, b) => (a.distancePct ?? 999) - (b.distancePct ?? 999));
  const brokenZones = zones.filter((zone) => zone.status === "broken");
  const retestZones = zones.filter((zone) => zone.status === "retest");
  const strongestSupport = [...supportZones].sort((a, b) => b.strengthScore - a.strengthScore)[0] ?? null;
  const strongestResistance = [...resistanceZones].sort((a, b) => b.strengthScore - a.strengthScore)[0] ?? null;
  const context = { available: true, timeframe, supportZones, resistanceZones, brokenZones, retestZones, nearestSupport: supportZones[0] ?? null, nearestResistance: resistanceZones[0] ?? null, strongestSupport, strongestResistance, summary: `${SR_CONFIG[timeframe].label}: ${supportZones.length} support zones, ${resistanceZones.length} resistance zones.` };
  console.info("[S/R Context]", timeframe, { supportZones: supportZones.length, resistanceZones: resistanceZones.length, nearestSupport: context.nearestSupport, nearestResistance: context.nearestResistance });
  return context;
}

function zoneToMarketRow(zone, side, timeframe, currentPrice) {
  return { id: zone.id, side, zoneType: zone.type, timeframe, label: `${timeframe} ${zone.type === "support" ? "Support" : "Resistance"}`, lower: zone.lower, upper: zone.upper, midpoint: zone.midpoint, distancePct: distanceToZonePct(zone, currentPrice), strengthScore: zone.strengthScore, status: zone.status, source: zone.source, note: timeframe === "1W" || timeframe === "1D" ? "HTF context nearby" : "S/R only for now" };
}

function buildMarketZonesContext(activeTimeframe) {
  const currentPrice = marketData[activeTimeframe]?.at(-1)?.close;
  if (!currentPrice) return { upside: [], downside: [], nearestSupport: null, nearestResistance: null, activeTimeframe, summary: "No clear support/resistance detected" };
  const rows = [];
  [activeTimeframe, "1W", "1D", "4H"].filter((tf, i, arr) => arr.indexOf(tf) === i).forEach((timeframe) => {
    const context = srContexts[timeframe];
    if (context?.available) {
      [...context.supportZones, ...context.resistanceZones].forEach((zone) => {
        if (zone.midpoint > currentPrice) rows.push(zoneToMarketRow(zone, "upside", timeframe, currentPrice));
        if (zone.midpoint < currentPrice) rows.push(zoneToMarketRow(zone, "downside", timeframe, currentPrice));
      });
    }
    const fvgContext = fvgContexts[timeframe];
    if (fvgContext?.available) {
      fvgContext.activeFvgs.forEach((fvg) => {
        const side = fvg.midpoint >= currentPrice ? "upside" : "downside";
        rows.push({ id: fvg.id, side, zoneType: "fvg", timeframe, label: `${timeframe} ${fvg.type === "bullish" ? "Bullish" : "Bearish"} FVG`, lower: fvg.lower, upper: fvg.upper, midpoint: fvg.midpoint, distancePct: fvg.distancePct, strengthScore: fvg.strengthScore, status: fvg.status, source: fvg.source, note: "FVG confluence candidate" });
      });
    }
  });
  const upside = rows.filter((row) => row.side === "upside").sort((a, b) => a.distancePct - b.distancePct).slice(0, 3);
  const downside = rows.filter((row) => row.side === "downside").sort((a, b) => a.distancePct - b.distancePct).slice(0, 3);
  return { upside, downside, nearestSupport: downside[0] ?? null, nearestResistance: upside[0] ?? null, activeTimeframe, summary: "S/R only for now. FVG and channel will be added in later patches." };
}

function rebuildAllSrContexts() {
  ["1W", "1D", "4H", "1H"].forEach((timeframe) => { srContexts[timeframe] = buildSrContext(timeframe); });
  marketZonesContext = buildMarketZonesContext(getActiveTimeframe());
}

function createEmptyFvgContext(timeframe, reason = "No active FVG detected") {
  return { available: false, timeframe, bullishFvgs: [], bearishFvgs: [], activeFvgs: [], nearestBullishFvg: null, nearestBearishFvg: null, nearestFvg: null, summary: reason };
}

function deriveFvgStatus(fvg, candles) {
  let touched = false;
  for (const candle of candles.slice(fvg.createdAtIndex + 1)) {
    if (fvg.type === "bullish") {
      if (candle.low <= fvg.lower) return { status: "Filled", fillPct: 100 };
      if (candle.low < fvg.upper) touched = true;
    } else {
      if (candle.high >= fvg.upper) return { status: "Filled", fillPct: 100 };
      if (candle.high > fvg.lower) touched = true;
    }
  }
  return touched ? { status: "Partially Filled", fillPct: 50 } : { status: "Active", fillPct: 0 };
}

function scanFvgForTimeframe(timeframe) {
  const config = FVG_CONFIG[timeframe];
  const candles = (marketData[timeframe] || []).slice(-config.lookbackCandles);
  const fvgs = [];
  for (let i = 2; i < candles.length; i += 1) {
    const first = candles[i - 2];
    const third = candles[i];
    let fvg = null;
    if (first.high < third.low) fvg = { type: "bullish", lower: first.high, upper: third.low };
    if (first.low > third.high) fvg = { type: "bearish", lower: third.high, upper: first.low };
    if (!fvg) continue;
    const midpoint = (fvg.lower + fvg.upper) / 2;
    const sizePct = ((fvg.upper - fvg.lower) / midpoint) * 100;
    if (sizePct < config.minGapPct) continue;
    const globalIndex = (marketData[timeframe] || []).findIndex((c) => c.open_time === third.open_time);
    const base = { id: `${timeframe}-fvg-${third.open_time}`, timeframe, ...fvg, midpoint, sizePct, startTime: first.open_time, endTime: third.open_time, createdAtIndex: globalIndex, createdAtTime: third.open_time, source: "3-candle FVG", note: `${timeframe} ${fvg.type} FVG` };
    const status = deriveFvgStatus(base, marketData[timeframe] || []);
    fvgs.push({ ...base, ...status });
  }
  return fvgs;
}

function buildFvgContext(timeframe) {
  const candles = marketData[timeframe] || [];
  if (candles.length < 5) return createEmptyFvgContext(timeframe, "Not enough candles");
  const currentPrice = candles.at(-1)?.close;
  const all = scanFvgForTimeframe(timeframe).map((fvg) => ({ ...fvg, distancePct: distanceToZonePct(fvg, currentPrice), strengthScore: Math.min(10, Math.max(2, Math.round(fvg.sizePct * 2))) }));
  const bullishFvgs = all.filter((fvg) => fvg.type === "bullish");
  const bearishFvgs = all.filter((fvg) => fvg.type === "bearish");
  const activeFvgs = all.filter((fvg) => fvg.status === "Active" || fvg.status === "Partially Filled").sort((a, b) => (a.distancePct ?? 999) - (b.distancePct ?? 999)).slice(0, FVG_CONFIG[timeframe].maxActiveZones);
  const nearestBullishFvg = activeFvgs.find((fvg) => fvg.type === "bullish") ?? null;
  const nearestBearishFvg = activeFvgs.find((fvg) => fvg.type === "bearish") ?? null;
  const context = { available: Boolean(activeFvgs.length), timeframe, bullishFvgs, bearishFvgs, activeFvgs, nearestBullishFvg, nearestBearishFvg, nearestFvg: activeFvgs[0] ?? null, summary: activeFvgs.length ? `${FVG_CONFIG[timeframe].label}: ${activeFvgs.length} active/partial FVG zones.` : "No active FVG detected" };
  console.info("[FVG Context]", timeframe, { active: activeFvgs.length, nearestFvg: context.nearestFvg, bullish: bullishFvgs.length, bearish: bearishFvgs.length });
  return context;
}

function deriveDaily4hFvgConfluence() {
  const daily = fvgContexts["1D"]?.activeFvgs?.[0];
  const h4 = fvgContexts["4H"]?.activeFvgs?.[0];
  if (!daily || !h4) return { status: "None", type: null, overlapLower: null, overlapUpper: null, dailyFvg: daily ?? null, h4Fvg: h4 ?? null, strength: "Moderate", note: "No active Daily + 4H FVG pair" };
  const overlapLower = Math.max(daily.lower, h4.lower);
  const overlapUpper = Math.min(daily.upper, h4.upper);
  const hasOverlap = overlapLower < overlapUpper;
  const near = Math.abs(daily.midpoint - h4.midpoint) / h4.midpoint * 100 < 1.5;
  if (daily.type === h4.type && hasOverlap) return { status: "Active Confluence", type: daily.type, overlapLower, overlapUpper, dailyFvg: daily, h4Fvg: h4, strength: "Strong", note: "Daily and 4H FVG overlap in the same direction." };
  if (daily.type !== h4.type && (hasOverlap || near)) return { status: "Conflict", type: "mixed", overlapLower: hasOverlap ? overlapLower : null, overlapUpper: hasOverlap ? overlapUpper : null, dailyFvg: daily, h4Fvg: h4, strength: "Moderate", note: "Daily and 4H FVG are opposing nearby zones." };
  return { status: "None", type: null, overlapLower: null, overlapUpper: null, dailyFvg: daily, h4Fvg: h4, strength: "Moderate", note: "No Daily + 4H FVG overlap." };
}

function rebuildAllFvgContexts() {
  ["1W", "1D", "4H", "1H"].forEach((timeframe) => { fvgContexts[timeframe] = buildFvgContext(timeframe); });
  daily4hFvgConfluence = deriveDaily4hFvgConfluence();
}

window.BtcDash = window.BtcDash || {};
window.BtcDash.analysis = {
  createEmptyStructureContext,
  detectSwingPoints,
  classifySwingLabels,
  deriveStructureBias,
  deriveBosChoch,
  buildMarketStructureContext,
  rebuildAllStructureContexts,
  createEmptySrContext,
  buildRawSrLevelsFromSwings,
  clusterSrLevelsIntoZones,
  distanceToZonePct,
  deriveSrZoneStatus,
  enrichSrZone,
  buildSrContext,
  zoneToMarketRow,
  buildMarketZonesContext,
  rebuildAllSrContexts,
  createEmptyFvgContext,
  deriveFvgStatus,
  scanFvgForTimeframe,
  buildFvgContext,
  deriveDaily4hFvgConfluence,
  rebuildAllFvgContexts
};
