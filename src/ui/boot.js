// The boot log shown while the shapes are generated.
export function createBoot() {
  const el = document.getElementById('boot');
  const log = document.getElementById('boot-log');
  const lines = [];
  const render = () => {
    log.innerHTML = lines.map((l) => (l.dim ? `<span class="dim">${l.text}</span>` : l.text)).join('\n');
  };
  return {
    line(text, dim = false) {
      lines.push({ text, dim });
      render();
      return lines.length - 1;
    },
    update(i, text) {
      if (lines[i]) {
        lines[i].text = text;
        render();
      }
    },
    hide() {
      el.classList.add('gone');
    },
    el,
  };
}
