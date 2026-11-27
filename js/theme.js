// Run before the stylesheet loads so a returning visitor sees their palette immediately.
(function () {
  'use strict';
  const root = document.documentElement;
  const key = 'hjkl:theme:v1';
  const themes = ['classic', 'tokyo-night', 'catppuccin-mocha', 'catppuccin-latte'];
  let saved;
  try { saved = localStorage.getItem(key); } catch (e) { /* storage unavailable */ }
  root.dataset.theme = themes.includes(saved) ? saved : 'classic';

  document.addEventListener('DOMContentLoaded', () => {
    const picker = document.getElementById('theme');
    picker.value = root.dataset.theme;
    picker.addEventListener('change', () => {
      root.dataset.theme = picker.value;
      try { localStorage.setItem(key, picker.value); } catch (e) { /* storage unavailable */ }
    });
    picker.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') document.getElementById('screen').focus();
    });
  });
})();
