// Olfactory profile for the notebook: note pyramid bar, family radar by layer and pyramid balance.
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=n=>`${(Math.round(n*10)/10).toFixed(1)}%`;
const FAMILIES=['Citrus','Floral','Woody','Spicy','Amber','Green','Musk','Gourmand','Aquatic','Leather'];
const LAYERS=[['Top','#d9822b'],['Heart','#1f8a4c'],['Base','#8a5a35']];
const PRESETS={'Classic (20 / 50 / 30)':[20,50,30],'Fresh (30 / 45 / 25)':[30,45,25],'Oriental (15 / 40 / 45)':[15,40,45],'Linear (33 / 34 / 33)':[33,34,33]};
let rows=window.lastComposition||[],mode='conc',axes='all',preset=Object.keys(PRESETS)[0];
const box=$('#olfactory');

function render(){
  const aromatic=rows.filter(r=>r.note!=='Solvent'&&r.pure>0);
  const total=aromatic.reduce((s,r)=>s+r.pure,0);
  if(!total){box.innerHTML='<h2>Olfactory profile</h2><p class="small">Add materials with a tier (Top, Heart or Base) and a family to see the profile.</p>';return;}
  const layer=Object.fromEntries(LAYERS.map(([l])=>[l,aromatic.filter(r=>r.note===l).reduce((s,r)=>s+r.pure,0)]));
  const share=l=>layer[l]/total*100;
  const byFam=(l)=>Object.fromEntries(FAMILIES.map(f=>[f,aromatic.filter(r=>(!l||r.note===l)&&r.family===f).reduce((s,r)=>s+r.pure,0)]));
  const famAll=byFam();
  const value=v=>mode==='conc'?v/total*100:v;
  const unit=mode==='conc'?'%':' g';

  // Radar: one polygon per note layer.
  const active=FAMILIES.filter(f=>famAll[f]>0),AX=axes==='active'&&active.length>=3?active:FAMILIES;
  const R=150,cx=200,cy=190,maxV=Math.max(...LAYERS.flatMap(([l])=>Object.values(byFam(l)).map(value)),1e-9);
  const pt=(i,v)=>{const a=-Math.PI/2+i*2*Math.PI/AX.length,r=R*v/maxV;return [cx+r*Math.cos(a),cy+r*Math.sin(a)];};
  const rings=[.25,.5,.75,1].map(k=>`<polygon points="${AX.map((_,i)=>pt(i,maxV*k).join(',')).join(' ')}" class="ring"/>`).join('');
  const spokes=AX.map((f,i)=>{const [x,y]=pt(i,maxV),[lx,ly]=pt(i,maxV*1.16);return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" class="ring"/><text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle">${f}</text>`;}).join('');
  const polys=LAYERS.map(([l,c])=>{const f=byFam(l);if(!layer[l])return '';return `<polygon points="${AX.map((x,i)=>pt(i,value(f[x])).join(',')).join(' ')}" fill="${c}22" stroke="${c}" stroke-width="2"/>`+AX.map((x,i)=>f[x]?`<circle cx="${pt(i,value(f[x]))[0]}" cy="${pt(i,value(f[x]))[1]}" r="4" fill="#fff" stroke="${c}" stroke-width="2"><title>${l} · ${x}: ${mode==='conc'?pct(value(f[x])):value(f[x]).toFixed(3)+' g'}</title></circle>`:'').join('');}).join('');
  const scaleLbl=[.5,1].map(k=>`<text x="${cx+4}" y="${cy-R*k}" class="tick">${mode==='conc'?pct(maxV*k):(maxV*k).toFixed(2)+' g'}</text>`).join('');

  // Pyramid balance triangle: actual vs target.
  const target=PRESETS[preset],T=110,tx=180,ty=150;
  const tri=(vals,k=1)=>[[0,-1],[0.866,0.5],[-0.866,0.5]].map(([dx,dy],i)=>`${tx+dx*T*vals[i]/70*k},${ty+dy*T*vals[i]/70*k}`).join(' ');
  const actual=[share('Top'),share('Heart'),share('Base')];
  const outline=[[0,-1],[0.866,0.5],[-0.866,0.5]].map(([dx,dy])=>`${tx+dx*T},${ty+dy*T}`).join(' ');

  const lead=FAMILIES.map(f=>[f,famAll[f]/total*100]).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  const domLayer=LAYERS.map(([l])=>l).sort((a,b)=>layer[b]-layer[a])[0];
  const character={Citrus:'bright',Floral:'expressive',Woody:'grounded',Spicy:'warm',Amber:'rich',Green:'fresh',Musk:'soft',Gourmand:'edible',Aquatic:'airy',Leather:'smoky'};
  const summary=lead.length?`${lead.slice(0,2).map(([f])=>f).join(' · ')} — ${character[lead[0][0]]} composition core anchored in the ${domLayer.toLowerCase()} notes`:'';
  const unassigned=aromatic.filter(r=>!r.family).reduce((s,r)=>s+r.pure,0)/total*100;
  const topIn=l=>{const r=aromatic.filter(r=>r.note===l).sort((a,b)=>b.pure-a.pure)[0];return r?`${r.family||'No family'} (${r.name})`:'—';};

  box.innerHTML=`<div class="olf-head"><div><h2>Olfactory profile &amp; note distribution</h2><p class="small">Based on pure aromatic mass (dilution applied); solvents excluded.</p></div>
  <div class="seg-wrap"><div class="seg" role="group" aria-label="Radar values"><button type="button" data-m="conc" aria-pressed="${mode==='conc'}">% concentrate</button><button type="button" data-m="mass" aria-pressed="${mode==='mass'}">Pure mass (g)</button></div><div class="seg" role="group" aria-label="Radar axes"><button type="button" data-a="all" aria-pressed="${axes==='all'}">All 10 families</button><button type="button" data-a="active" aria-pressed="${axes==='active'}">Active (${FAMILIES.filter(f=>famAll[f]>0).length})</button></div></div></div>
  <div class="pyr-bar" role="img" aria-label="Top ${pct(share('Top'))}, heart ${pct(share('Heart'))}, base ${pct(share('Base'))}">${LAYERS.map(([l,c])=>`<span style="width:${share(l)}%;background:${c}"></span>`).join('')}</div>
  <p class="small pyr-legend">${LAYERS.map(([l,c])=>`<span><i style="background:${c}"></i>${l} ${pct(share(l))}</span>`).join('')}${layer.Top+layer.Heart+layer.Base<total-1e-9?`<span>Unassigned tier ${pct(100-share('Top')-share('Heart')-share('Base'))}</span>`:''}</p>
  <div class="olf-grid"><figure><figcaption>Olfactory families by note layer<span class="layer-chips">${LAYERS.map(([l,c])=>`<span><i style="background:${c}"></i>${l} <b>${Math.round(share(l))}%</b></span>`).join('')}</span></figcaption><svg viewBox="0 0 400 390" class="radar">${rings}${spokes}${scaleLbl}${polys}</svg>
  <p class="small"><strong>Leading chords:</strong> ${lead.slice(0,4).map(([f,v])=>`${f} ${pct(v)}`).join(' · ')||'—'}${unassigned?` · <em>no family: ${pct(unassigned)}</em>`:''}</p></figure>
  <figure><figcaption>Pyramid balance (T / H / B) <select id="pyr-preset">${Object.keys(PRESETS).map(k=>`<option ${k===preset?'selected':''}>${k}</option>`).join('')}</select></figcaption>
  <svg viewBox="0 0 360 290" class="radar"><polygon points="${outline}" class="ring"/><polygon points="${tri([20,20,20])}" class="ring"/><polygon points="${tri([40,40,40])}" class="ring"/>
  <polygon points="${tri(target)}" fill="none" stroke="#888" stroke-dasharray="5 4" stroke-width="1.5"/><polygon points="${tri(actual.map(v=>Math.min(v,70)))}" fill="#1f8a4c33" stroke="#1f8a4c" stroke-width="2"/>
  <text x="${tx}" y="${ty-T-12}" text-anchor="middle">Top</text><text x="${tx+0.866*T+8}" y="${ty+0.5*T+16}" text-anchor="middle">Heart</text><text x="${tx-0.866*T-8}" y="${ty+0.5*T+16}" text-anchor="middle">Base</text></svg>
  <ul class="pyr-list">${LAYERS.map(([l,c],i)=>`<li><i style="background:${c}"></i><div><strong>${l} notes</strong><span class="small">${esc(topIn(l))}</span></div><div class="num"><strong>${pct(actual[i])}</strong> <span class="small">(${actual[i]-target[i]>=0?'+':''}${Math.round(actual[i]-target[i])}%)</span><span class="small">${layer[l].toFixed(2)} g</span></div></li>`).join('')}</ul>
  ${summary?`<p class="olf-summary">✦ ${esc(summary)}</p>`:''}<p class="small">Dashed line: target. Differences are a guide, not a rule — many great perfumes break the classic pyramid.</p></figure></div>`;
  box.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{mode=b.dataset.m;render();});box.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>{axes=b.dataset.a;render();});
  $('#pyr-preset').onchange=e=>{preset=e.target.value;render();};
}
window.addEventListener('formula-composition',e=>{rows=e.detail||[];render();});
render();
