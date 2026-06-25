(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.engines = window.BtcDash.engines || {};

  const DEFAULT_TIMEFRAMES = ["1W", "1D", "4H", "1H"];
  const STRUCTURE_ROLE_BY_TIMEFRAME = { "1W": "macro", "1D": "context", "4H": "setup", "1H": "timing" };
  const SETUP_SWING_RULES_4H = { minLegBars: 8, minLegMovePct: 1.8, minAtrMove: 1.4, preferRecent: true, maxSetupSwings: 14 };
  const TIMING_SWING_RULES_1H = { minLegBars: 6, minLegMovePct: 0.8, minAtrMove: 1.1, preferRecent: true, maxTimingSwings: 16 };
  const DEFAULT_OPERATIONAL_SWING_CONFIG = {
    "4H": { enabled: true, role: "setup", pivotLeft: 3, pivotRight: 3, atrPeriod: 14, atrMultiplier: 1.05, minMovePct: 0.0075, minBarsBetweenSwings: 2, maxBarsBetweenOperationalSwings: 80, allowReplacement: true, requireAlternation: true, useCloseConfirmation: true, maxOperationalSwings: 30, displayMaxSwings: 18, fallbackToExistingSetupSwings: true },
    "1H": { enabled: true, role: "timing", pivotLeft: 4, pivotRight: 4, atrPeriod: 14, atrMultiplier: 0.90, minMovePct: 0.0035, minBarsBetweenSwings: 3, maxBarsBetweenOperationalSwings: 120, allowReplacement: true, requireAlternation: true, useCloseConfirmation: true, maxOperationalSwings: 36, displayMaxSwings: 22, fallbackToExistingTimingSwings: true, timingOnly: true, canOverrideHtf: false }
  };

  function getConfig(timeframe) {
    const root = window.BtcDash.config?.STRUCTURE_V2_CONFIG || {};
    return { root, tf: root[timeframe] || {}, timeframes: root.timeframes || DEFAULT_TIMEFRAMES };
  }

  function getOperationalSwingConfig(timeframe) {
    const root = window.BtcDash.config?.STRUCTURE_V2_CONFIG || {};
    return { ...(DEFAULT_OPERATIONAL_SWING_CONFIG[timeframe] || { enabled: false }), ...(root.operationalSwingConfig?.[timeframe] || {}) };
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
      confirmedOperationalPivots: [],
      operationalSwingPath: [],
      setupOperationalSwings: [],
      timingOperationalSwings: [],
      operationalStructureLabels: [],
      setupSwingPath: [],
      timingSwingPath: [],
      hiddenOperationalSwings: [],
      hiddenMicroSwings: [],
      visibleStructureLabels: [],
      ltfLabelPolicy: {},
      biasContributionSummary: { weeklyContribution: null, dailyContribution: null, fourHContribution: null, oneHContribution: null, ignoredSources: [] },
      operationalTrendState: null,
      operationalRejectedPivots: [],
      operationalReplacementEvents: [],
      operationalContinuityRescues: [],
      operationalBosChoch: createNoneBosChoch(reason),
      operationalWarnings: [],
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

  function getClosedCandlesForStructure(input) {
    const source = Array.isArray(input) ? input : (window.BtcDash.state?.marketData?.[input] || []);
    let rejectedRunningCount = 0;
    let rejectedInvalidCount = 0;
    const closedCandles = [];
    source.forEach((candle) => {
      if (!candle) { rejectedInvalidCount += 1; return; }
      if (isRunningLike(candle) || candle.isPreview === true || candle.source === "running") { rejectedRunningCount += 1; return; }
      closedCandles.push({ ...candle, _closedIndex: closedCandles.length });
    });
    return { closedCandles, stats: { inputCount: source.length, closedCount: closedCandles.length, rejectedRunningCount, rejectedInvalidCount } };
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


  function detectConfirmedOperationalPivots(candles, timeframe, config = getOperationalSwingConfig(timeframe)) {
    if (!config.enabled) return { pivots: [], atrSeries: [] };
    const left = config.pivotLeft ?? 3;
    const right = config.pivotRight ?? 3;
    const atrSeries = calculateAtrSeries(candles, config.atrPeriod || 14);
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
      const base = { timeframe, time: toIsoTime(getCandleTime(candle)), timeMs: toTimeMs(getCandleTime(candle)), barIndex: index, index, confirmed: true, source: "confirmedPivot", pivotLeft: left, pivotRight: right, atr: atrSeries[index] };
      if (isHigh) pivots.push({ ...base, id: `${timeframe}-operational-pivot-high-${index}`, type: "high", price: high });
      if (isLow) pivots.push({ ...base, id: `${timeframe}-operational-pivot-low-${index}`, type: "low", price: low });
    }
    return { pivots: pivots.sort((a, b) => a.barIndex - b.barIndex), atrSeries };
  }

  function getOperationalSwingThreshold(pivot, lastSwing, atrSeries, config = {}) {
    const atrAtPivot = Number(pivot.atr ?? atrSeries?.[pivot.barIndex]);
    const pctThreshold = pivot.price * (config.minMovePct || 0.005);
    const atrThreshold = Number.isFinite(atrAtPivot) ? atrAtPivot * (config.atrMultiplier || 1) : pctThreshold;
    return Math.max(pctThreshold, atrThreshold);
  }

  function createOperationalSwing(pivot, timeframe, role, options = {}) {
    return {
      id: `${timeframe}-${role}Operational-${pivot.type}-${pivot.barIndex}`,
      timeframe,
      type: pivot.type,
      price: pivot.price,
      time: pivot.time,
      timeMs: pivot.timeMs,
      barIndex: pivot.barIndex,
      index: pivot.barIndex,
      label: pivot.type === "high" ? "SH" : "SL",
      hierarchy: role === "setup" ? "setupOperational" : "timingOperational",
      sourceLayer: "operationalSwingPath",
      layer: role === "setup" ? "setupOperational" : "timingOperational",
      structureType: role === "setup" ? "setupOperational" : "timingOperational",
      isStructural: true,
      isDisplayEligible: true,
      comparedTo: null,
      classificationReason: `Initial ${role} operational ${pivot.type}; waiting for same-type reference.`,
      classificationScope: role,
      isConfirmedStructure: false,
      role,
      breakStatus: "unbroken",
      qualityScore: 5,
      sourcePivotId: pivot.id,
      prevSwingId: options.prevSwingId || null,
      nextSwingId: null,
      legSize: options.legSize || 0,
      legBars: options.legBars || 0,
      thresholdUsed: options.thresholdUsed || 0,
      reason: options.reason || "new_zigzag",
      continuityRescue: Boolean(options.continuityRescue),
      rescuedFromGap: options.rescuedFromGap || null,
      gapBars: options.gapBars || 0,
      rescueReason: options.rescueReason || null
    };
  }

  function linkOperationalPath(path) {
    return path.map((swing, index) => ({ ...swing, pathIndex: index, prevSwingId: path[index - 1]?.id || null, nextSwingId: path[index + 1]?.id || null }));
  }

  function buildOperationalSwingPath(candles, confirmedPivots, timeframe, config = getOperationalSwingConfig(timeframe), atrSeries = []) {
    const role = config.role || getRole(timeframe);
    const path = [];
    const rejectedPivots = [];
    const replacementEvents = [];
    const warnings = [];
    confirmedPivots.forEach((pivot) => {
      const last = path[path.length - 1];
      if (!last) { path.push(createOperationalSwing(pivot, timeframe, role, { reason: "initial_operational_pivot" })); return; }
      if (pivot.type === last.type) {
        const moreExtreme = pivot.type === "high" ? pivot.price > last.price : pivot.price < last.price;
        if (config.allowReplacement && moreExtreme) {
          const replacement = createOperationalSwing(pivot, timeframe, role, { reason: "replaced_more_extreme_same_type", prevSwingId: path[path.length - 2]?.id || null, legSize: last.legSize, legBars: last.legBars, thresholdUsed: last.thresholdUsed });
          replacementEvents.push({ replacedSwingId: last.id, replacementSwingId: replacement.id, type: pivot.type, barIndex: pivot.barIndex, reason: "replaced_more_extreme_same_type" });
          path[path.length - 1] = replacement;
        } else rejectedPivots.push({ ...pivot, rejectReason: moreExtreme ? "same_type_replacement_disabled" : "same_type_not_more_extreme" });
        return;
      }
      const threshold = getOperationalSwingThreshold(pivot, last, atrSeries, config);
      const legSize = Math.abs(pivot.price - last.price);
      const legBars = Math.abs(pivot.barIndex - last.barIndex);
      if (legSize >= threshold && legBars >= (config.minBarsBetweenSwings || 1)) path.push(createOperationalSwing(pivot, timeframe, role, { reason: "new_zigzag", prevSwingId: last.id, legSize, legBars, thresholdUsed: threshold }));
      else rejectedPivots.push({ ...pivot, rejectReason: "below_threshold", legSize, legBars, thresholdUsed: threshold });
    });
    const limited = linkOperationalPath(path.slice(-(config.maxOperationalSwings || path.length)));
    return { operationalPivots: confirmedPivots, operationalSwingPath: limited, rejectedPivots, replacementEvents, warnings };
  }

  function validateOperationalLegContinuity(path, rejectedPivots, timeframe, config = getOperationalSwingConfig(timeframe), atrSeries = []) {
    const warnings = [];
    const rescues = [];
    if (!path.length) return { path, rescues, warnings };
    let output = [...path];
    for (let index = 1; index < output.length; index += 1) {
      const prev = output[index - 1];
      const current = output[index];
      const gapBars = Math.abs(current.barIndex - prev.barIndex);
      if (gapBars <= (config.maxBarsBetweenOperationalSwings || Infinity)) continue;
      const candidates = (rejectedPivots || []).filter((pivot) => pivot.barIndex > prev.barIndex && pivot.barIndex < current.barIndex && pivot.type !== prev.type && pivot.type !== current.type);
      const rescue = candidates.map((pivot) => {
        const threshold = getOperationalSwingThreshold(pivot, prev, atrSeries, config) * 0.75;
        const legSize = Math.abs(pivot.price - prev.price);
        const legBars = Math.abs(pivot.barIndex - prev.barIndex);
        return { pivot, threshold, legSize, legBars, score: legSize / Math.max(1, threshold) + legBars / Math.max(1, gapBars) };
      }).filter((item) => item.legSize >= item.threshold && item.legBars >= (config.minBarsBetweenSwings || 1)).sort((a, b) => b.score - a.score)[0];
      if (!rescue) { warnings.push(`Operational gap ${gapBars} bars between ${prev.id} and ${current.id} had no rescue candidate.`); continue; }
      const swing = createOperationalSwing(rescue.pivot, timeframe, config.role || getRole(timeframe), { reason: "continuity_rescue", prevSwingId: prev.id, legSize: rescue.legSize, legBars: rescue.legBars, thresholdUsed: rescue.threshold, continuityRescue: true, rescuedFromGap: `${prev.id}->${current.id}`, gapBars, rescueReason: "large_gap_best_rejected_opposite_pivot" });
      output.splice(index, 0, swing);
      rescues.push(swing);
      index += 1;
    }
    for (let index = 1; index < output.length; index += 1) if (output[index].type === output[index - 1].type) warnings.push(`Consecutive ${output[index].type} at ${output[index - 1].id}/${output[index].id}`);
    return { path: linkOperationalPath(output), rescues, warnings };
  }

  function classifyOperationalStructure(path, timeframe, role, config = getOperationalSwingConfig(timeframe)) {
    let previousHigh = null;
    let previousLow = null;
    return (path || []).map((swing, index) => {
      const next = { ...swing, pathIndex: index, classificationScope: role, role, hierarchy: role === "setup" ? "setupOperational" : "timingOperational", layer: role === "setup" ? "setupOperational" : "timingOperational", structureType: role === "setup" ? "setupOperational" : "timingOperational" };
      const ref = next.type === "high" ? previousHigh : previousLow;
      if (!ref) {
        next.label = next.type === "high" ? "SH" : "SL";
        next.comparedTo = null;
        next.previousSameTypePrice = null;
        next.differencePct = null;
        next.classificationReason = `${timeframe} initial ${role} operational ${next.type}; no same-type reference yet.`;
        next.isConfirmedStructure = false;
      } else if (next.type === "high") {
        const diff = ref.price ? ((next.price - ref.price) / ref.price) * 100 : 0;
        next.label = next.price > ref.price ? "HH" : "LH";
        next.comparedTo = ref.id;
        next.previousSameTypePrice = ref.price;
        next.differencePct = Number(diff.toFixed(3));
        next.classificationReason = next.label === "HH" ? `${timeframe} high exceeded previous ${role} operational high; classified as HH.` : `${timeframe} high failed to exceed previous ${role} operational high; classified as LH.`;
        next.isConfirmedStructure = true;
      } else {
        const diff = ref.price ? ((next.price - ref.price) / ref.price) * 100 : 0;
        next.label = next.price > ref.price ? "HL" : "LL";
        next.comparedTo = ref.id;
        next.previousSameTypePrice = ref.price;
        next.differencePct = Number(diff.toFixed(3));
        next.classificationReason = next.label === "HL" ? `${timeframe} low held above previous ${role} operational low; classified as HL.` : `${timeframe} low broke below previous ${role} operational low; classified as LL.`;
        next.isConfirmedStructure = true;
      }
      if (next.type === "high") previousHigh = next;
      else previousLow = next;
      return next;
    });
  }

  function deriveOperationalTrendState(labeledPath, timeframe, role, config = {}) {
    const recent = (labeledPath || []).filter((swing) => ["HH", "HL", "LH", "LL"].includes(swing.label)).slice(-4).map((swing) => swing.label);
    const bullish = recent.includes("HH") && recent.includes("HL");
    const bearish = recent.includes("LH") && recent.includes("LL");
    let state = bullish && !bearish ? "bullish" : bearish && !bullish ? "bearish" : bullish && bearish ? "transition" : "range";
    const label = role === "setup" ? (state === "bullish" ? "Bullish Setup Leaning" : state === "bearish" ? "Bearish Setup Leaning" : state === "transition" ? "Recovery Without BOS" : "Range Setup") : (state === "bullish" ? "Bullish Timing" : state === "bearish" ? "Bearish Timing" : "Range Timing");
    return { state, label, recentLabels: recent, role, timeframe };
  }

  function resolveOperationalProtectedLevels(labeledPath, timeframe, role, trendState = {}) {
    const high = (labeledPath || []).filter((swing) => swing.type === "high").at(-1) || null;
    const low = (labeledPath || []).filter((swing) => swing.type === "low").at(-1) || null;
    const hierarchy = role === "setup" ? "setupOperational" : "timingOperational";
    const isTimingOnly = role === "timing";
    const protectedHigh = makeProtectedLevel(high, timeframe, role, "high", { isTimingOnly, canOverrideHtf: false, reason: `${timeframe} protected high resolved from ${hierarchy} path.` });
    const protectedLow = makeProtectedLevel(low, timeframe, role, "low", { isTimingOnly, canOverrideHtf: false, reason: `${timeframe} protected low resolved from ${hierarchy} path.` });
    if (protectedHigh) protectedHigh.sourceHierarchy = hierarchy;
    if (protectedLow) protectedLow.sourceHierarchy = hierarchy;
    return { protectedHigh, protectedLow, timingProtectedHigh: isTimingOnly ? protectedHigh : null, timingProtectedLow: isTimingOnly ? protectedLow : null, lastSwingHigh: protectedHigh, lastSwingLow: protectedLow };
  }

  function resolveOperationalBosChoch(candles, labeledPath, timeframe, role, config = getOperationalSwingConfig(timeframe)) {
    const protectedLevels = resolveOperationalProtectedLevels(labeledPath, timeframe, role);
    const base = deriveBosChochState(candles, labeledPath, timeframe, protectedLevels);
    const sweepStatus = deriveSweepStatus(candles, labeledPath, timeframe, protectedLevels);
    return {
      ...base,
      eventType: base.type,
      levelSwingId: base.brokenSwing?.sourceSwingId || base.brokenSwing?.id || null,
      closeBarIndex: base.confirmedAtIndex,
      closeTime: base.confirmedAtTime,
      closePrice: base.confirmedByCandle ? Number(base.confirmedByCandle.close) : null,
      isCloseConfirmed: base.type === "BOS" || base.type === "CHoCH",
      sweepEvents: sweepStatus?.hasSweep ? [sweepStatus] : [],
      weakBreakEvents: base.type === "Weak Break" ? [base] : []
    };
  }

  function buildOperationalStructure(candles, timeframe) {
    const config = getOperationalSwingConfig(timeframe);
    if (!config.enabled) return { confirmedOperationalPivots: [], operationalSwingPath: [], operationalStructureLabels: [], operationalRejectedPivots: [], operationalReplacementEvents: [], operationalContinuityRescues: [], operationalWarnings: [] };
    const detected = detectConfirmedOperationalPivots(candles, timeframe, config);
    const built = buildOperationalSwingPath(candles, detected.pivots, timeframe, config, detected.atrSeries);
    const continuity = validateOperationalLegContinuity(built.operationalSwingPath, built.rejectedPivots, timeframe, config, detected.atrSeries);
    const labels = classifyOperationalStructure(continuity.path, timeframe, config.role || getRole(timeframe), config);
    return { confirmedOperationalPivots: detected.pivots, operationalSwingPath: labels, operationalStructureLabels: labels, operationalRejectedPivots: built.rejectedPivots, operationalReplacementEvents: built.replacementEvents, operationalContinuityRescues: continuity.rescues, operationalWarnings: [...(built.warnings || []), ...(continuity.warnings || [])] };
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


  function getLtfLabelConfig(timeframe) {
    return window.BtcDash.config?.LTF_STRUCTURE_LABEL_CONFIG?.[timeframe] || {};
  }

  function getLtfAdaptiveConfig() {
    return window.BtcDash.config?.LTF_STRUCTURE_LABEL_CONFIG?.adaptive || {};
  }

  function calculateVolatilityRatio(atrSeries, lookbackSMA = 50) {
    const values = (atrSeries || []).filter((value) => Number.isFinite(Number(value)) && Number(value) > 0);
    if (!values.length) return 1;
    const current = values.at(-1);
    const sample = values.slice(-lookbackSMA);
    const sma = sample.reduce((sum, value) => sum + Number(value), 0) / Math.max(1, sample.length);
    const cfg = getLtfAdaptiveConfig();
    return Math.max(cfg.minVolatilityRatio ?? 0.3, Math.min(cfg.maxVolatilityRatio ?? 2.5, current / Math.max(1e-9, sma)));
  }

  function applyAdaptiveAdjustment(baseValue, volatilityRatio, adjustmentPower = 0.60) {
    return Number(baseValue) * Math.pow(Math.max(0.01, Number(volatilityRatio) || 1), adjustmentPower);
  }

  function getAdaptiveThresholdForTimeframe(timeframe, baseThreshold, volatilityRatio, options = {}) {
    const adaptive = getLtfAdaptiveConfig();
    const adjusted = applyAdaptiveAdjustment(baseThreshold, volatilityRatio, adaptive.adjustmentPower ?? 0.60);
    return Math.max(options.minMovePctFloor ?? 0, Math.min(options.minMovePctCeiling ?? Infinity, adjusted));
  }

  function getAdaptiveToleranceForDetection(timeframe, volatilityRatio, options = {}) {
    const base = options.baseTolerancePct ?? 0.15;
    const adjusted = applyAdaptiveAdjustment(base, volatilityRatio, (getLtfAdaptiveConfig().adjustmentPower ?? 0.60) / 2);
    return Math.max(0.05, Math.min(0.8, adjusted));
  }

  function getAdaptiveMinBarGap(timeframe, baseMinBarGap, volatilityRatio, options = {}) {
    const adaptive = getLtfAdaptiveConfig();
    const adjusted = applyAdaptiveAdjustment(baseMinBarGap, volatilityRatio, adaptive.adjustmentPower ?? 0.60);
    return Math.max(options.minLegBars ?? 1, Math.ceil(adjusted));
  }

  function buildAdaptiveMeta(candles, timeframe, rules = {}) {
    const adaptiveCfg = getLtfAdaptiveConfig();
    const atrSeries = calculateAtrSeries(candles, adaptiveCfg.atrLength || 14);
    const volatilityRatio = calculateVolatilityRatio(atrSeries, adaptiveCfg.volatilitySmaLength || 50);
    const adaptiveThreshold = getAdaptiveThresholdForTimeframe(timeframe, rules.baseMinMovePct ?? rules.minLegMovePct ?? 1, volatilityRatio, rules);
    const adaptiveTolerance = getAdaptiveToleranceForDetection(timeframe, volatilityRatio, rules);
    const adaptiveMinBarGap = getAdaptiveMinBarGap(timeframe, rules.minBarGap ?? rules.minLegBars ?? 4, volatilityRatio, rules);
    return { atrSeries, volatilityRatio, adaptiveThreshold, adaptiveTolerance, adaptiveMinBarGap };
  }

  function determineDisplayLabel(swing, timeframe, sourceLayer, options = {}) {
    if (!swing?.label) return null;
    if (timeframe === "1W" || timeframe === "1D") return swing.label;
    if (timeframe === "4H") {
      if (sourceLayer === "setupSwings") return swing.label;
      return options.showOperationalLabels ? `Op ${swing.label}` : null;
    }
    if (timeframe === "1H") return options.showMicroLabels ? `Micro ${swing.label}` : null;
    return swing.label;
  }

  function canInfluenceBias(swing, timeframe, sourceLayer) {
    if (timeframe === "1W" && sourceLayer === "majorSwings") return "macro";
    if (timeframe === "1D" && sourceLayer === "majorSwings") return "context";
    if (timeframe === "4H" && sourceLayer === "setupSwings") return "setupOnly";
    return false;
  }

  function decorateLtfSwing(swing, timeframe, sourceLayer, adaptiveMeta, extra = {}) {
    const cfg = getLtfLabelConfig(timeframe);
    const displayCfg = cfg.display || {};
    const displayLabel = determineDisplayLabel(swing, timeframe, sourceLayer, displayCfg);
    const is1H = timeframe === "1H";
    return {
      ...swing,
      sourceLayer,
      layer: sourceLayer,
      layerType: sourceLayer === "setupSwings" ? "setup_structure" : "micro_timing",
      isSetup: sourceLayer === "setupSwings",
      isOperational: sourceLayer !== "setupSwings",
      isMicro: is1H,
      timingOnly: is1H,
      displayLabel,
      microDisplayLabel: is1H && swing.label ? `Micro ${swing.label}` : null,
      isHidden: !displayLabel,
      canInfluenceBias: canInfluenceBias(swing, timeframe, sourceLayer) !== false,
      canInfluenceSetupContext: timeframe === "4H" && sourceLayer === "setupSwings",
      canConfirmDailyContext: timeframe === "4H" && sourceLayer === "setupSwings",
      canOverrideWeeklyBias: false,
      canOverrideDailyBias: false,
      canOverride4hBias: false,
      canSetGlobalBias: false,
      biasContributionType: timeframe === "4H" ? "setupOnly" : "none",
      adaptiveMeta: { volatilityRatio: adaptiveMeta.volatilityRatio, adaptiveThreshold: adaptiveMeta.adaptiveThreshold, adaptiveMinBarGap: adaptiveMeta.adaptiveMinBarGap, adaptiveTolerance: adaptiveMeta.adaptiveTolerance },
      validationFactors: extra.validationFactors || [],
      timingUseCases: is1H ? ["sweep", "weakBreak", "retest", "reclaim", "failedBreak", "microReaction"] : undefined
    };
  }

  function filterSetupSwings({ operationalSwings = [], internalSwings = [], closedCandles = [], timeframe = "4H", volatilityRatio = 1, adaptiveThreshold = 1.8, adaptiveMinBarGap = 10, adaptiveTolerance = 0.15 }) {
    if (timeframe !== "4H") return [];
    const rules = getLtfLabelConfig("4H").setupSwingRules || {};
    const source = (internalSwings.length ? internalSwings : operationalSwings).filter((swing) => swing?.isConfirmed !== false && swing?.canBeAnalysisSource !== false && swing?.structureType !== "rawPivot" && swing?.layer !== "rawPivot");
    const classified = classifyStructureSwingsV2(buildHierarchySwings(source, timeframe, "setup", { minLegBars: rules.minLegBars || 8, minLegMovePct: adaptiveThreshold, minAtrMove: rules.minAtrMove || 1.4, maxSetupSwings: 24 }), null, timeframe, "setup", { hierarchy: "setup" });
    return classified.filter((swing, index, arr) => {
      const previous = arr[index - 1];
      if (!previous) return true;
      const barGap = Math.abs(Number(swing.index ?? swing.barIndex ?? 0) - Number(previous.index ?? previous.barIndex ?? 0));
      const movePct = previous.price ? Math.abs(swing.price - previous.price) / previous.price * 100 : adaptiveThreshold;
      return barGap >= adaptiveMinBarGap && movePct + adaptiveTolerance >= adaptiveThreshold;
    }).map((swing) => decorateLtfSwing(swing, timeframe, "setupSwings", { volatilityRatio, adaptiveThreshold, adaptiveMinBarGap, adaptiveTolerance }, { validationFactors: ["confirmedSwing", "adaptiveMove", "minBarGap", "setupOnly"] }));
  }

  function buildAdaptiveTimingSwings({ internalSwings = [], operationalSwings = [], timeframe = "1H", volatilityRatio = 1, adaptiveThreshold = 0.8, adaptiveMinBarGap = 12, adaptiveTolerance = 0.1 }) {
    if (timeframe !== "1H") return [];
    const rules = getLtfLabelConfig("1H").timingSwingRules || {};
    const source = (internalSwings.length ? internalSwings : operationalSwings).filter((swing) => swing?.isConfirmed !== false && swing?.structureType !== "rawPivot" && swing?.layer !== "rawPivot");
    const classified = classifyStructureSwingsV2(buildHierarchySwings(source, timeframe, "timing", { minLegBars: rules.minLegBars || 10, minLegMovePct: adaptiveThreshold, minAtrMove: rules.minAtrMove || 1.1, maxTimingSwings: 30 }), null, timeframe, "timing", { hierarchy: "timing" });
    return classified.filter((swing, index, arr) => {
      const previous = arr[index - 1];
      if (!previous) return true;
      const barGap = Math.abs(Number(swing.index ?? swing.barIndex ?? 0) - Number(previous.index ?? previous.barIndex ?? 0));
      const movePct = previous.price ? Math.abs(swing.price - previous.price) / previous.price * 100 : adaptiveThreshold;
      return barGap >= adaptiveMinBarGap && movePct + adaptiveTolerance >= adaptiveThreshold;
    }).map((swing) => decorateLtfSwing(swing, timeframe, "timingSwings", { volatilityRatio, adaptiveThreshold, adaptiveMinBarGap, adaptiveTolerance }));
  }

  function buildBiasContributionSummary(timeframe, analysisSource, analysisSwings = [], hiddenOperationalSwings = [], hiddenMicroSwings = []) {
    return {
      weeklyContribution: timeframe === "1W" ? "macro" : null,
      dailyContribution: timeframe === "1D" ? "context" : null,
      fourHContribution: timeframe === "4H" && analysisSource === "setupSwings" ? "setupOnly" : null,
      oneHContribution: timeframe === "1H" ? false : null,
      ignoredSources: [
        ...(timeframe === "4H" ? hiddenOperationalSwings.map((swing) => swing.id) : []),
        ...(timeframe === "1H" ? hiddenMicroSwings.map((swing) => swing.id) : []),
        ...analysisSwings.filter((swing) => canInfluenceBias(swing, timeframe, swing.sourceLayer) === false).map((swing) => swing.id)
      ]
    };
  }

  function getStructureDisplayText(swing) {
    return swing?.displayLabel || swing?.microDisplayLabel || swing?.label || null;
  }

  function isBaseRenderableStructureLabel(swing) {
    if (!swing) return false;
    if (swing.isRunning === true || swing.isPreview === true || swing.source === "running") return false;
    if (swing.isClosed === false || swing.isFinal === false || swing.x === false) return false;
    if (swing.isConfirmed === false || swing.canBeAnalysisSource === false) return false;
    if (swing.isHidden === true) return false;
    if (swing.structureType === "rawPivot" || swing.structureType === "candidateSwing") return false;
    if (swing.layer === "rawPivot" || swing.layer === "candidateSwing") return false;
    if (swing.sourceLayer === "rawPivots" || swing.sourceLayer === "candidateSwings") return false;
    if (swing.sourceType === "chartMarker" || swing.renderSource === "chartMarker") return false;
    return Boolean(getStructureDisplayText(swing) && swing.price != null && swing.time);
  }

  function uniqueStructureLabels(labels = []) {
    const seen = new Set();
    return labels.filter((swing) => {
      const key = swing?.id || `${swing?.time}|${swing?.price}|${getStructureDisplayText(swing)}|${swing?.sourceLayer}`;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function isSetupRenderableLabel(swing) {
    const label = swing?.label;
    return isBaseRenderableStructureLabel(swing)
      && swing.sourceLayer === "setupSwings"
      && swing.isSetup === true
      && (swing.layerType === "setup_structure" || swing.layer === "setupSwings")
      && ["HH", "HL", "LH", "LL", "EH", "EL"].includes(label)
      && Boolean(swing.displayLabel);
  }

  function getStructureVisibleLabelConfig(timeframe) {
    return window.BtcDash.config?.STRUCTURE_VISIBLE_LABEL_CONFIG?.[timeframe] || {};
  }

  function getSwingIndexValue(swing) {
    const value = Number(swing?.index ?? swing?.barIndex ?? swing?._closedIndex ?? 0);
    return Number.isFinite(value) ? value : 0;
  }

  function buildVisibleLabelCandidate(swing, index, all, cfg) {
    const movePct = Number(swing.movePct ?? swing.movePercent ?? swing.moveFromPreviousPct ?? swing.differencePct ?? 0);
    const atrMove = Number(swing.atrMove ?? swing.moveFromPreviousAtr ?? 0);
    const highestHigh = Math.max(...all.filter((item) => item.type === "high").map((item) => Number(item.price)));
    const lowestLow = Math.min(...all.filter((item) => item.type === "low").map((item) => Number(item.price)));
    const isRecent = index >= Math.max(0, all.length - (cfg.keepMostRecentSwings || 4));
    const isExtreme = (swing.type === "high" && Number(swing.price) === highestHigh) || (swing.type === "low" && Number(swing.price) === lowestLow);
    const reasons = [];
    let score = 0;
    if (movePct >= (cfg.keepMajorMovePctFloor || 3)) { score += 3; reasons.push("major_move_pct"); }
    if (atrMove >= (cfg.keepMajorAtrMoveFloor || 2)) { score += 3; reasons.push("major_atr_move"); }
    if (swing.label === "HH" || swing.label === "LL") { score += 2; reasons.push("hh_ll_importance"); }
    if (swing.label === "HL" || swing.label === "LH") { score += 1; reasons.push("hl_lh_context"); }
    if (isRecent) { score += 2; reasons.push("recent_structure"); }
    if (isExtreme) { score += 2; reasons.push("range_extreme"); }
    if ((swing.validationFactors || []).length) { score += 1; reasons.push("validated_setup"); }
    return {
      ...swing,
      normalizedMovePct: Number.isFinite(movePct) ? movePct : 0,
      normalizedAtrMove: Number.isFinite(atrMove) ? atrMove : 0,
      structureImportanceScore: score,
      visibleSelectionScore: score,
      visibleSelectionReasons: reasons,
      _selectorIndex: getSwingIndexValue(swing)
    };
  }

  function selectVisibleStructureLabels(timeframe, structureContext, options = {}) {
    const ctx = structureContext || getStructureContext(timeframe) || {};
    if (timeframe !== "4H") {
      const labels = getRenderableStructureLabels(timeframe, ctx, options);
      return { visibleLabels: labels, hiddenLabels: [], diagnostics: { renderSource: "existingCompatibleRender" } };
    }
    const cfg = { ...(getStructureVisibleLabelConfig("4H") || {}), ...(options || {}) };
    const source = (ctx.setupSwingPath?.length ? ctx.setupSwingPath : (ctx.setupSwings?.length ? ctx.setupSwings : (ctx.visibleStructureLabels || [])));
    const candidates = uniqueStructureLabels(source).filter(isSetupRenderableLabel);
    if (!cfg.enabled) return { visibleLabels: candidates, hiddenLabels: [], diagnostics: { renderSource: "selector_disabled" } };
    const ranked = candidates.map((swing, index, all) => buildVisibleLabelCandidate(swing, index, all, cfg));
    const hardMax = Math.max(1, cfg.hardMaxLabels || 18);
    const softMax = Math.min(hardMax, Math.max(1, cfg.softMaxLabels || 14));
    const minSpacing = Math.max(0, cfg.minIndexSpacing || 8);
    const selected = [];
    const selectedIds = new Set();
    const keep = (candidate, reason) => {
      if (!candidate || selectedIds.has(candidate.id)) return;
      selected.push({ ...candidate, visibleSelected: true, hiddenFromDisplay: false, visibleSelectionReasons: uniqueStructureLabels([{ id: reason }, ...(candidate.visibleSelectionReasons || []).map((item) => ({ id: item }))]).map((item) => item.id) });
      selectedIds.add(candidate.id);
    };
    ranked.slice(-(cfg.keepMostRecentSwings || 4)).forEach((candidate) => keep(candidate, "always_keep_recent"));
    if (cfg.keepExtremeHighLow) {
      keep(ranked.filter((item) => item.type === "high").sort((a, b) => Number(b.price) - Number(a.price))[0], "always_keep_highest_high");
      keep(ranked.filter((item) => item.type === "low").sort((a, b) => Number(a.price) - Number(b.price))[0], "always_keep_lowest_low");
    }
    ranked.filter((candidate) => candidate.normalizedMovePct >= (cfg.keepMajorMovePctFloor || 3) || candidate.normalizedAtrMove >= (cfg.keepMajorAtrMoveFloor || 2) || candidate.label === "HH" || candidate.label === "LL")
      .sort((a, b) => b.visibleSelectionScore - a.visibleSelectionScore)
      .forEach((candidate) => { if (selected.length < hardMax) keep(candidate, "important_structure"); });
    ranked.filter((candidate) => !selectedIds.has(candidate.id))
      .sort((a, b) => b.visibleSelectionScore - a.visibleSelectionScore || getSwingIndexValue(b) - getSwingIndexValue(a))
      .forEach((candidate) => {
        if (selected.length >= softMax) return;
        const tooClose = selected.some((item) => Math.abs(candidate._selectorIndex - item._selectorIndex) < minSpacing);
        if (!tooClose) keep(candidate, "score_spacing_pass");
      });
    const visibleLabels = selected.slice(0, hardMax).sort((a, b) => getSwingIndexValue(a) - getSwingIndexValue(b)).map(({ _selectorIndex, ...item }) => item);
    const visibleIds = new Set(visibleLabels.map((item) => item.id));
    const hiddenLabels = ranked.filter((candidate) => !visibleIds.has(candidate.id)).map(({ _selectorIndex, ...candidate }) => {
      const nearSelected = visibleLabels.some((item) => Math.abs(getSwingIndexValue(candidate) - getSwingIndexValue(item)) < minSpacing);
      const hiddenReason = nearSelected ? "spacing_cluster" : selected.length >= softMax ? "density_limit" : "lower_importance";
      return { ...candidate, hiddenFromDisplay: true, visibleSelected: false, hiddenReason };
    });
    return {
      visibleLabels,
      hiddenLabels,
      diagnostics: {
        renderSource: cfg.renderSource || "intentional_density_selector",
        hiddenReasonCounts: hiddenLabels.reduce((acc, item) => { acc[item.hiddenReason] = (acc[item.hiddenReason] || 0) + 1; return acc; }, {}),
        visibleSelectionScoreRange: {
          min: visibleLabels.length ? Math.min(...visibleLabels.map((item) => item.visibleSelectionScore || 0)) : null,
          max: visibleLabels.length ? Math.max(...visibleLabels.map((item) => item.visibleSelectionScore || 0)) : null
        },
        significantGapThreshold: cfg.significantGapThreshold || 5
      }
    };
  }

  function getRenderableStructureLabels(timeframe, structureContext, options = {}) {
    const ctx = structureContext || getStructureContext(timeframe) || {};
    if (timeframe === "4H") {
      const source = ctx.visibleStructureLabels?.length ? ctx.visibleStructureLabels : selectVisibleStructureLabels(timeframe, ctx, options).visibleLabels;
      return uniqueStructureLabels(source)
        .filter(isSetupRenderableLabel)
        .map((swing) => ({ ...swing, displayLabel: swing.displayLabel || swing.label, renderSource: swing.renderSource || "intentional_density_selector" }));
    }
    if (timeframe === "1H") {
      const cfg = getLtfLabelConfig("1H");
      const showMicroLabels = options.showMicroLabels ?? cfg.display?.showMicroLabels ?? false;
      if (!showMicroLabels) return [];
      const timingSource = [
        ...(ctx.visibleStructureLabels || []),
        ...(ctx.timingSwingPath || []),
        ...(ctx.timingSwings || [])
      ];
      return uniqueStructureLabels(timingSource).filter((swing) => {
        const microLabel = swing.microDisplayLabel || swing.displayLabel;
        return isBaseRenderableStructureLabel({ ...swing, displayLabel: microLabel })
          && (swing.sourceLayer === "timingSwings" || swing.isMicro === true)
          && swing.canInfluenceBias === false
          && /^Micro (HH|HL|LH|LL|EH|EL)$/.test(String(microLabel || ""));
      }).map((swing) => ({ ...swing, displayLabel: swing.microDisplayLabel || swing.displayLabel, renderSource: "microTimingOptional" }));
    }
    const compatibleSource = (ctx.visibleStructureLabels?.length ? ctx.visibleStructureLabels : (ctx.displaySwings?.length ? ctx.displaySwings : (ctx.displayLabels?.length ? ctx.displayLabels : (ctx.labels || []))));
    return uniqueStructureLabels(compatibleSource)
      .filter(isBaseRenderableStructureLabel)
      .map((swing) => ({ ...swing, displayLabel: getStructureDisplayText(swing), renderSource: "existingCompatibleRender" }));
  }

  function debugStructureRenderSource(timeframe = "4H") {
    const ctx = getStructureContext(timeframe) || createEmptyStructureContext(timeframe);
    const renderable = getRenderableStructureLabels(timeframe, ctx);
    const rejectedRunning = [
      ...(ctx.visibleStructureLabels || []),
      ...(ctx.displaySwings || []),
      ...(ctx.labels || []),
      ...(ctx.operationalSwingPath || [])
    ].filter((swing) => swing?.isRunning === true || swing?.isPreview === true || swing?.source === "running");
    const rejectedUnconfirmed = [
      ...(ctx.visibleStructureLabels || []),
      ...(ctx.displaySwings || []),
      ...(ctx.labels || [])
    ].filter((swing) => swing?.isConfirmed === false);
    const rejectedOperational = (ctx.operationalSwingPath || []).filter((swing) => !renderable.some((item) => item.id === swing.id));
    const rejectedLegacy = timeframe === "4H"
      ? [...(ctx.displaySwings || []), ...(ctx.labels || [])].filter((swing) => !isSetupRenderableLabel(swing))
      : [];
    const renderSource = timeframe === "4H" ? "setupSwingsOnly" : timeframe === "1H" ? "timingHiddenByDefault" : "existingCompatibleRender";
    const warnings = [];
    if (timeframe === "4H" && !renderable.length) warnings.push("No valid 4H setup labels");
    if (timeframe === "4H" && renderable.some((swing) => swing.sourceLayer !== "setupSwings")) warnings.push("Renderable 4H label outside setupSwings source");
    if (timeframe === "1H" && renderable.some((swing) => !/^Micro /.test(String(swing.displayLabel || "")))) warnings.push("1H plain label attempted to render");
    return {
      timeframe,
      setupSwingPathCount: ctx.setupSwingPath?.length || 0,
      operationalSwingPathCount: ctx.operationalSwingPath?.length || 0,
      visibleStructureLabelsCount: ctx.visibleStructureLabels?.length || 0,
      displaySwingsCount: ctx.displaySwings?.length || 0,
      labelsCount: ctx.labels?.length || 0,
      renderableLabelCount: renderable.length,
      rejectedOperationalCount: rejectedOperational.length,
      rejectedLegacyCount: rejectedLegacy.length,
      rejectedRunningCount: rejectedRunning.length,
      rejectedUnconfirmedCount: rejectedUnconfirmed.length,
      renderSource,
      allRenderableAreSetupSwings: timeframe === "4H" ? renderable.every((swing) => swing.sourceLayer === "setupSwings" && swing.isSetup === true) : null,
      noOperationalLabelsShowing: renderable.every((swing) => swing.sourceLayer !== "operationalSwings" && swing.sourceLayer !== "operationalSwingPath"),
      noRunningLabels: renderable.every((swing) => swing.isRunning !== true && swing.source !== "running"),
      sampleRenderableLabels: renderable.slice(0, 5),
      sampleRejectedOperational: rejectedOperational.slice(0, 5),
      warnings
    };
  }

  function createSetupSwingDiagnostics({ context, operationalSwings = [], setupSwings = [], rules = {}, adaptive = {} }) {
    const setupSwingDiagnostics = {
      timeframe: "4H",
      mode: "diagnostic_only",
      logicChanged: false,
      counts: { operationalSwingPath: 0, setupSwingPath: 0, visibleStructureLabels: 0, hiddenStructureLabels: 0, displaySwings: 0, labels: 0, renderableLabels: 0 },
      thresholds: {
        minLegBars: rules.minLegBars ?? null,
        minBarGap: rules.minBarGap ?? null,
        baseMinMovePct: rules.baseMinMovePct ?? null,
        minMovePctFloor: rules.minMovePctFloor ?? null,
        minMovePctCeiling: rules.minMovePctCeiling ?? null,
        adaptiveThreshold: adaptive.adaptiveThreshold ?? null,
        minAtrMove: rules.minAtrMove ?? null,
        requireCounterSwing: rules.requireCounterSwing ?? null,
        requireCloseConfirmation: rules.requireCloseConfirmation ?? null,
        requireAlternatingSequence: rules.requireAlternatingSequence ?? null,
        volatilityRatio: adaptive.volatilityRatio ?? null
      },
      filters: {
        confirmed: { passed: 0, rejected: 0 },
        running: { passed: 0, rejected: 0 },
        minLegBars: { passed: 0, rejected: 0 },
        minBarGap: { passed: 0, rejected: 0 },
        minMovePct: { passed: 0, rejected: 0 },
        minAtrMove: { passed: 0, rejected: 0 },
        singleCandleSpike: { passed: 0, rejected: 0 },
        counterSwing: { passed: 0, rejected: 0 },
        alternatingSequence: { passed: 0, rejected: 0 },
        closeConfirmation: { passed: 0, rejected: 0 },
        weakLeg: { passed: 0, rejected: 0 },
        microRetest: { passed: 0, rejected: 0 },
        other: { passed: 0, rejected: 0 }
      },
      rejectedSwings: [],
      rejectedSwingsSample: [],
      acceptedSetupSwings: [],
      rejectedSummary: { totalRejected: 0, rejectionRatioPct: null, byReason: {}, topReason: null },
      assessment: { possibleOverFiltering: false, possibleRenderIssue: false, possibleDataSyncIssue: false, notes: [] }
    };
    const trackReject = (reason, swing, extra = {}) => {
      const bucket = setupSwingDiagnostics.filters[reason] ? reason : "other";
      setupSwingDiagnostics.filters[bucket].rejected += 1;
      setupSwingDiagnostics.rejectedSwings.push({
        index: swing?.index,
        time: swing?.time,
        type: swing?.type,
        label: swing?.label,
        price: swing?.price,
        legBars: swing?.legBars,
        barGap: swing?.barGap,
        movePct: swing?.movePct ?? swing?.movePercent ?? swing?.moveFromPreviousPct,
        atrMove: swing?.atrMove ?? swing?.moveFromPreviousAtr,
        isConfirmed: swing?.isConfirmed,
        isRunning: swing?.isRunning,
        sourceLayer: swing?.sourceLayer,
        reason: bucket,
        extra
      });
    };
    const trackPass = (reason) => {
      const bucket = setupSwingDiagnostics.filters[reason] ? reason : "other";
      setupSwingDiagnostics.filters[bucket].passed += 1;
    };
    const acceptedIds = new Set((setupSwings || []).map((swing) => swing?.id).filter(Boolean));
    (operationalSwings || []).forEach((swing, index, all) => {
      if (acceptedIds.has(swing?.id)) {
        ["confirmed", "running", "minLegBars", "minBarGap", "minMovePct", "minAtrMove", "counterSwing", "alternatingSequence", "closeConfirmation"].forEach(trackPass);
        return;
      }
      if (swing?.isRunning === true || swing?.source === "running") { trackReject("running", swing); return; }
      trackPass("running");
      if (swing?.isConfirmed === false) { trackReject("confirmed", swing); return; }
      trackPass("confirmed");
      const previous = all[index - 1];
      const legBars = Number(swing?.legBars ?? Math.abs(Number(swing?.index ?? swing?.barIndex ?? 0) - Number(previous?.index ?? previous?.barIndex ?? 0)));
      if (Number.isFinite(legBars) && legBars < Number(rules.minLegBars ?? 8)) { trackReject("minLegBars", swing, { observed: legBars, threshold: rules.minLegBars ?? 8 }); return; }
      trackPass("minLegBars");
      if (Number.isFinite(legBars) && legBars < Number(adaptive.adaptiveMinBarGap ?? rules.minBarGap ?? 10)) { trackReject("minBarGap", swing, { observed: legBars, threshold: adaptive.adaptiveMinBarGap ?? rules.minBarGap ?? 10 }); return; }
      trackPass("minBarGap");
      const movePct = Number(swing?.movePct ?? swing?.movePercent ?? swing?.moveFromPreviousPct ?? (previous?.price ? Math.abs(Number(swing?.price) - Number(previous.price)) / Math.max(1e-9, Number(previous.price)) * 100 : NaN));
      if (Number.isFinite(movePct) && movePct < Number(adaptive.adaptiveThreshold ?? rules.baseMinMovePct ?? 1.8)) { trackReject("minMovePct", swing, { observed: movePct, threshold: adaptive.adaptiveThreshold ?? rules.baseMinMovePct ?? 1.8 }); return; }
      trackPass("minMovePct");
      const atrMove = Number(swing?.atrMove ?? swing?.moveFromPreviousAtr);
      if (Number.isFinite(atrMove) && atrMove < Number(rules.minAtrMove ?? 1.4)) { trackReject("minAtrMove", swing, { observed: atrMove, threshold: rules.minAtrMove ?? 1.4 }); return; }
      trackPass("minAtrMove");
      trackReject("other", swing, { note: "Observer-only diagnostic could not map this rejected swing to a measured threshold." });
    });
    setupSwingDiagnostics.acceptedSetupSwings = (setupSwings || []).slice(0, 30).map((swing) => ({
      index: swing?.index,
      time: swing?.time,
      type: swing?.type,
      label: swing?.label,
      displayLabel: swing?.displayLabel,
      price: swing?.price,
      legBars: swing?.legBars,
      barGap: swing?.barGap,
      movePct: swing?.movePct ?? swing?.movePercent ?? swing?.moveFromPreviousPct,
      atrMove: swing?.atrMove ?? swing?.moveFromPreviousAtr,
      sourceLayer: swing?.sourceLayer,
      isSetup: swing?.isSetup,
      validationFactors: swing?.validationFactors
    }));
    setupSwingDiagnostics.rejectedSwingsSample = setupSwingDiagnostics.rejectedSwings.slice(0, 30);
    const byReason = {};
    setupSwingDiagnostics.rejectedSwings.forEach((item) => { byReason[item.reason] = (byReason[item.reason] || 0) + 1; });
    setupSwingDiagnostics.rejectedSummary.byReason = byReason;
    setupSwingDiagnostics.rejectedSummary.totalRejected = setupSwingDiagnostics.rejectedSwings.length;
    setupSwingDiagnostics.rejectedSummary.rejectionRatioPct = null;
    setupSwingDiagnostics.rejectedSummary.topReason = Object.entries(byReason).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    setupSwingDiagnostics.counts = {
      operationalSwingPath: context?.operationalSwingPath?.length || 0,
      setupSwingPath: context?.setupSwingPath?.length || 0,
      visibleStructureLabels: context?.visibleStructureLabels?.length || 0,
      hiddenStructureLabels: context?.hiddenStructureLabels?.length || 0,
      displaySwings: context?.displaySwings?.length || 0,
      labels: context?.labels?.length || 0,
      renderableLabels: typeof getRenderableStructureLabels === "function" ? getRenderableStructureLabels("4H", context)?.length || 0 : null
    };
    const finiteAverage = (values) => {
      const nums = values.map(Number).filter((value) => Number.isFinite(value));
      return nums.length ? Number((nums.reduce((sum, value) => sum + value, 0) / nums.length).toFixed(3)) : null;
    };
    const countBy = (items, getter) => items.reduce((acc, item) => { const key = getter(item) || "unknown"; acc[key] = (acc[key] || 0) + 1; return acc; }, {});
    const renderSource = context?.debugStats?.visibleSelectionDiagnostics?.renderSource || "unknown";
    const significantGapThreshold = context?.debugStats?.visibleSelectionDiagnostics?.significantGapThreshold ?? 5;
    const hiddenReasonCounts = countBy(context?.hiddenStructureLabels || [], (item) => item.hiddenReason);
    setupSwingDiagnostics.candidateFilterDiagnostics = {
      sourceName: "observerOnly",
      inputCount: operationalSwings.length,
      acceptedCount: null,
      rejectedCount: setupSwingDiagnostics.rejectedSwings.length,
      rejectionRatioPct: null,
      byReason,
      topReason: setupSwingDiagnostics.rejectedSummary.topReason,
      rejectedSamples: setupSwingDiagnostics.rejectedSwingsSample,
      note: "candidate rejection ratio measures observed candidate filter attempts, not final setupSwingPath existence."
    };
    setupSwingDiagnostics.finalSetupDiagnostics = {
      setupSwingPathCount: context?.setupSwingPath?.length || 0,
      sourceLayerCounts: countBy(context?.setupSwingPath || [], (item) => item.sourceLayer),
      labelCounts: countBy(context?.setupSwingPath || [], (item) => item.label),
      averageMovePct: finiteAverage((context?.setupSwingPath || []).map((item) => item.movePct ?? item.movePercent ?? item.moveFromPreviousPct)),
      averageAtrMove: finiteAverage((context?.setupSwingPath || []).map((item) => item.atrMove ?? item.moveFromPreviousAtr)),
      earliestTime: (context?.setupSwingPath || [])[0]?.time || null,
      latestTime: (context?.setupSwingPath || []).at?.(-1)?.time || null
    };
    setupSwingDiagnostics.visibleSelectionDiagnostics = {
      setupSwingPathCount: context?.setupSwingPath?.length || 0,
      visibleStructureLabelsCount: context?.visibleStructureLabels?.length || 0,
      displaySwingsCount: context?.displaySwings?.length || 0,
      labelsCount: context?.labels?.length || 0,
      renderableLabelsCount: setupSwingDiagnostics.counts.renderableLabels,
      hiddenFromDisplayCount: context?.hiddenStructureLabels?.length || 0,
      hiddenReasonCounts,
      visibleSelectionScoreRange: context?.debugStats?.visibleSelectionDiagnostics?.visibleSelectionScoreRange || { min: null, max: null },
      significantGapThreshold,
      renderSource,
      possibleDataSyncIssue: (context?.setupSwingPath?.length || 0) - (context?.visibleStructureLabels?.length || 0) > significantGapThreshold && renderSource !== "intentional_density_selector"
    };
    const counts = setupSwingDiagnostics.counts;
    const rejectionPct = setupSwingDiagnostics.candidateFilterDiagnostics.rejectionRatioPct;
    if (counts.setupSwingPath <= 5 && counts.visibleStructureLabels <= 5 && rejectionPct != null && rejectionPct >= 75) {
      setupSwingDiagnostics.assessment.possibleOverFiltering = true;
      setupSwingDiagnostics.assessment.notes.push("setupSwingPath is very low and rejection ratio is high. Over-filtering likely.");
    }
    if (setupSwingDiagnostics.visibleSelectionDiagnostics.possibleDataSyncIssue) {
      setupSwingDiagnostics.assessment.possibleDataSyncIssue = true;
      setupSwingDiagnostics.assessment.notes.push("setupSwingPath exists but visibleStructureLabels is lower. Display population may be wrong.");
    }
    if (counts.renderableLabels !== null && counts.visibleStructureLabels - counts.renderableLabels > significantGapThreshold && renderSource !== "intentional_density_selector") {
      setupSwingDiagnostics.assessment.possibleRenderIssue = true;
      setupSwingDiagnostics.assessment.notes.push("visibleStructureLabels exists but renderableLabels is lower. Render gate may be filtering too much.");
    }
    if (counts.setupSwingPath <= 5 && counts.visibleStructureLabels <= 5 && counts.renderableLabels <= 5) {
      setupSwingDiagnostics.assessment.notes.push("The whole pipeline is sparse from setupSwingPath onward.");
    }
    return setupSwingDiagnostics;
  }

  function buildDisplaySwings(analysisSwings, timeframe) {
    return buildCleanDisplaySwings(analysisSwings, timeframe);
  }

  function rebuildStructureForTimeframe(timeframe, options = {}) {
    try {
      const closedResult = getClosedCandlesForStructure(timeframe);
      const candles = closedResult.closedCandles;
      const closedStats = closedResult.stats;
      const { tf } = getConfig(timeframe);
      if (!candles.length || candles.length < Math.max((tf.pivotLeft || 4) + (tf.pivotRight || 4) + 5, 20)) {
        const empty = createEmptyStructureContext(timeframe, "Not enough closed candles for Structure V2.");
        empty.debugStats = { closedCandleCount: closedStats.closedCount, rejectedRunningCandleCount: closedStats.rejectedRunningCount, rejectedInvalidCount: closedStats.rejectedInvalidCount };
        window.BtcDash.state.structureContexts[timeframe] = empty;
        try { structureContexts[timeframe] = empty; } catch (error) { /* ignore lexical fallback */ }
        return empty;
      }
      const rawPivots = detectRawPivots(candles, timeframe);
      const promoted = promotePivotsToStructure(rawPivots, candles, timeframe);
      const role = getRole(timeframe);
      const ltfCfg = getLtfLabelConfig(timeframe);
      const rules = timeframe === "4H" ? (ltfCfg.setupSwingRules || {}) : timeframe === "1H" ? (ltfCfg.timingSwingRules || {}) : {};
      const adaptive = buildAdaptiveMeta(candles, timeframe, { baseMinMovePct: rules.baseMinMovePct || rules.minLegMovePct || 1, minMovePctFloor: rules.minMovePctFloor, minMovePctCeiling: rules.minMovePctCeiling, minBarGap: rules.minBarGap, minLegBars: rules.minLegBars, baseTolerancePct: rules.baseTolerancePct });
      const candidateSwings = [...promoted.majorSwings, ...promoted.internalSwings].sort((a, b) => Number(a.index) - Number(b.index));
      const zigzagSwings = candidateSwings;
      const validLegSwings = promoted.majorSwings.length ? promoted.majorSwings : promoted.internalSwings;
      const legacySetupSwings = buildSetupSwings(promoted.majorSwings, validLegSwings, timeframe);
      const legacyTimingSwings = buildTimingSwings(promoted.internalSwings, timeframe);
      const operational = (timeframe === "4H" || timeframe === "1H") ? buildOperationalStructure(candles, timeframe) : { confirmedOperationalPivots: [], operationalSwingPath: [], operationalStructureLabels: [], operationalRejectedPivots: [], operationalReplacementEvents: [], operationalContinuityRescues: [], operationalWarnings: [] };
      const hiddenOperationalSwings = timeframe === "4H" ? (operational.operationalStructureLabels || []).map((swing) => decorateLtfSwing(swing, timeframe, "operationalSwings", adaptive)) : [];
      const hiddenMicroSwings = timeframe === "1H" ? (operational.operationalStructureLabels || []).map((swing) => decorateLtfSwing(swing, timeframe, "timingSwings", adaptive)) : [];
      const setupSwings = timeframe === "4H" ? (filterSetupSwings({ operationalSwings: operational.operationalStructureLabels, internalSwings: promoted.internalSwings, closedCandles: candles, timeframe, volatilityRatio: adaptive.volatilityRatio, adaptiveThreshold: adaptive.adaptiveThreshold, adaptiveMinBarGap: adaptive.adaptiveMinBarGap, adaptiveTolerance: adaptive.adaptiveTolerance }).length ? filterSetupSwings({ operationalSwings: operational.operationalStructureLabels, internalSwings: promoted.internalSwings, closedCandles: candles, timeframe, volatilityRatio: adaptive.volatilityRatio, adaptiveThreshold: adaptive.adaptiveThreshold, adaptiveMinBarGap: adaptive.adaptiveMinBarGap, adaptiveTolerance: adaptive.adaptiveTolerance }) : legacySetupSwings.map((swing) => decorateLtfSwing(swing, timeframe, "setupSwings", adaptive))) : legacySetupSwings;
      const timingSwings = timeframe === "1H" ? (buildAdaptiveTimingSwings({ internalSwings: promoted.internalSwings, operationalSwings: operational.operationalStructureLabels, closedCandles: candles, timeframe, volatilityRatio: adaptive.volatilityRatio, adaptiveThreshold: adaptive.adaptiveThreshold, adaptiveMinBarGap: adaptive.adaptiveMinBarGap, adaptiveTolerance: adaptive.adaptiveTolerance }).length ? buildAdaptiveTimingSwings({ internalSwings: promoted.internalSwings, operationalSwings: operational.operationalStructureLabels, closedCandles: candles, timeframe, volatilityRatio: adaptive.volatilityRatio, adaptiveThreshold: adaptive.adaptiveThreshold, adaptiveMinBarGap: adaptive.adaptiveMinBarGap, adaptiveTolerance: adaptive.adaptiveTolerance }) : legacyTimingSwings.map((swing) => decorateLtfSwing(swing, timeframe, "timingSwings", adaptive))) : legacyTimingSwings;
      const setupOperationalSwings = timeframe === "4H" ? hiddenOperationalSwings : [];
      const timingOperationalSwings = timeframe === "1H" ? hiddenMicroSwings : [];
      let primary = [];
      let analysisSource = "majorSwings";
      if (role === "macro" || role === "context") { primary = promoted.majorSwings; analysisSource = "majorSwings"; }
      else if (role === "setup") { primary = setupSwings.length ? setupSwings : promoted.majorSwings; analysisSource = setupSwings.length ? "setupSwings" : "majorSwings"; }
      else { primary = timingSwings.length ? timingSwings : []; analysisSource = "timingSwings"; }
      if (!primary.length) {
        const empty = createEmptyStructureContext(timeframe, "Raw pivots found but no valid structural swing passed V2.1-R3 filters.");
        empty.rawPivots = rawPivots;
        empty.candidateSwings = candidateSwings;
        empty.zigzagSwings = zigzagSwings;
        empty.validLegSwings = validLegSwings;
        empty.setupSwings = setupSwings;
        empty.timingSwings = timingSwings;
        empty.confirmedOperationalPivots = operational.confirmedOperationalPivots;
        empty.operationalSwingPath = operational.operationalSwingPath;
        empty.setupOperationalSwings = setupOperationalSwings;
        empty.timingOperationalSwings = timingOperationalSwings;
        empty.hiddenOperationalSwings = hiddenOperationalSwings;
        empty.hiddenMicroSwings = hiddenMicroSwings;
        empty.analysisSource = analysisSource;
        empty.displaySource = analysisSource;
        empty.ltfLabelPolicy = ltfCfg;
        empty.debugStats = { ...promoted.debugStats, adaptive, closedCandleCount: closedStats.closedCount, rejectedRunningCandleCount: closedStats.rejectedRunningCount, rejectedInvalidCount: closedStats.rejectedInvalidCount };
        window.BtcDash.state.structureContexts[timeframe] = empty;
        try { structureContexts[timeframe] = empty; } catch (error) { /* ignore lexical fallback */ }
        return empty;
      }
      const needsClassification = !(timeframe === "4H" && analysisSource === "setupSwings") && !(timeframe === "1H" && analysisSource === "timingSwings");
      primary = needsClassification ? classifyStructureSwingsV2(primary, null, timeframe, role, { hierarchy: role === "setup" ? "setup" : role === "timing" ? "timing" : "major" }) : primary;
      primary = primary.map((swing) => (timeframe === "4H" ? decorateLtfSwing(swing, timeframe, analysisSource, adaptive) : timeframe === "1H" ? decorateLtfSwing(swing, timeframe, "timingSwings", adaptive) : swing));
      const protectedLevels = timeframe === "1H" ? resolveProtectedLevelsV2(primary, timeframe, role, candles, tf) : resolveProtectedLevelsV2(primary, timeframe, role, candles, tf);
      const bosChoch = deriveBosChochState(candles, primary, timeframe, protectedLevels);
      const sweepStatus = deriveSweepStatus(candles, primary, timeframe, protectedLevels);
      let bias = deriveStructureBias({ timeframe, role, analysisSwings: primary, bosChoch, sweepStatus, protectedLevels });
      if (timeframe === "4H") {
        bias = { ...bias, canOverrideHtf: false, summary: `${timeframe} setup-only structure: ${bias.trendState}. 4H maps setup context and does not override Weekly/Daily bias. ${bosChoch.note || "Reference only."}` };
      }
      if (timeframe === "1H") {
        bias = { ...bias, bias: "Timing Only", trendState: sweepStatus.hasSweep ? "Sweep Reaction Timing" : "Micro Timing Context", status: sweepStatus.hasSweep ? "Sweep Reaction Timing" : "Timing only", setupState: "Timing only", timingState: sweepStatus.hasSweep ? "Sweep Reaction Timing" : "Timing only", canOverrideHtf: false, summary: `${timeframe} timing-only micro structure. 1H does not influence Weekly/Daily/4H bias. ${sweepStatus.note || "Reference only."}` };
      }
      const setupSwingPath = timeframe === "4H" ? setupSwings : [];
      const timingSwingPath = timeframe === "1H" ? timingSwings : [];
      let visibleStructureLabels = [];
      let displaySwings = [];
      if (timeframe === "4H") {
        visibleStructureLabels = getRenderableStructureLabels(timeframe, { setupSwingPath, setupSwings });
        // Legacy adapter only. Do not use operationalSwingPath as 4H chart label source.
        displaySwings = visibleStructureLabels;
      } else if (timeframe === "1H") {
        visibleStructureLabels = getRenderableStructureLabels(timeframe, { timingSwingPath, timingSwings }, { showMicroLabels: ltfCfg.display?.showMicroLabels });
        displaySwings = visibleStructureLabels;
      } else {
        displaySwings = buildDisplaySwings(primary, timeframe);
        visibleStructureLabels = getRenderableStructureLabels(timeframe, { visibleStructureLabels: displaySwings, displaySwings });
      }
      const displaySource = timeframe === "4H" ? "setupSwings" : timeframe === "1H" ? "timingSwingsHidden" : analysisSource;
      const classificationWarnings = primary.filter((swing) => ["HH", "HL", "LH", "LL"].includes(swing.label) && (!swing.comparedTo || !swing.classificationReason)).map((swing) => `${swing.id} missing comparison metadata`);
      const biasContributionSummary = buildBiasContributionSummary(timeframe, analysisSource, primary, hiddenOperationalSwings, hiddenMicroSwings);
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
        confirmedOperationalPivots: operational.confirmedOperationalPivots,
        operationalSwingPath: operational.operationalSwingPath,
        setupOperationalSwings,
        timingOperationalSwings,
        operationalStructureLabels: timeframe === "4H" ? hiddenOperationalSwings : timeframe === "1H" ? hiddenMicroSwings : [],
        setupSwingPath,
        timingSwingPath,
        hiddenOperationalSwings,
        hiddenMicroSwings,
        visibleStructureLabels,
        ltfLabelPolicy: ltfCfg,
        biasContributionSummary,
        operationalTrendState: null,
        operationalRejectedPivots: operational.operationalRejectedPivots,
        operationalReplacementEvents: operational.operationalReplacementEvents,
        operationalContinuityRescues: operational.operationalContinuityRescues,
        operationalBosChoch: null,
        operationalWarnings: operational.operationalWarnings,
        timingOnly: role === "timing",
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
        canOverrideHtf: false,
        bosChoch,
        sweepStatus,
        sequence: primary.map((swing) => timeframe === "1H" ? swing.microDisplayLabel : (swing.displayLabel || swing.label)).filter(Boolean),
        debugStats: { ...promoted.debugStats, rawPivotCount: rawPivots.length, internalSwingCount: promoted.internalSwings.length, majorSwingCount: promoted.majorSwings.length, displayedLabelCount: displaySwings.length, setupSwingCount: setupSwings.length, timingSwingCount: timingSwings.length, operationalSwingCount: operational.operationalSwingPath.length, operationalRejectedPivotCount: operational.operationalRejectedPivots.length, operationalReplacementCount: operational.operationalReplacementEvents.length, operationalContinuityRescueCount: operational.operationalContinuityRescues.length, analysisSource, displaySource, analysisSwingCount: primary.length, displaySwingCount: displaySwings.length, hiddenDisplaySwingCount: Math.max(0, primary.length - displaySwings.length), visibleMainLabelCount: visibleStructureLabels.length, hiddenOperationalLabelCount: hiddenOperationalSwings.length, hiddenMicroLabelCount: hiddenMicroSwings.length, biasIgnored1hCount: timeframe === "1H" ? primary.length : 0, biasIgnored4hOperationalCount: timeframe === "4H" ? hiddenOperationalSwings.length : 0, closedCandleCount: closedStats.closedCount, rejectedRunningCandleCount: closedStats.rejectedRunningCount, rejectedInvalidCount: closedStats.rejectedInvalidCount, adaptive: { volatilityRatio: adaptive.volatilityRatio, adaptiveThreshold: adaptive.adaptiveThreshold, adaptiveTolerance: adaptive.adaptiveTolerance, adaptiveMinBarGap: adaptive.adaptiveMinBarGap, closedCandleCount: closedStats.closedCount, rejectedRunningCandleCount: closedStats.rejectedRunningCount, setupSwingCount: setupSwings.length, timingSwingCount: timingSwings.length, visibleMainLabelCount: visibleStructureLabels.length, hiddenOperationalLabelCount: hiddenOperationalSwings.length, hiddenMicroLabelCount: hiddenMicroSwings.length, biasIgnored1hCount: timeframe === "1H" ? primary.length : 0, biasIgnored4hOperationalCount: timeframe === "4H" ? hiddenOperationalSwings.length : 0, warnings: [...(operational.operationalWarnings || []), ...classificationWarnings] }, displayFilterReason: "V2.1-R3: 4H displays setupSwings only; 1H micro labels hidden by default.", reason: options.reason || null },
        summary: bias.summary,
        note: "Planning context only. Raw Pivot is not structure."
      };
      if (timeframe === "4H") {
        const visibleSelection = selectVisibleStructureLabels("4H", context);
        context.visibleStructureLabels = visibleSelection.visibleLabels;
        context.hiddenStructureLabels = visibleSelection.hiddenLabels;
        context.displaySwings = context.visibleStructureLabels;
        context.displayLabels = context.visibleStructureLabels;
        context.labels = context.visibleStructureLabels;
        context.sequence = context.visibleStructureLabels.map((swing) => swing.displayLabel || swing.label).filter(Boolean);
        context.debugStats.visibleMainLabelCount = context.visibleStructureLabels.length;
        context.debugStats.displayedLabelCount = context.visibleStructureLabels.length;
        context.debugStats.displaySwingCount = context.visibleStructureLabels.length;
        context.debugStats.hiddenStructureLabelCount = context.hiddenStructureLabels.length;
        context.debugStats.visibleSelectionDiagnostics = visibleSelection.diagnostics;
        context.setupSwingDiagnostics = createSetupSwingDiagnostics({ context, operationalSwings: operational.operationalSwingPath || [], setupSwings: setupSwingPath, rules: ltfCfg.setupSwingRules || {}, adaptive });
      }
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



  function debugOperationalSwingPath(timeframe = "4H") {
    const ctx = getStructureContext(timeframe);
    return {
      timeframe,
      role: ctx.role,
      pivotCount: ctx.confirmedOperationalPivots?.length || 0,
      operationalSwingCount: ctx.operationalSwingPath?.length || 0,
      rejectedPivotCount: ctx.operationalRejectedPivots?.length || 0,
      replacementCount: ctx.operationalReplacementEvents?.length || 0,
      continuityRescueCount: ctx.operationalContinuityRescues?.length || 0,
      analysisSource: ctx.analysisSource,
      displaySource: ctx.displaySource,
      firstSwing: ctx.operationalSwingPath?.[0] || null,
      lastSwing: ctx.operationalSwingPath?.at?.(-1) || null,
      protectedHigh: ctx.protectedHigh,
      protectedLow: ctx.protectedLow,
      timingProtectedHigh: ctx.timingProtectedHigh,
      timingProtectedLow: ctx.timingProtectedLow,
      bosChoch: ctx.bosChoch,
      warnings: ctx.operationalWarnings || []
    };
  }

  function operationalSwingTable(timeframe = "4H") {
    const rows = getStructureContext(timeframe)?.operationalSwingPath || [];
    return rows.map((swing, index) => ({ no: index + 1, barIndex: swing.barIndex ?? swing.index, time: swing.time, type: swing.type, price: swing.price, label: swing.label, reason: swing.reason, thresholdUsed: swing.thresholdUsed, legSize: swing.legSize, legBars: swing.legBars, comparedTo: swing.comparedTo, classificationReason: swing.classificationReason, continuityRescue: Boolean(swing.continuityRescue) }));
  }

  function printOperationalSwings(timeframe = "4H") {
    const table = operationalSwingTable(timeframe);
    if (console?.table) console.table(table);
    return table;
  }

  function printOperationalStructureLabels(timeframe = "4H") {
    const table = operationalSwingTable(timeframe).filter((row) => ["HH", "HL", "LH", "LL", "SH", "SL"].includes(row.label));
    if (console?.table) console.table(table);
    return table;
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
      setupOperationalCount: ctx.setupOperationalSwings?.length || 0,
      timingOperationalCount: ctx.timingOperationalSwings?.length || 0,
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

  function debugAdaptiveMetrics(timeframe = "4H") {
    const ctx = getStructureContext(timeframe);
    const adaptive = ctx.debugStats?.adaptive || {};
    return {
      timeframe,
      role: ctx.role,
      analysisSource: ctx.analysisSource,
      displaySource: ctx.displaySource,
      volatilityRatio: adaptive.volatilityRatio ?? null,
      adaptiveThreshold: adaptive.adaptiveThreshold ?? null,
      adaptiveTolerance: adaptive.adaptiveTolerance ?? null,
      adaptiveMinBarGap: adaptive.adaptiveMinBarGap ?? null,
      closedCandleCount: adaptive.closedCandleCount ?? ctx.debugStats?.closedCandleCount ?? 0,
      rejectedRunningCandleCount: adaptive.rejectedRunningCandleCount ?? ctx.debugStats?.rejectedRunningCandleCount ?? 0,
      setupSwingCount: adaptive.setupSwingCount ?? ctx.setupSwings?.length ?? 0,
      timingSwingCount: adaptive.timingSwingCount ?? ctx.timingSwings?.length ?? 0,
      visibleMainLabelCount: adaptive.visibleMainLabelCount ?? ctx.visibleStructureLabels?.length ?? 0,
      hiddenOperationalLabelCount: adaptive.hiddenOperationalLabelCount ?? ctx.hiddenOperationalSwings?.length ?? 0,
      hiddenMicroLabelCount: adaptive.hiddenMicroLabelCount ?? ctx.hiddenMicroSwings?.length ?? 0,
      biasIgnored1hCount: adaptive.biasIgnored1hCount ?? 0,
      biasIgnored4hOperationalCount: adaptive.biasIgnored4hOperationalCount ?? 0,
      warnings: adaptive.warnings || []
    };
  }

  function printStructureSwings(timeframe = "4H", key = "analysisSwings") {
    const rows = getStructureContext(timeframe)?.[key] || [];
    const table = rows.map((swing) => ({ id: swing.id, type: swing.type, label: swing.label, hierarchy: swing.hierarchy, price: swing.price, time: swing.time, comparedTo: swing.comparedTo, reason: swing.classificationReason }));
    if (console?.table) console.table(table);
    return table;
  }

  function getSetupSwingDiagnostics(timeframe = "4H") {
    return window.BtcDash?.state?.structureContexts?.[timeframe]?.setupSwingDiagnostics || null;
  }

  function printSetupSwingDiagnostics(timeframe = "4H") {
    const diag = getSetupSwingDiagnostics(timeframe);
    if (!diag) {
      console.warn("No setupSwingDiagnostics found for", timeframe);
      return null;
    }
    console.log("=== SETUP SWING DIAGNOSTICS:", timeframe, "===\n");
    console.log("📊 COUNTS:");
    console.table(diag.counts);
    console.log("\n⚙️ THRESHOLDS:");
    console.table(diag.thresholds);
    console.log("\n🧪 CANDIDATE FILTER DIAGNOSTICS:");
    console.table(diag.candidateFilterDiagnostics);
    console.log("\n✅ FINAL SETUP DIAGNOSTICS:");
    console.table(diag.finalSetupDiagnostics);
    console.log("\n👁️ VISIBLE SELECTION DIAGNOSTICS:");
    console.table(diag.visibleSelectionDiagnostics);
    console.log("\n📈 REJECTION SUMMARY:");
    console.log("Total rejected:", diag.rejectedSummary.totalRejected);
    console.log("Rejection ratio:", diag.rejectedSummary.rejectionRatioPct == null ? "observer-only" : `${diag.rejectedSummary.rejectionRatioPct}%`);
    console.log("Top rejection reason:", diag.rejectedSummary.topReason);
    console.log("\nRejection by reason:");
    console.table(diag.rejectedSummary.byReason);
    console.log("\n⚠️ ASSESSMENT:");
    console.log("Over-filtering?", diag.assessment.possibleOverFiltering);
    console.log("Render issue?", diag.assessment.possibleRenderIssue);
    console.log("Data sync issue?", diag.assessment.possibleDataSyncIssue);
    if (diag.assessment.notes.length > 0) {
      console.log("Notes:");
      diag.assessment.notes.forEach((note) => console.log("  -", note));
    }
    console.log("\n📋 SAMPLE REJECTED SWINGS (first 20):");
    console.table((diag.rejectedSwingsSample || []).slice(0, 20));
    console.log("\n✅ SAMPLE ACCEPTED SETUP SWINGS (first 20):");
    console.table((diag.acceptedSetupSwings || []).slice(0, 20));
    return diag;
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
    debugOperationalSwingPath,
    printOperationalSwings,
    printOperationalStructureLabels,
    debugStructureClassification,
    printStructureSwings,
    debugAdaptiveMetrics,
    getSetupSwingDiagnostics,
    printSetupSwingDiagnostics,
    getClosedCandlesForStructure,
    calculateVolatilityRatio,
    applyAdaptiveAdjustment,
    getAdaptiveThresholdForTimeframe,
    getAdaptiveToleranceForDetection,
    getAdaptiveMinBarGap,
    determineDisplayLabel,
    canInfluenceBias,
    selectVisibleStructureLabels,
    getRenderableStructureLabels,
    debugStructureRenderSource,
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
  window.BtcDash.debugOperationalSwingPath = debugOperationalSwingPath;
  window.BtcDash.printOperationalSwings = printOperationalSwings;
  window.BtcDash.printOperationalStructureLabels = printOperationalStructureLabels;
  window.BtcDash.debugStructureClassification = debugStructureClassification;
  window.BtcDash.printStructureSwings = printStructureSwings;
  window.BtcDash.debugAdaptiveMetrics = debugAdaptiveMetrics;
  window.BtcDash.getRenderableStructureLabels = getRenderableStructureLabels;
  window.BtcDash.selectVisibleStructureLabels = selectVisibleStructureLabels;
  window.BtcDash.debugStructureRenderSource = debugStructureRenderSource;
  window.BtcDash.getSetupSwingDiagnostics = getSetupSwingDiagnostics;
  window.BtcDash.printSetupSwingDiagnostics = printSetupSwingDiagnostics;
})();
