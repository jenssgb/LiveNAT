const overlayAPI = window.latencyOverlay;

const overlayRoot = document.querySelector('.overlay');
const miniToggleButton = document.querySelector('[data-action="toggle-mini"]');
const internetRow = document.querySelector('[data-role="internet-row"]');
const internetValue = internetRow?.querySelector('[data-field="value"]');
const historyRoot = document.querySelector('[data-role="internet-history"]');
const historyPath = historyRoot?.querySelector('path');

const HISTORY_WIDTH = 220;
const HISTORY_HEIGHT = 32;

const modeElements = Array.from(document.querySelectorAll('[data-mode]')).reduce((acc, el) => {
  const mode = el.dataset.mode;
  if (mode) acc[mode] = el;
  return acc;
}, {});

const teamsRow = document.querySelector('.teams-row');
const detailPanel = document.querySelector('[data-panel="details"]');
const toggleButtons = document.querySelectorAll('[data-action="toggle-details"]');
const closeButton = document.querySelector('[data-action="close-details"]');

const detailRows = detailPanel
  ? Array.from(detailPanel.querySelectorAll('[data-detail-row]')).reduce((acc, row) => {
      const target = row.dataset.target;
      if (target) {
        acc[target] = {
          median: row.querySelector('[data-field="median"]'),
          fail: row.querySelector('[data-field="fail"]'),
          jitter: row.querySelector('[data-field="jitter"]')
        };
      }
      return acc;
    }, {})
  : {};

const detailErrorField = detailPanel?.querySelector('[data-field="error"]');
const detailFailField = detailPanel?.querySelector('[data-field="aggregate-fail"]');

let latestState = null;
let isMiniMode = false;

const MODE_STATUS_LABELS = {
  green: 'Stabil',
  orange: 'Achtung',
  red: 'Kritisch'
};

const MODE_NAMES = {
  audio: 'Audio',
  video: 'Video'
};

const applyMiniMode = (mini) => {
  isMiniMode = Boolean(mini);
  if (overlayRoot) {
    overlayRoot.dataset.mode = isMiniMode ? 'mini' : 'full';
  }
  if (miniToggleButton) {
    miniToggleButton.setAttribute('aria-pressed', String(isMiniMode));
    miniToggleButton.textContent = isMiniMode ? 'Full' : 'Mini';
    miniToggleButton.title = isMiniMode ? 'Vollmodus anzeigen' : 'Mini Mode umschalten';
  }
  if (isMiniMode) {
    closeDetails();
  }
};

const formatInternetValue = (summary) => {
  if (!summary) return '-- ms';
  return typeof summary.rtt === 'number' ? `${summary.rtt} ms` : 'n/a';
};

const formatInternetTooltip = (summary) => {
  if (!summary) return '';
  const rttLabel = typeof summary.rtt === 'number' ? `${summary.rtt} ms` : 'n/a';
  const jitterLabel = typeof summary.jitterMs === 'number' ? `${summary.jitterMs} ms` : 'n/a';
  const failPct = Math.round((summary.failRate ?? 0) * 100);
  return `RTT ${rttLabel} · jitter ${jitterLabel} · fails ${failPct}%`;
};

const applyInternet = (summary) => {
  if (!internetRow || !internetValue) return;
  internetRow.dataset.state = summary?.tier ?? 'orange';
  internetValue.textContent = formatInternetValue(summary);
  internetValue.title = formatInternetTooltip(summary);
};

const buildHistoryPath = (samples) => {
  if (!samples?.length) return '';
  const values = samples.map((point) => (typeof point?.rtt === 'number' ? point.rtt : null));
  const valid = values.filter((value) => typeof value === 'number');
  if (!valid.length) return '';
  let min = Math.min(...valid);
  let max = Math.max(...valid);
  if (max - min < 25) {
    max = min + 25;
  }
  const step = samples.length > 1 ? HISTORY_WIDTH / (samples.length - 1) : 0;
  let started = false;
  let path = '';
  samples.forEach((point, index) => {
    const value = typeof point?.rtt === 'number' ? point.rtt : null;
    const x = index * step;
    if (value === null) {
      started = false;
      return;
    }
    const normalized = (value - min) / (max - min);
    const y = HISTORY_HEIGHT - normalized * HISTORY_HEIGHT;
    if (!started) {
      path += `M ${x.toFixed(2)} ${y.toFixed(2)}`;
      started = true;
    } else {
      path += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
    }
  });
  return path;
};

const applyHistory = (historyState) => {
  if (!historyRoot || !historyPath) return;
  const samples = Array.isArray(historyState?.internet) ? historyState.internet : [];
  const path = buildHistoryPath(samples);
  historyPath.setAttribute('d', path);
  const tier = samples[samples.length - 1]?.tier ?? 'green';
  historyRoot.dataset.tier = tier;
  historyRoot.dataset.empty = path ? 'false' : 'true';
};

const applyReadiness = (readiness) => {
  if (!teamsRow) return;
  const modes = readiness?.modes ?? {};
  teamsRow.dataset.state = readiness?.aggregate?.stability ?? 'stable';
  Object.entries(modeElements).forEach(([mode, element]) => {
    const state = modes[mode]?.state ?? 'orange';
    element.dataset.state = state;
    const label = `${MODE_NAMES[mode] ?? mode} · ${MODE_STATUS_LABELS[state] ?? 'Analyse läuft …'}`;
    element.setAttribute('title', label);
    element.setAttribute('aria-label', label);
  });
};

const updateDetailPanel = () => {
  if (!detailPanel || !latestState) return;
  const { targets = [], readiness } = latestState;
  targets.forEach((snapshot) => {
    const row = detailRows[snapshot.targetId];
    if (!row) return;
    const median = snapshot.metrics?.medianMs;
    const fail = snapshot.metrics?.failRate;
    const jitter = snapshot.metrics?.jitterMs;
    if (row.median) row.median.textContent = typeof median === 'number' ? `${median} ms` : '—';
    if (row.fail) row.fail.textContent = typeof fail === 'number' ? `${Math.round(fail * 100)}%` : '—';
    if (row.jitter) row.jitter.textContent = typeof jitter === 'number' ? `${jitter} ms` : '—';
  });

  if (detailFailField) {
    const aggregateFail = readiness?.aggregate?.failRate ?? null;
    detailFailField.textContent = typeof aggregateFail === 'number' ? `${Math.round(aggregateFail * 100)}%` : '—';
  }

  if (detailErrorField) {
    const lastErrorSnapshot = targets.find((snapshot) => Boolean(snapshot.lastSample?.error));
    detailErrorField.textContent = lastErrorSnapshot?.lastSample?.error ?? 'Keine Fehler zuletzt';
  }
};

const setExpanded = (isOpen) => {
  toggleButtons.forEach((button) => button.setAttribute('aria-expanded', String(isOpen)));
};

const closeDetails = () => {
  if (!detailPanel) return;
  detailPanel.hidden = true;
  detailPanel.dataset.open = 'false';
  setExpanded(false);
};

const openDetails = () => {
  if (!detailPanel) return;
  detailPanel.hidden = false;
  detailPanel.dataset.open = 'true';
  setExpanded(true);
  updateDetailPanel();
};

toggleButtons.forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    if (detailPanel?.dataset.open === 'true') {
      closeDetails();
    } else {
      openDetails();
    }
  });
});

if (closeButton) {
  closeButton.addEventListener('click', (event) => {
    event.stopPropagation();
    closeDetails();
  });
}

document.addEventListener('click', (event) => {
  if (!detailPanel || detailPanel.hidden) return;
  if (detailPanel.contains(event.target)) return;
  if (event.target.closest('[data-action="toggle-details"]')) return;
  closeDetails();
});

const applyState = (state) => {
  if (!state) return;
  latestState = state;
  applyMiniMode(state.uiMode?.mini ?? false);
  applyInternet(state.internet);
  applyHistory(state.history);
  applyReadiness(state.readiness);
  updateDetailPanel();
};

const hydrate = async () => {
  if (!overlayAPI) return;

  try {
    const state = await overlayAPI.requestInitial();
    applyState(state);
  } catch (error) {
    console.error('Failed to load initial state', error);
  }

  overlayAPI.onUpdate(applyState);
};

hydrate();

if (miniToggleButton && overlayAPI?.setMiniMode) {
  miniToggleButton.addEventListener('click', async (event) => {
    event.stopPropagation();
    const desired = !isMiniMode;
    try {
      const response = await overlayAPI.setMiniMode(desired);
      applyMiniMode(typeof response?.mini === 'boolean' ? response.mini : desired);
    } catch (error) {
      console.error('Failed to toggle mini mode', error);
      applyMiniMode(desired);
    }
  });
}
