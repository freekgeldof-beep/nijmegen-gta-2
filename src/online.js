import { Container, Graphics, Sprite } from 'pixi.js';
import { makeVehicleTextureCache } from './renderEntities.js';

const $ = id => document.getElementById(id);
const ICON = { driver: '🚘', racer: '🏁', fox: '🦊', robot: '🤖' };
const flag = code => /^[A-Z]{2}$/.test(code) ? [...code].map(c => String.fromCodePoint(127397 + c.charCodeAt(0))).join('') : '🏳️';

export function createOnline(sim, hud, worldContainer, audio, city = {}) {
  const layer = new Container(); worldContainer.addChild(layer);
  const pickupGraphics = new Graphics(), effectsGraphics = new Graphics(), actorLayer = new Container();
  layer.addChild(pickupGraphics, effectsGraphics, actorLayer);
  const vehicleTex = makeVehicleTextureCache();
  const actors = new Map(), labels = new Map();
  const positions = new Map();
  let socket = null, snapshot = null, account = null, active = false, held = {}, inputTimer = 0;
  let fromPositions = new Map(), receivedAt = 0, pickupSignature = '';
  let previousHealth = null;
  let previousShield = 0;
  let lastCaseRevision = 0;
  let heardExplosions = new Set();
  const panel = $('onlinePanel'), status = $('onlineStatus');
  const error = message => { status.textContent = message; status.style.color = '#ff8b8b'; };
  const inform = message => { status.textContent = message; status.style.color = '#9de5db'; };
  function setActive(value) {
    const wasActive = active;
    active = value; $('mission').hidden = value; $('police').hidden = value;
    $('onlineHud').hidden = !value; $('casePanel').hidden = !value;
    $('onlineButton').textContent = value ? 'Verlaat online' : 'Online jacht';
    if (!value) { snapshot = null; previousHealth = null; previousShield = 0; lastCaseRevision = 0; heardExplosions.clear(); audio.stopVehicleSounds(); for (const item of actors.values()) item.destroy({ children: true }); actors.clear(); positions.clear(); fromPositions.clear(); pickupGraphics.clear(); effectsGraphics.clear(); pickupSignature = ''; for (const item of labels.values()) item.remove(); labels.clear(); if (wasActive) sim.resetGame(); }
  }
  async function api(path, data) {
    const res = await fetch(`/api/${path}`, { method: data ? 'POST' : 'GET', credentials: 'same-origin',
      headers: data ? { 'Content-Type': 'application/json' } : {}, body: data ? JSON.stringify(data) : undefined });
    const json = await res.json(); if (!res.ok) throw new Error(json.error || 'Server niet beschikbaar.'); return json;
  }
  async function profile() {
    const result = await api('me'); account = result.account;
    $('accountArea').hidden = !!account; $('profileArea').hidden = !account;
    if (account) {
      $('profileName').textContent = `${ICON[account.avatar]} ${account.username} · ${account.country}`;
      stats(account.stats);
    }
    inform(`${result.online} speler${result.online === 1 ? '' : 's'} online`);
  }
  function stats(s) {
    $('profileStats').textContent = `${s.kills} kills · ${s.deaths} keer dood · ${s.casesDelivered || 0} koffers bezorgd · ${s.distanceKm.toFixed(2)} km · ${(s.secondsPlayed / 3600).toFixed(2)} uur`;
  }
  $('onlineButton').addEventListener('click', async () => {
    if (active) { socket?.close(); setActive(false); hud.notify('TERUG IN SOLO'); return; }
    panel.hidden = false; try { await profile(); } catch { error('Online server niet bereikbaar. Start ook de online server.'); }
  });
  $('onlineClose').addEventListener('click', () => { panel.hidden = true; });
  $('accountForm').addEventListener('submit', async e => {
    e.preventDefault(); const form = new FormData(e.currentTarget);
    try { await api($('registerMode').checked ? 'register' : 'login', Object.fromEntries(form)); await profile(); }
    catch (err) { error(err.message); }
  });
  $('logoutButton').addEventListener('click', async () => { await api('logout', {}); account = null; await profile(); });
  $('joinButton').addEventListener('click', () => {
    if (!account) return; panel.hidden = true;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${location.host}/ws`);
    socket.onopen = () => { setActive(true); sim.clearKeys(); hud.notify('ONLINE JACHT · VIND KISTJES'); };
    socket.onmessage = e => { const data = JSON.parse(e.data); if (data.type === 'state') {
      fromPositions = new Map(positions); receivedAt = performance.now(); snapshot = data;
    } };
    socket.onclose = () => { setActive(false); hud.notify('ONLINE VERBINDING VERBROKEN'); };
    socket.onerror = () => error('Verbinding mislukt.');
  });
  function send(data) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data)); }
  function sendInput() {
    send({ type: 'input', up: !!held.arrowup, down: !!held.arrowdown, left: !!held.arrowleft,
      right: !!held.arrowright, lock: !!held.e });
  }
  function key(key, down, repeat = false) {
    if (!active) return false;
    const name = key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'e', 'w', 'q', 'r', '1', '2', '3', '4'].includes(name)) {
      const changed = held[name] !== down;
      held[name] = down;
      if (down && !repeat && name === 'w') { send({ type: 'shoot' }); if (snapshot?.players.find(p => p.id === snapshot.self)?.ammo > 0) audio.effect('shot'); }
      if (down && !repeat && name === 'q') send({ type: 'mine' });
      if (down && !repeat && name === 'r') send({ type: 'cycle' });
      if (down && !repeat && /^[1-4]$/.test(name)) send({ type: 'car', vehicle: ['car', 'sport', 'cabrio', 'van'][Number(name) - 1] });
      if (changed && ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'e'].includes(name)) { sendInput(); inputTimer = 0; }
    }
    return true;
  }
  function render(dt) {
    if (!active || !snapshot) return;
    inputTimer += dt;
    if (inputTimer >= .2) { inputTimer = 0; sendInput(); }
    const self = snapshot.players.find(p => p.id === snapshot.self);
    if (!self) return;
    if (previousHealth !== null && self.health < previousHealth && !self.dead) audio.effect('collision');
    previousHealth = self.health;
    if ((self.shield || 0) > previousShield + 1) { audio.effect('shirt'); hud.notify((city.club?.shirtLabel || 'CLUBSHIRT') + ' · 40 SECONDEN ONSCHENDBAAR'); }
    previousShield = self.shield || 0;
    const visibleExplosions = new Set(snapshot.explosions.map(e => `${Math.round(e.x * 2)},${Math.round(e.y * 2)}`));
    for (const key of visibleExplosions) if (!heardExplosions.has(key)) audio.effect('explosion');
    heardExplosions = visibleExplosions;
    const alpha = Math.max(0, Math.min(1, (performance.now() - receivedAt) / 100));
    for (const p of snapshot.players) {
      const from = fromPositions.get(p.id) || p;
      const turn = Math.atan2(Math.sin(p.angle - from.angle), Math.cos(p.angle - from.angle));
      positions.set(p.id, { x: from.x + (p.x - from.x) * alpha,
        y: from.y + (p.y - from.y) * alpha, angle: from.angle + turn * alpha });
    }
    const selfPosition = positions.get(self.id);
    Object.assign(sim.state.player, { x: selfPosition.x, y: selfPosition.y, angle: selfPosition.angle, speed: self.speed,
      vtype: self.vtype, mode: 'car', health: self.health, shirtImmuneT: self.shield || 0, wasted: self.dead, wanted: false });
    sim.state.ammo = self.ammo; sim.state.mineCount = self.mines;
    $('rocketCount').textContent = self.rockets;
    $('cloakTime').textContent = self.cloak ? `${self.cloak}s ONZICHTBAAR` : '';
    $('lockState').textContent = self.lock ? `LOCK ${Math.round(self.lock.progress * 100)}% · ${snapshot.players.find(p => p.id === self.lock.id)?.username || ''}` : 'Houd E vast om te locken · R wisselt doel · laat E los om te vuren';
    $('onlineScore').textContent = `${self.stats.kills} KILLS · ${self.stats.deaths} DOOD · ${self.stats.casesDelivered || 0} KOFFERS · ${self.stats.distanceKm.toFixed(2)} KM · ${(self.stats.secondsPlayed / 3600).toFixed(2)} UUR`;
    const job = snapshot.case;
    $('casePanel').hidden = !job || job.phase === 'waiting';
    if (job && job.phase !== 'waiting') {
      $('caseClock').textContent = `${Math.floor(job.remaining / 60)}:${String(job.remaining % 60).padStart(2, '0')}`;
      if (job.revision !== lastCaseRevision) {
        lastCaseRevision = job.revision;
        if (job.message) { hud.notify(job.message.toUpperCase()); audio.effect('case'); }
      }
      if (job.phase === 'ground') {
        $('caseTitle').textContent = 'Pak de koffer';
        $('caseDetail').textContent = `Hij ligt bij ${job.startName}. Bezorg hem bij ${job.target.name}.`;
        $('caseDistance').textContent = `${Math.round(Math.hypot(selfPosition.x - job.x, selfPosition.y - job.y))} m tot de koffer`;
      } else if (job.phase === 'carried') {
        const carrier = snapshot.players.find(p => p.id === job.carrierId);
        const own = job.carrierId === self.id;
        $('caseTitle').textContent = own ? 'Bezorg de koffer!' : `Onderschep ${carrier?.username || 'de koerier'}`;
        $('caseDetail').textContent = own ? `Rijd naar ${job.target.name} en rem af bij de cirkel.` : `De koerier rijdt naar ${job.target.name}. Pak de koffer af.`;
        const point = own ? job.target : carrier;
        $('caseDistance').textContent = point ? `${Math.round(Math.hypot(selfPosition.x - point.x, selfPosition.y - point.y))} m ${own ? 'tot afleverpunt' : 'tot koerier'}` : '';
      } else {
        $('caseTitle').textContent = 'Kofferjacht afgerond';
        $('caseDetail').textContent = job.message;
        $('caseDistance').textContent = `Nieuwe koffer over ${job.remaining} sec`;
      }
    }
    const seen = new Set();
    effectsGraphics.clear();
    for (const p of snapshot.players) {
      if (p.dead) continue;
      seen.add(p.id);
      let actor = actors.get(p.id);
      if (actor && actor._vtype !== p.vtype) { actor.destroy({ children: true }); actors.delete(p.id); actor = null; }
      if (!actor) {
        actor = new Container();
        actor._vtype = p.vtype;
        if (p.id !== self.id) {
          const colors = [['#db5f65', '#783441'], ['#62a9d3', '#285776'], ['#e3b55e', '#856a32'], ['#83c47e', '#3e7047']];
          const color = colors[[...p.id].reduce((n, c) => n + c.charCodeAt(0), 0) % colors.length];
          const entry = vehicleTex(p.vtype, color[0], color[1]);
          const body = new Sprite(entry.texture); body.anchor.set(.5); body.scale.set(1 / 16);
          actor._body = body; actor._damage = new Graphics(); actor.addChild(body, actor._damage);
        }
        actorLayer.addChild(actor); actors.set(p.id, actor);
      }
      const position = positions.get(p.id);
      actor.position.set(position.x, position.y); if (actor._body) actor._body.rotation = position.angle;
      if (actor._damage) actor._damage.rotation = position.angle;
      if (actor._damage && actor._health !== p.health) {
        actor._damage.clear();
        if (p.health < 75) actor._damage.moveTo(1.5, -.8).lineTo(.8, -.15).lineTo(1.7, .4).stroke({ color: 0x172329, width: .14 });
        if (p.health < 40) actor._damage.ellipse(-1.1, .4, .45, .25).fill({ color: 0x1b292e, alpha: .8 });
        actor._health = p.health;
      }
      actor.alpha = p.health < 50 ? .75 : 1;
      if (p.health < 50) {
        effectsGraphics.circle(position.x + Math.cos(position.angle) * 1.1,
          position.y + Math.sin(position.angle) * 1.1 - 1.1, .55).fill({ color: 0x727a7e, alpha: .4 });
      }
      if (p.shield) effectsGraphics.circle(position.x, position.y, 3.1).stroke({ color: 0xff7777, width: .25, alpha: .8 });
      if (snapshot.case?.carrierId === p.id) effectsGraphics.roundRect(position.x - 1.1, position.y - 3.1, 2.2, 1.5, .2)
        .fill({ color: 0x9b5b2e }).stroke({ color: 0xffda80, width: .2 });
    }
    for (const [id, actor] of actors) if (!seen.has(id)) { actor.destroy({ children: true }); actors.delete(id); positions.delete(id); }
    const shirts = snapshot.shirts || [];
    const signature = `${snapshot.crates.map(c => c.id).join(',')}|${shirts.map(s => s.id).join(',')}|${job?.revision || 0}`;
    if (signature !== pickupSignature) {
      pickupSignature = signature; pickupGraphics.clear();
      for (const c of snapshot.crates) pickupGraphics.roundRect(c.x - 1.4, c.y - 1.4, 2.8, 2.8, .35)
        .fill({ color: c.kind === 'rocket' ? 0xffb347 : c.kind === 'cloak' ? 0x71dddf : 0x85d985 })
        .stroke({ color: 0xffffff, width: .2 });
      for (const s of shirts) {
        pickupGraphics.circle(s.x, s.y, 2.1).fill({ color: 0xf5f2e8 }).stroke({ color: 0xdf272e, width: .5 });
        pickupGraphics.rect(s.x - 1.1, s.y - 1.15, .5, 2.3).fill({ color: 0xdb252b });
        pickupGraphics.rect(s.x + .6, s.y - 1.15, .5, 2.3).fill({ color: 0xdb252b });
      }
      if (job?.phase === 'ground') {
        pickupGraphics.roundRect(job.x - 1.6, job.y - 1.1, 3.2, 2.2, .25)
          .fill({ color: 0x9a5a2d }).stroke({ color: 0xffd57b, width: .26 });
        pickupGraphics.roundRect(job.x - .7, job.y - 1.65, 1.4, .65, .16)
          .stroke({ color: 0xffd57b, width: .2 });
      }
    }
    for (const b of [...snapshot.bullets, ...snapshot.rockets]) {
      effectsGraphics.circle(b.x, b.y, b.target ? .75 : .25).fill({ color: b.target ? 0xff792e : 0xffeeaa });
    }
    for (const m of snapshot.mines) effectsGraphics.circle(m.x, m.y, .9).fill({ color: 0xfb4646 });
    for (const e of snapshot.explosions) effectsGraphics.circle(e.x, e.y, 4).fill({ color: 0xff9b37, alpha: .55 });
  }
  function layoutLabels(view) {
    if (!active || !snapshot) return;
    const seen = new Set();
    for (const p of snapshot.players) {
      if (p.dead) continue;
      seen.add(p.id);
      let tag = labels.get(p.id);
      if (!tag) {
        tag = document.createElement('div'); tag.className = 'player-tag';
        const name = document.createElement('div'); name.className = 'player-tag-name'; tag.appendChild(name);
        const track = document.createElement('div'); track.className = 'player-tag-track';
        const fill = document.createElement('span'); track.appendChild(fill); tag.appendChild(track);
        $('onlineLabels').appendChild(tag); labels.set(p.id, tag);
      }
      tag.firstChild.textContent = `${snapshot.case?.carrierId === p.id ? '💼 ' : ''}${ICON[p.avatar] || '🚘'} ${p.username} ${flag(p.country)} · ${p.health}%`;
      tag.lastChild.firstChild.style.width = `${p.health}%`;
      tag.lastChild.firstChild.style.background = p.health > 50 ? '#65e3a2' : p.health > 25 ? '#ffc46b' : '#ff6464';
      const position = positions.get(p.id) || p;
      const sx = (position.x - view.camera.x) * view.scale + view.width / 2;
      const sy = (position.y - view.camera.y) * view.scale + view.height / 2 - 28;
      tag.hidden = sx < -100 || sx > view.width + 100 || sy < -40 || sy > view.height + 30;
      tag.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`;
    }
    for (const [id, tag] of labels) if (!seen.has(id)) { tag.remove(); labels.delete(id); }
  }
  return { get active() { return active; }, get snapshot() { return snapshot; }, key, render, layoutLabels,
    clearKeys() { held = {}; if (active) sendInput(); } };
}
