import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const bounded = (value, max = 200) => String(value ?? '').trim().slice(0, max);

function plainText(value) {
  return String(value).replace(/```[\s\S]*?```/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/<[^>]*>/g, '')
    .replace(/[#*_>`~|]/g, '').replace(/\s+/g, ' ').trim();
}

function parseMarkdown(source) {
  let content = source.replace(/^\uFEFF/, '');
  const metadata = {};
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (frontmatter) {
    for (const line of frontmatter[1].split(/\r?\n/)) {
      const pair = line.match(/^([a-zA-Z][\w-]*):\s*(.*)$/);
      if (!pair) continue;
      const key = pair[1];
      const value = pair[2].trim();
      metadata[key] = value.replace(/^(?:"(.*)"|'(.*)')$/, (_, double, single) => double ?? single);
    }
    content = content.slice(frontmatter[0].length);
  }
  return { metadata, content, format: 'markdown' };
}

function parseTags(value) {
  const values = Array.isArray(value) ? value : String(value ?? '').replace(/^\[|\]$/g, '').split(',');
  return [...new Set(values.map(tag => bounded(String(tag).trim().replace(/^["']|["']$/g, ''), 60)).filter(Boolean))].slice(0, 20);
}

function readArticles(directory, indexFile) {
  if (!fs.existsSync(directory)) return [];
  const articles = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name.startsWith('.')) continue;
    const extension = path.extname(entry.name).toLowerCase();
    if (!['.md', '.txt', '.json'].includes(extension)) continue;
    const filename = path.join(directory, entry.name);
    let stat, source;
    try {
      stat = fs.statSync(filename);
      if (stat.size > 2 * 1024 * 1024) continue;
      source = fs.readFileSync(filename, 'utf8');
    } catch (error) {
      // A file can be removed or still being copied between directory discovery and reading.
      // Ignore that entry; the next request discovers the completed folder again.
      if (!['ENOENT', 'EBUSY', 'EISDIR'].includes(error.code)) console.warn(`Articolo non leggibile: ${entry.name} (${error.code || 'errore'})`);
      continue;
    }
    let parsed;
    if (extension === '.json') {
      try {
        const document = JSON.parse(source);
        if (!document || Array.isArray(document) || typeof document !== 'object' || typeof document.content !== 'string') continue;
        parsed = { metadata: document, content: document.content, format: document.format === 'text' ? 'text' : 'markdown' };
      } catch { continue; }
    } else {
      parsed = parseMarkdown(source);
      parsed.format = extension === '.txt' ? 'text' : 'markdown';
    }
    const { metadata, content, format } = parsed;
    const basename = path.basename(entry.name, extension);
    const slug = normalize(basename).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90) || 'articolo';
    const hash = crypto.createHash('sha256').update(entry.name).digest('hex').slice(0, 8);
    const title = bounded(metadata.title || content.match(/^#\s+(.+)$/m)?.[1] || basename.replace(/[-_]/g, ' '), 200);
    const text = plainText(content);
    const suppliedDate = metadata.date ?? metadata.publishedAt;
    const parsedDate = suppliedDate ? new Date(String(suppliedDate)) : null;
    articles.push({
      id: `${slug}-${hash}`, title,
      excerpt: bounded(metadata.excerpt || text.replace(new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`), ''), 220),
      category: bounded(metadata.category || 'Approfondimenti', 80),
      topic: bounded(metadata.topic || 'Innovazione', 80),
      tags: parseTags(metadata.tags),
      publishedAt: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : stat.mtime.toISOString(),
      readTime: Math.max(1, Math.ceil(text.split(/\s+/).filter(Boolean).length / 200)),
      cover: bounded(metadata.cover || 'orbit', 200),
      color: /^#[a-f0-9]{6}$/i.test(metadata.color || '') ? metadata.color : '#aeff73',
      content, format, _mtime: stat.mtimeMs, _birthtime: stat.birthtimeMs, _filename: entry.name,
    });
  }
  const existingIndex = fs.existsSync(indexFile);
  const index = existingIndex ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : { version: 1, nextOrder: 1, files: {} };
  if (index.version !== 1 || !Number.isSafeInteger(index.nextOrder) || index.nextOrder < 1 || !index.files || typeof index.files !== 'object' || Array.isArray(index.files)) {
    throw new Error('Indice articoli non valido in data/articles-index.json.');
  }
  const files = {};
  const fresh = [];
  for (const article of articles) {
    const previous = index.files[article._filename];
    if (previous && Number.isSafeInteger(previous.order) && previous.order > 0 &&
        !(previous.birthtime > 0 && article._birthtime > 0 && previous.birthtime !== article._birthtime)) {
      article._order = previous.order;
      files[article._filename] = previous;
    } else fresh.push(article);
  }
  // The initial import uses modification times. Later insertions are remembered independently
  // from file timestamps, including copies which retain an old modification date.
  fresh.sort((a, b) => {
    const timeA = existingIndex ? Math.max(a._birthtime, a._mtime) : a._mtime;
    const timeB = existingIndex ? Math.max(b._birthtime, b._mtime) : b._mtime;
    return timeA - timeB || a._filename.localeCompare(b._filename, 'it');
  });
  for (const article of fresh) {
    article._order = index.nextOrder++;
    files[article._filename] = { order: article._order, birthtime: article._birthtime };
  }
  if (!existingIndex || fresh.length || Object.keys(files).length !== Object.keys(index.files).length) {
    atomicJSON(indexFile, { version: 1, nextOrder: index.nextOrder, files });
  }
  return articles.sort((a, b) => b._order - a._order || b._filename.localeCompare(a._filename, 'it'));
}

function publicArticle(article, full = false) {
  const { _mtime, _birthtime, _order, _filename, content, format, ...summary } = article;
  return full ? { ...summary, content, format } : summary;
}

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

async function readBody(request) {
  if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    throw httpError(415, 'Invia i dati nel formato JSON.');
  }
  let length = 0;
  const chunks = [];
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 32 * 1024) throw httpError(413, 'Messaggio troppo lungo.');
    chunks.push(chunk);
  }
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw httpError(400, 'Dati JSON non validi.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw httpError(400, 'Dati non validi.');
  return value;
}

function atomicJSON(filename, value) {
  const temporary = `${filename}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, filename);
}

/** The server needs one process and a writable dataDir. Exposed options also support isolated tests. */
export function createServer(options = {}) {
  const rootDir = options.rootDir ?? projectDir;
  const publicDir = path.resolve(options.publicDir ?? path.join(rootDir, 'public'));
  const articlesDir = path.resolve(options.articlesDir ?? path.join(rootDir, 'fileArticoli'));
  const dataDir = path.resolve(options.dataDir ?? path.join(rootDir, 'data'));
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const secretFile = path.join(dataDir, 'session-secret');
  if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
  const secret = fs.readFileSync(secretFile, 'utf8').trim();
  if (secret.length < 32) throw new Error('Segreto sessione non valido in data/session-secret.');
  const statsFile = path.join(dataDir, 'visits.json');
  if (!fs.existsSync(statsFile)) atomicJSON(statsFile, { visits: 0 });
  const readStats = () => {
    const stats = JSON.parse(fs.readFileSync(statsFile, 'utf8'));
    if (!Number.isSafeInteger(stats.visits) || stats.visits < 0) throw new Error('Contatore visite non valido.');
    return { visits: stats.visits };
  };
  readStats();
  const articleIndexFile = path.join(dataDir, 'articles-index.json');
  // Establish the baseline now, so additions before the first HTTP request are still new.
  readArticles(articlesDir, articleIndexFile);
  const sign = id => crypto.createHmac('sha256', secret).update(id).digest('base64url');
  function validSession(value) {
    if (!value) return false;
    const [id, signature, extra] = value.split('.');
    if (extra || !/^[a-f0-9-]{36}$/.test(id || '') || !/^[\w-]{43}$/.test(signature || '')) return false;
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(sign(id)));
  }
  const contactAttempts = new Map();

  return http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    try {
      const url = new URL(request.url, 'http://localhost');
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); }
      catch { throw httpError(400, 'Indirizzo non valido.'); }
      if (pathname.includes('\0') || pathname.includes('\\')) throw httpError(400, 'Indirizzo non valido.');

      if (request.method === 'POST') {
        if (request.headers['sec-fetch-site'] === 'cross-site') throw httpError(403, 'Richiesta non consentita.');
        if (request.headers.origin) {
          let origin;
          try { origin = new URL(request.headers.origin); } catch { throw httpError(403, 'Origine non valida.'); }
          if (origin.host !== request.headers.host) throw httpError(403, 'Origine non consentita.');
        }
      }

      if (pathname === '/api/articles' && request.method === 'GET') {
        const all = readArticles(articlesDir, articleIndexFile);
        const categories = [...new Set(all.map(article => article.category))].sort((a, b) => a.localeCompare(b, 'it'));
        const topics = [...new Set(all.map(article => article.topic))].sort((a, b) => a.localeCompare(b, 'it'));
        const query = normalize(bounded(url.searchParams.get('q'), 300)).split(/\s+/).filter(Boolean);
        const category = normalize(url.searchParams.get('category'));
        const topic = normalize(url.searchParams.get('topic'));
        const filtered = all.filter(article => {
          if (category && normalize(article.category) !== category) return false;
          if (topic && normalize(article.topic) !== topic) return false;
          const haystack = normalize([article.title, article.excerpt, article.category, article.topic, ...article.tags, article.content].join(' '));
          return query.every(term => haystack.includes(term));
        });
        const size = Number(url.searchParams.get('pageSize') || 10);
        const pageSize = Number.isInteger(size) && size >= 10 && size <= 100 && size % 10 === 0 ? size : 10;
        const totalPages = Math.ceil(filtered.length / pageSize);
        const requestedPage = Number(url.searchParams.get('page') || 1);
        const page = Math.min(Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1), Math.max(1, totalPages));
        return json(response, 200, {
          articles: filtered.slice((page - 1) * pageSize, page * pageSize).map(article => publicArticle(article)),
          total: filtered.length, page, pageSize, totalPages, categories, topics,
        });
      }
      if (pathname.startsWith('/api/articles/') && request.method === 'GET') {
        const id = pathname.slice('/api/articles/'.length);
        const article = readArticles(articlesDir, articleIndexFile).find(candidate => candidate.id === id);
        if (!article) throw httpError(404, 'Articolo non trovato.');
        return json(response, 200, publicArticle(article, true));
      }
      if (pathname === '/api/stats' && request.method === 'GET') return json(response, 200, readStats());
      if (pathname === '/api/visit' && request.method === 'POST') {
        const cookie = String(request.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith('sirius_session='))?.slice('sirius_session='.length);
        let stats = readStats();
        if (!validSession(cookie)) {
          const id = crypto.randomUUID();
          response.setHeader('Set-Cookie', `sirius_session=${id}.${sign(id)}; Path=/; HttpOnly; SameSite=Lax${options.secureCookies || process.env.COOKIE_SECURE === '1' ? '; Secure' : ''}`);
          stats = { visits: stats.visits + 1 };
          atomicJSON(statsFile, stats);
        }
        return json(response, 200, stats);
      }
      if (pathname === '/api/contact' && request.method === 'POST') {
        const body = await readBody(request);
        if (body.website) return json(response, 200, { ok: true });
        if (typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.trim().length > 100 ||
            typeof body.email !== 'string' || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) ||
            typeof body.message !== 'string' || body.message.trim().length < 10 || body.message.trim().length > 5000 || body.privacy !== true) {
          throw httpError(400, 'Controlla nome, email, messaggio (10–5000 caratteri) e consenso privacy.');
        }
        const now = Date.now();
        for (const [key, value] of contactAttempts) if (value.reset <= now) contactAttempts.delete(key);
        const address = request.socket.remoteAddress || 'unknown';
        const attempts = contactAttempts.get(address) ?? { count: 0, reset: now + 60 * 60 * 1000 };
        if (attempts.count >= 5) { response.setHeader('Retry-After', String(Math.ceil((attempts.reset - now) / 1000))); throw httpError(429, 'Hai inviato diversi messaggi. Riprova tra un’ora.'); }
        fs.appendFileSync(path.join(dataDir, 'messages.ndjson'), `${JSON.stringify({ createdAt: new Date().toISOString(), name: body.name.trim(), email: body.email.trim(), message: body.message.trim(), privacy: true })}\n`, { mode: 0o600 });
        attempts.count++;
        contactAttempts.set(address, attempts);
        return json(response, 200, { ok: true });
      }
      if (pathname.startsWith('/api/')) throw httpError(request.method === 'GET' || request.method === 'POST' ? 404 : 405, 'Endpoint non disponibile.');
      if (!['GET', 'HEAD'].includes(request.method)) { response.setHeader('Allow', 'GET, HEAD'); throw httpError(405, 'Metodo non consentito.'); }
      const appRoute = pathname === '/' || pathname === '/articoli' || pathname === '/privacy' || /^\/articoli\/[^/]+\/?$/.test(pathname);
      const staticPath = appRoute ? 'index.html' : pathname.replace(/^\/+/, '');
      if (staticPath.split('/').some(part => part.startsWith('.'))) throw httpError(404, 'File non trovato.');
      const filename = path.resolve(publicDir, staticPath);
      if (!filename.startsWith(publicDir + path.sep)) throw httpError(404, 'File non trovato.');
      let actual;
      try { actual = fs.realpathSync(filename); } catch { throw httpError(404, 'File non trovato.'); }
      const publicReal = fs.realpathSync(publicDir);
      if (!actual.startsWith(publicReal + path.sep) || !fs.statSync(actual).isFile()) throw httpError(404, 'File non trovato.');
      response.writeHead(200, {
        'Content-Type': MIME[path.extname(filename).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': 'no-cache', 'Content-Length': fs.statSync(actual).size,
      });
      if (request.method === 'HEAD') return response.end();
      fs.createReadStream(actual).on('error', () => response.destroy()).pipe(response);
    } catch (error) {
      if (response.headersSent) return response.destroy();
      if (!error.status) console.error('Errore server:', error.message);
      json(response, error.status || 500, { error: error.status ? error.message : 'Operazione non riuscita. Riprova tra poco.' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  const server = createServer();
  server.listen(port, host, () => console.log(`Sirius avviato su http://${host}:${port} — Ctrl+C per arrestare.`));
  server.on('error', error => { console.error(`Impossibile avviare Sirius: ${error.message}`); process.exitCode = 1; });
}
