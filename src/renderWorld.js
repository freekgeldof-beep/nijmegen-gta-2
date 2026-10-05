import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import {
  makeAsphaltTexture, makeCurbTexture, makePedestrianTexture, makeGrassTexture,
  makeWaterTexture, makeGroundTexture, makeBuildingTextures, makeChurchTexture,
  fillMatrixForTile, ASPHALT_TILE_M, CURB_TILE_M, GRASS_TILE_M, WATER_TILE_M, BUILDING_TILE_M,
} from './textures.js';

const BUILDING_PALETTE = [
  ['#b99a6b', '#7c6339'], ['#a7876a', '#6d5540'], ['#8f9a83', '#5c6650'],
  ['#c2b280', '#8a7c4f'], ['#9c8170', '#63493d'], ['#7d8a94', '#4d5760'],
  ['#b58463', '#734f36'], ['#8a9b7d', '#556b4a'], ['#c79a6b', '#835f3c'],
];

export function buildStaticWorld(world) {
  const textures = {
    asphalt: makeAsphaltTexture(),
    curb: makeCurbTexture(),
    ped: makePedestrianTexture(),
    grass: makeGrassTexture(),
    water: makeWaterTexture(),
    ground: makeGroundTexture(),
    church: makeChurchTexture(),
    buildings: makeBuildingTextures(BUILDING_PALETTE),
  };

  const root = new Container();

  // ---------- Grond ----------
  const groundLayer = new Graphics();
  const gb = groundBounds(world);
  groundLayer.rect(gb.minX, gb.minY, gb.maxX - gb.minX, gb.maxY - gb.minY)
    .fill({ texture: textures.ground, matrix: fillMatrixForTile(6) });
  root.addChild(groundLayer);

  const parcelLayer = new Graphics();
  const parcelColors = [0x688863, 0x907e68, 0x647e75];
  for (const patch of world.groundPatches) {
    parcelLayer.rect(patch.x, patch.y, patch.w, patch.h).fill({ color: parcelColors[patch.style], alpha: .88 });
    parcelLayer.rect(patch.x + 1.3, patch.y + 1.3, patch.w - 2.6, patch.h - 2.6)
      .stroke({ color: 0xa7ae98, width: .22, alpha: .24 });
    if (patch.style === 0) {
      for (const [dx, dy] of [[7, 7], [26, 10], [12, 24], [28, 25]]) {
        parcelLayer.circle(patch.x + dx, patch.y + dy, 2.1).fill({ color: 0x365e40, alpha: .85 });
        parcelLayer.circle(patch.x + dx - .5, patch.y + dy - .6, 1.25).fill({ color: 0x83aa66, alpha: .82 });
      }
    } else if (patch.style === 1) {
      for (const dy of [9, 18, 27]) parcelLayer.moveTo(patch.x + 2, patch.y + dy)
        .lineTo(patch.x + patch.w - 2, patch.y + dy).stroke({ color: 0xe5d4b9, width: .2, alpha: .34 });
      parcelLayer.rect(patch.x + 13, patch.y + 12, 8, 7).fill({ color: 0x537d65, alpha: .8 });
    } else {
      parcelLayer.roundRect(patch.x + 6, patch.y + 5, 22, 22, 2)
        .stroke({ color: 0xb6c2a7, width: .4, alpha: .45 });
      parcelLayer.circle(patch.x + 17, patch.y + 16, 4.5).fill({ color: 0x3d6a50, alpha: .9 });
    }
  }
  root.addChild(parcelLayer);

  // ---------- Parken/bos ----------
  const greenLayer = new Graphics();
  for (const g of world.greens) {
    greenLayer.poly(flat(g.pts)).fill({ texture: textures.grass, matrix: fillMatrixForTile(GRASS_TILE_M) });
  }
  root.addChild(greenLayer);

  // ---------- Water ----------
  const waterLayer = new Graphics();
  for (const w of world.waters) {
    waterLayer.poly(flat(w.pts)).fill({ texture: textures.water, matrix: fillMatrixForTile(WATER_TILE_M) });
  }
  for (const line of world.waterLines) {
    strokePolyline(waterLayer, line.pts, 1);
    waterLayer.stroke({ color: 0x253f4d, width: line.width + 2.2, cap: 'round', join: 'round' });
    strokePolyline(waterLayer, line.pts, 1);
    waterLayer.stroke({ texture: textures.water, matrix: fillMatrixForTile(WATER_TILE_M), width: line.width, cap: 'round', join: 'round' });
  }
  root.addChild(waterLayer);

  // ---------- Wegen + kruispunten ----------
  const roadLayer = new Graphics();
  for (const node of world.nodesById.values()) {
    if (!node.curbR) continue;
    roadLayer.circle(node.x, node.y, node.curbR).fill({ texture: textures.curb, matrix: fillMatrixForTile(CURB_TILE_M) });
  }
  for (const r of world.roads) {
    if (r.pts.length < 2) continue;
    const isPed = r.hw === 'pedestrian' || r.hw === 'living_street';
    const width = world.roadWidth(r) + 3.4;
    if (!isPed) {
      strokePolyline(roadLayer, r.pts, width);
      roadLayer.stroke({ texture: textures.curb, matrix: fillMatrixForTile(CURB_TILE_M), width, cap: 'butt', join: 'round' });
    }
  }
  for (const node of world.nodesById.values()) {
    if (!node.asphR) continue;
    const tex = node.hasPed ? textures.ped : textures.asphalt;
    const tile = node.hasPed ? CURB_TILE_M : ASPHALT_TILE_M;
    roadLayer.circle(node.x, node.y, node.asphR).fill({ texture: tex, matrix: fillMatrixForTile(tile) });
  }
  for (const r of world.roads) {
    if (r.pts.length < 2) continue;
    const isPed = r.hw === 'pedestrian' || r.hw === 'living_street';
    const width = world.roadWidth(r);
    const tex = isPed ? textures.ped : textures.asphalt;
    const tile = isPed ? CURB_TILE_M : ASPHALT_TILE_M;
    strokePolyline(roadLayer, r.pts, width);
    roadLayer.stroke({ texture: tex, matrix: fillMatrixForTile(tile), width, cap: 'butt', join: 'round' });
    if (!isPed) {
      // Markeringen stoppen vóór het kruispunt (anders loopt de middenstreep
      // dwars door de kruising); bij een gewone bocht (2 wegen) doorlopen ze.
      const trimS = junctionTrim(world, r.nodeStart), trimE = junctionTrim(world, r.nodeEnd);
      const markPts = trimPolyline(r.pts, trimS, trimE, r.len);
      if (markPts) {
        strokeDashedPolyline(roadLayer, markPts, 3, 2.4);
        roadLayer.stroke({ width: width > 13 ? 0.9 : 0.6, color: 0xffe08c, alpha: 0.55, cap: 'butt' });
        if (r.hw === 'primary' || r.hw === 'secondary') {
          for (const side of [-1, 1]) {
            const edgePts = offsetPolyline(markPts, side * (width / 2 - 0.5));
            strokePolyline(roadLayer, edgePts, 1);
            roadLayer.stroke({ width: 0.35, color: 0xf5f0dc, alpha: 0.45 });
          }
        }
      }
    }
  }
  // Randlijn rond de kruising, alleen in de openingen tussen de aansluitende wegen.
  for (const node of world.nodesById.values()) drawJunctionRim(roadLayer, world, node);
  root.addChild(roadLayer);

  // ---------- Spoorrails ----------
  const railLayer = new Graphics();
  for (const rail of world.railLines) {
    if (rail.length < 2) continue;
    strokePolyline(railLayer, rail, 1);
    railLayer.stroke({ width: 3.6, color: 0x6b5f4a, alpha: 0.55, cap: 'round' });
    strokeDashedPolyline(railLayer, rail, 0.7, 1.1);
    railLayer.stroke({ width: 3.0, color: 0x8a8478, alpha: 0.9, cap: 'butt' });
    for (const side of [-1, 1]) {
      const edge = offsetPolyline(rail, side * 0.65);
      strokePolyline(railLayer, edge, 1);
      railLayer.stroke({ width: 0.35, color: 0xc9c2ae, alpha: 0.9 });
    }
  }
  root.addChild(railLayer);

  // ---------- Parkeerterreinen ----------
  root.addChild(buildParkingLots(world));

  // ---------- Wegmarkeringen ----------
  const markingLayer = new Graphics();
  root.addChild(markingLayer);

  // ---------- Gebouwen ----------
  const buildingLayer = new Graphics();
  const churchIconLayer = new Graphics();
  const churchLabelLayer = new Container();
  // Gebouwen met een doorgang over de weg: apart, boven de voertuigen en
  // halfdoorzichtig getekend, zodat je er zichtbaar onderdoor rijdt.
  const overpassLayer = new Graphics();
  for (const b of world.buildings) {
    if (!b.overRoad) continue;
    const tex = textures.buildings[b.palIdx];
    overpassLayer.poly(flat(b.pts)).fill({ texture: tex, matrix: fillMatrixForTile(BUILDING_TILE_M), alpha: 0.55 });
    overpassLayer.poly(flat(b.pts)).stroke({ width: 1.3, color: hexColor(b.roof), alpha: 0.9 });
  }
  for (const b of world.buildings) {
    if (b.isLandmark || b.overRoad) continue;
    // schaduw
    buildingLayer.poly(flat(b.pts.map(p => ({ x: p.x + 0.6, y: p.y + 0.6 })))).fill({ color: 0x000000, alpha: 0.18 });
  }
  for (const b of world.buildings) {
    if (b.isLandmark || b.overRoad) continue;
    const tex = b.isChurch ? textures.church : textures.buildings[b.palIdx];
    buildingLayer.poly(flat(b.pts)).fill({ texture: tex, matrix: fillMatrixForTile(BUILDING_TILE_M) });
    buildingLayer.poly(flat(b.pts)).stroke({ width: 1.3, color: hexColor(b.roof) });
    if (b.big && !b.isChurch) {
      const w = b.maxX - b.minX, h = b.maxY - b.minY;
      for (const v of b.vents) {
        const vx = b.cx + v.ox * w, vy = b.cy + v.oy * h;
        buildingLayer.rect(vx - v.s / 2, vy - v.s / 2, v.s, v.s).fill({ color: 0x000000, alpha: 0.32 });
      }
    }
    if (b.isChurch) {
      churchIconLayer.poly(flat([
        { x: b.cx, y: b.cy - 4.2 }, { x: b.cx + 2.2, y: b.cy - 1.2 }, { x: b.cx - 2.2, y: b.cy - 1.2 },
      ])).fill({ color: 0x8a5a3a });
      churchIconLayer.moveTo(b.cx, b.cy - 6.4).lineTo(b.cx, b.cy - 3.6)
        .moveTo(b.cx - 1, b.cy - 5).lineTo(b.cx + 1, b.cy - 5)
        .stroke({ width: 0.25, color: 0x3a2a1a });
      if (b.name) churchLabelLayer.addChild(makeWorldLabel(b.name, b.cx, b.cy - 7.5, '#fff5d6', '#1a1208'));
    }
  }
  root.addChild(buildingLayer);
  root.addChild(churchIconLayer);
  root.addChild(churchLabelLayer);

  // Bridge decks and guardrails remain distinct over the water.
  const bridgeRails = new Graphics();
  for (const road of world.roads) {
    if (!road.bridge) continue;
    for (const side of [-1,1]) {
      const edge=offsetPolyline(road.pts,side*(world.roadWidth(road)/2-.6));
      strokePolyline(bridgeRails,edge,1);bridgeRails.stroke({width:.45,color:0xc3d6d6,alpha:.85});
    }
  }
  root.addChild(bridgeRails);

  // ---------- Iconische gebouwen (licht 3D, schaduw-extrusie richting het zuidoosten) ----------
  const landmarkLayer = new Graphics();
  const landmarkLabelLayer = new Container();
  const LANDMARK_STYLE = {
    church:   { roof: 0x8a4b30, wall: 0x40200f, icon: 0xf2e6c9 },
    stadium:  { roof: 0x2e7d4f, wall: 0x37352f, icon: 0xffffff },
    ufo:      { roof: 0xb8c4c9, wall: 0x5c666b, icon: 0x2a3236 },
    tower:    { roof: 0x6fa8c9, wall: 0x2c3a45, icon: 0xe8f2f7 },
    station:  { roof: 0xcdd6da, wall: 0x707d82, icon: 0x2a3236 },
    cityhall: { roof: 0xcbb994, wall: 0x8a765a, icon: 0x3a2a1a },
    museum:   { roof: 0x9c3b2e, wall: 0x4a1712, icon: 0xf2e6c9 },
    blob:     { roof: 0xd4a017, wall: 0x6b4e0d, icon: 0x3a2a08 },
    lyceum:   { roof: 0xa8763e, wall: 0x5c3f1f, icon: 0xf2e6c9 },
    philipsdorp: { roof: 0x9c4a34, wall: 0x51241a, icon: 0xf2e6c9 },
  };
  const SUN_ANGLE = 0.95;
  for (const lm of world.landmarks) {
    if (lm.markerOnly) {
      landmarkLayer.circle(lm.cx, lm.cy, 2.5).fill({color:0xffcc69});
      landmarkLabelLayer.addChild(makeWorldLabel(lm.name, lm.cx, lm.cy - 5, '#fff5d6', '#1a1208'));
      continue;
    }
    const style = LANDMARK_STYLE[lm.cat] || { roof: 0x8a9b7d, wall: 0x556b4a, icon: 0xffffff };
    const off = Math.min(24, Math.max(6, lm.height * 0.3));
    const dx = Math.cos(SUN_ANGLE) * off, dy = Math.sin(SUN_ANGLE) * off;
    const shifted = lm.pts.map(p => ({ x: p.x + dx, y: p.y + dy }));
    for (let i = 0; i < lm.pts.length; i++) {
      const j = (i + 1) % lm.pts.length;
      landmarkLayer.poly(flat([lm.pts[i], lm.pts[j], shifted[j], shifted[i]])).fill({ color: style.wall });
    }
    landmarkLayer.poly(flat(lm.pts)).fill({ color: style.roof });
    landmarkLayer.poly(flat(lm.pts)).stroke({ width: 1.5, color: 0x1a1a1a, alpha: 0.55 });
    drawLandmarkIcon(landmarkLayer, lm, style);
    if (lm.cat === 'stadium') drawStadiumPitch(landmarkLayer, lm);

    landmarkLabelLayer.addChild(makeWorldLabel(lm.name, lm.cx, lm.cy - off - 2.5, '#fff5d6', '#1a1208'));
  }
  root.addChild(landmarkLayer);
  root.addChild(landmarkLabelLayer);

  // ---------- Ring (subtiele markering van het speelveld, geen felle lijn) ----------
  const ringLayer = new Graphics();
  strokeDashedPolyline(ringLayer, [...world.ringPts, world.ringPts[0]], 6, 5);
  ringLayer.stroke({ width: 1.6, color: 0xd8c58a, alpha: 0.35 });
  root.addChild(ringLayer);

  // ---------- Politiebadge ----------
  const badgeLayer = new Graphics();
  drawPoliceBadge(badgeLayer, world.POLICE_STATION.x, world.POLICE_STATION.y - 6);
  root.addChild(badgeLayer);

  return { root, textures, markingLayer, overpassLayer, groundBounds: gb };
}

export function buildRoadMarkings(markingLayer, sim) {
  for (const s of sim.stopLines) {
    markingLayer.moveTo(s.x + Math.cos(s.angle + Math.PI / 2) * s.halfWidth, s.y + Math.sin(s.angle + Math.PI / 2) * s.halfWidth)
      .lineTo(s.x - Math.cos(s.angle + Math.PI / 2) * s.halfWidth, s.y - Math.sin(s.angle + Math.PI / 2) * s.halfWidth)
      .stroke({ width: 0.3, color: 0xebe8de, alpha: 0.45 });
  }
  for (const s of sim.sharkTeeth) {
    const n = Math.max(2, Math.floor(s.halfWidth * 2 / 1.1));
    const perp = { x: Math.cos(s.angle + Math.PI / 2), y: Math.sin(s.angle + Math.PI / 2) };
    const fwd = { x: Math.cos(s.angle), y: Math.sin(s.angle) };
    for (let i = 0; i < n; i++) {
      const t = -s.halfWidth + (i + 0.5) * (s.halfWidth * 2 / n);
      const cx = s.x + perp.x * t, cy = s.y + perp.y * t;
      const p1 = { x: cx + fwd.x * 0.4, y: cy + fwd.y * 0.4 };
      const p2 = { x: cx - fwd.x * 0.28 + perp.x * 0.28, y: cy - fwd.y * 0.28 + perp.y * 0.28 };
      const p3 = { x: cx - fwd.x * 0.28 - perp.x * 0.28, y: cy - fwd.y * 0.28 - perp.y * 0.28 };
      markingLayer.poly(flat([p1, p2, p3])).fill({ color: 0xebe8de, alpha: 0.5 });
    }
  }
  for (const z of sim.zebras) {
    // Een zebrapad bestaat uit banen die IN de rijrichting liggen (je rijdt
    // erover heen), herhaald over de breedte van de weg -- dus lang langs
    // `fwd`, dun en herhaald langs `perp`. (Was per ongeluk 90 graden gedraaid.)
    const perp = { x: Math.cos(z.angle + Math.PI / 2), y: Math.sin(z.angle + Math.PI / 2) };
    const fwd = { x: Math.cos(z.angle), y: Math.sin(z.angle) };
    const stripeW = 0.85, gap = 0.65, crossDepth = 3.4;
    const span = z.halfWidth;
    for (let sx = -span + stripeW / 2; sx <= span - stripeW / 2 + 0.01; sx += stripeW + gap) {
      const cx = z.x + perp.x * sx, cy = z.y + perp.y * sx;
      const p1 = { x: cx + fwd.x * crossDepth / 2 + perp.x * stripeW / 2, y: cy + fwd.y * crossDepth / 2 + perp.y * stripeW / 2 };
      const p2 = { x: cx - fwd.x * crossDepth / 2 + perp.x * stripeW / 2, y: cy - fwd.y * crossDepth / 2 + perp.y * stripeW / 2 };
      const p3 = { x: cx - fwd.x * crossDepth / 2 - perp.x * stripeW / 2, y: cy - fwd.y * crossDepth / 2 - perp.y * stripeW / 2 };
      const p4 = { x: cx + fwd.x * crossDepth / 2 - perp.x * stripeW / 2, y: cy + fwd.y * crossDepth / 2 - perp.y * stripeW / 2 };
      markingLayer.poly(flat([p1, p2, p3, p4])).fill({ color: 0xebebe1, alpha: 0.85 });
    }
  }
}

// Losse laag, boven de auto's/spelers getekend zodat je er "onderdoor" rijdt --
// puur decoratief, geen botsing met de boomstam.
export function buildTreeLayer(world) {
  const g = new Graphics();
  for (const t of world.trees) {
    g.circle(t.x + 0.4, t.y + 0.5, t.r).fill({ color: 0x000000, alpha: 0.16 });
  }
  for (const t of world.trees) {
    g.circle(t.x, t.y, t.r).fill({ color: 0x2f6b34 });
    g.circle(t.x - t.r * 0.3, t.y - t.r * 0.3, t.r * 0.55).fill({ color: 0x3f8a45, alpha: 0.7 });
    g.circle(t.x, t.y, t.r * 0.18).fill({ color: 0x4a3420 });
  }
  return g;
}

export function buildStreetFurnitureLayer(world) {
  const g = new Graphics();
  for (const f of world.streetFurniture) {
    if (f.kind === 'lamp') {
      g.circle(f.x + .35, f.y + .35, .85).fill({ color: 0x081313, alpha: .28 });
      g.circle(f.x, f.y, .63).fill({ color: 0x263b40 }).stroke({ color: 0x80918b, width: .12 });
      g.circle(f.x, f.y, .29).fill({ color: 0xffdf95 });
      continue;
    }
    if (f.kind === 'bin') {
      g.circle(f.x + .22, f.y + .25, .65).fill({ color: 0x000000, alpha: .2 });
      g.circle(f.x, f.y, .56).fill({ color: 0x315b55 }).stroke({ color: 0x8ab2a3, width: .1 });
      g.circle(f.x, f.y, .32).fill({ color: 0x152b2b });
      continue;
    }
    const dx = Math.cos(f.angle), dy = Math.sin(f.angle), nx = -dy, ny = dx;
    const shape = (halfLength, halfWidth) => flat([
      { x: f.x - dx * halfLength - nx * halfWidth, y: f.y - dy * halfLength - ny * halfWidth },
      { x: f.x + dx * halfLength - nx * halfWidth, y: f.y + dy * halfLength - ny * halfWidth },
      { x: f.x + dx * halfLength + nx * halfWidth, y: f.y + dy * halfLength + ny * halfWidth },
      { x: f.x - dx * halfLength + nx * halfWidth, y: f.y - dy * halfLength + ny * halfWidth },
    ]);
    g.poly(shape(1.25, .56)).fill({ color: 0x172225, alpha: .3 });
    g.poly(shape(1.08, .43)).fill({ color: 0x886b4d }).stroke({ color: 0x4b3828, width: .14 });
    for (const shift of [-.15, .15]) {
      g.moveTo(f.x - dx * .95 + nx * shift, f.y - dy * .95 + ny * shift)
        .lineTo(f.x + dx * .95 + nx * shift, f.y + dy * .95 + ny * shift)
        .stroke({ color: 0xc6a579, width: .12 });
    }
  }
  for (const place of world.landmarkDecor || []) {
    const { x, y, kind } = place;
    g.circle(x + .4, y + .5, 2.2).fill({ color: 0x09151a, alpha: .27 });
    g.circle(x, y, 2).fill({ color: 0x9b998b }).stroke({ color: 0xd8d5c8, width: .18 });
    if (kind === 'psv') {
      g.rect(x - 1.5, y - 1.25, .65, 2.5).fill({ color: 0xe72930 });
      g.rect(x - .25, y - 1.25, .65, 2.5).fill({ color: 0xf7f3ec });
      g.rect(x + 1, y - 1.25, .65, 2.5).fill({ color: 0xe72930 });
    } else if (kind === 'station') {
      g.roundRect(x - 1.6, y - 1, 3.2, 2, .22).fill({ color: 0x306b86 })
        .stroke({ color: 0x8bd4df, width: .2 });
      for (const dx of [-.8, 0, .8]) g.circle(x + dx, y + .6, .25).stroke({ color: 0xe7f7f7, width: .13 });
    } else if (kind === 'evoluon') {
      g.ellipse(x, y, 1.5, .75).fill({ color: 0xc4d9d7 }).stroke({ color: 0x63868a, width: .16 });
      g.circle(x, y, .44).fill({ color: 0x77c8db });
    } else if (kind === 'museum') {
      g.poly([x - 1.1, y + 1, x - .3, y - 1.3, x + .45, y + .1, x + 1.2, y - .8, x + .9, y + 1])
        .fill({ color: 0x5b668e }).stroke({ color: 0xe3a768, width: .16 });
    } else {
      for (const dx of [-.8, .8]) {
        g.circle(x + dx, y, .65).fill({ color: 0xb46b36 });
        g.circle(x + dx, y, .43).fill({ color: 0x4a8b4e });
      }
    }
  }
  return g;
}

export function buildParkingLots(world) {
  const g = new Graphics();
  for (const lot of world.parkingLots) {
    const fwd = { x: Math.cos(lot.angle), y: Math.sin(lot.angle) };
    const perp = { x: -fwd.y, y: fwd.x };
    const lotW = lot.cols * lot.bayW, lotD = lot.rows * lot.bayD + lot.aisle;
    const halfW = lotW / 2, halfD = lotD / 2;
    const toWorld = (lx, ly) => ({ x: lot.x + fwd.x * lx + perp.x * ly, y: lot.y + fwd.y * lx + perp.y * ly });
    // asfalt-vlak
    g.poly(flat([toWorld(-halfD, -halfW), toWorld(halfD, -halfW), toWorld(halfD, halfW), toWorld(-halfD, halfW)]))
      .fill({ color: 0x38352f, alpha: 0.9 });
    // parkeervakken: twee rijen, gescheiden door een rijstrook in het midden
    for (let row = 0; row < lot.rows; row++) {
      const rowSign = row === 0 ? -1 : 1;
      const rowCenterD = rowSign * (lot.aisle / 2 + lot.bayD / 2);
      for (let c = 0; c <= lot.cols; c++) {
        const ly = -halfW + c * lot.bayW;
        const a = toWorld(rowCenterD - lot.bayD / 2, ly), b = toWorld(rowCenterD + lot.bayD / 2, ly);
        g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 0.18, color: 0xe8e4d8, alpha: 0.65 });
      }
    }
  }
  return g;
}

function groundBounds(world) {
  const pad = 60;
  return {
    minX: world.ringMinX - pad, maxX: world.ringMaxX + pad,
    minY: world.ringMinY - pad, maxY: world.ringMaxY + pad,
  };
}

// fontSize in "wereld"-eenheden zou een piepklein, wazig lettertype-bitmap
// opleveren zodra de camera inzoomt -- render op echte pixelgrootte en
// schaal daarna terug naar wereldschaal, zodat de tekst altijd scherp blijft.
function makeWorldLabel(text, x, y, fill, strokeColor) {
  const label = new Text({
    text,
    style: new TextStyle({ fill, fontSize: 28, fontFamily: 'Arial', fontWeight: 'bold', stroke: { color: strokeColor, width: 5 } }),
    resolution: 3,
  });
  const labelWorldHeight = 3.6;
  label.scale.set(labelWorldHeight / 28, labelWorldHeight / 28);
  label.anchor.set(0.5, 1);
  label.position.set(x, y);
  return label;
}

function drawStadiumPitch(g, lm) {
  const xs = lm.pts.map(p => p.x), ys = lm.pts.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const pitchW = (maxX - minX) * 0.42, pitchH = (maxY - minY) * 0.6;
  const cx = lm.cx, cy = lm.cy;
  g.rect(cx - pitchW / 2, cy - pitchH / 2, pitchW, pitchH).fill({ color: 0x2f8a52 });
  g.rect(cx - pitchW / 2, cy - pitchH / 2, pitchW, pitchH).stroke({ width: 0.4, color: 0xffffff, alpha: 0.9 });
  g.moveTo(cx, cy - pitchH / 2).lineTo(cx, cy + pitchH / 2).stroke({ width: 0.3, color: 0xffffff, alpha: 0.85 });
  g.circle(cx, cy, pitchH * 0.14).stroke({ width: 0.3, color: 0xffffff, alpha: 0.85 });
  const boxW = pitchW * 0.22, boxH = pitchH * 0.5;
  g.rect(cx - pitchW / 2, cy - boxH / 2, boxW, boxH).stroke({ width: 0.3, color: 0xffffff, alpha: 0.85 });
  g.rect(cx + pitchW / 2 - boxW, cy - boxH / 2, boxW, boxH).stroke({ width: 0.3, color: 0xffffff, alpha: 0.85 });
}

// Hoeveel meter markering bij een weg-uiteinde weggelaten wordt: alleen bij echte
// kruisingen (3+ wegen), tot net voorbij de rand van het asfaltvlak.
function junctionTrim(world, nodeId) {
  const node = world.nodesById.get(nodeId);
  if (!node || node.edges.length < 3 || !node.asphR) return 0;
  return node.asphR + 1;
}
// Knipt `s` meter van het begin en `e` meter van het eind van een polylijn af.
// Geeft null terug als er te weinig overblijft.
function trimPolyline(pts, s, e, len) {
  if (!s && !e) return pts;
  if (len - s - e < 4) return null;
  const out = [];
  let cum = 0;
  const pointAt = (d) => {
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (acc + seg >= d || i === pts.length - 1) {
        const t = seg > 0 ? Math.min(1, (d - acc) / seg) : 0;
        return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
      }
      acc += seg;
    }
    return pts[pts.length - 1];
  };
  out.push(pointAt(s));
  for (let i = 1; i < pts.length; i++) {
    cum += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (cum > s + 0.01 && cum < len - e - 0.01) out.push(pts[i]);
  }
  out.push(pointAt(len - e));
  return out;
}
// Lichte randlijn langs de ronding van een kruising, tussen de aansluitende
// wegen door -- zodat de hoeken net zo netjes ogen als de randen van de weg.
function drawJunctionRim(g, world, node) {
  if (node.edges.length < 3 || !node.asphR) return;
  if (!node.edges.some(e => e.hw === 'primary' || e.hw === 'secondary')) return;
  const arms = [];
  for (const e of node.edges) {
    if (e.hw === 'pedestrian' || e.hw === 'living_street') continue;
    const d = world.edgeDirFromNode(e, node.id, node.x, node.y);
    const half = Math.asin(Math.min(1, (world.roadWidth(e) / 2) / node.asphR));
    arms.push({ a: Math.atan2(d.y, d.x), half });
  }
  if (arms.length < 3) return;
  arms.sort((p, q) => p.a - q.a);
  const r = node.asphR - 0.5;
  for (let i = 0; i < arms.length; i++) {
    const cur = arms[i], next = arms[(i + 1) % arms.length];
    const start = cur.a + cur.half;
    let end = next.a - next.half;
    if (i === arms.length - 1) end += Math.PI * 2;
    if (end - start < 0.15) continue;
    g.moveTo(node.x + Math.cos(start) * r, node.y + Math.sin(start) * r)
      .arc(node.x, node.y, r, start, end)
      .stroke({ width: 0.35, color: 0xf5f0dc, alpha: 0.4 });
  }
}

function flat(pts) { return pts.flatMap(p => [p.x, p.y]); }
function hexColor(cssHex) { return parseInt(cssHex.replace('#', '0x'), 16); }
function strokePolyline(g, pts, width) {
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
}
// Tekent een streepjeslijn langs een polylijn (meerdere korte subpaden --
// een enkele .stroke() erna tekent ze allemaal los van elkaar).
function strokeDashedPolyline(g, pts, dashLen, gapLen) {
  let carry = 0, drawing = true;
  for (let i = 1; i < pts.length; i++) {
    const x1 = pts[i - 1].x, y1 = pts[i - 1].y, x2 = pts[i].x, y2 = pts[i].y;
    const segLen = Math.hypot(x2 - x1, y2 - y1);
    if (segLen < 1e-6) continue;
    let segT0 = 0;
    while (segLen - segT0 > 1e-6) {
      const remaining = (drawing ? dashLen : gapLen) - carry;
      const step = Math.min(remaining, segLen - segT0);
      const t0 = segT0 / segLen, t1 = (segT0 + step) / segLen;
      if (drawing) {
        const sx = x1 + (x2 - x1) * t0, sy = y1 + (y2 - y1) * t0;
        const ex = x1 + (x2 - x1) * t1, ey = y1 + (y2 - y1) * t1;
        g.moveTo(sx, sy).lineTo(ex, ey);
      }
      segT0 += step; carry += step;
      if (carry >= (drawing ? dashLen : gapLen) - 1e-6) { carry = 0; drawing = !drawing; }
    }
  }
}
// Verschuift een polylijn zijwaarts met `dist` meter (positief = links van de rijrichting).
function offsetPolyline(pts, dist) {
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    let dx, dy;
    if (i === 0) { dx = pts[1].x - pts[0].x; dy = pts[1].y - pts[0].y; }
    else if (i === n - 1) { dx = pts[n - 1].x - pts[n - 2].x; dy = pts[n - 1].y - pts[n - 2].y; }
    else { dx = pts[i + 1].x - pts[i - 1].x; dy = pts[i + 1].y - pts[i - 1].y; }
    const l = Math.hypot(dx, dy) || 1;
    out.push({ x: pts[i].x + (-dy / l) * dist, y: pts[i].y + (dx / l) * dist });
  }
  return out;
}

function polySignedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const j = (i + 1) % pts.length; a += pts[i].x * pts[j].y - pts[j].x * pts[i].y; }
  return a / 2;
}
function drawLandmarkIcon(g, lm, style) {
  const { cx, cy } = lm;
  const s = Math.max(6, Math.sqrt(Math.abs(polySignedArea(lm.pts))) * 0.16);
  const col = style.icon;
  switch (lm.cat) {
    case 'church':
      g.moveTo(cx, cy - s * 1.6).lineTo(cx, cy - s * 0.5)
        .moveTo(cx - s * 0.5, cy - s).lineTo(cx + s * 0.5, cy - s)
        .stroke({ width: Math.max(0.5, s * 0.12), color: col });
      break;
    case 'stadium':
      g.ellipse(cx, cy, s * 1.6, s * 1.0).stroke({ width: Math.max(0.6, s * 0.14), color: col, alpha: 0.85 });
      break;
    case 'ufo':
      g.circle(cx, cy, s * 0.9).stroke({ width: Math.max(0.6, s * 0.14), color: col, alpha: 0.85 });
      g.circle(cx, cy, s * 0.35).fill({ color: col, alpha: 0.5 });
      break;
    case 'tower':
      for (let i = -1; i <= 1; i++) {
        g.moveTo(cx + i * s * 0.5, cy - s * 1.4).lineTo(cx + i * s * 0.5, cy + s * 1.4)
          .stroke({ width: Math.max(0.4, s * 0.1), color: col, alpha: 0.6 });
      }
      break;
    case 'station':
      for (let i = -1; i <= 1; i++) {
        g.moveTo(cx - s * 1.6, cy + i * s * 0.5).lineTo(cx + s * 1.6, cy + i * s * 0.5)
          .stroke({ width: Math.max(0.5, s * 0.12), color: col, alpha: 0.6 });
      }
      break;
    case 'cityhall':
      g.moveTo(cx, cy - s * 1.6).lineTo(cx, cy - s * 0.6).stroke({ width: Math.max(0.5, s * 0.14), color: col });
      g.poly(flat([{ x: cx, y: cy - s * 1.6 }, { x: cx + s * 0.9, y: cy - s * 1.3 }, { x: cx, y: cy - s * 1.0 }])).fill({ color: col, alpha: 0.85 });
      break;
    case 'museum':
      g.poly(flat([{ x: cx - s * 0.8, y: cy + s * 0.6 }, { x: cx, y: cy - s * 0.9 }, { x: cx + s * 0.8, y: cy + s * 0.6 }]))
        .stroke({ width: Math.max(0.5, s * 0.14), color: col, alpha: 0.85 });
      break;
    case 'blob':
      g.circle(cx, cy, s * 0.8).fill({ color: col, alpha: 0.3 });
      break;
    case 'lyceum':
      for (let i = -1; i <= 1; i++) {
        g.moveTo(cx + i * s * 0.7, cy - s * 0.9).lineTo(cx + i * s * 0.7, cy + s * 0.9)
          .stroke({ width: Math.max(0.4, s * 0.1), color: col, alpha: 0.6 });
      }
      g.moveTo(cx - s * 1.3, cy - s * 0.9).lineTo(cx + s * 1.3, cy - s * 0.9).stroke({ width: Math.max(0.4, s * 0.1), color: col, alpha: 0.6 });
      break;
    case 'philipsdorp':
      // klein huisje-icoon: puntdak boven een rechthoekig lijfje
      g.poly(flat([{ x: cx - s * 0.9, y: cy - s * 0.1 }, { x: cx, y: cy - s * 1.1 }, { x: cx + s * 0.9, y: cy - s * 0.1 }]))
        .stroke({ width: Math.max(0.5, s * 0.13), color: col, alpha: 0.85 });
      g.rect(cx - s * 0.6, cy - s * 0.1, s * 1.2, s * 0.9).stroke({ width: Math.max(0.5, s * 0.13), color: col, alpha: 0.85 });
      break;
  }
}

function drawPoliceBadge(g, x, y) {
  g.poly(flat([
    { x, y: y - 3.2 }, { x: x + 2.4, y: y - 2 }, { x: x + 2.4, y: y + 1.6 },
    { x, y: y + 3.4 }, { x: x - 2.4, y: y + 1.6 }, { x: x - 2.4, y: y - 2 },
  ])).fill({ color: 0x2255cc }).stroke({ width: 0.3, color: 0xffd23a });
  const starPts = [];
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + i * (Math.PI * 2 / 5);
    starPts.push({ x: x + Math.cos(a) * 1.3, y: y + Math.sin(a) * 1.3 });
    const a2 = a + Math.PI / 5;
    starPts.push({ x: x + Math.cos(a2) * 0.55, y: y + Math.sin(a2) * 0.55 });
  }
  g.poly(flat(starPts)).fill({ color: 0xffd23a });
}

// ---------- Radar: lichte, ongetextureerde versie van de kaart voor de minimap ----------
export function buildRadarGeometry(world) {
  const g = new Graphics();
  for (const w of world.waters) g.poly(flat(w.pts)).fill({ color: 0x3a6ea8 });
  for (const line of world.waterLines) { strokePolyline(g, line.pts, 1); g.stroke({ color: 0x3a6ea8, width: line.width, cap: 'round' }); }
  for (const gr of world.greens) g.poly(flat(gr.pts)).fill({ color: 0x3f6a3a });
  for (const b of world.buildings) g.poly(flat(b.pts)).fill({ color: b.isLandmark ? 0xffcf4d : 0x555049 });
  for (const rail of world.railLines) {
    if (rail.length < 2) continue;
    g.moveTo(rail[0].x, rail[0].y);
    for (let i = 1; i < rail.length; i++) g.lineTo(rail[i].x, rail[i].y);
    g.stroke({ width: 2, color: 0x8a8478, alpha: 0.8 });
  }
  for (const r of world.roads) {
    if (r.pts.length < 2) continue;
    if (r.hw === 'pedestrian' || r.hw === 'living_street') continue;
    g.moveTo(r.pts[0].x, r.pts[0].y);
    for (let i = 1; i < r.pts.length; i++) g.lineTo(r.pts[i].x, r.pts[i].y);
    g.stroke({ width: Math.max(3, world.roadWidth(r) * 0.6), color: 0xc9c2b0, cap: 'round', join: 'round' });
  }
  for (const lm of world.landmarks) g.circle(lm.cx, lm.cy, 6).fill({ color: 0xffcf4d });
  g.poly(flat(world.ringPts)).stroke({ width: 5, color: 0xffcf4d });
  return g;
}

export { hexColor, flat };
