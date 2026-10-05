import { driveVehicle } from '../src/vehiclePhysics.js';

const MAX_PLAYERS = 16;
const TYPES = ['car', 'sport', 'cabrio', 'van'];
const SIZE = { car: [4.2, 1.9], sport: [4, 1.75], cabrio: [4.3, 1.8], van: [5, 2.1] };
const DAMAGE = { bullet: 25, mine: 100, rocket: 75, collision: 5 };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

export function createArena(world, persist = () => {}) {
  const players = new Map(), crates = [], bullets = [], mines = [], rockets = [], explosions = [];
  const shirts = (world.stadiumShirts || []).map((spot, i) => ({ ...spot, id: i + 1, availableAt: 0 }));
  const caseRoutes = [];
  for (const start of world.caseStops || []) for (const finish of world.caseStops || []) {
    if (start !== finish && dist(start, finish) >= 250) caseRoutes.push({ start, finish });
  }
  const caseRun = { phase: 'waiting', x: 0, y: 0, startName: '', target: null,
    carrierId: null, deadline: 0, nextAt: 0, revision: 0, message: '' };
  let now = 0, crateId = 0, nextCrate = 0;
  function startCase() {
    if (!caseRoutes.length || !players.size) return;
    const route = caseRoutes[Math.floor(Math.random() * caseRoutes.length)];
    Object.assign(caseRun, { phase: 'ground', x: route.start.x, y: route.start.y,
      startName: route.start.name, target: { x: route.finish.x, y: route.finish.y, name: route.finish.name },
      carrierId: null, deadline: now + 180, revision: caseRun.revision + 1,
      message: `KOFFER VERSCHENEN · ${route.start.name}` });
  }
  function dropCase(p) {
    if (caseRun.carrierId !== p.id) return;
    Object.assign(caseRun, { phase: 'ground', x: p.x, y: p.y, carrierId: null,
      revision: caseRun.revision + 1, message: `${p.username} heeft de koffer verloren` });
  }
  function finishCase(p) {
    p.stats.casesDelivered = (p.stats.casesDelivered || 0) + 1;
    Object.assign(caseRun, { phase: 'cooldown', carrierId: null, nextAt: now + 25,
      revision: caseRun.revision + 1, message: `${p.username} heeft de koffer bezorgd!` });
    persist(p);
  }
  function randomSpot() {
    for (let n = 0; n < 80; n++) {
      const r = world.roads[Math.floor(Math.random() * world.roads.length)];
      if (!r?.pts?.length) continue;
      const point = r.pts[Math.floor(Math.random() * r.pts.length)];
      const pos = world.findSpawnNear(point.x, point.y);
      if (world.pointInPoly(pos.x, pos.y, world.ringPts) && !world.overlappingBuilding(pos.x, pos.y, 0, 4.2, 1.9)) return pos;
    }
    return world.findSpawnNear(world.SPAWN_CENTER.x, world.SPAWN_CENTER.y);
  }
  function spawn(p) {
    const spot = randomSpot(), [w, h] = SIZE[p.vtype];
    Object.assign(p, { x: spot.x, y: spot.y, angle: -Math.PI / 2, speed: 0, w, h, health: 100,
      ammo: 12, mineCount: 2, rockets: 0, cloakUntil: 0, lockId: null, lockStarted: 0,
      deadUntil: 0, crashUntil: 0, shootUntil: 0, mineUntil: 0, rocketUntil: 0, shieldUntil: 0, input: {} });
  }
  function add(account, socket) {
    if (players.size >= MAX_PLAYERS) throw new Error('De arena is vol.');
    if (players.has(account.id)) remove(account.id);
    const p = { id: account.id, username: account.username, avatar: account.avatar, country: account.country,
      vtype: 'car', stats: account.stats, socket, lastInput: 0 };
    spawn(p); players.set(p.id, p); return p;
  }
  function remove(id) { const p = players.get(id); if (!p) return; dropCase(p); players.delete(id); persist(p); try { p.socket.close(); } catch {} }
  function live(p) { return p && !p.deadUntil; }
  function visibleTo(p, viewer) { return p === viewer || (live(p) && (p.cloakUntil <= now || caseRun.carrierId === p.id)); }
  function hurt(victim, amount, attacker, kind) {
    if (!live(victim) || victim.shieldUntil > now) return;
    victim.health = Math.max(0, victim.health - amount);
    if (victim.health) return;
    victim.deadUntil = now + 3; victim.speed = 0;
    dropCase(victim);
    victim.stats.deaths++;
    if (attacker && attacker !== victim) attacker.stats.kills++;
    explosions.push({ x: victim.x, y: victim.y, until: now + 1, kind });
    persist(victim); if (attacker && attacker !== victim) persist(attacker);
  }
  function targetChoices(p) {
    return [...players.values()].filter(q => q !== p && visibleTo(q, p) && dist(p, q) < 150 &&
      Math.abs(wrap(Math.atan2(q.y - p.y, q.x - p.x) - p.angle)) < 0.7).sort((a, b) => dist(a, p) - dist(b, p));
  }
  function input(id, message) {
    const p = players.get(id); if (!p || !message || typeof message !== 'object') return;
    if (message.type === 'input') {
      p.input = { up: message.up === true, down: message.down === true, left: message.left === true,
        right: message.right === true, lock: message.lock === true };
      p.lastInput = now;
      if (p.input.lock && !p.lockId && p.rockets) {
        const target = targetChoices(p)[0];
        if (target) { p.lockId = target.id; p.lockStarted = now; }
      }
      if (!p.input.lock && p.lockId) {
        const target = players.get(p.lockId);
        if (p.rockets && now - p.lockStarted >= 1.2 && target && targetChoices(p).includes(target) && now >= p.rocketUntil) {
          p.rockets--; p.rocketUntil = now + 0.7;
          rockets.push({ x: p.x + Math.cos(p.angle) * 3, y: p.y + Math.sin(p.angle) * 3,
            angle: p.angle, owner: p.id, target: target.id, until: now + 5 });
        }
        p.lockId = null;
      }
      if (p.lockId && !targetChoices(p).some(q => q.id === p.lockId)) p.lockId = null;
      return;
    }
    if (!live(p)) return;
    if (message.type === 'cycle' && p.input.lock) {
      const options = targetChoices(p), index = options.findIndex(q => q.id === p.lockId);
      const next = options[(index + 1) % options.length];
      p.lockId = next?.id || null; p.lockStarted = now;
    }
    if (message.type === 'car' && TYPES.includes(message.vehicle) && Math.abs(p.speed) < 1) {
      const [w, h] = SIZE[message.vehicle];
      if (!world.collidesBuildingsOrRing(p.x, p.y, p.angle, w, h, p.x, p.y)) {
        p.vtype = message.vehicle; p.w = w; p.h = h;
      }
    }
    if (message.type === 'shoot' && p.ammo && now >= p.shootUntil) {
      p.ammo--; p.shootUntil = now + 0.32;
      bullets.push({ x: p.x + Math.cos(p.angle) * 3, y: p.y + Math.sin(p.angle) * 3,
        vx: Math.cos(p.angle) * 80, vy: Math.sin(p.angle) * 80, owner: p.id, until: now + 1.8 });
    }
    if (message.type === 'mine' && p.mineCount && now >= p.mineUntil) {
      p.mineCount--; p.mineUntil = now + 0.5;
      mines.push({ x: p.x - Math.cos(p.angle) * 4, y: p.y - Math.sin(p.angle) * 4,
        owner: p.id, armedAt: now + 0.8, until: now + 90 });
    }
  }
  function tick(dt) {
    dt = Math.min(0.05, Math.max(0, dt)); now += dt;
    const currentPlayers = [...players.values()];
    const activeCars = currentPlayers.filter(live);
    if ((caseRun.phase === 'waiting' || caseRun.phase === 'cooldown') && now >= caseRun.nextAt) startCase();
    if ((caseRun.phase === 'ground' || caseRun.phase === 'carried') && now >= caseRun.deadline) {
      Object.assign(caseRun, { phase: 'cooldown', carrierId: null, nextAt: now + 20,
        revision: caseRun.revision + 1, message: 'Kofferjacht verlopen · nieuwe koffer volgt' });
    }
    if (now >= nextCrate && crates.length < 14) {
      const pos = randomSpot();
      crates.push({ ...pos, id: ++crateId, kind: ['rocket', 'cloak', 'repair', 'ammo', 'mine'][Math.floor(Math.random() * 5)] });
      nextCrate = now + 5 + Math.random() * 5;
    }
    for (const p of currentPlayers) {
      p.stats.secondsPlayed += dt;
      if (p.deadUntil) { if (now >= p.deadUntil) spawn(p); continue; }
      const controls = now - p.lastInput < 0.6 ? p.input : {};
      const result = driveVehicle(world, p, controls, activeCars, dt);
      p.stats.distanceKm += result.distance / 1000;
      if (result.impact > 7 && now >= p.crashUntil) {
        p.crashUntil = now + 0.7; hurt(p, DAMAGE.collision, result.hit || null, 'collision');
      }
      for (let i = crates.length - 1; i >= 0; i--) if (dist(p, crates[i]) < 4) {
        if (caseRun.carrierId === p.id && crates[i].kind === 'cloak') continue;
        const box = crates.splice(i, 1)[0];
        if (box.kind === 'rocket') p.rockets += 2;
        if (box.kind === 'cloak') { p.cloakUntil = now + 30; p.lockId = null; }
        if (box.kind === 'repair') p.health = Math.min(100, p.health + 50);
        if (box.kind === 'ammo') p.ammo += 12;
        if (box.kind === 'mine') p.mineCount += 2;
      }
      for (const shirt of shirts) if (shirt.availableAt <= now && dist(p, shirt) < 3.5) {
        shirt.availableAt = now + 90;
        p.shieldUntil = now + 40;
      }
      if (caseRun.phase === 'ground' && dist(p, caseRun) < 4.5) {
        Object.assign(caseRun, { phase: 'carried', carrierId: p.id, deadline: now + 120,
          revision: caseRun.revision + 1, message: `${p.username} heeft de koffer!` });
        p.cloakUntil = 0;
      }
      if (caseRun.phase === 'carried' && caseRun.carrierId === p.id &&
          dist(p, caseRun.target) < 9 && Math.abs(p.speed) < 7) finishCase(p);
    }
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i]; b.x += b.vx * dt; b.y += b.vy * dt;
      const victim = currentPlayers.find(p => p.id !== b.owner && live(p) && dist(p, b) < 2.5);
      if (victim) { hurt(victim, DAMAGE.bullet, players.get(b.owner), 'bullet'); bullets.splice(i, 1); }
      else if (now > b.until || world.overlappingBuilding(b.x, b.y, 0, 0.2, 0.2)) bullets.splice(i, 1);
    }
    for (let i = mines.length - 1; i >= 0; i--) {
      const m = mines[i];
      const victim = now >= m.armedAt && currentPlayers.find(p => p.id !== m.owner && live(p) && dist(p, m) < 3);
      if (victim) { hurt(victim, DAMAGE.mine, players.get(m.owner), 'mine'); explosions.push({ x: m.x, y: m.y, until: now + 0.7 }); mines.splice(i, 1); }
      else if (now > m.until) mines.splice(i, 1);
    }
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i], target = players.get(r.target);
      if (!live(target) || !visibleTo(target, players.get(r.owner)) || now > r.until) { rockets.splice(i, 1); continue; }
      r.angle += Math.max(-5 * dt, Math.min(5 * dt, wrap(Math.atan2(target.y - r.y, target.x - r.x) - r.angle)));
      r.x += Math.cos(r.angle) * 65 * dt; r.y += Math.sin(r.angle) * 65 * dt;
      if (dist(r, target) < 3.5) { hurt(target, DAMAGE.rocket, players.get(r.owner), 'rocket'); explosions.push({ x: r.x, y: r.y, until: now + 0.7 }); rockets.splice(i, 1); }
      else if (world.overlappingBuilding(r.x, r.y, 0, 0.2, 0.2)) { explosions.push({ x: r.x, y: r.y, until: now + 0.7 }); rockets.splice(i, 1); }
    }
    for (let i = explosions.length - 1; i >= 0; i--) if (now > explosions[i].until) explosions.splice(i, 1);
  }
  function snapshot(viewer) {
    return { type: 'state', now, self: viewer.id,
      players: [...players.values()].filter(p => visibleTo(p, viewer)).map(p => ({
        id: p.id, username: p.username, avatar: p.avatar, country: p.country, x: p.x, y: p.y,
        angle: p.angle, speed: p.speed, vtype: p.vtype, health: p.health, dead: !!p.deadUntil,
        cloak: p === viewer && p.cloakUntil > now ? Math.ceil(p.cloakUntil - now) : 0,
        shield: p.shieldUntil > now ? Math.ceil(p.shieldUntil - now) : 0,
        ammo: p === viewer ? p.ammo : undefined, mines: p === viewer ? p.mineCount : undefined,
        rockets: p === viewer ? p.rockets : undefined,
        lock: p === viewer && p.lockId ? { id: p.lockId, progress: Math.min(1, (now - p.lockStarted) / 1.2) } : undefined,
        stats: p === viewer ? p.stats : undefined,
      })), crates, shirts: shirts.filter(s => s.availableAt <= now).map(({ x, y, id }) => ({ x, y, id })), bullets, mines, rockets, explosions,
      case: { phase: caseRun.phase, x: caseRun.x, y: caseRun.y, startName: caseRun.startName,
        target: caseRun.target, carrierId: caseRun.carrierId, remaining: Math.max(0, Math.ceil(
          (caseRun.phase === 'cooldown' ? caseRun.nextAt : caseRun.deadline) - now)),
        revision: caseRun.revision, message: caseRun.message } };
  }
  return { players, crates, shirts, caseRun, tick, add, remove, input, snapshot, DAMAGE };
}
