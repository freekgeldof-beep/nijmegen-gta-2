import test from 'node:test';
import assert from 'node:assert/strict';
import {clipLine, transformCity} from '../scripts/import-city.mjs';
const boundary=[[0,0],[0,1],[1,1],[1,0],[0,0]];
test('roads crossing a boundary are clipped at both ends',()=>{
  assert.deepEqual(clipLine([[.5,-1],[.5,2]],boundary),[[[.5,0],[.5,1]]]);
});
test('a concave city boundary splits a road across excluded land',()=>{
  const p=[[0,0],[0,3],[3,3],[3,2],[1,2],[1,1],[3,1],[3,0],[0,0]];
  assert.deepEqual(clipLine([[2,-1],[2,4]],p),[[[2,0],[2,1]],[[2,2],[2,3]]]);
});
test('OSM interior shared nodes become actual connected road endpoints',()=>{
  const source={elements:[{type:'way',id:1,tags:{highway:'residential',name:'A'},geometry:[{lat:.5,lon:.1},{lat:.5,lon:.5},{lat:.5,lon:.9}]},{type:'way',id:2,tags:{highway:'residential',name:'B'},geometry:[{lat:.2,lon:.5},{lat:.5,lon:.5}]},{type:'way',id:3,tags:{building:'yes'},geometry:[{lat:.7,lon:.7},{lat:.7,lon:.8},{lat:.8,lon:.8},{lat:.7,lon:.7}]},{type:'node',id:4,tags:{name:'Park Test',leisure:'park'},lat:.3,lon:.3}]};
  const out=transformCity(source,{id:'test',bbox:[0,0,1,1],boundary});
  assert.equal(out['osm-data'].roads.length,3);
  assert.ok(out['osm-data'].roads.every(r=>r.g.some(p=>p[0]===.5&&p[1]===.5)));
  assert.equal(out.landmarks.points[0].markerOnly,true);
});
test('a required landmark missing from source data is an import failure',()=>{
  assert.throws(()=>transformCity({elements:[]},{id:'test',bbox:[0,0,1,1],boundary,requiredLandmarks:['Kerk']}),/Verplichte landmarks/);
});
