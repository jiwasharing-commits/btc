(function () {
  window.BtcDash = window.BtcDash || {};
  window.BtcDash.config = window.BtcDash.config || {};

  const TIMEFRAMES = ["1W", "1D", "4H", "1H"];
  const TIMEFRAME_LABELS = {
    "1W": "Weekly",
    "1D": "Daily",
    "4H": "4H",
    "1H": "1H"
  };
  const TIMEFRAME_ROLES = {
    "1W": "macro",
    "1D": "context",
    "4H": "setup",
    "1H": "timing"
  };
  const DEFAULT_TIMEFRAME = "1W";
  const DEFAULT_WORKSPACE = "Weekly Map";
  const WORKSPACE_TIMEFRAMES = {
    "Weekly Map": "1W",
    "Daily + 4H Setup": "4H",
    "1H Timing": "1H",
    "MTF Summary": "1W"
  };
  const VISIBLE_RANGE_OPTIONS = {
    "Weekly Map": ["1Y", "2Y", "3Y", "5Y", "Full"],
    "Daily + 4H Setup": ["1M", "3M", "6M"],
    "1H Timing": ["7D", "14D", "1M", "3M"]
  };

  Object.assign(window.BtcDash.config, {
    TIMEFRAMES,
    TIMEFRAME_LABELS,
    TIMEFRAME_ROLES,
    DEFAULT_TIMEFRAME,
    DEFAULT_WORKSPACE,
    WORKSPACE_TIMEFRAMES,
    VISIBLE_RANGE_OPTIONS
  });
})();
