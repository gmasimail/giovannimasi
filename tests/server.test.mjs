import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createServer } from '../server.mjs';

async function fixture(t) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sirius-test-'));
  fs.mkdirSync(path.join(rootDir, 'public'));
  fs.mkdirSync(path.join(rootDir, 'fileArticoli'));
  fs.writeFileSync(path.join(rootDir, 'public', 'index.html'), '<h1>Sirius test</h1>');
  fs.writeFileSync(path.join(rootDir, 'public', 'app.js'), 'console.log("Sirius");');
  const server = createServer({ rootDir });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(rootDir, { recursive: true, force: true });
  });
  const article = (filename, content, time = Date.now()) => {
    const location = path.join(rootDir, 'fileArticoli', filename);
    fs.writeFileSync(location, content);
    fs.utimesSync(location, new Date(time), new Date(time));
    return location;
  };
  const request = (url, options) => fetch(`${base}${url}`, options);
  return { rootDir, server, request, article };
}

test('discovery live, ordinamento file decrescente e paginazione 10/20/30', async t => {
  const { request, article } = await fixture(t);
  for (let i = 1; i <= 23; i++) {
    article(`${String(i).padStart(2, '0')}.md`, `---\ntitle: Articolo ${i}\ndate: 2020-01-01\n---\n# Articolo ${i}\nContenuto di prova.`, 1700000000000 + i * 1000);
  }
  const first = await (await request('/api/articles')).json();
  assert.equal(first.articles.length, 10);
  assert.equal(first.articles[0].title, 'Articolo 23');
  assert.equal(first.total, 23);
  assert.equal(first.totalPages, 3);
  assert.equal(first.pageSize, 10);
  assert.equal(first.articles[0].content, undefined);
  const second = await (await request('/api/articles?page=2')).json();
  assert.equal(second.articles[0].title, 'Articolo 13');
  const twenty = await (await request('/api/articles?pageSize=20')).json();
  assert.equal(twenty.articles.length, 20);
  assert.equal(twenty.totalPages, 2);
  const thirty = await (await request('/api/articles?pageSize=30')).json();
  assert.equal(thirty.articles.length, 23);
  article('nuovo articolo à.md', '# Ultima pubblicazione\nAppena aggiunto.', 1800000000000);
  const updated = await (await request('/api/articles')).json();
  assert.equal(updated.articles[0].title, 'Ultima pubblicazione');
  assert.equal(updated.total, 24);
  assert.match(updated.articles[0].id, /^nuovo-articolo-a-[a-f0-9]{8}$/);
  const detail = await (await request(`/api/articles/${updated.articles[0].id}`)).json();
  assert.equal(detail.format, 'markdown');
  assert.match(detail.content, /Appena aggiunto/);
});

test('ricerca accent insensitive nel contenuto e nei tag, filtri combinati e faccette', async t => {
  const { request, article } = await fixture(t);
  article('ai.md', '---\ntitle: L’intelligenza artificiale\ncategory: Tecnologia\ntopic: Dati\ntags: [accessibilità, ricerca]\n---\n# L’intelligenza artificiale\nUna strategia di qualità per sistemi responsabili.');
  article('design.md', '---\ntitle: Design accessibile\ncategory: Design\ntopic: Esperienza digitale\n---\nLa ricerca parte dalle persone.');
  const filtered = await (await request('/api/articles?q=accessibilita%20qualita&category=tecnologia&topic=dati')).json();
  assert.equal(filtered.total, 1);
  assert.equal(filtered.articles[0].category, 'Tecnologia');
  assert.deepEqual(filtered.categories, ['Design', 'Tecnologia']);
  assert.deepEqual(filtered.articles[0].tags, ['accessibilità', 'ricerca']);
  const absent = await (await request('/api/articles?q=nonpresente')).json();
  assert.equal(absent.total, 0);
  assert.deepEqual(absent.articles, []);
  assert.equal(absent.page, 1);
  assert.equal(absent.totalPages, 0);
});

test('nuovo file con vecchio mtime appare primo e ordine inserimento sopravvive al riavvio', async t => {
  const { request, article, rootDir } = await fixture(t);
  const firstFile = article('esistente.md', '# Esistente\nUn contenuto iniziale.', 1700000000000);
  const initial = await (await request('/api/articles')).json();
  assert.equal(initial.articles[0].title, 'Esistente');
  article('copia-antica.md', '# Nuova copia\nFile copiato mantenendo la data originale.', 1400000000000);
  const next = await (await request('/api/articles')).json();
  assert.equal(next.articles[0].title, 'Nuova copia');
  fs.appendFileSync(firstFile, '\nAggiornamento del testo.');
  fs.utimesSync(firstFile, new Date(1900000000000), new Date(1900000000000));
  assert.equal((await (await request('/api/articles')).json()).articles[0].title, 'Nuova copia');
  const restarted = createServer({ rootDir });
  // Insert before the restarted server's first request, with an even older mtime.
  article('altra-copia.md', '# Ultima inserzione\nUn secondo file copiato.', 1200000000000);
  restarted.listen(0, '127.0.0.1');
  await once(restarted, 'listening');
  try {
    const list = await (await fetch(`http://127.0.0.1:${restarted.address().port}/api/articles`)).json();
    assert.deepEqual(list.articles.map(item => item.title), ['Ultima inserzione', 'Nuova copia', 'Esistente']);
  } finally {
    restarted.closeAllConnections();
    await new Promise(resolve => restarted.close(resolve));
  }
});

test('formati txt/json, fallback metadati, file malformati ignorati, eliminazione immediata', async t => {
  const { request, article } = await fixture(t);
  article('nota-semplice.txt', 'Un articolo testuale senza metadati.');
  const jsonFile = article('articolo.json', JSON.stringify({ title: 'Articolo JSON', category: 'Tecnologia', tags: ['AI'], content: '# Dati\nUn contenuto utile.', date: '2026-11-01' }));
  article('rotto.json', '{missing-json');
  article('non-articolo.json', '{}');
  article('ignorato.exe', 'non leggermi');
  const list = await (await request('/api/articles')).json();
  assert.equal(list.total, 2);
  const txt = list.articles.find(item => item.title === 'nota semplice');
  const txtDetail = await (await request(`/api/articles/${txt.id}`)).json();
  assert.equal(txtDetail.format, 'text');
  const jsonArticle = list.articles.find(item => item.title === 'Articolo JSON');
  assert.equal(jsonArticle.publishedAt, '2026-11-01T00:00:00.000Z');
  fs.unlinkSync(jsonFile);
  assert.equal((await (await request('/api/articles')).json()).total, 1);
  assert.equal((await request(`/api/articles/${jsonArticle.id}`)).status, 404);
});

test('paginazione valida anche con parametri non validi e oltre ultima pagina', async t => {
  const { request, article } = await fixture(t);
  article('uno.md', '# Un articolo\nTesto.');
  for (const query of ['pageSize=11', 'pageSize=-10', 'pageSize=Infinity', 'pageSize=101']) {
    assert.equal((await (await request(`/api/articles?${query}`)).json()).pageSize, 10);
  }
  assert.equal((await (await request('/api/articles?page=999999')).json()).page, 1);
  assert.equal((await (await request('/api/articles?page=-3')).json()).page, 1);
});

test('contatore condiviso persistente: una visita per cookie sessione e firme verificate', async t => {
  const { request, rootDir } = await fixture(t);
  assert.equal((await (await request('/api/stats')).json()).visits, 0);
  const first = await request('/api/visit', { method: 'POST' });
  const cookie = first.headers.get('set-cookie').split(';')[0];
  assert.match(first.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  assert.equal((await first.json()).visits, 1);
  const second = await request('/api/visit', { method: 'POST', headers: { cookie } });
  assert.equal((await second.json()).visits, 1);
  assert.equal(second.headers.get('set-cookie'), null);
  const third = await request('/api/visit', { method: 'POST' });
  assert.equal((await third.json()).visits, 2);
  const tampered = cookie.replace(/.$/, cookie.endsWith('x') ? 'y' : 'x');
  assert.equal((await (await request('/api/visit', { method: 'POST', headers: { cookie: tampered } })).json()).visits, 3);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'visits.json'), 'utf8')), { visits: 3 });
  // A second instance of the factory must read the saved counter and same signing secret.
  const restarted = createServer({ rootDir });
  restarted.listen(0, '127.0.0.1');
  await once(restarted, 'listening');
  try {
    const response = await fetch(`http://127.0.0.1:${restarted.address().port}/api/visit`, { method: 'POST', headers: { cookie } });
    assert.equal((await response.json()).visits, 3);
  } finally {
    restarted.closeAllConnections();
    await new Promise(resolve => restarted.close(resolve));
  }
});

test('contatti: validazione, salvataggio locale, honeypot e limite invii', async t => {
  const { request, rootDir } = await fixture(t);
  const post = body => request('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const valid = { name: 'Giovanni Masi', email: 'giovanni@example.com', message: 'Vorrei sapere di più sul vostro progetto.', privacy: true, website: '' };
  assert.equal((await post({ ...valid, privacy: false })).status, 400);
  assert.equal((await post({ ...valid, email: 'non-email' })).status, 400);
  assert.equal((await post({ ...valid, message: 'ciao' })).status, 400);
  assert.equal((await post({ ...valid, website: 'spam.example.com' })).status, 200);
  assert.equal(fs.existsSync(path.join(rootDir, 'data', 'messages.ndjson')), false);
  const good = await post(valid);
  assert.equal(good.status, 200);
  assert.equal((await good.json()).ok, true);
  const stored = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'messages.ndjson'), 'utf8').trim());
  assert.equal(stored.email, valid.email);
  assert.equal(stored.message, valid.message);
  for (let i = 1; i < 5; i++) assert.equal((await post(valid)).status, 200);
  assert.equal((await post(valid)).status, 429);
  assert.equal(fs.readFileSync(path.join(rootDir, 'data', 'messages.ndjson'), 'utf8').trim().split('\n').length, 5);
});

test('nessun file privato esposto, traversal/symlink bloccati e fallback articolo', async t => {
  const { request, rootDir } = await fixture(t);
  fs.writeFileSync(path.join(rootDir, 'secret.txt'), 'SEGRETO');
  fs.symlinkSync(path.join(rootDir, 'secret.txt'), path.join(rootDir, 'public', 'escape.txt'));
  for (const url of ['/server.mjs', '/package.json', '/data/visits.json', '/.git/config', '/%2e%2e%2fsecret.txt', '/escape.txt']) {
    const response = await request(url);
    assert.equal(response.status, 404, url);
    assert.doesNotMatch(await response.text(), /SEGRETO/);
  }
  assert.equal((await request('/articoli/un-articolo')).status, 200);
  const js = await request('/app.js');
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /javascript/);
  assert.match(js.headers.get('content-security-policy'), /script-src 'self'/);
  const head = await request('/', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('mutazioni cross-site, richieste oversized e payload malformati rifiutati', async t => {
  const { request } = await fixture(t);
  assert.equal((await request('/api/visit', { method: 'POST', headers: { Origin: 'https://altro.example' } })).status, 403);
  assert.equal((await request('/api/visit', { method: 'POST', headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await request('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{nonjson' })).status, 400);
  assert.equal((await request('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'a'.repeat(40000) }) })).status, 413);
  assert.equal((await request('/api/contact', { method: 'POST', body: 'nome=Giovanni' })).status, 415);
});
