/* Thrills - التكلفة والوصفات (للمدير بس): خامات بأسعارها، وصفات بتتسعّر تلقائي، حاسبة كوست، واستيراد المنيو.
   الوصفات بتتنسخ تلقائي (من غير أسعار) لـ recipebook عشان شاشة الباريستا #recipes. */
(function(){
'use strict';
const T=()=>window.__T;
const UNITS={g:{k:'w',f:1,n:'جرام'},kg:{k:'w',f:1000,n:'كيلو'},ml:{k:'v',f:1,n:'مل'},l:{k:'v',f:1000,n:'لتر'},
  tbsp:{k:'v',f:15,n:'معلقة كبيرة'},tsp:{k:'v',f:5,n:'معلقة صغيرة'},cup:{k:'v',f:240,n:'كوب'},pc:{k:'p',f:1,n:'حبة'}};
const KU={w:['g','kg'],v:['ml','l','tbsp','tsp','cup'],p:['pc']};
const BU={w:['kg','g'],v:['l','ml'],p:['pc']};
const KN={w:'بالوزن (جرام/كيلو)',v:'بالحجم (مل/لتر)',p:'بالحبة'};
const BL={w:'جم',v:'مل',p:'حبة'};
const CATS=['ماتشا','V60 / قهوة','وافل','مشروبات خاصة','ميلك شيك','تارو','موهيتو ومنعشات','إضافات','أيس كريم كبير','شوكولاتة تغليف','فيلينج','ميني ثريلي','مشروب ساخن','مشروب بارد','أخرى'];
const DEF_CFG={overhead:0,margin:65,low:50,round:1};
const blank=()=>({id:null,name:'',nick:'',desc:'',cat:'أخرى',pub:false,yield:1,lines:[],steps:'',price:'',margin:'',cost0:0,order:0,status:'done'});
const C={ings:[],recs:[],cfg:Object.assign({},DEF_CFG),subUid:null,unsubs:[],ok:{i:false,r:false},
  iq:'',ifilter:'all',rq:'',rcat:'all',draft:null,calc:{A:blank(),B:null},ret:null,sure:null,pendingImport:null};

/* ---------- helpers ---------- */
const AR='٠١٢٣٤٥٦٧٨٩';
const n=v=>{const x=parseFloat(String(v==null?'':v).replace(/[٠-٩]/g,d=>AR.indexOf(d)).replace(/[٫,]/g,'.'));return isFinite(x)?x:0};
const nf=(x,d)=>Number(x).toLocaleString('ar-EG-u-nu-latn',{minimumFractionDigits:0,maximumFractionDigits:d==null?2:d});
const money=x=>nf(x,2)+' ج';
const small=x=>nf(x,x>0&&x<1?3:2)+' ج';
const ceilTo=(x,s)=>s>0?Math.ceil(x/s-1e-9)*s:x;
const nm=s=>T().norm(s).replace(/(^|\s)ال(?=\S{2})/g,'$1');
const stateOf=k=>k==='R'?C.draft:C.calc[k];
const ingOf=id=>C.ings.find(x=>x.id===id);
const recOf=id=>C.recs.find(x=>x.id===id);

/* ---------- cost math ---------- */
function ingBase(i){ // تكلفة الوحدة الأساسية (جم / مل / حبة)
  const u=UNITS[i.buyUnit]||UNITS[BU[i.kind||'p'][0]];
  const q=n(i.buyQty)*u.f*(1-Math.min(n(i.waste),95)/100);
  return q>0?n(i.buyPrice)/q:0;
}
function lineCost(l,seen){
  if(l.type==='rec'){
    const r=recOf(l.ref);if(!r)return {c:0,bad:true};
    if(seen&&seen.has(r.id))return {c:0,bad:true};
    const s=new Set(seen||[]);s.add(r.id);
    return {c:n(l.qty)*calc(r,s).perMat};
  }
  const i=ingOf(l.ref);if(!i)return {c:0,bad:true};
  const u=UNITS[l.unit];if(!u||u.k!==i.kind)return {c:0,bad:true};
  const b=ingBase(i);
  return {c:n(l.qty)*u.f*b,unpriced:b<=0&&n(l.qty)>0};
}
function calc(st,seen){
  const oh=n(C.cfg.overhead)/100;let mat=0,bad=0,unpriced=0;
  const costs=(st.lines||[]).map(l=>{const x=lineCost(l,seen);mat+=x.c;if(x.bad)bad++;if(x.unpriced)unpriced++;return x});
  let y=n(st.yield);if(y<=0)y=1;
  let manual=false,total=mat*(1+oh),per=total/y,perMat=mat/y;
  if(mat<=0&&n(st.cost0)>0){manual=true;per=n(st.cost0);total=per*y;perMat=per;mat=total}
  const m=(st.margin===''||st.margin==null)?n(C.cfg.margin):n(st.margin);
  const sugg=(m>=0&&m<100&&per>0)?ceilTo(per/(1-m/100),n(C.cfg.round)):0;
  const price=n(st.price),profit=price-per;
  return {costs,mat,total,per,perMat,sugg,price,profit,mg:price>0&&per>0?profit/price*100:null,fc:price>0?per/price*100:null,bad,unpriced,m,y,manual};
}
function mgPill(mg){
  if(mg==null)return '';
  const cls=mg>=n(C.cfg.margin)?'ok':mg>=n(C.cfg.low)?'warn':'bad';
  return '<span class="pill '+cls+'">هامش '+nf(mg,0)+'٪</span>';
}

/* ---------- data ---------- */
function sub(){
  const t=T(),S=t.S;const u=S.fbUser&&S.fbUser.uid;if(!S.db||!u||C.subUid===u)return;
  C.unsubs.forEach(f=>{try{f()}catch(e){}});C.unsubs=[];C.subUid=u;C.ok={i:false,r:false};
  const fail=()=>{C.subUid=null};
  C.unsubs.push(S.db.collection('ingredients').onSnapshot(q=>{C.ings=t.mapDocs(q);C.ok.i=true;refresh()},()=>{C.ok.i=true;fail();refresh()}));
  C.unsubs.push(S.db.collection('recipes').onSnapshot(q=>{C.recs=t.mapDocs(q).sort((a,b)=>(a.order||0)-(b.order||0)||String(a.name).localeCompare(b.name));C.ok.r=true;refresh()},()=>{C.ok.r=true;fail();refresh()}));
  C.unsubs.push(S.db.doc('costcfg/main').onSnapshot(s=>{C.cfg=Object.assign({},DEF_CFG,s.exists?s.data():{});refresh()},fail));
}
function clear(){
  C.unsubs.forEach(f=>{try{f()}catch(e){}});C.unsubs=[];C.subUid=null;C.ings=[];C.recs=[];C.ok={i:false,r:false};
  C.draft=null;C.calc={A:blank(),B:null};C.cfg=Object.assign({},DEF_CFG);C.pendingImport=null;
}
function refresh(){
  const t=T();if(!t)return;const {S,$}=t;
  if(S.view!=='admin'||!$('#abody'))return;
  if($('#abody .cloading')&&C.ok.i&&C.ok.r&&['ings','recs','calc'].indexOf(S.tab)>=0){$('#abody').innerHTML=window.ThrillsCost.tab(S.tab);return}
  document.querySelectorAll('.ced').forEach(e=>updateSum(e.dataset.k));
  const a=document.activeElement;const typing=a&&a.closest&&a.closest('#ing-list');
  if(S.tab==='ings'){if(!typing){fillIngs();const s=$('#ing-stats');if(s)s.innerHTML=ingStats()}}
  else if(S.tab==='recs'){fillRecs()}
}

/* ---------- unit / resolve ---------- */
const unitsFor=l=>{
  if(l.type==='rec')return [['portion','حصة']];
  const g=ingOf(l.ref);return g?KU[g.kind].map(u=>[u,UNITS[u].n]):[];
};
function resolve(txt){
  const t=String(txt||'').trim();if(!t)return null;
  if(t.indexOf('وصفة: ')===0){const r=C.recs.find(x=>x.name===t.slice(6)&&(!C.draft||x.id!==C.draft.id));if(r)return {type:'rec',ref:r.id}}
  const g=C.ings.find(x=>x.name===t)||C.ings.find(x=>nm(x.name)===nm(t));
  return g?{type:'ing',ref:g.id}:null;
}

/* ---------- editor (shared by recipe / calculator) ---------- */
function dlHTML(k){
  const {esc}=T();const st=stateOf(k);
  return '<datalist id="dl-'+k+'">'+C.ings.map(g=>'<option value="'+esc(g.name)+'">').join('')+C.recs.filter(r=>!st||r.id!==st.id).map(r=>'<option value="وصفة: '+esc(r.name)+'">').join('')+'</datalist>';
}
function lineHTML(k,i){
  const {esc}=T();const st=stateOf(k),l=st.lines[i];
  let name='';if(l.type==='rec'){const r=recOf(l.ref);name=r?'وصفة: '+r.name:(l.nameText||'')}else{const g=ingOf(l.ref);name=g?g.name:(l.nameText||'')}
  const known=l.ref&&(l.type==='rec'?recOf(l.ref):ingOf(l.ref));
  const us=unitsFor(l);
  const unitSel=us.length?'<select class="inp un" data-c="unit" aria-label="الوحدة">'+us.map(u=>'<option value="'+u[0]+'"'+(l.unit===u[0]?' selected':'')+'>'+u[1]+'</option>').join('')+'</select>':'<span class="muted un">—</span>';
  return '<div class="cl'+(known?'':' unk')+'" data-i="'+i+'">'+
    '<input class="inp nmi" data-c="ref" list="dl-'+k+'" placeholder="اختار خامة أو وصفة" value="'+esc(name)+'" autocomplete="off">'+
    '<input class="inp num qt" data-c="qty" type="number" inputmode="decimal" min="0" step="any" placeholder="الكمية" value="'+esc(l.qty==null||l.qty===0?'':l.qty)+'">'+unitSel+
    '<output class="lc"></output><button class="btn sm bad xb" data-ca="ldel" data-k="'+k+'" data-i="'+i+'" aria-label="شيل المكوّن">×</button>'+
    (known?'':'<div class="unkmsg">'+(name?'مش مسجّلة. <button class="linkbtn" data-ca="newing" data-k="'+k+'" data-i="'+i+'">سجّلها كخامة جديدة</button>':'اكتب اسم الخامة أو اختارها من القايمة')+'</div>')+
    '<input class="inp lnote" data-c="note" placeholder="ملاحظة للباريستا (اختياري)" value="'+esc(l.note||'')+'"></div>';
}
function linesHTML(k){const st=stateOf(k);return st.lines.length?st.lines.map((_,i)=>lineHTML(k,i)).join(''):'<div class="muted" style="padding:6px 2px">لسه مفيش مكوّنات. دوس "+ مكوّن".</div>'}
function catSelect(st){
  const {esc}=T();const all=CATS.slice();C.recs.forEach(r=>{if(r.cat&&all.indexOf(r.cat)<0)all.push(r.cat)});if(st.cat&&all.indexOf(st.cat)<0)all.push(st.cat);
  return '<select class="inp" data-c="cat">'+all.map(c=>'<option'+(st.cat===c?' selected':'')+'>'+esc(c)+'</option>').join('')+'</select>';
}
function edHTML(k,full){
  const {esc}=T();const st=stateOf(k);
  return '<div class="ced" data-k="'+k+'">'+
    '<div class="row2"><label class="f">'+(full?'اسم الوصفة':'اسم المشروب (اختياري)')+'<input class="inp" data-c="name" value="'+esc(st.name)+'" autocomplete="off"></label>'+
    (full?'<label class="f">التصنيف'+catSelect(st)+'</label>':'<label class="f">عدد الحصص<input class="inp num" data-c="yield" type="number" inputmode="decimal" min="0" step="any" value="'+esc(st.yield)+'"></label>')+'</div>'+
    (full?'<div class="row2"><label class="f">الاسم الدلع (اختياري)<input class="inp" data-c="nick" value="'+esc(st.nick||'')+'"></label><label class="f">عدد الحصص اللي بتطلعها<input class="inp num" data-c="yield" type="number" inputmode="decimal" min="0" step="any" value="'+esc(st.yield)+'"></label></div>':'')+
    '<div class="row2"><label class="f">سعر البيع للحصة (ج)<input class="inp num" data-c="price" type="number" inputmode="decimal" min="0" step="any" value="'+esc(st.price)+'"></label>'+
    '<label class="f">هامش ربح مستهدف ٪<input class="inp num" data-c="margin" type="number" inputmode="decimal" min="0" max="99" step="any" placeholder="'+esc(C.cfg.margin)+'" value="'+esc(st.margin)+'"></label></div>'+
    '<h3>المكوّنات</h3><div id="lines-'+k+'" class="cls">'+linesHTML(k)+'</div>'+dlHTML(k)+
    '<div class="actions"><button class="btn sm" data-ca="ladd" data-k="'+k+'">+ مكوّن</button><button class="btn sm" data-ca="rpaste" data-k="'+k+'">ألصق وصفة مكتوبة</button></div>'+
    (full?'<label class="f">الخطوات / ملاحظات للباريستا (كل سطر خطوة)<textarea class="inp" data-c="steps" style="min-height:90px">'+esc(st.steps||'')+'</textarea></label>'+
      '<label class="f">وصف قصير للمنيو (اختياري)<textarea class="inp" data-c="desc" style="min-height:56px">'+esc(st.desc||'')+'</textarea></label>'+
      '<label class="f" style="flex-direction:row;align-items:center;gap:10px"><input type="checkbox" data-c="pub" style="width:20px;height:20px"'+(st.pub?' checked':'')+'> تظهر للباريستا في كتاب الوصفات</label>':'')+
    '<div class="sum" id="sum-'+k+'"></div></div>';
}
function sumInner(st,r){
  const oh=n(C.cfg.overhead);
  const row=(a,b,cls)=>'<div class="sr'+(cls?' '+cls:'')+'"><span>'+a+'</span><b>'+b+'</b></div>';
  let h='';
  if(r.manual)h+='<div class="fnote">التكلفة مسجّلة يدوي من الشيت ('+money(n(st.cost0))+' للحصة). هتتحسب من الخامات أول ما تحط أسعارها.</div>';
  else{
    h+=row('تكلفة الخامات',money(r.mat));
    if(oh>0)h+=row('تشغيل +'+nf(oh)+'٪',money(r.total-r.mat));
  }
  h+=row('تكلفة الحصة الواحدة',money(r.per),'big');
  h+=row('سعر بيع مقترح (هامش '+nf(r.m,0)+'٪)',r.sugg?money(r.sugg):'—');
  if(r.price>0){h+=row('ربح الحصة',money(r.profit));h+=row('هامش الربح الفعلي',r.mg==null?'—':nf(r.mg,1)+'٪ '+mgPill(r.mg).replace(/هامش \d+٪/,''));h+=row('نسبة التكلفة من السعر',r.fc==null?'—':nf(r.fc,1)+'٪')}
  if(r.bad)h+='<div class="fnote" style="background:var(--bad-bg);color:var(--bad)">'+r.bad+' مكوّن مش محسوب (خامة مش مسجّلة أو وحدة غلط)</div>';
  if(r.unpriced)h+='<div class="fnote">'+r.unpriced+' خامة لسه من غير سعر، فالتكلفة أقل من الحقيقي.</div>';
  return h;
}
function updateSum(k){
  const ced=document.querySelector('.ced[data-k="'+k+'"]');if(!ced)return;
  const st=stateOf(k);if(!st)return;const r=calc(st);
  ced.querySelectorAll('.cl').forEach((row,i)=>{const o=row.querySelector('.lc');if(o&&r.costs[i])o.textContent=r.costs[i].bad?'⚠':money(r.costs[i].c)});
  const s=ced.querySelector('.sum');if(s)s.innerHTML=sumInner(st,r);
  if(k==='A'||k==='B')updateCmp();
}
function reLines(k,focusRow){
  const el=document.getElementById('lines-'+k);if(!el)return;
  const ae=document.activeElement;if(ae&&ae!==document.body&&el.contains(ae))ae.blur(); // يطلّع change قبل ما نبدّل الـ DOM
  el.innerHTML=linesHTML(k);const dl=document.getElementById('dl-'+k);if(dl)dl.outerHTML=dlHTML(k);
  updateSum(k);
  if(focusRow!=null){const inp=el.querySelector('.cl[data-i="'+focusRow+'"] [data-c="'+(focusRow==='last'?'ref':'qty')+'"]');if(inp)inp.focus()}
}

/* ---------- ingredients ---------- */
const kindOf=u=>(UNITS[u]||{}).k;
function ingStats(){
  const np=C.ings.filter(g=>ingBase(g)<=0).length;
  return '<div class="tiles"><div class="stat"><b>'+C.ings.length+'</b><span>خامة</span></div><div class="stat '+(np?'warn':'ok')+'"><b>'+np+'</b><span>من غير سعر</span></div><div class="stat"><b>'+C.recs.length+'</b><span>وصفة</span></div></div>';
}
function trend(g){
  const h=g.history||[];if(h.length<2)return '';
  const f=x=>{const u=UNITS[x.u]||UNITS.pc;const q=n(x.q)*u.f;return q>0?n(x.p)/q:0};
  const a=f(h[h.length-2]),b=f(h[h.length-1]);if(a<=0||b<=0||Math.abs(b-a)<1e-9)return '';
  const pc=(b-a)/a*100;return '<span class="pill '+(pc>0?'bad':'ok')+'">'+(pc>0?'▲ ':'▼ ')+nf(Math.abs(pc),0)+'٪</span>';
}
function ingRow(g){
  const {esc}=T();const base=ingBase(g);
  const per=g.kind==='p'?base:base*1000;
  const used=C.recs.filter(r=>(r.lines||[]).some(l=>l.type==='ing'&&l.ref===g.id)).length;
  return '<article class="item ir" data-id="'+esc(g.id)+'"><div class="who"><div><b>'+esc(g.name)+'</b><small>'+(base>0?'= '+money(per)+(g.kind==='w'?' للكيلو':g.kind==='v'?' للتر':' للحبة'):'<span style="color:var(--warn)">من غير سعر</span>')+' · داخلة في '+used+' وصفة</small></div></div>'+
    '<div class="irf"><input class="inp num" data-ci="price" type="number" inputmode="decimal" min="0" step="any" placeholder="ج" value="'+(g.buyPrice?esc(g.buyPrice):'')+'" aria-label="سعر الشراء">'+
    '<span class="muted">لكل</span><input class="inp num" data-ci="qty" type="number" inputmode="decimal" min="0" step="any" value="'+esc(g.buyQty||1)+'" aria-label="الكمية">'+
    '<select class="inp un" data-ci="unit" aria-label="وحدة الشراء">'+BU[g.kind].map(u=>'<option value="'+u+'"'+(g.buyUnit===u?' selected':'')+'>'+UNITS[u].n+'</option>').join('')+'</select></div>'+
    '<div class="st">'+trend(g)+'<button class="btn sm" data-ca="iedit" data-id="'+esc(g.id)+'">تفاصيل</button></div></article>';
}
function ingList(){
  const q=nm(C.iq);
  const list=C.ings.filter(g=>(!q||nm(g.name).includes(q))&&(C.ifilter==='all'||ingBase(g)<=0)).sort((a,b)=>a.name.localeCompare(b.name));
  return list.length?list.map(ingRow).join(''):'<div class="empty">'+(C.ings.length?'مفيش خامة بالشكل ده':'لسه مفيش خامات. ضيف أول خامة، أو استورد المنيو.')+'</div>';
}
function fillIngs(){const {$}=T();const el=$('#ing-list');if(el)el.innerHTML=ingList()}
function importBtns(){return '<button class="btn" data-ca="import">استيراد منيو (ملف)</button><input type="file" id="imp-file" accept=".json,application/json" hidden>'}
function tabIngs(){
  sub();if(!(C.ok.i&&C.ok.r))return '<div class="empty cloading">جاري التحميل...</div>';
  return '<h2 style="font-size:1.3rem">الخامات وأسعارها</h2><div id="ing-stats">'+ingStats()+'</div>'+
    '<div class="ctrl"><button class="btn pri" data-ca="iadd">+ خامة</button><button class="btn" data-ca="ibulk">إضافة كذا خامة مرة واحدة</button>'+importBtns()+'</div>'+
    '<div class="bar"><div class="chips">'+[['all','الكل'],['np','من غير سعر']].map(f=>'<button class="chip" data-ca="ifilter" data-f="'+f[0]+'" aria-pressed="'+(C.ifilter===f[0])+'">'+f[1]+'</button>').join('')+'</div>'+
    '<label class="search"><input id="ing-q" class="inp" type="search" autocomplete="off" placeholder="دوّر على خامة" value="'+T().esc(C.iq)+'"></label></div>'+
    '<div class="muted" style="font-size:.9rem">اكتب السعر والكمية اللي بتشتريها (مثلاً 450 ج لكل 1 كيلو) وهيتحفظ لوحده. كل الوصفات بتتحدّث.</div>'+
    '<div class="list" id="ing-list">'+ingList()+'</div>';
}
function openIng(id,pre){
  const {esc,openModal,$}=T();const g=id?ingOf(id):null;
  const d=g||Object.assign({name:'',kind:'w',buyUnit:'kg',buyQty:1,buyPrice:'',waste:0,note:''},pre||{});
  C.ing={id:g?g.id:null};
  const used=g?C.recs.filter(r=>(r.lines||[]).some(l=>l.type==='ing'&&l.ref===g.id)):[];
  const hist=g&&(g.history||[]).length?'<div class="muted" style="font-size:.88rem">آخر تغييرات السعر: '+g.history.slice(-5).reverse().map(h=>new Date(h.t).toLocaleDateString('ar-EG-u-nu-latn',{day:'numeric',month:'short'})+' ← '+nf(h.p)+' ج لكل '+nf(h.q)+' '+(UNITS[h.u]||{}).n).join(' · ')+'</div>':'';
  openModal('<h2>'+(g?'تفاصيل خامة':'خامة جديدة')+'</h2>'+
    '<label class="f">الاسم<input id="i-name" class="inp" value="'+esc(d.name)+'" autocomplete="off"></label>'+
    '<label class="f">بتتحسب إزاي؟<select id="i-kind" class="inp">'+Object.keys(KN).map(k=>'<option value="'+k+'"'+(d.kind===k?' selected':'')+'>'+KN[k]+'</option>').join('')+'</select></label>'+
    '<div class="row2"><label class="f">سعر الشراء (ج)<input id="i-price" class="inp num" type="number" inputmode="decimal" min="0" step="any" value="'+esc(d.buyPrice)+'"></label>'+
    '<label class="f">لكل كمية<input id="i-qty" class="inp num" type="number" inputmode="decimal" min="0" step="any" value="'+esc(d.buyQty)+'"></label></div>'+
    '<div class="row2"><label class="f">وحدة الشراء<select id="i-unit" class="inp">'+BU[d.kind].map(u=>'<option value="'+u+'"'+(d.buyUnit===u?' selected':'')+'>'+UNITS[u].n+'</option>').join('')+'</select></label>'+
    '<label class="f">نسبة هالك ٪<input id="i-waste" class="inp num" type="number" inputmode="decimal" min="0" max="95" step="any" value="'+esc(d.waste||0)+'"><small>مثلاً قشر أو فاقد</small></label></div>'+
    '<div id="i-prev" class="fnote" style="background:var(--surface2);color:var(--ink)"></div>'+
    '<label class="f">ملاحظة (مورّد، ماركة..)<input id="i-note" class="inp" value="'+esc(d.note||'')+'"></label>'+hist+
    (g?'<div class="muted" style="font-size:.9rem">داخلة في '+used.length+' وصفة'+(used.length?': '+esc(used.slice(0,6).map(r=>r.name).join('، '))+(used.length>6?'...':''):'')+'</div>':'')+
    '<div class="err" id="i-err"></div><div class="actions"><button class="btn pri" data-ca="isave">حفظ</button><button class="btn" data-act="close">إلغاء</button>'+(g?'<button class="btn bad sm" data-ca="idel" style="margin-inline-start:auto">حذف</button>':'')+'</div>');
  ingPrev();
}
function ingPrev(){
  const {$}=T();const el=$('#i-prev');if(!el)return;
  const k=$('#i-kind').value,u=$('#i-unit').value;
  const base=ingBase({kind:k,buyUnit:u,buyQty:$('#i-qty').value,buyPrice:$('#i-price').value,waste:$('#i-waste').value});
  el.textContent=base>0?('التكلفة: '+small(base)+' لكل '+BL[k]+(k!=='p'?' = '+money(base*1000)+(k==='w'?' للكيلو':' للتر'):'')):'اكتب السعر والكمية عشان نحسب';
}
async function saveIng(){
  const t=T();const {$,S,wr,toast,closeModal}=t;
  const err=m=>{$('#i-err').textContent=m};
  const name=$('#i-name').value.trim();if(!name){err('اكتب اسم الخامة');return}
  const dup=C.ings.find(g=>nm(g.name)===nm(name)&&g.id!==(C.ing&&C.ing.id));if(dup){err('فيه خامة بنفس الاسم');return}
  const kind=$('#i-kind').value,buyUnit=$('#i-unit').value,buyPrice=n($('#i-price').value),buyQty=n($('#i-qty').value)||1,waste=Math.min(n($('#i-waste').value),95);
  const old=C.ing&&C.ing.id?ingOf(C.ing.id):null;
  const id=old?old.id:t.uid('i');
  const hist=(old&&old.history?old.history.slice():[]);
  if(!old||old.buyPrice!==buyPrice||old.buyQty!==buyQty||old.buyUnit!==buyUnit){if(buyPrice>0)hist.push({t:Date.now(),p:buyPrice,q:buyQty,u:buyUnit})}
  const data={name,kind,buyUnit,buyQty,buyPrice,waste,note:$('#i-note').value.trim(),history:hist.slice(-12),updatedAt:Date.now()};
  if(old&&old.seed&&buyPrice>0)data.seed=false;
  const b=S.db.batch();b.set(S.db.doc('ingredients/'+id),data);
  if(old&&old.name!==name){ // الاسم اتغيّر: حدّث كتاب الوصفات
    C.recs.filter(r=>(r.lines||[]).some(l=>l.type==='ing'&&l.ref===id)).forEach(r=>{
      const nr=Object.assign({},r,{lines:r.lines.map(l=>l.type==='ing'&&l.ref===id?Object.assign({},l,{nameText:name}):l)});
      b.set(S.db.doc('recipes/'+r.id),{lines:nr.lines},{merge:true});
      if(r.pub)b.set(S.db.doc('recipebook/'+r.id),bookDoc(nr,id,name));
    });
  }
  $('.sheet button[data-ca="isave"]').disabled=true;
  if(await wr(()=>b.commit())){
    const ret=C.ret;C.ret=null;
    if(ret){const st=stateOf(ret.k);const l=st&&st.lines[ret.i];if(l){l.type='ing';l.ref=id;l.nameText=name;l.unit=KU[kind][0]}}
    if(!old)C.ings.push(Object.assign({id},data));
    closeModal();toast('اتحفظت ✅');
    if(ret){if(ret.k==='R')reopenRecipe();else reLines(ret.k)}
    else fillIngs();
  }else{const bt=$('.sheet button[data-ca="isave"]');if(bt)bt.disabled=false}
}
async function delIng(){
  const t=T();const {S,wr,toast,closeModal,$}=t;const id=C.ing&&C.ing.id;if(!id)return;
  const used=C.recs.filter(r=>(r.lines||[]).some(l=>l.type==='ing'&&l.ref===id)).length;
  const bt=$('[data-ca="idel"]');
  if(C.sure!=='idel'){C.sure='idel';if(bt)bt.textContent=used?('داخلة في '+used+' وصفة. دوس تاني للتأكيد'):'دوس تاني للتأكيد';return}
  C.sure=null;
  if(await wr(()=>S.db.doc('ingredients/'+id).delete())){closeModal();toast('اتحذفت');fillIngs()}
}
async function saveInline(el){
  const t=T();const {S,wr,toast}=t;const row=el.closest('.ir');if(!row)return;
  const g=ingOf(row.dataset.id);if(!g)return;
  const price=n(row.querySelector('[data-ci="price"]').value),qty=n(row.querySelector('[data-ci="qty"]').value)||1,unit=row.querySelector('[data-ci="unit"]').value;
  if(g.buyPrice===price&&g.buyQty===qty&&g.buyUnit===unit)return;
  const hist=(g.history||[]).slice();if(price>0)hist.push({t:Date.now(),p:price,q:qty,u:unit});
  const patch={buyPrice:price,buyQty:qty,buyUnit:unit,history:hist.slice(-12),updatedAt:Date.now()};if(g.seed&&price>0)patch.seed=false;
  Object.assign(g,patch);
  const small_=row.querySelector('.who small');
  if(small_){const base=ingBase(g),per=g.kind==='p'?base:base*1000;const used=C.recs.filter(r=>(r.lines||[]).some(l=>l.type==='ing'&&l.ref===g.id)).length;
    small_.innerHTML=(base>0?'= '+money(per)+(g.kind==='w'?' للكيلو':g.kind==='v'?' للتر':' للحبة'):'<span style="color:var(--warn)">من غير سعر</span>')+' · داخلة في '+used+' وصفة'}
  const s=document.getElementById('ing-stats');if(s)s.innerHTML=ingStats();
  if(await wr(()=>S.db.doc('ingredients/'+g.id).update(patch))){
    const used=C.recs.filter(r=>(r.lines||[]).some(l=>l.type==='ing'&&l.ref===g.id)).length;
    if(used)toast('اتحفظ. اتحدّثت '+used+' وصفة');
  }
}
/* إضافة كذا خامة: الاسم، السعر، الكمية، الوحدة */
const UMAP={'كجم':'kg','كيلو':'kg','kg':'kg','جم':'g','جرام':'g','g':'g','gm':'g','لتر':'l','l':'l','ltr':'l','مل':'ml','ml':'ml','حبة':'pc','حبه':'pc','قطعة':'pc','pc':'pc','pcs':'pc'};
function parseBulk(txt){
  const rows=[],skipped=[];
  String(txt).split(/\n+/).forEach(line=>{
    const s=line.trim();if(!s)return;
    const p=s.split(/\s*[,،\t;|]\s*/);
    if(p.length<4){skipped.push(s);return}
    const name=p[0],price=n(p[1]),qty=n(p[2])||1,u=UMAP[T().norm(p[3]).replace(/\./g,'')]||UMAP[p[3].trim().toLowerCase()];
    if(!name||!u||!(price>=0)){skipped.push(s);return}
    rows.push({name,price,qty,unit:u,kind:kindOf(u),waste:n(p[4])});
  });
  return {rows,skipped};
}
function bulkModal(){
  T().openModal('<h2>إضافة كذا خامة</h2><p class="muted" style="margin:0">سطر لكل خامة: <b>الاسم، السعر، الكمية، الوحدة</b><br>مثال: <span dir="ltr">Milk, 45, 1, لتر</span> أو <span dir="ltr">Matcha, 900, 500, جم</span><br>الوحدات: كجم، جم، لتر، مل، حبة. لو الخامة موجودة هيتحدّث سعرها.</p><textarea id="bk-t" class="inp" style="min-height:180px" dir="auto"></textarea><div class="err" id="bk-err"></div><div class="actions"><button class="btn pri" data-ca="bulksave">حفظ</button><button class="btn" data-act="close">إلغاء</button></div>','wide');
}
async function saveBulk(){
  const t=T();const {$,S,wr,toast,closeModal,uid}=t;
  const {rows,skipped}=parseBulk($('#bk-t').value);
  if(!rows.length){$('#bk-err').textContent='مفيش سطور صالحة. اتأكد من الشكل.';return}
  if(rows.length>400){$('#bk-err').textContent='أقصى عدد 400 سطر في المرة';return}
  const b=S.db.batch();let add=0,upd=0;
  rows.forEach(r=>{
    const old=C.ings.find(g=>nm(g.name)===nm(r.name));
    const hist=old&&old.history?old.history.slice():[];if(r.price>0)hist.push({t:Date.now(),p:r.price,q:r.qty,u:r.unit});
    if(old){upd++;b.set(S.db.doc('ingredients/'+old.id),{buyPrice:r.price,buyQty:r.qty,buyUnit:r.unit,history:hist.slice(-12),updatedAt:Date.now()},{merge:true})}
    else{add++;b.set(S.db.doc('ingredients/'+uid('i')),{name:r.name,kind:r.kind,buyUnit:r.unit,buyQty:r.qty,buyPrice:r.price,waste:r.waste||0,note:'',history:hist,updatedAt:Date.now()})}
  });
  if(await wr(()=>b.commit())){closeModal();toast('اتضافت '+add+' وتحدّثت '+upd+(skipped.length?' · '+skipped.length+' سطر اتخطّى':''))}
}

/* ---------- recipes ---------- */
function bookDoc(r,renId,renName){
  const lines=(r.lines||[]).map(l=>{
    let name,q=n(l.qty),u=l.unit;
    if(l.type==='rec'){const x=recOf(l.ref);name=x?x.name:(l.nameText||'?');u='portion'}
    else{const g=ingOf(l.ref);name=(renId&&l.ref===renId)?renName:(g?g.name:(l.nameText||'?'));const uu=UNITS[l.unit];if(uu&&l.unit!=='pc'){q=q*uu.f;u=uu.k==='w'?'g':'ml'}}
    return {n:name,q:q>0?Math.round(q*100)/100:null,u:u||'',note:l.note||''};
  });
  return {name:r.name,nick:r.nick||'',desc:r.desc||'',cat:r.cat||'',price:n(r.price)||null,steps:r.steps||'',lines,order:r.order||0,updatedAt:Date.now()};
}
function recStats(rows){
  const priced=rows.filter(x=>x.c.mg!=null);
  const avg=priced.length?priced.reduce((a,x)=>a+x.c.mg,0)/priced.length:null;
  const low=priced.filter(x=>x.c.mg<n(C.cfg.low)).length;
  return {priced,avg,low};
}
function recsTop(rows){
  const {esc}=T();const {priced,avg,low}=recStats(rows);
  const worst=priced.slice().sort((a,b)=>a.c.mg-b.c.mg).slice(0,3),best=priced.slice().sort((a,b)=>b.c.mg-a.c.mg).slice(0,3);
  const li=x=>'<div class="fr"><b>'+esc(x.r.name)+'</b><span>'+nf(x.c.mg,0)+'٪ · ربح '+money(x.c.profit)+'</span></div>';
  return '<div class="tiles"><div class="stat"><b>'+rows.length+'</b><span>وصفة</span></div><div class="stat"><b>'+(avg==null?'—':nf(avg,0)+'٪')+'</b><span>متوسط الهامش</span></div><div class="stat '+(low?'bad':'ok')+'"><b>'+low+'</b><span>تحت الحد ('+nf(C.cfg.low,0)+'٪)</span></div></div>'+
    (priced.length>=3?'<div class="row2"><section class="sec"><h3>الأقل ربحًا</h3>'+worst.map(li).join('')+'</section><section class="sec"><h3>الأعلى ربحًا</h3>'+best.map(li).join('')+'</section></div>':'');
}
function recRows(){
  const q=nm(C.rq);
  return C.recs.filter(r=>(C.rcat==='all'||r.cat===C.rcat)&&(!q||nm(r.name+' '+(r.nick||'')).includes(q))).map(r=>({r,c:calc(r)}));
}
function recList(){
  const {esc}=T();const rows=recRows();
  if(!rows.length)return '<div class="empty">'+(C.recs.length?'مفيش وصفة بالشكل ده':'لسه مفيش وصفات. دوس "+ وصفة" أو استورد المنيو من الملف.')+'</div>';
  return rows.map(({r,c})=>'<article class="item rc" data-ca="redit" data-id="'+esc(r.id)+'" role="button" tabindex="0"><div class="who"><span class="av">'+esc(Array.from(r.name)[0]||'؟')+'</span><div><b>'+esc(r.name)+(r.nick?' <small>· '+esc(r.nick)+'</small>':'')+'</b><small>'+esc(r.cat||'')+' · '+(r.lines||[]).length+' مكوّن'+(r.pub?'':' · مخفية عن الباريستا')+'</small></div></div>'+
    '<div class="st">'+(c.per>0?'<span class="pill">تكلفة '+money(c.per)+'</span>':'')+(n(r.price)>0?'<span class="pill">بيع '+nf(r.price,0)+' ج</span>':'')+mgPill(c.mg)+(c.unpriced?'<span class="pill warn">'+c.unpriced+' بدون سعر</span>':'')+'</div></article>').join('');
}
function fillRecs(){
  const {$}=T();const el=$('#rec-list');if(!el)return;
  const a=document.activeElement;if(a&&a.id==='rec-q'){el.innerHTML=recList();return}
  el.innerHTML=recList();const top=$('#rec-top');if(top)top.innerHTML=recsTop(C.recs.map(r=>({r,c:calc(r)})));
}
function tabRecs(){
  sub();if(!(C.ok.i&&C.ok.r))return '<div class="empty cloading">جاري التحميل...</div>';
  const {esc}=T();const cs=[];C.recs.forEach(r=>{if(r.cat&&cs.indexOf(r.cat)<0)cs.push(r.cat)});
  return '<h2 style="font-size:1.3rem">الوصفات والتسعير</h2><div id="rec-top">'+recsTop(C.recs.map(r=>({r,c:calc(r)})))+'</div>'+
    '<div class="ctrl"><button class="btn pri" data-ca="rnew">+ وصفة</button>'+importBtns()+'<button class="btn" data-ca="rcfg">إعدادات التسعير</button></div>'+
    '<label class="search" style="max-width:none"><input id="rec-q" class="inp" type="search" autocomplete="off" placeholder="دوّر على وصفة" value="'+esc(C.rq)+'"></label>'+
    '<div class="chips">'+['all'].concat(cs).map(c=>'<button class="chip" data-ca="rcat" data-c="'+esc(c)+'" aria-pressed="'+(C.rcat===c)+'">'+(c==='all'?'الكل':esc(c))+'</button>').join('')+'</div>'+
    '<div class="list" id="rec-list">'+recList()+'</div>';
}
function recModalHTML(){
  const d=C.draft;
  return '<h2>'+(d.id?'تعديل وصفة':'وصفة جديدة')+'</h2>'+edHTML('R',true)+'<div class="err" id="r-err"></div><div class="actions"><button class="btn pri" data-ca="rsave">حفظ</button><button class="btn" data-act="close">إغلاق</button>'+
    (d.id?'<button class="btn sm" data-ca="rdup">نسخة</button><button class="btn bad sm" data-ca="rdel" style="margin-inline-start:auto">حذف</button>':'')+'</div>';
}
function reopenRecipe(){T().openModal(recModalHTML(),'wide');updateSum('R')}
function openRecipe(id,pre){
  const r=id?recOf(id):null;
  C.draft=r?JSON.parse(JSON.stringify(r)):Object.assign(blank(),pre||{},{order:C.recs.reduce((a,x)=>Math.max(a,x.order||0),0)+1});
  C.sure=null;reopenRecipe();
}
async function saveRecipe(){
  const t=T();const {S,wr,toast,closeModal,uid,$}=t;const d=C.draft;
  const err=m=>{$('#r-err').textContent=m};
  d.name=String(d.name||'').trim();if(!d.name){err('اكتب اسم الوصفة');return}
  if(C.recs.some(r=>nm(r.name)===nm(d.name)&&r.id!==d.id)){err('فيه وصفة بنفس الاسم');return}
  const id=d.id||uid('r');
  const lines=d.lines.filter(l=>l.ref||l.nameText).map(l=>({type:l.type||'ing',ref:l.ref||null,nameText:l.nameText||'',qty:n(l.qty),unit:l.unit||'',note:l.note||''}));
  const doc={name:d.name,nick:d.nick||'',desc:d.desc||'',cat:d.cat||'أخرى',status:d.status||'done',pub:!!d.pub,yield:n(d.yield)>0?n(d.yield):1,lines,steps:d.steps||'',
    price:n(d.price)||'',cost0:n(d.cost0)||0,margin:d.margin===''||d.margin==null?'':n(d.margin),order:d.order||0,updatedAt:Date.now()};
  const b=S.db.batch();b.set(S.db.doc('recipes/'+id),doc);
  if(doc.pub)b.set(S.db.doc('recipebook/'+id),bookDoc(Object.assign({id},doc)));else b.delete(S.db.doc('recipebook/'+id));
  $('.sheet button[data-ca="rsave"]').disabled=true;
  if(await wr(()=>b.commit())){
    const i=C.recs.findIndex(r=>r.id===id);const full=Object.assign({id},doc);if(i>=0)C.recs[i]=full;else C.recs.push(full);
    C.draft=null;closeModal();toast('اتحفظت'+(doc.pub?' وظهرت للباريستا':''));fillRecs();
  }else{const bt=$('.sheet button[data-ca="rsave"]');if(bt)bt.disabled=false}
}
async function delRecipe(){
  const {S,wr,toast,closeModal,$}=T();const d=C.draft;if(!d||!d.id)return;
  const bt=$('[data-ca="rdel"]');
  if(C.sure!=='rdel'){C.sure='rdel';if(bt)bt.textContent='دوس تاني للتأكيد';return}
  C.sure=null;const b=S.db.batch();b.delete(S.db.doc('recipes/'+d.id));b.delete(S.db.doc('recipebook/'+d.id));
  if(await wr(()=>b.commit())){C.recs=C.recs.filter(r=>r.id!==d.id);C.draft=null;closeModal();toast('اتحذفت');fillRecs()}
}

/* ---------- smart paste ---------- */
const UNIT_SYN=[['ملعقة كبيرة','tbsp'],['معلقة كبيرة','tbsp'],['ملعقه كبيره','tbsp'],['معلقه كبيره','tbsp'],['ملعقة صغيرة','tsp'],['معلقة صغيرة','tsp'],['ملعقه صغيره','tsp'],['معلقه صغيره','tsp'],['ملعقة شاي','tsp'],['معلقة شاي','tsp'],
  ['ملعقة','tbsp'],['معلقة','tbsp'],['ملعقه','tbsp'],['معلقه','tbsp'],['tbsp','tbsp'],['tsp','tsp'],['كيلوجرام','kg'],['كيلو','kg'],['كجم','kg'],['kg','kg'],['جرام','g'],['غرام','g'],['جم','g'],['gm','g'],['g','g'],
  ['ملل','ml'],['مل','ml'],['ml','ml'],['لتر','l'],['ltr','l'],['l','l'],['كوب','cup'],['كباية','cup'],['cup','cup'],['cups','cup'],['حبة','pc'],['حبه','pc'],['حبات','pc'],['قطعة','pc'],['قطعه','pc'],['pcs','pc'],['pc','pc']]
  .sort((a,b)=>b[0].length-a[0].length);
function normDigits(s){return String(s).replace(/[٠-٩]/g,d=>AR.indexOf(d)).replace(/٫/g,'.').replace(/٬/g,'')}
function parseRecipeText(txt){
  const lines=[],skipped=[];let yieldN=null;
  String(txt).split(/\n+|\s\+\s/).forEach(raw=>{
    let s=normDigits(raw).replace(/^\s*[-•*·]+\s*/,'').trim();if(!s)return;
    const ym=s.match(/(?:تكفي|تطلع|serves?|حصص|حصة|اشخاص|أشخاص)\D{0,6}(\d+)|(\d+)\s*(?:حصص|حصة|اشخاص|أشخاص|servings?)/i);
    if(ym){yieldN=Number(ym[1]||ym[2]);return}
    const mix=s.match(/(\d+)\s+(\d+)\s*\/\s*(\d+)/),fr=s.match(/(\d+)\s*\/\s*(\d+)/),dec=s.match(/\d+(?:[.,]\d+)?/),sym=s.match(/[½¼¾⅓⅔]/);
    let qty=null,idx=-1,len=0;
    if(mix){qty=Number(mix[1])+Number(mix[2])/Number(mix[3]);idx=mix.index;len=mix[0].length}
    else if(fr){qty=Number(fr[1])/Number(fr[2]);idx=fr.index;len=fr[0].length}
    else if(dec){qty=parseFloat(dec[0].replace(',','.'));idx=dec.index;len=dec[0].length}
    else if(sym){qty={'½':.5,'¼':.25,'¾':.75,'⅓':1/3,'⅔':2/3}[sym[0]];idx=sym.index;len=1}
    if(qty==null){ // من غير رقم لكن فيه وحدة في الأول (مثلاً "معلقة سكر") = 1
      const low=s.toLowerCase();
      const hit=UNIT_SYN.find(([tok])=>low.indexOf(tok)===0&&!/[\p{L}\p{N}]/u.test(s.charAt(tok.length)||' '));
      if(!hit){skipped.push(raw.trim());return}
      qty=1;idx=0;len=0;
    }
    const before=s.slice(0,idx),after=s.slice(idx+len);
    let rest=after.replace(/^\s+/,''),unit=null;
    const lower=rest.toLowerCase();
    for(const [tok,u] of UNIT_SYN){
      if(lower.indexOf(tok)===0){const nx=rest.charAt(tok.length);if(!nx||!/[\p{L}\p{N}]/u.test(nx)){unit=u;rest=rest.slice(tok.length);break}}
    }
    let name=(before+' '+rest).replace(/\([^)]*\)/g,'').replace(/^[\s\-:،,]+|[\s\-:،,]+$/g,'').replace(/^من\s+/,'').replace(/\s+/g,' ').trim();
    if(!name){skipped.push(raw.trim());return}
    const note=(raw.match(/\(([^)]*)\)/)||[])[1]||'';
    const g=matchIng(name);
    if(!unit)unit=g?KU[g.kind][0]:'g';
    lines.push({type:'ing',ref:g?g.id:null,nameText:g?g.name:name,qty,unit:g&&UNITS[unit].k!==g.kind?KU[g.kind][0]:unit,note});
  });
  return {lines,skipped,yieldN};
}
function matchIng(txt){
  const t=nm(txt);if(!t)return null;let best=null,sc=0;
  C.ings.forEach(g=>{
    const gn=nm(g.name);let s=0;
    if(gn===t)s=4;else if(t.includes(gn)||gn.includes(t))s=3;
    else{const tt=t.split(/\s+/).filter(w=>w.length>=3),gg=gn.split(/\s+/).filter(w=>w.length>=3);const ov=tt.filter(w=>gg.indexOf(w)>=0).length;if(ov)s=ov/Math.max(tt.length,gg.length)*2}
    if(s>sc||(s===sc&&s>0&&best&&g.name.length<best.name.length)){sc=s;best=g}
  });
  return sc>=1?best:null;
}
function pasteModal(k){
  C.pk=k;
  T().openModal('<h2>ألصق وصفة مكتوبة</h2><p class="muted" style="margin:0">اكتب أو الصق المكوّنات، كل مكوّن في سطر أو بينهم +<br>مثال: <span dir="ltr">200 ml milk + 15 g coffee</span> أو "٢٠٠ مل لبن، معلقة سكر"<br>هنحوّلها لمكوّنات ونربطها بالخامات المسجّلة. اللي مش معروف هتسجّله بإيدك.</p><textarea id="pt-t" class="inp" style="min-height:160px" dir="auto"></textarea><div class="err" id="pt-err"></div><div class="actions"><button class="btn pri" data-ca="pastego">حوّل</button><button class="btn" data-ca="pasteback">رجوع</button></div>','wide');
}
function pasteGo(){
  const {$,toast}=T();const r=parseRecipeText($('#pt-t').value);
  if(!r.lines.length){$('#pt-err').textContent='مقدرتش أفهم مكوّنات. اكتب الكمية قبل أو بعد اسم الخامة.';return}
  const st=stateOf(C.pk);st.lines=st.lines.concat(r.lines);if(r.yieldN)st.yield=r.yieldN;
  const unk=r.lines.filter(l=>!l.ref).length;
  pasteBack();toast('اتضافت '+r.lines.length+' مكوّن'+(unk?' ('+unk+' محتاجة تسجّلها)':'')+(r.skipped.length?' · '+r.skipped.length+' سطر اتخطّى':''));
}
function pasteBack(){
  const k=C.pk;if(k==='R')reopenRecipe();else{T().closeModal();const el=document.querySelector('.ced[data-k="'+k+'"]');if(el)refreshCalc()}
}

/* ---------- calculator ---------- */
function cmpHTML(){
  const A=C.calc.A,Bq=C.calc.B;if(!Bq)return '';
  const a=calc(A),b=calc(Bq);const row=(l,x,y)=>'<tr><td>'+l+'</td><td>'+x+'</td><td>'+y+'</td></tr>';
  return '<div class="scroll"><table class="tbl" style="min-width:0"><thead><tr><th></th><th>أ</th><th>ب</th></tr></thead><tbody>'+
    row('تكلفة الحصة',money(a.per),money(b.per))+row('سعر بيع مقترح',a.sugg?money(a.sugg):'—',b.sugg?money(b.sugg):'—')+
    (a.price>0||b.price>0?row('هامش الربح',a.mg==null?'—':nf(a.mg,1)+'٪',b.mg==null?'—':nf(b.mg,1)+'٪'):'')+'</tbody></table></div>';
}
function updateCmp(){const el=document.getElementById('cmp');if(el)el.innerHTML=cmpHTML()}
function tabCalc(){
  sub();if(!(C.ok.i&&C.ok.r))return '<div class="empty cloading">جاري التحميل...</div>';
  return '<h2 style="font-size:1.3rem">حاسبة كوست</h2><p class="muted" style="margin:0">جرّب مشروب جديد: ضيف المكوّنات وشوف التكلفة والسعر المقترح على طول. مفيش حاجة بتتحفظ إلا لما تدوس "احفظ كوصفة".</p>'+
    '<section class="sec"><h3>'+(C.calc.B?'النسخة أ':'المشروب')+'</h3>'+edHTML('A',false)+'</section>'+
    (C.calc.B?'<div id="cmp">'+cmpHTML()+'</div><section class="sec"><h3>النسخة ب</h3>'+edHTML('B',false)+'</section>':'')+
    '<div class="actions"><button class="btn pri" data-ca="calcsave">احفظ كوصفة</button>'+
    (C.calc.B?'<button class="btn" data-ca="calcnb">شيل النسخة ب</button>':'<button class="btn" data-ca="calcb">قارن بنسخة تانية</button>')+'<button class="btn bad" data-ca="calcreset">فضّي الكل</button></div>';
}
function refreshCalc(){const {$,S}=T();if(S.tab==='calc'&&$('#abody'))$('#abody').innerHTML=tabCalc(),['A','B'].forEach(k=>updateSum(k))}

/* ---------- cost settings ---------- */
function cfgModal(){
  const {openModal,esc}=T();const c=C.cfg;
  openModal('<h2>إعدادات التسعير</h2>'+
    '<label class="f">نسبة تشغيل تتضاف على تكلفة الخامات ٪<input id="cf-oh" class="inp num" type="number" inputmode="decimal" min="0" step="any" value="'+esc(c.overhead)+'"><small>كهرباء، عمالة، إيجار.. لو مش عايزها سيبها 0</small></label>'+
    '<div class="row2"><label class="f">هامش الربح المستهدف ٪<input id="cf-mg" class="inp num" type="number" inputmode="decimal" min="0" max="99" step="any" value="'+esc(c.margin)+'"></label>'+
    '<label class="f">تحذير لو الهامش أقل من ٪<input id="cf-low" class="inp num" type="number" inputmode="decimal" min="0" max="99" step="any" value="'+esc(c.low)+'"></label></div>'+
    '<label class="f">تقريب سعر البيع المقترح لأقرب (ج)<select id="cf-rd" class="inp">'+[0,1,5,10].map(x=>'<option value="'+x+'"'+(n(c.round)===x?' selected':'')+'>'+(x?x:'من غير تقريب')+'</option>').join('')+'</select></label>'+
    '<div class="actions"><button class="btn pri" data-ca="rcfgsave">حفظ</button><button class="btn" data-act="close">إلغاء</button></div>');
}
async function saveCfg(){
  const {$,S,wr,toast,closeModal}=T();
  const data={overhead:Math.max(0,n($('#cf-oh').value)),margin:Math.min(99,Math.max(0,n($('#cf-mg').value))),low:Math.min(99,Math.max(0,n($('#cf-low').value))),round:n($('#cf-rd').value)};
  if(await wr(()=>S.db.doc('costcfg/main').set(data))){C.cfg=Object.assign({},DEF_CFG,data);closeModal();toast('اتحفظت');fillRecs()}
}

/* ---------- import menu (json file) ---------- */
function readImport(file){
  const {toast,openModal}=T();
  const fr=new FileReader();
  fr.onload=()=>{
    let j;try{j=JSON.parse(fr.result)}catch(e){toast('الملف مش سليم');return}
    if(!j||!Array.isArray(j.ingredients)||!Array.isArray(j.recipes)){toast('الملف مش ملف منيو Thrills');return}
    const newI=j.ingredients.filter(i=>i&&i.id&&!ingOf(i.id)),newR=j.recipes.filter(r=>r&&r.id&&!recOf(r.id));
    C.pendingImport={ings:newI,recs:newR};
    openModal('<h2>استيراد المنيو</h2><p style="margin:0">في الملف <b>'+j.recipes.length+'</b> وصفة و<b>'+j.ingredients.length+'</b> خامة.<br>الجديد اللي هيتضاف: <b>'+newR.length+'</b> وصفة و<b>'+newI.length+'</b> خامة. الموجود قبل كده <b>مش هيتغيّر</b> (أسعارك وتعديلاتك في أمان).</p><div class="fnote">الخامات هتتضاف من غير أسعار. بعد الاستيراد روح تاب "الخامات" واكتب أسعارها، وكل التكاليف هتتحسب لوحدها.</div><div class="actions"><button class="btn pri" data-ca="importgo"'+(newR.length||newI.length?'':' disabled')+'>ابدأ الاستيراد</button><button class="btn" data-act="close">إلغاء</button></div>');
  };
  fr.onerror=()=>toast('مقدرتش أقرا الملف');
  fr.readAsText(file,'utf-8');
}
async function importGo(){
  const t=T();const {S,wr,toast,closeModal,$}=t;const p=C.pendingImport;if(!p)return;
  const bt=$('[data-ca="importgo"]');if(bt)bt.disabled=true;
  const now=Date.now();const ops=[];
  p.ings.forEach(i=>ops.push(['s','ingredients/'+i.id,{name:i.name,kind:i.kind,buyUnit:i.buyUnit,buyQty:i.buyQty||1,buyPrice:0,waste:0,note:'',history:[],seed:true,updatedAt:now}]));
  const newIngMap={};p.ings.forEach(i=>newIngMap[i.id]=i);
  p.recs.forEach(r=>{
    const doc={name:r.name,nick:r.nick||'',desc:r.desc||'',cat:r.cat||'أخرى',status:r.status||'done',pub:!!r.pub,yield:r.yield_||1,
      lines:(r.lines||[]).map(l=>({type:'ing',ref:l.ref,nameText:l.nameText||'',qty:n(l.qty),unit:l.unit,note:l.note||''})),steps:r.steps||'',price:r.price||'',cost0:r.cost0||0,margin:'',order:r.order||0,updatedAt:now};
    ops.push(['s','recipes/'+r.id,doc]);
    if(doc.pub)ops.push(['s','recipebook/'+r.id,{name:doc.name,nick:doc.nick,desc:doc.desc,cat:doc.cat,price:n(doc.price)||null,steps:doc.steps,order:doc.order,updatedAt:now,
      lines:doc.lines.map(l=>{const u=UNITS[l.unit]||UNITS.g;const q=n(l.qty);return {n:l.nameText,q:q>0?q:null,u:l.unit,note:l.note||''}})}]);
  });
  let ok=true;
  for(let i=0;i<ops.length&&ok;i+=300){
    const b=S.db.batch();ops.slice(i,i+300).forEach(o=>b.set(S.db.doc(o[1]),o[2]));
    ok=await wr(()=>b.commit());
  }
  if(ok){C.pendingImport=null;closeModal();toast('اتضاف '+p.recs.length+' وصفة و'+p.ings.length+' خامة ✅. اكتب أسعار الخامات دلوقتي');}
  else if(bt)bt.disabled=false;
}

/* ---------- events ---------- */
document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-ca]');if(!el)return;
  const t=T();if(!t)return;const {S,$}=t;const a=el.dataset.ca,k=el.dataset.k;
  if(a!=='idel'&&a!=='rdel')C.sure=null;
  switch(a){
    case 'iadd':C.ret=null;openIng(null);break;
    case 'iedit':C.ret=null;openIng(el.dataset.id);break;
    case 'isave':await saveIng();break;
    case 'idel':await delIng();break;
    case 'ibulk':bulkModal();break;
    case 'bulksave':await saveBulk();break;
    case 'ifilter':C.ifilter=el.dataset.f;S.tab==='ings'&&($('#abody').innerHTML=tabIngs());break;
    case 'import':{const f=$('#imp-file');if(f)f.click()}break;
    case 'importgo':await importGo();break;
    case 'rnew':openRecipe(null);break;
    case 'redit':openRecipe(el.dataset.id);break;
    case 'rsave':await saveRecipe();break;
    case 'rdel':await delRecipe();break;
    case 'rdup':{const d=C.draft;if(d){C.draft=Object.assign({},JSON.parse(JSON.stringify(d)),{id:null,name:d.name+' (نسخة)',order:C.recs.reduce((x,r)=>Math.max(x,r.order||0),0)+1});reopenRecipe();t.toast('ده نسخة جديدة. عدّل الاسم واحفظ')}}break;
    case 'rcat':C.rcat=el.dataset.c;S.tab==='recs'&&($('#abody').innerHTML=tabRecs());break;
    case 'rcfg':cfgModal();break;
    case 'rcfgsave':await saveCfg();break;
    case 'ladd':{const st=stateOf(k);st.lines.push({type:'ing',ref:null,nameText:'',qty:'',unit:'',note:''});reLines(k,'last');const rows=document.querySelectorAll('#lines-'+k+' .cl');const inp=rows[rows.length-1]&&rows[rows.length-1].querySelector('[data-c="ref"]');if(inp)inp.focus()}break;
    case 'ldel':{const st=stateOf(k);st.lines.splice(Number(el.dataset.i),1);reLines(k)}break;
    case 'newing':{const st=stateOf(k),i=Number(el.dataset.i),l=st.lines[i];C.ret={k,i};openIng(null,{name:l.nameText||'',kind:UNITS[l.unit]?UNITS[l.unit].k:'w',buyUnit:BU[UNITS[l.unit]?UNITS[l.unit].k:'w'][0]})}break;
    case 'rpaste':pasteModal(k);break;
    case 'pastego':pasteGo();break;
    case 'pasteback':pasteBack();break;
    case 'calcb':C.calc.B=JSON.parse(JSON.stringify(C.calc.A));refreshCalc();break;
    case 'calcnb':C.calc.B=null;refreshCalc();break;
    case 'calcreset':C.calc={A:blank(),B:null};refreshCalc();break;
    case 'calcsave':{const A=C.calc.A;if(!A.lines.length){t.toast('ضيف مكوّنات الأول');break}C.draft=Object.assign(blank(),JSON.parse(JSON.stringify(A)),{id:null,order:C.recs.reduce((x,r)=>Math.max(x,r.order||0),0)+1});reopenRecipe()}break;
  }
});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches&&e.target.matches('.rc')){e.preventDefault();e.target.click()}});
document.addEventListener('input',e=>{
  const x=e.target;if(!x||!x.closest)return;
  if(x.id==='ing-q'){C.iq=x.value;fillIngs();return}
  if(x.id==='rec-q'){C.rq=x.value;fillRecs();return}
  if(x.id&&x.id.indexOf('i-')===0&&x.closest('.sheet')){ingPrev();return}
  const ced=x.closest('.ced');if(!ced||!x.dataset.c)return;
  const k=ced.dataset.k,st=stateOf(k);if(!st)return;const c=x.dataset.c;
  if(c==='ref')return;
  if(c==='qty'||c==='note'){const row=x.closest('.cl');const l=st.lines[Number(row.dataset.i)];if(l)l[c]=x.value;updateSum(k);return}
  if(c==='pub')return;
  st[c]=x.value;updateSum(k);
});
document.addEventListener('change',e=>{
  const x=e.target;if(!x||!x.closest)return;
  if(x.id==='imp-file'){if(x.files&&x.files[0])readImport(x.files[0]);x.value='';return}
  if(x.id==='i-kind'){const $=T().$,k=x.value;$('#i-unit').innerHTML=BU[k].map(u=>'<option value="'+u+'">'+UNITS[u].n+'</option>').join('');ingPrev();return}
  if(x.id&&x.id.indexOf('i-')===0&&x.closest('.sheet')){ingPrev();return}
  if(x.dataset&&x.dataset.ci){saveInline(x);return}
  const ced=x.closest('.ced');if(!ced||!x.dataset.c)return;
  const k=ced.dataset.k,st=stateOf(k);if(!st)return;const c=x.dataset.c;
  if(c==='pub'){st.pub=x.checked;return}
  if(c==='ref'){
    const row=x.closest('.cl'),i=Number(row.dataset.i),l=st.lines[i];const r=resolve(x.value);
    if(r){l.type=r.type;l.ref=r.ref;l.nameText='';const us=unitsFor(l);if(!us.some(u=>u[0]===l.unit))l.unit=us[0]?us[0][0]:''}
    else{l.ref=null;l.type='ing';l.nameText=x.value.trim();l.unit=''}
    reLines(k,r?i:null);return;
  }
  if(c==='unit'){const row=x.closest('.cl');const l=st.lines[Number(row.dataset.i)];if(l)l.unit=x.value;updateSum(k);return}
  if(c==='cat'){st.cat=x.value}
});

window.ThrillsCost={tab(name){return {ings:tabIngs,recs:tabRecs,calc:tabCalc}[name]()},clear,
  _t:{calc,parseRecipeText,ingBase,C,bookDoc}};
if(window.__T)setTimeout(()=>{},0);
document.addEventListener('DOMContentLoaded',()=>{});
// بعد ما الصفحة تتحمّل: بعد رسم تاب الحاسبة نحدّث المجاميع
const _origTab=window.ThrillsCost.tab;
window.ThrillsCost.tab=function(name){
  const h=_origTab(name);
  if(name==='calc')setTimeout(()=>{['A','B'].forEach(k=>updateSum(k))},0);
  return h;
};
})();
