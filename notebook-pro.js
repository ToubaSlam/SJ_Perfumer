// Notebook workbench: toolbar (duplicate, print, delete, undo/redo, scale, match alcohol),
// ingredient catalog stored in the database, material autocomplete, project budget and Ctrl+K.
import {scale} from './math.js?v=drops-grams';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const nb=window.nb,{esc,fmt,toast}=nb;
const CATALOG_KEY='sj-catalog-v1';
const TIERS=['Unassigned','Top','Heart','Base','Solvent'];
const FAMILIES=['','Citrus','Floral','Woody','Spicy','Amber','Green','Musk','Gourmand','Aquatic','Leather'];
const STRENGTHS=[['EDT',10],['EDP',18],['Parfum',25]];
let catalog=[],catalogServer=false,editingItem=null,scentipedia=[];

// ---------- toolbar ----------
$('#nb-toolbar').innerHTML=`<div class="tb-group"><button type="button" class="secondary" id="tb-undo" title="Undo (formula changes)">↶ Undo</button><button type="button" class="secondary" id="tb-redo" title="Redo">↷ Redo</button></div>
<div class="tb-group"><button type="button" class="secondary" id="tb-dup">⧉ Duplicate</button><button type="button" class="secondary" id="tb-print">⎙ Print</button><button type="button" class="secondary danger" id="tb-del">🗑 Delete</button></div>
<div class="tb-group"><label class="tb-inline">Scale to<input id="tb-scale" type="number" min="0.001" step="any" value="10"></label><button type="button" class="secondary" id="tb-scale-go" title="Rescale all parts so they add up to this amount">Scale</button></div>
<div class="tb-group"><label class="tb-inline">Match alcohol to<select id="tb-strength">${STRENGTHS.map(([n,p])=>`<option value="${p}" ${p===18?'selected':''}>${n} (${p}%)</option>`).join('')}</select></label><button type="button" class="secondary" id="tb-match" title="Add or adjust a solvent row so pure aromatics make up this share">Match</button></div>
<span class="small tb-hint">Ctrl+K: add a component</span>`;

const rowsNow=()=>nb.ingredients();
const allParts=list=>list.reduce((s,x)=>s+(x.parts||0),0);
function setParts(values){$$('#ingredients .parts').forEach((el,i)=>{if(values[i]!==undefined)el.value=Number(values[i].toFixed(4));});}

$('#tb-scale-go').onclick=()=>{const target=Number($('#tb-scale').value),list=rowsNow(),total=allParts(list);
  if(!(target>0)||!(total>0)){toast('Enter a positive amount and complete the parts first.');return;}
  setParts(list.map(x=>x.parts*target/total));$('#formula-size').value=target;nb.scaleFormula();snapshot();toast(`Parts rescaled to a total of ${fmt(target)}.`);};

$('#tb-match').onclick=()=>{const p=Number($('#tb-strength').value)/100,list=rowsNow();
  const aroma=list.filter(x=>x.note!=='Solvent'),pure=aroma.reduce((s,x)=>s+x.parts*x.dilution/100,0),aromaParts=allParts(aroma),oldTotal=allParts(list);
  if(!(pure>0)){toast('Add aromatic materials first.');return;}
  const alcohol=pure/p-aromaParts;
  if(alcohol<0){toast(`Your diluted materials already put pure aromatics below ${p*100}%. Use less dilution instead.`);return;}
  let idx=list.findIndex(x=>x.note==='Solvent'&&/alcohol|ethanol|спирт|كحول/i.test(x.name));if(idx<0)idx=list.findIndex(x=>x.note==='Solvent');
  if(idx<0){nb.addIngredient({name:"Perfumer's alcohol",note:'Solvent',parts:Number(alcohol.toFixed(4)),dilution:100,family:''});}
  else{list.forEach((x,i)=>{if(i!==idx&&x.note==='Solvent')$$('#ingredients .parts')[i].value=0.000001;});$$('#ingredients .parts')[idx].value=Number(alcohol.toFixed(4));}
  const newTotal=allParts(rowsNow());if(oldTotal>0)$('#formula-size').value=Number((Number($('#formula-size').value)*newTotal/oldTotal).toFixed(4));
  nb.scaleFormula();snapshot();toast(`Alcohol set so pure aromatics are ${p*100}% of the blend.`);};

$('#tb-dup').onclick=()=>{const f=nb.saved.find(x=>x.id===nb.editing);if(!f){toast('Save the formula first, then duplicate it.');return;}
  const copy={...f,id:crypto.randomUUID(),name:(f.name+' (copy)').slice(0,120),date:new Date().toISOString(),versions:[],final:false};
  if(nb.persist([copy,...nb.saved])){nb.editing=copy.id;$('#formula-name').value=copy.name;$('#formula-final').checked=false;nb.renderVersions();toast('Duplicated. You are now editing the copy.');}};
$('#tb-del').onclick=()=>{const f=nb.saved.find(x=>x.id===nb.editing);if(!f){toast('This formula is not saved yet.');return;}
  if(!confirm(`Delete “${f.name}” and its versions?`))return;
  if(nb.persist(nb.saved.filter(x=>x.id!==f.id))){nb.editing=null;$('#formula-form').reset();nb.load([{name:'',note:'Top',parts:1,dilution:100}]);nb.renderVersions();toast('Formula deleted.');}};
$('#tb-print').onclick=()=>window.print();

// ---------- undo / redo ----------
let past=[],future=[],last='';
const state=()=>JSON.stringify({size:$('#formula-size').value,rows:rowsNow()});
function snapshot(){const s=state();if(s===last)return;if(last)past.push(last);if(past.length>100)past.shift();future=[];last=s;updateUndo();}
function restore(s){const d=JSON.parse(s);$('#formula-size').value=d.size;nb.load(d.rows);last=s;updateUndo();}
function updateUndo(){$('#tb-undo').disabled=!past.length;$('#tb-redo').disabled=!future.length;}
$('#tb-undo').onclick=()=>{if(!past.length)return;future.push(last);restore(past.pop());};
$('#tb-redo').onclick=()=>{if(!future.length)return;past.push(last);restore(future.pop());};
let timer;$('#formula-form').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(snapshot,600);});
$('#formula-form').addEventListener('click',e=>{if(e.target.closest('#add-ingredient,[aria-label="Remove material"]'))setTimeout(snapshot,0);});
// Opening another formula starts a fresh history.
document.addEventListener('click',e=>{if(e.target.closest('[data-edit],[data-restore]'))setTimeout(()=>{past=[];future=[];last=state();updateUndo();decorate();},0);});
last=state();updateUndo();

// ---------- catalog ----------
async function loadCatalog(){
  try{catalog=JSON.parse(localStorage.getItem(CATALOG_KEY)||'[]');}catch{catalog=[];}
  try{const r=await fetch('api/catalog',{cache:'no-store'});if(!r.ok||!(r.headers.get('content-type')||'').includes('json'))throw Error();const d=await r.json();
    catalogServer=true;const extra=catalog.filter(c=>!d.some(x=>x.id===c.id));catalog=[...d,...extra];if(extra.length)saveCatalog();}catch{}
  renderCatalog();options();decorate();
}
function saveCatalog(){try{localStorage.setItem(CATALOG_KEY,JSON.stringify(catalog));}catch{}
  if(catalogServer)fetch('api/catalog',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(catalog)}).catch(()=>toast('Could not reach the database; catalog kept in this browser.'));
  $('#catalog-count').textContent=catalog.length;options();}
const find=name=>{const n=name.trim().toLowerCase();return n?catalog.find(c=>c.name.toLowerCase()===n):null;};

function renderCatalog(){
  $('#catalog-count').textContent=catalog.length;const c=editingItem?catalog.find(x=>x.id===editingItem):null;
  $('#catalog-body').innerHTML=`<p class="small">Your own materials with their usual dilution, price and stock. Pick one by name in any formula row and its details fill in automatically.${catalogServer?' Saved in your local database.':' Saved in this browser.'}</p>
  <form id="cat-form" class="cat-form"><label>Name<input name="name" required maxlength="150" value="${esc(c?.name||'')}" list="material-options"></label>
  <label class="wide">Description<input name="description" maxlength="300" value="${esc(c?.description||'')}" placeholder="e.g. Fresh, luminous jasmine with a citrus lift"></label>
  <label>Default tier<select name="note">${TIERS.map(t=>`<option ${t===(c?.note||'Heart')?'selected':''}>${t}</option>`).join('')}</select></label>
  <label>Family<select name="family">${FAMILIES.map(f=>`<option value="${f}" ${f===(c?.family||'')?'selected':''}>${f||'—'}</option>`).join('')}</select></label>
  <label>Dilution %<input name="dilution" type="number" min="0" max="100" step="any" value="${c?.dilution??100}"></label>
  <label>Price per g<input name="price" type="number" min="0" step="any" value="${c?.price??''}"></label>
  <label>Stock (g)<input name="stock" type="number" min="0" step="any" value="${c?.stock??''}" placeholder="optional"></label>
  <label class="check"><input name="inStock" type="checkbox" ${c?.inStock!==false?'checked':''}> In stock</label>
  <div class="cat-actions"><button class="primary" type="submit">${c?'Update material':'+ Add to catalog'}</button>${c?'<button class="secondary" type="button" id="cat-cancel">Cancel</button>':''}<button class="secondary" type="button" id="cat-import" title="Add every material in the open formula that is not yet in the catalog">Add formula materials</button></div></form>
  <label class="cat-search">Search catalog<input id="cat-q" type="search" placeholder="Name, family or description"></label>
  <div class="native-table-wrap"><table class="native-table"><thead><tr><th>Material</th><th>Tier</th><th>Family</th><th>Dil. %</th><th>Price/g</th><th>Stock</th><th></th></tr></thead><tbody id="cat-rows"></tbody></table></div>`;
  listCatalog();
  $('#cat-q').oninput=listCatalog;
  $('#cat-form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),name=String(f.get('name')).trim();if(!name)return;
    const dup=find(name);if(dup&&dup.id!==editingItem){toast('That material is already in the catalog.');return;}
    const item={id:editingItem||crypto.randomUUID(),name,description:String(f.get('description')).trim(),note:f.get('note'),family:f.get('family'),dilution:Math.min(100,Math.max(0,Number(f.get('dilution'))||0)),price:Number(f.get('price'))||0,stock:f.get('stock')===''?null:Number(f.get('stock')),inStock:f.get('inStock')==='on',date:new Date().toISOString()};
    catalog=editingItem?catalog.map(x=>x.id===item.id?item:x):[item,...catalog];editingItem=null;saveCatalog();renderCatalog();decorate();toast(`Saved “${name}” in your catalog.`);};
  $('#cat-cancel')&&($('#cat-cancel').onclick=()=>{editingItem=null;renderCatalog();});
  $('#cat-import').onclick=()=>{const add=rowsNow().filter(x=>x.name&&!find(x.name)).map(x=>({id:crypto.randomUUID(),name:x.name,description:'',note:x.note,family:x.family||'',dilution:x.dilution,price:x.price||0,stock:null,inStock:true,date:new Date().toISOString()}));
    if(!add.length){toast('Every material in this formula is already in the catalog.');return;}catalog=[...add,...catalog];saveCatalog();renderCatalog();toast(`Added ${add.length} material${add.length>1?'s':''} to the catalog.`);};
}
function listCatalog(){const q=($('#cat-q')?.value||'').toLowerCase().trim();const shown=catalog.filter(c=>!q||[c.name,c.family,c.description,c.note].join(' ').toLowerCase().includes(q));
  $('#cat-rows').innerHTML=shown.map(c=>`<tr><td><strong dir="auto">${esc(c.name)}</strong>${c.description?`<div class="small" dir="auto">${esc(c.description)}</div>`:''}</td><td>${esc(c.note)}</td><td>${esc(c.family||'—')}</td><td>${fmt(c.dilution)}</td><td>${c.price?fmt(c.price):'—'}</td><td>${c.inStock?`<span class="stock-tag">In stock</span>`:'<span class="small">Out</span>'}${c.stock!=null?` <span class="small">${fmt(c.stock)} g</span>`:''}</td>
  <td class="cat-btns"><button type="button" class="secondary" data-cat-add="${c.id}">+ Formula</button><button type="button" class="secondary" data-cat-edit="${c.id}">Edit</button><button type="button" class="secondary" data-cat-del="${c.id}" aria-label="Delete ${esc(c.name)}">×</button></td></tr>`).join('')||`<tr><td colspan="7" class="small">${catalog.length?'No material matches.':'Your catalog is empty. Add your first material above.'}</td></tr>`;
  $$('[data-cat-add]').forEach(b=>b.onclick=()=>{const c=catalog.find(x=>x.id===b.dataset.catAdd);addFromCatalog(c);});
  $$('[data-cat-edit]').forEach(b=>b.onclick=()=>{editingItem=b.dataset.catEdit;renderCatalog();$('#cat-form [name=name]').focus();});
  $$('[data-cat-del]').forEach(b=>b.onclick=()=>{const c=catalog.find(x=>x.id===b.dataset.catDel);if(!confirm(`Remove “${c.name}” from the catalog?`))return;catalog=catalog.filter(x=>x.id!==c.id);saveCatalog();renderCatalog();decorate();});
}
function addFromCatalog(c){const rows=rowsNow();const empty=rows.length===1&&!rows[0].name;
  if(empty)nb.load([]);nb.addIngredient({name:c.name,note:c.note,family:c.family,parts:1,dilution:c.dilution,price:c.price||''});
  decorate();snapshot();location.hash='#notebook';$$('#ingredients .parts').at(-1).focus();toast(`Added ${c.name}. Enter its amount.`);}

// Fill a row from the catalog when its name matches.
$('#ingredients').addEventListener('change',e=>{if(!e.target.matches('.material'))return;const c=find(e.target.value);if(!c){decorate();return;}
  const r=e.target.closest('tr');r.querySelector('.note').value=c.note;if(c.family)r.querySelector('.family').value=c.family;r.querySelector('.dilution').value=c.dilution;if(c.price)r.querySelector('.price').value=c.price;
  nb.scaleFormula();decorate();snapshot();});

// Description line under each material: catalog description, else worksheet scent profile.
function decorate(){const ws=nb.worksheet();$$('#ingredients tr').forEach(r=>{const name=r.querySelector('.material').value,el=r.querySelector('.mat-desc');if(!el)return;const c=find(name);
  let text=c?.description||'';if(!text&&name.trim().length>2){const n=name.trim().toLowerCase(),m=ws.find(m=>m.Material.toLowerCase()===n||m.Material.toLowerCase().startsWith(n));text=m?.['Scent Characteristic']||'';}
  el.innerHTML=`${c?(c.inStock?'<span class="stock-tag">In stock</span> ':'<span class="small">Out of stock</span> '):''}${esc(text)}`;});}
let decoTimer;window.addEventListener('formula-composition',()=>{clearTimeout(decoTimer);decoTimer=setTimeout(decorate,150);});

// Autocomplete: catalog first, then worksheet materials and Scentipedia oils.
function options(){const names=new Set([...catalog.map(c=>c.name),...nb.worksheet().map(m=>m.Material),...scentipedia]);
  $('#material-options').innerHTML=[...names].slice(0,800).map(n=>`<option value="${esc(n)}"></option>`).join('');}
fetch('scentipedia.json').then(r=>r.json()).then(d=>{scentipedia=d.tables[0].rows.map(r=>r[d.tables[0].fields[0]]).filter(Boolean);options();}).catch(()=>{});
fetch('worksheet.json').then(()=>setTimeout(options,300)).catch(()=>{});

// ---------- project budget ----------
function gramsOf(f){try{const a=scale(f.size,f.ingredients.map(i=>i.parts));const u=f.unit||'g',rho=f.density||0.9,dpm=f.dropsPerML||20;
  return a.map(x=>u==='g'?x:u==='mL'?x*rho:x/dpm*rho);}catch{return f.ingredients.map(()=>0);}}
function budget(){const box=$('#nb-budget');if(!box)return;const list=nb.saved.map(f=>{const g=gramsOf(f);return {f,cost:f.ingredients.reduce((s,i,n)=>s+(i.price||0)*g[n],0),priced:f.ingredients.filter(i=>i.price).length};});
  const total=list.reduce((s,x)=>s+x.cost,0);
  box.innerHTML=`<h2>Project budget</h2>${list.length?`<table class="native-table budget"><tbody>${list.map(({f,cost,priced})=>`<tr><td dir="auto">${esc(f.name)}</td><td class="small">${priced}/${f.ingredients.length} priced</td><td class="num">${cost?fmt(cost):'—'}</td></tr>`).join('')}<tr class="total"><td>Total</td><td></td><td class="num">${fmt(total)}</td></tr></tbody></table><p class="small">Material cost of each saved batch, from the price per gram in each row.</p>`:'<p class="small">Save formulas with prices to see their cost here.</p>'}`;}
const b=document.createElement('div');b.id='nb-budget';$('#saved-formulas').after(b);
window.addEventListener('notebook-changed',budget);budget();

// ---------- Ctrl+K ----------
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();location.hash='#notebook';
  nb.addIngredient();setTimeout(()=>{const m=$$('#ingredients .material').at(-1);m.focus();m.scrollIntoView({block:'center'});},50);snapshot();}});

loadCatalog();
