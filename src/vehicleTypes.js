// Genereert N gelijkmatig over de kleurencirkel verspreide [body, dark]-paren
// zodat elk voertuigtype veel visueel verschillende varianten heeft zonder
// dat we honderd kleurparen met de hand hoeven te verzinnen.
function hsl2hex(h, s, l) {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  let r, g, b;
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0]; else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c]; else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  const toHex = v => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return '#' + toHex(r) + toHex(g) + toHex(b);
}
function genPalette(n, satL, lightL, satD, lightD, hueOffset) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const h = (hueOffset || 0) + i * (360 / n);
    out.push([hsl2hex(h, satL, lightL), hsl2hex(h, satD, lightD)]);
  }
  return out;
}

export const VEHICLE_TYPES = {
  car:   { w: 4.2, h: 1.9, speedMul: 1.0,  accelMul: 1.0, palettes: genPalette(25, 62, 55, 62, 28, 0) },
  sport: { w: 4.0, h: 1.75, speedMul: 1.56, accelMul: 1.45, turnMul: 1.12, palettes: genPalette(18, 88, 55, 88, 28, 10) },
  cabrio:{ w: 4.3, h: 1.8, speedMul: 1.4, accelMul: 1.3, turnMul: 1.08, palettes: genPalette(12, 75, 60, 75, 32, 25) },
  van:   { w: 5.0, h: 2.1, speedMul: 0.8,  accelMul: 0.85, turnMul: 0.8, palettes: genPalette(10, 35, 68, 35, 34, 200) },
  truck: { w: 6.6, h: 2.3, speedMul: 0.5,  accelMul: 0.55, turnMul: 0.65, palettes: genPalette(8, 28, 55, 28, 30, 40) },
  bus:   { w: 8.2, h: 2.5, speedMul: 0.42, accelMul: 0.45, turnMul: 0.58, palettes: genPalette(6, 55, 55, 55, 30, 100) },
  moto:  { w: 2.0, h: 0.8, speedMul: 1.28, accelMul: 1.35, turnMul: 1.3, palettes: genPalette(10, 78, 50, 78, 25, 60) },
  bike:  { w: 1.7, h: 0.6, speedMul: 0.32, accelMul: 0.5, turnMul: 1.2, palettes: genPalette(8, 58, 50, 58, 25, 280) },
  ambulance: { w: 5.0, h: 2.1, speedMul: 0.8, accelMul: 0.85, palettes: [['#f2f2f2','#c0392b'],['#eef4ff','#1d3f8a']] },
  firetruck: { w: 7.5, h: 2.4, speedMul: 0.45, accelMul: 0.5, palettes: [['#d8362b','#5c1712'],['#b9271e','#40100c'],['#e0453a','#671b14']] },
};
