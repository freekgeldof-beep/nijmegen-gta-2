import { nearestRoadPoint, roadDistances, isDriveable } from './navigation.js';
import { createCourier } from './missions.js';
import { createCheckpointRace } from './race.js';

// Simulatielaag voor speler, verkeer, politie, wapens en pickups.
// Puur gedrag/state -- de renderer leest deze state elke frame uit.

import { VEHICLE_TYPES } from './vehicleTypes.js';
import { CAR_PHYS, driveVehicle } from './vehiclePhysics.js';
export { VEHICLE_TYPES } from './vehicleTypes.js';

const WALK_SPEED = 5.4;
const START_AMMO = 12;
const START_MINES = 5;
const MINE_SAFE_DIST = 3.4;
const LANE_OFFSET_FRAC = 0.27;
const TRAFFIC_POOL = 44;
const POLICE_POOL = 6;
const ACTIVE_RADIUS = 220;
const DESPAWN_RADIUS = 320;
const LIGHT_CYCLE = 5;
const SIGNAL_SNAP_DIST = 18;
const WANTED_CLEAR_RADIUS = 130; // ongeveer buiten beeld bij standaard zoom
const WANTED_CLEAR_TIME = 14;
const POLICE_HIT_COOLDOWN = 1.2;
const POLICE_HITS_TO_BUST = 3;
const POLICE_CHASE_JOIN_DIST = 70;
const POLICE_CHASE_GIVEUP_DIST = 160;
const POLICE_FOOT_JOIN_DIST = 45;
const POLICE_FOOT_SPEED = 6.2; // net iets sneller dan de speler te voet (5.4)
const POLICE_FOOT_CATCH_DIST = 1.3;
const BEER_IMMUNITY_TIME = 20;
const SHIRT_IMMUNITY_TIME = 40;

export function createGameState(world) {
  const rng = world.rng;
  const { roadWidth, roadRank, edgeDirFromNode, nodesById, roads } = world;

  function pickVehicleType() {
    const r = rng();
    if (r < 0.28) return 'car';
    if (r < 0.36) return 'sport';
    if (r < 0.42) return 'cabrio';
    if (r < 0.52) return 'van';
    if (r < 0.60) return 'truck';
    if (r < 0.68) return 'bus';
    if (r < 0.71) return 'ambulance';
    if (r < 0.74) return 'firetruck';
    if (r < 0.87) return 'moto';
    return 'bike';
  }

  const player = {
    mode: 'car', x: 0, y: 0, angle: -Math.PI / 2, speed: 0,
    vtype: 'car', w: 4.2, h: 1.9,
    isStolen: false, wasted: false, wastedT: 0, busted: false, bustedT: 0, wanted: false,
    wantedClearTimer: 0, policeHitCount: 0, policeHitCooldown: 0, policeImmuneT: 0, shirtImmuneT: 0, health: 100, crashCooldown: 0,
  };

  const state = {
    player,
    ammo: START_AMMO, mineCount: START_MINES,
    shootCooldown: 0, mineCooldown: 0,
    mines: [], bullets: [], explosions: [], popups: [], parkedCars: [],
    traffic: [], police: [],
    simTime: 0,
    events: [], // {type, ...} consumed by main.js each frame for UI/audio hooks
  };

  const courier = createCourier(world);
  state.mission = courier.state;
  const race = createCheckpointRace(world);
  state.race = race.state;
  let chaseTarget = null, chaseDistances = new Map(), nextRouteTime = 0;
  function emit(type, data) { state.events.push({ type, ...data }); }
  function drainEvents() { return state.events.splice(0); }
  function clearKeys() { for (const key of Object.keys(keys)) delete keys[key]; }

  // ---------- Verkeerslichten ----------
  const trafficLights = new Map();
  for (const sp of world.signalPts) {
    let best = null, bestD = SIGNAL_SNAP_DIST;
    for (const node of nodesById.values()) {
      const d = Math.hypot(node.x - sp.x, node.y - sp.y);
      if (d < bestD) { bestD = d; best = node; }
    }
    if (!best || best.edges.length < 3 || trafficLights.has(best.id)) continue;
    const node = best;
    const refDir = edgeDirFromNode(node.edges[0], node.id, node.x, node.y);
    const refAngle = Math.atan2(refDir.y, refDir.x);
    const groupOf = new Map();
    for (const e of node.edges) {
      const dir = edgeDirFromNode(e, node.id, node.x, node.y);
      const ang = Math.atan2(dir.y, dir.x);
      const diff = ((ang - refAngle) % Math.PI + Math.PI) % Math.PI;
      const group = (diff < Math.PI / 4 || diff > Math.PI * 3 / 4) ? 0 : 1;
      groupOf.set(e.id, group);
    }
    trafficLights.set(node.id, { groupOf, offset: (node.id * 37) % 10000 / 1000 });
  }
  function lightGroupState(nodeId, group, timeSec) {
    const lt = trafficLights.get(nodeId);
    if (!lt) return 'green';
    const phase = Math.floor((timeSec + lt.offset) / LIGHT_CYCLE) % 2;
    return (phase === group) ? 'green' : 'red';
  }

  // ---------- Wegmarkeringen (statisch, eenmalig berekend) ----------
  const stopLines = [];
  const sharkTeeth = [];
  const markedNodePositions = [];
  function tooCloseToMarked(x, y, minDist) {
    for (const p of markedNodePositions) { if (Math.hypot(p.x - x, p.y - y) < minDist) return true; }
    return false;
  }
  for (const [nodeId] of trafficLights) {
    const node = nodesById.get(nodeId);
    if (tooCloseToMarked(node.x, node.y, 30)) continue;
    markedNodePositions.push({ x: node.x, y: node.y });
    for (const e of node.edges) {
      if (e.hw === 'pedestrian' || e.hw === 'living_street') continue;
      const dir = edgeDirFromNode(e, node.id, node.x, node.y);
      const dist = node.curbR + 1.6;
      const x = node.x + dir.x * dist, y = node.y + dir.y * dist;
      const angle = Math.atan2(dir.y, dir.x);
      stopLines.push({ x, y, angle, halfWidth: roadWidth(e) * 0.36 });
    }
  }
  for (const node of nodesById.values()) {
    if (node.edges.length < 3 || trafficLights.has(node.id)) continue;
    const vehicleEdges = node.edges.filter(e => e.hw !== 'pedestrian' && e.hw !== 'living_street');
    if (vehicleEdges.length < 2) continue;
    if (tooCloseToMarked(node.x, node.y, 30)) continue;
    const maxRank = Math.max(...vehicleEdges.map(e => roadRank(e.hw)));
    let added = false;
    for (const e of vehicleEdges) {
      if (roadRank(e.hw) >= maxRank) continue;
      const dir = edgeDirFromNode(e, node.id, node.x, node.y);
      const dist = node.curbR + 1.4;
      const x = node.x + dir.x * dist, y = node.y + dir.y * dist;
      const angle = Math.atan2(dir.y, dir.x);
      sharkTeeth.push({ x, y, angle, halfWidth: roadWidth(e) * 0.36 });
      added = true;
    }
    if (added) markedNodePositions.push({ x: node.x, y: node.y });
  }

  function posAlongLane(road, dist, dir, lateralOverride) {
    const pts = road.pts, cum = road.cum;
    let d = Math.max(0, Math.min(road.len, dist));
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const segLen = cum[i] - cum[i - 1];
    const t = segLen > 0 ? (d - cum[i - 1]) / segLen : 0;
    let x = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t;
    let y = pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t;
    let dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
    const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    const travelDx = dir > 0 ? dx : -dx, travelDy = dir > 0 ? dy : -dy;
    const lateral = lateralOverride !== undefined ? lateralOverride : Math.min(3.4, roadWidth(road) * LANE_OFFSET_FRAC);
    const px = -travelDy, py = travelDx;
    x += px * lateral; y += py * lateral;
    const angle = Math.atan2(travelDy, travelDx);
    return { x, y, angle };
  }

  const zebras = [];
  const driveable = roads.filter(r => r.pts.length > 1 && r.hw !== 'pedestrian' && r.hw !== 'living_street' && r.len > 25);
  for (const r of driveable) {
    if (r.len < 55) continue;
    if (rng() >= 0.05) continue;
    const dist = 25 + rng() * (r.len - 50);
    const p = posAlongLane(r, dist, 1, 0);
    zebras.push({ x: p.x, y: p.y, angle: p.angle, halfWidth: roadWidth(r) / 2 - 0.6 });
  }

  const roadGrid = new Map();
  driveable.forEach((r, i) => {
    const xs = r.pts.map(p => p.x), ys = r.pts.map(p => p.y);
    for (const k of world.cellsForBox(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys))) {
      if (!roadGrid.has(k)) roadGrid.set(k, []);
      roadGrid.get(k).push(i);
    }
  });
  function nearbyDriveableRoads(cx, cy, radius) {
    const set = new Set();
    for (const k of world.cellsForBox(cx - radius, cy - radius, cx + radius, cy + radius)) {
      const arr = roadGrid.get(k); if (arr) for (const i of arr) set.add(i);
    }
    return [...set].map(i => driveable[i]);
  }

  function placeOnRoad(t, r) {
    t.road = r; t.dir = rng() < 0.5 ? 1 : -1; t.dist = rng() * r.len; t.waiting = false;
    const p = posAlongLane(r, t.dist, t.dir, t.lateral);
    t.x = p.x; t.y = p.y; t.angle = p.angle;
  }
  function advanceToNextRoad(t) {
    const arrivalNodeId = t.dir > 0 ? t.road.nodeEnd : t.road.nodeStart;
    const node = nodesById.get(arrivalNodeId);
    let candidates = node.edges.filter(e => isDriveable(e) && (t.state === 'chase' || e.len > 10));
    if (!candidates.length) candidates = node.edges;
    let others = candidates.filter(e => e !== t.road);
    const pool = others.length ? others : candidates;
    let next = pool[Math.floor(rng() * pool.length)];
    if (t.state === 'chase' && chaseTarget) {
      let bestCost = Infinity;
      for (const edge of candidates) {
        const far = edge.nodeStart === arrivalNodeId ? edge.nodeEnd : edge.nodeStart;
        const cost = edge === chaseTarget.road
          ? (edge.nodeStart === arrivalNodeId ? chaseTarget.dist : edge.len - chaseTarget.dist)
          : edge.len + (chaseDistances.get(far) ?? Infinity);
        if (cost < bestCost) { bestCost = cost; next = edge; }
      }
    }
    t.road = next;
    if (next.nodeStart === arrivalNodeId) { t.dir = 1; t.dist = 0; }
    else { t.dir = -1; t.dist = next.len; }
  }
  function reassignNearPlayer(t) {
    let candidates = nearbyDriveableRoads(player.x, player.y, ACTIVE_RADIUS);
    if (!candidates.length) candidates = nearbyDriveableRoads(player.x, player.y, ACTIVE_RADIUS * 2.5);
    if (!candidates.length) candidates = driveable;
    const r = candidates[Math.floor(rng() * candidates.length)];
    placeOnRoad(t, r);
    t.alive = true;
  }
  function makeVehicle() {
    const vtype = pickVehicleType();
    const vt = VEHICLE_TYPES[vtype];
    const pal = vt.palettes[Math.floor(rng() * vt.palettes.length)];
    const lateral = (vtype === 'bike') ? 3.0 : undefined;
    const t = {
      road: null, dist: 0, dir: 1, waiting: false,
      speed: (7 + rng() * 6) * vt.speedMul, vtype, w: vt.w, h: vt.h, lateral,
      color: pal[0], dark: pal[1], alive: true, respawnT: 0, x: 0, y: 0, angle: 0, isPolice: false,
    };
    reassignNearPlayer(t);
    return t;
  }
  function makePoliceVehicle() {
    const t = {
      road: null, dist: 0, dir: 1, waiting: false,
      speed: 8 + rng() * 4, vtype: 'car', w: VEHICLE_TYPES.car.w, h: VEHICLE_TYPES.car.h,
      color: '#e8e8e8', dark: '#222', alive: true, respawnT: 0, x: 0, y: 0, angle: 0,
      isPolice: true, state: 'patrol', flash: 0, onFoot: false,
    };
    reassignNearPlayer(t);
    return t;
  }
  for (let i = 0; i < TRAFFIC_POOL; i++) state.traffic.push(makeVehicle());
  for (let i = 0; i < POLICE_POOL; i++) state.police.push(makePoliceVehicle());

  const pickups = [];
  const PICKUP_POOL = 34;
  function placePickupNearPlayer(p) {
    let candidates = nearbyDriveableRoads(player.x, player.y, ACTIVE_RADIUS);
    if (!candidates.length) candidates = driveable;
    const r = candidates[Math.floor(rng() * candidates.length)];
    const dist = rng() * r.len;
    const pos = posAlongLane(r, dist, 1);
    const nx = -Math.sin(pos.angle), ny = Math.cos(pos.angle);
    const side = (rng() < 0.5 ? -1 : 1) * (r.hw === 'primary' || r.hw === 'secondary' ? 6 : 4);
    p.x = pos.x + nx * side; p.y = pos.y + ny * side;
    p.alive = true;
  }
  for (let i = 0; i < PICKUP_POOL; i++) { const p = { type: rng() < 0.5 ? 'ammo' : 'mine', alive: true, x: 0, y: 0 }; placePickupNearPlayer(p); pickups.push(p); }

  // Vaste bierkratten op de uitgaansstraten uit de stadsconfiguratie.
  const BEER_STREETS = world.city.pickups?.beerStreets || [];
  for (const streetName of BEER_STREETS) {
    const segs = roads.filter(r => r.name === streetName && r.pts.length > 1).sort((a, b) => b.len - a.len).slice(0, 2);
    for (const r of segs) {
      const pos = posAlongLane(r, r.len / 2, 1, 0);
      const nx = -Math.sin(pos.angle), ny = Math.cos(pos.angle);
      const hx = pos.x + nx * 3.5, hy = pos.y + ny * 3.5;
      pickups.push({ type: 'beer', alive: true, x: hx, y: hy, homeX: hx, homeY: hy });
    }
  }
  for (const spot of world.stadiumShirts || []) pickups.push({ type: 'shirt', alive: true,
    x: spot.x, y: spot.y, homeX: spot.x, homeY: spot.y });
  state.pickups = pickups;

  function resetGame() {
    state.events.length = 0;
    chaseTarget = null; nextRouteTime = 0;
    if (courier.state.status === 'active') { courier.state.status = 'failed'; courier.state.reason = 'Rit afgebroken.'; }
    race.reset();
    const spawn = world.findSpawnNear(world.SPAWN_CENTER.x, world.SPAWN_CENTER.y);
    player.mode = 'car'; player.x = spawn.x; player.y = spawn.y; player.angle = -Math.PI / 2; player.speed = 0;
    player.vtype = 'car'; player.w = VEHICLE_TYPES.car.w; player.h = VEHICLE_TYPES.car.h;
    player.isStolen = false; player.wasted = false; player.wastedT = 0; player.busted = false; player.bustedT = 0; player.wanted = false;
    player.wantedClearTimer = 0; player.policeHitCount = 0; player.policeHitCooldown = 0; player.policeImmuneT = 0; player.shirtImmuneT = 0; player.health = 100; player.crashCooldown = 0;
    state.mines.length = 0; state.bullets.length = 0; state.explosions.length = 0; state.popups.length = 0; state.parkedCars.length = 0;
    state.ammo = START_AMMO; state.mineCount = START_MINES; state.shootCooldown = 0; state.mineCooldown = 0;
    for (const p of state.police) { p.onFoot = false; p.state = 'patrol'; if (p.alive) reassignNearPlayer(p); }
    emit('resetGame', {});
  }
  resetGame();

  function explodePlayer() {
    if (player.wasted || player.busted || player.shirtImmuneT > 0) return;
    player.wasted = true; player.wastedT = 0; player.speed = 0;
    state.explosions.push({ x: player.x, y: player.y, t: 0, big: true });
    emit('wasted', {});
  }
  function bustPlayer() {
    if (player.wasted || player.busted) return;
    player.busted = true; player.bustedT = 0; player.speed = 0;
    emit('busted', {});
  }
  function spawnPopup(x, y, text, color) { state.popups.push({ x, y, text, color: color || '#fff', t: 0 }); }

  function makeWanted() {
    player.wantedClearTimer = 0;
    if (!player.wanted) { player.wanted = true; player.wantedClearTimer = 0; player.policeHitCount = 0; }
  }
  function registerPoliceHit() {
    if (player.policeImmuneT > 0 || player.shirtImmuneT > 0) return;
    player.policeHitCooldown = POLICE_HIT_COOLDOWN;
    makeWanted();
    player.policeHitCount++;
    if (player.policeHitCount >= POLICE_HITS_TO_BUST) {
      spawnPopup(player.x, player.y, 'BUSTED!!', '#6fa8ff');
      bustPlayer();
    } else {
      spawnPopup(player.x, player.y, `Politie! (${player.policeHitCount}/${POLICE_HITS_TO_BUST})`, '#ff8f5a');
    }
  }

  function placeMine() {
    if (state.mineCooldown > 0 || state.mineCount <= 0 || player.wasted || player.busted) return;
    makeWanted();
    const bx = player.x - Math.cos(player.angle) * 3, by = player.y - Math.sin(player.angle) * 3;
    state.mines.push({ x: bx, y: by, r: 0.6, armed: true, t: 0, selfSafe: true });
    state.mineCount--; state.mineCooldown = 0.6;
    emit('minePlaced', {});
  }
  function shoot() {
    if (state.shootCooldown > 0 || state.ammo <= 0 || player.wasted || player.busted) return;
    makeWanted();
    const bx = player.x + Math.cos(player.angle) * 2.4, by = player.y + Math.sin(player.angle) * 2.4;
    state.bullets.push({ x: bx, y: by, angle: player.angle, speed: 80, life: 1.2 });
    state.ammo--; state.shootCooldown = 0.35;
    emit('shot', {});
  }

  function nearestEnterable() {
    let best = null, bestD = 3.2, bestKind = null;
    for (const t of state.traffic) { if (!t.alive) continue; const d = Math.hypot(t.x - player.x, t.y - player.y); if (d < bestD) { bestD = d; best = t; bestKind = 'traffic'; } }
    for (const t of state.police) { if (!t.alive || t.onFoot) continue; const d = Math.hypot(t.x - player.x, t.y - player.y); if (d < bestD) { bestD = d; best = t; bestKind = 'police'; } }
    for (const p of state.parkedCars) { const d = Math.hypot(p.x - player.x, p.y - player.y); if (d < bestD) { bestD = d; best = p; bestKind = 'parked'; } }
    return best ? { veh: best, kind: bestKind } : null;
  }
  function placePlayerInVehicle(x, y, angle, w, h) {
    player.x = x; player.y = y; player.angle = angle;
    if (world.collidesBuildingsOrRing(player.x, player.y, player.angle, w, h)) {
      const b = world.overlappingBuilding(player.x, player.y, player.angle, w, h);
      if (b) {
        const away = Math.atan2(player.y - b.cy, player.x - b.cx);
        const nudge = world.findSpawnNear(player.x + Math.cos(away) * 6, player.y + Math.sin(away) * 6, 20);
        player.x = nudge.x; player.y = nudge.y;
      }
    }
  }
  function toggleEnterExit() {
    if (player.wasted || player.busted) return;
    if (player.mode === 'car') {
      const nx = -Math.sin(player.angle), ny = Math.cos(player.angle);
      let exit = null;
      for (const side of [1, -1]) {
        for (const distance of [player.h / 2 + 0.8, player.h / 2 + 1.4, player.h / 2 + 2]) {
          const x = player.x + nx * side * distance;
          const y = player.y + ny * side * distance;
          const foot = world.carCorners(x, y, 0, 0.6, 0.6);
          const blockedByCar = [...state.traffic, ...state.police, ...state.parkedCars].some(car =>
            car.alive !== false && !car.onFoot && Math.hypot(car.x - x, car.y - y) < 7 &&
            world.polysIntersect(foot, world.carCorners(car.x, car.y, car.angle, car.w, car.h)));
          if (!blockedByCar && !world.collidesBuildingsOrRing(x, y, 0, 0.6, 0.6, player.x, player.y)) {
            exit = { x, y }; break;
          }
        }
        if (exit) break;
      }
      if (!exit) return;
      state.parkedCars.push({ x: player.x, y: player.y, angle: player.angle, vtype: player.vtype, w: player.w, h: player.h, color: player.color || '#3a9bff', dark: player.dark || '#1f6fd1', isStolenFlag: player.isStolen });
      player.mode = 'foot';
      player.x = exit.x; player.y = exit.y;
      player.speed = 0;
      emit('exitVehicle', {});
    } else {
      const found = nearestEnterable();
      if (!found) return;
      const v = found.veh;
      player.vtype = v.vtype; player.w = v.w; player.h = v.h;
      player.color = v.color; player.dark = v.dark;
      placePlayerInVehicle(v.x, v.y, v.angle, v.w, v.h);
      player.speed = 0;
      if (found.kind === 'parked') {
        player.isStolen = v.isStolenFlag;
        state.parkedCars.splice(state.parkedCars.indexOf(v), 1);
      } else if (found.kind === 'traffic') {
        player.isStolen = true;
        makeWanted();
        state.traffic.splice(state.traffic.indexOf(v), 1);
        state.traffic.push(makeVehicle());
      } else if (found.kind === 'police') {
        player.isStolen = true;
        makeWanted();
        state.police.splice(state.police.indexOf(v), 1);
        state.police.push(makePoliceVehicle());
      }
      player.mode = 'car';
      emit('enterVehicle', {});
    }
  }

  const keys = {};
  function setKey(key, down) { keys[key] = down; }

  function updatePlayerCar(dt) {
    const stuckIn = world.overlappingBuilding(player.x, player.y, player.angle, player.w, player.h);
    if (stuckIn) {
      const away = Math.atan2(player.y - stuckIn.cy, player.x - stuckIn.cx) || 0;
      const nx = player.x + Math.cos(away) * 3 * dt;
      const ny = player.y + Math.sin(away) * 3 * dt;
      if (world.pointInPoly(nx, ny, world.ringPts)) { player.x = nx; player.y = ny; }
      player.speed = 0;
      return;
    }
    player.crashCooldown = Math.max(0, player.crashCooldown - dt);
    const result = driveVehicle(world, player, {
      up: keys.ArrowUp, down: keys.ArrowDown, left: keys.ArrowLeft, right: keys.ArrowRight,
    }, [...state.traffic, ...state.police, ...state.parkedCars], dt);
    if (result.impact > 7 && player.crashCooldown <= 0) {
      if (player.shirtImmuneT <= 0) player.health = Math.max(0, player.health - 5);
      player.crashCooldown = 0.7;
      emit('collision', { impact: result.impact });
      if (!player.health) explodePlayer();
    }
  }
  function updatePlayerFoot(dt) {
    let dx = 0, dy = 0;
    if (keys['ArrowUp']) dy -= 1;
    if (keys['ArrowDown']) dy += 1;
    if (keys['ArrowLeft']) dx -= 1;
    if (keys['ArrowRight']) dx += 1;
    if (dx || dy) {
      const l = Math.hypot(dx, dy); dx /= l; dy /= l;
      player.angle = Math.atan2(dy, dx);
      const nx = player.x + dx * WALK_SPEED * dt, ny = player.y + dy * WALK_SPEED * dt;
      if (!world.collidesBuildingsOrRing(nx, ny, 0, 0.6, 0.6)) { player.x = nx; player.y = ny; }
      else if (!world.collidesBuildingsOrRing(nx, player.y, 0, 0.6, 0.6)) player.x = nx;
      else if (!world.collidesBuildingsOrRing(player.x, ny, 0, 0.6, 0.6)) player.y = ny;
    }
    player.speed = 0;
  }
  function updatePlayer(dt) {
    if (player.wasted) { player.wastedT += dt; if (player.wastedT > 1.6) resetGame(); return; }
    if (player.busted) {
      player.bustedT += dt;
      if (player.bustedT > 1.8) {
        player.mode = 'foot'; player.x = world.POLICE_STATION.x; player.y = world.POLICE_STATION.y; player.speed = 0;
        player.isStolen = false; player.wanted = false; player.busted = false; player.bustedT = 0;
        player.wantedClearTimer = 0; player.policeHitCount = 0; player.policeImmuneT = 0;
        state.ammo = 0; state.mineCount = 0;
        emit('bustedResolved', {});
      }
      return;
    }
    if (player.mode === 'car') updatePlayerCar(dt); else updatePlayerFoot(dt);
    if (player.policeHitCooldown > 0) player.policeHitCooldown -= dt;
    if (player.policeImmuneT > 0) player.policeImmuneT = Math.max(0, player.policeImmuneT - dt);
    if (player.shirtImmuneT > 0) player.shirtImmuneT = Math.max(0, player.shirtImmuneT - dt);
  }

  function vehicleFollowGraph(t, dt) {
    const arrivalNodeId = t.dir > 0 ? t.road.nodeEnd : t.road.nodeStart;
    const rem = t.dir > 0 ? (t.road.len - t.dist) : t.dist;
    const lt = trafficLights.get(arrivalNodeId);
    if (t.state !== 'chase' && lt && rem < 9 && rem > 0.3) {
      const group = lt.groupOf.get(t.road.id);
      if (group !== undefined && lightGroupState(arrivalNodeId, group, state.simTime) === 'red') {
        t.waiting = true;
        return;
      }
    }
    t.waiting = false;
    t.dist += t.dir * (t.state === 'chase' ? 24 : t.speed) * dt;
    if (t.dir > 0 && t.dist >= t.road.len) { advanceToNextRoad(t); }
    else if (t.dir < 0 && t.dist <= 0) { advanceToNextRoad(t); }
    const p = posAlongLane(t.road, t.dist, t.dir, t.lateral);
    t.x = p.x; t.y = p.y; t.angle = p.angle;
  }
  function updateTraffic(dt) {
    for (const t of state.traffic) {
      if (!t.alive) { t.respawnT -= dt; if (t.respawnT <= 0) reassignNearPlayer(t); continue; }
      const d = Math.hypot(t.x - player.x, t.y - player.y);
      if (d > DESPAWN_RADIUS) { reassignNearPlayer(t); continue; }
      vehicleFollowGraph(t, dt);
    }
  }
  function updatePolice(dt) {
    if (player.wanted && state.simTime >= nextRouteTime) {
      chaseTarget = nearestRoadPoint(nearbyDriveableRoads(player.x, player.y, 100), player.x, player.y);
      chaseDistances = roadDistances(world, chaseTarget);
      nextRouteTime = state.simTime + 0.75;
    }
    // Verlies de gezochtstatus pas als er een tijdje geen enkele achtervolgende
    // agent (te voet of in de auto) dichtbij is geweest -- patrouillerende agenten
    // in de verte tellen niet mee, anders zou "ontsnappen" nooit lukken.
    // Botsen met een agent (hieronder) zet de gezocht-status meteen weer aan.
    if (player.wanted) {
      let minChaseDist = Infinity;
      for (const p of state.police) {
        if (!p.alive) continue;
        if (p.state !== 'chase' && !p.onFoot) continue;
        const d = Math.hypot(p.x - player.x, p.y - player.y);
        if (d < minChaseDist) minChaseDist = d;
      }
      if (minChaseDist > WANTED_CLEAR_RADIUS) {
        player.wantedClearTimer += dt;
        if (player.wantedClearTimer > WANTED_CLEAR_TIME) {
          player.wanted = false; player.wantedClearTimer = 0; player.policeHitCount = 0;
          emit('escaped', {});
          for (const p of state.police) {
            if (p.state === 'chase') { p.state = 'patrol'; reassignNearPlayer(p); }
            if (p.onFoot) { p.onFoot = false; reassignNearPlayer(p); }
          }
        }
      } else {
        player.wantedClearTimer = 0;
      }
    }

    for (const p of state.police) {
      if (!p.alive) {
        p.onFoot = false; p.state = 'patrol';
        p.respawnT -= dt;
        if (p.respawnT <= 0) reassignNearPlayer(p);
        continue;
      }
      if (p.onFoot) {
        // Agent is uitgestapt en achtervolgt de speler te voet.
        if (!player.wanted || player.wasted || player.busted) { p.onFoot = false; reassignNearPlayer(p); continue; }
        const dAng = Math.atan2(player.y - p.y, player.x - p.x);
        p.angle = dAng;
        const stuckIn = world.overlappingBuilding(p.x, p.y, 0, 0.6, 0.6);
        if (stuckIn) {
          const away = Math.atan2(p.y - stuckIn.cy, p.x - stuckIn.cx) || 0;
          const nx2 = p.x + Math.cos(away) * POLICE_FOOT_SPEED * dt, ny2 = p.y + Math.sin(away) * POLICE_FOOT_SPEED * dt;
          if (world.pointInPoly(nx2, ny2, world.ringPts)) { p.x = nx2; p.y = ny2; }
        } else {
          const nx = p.x + Math.cos(dAng) * POLICE_FOOT_SPEED * dt, ny = p.y + Math.sin(dAng) * POLICE_FOOT_SPEED * dt;
          if (!world.collidesBuildingsOrRing(nx, ny, 0, 0.6, 0.6)) { p.x = nx; p.y = ny; }
          else if (!world.collidesBuildingsOrRing(nx, p.y, 0, 0.6, 0.6)) p.x = nx;
          else if (!world.collidesBuildingsOrRing(p.x, ny, 0, 0.6, 0.6)) p.y = ny;
        }
        if (player.policeHitCooldown <= 0 && Math.hypot(p.x - player.x, p.y - player.y) < POLICE_FOOT_CATCH_DIST) registerPoliceHit();
        continue;
      }
      const d = Math.hypot(p.x - player.x, p.y - player.y);
      if (d > DESPAWN_RADIUS && p.state !== 'chase') { reassignNearPlayer(p); continue; }
      if (player.wanted && !player.wasted && !player.busted && player.mode === 'foot' && d < POLICE_FOOT_JOIN_DIST) {
        // Agent stapt uit en zet de achtervolging te voet voort.
        p.onFoot = true; p.state = 'patrol';
        continue;
      }
      if (player.wanted && player.mode === 'car' && !player.wasted && !player.busted && d < POLICE_CHASE_JOIN_DIST) {
        p.state = 'chase';
      } else if (p.state === 'chase' && (!player.wanted || d > POLICE_CHASE_GIVEUP_DIST)) {
        p.state = 'patrol'; reassignNearPlayer(p);
      }
      if (p.state === 'chase') p.flash += dt;
      // Follow connected streets instead of steering into building walls.
      vehicleFollowGraph(p, dt);
      // Elke agent (patrouillerend of achtervolgend) die de speler raakt: geeft
      // gezocht-status (indien nog niet gezocht) en telt mee voor de arrestatiedrempel.
      if (player.mode === 'car' && !player.wasted && !player.busted && player.policeHitCooldown <= 0) {
        const corners = world.carCorners(p.x, p.y, p.angle, p.w, p.h);
        const pcorners = world.carCorners(player.x, player.y, player.angle, player.w, player.h);
        if (world.polysIntersect(corners, pcorners)) registerPoliceHit();
      }
    }
  }
  function updateMines(dt) {
    for (const m of state.mines) {
      if (!m.armed) continue;
      m.t += dt;
      const distToPlayer = Math.hypot(player.x - m.x, player.y - m.y);
      if (m.selfSafe) {
        if (distToPlayer > MINE_SAFE_DIST) m.selfSafe = false;
      } else if (!player.wasted && !player.busted && distToPlayer < m.r + 2.2) {
        m.armed = false; state.explosions.push({ x: m.x, y: m.y, t: 0 }); explodePlayer(); continue;
      }
      if (m.t < 0.5) continue;
      for (const t of state.traffic) { if (!t.alive) continue; if (Math.hypot(t.x - m.x, t.y - m.y) < m.r + 2.2) { t.alive = false; t.respawnT = 4 + rng() * 3; m.armed = false; state.explosions.push({ x: m.x, y: m.y, t: 0 }); break; } }
      if (!m.armed) continue;
      for (const p of state.police) { if (!p.alive) continue; if (Math.hypot(p.x - m.x, p.y - m.y) < m.r + 2.2) { p.alive = false; p.onFoot = false; p.state = 'patrol'; p.respawnT = 4 + rng() * 3; m.armed = false; state.explosions.push({ x: m.x, y: m.y, t: 0 }); break; } }
    }
    for (let i = state.mines.length - 1; i >= 0; i--) if (!state.mines[i].armed && state.mines[i].t > 0.5) state.mines.splice(i, 1);
  }
  function updateBullets(dt) {
    for (const b of state.bullets) {
      b.x += Math.cos(b.angle) * b.speed * dt; b.y += Math.sin(b.angle) * b.speed * dt; b.life -= dt;
      if (b.life <= 0) { b.dead = true; continue; }
      if (world.bulletHitsBuilding(b.x, b.y)) b.dead = true;
      if (b.dead) continue;
      for (const t of state.traffic) { if (!t.alive) continue; if (Math.hypot(t.x - b.x, t.y - b.y) < 2.4) { t.alive = false; t.respawnT = 4 + rng() * 3; b.dead = true; state.explosions.push({ x: t.x, y: t.y, t: 0 }); break; } }
      if (b.dead) continue;
      for (const p of state.police) { if (!p.alive) continue; if (Math.hypot(p.x - b.x, p.y - b.y) < 2.4) { p.alive = false; p.onFoot = false; p.state = 'patrol'; p.respawnT = 4 + rng() * 3; b.dead = true; state.explosions.push({ x: p.x, y: p.y, t: 0 }); break; } }
    }
    for (let i = state.bullets.length - 1; i >= 0; i--) if (state.bullets[i].dead) state.bullets.splice(i, 1);
  }
  function updatePickups(dt) {
    if (player.wasted || player.busted) return;
    for (const p of state.pickups) {
      if (!p.alive) continue;
      if (Math.hypot(p.x - player.x, p.y - player.y) < 2.2) {
        if (p.type === 'ammo') { state.ammo += 6; spawnPopup(p.x, p.y, '+6 Kogels', '#ffe066'); p.respawnT = 2 + rng() * 2; }
        else if (p.type === 'mine') { state.mineCount += 2; spawnPopup(p.x, p.y, '+2 Mijnen', '#ff8f5a'); p.respawnT = 2 + rng() * 2; }
        else if (p.type === 'shirt') { player.shirtImmuneT = SHIRT_IMMUNITY_TIME; spawnPopup(p.x, p.y, (world.city.club?.shirtLabel || 'Clubshirt') + '! 40 sec onschendbaar', '#f74747'); p.respawnT = 90; emit('shirt', {}); }
        else { player.policeImmuneT = BEER_IMMUNITY_TIME; spawnPopup(p.x, p.y, 'Proost! 20 sec beschermd', '#ffd23a'); p.respawnT = 90; }
        p.alive = false;
      }
    }
    for (const p of state.pickups) {
      if (p.alive) continue;
      p.respawnT -= dt;
      if (p.respawnT <= 0) { if (p.type === 'beer' || p.type === 'shirt') { p.x = p.homeX; p.y = p.homeY; p.alive = true; } else placePickupNearPlayer(p); }
    }
  }

  function update(dt) {
    state.simTime += dt;
    state.mineCooldown = Math.max(0, state.mineCooldown - dt); state.shootCooldown = Math.max(0, state.shootCooldown - dt);
    updatePlayer(dt);
    updateTraffic(dt);
    updatePolice(dt);
    updateMines(dt);
    updateBullets(dt);
    updatePickups(dt);
    courier.update(dt, player);
    const raceEvent = race.update(dt, player);
    if (raceEvent) emit('race', { result: raceEvent });
    for (const ex of state.explosions) ex.t += dt;
    for (let i = state.explosions.length - 1; i >= 0; i--) if (state.explosions[i].t > 0.6 + ((state.explosions[i].big) ? 0.6 : 0)) state.explosions.splice(i, 1);
    for (const pu of state.popups) pu.t += dt;
    for (let i = state.popups.length - 1; i >= 0; i--) if (state.popups[i].t > 1.1) state.popups.splice(i, 1);
  }

  function nearestStreetName() {
    let best = null, bestD = 30;
    for (const r of roads) { if (!r.name) continue; for (const p of r.pts) { const d = Math.hypot(p.x - player.x, p.y - player.y); if (d < bestD) { bestD = d; best = r.name; } } }
    return best;
  }

  return {
    state, keys, setKey, clearKeys, drainEvents, update, resetGame, placeMine, shoot, toggleEnterExit,
    startMission: () => race.state.status !== 'active' && courier.start(player),
    startRace: () => courier.state.status !== 'active' && race.start(player), nearestEnterable,
    trafficLights, lightGroupState, stopLines, sharkTeeth, zebras, nearestStreetName,
    CAR_PHYS, WANTED_CLEAR_TIME, POLICE_HITS_TO_BUST, BEER_IMMUNITY_TIME,
  };
}
