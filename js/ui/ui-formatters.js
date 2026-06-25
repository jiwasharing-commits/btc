(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.ui = window.BtcDash.ui || {};
  function safeText(value, fallback = "—") { return value === null || value === undefined || value === "" ? fallback : String(value); }
  function formatPrice(value) { return window.BtcDash.utils?.fmtPrice ? window.BtcDash.utils.fmtPrice(value) : safeText(value); }
  function formatPercent(value) { const n = Number(value); return Number.isFinite(n) ? `${n.toFixed(1)}%` : "—"; }
  function formatScore(value) { const n = Number(value); return Number.isFinite(n) ? `${n.toFixed(1)}/10` : "—"; }
  function formatDistance(value) { return window.BtcDash.utils?.formatDistance ? window.BtcDash.utils.formatDistance(value) : formatPercent(value); }
  function formatTime(value) { return value ? new Date(value).toLocaleString() : "—"; }
  function formatStatus(value) { return safeText(value, "Not available"); }
  function formatSourceTags(tags = [], limit = 5) { const list = (Array.isArray(tags) ? tags : [tags]).filter(Boolean); return list.slice(0, limit).concat(list.length > limit ? [`+${list.length - limit} more`] : []).join(" · "); }
  function formatReasonList(reasons = [], limit = 3) { return (reasons || []).slice(0, limit); }
  window.BtcDash.ui.formatters = { formatPrice, formatPercent, formatScore, formatDistance, formatTime, formatStatus, formatSourceTags, formatReasonList, safeText };
})();
