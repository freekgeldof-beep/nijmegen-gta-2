const TRACKS = [
  ['Keeps the Flame', '/audio/keeps-the-flame.mp3'],
  ['Take It Slow', '/audio/take-it-slow.mp3'],
  ['Carry Me Slow', '/audio/carry-me-slow.mp3'],
];

const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));

export function createAudio() {
  const music = new Audio();
  music.preload = 'none';
  music.volume = 0;
  const saved = (() => { try { return JSON.parse(localStorage.getItem('cityRunAudio')) || {}; } catch { return {}; } })();
  const settings = {
    music: saved.music !== false,
    effects: saved.effects !== false,
    musicVolume: clamp(saved.musicVolume ?? .42),
    effectsVolume: clamp(saved.effectsVolume ?? .65),
  };
  let context, unlocked = false, paused = false, track = Math.floor(Math.random() * TRACKS.length);
  let horn = null, siren = null, sirenOn = false;
  const els = {
    music: document.getElementById('musicEnabled'), effects: document.getElementById('effectsEnabled'),
    musicVolume: document.getElementById('musicVolume'), effectsVolume: document.getElementById('effectsVolume'),
    track: document.getElementById('trackName'), siren: document.getElementById('sirenStatus'),
  };
  function save() { try { localStorage.setItem('cityRunAudio', JSON.stringify(settings)); } catch { /* private browsing */ } }
  function syncMusic() {
    music.volume = settings.music ? settings.musicVolume : 0;
    if (!unlocked || paused || !settings.music) { music.pause(); return; }
    if (!music.src) music.src = TRACKS[track][1];
    music.play().catch(() => {});
  }
  function syncControls() {
    els.music.checked = settings.music; els.effects.checked = settings.effects;
    els.musicVolume.value = Math.round(settings.musicVolume * 100);
    els.effectsVolume.value = Math.round(settings.effectsVolume * 100);
    els.musicVolume.disabled = !settings.music; els.effectsVolume.disabled = !settings.effects;
    els.track.textContent = TRACKS[track][0];
    els.siren.textContent = sirenOn ? 'Sirene aan [S]' : 'Sirene uit [S]';
  }
  function unlock() {
    if (!context) context = new (window.AudioContext || window.webkitAudioContext)();
    context.resume().catch(() => {});
    unlocked = true; syncMusic();
  }
  function tone(frequency, duration, type = 'square', volume = .15, endFrequency = frequency) {
    if (!unlocked || !settings.effects || !settings.effectsVolume || paused) return;
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(1, frequency), context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), context.currentTime + duration);
    gain.gain.setValueAtTime(Math.max(.0001, volume * settings.effectsVolume), context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(); oscillator.stop(context.currentTime + duration);
  }
  function noise(duration, volume, cutoff = 900) {
    if (!unlocked || !settings.effects || !settings.effectsVolume || paused) return;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(volume * settings.effectsVolume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + duration);
    source.connect(filter).connect(gain).connect(context.destination);
    source.start(); source.stop(context.currentTime + duration);
  }
  function effect(kind) {
    if (kind === 'shot') { noise(.10, .18, 2400); tone(150, .09, 'sawtooth', .14, 60); }
    if (kind === 'explosion' || kind === 'wasted') { noise(.55, .45, 600); tone(90, .45, 'sawtooth', .2, 35); }
    if (kind === 'collision') { noise(.17, .24, 700); tone(110, .14, 'triangle', .2, 55); }
    if (kind === 'minePlaced') tone(480, .08, 'sine', .12, 310);
    if (kind === 'checkpoint') { tone(680, .15, 'sine', .13, 880); setTimeout(() => tone(940, .2, 'sine', .13), 130); }
    if (kind === 'shirt') { tone(520, .14, 'sine', .13, 780); setTimeout(() => tone(1040, .24, 'sine', .13), 130); }
    if (kind === 'case') { tone(420, .13, 'triangle', .14, 560); setTimeout(() => tone(700, .2, 'triangle', .14), 120); }
  }
  function stopLoop(ref) { if (!ref) return; ref.oscillator.stop(); ref.oscillator.disconnect(); ref.gain.disconnect(); }
  function makeLoop(frequency, type, volume) {
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = type; oscillator.frequency.value = frequency;
    gain.gain.value = volume * settings.effectsVolume;
    oscillator.connect(gain).connect(context.destination); oscillator.start();
    return { oscillator, gain };
  }
  function syncLoops() {
    const audible = unlocked && !paused && settings.effects && settings.effectsVolume > 0;
    if (horn) horn.gain.gain.value = audible ? .12 * settings.effectsVolume : 0;
    if (siren) siren.gain.gain.value = audible && sirenOn ? .09 * settings.effectsVolume : 0;
  }
  function setHorn(on) {
    if (on) {
      unlock();
      if (!horn) horn = makeLoop(275, 'sawtooth', .12);
    } else { stopLoop(horn); horn = null; }
    syncLoops();
  }
  function toggleSiren() {
    unlock(); sirenOn = !sirenOn;
    if (sirenOn && !siren) siren = makeLoop(650, 'sine', .09);
    if (!sirenOn) { stopLoop(siren); siren = null; }
    syncLoops(); syncControls();
  }
  function update(time) {
    if (siren) siren.oscillator.frequency.value = Math.sin(time * 7) > 0 ? 740 : 490;
  }
  music.addEventListener('ended', () => {
    track = (track + 1) % TRACKS.length; music.src = TRACKS[track][1]; syncControls(); syncMusic();
  });
  els.music.addEventListener('change', () => { settings.music = els.music.checked; save(); syncControls(); syncMusic(); });
  els.effects.addEventListener('change', () => { settings.effects = els.effects.checked; save(); syncControls(); syncLoops(); });
  for (const [key, el] of [['musicVolume', els.musicVolume], ['effectsVolume', els.effectsVolume]]) {
    el.addEventListener('input', () => { settings[key] = clamp(el.value / 100); save(); syncMusic(); syncLoops(); });
  }
  document.getElementById('nextTrack').addEventListener('click', () => {
    track = (track + 1) % TRACKS.length; music.src = TRACKS[track][1]; syncControls(); unlock(); syncMusic();
  });
  syncControls();
  return {
    unlock, effect, setHorn, toggleSiren, update,
    setPaused(value) { paused = value; if (value) setHorn(false); syncMusic(); syncLoops(); },
    stopVehicleSounds() { setHorn(false); if (sirenOn) toggleSiren(); },
  };
}
