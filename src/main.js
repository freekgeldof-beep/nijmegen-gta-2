import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { loadData, buildWorld } from './world.js';
import { createGameState } from './entities.js';
import { buildStaticWorld, buildRoadMarkings, buildRadarGeometry, buildTreeLayer, buildStreetFurnitureLayer } from './renderWorld.js';
import { EntityLayer, makeGlowTexture } from './renderEntities.js';
import { createHUD } from './hud.js';
import { createStepper } from './timing.js';
import { createOnline } from './online.js';
import { createAudio } from './audio.js';
import { loadCity, applyCity } from './city.js';
import { createCityMap } from './cityMap.js';

const $ = (id) => document.getElementById(id);

async function main() {
  const city = await loadCity();
  applyCity(city);
  if (!city.configured) {
    $('overlay').hidden = true;
    $('loading').hidden = true;
    $('setup').hidden = false;
    return;
  }
  const app = new Application();
  await app.init({ resizeTo: window, backgroundColor: 0x0a0a0f, antialias: true, preference: 'webgl' });
  document.getElementById('gameCanvasHolder').appendChild(app.canvas);

  const raw = await loadData(city);
  const world = buildWorld(raw);
  const sim = createGameState(world);
  sim.drainEvents();
  const hud = createHUD(sim, city);
  const audio = createAudio();
  const stepper = createStepper();

  const worldContainer = new Container();
  app.stage.addChild(worldContainer);

  const { root: staticRoot, markingLayer, overpassLayer } = buildStaticWorld(world);
  buildRoadMarkings(markingLayer, sim);
  worldContainer.addChild(staticRoot);
  worldContainer.addChild(buildStreetFurnitureLayer(world));
  const destinationMarker = new Graphics().circle(0, 0, 12).fill({ color: 0xffcb69, alpha: 0.12 }).stroke({ color: 0xffcb69, width: 0.6 });
  destinationMarker.visible = false;
  worldContainer.addChild(destinationMarker);

  // ---------- Straatverlichting (gloed bij echte verkeerslicht-kruispunten) ----------
  const glowTex = makeGlowTexture();
  const streetLightLayer = new Container();
  for (const [nodeId] of sim.trafficLights) {
    const node = world.nodesById.get(nodeId);
    const spr = new Sprite(glowTex);
    spr.anchor.set(0.5, 0.5);
    spr.scale.set(0.28, 0.28);
    spr.position.set(node.x, node.y);
    spr.blendMode = 'add';
    spr.alpha = 0;
    streetLightLayer.addChild(spr);
  }
  worldContainer.addChild(streetLightLayer);

  // ---------- Dynamische entiteiten ----------
  const entityLayer = new EntityLayer(city);
  worldContainer.addChild(entityLayer.container);
  const online = createOnline(sim, hud, worldContainer, audio, city);

  // ---------- Gebouwen met doorgang (boven de auto's -- je rijdt er onderdoor) ----------
  worldContainer.addChild(overpassLayer);

  // ---------- Bomen (boven de auto's -- je rijdt er visueel onderdoor) ----------
  worldContainer.addChild(buildTreeLayer(world));

  // ---------- Verkeerslicht-stipjes (kleur wisselt) ----------
  const lightDots = [];
  for (const [nodeId, lt] of sim.trafficLights) {
    const node = world.nodesById.get(nodeId);
    for (const e of node.edges) {
      const group = lt.groupOf.get(e.id);
      const dir = world.edgeDirFromNode(e, nodeId, node.x, node.y);
      const x = node.x + dir.x * 4.5, y = node.y + dir.y * 4.5;
      lightDots.push({ nodeId, group, x, y });
    }
  }
  const lightDotLayer = new Container();
  const greenTex = makeDotTexture('#3ad24a');
  const redTex = makeDotTexture('#e13a3a');
  for (const ld of lightDots) {
    const spr = new Sprite(greenTex);
    spr.anchor.set(0.5, 0.5);
    spr.scale.set(1 / 24, 1 / 24);
    spr.position.set(ld.x, ld.y);
    ld.sprite = spr;
    lightDotLayer.addChild(spr);
  }
  worldContainer.addChild(lightDotLayer);

  // ---------- Nacht-overlay (schermruimte, buiten de camera) ----------
  const nightOverlay = new Graphics();
  nightOverlay.rect(0, 0, app.screen.width, app.screen.height).fill({ color: 0x0a1030 });
  nightOverlay.alpha = 0;
  nightOverlay.eventMode = 'none';
  app.stage.addChild(nightOverlay);
  app.renderer.on('resize', () => {
    nightOverlay.clear().rect(0, 0, app.screen.width, app.screen.height).fill({ color: 0x0a1030 });
  });

  // Screen-space glow is drawn above the night tint so headlights remain bright.
  const lightOverlay = new Container();
  lightOverlay.eventMode = 'none';
  app.stage.addChild(lightOverlay);
  const lightPool = [];
  function syncLightOverlay(nightFactor) {
    let count = 0;
    if (nightFactor > 0.03) {
      const litCars = online.active ? [sim.state.player] : [...sim.state.traffic, ...sim.state.police, sim.state.player];
      for (const car of litCars) {
        if (car.alive === false || car.onFoot || car.mode === 'foot' || car.wasted) continue;
        const nose = (car.w || 4.2) * 0.65;
        const x = car.x + Math.cos(car.angle) * nose;
        const y = car.y + Math.sin(car.angle) * nose;
        const sx = (x - camera.x) * pixelsPerMeter + app.screen.width / 2;
        const sy = (y - camera.y) * pixelsPerMeter + app.screen.height / 2;
        if (sx < -70 || sy < -70 || sx > app.screen.width + 70 || sy > app.screen.height + 70) continue;
        let glow = lightPool[count];
        if (!glow) {
          glow = new Sprite(glowTex);
          glow.anchor.set(0.5);
          glow.blendMode = 'add';
          lightPool.push(glow);
          lightOverlay.addChild(glow);
        }
        glow.visible = true;
        glow.position.set(sx, sy);
        glow.scale.set(0.8, 0.45);
        glow.rotation = car.angle;
        glow.tint = car.isPolice ? (Math.floor(sim.state.simTime * 5) % 2 ? 0x4579ff : 0xff5555) : 0xffe3a0;
        glow.alpha = nightFactor * (car === sim.state.player ? 0.75 : 0.46);
        count++;
      }
    }
    for (let i = count; i < lightPool.length; i++) lightPool[i].visible = false;
  }

  // ---------- Radar (ronde minimap, linksonder) ----------
  const RADAR_DIAM = 150, RADAR_R = RADAR_DIAM / 2, RADAR_WORLD_R = 280;
  const radarScale = RADAR_R / RADAR_WORLD_R;
  const radarContainer = new Container();
  radarContainer.eventMode = 'none';
  const radarBg = new Graphics().circle(0, 0, RADAR_R).fill({ color: 0x14140f, alpha: 0.85 });
  const radarMask = new Graphics().circle(0, 0, RADAR_R).fill({ color: 0xffffff });
  const radarContent = new Container();
  radarContent.mask = radarMask;
  const radarWorldGraphics = buildRadarGeometry(world);
  radarContent.addChild(radarWorldGraphics);
  const radarBlipLayer = new Container();
  radarContent.addChild(radarBlipLayer);
  const radarBorder = new Graphics().circle(0, 0, RADAR_R).stroke({ width: 3, color: 0xffcf4d });
  const radarArrow = new Graphics();
  radarArrow.poly([0, -6, 4, 5, 0, 2.5, -4, 5]).fill({ color: 0x3ad2ff }).stroke({ width: 1, color: 0x0a1030 });
  const objectiveArrow = new Graphics().poly([0, -5, 5, 0, 0, 5, -5, 0]).fill({ color: 0xffcb69 });
  objectiveArrow.visible = false;
  radarContainer.addChild(radarBg, radarMask, radarContent, radarBorder, radarArrow, objectiveArrow);
  app.stage.addChild(radarContainer);
  function layoutRadar() {
    const slot = $('radarSlot').getBoundingClientRect();
    const size = Math.min(slot.width, slot.height) - 8;
    radarContainer.scale.set(size / RADAR_DIAM);
    radarContainer.position.set(slot.left + slot.width / 2, slot.top + slot.height / 2);
  }
  layoutRadar();
  app.renderer.on('resize', layoutRadar);
  const radarObserver = new ResizeObserver(layoutRadar);
  radarObserver.observe($('radarSlot'));
  const radarBlipTexRed = makeDotTexture('#ff3b3b');
  const radarBlipTexGold = makeDotTexture('#ffd36b');
  const radarBlipPool = [];
  function syncRadarBlips() {
    const wantedNow = sim.state.player.wanted;
    const visible = online.active ? (online.snapshot?.players || []).filter(p => p.id !== online.snapshot?.self && !p.dead) : wantedNow ? sim.state.police.filter(p => p.alive) : [];
    while (radarBlipPool.length < visible.length) {
      const s = new Sprite(radarBlipTexRed); s.anchor.set(0.5, 0.5); s.scale.set(1 / 24 * 7, 1 / 24 * 7);
      radarBlipPool.push(s); radarBlipLayer.addChild(s);
    }
    for (let i = 0; i < radarBlipPool.length; i++) {
      const s = radarBlipPool[i];
      if (i < visible.length) {
        s.visible = true; s.position.set(visible[i].x, visible[i].y);
        s.texture = online.active && visible[i].id === online.snapshot?.case?.carrierId ? radarBlipTexGold : radarBlipTexRed;
      }
      else s.visible = false;
    }
  }

  // ---------- Camera / zoom ----------
  let pixelsPerMeter = 9;
  function zoom(f) { pixelsPerMeter = Math.max(3.5, Math.min(20, pixelsPerMeter * f)); }

  const camera = { x: sim.state.player.x, y: sim.state.player.y };
  let paused = false;
  const steadyCamera = $('steadyCamera');
  steadyCamera.checked = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function setPaused(value) {
    paused = value;
    audio.setPaused(value);
    if (value) online.clearKeys();
    sim.clearKeys(); stepper.reset();
    $('pause').hidden = !paused;
    $('overlay').inert = paused;
    if (paused) $('resumeButton').focus(); else document.activeElement?.blur();
  }
  const cityMap = createCityMap(world, sim, setPaused);
  $('mapButton').addEventListener('click', () => cityMap.open());
  $('menuButton').addEventListener('click', () => setPaused(true));
  $('resumeButton').addEventListener('click', () => setPaused(false));
  $('resetButton').addEventListener('click', () => { sim.resetGame(); setPaused(false); });
  function startMission() {
    if (sim.startMission()) { hud.notify('LADING AAN BOORD · Volg het gouden doel op je radar'); document.activeElement?.blur(); }
  }
  $('missionButton').addEventListener('click', startMission);
  function startRace() {
    if (sim.startRace()) { hud.notify('RACE GESTART · VOLG DE GOUDEN CHECKPOINTS'); document.activeElement?.blur(); }
    else hud.notify(sim.state.race.reason || 'Voltooi eerst je koeriersrit.');
  }
  $('raceButton').addEventListener('click', startRace);
  window.addEventListener('keydown', e => {
    if (cityMap.isOpen()) { if (e.key === 'Escape' || e.key.toLowerCase() === 'g') { e.preventDefault(); cityMap.close(); } return; }
    if (e.key.toLowerCase() === 'g' && !e.repeat && !e.target.closest('input,select,textarea')) { cityMap.open(); return; }
    if (e.key === 'Escape') { e.preventDefault(); if (!e.repeat) setPaused(!paused); return; }
    if (paused) {
      if (e.key === 'Tab') {
        const items = [...$('pause').querySelectorAll('button,input')];
        const first = items[0], last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      return;
    }
    if (e.target.closest('button,input,select') || !$('onlinePanel').hidden) return;
    audio.unlock();
    if (e.key.toLowerCase() === 'a') { if (sim.state.player.mode === 'car' && !sim.state.player.wasted) audio.setHorn(true); return; }
    if (e.key.toLowerCase() === 's' && !e.repeat) { if (sim.state.player.mode === 'car' && !sim.state.player.wasted) audio.toggleSiren(); return; }
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
    if (online.active) { online.key(e.key, true, e.repeat); return; }
    sim.setKey(e.key, true);
    if (e.key.toLowerCase() === 'q') sim.placeMine();
    if (e.key.toLowerCase() === 'w') sim.shoot();
    if (e.repeat) return;
    if (e.key === ' ' || e.code === 'Space') sim.toggleEnterExit();
    if (e.key.toLowerCase() === 'm') startMission();
    if (e.key.toLowerCase() === 'l') startRace();
    if (e.key.toLowerCase() === 'n') {
      dayClock = DAY_CYCLE_SECONDS * (dayClock / DAY_CYCLE_SECONDS > 0.68 || dayClock / DAY_CYCLE_SECONDS < 0.20 ? 0.46 : 0.86);
      hud.notify(dayClock / DAY_CYCLE_SECONDS > 0.68 ? 'AVOND IN EINDHOVEN' : 'DAGLICHT IN EINDHOVEN');
    }
    if (e.key.toLowerCase() === 'o') zoom(0.82);
    if (e.key.toLowerCase() === 'p') zoom(1 / 0.82);
  });
  window.addEventListener('keyup', e => { if (e.key.toLowerCase() === 'a') audio.setHorn(false); if (online.active) online.key(e.key, false); else sim.setKey(e.key, false); });
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  window.addEventListener('blur', () => setPaused(true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

  // ---------- Dag/nacht-cyclus ----------
  const DAY_CYCLE_SECONDS = 300; // volledige dag-nachtcyclus (spelversneld)
  let dayClock = DAY_CYCLE_SECONDS * 0.28; // start rond de ochtend

  function formatClock(frac) {
    const totalMin = Math.floor(frac * 24 * 60) % (24 * 60);
    const h = Math.floor(totalMin / 60), m = totalMin % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  document.getElementById('loading').style.display = 'none';

  let last = performance.now();
  let heardExplosions = new WeakSet();
  app.ticker.add(() => {
    const now = performance.now();
    const elapsed = Math.min(0.15, (now - last) / 1000);
    last = now;

    if (paused) return;
    const dt = stepper.advance(elapsed, step => {
      if (online.active) return;
      if (sim.keys.w || sim.keys.W) sim.shoot();
      sim.update(step);
      for (const event of sim.drainEvents()) {
        audio.effect(event.type);
        if (event.type === 'shirt') hud.notify((city.club?.shirtLabel || 'CLUBSHIRT') + ' · 40 SECONDEN ONSCHENDBAAR');
        if (event.type === 'escaped') hud.notify('ONTSNAPT · De kust is veilig');
        if (event.type === 'race' && event.result === 'checkpoint') hud.notify('CHECKPOINT · +22 SECONDEN');
        if (event.type === 'race' && event.result === 'complete') hud.notify(`FINISH · ${sim.state.race.elapsed.toFixed(1)} SECONDEN`);
        if (event.type === 'race' && event.result === 'failed') hud.notify(`RACE MISLUKT · ${sim.state.race.reason}`);
        if (event.type === 'resetGame' || event.type === 'bustedResolved') {
          camera.x = sim.state.player.x; camera.y = sim.state.player.y;
          sim.clearKeys();
        }
      }
    });
    if (online.active) online.render(elapsed);
    else for (const explosion of sim.state.explosions) {
      if (!heardExplosions.has(explosion)) { heardExplosions.add(explosion); audio.effect('explosion'); }
    }
    if (sim.state.player.mode !== 'car' || sim.state.player.wasted) audio.stopVehicleSounds();
    audio.update(now / 1000);

    // dag/nacht
    dayClock = (dayClock + dt) % DAY_CYCLE_SECONDS;
    const dayFrac = dayClock / DAY_CYCLE_SECONDS; // 0..1, 0=middernacht
    const sunHeight = Math.sin(dayFrac * Math.PI * 2 - Math.PI / 2); // -1 (nacht) .. 1 (middag)
    const nightFactor = Math.max(0, Math.min(1, (0.05 - sunHeight) / 0.5));
    nightOverlay.alpha = nightFactor * 0.62;
    entityLayer.nightFactor = nightFactor;
    for (const spr of streetLightLayer.children) spr.alpha = nightFactor * 0.85;
    hud.update(dt, formatClock(dayFrac));
    if (online.active) {
      $('mission').hidden = true; $('racePanel').hidden = true; $('police').hidden = true; $('contextHint').hidden = true;
      $('targetDistance').textContent = `ONLINE · ${online.snapshot?.players.length || 0} SPELERS ZICHTBAAR`;
    }

    // camera
    const player = sim.state.player;
    if (online.active && Math.hypot(camera.x - player.x, camera.y - player.y) > 70) { camera.x = player.x; camera.y = player.y; }
    const lookAhead = steadyCamera.checked || player.mode !== 'car' ? 0 : Math.max(-10, Math.min(24, player.speed * .55));
    const ease = 1 - Math.exp(-7 * elapsed);
    camera.x += (player.x + Math.cos(player.angle) * lookAhead - camera.x) * ease;
    camera.y += (player.y + Math.sin(player.angle) * lookAhead - camera.y) * ease;
    worldContainer.pivot.set(camera.x, camera.y);
    const mission = sim.state.mission;
    const race = sim.state.race;
    const chase = online.snapshot?.case;
    const carrier = chase?.carrierId && online.snapshot?.players.find(p => p.id === chase.carrierId);
    const onlineTarget = chase?.phase === 'ground' ? chase : chase?.phase === 'carried'
      ? chase.carrierId === online.snapshot?.self ? chase.target : carrier : null;
    const target = online.active ? onlineTarget : race.status === 'active' ? race.checkpoints[race.index] : mission.status === 'active' ? mission.target : null;
    destinationMarker.visible = !!target;
    objectiveArrow.visible = !!target;
    if (target) {
      destinationMarker.position.set(target.x, target.y);
      const dx = (target.x - player.x) * radarScale, dy = (target.y - player.y) * radarScale;
      const factor = Math.min(1, (RADAR_R - 10) / Math.max(1, Math.hypot(dx, dy)));
      objectiveArrow.position.set(dx * factor, dy * factor);
    }
    worldContainer.scale.set(pixelsPerMeter, pixelsPerMeter);
    worldContainer.position.set(app.screen.width / 2, app.screen.height / 2);
    if (online.active) online.layoutLabels({ camera, scale: pixelsPerMeter, width: app.screen.width, height: app.screen.height });

    // radar
    radarContent.pivot.set(sim.state.player.x, sim.state.player.y);
    radarContent.scale.set(radarScale, radarScale);
    radarContent.position.set(0, 0);
    radarArrow.rotation = sim.state.player.angle + Math.PI / 2;
    syncRadarBlips();

    // verkeerslichten
    for (const ld of lightDots) {
      const st = sim.lightGroupState(ld.nodeId, ld.group, sim.state.simTime);
      ld.sprite.texture = st === 'green' ? greenTex : redTex;
    }

    // entiteiten
    entityLayer.syncTraffic(online.active ? [] : sim.state.traffic, online.active ? [] : sim.state.police);
    entityLayer.syncParked(online.active ? [] : sim.state.parkedCars);
    entityLayer.syncPlayer(sim.state.player);
    entityLayer.syncDrivingEffects(sim.state.player, sim.state.simTime);
    entityLayer.syncMines(online.active ? [] : sim.state.mines);
    entityLayer.syncPickups(online.active ? [] : sim.state.pickups, now);
    entityLayer.syncBullets(online.active ? [] : sim.state.bullets);
    entityLayer.syncExplosions(online.active ? [] : sim.state.explosions);
    entityLayer.syncPopups(online.active ? [] : sim.state.popups);
    syncLightOverlay(nightFactor);


  });
}

function makeDotTexture(color) {
  const size = 24;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); g.translate(size / 2, size / 2);
  g.fillStyle = color; g.beginPath(); g.arc(0, 0, size * 0.4, 0, Math.PI * 2); g.fill();
  return Texture.from(c);
}

main().catch(err => {
  console.error(err);
  document.getElementById('loading').textContent = 'Fout bij laden: ' + err.message;
  document.getElementById('loading').style.display = 'flex';
});
