(function () {
  window.BtcDash = window.BtcDash || {}; window.BtcDash.chart = window.BtcDash.chart || {}; window.BtcDash.chart.overlays = window.BtcDash.chart.overlays || {};
  function isLayerEnabled(){const s=window.BtcDash.state;return Boolean(s?.chartRuntime?.layerState?.fvg||s?.activeLayers?.FVG)}
  function buildFvgOverlayItems(timeframe){const c=window.BtcDash.state?.fvgContexts?.[timeframe]; if(!c?.available)return[]; return (c.visibleFvgs||[]).filter(f=>!["Filled","Mitigated","Historical Reaction"].includes(f.status)).slice(0,6).map(f=>({...f,layer:"fvg",timeframe,source:"FVG",sourceId:f.id,type:f.type,label:f.label||`${timeframe} ${f.type} FVG`,zoneLow:f.zoneLow,zoneHigh:f.zoneHigh,price:f.centerPrice,startTime:f.createdAtTime,endTime:f.fillState?.lastTouchTime||f.createdAtTime,drawPolicy:f.drawPolicy||"show"}));}
  function clearFvgOverlay(){window.BtcDash.chart.overlays.zone?.clearZoneOverlayLayer?.("fvg");window.BtcDash.chart.overlayRegistry?.clearLayer("fvg")}
  function renderFvgOverlay(timeframe){clearFvgOverlay(timeframe); if(!isLayerEnabled())return[]; return window.BtcDash.chart.overlays.zone?.renderZoneOverlayBatch(buildFvgOverlayItems(timeframe),{layer:"fvg",timeframe,source:"FVG",className:"fvg-zone-box"})||[];}
  window.BtcDash.chart.overlays.fvg={renderFvgOverlay,clearFvgOverlay,buildFvgOverlayItems};
})();
