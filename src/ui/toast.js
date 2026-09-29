export function createToast(el) {
  let timer = null;
  return (text, ms = 3600) => {
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove('show'), ms);
  };
}
