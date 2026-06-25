(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.engines = window.BtcDash.engines || {};

  const TFS = ["1W", "1D", "4H", "1H"];
  const TF_PRIORITY = { "1W": 4, "1D": 3, "4H": 2, "1H": 1 };
  const PROJECT_FROM = { "1W": [], "1D": ["1W"], "4H": ["1W", "1D"], "1H": ["1D", "4H"] };
  const STATUS_SHOW = new Set(["fresh", "active", "touched", "partial", "inside", "midpointTouched"]);
  const STATUS_HIDE = new Set(["mitigated", "filled", "invalidated", "historical"]);

  const n = (value) => { const number = Number(value); return Number.isFinite(number) ? number : null; };
  const candleTime = (candle) => candle?.time ?? candle?.openTime ?? candle?.open_time ?? candle?.t ?? null;
  const role = (timeframe) => window.BtcDash.config?.FVG_V2_CONFIG?.[timeframe]?.role || (timeframe === "1W" ? "macro" : timeframe === "1D" ? "context" : timeframe === "4H" ? "setup" : "timing");
  const boundaryConfig = () => window.BtcDash.config?.FVG_BOUNDARY_DISPLAY_CONFIG || window.BtcDash.config?.FVG_V2_CONFIG?.boundaryDisplay || {};
  const boxConfig = () => window.BtcDash.config?.FVG_RIGHT_EXTENDED_BOX_CONFIG || {};
  const tfValue = (bucket, timeframe, fallback) => bucket && typeof bucket === "object" ? (bucket[timeframe] ?? fallback) : (bucket ?? fallback);

  function activeConfig() {
    const boundary = boundaryConfig();
    const box = boxConfig();
    return { ...boundary, ...box, visibleLimit: box.visibleLimit || boundary.visibleLimit, projection: boundary.projection, dedupe: boundary.dedupe, scoring: boundary.scoring };
  }

  function isRunningLike(candle) {
    const marker = `${candle?.source || ""} ${candle?.status || ""} ${candle?.note || ""}`;
    return !candle || candle.isRunning === true || candle.isClosed === false || candle.isFinal === false || candle.x === false || /running|preview|live/i.test(marker);
  }

  function closedCandles(timeframe) {
    const all = window.BtcDash.state?.marketData?.[timeframe] || [];
    return all.filter((candle) => candle && !isRunningLike(candle)).map((candle, index) => ({ ...candle, _closedIndex: index }));
  }

  function calculateFvgAtrSeries(candles, atrLength = 14) {
    if (window.BtcDash.engines.structure?.calculateAtrSeries) return window.BtcDash.engines.structure.calculateAtrSeries(candles, atrLength);
    return candles.map((_, index) => {
      if (index < atrLength) return null;
      let sum = 0;
      for (let j = index - atrLength + 1; j <= index; j += 1) {
        const high = n(candles[j].high), low = n(candles[j].low), prevClose = n(candles[j - 1]?.close ?? candles[j].close);
        if (high == null || low == null || prevClose == null) return null;
        sum += Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
      }
      return sum / atrLength;
    });
  }

  function createEmptyFvgContext(timeframe, reason = "No clear active FVG.") {
    return {
      available: false, timeframe, role: role(timeframe), rawFvgs: [], validFvgs: [], activeBullish: [], activeBearish: [], touchedFvgs: [], partialFvgs: [], midpointTouchedFvgs: [], mitigatedFvgs: [], filledFvgs: [], inverseFvgs: [], invalidatedFvgs: [], historicalFvgs: [], projectedFvgs: [], mergedFvgs: [], hiddenFvgs: [], suppressedFvgs: [], visibleFvgs: [], visibleBoundaryFvgs: [], visibleBoxFvgs: [], visibleRightExtendedFvgs: [], nearestBullishFvg: null, nearestBearishFvg: null, strongestBullishFvg: null, strongestBearishFvg: null, currentReactionFvg: null, strongestFvg: null, marketZoneRows: [],
      debugStats: { rawCount: 0, validCount: 0, activeCount: 0, visibleCount: 0, visibleBoxCount: 0, visibleByNearestFallbackCount: 0, bullishBelowVisibleCount: 0, bearishAboveVisibleCount: 0, insideVisibleCount: 0, hiddenFilledCount: 0, hiddenMitigatedCount: 0, hiddenDistanceCount: 0, hiddenLowScoreCount: 0, suppressedDuplicateCount: 0, projectedCount: 0, mergedCount: 0, boundaryRenderCount: 0, boxRenderCount: 0, warnings: [] },
      summary: reason, status: "No Clear FVG", activeFvgs: [], nearestFvg: null
    };
  }

  function bodyPct(candle) {
    const high = n(candle.high), low = n(candle.low), open = n(candle.open), close = n(candle.close);
    const range = high != null && low != null ? high - low : 0;
    return range > 0 ? Math.abs(close - open) / range * 100 : 0;
  }

  function detectFvgsV3(candles, timeframe, config = boundaryConfig()) {
    const atrSeries = calculateFvgAtrSeries(candles, config.atrLength || 14);
    const minGapPct = tfValue(config.minGapPct, timeframe, 0.1);
    const minGapAtr = tfValue(config.minGapAtr, timeframe, 0.1);
    const displacementBodyPct = tfValue(config.displacementBodyPct, timeframe, 35);
    const requireDisplacement = Boolean(tfValue(config.requireDisplacementCandle, timeframe, false));
    const raw = [];
    for (let index = 2; index < candles.length; index += 1) {
      const c1 = candles[index - 2], c2 = candles[index - 1], c3 = candles[index];
      if (isRunningLike(c1) || isRunningLike(c2) || isRunningLike(c3)) continue;
      const h1 = n(c1.high), l1 = n(c1.low), h3 = n(c3.high), l3 = n(c3.low);
      const candidates = [];
      if (h1 != null && l3 != null && h1 < l3) candidates.push({ direction: "bullish", zoneLow: h1, zoneHigh: l3 });
      if (l1 != null && h3 != null && l1 > h3) candidates.push({ direction: "bearish", zoneLow: h3, zoneHigh: l1 });
      candidates.forEach((candidate) => {
        const gapSize = candidate.zoneHigh - candidate.zoneLow;
        const midpoint = (candidate.zoneLow + candidate.zoneHigh) / 2;
        const gapSizePct = midpoint ? gapSize / midpoint * 100 : 0;
        const atr = atrSeries[index - 1] || gapSize;
        const gapSizeAtr = atr ? gapSize / atr : 0;
        const candleBodyPct = bodyPct(c2);
        const midClose = n(c2.close), midOpen = n(c2.open);
        const candleDirection = midClose > midOpen ? "bullish" : midClose < midOpen ? "bearish" : "neutral";
        const displacement = { valid: candleBodyPct >= displacementBodyPct && candleDirection === candidate.direction, bodyPct: candleBodyPct, rangeAtr: atr ? (n(c2.high) - n(c2.low)) / atr : 0, directionMatches: candleDirection === candidate.direction, note: "Middle candle displacement check for wick-based FVG." };
        const valid = gapSizePct >= minGapPct && gapSizeAtr >= minGapAtr && (!requireDisplacement || displacement.valid);
        raw.push({ id: `${timeframe}-wick-fvg-${candidate.direction}-${index}`, timeframe, source: "FVG", type: candidate.direction, direction: candidate.direction, fvgType: "wick_fvg", isDefaultFvg: true, zoneLow: candidate.zoneLow, zoneHigh: candidate.zoneHigh, lowerBound: candidate.zoneLow, upperBound: candidate.zoneHigh, centerPrice: midpoint, midpoint, midpointPrice: midpoint, gapSize, gapSizePct, gapSizeAtr, candle1Index: index - 2, candle2Index: index - 1, candle3Index: index, createdAtIndex: index, createdAtTime: candleTime(c3), candle1Time: candleTime(c1), candle2Time: candleTime(c2), candle3Time: candleTime(c3), status: valid ? "fresh" : "hidden", displacement, sourceType: "local", sourceTimeframe: timeframe, isHTFProjection: false, projectionDepth: 0, sourceLineage: [], renderPolicy: valid ? "tableOnly" : "hide", hiddenReason: valid ? null : (gapSizePct < minGapPct ? "small-gap" : gapSizeAtr < minGapAtr ? "small-gap-atr" : "weak-displacement"), startTime: candleTime(c3), endTime: candleTime(c3), endTimeMode: "confirmed-candle", label: `${timeframe} ${candidate.direction} FVG`, debugReason: valid ? "wick_fvg_3_candle_valid" : "wick_fvg_filtered" });
      });
    }
    return raw;
  }

  function classifyFvgLifecycle(fvg, candles, currentPrice, config = boundaryConfig()) {
    const maxAge = tfValue(config.maxAgeBars, fvg.timeframe, 180);
    const ageBars = candles.length - 1 - fvg.createdAtIndex;
    let fillRatio = 0, firstTouchTime = null, lastTouchTime = null, fillPrice = null;
    let wickTouched = false, closeEntered = false, midpointTouched = false, wickFilled = false, closeFilled = false, invalidatedAt = null;
    for (let index = fvg.createdAtIndex + 1; index < candles.length; index += 1) {
      const high = n(candles[index].high), low = n(candles[index].low), close = n(candles[index].close);
      if (high == null || low == null || close == null) continue;
      if (fvg.direction === "bullish") {
        if (low <= fvg.zoneHigh) { wickTouched = true; firstTouchTime = firstTouchTime || candleTime(candles[index]); lastTouchTime = candleTime(candles[index]); fillPrice = low; fillRatio = Math.max(fillRatio, Math.min(1, (fvg.zoneHigh - low) / Math.max(1e-9, fvg.zoneHigh - fvg.zoneLow))); }
        if (close <= fvg.zoneHigh && close >= fvg.zoneLow) closeEntered = true;
        if (low <= fvg.midpoint) midpointTouched = true;
        if (low <= fvg.zoneLow) wickFilled = true;
        if (close <= fvg.zoneLow) { closeFilled = true; invalidatedAt = candleTime(candles[index]); break; }
      } else {
        if (high >= fvg.zoneLow) { wickTouched = true; firstTouchTime = firstTouchTime || candleTime(candles[index]); lastTouchTime = candleTime(candles[index]); fillPrice = high; fillRatio = Math.max(fillRatio, Math.min(1, (high - fvg.zoneLow) / Math.max(1e-9, fvg.zoneHigh - fvg.zoneLow))); }
        if (close >= fvg.zoneLow && close <= fvg.zoneHigh) closeEntered = true;
        if (high >= fvg.midpoint) midpointTouched = true;
        if (high >= fvg.zoneHigh) wickFilled = true;
        if (close >= fvg.zoneHigh) { closeFilled = true; invalidatedAt = candleTime(candles[index]); break; }
      }
    }
    let status = "fresh";
    if (closeFilled) status = "filled";
    else if (wickFilled) status = "mitigated";
    else if (currentPrice >= fvg.zoneLow && currentPrice <= fvg.zoneHigh) status = "inside";
    else if (midpointTouched) status = "midpointTouched";
    else if (fillRatio > 0.25) status = "partial";
    else if (wickTouched) status = "touched";
    else if (ageBars > maxAge) status = "historical";
    else status = "active";
    const fillState = { fillPct: Number((fillRatio * 100).toFixed(1)), fillRatio, fillPrice, wickTouched, closeEntered, midpointTouched, wickFilled, closeFilled, fullyFilled: closeFilled, firstTouchTime, lastTouchTime, mitigatedAt: wickFilled && !closeFilled ? lastTouchTime : null, filledAt: closeFilled ? invalidatedAt || lastTouchTime : null, invalidatedAt, note: closeFilled ? "Close filled FVG." : wickFilled ? "Wick filled/mitigated; hidden from chart." : midpointTouched ? "Midpoint touched; chartable only if still relevant." : wickTouched ? "Touched but still active." : "Fresh active FVG." };
    return { ...fvg, status, fillState };
  }

  function relationAndDistance(fvg, currentPrice, config = activeConfig()) {
    if (!currentPrice) return { relationToPrice: "unknown", distancePct: 999 };
    const maxDistance = tfValue(config.distancePctFromPrice, fvg.timeframe, tfValue(config.maxDistancePctFromPrice, fvg.timeframe, 7));
    const distancePct = currentPrice >= fvg.zoneLow && currentPrice <= fvg.zoneHigh ? 0 : currentPrice > fvg.zoneHigh ? (currentPrice - fvg.zoneHigh) / currentPrice * 100 : (fvg.zoneLow - currentPrice) / currentPrice * 100;
    let relationToPrice = "inside";
    if (currentPrice >= fvg.zoneLow && currentPrice <= fvg.zoneHigh) relationToPrice = "inside";
    else if (fvg.zoneHigh < currentPrice) relationToPrice = distancePct > maxDistance ? "farBelow" : "belowPrice";
    else if (fvg.zoneLow > currentPrice) relationToPrice = distancePct > maxDistance ? "farAbove" : "abovePrice";
    return { relationToPrice, distancePct: Number(distancePct.toFixed(2)) };
  }

  function scoreFvgV3(fvg, context = {}, config = activeConfig()) {
    const currentPrice = context.currentPrice;
    const relation = relationAndDistance(fvg, currentPrice, config);
    const ageBars = context.candleCount - 1 - fvg.createdAtIndex;
    const fillRatio = fvg.fillState?.fillRatio || 0;
    let score = TF_PRIORITY[fvg.sourceTimeframe || fvg.timeframe] * 0.6 + Math.min(2.2, fvg.gapSizeAtr) + Math.min(2, fvg.gapSizePct) + (fvg.displacement?.valid ? 1.5 : 0) + Math.max(0, 2 - relation.distancePct / 3) + Math.max(0, 1.2 - ageBars / 120) - fillRatio * 2;
    if (STATUS_HIDE.has(fvg.status)) score = 0;
    score = Math.max(0, Math.min(tfValue(config.scoring?.scoreMax, fvg.timeframe, 10), score));
    const scoreLabel = score >= 8 ? "Strong" : score >= 6.5 ? "Good" : score >= 5 ? "Moderate" : "Low / tableOnly";
    return { ...fvg, ...relation, score: Number(score.toFixed(2)), scoreLabel, scoreFactors: ["gap", "atr", "displacement", "freshness", "distance", "fillRatio"] };
  }

  function applyRenderPolicy(fvg, currentPrice, config = activeConfig()) {
    const allowed = new Set(config.allowedChartStatuses || Array.from(STATUS_SHOW));
    const hidden = new Set(config.hiddenChartStatuses || Array.from(STATUS_HIDE));
    const minScore = tfValue(config.minScoreToRender, fvg.timeframe, config.scoring?.minScoreToRender ?? 4.5);
    let renderPolicy = allowed.has(fvg.status) ? "box_right_extend" : "tableOnly";
    let hiddenReason = fvg.hiddenReason || null;
    if (fvg.fvgType !== "wick_fvg") { renderPolicy = "tableOnly"; hiddenReason = "body-imbalance-table-only"; }
    if (fvg.relationToPrice === "farBelow" || fvg.relationToPrice === "farAbove") { renderPolicy = "hide"; hiddenReason = "distance"; }
    if (fvg.score < minScore && renderPolicy === "box_right_extend") {
      if (config.selectionRelaxation?.[fvg.timeframe]?.allowModerateScoreIfNearest) hiddenReason = null;
      else { renderPolicy = "tableOnly"; hiddenReason = "low-score"; }
    }
    if (hidden.has(fvg.status)) { renderPolicy = "hide"; hiddenReason = fvg.status; }
    return { ...fvg, renderPolicy, drawPolicy: renderPolicy === "box_right_extend" ? "show" : "summaryOnly", hiddenReason, endTimeMode: "right-visible-edge" };
  }

  function overlapRatio(a, b) {
    const lo = Math.max(a.zoneLow, b.zoneLow), hi = Math.min(a.zoneHigh, b.zoneHigh);
    const overlap = Math.max(0, hi - lo);
    const width = Math.max(a.zoneHigh - a.zoneLow, b.zoneHigh - b.zoneLow, 1e-9);
    return overlap / width;
  }

  function localRank(fvg, activeTimeframe) { return fvg.isHTFProjection ? 1 : (fvg.timeframe === activeTimeframe || fvg.sourceTimeframe === activeTimeframe ? 0 : 1); }

  function chooseVisualWinner(a, b, activeTimeframe) {
    return localRank(a, activeTimeframe) - localRank(b, activeTimeframe) || a.distancePct - b.distancePct || b.score - a.score || (b.createdAtIndex - a.createdAtIndex);
  }

  function dedupeFvgZonesForRightExtendedBox(fvgs, activeTimeframe, config = activeConfig()) {
    const threshold = config.dedupe?.overlapThreshold ?? 0.3;
    const selected = [];
    const suppressedFvgs = [];
    fvgs.slice().sort((a, b) => chooseVisualWinner(a, b, activeTimeframe)).forEach((fvg) => {
      const duplicate = selected.find((item) => item.direction === fvg.direction && overlapRatio(item, fvg) >= threshold);
      if (duplicate) {
        duplicate.sourceLineage = [...(duplicate.sourceLineage || []), { id: fvg.id, timeframe: fvg.sourceTimeframe || fvg.timeframe, sourceType: fvg.sourceType, score: fvg.score }];
        if (!duplicate.label?.includes("+")) duplicate.label = `${duplicate.sourceTimeframe || duplicate.timeframe}${duplicate.sourceLineage.length ? " + HTF" : ""} ${duplicate.direction} FVG`;
        suppressedFvgs.push({ ...fvg, renderPolicy: "hide", hiddenReason: "duplicate-overlap", suppressedBy: duplicate.id });
      } else selected.push({ ...fvg, sourceLineage: fvg.sourceLineage || [] });
    });
    return { visibleCandidates: selected, mergedFvgs: selected.filter((item) => item.sourceLineage.length), suppressedFvgs, debugStats: { suppressedDuplicateCount: suppressedFvgs.length, mergedCount: selected.filter((item) => item.sourceLineage.length).length } };
  }

  function sortForSelection(activeTimeframe) {
    const statusRank = { inside: 0, fresh: 1, active: 2, touched: 3, partial: 4, midpointTouched: 5 };
    return (a, b) => localRank(a, activeTimeframe) - localRank(b, activeTimeframe) || a.distancePct - b.distancePct || (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9) || b.score - a.score || (b.createdAtIndex - a.createdAtIndex);
  }

  function selectVisibleRightExtendedFvgs(fvgs, currentPrice, activeTimeframe, config = activeConfig()) {
    const limits = config.visibleLimit || {};
    const allowed = new Set(config.allowedChartStatuses || Array.from(STATUS_SHOW));
    const hidden = new Set(config.hiddenChartStatuses || Array.from(STATUS_HIDE));
    const eligible = fvgs.filter((fvg) => fvg.renderPolicy === "box_right_extend" && allowed.has(fvg.status) && !hidden.has(fvg.status));
    const inside = eligible.filter((fvg) => currentPrice >= fvg.zoneLow && currentPrice <= fvg.zoneHigh).sort(sortForSelection(activeTimeframe));
    const bullishBelow = eligible.filter((fvg) => fvg.direction === "bullish" && fvg.zoneHigh < currentPrice).sort(sortForSelection(activeTimeframe));
    const bearishAbove = eligible.filter((fvg) => fvg.direction === "bearish" && fvg.zoneLow > currentPrice).sort(sortForSelection(activeTimeframe));
    let visible = [
      ...inside.slice(0, limits.inside || 1),
      ...bullishBelow.slice(0, limits.bullishBelow || 4),
      ...bearishAbove.slice(0, limits.bearishAbove || 4)
    ].filter((row, index, arr) => arr.findIndex((item) => item.id === row.id) === index).sort(sortForSelection(activeTimeframe));
    const localLimit = limits.maxTotalLocal || 9, projectedLimit = limits.maxTotalProjected || 2, totalLimit = limits.maxTotalAll || 9;
    const counts = { local: 0, projected: 0 };
    visible = visible.filter((fvg) => {
      if (fvg.isHTFProjection) { if (counts.projected >= projectedLimit) return false; counts.projected += 1; return true; }
      if (counts.local >= localLimit) return false; counts.local += 1; return true;
    }).slice(0, totalLimit);

    const eligibleLocal = eligible.filter((fvg) => !fvg.isHTFProjection && (fvg.timeframe === activeTimeframe || fvg.sourceTimeframe === activeTimeframe)).sort(sortForSelection(activeTimeframe));
    const relaxation = config.selectionRelaxation?.[activeTimeframe] || {};
    const minFallback = relaxation.minVisibleFallback || 0;
    const warnings = [];
    if (visible.length === 0 && eligibleLocal.length > 0 && minFallback > 0) {
      const fallback = eligibleLocal.slice(0, minFallback).map((fvg) => ({ ...fvg, renderPolicy: "box_right_extend", visibleByNearestFallback: true, hiddenReason: null }));
      visible.push(...fallback);
      warnings.push(`${activeTimeframe} nearest FVG fallback applied because active eligible FVG existed but visible boxes were empty.`);
    }
    if (activeTimeframe === "1H" && eligibleLocal.length > 0 && !visible.some((fvg) => !fvg.isHTFProjection)) {
      const fallback = eligibleLocal.slice(0, Math.max(1, minFallback || 2)).map((fvg) => ({ ...fvg, renderPolicy: "box_right_extend", visibleByNearestFallback: true, hiddenReason: null }));
      visible = [...fallback, ...visible].filter((row, index, arr) => arr.findIndex((item) => item.id === row.id) === index).slice(0, totalLimit);
      warnings.push("1H local FVG fallback applied so HTF projection cannot suppress every local box.");
    }
    const hiddenByLimit = eligible.filter((fvg) => !visible.some((item) => item.id === fvg.id)).map((fvg) => ({ ...fvg, renderPolicy: "hide", hiddenReason: fvg.hiddenReason || "visible-limit" }));
    const withPriority = visible.slice(0, totalLimit).map((fvg, index) => ({ ...fvg, visualPriority: index + 1 }));
    return { visibleRightExtendedFvgs: withPriority, visibleBoxFvgs: withPriority, visibleBoundaryFvgs: withPriority, hiddenByLimit, warnings };
  }

  function selectVisibleBoundaryFvgs(fvgs, currentPrice, activeTimeframe, config = activeConfig()) {
    return selectVisibleRightExtendedFvgs(fvgs, currentPrice, activeTimeframe, config);
  }

  function buildProjectedFvgs(activeTimeframe, currentPrice, config = activeConfig()) {
    if (!boundaryConfig().projection?.enabled) return [];
    const maxProjected = tfValue(boundaryConfig().projection.maxProjectedVisible, activeTimeframe, 0);
    return (PROJECT_FROM[activeTimeframe] || []).flatMap((sourceTf, depth) => {
      const ctx = window.BtcDash.state?.fvgContexts?.[sourceTf];
      return (ctx?.visibleRightExtendedFvgs || ctx?.visibleBoxFvgs || ctx?.visibleBoundaryFvgs || []).filter((fvg) => !fvg.isHTFProjection).slice(0, maxProjected).map((fvg) => ({ ...fvg, id: `${activeTimeframe}-projected-${fvg.id}`, timeframe: activeTimeframe, sourceTimeframe: sourceTf, sourceType: "projected", isHTFProjection: true, projectionDepth: depth + 1, label: `${sourceTf} → ${activeTimeframe} ${fvg.direction} FVG`, opacity: boxConfig().boxRender?.htfFillOpacity ?? 0.035, lineStyle: "dashed" }));
    }).slice(0, maxProjected);
  }

  function buildFvgMarketZoneRows(context, timeframe) {
    return [...(context.visibleRightExtendedFvgs || []), context.nearestBullishFvg, context.nearestBearishFvg, context.currentReactionFvg].filter(Boolean).filter((row, index, arr) => arr.findIndex((item) => item.id === row.id) === index).slice(0, 8).map((fvg) => ({ id: `fvg-row-${fvg.id}`, timeframe, source: "FVG", type: `${fvg.direction} FVG`, direction: fvg.direction, status: fvg.status, zoneLow: fvg.zoneLow, zoneHigh: fvg.zoneHigh, centerPrice: fvg.centerPrice, midpointPrice: fvg.midpoint, relationToPrice: fvg.relationToPrice, distancePct: fvg.distancePct, score: fvg.score, scoreLabel: fvg.scoreLabel, sourceTags: ["FVG", fvg.direction, fvg.sourceTimeframe || timeframe], drawPolicy: fvg.drawPolicy, renderPolicy: fvg.renderPolicy, label: fvg.label, note: "Planning context only." }));
  }

  function rebuildFvgForTimeframe(timeframe) {
    const started = performance.now();
    try {
      const config = activeConfig();
      const candles = closedCandles(timeframe);
      if (candles.length < 5) {
        const empty = createEmptyFvgContext(timeframe, "Not enough closed candles for FVG V3.");
        window.BtcDash.state.fvgContexts[timeframe] = empty;
        return empty;
      }
      const currentPrice = n(candles.at(-1)?.close);
      const rawFvgs = detectFvgsV3(candles, timeframe, boundaryConfig());
      const lifecycle = rawFvgs.map((fvg) => fvg.status === "hidden" ? fvg : classifyFvgLifecycle(fvg, candles, currentPrice, boundaryConfig()));
      const scored = lifecycle.map((fvg) => fvg.status === "hidden" ? fvg : applyRenderPolicy(scoreFvgV3(fvg, { currentPrice, candleCount: candles.length }, config), currentPrice, config));
      const validFvgs = scored.filter((fvg) => fvg.status !== "hidden");
      const projectedFvgs = buildProjectedFvgs(timeframe, currentPrice, config).map((fvg) => applyRenderPolicy(scoreFvgV3(fvg, { currentPrice, candleCount: candles.length }, config), currentPrice, config));
      const deduped = dedupeFvgZonesForRightExtendedBox([...validFvgs, ...projectedFvgs], timeframe, config);
      const visibleSelection = selectVisibleRightExtendedFvgs(deduped.visibleCandidates, currentPrice, timeframe, config);
      const visibleRightExtendedFvgs = visibleSelection.visibleRightExtendedFvgs;
      const hiddenFvgs = [...scored.filter((fvg) => fvg.status === "hidden" || fvg.renderPolicy !== "box_right_extend"), ...visibleSelection.hiddenByLimit];
      const activeBullish = validFvgs.filter((fvg) => fvg.direction === "bullish" && STATUS_SHOW.has(fvg.status)).sort((a, b) => a.distancePct - b.distancePct).slice(0, 6);
      const activeBearish = validFvgs.filter((fvg) => fvg.direction === "bearish" && STATUS_SHOW.has(fvg.status)).sort((a, b) => a.distancePct - b.distancePct).slice(0, 6);
      const activeCount = activeBullish.length + activeBearish.length;
      const warnings = [...visibleSelection.warnings];
      if (timeframe === "1H" && activeCount > 0 && visibleRightExtendedFvgs.length === 0) warnings.push("FVG selection warning: 1H has active FVGs but zero visible boxes.");
      const bullishBelowVisible = visibleRightExtendedFvgs.filter((fvg) => fvg.direction === "bullish" && fvg.relationToPrice === "belowPrice").length;
      const bearishAboveVisible = visibleRightExtendedFvgs.filter((fvg) => fvg.direction === "bearish" && fvg.relationToPrice === "abovePrice").length;
      const insideVisible = visibleRightExtendedFvgs.filter((fvg) => fvg.relationToPrice === "inside" || fvg.status === "inside").length;
      const context = {
        available: validFvgs.length > 0, timeframe, role: role(timeframe), rawFvgs, validFvgs, activeBullish, activeBearish,
        touchedFvgs: validFvgs.filter((fvg) => fvg.status === "touched"), partialFvgs: validFvgs.filter((fvg) => fvg.status === "partial"), midpointTouchedFvgs: validFvgs.filter((fvg) => fvg.status === "midpointTouched"), mitigatedFvgs: validFvgs.filter((fvg) => fvg.status === "mitigated"), filledFvgs: validFvgs.filter((fvg) => fvg.status === "filled"), inverseFvgs: [], invalidatedFvgs: validFvgs.filter((fvg) => fvg.status === "invalidated"), historicalFvgs: validFvgs.filter((fvg) => fvg.status === "historical"), projectedFvgs, mergedFvgs: deduped.mergedFvgs, hiddenFvgs, suppressedFvgs: deduped.suppressedFvgs,
        visibleFvgs: visibleRightExtendedFvgs, visibleBoundaryFvgs: visibleRightExtendedFvgs, visibleBoxFvgs: visibleRightExtendedFvgs, visibleRightExtendedFvgs,
        nearestBullishFvg: validFvgs.filter((fvg) => fvg.direction === "bullish").sort((a, b) => a.distancePct - b.distancePct)[0] || null,
        nearestBearishFvg: validFvgs.filter((fvg) => fvg.direction === "bearish").sort((a, b) => a.distancePct - b.distancePct)[0] || null,
        strongestBullishFvg: validFvgs.filter((fvg) => fvg.direction === "bullish").sort((a, b) => b.score - a.score)[0] || null,
        strongestBearishFvg: validFvgs.filter((fvg) => fvg.direction === "bearish").sort((a, b) => b.score - a.score)[0] || null,
        currentReactionFvg: validFvgs.filter((fvg) => !STATUS_HIDE.has(fvg.status) && (fvg.relationToPrice === "inside" || fvg.status === "inside")).sort((a, b) => a.distancePct - b.distancePct)[0] || null,
        strongestFvg: validFvgs.slice().sort((a, b) => b.score - a.score)[0] || null, marketZoneRows: [],
        debugStats: { rawCount: rawFvgs.length, validCount: validFvgs.length, activeCount, visibleCount: visibleRightExtendedFvgs.length, visibleBoxCount: visibleRightExtendedFvgs.length, visibleByNearestFallbackCount: visibleRightExtendedFvgs.filter((fvg) => fvg.visibleByNearestFallback).length, bullishBelowVisibleCount: bullishBelowVisible, bearishAboveVisibleCount: bearishAboveVisible, insideVisibleCount: insideVisible, hiddenFilledCount: hiddenFvgs.filter((fvg) => fvg.status === "filled").length, hiddenMitigatedCount: hiddenFvgs.filter((fvg) => fvg.status === "mitigated").length, hiddenDistanceCount: hiddenFvgs.filter((fvg) => fvg.hiddenReason === "distance").length, hiddenLowScoreCount: hiddenFvgs.filter((fvg) => fvg.hiddenReason === "low-score").length, suppressedDuplicateCount: deduped.suppressedFvgs.length, projectedCount: projectedFvgs.length, mergedCount: deduped.mergedFvgs.length, boundaryRenderCount: 0, boxRenderCount: visibleRightExtendedFvgs.length, durationMs: Number((performance.now() - started).toFixed(1)), warnings },
        summary: visibleRightExtendedFvgs.length ? `${timeframe} active right-extended FVG boxes: ${visibleRightExtendedFvgs.length}. Planning context only.` : "No active right-extended FVG box for chart; historical FVG retained in table context.",
        status: visibleRightExtendedFvgs.length ? "Active FVG Box Reference" : "No Clear FVG", activeFvgs: [...activeBullish, ...activeBearish], nearestFvg: validFvgs.slice().sort((a, b) => a.distancePct - b.distancePct)[0] || null
      };
      context.marketZoneRows = buildFvgMarketZoneRows(context, timeframe);
      window.BtcDash.state.fvgContexts[timeframe] = context;
      try { fvgContexts[timeframe] = context; } catch (error) { /* lexical fallback */ }
      return context;
    } catch (error) {
      const empty = createEmptyFvgContext(timeframe, `FVG V3 error: ${error.message}`);
      empty.debugStats.warnings.push(error.message);
      window.BtcDash.state.fvgContexts[timeframe] = empty;
      return empty;
    }
  }

  function rebuildFvgContexts() {
    const contexts = {};
    TFS.forEach((timeframe) => { contexts[timeframe] = rebuildFvgForTimeframe(timeframe); });
    const stats = Object.values(contexts).reduce((acc, ctx) => { acc.rawFvgCount += ctx.rawFvgs?.length || 0; acc.validFvgCount += ctx.validFvgs?.length || 0; acc.visibleBoxCount += ctx.visibleRightExtendedFvgs?.length || 0; acc.hiddenCount += ctx.hiddenFvgs?.length || 0; acc.suppressedDuplicateCount += ctx.suppressedFvgs?.length || 0; acc.filledCount += ctx.filledFvgs?.length || 0; acc.mitigatedCount += ctx.mitigatedFvgs?.length || 0; acc.projectedCount += ctx.projectedFvgs?.length || 0; return acc; }, { rawFvgCount: 0, validFvgCount: 0, visibleBoxCount: 0, hiddenCount: 0, suppressedDuplicateCount: 0, filledCount: 0, mitigatedCount: 0, projectedCount: 0 });
    window.BtcDash.state.fvgDebugStats = { ...(window.BtcDash.state.fvgDebugStats || {}), ...stats, lastBuildAt: new Date().toISOString(), warnings: [] };
    return contexts;
  }

  function getFvgContext(timeframe) { return window.BtcDash.state?.fvgContexts?.[timeframe] || createEmptyFvgContext(timeframe); }
  function fvgTableRows(rows) { return (rows || []).map((fvg, index) => ({ no: index + 1, id: fvg.id, timeframe: fvg.timeframe, direction: fvg.direction, lowerBound: fvg.lowerBound, upperBound: fvg.upperBound, status: fvg.status, relationToPrice: fvg.relationToPrice, distancePct: fvg.distancePct, score: fvg.score, renderPolicy: fvg.renderPolicy, startTime: fvg.startTime || fvg.createdAtTime || fvg.candle3Time, endTimeMode: fvg.endTimeMode || "right-visible-edge", isHTFProjection: Boolean(fvg.isHTFProjection), visibleByNearestFallback: Boolean(fvg.visibleByNearestFallback), sourceLineage: fvg.sourceLineage || [], hiddenReason: fvg.hiddenReason, label: fvg.label })); }
  function debugFvgContext(timeframe = "4H") { const ctx = getFvgContext(timeframe); return { timeframe, rawCount: ctx.rawFvgs?.length || 0, validCount: ctx.validFvgs?.length || 0, activeCount: ctx.debugStats?.activeCount ?? ((ctx.activeBullish?.length || 0) + (ctx.activeBearish?.length || 0)), visibleCount: ctx.visibleRightExtendedFvgs?.length || ctx.visibleBoxFvgs?.length || ctx.visibleBoundaryFvgs?.length || 0, visibleBoxCount: ctx.visibleBoxFvgs?.length || 0, projectedCount: ctx.projectedFvgs?.length || 0, mergedCount: ctx.mergedFvgs?.length || 0, suppressedCount: ctx.suppressedFvgs?.length || 0, hiddenFilledCount: ctx.debugStats?.hiddenFilledCount || 0, hiddenMitigatedCount: ctx.debugStats?.hiddenMitigatedCount || 0, hiddenDistanceCount: ctx.debugStats?.hiddenDistanceCount || 0, visibleByNearestFallbackCount: ctx.debugStats?.visibleByNearestFallbackCount || 0, bullishBelowVisibleCount: ctx.debugStats?.bullishBelowVisibleCount || 0, bearishAboveVisibleCount: ctx.debugStats?.bearishAboveVisibleCount || 0, insideVisibleCount: ctx.debugStats?.insideVisibleCount || 0, nearestBullishFvg: ctx.nearestBullishFvg, nearestBearishFvg: ctx.nearestBearishFvg, currentReactionFvg: ctx.currentReactionFvg, warnings: ctx.debugStats?.warnings || [] }; }
  function printVisibleFvgs(timeframe = "4H") { const table = fvgTableRows(getFvgContext(timeframe).visibleRightExtendedFvgs || getFvgContext(timeframe).visibleBoxFvgs || getFvgContext(timeframe).visibleBoundaryFvgs); if (console?.table) console.table(table); return table; }
  function printHiddenFvgs(timeframe = "4H") { const table = fvgTableRows(getFvgContext(timeframe).hiddenFvgs); if (console?.table) console.table(table); return table; }

  const api = { rebuildFvgContexts, rebuildFvgForTimeframe, createEmptyFvgContext, calculateFvgAtrSeries, detectFvgsV3, detectRawFvgs: detectFvgsV3, classifyFvgLifecycle, scoreFvgV3, selectVisibleRightExtendedFvgs, selectVisibleBoundaryFvgs, dedupeFvgZonesForRightExtendedBox, dedupeFvgZonesV3: dedupeFvgZonesForRightExtendedBox, buildProjectedFvgs, buildFvgMarketZoneRows, getFvgContext, debugFvgContext, printVisibleFvgs, printHiddenFvgs, rebuildAllFvgContexts: rebuildFvgContexts, buildFvgContext: rebuildFvgForTimeframe, scanFvgForTimeframe: rebuildFvgForTimeframe };
  window.BtcDash.engines.fvg = api;
  window.BtcDash.fvgEngine = api;
  window.BtcDash.debugFvgContext = debugFvgContext;
  window.BtcDash.printVisibleFvgs = printVisibleFvgs;
  window.BtcDash.printHiddenFvgs = printHiddenFvgs;
  window.rebuildFvgContexts = rebuildFvgContexts;
  window.rebuildAllFvgContexts = rebuildFvgContexts;
})();
