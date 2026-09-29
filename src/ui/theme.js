// Monitor (dark) and paper (light) themes. The switch uses a view transition
// that grows from the button when the browser supports it.
const KEY = 'vitals-theme';

function saved() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function initTheme({ onChange, reduced }) {
  const root = document.documentElement;
  const btn = document.getElementById('theme-btn');
  const label = document.getElementById('theme-label');
  const normalize = (t) => (t === 'paper' || t === 'light' ? 'paper' : 'monitor');
  const current = () => normalize(root.dataset.theme);

  let last = current();
  const sync = () => {
    const t = current();
    label.textContent = t === 'monitor' ? 'Paper' : 'Monitor';
    btn.setAttribute('aria-label', t === 'monitor' ? 'Switch to the paper theme' : 'Switch to the monitor theme');
  };

  const apply = (next, remember) => {
    last = next;
    if (root.dataset.theme !== next) root.dataset.theme = next;
    if (remember) {
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* private mode: the choice just will not persist */
      }
    }
    sync();
    onChange(next);
  };

  btn.addEventListener('click', () => {
    const next = current() === 'monitor' ? 'paper' : 'monitor';
    const r = btn.getBoundingClientRect();
    root.style.setProperty('--vt-x', `${r.left + r.width / 2}px`);
    root.style.setProperty('--vt-y', `${r.top + r.height / 2}px`);
    if (document.startViewTransition && !reduced) document.startViewTransition(() => apply(next, true));
    else apply(next, true);
  });

  matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', (e) => {
    if (!saved()) apply(e.matches ? 'paper' : 'monitor', false);
  });

  // A host page (like a preview frame) can flip data-theme to light or dark.
  new MutationObserver(() => {
    const t = root.dataset.theme;
    const n = normalize(t);
    if (n === last) return;
    last = n;
    // the CSS understands light and dark too, so only the canvas needs telling
    sync();
    onChange(n);
  }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  sync();
  return current();
}
