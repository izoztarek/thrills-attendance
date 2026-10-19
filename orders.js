/* Thrills - طلب نواقص الأيس كريم: الفرع بيطلب، المصنع بيجهّز ويبعت، الفرع يأكد الاستلام.
   بيشتغل فوق app.js (بياخد منه window.__T). الصفحات: #order (الفرع) و #factory (المصنع). */
(function(){
'use strict';
const T=()=>window.__T;
const DEFAULT_FLAVORS=['فانيليا','شوكولاتة','فراولة','مانجو','كوكيز','بيستاشيو','كراميل','لوتس','نوتيلا','ليمون','كوكونت','أوريو'];
const ST={new:['جديد','warn'],prep:['بيتجهز','warn'],sent:['اتبعت','ok'],done:['اتسلّم',''],cancelled:['اتلغى','bad']};
const SIZE={big:'كبير',mini:'ميني'};
const O={cfg:null,orders:[],loaded:false,subbed:false,first:true,
  cart:{},q:'',by:'',note:'',urgent:false,busy:false,
  ftab:'open',draft:null,ac:null,flash:null,sure:null};
try{O.by=localStorage.getItem('thrills.orderBy')||''}catch(e){}

const flavors=()=>((O.cfg&&O.cfg.flavors)||[]).filter(f=>f&&f.name);
const pillOf=s=>{const x=ST[s]||['؟',''];return '<span class="pill '+x[1]+'">'+x[0]+'</span>'};
const itemTxt=i=>i.n+' — '+(SIZE[i.s]||i.s)+' ×'+i.q;
function agoTxt(ms){const m=Math.max(0,Math.round((Date.now()-ms)/60000));if(m<1)return 'دلوقتي';if(m<60)return 'من '+m+' د';const h=Math.floor(m/60);return 'من '+h+' س'+(m%60?' '+(m%60)+' د':'')}
function startOfToday(){const d=new Date();d.setHours(0,0,0,0);return d.getTime()}
function keyOf(f,s){return f+'|'+s}
function cartItems(){
  const out=[];
  flavors().forEach(f=>['big','mini'].forEach(s=>{const q=O.cart[keyOf(f.id,s)]||0;if(q>0)out.push({f:f.id,n:f.name,s,q})}));
  return out;
}

/* ---------- sound / alerts ---------- */
function unlock(){try{if(!O.ac){const C=window.AudioContext||window.webkitAudioContext;if(C)O.ac=new C()}if(O.ac&&O.ac.state==='suspended')O.ac.resume()}catch(e){}}
function beep(){
  try{unlock();const c=O.ac;if(c)[0,.28,.56].forEach(d=>{const o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.value=880;g.gain.value=.25;o.connect(g);g.connect(c.destination);o.start(c.currentTime+d);o.stop(c.currentTime+d+.16)})}catch(e){}
  try{if(navigator.vibrate)navigator.vibrate([200,100,200])}catch(e){}
}
function flashTitle(msg){
  if(O.flash)return;const base=document.title;let on=false;
  O.flash=setInterval(()=>{document.title=(on=!on)?msg:base},900);
  const stop=()=>{clearInterval(O.flash);O.flash=null;document.title=base;document.removeEventListener('pointerdown',stop,true);document.removeEventListener('visibilitychange',vis)};
  const vis=()=>{if(!document.hidden)stop()};
  document.addEventListener('pointerdown',stop,true);document.addEventListener('visibilitychange',vis);
}

/* ---------- data ---------- */
function mapOrders(q){return q.docs.map(d=>{const x=d.data();return Object.assign({id:d.id},x,{at:x.ts&&x.ts.toMillis?x.ts.toMillis():Date.now(),pending:d.metadata.hasPendingWrites})})}
function sub(){
  const {S}=T();if(O.subbed||!S.db)return;O.subbed=true;
  S.db.doc('config/orders').onSnapshot(s=>{O.cfg=s.exists?s.data():null;O.cfgOk=true;refresh()},()=>{O.cfgOk=true;refresh()});
  S.db.collection('orders').orderBy('ts','desc').limit(150).onSnapshot(q=>{
    if(!O.first){
      q.docChanges().forEach(ch=>{
        if(ch.doc.metadata.hasPendingWrites)return;const d=ch.doc.data();
        if(S.view==='factory'&&ch.type==='added'&&d.status==='new'){beep();flashTitle('🍦 طلب جديد!');T().toast('طلب جديد من '+(d.branchName||''))}
        if(S.view==='order'&&ch.type==='modified'&&d.branch===S.branch&&d.status==='sent'){beep();T().toast('طلبك اتبعت من المصنع 🚚')}
      });
    }
    O.first=false;O.orders=mapOrders(q);O.loaded=true;refresh();
  },()=>{O.loaded=true;refresh()});
}
function refresh(){
  const t=T();if(!t)return;const {S,$,adminBody}=t;
  if(S.view==='order'||S.view==='factory')render();
  else if(S.view==='admin'&&$('#abody')){if(S.tab==='orders')adminBody();else if(S.tab==='oset'&&!O.draft)adminBody()}
}
function push(msg,o){
  o=o||{};const tp=O.cfg&&O.cfg.factoryTopic;if(!tp)return;
  const click=location.origin+location.pathname+'#factory';
  try{fetch('https://ntfy.sh/',{method:'POST',body:JSON.stringify({topic:tp,title:o.title||'Thrills - المصنع',message:msg,priority:o.priority||4,tags:[o.tag||'ice_cream'],click})}).catch(()=>{})}catch(e){}
}

/* ---------- branch screen ---------- */
function view(){
  const {S}=T();sub();
  return S.view==='factory'?factoryHTML():orderHTML();
}
function render(){const {S,setApp}=T();setApp(view());if(S.view==='order')fillFlavors();}
function homeBtn(){return '<button class="linkbtn" data-oa="home">الشاشة الرئيسية</button>'}
function orderHTML(){
  const {S,esc,head,brName}=T();
  const brs=S.cfg.branches||[];
  const h=head(false,'طلب نواقص للمصنع');
  if(!brs.some(b=>b.id===S.branch)){
    return h+'<main class="panel"><div class="sec"><h3>إنت في أنهي فرع؟</h3><div class="chips">'+brs.map(b=>'<button class="chip" data-act="chip" data-b="'+esc(b.id)+'" aria-pressed="false">'+esc(b.name)+'</button>').join('')+'</div></div></main><div class="foot"><span></span>'+homeBtn()+'</div>';
  }
  const fl=flavors();
  const names=S.staff.filter(s=>s.active!==false&&s.branch===S.branch).map(s=>'<option value="'+esc(s.name)+'">').join('');
  const body=fl.length?
    '<section class="sec"><h3>مين بيطلب؟</h3><input id="o-by" class="inp" list="o-names" autocomplete="off" placeholder="اكتب اسمك" value="'+esc(O.by)+'"><datalist id="o-names">'+names+'</datalist></section>'+
    '<section class="sec"><h3>إيه الناقص؟</h3><input id="o-q" class="inp" type="search" autocomplete="off" placeholder="دوّر على طعم" value="'+esc(O.q)+'"><div class="muted" style="font-size:.88rem">دوس + على الكمية المطلوبة من كل طعم (كبير / ميني)</div><div class="fls" id="o-fl"></div></section>'+
    '<section class="sec"><label class="f" style="flex-direction:row;align-items:center;gap:10px"><input id="o-urg" type="checkbox"'+(O.urgent?' checked':'')+' style="width:22px;height:22px"> مستعجل (ناقص خالص ومحتاجينه النهارده)</label>'+
    '<label class="f">ملاحظة للمصنع (اختياري)<textarea id="o-note" class="inp" style="min-height:70px" maxlength="250" placeholder="مثلاً: محتاجينه قبل الساعة 6">'+esc(O.note)+'</textarea></label></section>'+
    '<div class="cartbar" id="cartbar"></div>'
    :'<div class="empty">المدير لسه ما ضافش قايمة الأطعمة. من لوحة المدير ← تاب "الأطعمة".</div>';
  return h+'<div class="bar"><span class="pill ok" style="font-size:.95rem">الفرع: '+esc(brName(S.branch))+'</span><button class="linkbtn" data-act="chip" data-b="all">تغيير الفرع</button></div>'+
    '<main class="panel">'+body+'<section class="sec"><h3>طلبات الفرع (آخر يوم ونص)</h3><div id="o-mine">'+mineHTML()+'</div></section></main>'+
    '<div class="foot"><span></span>'+homeBtn()+'</div>';
}
function fillFlavors(){
  const {$,esc,norm}=T();const el=$('#o-fl');if(!el)return;
  const q=norm(O.q);
  const list=flavors().filter(f=>!q||norm(f.name).includes(q));
  el.innerHTML=list.length?list.map(f=>'<div class="fr"><b>'+esc(f.name)+'</b>'+['big','mini'].map(s=>{
    const n=O.cart[keyOf(f.id,s)]||0;
    return '<div class="stp'+(n?' on':'')+'" id="st-'+esc(f.id)+'-'+s+'"><small>'+SIZE[s]+'</small><button data-oa="bump" data-f="'+esc(f.id)+'" data-s="'+s+'" data-d="-1" aria-label="نقص '+SIZE[s]+' '+esc(f.name)+'">−</button><output>'+n+'</output><button data-oa="bump" data-f="'+esc(f.id)+'" data-s="'+s+'" data-d="1" aria-label="زوّد '+SIZE[s]+' '+esc(f.name)+'">+</button></div>'}).join('')+'</div>').join(''):'<div class="empty">مفيش طعم بالاسم ده</div>';
  cartBar();
}
function cartBar(){
  const {$}=T();const b=$('#cartbar');if(!b)return;
  const it=cartItems(),n=it.reduce((a,x)=>a+x.q,0);
  b.innerHTML='<span>'+(it.length?('<b>'+it.length+'</b> طعم · <b>'+n+'</b> وحدة'):'لسه ما اخترتش حاجة')+'</span><button class="btn pri" data-oa="review"'+(it.length?'':' disabled')+'>راجع وابعت للمصنع</button>';
}
function bump(f,s,d){
  const {$}=T();const k=keyOf(f,s);const n=Math.max(0,Math.min(99,(O.cart[k]||0)+d));
  if(n)O.cart[k]=n;else delete O.cart[k];
  const st=document.getElementById('st-'+f+'-'+s);
  if(st){st.querySelector('output').textContent=n;st.classList.toggle('on',n>0)}
  cartBar();
}
function reviewModal(){
  const {S,esc,openModal,toast,brName}=T();
  const it=cartItems();if(!it.length){toast('اختار طعم واحد على الأقل');return}
  const by=O.by.trim();
  if(by.length<2){toast('اكتب اسمك الأول');const i=document.getElementById('o-by');if(i){i.focus();i.scrollIntoView({block:'center'})}return}
  openModal('<h2>تأكيد الطلب</h2><p class="muted" style="margin:0">من '+esc(brName(S.branch))+' · '+esc(by)+(O.urgent?' · <b style="color:var(--bad)">مستعجل</b>':'')+'</p>'+
    '<ul class="oi">'+it.map(i=>'<li>'+esc(itemTxt(i))+'</li>').join('')+'</ul>'+(O.note.trim()?'<div class="fnote">'+esc(O.note.trim())+'</div>':'')+
    '<div class="actions"><button class="btn pri" id="o-go" data-oa="send">ابعت للمصنع</button><button class="btn" data-act="close">رجوع</button></div>');
}
async function send(){
  const {S,$,closeModal,toast,wr,brName}=T();
  if(O.busy)return;const items=cartItems(),by=O.by.trim();if(!items.length||by.length<2)return;
  O.busy=true;const b=$('#o-go');if(b)b.disabled=true;
  const id='o'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  const data={branch:S.branch,branchName:brName(S.branch),by,items,note:O.note.trim().slice(0,250),urgent:!!O.urgent,status:'new',ts:firebase.firestore.FieldValue.serverTimestamp()};
  const ok=await wr(()=>S.db.doc('orders/'+id).set(data));
  O.busy=false;
  if(!ok){if(b)b.disabled=false;return}
  try{localStorage.setItem('thrills.orderBy',by)}catch(e){}
  push('🍦 طلب '+(data.urgent?'مستعجل ':'')+'جديد من '+data.branchName+' ('+by+'):\n'+items.map(itemTxt).join('\n')+(data.note?'\nملاحظة: '+data.note:''),{priority:data.urgent?5:4,title:'Thrills - طلب جديد'});
  O.cart={};O.note='';O.urgent=false;O.q='';
  closeModal();toast('الطلب اتبعت للمصنع ✅');render();
}
function mineHTML(){
  const {S,esc,fmtT}=T();
  const mine=O.orders.filter(o=>o.branch===S.branch&&o.at>Date.now()-36*3600e3);
  if(!mine.length)return '<div class="muted">لسه مفيش طلبات.</div>';
  return mine.map(o=>'<article class="oc'+(o.urgent?' urgent':'')+'"><div class="oh"><b>'+fmtT(o.at)+'</b>'+pillOf(o.status)+(o.urgent?'<span class="pill bad">مستعجل</span>':'')+'<small>'+esc(o.by)+'</small></div>'+
    '<ul class="oi">'+(o.items||[]).map(i=>'<li>'+esc(itemTxt(i))+'</li>').join('')+'</ul>'+
    (o.note?'<small>ملاحظتك: '+esc(o.note)+'</small>':'')+(o.fnote?'<div class="fnote">رسالة من المصنع: '+esc(o.fnote)+'</div>':'')+
    (o.status==='sent'?'<div class="actions"><button class="btn pri" data-oa="status" data-id="'+esc(o.id)+'" data-to="done">استلمت الطلب ✅</button></div>':'')+
    (o.status==='new'?'<div class="actions"><button class="btn sm bad" data-oa="status" data-id="'+esc(o.id)+'" data-to="cancelled">'+(O.sure===o.id+'cancelled'?'اضغط تاني للتأكيد':'إلغاء الطلب')+'</button></div>':'')+
    '</article>').join('');
}

/* ---------- factory screen ---------- */
function locked(){
  const h=O.cfg&&O.cfg.pinHash;if(!h)return false;
  try{return localStorage.getItem('thrills.fpin')!==h}catch(e){return true}
}
function factoryHTML(){
  const {S,esc,head,fmtT}=T();
  const h=head(false,'شاشة المصنع');
  if(!O.cfgOk)return h+'<div class="grid"><div class="skeleton"></div><div class="skeleton"></div></div>';
  if(locked())return h+'<main class="panel" style="max-width:360px;margin:0 auto;width:100%"><div class="sec"><h3>شاشة المصنع</h3><label class="f">الرقم السري<input id="f-pin" class="inp num" inputmode="numeric" maxlength="4" autocomplete="off"></label><div class="err" id="f-err"></div><button class="btn pri" data-oa="funlock">دخول</button></div></main><div class="foot"><span></span>'+homeBtn()+'</div>';
  const open=O.orders.filter(o=>o.status==='new'||o.status==='prep');
  const doneToday=O.orders.filter(o=>(o.status==='sent'||o.status==='done')&&o.at>=startOfToday());
  const waiting=O.orders.filter(o=>o.status==='sent');
  const agg={};
  open.forEach(o=>(o.items||[]).forEach(i=>{const a=agg[i.f]||(agg[i.f]={n:i.n,big:0,mini:0});a[i.s]=(a[i.s]||0)+i.q}));
  const aggRows=Object.keys(agg).map(k=>agg[k]).sort((a,b)=>(b.big+b.mini)-(a.big+a.mini));
  const tab=O.ftab;
  const list=tab==='open'?open.slice().sort((a,b)=>(b.urgent?1:0)-(a.urgent?1:0)||a.at-b.at):
    tab==='sent'?waiting:O.orders.filter(o=>o.at>Date.now()-48*3600e3&&(o.status==='done'||o.status==='cancelled'));
  return h+'<main class="panel">'+
    '<div class="tiles"><div class="stat '+(open.some(o=>o.status==='new')?'bad':'')+'"><b>'+open.filter(o=>o.status==='new').length+'</b><span>جديد</span></div><div class="stat warn"><b>'+open.filter(o=>o.status==='prep').length+'</b><span>بيتجهز</span></div><div class="stat ok"><b>'+doneToday.length+'</b><span>اتبعت النهارده</span></div></div>'+
    (aggRows.length?'<section class="sec"><h3>إجمالي المطلوب تجهيزه دلوقتي</h3><div class="agg">'+aggRows.map(a=>'<div class="fr"><b>'+esc(a.n)+'</b><span>'+(a.big?'كبير <b>'+a.big+'</b>':'')+(a.big&&a.mini?' · ':'')+(a.mini?'ميني <b>'+a.mini+'</b>':'')+'</span></div>').join('')+'</div></section>':'')+
    '<div class="chips">'+[['open','المفتوحة ('+open.length+')'],['sent','مستنية استلام ('+waiting.length+')'],['hist','آخر طلبات خلصت']].map(t=>'<button class="chip" data-oa="ftab" data-t="'+t[0]+'" aria-pressed="'+(tab===t[0])+'">'+t[1]+'</button>').join('')+'</div>'+
    (list.length?list.map(factoryCard).join(''):'<div class="empty">'+(tab==='open'?'مفيش طلبات مفتوحة. 🍦':'مفيش حاجة هنا.')+'</div>')+
    '</main><div class="foot"><span>'+(O.ac&&O.ac.state==='running'?'🔔 الصوت شغّال':'<button class="linkbtn" data-oa="snd">🔔 فعّل صوت التنبيه</button>')+'</span>'+homeBtn()+'</div>';
}
function factoryCard(o){
  const {esc,fmtT}=T();
  const sure=k=>O.sure===o.id+k;
  const b=[];
  if(o.status==='new')b.push('<button class="btn pri" data-oa="status" data-id="'+esc(o.id)+'" data-to="prep">ابدأ التجهيز</button>');
  if(o.status==='new'||o.status==='prep')b.push('<button class="btn'+(o.status==='prep'?' pri':'')+'" data-oa="status" data-id="'+esc(o.id)+'" data-to="sent">'+(sure('sent')?'اضغط تاني للتأكيد':'اتبعت للفرع 🚚')+'</button>');
  if(o.status==='new'||o.status==='prep'||o.status==='sent')b.push('<button class="btn sm" data-oa="msg" data-id="'+esc(o.id)+'">رسالة للفرع</button>');
  if(o.status==='new'||o.status==='prep')b.push('<button class="btn sm bad" data-oa="status" data-id="'+esc(o.id)+'" data-to="cancelled">'+(sure('cancelled')?'اضغط تاني للتأكيد':'إلغاء')+'</button>');
  return '<article class="oc'+(o.urgent?' urgent':'')+'"><div class="oh"><b style="font-size:1.15rem">'+esc(o.branchName||'')+'</b>'+pillOf(o.status)+(o.urgent?'<span class="pill bad">مستعجل</span>':'')+
    '<small>'+esc(o.by||'')+' · '+fmtT(o.at)+' ('+agoTxt(o.at)+')</small></div>'+
    '<ul class="oi">'+(o.items||[]).map(i=>'<li>'+esc(itemTxt(i))+'</li>').join('')+'</ul>'+
    (o.note?'<div class="fnote" style="background:var(--surface2);color:var(--ink)">ملاحظة الفرع: '+esc(o.note)+'</div>':'')+(o.fnote?'<small>رسالتك للفرع: '+esc(o.fnote)+'</small>':'')+
    (b.length?'<div class="actions">'+b.join('')+'</div>':'')+'</article>';
}
async function setStatus(id,to,btn){
  const {S,wr}=T();
  const o=O.orders.find(x=>x.id===id);if(!o)return;
  if((to==='cancelled'||(to==='sent'&&o.status==='new'))&&O.sure!==id+to){
    O.sure=id+to;render();clearTimeout(O.sureT);O.sureT=setTimeout(()=>{O.sure=null;render()},4000);return;
  }
  O.sure=null;
  const patch={status:to};patch[{prep:'prepAt',sent:'sentAt',done:'doneAt',cancelled:'cancelAt'}[to]]=Date.now();
  await wr(()=>S.db.doc('orders/'+id).update(patch));
  if(to==='cancelled'&&S.view==='order')push('❌ '+o.branchName+' لغى طلب '+fmtItems(o),{priority:3,tag:'x'});
  if(to==='done')push('✅ '+o.branchName+' استلم الطلب',{priority:2,tag:'white_check_mark'});
}
function fmtItems(o){return (o.items||[]).map(itemTxt).join('، ')}
function msgModal(id){
  const {esc,openModal,$,wr,S,closeModal,toast}=T();
  const o=O.orders.find(x=>x.id===id);if(!o)return;
  openModal('<h2>رسالة لـ '+esc(o.branchName)+'</h2><textarea id="m-t" class="inp" maxlength="190" style="min-height:90px" placeholder="مثلاً: الفراولة هتتأخر ساعة">'+esc(o.fnote||'')+'</textarea>'+
    '<div class="chips">'+['الطلب هيوصل خلال ساعة','الطعم ده خلص حالياً','هنبعت جزء من الطلب'].map(x=>'<button class="chip" data-oa="mq" data-v="'+esc(x)+'" aria-pressed="false">'+esc(x)+'</button>').join('')+'</div>'+
    '<div class="actions"><button class="btn pri" id="m-ok">حفظ</button><button class="btn" data-act="close">إلغاء</button></div>');
  $('#m-ok').onclick=async()=>{const v=$('#m-t').value.trim().slice(0,190);if(await wr(()=>S.db.doc('orders/'+id).update({fnote:v}))){closeModal();toast('الرسالة وصلت للفرع')}};
}

/* ---------- manager tabs ---------- */
function tabOrders(){
  const {S,esc,fmtT,fmtDur}=T();sub();
  const today=O.orders.filter(o=>o.at>=startOfToday());
  const sentOnes=today.filter(o=>o.sentAt);
  const avg=sentOnes.length?Math.round(sentOnes.reduce((a,o)=>a+(o.sentAt-o.at),0)/sentOnes.length/60000):null;
  const agg={};
  today.filter(o=>o.status!=='cancelled').forEach(o=>(o.items||[]).forEach(i=>{const a=agg[i.f]||(agg[i.f]={n:i.n,big:0,mini:0});a[i.s]=(a[i.s]||0)+i.q}));
  const rows=Object.keys(agg).map(k=>agg[k]).sort((a,b)=>(b.big+b.mini)-(a.big+a.mini));
  return '<div class="tiles"><div class="stat"><b>'+today.length+'</b><span>طلبات النهارده</span></div><div class="stat warn"><b>'+today.filter(o=>o.status==='new'||o.status==='prep').length+'</b><span>لسه مفتوحة</span></div>'+
    '<div class="stat ok"><b>'+(avg==null?'—':fmtDur(avg))+'</b><span>متوسط وقت لحد ما اتبعت</span></div></div>'+
    (rows.length?'<section class="sec"><h3>اللي اتطلب النهارده</h3>'+rows.map(a=>'<div class="fr"><b>'+esc(a.n)+'</b><span>'+(a.big?'كبير <b>'+a.big+'</b>':'')+(a.big&&a.mini?' · ':'')+(a.mini?'ميني <b>'+a.mini+'</b>':'')+'</span></div>').join('')+'</section>':'')+
    '<h3>آخر الطلبات</h3>'+(O.orders.length?O.orders.slice(0,60).map(o=>'<article class="oc'+(o.urgent?' urgent':'')+'"><div class="oh"><b>'+esc(o.branchName||'')+'</b>'+pillOf(o.status)+(o.urgent?'<span class="pill bad">مستعجل</span>':'')+'<small>'+esc(o.by||'')+' · '+esc(new Date(o.at).toLocaleDateString('ar-EG-u-nu-latn',{day:'numeric',month:'short'}))+' '+fmtT(o.at)+'</small></div>'+
      '<ul class="oi">'+(o.items||[]).map(i=>'<li>'+esc(itemTxt(i))+'</li>').join('')+'</ul>'+(o.fnote?'<small>رسالة المصنع: '+esc(o.fnote)+'</small>':'')+
      (o.sentAt?'<small>اتبعت بعد '+fmtDur((o.sentAt-o.at)/60000)+(o.doneAt?' · اتسلّم بعد '+fmtDur((o.doneAt-o.at)/60000):'')+'</small>':'')+'</article>').join(''):'<div class="empty">لسه مفيش طلبات.</div>');
}
function newDraft(){
  const c=O.cfg;const fl=c&&c.flavors&&c.flavors.length?c.flavors.map(f=>({id:f.id,name:f.name})):[];
  return {flavors:fl,pin:'',clearPin:false};
}
function tabOset(){
  const {S,esc,uid}=T();sub();
  if(!O.cfgOk)return '<div class="empty">جاري التحميل...</div>';
  if(!O.draft)O.draft=newDraft();
  const d=O.draft;
  const base=location.origin+location.pathname;
  const topic=O.cfg&&O.cfg.factoryTopic;
  return '<h2 style="font-size:1.3rem">الأطعمة والمصنع</h2>'+
    '<section class="sec"><h3>قايمة الأطعمة</h3><div class="muted" style="font-size:.9rem">كل طعم بيتطلب بحجمين: كبير وميني. اكتب الأسماء زي ما الفروع هتشوفها.</div>'+
    d.flavors.map((f,i)=>'<div class="line"><label class="f"><input class="inp" data-of="'+i+'" value="'+esc(f.name)+'" placeholder="اسم الطعم"></label><button class="btn sm bad" data-oa="fdel" data-i="'+i+'" aria-label="حذف">حذف</button></div>').join('')+
    '<div class="actions"><button class="btn" data-oa="fadd">+ طعم</button>'+(d.flavors.length?'':'<button class="btn" data-oa="fdef">حمّل أطعمة مقترحة</button>')+'</div></section>'+
    '<section class="sec"><h3>قفل شاشة المصنع (اختياري)</h3><label class="f">رقم سري من 4 أرقام<input id="f-newpin" class="inp num" inputmode="numeric" maxlength="4" autocomplete="off" value="'+esc(d.pin)+'" placeholder="'+(O.cfg&&O.cfg.pinHash?'فيه رقم محفوظ. اكتب جديد لو عايز تغيّره':'سيبه فاضي لو مش عايز قفل')+'"></label>'+
    (O.cfg&&O.cfg.pinHash?'<label class="f" style="flex-direction:row;align-items:center;gap:10px"><input type="checkbox" id="f-clr" style="width:20px;height:20px"'+(d.clearPin?' checked':'')+'> شيل القفل</label>':'')+'</section>'+
    '<div class="err" id="o-err"></div><div class="actions"><button class="btn pri" data-oa="osave" id="o-save">حفظ</button></div>'+
    '<section class="sec"><h3>روابط الشاشات</h3>'+
    '<div class="muted" style="font-size:.9rem">افتح كل رابط مرة واحدة على الجهاز المعني، وهو هيفتكر الشاشة. (تقدر ترجع للشاشة الرئيسية من الزر اللي تحت الصفحة)</div>'+
    '<label class="f">شاشة طلب الفرع (جهاز المحل)<input class="inp" readonly value="'+esc(base+'#order')+'" onfocus="this.select()"></label>'+
    '<label class="f">شاشة المصنع<input class="inp" readonly value="'+esc(base+'#factory')+'" onfocus="this.select()"></label></section>'+
    '<section class="sec"><h3>تنبيهات المصنع على الموبايل</h3>'+(topic?
      '<p style="margin:0">نزّل تطبيق <b>ntfy</b> على موبايل المصنع واشترك في الـ Topic ده:</p><div class="line"><label class="f"><input class="inp num" readonly dir="ltr" value="'+esc(topic)+'" onfocus="this.select()"></label><button class="btn sm" data-oa="ftest">تجربة</button></div>':
      '<p style="margin:0" class="muted">هيتعمل تلقائي أول ما تدوس "حفظ".</p>')+'</section>';
}
async function saveSet(){
  const {$,S,wr,toast,hashPin,newTopic,uid}=T();
  const err=m=>{const e=$('#o-err');if(e)e.textContent=m};
  const d=O.draft;
  const fl=d.flavors.map(f=>({id:f.id||uid('f'),name:String(f.name||'').trim()})).filter(f=>f.name);
  const seen=new Set();for(const f of fl){const k=f.name.toLowerCase();if(seen.has(k)){err('الطعم "'+f.name+'" متكرر');return}seen.add(k)}
  if(!fl.length){err('ضيف طعم واحد على الأقل');return}
  const pin=($('#f-newpin')||{}).value?$('#f-newpin').value.trim():'';
  if(pin&&!/^\d{4}$/.test(pin)){err('الرقم السري لازم يكون 4 أرقام');return}
  let pinHash=(O.cfg&&O.cfg.pinHash)||null;
  if(pin)pinHash=await hashPin('factory',pin);
  if($('#f-clr')&&$('#f-clr').checked&&!pin)pinHash=null;
  const data={flavors:fl,factoryTopic:(O.cfg&&O.cfg.factoryTopic)||newTopic().replace('thrills-','thrills-fac-'),pinHash,updatedAt:Date.now()};
  const b=$('#o-save');if(b)b.disabled=true;
  if(await wr(()=>S.db.doc('config/orders').set(data))){err('');O.cfg=Object.assign({},O.cfg,data);O.draft=null;toast('اتحفظ ✅');T().adminBody()}else if(b)b.disabled=false;
}

/* ---------- events ---------- */
document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-oa]');if(!el)return;
  unlock();const a=el.dataset.oa,{S,render:appRender,$,toast}=T();
  switch(a){
    case 'bump':bump(el.dataset.f,el.dataset.s,Number(el.dataset.d));break;
    case 'review':reviewModal();break;
    case 'send':await send();break;
    case 'status':await setStatus(el.dataset.id,el.dataset.to);break;
    case 'ftab':O.ftab=el.dataset.t;render();break;
    case 'msg':msgModal(el.dataset.id);break;
    case 'mq':{const t=$('#m-t');if(t)t.value=el.dataset.v}break;
    case 'snd':beep();render();break;
    case 'open-order':S.view='order';appRender();break;
    case 'home':
      try{localStorage.removeItem('thrills.mode')}catch(x){}
      S.view='kiosk';S.meMode=false;if(location.hash)history.replaceState(null,'',location.pathname+location.search);appRender();break;
    case 'funlock':{
      const v=($('#f-pin')||{}).value||'';const h=O.cfg&&O.cfg.pinHash;
      if(!/^\d{4}$/.test(v)){$('#f-err').textContent='اكتب 4 أرقام';break}
      if(await T().hashPin('factory',v)===h){try{localStorage.setItem('thrills.fpin',h)}catch(x){}render()}else $('#f-err').textContent='الرقم غلط';
    }break;
    case 'fadd':O.draft.flavors.push({id:T().uid('f'),name:''});T().adminBody();break;
    case 'fdel':O.draft.flavors.splice(Number(el.dataset.i),1);T().adminBody();break;
    case 'fdef':O.draft.flavors=DEFAULT_FLAVORS.map(n=>({id:T().uid('f'),name:n}));T().adminBody();break;
    case 'osave':await saveSet();break;
    case 'ftest':push('🔔 تجربة: تنبيهات المصنع شغالة',{priority:3,tag:'bell'});toast('اتبعتت تجربة');break;
  }
});
document.addEventListener('input',e=>{
  const t=e.target;
  if(t.id==='o-by'){O.by=t.value;return}
  if(t.id==='o-note'){O.note=t.value;return}
  if(t.id==='o-q'){O.q=t.value;fillFlavors();return}
  if(t.dataset&&t.dataset.of!=null&&O.draft){O.draft.flavors[Number(t.dataset.of)].name=t.value;return}
  if(t.id==='f-newpin'&&O.draft){O.draft.pin=t.value}
});
document.addEventListener('change',e=>{if(e.target.id==='o-urg')O.urgent=e.target.checked});
document.addEventListener('pointerdown',()=>{const {S}=T();if(S&&S.view==='factory')unlock()},true);
setInterval(()=>{const {S,$}=T()||{};if(S&&S.view==='factory'&&!document.hidden&&!(document.activeElement&&document.activeElement.id==='f-pin'))render()},60000);

window.ThrillsOrders={render,tabOrders,tabOset,resetDraft(){O.draft=null}};
})();
