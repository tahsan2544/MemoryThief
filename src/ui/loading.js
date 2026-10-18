/** Loading screen controls — thin wrapper over the markup in index.html. */

const el = {
  overlay: () => document.getElementById('loading'),
  fill: () => document.getElementById('progress-fill'),
  status: () => document.getElementById('loading-status'),
  detail: () => document.getElementById('loading-detail'),
};

export function showLoading() {
  const overlay = el.overlay();
  overlay.classList.remove('gone');
  setProgress(0, 'Waking the city…', '');
}

export function setProgress(pct, label, detail = '') {
  const fill = el.fill();
  if (fill) fill.style.width = `${Math.round(Math.max(0, Math.min(1, pct)) * 100)}%`;
  const status = el.status();
  if (status && label) status.textContent = label;
  const d = el.detail();
  if (d) d.textContent = detail;
}

export function hideLoading() {
  const overlay = el.overlay();
  if (!overlay) return;
  setProgress(1, 'Eidolon City ready', '');
  overlay.classList.add('gone');
  setTimeout(() => {
    if (overlay.classList.contains('gone')) overlay.style.display = 'none';
  }, 700);
}

export function showLoadingError(message) {
  const overlay = el.overlay();
  overlay.classList.remove('gone');
  overlay.style.display = '';
  const status = el.status();
  if (status) {
    status.textContent = 'WORLD GENERATION FAILED';
    status.style.color = '#ff3b47';
  }
  const d = el.detail();
  if (d) {
    d.textContent = String(message);
    d.style.color = '#ff9aa2';
    d.style.whiteSpace = 'pre-wrap';
    d.style.maxWidth = '60ch';
  }
}
