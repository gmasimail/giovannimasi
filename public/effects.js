/* Card effects matched to the supplied reference; no external dependencies. */
(() => {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const revealSelector = [
    '.section-heading', '.expertise-card', '.commitment-card', '.approach-visual',
    '.approach-content', '.article-card', '.cta-panel', '.profile-poster',
    '.profile-text', '.values-grid > div', '.method-steps > li', '.project-row',
    '.contact-left', '.contact-form-panel',
  ].join(', ');
  const sheenSelector = '.expertise-card, .commitment-card, .article-card, .contact-form-panel';
  const revealed = new WeakSet();
  const pointerBound = new WeakSet();
  const litCards = new Set();
  let revealObserver;

  function reveal(card) {
    card.classList.add('is-visible');
    revealed.add(card);
    revealObserver?.unobserve(card);
  }

  function resetSheen(card) {
    card.style.removeProperty('--pointer-x');
    card.style.removeProperty('--pointer-y');
    litCards.delete(card);
  }

  function bindSheen(card) {
    if (pointerBound.has(card)) return;
    pointerBound.add(card);
    let frame = 0;
    let point;
    const clear = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      resetSheen(card);
    };
    card.addEventListener('pointermove', event => {
      if (reducedMotion.matches || !finePointer.matches || event.pointerType === 'touch') return;
      point = { x: event.clientX, y: event.clientY };
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!card.isConnected || reducedMotion.matches || !finePointer.matches) return;
        const box = card.getBoundingClientRect();
        if (!box.width || !box.height) return;
        const percent = (value, start, size) => `${Math.max(0, Math.min(100, (value - start) / size * 100)).toFixed(1)}%`;
        card.style.setProperty('--pointer-x', percent(point.x, box.left, box.width));
        card.style.setProperty('--pointer-y', percent(point.y, box.top, box.height));
        litCards.add(card);
      });
    }, { passive: true });
    card.addEventListener('pointerleave', clear, { passive: true });
    card.addEventListener('pointercancel', clear, { passive: true });
  }

  function register(root = document) {
    root.querySelectorAll(revealSelector).forEach((card, index) => {
      if (!card.classList.contains('reveal-on-scroll')) {
        card.classList.add('reveal-on-scroll');
        card.style.setProperty('--reveal-delay', `${index % 3 * 75}ms`);
      }
      if (reducedMotion.matches || !revealObserver || revealed.has(card)) reveal(card);
      else revealObserver.observe(card);
    });
    root.querySelectorAll(sheenSelector).forEach(bindSheen);
  }

  function configureMotion() {
    revealObserver?.disconnect();
    revealObserver = undefined;
    if (!reducedMotion.matches && 'IntersectionObserver' in window && CSS.supports('translate', '0 28px')) {
      revealObserver = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) reveal(entry.target);
      }, { rootMargin: '0px 0px -35px 0px', threshold: 0.07 });
      document.documentElement.classList.add('enhanced-motion');
    } else {
      document.documentElement.classList.remove('enhanced-motion');
      for (const card of litCards) resetSheen(card);
    }
    register();
  }

  configureMotion();
  reducedMotion.addEventListener('change', configureMotion);
  finePointer.addEventListener('change', () => {
    if (!finePointer.matches) for (const card of litCards) resetSheen(card);
  });

  // New files, search results and pagination replace cards without reloading the page.
  if ('MutationObserver' in window) {
    for (const grid of document.querySelectorAll('#article-grid, #recent-articles')) {
      new MutationObserver(records => {
        for (const record of records) for (const node of record.removedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          for (const card of [node, ...node.querySelectorAll('.reveal-on-scroll')]) {
            revealObserver?.unobserve(card);
            resetSheen(card);
          }
        }
        register(grid);
      }).observe(grid, { childList: true });
    }
  }
  document.addEventListener('focusin', event => {
    const card = event.target.closest('.reveal-on-scroll');
    if (card) reveal(card);
  });
})();
