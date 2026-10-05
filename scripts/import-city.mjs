import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function inside(p, polygon) {
  let yes=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[i],b=polygon[j];
    if((a[0]>p[0])!==(b[0]>p[0]) && p[1]<(b[1]-a[1])*(p[0]-a[0])/(b[0]-a[0])+a[1]) yes=!yes;
  } return yes;
}
const eq=(a,b)=>Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])<1e-9;
const round=p=>p.map(n=>Number(n.toFixed(7)));
export function clipLine(points, polygon) {
  const pieces=[];let current=[];
  const push=()=>{if(current.length>1)pieces.push(current);current=[];};
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1];const ts=[0,1];
    for(let j=0;j<polygon.length;j++){
      const c=polygon[j],d=polygon[(j+1)%polygon.length],ex=d[0]-c[0],ey=d[1]-c[1],den=dx*ey-dy*ex;
      if(Math.abs(den)<1e-15)continue;
      const t=((c[0]-a[0])*ey-(c[1]-a[1])*ex)/den,u=((c[0]-a[0])*dy-(c[1]-a[1])*dx)/den;
      if(t>0&&t<1&&u>=0&&u<=1)ts.push(t);
    }
    ts.sort((a,b)=>a-b);const unique=ts.filter((t,j)=>j===0||t-ts[j-1]>1e-10);
    for(let j=1;j<unique.length;j++){
      const t0=unique[j-1],t1=unique[j],mid=(t0+t1)/2;
      if(!inside([a[0]+dx*mid,a[1]+dy*mid],polygon)){push();continue;}
      const start=round([a[0]+dx*t0,a[1]+dy*t0]),end=round([a[0]+dx*t1,a[1]+dy*t1]);
      if(current.length&&!eq(current.at(-1),start))push();
      if(!current.length)current.push(start);if(!eq(current.at(-1),end))current.push(end);
    }
  }push();return pieces;
}
function geometry(e){return (e.geometry||[]).filter(p=>p?.lat!=null).map(p=>[p.lat,p.lon]);}
function closed(g){return g.length>=4&&eq(g[0],g.at(-1));}
function center(e){if(e.lat!=null)return [e.lat,e.lon];const g=geometry(e);if(g.length)return [g.reduce((s,p)=>s+p[0],0)/g.length,g.reduce((s,p)=>s+p[1],0)/g.length];const gs=(e.members||[]).flatMap(geometry);return gs.length?[gs.reduce((s,p)=>s+p[0],0)/gs.length,gs.reduce((s,p)=>s+p[1],0)/gs.length]:null;}
function outerRings(e){
  if(e.type==='way')return closed(geometry(e))?[geometry(e)]:[];
  const pending=(e.members||[]).filter(m=>m.type==='way'&&m.role!=='inner').map(geometry).filter(g=>g.length>1);const rings=[];
  while(pending.length){let g=pending.pop(),changed=true;while(!closed(g)&&changed){changed=false;for(let i=0;i<pending.length;i++){let h=pending[i];if(eq(g.at(-1),h.at(-1)))h=[...h].reverse();if(eq(g.at(-1),h[0])){g.push(...h.slice(1));pending.splice(i,1);changed=true;break;}if(eq(g[0],h[0]))h=[...h].reverse();if(eq(g[0],h.at(-1))){g=[...h.slice(0,-1),...g];pending.splice(i,1);changed=true;break;}}}if(closed(g))rings.push(g);}
  return rings;
}
const poiCat=t=>t['bridge:name']?'bridge':t.railway==='station'?'station':t.leisure==='stadium'?'stadium':t.amenity==='place_of_worship'?'church':t.amenity==='townhall'?'cityhall':t.tourism==='museum'?'museum':t.amenity==='university'?'university':t.amenity==='hospital'?'hospital':t.amenity==='theatre'?'theatre':t.leisure==='park'?'park':t.historic?'historic':t.tourism==='artwork'?'artwork':t.tourism==='viewpoint'?'viewpoint':'attraction';
const poiTags=t=>t.tourism||t.historic||['place_of_worship','university','hospital','theatre','townhall'].includes(t.amenity)||t.leisure==='stadium'||t.leisure==='park'||t.railway==='station'||t['bridge:name'];

export function transformCity(source, city) {
  const polygon=city.boundary, elements=source.elements;
  if(!Array.isArray(elements)||source.remark)throw new Error('Overpass gaf geen complete dataset: '+(source.remark||'elements ontbreekt'));
  const touches=g=>g.some(p=>inside(p,polygon))||polygon.some(p=>inside(p,g));
  const highways=new Set(['motorway','motorway_link','trunk','trunk_link','primary','primary_link','secondary','secondary_link','tertiary','tertiary_link','residential','unclassified','service','living_street','pedestrian','road']);
  const roadWays=elements.filter(e=>e.type==='way'&&highways.has(e.tags?.highway)&&e.geometry?.length>1);
  const counts=new Map();for(const e of roadWays)for(const p of new Set(geometry(e).map(p=>p.join(','))))counts.set(p,(counts.get(p)||0)+1);
  const roads=[];
  for(const e of roadWays){const t=e.tags,g=geometry(e);let piece=[g[0]];
    const emit=()=>{if(piece.length<2)return;for(const line of clipLine(piece,polygon))roads.push({n:t.name||t['bridge:name']||t.ref||'Straat',h:t.highway.replace(/_link$/,''),g:line,osmId:e.id,bridge:!!t.bridge&&t.bridge!=='no',bridgeName:t['bridge:name']||null});};
    for(let i=1;i<g.length;i++){piece.push(g[i]);if(i===g.length-1||counts.get(g[i].join(','))>1){emit();piece=[g[i]];}}
  }
  const buildings=[],greens=[],waters=[],waterLines=[],churches=[],signals=[],rails=[];
  const candidates=[];
  for(const e of elements){const t=e.tags||{},g=geometry(e),c=center(e);
    if(e.type==='way'&&t.building&&t.building!=='no'&&closed(g)&&touches(g))buildings.push(g.map(round));
    if((['forest','grass','meadow','recreation_ground'].includes(t.landuse)||['park','garden','nature_reserve'].includes(t.leisure)||t.natural==='wood')&&e.type==='way'&&closed(g)&&touches(g))greens.push(g.map(round));
    if(t.natural==='water'||t.waterway==='riverbank')for(const ring of outerRings(e))if(touches(ring))waters.push(ring.map(round));
    if(e.type==='way'&&t.waterway&&!closed(g))for(const line of clipLine(g,city.contextBoundary||polygon))waterLines.push({g:line,width:Number.parseFloat(t.width)||({river:150,canal:65,stream:4,ditch:2}[t.waterway]||3),name:t.name||''});
    if(e.type==='node'&&t.highway==='traffic_signals'&&c&&inside(c,polygon))signals.push(c);
    if(t.amenity==='place_of_worship'&&c&&inside(c,polygon))churches.push(c);
    if(e.type==='way'&&t.railway==='rail')rails.push(...clipLine(g,city.contextBoundary||polygon));
    const name=t['bridge:name']||t.name;if(!name||!poiTags(t)||!c||!inside(c,polygon))continue;
    const cat=poiCat(t);const buildingLandmark=e.type==='way'&&(t.building||t.leisure==='stadium')&&closed(g)&&cat!=='bridge';
    candidates.push({name,cat,source:`${e.type}/${e.id}`,lat:c[0],lon:c[1],g:buildingLandmark?g.map(round):null,tags:{height:t.height,levels:t['building:levels']},markerOnly:!buildingLandmark});
  }
  // Prefer an actual building footprint over a duplicate POI node.
  candidates.sort((a,b)=>Number(!!b.g)-Number(!!a.g));const chosen=[];
  for(const c of candidates)if(!chosen.some(p=>p.name.toLocaleLowerCase()===c.name.toLocaleLowerCase()&&Math.hypot((p.lat-c.lat)*110540,(p.lon-c.lon)*69000)<180))chosen.push(c);
  const ways=chosen.filter(p=>p.g).map(({lat,lon,markerOnly,...p})=>p),points=chosen.filter(p=>!p.g).map(({g,tags,...p})=>p);
  const all=[...ways,...points];const absent=(city.requiredLandmarks||[]).filter(name=>!all.some(p=>p.name.toLocaleLowerCase().includes(name.toLocaleLowerCase())));
  if(absent.length)throw new Error('Verplichte landmarks ontbreken: '+absent.join(', '));
  if(!roads.length||!buildings.length)throw new Error('Geen bruikbare kaartdata binnen de grens');
  return {'osm-data':{bbox:city.bbox,ring:polygon,roads,buildings},'green-data':{greens},'extra-data':{waters,waterLines,churches,signals},landmarks:{ways,points,churchNames:[]},rails:{rails},provenance:{source:'OpenStreetMap / Overpass API',copyright:'© OpenStreetMap contributors',license:'ODbL',licenseUrl:'https://www.openstreetmap.org/copyright',importedAt:new Date().toISOString(),osmTimestamp:source.osm3s?.timestamp_osm_base,city:city.id,boundaryDescription:city.boundaryDescription,counts:{roads:roads.length,buildings:buildings.length,greens:greens.length,waterPolygons:waters.length,waterLines:waterLines.length,railLines:rails.length,landmarks:all.length},landmarkInventory:all.map(p=>({name:p.name,category:p.cat,source:p.source}))}};
}
async function main(){
  const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));const city=JSON.parse(await fs.readFile(path.join(root,'public/city.json'),'utf8'));
  if(!city.bbox||city.boundary?.length<4)throw new Error('Vul bbox en een gesloten boundary in public/city.json in');
  let source;const args=process.argv.slice(2),idx=args.indexOf('--input');
  if(idx>=0)source=JSON.parse(await fs.readFile(args[idx+1],'utf8'));
  else {
    const box=city.bbox.join(','),query=`[out:json][timeout:180];(way[highway](${box});way[building](${box});nwr[natural=water](${box});way[waterway](${box});way[landuse~"forest|grass|meadow|recreation_ground"](${box});way[leisure~"park|garden|nature_reserve"](${box});way[natural=wood](${box});way[railway=rail](${box});nwr[name][tourism](${box});nwr[name][historic](${box});nwr[name][amenity~"place_of_worship|university|hospital|theatre|townhall"](${box});nwr[name][leisure=stadium](${box});nwr[name][railway=station](${box});node[highway=traffic_signals](${box}););out body geom;`;
    let last;for(const url of ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter']){try{console.log('OSM import',url);const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(240000)});if(!r.ok)throw new Error(`HTTP ${r.status}`);source=await r.json();if(source.remark)throw new Error(source.remark);break;}catch(e){last=e;console.warn(e.message);}}if(!source?.elements||source.remark)throw last||new Error('OSM import mislukt');
  }
  const data=transformCity(source,city),dir=path.resolve(root,'public',city.dataPath||'data');
  if(!dir.startsWith(path.resolve(root,'public')+path.sep))throw new Error('dataPath moet binnen public/ liggen');
  await fs.mkdir(dir,{recursive:true});for(const [name,content]of Object.entries(data))await fs.writeFile(path.join(dir,name+'.json'),JSON.stringify(content));
  city.configured=true;city.mapRevision=data.provenance.importedAt;await fs.writeFile(path.join(root,'public/city.json'),JSON.stringify(city,null,2)+'\n');
  console.log(JSON.stringify(data.provenance.counts,null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e);process.exitCode=1;});
