import {t,locale} from './preferences.js';
import {batch,dilution,scale,liquidPerfume,scaleTargets,dropsToGrams,gramsToDrops} from './math.js?v=drops-grams';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n.toFixed(4)).toLocaleString('en',{maximumFractionDigits:4});
const configs={
perfume:['Liquid perfume',[['size','Finished batch (mL)',50],['load','Fragrance concentration (%)',20],['drops','Drops in your trial blend',30],['conversion','Estimated drops per mL',22]],'Fragrance and carrier are calculated by volume. Drop conversions are estimates and vary by material and dropper.'],
solid:['Solid perfume',[['size','Finished batch (g)',15],['load','Fragrance (%)',5],['oil','Vegetable oil (%)',30],['butter','Vegetable butter (%)',50]],'Beeswax fills the remaining percentage. Weigh all ingredients in grams. These editable examples are not the course recipe or a validated product formula.'],
reed:['Reed diffuser',[['size','Finished batch (mL)',100],['load','Fragrance (%)',20],['dpg','Dipropylene glycol (%)',0],['water','Water (%)',0]],'Diffuser base fills the remaining volume. Starting values demonstrate arithmetic. Use the composition and fragrance load specified by your base supplier.'],
convert:['Drops ↔ grams',[['drops','Drops',20],['grams','Grams (g)',1],['conversion','Drops per mL',20],['density','Material density (g/mL)',0.9]],'Drops are an estimate: drop size depends on the dropper and the material. Typical essential oils are 0.85–0.95 g/mL and give about 20 drops per mL; check your supplier sheet for the real density.'],
dilution:['Dilute a stock solution',[['size','Final solution (g)',10],['stock','Stock concentration (%)',100],['target','Target concentration (%)',10]],'Stock and target percentages are by weight. Add solvent to reach the final weight. Dilution cannot increase stock strength.']};
let mode='perfume',worksheet=[];
function renderCalc(){
  const [title,fields,note]=configs[mode];
  const input=([id,label,val])=>`<label>${label}<input name="${id}" type="number" inputmode="decimal" step="any" value="${val}" min="${['size','drops','conversion','stock','target','fragranceDensity','carrierDensity','density'].includes(id)?'0.000001':'0'}" ${['load','oil','butter','dpg','water','stock','target'].includes(id)?'max="100"':''} required></label>`;
  $('#calculator').innerHTML=`<h3>${title}</h3><div class="two-col">${fields.map(input).join('')}</div>${mode==='perfume'?`<details class="weight-inputs"><summary>By weight (g)</summary><p class="small">Use the densities of your actual materials. The carrier conversion uses the alcohol density below.</p><div class="two-col">${input(['fragranceDensity','Fragrance oil density (g/mL)',0.9])}${input(['carrierDensity','Alcohol / carrier density (g/mL)',0.8])}</div></details><fieldset class="scale-inputs"><legend>Without taring</legend><p class="small">Place the empty bottle on your scale and enter its current reading. Targets include the bottle weight and use the densities above.</p><div class="two-col"><label>Starting scale reading (g)<input name="startingReading" type="number" inputmode="decimal" step="any" min="0" placeholder="44.681"></label><label>Scale precision<select name="scaleDecimals"><option value="2">0.01 g</option><option value="3">0.001 g</option></select></label></div></fieldset>`:''}<p class="small">Results update as you change a measurement.</p>`;
  $('#result-title').textContent=mode==='perfume'?'Your batch':title;
  $('.result-card>.eyebrow').textContent=mode==='perfume'?'Liquid perfume':'YOUR BATCH';
  $('#calc-note').textContent=note;
  calculate();
}
function resultRow(label,value,unit,fixed=false){
  const display=Number.isFinite(value)?(fixed?value.toFixed(4):fmt(value)):'—';
  return `<div class="result-row"><span>${label}</span><strong>${display}${Number.isFinite(value)?` <small>${unit}</small>`:''}</strong></div>`;
}
function scaleInstructions(v,result){
  const targets=scaleTargets(v.startingReading,result.fragranceG,result.carrierG);
  const decimals=v.scaleDecimals==='3'?3:2;
  const display=value=>Number.isFinite(value)?`${value.toFixed(decimals)} <small>g</small>`:'—';
  return `<div class="scale-targets"><h3>Without taring</h3><ol><li><span>Add fragrance oil until the scale reads</span><strong>${display(targets.afterOil)}</strong><small><span>Fragrance to add</span>: ${Number.isFinite(result.fragranceG)?fmt(result.fragranceG):'—'} g</small></li><li><span>Then add alcohol / carrier until the scale reads</span><strong>${display(targets.afterAlcohol)}</strong><small><span>Alcohol / carrier to add</span>: ${Number.isFinite(result.carrierG)?fmt(result.carrierG):'—'} g</small></li></ol><p class="small">Keep the bottle on the scale and do not tare between additions. Targets use the full calculated weights, rounded only for display.</p>${v.startingReading!==''&&Number(v.startingReading)<0?'<p class="calc-warning" role="status">Starting scale reading cannot be negative.</p>':''}</div>`;
}
function calculate(){
  const v=Object.fromEntries([...$('#calculator').elements].filter(e=>e.name).map(e=>[e.name,e.value]));
  if(mode==='perfume'){
    const result=liquidPerfume({batchML:v.size,concentration:v.load,trialDrops:v.drops,dropsPerML:v.conversion,fragranceDensity:v.fragranceDensity,carrierDensity:v.carrierDensity});
    $('#results').innerHTML=[
      resultRow('Fragrance',result.fragranceML,'mL'),resultRow('Carrier',result.carrierML,'mL'),
      resultRow('Trial blend',result.trialML,'mL',true),resultRow('Multiply trial recipe by',result.multiplier,'×',true),
      `<div class="weight-results"><h3>By weight (g)</h3>${resultRow('Fragrance',result.fragranceG,'g')}${resultRow('Carrier',result.carrierG,'g')}</div>`,
      scaleInstructions(v,result),
      ...result.warnings.map(message=>`<p class="calc-warning" role="status">${esc(message)}</p>`)
    ].join('');
    return;
  }
  const n=Object.fromEntries(Object.entries(v).map(([key,value])=>[key,value===''?NaN:Number(value)]));
  let rows;
  try{
    if(mode==='solid'){const a=batch(n.size,[n.load,n.oil,n.butter]);rows=['Fragrance','Vegetable oil','Vegetable butter','Beeswax'].map((name,i)=>[name,a[i],'g']);}
    if(mode==='reed'){const a=batch(n.size,[n.load,n.dpg,n.water]);rows=['Fragrance','Dipropylene glycol','Water','Diffuser base'].map((name,i)=>[name,a[i],'mL']);}
    if(mode==='convert'){const d=dropsToGrams(n.drops,n.conversion,n.density),g=gramsToDrops(n.grams,n.conversion,n.density);rows=[[`${fmt(n.drops)} drops`,d.grams,'g'],['(volume)',d.mL,'mL'],[`${fmt(n.grams)} g`,g.drops,'drops'],['(volume)',g.mL,'mL']];}
    if(mode==='dilution'){const a=dilution(n.size,n.stock,n.target);rows=[['Stock solution',a[0],'g'],['Additional solvent',a[1],'g']];}
    $('#results').innerHTML=rows.map(([name,value,unit])=>resultRow(name,value,unit)).join('');
  }catch(e){$('#results').innerHTML=`<p class="error">${esc(e.message)}</p>`;}
}
$('#calculator').addEventListener('input',calculate);$('#calculator').onsubmit=e=>e.preventDefault();$$('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;$$('[data-mode]').forEach(x=>x.setAttribute('aria-selected',x===b));renderCalc();});
$('.tabs').onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;const t=$$('[data-mode]');let i=t.indexOf(document.activeElement);if(i<0)return;e.preventDefault();i=e.key==='Home'?0:e.key==='End'?t.length-1:(i+(['ArrowRight','ArrowDown'].includes(e.key)?1:-1)+t.length)%t.length;t[i].focus();t[i].click();};
function route(){const [requested,detail]=location.hash.slice(1).split('/');const n=['learn','reference','formulas','materials','calculators','library','notebook'].includes(requested)?requested:'learn';if(n==='calculators'&&configs[detail]&&mode!==detail){mode=detail;$$('[data-mode]').forEach(x=>x.setAttribute('aria-selected',x.dataset.mode===mode));renderCalc();}$$('main>section').forEach(s=>s.hidden=s.id!==n);$$('aside nav a').forEach(a=>{a.classList.toggle('active',a.hash===`#${n}`);if(a.hash===`#${n}`)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});}window.addEventListener('hashchange',()=>{route();window.scrollTo(0,0);});route();renderCalc();
const key='islam-perfume-formulas-v1';let saved=[],editing=null;
function valid(f){return f&&typeof f.id==='string'&&typeof f.name==='string'&&f.name.trim()&&f.name.length<=120&&Number.isFinite(f.size)&&f.size>0&&(f.unit===undefined||['g','mL','drops'].includes(f.unit))&&['Fresh','Floral','Amber','Woody','Other'].includes(f.family)&&typeof f.observations==='string'&&typeof f.date==='string'&&Number.isFinite(Date.parse(f.date))&&Array.isArray(f.ingredients)&&f.ingredients.length>0&&f.ingredients.length<=100&&f.ingredients.every(i=>typeof i.name==='string'&&i.name.trim()&&['Unassigned','Top','Heart','Base','Solvent'].includes(i.note)&&Number.isFinite(i.parts)&&i.parts>0);}
try{const d=JSON.parse(localStorage.getItem(key)||'[]');if(!Array.isArray(d)||!d.every(valid))throw Error();saved=d;}catch{$('#storage-status').textContent='Saved data could not be loaded. Import a backup if you have one.';}
function toast(m){$('#toast').textContent=m;$('#toast').style.display='block';setTimeout(()=>$('#toast').style.display='none',3500);}
// Map a material name to one of the radar families using the worksheet's Primary/Secondary family.
const FAMILY_ALIASES={Ambery:'Amber',Balsamic:'Amber',Vanilla:'Gourmand',Sweet:'Gourmand',Coffee:'Gourmand',Cocoa:'Gourmand',Spice:'Spicy',Herbal:'Green',Ozonic:'Aquatic',Marine:'Aquatic',Animalic:'Musk',Musky:'Musk',Fruity:'Citrus',Smoke:'Leather',Aldehydic:'Citrus'};
const TIER_WORDS=[['Top',/bergamot|lemon|lime|orange|mandarin|grapefruit|citr|yuzu|neroli|petitgrain|aldehyde|pepper|cardamom|ginger|mint|eucalypt|lavender|basil|juniper|pink|calone|dihydromyrcenol|top/],['Base',/musk|amber|ambr|vanill|wood|cedar|sandal|vetiver|patchouli|oud|agar|benzoin|labdanum|tonka|coumarin|iso e|leather|castoreum|civet|resin|myrrh|frankincense|olibanum|moss|ethyl maltol|base/],['Heart',/rose|jasmin|hedione|ylang|iris|orris|violet|ionone|geranium|lily|muguet|tuberose|orange flower|osmanthus|magnolia|heliotrop|carnation|clove|cinnamon|floral|heart/]];
function guessTier(name){const n=name.trim().toLowerCase();if(n.length<3)return '';const m=worksheet.find(m=>m.Material.toLowerCase().includes(n)||n.includes(m.Material.toLowerCase().split(/[ (]/)[0]));const t=m&&['Top','Heart','Base'].find(t=>(m.Note||'').toLowerCase().startsWith(t.toLowerCase()));if(t)return t;const w=TIER_WORDS.find(([,re])=>re.test(n));return w?w[0]:'';}
function autofill(i){const x={...i};if(!x.note||x.note==='Unassigned'){const t=guessTier(x.name||'');if(t)x.note=t;}if(!x.family&&x.note!=='Solvent'){const g=guessFamily(x.name||'');if(g)x.family=g;}return x;}
function guessFamily(name){const n=name.trim().toLowerCase();if(n.length<3)return '';const m=worksheet.find(m=>m.Material.toLowerCase().includes(n)||n.includes(m.Material.toLowerCase().split(/[ (]/)[0]));if(!m)return '';for(const v of [m.Primary,m.Secondary]){const k=v&&v.trim().replace(/^./,c=>c.toUpperCase());if(FAMILIES.includes(k))return k;if(FAMILY_ALIASES[k])return FAMILY_ALIASES[k];}return '';}
// IFRA limits from the Formula Worksheet materials list, matched by name.
function ifraFor(name){const n=name.trim().toLowerCase();if(n.length<4)return null;return worksheet.find(m=>m['IFRA restriction']&&(m.Material.toLowerCase().includes(n)||n.includes(m.Material.toLowerCase().split(/[ (]/)[0])))||null;}
fetch('worksheet.json').then(r=>r.json()).then(d=>{worksheet=d.tables[0].rows;scaleFormula();}).catch(()=>{});
let server=false;
const pushServer=list=>fetch('api/formulas',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(list)}).then(r=>{if(!r.ok)throw Error();}).catch(()=>toast('Could not reach the database. Saved in this browser; restart start.bat.'));
function persist(next){try{localStorage.setItem(key,JSON.stringify(next));}catch{if(!server){toast('Could not save. Export a backup and check browser storage.');return false;}}saved=next;listSaved();if(server)pushServer(next);return true;}
// Load the notebook from the SQLite database (server.py); merge any formulas saved only in this browser.
(async()=>{try{const r=await fetch('api/formulas',{cache:'no-store'});if(!r.ok||!(r.headers.get('content-type')||'').includes('json'))throw Error();const d=await r.json();if(!Array.isArray(d))throw Error();server=true;$('#save-where').textContent='Saved in your local database (atelier.db). Export a backup for extra safety.';const db=d.filter(valid),extra=saved.filter(f=>!db.some(x=>x.id===f.id));saved=[...db,...extra];if(extra.length)pushServer(saved);try{localStorage.setItem(key,JSON.stringify(saved));}catch{}listSaved();}catch{}})();
const FAMILIES=['','Citrus','Floral','Woody','Spicy','Amber','Green','Musk','Gourmand','Aquatic','Leather'];
function addIngredient(i={name:'',note:'Top',parts:1,dilution:100}){const r=document.createElement('tr');r.innerHTML=`<td><input aria-label="Material name" class="material" list="material-options" required maxlength="150" value="${esc(i.name)}" placeholder="Material"><div class="mat-desc small"></div></td><td><select aria-label="Note category" class="note">${['Unassigned','Top','Heart','Base','Solvent'].map(n=>`<option ${n===i.note?'selected':''}>${n}</option>`).join('')}</select></td><td><select aria-label="Olfactory family" class="family">${FAMILIES.map(n=>`<option value="${n}" ${n===(i.family||'')?'selected':''}>${n||'—'}</option>`).join('')}</select></td><td><input aria-label="Parts" class="parts" type="number" min="0.000001" step="any" value="${i.parts}" required></td><td><input aria-label="Dilution percent" class="dilution" type="number" min="0" max="100" step="any" value="${i.dilution??100}"></td><td class="grams"></td><td class="approx-g" hidden></td><td class="puremat"></td><td class="pctf"></td><td class="pure"></td><td><input aria-label="Price per gram" class="price" type="number" min="0" step="any" placeholder="0" value="${i.price??''}"></td><td class="cost"></td><td><button aria-label="Remove material" type="button">×</button></td>`;r.querySelector('.material').addEventListener('change',()=>{const fam=r.querySelector('.family');if(fam.value)return;const g=guessFamily(r.querySelector('.material').value);if(g){fam.value=g;scaleFormula();}});r.querySelector('button').onclick=()=>{r.remove();scaleFormula();};$('#ingredients').append(r);scaleFormula();}
function ingredients(){return $$('#ingredients tr').map(r=>({name:r.querySelector('.material').value.trim(),note:r.querySelector('.note').value,parts:r.querySelector('.parts').value===''?NaN:Number(r.querySelector('.parts').value),dilution:r.querySelector('.dilution').value===''?100:Math.min(100,Math.max(0,Number(r.querySelector('.dilution').value))),family:r.querySelector('.family').value,price:r.querySelector('.price').value===''?0:Math.max(0,Number(r.querySelector('.price').value))||0}));}
function toGrams(amount){const u=$('#formula-unit').value,dpm=Number($('#formula-dpm').value),rho=Number($('#formula-density').value);if(!(dpm>0&&rho>0))return NaN;return u==='drops'?dropsToGrams(amount,dpm,rho).grams:amount*rho;}
function scaleFormula(){$('#formula-amount-heading').textContent=$('#formula-unit').value;const convert=$('#formula-unit').value!=='g';$('#gram-convert').hidden=!convert;$('#formula-dpm').closest('label').hidden=$('#formula-unit').value!=='drops';$$('.approx-g').forEach(x=>x.hidden=!convert);try{const i=ingredients(),a=scale(Number($('#formula-size').value),i.map(x=>x.parts));$$('#ingredients .grams').forEach((td,j)=>td.textContent=fmt(a[j]));$$('#ingredients td.approx-g').forEach((td,j)=>{const g=toGrams(a[j]);td.textContent=Number.isFinite(g)?fmt(g):'—';});const eff=x=>x.note==='Solvent'?0:x.dilution/100,pureTotal=i.reduce((s,x)=>s+x.parts*eff(x),0),allParts=i.reduce((s,x)=>s+x.parts,0);
$$('#ingredients tr').forEach((r,j)=>{const x=i[j],m=ifraFor(x.name);r.querySelector('.puremat').textContent=eff(x)?fmt(a[j]*eff(x)):'—';r.querySelector('.pctf').textContent=`${(x.parts/allParts*100).toFixed(1)}%`;r.querySelector('.pure').innerHTML=`${eff(x)&&pureTotal?(x.parts*eff(x)/pureTotal*100).toFixed(1)+'%':'—'}${m?` <span class="ifra-flag" title="IFRA: ${esc(m['IFRA restriction'])} (${esc(m.Material)})">⚠ IFRA</span>`:''}`;});
let cost=0;$$('#ingredients tr').forEach((r,j)=>{const g=$('#formula-unit').value==='g'?a[j]:toGrams(a[j]),c=Number.isFinite(g)?g*i[j].price:NaN;if(Number.isFinite(c))cost+=c;r.querySelector('.cost').textContent=i[j].price&&Number.isFinite(c)?fmt(c):'—';});
$('#formula-cost').textContent=cost?`Batch cost: ${fmt(cost)}`:'';
window.lastComposition=i.map((x,j)=>({...x,amount:a[j],pure:a[j]*eff(x)}));window.dispatchEvent(new CustomEvent('formula-composition',{detail:window.lastComposition}));
$('#formula-total').dataset.pure=pureTotal<allParts?` · Pure aromatic material: ${(pureTotal/allParts*100).toFixed(1)}% of the blend`:'';
if(convert){const g=toGrams(Number($('#formula-size').value));$('#formula-total').dataset.grams=Number.isFinite(g)?` ≈ ${fmt(g)} g`:'';}else $('#formula-total').dataset.grams='';$('#formula-total').textContent=`${fmt(i.reduce((s,x)=>s+x.parts,0))} parts → ${fmt(Number($('#formula-size').value))} ${$('#formula-unit').value} concentrate${$('#formula-total').dataset.grams}${$('#formula-total').dataset.pure||''}`;}catch(e){$$('#ingredients .grams,#ingredients td.approx-g,#ingredients .pure,#ingredients .puremat,#ingredients .pctf').forEach(td=>td.textContent='—');$('#formula-total').textContent=e.message;}}
$('#add-ingredient').onclick=()=>addIngredient();$('#formula-form').addEventListener('input',scaleFormula);addIngredient();
const newButton=document.createElement('button');newButton.type='button';newButton.className='secondary';newButton.textContent='New formula';$('#formula-form').prepend(newButton);newButton.onclick=()=>{editing=null;setTimeout(renderVersions);$('#formula-form').reset();$('#ingredients').replaceChildren();addIngredient();$('#formula-name').focus();};
$('#formula-form').onsubmit=e=>{e.preventDefault();const f={id:editing||crypto.randomUUID(),name:$('#formula-name').value.trim(),size:Number($('#formula-size').value),unit:$('#formula-unit').value,family:$('#formula-family').value,observations:$('#observations').value,date:new Date().toISOString(),ingredients:ingredients(),final:$('#formula-final').checked,dropsPerML:Number($('#formula-dpm').value)||20,density:Number($('#formula-density').value)||0.9,versions:saved.find(x=>x.id===editing)?.versions||[]};if(!valid(f)){toast('Add a name and at least one complete material row.');return;}if(persist([f,...saved.filter(x=>x.id!==f.id)])){editing=f.id;toast(server?'Formula saved in the database.':'Formula saved on this device.');}};
function listSaved(){window.notebookFormulas=saved;window.dispatchEvent(new CustomEvent('notebook-changed'));$('#saved-formulas').innerHTML=saved.length?saved.map(f=>`<article class="saved"><h3 data-no-translate dir="auto">${esc(f.name)}</h3><p>${esc(f.family)} · ${fmt(f.size)} ${esc(f.unit||'g')} · ${f.ingredients.length} materials${f.final?' · <strong>Final</strong>':''}</p><p>${esc(new Date(f.date).toLocaleDateString(locale()))}</p><button class="secondary" data-edit="${esc(f.id)}">Open</button><button class="secondary" data-delete="${esc(f.id)}">Delete</button></article>`).join(''):'<p class="small">Start with your first trial. Your saved formulas appear here.</p>';$$('[data-edit]').forEach(b=>b.onclick=()=>{const f=saved.find(f=>f.id===b.dataset.edit);editing=f.id;$('#formula-name').value=f.name;$('#formula-size').value=f.size;$('#formula-unit').value=f.unit||'g';$('#formula-family').value=f.family;$('#observations').value=f.observations;$('#formula-dpm').value=f.dropsPerML||20;$('#formula-final').checked=Boolean(f.final);$('#formula-density').value=f.density||0.9;$('#ingredients').replaceChildren();f.ingredients.map(autofill).forEach(addIngredient);scaleFormula();renderVersions();$('#formula-name').focus();});$$('[data-delete]').forEach(b=>b.onclick=()=>{if(confirm(t('Delete this saved formula?'))&&persist(saved.filter(f=>f.id!==b.dataset.delete))&&editing===b.dataset.delete){editing=null;$('#formula-name').value='';}});}
$('#export').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({version:1,formulas:saved},null,2)],{type:'application/json'}));a.download='sj-perfume-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
$('#import').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>5e6)throw Error();const d=JSON.parse(await file.text());if(d.version!==1||!Array.isArray(d.formulas)||d.formulas.length>1000||!d.formulas.every(valid))throw Error();const next=[...saved];for(const f of d.formulas){const old=next.find(x=>x.id===f.id);if(!old)next.push(f);else if(JSON.stringify(old)!==JSON.stringify(f))next.push({...f,id:crypto.randomUUID(),name:(f.name+' (imported)').slice(0,120)});}if(persist(next))toast('Backup imported. Existing formulas kept.');}catch{toast('Invalid backup. Choose an exported notebook JSON file.');}e.target.value='';};listSaved();

window.addEventListener('course-calculator',e=>{
  const c=e.detail;
  if(!c||!configs[c.mode])return;
  mode=c.mode;
  $$('[data-mode]').forEach(x=>x.setAttribute('aria-selected',x.dataset.mode===mode));
  renderCalc();
  for(const k of ['size','load']) if(Number.isFinite(c[k])&&$('#calculator').elements[k]) $('#calculator').elements[k].value=c[k];
  calculate();
});
window.addEventListener('course-formula-selected',e=>{
  const f=e.detail;
  if(!f||!['g','mL','drops'].includes(f.unit)||!Number.isFinite(f.target)||f.target<=0||!Array.isArray(f.ingredients))return;
  editing=null;
  $('#formula-name').value=(f.title+' (study)').slice(0,120);
  $('#formula-size').value=f.target;
  $('#formula-unit').value=f.unit;
  $('#formula-family').value='Other';
  $('#observations').value=`Source: ${f.source}, printed page ${f.sourcePage}. Original concentrate: ${f.total} ${f.unit}.\n${f.note}${f.baseNote?'\n'+f.baseNote:''}\nStudy draft: record your exact supplier materials, stock dilutions and observations.`;
  $('#ingredients').replaceChildren();
  f.ingredients.forEach(i=>addIngredient(autofill({name:i.name,note:i.note,parts:i.amount})));
  scaleFormula();
  toast('Course formula loaded as a new draft. Save when ready.');
});

// Revision history: snapshots of the open formula, stored inside it.
function renderVersions(){const f=saved.find(x=>x.id===editing),v=f?.versions||[];$('#version-count').textContent=v.length;
  $('#version-list').innerHTML=!f?'<p class="small">Save the formula first, then capture versions as you iterate.</p>':v.length?v.map((x,n)=>`<article class="version"><div><strong dir="auto">${esc(x.title)}</strong><span class="small"> · ${esc(new Date(x.date).toLocaleDateString(locale()))} · ${x.ingredients.length} materials</span></div>${x.notes?`<p class="small" dir="auto">${esc(x.notes)}</p>`:''}<button class="secondary" type="button" data-restore="${n}">Restore</button><button class="secondary" type="button" data-drop="${n}">Delete</button></article>`).reverse().join(''):'<p class="small">No versions yet. Capture the current formula as your baseline (v1).</p>';
  $$('[data-restore]').forEach(b=>b.onclick=()=>{const x=v[+b.dataset.restore];$('#formula-size').value=x.size;$('#ingredients').replaceChildren();x.ingredients.forEach(addIngredient);toast(`Restored “${x.title}”. Save to keep it as the current formula.`);});
  $$('[data-drop]').forEach(b=>b.onclick=()=>{if(!confirm(t('Delete this version?')))return;const next={...f,versions:v.filter((_,n)=>n!==+b.dataset.drop)};persist([next,...saved.filter(x=>x.id!==f.id)]);renderVersions();});
  $('#version-title').placeholder=`Version title (e.g. v${v.length+1} — softer cedar)`;}
$('#save-version').onclick=()=>{const f=saved.find(x=>x.id===editing);if(!f){toast('Save the formula first.');return;}const ing=ingredients();if(!ing.length||!ing.every(i=>i.name&&i.parts>0)){toast('Complete every material row first.');return;}
  const v=f.versions||[];const snap={title:$('#version-title').value.trim()||`v${v.length+1}`,notes:$('#version-notes').value.trim(),date:new Date().toISOString(),size:Number($('#formula-size').value),ingredients:ing};
  if(persist([{...f,versions:[...v,snap]},...saved.filter(x=>x.id!==f.id)])){$('#version-title').value='';$('#version-notes').value='';renderVersions();toast(`Saved version “${snap.title}”.`);}};
renderVersions();

window.nb={addIngredient,ingredients,scaleFormula,toast,persist,renderVersions,valid,fmt,esc,get saved(){return saved;},get editing(){return editing;},set editing(v){editing=v;},get server(){return server;},worksheet:()=>worksheet,
  load(f){$('#ingredients').replaceChildren();f.forEach(addIngredient);scaleFormula();}};
window.dispatchEvent(new CustomEvent('nb-ready'));
