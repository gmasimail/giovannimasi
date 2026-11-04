'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const originalPageTitle = document.title;
const hasArchive = Boolean($('#article-grid'));
const hasRecentArticles = Boolean($('#recent-articles'));
const state = { q: '', category: '', topic: '', page: 1, pageSize: 10, totalPages: 1 };
const dateFormatter = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
const numberFormatter = new Intl.NumberFormat('it-IT');
let listController;
let articleController;
let latestListSignature = '';
let searchTimer;
let focusedBeforeArticle;
let focusedBeforePrivacy;
let articleReturnUrl = '/articoli.html#articoli';
let recentController;
let latestRecentSignature = '';

let activeArticleId = null;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  let data;
  try { data = await response.json(); } catch { throw new Error('Il server non ha restituito una risposta valida.'); }
  if (!response.ok) throw new Error(data.error || 'Si è verificato un errore. Riprova tra poco.');
  return data;
}

function safeDecodeId(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : dateFormatter.format(date);
}

function updateFilterOptions(select, values, label, selected) {
  const list = Array.isArray(values) ? values : [];
  const signature = JSON.stringify(list);
  if (select.dataset.signature === signature) return;
  select.dataset.signature = signature;
  const options = [new Option(label, ''), ...list.map(value => new Option(value, value))];
  if (selected && !list.includes(selected)) options.push(new Option(selected, selected));
  select.replaceChildren(...options);
  select.value = selected;
}

function artClass(article, index) {
  const category = `${article.category} ${article.topic}`.toLocaleLowerCase('it');
  if (/design|esperienz|brand|ux/.test(category)) return 'art-violet';
  if (/intelligenza|automazione|dati|\bai\b/.test(category)) return 'art-dark';
  if (/strateg|business|leadership/.test(category)) return 'art-peach';
  if (/sostenib|innovaz/.test(category)) return 'art-lime';
  return ['', 'art-violet', 'art-dark', 'art-peach', 'art-lime'][index % 5];
}

function articleCard(article, index) {
  const card = element('article', 'article-card');
  const link = element('a', 'article-link');
  link.href = `/articoli/${encodeURIComponent(article.id)}`;
  link.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    openArticle(article.id, true);
  });
  const art = element('div', `article-art ${artClass(article, index)}`);
  art.setAttribute('aria-hidden', 'true');
  art.append(element('span', 'article-art-index', 'SIRIUS / PROSPETTIVE'), element('span', 'article-art-mark', '✦'));
  const meta = element('div', 'article-meta');
  meta.append(element('span', 'category-pill', article.category), element('span', '', `${article.readTime || 1} min di lettura`));
  const bottom = element('div', 'article-card-bottom');
  const time = element('time', '', formatDate(article.publishedAt));
  if (!Number.isNaN(Date.parse(article.publishedAt))) time.dateTime = article.publishedAt;
  const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  arrow.classList.add('arrow-icon');
  arrow.setAttribute('viewBox', '0 0 24 24');
  arrow.setAttribute('aria-hidden', 'true');
  const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  arrowPath.setAttribute('d', 'M5 19 19 5M5 5h14v14');
  arrow.append(arrowPath);
  bottom.append(time, arrow);
  link.append(art, meta, element('h3', '', article.title), element('p', '', article.excerpt), bottom);
  card.append(link);
  return card;
}

function pageButton(label, page, className = '', disabled = false, current = false) {
  const button = element('button', className, label);
  button.type = 'button';
  button.disabled = disabled;
  if (current) button.setAttribute('aria-current', 'page');
  if (!className) button.setAttribute('aria-label', `Pagina ${page}`);
  button.addEventListener('click', () => {
    state.page = page;
    loadArticles();
    $('#articoli').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  return button;
}

function renderPagination(totalPages) {
  const container = $('#article-pagination');
  container.replaceChildren();
  container.hidden = totalPages <= 1;
  if (totalPages <= 1) return;
  container.append(pageButton('← Precedente', state.page - 1, 'pagination-wide', state.page <= 1));
  const visible = new Set([1, totalPages, state.page - 1, state.page, state.page + 1]);
  let previous = 0;
  for (const page of [...visible].filter(page => page > 0 && page <= totalPages).sort((a, b) => a - b)) {
    if (previous && page - previous > 1) container.append(element('span', 'pagination-ellipsis', '…'));
    container.append(pageButton(String(page), page, '', false, page === state.page));
    previous = page;
  }
  container.append(pageButton('Successiva →', state.page + 1, 'pagination-wide', state.page >= totalPages));
}

async function loadArticles({ silent = false } = {}) {
  if (!hasArchive) return;
  listController?.abort();
  const controller = new AbortController();
  listController = controller;
  const grid = $('#article-grid');
  if (!silent) {
    grid.setAttribute('aria-busy', 'true');
    $('#article-error').hidden = true;
    $('#article-count').textContent = 'Aggiornamento degli articoli…';
  }
  try {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(state)) {
      if (key !== 'totalPages' && value !== '') query.set(key, value);
    }
    const data = await api(`/api/articles?${query}`, { signal: controller.signal });
    if (controller.signal.aborted) return;
    state.page = data.page;
    state.totalPages = data.totalPages;
    updateFilterOptions($('#article-category'), data.categories, 'Tutte le categorie', state.category);
    updateFilterOptions($('#article-topic'), data.topics, 'Tutti gli argomenti', state.topic);
    const signature = JSON.stringify({ articles: data.articles, total: data.total, page: data.page, pageSize: data.pageSize });
    if (signature !== latestListSignature || !silent) {
      grid.replaceChildren(...data.articles.map(articleCard));
      latestListSignature = signature;
      renderPagination(data.totalPages);
    }
    const total = data.total;
    const first = total ? (data.page - 1) * data.pageSize + 1 : 0;
    const last = total ? first + data.articles.length - 1 : 0;
    $('#article-count').textContent = total ? `${first}–${last} di ${numberFormatter.format(total)} ${total === 1 ? 'articolo' : 'articoli'}` : '0 articoli';
    $('#article-empty').hidden = total !== 0;
    $('#article-error').hidden = true;
  } catch (error) {
    if (error.name === 'AbortError') return;
    if (!silent) {
      grid.replaceChildren();
      $('#article-empty').hidden = true;
      $('#article-pagination').hidden = true;
      $('#article-error').hidden = false;
      $('#article-count').textContent = 'Journal non disponibile';
      latestListSignature = '';
    }
  } finally {
    if (!controller.signal.aborted) grid.setAttribute('aria-busy', 'false');
  }
}

function applyFilters() {
  clearTimeout(searchTimer);
  state.q = $('#article-search').value.trim();
  state.category = $('#article-category').value;
  state.topic = $('#article-topic').value;
  state.pageSize = Number($('#page-size').value);
  state.page = 1;
  loadArticles();
}

function resetFilters() {
  $('#article-search').value = '';
  $('#article-category').value = '';
  $('#article-topic').value = '';
  applyFilters();
}

$('#article-filters')?.addEventListener('submit', event => { event.preventDefault(); applyFilters(); });
$('#article-filters')?.addEventListener('reset', event => { event.preventDefault(); resetFilters(); });
$('#article-search')?.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(applyFilters, 250); });
for (const selector of ['#article-category', '#article-topic', '#page-size']) $(selector)?.addEventListener('change', applyFilters);
$('#clear-search')?.addEventListener('click', resetFilters);
$('#retry-articles')?.addEventListener('click', () => loadArticles());

// Markdown is built from text nodes: article files never become executable HTML.
function renderInline(parent, source, depth = 0) {
  if (depth > 4) { parent.append(document.createTextNode(source)); return; }
  const tokens = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^\s)]+\))/g;
  let last = 0;
  for (const match of source.matchAll(tokens)) {
    parent.append(document.createTextNode(source.slice(last, match.index)));
    const token = match[0];
    if (token.startsWith('`')) parent.append(element('code', '', token.slice(1, -1)));
    else if (token.startsWith('**')) {
      const strong = element('strong');
      renderInline(strong, token.slice(2, -2), depth + 1);
      parent.append(strong);
    } else {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      let url;
      try { url = new URL(linkMatch[2]); } catch { url = null; }
      if (url && ['http:', 'https:'].includes(url.protocol)) {
        const link = element('a', '', linkMatch[1]);
        link.href = url.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        parent.append(link);
      } else parent.append(document.createTextNode(linkMatch[1]));
    }
    last = match.index + token.length;
  }
  parent.append(document.createTextNode(source.slice(last)));
}

function renderContent(source, format, title) {
  const container = element('div', 'article-content');
  const lines = String(source || '').replace(/\r\n/g, '\n').split('\n');
  if (format === 'text') {
    for (const paragraph of String(source || '').split(/\n\s*\n/)) {
      const p = element('p', '', paragraph);
      p.style.whiteSpace = 'pre-wrap';
      container.append(p);
    }
    return container;
  }
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    if (/^```/.test(line)) {
      const codeLines = [];
      index++;
      while (index < lines.length && !/^```/.test(lines[index])) codeLines.push(lines[index++]);
      index++;
      const pre = element('pre');
      pre.append(element('code', '', codeLines.join('\n')));
      container.append(pre);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      if (!(heading[1] === '#' && heading[2].trim() === title.trim())) {
        const h = element(`h${Math.min(4, Math.max(2, heading[1].length))}`);
        renderInline(h, heading[2]);
        container.append(h);
      }
      index++;
      continue;
    }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) { container.append(element('hr')); index++; continue; }
    if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const pattern = ordered ? /^\s*\d+[.)]\s+(.*)$/ : /^\s*[-*+]\s+(.*)$/;
      const list = element(ordered ? 'ol' : 'ul');
      while (index < lines.length && pattern.test(lines[index])) {
        const li = element('li');
        renderInline(li, lines[index].match(pattern)[1]);
        list.append(li);
        index++;
      }
      container.append(list);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote = element('blockquote');
      const parts = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) parts.push(lines[index++].replace(/^>\s?/, ''));
      const p = element('p');
      renderInline(p, parts.join(' '));
      quote.append(p);
      container.append(quote);
      continue;
    }
    const parts = [line];
    index++;
    while (index < lines.length && lines[index].trim() && !/^(#{1,6}\s|```|>\s?|\s*[-*+]\s+|\s*\d+[.)]\s+)/.test(lines[index])) parts.push(lines[index++]);
    const p = element('p');
    renderInline(p, parts.join(' '));
    container.append(p);
  }
  return container;
}

function syncDialogScroll() {
  document.body.classList.toggle('body-dialog-open', $$('dialog[open]').length > 0);
}

async function openArticle(id, navigate = false) {
  const dialog = $('#article-dialog');
  if (!dialog) return;
  if (!dialog.open) focusedBeforeArticle = document.activeElement;
  if (navigate) {
    if (!dialog.open) articleReturnUrl = `${location.pathname}${location.search}${location.hash}`;
    history.pushState({ article: id }, '', `/articoli/${encodeURIComponent(id)}`);
  }
  activeArticleId = id;
  articleController?.abort();
  const controller = new AbortController();
  articleController = controller;
  const content = $('#article-dialog-content');
  const loading = element('h2', '', 'Un momento…');
  loading.id = 'article-dialog-title';
  content.replaceChildren(loading);
  if (!dialog.open) dialog.showModal();
  syncDialogScroll();
  dialog.scrollTop = 0;
  try {
    const article = await api(`/api/articles/${encodeURIComponent(id)}`, { signal: controller.signal });
    if (controller.signal.aborted) return;
    const heading = element('header', 'article-dialog-heading');
    const meta = element('div', 'article-meta');
    meta.append(element('span', 'category-pill', article.category), element('span', '', `${formatDate(article.publishedAt)} · ${article.readTime || 1} min di lettura`));
    const title = element('h2', '', article.title);
    title.id = 'article-dialog-title';
    heading.append(meta, title, element('p', 'article-lead', article.excerpt));
    const tags = [...new Set([article.topic, ...(Array.isArray(article.tags) ? article.tags : [])].filter(Boolean))];
    if (tags.length) {
      const tagList = element('div', 'article-dialog-tags');
      tagList.append(...tags.map(tag => element('span', '', tag)));
      heading.append(tagList);
    }
    content.replaceChildren(heading, renderContent(article.content, article.format, article.title));
    document.title = `${article.title} — Sirius Journal`;
  } catch (error) {
    if (error.name === 'AbortError') return;
    const box = element('div', 'article-dialog-error');
    const title = element('h2', '', 'Questo articolo non è disponibile.');
    title.id = 'article-dialog-title';
    box.append(title, element('p', '', 'Il file potrebbe essere stato spostato o rimosso. Torna al Journal per scoprire gli altri articoli.'));
    content.replaceChildren(box);
  }
}

function closeArticle({ navigate = true } = {}) {
  const dialog = $('#article-dialog');
  if (!dialog?.open) return;
  articleController?.abort();
  activeArticleId = null;
  dialog.close();
  if (navigate && /^\/articoli\/[^/]+\/?$/.test(location.pathname)) history.replaceState({}, '', articleReturnUrl);
  document.title = originalPageTitle;
  syncDialogScroll();
  const focusTarget = focusedBeforeArticle?.isConnected ? focusedBeforeArticle : $('.article-link');
  focusTarget?.focus({ preventScroll: true });
}

for (const button of $$('[data-close-article]')) button.addEventListener('click', () => closeArticle());
$('#article-dialog')?.addEventListener('cancel', event => { event.preventDefault(); closeArticle(); });
$('.dialog-brand')?.addEventListener('click', event => {
  if (hasArchive) { event.preventDefault(); closeArticle(); $('#articoli').scrollIntoView(); }
});

function openPrivacy() {
  focusedBeforePrivacy = document.activeElement;
  if (!$('#privacy-dialog')?.open) $('#privacy-dialog')?.showModal();
  syncDialogScroll();
}
function closePrivacy() {
  $('#privacy-dialog')?.close();
  syncDialogScroll();
  if (focusedBeforePrivacy?.isConnected) focusedBeforePrivacy.focus({ preventScroll: true });
  if (/^\/privacy\/?$/.test(location.pathname)) history.replaceState({}, '', '/');
}
for (const button of $$('[data-open-privacy]')) button.addEventListener('click', openPrivacy);
for (const button of $$('[data-close-privacy]')) button.addEventListener('click', closePrivacy);
$('#privacy-dialog')?.addEventListener('cancel', event => { event.preventDefault(); closePrivacy(); });
for (const dialog of $$('dialog')) {
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
      if (dialog.id === 'article-dialog') closeArticle(); else closePrivacy();
    }
  });
}

window.addEventListener('popstate', () => {
  const match = location.pathname.match(/^\/articoli\/([^/]+)\/?$/);
  if (match) {
    if (match[1] !== activeArticleId) openArticle(safeDecodeId(match[1]));
  } else closeArticle({ navigate: false });
});

$('#contact-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const button = $('#contact-submit');
  if (button.disabled) return;
  const status = $('#contact-status');
  const fields = new FormData(form);
  const payload = { name: String(fields.get('name')).trim(), email: String(fields.get('email')).trim(), message: String(fields.get('message')).trim(), privacy: fields.get('privacy') === 'on', website: fields.get('website') || '' };
  status.className = 'form-status';
  status.textContent = 'Registrazione della richiesta…';
  button.disabled = true;
  button.firstChild.textContent = 'Invio in corso ';
  try {
    await api('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    status.className = 'form-status is-success';
    status.textContent = 'Richiesta registrata. Grazie per aver condiviso la tua idea! In questa versione dimostrativa il messaggio è salvato nel sito e non viene inviata un’email.';
    form.reset();
  } catch (error) {
    status.className = 'form-status is-error';
    status.textContent = error.message;
  } finally {
    button.disabled = false;
    button.firstChild.textContent = 'Invia la richiesta ';
  }
});

const menuToggle = $('.menu-toggle');
function closeMenu() {
  menuToggle?.setAttribute('aria-expanded', 'false');
  menuToggle?.setAttribute('aria-label', 'Apri il menu');
  $('#main-nav')?.classList.remove('is-open');
}
menuToggle?.addEventListener('click', () => {
  const expanded = menuToggle.getAttribute('aria-expanded') !== 'true';
  menuToggle?.setAttribute('aria-expanded', String(expanded));
  menuToggle?.setAttribute('aria-label', expanded ? 'Chiudi il menu' : 'Apri il menu');
  $('#main-nav').classList.toggle('is-open', expanded);
});
for (const link of $$('#main-nav a')) link.addEventListener('click', closeMenu);
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
document.addEventListener('click', event => { if (!$('.site-header')?.contains(event.target)) closeMenu(); });
window.matchMedia('(min-width: 821px)').addEventListener('change', event => { if (event.matches) closeMenu(); });

async function refreshStats(register = false) {
  try {
    const data = await api(register ? '/api/visit' : '/api/stats', register ? { method: 'POST' } : {});
    $('#visit-count').textContent = numberFormatter.format(data.visits);
  } catch {
    $('#visit-count').textContent = '—';
  }
}

function setTheme(theme, persist = false) {
  document.documentElement.dataset.theme = theme;
  const button = $('.theme-toggle');
  const label = theme === 'dark' ? 'Attiva tema chiaro' : 'Attiva tema scuro';
  button?.setAttribute('aria-label', label);
  button?.setAttribute('title', label);
  button?.setAttribute('aria-pressed', String(theme === 'light'));
  const themeColor = $('meta[name="theme-color"]');
  if (themeColor) themeColor.content = theme === 'dark' ? '#041027' : '#f2f6fd';
  const icon = $('.theme-icon');
  if (icon) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', theme === 'dark' ? 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5' : 'M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z');
    icon.replaceChildren(path);
  }
  if (persist) {
    try { localStorage.setItem('sirius-theme', theme); } catch { /* Storage can be disabled by the visitor. */ }
  }
}
let savedTheme = 'dark';
try { if (localStorage.getItem('sirius-theme') === 'light') savedTheme = 'light'; } catch { /* Default remains dark. */ }
setTheme(savedTheme);
$('.theme-toggle')?.addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true));

async function loadRecentArticles({ silent = false } = {}) {
  if (!hasRecentArticles) return;
  recentController?.abort();
  const controller = new AbortController();
  recentController = controller;
  const grid = $('#recent-articles');
  const status = $('#recent-articles-status');
  if (!silent) grid.setAttribute('aria-busy', 'true');
  try {
    const data = await api('/api/articles?page=1&pageSize=10', { signal: controller.signal });
    if (controller.signal.aborted) return;
    const articles = data.articles.slice(0, 3);
    const signature = JSON.stringify(articles);
    if (signature !== latestRecentSignature || !silent) {
      grid.replaceChildren(...articles.map(articleCard));
      latestRecentSignature = signature;
    }
    status.textContent = articles.length ? '' : 'Il Journal è in preparazione: i nuovi approfondimenti appariranno qui.';
  } catch (error) {
    if (error.name === 'AbortError') return;
    if (!silent) {
      grid.replaceChildren();
      status.textContent = 'Non riusciamo a caricare gli articoli in questo momento. Riprova tra poco.';
    }
  } finally {
    if (!controller.signal.aborted) grid.setAttribute('aria-busy', 'false');
  }
}

$('#current-year').textContent = String(new Date().getFullYear());
loadArticles();
loadRecentArticles();
refreshStats(true);
function refreshVisibleContent() {
  if (!document.hidden) {
    loadArticles({ silent: true });
    loadRecentArticles({ silent: true });
    refreshStats();
  }
}
setInterval(refreshVisibleContent, 30_000);
document.addEventListener('visibilitychange', refreshVisibleContent);
const initialArticle = location.pathname.match(/^\/articoli\/([^/]+)\/?$/);
if (initialArticle) openArticle(safeDecodeId(initialArticle[1]));
if (location.pathname === '/privacy' || location.pathname === '/privacy/') openPrivacy();
