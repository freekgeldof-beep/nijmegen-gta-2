const $ = id => document.getElementById(id);
const time = seconds => { const value = Math.ceil(Math.max(0, seconds)); return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`; };
export function createHUD(sim, city = {}) {
  const cityName = city.name || 'Stad';
  const ids = ['speed','speedRow','footLabel','vehicleName','ammo','mines','streetname','clock','wanted','wantedSub','police','escapeMeter','arrestMeter','arrestCount','immune','wasted','busted','missionTitle','missionDetail','missionTime','missionReward','missionButton','targetDistance','earnings','contextHint','toast'];
  const el = Object.fromEntries(ids.map(id => [id, $(id)]));
  const text = (id, value) => { if (el[id].textContent !== String(value)) el[id].textContent = value; };
  const names = { car:'Stadsauto', sport:'Sportwagen', cabrio:'Cabriolet', van:'Bestelbus', truck:'Vrachtwagen', bus:'Stadsbus', moto:'Motor', bike:'Fiets', ambulance:'Ambulance', firetruck:'Brandweer' };
  let lastStreet = -Infinity, street = cityName, toastTime = 0;
  function notify(message) { text('toast', message); el.toast.hidden = false; toastTime = 3.5; }
  function update(dt, clock) {
    toastTime -= dt; if (toastTime <= 0) el.toast.hidden = true;
    const { player:p, mission:m } = sim.state;
    const health = Math.max(0, Math.min(100, p.health ?? 100));
    $('damageValue').textContent = `${Math.round(health)}%`;
    $('damageFill').style.width = `${health}%`;
    $('shirtShield').hidden = p.shirtImmuneT <= 0;
    if (p.shirtImmuneT > 0) $('shirtShieldTime').textContent = Math.ceil(p.shirtImmuneT);
    text('speed', Math.round(Math.abs(p.speed) * 3.6));
    el.speedRow.hidden = p.mode !== 'car'; el.footLabel.hidden = p.mode === 'car';
    text('vehicleName', p.mode === 'car' ? names[p.vtype] || 'Voertuig' : 'Te voet');
    text('ammo', sim.state.ammo); text('mines', sim.state.mineCount);
    text('clock', clock); text('earnings', `€ ${m.earnings.toLocaleString('nl-NL')}`);
    const searching = p.wanted && p.wantedClearTimer > 0;
    el.police.dataset.state = p.wanted ? searching ? 'search' : 'chase' : 'clear';
    text('wanted', p.wanted ? searching ? 'ZOEKGEBIED' : 'ACHTERVOLGING' : 'VRIJE DOORGANG');
    text('wantedSub', p.wanted ? searching ? `Ontsnap over ${Math.ceil(sim.WANTED_CLEAR_TIME - p.wantedClearTimer)} sec` : 'Schud de politie van je af' : 'Geen politie op je spoor');
    el.escapeMeter.style.width = `${p.wantedClearTimer / sim.WANTED_CLEAR_TIME * 100}%`;
    el.arrestMeter.style.width = `${p.policeHitCount / sim.POLICE_HITS_TO_BUST * 100}%`;
    text('arrestCount', `${p.policeHitCount} / ${sim.POLICE_HITS_TO_BUST}`);
    el.immune.hidden = p.policeImmuneT <= 0;
    text('immune', `BESCHERMD · ${time(p.policeImmuneT)}`);
    el.wasted.hidden = !p.wasted; el.busted.hidden = !p.busted;
    if (sim.state.simTime - lastStreet > .4 || sim.state.simTime < lastStreet) {
      street = sim.nearestStreetName() || cityName; lastStreet = sim.state.simTime;
    }
    text('streetname', street);
    const active = m.status === 'active';
    text('missionTitle', active ? m.target.name : m.status === 'complete' ? 'Netjes afgeleverd.' : m.status === 'failed' ? 'Rit afgebroken.' : 'De stad wacht.');
    text('missionDetail', active ? (p.wanted ? 'Raak de politie kwijt voordat je aflevert.' : 'Bezorg de lading. Stop met je voertuig in de gouden cirkel.') : m.status === 'complete' ? `€ ${m.reward} verdiend. Klaar voor de volgende rit?` : m.status === 'failed' ? m.reason : `Pak een koeriersrit en ontdek ${cityName} op jouw tempo.`);
    text('missionTime', active ? time(m.remaining) : 'KOERIER');
    text('missionReward', active ? `€ ${m.reward}` : `${m.completed} bezorgd`);
    el.missionButton.hidden = active;
    el.missionButton.disabled = p.wasted || p.busted;
    text('missionButton', m.status === 'idle' ? 'Start rit [M]' : 'Nieuwe rit [M]');
    text('targetDistance', active ? `DOEL · ${Math.round(Math.hypot(p.x - m.target.x, p.y - m.target.y))} m hemelsbreed` : `${cityName.toUpperCase()} · VRIJ RIJDEN`);
    const race = sim.state.race;
    const racing = race.status === 'active';
    $('racePanel').hidden = !racing;
    $('mission').hidden = racing;
    if (racing) {
      const checkpoint = race.checkpoints[race.index];
      $('raceClock').textContent = time(race.remaining);
      $('raceProgress').textContent = `${race.index + 1} / ${race.checkpoints.length}`;
      $('raceMessage').textContent = checkpoint.name === 'FINISH' ? 'FINISH IN ZICHT' : `${checkpoint.name} · +22 SEC`;
      $('racePanel').dataset.urgent = race.remaining < 10;
      text('targetDistance', `RACE · ${Math.round(Math.hypot(p.x - checkpoint.x, p.y - checkpoint.y))} m naar ${checkpoint.name}`);
    }
    const enterable = p.mode === 'foot' && sim.nearestEnterable();
    el.contextHint.hidden = p.wasted || p.busted || (p.mode === 'foot' && !enterable);
    text('contextHint', p.mode === 'car' ? '[SPATIE] Uitstappen' : '[SPATIE] Instappen');
  }
  return { update, notify };
}
