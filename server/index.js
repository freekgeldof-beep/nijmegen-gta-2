import http from 'node:http';
import { readFile, writeFile, mkdir, rename, copyFile, unlink } from 'node:fs/promises';
import { existsSync, createReadStream } from 'node:fs';
import { join, extname, resolve, sep } from 'node:path';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { buildWorld } from '../src/world.js';
import { createArena } from './arena.js';

const scrypt = promisify(scryptCallback);
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dataDir = process.env.GAME_DATA_DIR || join(root, 'server', 'data');
const dataFile = join(dataDir, 'accounts.json');
const port = Number(process.env.PORT || 5181);
const sessions = new Map(), attempts = new Map();
let accounts = [];
try { accounts = JSON.parse(await readFile(dataFile, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
let writeQueue = Promise.resolve();
function persist() {
  writeQueue = writeQueue.catch(() => {}).then(async () => {
    await mkdir(dataDir, { recursive: true });
    const tmp = join(dataDir, `accounts-${process.pid}.tmp`);
    await writeFile(tmp, JSON.stringify(accounts), { mode: 0o600 });
    try { await rename(tmp, dataFile); }
    catch (e) {
      if (process.platform !== 'win32' || !['EPERM', 'EEXIST'].includes(e.code)) throw e;
      await copyFile(tmp, dataFile);
      await unlink(tmp);
    }
  });
  return writeQueue;
}
const city = JSON.parse(await readFile(join(root, 'public', 'city.json'), 'utf8'));
if (!city.configured) throw new Error('Vul public/city.json in en voer npm run import:city uit voordat je de arena start.');
const raw = {};
for (const name of ['osm-data', 'green-data', 'extra-data', 'landmarks', 'rails']) raw[name] = JSON.parse(await readFile(join(root, 'public', city.dataPath || 'data', `${name}.json`), 'utf8'));
const world = buildWorld({ osm: raw['osm-data'], green: raw['green-data'], extra: raw['extra-data'], landmarks: raw.landmarks, rails: raw.rails, city });
const arena = createArena(world, persist);
const tick = setInterval(() => arena.tick(1 / 30), 1000 / 30);
const broadcast = setInterval(() => {
  for (const p of arena.players.values()) if (p.socket.readyState === 1 && p.socket.bufferedAmount < 65536) p.socket.send(JSON.stringify(arena.snapshot(p)));
}, 100);
const flush = setInterval(() => { persist().catch(console.error); }, 30000);
for (const timer of [tick, broadcast, flush]) timer.unref();

function send(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(JSON.stringify(data));
}
function originOkay(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return url.host === req.headers.host || (process.env.NODE_ENV !== 'production' &&
      ['localhost:5180', '127.0.0.1:5180'].includes(url.host));
  } catch { return false; }
}
function accountFor(req) {
  const token = /(?:^|;\s*)game_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
  const record = token && sessions.get(token);
  if (!record) return null;
  if (record.expires < Date.now()) { sessions.delete(token); return null; }
  return accounts.find(a => a.id === record.id) || null;
}
function publicAccount(a) { return { id: a.id, username: a.username, avatar: a.avatar, country: a.country, stats: a.stats }; }
function limit(req) {
  const key = req.socket.remoteAddress || 'unknown', t = Date.now();
  const a = attempts.get(key) || { count: 0, until: t + 60000 };
  if (t > a.until) { a.count = 0; a.until = t + 60000; }
  a.count++; attempts.set(key, a); return a.count <= 20;
}
async function body(req) {
  const parts = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 4096) throw new Error('Verzoek te groot.'); parts.push(chunk); }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
function cookie(token, req) {
  const secure = process.env.NODE_ENV === 'production' || req.socket.encrypted;
  return `game_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${secure ? '; Secure' : ''}`;
}
async function route(req, res) {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/api/city' && req.method === 'GET') return send(res, 200, {id:city.id,name:city.name,mapRevision:city.mapRevision});
  if (path.startsWith('/api/')) {
    if (!originOkay(req)) return send(res, 403, { error: 'Ongeldige herkomst.' });
    if (path === '/api/me' && req.method === 'GET') {
      const a = accountFor(req); return send(res, 200, { account: a ? publicAccount(a) : null, online: arena.players.size });
    }
    if (path === '/api/logout' && req.method === 'POST') {
      const token = /game_session=([a-f0-9]{64})/.exec(req.headers.cookie || '')?.[1];
      if (token) sessions.delete(token);
      return send(res, 200, { ok: true }, { 'Set-Cookie': 'game_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
    }
    if ((path === '/api/register' || path === '/api/login') && req.method === 'POST') {
      if (!limit(req)) return send(res, 429, { error: 'Probeer later opnieuw.' });
      let data; try { data = await body(req); } catch { return send(res, 400, { error: 'Ongeldige invoer.' }); }
      const username = String(data.username || '').trim(), password = String(data.password || '');
      if (!/^[\p{L}\p{N}_-]{3,20}$/u.test(username) || password.length < 10 || password.length > 128)
        return send(res, 400, { error: 'Naam: 3–20 tekens. Wachtwoord: minimaal 10 tekens.' });
      let a = accounts.find(x => x.username.toLowerCase() === username.toLowerCase());
      if (path === '/api/register') {
        if (a) return send(res, 409, { error: 'Naam is al in gebruik.' });
        const salt = randomBytes(16).toString('hex');
        a = { id: randomBytes(12).toString('hex'), username, salt,
          hash: (await scrypt(password, salt, 64)).toString('hex'),
          avatar: ['driver', 'racer', 'fox', 'robot'].includes(data.avatar) ? data.avatar : 'driver',
          country: /^[A-Z]{2}$/.test(data.country) ? data.country : 'NL',
          stats: { kills: 0, deaths: 0, casesDelivered: 0, distanceKm: 0, secondsPlayed: 0 } };
        if (accounts.some(x => x.username.toLowerCase() === username.toLowerCase())) return send(res, 409, { error: 'Naam is al in gebruik.' });
        accounts.push(a); await persist();
      } else {
        const hash = await scrypt(password, a?.salt || 'invalid', 64);
        if (!a || !timingSafeEqual(hash, Buffer.from(a.hash, 'hex'))) return send(res, 401, { error: 'Naam of wachtwoord klopt niet.' });
      }
      const token = randomBytes(32).toString('hex');
      sessions.set(token, { id: a.id, expires: Date.now() + 604800000 });
      return send(res, 200, { account: publicAccount(a) }, { 'Set-Cookie': cookie(token, req) });
    }
    return send(res, 404, { error: 'Niet gevonden.' });
  }
  if (process.env.NODE_ENV !== 'production') return send(res, 404, { error: 'Gebruik de Vite-server op poort 5180.' });
  const dist = join(root, 'dist');
  let decoded; try { decoded = decodeURIComponent(path); } catch { return send(res, 400, { error: 'Ongeldig pad.' }); }
  const target = resolve(dist, '.' + (decoded === '/' ? '/index.html' : decoded));
  if (!target.startsWith(dist + sep) || !existsSync(target)) return send(res, 404, { error: 'Niet gevonden.' });
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
  res.writeHead(200, { 'Content-Type': types[extname(target)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
  createReadStream(target).pipe(res);
}
const server = http.createServer((req, res) => route(req, res).catch(e => { console.error(e); if (!res.headersSent) send(res, 500, { error: 'Serverfout.' }); }));
const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url, 'http://localhost').pathname !== '/ws' || !originOkay(req) || !accountFor(req)) { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});
wss.on('connection', (ws, req) => {
  const account = accountFor(req);
  let p; try { p = arena.add(account, ws); } catch (e) { ws.close(1013, e.message); return; }
  let messages = 0, windowStart = Date.now();
  ws.on('message', raw => {
    if (Date.now() - windowStart > 1000) { windowStart = Date.now(); messages = 0; }
    if (++messages > 45) { ws.close(1008, 'Too many messages'); return; }
    try { arena.input(p.id, JSON.parse(raw.toString())); } catch { ws.close(1003, 'Invalid message'); }
  });
  ws.on('close', () => { if (arena.players.get(p.id) === p) arena.remove(p.id); });
  ws.send(JSON.stringify({ type: 'welcome', id: p.id }));
});
server.listen(port, () => console.log(`${city.name} online: http://localhost:${port}`));
