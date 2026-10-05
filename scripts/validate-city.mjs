import fs from 'node:fs';
import assert from 'node:assert/strict';
import {buildWorld} from '../src/world.js';
import {createGameState} from '../src/entities.js';
import {nearestRoadPoint,roadDistances} from '../src/navigation.js';
import {inside} from './import-city.mjs';
const city=JSON.parse(fs.readFileSync(new URL('../public/city.json',import.meta.url)));
if(!city.configured){console.log('Ongevulde basis: setup-scherm actief; geen stad om te valideren.');process.exit(0);}
const read=name=>JSON.parse(fs.readFileSync(new URL(`../public/${city.dataPath||'data'}/${name}.json`,import.meta.url)));
const raw={osm:read('osm-data'),green:read('green-data'),extra:read('extra-data'),landmarks:read('landmarks'),rails:read('rails'),city};
assert.deepEqual(city.boundary[0],city.boundary.at(-1),'boundary must close');
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
for(let i=0;i<city.boundary.length-1;i++)for(let j=i+2;j<city.boundary.length-1;j++){
  if(i===0&&j===city.boundary.length-2)continue;
  const a=city.boundary[i],b=city.boundary[i+1],c=city.boundary[j],d=city.boundary[j+1];
  assert.ok(!(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0),`boundary self-intersection ${i}/${j}`);
}
const world=buildWorld(raw),sim=createGameState(world),p=sim.state.player;
assert.ok(!world.collidesBuildingsOrRing(p.x,p.y,p.angle,p.w,p.h),'spawn must be collision free');
assert.ok(world.landmarks.length>0,'landmark inventory empty');
assert.equal(world.landmarks.length,raw.landmarks.ways.length+raw.landmarks.points.length,'every imported landmark must be visible');
for(const name of city.requiredLandmarks||[])assert.ok(world.landmarks.some(l=>l.name.toLowerCase().includes(name.toLowerCase())),`missing ${name}`);
const origin=nearestRoadPoint(world.roads,p.x,p.y),distances=roadDistances(world,origin);
assert.ok(distances.size>world.nodesById.size*.65,'main road network must be connected');
assert.ok(sim.startMission(),'at least one courier mission must be reachable from spawn');
assert.ok(sim.startRace()===false,'active courier prevents overlapping race');
sim.resetGame();assert.ok(sim.startRace(),'checkpoint race available from spawn');
for(const bridge of city.terminalBridges||[]){
  for(const coordinate of bridge.crossingSamples){const q=world.project(...coordinate);const r=nearestRoadPoint(world.roads,q.x,q.y);assert.ok(r&&r.distance<30,`${bridge.name} road missing`);const a=r.road.pts[0],b=r.road.pts.at(-1),angle=Math.atan2(b.y-a.y,b.x-a.x);assert.ok(!world.collidesBuildingsOrRing(r.x,r.y,angle,4.2,1.9),`${bridge.name} deck blocked`);}
  const outside=world.project(...bridge.beyond);assert.ok(world.collidesBuildingsOrRing(outside.x,outside.y,0,4.2,1.9),`${bridge.name} must stop at endpoint`);
  assert.ok(!inside(bridge.beyond,city.boundary),'beyond bridge endpoint cannot be inside boundary');
}
console.log(JSON.stringify({city:city.name,roads:world.roads.length,buildings:world.buildings.length,landmarks:world.landmarks.length,reachableNodes:distances.size,totalNodes:world.nodesById.size,spawn:{x:p.x,y:p.y},terminalBridges:(city.terminalBridges||[]).length},null,2));
