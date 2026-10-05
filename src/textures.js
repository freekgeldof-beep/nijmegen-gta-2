// Procedurele texturen (canvas -> PixiJS Texture, met repeat-wrap voor tiling).
import { Texture, CanvasSource, Matrix } from 'pixi.js';

function canvasTexture(canvas, repeat = true) {
  const source = new CanvasSource({
    resource: canvas,
    addressModeU: repeat ? 'repeat' : 'clamp-to-edge',
    addressModeV: repeat ? 'repeat' : 'clamp-to-edge',
    autoGenerateMipmaps: true,
  });
  return new Texture({ source });
}

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// wereld-eenheden per tegel (voor de fill-matrix schaal)
export const ASPHALT_TILE_M = 8;
export const CURB_TILE_M = 3;
export const GRASS_TILE_M = 6;
export const WATER_TILE_M = 10;
export const BUILDING_TILE_M = 6;

export function makeAsphaltTexture() {
  const size = 128;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#48484a'; g.fillRect(0, 0, size, size);
  const rnd = mulberry32(1234);
  for (let i = 0; i < 900; i++) {
    const x = rnd() * size, y = rnd() * size, r = 0.4 + rnd() * 1.1;
    const v = rnd();
    g.fillStyle = v < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.06)';
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  return canvasTexture(c);
}

export function makeCurbTexture() {
  const size = 96;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#9a9488'; g.fillRect(0, 0, size, size);
  g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 2;
  const cell = size / 3;
  for (let i = 0; i <= 3; i++) {
    g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell, size); g.stroke();
    g.beginPath(); g.moveTo(0, i * cell); g.lineTo(size, i * cell); g.stroke();
  }
  const rnd = mulberry32(77);
  for (let i = 0; i < 200; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)';
    g.fillRect(rnd() * size, rnd() * size, 1.5, 1.5);
  }
  return canvasTexture(c);
}

export function makePedestrianTexture() {
  const size = 96;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#8a7f6f'; g.fillRect(0, 0, size, size);
  g.strokeStyle = 'rgba(0,0,0,0.14)'; g.lineWidth = 1.5;
  const cell = size / 6;
  for (let i = 0; i <= 6; i++) {
    g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell, size); g.stroke();
  }
  return canvasTexture(c);
}

export function makeGrassTexture() {
  const size = 96;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#4f7a4a'; g.fillRect(0, 0, size, size);
  const rnd = mulberry32(55);
  for (let i = 0; i < 260; i++) {
    const x = rnd() * size, y = rnd() * size;
    g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)';
    g.fillRect(x, y, 1.4, 1.4);
  }
  return canvasTexture(c);
}

export function makeWaterTexture() {
  const size = 128;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, '#3a6ea8'); grad.addColorStop(1, '#2f5f94');
  g.fillStyle = grad; g.fillRect(0, 0, size, size);
  g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 2;
  for (let y = 10; y < size; y += 18) {
    g.beginPath();
    for (let x = 0; x <= size; x += 8) g.lineTo(x, y + Math.sin(x * 0.2) * 3);
    g.stroke();
  }
  return canvasTexture(c);
}

export function makeGroundTexture() {
  const size = 96;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#63605a'; g.fillRect(0, 0, size, size);
  const rnd = mulberry32(9001);
  for (let i = 0; i < 200; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)';
    g.fillRect(rnd() * size, rnd() * size, 1.4, 1.4);
  }
  return canvasTexture(c);
}

// Bouwt een set gebouw-textuurvarianten (basiskleur + dakpan-hatching + subtiel
// raamgloed), overeenkomend met het palet uit world.js.
export function makeBuildingTextures(palette) {
  const size = 128;
  return palette.map(([base, roof], idx) => {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, size, size);
    g.strokeStyle = roof; g.globalAlpha = 0.55; g.lineWidth = 3;
    const step = size / 8;
    g.beginPath();
    for (let k = -size; k < size * 2; k += step) {
      g.moveTo(k, 0); g.lineTo(k - size, size);
    }
    g.stroke();
    g.globalAlpha = 1;
    const rnd = mulberry32(300 + idx);
    g.fillStyle = 'rgba(255,255,190,0.28)';
    for (let gx = 10; gx < size; gx += 18) {
      for (let gy = 10; gy < size; gy += 18) {
        if (rnd() < 0.55) g.fillRect(gx, gy, 4, 4);
      }
    }
    return canvasTexture(c);
  });
}

export function makeChurchTexture() {
  const size = 128;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#9a9284'; g.fillRect(0, 0, size, size);
  g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 2;
  const cell = size / 5;
  for (let i = 0; i <= 5; i++) {
    g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell, size); g.stroke();
    g.beginPath(); g.moveTo(0, i * cell); g.lineTo(size, i * cell); g.stroke();
  }
  return canvasTexture(c);
}

export function fillMatrixForTile(tileWorldSize) {
  // schaalt wereldcoördinaten naar UV zodat één textuurcyclus == tileWorldSize meter
  return new Matrix().scale(1 / tileWorldSize, 1 / tileWorldSize);
}
