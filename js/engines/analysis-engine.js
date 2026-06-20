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


function createEmptyChannelContext(timeframe, reason = "No clear channel detected") {
  return {
    available: false,
    timeframe,
    status: "No Clear Channel",
    direction: "Unclear",
    upperLine: null,
    lowerLine: null,
    midLine: null,
    anchors: { highs: [], lows: [] },
    widthPct: null,
    slope: null,
    position: "Unavailable",
    projectedLevels: null,
    summary: reason
  };
}

function makeChannelLine(anchorA, anchorB, source) {
  if (!anchorA || !anchorB || anchorA.time === anchorB.time) return null;
  const [start, end] = anchorA.time < anchorB.time ? [anchorA, anchorB] : [anchorB, anchorA];
  return {
    startTime: start.time,
    startPrice: start.price,
    endTime: end.time,
    endPrice: end.price,
    slope: (end.price - start.price) / (end.time - start.time),
    source
  };
}

function projectLineAtTime(line, time) {
  if (!line || !Number.isFinite(Number(time))) return null;
  return line.startPrice + line.slope * (Number(time) - line.startTime);
}

function projectChannelAtTime(channel, time) {
  const upper = projectLineAtTime(channel?.upperLine, time);
  const lower = projectLineAtTime(channel?.lowerLine, time);
  if (!Number.isFinite(upper) || !Number.isFinite(lower)) return null;
  return { upper, lower, mid: (upper + lower) / 2 };
}

function buildChannelFromSwings(timeframe) {
  const structure = structureContexts[timeframe];
  const config = CHANNEL_CONFIG[timeframe];
  if (!structure?.available || !config) return null;
  const recent = structure.labels.slice(-config.maxLookbackSwings);
  const highs = recent.filter((swing) => swing.type === "high").slice(-config.minSwingPairs);
  const lows = recent.filter((swing) => swing.type === "low").slice(-config.minSwingPairs);
  if (highs.length < config.minSwingPairs || lows.length < config.minSwingPairs) return null;
  const upperLine = makeChannelLine(highs.at(-2), highs.at(-1), "swing-highs");
  const lowerLine = makeChannelLine(lows.at(-2), lows.at(-1), "swing-lows");
  if (!upperLine || !lowerLine) return null;
  const startTime = Math.max(Math.min(upperLine.startTime, upperLine.endTime), Math.min(lowerLine.startTime, lowerLine.endTime));
  const endTime = Math.max(upperLine.endTime, lowerLine.endTime);
  const startLevels = projectChannelAtTime({ upperLine, lowerLine }, startTime);
  const endLevels = projectChannelAtTime({ upperLine, lowerLine }, endTime);
  if (!startLevels || !endLevels || startLevels.upper <= startLevels.lower || endLevels.upper <= endLevels.lower) return null;
  const midLine = {
    startTime,
    startPrice: startLevels.mid,
    endTime,
    endPrice: endLevels.mid,
    slope: (endLevels.mid - startLevels.mid) / (endTime - startTime || 1),
    source: "channel-midline"
  };
  return { timeframe, upperLine, lowerLine, midLine, anchors: { highs, lows }, slope: (upperLine.slope + lowerLine.slope) / 2 };
}

function validateChannel(channel, candles, timeframe) {
  const config = CHANNEL_CONFIG[timeframe];
  const last = candles.at(-1);
  if (!channel || !last || !config) return null;
  const projected = projectChannelAtTime(channel, last.open_time);
  if (!projected || projected.upper <= projected.lower) return null;
  const widthPct = ((projected.upper - projected.lower) / projected.mid) * 100;
  if (!Number.isFinite(widthPct) || widthPct < config.minWidthPct || widthPct > config.maxWidthPct) return null;
  const newestAnchorIndex = Math.max(...[...channel.anchors.highs, ...channel.anchors.lows].map((swing) => swing.index ?? 0));
  if (candles.length - newestAnchorIndex > config.maxChannelAgeCandles) return null;
  const outsidePct = last.close > projected.upper ? ((last.close - projected.upper) / projected.mid) * 100 : last.close < projected.lower ? ((projected.lower - last.close) / projected.mid) * 100 : 0;
  if (outsidePct > widthPct) return null;
  return { ...channel, widthPct };
}

function deriveChannelStatus(channel, candles, timeframe) {
  const config = CHANNEL_CONFIG[timeframe];
  const last = candles.at(-1);
  const previous = candles.at(-2);
  const levels = projectChannelAtTime(channel, last.open_time);
  const previousLevels = previous ? projectChannelAtTime(channel, previous.open_time) : null;
  if (!last || !levels) return { status: "No Clear Channel", direction: "Unclear", position: "Unavailable", summary: "No clear channel detected" };
  const direction = channel.slope > 0 ? "Up" : channel.slope < 0 ? "Down" : "Sideways";
  const upperBreak = levels.upper * (1 + config.breakConfirmPct / 100);
  const lowerBreak = levels.lower * (1 - config.breakConfirmPct / 100);
  const upperDistance = Math.abs(levels.upper - last.close) / levels.mid * 100;
  const lowerDistance = Math.abs(last.close - levels.lower) / levels.mid * 100;
  const midDistance = Math.abs(last.close - levels.mid) / levels.mid * 100;
  const wasBrokenUp = previous && previousLevels && previous.close > previousLevels.upper * (1 + config.breakConfirmPct / 100);
  const wasBrokenDown = previous && previousLevels && previous.close < previousLevels.lower * (1 - config.breakConfirmPct / 100);
  let status = "Inside Channel";
  let position = "Inside";
  if (last.close > upperBreak) { status = "Broken Up"; position = "Above Upper"; }
  else if (last.close < lowerBreak) { status = "Broken Down"; position = "Below Lower"; }
  else if (wasBrokenUp && last.close <= levels.upper && last.close >= levels.lower) { status = "Reclaimed"; position = "Back Inside"; }
  else if (wasBrokenDown && last.close <= levels.upper && last.close >= levels.lower) { status = "Reclaimed"; position = "Back Inside"; }
  else if (wasBrokenUp && upperDistance <= config.touchTolerancePct) { status = "Retesting Upper"; position = "Upper Retest"; }
  else if (wasBrokenDown && lowerDistance <= config.touchTolerancePct) { status = "Retesting Lower"; position = "Lower Retest"; }
  else if (upperDistance <= config.touchTolerancePct) { status = "Near Upper"; position = "Near Upper"; }
  else if (lowerDistance <= config.touchTolerancePct) { status = "Near Lower"; position = "Near Lower"; }
  else if (midDistance <= config.touchTolerancePct) { status = "Near Midline"; position = "Near Midline"; }
  return { status, direction, position, summary: `${CHANNEL_CONFIG[timeframe].label}: ${status} (${direction}).` };
}

function buildChannelContext(timeframe) {
  const candles = marketData[timeframe] || [];
  const structure = structureContexts[timeframe];
  if (!structure?.available) return createEmptyChannelContext(timeframe, "Structure not available");
  const rawChannel = buildChannelFromSwings(timeframe);
  if (!rawChannel) return createEmptyChannelContext(timeframe, "No valid channel anchors");
  const validChannel = validateChannel(rawChannel, candles, timeframe);
  if (!validChannel) return createEmptyChannelContext(timeframe, "No valid channel from swings");
  const statusInfo = deriveChannelStatus(validChannel, candles, timeframe);
  const lastCandle = candles.at(-1);
  const projectedLevels = projectChannelAtTime(validChannel, lastCandle.open_time || lastCandle.time);
  const context = { available: true, timeframe, status: statusInfo.status, direction: statusInfo.direction, upperLine: validChannel.upperLine, lowerLine: validChannel.lowerLine, midLine: validChannel.midLine, anchors: validChannel.anchors, widthPct: validChannel.widthPct, slope: validChannel.slope, position: statusInfo.position, projectedLevels, summary: statusInfo.summary };
  console.info("[Channel Context]", timeframe, { available: context.available, status: context.status, direction: context.direction, widthPct: context.widthPct, projectedLevels });
  return context;
}

function rebuildAllChannelContexts() {
  ["1W", "1D", "4H", "1H"].forEach((timeframe) => { channelContexts[timeframe] = buildChannelContext(timeframe); });
  console.info("[Channel Contexts]", channelContexts);
}

function getProjectedChannelContextsForActiveTimeframe(activeTimeframe) {
  const mapping = activeTimeframe === "1W" ? ["1W"] : activeTimeframe === "4H" ? ["1W", "1D", "4H"] : activeTimeframe === "1H" ? ["1W", "1D", "4H", "1H"] : [activeTimeframe];
  return mapping.map((timeframe) => ({ timeframe, context: channelContexts[timeframe], isLocal: timeframe === activeTimeframe })).filter((item) => item.context?.available);
}

function channelBoundaryToMarketRow(context, boundary, activeTimeframe, currentPrice) {
  if (!context?.projectedLevels?.[boundary]) return null;
  const price = context.projectedLevels[boundary];
  const padPct = context.timeframe === "1W" ? 0.35 : context.timeframe === "1D" ? 0.22 : 0.12;
  const lower = price * (1 - padPct / 100);
  const upper = price * (1 + padPct / 100);
  const side = price >= currentPrice ? "upside" : "downside";
  const labelName = boundary === "upper" ? "Channel Upper" : boundary === "lower" ? "Channel Lower" : "Channel Midline";
  return { id: `${context.timeframe}-channel-${boundary}`, side, zoneType: "channel", timeframe: context.timeframe, label: `${context.timeframe} ${labelName}`, lower, upper, midpoint: price, distancePct: distanceToZonePct({ lower, upper }, currentPrice), strengthScore: context.timeframe === activeTimeframe ? 7 : 5, status: context.status, source: CHANNEL_CONFIG[context.timeframe]?.label ?? "Channel", note: context.timeframe === activeTimeframe ? "Local channel boundary" : `${context.timeframe} HTF channel boundary` };
}

function marketZonePriority(row) {
  const htfPriority = MARKET_ZONE_CLEANUP_CONFIG.htfPriority[row.timeframe] ?? 0;
  const score = row.score ?? row.confluenceScore ?? row.strengthScore ?? 0;
  const sourceCount = row.sourceCount ?? (row.note?.split("+").length || 1);
  const distance = Number.isFinite(row.distancePct) ? row.distancePct : 999;
  return (score * 10) + (sourceCount * 4) + htfPriority - distance;
}

function dedupeMarketZoneRows(rows, activeTimeframe) {
  const tolerance = CONFLUENCE_CONFIG.proximityPct[activeTimeframe] || 1;
  const sorted = rows.slice().sort((a, b) => marketZonePriority(b) - marketZonePriority(a));
  const deduped = [];
  sorted.forEach((row) => {
    const match = deduped.find((item) => Math.abs(item.midpoint - row.midpoint) / ((item.midpoint + row.midpoint) / 2) * 100 < tolerance && item.side === row.side);
    if (!match) {
      deduped.push({ ...row });
      return;
    }
    const sourceTypes = new Set([match.zoneType, row.zoneType].filter(Boolean).map((type) => type === "sr" ? "S/R" : type.toUpperCase()));
    match.lower = Math.min(match.lower, row.lower);
    match.upper = Math.max(match.upper, row.upper);
    match.midpoint = (match.lower + match.upper) / 2;
    match.strengthScore = Math.max(match.strengthScore ?? 0, row.strengthScore ?? 0);
    match.distancePct = Math.min(match.distancePct ?? 999, row.distancePct ?? 999);
    match.note = `${[...sourceTypes].join(" + ")} context`;
    if ((MARKET_ZONE_CLEANUP_CONFIG.htfPriority[row.timeframe] ?? 0) > (MARKET_ZONE_CLEANUP_CONFIG.htfPriority[match.timeframe] ?? 0)) {
      match.timeframe = row.timeframe;
      match.label = row.label;
      match.source = row.source;
    }
  });
  return deduped.sort((a, b) => (a.distancePct ?? 999) - (b.distancePct ?? 999));
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
  getProjectedChannelContextsForActiveTimeframe(activeTimeframe).forEach(({ context }) => {
    ["upper", "mid", "lower"].forEach((boundary) => {
      const row = channelBoundaryToMarketRow(context, boundary, activeTimeframe, currentPrice);
      if (row) rows.push(row);
    });
  });
  const upside = dedupeMarketZoneRows(rows.filter((row) => row.side === "upside"), activeTimeframe).slice(0, MARKET_ZONE_CLEANUP_CONFIG.maxUpsideRows);
  const downside = dedupeMarketZoneRows(rows.filter((row) => row.side === "downside"), activeTimeframe).slice(0, MARKET_ZONE_CLEANUP_CONFIG.maxDownsideRows);
  console.info("[UI Cleanup]", { activeWorkspace, activeTimeframe, marketZoneRows: { raw: rows.length, upside: upside.length, downside: downside.length } });
  return { upside, downside, nearestSupport: downside[0] ?? null, nearestResistance: upside[0] ?? null, activeTimeframe, summary: "S/R + FVG + Channel. Planning context only." };
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


function createEmptyConfluenceContext(reason = "No confluence candidate detected") {
  return { available: false, activeTimeframe: null, candidates: [], strongestCandidate: null, upsideCandidates: [], downsideCandidates: [], mixedCandidates: [], summary: reason };
}

function normalizeZoneForConfluence(zone, sourceType, timeframe) {
  if (!zone || zone.status === "Filled") return null;
  const lower = Number(zone.lower);
  const upper = Number(zone.upper);
  const midpoint = Number(zone.midpoint || ((lower + upper) / 2));
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || !Number.isFinite(midpoint) || lower > upper) return null;
  return {
    id: zone.id || `${timeframe}-${sourceType}-${lower}-${upper}`,
    sourceType,
    timeframe,
    label: zone.label || zone.zoneType || zone.type || sourceType,
    side: zone.side || null,
    zoneType: zone.zoneType || zone.type || sourceType,
    type: zone.type || null,
    lower,
    upper,
    midpoint,
    status: zone.status || "active",
    strengthScore: zone.strengthScore || null,
    source: zone.source || sourceType,
    note: zone.note || ""
  };
}

function pushUniqueConfluenceZone(zones, zone) {
  const normalized = zone;
  if (!normalized || zones.some((item) => item.id === normalized.id && item.sourceType === normalized.sourceType)) return;
  zones.push(normalized);
}

function collectConfluenceZones(activeTimeframe) {
  const zones = [];
  [...(marketZonesContext.upside || []), ...(marketZonesContext.downside || [])].forEach((zone) => pushUniqueConfluenceZone(zones, normalizeZoneForConfluence(zone, zone.zoneType || "market", zone.timeframe || activeTimeframe)));
  ["1W", "1D", "4H", "1H"].forEach((timeframe) => {
    const sr = srContexts[timeframe];
    if (sr?.available) {
      [sr.nearestSupport, sr.nearestResistance, sr.strongestSupport, sr.strongestResistance, ...(sr.supportZones || []).slice(0, 3), ...(sr.resistanceZones || []).slice(0, 3)].forEach((zone) => pushUniqueConfluenceZone(zones, normalizeZoneForConfluence(zone, "sr", timeframe)));
    }
    const fvg = fvgContexts[timeframe];
    if (fvg?.available) {
      [fvg.nearestFvg, fvg.nearestBullishFvg, fvg.nearestBearishFvg, ...(fvg.activeFvgs || []).slice(0, 4)].forEach((zone) => pushUniqueConfluenceZone(zones, normalizeZoneForConfluence(zone, "fvg", timeframe)));
    }
    const channel = channelContexts[timeframe];
    if (channel?.available && channel.projectedLevels) {
      ["upper", "mid", "lower"].forEach((boundary) => {
        const price = channel.projectedLevels[boundary];
        const padPct = boundary === "mid" ? 0.12 : 0.3;
        const labelName = boundary === "upper" ? "Channel Upper" : boundary === "lower" ? "Channel Lower" : "Channel Midline";
        pushUniqueConfluenceZone(zones, normalizeZoneForConfluence({ id: `${timeframe}-channel-${boundary}-confluence`, zoneType: "channel", label: `${timeframe} ${labelName}`, lower: price * (1 - padPct / 100), upper: price * (1 + padPct / 100), midpoint: price, status: channel.status, source: CHANNEL_CONFIG[timeframe]?.label, note: boundary === "mid" ? "Channel midline reaction" : "Channel boundary" }, "channel", timeframe));
      });
    }
  });
  return zones;
}

function zonesOverlapOrNear(a, b, activeTimeframe) {
  const overlapLower = Math.max(a.lower, b.lower);
  const overlapUpper = Math.min(a.upper, b.upper);
  const hasOverlap = overlapLower <= overlapUpper;
  const distancePct = Math.abs(a.midpoint - b.midpoint) / ((a.midpoint + b.midpoint) / 2) * 100;
  const tolerance = CONFLUENCE_CONFIG.proximityPct[activeTimeframe] || 1;
  return { matches: hasOverlap || distancePct <= tolerance, relation: hasOverlap ? CONFLUENCE_CONFIG.overlapBonusLabel : CONFLUENCE_CONFIG.proximityLabel, overlapLower: hasOverlap ? overlapLower : null, overlapUpper: hasOverlap ? overlapUpper : null, distancePct };
}

function zoneBiasType(zone) {
  const label = `${zone.label} ${zone.zoneType} ${zone.type ?? ""}`.toLowerCase();
  if (label.includes("support") || label.includes("bullish") || label.includes("lower")) return "support";
  if (label.includes("resistance") || label.includes("bearish") || label.includes("upper")) return "resistance";
  return "neutral";
}

function classifyConfluenceSide(zones, currentPrice) {
  const midpoint = zones.reduce((sum, zone) => sum + zone.midpoint, 0) / zones.length;
  const biasTypes = new Set(zones.map(zoneBiasType).filter((type) => type !== "neutral"));
  if (biasTypes.has("support") && biasTypes.has("resistance")) return "mixed";
  if (midpoint > currentPrice) return "upside";
  if (midpoint < currentPrice) return "downside";
  return "mixed";
}

function makeConfluenceCandidate(zones, relation, activeTimeframe, currentPrice) {
  const uniqueZones = [...new Map(zones.map((zone) => [zone.id, zone])).values()];
  if (uniqueZones.length < CONFLUENCE_CONFIG.minSourcesForCandidate) return null;
  const lower = Math.min(...uniqueZones.map((zone) => zone.lower));
  const upper = Math.max(...uniqueZones.map((zone) => zone.upper));
  const midpoint = uniqueZones.reduce((sum, zone) => sum + zone.midpoint, 0) / uniqueZones.length;
  const side = classifyConfluenceSide(uniqueZones, currentPrice);
  const sourceTypes = [...new Set(uniqueZones.map((zone) => zone.sourceType))];
  const timeframes = [...new Set(uniqueZones.map((zone) => zone.timeframe))];
  const sourceCount = uniqueZones.length;
  const status = side === "mixed" ? "Mixed / Conflict Candidate" : sourceCount >= CONFLUENCE_CONFIG.minSourcesForStrong ? "Strong Confluence Candidate" : timeframes.length >= 2 ? "MTF Alignment" : "Confluence Candidate";
  const labels = uniqueZones.map((zone) => zone.label).slice(0, 4);
  return { id: `confluence-${activeTimeframe}-${labels.join("-").replace(/\W+/g, "-")}`, label: labels.join(" + "), side, lower, upper, midpoint, distancePct: distanceToZonePct({ lower, upper }, currentPrice), relation, sourceCount, timeframes, sourceTypes, zones: uniqueZones, status, note: `${relation}: ${labels.join(" aligns with ")}. For planning context only.`, score: 0, scoreLabel: "Very Weak Context", scoreFactors: [], scoreNotes: [], riskFlags: [] };
}

function buildConfluenceCandidates(activeTimeframe) {
  const zones = collectConfluenceZones(activeTimeframe);
  const candles = marketData[activeTimeframe] || [];
  const lastClosed = candles.at(-1);
  if (!zones.length || !lastClosed) return createEmptyConfluenceContext();
  const candidates = [];
  for (let i = 0; i < zones.length; i += 1) {
    for (let j = i + 1; j < zones.length; j += 1) {
      const relation = zonesOverlapOrNear(zones[i], zones[j], activeTimeframe);
      if (!relation.matches) continue;
      const group = [zones[i], zones[j]];
      zones.forEach((zone, index) => {
        if (index === i || index === j) return;
        if (group.some((candidateZone) => zonesOverlapOrNear(candidateZone, zone, activeTimeframe).matches)) group.push(zone);
      });
      const candidate = makeConfluenceCandidate(group, relation.relation, activeTimeframe, lastClosed.close);
      if (candidate && !candidates.some((existing) => existing.id === candidate.id)) candidates.push(candidate);
    }
  }
  if (!candidates.length) return createEmptyConfluenceContext();
  return { available: true, activeTimeframe, candidates, strongestCandidate: null, upsideCandidates: [], downsideCandidates: [], mixedCandidates: [], summary: `${candidates.length} confluence candidates detected` };
}


function getConfluenceScoreLabel(score) {
  return (CONFLUENCE_SCORE_CONFIG.labels.find((item) => score >= item.min) ?? CONFLUENCE_SCORE_CONFIG.labels.at(-1)).label;
}

function deriveConfluenceScore(candidate, activeTimeframe) {
  const cfg = CONFLUENCE_SCORE_CONFIG;
  const weights = cfg.weights;
  let score = 0;
  const factors = [];
  const notes = [];
  const riskFlags = [];
  if (candidate.sourceCount >= 4) { score += 2.5; factors.push(`${candidate.sourceCount} aligned zone sources`); }
  else if (candidate.sourceCount >= 3) { score += weights.sourceCount; factors.push("3 aligned zone sources"); }
  else if (candidate.sourceCount >= 2) { score += 1; factors.push("2 aligned zone sources"); }

  if (candidate.timeframes.length >= 3) { score += weights.timeframeCount; factors.push("3+ timeframe alignment"); }
  else if (candidate.timeframes.length === 2) { score += 1.25; factors.push(`${candidate.timeframes.join(" + ")} alignment`); }
  else if (candidate.timeframes.length === 1) { score += 0.5; factors.push(`${candidate.timeframes[0]} local alignment`); }

  if (candidate.relation === CONFLUENCE_CONFIG.overlapBonusLabel) { score += weights.overlap; factors.push("Zone overlap"); }
  else { score += weights.proximity; factors.push("Zones nearby"); }

  const structure = structureContexts[activeTimeframe];
  const bias = structure?.bias ?? "Unclear";
  const alignedWithStructure = (candidate.side === "downside" && (bias === "Bullish" || bias === "Range")) || (candidate.side === "upside" && (bias === "Bearish" || bias === "Range"));
  if (alignedWithStructure) { score += weights.structureAlignment; factors.push(`${bias} structure context alignment`); }
  else if (bias === "Mixed" || bias === "Unclear") { score += 0.75; notes.push(`${bias} structure gives limited confirmation`); }
  else if (candidate.side !== "mixed") { score -= 1; riskFlags.push(`Candidate conflicts with ${bias} structure`); }

  let sourceTypeBonus = 0;
  if (candidate.sourceTypes.includes("sr") || candidate.sourceTypes.includes("support") || candidate.sourceTypes.includes("resistance")) { sourceTypeBonus += weights.srSupport; factors.push("S/R source present"); }
  if (candidate.sourceTypes.includes("fvg")) { sourceTypeBonus += weights.fvgSupport; factors.push("FVG source present"); }
  if (candidate.sourceTypes.includes("channel")) { sourceTypeBonus += weights.channelSupport; factors.push("Channel source present"); }
  score += Math.min(2, sourceTypeBonus);

  const distanceLimit = cfg.distanceQualityPct[activeTimeframe] ?? 1;
  if (Number.isFinite(candidate.distancePct)) {
    if (candidate.distancePct === 0) { score += weights.nearCurrentPrice; notes.push("Price is inside candidate zone"); }
    else if (candidate.distancePct <= distanceLimit) { score += weights.nearCurrentPrice; factors.push("Candidate is near current closed price"); }
    else { score += weights.weakDistancePenalty; riskFlags.push(`Candidate is farther than ${distanceLimit}% quality range`); }
  }

  if (candidate.status === "Mixed / Conflict Candidate") {
    score += weights.conflictPenalty;
    riskFlags.push("Mixed source direction");
  }
  score = Math.max(0, Math.min(cfg.maxScore, Number(score.toFixed(1))));
  return { score, scoreLabel: getConfluenceScoreLabel(score), scoreFactors: factors, scoreNotes: notes, riskFlags };
}

function buildConfluenceContext(activeTimeframe) {
  const context = buildConfluenceCandidates(activeTimeframe);
  if (!context.available) return context;
  const enriched = (context.candidates || []).map((candidate) => ({ ...candidate, ...deriveConfluenceScore(candidate, activeTimeframe) }));
  const sorted = enriched.slice().sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.sourceCount !== a.sourceCount) return b.sourceCount - a.sourceCount;
    return (a.distancePct ?? 999) - (b.distancePct ?? 999);
  }).slice(0, CONFLUENCE_CONFIG.maxCandidates);
  return { ...context, candidates: sorted, strongestCandidate: sorted[0] || null, upsideCandidates: sorted.filter((candidate) => candidate.side === "upside").slice(0, 3), downsideCandidates: sorted.filter((candidate) => candidate.side === "downside").slice(0, 3), mixedCandidates: sorted.filter((candidate) => candidate.side === "mixed").slice(0, 3), summary: sorted[0] ? `${sorted[0].scoreLabel} ${sorted[0].score}/10: ${sorted[0].label}` : "No confluence candidate detected" };
}

function rebuildConfluenceContext(activeTimeframe) {
  const tf = activeTimeframe || getActiveTimeframe();
  confluenceContext = buildConfluenceContext(tf);
  console.info("[Confluence Context]", { activeTimeframe: tf, candidates: confluenceContext?.candidates?.length || 0, strongestCandidate: confluenceContext?.strongestCandidate });
  return confluenceContext;
}


const SCENARIO_PENDING_ITEMS = [
  "Invalidation reference will be calculated in Patch 8",
  "TP ladder will be calculated in Patch 8",
  "RR will be calculated in Patch 8"
];

function createEmptyScenarioContext(reason = "Scenario context not available") {
  return { available: false, activeTimeframe: null, scenarios: [], primaryScenario: null, bullishScenario: null, bearishScenario: null, breakoutScenario: null, breakdownScenario: null, waitScenario: null, summary: reason };
}

function buildScenarioInputSnapshot(activeTimeframe) {
  const candles = marketData[activeTimeframe] || [];
  const lastClosed = candles.at(-1) || null;
  return { activeTimeframe, currentPrice: lastClosed?.close || null, lastClosed, structure: structureContexts?.[activeTimeframe] || null, weeklyStructure: structureContexts?.["1W"] || null, dailyStructure: structureContexts?.["1D"] || null, h4Structure: structureContexts?.["4H"] || null, h1Structure: structureContexts?.["1H"] || null, marketZones: marketZonesContext || null, confluence: confluenceContext || null, sr: srContexts?.[activeTimeframe] || null, fvg: fvgContexts?.[activeTimeframe] || null, channel: channelContexts?.[activeTimeframe] || null };
}

function getScenarioScoreLabel(score) {
  const found = (SCENARIO_CONFIG.scoreLabels || []).find((item) => score >= item.min);
  return found ? found.label : "Low Quality Context";
}

function normalizeScenarioScore(score) {
  return Math.max(0, Math.min(SCENARIO_CONFIG.maxScenarioScore, Number(score.toFixed(1))));
}

function makeScenarioBase(type, overrides = {}) {
  return { id: `scenario-${type}`, type, label: SCENARIO_CONFIG.labels[type], available: true, isPrimary: false, score: 0, scoreLabel: "Low Quality Context", status: "Scenario context developing", direction: type === "bullish" || type === "breakout" ? "bullish" : type === "bearish" || type === "breakdown" ? "bearish" : "neutral", referenceZone: null, confluenceCandidate: null, structureAlignment: "neutral", confirmationNeeds: [], reasons: [], riskNotes: [], pendingItems: [...SCENARIO_PENDING_ITEMS], summary: "Planning context only", riskPlan: createEmptyRiskPlan(), ...overrides };
}

function fallbackZoneFromMarketZones(snapshot, side) {
  const zone = side === "downside" ? snapshot.marketZones?.downside?.[0] : snapshot.marketZones?.upside?.[0];
  return zone || null;
}

function structureFits(structure, allowed) {
  return allowed.includes(structure?.bias || "Unclear");
}

function buildBullishScenario(snapshot) {
  const candidate = snapshot.confluence?.downsideCandidates?.[0] || null;
  const referenceZone = candidate || fallbackZoneFromMarketZones(snapshot, "downside") || snapshot.sr?.nearestSupport || snapshot.fvg?.nearestBullishFvg || null;
  const fits = structureFits(snapshot.structure, ["Bullish", "Range", "Mixed"]);
  return makeScenarioBase("bullish", { available: Boolean(referenceZone), status: "Support reaction context developing", referenceZone, confluenceCandidate: candidate, structureAlignment: fits ? "aligned" : "conflict", reasons: [candidate ? "Downside confluence candidate available" : "Downside reference zone available", `Structure is ${snapshot.structure?.bias || "unclear"}`, "Support/FVG/Channel lower alignment detected"], riskNotes: ["Requires confirmation from lower timeframe reaction", "No invalidation/TP calculated yet"], confirmationNeeds: ["1H/4H reaction confirmation required"], summary: "Bullish scenario context for review only" });
}

function buildBearishScenario(snapshot) {
  const candidate = snapshot.confluence?.upsideCandidates?.[0] || null;
  const referenceZone = candidate || fallbackZoneFromMarketZones(snapshot, "upside") || snapshot.sr?.nearestResistance || snapshot.fvg?.nearestBearishFvg || null;
  const fits = structureFits(snapshot.structure, ["Bearish", "Range", "Mixed"]);
  return makeScenarioBase("bearish", { available: Boolean(referenceZone), status: "Resistance reaction context developing", referenceZone, confluenceCandidate: candidate, structureAlignment: fits ? "aligned" : "conflict", reasons: [candidate ? "Upside confluence candidate available" : "Upside reference zone available", `Structure is ${snapshot.structure?.bias || "unclear"}`, "Resistance/FVG/Channel upper alignment detected"], riskNotes: ["Requires confirmation from lower timeframe reaction", "No invalidation/TP calculated yet"], confirmationNeeds: ["1H/4H reaction confirmation required"], summary: "Bearish scenario context for review only" });
}

function buildBreakoutScenario(snapshot) {
  const bos = snapshot.structure?.bosChoch?.status || "None";
  const candidate = snapshot.confluence?.upsideCandidates?.[0] || null;
  const referenceZone = candidate || fallbackZoneFromMarketZones(snapshot, "upside");
  const confirming = bos === "BOS Up" || bos === "CHoCH Up" || snapshot.structure?.bias === "Bullish";
  return makeScenarioBase("breakout", { available: Boolean(referenceZone || confirming), status: "Breakout context developing", referenceZone, confluenceCandidate: candidate, structureAlignment: confirming ? "aligned" : "neutral", reasons: [confirming ? `${bos} / bullish structure context present` : "Breakout confirmation not present yet", candidate ? "Upside confluence candidate available" : "Upside boundary context available", "Watch for resistance/channel upper reaction context"], riskNotes: ["Needs retest confirmation", "Breakout failure risk exists", "No invalidation/TP calculated yet"], confirmationNeeds: ["Close continuation and retest confirmation required"], summary: "Breakout scenario context for review only" });
}

function buildBreakdownScenario(snapshot) {
  const bos = snapshot.structure?.bosChoch?.status || "None";
  const candidate = snapshot.confluence?.downsideCandidates?.[0] || null;
  const referenceZone = candidate || fallbackZoneFromMarketZones(snapshot, "downside");
  const confirming = bos === "BOS Down" || bos === "CHoCH Down" || snapshot.structure?.bias === "Bearish";
  return makeScenarioBase("breakdown", { available: Boolean(referenceZone || confirming), status: "Breakdown context developing", referenceZone, confluenceCandidate: candidate, structureAlignment: confirming ? "aligned" : "neutral", reasons: [confirming ? `${bos} / bearish structure context present` : "Breakdown confirmation not present yet", candidate ? "Downside confluence candidate available" : "Downside boundary context available", "Watch for support/channel lower reaction context"], riskNotes: ["Needs retest confirmation", "Breakdown failure risk exists", "No invalidation/TP calculated yet"], confirmationNeeds: ["Close continuation and retest confirmation required"], summary: "Breakdown scenario context for review only" });
}

function buildWaitScenario(snapshot, otherScenarios) {
  const bestDirectional = Math.max(...otherScenarios.map((scenario) => scenario.confluenceCandidate?.score || 0), 0);
  const mixed = snapshot.structure?.bias === "Mixed" || snapshot.structure?.bias === "Unclear" || snapshot.confluence?.mixedCandidates?.length;
  return makeScenarioBase("wait", { available: true, status: "Waiting for clearer scenario context", direction: "neutral", referenceZone: null, confluenceCandidate: snapshot.confluence?.strongestCandidate || null, structureAlignment: mixed ? "neutral" : "aligned", reasons: [bestDirectional < 5 ? "No high-quality scenario context" : "Directional scenarios need confirmation", mixed ? "Structure or confluence is mixed" : "Waiting for confirmation near key zones", "Better wait for confirmation"], riskNotes: ["No execution instruction", "Directional risk references unavailable for wait scenario"], confirmationNeeds: ["Wait for cleaner structure/confluence confirmation"], summary: "Wait scenario context for review only" });
}


function createEmptyRiskPlan(reason = "Risk plan not available") {
  return { available: false, watchArea: null, invalidation: null, targets: [], rr: null, quality: "Unavailable", notes: [reason] };
}

function getScenarioDirection(scenario) {
  if (!scenario) return "neutral";
  if (scenario.type === "bullish" || scenario.type === "breakout") return "bullish";
  if (scenario.type === "bearish" || scenario.type === "breakdown") return "bearish";
  return "neutral";
}

function normalizeRiskZone(zone, fallbackLabel = "Reference zone") {
  if (!zone) return null;
  const lower = Number(zone.lower ?? zone.zoneLower);
  const upper = Number(zone.upper ?? zone.zoneUpper);
  const midpoint = Number(zone.midpoint ?? zone.level ?? ((lower + upper) / 2));
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || !Number.isFinite(midpoint)) return null;
  return { available: true, label: zone.label || fallbackLabel, lower: Math.min(lower, upper), upper: Math.max(lower, upper), midpoint, source: zone.source || zone.zoneType || fallbackLabel, timeframe: zone.timeframe || getActiveTimeframe(), note: "Reference watch area only" };
}

function deriveScenarioWatchArea(scenario, snapshot) {
  const direction = getScenarioDirection(scenario);
  if (direction === "neutral") return null;
  const candidates = direction === "bullish"
    ? [scenario.confluenceCandidate, snapshot.confluence?.downsideCandidates?.[0], snapshot.sr?.nearestSupport, snapshot.fvg?.nearestBullishFvg, snapshot.marketZones?.downside?.[0]]
    : [scenario.confluenceCandidate, snapshot.confluence?.upsideCandidates?.[0], snapshot.sr?.nearestResistance, snapshot.fvg?.nearestBearishFvg, snapshot.marketZones?.upside?.[0]];
  if (snapshot.channel?.available && snapshot.channel.projectedLevels) {
    const key = direction === "bullish" ? "lower" : "upper";
    const level = snapshot.channel.projectedLevels[key];
    candidates.push({ label: `${snapshot.activeTimeframe} Channel ${key}`, lower: level * 0.998, upper: level * 1.002, midpoint: level, source: "channel", timeframe: snapshot.activeTimeframe });
    candidates.push({ label: `${snapshot.activeTimeframe} Channel midline`, lower: snapshot.channel.projectedLevels.mid * 0.999, upper: snapshot.channel.projectedLevels.mid * 1.001, midpoint: snapshot.channel.projectedLevels.mid, source: "channel", timeframe: snapshot.activeTimeframe });
  }
  return normalizeRiskZone(candidates.find(Boolean), "Scenario watch area");
}

function deriveScenarioInvalidation(scenario, watchArea, snapshot) {
  const direction = getScenarioDirection(scenario);
  if (!watchArea?.available || direction === "neutral") return null;
  const bufferPct = RISK_PLAN_CONFIG.bufferPct[snapshot.activeTimeframe] ?? 0.5;
  const buffer = watchArea.midpoint * (bufferPct / 100);
  const level = direction === "bullish" ? watchArea.lower - buffer : watchArea.upper + buffer;
  return { available: true, level, label: direction === "bullish" ? "Below watch area" : "Above watch area", bufferPct, note: "Invalidation reference only" };
}

function collectTargetZones(snapshot, direction) {
  const zones = [];
  const add = (zone, label) => { const normalized = normalizeRiskZone(zone, label); if (normalized) zones.push(normalized); };
  if (direction === "bullish") {
    (snapshot.marketZones?.upside || []).forEach((zone) => add(zone, "Upside market zone"));
    (snapshot.confluence?.upsideCandidates || []).forEach((zone) => add(zone, "Upside confluence"));
    add(snapshot.sr?.nearestResistance, "Nearest resistance");
    add(snapshot.fvg?.nearestBearishFvg, "Bearish FVG reference");
    if (snapshot.channel?.available) add({ label: `${snapshot.activeTimeframe} Channel upper`, lower: snapshot.channel.projectedLevels.upper * 0.998, upper: snapshot.channel.projectedLevels.upper * 1.002, midpoint: snapshot.channel.projectedLevels.upper, source: "channel", timeframe: snapshot.activeTimeframe }, "Channel upper");
  } else {
    (snapshot.marketZones?.downside || []).forEach((zone) => add(zone, "Downside market zone"));
    (snapshot.confluence?.downsideCandidates || []).forEach((zone) => add(zone, "Downside confluence"));
    add(snapshot.sr?.nearestSupport, "Nearest support");
    add(snapshot.fvg?.nearestBullishFvg, "Bullish FVG reference");
    if (snapshot.channel?.available) add({ label: `${snapshot.activeTimeframe} Channel lower`, lower: snapshot.channel.projectedLevels.lower * 0.998, upper: snapshot.channel.projectedLevels.lower * 1.002, midpoint: snapshot.channel.projectedLevels.lower, source: "channel", timeframe: snapshot.activeTimeframe }, "Channel lower");
  }
  return zones;
}

function deriveScenarioTargetLadder(scenario, watchArea, invalidation, snapshot) {
  const direction = getScenarioDirection(scenario);
  if (!watchArea?.available || !invalidation?.available || direction === "neutral") return [];
  const targets = collectTargetZones(snapshot, direction)
    .filter((zone) => direction === "bullish"
      ? zone.midpoint > snapshot.currentPrice && zone.midpoint > watchArea.upper && zone.midpoint > invalidation.level
      : zone.midpoint < snapshot.currentPrice && zone.midpoint < watchArea.lower && zone.midpoint < invalidation.level)
    .sort((a, b) => direction === "bullish" ? a.midpoint - b.midpoint : b.midpoint - a.midpoint);
  const deduped = [];
  targets.forEach((zone) => {
    if (deduped.some((existing) => Math.abs(existing.midpoint - zone.midpoint) / zone.midpoint * 100 < 0.25)) return;
    deduped.push(zone);
  });
  return deduped.slice(0, RISK_PLAN_CONFIG.maxTargets).map((zone, index) => ({ id: `tp${index + 1}`, label: `TP${index + 1} Reference`, level: zone.midpoint, zoneLower: zone.lower, zoneUpper: zone.upper, source: zone.source, timeframe: zone.timeframe, distancePct: distanceToZonePct({ lower: zone.lower, upper: zone.upper }, snapshot.currentPrice), note: "Target reference only" }));
}

function calculateRiskReward(scenario, watchArea, invalidation, targets, snapshot) {
  const direction = getScenarioDirection(scenario);
  if (!watchArea?.available || !invalidation?.available || !targets.length || direction === "neutral") return { risk: null, riskPct: null, targetRrs: [], bestRr: null, quality: "Unavailable" };
  const reference = watchArea.midpoint;
  const risk = direction === "bullish" ? reference - invalidation.level : invalidation.level - reference;
  const riskPct = risk / reference * 100;
  if (!Number.isFinite(risk) || risk <= 0 || riskPct < RISK_PLAN_CONFIG.minRiskPct) return { risk, riskPct, targetRrs: [], bestRr: null, quality: "Unavailable" };
  const targetRrs = targets.map((target) => {
    const reward = direction === "bullish" ? target.level - reference : reference - target.level;
    return { id: target.id, rr: Number((reward / risk).toFixed(2)) };
  }).filter((item) => item.rr > 0);
  const bestRr = targetRrs.length ? Math.max(...targetRrs.map((item) => item.rr)) : null;
  const tp1 = targetRrs[0]?.rr ?? 0;
  const quality = riskPct > (RISK_PLAN_CONFIG.maxRiskPct[snapshot.activeTimeframe] ?? 5) ? "Weak" : tp1 >= RISK_PLAN_CONFIG.minRewardRisk && targetRrs.length >= 2 ? "Good" : tp1 >= 1 ? "Developing" : targetRrs.length ? "Weak" : "Unavailable";
  return { risk, riskPct: Number(riskPct.toFixed(2)), targetRrs, bestRr, quality };
}

function buildScenarioRiskPlan(scenario, snapshot) {
  const direction = getScenarioDirection(scenario);
  if (direction === "neutral") return createEmptyRiskPlan("No directional scenario");
  const watchArea = deriveScenarioWatchArea(scenario, snapshot);
  if (!watchArea?.available) return createEmptyRiskPlan("No valid watch area");
  const invalidation = deriveScenarioInvalidation(scenario, watchArea, snapshot);
  if (!invalidation?.available) return createEmptyRiskPlan("No valid invalidation reference");
  const targets = deriveScenarioTargetLadder(scenario, watchArea, invalidation, snapshot);
  const rr = calculateRiskReward(scenario, watchArea, invalidation, targets, snapshot);
  return { available: Boolean(targets.length && rr?.quality !== "Unavailable"), watchArea, invalidation, targets, rr, quality: rr?.quality || "Unavailable", notes: ["Reference only", "Use closed candle context", "Needs confirmation before any planning decision"] };
}

function deriveScenarioPlanningScore(scenario, snapshot) {
  let score = (scenario.confluenceCandidate?.score || 0) * 0.45;
  if (scenario.type === "wait") score = 4;
  if (scenario.structureAlignment === "aligned") score += 2;
  else if (scenario.structureAlignment === "neutral") score += 1;
  else if (scenario.structureAlignment === "conflict") score -= 1;
  if (scenario.referenceZone) score += 1;
  const bos = snapshot.structure?.bosChoch?.status || "None";
  const bullishConfirm = scenario.direction === "bullish" && (bos === "BOS Up" || bos === "CHoCH Up");
  const bearishConfirm = scenario.direction === "bearish" && (bos === "BOS Down" || bos === "CHoCH Down");
  if (bullishConfirm || bearishConfirm) score += 1;
  const heavyRisks = scenario.riskNotes.filter((note) => /failure|conflict|no execution instruction/i.test(note)).length;
  score -= Math.min(2, heavyRisks * 0.5);
  if (scenario.riskPlan && !scenario.riskPlan.available && scenario.type !== "wait") score -= 0.75;
  if (!scenario.available && scenario.type !== "wait") score = 0;
  score = normalizeScenarioScore(score);
  return { score, scoreLabel: getScenarioScoreLabel(score) };
}

function selectPrimaryScenario(scenarios) {
  const directional = scenarios.filter((scenario) => scenario.type !== "wait" && scenario.available);
  const wait = scenarios.find((scenario) => scenario.type === "wait");
  const mixedDominant = confluenceContext?.mixedCandidates?.[0]?.score >= 6;
  if (!directional.length || Math.max(...directional.map((scenario) => scenario.score), 0) < 5 || mixedDominant) {
    wait.isPrimary = true;
    return wait;
  }
  const priority = { breakout: 0, breakdown: 0, bullish: 1, bearish: 1, wait: 2 };
  const primary = directional.slice().sort((a, b) => b.score - a.score || priority[a.type] - priority[b.type])[0] || wait;
  primary.isPrimary = true;
  return primary;
}

function buildScenarioContext(activeTimeframe) {
  const snapshot = buildScenarioInputSnapshot(activeTimeframe);
  if (!snapshot.currentPrice) return createEmptyScenarioContext("No active closed candle");
  const bullish = buildBullishScenario(snapshot);
  const bearish = buildBearishScenario(snapshot);
  const breakout = buildBreakoutScenario(snapshot);
  const breakdown = buildBreakdownScenario(snapshot);
  const preliminary = [bullish, bearish, breakout, breakdown];
  const wait = buildWaitScenario(snapshot, preliminary);
  const scenarios = [bullish, bearish, breakout, breakdown, wait].map((scenario) => {
    const riskPlan = scenario.type === "wait" ? createEmptyRiskPlan("Wait scenario has no directional risk plan") : buildScenarioRiskPlan(scenario, snapshot);
    const withRiskPlan = { ...scenario, riskPlan };
    return { ...withRiskPlan, ...deriveScenarioPlanningScore(withRiskPlan, snapshot) };
  });
  const primaryScenario = selectPrimaryScenario(scenarios);
  return { available: true, activeTimeframe, scenarios, primaryScenario, bullishScenario: scenarios.find((scenario) => scenario.type === "bullish"), bearishScenario: scenarios.find((scenario) => scenario.type === "bearish"), breakoutScenario: scenarios.find((scenario) => scenario.type === "breakout"), breakdownScenario: scenarios.find((scenario) => scenario.type === "breakdown"), waitScenario: scenarios.find((scenario) => scenario.type === "wait"), summary: primaryScenario ? `${primaryScenario.label}: ${primaryScenario.score}/10 ${primaryScenario.scoreLabel}` : "Scenario context not available" };
}

function rebuildScenarioContext(activeTimeframe) {
  const tf = activeTimeframe || getActiveTimeframe();
  scenarioContext = buildScenarioContext(tf);
  console.info("[Scenario Context]", { activeTimeframe: tf, primaryScenario: scenarioContext.primaryScenario, scenarios: scenarioContext.scenarios?.length || 0 });
  return scenarioContext;
}

function createEmptyReactionStudyContext(reason = "Reaction study not available") {
  return { available: false, activeTimeframe: null, studiedZones: [], strongestReaction: null, supportReactions: [], resistanceReactions: [], fvgReactions: [], channelReactions: [], watchAreaReaction: null, summary: reason };
}

function normalizeReactionStudyZone(zone, zoneType, timeframe, direction = null) {
  if (!zone) return null;
  const lower = Number(zone.lower ?? zone.zoneLower ?? zone.level);
  const upper = Number(zone.upper ?? zone.zoneUpper ?? zone.level);
  const midpoint = Number(zone.midpoint ?? zone.level ?? ((lower + upper) / 2));
  if (![lower, upper, midpoint].every(Number.isFinite)) return null;
  if (zone.status === "Filled") return null;
  const normalizedType = zoneType || zone.zoneType || zone.type || "mixed";
  const inferredDirection = direction
    || (normalizedType === "support" || zone.type === "bullish" || zone.label?.toLowerCase().includes("lower") ? "supportive" : null)
    || (normalizedType === "resistance" || zone.type === "bearish" || zone.label?.toLowerCase().includes("upper") ? "resistive" : "mixed");
  return {
    id: zone.id || `${timeframe}-${normalizedType}-${lower}-${upper}`,
    label: zone.label || `${timeframe} ${normalizedType}`,
    zoneType: normalizedType,
    direction: inferredDirection,
    timeframe,
    lower: Math.min(lower, upper),
    upper: Math.max(lower, upper),
    midpoint,
    source: zone.source || normalizedType,
    status: zone.status || "active",
    note: zone.note || ""
  };
}

function collectReactionStudyZones(activeTimeframe) {
  const zones = [];
  const add = (zone, zoneType, timeframe = activeTimeframe, direction = null) => {
    const normalized = normalizeReactionStudyZone(zone, zoneType, timeframe, direction);
    if (normalized && !zones.some((item) => Math.abs(item.midpoint - normalized.midpoint) / normalized.midpoint < 0.001 && item.zoneType === normalized.zoneType)) zones.push(normalized);
  };
  (marketZonesContext?.upside || []).forEach((zone) => add(zone, zone.zoneType, zone.timeframe, "resistive"));
  (marketZonesContext?.downside || []).forEach((zone) => add(zone, zone.zoneType, zone.timeframe, "supportive"));
  const sr = srContexts[activeTimeframe];
  add(sr?.nearestSupport, "support", activeTimeframe, "supportive");
  add(sr?.nearestResistance, "resistance", activeTimeframe, "resistive");
  add(sr?.strongestSupport, "support", activeTimeframe, "supportive");
  add(sr?.strongestResistance, "resistance", activeTimeframe, "resistive");
  (sr?.supportZones || []).slice(0, 3).forEach((zone) => add(zone, "support", activeTimeframe, "supportive"));
  (sr?.resistanceZones || []).slice(0, 3).forEach((zone) => add(zone, "resistance", activeTimeframe, "resistive"));
  const fvg = fvgContexts[activeTimeframe];
  [...(fvg?.activeFvgs || []), fvg?.nearestFvg, fvg?.nearestBullishFvg, fvg?.nearestBearishFvg].forEach((zone) => {
    if (zone?.status !== "Filled") add(zone, "fvg", activeTimeframe, zone?.type === "bearish" ? "resistive" : zone?.type === "bullish" ? "supportive" : "mixed");
  });
  const channel = channelContexts[activeTimeframe];
  if (channel?.available && channel.projectedLevels) {
    const width = channel.projectedLevels.mid * 0.0025;
    add({ label: `${activeTimeframe} Channel Upper`, lower: channel.projectedLevels.upper - width, upper: channel.projectedLevels.upper + width, midpoint: channel.projectedLevels.upper, source: "channel" }, "channel", activeTimeframe, "resistive");
    add({ label: `${activeTimeframe} Channel Midline`, lower: channel.projectedLevels.mid - width, upper: channel.projectedLevels.mid + width, midpoint: channel.projectedLevels.mid, source: "channel" }, "channel", activeTimeframe, "mixed");
    add({ label: `${activeTimeframe} Channel Lower`, lower: channel.projectedLevels.lower - width, upper: channel.projectedLevels.lower + width, midpoint: channel.projectedLevels.lower, source: "channel" }, "channel", activeTimeframe, "supportive");
  }
  add(confluenceContext?.strongestCandidate, "confluence", activeTimeframe, confluenceContext?.strongestCandidate?.side === "upside" ? "resistive" : confluenceContext?.strongestCandidate?.side === "downside" ? "supportive" : "mixed");
  add(scenarioContext?.primaryScenario?.riskPlan?.watchArea, "watchArea", activeTimeframe, getScenarioDirection(scenarioContext?.primaryScenario) === "bearish" ? "resistive" : getScenarioDirection(scenarioContext?.primaryScenario) === "bullish" ? "supportive" : "mixed");
  return zones.slice(0, REACTION_STUDY_CONFIG.maxZonesToStudy);
}

function isCandleTouchingZone(candle, zone, timeframe) {
  const tolerancePct = REACTION_STUDY_CONFIG.touchTolerancePct[timeframe] || 1;
  const midpoint = zone.midpoint || ((zone.lower + zone.upper) / 2);
  const distancePct = Math.min(Math.abs(candle.close - midpoint), Math.abs(candle.high - midpoint), Math.abs(candle.low - midpoint)) / midpoint * 100;
  const overlaps = candle.high >= zone.lower && candle.low <= zone.upper;
  const bodyTouches = Math.max(candle.open, candle.close) >= zone.lower && Math.min(candle.open, candle.close) <= zone.upper;
  if (!overlaps && distancePct > tolerancePct) return { touched: false, touchType: "none", distancePct };
  return { touched: true, touchType: bodyTouches ? "body" : overlaps ? "wick" : Math.abs(candle.close - midpoint) / midpoint * 100 <= tolerancePct ? "close" : "near", distancePct };
}

function classifyReactionOutcome(zone, touchIndex, candles, timeframe) {
  const windowSize = REACTION_STUDY_CONFIG.reactionWindowCandles[timeframe] || 12;
  const threshold = REACTION_STUDY_CONFIG.bounceThresholdPct[timeframe] || 1;
  const breakPct = REACTION_STUDY_CONFIG.breakConfirmPct[timeframe] || 0.5;
  const touch = candles[touchIndex];
  const after = candles.slice(touchIndex + 1, touchIndex + 1 + windowSize);
  if (!touch || !after.length) return { outcome: "No Clear Reaction", direction: "neutral", maxMovePct: 0, adverseMovePct: 0, reactionCandles: 0, note: "Not enough candles after touch." };
  const highest = Math.max(...after.map((candle) => candle.high));
  const lowest = Math.min(...after.map((candle) => candle.low));
  const closeAbove = after.some((candle) => candle.close > zone.upper * (1 + breakPct / 100));
  const closeBelow = after.some((candle) => candle.close < zone.lower * (1 - breakPct / 100));
  const upMovePct = ((highest - zone.midpoint) / zone.midpoint) * 100;
  const downMovePct = ((zone.midpoint - lowest) / zone.midpoint) * 100;
  let outcome = "Weak Reaction";
  let direction = "neutral";
  let note = "No clear follow-through after zone touch.";
  if (zone.zoneType === "fvg") {
    if ((zone.direction === "supportive" && lowest <= zone.lower) || (zone.direction === "resistive" && highest >= zone.upper)) outcome = "Filled FVG";
    else if ((zone.direction === "supportive" && lowest <= zone.upper) || (zone.direction === "resistive" && highest >= zone.lower)) outcome = "Partial Fill";
    else outcome = "Rejected From FVG";
    direction = zone.direction === "supportive" ? "bullish" : zone.direction === "resistive" ? "bearish" : "neutral";
    note = "FVG interaction classified from closed-candle lookahead.";
  } else if (zone.zoneType === "channel") {
    if ((zone.direction === "supportive" && closeBelow) || (zone.direction === "resistive" && closeAbove)) outcome = "Broke Channel";
    else if ((zone.direction === "supportive" && upMovePct >= threshold) || (zone.direction === "resistive" && downMovePct >= threshold)) outcome = "Rejected From Boundary";
    else outcome = "No Clear Reaction";
    direction = zone.direction === "supportive" ? "bullish" : zone.direction === "resistive" ? "bearish" : "neutral";
    note = "Channel boundary reaction measured from historical touches.";
  } else if (zone.direction === "supportive") {
    if (upMovePct >= threshold) [outcome, direction, note] = ["Bounce", "bullish", "Supportive zone produced a historical bounce."];
    else if (closeBelow) [outcome, direction, note] = ["Breakdown", "bearish", "Closed below supportive zone after touch."];
  } else if (zone.direction === "resistive") {
    if (downMovePct >= threshold) [outcome, direction, note] = ["Rejection", "bearish", "Resistive zone produced a historical rejection."];
    else if (closeAbove) [outcome, direction, note] = ["Breakout", "bullish", "Closed above resistive zone after touch."];
  }
  return { outcome, direction, maxMovePct: Number(Math.max(upMovePct, downMovePct).toFixed(2)), adverseMovePct: Number((zone.direction === "supportive" ? downMovePct : upMovePct).toFixed(2)), reactionCandles: after.length, note };
}

function getReactionScoreLabel(score) {
  const found = (REACTION_STUDY_CONFIG.labels || []).find((item) => score >= item.min);
  return found ? found.label : "Limited Reaction Evidence";
}

function deriveReactionScore(stats, zone) {
  let score = 0;
  const reactionNotes = [];
  const riskFlags = [];
  score += Math.min(2, stats.touches * 0.5);
  score += Math.min(3, (stats.successRatePct / 100) * 3);
  score += Math.min(2, stats.averageMovePct / 2);
  score -= Math.min(2, stats.averageAdverseMovePct / 2);
  score -= Math.min(2, stats.breakCount * 0.6);
  if (stats.touches < 2) riskFlags.push("Limited historical touches");
  if (stats.breakCount > stats.positiveCount) riskFlags.push("Break/fail events dominate");
  if (zone.zoneType === "watchArea") reactionNotes.push("Scenario watch area reaction history.");
  if (stats.successRatePct >= 60) reactionNotes.push("Positive historical reactions are dominant.");
  const reactionScore = Math.max(0, Math.min(10, Number(score.toFixed(1))));
  return { reactionScore, reactionLabel: getReactionScoreLabel(reactionScore), reactionNotes, riskFlags };
}

function studyZoneReaction(zone, candles, timeframe) {
  const lookback = REACTION_STUDY_CONFIG.lookbackCandles[timeframe] || 300;
  const scopedCandles = candles.slice(-lookback);
  const events = [];
  for (let index = 0; index < scopedCandles.length - 2; index += 1) {
    const touch = isCandleTouchingZone(scopedCandles[index], zone, timeframe);
    if (touch.touched) events.push({ touchIndex: index, touch, ...classifyReactionOutcome(zone, index, scopedCandles, timeframe) });
    if (events.length >= REACTION_STUDY_CONFIG.maxEventsPerZone) break;
  }
  if (!events.length) return null;
  const positiveOutcomes = ["Bounce", "Rejection", "Rejected From FVG", "Partial Fill", "Rejected From Boundary", "Reclaimed Channel"];
  const breakOutcomes = ["Breakdown", "Breakout", "Filled FVG", "Broke Channel"];
  const positiveCount = events.filter((event) => positiveOutcomes.includes(event.outcome)).length;
  const breakCount = events.filter((event) => breakOutcomes.includes(event.outcome)).length;
  const stats = {
    touches: events.length,
    bounceCount: events.filter((event) => event.outcome === "Bounce").length,
    rejectionCount: events.filter((event) => event.outcome === "Rejection" || event.outcome === "Rejected From Boundary").length,
    breakCount,
    fillCount: events.filter((event) => event.outcome === "Filled FVG" || event.outcome === "Partial Fill").length,
    weakCount: events.filter((event) => event.outcome === "Weak Reaction" || event.outcome === "No Clear Reaction").length,
    positiveCount,
    averageMovePct: Number((events.reduce((sum, event) => sum + event.maxMovePct, 0) / events.length).toFixed(2)),
    averageAdverseMovePct: Number((events.reduce((sum, event) => sum + event.adverseMovePct, 0) / events.length).toFixed(2)),
    successRatePct: Number(((positiveCount / events.length) * 100).toFixed(1))
  };
  return { ...zone, events, ...stats, ...deriveReactionScore(stats, zone) };
}

function buildReactionStudyContext(activeTimeframe) {
  const candles = marketData[activeTimeframe] || [];
  if (!candles.length) return createEmptyReactionStudyContext("No closed candles available");
  const zones = collectReactionStudyZones(activeTimeframe);
  if (!zones.length) return createEmptyReactionStudyContext("No zones available for reaction study");
  const studiedZones = zones.map((zone) => studyZoneReaction(zone, candles, activeTimeframe)).filter(Boolean).sort((a, b) => b.reactionScore - a.reactionScore);
  console.info("[Reaction Study]", { activeTimeframe, zones: zones.length, studied: studiedZones.length, strongest: studiedZones[0] || null });
  return { available: Boolean(studiedZones.length), activeTimeframe, studiedZones, strongestReaction: studiedZones[0] || null, supportReactions: studiedZones.filter((x) => x.zoneType === "support").slice(0, 3), resistanceReactions: studiedZones.filter((x) => x.zoneType === "resistance").slice(0, 3), fvgReactions: studiedZones.filter((x) => x.zoneType === "fvg").slice(0, 3), channelReactions: studiedZones.filter((x) => x.zoneType === "channel").slice(0, 3), watchAreaReaction: studiedZones.find((x) => x.zoneType === "watchArea") || null, summary: studiedZones[0] ? `${studiedZones[0].label}: ${studiedZones[0].reactionScore}/10 ${studiedZones[0].reactionLabel}` : "Reaction study not available" };
}

function rebuildReactionStudyContext(activeTimeframe) {
  const tf = activeTimeframe || getActiveTimeframe();
  reactionStudyContext = buildReactionStudyContext(tf);
  return reactionStudyContext;
}

window.BtcDash = window.BtcDash || {};
window.BtcDash.engines = window.BtcDash.engines || {};
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
  dedupeMarketZoneRows,
  zoneToMarketRow,
  buildMarketZonesContext,
  rebuildAllSrContexts,
  createEmptyFvgContext,
  deriveFvgStatus,
  scanFvgForTimeframe,
  buildFvgContext,
  deriveDaily4hFvgConfluence,
  rebuildAllFvgContexts,
  createEmptyChannelContext,
  buildChannelFromSwings,
  projectLineAtTime,
  projectChannelAtTime,
  validateChannel,
  deriveChannelStatus,
  buildChannelContext,
  rebuildAllChannelContexts,
  getProjectedChannelContextsForActiveTimeframe,
  createEmptyConfluenceContext,
  normalizeZoneForConfluence,
  collectConfluenceZones,
  zonesOverlapOrNear,
  classifyConfluenceSide,
  buildConfluenceCandidates,
  buildConfluenceContext,
  rebuildConfluenceContext,
  getConfluenceScoreLabel,
  deriveConfluenceScore,
  createEmptyScenarioContext,
  buildScenarioInputSnapshot,
  getScenarioScoreLabel,
  normalizeScenarioScore,
  buildBullishScenario,
  buildBearishScenario,
  buildBreakoutScenario,
  buildBreakdownScenario,
  buildWaitScenario,
  deriveScenarioPlanningScore,
  selectPrimaryScenario,
  buildScenarioContext,
  rebuildScenarioContext,
  createEmptyRiskPlan,
  getScenarioDirection,
  deriveScenarioWatchArea,
  deriveScenarioInvalidation,
  deriveScenarioTargetLadder,
  calculateRiskReward,
  buildScenarioRiskPlan,
  createEmptyReactionStudyContext,
  collectReactionStudyZones,
  isCandleTouchingZone,
  classifyReactionOutcome,
  studyZoneReaction,
  getReactionScoreLabel,
  deriveReactionScore,
  buildReactionStudyContext,
  rebuildReactionStudyContext
};

window.BtcDash.engines.analysis = window.BtcDash.analysis;

if (window.BtcDash.engines?.structure) {
  Object.assign(window.BtcDash.analysis, {
    createEmptyStructureContext: window.BtcDash.engines.structure.createEmptyStructureContext,
    detectSwingPoints: window.BtcDash.engines.structure.detectRawPivots,
    classifySwingLabels: window.BtcDash.engines.structure.labelStructuralSwings,
    deriveStructureBias: window.BtcDash.engines.structure.deriveStructureBias,
    deriveBosChoch: window.BtcDash.engines.structure.deriveBosChochState,
    buildMarketStructureContext: window.BtcDash.engines.structure.rebuildStructureForTimeframe,
    rebuildAllStructureContexts: window.BtcDash.engines.structure.rebuildStructureContexts,
    rebuildStructureContexts: window.BtcDash.engines.structure.rebuildStructureContexts,
    rebuildStructureForTimeframe: window.BtcDash.engines.structure.rebuildStructureForTimeframe
  });
  window.BtcDash.engines.rebuildStructureContexts = window.BtcDash.engines.structure.rebuildStructureContexts;
  window.BtcDash.engines.rebuildStructureForTimeframe = window.BtcDash.engines.structure.rebuildStructureForTimeframe;
  window.rebuildAllStructureContexts = window.BtcDash.engines.structure.rebuildStructureContexts;
  window.rebuildStructureContexts = window.BtcDash.engines.structure.rebuildStructureContexts;
  window.rebuildStructureForTimeframe = window.BtcDash.engines.structure.rebuildStructureForTimeframe;
  window.buildMarketStructureContext = window.BtcDash.engines.structure.rebuildStructureForTimeframe;
}

if (window.BtcDash.engines?.liquidity) {
  window.BtcDash.engines.rebuildLiquidityContexts = window.BtcDash.engines.liquidity.rebuildLiquidityContexts;
  window.rebuildLiquidityContexts = window.BtcDash.engines.liquidity.rebuildLiquidityContexts;
}
if (window.BtcDash.engines?.sr) {
  Object.assign(window.BtcDash.analysis, {
    createEmptySrContext: window.BtcDash.engines.sr.createEmptySrContext,
    buildRawSrLevelsFromSwings: window.BtcDash.engines.sr.buildRawSrLevelsFromSwings,
    clusterSrLevelsIntoZones: window.BtcDash.engines.sr.clusterSrLevels,
    deriveSrZoneStatus: window.BtcDash.engines.sr.deriveSrZoneStatus,
    buildSrContext: window.BtcDash.engines.sr.rebuildSrForTimeframe,
    rebuildAllSrContexts: window.BtcDash.engines.sr.rebuildSrContexts,
    rebuildSrContexts: window.BtcDash.engines.sr.rebuildSrContexts
  });
  window.BtcDash.engines.rebuildSrContexts = window.BtcDash.engines.sr.rebuildSrContexts;
  window.rebuildSrContexts = window.BtcDash.engines.sr.rebuildSrContexts;
  window.rebuildAllSrContexts = window.BtcDash.engines.sr.rebuildSrContexts;
}

if (window.BtcDash.engines?.fvg) {
  Object.assign(window.BtcDash.analysis, {
    createEmptyFvgContext: window.BtcDash.engines.fvg.createEmptyFvgContext,
    scanFvgForTimeframe: window.BtcDash.engines.fvg.rebuildFvgForTimeframe,
    buildFvgContext: window.BtcDash.engines.fvg.rebuildFvgForTimeframe,
    rebuildAllFvgContexts: window.BtcDash.engines.fvg.rebuildFvgContexts,
    rebuildFvgContexts: window.BtcDash.engines.fvg.rebuildFvgContexts
  });
  window.BtcDash.engines.rebuildFvgContexts = window.BtcDash.engines.fvg.rebuildFvgContexts;
  window.rebuildFvgContexts = window.BtcDash.engines.fvg.rebuildFvgContexts;
  window.rebuildAllFvgContexts = window.BtcDash.engines.fvg.rebuildFvgContexts;
}
if (window.BtcDash.engines?.channel) {
  Object.assign(window.BtcDash.analysis, {
    createEmptyChannelContext: window.BtcDash.engines.channel.createEmptyChannelContext,
    buildChannelContext: window.BtcDash.engines.channel.rebuildChannelForTimeframe,
    rebuildAllChannelContexts: window.BtcDash.engines.channel.rebuildChannelContexts,
    rebuildChannelContexts: window.BtcDash.engines.channel.rebuildChannelContexts
  });
  window.BtcDash.engines.rebuildChannelContexts = window.BtcDash.engines.channel.rebuildChannelContexts;
  window.rebuildChannelContexts = window.BtcDash.engines.channel.rebuildChannelContexts;
  window.rebuildAllChannelContexts = window.BtcDash.engines.channel.rebuildChannelContexts;
}
