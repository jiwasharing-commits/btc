(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.engines = window.BtcDash.engines || {};

  const DEFAULT_TIMEFRAMES = ["1W", "1D", "4H", "1H"];

  function getConfig(timeframe) {
    const root = window.BtcDash.config?.STRUCTURE_V2_CONFIG || {};
    return { root, tf: root[timeframe] || {}, timeframes: root.timeframes || DEFAULT_TIMEFRAMES };
  }

  function getRole(timeframe) {
    return getConfig(timeframe).tf.role || (timeframe === "1W" ? "macro" : timeframe === "1D" ? "context" : timeframe === "4H" ? "setup" : "timing");
  }

  function getCandleTime(candle) {
    return candle?.time ?? candle?.openTime ?? candle?.open_time ?? candle?.t ?? null;
  }

  function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function isRunningLike(candle) {
    if (!candle) return true;
    const marker = `${candle.source || ""} ${candle.status || ""} ${candle.note || ""}`;
    return candle.isRunning === true || candle.isClosed === false || candle.isFinal === false || candle.x === false || /running|preview|live/i.test(marker);
  }

  function createNoneBosChoch(note = "No close-confirmed structure break detected.") {
    return { status: "None", type: "None", direction: "Neutral", level: null, brokenSwing: null, confirmedByCandle: null, confirmedAtIndex: null, confirmedAtTime: null, confirmation: "None", note };
  }

  function createEmptySweepStatus(note = "No sweep context detected.") {
    return { hasSweep: false, direction: null, sweptLevel: null, sweptSwing: null, sweepCandle: null, sweepIndex: null, sweepTime: null, closeReturned: false, note };
  }

  function createEmptyStructureContext(timeframe, reason = "No valid structure detected") {
    const role = getRole(timeframe);
    return {
      available: false,
      timeframe,
      role,
      rawPivots: [],
      internalSwings: [],
      majorSwings: [],
      structuralSwings: [],
      analysisSwings: [],
      displaySwings: [],
      analysisLabels: [],
      displayLabels: [],
      labels: [],
      protectedHigh: null,
      protectedLow: null,
      lastSwingHigh: null,
      lastSwingLow: null,
      trendState: "Unknown",
      bias: "Neutral",
      status: "No Clear Structure",
      setupState: "Unavailable",
      timingState: "Unavailable",
      bosChoch: createNoneBosChoch(reason),
      sweepStatus: createEmptySweepStatus(reason),
      sequence: [],
      debugStats: {},
      summary: reason,
      note: "Planning context only."
    };
  }

  function getClosedCandlesForStructure(timeframe) {
    const source = window.BtcDash.state?.marketData?.[timeframe] || [];
    return source.filter((candle) => candle && !isRunningLike(candle)).map((candle, index) => ({ ...candle, _closedIndex: index }));
  }

  function calculateAtrSeries(candles, atrLength = 14) {
    const trs = candles.map((candle, index) => {
      const high = toNumber(candle.high);
      const low = toNumber(candle.low);
      const close = toNumber(candle.close);
      const prevClose = index > 0 ? toNumber(candles[index - 1].close) : close;
      if (high == null || low == null || close == null || prevClose == null) return null;
      return Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    });
    return trs.map((_, index) => {
      if (index < atrLength - 1) return null;
      const windowTrs = trs.slice(index - atrLength + 1, index + 1);
      if (windowTrs.some((value) => value == null)) return null;
      return windowTrs.reduce((sum, value) => sum + value, 0) / atrLength;
    });
  }

  function detectRawPivots(candles, timeframe) {
    const { tf } = getConfig(timeframe);
    const left = tf.pivotLeft ?? 4;
    const right = tf.pivotRight ?? 4;
    const atrSeries = calculateAtrSeries(candles, tf.atrLength || 14);
    const pivots = [];
    for (let index = left; index < candles.length - right; index += 1) {
      const candle = candles[index];
      const high = toNumber(candle.high);
      const low = toNumber(candle.low);
      if (high == null || low == null) continue;
      let isHigh = true;
      let isLow = true;
      for (let offset = index - left; offset <= index + right; offset += 1) {
        if (offset === index) continue;
        const otherHigh = toNumber(candles[offset]?.high);
        const otherLow = toNumber(candles[offset]?.low);
        if (otherHigh == null || high <= otherHigh) isHigh = false;
        if (otherLow == null || low >= otherLow) isLow = false;
      }
      const confirmedAtIndex = index + right;
      const base = {
        timeframe,
        time: getCandleTime(candle),
        index,
        candle,
        layer: "rawPivot",
        structureType: "rawPivot",
        isConfirmed: true,
        pivotIndex: index,
        pivotTime: getCandleTime(candle),
        confirmedAtIndex,
        confirmedAtTime: getCandleTime(candles[confirmedAtIndex]),
        atr: atrSeries[index],
        note: "Raw Pivot candidate only; not structural by itself."
      };
      if (isHigh) pivots.push({ ...base, id: `${timeframe}-raw-high-${index}`, type: "high", price: high });
      if (isLow) pivots.push({ ...base, id: `${timeframe}-raw-low-${index}`, type: "low", price: low });
    }
    return pivots.sort((a, b) => a.index - b.index || a.price - b.price).slice(-(tf.maxRawPivots || 120));
  }

  function minMoveForPivot(pivot, timeframe, layerName) {
    const { tf } = getConfig(timeframe);
    const layer = tf.layerRules?.[layerName] || {};
    const scale = layer.minMoveScale ?? 1;
    const pctMove = pivot.price * ((tf.minMovePct || 1) / 100);
    const atrMove = (pivot.atr || pctMove) * (tf.atrMultiplier || 1);
    return Math.max(pctMove, atrMove) * scale;
  }

  function createStructuralSwing(pivot, previous, timeframe, layerName, reason) {
    const move = previous ? Math.abs(pivot.price - previous.price) : 0;
    const pct = previous?.price ? (move / previous.price) * 100 : 0;
    const atr = pivot.atr ? move / pivot.atr : null;
    return {
      id: `${timeframe}-${layerName}-${pivot.type}-${pivot.index}`,
      timeframe,
      type: pivot.type,
      price: pivot.price,
      time: pivot.time,
      index: pivot.index,
      label: pivot.type === "high" ? "H" : "L",
      layer: layerName,
      structureType: layerName,
      isStructural: true,
      isConfirmed: true,
      sourcePivotId: pivot.id,
      pivotIndex: pivot.pivotIndex,
      pivotTime: pivot.pivotTime,
      confirmedAtIndex: pivot.confirmedAtIndex,
      confirmedAtTime: pivot.confirmedAtTime,
      previousSwingId: previous?.id || null,
      previousSameTypeSwingId: null,
      moveFromPrevious: move,
      moveFromPreviousPct: pct,
      moveFromPreviousAtr: atr,
      barsFromPrevious: previous ? pivot.index - previous.index : 0,
      isProtectedHigh: false,
      isProtectedLow: false,
      breakState: { isBroken: false, brokenAtIndex: null, brokenAtTime: null, brokenByClose: false, wickOnly: false, weakBreak: false, confirmation: "None", note: "Unbroken structural reference." },
      score: Number(Math.min(10, Math.max(1, (pct || 1) + (atr || 0))).toFixed(2)),
      scoreLabel: "Reference",
      reasons: [reason],
      note: "Planning context only."
    };
  }

  function buildStructureLayer(rawPivots, candles, timeframe, layerName) {
    const { tf } = getConfig(timeframe);
    const layer = tf.layerRules?.[layerName] || {};
    const minBarGap = Math.ceil((tf.minBarGap || 4) * (layer.minBarGapScale ?? 1));
    const maxSwings = layer.maxSwings || tf[layerName === "major" ? "maxMajorSwings" : "maxInternalSwings"] || 20;
    const swings = [];
    const stats = { rejectedRawPivotCount: 0, replacedSwingCount: 0 };

    rawPivots.forEach((pivot) => {
      const last = swings[swings.length - 1];
      if (!last) {
        swings.push(createStructuralSwing(pivot, null, timeframe, layerName, "First confirmed raw pivot promoted after pivot delay."));
        return;
      }

      if (last.type === pivot.type) {
        const replacesHigh = pivot.type === "high" && pivot.price > last.price;
        const replacesLow = pivot.type === "low" && pivot.price < last.price;
        if (replacesHigh || replacesLow) {
          const replacement = createStructuralSwing(pivot, swings[swings.length - 2] || null, timeframe, layerName, "ZigZag replacement before a valid counter-swing.");
          swings[swings.length - 1] = replacement;
          stats.replacedSwingCount += 1;
        } else {
          stats.rejectedRawPivotCount += 1;
        }
        return;
      }

      const move = Math.abs(pivot.price - last.price);
      const bars = pivot.index - last.index;
      const minMove = minMoveForPivot(pivot, timeframe, layerName);
      if (move >= minMove && bars >= minBarGap) {
        swings.push(createStructuralSwing(pivot, last, timeframe, layerName, `Accepted ${layerName} structure: move ${move.toFixed(2)} >= ${minMove.toFixed(2)} and bar gap ${bars} >= ${minBarGap}.`));
      } else {
        stats.rejectedRawPivotCount += 1;
      }
    });

    return { swings: labelStructuralSwings(swings.slice(-maxSwings), timeframe, layerName), stats };
  }

  function labelStructuralSwings(swings, timeframe, layerName) {
    const { tf } = getConfig(timeframe);
    const tolerance = (tf.eqTolerancePct || 0.5) / 100;
    let previousHigh = null;
    let previousLow = null;
    return swings.map((swing) => {
      const next = { ...swing, layer: layerName, structureType: layerName };
      if (next.type === "high") {
        if (!previousHigh) next.label = "H";
        else if (next.price > previousHigh.price * (1 + tolerance)) next.label = "HH";
        else if (next.price < previousHigh.price * (1 - tolerance)) next.label = "LH";
        else next.label = "H";
        next.previousSameTypeSwingId = previousHigh?.id || null;
        previousHigh = next;
      } else {
        if (!previousLow) next.label = "L";
        else if (next.price > previousLow.price * (1 + tolerance)) next.label = "HL";
        else if (next.price < previousLow.price * (1 - tolerance)) next.label = "LL";
        else next.label = "L";
        next.previousSameTypeSwingId = previousLow?.id || null;
        previousLow = next;
      }
      return next;
    });
  }

  function promotePivotsToStructure(rawPivots, candles, timeframe) {
    const internal = buildStructureLayer(rawPivots, candles, timeframe, "internal");
    const major = buildStructureLayer(rawPivots, candles, timeframe, "major");
    const structuralSwings = [...major.swings, ...internal.swings]
      .sort((a, b) => a.index - b.index || (a.layer === "major" ? -1 : 1));
    return {
      internalSwings: internal.swings,
      majorSwings: major.swings,
      structuralSwings,
      debugStats: {
        rejectedRawPivotCount: internal.stats.rejectedRawPivotCount + major.stats.rejectedRawPivotCount,
        replacedSwingCount: internal.stats.replacedSwingCount + major.stats.replacedSwingCount
      }
    };
  }

  function deriveProtectedLevels(swings) {
    const highs = swings.filter((swing) => swing.type === "high");
    const lows = swings.filter((swing) => swing.type === "low");
    const protectedHigh = highs[highs.length - 1] ? { ...highs[highs.length - 1], isProtectedHigh: true } : null;
    const protectedLow = lows[lows.length - 1] ? { ...lows[lows.length - 1], isProtectedLow: true } : null;
    return { protectedHigh, protectedLow, lastSwingHigh: protectedHigh, lastSwingLow: protectedLow };
  }

  function breakEventForLevel(candle, index, levelSwing, direction, timeframe) {
    if (!levelSwing) return null;
    const { tf, root } = getConfig(timeframe);
    const close = toNumber(candle.close);
    const high = toNumber(candle.high);
    const low = toNumber(candle.low);
    if (close == null || high == null || low == null) return null;
    const level = levelSwing.price;
    const buffer = (tf.breakBufferPct || 0.1) / 100;
    const weakBuffer = (tf.weakBreakBufferPct || 0.05) / 100;
    if (direction === "Bullish") {
      if (close > level * (1 + buffer)) return { type: "BOS", confirmation: root.wording?.closeConfirmed || "Close Confirmed" };
      if (close > level * (1 + weakBuffer)) return { type: "Weak Break", confirmation: root.wording?.needsConfirmation || "Needs Confirmation" };
      if (high > level && close <= level) return { type: "Sweep", confirmation: "Wick Only" };
    } else {
      if (close < level * (1 - buffer)) return { type: "BOS", confirmation: root.wording?.closeConfirmed || "Close Confirmed" };
      if (close < level * (1 - weakBuffer)) return { type: "Weak Break", confirmation: root.wording?.needsConfirmation || "Needs Confirmation" };
      if (low < level && close >= level) return { type: "Sweep", confirmation: "Wick Only" };
    }
    return null;
  }

  function deriveBosChochState(candles, swings, timeframe, protectedLevels) {
    let latest = null;
    [{ level: protectedLevels.protectedHigh, direction: "Bullish" }, { level: protectedLevels.protectedLow, direction: "Bearish" }].forEach(({ level, direction }) => {
      if (!level) return;
      for (let index = Math.max((level.confirmedAtIndex || level.index) + 1, 0); index < candles.length; index += 1) {
        const event = breakEventForLevel(candles[index], index, level, direction, timeframe);
        if (!event) continue;
        if (!latest || index >= latest.confirmedAtIndex) {
          latest = {
            status: event.type === "BOS" ? "Close Confirmed" : event.confirmation,
            type: event.type,
            direction,
            level: level.price,
            brokenSwing: level,
            confirmedByCandle: candles[index],
            confirmedAtIndex: index,
            confirmedAtTime: getCandleTime(candles[index]),
            confirmation: event.confirmation,
            note: event.type === "Sweep" ? "Wick-only break is sweep context, not BOS/CHoCH." : event.type === "Weak Break" ? "Weak close break needs confirmation." : "Close-confirmed structural break."
          };
        }
      }
    });
    return latest || createNoneBosChoch();
  }

  function deriveSweepStatus(candles, swings, timeframe, protectedLevels) {
    let latest = null;
    [{ level: protectedLevels.protectedHigh, direction: "up" }, { level: protectedLevels.protectedLow, direction: "down" }].forEach(({ level, direction }) => {
      if (!level) return;
      for (let index = Math.max((level.confirmedAtIndex || level.index) + 1, 0); index < candles.length; index += 1) {
        const high = toNumber(candles[index].high);
        const low = toNumber(candles[index].low);
        const close = toNumber(candles[index].close);
        const isSweepHigh = direction === "up" && high > level.price && close <= level.price;
        const isSweepLow = direction === "down" && low < level.price && close >= level.price;
        if ((isSweepHigh || isSweepLow) && (!latest || index >= latest.sweepIndex)) {
          latest = { hasSweep: true, direction, sweptLevel: level.price, sweptSwing: level, sweepCandle: candles[index], sweepIndex: index, sweepTime: getCandleTime(candles[index]), closeReturned: true, note: "Wick-only sweep context; not a close-confirmed structure break." };
        }
      }
    });
    return latest || createEmptySweepStatus();
  }

  function deriveStructureBias(input) {
    const labels = (input.analysisSwings || []).map((swing) => swing.label);
    const bullish = labels.filter((label) => label === "HH" || label === "HL").length;
    const bearish = labels.filter((label) => label === "LH" || label === "LL").length;
    const role = input.role;
    let bias = "Neutral";
    let trendState = role === "macro" ? "Macro Range" : role === "context" ? "Range" : role === "setup" ? "Mixed Setup" : "Mixed Timing";
    if (bullish > bearish) {
      bias = role === "macro" ? "Macro Bullish" : "Bullish";
      trendState = role === "macro" ? "Macro Uptrend" : role === "context" ? "Bullish Context" : role === "setup" ? "Bullish Setup" : "Bullish Timing";
    } else if (bearish > bullish) {
      bias = role === "macro" ? "Macro Bearish" : "Bearish";
      trendState = role === "macro" ? "Macro Downtrend" : role === "context" ? "Bearish Context" : role === "setup" ? "Bearish Setup" : "Bearish Timing";
    }
    if (input.bosChoch?.type === "Weak Break") trendState = `${trendState} / Needs Confirmation`;
    if (input.sweepStatus?.hasSweep && role === "timing") trendState = "Sweep Reaction";
    return {
      trendState,
      bias,
      status: trendState,
      setupState: role === "setup" ? trendState : role === "timing" ? "Timing only" : "Higher timeframe context",
      timingState: role === "timing" ? trendState : "Not timing timeframe",
      summary: `${input.timeframe} ${role} structure: ${trendState}. ${input.bosChoch?.note || "Reference only."}`
    };
  }

  function buildCleanDisplaySwings(analysisSwings, timeframe, options = {}) {
    const { tf, root } = getConfig(timeframe);
    const limit = options.limit || tf.displayMaxLabels || root.displayRules?.maxLabelsFallback || 12;
    const swings = (analysisSwings || []).filter((swing) => swing?.isStructural !== false && swing?.label && Number.isFinite(Number(swing.price)) && swing.time != null);
    const minGap = Math.max(1, Math.round((tf.minBarGap || 1) * (timeframe === "4H" ? 0.9 : timeframe === "1H" ? 0.75 : 0.5)));
    const importantLabels = new Set(["HH", "HL", "LH", "LL"]);
    const ranked = swings.map((swing, index) => ({
      swing,
      index,
      score: (importantLabels.has(swing.label) ? 5 : 1) + Math.min(4, Math.abs(Number(swing.moveFromPreviousPct || 0))) + index / Math.max(1, swings.length)
    })).sort((a, b) => b.score - a.score);
    const selected = [];
    ranked.forEach(({ swing }) => {
      if (selected.length >= limit) return;
      const tooClose = selected.some((item) => Math.abs(Number(item.index ?? 0) - Number(swing.index ?? 0)) < minGap && item.type === swing.type);
      if (!tooClose) selected.push({ ...swing, timeframe });
    });
    if (selected.length < Math.min(limit, swings.length)) {
      swings.slice().reverse().forEach((swing) => {
        if (selected.length >= limit) return;
        if (!selected.some((item) => item.id === swing.id)) selected.push({ ...swing, timeframe });
      });
    }
    return selected.sort((a, b) => Number(a.index || 0) - Number(b.index || 0));
  }

  function buildDisplaySwings(analysisSwings, timeframe) {
    return buildCleanDisplaySwings(analysisSwings, timeframe);
  }

  function rebuildStructureForTimeframe(timeframe, options = {}) {
    try {
      const candles = getClosedCandlesForStructure(timeframe);
      const { tf } = getConfig(timeframe);
      if (!candles.length || candles.length < Math.max((tf.pivotLeft || 4) + (tf.pivotRight || 4) + 5, 20)) {
        const empty = createEmptyStructureContext(timeframe, "Not enough closed candles for Structure V2.");
        window.BtcDash.state.structureContexts[timeframe] = empty;
        try { structureContexts[timeframe] = empty; } catch (error) { /* ignore lexical fallback */ }
        return empty;
      }
      const rawPivots = detectRawPivots(candles, timeframe);
      const promoted = promotePivotsToStructure(rawPivots, candles, timeframe);
      const role = getRole(timeframe);
      const primary = (role === "macro" || role === "context") ? (promoted.majorSwings.length ? promoted.majorSwings : promoted.internalSwings) : (promoted.internalSwings.length ? promoted.internalSwings : promoted.majorSwings);
      if (!primary.length) {
        const empty = createEmptyStructureContext(timeframe, "Raw pivots found but no valid structural swing passed V2 filters.");
        empty.rawPivots = rawPivots;
        empty.debugStats = promoted.debugStats;
        window.BtcDash.state.structureContexts[timeframe] = empty;
        try { structureContexts[timeframe] = empty; } catch (error) { /* ignore lexical fallback */ }
        return empty;
      }
      const protectedLevels = deriveProtectedLevels(primary, timeframe);
      const bosChoch = deriveBosChochState(candles, primary, timeframe, protectedLevels);
      const sweepStatus = deriveSweepStatus(candles, primary, timeframe, protectedLevels);
      const bias = deriveStructureBias({ timeframe, role, analysisSwings: primary, bosChoch, sweepStatus, protectedLevels });
      const displaySwings = buildDisplaySwings(primary, timeframe);
      const context = {
        available: true,
        timeframe,
        role,
        rawPivots,
        internalSwings: promoted.internalSwings,
        majorSwings: promoted.majorSwings,
        structuralSwings: promoted.structuralSwings,
        analysisSwings: primary,
        displaySwings,
        analysisLabels: primary,
        displayLabels: displaySwings,
        labels: displaySwings,
        ...protectedLevels,
        trendState: bias.trendState,
        bias: bias.bias,
        status: bias.status,
        setupState: bias.setupState,
        timingState: bias.timingState,
        bosChoch,
        sweepStatus,
        sequence: primary.map((swing) => swing.label).filter(Boolean),
        debugStats: { ...promoted.debugStats, rawPivotCount: rawPivots.length, internalSwingCount: promoted.internalSwings.length, majorSwingCount: promoted.majorSwings.length, displayedLabelCount: displaySwings.length, analysisSwingCount: primary.length, displaySwingCount: displaySwings.length, hiddenDisplaySwingCount: Math.max(0, primary.length - displaySwings.length), displayFilterReason: "Clean display swings prioritize valid HH/HL/LH/LL, spacing, move size, and recency.", reason: options.reason || null },
        summary: bias.summary,
        note: "Planning context only. Raw Pivot is not structure."
      };
      window.BtcDash.state.structureContexts[timeframe] = context;
      try { structureContexts[timeframe] = context; } catch (error) { /* ignore lexical fallback */ }
      return context;
    } catch (error) {
      const empty = createEmptyStructureContext(timeframe, `Structure V2 error: ${error.message}`);
      empty.debugStats = { error: error.message };
      window.BtcDash.state.structureContexts[timeframe] = empty;
      return empty;
    }
  }

  function rebuildStructureContexts(options = {}) {
    const timeframes = getConfig("1W").timeframes;
    const contexts = {};
    timeframes.forEach((timeframe) => { contexts[timeframe] = rebuildStructureForTimeframe(timeframe, options); });
    const totals = Object.values(contexts).reduce((acc, context) => {
      acc.rawPivotCount += context.rawPivots?.length || 0;
      acc.internalSwingCount += context.internalSwings?.length || 0;
      acc.majorSwingCount += context.majorSwings?.length || 0;
      acc.displayedLabelCount += context.displaySwings?.length || 0;
      acc.rejectedRawPivotCount += context.debugStats?.rejectedRawPivotCount || 0;
      acc.replacedSwingCount += context.debugStats?.replacedSwingCount || 0;
      acc.sweepCount += context.sweepStatus?.hasSweep ? 1 : 0;
      acc.bosCount += context.bosChoch?.type === "BOS" ? 1 : 0;
      acc.chochCount += context.bosChoch?.type === "CHoCH" ? 1 : 0;
      return acc;
    }, { rawPivotCount: 0, internalSwingCount: 0, majorSwingCount: 0, displayedLabelCount: 0, rejectedRawPivotCount: 0, replacedSwingCount: 0, sweepCount: 0, bosCount: 0, chochCount: 0 });
    const stats = { ...(window.BtcDash.state.structureDebugStats || {}), ...totals, lastBuildAt: new Date().toISOString(), warnings: [] };
    window.BtcDash.state.structureDebugStats = stats;
    try { Object.assign(structureDebugStats, stats); } catch (error) { /* ignore lexical fallback */ }
    return window.BtcDash.state.structureContexts;
  }

  function getStructureContext(timeframe) {
    return window.BtcDash.state?.structureContexts?.[timeframe] || createEmptyStructureContext(timeframe, "Structure context has not been built yet.");
  }


  function getStructuralSourceSwings(timeframe, sourceSwingLayer = "major") {
    const context = window.BtcDash.state?.structureContexts?.[timeframe];
    if (!context?.available) return [];
    let source = [];
    if (sourceSwingLayer === "major") source = context.majorSwings?.length ? context.majorSwings : (context.analysisSwings || context.analysisLabels || []);
    else source = context.internalSwings?.length ? context.internalSwings : (context.analysisSwings || context.analysisLabels || []);
    return (source || [])
      .filter((swing) => swing && (swing.type === "high" || swing.type === "low") && Number.isFinite(Number(swing.price)) && (swing.time != null) && Number.isFinite(Number(swing.index)) && swing.layer !== "rawPivot" && swing.structureType !== "rawPivot" && swing.isStructural !== false)
      .sort((a, b) => Number(a.index) - Number(b.index));
  }

  const api = {
    rebuildStructureContexts,
    rebuildStructureForTimeframe,
    createEmptyStructureContext,
    calculateAtrSeries,
    detectRawPivots,
    promotePivotsToStructure,
    buildStructureLayer,
    labelStructuralSwings,
    deriveBosChochState,
    deriveSweepStatus,
    deriveProtectedLevels,
    deriveStructureBias,
    buildCleanDisplaySwings,
    getStructureContext,
    getStructuralSourceSwings,
    rebuildAllStructureContexts: rebuildStructureContexts,
    buildMarketStructureContext: rebuildStructureForTimeframe,
    detectSwingPoints: detectRawPivots,
    classifySwingLabels: labelStructuralSwings,
    deriveBosChoch: deriveBosChochState
  };

  window.BtcDash.engines.structure = api;
  window.BtcDash.structureEngine = api;
  window.rebuildStructureContexts = rebuildStructureContexts;
  window.rebuildAllStructureContexts = rebuildStructureContexts;
  window.rebuildStructureForTimeframe = rebuildStructureForTimeframe;
  window.buildMarketStructureContext = rebuildStructureForTimeframe;
})();
