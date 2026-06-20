(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.engines = window.BtcDash.engines || {};

  const DEFAULT_TIMEFRAMES = ["1W", "1D", "4H", "1H"];
  const STRUCTURE_ROLE_BY_TIMEFRAME = { "1W": "macro", "1D": "context", "4H": "setup", "1H": "timing" };
  const SETUP_SWING_RULES_4H = { minLegBars: 8, minLegMovePct: 1.8, minAtrMove: 1.4, preferRecent: true, maxSetupSwings: 14 };
  const TIMING_SWING_RULES_1H = { minLegBars: 6, minLegMovePct: 0.8, minAtrMove: 1.1, preferRecent: true, maxTimingSwings: 16 };

  function getConfig(timeframe) {
    const root = window.BtcDash.config?.STRUCTURE_V2_CONFIG || {};
    return { root, tf: root[timeframe] || {}, timeframes: root.timeframes || DEFAULT_TIMEFRAMES };
  }

  function getRole(timeframe) {
    return getConfig(timeframe).tf.role || STRUCTURE_ROLE_BY_TIMEFRAME[timeframe] || "timing";
  }

  function getCandleTime(candle) {
    return candle?.time ?? candle?.openTime ?? candle?.open_time ?? candle?.t ?? null;
  }

  function toTimeMs(value) {
    if (value == null) return null;
    if (typeof value === "number") return value > 10000000000 ? Math.floor(value) : Math.floor(value * 1000);
    if (/^\d+$/.test(String(value))) {
      const number = Number(value);
      return number > 10000000000 ? Math.floor(number) : Math.floor(number * 1000);
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function toIsoTime(value) {
    const timeMs = toTimeMs(value);
    return Number.isFinite(timeMs) ? new Date(timeMs).toISOString() : String(value || "");
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
      candidateSwings: [],
      zigzagSwings: [],
      validLegSwings: [],
      internalSwings: [],
      majorSwings: [],
      setupSwings: [],
      timingSwings: [],
      structuralSwings: [],
      analysisSwings: [],
      displaySwings: [],
      analysisSource: null,
      displaySource: null,
      classificationWarnings: [],
      analysisLabels: [],
      displayLabels: [],
      labels: [],
      protectedHigh: null,
      protectedLow: null,
      timingProtectedHigh: null,
      timingProtectedLow: null,
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
    const timeMs = toTimeMs(pivot.time);
    const qualityScore = Number(Math.min(10, Math.max(1, (pct || 1) + (atr || 0))).toFixed(2));
    return {
      id: `${timeframe}-${layerName}-${pivot.type}-${pivot.index}`,
      timeframe,
      type: pivot.type,
      price: pivot.price,
      time: toIsoTime(pivot.time),
      timeMs,
      barIndex: pivot.index,
      index: pivot.index,
      label: pivot.type === "high" ? "H" : "L",
      hierarchy: layerName,
      sourceLayer: layerName,
      layer: layerName,
      structureType: layerName,
      isStructural: true,
      isDisplayEligible: layerName !== "rawPivot",
      isConfirmed: true,
      comparedTo: null,
      classificationReason: "Awaiting same-type structural reference.",
      classificationScope: getRole(timeframe),
      isConfirmedStructure: false,
      role: getRole(timeframe),
      breakStatus: "unbroken",
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
      qualityScore,
      score: qualityScore,
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
    return classifyStructureSwingsV2(swings, null, timeframe, getRole(timeframe), { hierarchy: layerName });
  }

  function cloneSwingForHierarchy(swing, hierarchy, reason) {
    return {
      ...swing,
      id: swing.id.replace(/-(internal|major|setup|timing)-/, `-${hierarchy}-`),
      hierarchy,
      sourceLayer: swing.sourceLayer || swing.layer || swing.hierarchy,
      layer: hierarchy,
      structureType: hierarchy,
      role: hierarchy === "setup" ? "setup" : hierarchy === "timing" ? "timing" : swing.role,
      isStructural: true,
      isDisplayEligible: true,
      classificationScope: hierarchy === "setup" ? "setup" : hierarchy === "timing" ? "timing" : swing.classificationScope,
      reasons: [...(swing.reasons || []), reason].filter(Boolean)
    };
  }

  function buildHierarchySwings(sourceSwings, timeframe, hierarchy, rules) {
    const accepted = [];
    const max = rules.maxSetupSwings || rules.maxTimingSwings || sourceSwings.length;
    sourceSwings.forEach((swing) => {
      const last = accepted[accepted.length - 1];
      if (!last) { accepted.push(cloneSwingForHierarchy(swing, hierarchy, `First ${hierarchy} swing selected from ${swing.hierarchy || swing.layer}.`)); return; }
      if (last.type === swing.type) {
        const moreExtreme = swing.type === "high" ? swing.price > last.price : swing.price < last.price;
        if (moreExtreme) accepted[accepted.length - 1] = cloneSwingForHierarchy(swing, hierarchy, `${hierarchy} ZigZag replacement kept the more extreme ${swing.type}.`);
        return;
      }
      const bars = Math.abs(Number(swing.index ?? swing.barIndex ?? 0) - Number(last.index ?? last.barIndex ?? 0));
      const movePct = last.price ? Math.abs(swing.price - last.price) / last.price * 100 : 0;
      const atrMove = swing.moveFromPreviousAtr || (swing.atr ? Math.abs(swing.price - last.price) / swing.atr : null);
      const atrOk = atrMove == null || atrMove >= (rules.minAtrMove || 0);
      if (bars >= (rules.minLegBars || 0) && movePct >= (rules.minLegMovePct || 0) && atrOk) accepted.push(cloneSwingForHierarchy(swing, hierarchy, `${hierarchy} swing accepted: ${movePct.toFixed(2)}% over ${bars} bars.`));
    });
    return accepted.slice(-max);
  }

  function buildSetupSwings(majorSwings, validLegSwings, timeframe) {
    if (timeframe !== "4H") return [];
    const source = (majorSwings?.length ? majorSwings : validLegSwings || []).filter(Boolean);
    return classifyStructureSwingsV2(buildHierarchySwings(source, timeframe, "setup", SETUP_SWING_RULES_4H), null, timeframe, "setup", { hierarchy: "setup" });
  }

  function buildTimingSwings(internalSwings, timeframe) {
    if (timeframe !== "1H") return [];
    return classifyStructureSwingsV2(buildHierarchySwings(internalSwings || [], timeframe, "timing", TIMING_SWING_RULES_1H), null, timeframe, "timing", { hierarchy: "timing" });
  }

  function classifyStructureSwingsV2(primarySwings, protectedContext, timeframe, role, config = {}) {
    const { tf } = getConfig(timeframe);
    const tolerance = (tf.eqTolerancePct || 0.5) / 100;
    const hierarchy = config.hierarchy || (role === "setup" ? "setup" : role === "timing" ? "timing" : "major");
    let previousHigh = null;
    let previousLow = null;
    return (primarySwings || []).map((swing) => {
      const next = { ...swing, hierarchy: swing.hierarchy || hierarchy, sourceLayer: swing.sourceLayer || swing.layer || hierarchy, layer: swing.layer || hierarchy, structureType: swing.structureType || hierarchy, role, classificationScope: role, isDisplayEligible: true };
      const ref = next.type === "high" ? previousHigh : previousLow;
      if (!ref) {
        next.label = next.type === "high" ? "H" : "L";
        next.comparedTo = null;
        next.classificationReason = `First ${role} ${next.type}; no prior ${next.type} reference yet.`;
        next.isConfirmedStructure = false;
      } else if (next.type === "high") {
        const broke = next.price > ref.price * (1 + tolerance);
        next.label = broke ? "HH" : "LH";
        next.comparedTo = ref.id;
        const pct = ref.price ? ((next.price - ref.price) / ref.price) * 100 : 0;
        next.classificationReason = broke ? `High broke prior ${role} high ${ref.id} by ${pct.toFixed(2)}%.` : `High failed to break prior ${role} high ${ref.id}; classified as LH.`;
        next.isConfirmedStructure = true;
        previousHigh = next;
        return next;
      } else {
        const broke = next.price < ref.price * (1 - tolerance);
        next.label = broke ? "LL" : "HL";
        next.comparedTo = ref.id;
        const pct = ref.price ? ((ref.price - next.price) / ref.price) * 100 : 0;
        next.classificationReason = broke ? `Low broke prior ${role} low ${ref.id} by ${pct.toFixed(2)}%.` : `Low held above prior ${role} low ${ref.id}; classified as HL.`;
        next.isConfirmedStructure = true;
        previousLow = next;
        return next;
      }
      if (next.type === "high") previousHigh = next;
      else previousLow = next;
      return next;
    });
  }

  function makeProtectedLevel(swing, timeframe, role, type, options = {}) {
    if (!swing) return null;
    return {
      id: `${timeframe}-${options.isTimingOnly ? "timing-" : ""}protected-${type}-${swing.id}`,
      timeframe,
      type,
      price: swing.price,
      time: swing.time,
      timeMs: swing.timeMs ?? toTimeMs(swing.time),
      barIndex: swing.barIndex ?? swing.index,
      index: swing.index,
      sourceSwingId: swing.id,
      sourceHierarchy: swing.hierarchy || swing.layer || swing.structureType,
      role,
      isTimingOnly: Boolean(options.isTimingOnly),
      canOverrideHtf: options.canOverrideHtf !== false && role !== "timing",
      weakProtectedFallback: Boolean(options.weakProtectedFallback),
      reason: options.reason || `Protected ${type} resolved from ${swing.hierarchy || swing.layer} ${role} swing.`,
      isProtectedHigh: type === "high",
      isProtectedLow: type === "low"
    };
  }

  function resolveProtectedLevelsV2(primarySwings, timeframe, role, candles, config = {}) {
    const highs = (primarySwings || []).filter((swing) => swing.type === "high");
    const lows = (primarySwings || []).filter((swing) => swing.type === "low");
    const high = highs.at(-1) || null;
    const low = lows.at(-1) || null;
    const isTimingOnly = role === "timing";
    const protectedHigh = makeProtectedLevel(high, timeframe, role, "high", { isTimingOnly, canOverrideHtf: !isTimingOnly, reason: isTimingOnly ? "Timing-only high reference; cannot override HTF." : `Protected high resolved from ${high?.hierarchy || "primary"} hierarchy.` });
    const protectedLow = makeProtectedLevel(low, timeframe, role, "low", { isTimingOnly, canOverrideHtf: !isTimingOnly, reason: isTimingOnly ? "Timing-only low reference; cannot override HTF." : `Protected low resolved from ${low?.hierarchy || "primary"} hierarchy.` });
    return { protectedHigh, protectedLow, timingProtectedHigh: isTimingOnly ? protectedHigh : null, timingProtectedLow: isTimingOnly ? protectedLow : null, lastSwingHigh: protectedHigh, lastSwingLow: protectedLow };
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

  function deriveProtectedLevels(swings, timeframe = "4H") {
    return resolveProtectedLevelsV2(swings, timeframe, getRole(timeframe), [], {});
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
    const hasConfirmedBreak = input.bosChoch?.type === "BOS" || input.bosChoch?.type === "CHoCH";
    let bias = "Neutral";
    let trendState = role === "macro" ? "Macro Range" : role === "context" ? "Range" : role === "setup" ? "Range / Compression" : "Mixed Timing";
    if (bullish > bearish) {
      bias = role === "macro" ? "Macro Bullish" : "Bullish";
      trendState = role === "macro" ? "Macro Uptrend" : role === "context" ? "Bullish Context" : role === "setup" ? "Bullish Setup" : "Bullish Timing";
    } else if (bearish > bullish) {
      bias = role === "macro" ? "Macro Bearish" : "Bearish";
      trendState = role === "macro" ? "Macro Downtrend" : role === "context" ? "Bearish Context" : role === "setup" ? "Bearish Setup" : "Bearish Timing";
    }
    if (!hasConfirmedBreak && role === "setup") {
      if (trendState === "Bullish Setup") trendState = "Bullish Setup Leaning";
      else if (trendState === "Bearish Setup") trendState = "Bearish Setup Leaning";
      else trendState = input.sweepStatus?.hasSweep ? "Recovery Without BOS" : "Range / Compression";
    }
    if (!hasConfirmedBreak && (role === "macro" || role === "context") && /Bullish|Bearish/.test(trendState)) trendState = `${trendState} Leaning`;
    if (input.bosChoch?.type === "Weak Break") trendState = `${trendState} / Needs Confirmation`;
    if (input.sweepStatus?.hasSweep && role === "timing") trendState = "Sweep Reaction Timing";
    const setupState = role === "setup" ? trendState : role === "timing" ? "Timing only" : "Higher timeframe context";
    const timingState = role === "timing" ? trendState : "Not timing timeframe";
    const noBreak = hasConfirmedBreak ? "" : " No close-confirmed structure break detected.";
    const timingNote = role === "timing" ? " 1H is timing-only and cannot override higher timeframe structure." : "";
    return {
      trendState,
      bias,
      status: trendState,
      setupState,
      timingState,
      canOverrideHtf: role !== "timing",
      summary: `${input.timeframe} ${role} structure: ${trendState}.${noBreak}${timingNote} ${input.bosChoch?.note || "Reference only."}`
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
      const candidateSwings = [...promoted.majorSwings, ...promoted.internalSwings].sort((a, b) => Number(a.index) - Number(b.index));
      const zigzagSwings = candidateSwings;
      const validLegSwings = promoted.majorSwings.length ? promoted.majorSwings : promoted.internalSwings;
      const setupSwings = buildSetupSwings(promoted.majorSwings, validLegSwings, timeframe);
      const timingSwings = buildTimingSwings(promoted.internalSwings, timeframe);
      let primary = [];
      let analysisSource = "majorSwings";
      if (role === "macro" || role === "context") { primary = promoted.majorSwings; analysisSource = "majorSwings"; }
      else if (role === "setup") { primary = setupSwings.length ? setupSwings : promoted.majorSwings; analysisSource = setupSwings.length ? "setupSwings" : "majorSwings"; }
      else { primary = timingSwings.length ? timingSwings : classifyStructureSwingsV2((promoted.internalSwings || []).map((swing) => cloneSwingForHierarchy(swing, "timing", "Timing fallback from filtered internal swing.")), null, timeframe, role, { hierarchy: "timing" }); analysisSource = "timingSwings"; }
      if (!primary.length) {
        const empty = createEmptyStructureContext(timeframe, "Raw pivots found but no valid structural swing passed V2 filters.");
        empty.rawPivots = rawPivots;
        empty.candidateSwings = candidateSwings;
        empty.zigzagSwings = zigzagSwings;
        empty.validLegSwings = validLegSwings;
        empty.setupSwings = setupSwings;
        empty.timingSwings = timingSwings;
        empty.analysisSource = analysisSource;
        empty.displaySource = analysisSource;
        empty.classificationWarnings = ["No primary hierarchy swings available."];
        empty.debugStats = promoted.debugStats;
        window.BtcDash.state.structureContexts[timeframe] = empty;
        try { structureContexts[timeframe] = empty; } catch (error) { /* ignore lexical fallback */ }
        return empty;
      }
      primary = classifyStructureSwingsV2(primary, null, timeframe, role, { hierarchy: role === "setup" ? "setup" : role === "timing" ? "timing" : "major" });
      const protectedLevels = resolveProtectedLevelsV2(primary, timeframe, role, candles, tf);
      const bosChoch = deriveBosChochState(candles, primary, timeframe, protectedLevels);
      const sweepStatus = deriveSweepStatus(candles, primary, timeframe, protectedLevels);
      const bias = deriveStructureBias({ timeframe, role, analysisSwings: primary, bosChoch, sweepStatus, protectedLevels });
      const displaySwings = buildDisplaySwings(primary, timeframe);
      const displaySource = analysisSource;
      const classificationWarnings = primary.filter((swing) => ["HH", "HL", "LH", "LL"].includes(swing.label) && (!swing.comparedTo || !swing.classificationReason)).map((swing) => `${swing.id} missing comparison metadata`);
      const context = {
        available: true,
        timeframe,
        role,
        rawPivots,
        candidateSwings,
        zigzagSwings,
        validLegSwings,
        internalSwings: promoted.internalSwings,
        majorSwings: promoted.majorSwings,
        setupSwings,
        timingSwings,
        structuralSwings: promoted.structuralSwings,
        analysisSwings: primary,
        displaySwings,
        analysisSource,
        displaySource,
        classificationWarnings,
        analysisLabels: primary,
        displayLabels: displaySwings,
        labels: displaySwings,
        ...protectedLevels,
        trendState: bias.trendState,
        bias: bias.bias,
        status: bias.status,
        setupState: bias.setupState,
        timingState: bias.timingState,
        canOverrideHtf: bias.canOverrideHtf,
        bosChoch,
        sweepStatus,
        sequence: primary.map((swing) => swing.label).filter(Boolean),
        debugStats: { ...promoted.debugStats, rawPivotCount: rawPivots.length, internalSwingCount: promoted.internalSwings.length, majorSwingCount: promoted.majorSwings.length, displayedLabelCount: displaySwings.length, setupSwingCount: setupSwings.length, timingSwingCount: timingSwings.length, analysisSource, displaySource, analysisSwingCount: primary.length, displaySwingCount: displaySwings.length, hiddenDisplaySwingCount: Math.max(0, primary.length - displaySwings.length), displayFilterReason: "Clean display swings prioritize valid HH/HL/LH/LL, spacing, move size, and recency.", reason: options.reason || null },
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


  function debugStructureClassification(timeframe = "4H") {
    const ctx = getStructureContext(timeframe);
    return {
      timeframe,
      role: ctx.role,
      rawPivotCount: ctx.rawPivots?.length || 0,
      internalCount: ctx.internalSwings?.length || 0,
      majorCount: ctx.majorSwings?.length || 0,
      setupCount: ctx.setupSwings?.length || 0,
      timingCount: ctx.timingSwings?.length || 0,
      analysisSource: ctx.analysisSource,
      displaySource: ctx.displaySource,
      protectedHigh: ctx.protectedHigh,
      protectedLow: ctx.protectedLow,
      timingProtectedHigh: ctx.timingProtectedHigh,
      timingProtectedLow: ctx.timingProtectedLow,
      bosChoch: ctx.bosChoch,
      labeledSwings: ctx.analysisSwings || [],
      warnings: ctx.classificationWarnings || []
    };
  }

  function printStructureSwings(timeframe = "4H", key = "analysisSwings") {
    const rows = getStructureContext(timeframe)?.[key] || [];
    const table = rows.map((swing) => ({ id: swing.id, type: swing.type, label: swing.label, hierarchy: swing.hierarchy, price: swing.price, time: swing.time, comparedTo: swing.comparedTo, reason: swing.classificationReason }));
    if (console?.table) console.table(table);
    return table;
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
    buildSetupSwings,
    buildTimingSwings,
    resolveProtectedLevelsV2,
    classifyStructureSwingsV2,
    debugStructureClassification,
    printStructureSwings,
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
  window.BtcDash.debugStructureClassification = debugStructureClassification;
  window.BtcDash.printStructureSwings = printStructureSwings;
})();
