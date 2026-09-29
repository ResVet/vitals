// Netlify Forms: post the form as urlencoded data to the site root.
export function initForm() {
  const form = document.getElementById('contact-form');
  const status = document.getElementById('form-status');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    if (document.documentElement.dataset.preview === 'artifact') {
      status.textContent = 'Sending is switched off in this preview. It works on the live site.';
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    status.textContent = 'Sending...';
    try {
      const res = await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(new FormData(form)).toString(),
      });
      if (!res.ok) throw new Error(String(res.status));
      form.reset();
      status.textContent = 'Received. Thank you.';
    } catch {
      status.textContent = 'That did not go through. GitHub works too.';
    } finally {
      button.disabled = false;
    }
  });
}
