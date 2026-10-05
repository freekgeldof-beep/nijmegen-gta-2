import { Container, Sprite, Texture, Graphics, Text, TextStyle } from 'pixi.js';

const PXM = 16; // pixels per meter voor gebakken voertuig-texturen

function roundRectPath(g, x, y, w, h, r) { g.roundRect(x, y, w, h, r); }

function bakeVehicleCanvas(vtype, bodyColor, darkColor) {
  const padPx = 6;
  let wM, hM;
  if (vtype === 'moto') { wM = 2.0; hM = 0.8; } else if (vtype === 'bike') { wM = 1.7; hM = 0.6; }
  else if (vtype === 'sport') { wM = 4.0; hM = 1.75; } else if (vtype === 'cabrio') { wM = 4.3; hM = 1.8; }
  else if (vtype === 'van') { wM = 5.0; hM = 2.1; }
  else if (vtype === 'truck') { wM = 6.6; hM = 2.3; } else if (vtype === 'bus') { wM = 8.2; hM = 2.5; }
  else if (vtype === 'ambulance') { wM = 5.0; hM = 2.1; } else if (vtype === 'firetruck') { wM = 7.5; hM = 2.4; }
  else { wM = 4.2; hM = 1.9; }
  const w = wM * PXM, h = hM * PXM;
  const cw = w + padPx * 2, ch = h + padPx * 2;
  const c = document.createElement('canvas'); c.width = Math.ceil(cw); c.height = Math.ceil(ch);
  const g = c.getContext('2d');
  g.translate(padPx, padPx);

  if (vtype === 'moto') {
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(1, 1, w, h);
    g.fillStyle = darkColor; g.beginPath(); g.roundRect(0, 0, w, h, h * 0.25); g.fill();
    g.fillStyle = bodyColor; g.beginPath(); g.roundRect(w * 0.15, h * 0.1, w * 0.55, h * 0.8, h * 0.2); g.fill();
    g.fillStyle = '#e8c090'; g.beginPath(); g.arc(w * 0.4, h * 0.5, h * 0.32, 0, Math.PI * 2); g.fill();
  } else if (vtype === 'bike') {
    g.strokeStyle = darkColor; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    g.fillStyle = bodyColor;
    g.beginPath(); g.arc(w * 0.12, h / 2, h * 0.28, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(w * 0.88, h / 2, h * 0.28, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e8c090'; g.beginPath(); g.arc(w * 0.5, h * 0.42, h * 0.3, 0, Math.PI * 2); g.fill();
  } else {
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(2, 2, w, h);
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, darkColor); grad.addColorStop(1, bodyColor);
    g.fillStyle = grad; g.beginPath(); g.roundRect(0, 0, w, h, vtype === 'sport' ? h * 0.16 : h * 0.12); g.fill();
    if (vtype === 'bus') {
      g.fillStyle = 'rgba(255,255,255,0.25)';
      for (let wx = w * 0.15; wx < w * 0.86; wx += w * 0.11) g.fillRect(wx, h * 0.14, w * 0.07, h * 0.72);
    } else if (vtype === 'truck') {
      g.fillStyle = '#123a63'; g.beginPath(); g.roundRect(w * 0.72, h * 0.11, w * 0.22, h * 0.78, h * 0.15); g.fill();
    } else if (vtype === 'sport') {
      g.fillStyle = '#0d2038'; g.beginPath(); g.roundRect(w * 0.32, h * 0.12, w * 0.36, h * 0.76, h * 0.18); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(w * 0.1, h / 2); g.lineTo(w * 0.9, h / 2); g.stroke();
    } else if (vtype === 'ambulance') {
      g.fillStyle = '#f2f2f2'; g.beginPath(); g.roundRect(w * 0.28, h * 0.1, w * 0.44, h * 0.8, h * 0.15); g.fill();
      const cs = h * 0.42;
      g.fillStyle = '#c0392b';
      g.fillRect(w * 0.5 - cs * 0.16, h * 0.5 - cs * 0.5, cs * 0.32, cs);
      g.fillRect(w * 0.5 - cs * 0.5, h * 0.5 - cs * 0.16, cs, cs * 0.32);
      g.fillStyle = '#0d2038'; g.beginPath(); g.roundRect(w * 0.76, h * 0.14, w * 0.16, h * 0.72, h * 0.15); g.fill();
    } else if (vtype === 'cabrio') {
      // open dak: dunne windschermrand + twee zichtbare hoofdsteunen i.p.v. een dicht dak
      g.fillStyle = '#2a2a2a'; g.beginPath(); g.roundRect(w * 0.6, h * 0.16, w * 0.08, h * 0.68, h * 0.08); g.fill();
      g.fillStyle = '#1c140f';
      g.beginPath(); g.arc(w * 0.45, h * 0.32, h * 0.15, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(w * 0.45, h * 0.68, h * 0.15, 0, Math.PI * 2); g.fill();
    } else if (vtype === 'firetruck') {
      g.fillStyle = '#1a1a1a'; g.beginPath(); g.roundRect(w * 0.78, h * 0.12, w * 0.18, h * 0.76, h * 0.15); g.fill();
      g.fillStyle = '#ffd23a';
      for (let lx = w * 0.12; lx < w * 0.72; lx += w * 0.11) g.fillRect(lx, h * 0.06, w * 0.045, h * 0.09);
      g.fillStyle = '#e8e8e8'; g.fillRect(w * 0.08, h * 0.42, w * 0.62, h * 0.16);
    } else {
      g.fillStyle = '#123a63'; g.beginPath(); g.roundRect(w * 0.21, h * 0.16, w * 0.58, h * 0.68, h * 0.2); g.fill();
    }
    // Small highlights and wheel shapes stay readable at normal game zoom.
    g.strokeStyle = 'rgba(8,18,26,.72)'; g.lineWidth = Math.max(1, h * 0.055);
    g.beginPath(); g.roundRect(0.7, 0.7, w - 1.4, h - 1.4, h * 0.12); g.stroke();
    g.fillStyle = '#111c24';
    for (const wx of [w * 0.2, w * 0.76]) {
      g.fillRect(wx, -1.5, w * 0.1, 2.5);
      g.fillRect(wx, h - 1, w * 0.1, 2.5);
      g.fillStyle = '#75828a';
      g.fillRect(wx + w * .025, -.7, w * .05, 1.1);
      g.fillRect(wx + w * .025, h -.4, w * .05, 1.1);
      g.fillStyle = '#111c24';
    }
    if (['car', 'sport', 'cabrio', 'van'].includes(vtype)) {
      // Glazed roof, door seams, mirrors and bonnet/boot edges add depth at normal zoom.
      const cabin = g.createLinearGradient(w * .22, 0, w * .78, 0);
      cabin.addColorStop(0, '#132b3b'); cabin.addColorStop(.45, '#3f728a'); cabin.addColorStop(1, '#122637');
      if (vtype !== 'cabrio') {
        g.fillStyle = cabin; g.beginPath(); g.roundRect(w * .29, h * .19, w * .42, h * .62, h * .11); g.fill();
        g.strokeStyle = 'rgba(232,245,247,.65)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(w * .52, h * .19); g.lineTo(w * .52, h * .81); g.stroke();
      }
      g.strokeStyle = 'rgba(10,24,31,.5)'; g.lineWidth = 1;
      for (const px of [.21, .78]) { g.beginPath(); g.moveTo(w * px, h * .08); g.lineTo(w * px, h * .92); g.stroke(); }
      g.fillStyle = '#151f24';
      g.fillRect(w * .61, -h * .07, w * .09, h * .12);
      g.fillRect(w * .61, h * .95, w * .09, h * .12);
      g.fillStyle = 'rgba(245,255,255,.35)';
      g.fillRect(w * .76, h * .26, w * .11, h * .035);
      g.fillRect(w * .76, h * .71, w * .11, h * .035);
    }
    g.fillStyle = '#1b2529'; g.fillRect(w * .975, h * .24, w * .025, h * .52);
    g.fillStyle = 'rgba(240,240,225,.48)'; g.fillRect(w * .01, h * .35, w * .015, h * .3);
    g.fillStyle = 'rgba(255,255,255,.23)';
    g.fillRect(w * 0.31, h * 0.19, w * 0.26, Math.max(1, h * 0.065));
    g.fillStyle = 'rgba(213,239,255,.35)';
    g.fillRect(w * 0.71, h * 0.2, Math.max(1, w * 0.035), h * 0.6);
    g.fillStyle = '#fff7c2'; g.fillRect(w - h * 0.25, h * 0.1, h * 0.18, h * 0.2); g.fillRect(w - h * 0.25, h * 0.7, h * 0.18, h * 0.2);
    g.fillStyle = '#ff3b3b'; g.fillRect(h * 0.05, h * 0.1, h * 0.18, h * 0.2); g.fillRect(h * 0.05, h * 0.7, h * 0.18, h * 0.2);
  }
  return { canvas: c, wM, hM, padPx };
}

export function makeVehicleTextureCache() {
  const cache = new Map();
  return function getTexture(vtype, bodyColor, darkColor) {
    const key = `${vtype}|${bodyColor}|${darkColor}`;
    let entry = cache.get(key);
    if (!entry) {
      const baked = bakeVehicleCanvas(vtype, bodyColor, darkColor);
      const texture = Texture.from(baked.canvas);
      entry = { texture, wM: baked.wM, hM: baked.hM, padPx: baked.padPx };
      cache.set(key, entry);
    }
    return entry;
  };
}

export function makePedestrianTexture() {
  const pxm = 24, pad = 6;
  const w = 1.1 * pxm, h = 0.9 * pxm;
  const c = document.createElement('canvas'); c.width = w + pad * 2; c.height = h + pad * 2;
  const g = c.getContext('2d'); g.translate(pad, pad);
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(w * 0.55, h * 0.55, w * 0.42, h * 0.42, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2a4d7a'; g.beginPath(); g.ellipse(w * 0.5, h * 0.5, w * 0.42, h * 0.4, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e8c090'; g.beginPath(); g.arc(w * 0.78, h * 0.5, h * 0.3, 0, Math.PI * 2); g.fill();
  return { texture: Texture.from(c), scaleToMeter: 1 / pxm };
}

export function makePoliceFootTexture() {
  const pxm = 24, pad = 6;
  const w = 1.1 * pxm, h = 0.9 * pxm;
  const c = document.createElement('canvas'); c.width = w + pad * 2; c.height = h + pad * 2;
  const g = c.getContext('2d'); g.translate(pad, pad);
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(w * 0.55, h * 0.55, w * 0.42, h * 0.42, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1c3a7a'; g.beginPath(); g.ellipse(w * 0.5, h * 0.5, w * 0.42, h * 0.4, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffd23a'; g.beginPath(); g.arc(w * 0.5, h * 0.5, w * 0.12, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e8c090'; g.beginPath(); g.arc(w * 0.78, h * 0.5, h * 0.3, 0, Math.PI * 2); g.fill();
  return { texture: Texture.from(c), scaleToMeter: 1 / pxm };
}

export function makeExplosionTexture() {
  const size = 128;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,240,180,1)');
  grad.addColorStop(0.4, 'rgba(255,150,40,0.9)');
  grad.addColorStop(1, 'rgba(255,60,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, size, size);
  return Texture.from(c);
}

export function makePickupTextures(city = {}) {
  const size = 64;
  function bakeAmmo() {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'); g.translate(size / 2, size / 2);
    const glow = g.createRadialGradient(0, 0, 0, 0, 0, size * 0.46);
    glow.addColorStop(0, 'rgba(255,224,102,0.55)'); glow.addColorStop(1, 'rgba(255,224,102,0)');
    g.fillStyle = glow; g.fillRect(-size / 2, -size / 2, size, size);
    g.fillStyle = '#caa23a'; g.strokeStyle = '#3a2a10'; g.lineWidth = 2.4;
    g.beginPath(); g.roundRect(-size * 0.34, -size * 0.26, size * 0.68, size * 0.52, 4); g.fill(); g.stroke();
    // bullet-icoon
    g.fillStyle = '#ffe066';
    g.beginPath(); g.roundRect(-size * 0.06, -size * 0.2, size * 0.12, size * 0.3, 3); g.fill();
    g.beginPath(); g.moveTo(-size * 0.06, -size * 0.2); g.lineTo(0, -size * 0.32); g.lineTo(size * 0.06, -size * 0.2); g.closePath(); g.fill();
    g.fillStyle = '#8a6a1c'; g.fillRect(-size * 0.06, size * 0.1, size * 0.12, size * 0.06);
    return Texture.from(c);
  }
  function bakeMine() {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'); g.translate(size / 2, size / 2);
    const glow = g.createRadialGradient(0, 0, 0, 0, 0, size * 0.46);
    glow.addColorStop(0, 'rgba(255,80,40,0.55)'); glow.addColorStop(1, 'rgba(255,80,40,0)');
    g.fillStyle = glow; g.fillRect(-size / 2, -size / 2, size, size);
    // spikes
    g.fillStyle = '#7a1f10';
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      g.save(); g.rotate(a);
      g.beginPath(); g.moveTo(0, -size * 0.18); g.lineTo(size * 0.05, -size * 0.32); g.lineTo(-size * 0.05, -size * 0.32); g.closePath(); g.fill();
      g.restore();
    }
    g.fillStyle = '#c4522a'; g.strokeStyle = '#3a1008'; g.lineWidth = 2.4;
    g.beginPath(); g.arc(0, 0, size * 0.2, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#ffe066'; g.beginPath(); g.arc(0, 0, size * 0.06, 0, Math.PI * 2); g.fill();
    return Texture.from(c);
  }
  function bakeBeer() {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'); g.translate(size / 2, size / 2);
    const glow = g.createRadialGradient(0, 0, 0, 0, 0, size * 0.46);
    glow.addColorStop(0, 'rgba(255,200,60,0.55)'); glow.addColorStop(1, 'rgba(255,200,60,0)');
    g.fillStyle = glow; g.fillRect(-size / 2, -size / 2, size, size);
    g.strokeStyle = '#5c3d0f'; g.lineWidth = 3;
    g.beginPath(); g.arc(size * 0.22, -size * 0.02, size * 0.14, -Math.PI * 0.55, Math.PI * 0.55); g.stroke();
    g.fillStyle = '#e8b23a'; g.strokeStyle = '#5c3d0f'; g.lineWidth = 2.4;
    g.beginPath(); g.roundRect(-size * 0.22, -size * 0.16, size * 0.42, size * 0.42, 3); g.fill(); g.stroke();
    g.fillStyle = '#fff8e6'; g.beginPath(); g.roundRect(-size * 0.24, -size * 0.24, size * 0.46, size * 0.12, 4); g.fill();
    g.strokeStyle = '#c9b98a'; g.lineWidth = 1; g.stroke();
    return Texture.from(c);
  }
  function bakeShirt() {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'); g.translate(size / 2, size / 2);
    const glow = g.createRadialGradient(0, 0, 0, 0, 0, size * .48);
    glow.addColorStop(0, 'rgba(255,95,75,.55)'); glow.addColorStop(1, 'rgba(255,95,75,0)');
    g.fillStyle = glow; g.fillRect(-32, -32, 64, 64);
    g.fillStyle = '#e8e8e4'; g.strokeStyle = '#651313'; g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(-14, -17); g.lineTo(-5, -22); g.lineTo(5, -22); g.lineTo(14, -17);
    g.lineTo(23, -10); g.lineTo(17, -2); g.lineTo(12, -6); g.lineTo(12, 19);
    g.lineTo(-12, 19); g.lineTo(-12, -6); g.lineTo(-17, -2); g.lineTo(-23, -10); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = city.club?.color || '#d8272e';
    for (const x of [-9, -1, 7]) g.fillRect(x, -17, 4, 36);
    g.fillStyle = '#fff'; g.font = 'bold 8px Arial'; g.textAlign = 'center'; g.fillText((city.club?.name || 'CLUB').slice(0,5), 0, 2);
    return Texture.from(c);
  }
  return { ammo: bakeAmmo(), mine: bakeMine(), beer: bakeBeer(), shirt: bakeShirt() };
}

export function makeMineTexture() {
  const size = 32;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); g.translate(size / 2, size / 2);
  g.fillStyle = '#222'; g.beginPath(); g.arc(0, 0, size * 0.4, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#ff3b3b'; g.lineWidth = 2; g.stroke();
  return Texture.from(c);
}

export function makeBulletTexture() {
  const size = 16;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); g.translate(size / 2, size / 2);
  g.fillStyle = '#ffe066'; g.beginPath(); g.arc(0, 0, size * 0.4, 0, Math.PI * 2); g.fill();
  return Texture.from(c);
}

export function makeLightDotTextures() {
  function bake(color) {
    const size = 24;
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'); g.translate(size / 2, size / 2);
    g.fillStyle = color; g.beginPath(); g.arc(0, 0, size * 0.38, 0, Math.PI * 2); g.fill();
    return Texture.from(c);
  }
  return { green: bake('#3ad24a'), red: bake('#e13a3a') };
}

export function makeGlowTexture() {
  const size = 64;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,235,150,0.9)');
  grad.addColorStop(1, 'rgba(255,235,150,0)');
  g.fillStyle = grad; g.fillRect(0, 0, size, size);
  return Texture.from(c);
}

export class EntityLayer {
  constructor(city = {}) {
    this.container = new Container();
    this.vehicleTex = makeVehicleTextureCache();
    this.pedTex = makePedestrianTexture();
    this.policeFootTex = makePoliceFootTexture();
    this.explosionTex = makeExplosionTexture();
    this.pickupTex = makePickupTextures(city);
    this.mineTex = makeMineTexture();
    this.bulletTex = makeBulletTexture();
    this.glowTex = makeGlowTexture();

    this.parkedLayer = new Container();
    this.mineLayer = new Container();
    this.pickupLayer = new Container();
    this.trafficLayer = new Container();
    this.bulletLayer = new Container();
    this.explosionLayer = new Container();
    this.popupLayer = new Container();
    this.playerLayer = new Container();
    this.tireLayer = new Container();
    this.lightGlowLayer = new Container();
    this.container.addChild(
      this.tireLayer, this.lightGlowLayer, this.parkedLayer, this.mineLayer, this.pickupLayer,
      this.trafficLayer, this.bulletLayer, this.explosionLayer, this.playerLayer, this.popupLayer
    );


    this.nightFactor = 0;
    this._tireMarks = [];
    this._tireIndex = 0;
    this._lastTireTime = -Infinity;
  }

  _vehicleSprite(vtype, bodyColor, darkColor, extra) {
    const entry = this.vehicleTex(vtype, bodyColor, darkColor);
    const body = new Sprite(entry.texture);
    body.anchor.set(0.5, 0.5);
    body.scale.set(1 / PXM, 1 / PXM);
    const holder = new Container();
    const shadow = new Graphics().ellipse(0.35, 0.35, entry.wM * 0.55, entry.hM * 0.65)
      .fill({ color: 0x080d13, alpha: 0.32 });
    holder.addChild(shadow, body);
    holder._wM = entry.wM; holder._hM = entry.hM;
    // headlichten (gloed, alleen zichtbaar 's nachts, zie EntityLayer.nightFactor)
    const w = entry.wM, h = entry.hM;
    const headlight = new Sprite(this.glowTex);
    headlight.anchor.set(0.5, 0.5);
    headlight.blendMode = 'add';
    headlight.scale.set(w * 0.9 / 64, h * 1.6 / 64);
    headlight.position.set(w / 2 + w * 0.15, 0);
    headlight.alpha = 0;
    holder.addChild(headlight);
    holder._headlight = headlight;
    const brakeLights = new Graphics();
    brakeLights.circle(-w * 0.43, -h * 0.34, 0.12).fill({ color: 0xff2525 });
    brakeLights.circle(-w * 0.43, h * 0.34, 0.12).fill({ color: 0xff2525 });
    brakeLights.alpha = 0;
    holder.addChild(brakeLights);
    holder._brakeLights = brakeLights;
    const damage = new Graphics();
    holder.addChild(damage);
    holder._damage = damage;
    if (extra === 'police') {
      const bar = new Graphics();
      bar.rect(-w * 0.14, -h * 0.5 - 0.06, w * 0.28, h + 0.12).fill({ color: 0x111111 });
      holder.addChild(bar);
      // Echt ronddraaiend zwaailicht: een los draaiend containertje met een
      // rode en blauwe gloed/stip tegenover elkaar, i.p.v. een simpele kleurflip.
      const beacon = new Container();
      beacon.position.set(0, 0);
      const glowR = new Sprite(this.glowTex);
      glowR.anchor.set(0.5, 0.5); glowR.blendMode = 'add'; glowR.tint = 0xff3030;
      glowR.scale.set(w * 0.85 / 64, w * 0.85 / 64); glowR.position.set(w * 0.16, 0); glowR.alpha = 0.85;
      const glowB = new Sprite(this.glowTex);
      glowB.anchor.set(0.5, 0.5); glowB.blendMode = 'add'; glowB.tint = 0x3050ff;
      glowB.scale.set(w * 0.85 / 64, w * 0.85 / 64); glowB.position.set(-w * 0.16, 0); glowB.alpha = 0.85;
      const dotR = new Graphics().circle(w * 0.16, 0, w * 0.1).fill({ color: 0xff4040 });
      const dotB = new Graphics().circle(-w * 0.16, 0, w * 0.1).fill({ color: 0x4070ff });
      beacon.addChild(glowR, glowB, dotR, dotB);
      holder.addChild(beacon);
      holder._beacon = beacon;
    }
    return holder;
  }

  syncTraffic(traffic, police) {
    const needed = traffic.length + police.length;
    while (this.trafficLayer.children.length < needed) {
      this.trafficLayer.addChild(new Sprite());
    }
    while (this.trafficLayer.children.length > needed) {
      this.trafficLayer.removeChildAt(this.trafficLayer.children.length - 1).destroy({ children: true });
    }
    let idx = 0;
    for (const t of traffic) {
      this._placeVehicleAt(idx++, t.alive, t.x, t.y, t.angle, t.vtype, t.color, t.dark, null, t);
    }
    for (const p of police) {
      this._placeVehicleAt(idx++, p.alive, p.x, p.y, p.angle, p.vtype, p.color, p.dark, 'police', p);
    }
  }

  _placeVehicleAt(idx, alive, x, y, angle, vtype, color, dark, extra, policeState) {
    let holder = this.trafficLayer.children[idx];
    const onFoot = !!(policeState && policeState.onFoot);
    const key = onFoot ? 'police-foot' : `${vtype}|${color}|${dark}|${extra || ''}`;
    if (holder._spriteKey !== key) {
      let spr;
      if (onFoot) {
        spr = new Container();
        const foot = new Sprite(this.policeFootTex.texture);
        foot.anchor.set(0.5, 0.5);
        foot.scale.set(this.policeFootTex.scaleToMeter, this.policeFootTex.scaleToMeter);
        spr.addChild(foot);
      } else {
        spr = this._vehicleSprite(vtype, color, dark, extra);
      }
      this.trafficLayer.removeChildAt(idx).destroy({ children: true });
      this.trafficLayer.addChildAt(spr, idx);
      spr._spriteKey = key;
      holder = spr;
    }
    holder.visible = !!alive;
    if (alive) {
      holder.position.set(x, y);
      holder.rotation = angle;
      if (holder._headlight) holder._headlight.alpha = this.nightFactor;
      if (holder._brakeLights) holder._brakeLights.alpha = policeState?.waiting ? 0.8 : 0;
      if (!onFoot && policeState && holder._beacon) {
        const spinPerSec = policeState.state === 'chase' ? 9 : 3.2;
        holder._beacon.rotation = (performance.now() / 1000) * spinPerSec;
      }
    }
  }

  syncParked(parkedCars) {
    while (this.parkedLayer.children.length < parkedCars.length) this.parkedLayer.addChild(new Sprite());
    while (this.parkedLayer.children.length > parkedCars.length) this.parkedLayer.removeChildAt(this.parkedLayer.children.length - 1).destroy({ children: true });
    parkedCars.forEach((p, i) => {
      const key = `${p.vtype}|${p.color}|${p.dark}`;
      let holder = this.parkedLayer.children[i];
      if (holder._spriteKey !== key) {
        const spr = this._vehicleSprite(p.vtype, p.color, p.dark);
        this.parkedLayer.removeChildAt(i).destroy({ children: true });
        this.parkedLayer.addChildAt(spr, i);
        spr._spriteKey = key;
        holder = spr;
      }
      holder.position.set(p.x, p.y);
      holder.rotation = p.angle;
    });
  }

  syncPlayer(player) {
    if (!this._playerSprite || this._playerKey !== `${player.mode}|${player.vtype}|${player.color}|${player.dark}`) {
      this.playerLayer.removeChildren().forEach(child => child.destroy({ children: true }));
      let spr;
      if (player.mode === 'car') {
        spr = this._vehicleSprite(player.vtype, player.color || '#3a9bff', player.dark || '#1f6fd1', null);
      } else {
        spr = new Sprite(this.pedTex.texture);
        spr.anchor.set(0.5, 0.5);
        spr.scale.set(this.pedTex.scaleToMeter, this.pedTex.scaleToMeter);
      }
      this.playerLayer.addChild(spr);
      this._playerSprite = spr;
      this._playerKey = `${player.mode}|${player.vtype}|${player.color}|${player.dark}`;
    }
    const spr = this._playerSprite;
    spr.position.set(player.x, player.y);
    spr.rotation = player.angle + (player.wasted ? player.wastedT * 2 : 0);
    spr.alpha = player.wasted ? Math.max(0, 1 - player.wastedT / 1.6) : (player.busted ? 0.6 : 1);
    const tintTarget = player.mode === 'car' ? spr.children[0] : spr;
    if (tintTarget) tintTarget.tint = player.wasted ? 0x333333 : 0xffffff;
    if (spr._headlight) spr._headlight.alpha = player.wasted ? 0 : this.nightFactor;
    if (spr._brakeLights) spr._brakeLights.alpha = player.braking ? 0.9 : 0;
    if (spr._damage) {
      const d = spr._damage; d.clear();
      const wear = 100 - (player.health ?? 100);
      if (wear >= 20) d.moveTo(spr._wM * .4, -spr._hM * .35).lineTo(spr._wM * .29, -.12).lineTo(spr._wM * .46, .08).stroke({ color: 0x1a2527, width: .12, alpha: .8 });
      if (wear >= 40) d.ellipse(-spr._wM * .3, spr._hM * .25, .4, .22).fill({ color: 0x1d292c, alpha: .6 });
      if (wear >= 65) d.moveTo(-spr._wM * .3, -spr._hM * .4).lineTo(-spr._wM * .1, 0).lineTo(-spr._wM * .36, spr._hM * .38).stroke({ color: 0x1a2527, width: .16, alpha: .9 });
      if (wear >= 50) {
        const puff = (Date.now() / 280) % 1;
        d.circle(spr._wM * .27 + puff * 1.1, -spr._hM * .15 - puff * 1.2, .16 + puff * .45).fill({ color: wear > 75 ? 0x303437 : 0x747e80, alpha: .43 * (1 - puff) });
      }
      if (player.shirtImmuneT > 0) d.ellipse(0, 0, spr._wM * .72, spr._hM * 1.12)
        .stroke({ color: 0xf3424a, width: .22, alpha: .7 + .2 * Math.sin(Date.now() / 180) });
    }
  }

  syncDrivingEffects(player, simTime) {
    for (const mark of this._tireMarks) {
      const age = simTime - mark.time;
      mark.sprite.visible = age >= 0 && age < 5;
      if (mark.sprite.visible) mark.sprite.alpha = 0.42 * (1 - age / 5);
    }
    if (player.mode !== 'car' || Math.abs(player.speed) < 10 || !player.braking || simTime - this._lastTireTime < 0.09) return;
    this._lastTireTime = simTime;
    for (const side of [-1, 1]) {
      let mark = this._tireMarks[this._tireIndex];
      if (!mark) {
        const sprite = new Graphics().roundRect(-0.46, -0.04, 0.92, 0.08, 0.04).fill({ color: 0x0c151a });
        this.tireLayer.addChild(sprite);
        mark = { sprite, time: simTime };
        this._tireMarks[this._tireIndex] = mark;
      }
      const c = Math.cos(player.angle), s = Math.sin(player.angle);
      mark.sprite.position.set(player.x - c * player.w * 0.34 - s * side * player.h * 0.36,
        player.y - s * player.w * 0.34 + c * side * player.h * 0.36);
      mark.sprite.rotation = player.angle;
      mark.sprite.alpha = 0.42;
      mark.sprite.visible = true;
      mark.time = simTime;
      this._tireIndex = (this._tireIndex + 1) % 80;
    }
  }

  _syncPool(layer, count, create) {
    while (layer.children.length < count) layer.addChild(create());
    layer.children.forEach((child, i) => { child.visible = i < count; });
  }

  syncMines(mines) {
    const armed = mines.filter(m => m.armed);
    this._syncPool(this.mineLayer, armed.length, () => new Sprite(this.mineTex));
    armed.forEach((m, i) => {
      const spr = this.mineLayer.children[i];
      spr.anchor?.set?.(0.5, 0.5);
      spr.scale.set(1 / 24, 1 / 24);
      spr.position.set(m.x, m.y);
    });
  }

  syncPickups(pickups, timeMs) {
    const alive = pickups.filter(p => p.alive);
    this._syncPool(this.pickupLayer, alive.length, () => new Sprite());
    alive.forEach((p, i) => {
      const spr = this.pickupLayer.children[i];
      const tex = p.type === 'ammo' ? this.pickupTex.ammo : p.type === 'beer' ? this.pickupTex.beer : p.type === 'shirt' ? this.pickupTex.shirt : this.pickupTex.mine;
      if (spr.texture !== tex) { spr.texture = tex; spr.anchor.set(0.5, 0.5); spr.scale.set(1 / 64 * 3.0, 1 / 64 * 3.0); }
      const bob = Math.sin(timeMs / 250 + p.x) * 0.15;
      spr.position.set(p.x, p.y + bob);
    });
  }

  syncBullets(bullets) {
    this._syncPool(this.bulletLayer, bullets.length, () => new Sprite(this.bulletTex));
    bullets.forEach((b, i) => {
      const spr = this.bulletLayer.children[i];
      spr.anchor?.set?.(0.5, 0.5);
      spr.scale.set(1 / 16 * 1.6, 1 / 16 * 1.6);
      spr.position.set(b.x, b.y);
    });
  }

  syncExplosions(explosions) {
    this._syncPool(this.explosionLayer, explosions.length, () => new Sprite(this.explosionTex));
    explosions.forEach((ex, i) => {
      const spr = this.explosionLayer.children[i];
      spr.anchor?.set?.(0.5, 0.5);
      const dur = ex.big ? 1.2 : 0.6;
      const p = ex.t / dur;
      const rad = (ex.big ? 3 : 1.5) + p * (ex.big ? 7 : 3);
      spr.scale.set(rad / 64, rad / 64);
      spr.alpha = Math.max(0, 1 - p);
      spr.position.set(ex.x, ex.y);
    });
  }

  syncPopups(popups) {
    while (this.popupLayer.children.length < popups.length) {
      // Render op echte pixelgrootte en schaal terug naar wereldschaal -- anders
      // levert een tekst met fontSize in wereld-eenheden een wazige bitmap op
      // zodra de camera inzoomt.
      const t = new Text({ text: '', style: new TextStyle({ fill: '#fff', fontSize: 24, fontFamily: 'Arial', fontWeight: 'bold', stroke: { color: '#000000', width: 4 } }), resolution: 3 });
      t.scale.set(3 / 24, 3 / 24);
      t.anchor.set(0.5, 0.5);
      this.popupLayer.addChild(t);
    }
    this.popupLayer.children.forEach((child, i) => { child.visible = i < popups.length; });
    popups.forEach((pu, i) => {
      const t = this.popupLayer.children[i];
      const p = pu.t / 1.1;
      if (t.text !== pu.text) t.text = pu.text;
      t.style.fill = pu.color;
      t.alpha = Math.max(0, 1 - p);
      t.position.set(pu.x, pu.y - 1 - p * 2.2);
    });
  }
}
