// Dot-and-ring cursor for fine pointers. Grows over anything interactive and
// can show a short label.
const LABELS = { open: 'Open', sound: 'Sound', theme: 'Theme', send: 'Send' };

export function initCursor(gsap) {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return null;
  const root = document.documentElement;
  root.classList.add('has-cursor');
  const el = document.getElementById('cursor');
  const ring = el.querySelector('.cursor-ring');
  const dot = el.querySelector('.cursor-dot');
  const label = el.querySelector('.cursor-label');
  gsap.set([ring, dot, label], { xPercent: -50, yPercent: -50 });
  const rx = gsap.quickTo([ring, label], 'x', { duration: 0.45, ease: 'power3' });
  const ry = gsap.quickTo([ring, label], 'y', { duration: 0.45, ease: 'power3' });
  const dx = gsap.quickTo(dot, 'x', { duration: 0.08, ease: 'none' });
  const dy = gsap.quickTo(dot, 'y', { duration: 0.08, ease: 'none' });
  let forced = null;

  let seen = false;
  addEventListener('pointermove', (e) => {
    if (!seen) {
      seen = true;
      gsap.set([ring, label, dot], { x: e.clientX, y: e.clientY });
      gsap.to(el, { opacity: 1, duration: 0.3 });
    }
    rx(e.clientX);
    ry(e.clientY);
    dx(e.clientX);
    dy(e.clientY);
  });
  document.addEventListener('pointerleave', () => gsap.to(el, { opacity: 0, duration: 0.2 }));
  document.addEventListener('pointerenter', () => gsap.to(el, { opacity: 1, duration: 0.2 }));

  const interactive = 'a, button, [data-cursor], [data-tilt], label';
  document.addEventListener('pointerover', (e) => {
    if (forced) return;
    const t = e.target.closest?.('input, textarea');
    if (t) {
      el.classList.add('text');
      el.classList.remove('hover');
      return;
    }
    el.classList.remove('text');
    const hit = e.target.closest?.(interactive);
    if (hit) {
      el.classList.add('hover');
      el.style.setProperty('--accent', getComputedStyle(hit).getPropertyValue('--accent'));
      label.textContent = LABELS[hit.dataset.cursor] || '';
    } else {
      el.classList.remove('hover');
      label.textContent = '';
    }
  });

  return {
    // Used for canvas hot spots (the heart) that have no DOM element.
    force(text) {
      if (text === forced) return;
      forced = text;
      if (text) {
        el.classList.add('hover');
        el.style.setProperty('--accent', getComputedStyle(document.querySelector('.hero')).getPropertyValue('--accent'));
        label.textContent = text;
      } else {
        el.classList.remove('hover');
        label.textContent = '';
      }
    },
  };
}
