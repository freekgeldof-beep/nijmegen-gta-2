// Zuiver data/simulatie-laag: projectie, wegengraaf, kruispunt-clustering,
// gebouwen, botsingshulp. Geen rendering hier -- dat gebeurt in render*.js.

async function loadJSON(name, path) {
  const response = await fetch(path + '/' + name + '.json');
  if (!response.ok) throw new Error('Kaartbestand niet beschikbaar: ' + name);
  return response.json();
}

export async function loadData(city) {
  const path = city?.dataPath || 'data';
  const [osm, green, extra, landmarks, rails] = await Promise.all([
    loadJSON('osm-data', path),
    loadJSON('green-data', path),
    loadJSON('extra-data', path),
    loadJSON('landmarks', path),
    loadJSON('rails', path),
  ]);
  return { osm, green, extra, landmarks, rails, city };
}

export function buildWorld({ osm, green, extra, landmarks, rails, city = {} }) {
  const [S, W, N, E] = osm.bbox;
  const lat0 = (S + N) / 2, lon0 = (W + E) / 2;
  const cosLat0 = Math.cos(lat0 * Math.PI / 180);
  const M_PER_DEG_LAT = 110540;
  const M_PER_DEG_LON = 111320 * cosLat0;
  function project(lat, lon) { return { x: (lon - lon0) * M_PER_DEG_LON, y: -(lat - lat0) * M_PER_DEG_LAT }; }

  const ringPts = osm.ring.map(([lat, lon]) => project(lat, lon));
  const ringMinX = Math.min(...ringPts.map(p => p.x)), ringMaxX = Math.max(...ringPts.map(p => p.x));
  const ringMinY = Math.min(...ringPts.map(p => p.y)), ringMaxY = Math.max(...ringPts.map(p => p.y));
  // De speelbare grens ligt net iets buiten de getekende ring (niet er precies
  // bovenop) -- een lichte uitschaling vanuit het middelpunt van de ring.
  const ringCx = ringPts.reduce((s, p) => s + p.x, 0) / ringPts.length;
  const ringCy = ringPts.reduce((s, p) => s + p.y, 0) / ringPts.length;
  const RING_BOUNDARY_SCALE = city.boundaryScale ?? 1.02;
  const ringBoundaryPts = ringPts.map(p => ({
    x: ringCx + (p.x - ringCx) * RING_BOUNDARY_SCALE,
    y: ringCy + (p.y - ringCy) * RING_BOUNDARY_SCALE,
  }));

  function pointInPoly(px, py, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
      const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
  function segIntersect(p1, p2, p3, p4) {
    function ccw(a, b, c) { return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x); }
    return (ccw(p1, p3, p4) !== ccw(p2, p3, p4)) && (ccw(p1, p2, p3) !== ccw(p1, p2, p4));
  }
  function crossesRing(x1, y1, x2, y2) {
    const p1 = { x: x1, y: y1 }, p2 = { x: x2, y: y2 };
    for (let i = 0; i < ringBoundaryPts.length; i++) if (segIntersect(p1, p2, ringBoundaryPts[i], ringBoundaryPts[(i + 1) % ringBoundaryPts.length])) return true;
    return false;
  }

  function toPolyList(list) {
    return list.map(poly => {
      const pts = poly.map(([lat, lon]) => project(lat, lon));
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
      return { pts, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
    });
  }
  const greens = toPolyList(green.greens);
  const waterLines = (extra.waterLines || []).map(line => ({ pts: line.g.map(([lat, lon]) => project(lat, lon)), width: line.width || 6 }));
  const waters = toPolyList(extra.waters || []);
  // A spatial index keeps water collision checks cheap for large city maps.
  const waterCell = 80, waterGrid = new Map();
  const waterKey = (x,y) => `${Math.floor(x/waterCell)},${Math.floor(y/waterCell)}`;
  function indexWaterCells(minX,minY,maxX,maxY,item) {
    for(let x=Math.floor(minX/waterCell);x<=Math.floor(maxX/waterCell);x++)for(let y=Math.floor(minY/waterCell);y<=Math.floor(maxY/waterCell);y++){
      const key=`${x},${y}`;if(!waterGrid.has(key))waterGrid.set(key,[]);waterGrid.get(key).push(item);
    }
  }
  for(const poly of waters)indexWaterCells(poly.minX,poly.minY,poly.maxX,poly.maxY,{poly});
  for(const line of waterLines)for(let i=1;i<line.pts.length;i++){
    const a=line.pts[i-1],b=line.pts[i],radius=line.width/2;
    indexWaterCells(Math.min(a.x,b.x)-radius,Math.min(a.y,b.y)-radius,Math.max(a.x,b.x)+radius,Math.max(a.y,b.y)+radius,{a,b,radius});
  }
  function inWater(x,y) {
    for(const item of waterGrid.get(waterKey(x,y))||[]){
      if(item.poly){if(pointInPoly(x,y,item.poly.pts))return true;continue;}
      const dx=item.b.x-item.a.x,dy=item.b.y-item.a.y,l2=dx*dx+dy*dy;
      const t=l2?Math.max(0,Math.min(1,((x-item.a.x)*dx+(y-item.a.y)*dy)/l2)):0;
      if(Math.hypot(x-item.a.x-t*dx,y-item.a.y-t*dy)<item.radius)return true;
    }return false;
  }
  const churchPts = extra.churches.map(([lat, lon]) => project(lat, lon));
  const signalPts = (extra.signals || []).map(([lat, lon]) => project(lat, lon));
  const railLines = (rails?.rails || []).map(w => w.map(([lat, lon]) => project(lat, lon)));

  // ---------- Wegen + ruwe kruispuntengraaf ----------
  const nodeMap = new Map();
  let nodeSeq = 0;
  function getNode(key, x, y) {
    let n = nodeMap.get(key);
    if (!n) { n = { id: nodeSeq++, x, y, edges: [] }; nodeMap.set(key, n); }
    return n;
  }
  let roads = osm.roads.map((r, ri) => {
    const pts = r.g.map(([lat, lon]) => project(lat, lon));
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const startKey = r.g[0][0].toFixed(5) + ',' + r.g[0][1].toFixed(5);
    const endKey = r.g[r.g.length - 1][0].toFixed(5) + ',' + r.g[r.g.length - 1][1].toFixed(5);
    const road = { id: ri, name: r.n, hw: r.h, bridge: !!r.bridge, bridgeName:r.bridgeName, pts, cum, len: cum[cum.length - 1], nodeStart: null, nodeEnd: null };
    const nStart = getNode(startKey, pts[0].x, pts[0].y);
    const nEnd = getNode(endKey, pts[pts.length - 1].x, pts[pts.length - 1].y);
    road.nodeStart = nStart.id; road.nodeEnd = nEnd.id;
    nStart.edges.push(road); nEnd.edges.push(road);
    return road;
  });
  let nodesById = new Map();
  for (const n of nodeMap.values()) nodesById.set(n.id, n);

  // ---------- Kruispunt-clustering ----------
  (function mergeClusteredJunctions() {
    const MERGE_DIST = 16;
    const ufParent = new Map();
    function ufFind(a) { let r = a; while (ufParent.get(r) !== r) r = ufParent.get(r); let c = a; while (ufParent.get(c) !== r) { const nx = ufParent.get(c); ufParent.set(c, r); c = nx; } return r; }
    function ufUnion(a, b) { const ra = ufFind(a), rb = ufFind(b); if (ra !== rb) ufParent.set(ra, rb); }
    for (const n of nodesById.values()) ufParent.set(n.id, n.id);
    for (const r of roads) {
      if (r.len < MERGE_DIST) {
        const a = nodesById.get(r.nodeStart), b = nodesById.get(r.nodeEnd);
        if (a.edges.length >= 3 || b.edges.length >= 3) ufUnion(r.nodeStart, r.nodeEnd);
      }
    }
    const groupMembers = new Map();
    for (const n of nodesById.values()) {
      const root = ufFind(n.id);
      if (!groupMembers.has(root)) groupMembers.set(root, []);
      groupMembers.get(root).push(n);
    }
    const oldToNew = new Map();
    const mergedNodes = new Map();
    let mergedSeq = 0;
    for (const [, members] of groupMembers) {
      const mx = members.reduce((s, m) => s + m.x, 0) / members.length;
      const my = members.reduce((s, m) => s + m.y, 0) / members.length;
      const mn = { id: mergedSeq++, x: mx, y: my, edges: [] };
      mergedNodes.set(mn.id, mn);
      for (const m of members) oldToNew.set(m.id, mn.id);
    }
    const removedRoadIds = new Set();
    for (const r of roads) {
      const ns = oldToNew.get(r.nodeStart), ne = oldToNew.get(r.nodeEnd);
      if (ns === ne) { removedRoadIds.add(r.id); continue; }
      r.nodeStart = ns; r.nodeEnd = ne;
      const sn = mergedNodes.get(ns), en = mergedNodes.get(ne);
      r.pts[0] = { x: sn.x, y: sn.y };
      r.pts[r.pts.length - 1] = { x: en.x, y: en.y };
      const cum = [0];
      for (let i = 1; i < r.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(r.pts[i].x - r.pts[i - 1].x, r.pts[i].y - r.pts[i - 1].y));
      r.cum = cum; r.len = cum[cum.length - 1];
      mergedNodes.get(ns).edges.push(r);
      mergedNodes.get(ne).edges.push(r);
    }
    roads = roads.filter(r => !removedRoadIds.has(r.id));
    nodesById = mergedNodes;
  })();

  function roadWidth(r) { return r.hw === 'primary' ? 16 : r.hw === 'secondary' ? 14 : r.hw === 'tertiary' ? 12 : 9.5; }
  function roadRank(hw) { return hw === 'primary' ? 4 : hw === 'secondary' ? 3 : hw === 'tertiary' ? 2 : (hw === 'living_street' || hw === 'pedestrian') ? 0 : 1; }
  function edgeDirFromNode(e, nodeId, nodeX, nodeY) {
    const farPt = (e.nodeStart === nodeId) ? e.pts[Math.min(3, e.pts.length - 1)] : e.pts[Math.max(0, e.pts.length - 4)];
    let dx = farPt.x - nodeX, dy = farPt.y - nodeY;
    const dl = Math.hypot(dx, dy) || 1; return { x: dx / dl, y: dy / dl };
  }

  // Kruispunten: simpele, altijd-vloeiende ronde knooppunten (GTA2-stijl,
  // negeert bewust de echte aansluithoek zodat elke kruising er logisch en
  // schoon uitziet ongeacht hoe organisch het echte wegennet is).
  for (const node of nodesById.values()) {
    if (node.edges.length < 2) { node.curbR = 0; node.asphR = 0; node.hasPed = false; continue; }
    node.hasPed = node.edges.some(e => e.hw === 'pedestrian' || e.hw === 'living_street');
    let maxHalf = 0;
    for (const e of node.edges) maxHalf = Math.max(maxHalf, roadWidth(e) / 2);
    node.asphR = maxHalf;
    node.curbR = maxHalf + 1.7;
  }

  // ---------- Gebouwen ----------
  const rng = (seed => () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)(city.seed ?? 7);
  const buildingPalette = [
    ['#b99a6b', '#7c6339'], ['#a7876a', '#6d5540'], ['#8f9a83', '#5c6650'],
    ['#c2b280', '#8a7c4f'], ['#9c8170', '#63493d'], ['#7d8a94', '#4d5760'],
    ['#b58463', '#734f36'], ['#8a9b7d', '#556b4a'], ['#c79a6b', '#835f3c']
  ];
  function polyArea(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const j = (i + 1) % pts.length; a += pts[i].x * pts[j].y - pts[j].x * pts[i].y; } return Math.abs(a / 2); }
  const CHURCH_MATCH_DIST = 40;
  const buildings = osm.buildings.map((poly) => {
    const pts = poly.map(([lat, lon]) => project(lat, lon));
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const palIdx = Math.floor(rng() * buildingPalette.length);
    const pal = buildingPalette[palIdx];
    const area = polyArea(pts);
    const big = area > 900;
    let isChurch = false;
    for (const cp of churchPts) { if (Math.hypot(cp.x - cx, cp.y - cy) < CHURCH_MATCH_DIST) { isChurch = true; break; } }
    const wide = (maxX - minX) >= (maxY - minY);
    const ventCount = big ? 3 + Math.floor(rng() * 4) : 0;
    const vents = [];
    for (let i = 0; i < ventCount; i++) vents.push({ ox: (rng() - 0.5) * 0.55, oy: (rng() - 0.5) * 0.55, s: 0.6 + rng() * 0.8 });
    return { pts, minX, maxX, minY, maxY, cx, cy, palIdx, color: pal[0], roof: pal[1], windows: !isChurch && rng() < 0.7, alive: true, big, isChurch, wide, vents };
  });

  // ---------- Iconische gebouwen (licht 3D geaccentueerd, van bovenaf) ----------
  const LANDMARK_HEIGHT_BY_CAT = {
    church: 32, stadium: 22, ufo: 13, tower: 70, station: 15, cityhall: 20, museum: 13, blob: 17,
    lyceum: 14, philipsdorp: 8,
  };
  function estimateLandmarkHeight(tags, cat) {
    if (tags && tags.height) { const h = parseFloat(tags.height); if (!isNaN(h)) return h; }
    if (tags && tags.levels) { const l = parseFloat(tags.levels); if (!isNaN(l)) return l * 3.2; }
    return LANDMARK_HEIGHT_BY_CAT[cat] || 16;
  }
  const landmarks_ = [];
  for (const w of (landmarks?.ways || [])) {
    const pts = w.g.map(([lat, lon]) => project(lat, lon));
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    for (const b of buildings) { if (Math.hypot(b.cx - cx, b.cy - cy) < 20) b.isLandmark = true; }
    landmarks_.push({ name: w.name, cat: w.cat, pts, cx, cy, height: estimateLandmarkHeight(w.tags, w.cat) });
  }
  const LANDMARK_MATCH_DIST = 60;
  for (const p of (landmarks?.points || [])) {
    const pos = project(p.lat, p.lon);
    if (p.markerOnly) {
      landmarks_.push({ name:p.name, cat:p.cat, pts:[], cx:pos.x, cy:pos.y, height:0, markerOnly:true });
      continue;
    }
    let best = null, bestD = LANDMARK_MATCH_DIST;
    for (const b of buildings) { const d = Math.hypot(b.cx - pos.x, b.cy - pos.y); if (d < bestD) { bestD = d; best = b; } }
    if (best) {
      best.isLandmark = true;
      landmarks_.push({ name: p.name, cat: p.cat, pts: best.pts, cx: best.cx, cy: best.cy, height: estimateLandmarkHeight(null, p.cat) });
    } else {
      const half = 14;
      const pts = [
        { x: pos.x - half, y: pos.y - half }, { x: pos.x + half, y: pos.y - half },
        { x: pos.x + half, y: pos.y + half }, { x: pos.x - half, y: pos.y + half },
      ];
      landmarks_.push({ name: p.name, cat: p.cat, pts, cx: pos.x, cy: pos.y, height: estimateLandmarkHeight(null, p.cat) });
    }
  }

  // Alle overige (niet-landmark) kerken krijgen ook hun naam, zodat je niet
  // alleen bij de Catharinakerk maar bij elke kerk ziet welke het is. Een
  // kerkgebouw bestaat in OSM vaak uit meerdere los getekende delen die
  // allemaal binnen bereik van hetzelfde naamspunt liggen -- ken de naam
  // daarom maar aan Ãƒâ€°Ãƒâ€°N gebouw per kerk toe (het dichtstbijzijnde), anders
  // krijg je dezelfde naam meerdere keren vlak bij elkaar.
  const landmarkNames = new Set(landmarks_.map(l => l.name));
  const churchNamePts = (landmarks?.churchNames || [])
    .filter(c => !landmarkNames.has(c.name))
    .map(c => ({ name: c.name, pos: project(c.lat, c.lon) }));
  for (const c of churchNamePts) {
    let best = null, bestD = 45;
    for (const b of buildings) {
      if (!b.isChurch || b.isLandmark || b.name) continue;
      const d = Math.hypot(c.pos.x - b.cx, c.pos.y - b.cy);
      if (d < bestD) { bestD = d; best = b; }
    }
    if (best) best.name = c.name;
  }

  // ---------- Spatial grid ----------
  const CELL = 60;
  function cellKey(cx, cy) { return cx + ',' + cy; }
  function cellsForBox(minX, minY, maxX, maxY) {
    const c = []; const cx0 = Math.floor(minX / CELL), cx1 = Math.floor(maxX / CELL), cy0 = Math.floor(minY / CELL), cy1 = Math.floor(maxY / CELL);
    for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) c.push(cellKey(cx, cy));
    return c;
  }
  const buildingGrid = new Map();
  buildings.forEach((b, i) => { for (const k of cellsForBox(b.minX, b.minY, b.maxX, b.maxY)) { if (!buildingGrid.has(k)) buildingGrid.set(k, []); buildingGrid.get(k).push(i); } });
  function nearbyBuildings(minX, minY, maxX, maxY) {
    const set = new Set();
    for (const k of cellsForBox(minX, minY, maxX, maxY)) { const arr = buildingGrid.get(k); if (arr) for (const i of arr) set.add(i); }
    return [...set].map(i => buildings[i]).filter(b => b.alive);
  }

  // ---------- Doorgangen: gebouwen die (deels) over een weg liggen ----------
  // In OSM liggen er gebouwen boven wegen (poorten, overkluizingen, tunnels).
  // Daar rij je onderdoor: binnen het wegprofiel is zo'n gebouw niet solide.
  const roadSegGrid = new Map();
  const drivableRoads = roads.filter(r => r.pts.length > 1 && r.hw !== 'pedestrian' && r.hw !== 'living_street');
  const ROAD_CORRIDOR_MARGIN = 1.2;
  for (const r of drivableRoads) {
    const half = roadWidth(r) / 2 + ROAD_CORRIDOR_MARGIN;
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1], b = r.pts[i];
      const seg = { ax: a.x, ay: a.y, bx: b.x, by: b.y, half };
      for (const k of cellsForBox(Math.min(a.x, b.x) - half, Math.min(a.y, b.y) - half, Math.max(a.x, b.x) + half, Math.max(a.y, b.y) + half)) {
        if (!roadSegGrid.has(k)) roadSegGrid.set(k, []);
        roadSegGrid.get(k).push(seg);
      }
    }
  }
  function onRoad(x, y) {
    const arr = roadSegGrid.get(cellKey(Math.floor(x / CELL), Math.floor(y / CELL)));
    if (!arr) return false;
    for (const s of arr) {
      const dx = s.bx - s.ax, dy = s.by - s.ay;
      const l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - s.ax) * dx + (y - s.ay) * dy) / l2)) : 0;
      if (Math.hypot(x - (s.ax + dx * t), y - (s.ay + dy * t)) <= s.half) return true;
    }
    return false;
  }
  (function markOverRoadBuildings() {
    const hits = new Map();
    for (const r of drivableRoads) {
      for (let i = 1; i < r.pts.length; i++) {
        const a = r.pts[i - 1], b = r.pts[i];
        const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 1.5));
        for (let k = 0; k <= n; k++) {
          const x = a.x + (b.x - a.x) * k / n, y = a.y + (b.y - a.y) * k / n;
          for (const bd of nearbyBuildings(x - 1, y - 1, x + 1, y + 1)) {
            if (pointInPoly(x, y, bd.pts)) hits.set(bd, (hits.get(bd) || 0) + 1);
          }
        }
      }
    }
    // Minstens ~3 m weg onder het dak, en geen landmark (die blijven massief).
    for (const [bd, n] of hits) if (n >= 3 && !bd.isLandmark) bd.overRoad = true;
  })();
  // Een gebouw met doorgang is alleen muur buiten het wegprofiel: botsing als
  // een van de steekpunten van het voertuig in het gebouw maar naast de weg valt.
  function blockedByBuilding(corners, b) {
    if (!b.overRoad) return polysIntersect(corners, b.pts);
    const n = corners.length;
    for (let i = 0; i < n; i++) {
      const c = corners[i], m = corners[(i + 1) % n];
      if (pointInPoly(c.x, c.y, b.pts) && !onRoad(c.x, c.y)) return true;
      const mx = (c.x + m.x) / 2, my = (c.y + m.y) / 2;
      if (pointInPoly(mx, my, b.pts) && !onRoad(mx, my)) return true;
    }
    return false;
  }
  function bulletHitsBuilding(x, y) {
    for (const b of nearbyBuildings(x - 1, y - 1, x + 1, y + 1)) {
      if (!pointInPoly(x, y, b.pts)) continue;
      if (b.overRoad && onRoad(x, y)) continue;
      return true;
    }
    return false;
  }

  function polysIntersect(carPts, bPts) {
    for (let i = 0; i < carPts.length; i++) {
      const a1 = carPts[i], a2 = carPts[(i + 1) % carPts.length];
      for (let j = 0; j < bPts.length; j++) {
        const b1 = bPts[j], b2 = bPts[(j + 1) % bPts.length];
        if (segIntersect(a1, a2, b1, b2)) return true;
      }
    }
    if (pointInPoly(carPts[0].x, carPts[0].y, bPts)) return true;
    if (pointInPoly(bPts[0].x, bPts[0].y, carPts)) return true;
    return false;
  }
  function carCorners(x, y, angle, w, h) {
    const hw = w / 2, hh = h / 2;
    const pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
    return pts.map(([px, py]) => {
      const rx = px * Math.cos(angle) - py * Math.sin(angle), ry = px * Math.sin(angle) + py * Math.cos(angle);
      return { x: x + rx, y: y + ry };
    });
  }
  function collidesBuildingsOrRing(x, y, angle, w, h, fromX, fromY) {
    const corners = carCorners(x, y, angle, w, h);
    // Check alle vier de hoekpunten (niet alleen het middelpunt) tegen de
    // grens -- anders kan een auto er bij een schuine hoek voor een stuk
    // doorheen steken voordat het centrum zelf de lijn passeert.
    for (const c of corners) {
      if (!pointInPoly(c.x, c.y, ringBoundaryPts)) return true;
      if (city.waterCollision && inWater(c.x,c.y) && !onRoad(c.x,c.y)) return true;
    }
    if (fromX !== undefined && crossesRing(fromX, fromY, x, y)) return true;
    const xs = corners.map(c => c.x), ys = corners.map(c => c.y);
    for (const b of nearbyBuildings(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys))) {
      if (blockedByBuilding(corners, b)) return true;
    }
    return false;
  }
  function overlappingBuilding(x, y, angle, w, h) {
    const corners = carCorners(x, y, angle, w, h);
    const xs = corners.map(c => c.x), ys = corners.map(c => c.y);
    for (const b of nearbyBuildings(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys))) {
      if (blockedByBuilding(corners, b)) return b;
    }
    return null;
  }
  function findSpawnNear(cx, cy, maxR) {
    maxR = maxR || 400;
    for (let r = 0; r < maxR; r += 3) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        if (!collidesBuildingsOrRing(x, y, 0, 4.2, 1.9)) return { x, y };
      }
    }
    return { x: cx, y: cy };
  }

  function pointInAnyPoly(x, y, list) {
    for (const item of list) {
      if (x < item.minX || x > item.maxX || y < item.minY || y > item.maxY) continue;
      if (pointInPoly(x, y, item.pts)) return true;
    }
    return false;
  }

  // Fill genuinely empty blocks while keeping a generous clear strip around roads.
  // The same deterministic geometry is built in the browser and on the game server.
  const roadCells = new Set(), roadCell = 12;
  const roadKey = (x, y) => `${Math.floor(x / roadCell)},${Math.floor(y / roadCell)}`;
  for (const road of roads) for (let i = 1; i < road.pts.length; i++) {
    const a = road.pts[i - 1], b = road.pts[i], length = Math.hypot(b.x - a.x, b.y - a.y);
    for (let j = 0; j <= Math.ceil(length / 5); j++) {
      const t = j / Math.max(1, Math.ceil(length / 5));
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      const cx = Math.floor(x / roadCell), cy = Math.floor(y / roadCell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) roadCells.add(`${cx + dx},${cy + dy}`);
    }
  }
  const waterCells = new Set();
  for (const line of waterLines) for (let i = 1; i < line.pts.length; i++) {
    const a = line.pts[i - 1], b = line.pts[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 6));
    for (let j = 0; j <= n; j++) waterCells.add(roadKey(a.x + (b.x - a.x) * j / n, a.y + (b.y - a.y) * j / n));
  }
  const clearLot = (x, y, halfW, halfH) => {
    for (const [sx, sy] of [[x, y], [x - halfW, y - halfH], [x - halfW, y + halfH], [x + halfW, y - halfH], [x + halfW, y + halfH]]) {
      if (!pointInPoly(sx, sy, ringPts) || pointInAnyPoly(sx, sy, greens) || pointInAnyPoly(sx, sy, waters) || roadCells.has(roadKey(sx, sy)) || waterCells.has(roadKey(sx, sy))) return false;
    }
    return !nearbyBuildings(x - halfW - 4, y - halfH - 4, x + halfW + 4, y + halfH + 4).length;
  };
  const groundPatches = [];
  let addedLots = 0;
  for (let y = Math.ceil(ringMinY / 38) * 38; y < ringMaxY && addedLots < (city.generatedLots === false ? 0 : 700); y += 38)
    for (let x = Math.ceil(ringMinX / 38) * 38; x < ringMaxX && addedLots < (city.generatedLots === false ? 0 : 700); x += 38) {
      const cx = x + (rng() - .5) * 7, cy = y + (rng() - .5) * 7;
      if (rng() < .18 && pointInPoly(cx, cy, ringPts) && !roadCells.has(roadKey(cx, cy)) && !waterCells.has(roadKey(cx, cy)) && !pointInAnyPoly(cx, cy, waters))
        groundPatches.push({ x: cx - 17, y: cy - 16, w: 34, h: 32, style: Math.floor(rng() * 3) });
      if (!clearLot(cx, cy, 13, 11)) continue;
      if (rng() < .22) {
        const pts = [{ x: cx - 13, y: cy - 11 }, { x: cx + 13, y: cy - 11 }, { x: cx + 13, y: cy + 11 }, { x: cx - 13, y: cy + 11 }];
        greens.push({ pts, minX: cx - 13, maxX: cx + 13, minY: cy - 11, maxY: cy + 11, generated: true });
      } else {
        const hw = 7 + rng() * 4, hh = 6 + rng() * 3;
        const pts = [{ x: cx - hw, y: cy - hh }, { x: cx + hw, y: cy - hh }, { x: cx + hw, y: cy + hh }, { x: cx - hw, y: cy + hh }];
        const palIdx = Math.floor(rng() * buildingPalette.length), pal = buildingPalette[palIdx];
        const b = { pts, minX: cx - hw, maxX: cx + hw, minY: cy - hh, maxY: cy + hh, cx, cy, palIdx,
          color: pal[0], roof: pal[1], windows: true, alive: true, big: false, isChurch: false, wide: hw >= hh, vents: [], generated: true };
        const index = buildings.push(b) - 1;
        for (const key of cellsForBox(b.minX, b.minY, b.maxX, b.maxY)) { if (!buildingGrid.has(key)) buildingGrid.set(key, []); buildingGrid.get(key).push(index); }
      }
      addedLots++;
    }

  // ---------- Bomen (decoratief in het groen -- geen botsing, je rijdt er onderdoor) ----------
  const trees = [];
  const TREE_GLOBAL_CAP = 1400;
  for (const g of greens) {
    if (trees.length >= TREE_GLOBAL_CAP) break;
    const area = (g.maxX - g.minX) * (g.maxY - g.minY);
    if (area < 200) continue; // te klein voor bomen, bv. kleine tuintjes
    const target = Math.min(20, Math.max(1, Math.round(area / 4500)));
    let placed = 0, attempts = 0;
    while (placed < target && attempts < target * 8 && trees.length < TREE_GLOBAL_CAP) {
      attempts++;
      const x = g.minX + rng() * (g.maxX - g.minX), y = g.minY + rng() * (g.maxY - g.minY);
      if (!pointInPoly(x, y, g.pts)) continue;
      trees.push({ x, y, r: 2.0 + rng() * 2.4 });
      placed++;
    }
  }

  // ---------- Parkeerterreinen (decoratief, in lege grijze vlakken naast wegen) ----------
  const parkingLots = [];
  const PARKING_LOT_COUNT = 22;
  const parkingCandidateRoads = roads.filter(r => r.pts.length > 1 && r.hw !== 'pedestrian' && r.hw !== 'living_street' && r.len > 20);
  let plTries = 0;
  while (parkingLots.length < PARKING_LOT_COUNT && plTries < PARKING_LOT_COUNT * 40 && parkingCandidateRoads.length) {
    plTries++;
    const r = parkingCandidateRoads[Math.floor(rng() * parkingCandidateRoads.length)];
    const dist = rng() * r.len;
    let i = 1; while (i < r.cum.length - 1 && r.cum[i] < dist) i++;
    const segLen = r.cum[i] - r.cum[i - 1];
    const t = segLen > 0 ? (dist - r.cum[i - 1]) / segLen : 0;
    const bx = r.pts[i - 1].x + (r.pts[i].x - r.pts[i - 1].x) * t;
    const by = r.pts[i - 1].y + (r.pts[i].y - r.pts[i - 1].y) * t;
    let dx = r.pts[i].x - r.pts[i - 1].x, dy = r.pts[i].y - r.pts[i - 1].y;
    const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    const nx = -dy, ny = dx;
    const side = rng() < 0.5 ? -1 : 1;
    const offset = roadWidth(r) / 2 + 10;
    const cx = bx + nx * side * offset, cy = by + ny * side * offset;
    if (!pointInPoly(cx, cy, ringPts)) continue;
    if (pointInAnyPoly(cx, cy, greens) || pointInAnyPoly(cx, cy, waters)) continue;
    const nb = nearbyBuildings(cx - 18, cy - 18, cx + 18, cy + 18);
    const rows = 2, cols = 2 + Math.floor(rng() * 2), bayW = 2.6, bayD = 5.0, aisle = 5.5;
    const lotW = cols * bayW, lotD = rows * bayD + aisle;
    const halfW = lotW / 2, halfD = lotD / 2;
    const corners = [[-halfW, -halfD], [halfW, -halfD], [halfW, halfD], [-halfW, halfD]];
    const fits = corners.every(([lx, ly]) => {
      const wx = cx + dx * lx + nx * ly, wy = cy + dy * lx + ny * ly;
      if (!pointInPoly(wx, wy, ringPts)) return false;
      if (pointInAnyPoly(wx, wy, greens) || pointInAnyPoly(wx, wy, waters)) return false;
      for (const b of nb) if (pointInPoly(wx, wy, b.pts)) return false;
      return true;
    });
    if (!fits) continue;
    parkingLots.push({ x: cx, y: cy, angle: Math.atan2(dy, dx), rows, cols, bayW, bayD, aisle });
  }

  // Vast straatmeubilair op de stoep, buiten de rijbaan en gebouwcontouren.
  const streetFurniture = [];
  for (const r of roads) {
    if (streetFurniture.length >= 650) break;
    if (r.pts.length < 2 || r.len < 55 || r.hw === 'pedestrian') continue;
    for (let d = 24; d < r.len - 18 && streetFurniture.length < 650; d += 58) {
      let i = 1; while (i < r.cum.length - 1 && r.cum[i] < d) i++;
      const a = r.pts[i - 1], b = r.pts[i], length = r.cum[i] - r.cum[i - 1];
      if (length <= 0) continue;
      const t = (d - r.cum[i - 1]) / length;
      const dx = (b.x - a.x) / length, dy = (b.y - a.y) / length;
      const side = rng() < .5 ? -1 : 1;
      const offset = roadWidth(r) / 2 + 2.5;
      const x = a.x + (b.x - a.x) * t - dy * side * offset;
      const y = a.y + (b.y - a.y) * t + dx * side * offset;
      if (!pointInPoly(x, y, ringPts) || pointInAnyPoly(x, y, waters) ||
          overlappingBuilding(x, y, 0, 1.8, 1.8)) continue;
      const roll = rng();
      streetFurniture.push({ x, y, angle: Math.atan2(dy, dx), kind: roll < .54 ? 'lamp' : roll < .79 ? 'bench' : 'bin' });
    }
  }

  const stadium = landmarks_.find(l => city.club?.stadium ? l.name === city.club.stadium : l.cat === 'stadium');
  const stadiumShirts = [];
  if (stadium) {
    const candidates = [];
    for (const r of roads) for (let i = 1; i < r.pts.length; i++) {
      const x = (r.pts[i - 1].x + r.pts[i].x) / 2, y = (r.pts[i - 1].y + r.pts[i].y) / 2;
      const distance = Math.hypot(x - stadium.cx, y - stadium.cy);
      if (distance < 25 || distance > 115 || overlappingBuilding(x, y, 0, 2, 2)) continue;
      candidates.push({ x, y, distance });
    }
    candidates.sort((a, b) => a.distance - b.distance);
    for (const p of candidates) {
      if (stadiumShirts.every(q => Math.hypot(p.x - q.x, p.y - q.y) > 25)) stadiumShirts.push({ x: p.x, y: p.y });
      if (stadiumShirts.length === 3) break;
    }
  }

  // Herkenbare haltepunten voor de online kofferjacht en aankleding ernaast.
  const caseStops = [], landmarkDecor = [];
  for (const landmark of landmarks_) {
    const name = landmark.name;
    const kind = landmark.cat === 'stadium' ? 'psv' : landmark.cat === 'station' ? 'station' : landmark.cat === 'museum' ? 'museum' : 'cityhall';
    let best = null, bestDistance = 140;
    for (const r of roads) for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1], b = r.pts[i];
      const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
      const d = Math.hypot(x - landmark.cx, y - landmark.cy);
      if (d >= bestDistance || !pointInPoly(x, y, ringPts) ||
          pointInAnyPoly(x, y, waters) || overlappingBuilding(x, y, 0, 4, 2)) continue;
      bestDistance = d;
      best = { name, x, y, angle: Math.atan2(b.y - a.y, b.x - a.x), width: roadWidth(r) };
    }
    if (!best) continue;
    caseStops.push({ name: best.name, x: best.x, y: best.y });
    for (const side of [1, -1]) {
      const offset = best.width / 2 + 3;
      const x = best.x - Math.sin(best.angle) * side * offset;
      const y = best.y + Math.cos(best.angle) * side * offset;
      if (overlappingBuilding(x, y, 0, 2, 2) || pointInAnyPoly(x, y, waters)) continue;
      landmarkDecor.push({ x, y, angle: best.angle, kind });
      break;
    }
  }

  const spawnRoad = roads.find(r => r.name === city.spawnStreet) || roads.find(r => r.hw !== 'pedestrian' && r.hw !== 'living_street');
  const requestedSpawn = city.spawn ? project(...city.spawn) : spawnRoad?.pts[0] || { x: (ringMinX + ringMaxX) / 2, y: (ringMinY + ringMaxY) / 2 };
  const SPAWN_CENTER = findSpawnNear(requestedSpawn.x, requestedSpawn.y);
  const requestedPolice = city.policeStation ? project(...city.policeStation) : SPAWN_CENTER;
  const POLICE_STATION = findSpawnNear(requestedPolice.x, requestedPolice.y);

  return {
    city, project, ringPts, ringBoundaryPts, ringMinX, ringMaxX, ringMinY, ringMaxY,
    pointInPoly, segIntersect, crossesRing,
    greens, waters, waterLines, groundPatches, churchPts, signalPts, railLines, trees, parkingLots, streetFurniture, stadiumShirts, caseStops, landmarkDecor,
    roads, nodesById, roadWidth, roadRank, edgeDirFromNode,
    buildings, buildingGrid, nearbyBuildings, cellsForBox, cellKey, CELL,
    landmarks: landmarks_,
    polysIntersect, carCorners, onRoad, inWater, bulletHitsBuilding, collidesBuildingsOrRing, overlappingBuilding, findSpawnNear,
    SPAWN_CENTER, POLICE_STATION, rng,
  };
}
