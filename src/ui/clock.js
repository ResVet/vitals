// Local time in Palembang (WIB, UTC+7), like the clock in a monitor's corner.
export function initClock(el) {
  if (!el) return;
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const tick = () => {
    el.textContent = `PLG ${fmt.format(new Date())} WIB`;
  };
  tick();
  setInterval(tick, 1000);
}
