import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildWorld } from '../src/world.js';
import { createGameState } from '../src/entities.js';
import { bindInput } from '../src/input.js';

const raw = Object.fromEntries(Object.entries({osm:'osm-data', green:'green-data', extra:'extra-data', landmarks:'landmarks', rails:'rails'})
  .map(([key, file]) => [key, JSON.parse(fs.readFileSync(new URL('../test/fixtures/eindhoven/' + file + '.json', import.meta.url), 'utf8'))]));
const world = buildWorld(raw);
function setup() {
  const sim = createGameState(world);
  const officer = sim.state.police[0];
  sim.state.traffic = []; sim.state.police = []; sim.state.pickups = [];
  return {sim, officer};
}

test('pickup respawn uses elapsed seconds at 30, 60 and 144 fps', () => {
  for (const hz of [30, 60, 144]) {
    const {sim} = setup();
    const pickup = {type:'beer', alive:false, respawnT:90, homeX:1e5, homeY:1e5};
    sim.state.pickups = [pickup];
    for (let i=0; i<hz*10; i++) sim.update(1/hz);
    assert.ok(Math.abs(pickup.respawnT - 80) < 1e-8);
    pickup.respawnT = 1/hz;
    sim.update(1/hz);
    assert.equal(pickup.alive, true);
  }
});

for (const weapon of ['bullet', 'mine']) test(weapon + ' disables foot police until respawn', () => {
  const {sim, officer:p} = setup();
  Object.assign(p, {onFoot:true, alive:true, x:sim.state.player.x, y:sim.state.player.y});
  sim.state.police = [p];
  sim.state.player.wanted = true; sim.state.player.policeHitCooldown = 1;
  if (weapon === 'bullet') sim.state.bullets.push({x:p.x-4, y:p.y, angle:0, speed:80, life:1});
  else sim.state.mines.push({x:p.x, y:p.y, r:0.6, armed:true, t:0.5, selfSafe:true});
  sim.update(0.05);
  assert.equal(p.alive, false); assert.equal(p.onFoot, false);
  const {x,y,respawnT} = p;
  sim.state.player.policeHitCooldown = 0;
  sim.update(0.05);
  assert.equal(p.x,x); assert.equal(p.y,y);
  assert.equal(sim.state.player.policeHitCount,0);
  assert.ok(p.respawnT < respawnT);
  p.respawnT = 0.01;
  sim.update(0.05);
  assert.equal(p.alive,true); assert.equal(p.onFoot,false); assert.equal(p.state,'patrol');
});

test('foot police cannot be entered but patrol cars can', () => {
  const {sim, officer:p} = setup();
  sim.state.player.mode = 'foot';
  Object.assign(p,{x:sim.state.player.x,y:sim.state.player.y,onFoot:true,alive:true});
  sim.state.police=[p];
  sim.toggleEnterExit(); assert.equal(sim.state.player.mode,'foot');
  p.onFoot=false;
  sim.toggleEnterExit(); assert.equal(sim.state.player.mode,'car');
  assert.equal(sim.state.player.isStolen,true);
});

test('foot officer collision uses pedestrian dimensions', () => {
  const localWorld = {...world, overlappingBuilding:()=>null, collidesBuildingsOrRing:()=>false};
  const sim = createGameState(localWorld);
  const p = sim.state.police[0];
  Object.assign(sim.state.player,{x:0,y:0,angle:0,speed:1,vtype:'car',w:4.2,h:1.9});
  Object.assign(p,{x:3.5,y:0,angle:0,onFoot:true,alive:true});
  sim.state.traffic=[]; sim.state.police=[p]; sim.state.pickups=[];
  sim.update(0.05);
  assert.ok(sim.state.player.x>0, 'distant pedestrian should not block the car with an invisible vehicle');
});

test('exit picks a free side and stays in vehicle when both sides are blocked', () => {
  for (const allBlocked of [false,true]) {
    const sim = createGameState({...world, collidesBuildingsOrRing:(_x,y)=>allBlocked || y>0});
    Object.assign(sim.state.player,{x:0,y:0,angle:0});
    sim.toggleEnterExit();
    assert.equal(sim.state.player.mode,allBlocked?'car':'foot');
    assert.equal(sim.state.parkedCars.length,allBlocked?0:1);
    if (!allBlocked) assert.ok(sim.state.player.y<0);
  }
});

test('traffic lights group opposite approaches using road directions', () => {
  const nodesById = new Map(world.nodesById);
  const node = {id:1e6,x:12000,y:13000,curbR:5,edges:[]};
  for (const [i,[dx,dy]] of [[1,0],[-1,0],[0,1],[0,-1]].entries()) {
    node.edges.push({id:1e6+i,hw:'primary',nodeStart:node.id,nodeEnd:-i-1,pts:[{x:node.x,y:node.y},{x:node.x+dx*100,y:node.y+dy*100}]});
  }
  nodesById.set(node.id,node);
  const sim = createGameState({...world,nodesById,signalPts:[{x:node.x,y:node.y}]});
  const groups = sim.trafficLights.get(node.id).groupOf;
  assert.equal(groups.get(1e6),groups.get(1e6+1));
  assert.equal(groups.get(1e6+2),groups.get(1e6+3));
  assert.notEqual(groups.get(1e6),groups.get(1e6+2));
});

test('input clears held keys on blur or hidden document and ignores repeated space', () => {
  const listeners = {};
  const target = {addEventListener:(name,fn)=>listeners[name]=fn};
  const doc = {hidden:false,addEventListener:(name,fn)=>listeners[name]=fn};
  const keys = {}; let toggles=0;
  bindInput(target,doc,{setKey:(key,value)=>keys[key]=value,toggleEnterExit:()=>toggles++,placeMine(){},shoot(){},resetGame(){}},()=>{});
  const event = (key,repeat=false)=>({key,repeat,preventDefault(){}});
  listeners.keydown(event(' ')); listeners.keydown(event(' ',true));
  assert.equal(toggles,1);
  listeners.keydown(event('ArrowUp')); listeners.blur(); assert.equal(keys.ArrowUp,false);
  listeners.keydown(event('ArrowUp')); doc.hidden=true; listeners.visibilitychange(); assert.equal(keys.ArrowUp,false);
  listeners.keydown(event('ArrowDown')); listeners.keyup(event('ArrowDown')); assert.equal(keys.ArrowDown,false);
});

test('buildings over a road can be driven under, but not through their walls', () => {
  const over = world.buildings.filter(b => b.overRoad);
  assert.ok(over.length > 0, 'expected at least one building over a road in the data');
  let passed = 0;
  for (const b of over) {
    for (const r of world.roads) {
      if (r.hw === 'pedestrian' || r.hw === 'living_street') continue;
      for (let i = 1; i < r.pts.length; i++) {
        const a = r.pts[i - 1], c = r.pts[i];
        const x = (a.x + c.x) / 2, y = (a.y + c.y) / 2;
        if (!world.pointInPoly(x, y, b.pts)) continue;
        const angle = Math.atan2(c.y - a.y, c.x - a.x);
        if (world.collidesBuildingsOrRing(x, y, angle, 4.2, 1.9) && world.overlappingBuilding(x, y, angle, 4.2, 1.9) === b) continue;
        passed++;
      }
    }
  }
  assert.ok(passed > 0);
});
