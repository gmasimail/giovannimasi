import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { createServer } from '../server.mjs';

async function fixture(t, options = {}) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sirius-test-'));
  fs.mkdirSync(path.join(rootDir, 'public'));
  fs.mkdirSync(path.join(rootDir, 'fileArticoli'));
  fs.writeFileSync(path.join(rootDir, 'public', 'index.html'), '<h1>Sirius test</h1>');
  for (const page of ['azienda', 'soluzioni', 'articoli', 'contatti']) {
    fs.writeFileSync(path.join(rootDir, 'public', `${page}.html`), `<h1>Sirius ${page}</h1>`);
  }
  fs.writeFileSync(path.join(rootDir, 'public', 'app.js'), 'console.log("Sirius");');
  const server = createServer({ rootDir, ...options });
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

const privacyPost = statistics => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ statistics }) });
const cookieFrom = (response, name) => response.headers.getSetCookie().find(value => value.startsWith(`${name}=`))?.split(';')[0];
const privacyRecords = rootDir => fs.readFileSync(path.join(rootDir, 'data', 'privacy-events.ndjson'), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
const signedPreference = (rootDir, preference) => {
  const secret = fs.readFileSync(path.join(rootDir, 'data', 'session-secret'), 'utf8').trim();
  const payload = Buffer.from(JSON.stringify(preference)).toString('base64url');
  return `sirius_privacy=${payload}.${crypto.createHmac('sha256', secret).update(`privacy:${payload}`).digest('base64url')}`;
};

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

test('nessuna statistica o cookie di tracciamento prima della scelta, sessione legacy eliminata', async t => {
  const { request, rootDir } = await fixture(t);
  const initial = await request('/api/privacy');
  assert.deepEqual(await initial.json(), { version: '2026-11-04', statistics: null, expiresAt: null });
  assert.equal(initial.headers.get('set-cookie'), null);
  assert.equal((await request('/')).headers.get('set-cookie'), null);
  const stats = await request('/api/stats');
  assert.deepEqual(await stats.json(), { visits: 0 });
  assert.equal(stats.headers.get('set-cookie'), null);
  assert.equal(fs.existsSync(path.join(rootDir, 'data', 'privacy-events.ndjson')), false);
  assert.equal((await request('/api/visit', { method: 'POST' })).status, 403);
  const legacy = await request('/api/privacy', { headers: { cookie: 'sirius_session=legacy' } });
  assert.match(legacy.headers.get('set-cookie'), /^sirius_session=;.*Max-Age=0/);
  assert.equal((await (await request('/api/stats')).json()).visits, 0);
});

test('accettazione esplicita e prova minima persistenti, una visita per sessione con firma verificata', async t => {
  const { request, rootDir } = await fixture(t);
  const accepted = await request('/api/privacy', privacyPost('accepted'));
  assert.equal(accepted.status, 200);
  const preference = await accepted.json();
  assert.equal(preference.version, '2026-11-04');
  assert.equal(preference.statistics, 'accepted');
  const privacyCookie = cookieFrom(accepted, 'sirius_privacy');
  assert.ok(privacyCookie);
  assert.match(accepted.headers.get('set-cookie'), /HttpOnly; SameSite=Lax; Max-Age=\d+; Expires=/);
  assert.equal(cookieFrom(accepted, 'sirius_session'), undefined);
  const records = privacyRecords(rootDir);
  assert.equal(records.length, 1);
  assert.deepEqual(Object.keys(records[0]).sort(), ['choice', 'createdAt', 'expiresAt', 'receiptId', 'version']);
  assert.equal(records[0].choice, 'accepted');
  assert.equal(records[0].version, preference.version);
  assert.equal(records[0].expiresAt, preference.expiresAt);
  const decoded = JSON.parse(Buffer.from(privacyCookie.split('=')[1].split('.')[0], 'base64url').toString('utf8'));
  assert.deepEqual(decoded, records[0]);
  assert.deepEqual(await (await request('/api/privacy', { headers: { cookie: privacyCookie } })).json(), preference);
  assert.equal((await (await request('/api/stats')).json()).visits, 0);
  const first = await request('/api/visit', { method: 'POST', headers: { cookie: privacyCookie } });
  const cookie = cookieFrom(first, 'sirius_session');
  assert.match(first.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  assert.equal((await first.json()).visits, 1);
  const second = await request('/api/visit', { method: 'POST', headers: { cookie: `${privacyCookie}; ${cookie}` } });
  assert.equal((await second.json()).visits, 1);
  assert.equal(second.headers.get('set-cookie'), null);
  const third = await request('/api/visit', { method: 'POST', headers: { cookie: privacyCookie } });
  assert.equal((await third.json()).visits, 2);
  const tampered = cookie.replace(/.$/, cookie.endsWith('x') ? 'y' : 'x');
  assert.equal((await (await request('/api/visit', { method: 'POST', headers: { cookie: `${privacyCookie}; ${tampered}` } })).json()).visits, 3);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'visits.json'), 'utf8')), { visits: 3 });
  // A second instance of the factory must read the saved counter and same signing secret.
  const restarted = createServer({ rootDir });
  restarted.listen(0, '127.0.0.1');
  await once(restarted, 'listening');
  try {
    const response = await fetch(`http://127.0.0.1:${restarted.address().port}/api/visit`, { method: 'POST', headers: { cookie: `${privacyCookie}; ${cookie}` } });
    assert.equal((await response.json()).visits, 3);
    const restored = await fetch(`http://127.0.0.1:${restarted.address().port}/api/privacy`, { headers: { cookie: privacyCookie } });
    assert.deepEqual(await restored.json(), preference);
  } finally {
    restarted.closeAllConnections();
    await new Promise(resolve => restarted.close(resolve));
  }
});

test('rifiuto persistente e revoca eliminano la sessione, senza impedire sito o conteggio aggregato', async t => {
  const { request, rootDir } = await fixture(t);
  const accepted = await request('/api/privacy', privacyPost('accepted'));
  const acceptedCookie = cookieFrom(accepted, 'sirius_privacy');
  const visit = await request('/api/visit', { method: 'POST', headers: { cookie: acceptedCookie } });
  const sessionCookie = cookieFrom(visit, 'sirius_session');
  assert.equal((await visit.json()).visits, 1);
  const rejected = await request('/api/privacy', { ...privacyPost('rejected'), headers: { 'Content-Type': 'application/json', cookie: `${acceptedCookie}; ${sessionCookie}` } });
  const preference = await rejected.json();
  assert.equal(preference.statistics, 'rejected');
  const rejectedCookie = cookieFrom(rejected, 'sirius_privacy');
  assert.match(rejected.headers.getSetCookie().find(value => value.startsWith('sirius_session=')), /Max-Age=0/);
  const saved = await request('/api/privacy', { headers: { cookie: rejectedCookie } });
  assert.deepEqual(await saved.json(), preference);
  assert.equal(saved.headers.get('set-cookie'), null);
  const blocked = await request('/api/visit', { method: 'POST', headers: { cookie: `${rejectedCookie}; ${sessionCookie}` } });
  assert.equal(blocked.status, 403);
  assert.match(blocked.headers.get('set-cookie'), /^sirius_session=;.*Max-Age=0/);
  assert.equal((await request('/', { headers: { cookie: rejectedCookie } })).status, 200);
  assert.equal((await (await request('/api/stats')).json()).visits, 1);
  assert.deepEqual(privacyRecords(rootDir).map(record => record.choice), ['accepted', 'rejected']);
});

test('scelte manomesse, scadute, senza prova o con versione precedente non autorizzano statistiche; prove scadute rimosse', async t => {
  const { request, rootDir } = await fixture(t);
  const accepted = await request('/api/privacy', privacyPost('accepted'));
  const privacyCookie = cookieFrom(accepted, 'sirius_privacy');
  const active = privacyRecords(rootDir)[0];
  const visit = await request('/api/visit', { method: 'POST', headers: { cookie: privacyCookie } });
  const sessionCookie = cookieFrom(visit, 'sirius_session');
  const expired = { ...active, receiptId: crypto.randomUUID(), createdAt: '2020-08-31T12:00:00.000Z', expiresAt: '2021-02-28T12:00:00.000Z' };
  const obsolete = { ...active, receiptId: crypto.randomUUID(), version: '2020-01-01' };
  fs.appendFileSync(path.join(rootDir, 'data', 'privacy-events.ndjson'), `${JSON.stringify(expired)}\n${JSON.stringify(obsolete)}\n`);
  const absentProof = { ...active, receiptId: crypto.randomUUID() };
  const tampered = privacyCookie.replace(/.$/, privacyCookie.endsWith('x') ? 'y' : 'x');
  for (const cookie of [tampered, `${privacyCookie}.extra`, signedPreference(rootDir, expired), signedPreference(rootDir, obsolete), signedPreference(rootDir, absentProof)]) {
    const response = await request('/api/privacy', { headers: { cookie: `${cookie}; ${sessionCookie}` } });
    assert.deepEqual(await response.json(), { version: '2026-11-04', statistics: null, expiresAt: null });
    assert.match(response.headers.getSetCookie().find(value => value.startsWith('sirius_session=')), /Max-Age=0/);
    assert.equal((await request('/api/visit', { method: 'POST', headers: { cookie: `${cookie}; ${sessionCookie}` } })).status, 403);
  }
  assert.equal((await (await request('/api/stats')).json()).visits, 1);
  assert.deepEqual(privacyRecords(rootDir).map(record => record.receiptId), [active.receiptId, obsolete.receiptId]);
  fs.appendFileSync(path.join(rootDir, 'data', 'privacy-events.ndjson'), `${JSON.stringify(expired)}\n`);
  assert.equal((await request('/api/privacy', privacyPost('rejected'))).status, 200);
  assert.equal(privacyRecords(rootDir).some(record => record.receiptId === expired.receiptId), false);
});

test('preferenza tecnica Secure valida sei mesi di calendario, con fine mese corretto', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2028-08-31T12:34:56.000Z') });
  const { request } = await fixture(t, { secureCookies: true });
  const response = await request('/api/privacy', privacyPost('rejected'));
  assert.equal((await response.json()).expiresAt, '2029-02-28T12:34:56.000Z');
  assert.match(response.headers.getSetCookie().find(cookie => cookie.startsWith('sirius_privacy=')), /HttpOnly; SameSite=Lax; Secure; Max-Age=15638400; Expires=Wed, 28 Feb 2029 12:34:56 GMT/);
});

test('contatti: validazione, salvataggio locale, honeypot e limite invii', async t => {
  const { request, rootDir } = await fixture(t);
  const post = body => request('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const valid = { name: 'Giovanni Masi', email: 'giovanni@example.com', message: 'Vorrei sapere di più sul vostro progetto.', website: '' };
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
  assert.equal(stored.privacyNoticeVersion, '2026-11-04');
  assert.equal(Object.hasOwn(stored, 'privacy'), false);
  assert.equal((await post({ ...valid, privacy: false })).status, 200);
  assert.equal((await post({ ...valid, privacy: true })).status, 200);
  for (let i = 3; i < 5; i++) assert.equal((await post(valid)).status, 200);
  assert.equal((await post(valid)).status, 429);
  const messages = fs.readFileSync(path.join(rootDir, 'data', 'messages.ndjson'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.equal(messages.length, 5);
  assert.ok(messages.every(message => !Object.hasOwn(message, 'privacy') && message.privacyNoticeVersion === '2026-11-04'));
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
  assert.equal((await request('/api/privacy', { ...privacyPost('accepted'), headers: { 'Content-Type': 'application/json', Origin: 'https://altro.example' } })).status, 403);
  assert.equal((await request('/api/privacy', { ...privacyPost('accepted'), headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  for (const statistics of [undefined, null, true, false, 'accept', '']) {
    assert.equal((await request('/api/privacy', privacyPost(statistics))).status, 400);
  }
  assert.equal((await request('/api/privacy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{nonjson' })).status, 400);
  assert.equal((await request('/api/privacy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ statistics: 'a'.repeat(40000) }) })).status, 413);
  assert.equal((await request('/api/privacy', { method: 'POST', body: 'statistics=accepted' })).status, 415);
  assert.equal((await request('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{nonjson' })).status, 400);
  assert.equal((await request('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'a'.repeat(40000) }) })).status, 413);
  assert.equal((await request('/api/contact', { method: 'POST', body: 'nome=Giovanni' })).status, 415);
});

test('pagine aziendali distinte, alias e link diretti agli articoli', async t => {
  const { request } = await fixture(t);
  assert.equal(await (await request('/')).text(), '<h1>Sirius test</h1>');
  for (const page of ['azienda', 'soluzioni', 'articoli', 'contatti']) {
    for (const url of [`/${page}`, `/${page}/`, `/${page}.html`]) {
      const response = await request(url);
      assert.equal(response.status, 200, url);
      assert.equal(await response.text(), `<h1>Sirius ${page}</h1>`, url);
    }
  }
  assert.equal(await (await request('/articoli/un-articolo')).text(), '<h1>Sirius articoli</h1>');
  assert.equal((await request('/pagina-inesistente')).status, 404);
});
