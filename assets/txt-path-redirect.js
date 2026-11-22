/* GitHub Pages alias: Windows publishing keeps one canonical directory named TXT. */
(() => {
  'use strict';
  const path = window.location.pathname;
  if (path === '/txt' || path.startsWith('/txt/')) {
    window.location.replace('/TXT' + path.slice(4) + window.location.search + window.location.hash);
  }
})();
