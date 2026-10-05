const NS = 'http://www.w3.org/2000/svg';
export function createCityMap(world, sim, pause) {
  const dialog = document.getElementById('cityMap'), canvas = document.getElementById('mapCanvas');
  const search = document.getElementById('landmarkSearch'), list = document.getElementById('landmarkList');
  const svg = document.createElementNS(NS, 'svg');
  const pad = 100, view = [world.ringMinX-pad, world.ringMinY-pad, world.ringMaxX-world.ringMinX+2*pad, world.ringMaxY-world.ringMinY+2*pad];
  const setView = v => svg.setAttribute('viewBox', v.join(' ')); setView(view);
  svg.setAttribute('role','img'); svg.setAttribute('aria-label',`Speelgebied ${world.city.name} met alle landmarks`);
  const draw = (tag, attrs) => {const el=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));svg.appendChild(el);return el;};
  const coords = pts => pts.map(p=>`${p.x},${p.y}`).join(' ');
  draw('polygon',{points:coords(world.ringPts),fill:'#244039',stroke:'#ffce69','stroke-width':3});
  for(const w of world.waters)draw('polygon',{points:coords(w.pts),fill:'#38677c'});
  for(const w of world.waterLines)draw('polyline',{points:coords(w.pts),fill:'none',stroke:'#38677c','stroke-width':w.width});
  for(const g of world.greens)draw('polygon',{points:coords(g.pts),fill:'#335b3b'});
  for(const b of world.buildings)draw('polygon',{points:coords(b.pts),fill:b.isLandmark?'#ae8b52':'#52706b'});
  for(const r of world.roads)draw('polyline',{points:coords(r.pts),fill:'none',stroke:'#a5b9ad','stroke-width':world.roadWidth(r)/2});
  for(const r of world.railLines)draw('polyline',{points:coords(r.pts),fill:'none',stroke:'#122029','stroke-width':5,'stroke-dasharray':'10 7'});
  const labels = world.landmarks.map((lm,i)=>{
    const dot=draw('circle',{cx:lm.cx,cy:lm.cy,r:5,class:'map-dot'});
    const text=draw('text',{x:lm.cx+8,y:lm.cy-8,class:'map-label'});text.textContent=lm.name;
    dot.addEventListener('click',()=>select(i));return {lm,dot,text};
  });
  const player=draw('circle',{r:9,fill:'#72eced',stroke:'#fff','stroke-width':2}); canvas.appendChild(svg);
  function select(index){
    for(let i=0;i<labels.length;i++){labels[i].dot.classList.toggle('selected',i===index);labels[i].text.classList.toggle('selected',i===index);}
    const {lm}=labels[index];setView([lm.cx-300,lm.cy-250,600,500]);
  }
  function filter(){
    const query=search.value.toLocaleLowerCase('nl');list.replaceChildren();let count=0;
    labels.forEach(({lm,dot,text},i)=>{const match=`${lm.name} ${lm.cat}`.toLocaleLowerCase('nl').includes(query);dot.style.display=text.style.display=match?'':'none';if(!match)return;count++;
      const li=document.createElement('li'),button=document.createElement('button'),small=document.createElement('small');button.type='button';button.textContent=lm.name;small.textContent=lm.cat;button.appendChild(small);button.addEventListener('click',()=>select(i));li.appendChild(button);list.appendChild(li);
    });document.getElementById('landmarkCount').textContent=`${count} / ${labels.length} landmarks · scroll om te zoomen`;
  }
  search.addEventListener('input',filter);filter();
  document.getElementById('mapBoundaryDescription').textContent=world.city.boundaryDescription||'';
  function open(){pause(true);document.getElementById('pause').hidden=true;setView(view);player.setAttribute('cx',sim.state.player.x);player.setAttribute('cy',sim.state.player.y);dialog.showModal();search.focus();}
  function close(){dialog.close();pause(false);}
  document.getElementById('closeMap').addEventListener('click',close);
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  svg.addEventListener('wheel',e=>{e.preventDefault();const v=svg.getAttribute('viewBox').split(' ').map(Number),factor=e.deltaY>0?1.15:1/1.15;const w=Math.min(view[2]*1.3,Math.max(150,v[2]*factor)),h=w*view[3]/view[2];setView([v[0]+(v[2]-w)/2,v[1]+(v[3]-h)/2,w,h]);},{passive:false});
  let drag=null;svg.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,v:svg.getAttribute('viewBox').split(' ').map(Number)};svg.setPointerCapture(e.pointerId);});
  svg.addEventListener('pointermove',e=>{if(!drag)return;const scale=Math.max(drag.v[2]/svg.clientWidth,drag.v[3]/svg.clientHeight);setView([drag.v[0]-(e.clientX-drag.x)*scale,drag.v[1]-(e.clientY-drag.y)*scale,drag.v[2],drag.v[3]]);});svg.addEventListener('pointerup',()=>drag=null);svg.addEventListener('pointercancel',()=>drag=null);
  return {open,close,isOpen:()=>dialog.open};
}
