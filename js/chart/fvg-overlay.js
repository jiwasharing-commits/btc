(function () {
  window.BtcDash = window.BtcDash || {}; window.BtcDash.chart = window.BtcDash.chart || {}; window.BtcDash.chart.overlays = window.BtcDash.chart.overlays || {};
  const bad = new Set(["Filled", "Mitigated", "Historical Reaction", "Invalidated"]);
  function isLayerEnabled(){const s=window.BtcDash.state;return Boolean(s?.chartRuntime?.layerState?.fvg||s?.activeLayers?.FVG)}
  function getFvgSource(timeframe){const c=window.BtcDash.state?.fvgContexts?.[timeframe]; const visible=c?.visibleFvgs||[]; const fallback=[...(c?.activeBullish||[]),...(c?.activeBearish||[])]; return {context:c, rows:(visible.length?visible:fallback), visibleCount:visible.length, fallbackCount:fallback.length};}
  function buildFvgOverlayItems(timeframe){const {context,rows}=getFvgSource(timeframe); if(!context?.available)return[]; return rows.filter(f=>!bad.has(f.status)).slice(0,window.BtcDash.config?.PERFORMANCE_CONFIG?.overlay?.maxZonesPerLayer||24).map(f=>({...f,layer:"fvg",timeframe,source:"FVG",sourceId:f.id,type:f.type,label:f.label||`${timeframe} ${f.type} FVG`,zoneLow:f.zoneLow,zoneHigh:f.zoneHigh,price:f.centerPrice,startTime:f.createdAtTime,endTime:f.fillState?.lastTouchTime||f.createdAtTime,drawPolicy:f.drawPolicy||"show"}));}
  function clearFvgOverlay(){window.BtcDash.chart.overlays.zone?.clearZoneOverlayLayer?.("fvg")}
  function renderFvgOverlay(timeframe){clearFvgOverlay(timeframe); if(!isLayerEnabled())return[]; return window.BtcDash.chart.overlays.zone?.renderZoneOverlayBatch(buildFvgOverlayItems(timeframe),{layer:"fvg",timeframe,source:"FVG",className:"fvg-zone-box"})||[];}
  function debugFvgOverlay(timeframe){const src=getFvgSource(timeframe); const items=buildFvgOverlayItems(timeframe); return {layer:"fvg",timeframe,contextAvailable:Boolean(src.context?.available),visibleFvgs:src.visibleCount,fallbackActive:src.fallbackCount,renderedCount:window.BtcDash.chart.overlayRegistry?.getOverlayCountByLayer?.("fvg")||0,skippedCount:Math.max(0,src.rows.length-items.length),skipReasons:items.length?[]:["No visible FVG for timeframe"]};}
  window.BtcDash.chart.overlays.fvg={renderFvgOverlay,clearFvgOverlay,buildFvgOverlayItems,debugFvgOverlay};
})();
