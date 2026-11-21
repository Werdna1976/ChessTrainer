(() => {
  const storageKey = 'chess-trainer-theme';
  const root = document.documentElement;
  let theme = 'light';

  try {
    const saved = localStorage.getItem(storageKey);
    if (saved === 'dark' || saved === 'light') theme = saved;
    else if (JSON.parse(localStorage.getItem('chess-trainer-appearance'))?.theme === 'dark') {
      theme = 'dark';
      localStorage.setItem(storageKey, theme);
    }
  } catch {}
  root.dataset.theme = theme;

  document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('color-mode');
    function apply() {
      const dark = theme === 'dark';
      root.dataset.theme = theme;
      toggle.setAttribute('aria-checked', String(dark));
      toggle.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
    }

    apply();
    toggle.addEventListener('click', () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      apply();
      try { localStorage.setItem(storageKey, theme); }
      catch {}
    });
    window.addEventListener('storage', (event) => {
      if (event.key !== storageKey) return;
      theme = event.newValue === 'dark' ? 'dark' : 'light';
      apply();
    });
  });
})();
