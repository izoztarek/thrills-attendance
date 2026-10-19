(function(){
'use strict';
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const DAYS=['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const dkey=ms=>{const d=new Date(ms);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
const fromKey=k=>{const p=k.split('-').map(Number);return new Date(p[0],p[1]-1,p[2])};
const addDays=(k,n)=>{const d=fromKey(k);d.setDate(d.getDate()+n);return dkey(d.getTime())};
const atTime=(k,t)=>{const p=k.split('-').map(Number),q=t.split(':').map(Number);return new Date(p[0],p[1]-1,p[2],q[0],q[1]).getTime()};
const fmtT=ms=>{const d=new Date(ms);let h=d.getHours();const ap=h<12?'ص':'م';h=h%12||12;return h+':'+pad(d.getMinutes())+' '+ap};
const fmtHM=s=>{const p=s.split(':').map(Number);return ((p[0]%12)||12)+':'+pad(p[1])+' '+(p[0]<12?'ص':'م')};
const hm=ms=>{const d=new Date(ms);return pad(d.getHours())+':'+pad(d.getMinutes())};
const fmtDur=min=>{min=Math.round(min);const h=Math.floor(min/60),m=min%60;if(!h)return m+' د';return h+' س'+(m?' '+m+' د':'')};
const fmtDate=k=>{try{return fromKey(k).toLocaleDateString('ar-EG-u-nu-latn',{weekday:'long',day:'numeric',month:'long'})}catch(e){return k}};
const fmtDateY=k=>{try{return fromKey(k).toLocaleDateString('ar-EG-u-nu-latn',{day:'numeric',month:'short',year:'numeric'})}catch(e){return k}};
const norm=s=>String(s||'').toLowerCase().replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[ً-ْ]/g,'').trim();
const uid=p=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OPEN_MAX=16*3600e3;

async function hashPin(scope,pin){
  try{const enc=new TextEncoder();const k=await crypto.subtle.importKey('raw',enc.encode(pin),'PBKDF2',false,['deriveBits']);
    const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',iterations:60000,salt:enc.encode('thrills:'+scope)},k,256);
    return Array.from(new Uint8Array(bits)).map(x=>x.toString(16).padStart(2,'0')).join('')}
  catch(e){return 'p:'+scope+':'+pin}
}
function randPin(){const a=new Uint32Array(1);crypto.getRandomValues(a);return String(1000+(a[0]%9000))}
function offsetOf(inMs,start){
  if(!start)return null;const p=start.split(':').map(Number);const b=new Date(inMs);let best=null;
  for(const o of [-1,0,1]){const d=new Date(b.getFullYear(),b.getMonth(),b.getDate()+o,p[0],p[1]).getTime();const diff=(inMs-d)/60000;
    if(best===null||Math.abs(diff)<Math.abs(best))best=diff}
  return best;
}
function lateOf(inMs,start,grace){
  const b=offsetOf(inMs,start);if(b==null)return 0;
  return b>grace?Math.round(b):0;
}

const S={db:null,auth:null,fbUser:null,isAdmin:false,alerts:[],sent:new Set(),cfgErr:'',cfg:null,staff:[],att:[],attFrom:'',dayCache:{},
  loaded:{cfg:false,staff:false,att:false},view:'kiosk',tab:'today',branch:'all',search:'',
  adm:{until:0,keep:false,date:dkey(Date.now()),branch:'all'},rep:{from:'',to:'',branch:'all',recs:null,loading:false},draft:null,today:dkey(Date.now())};
try{const b=localStorage.getItem('thrills.branch');if(b)S.branch=b}catch(e){}
S.meMode=(location.hash==='#me');
try{if(S.meMode)localStorage.setItem('thrills.mode','me');else if(localStorage.getItem('thrills.mode')==='me')S.meMode=true}catch(e){}
S.me=null;S.meSearch='';S.meBusy=false;
try{S.me=localStorage.getItem('thrills.me')}catch(e){}

/* ---------- UI helpers ---------- */
let toastT;
function toast(msg){const t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{t.hidden=true},3500)}
function setApp(html){
  const a=document.activeElement,id=a&&a.id,ss=a&&a.selectionStart;
  $('#app').innerHTML=html;clockUpdate();
  if(id){const n=$('#app #'+CSS.escape(id));if(n){n.focus();try{if(ss!=null)n.setSelectionRange(ss,ss)}catch(e){}}}
}
let keyHandler=null,resultT=null;
function openModal(html,cls){
  const m=$('#modal');m.innerHTML='<div class="scrim" data-act="close"></div><div class="sheet '+(cls||'')+'" role="dialog" aria-modal="true">'+html+'</div>';m.hidden=false;
}
function closeModal(){
  const m=$('#modal');m.hidden=true;m.innerHTML='';m.onclick=null;
  if(keyHandler){document.removeEventListener('keydown',keyHandler);keyHandler=null}
  clearTimeout(resultT);
}
function errMsg(e){
  const c=e&&e.code;
  if(c==='permission-denied')return 'مفيش صلاحية لده. لو إنت المدير اعمل دخول تاني.';
  if(c==='resource-exhausted')return 'وصلنا للحد اليومي المجاني. جرب بعدين أو كلم المدير.';
  return 'حصلت مشكلة في الحفظ، جرب تاني.';
}
async function wr(fn){
  const attempt=()=>{
    const p=Promise.resolve().then(fn);p.catch(()=>{});
    const slow=new Promise(r=>setTimeout(()=>r('slow'),4000));
    return Promise.race([p.then(()=>'ok'),slow]).then(v=>{if(v==='slow')toast('مفيش نت دلوقتي. هيتسجل أول ما النت يرجع.');return true});
  };
  try{return await attempt()}catch(e){
    if(e&&e.code==='unavailable'){await sleep(700);try{return await attempt()}catch(e2){e=e2}}
    toast(errMsg(e));return false;
  }
}

/* ---------- data ---------- */
function mapDocs(q){return q.docs.map(d=>Object.assign({id:d.id},d.data()))}
let unsubAtt=null;
function subAtt(){
  if(unsubAtt)unsubAtt();
  S.today=dkey(Date.now());S.attFrom=addDays(S.today,-1);
  unsubAtt=S.db.collection('attendance').where('date','>=',S.attFrom).onSnapshot(q=>{S.att=mapDocs(q);S.loaded.att=true;inval('att')},()=>{S.loaded.att=true;inval('att')});
}
function recordsFor(k){
  if(k>=S.attFrom)return S.att.filter(r=>r.date===k);
  if(S.dayCache[k])return S.dayCache[k];
  S.dayCache[k]=[];
  S.db.collection('attendance').where('date','==',k).get().then(q=>{S.dayCache[k]=mapDocs(q);if(S.view==='admin'&&S.tab==='today')adminBody()}).catch(()=>{});
  return [];
}
const openRec=id=>S.att.filter(a=>a.staffId===id&&!a.outAt&&Date.now()-a.inAt<OPEN_MAX).sort((a,b)=>b.inAt-a.inAt)[0];
const lastClosedToday=id=>S.att.filter(a=>a.staffId===id&&a.outAt&&a.date===S.today).sort((a,b)=>b.outAt-a.outAt)[0];
const brName=id=>{const b=(S.cfg.branches||[]).find(x=>x.id===id);return b?b.name:''};
const shiftOf=id=>(S.cfg.shifts||[]).find(x=>x.id===id);
const shiftPassed=st=>{const sh=shiftOf(st.shift);if(!sh)return true;return Date.now()>atTime(S.today,sh.start)+(S.cfg.grace||0)*60000};
const devBranch=st=>S.branch!=='all'?S.branch:st.branch;

/* ---------- render ---------- */
function inval(kind){
  if(!S.loaded.cfg)return;
  if(S.view==='kiosk'){if(kind==='cfg')render();else fillGrid()}
  else if(S.view==='me')render();
  else if(S.view==='admin'){
    const deps={today:['cfg','staff','att'],report:['cfg','staff'],staff:['cfg','staff'],alerts:['alerts','cfg'],settings:[]}[S.tab]||[];
    if(deps.indexOf(kind)>=0)adminBody();
  }
}
function render(){
  if(!S.db){setApp(head()+'<div class="empty">'+esc(S.cfgErr||'جاري التحميل...')+'</div>');return}
  if(!S.loaded.cfg){setApp(head()+'<div class="grid"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>');return}
  if(!S.cfg&&S.cfgErr){setApp(head()+'<div class="empty">'+esc(S.cfgErr)+'</div>');return}
  if(!S.cfg){
    if(!S.draft)S.draft=newDraft();
    setApp(head()+setupHTML());return;
  }
  if(S.meMode){S.view='me';meRender();return}
  if(S.view==='admin'&&S.isAdmin){
    setApp(head(true)+'<nav class="tabs" role="tablist">'+[['today','اليوم'],['report','التقارير'],['staff','الموظفين'],['alerts','التنبيهات'],['settings','الإعدادات']].map(t=>
      '<button class="tab" role="tab" data-act="tab" data-t="'+t[0]+'" aria-selected="'+(S.tab===t[0])+'">'+t[1]+'</button>').join('')+'</nav><main class="panel" id="abody"></main>');
    adminBody();return;
  }
  S.view='kiosk';
  const brs=S.cfg.branches||[];
  if(S.branch!=='all'&&!brs.some(b=>b.id===S.branch))S.branch='all';
  const chips=brs.length>1?'<div class="chips" role="group" aria-label="الفرع">'+
    ['all'].concat(brs.map(b=>b.id)).map(id=>'<button class="chip" data-act="chip" data-b="'+esc(id)+'" aria-pressed="'+(S.branch===id)+'">'+(id==='all'?'كل الفروع':esc(brName(id)))+'</button>').join('')+'</div>':'<span></span>';
  setApp(head()+'<div class="bar">'+chips+'<label class="search"><input id="q" class="inp" type="search" placeholder="دوّر على اسمك" autocomplete="off" value="'+esc(S.search)+'"></label></div>'+
    '<div class="grid" id="grid"></div><div class="foot"><span id="presence"></span><span>'+(isStandalone()?'':'<button class="linkbtn" data-act="install">ثبّت التطبيق</button> ')+'<button class="linkbtn" data-act="admin-login">دخول المدير</button></span></div>');
  fillGrid();tick();
}
function head(admin){
  return '<header class="top"><div class="brand"><span class="logo">Thrills</span><span class="sub">'+(admin?'لوحة المدير':'الحضور والانصراف')+'</span></div>'+
    (admin?'<button class="btn" data-act="logout">خروج</button>':'<div class="clock"><b id="clk"></b><span id="dt"></span></div>')+'</header>';
}
function clockUpdate(){
  const c=$('#clk');if(c){const n=new Date();c.textContent=fmtT(n.getTime());$('#dt').textContent=fmtDate(dkey(n.getTime()))}
}
/* ---------- personal mode (one big button) ---------- */
function meRender(){
  if(!S.loaded.staff){setApp(head()+'<div class="grid"><div class="skeleton"></div><div class="skeleton"></div></div>');return}
  const st=S.staff.find(x=>x.id===S.me&&x.active!==false);
  if(!st){
    setApp(head()+'<main class="me"><h2>إنت مين؟</h2><small>اختار اسمك مرة واحدة والموبايل هيفتكرك بعد كده.</small>'+
      '<label class="search" style="max-width:none"><input id="mq" class="inp" type="search" placeholder="دوّر على اسمك" autocomplete="off" value="'+esc(S.meSearch)+'"></label>'+
      '<div class="grid" id="melist"></div></main>');
    meFill();return;
  }
  const o=openRec(st.id),sh=shiftOf(st.shift),first=st.name.split(' ')[0];
  const todays=S.att.filter(a=>a.staffId===st.id&&a.date===S.today).sort((a,b)=>a.inAt-b.inAt);
  setApp(head()+'<main class="me"><div class="mehello"><span class="av">'+esc(Array.from(st.name)[0]||'؟')+'</span><div><h2>'+(new Date().getHours()<12?'صباح الخير':'مساء الخير')+' يا '+esc(first)+'</h2><small>'+
    esc([brName(st.branch),sh?'شيفت '+sh.name+' من '+fmtHM(sh.start):''].filter(Boolean).join(' · '))+'</small></div></div>'+
    '<button class="bigbtn'+(o?' out':'')+'" data-act="me-go"><span class="bt">'+(o?'انصرفني':'حضّرني')+'</span><span class="bs" id="me-sub"></span></button>'+
    '<section class="sec"><h3>النهارده</h3>'+(todays.length?todays.map(r=>'<div class="item" style="border:0;padding:4px 0"><span class="num">'+fmtT(r.inAt)+' ← '+(r.outAt?fmtT(r.outAt):'لسه')+'</span>'+
      (r.outAt?'<small>'+fmtDur((r.outAt-r.inAt)/60000)+'</small>':'')+(r.lateMin>0?'<span class="pill warn">متأخر '+fmtDur(r.lateMin)+'</span>':'')+'</div>').join(''):'<small>لسه ماسجلتش حضور النهارده.</small>')+'</section>'+
    '<div class="foot"><button class="linkbtn" data-act="me-unbind">مش '+esc(first)+'؟ غيّر الاسم</button><button class="linkbtn" data-act="go-kiosk">شاشة الكاشير</button></div></main>');
  meLive();
}
function meFill(){
  const g=$('#melist');if(!g)return;const q=norm(S.meSearch);
  const list=S.staff.filter(s=>s.active!==false&&(!q||norm(s.name).includes(q))).sort((a,b)=>a.name.localeCompare(b.name,'ar'));
  g.innerHTML=list.length?list.map(s=>'<button class="tile" data-act="me-pick" data-id="'+esc(s.id)+'"><span class="av">'+esc(Array.from(s.name)[0]||'؟')+'</span><span class="tname">'+esc(s.name)+'</span><span class="tst">'+esc(brName(s.branch))+'</span></button>').join(''):
    '<div class="empty">'+(S.staff.length?'مفيش حد بالاسم ده.':'المدير لسه ماضافش موظفين.')+'</div>';
}
function meLive(){
  const sub=$('#me-sub');if(!sub||S.view!=='me')return;
  const o=openRec(S.me),now=Date.now();
  sub.textContent=o?('حاضر من '+fmtT(o.inAt)+' · بقالك '+fmtDur((now-o.inAt)/60000)):('هتتسجل الساعة '+fmtT(now));
}
function mePick(id){
  const st=S.staff.find(x=>x.id===id);if(!st)return;
  openPin({key:id,name:st.name,title:'ده إنت؟',hint:'اكتب رقمك السري عشان الموبايل يفتكرك',
    verify:p=>hashPin(st.id,p).then(h=>h===st.pinHash),onOk:()=>{S.me=id;try{localStorage.setItem('thrills.me',id)}catch(e){}render()}});
}
async function meGo(){
  const st=S.staff.find(x=>x.id===S.me);if(!st||S.meBusy)return;
  S.meBusy=true;try{await doAction(st)}finally{S.meBusy=false}
}

function tick(){
  clockUpdate();
  if(S.view==='me')meLive();
  if(dkey(Date.now())!==S.today&&S.db){subAtt()}
  if(S.view==='admin'&&S.isAdmin&&!S.adm.keep&&Date.now()>=S.adm.until)logout();
}
function fillGrid(){
  const g=$('#grid');if(!g||!S.cfg)return;
  const q=norm(S.search),b=S.branch;
  const inBr=s=>b==='all'||s.branch===b;
  const list=S.staff.filter(s=>s.active!==false&&inBr(s)&&(!q||norm(s.name).includes(q))).sort((x,y)=>x.name.localeCompare(y.name,'ar'));
  const n=S.staff.filter(s=>s.active!==false&&inBr(s)&&openRec(s.id)).length;
  const p=$('#presence');if(p)p.textContent=n?('حاضرين دلوقتي: '+n):'';
  g.innerHTML=list.length?list.map(s=>{
    const o=openRec(s.id),l=lastClosedToday(s.id);let cls='',txt='لسه ماسجلش حضور';
    if(o){cls='in';txt='حاضر من '+fmtT(o.inAt)}else if(l){txt='انصرف '+fmtT(l.outAt)}
    return '<button class="tile '+cls+'" data-act="pick" data-id="'+esc(s.id)+'"><span class="av">'+esc(Array.from(s.name)[0]||'؟')+'</span><span class="tname">'+esc(s.name)+'</span><span class="tst num">'+txt+'</span></button>';
  }).join(''):'<div class="empty">'+(S.staff.length?'مفيش حد بالاسم ده.':'لسه مفيش موظفين. المدير يضيفهم من "دخول المدير".')+'</div>';
}

/* ---------- PIN pad ---------- */
const fails={};
function openPin(o){
  let pin='',busy=false;
  const key=o.key||'x';
  openModal('<div class="pinhead">'+(o.name?'<span class="av">'+esc(Array.from(o.name)[0])+'</span><b style="font-size:1.2rem">'+esc(o.name)+'</b>':'')+
    '<h2>'+esc(o.title)+'</h2><small>'+esc(o.hint||'اكتب رقمك السري')+'</small></div><div class="dots" id="dots"></div><div class="err" id="perr"></div>'+
    '<div class="pad">'+[1,2,3,4,5,6,7,8,9].map(n=>'<button class="key" data-k="'+n+'">'+n+'</button>').join('')+
    '<button class="key sm" data-act="close">إلغاء</button><button class="key" data-k="0">0</button><button class="key sm" data-k="del" aria-label="مسح رقم">مسح</button></div>');
  const paint=()=>{$('#dots').innerHTML=[0,1,2,3].map(i=>'<span class="dot'+(i<pin.length?' on':'')+'"></span>').join('')};
  paint();
  async function press(k){
    if(busy)return;
    const f=fails[key]||{n:0,until:0};
    if(Date.now()<f.until){$('#perr').textContent='استنى '+Math.ceil((f.until-Date.now())/1000)+' ثانية وحاول تاني';return}
    if(k==='del')pin=pin.slice(0,-1);else if(pin.length<4)pin+=k;
    $('#perr').textContent='';paint();
    if(pin.length===4){
      busy=true;
      let ok=false;try{ok=await o.verify(pin)}catch(e){}
      if(ok){fails[key]={n:0,until:0};closeModal();o.onOk()}
      else{
        f.n++;if(f.n>=5){f.until=Date.now()+30000;f.n=0}fails[key]=f;
        pin='';paint();$('#perr').textContent='الرقم غلط';
        const d=$('#dots');d.classList.remove('shake');void d.offsetWidth;d.classList.add('shake');busy=false;
      }
    }
  }
  $('#modal').onclick=e=>{const b=e.target.closest('[data-k]');if(b)press(b.dataset.k)};
  keyHandler=e=>{if(/^[0-9]$/.test(e.key))press(e.key);else if(e.key==='Backspace')press('del');else if(e.key==='Escape')closeModal()};
  document.addEventListener('keydown',keyHandler);
}

/* ---------- check in / out ---------- */
function pick(id){
  const st=S.staff.find(x=>x.id===id);if(!st)return;
  const o=openRec(id);
  openPin({key:id,name:st.name,title:o?'سجّل انصرافك':'سجّل حضورك',hint:o?'حاضر من '+fmtT(o.inAt)+'. اكتب رقمك السري':'اكتب رقمك السري',
    verify:p=>hashPin(st.id,p).then(h=>h===st.pinHash),onOk:()=>doAction(st)});
}
async function doAction(st){
  if(!S.loaded.att){toast('استنى ثانية والنظام يحمّل');return}
  const o=openRec(st.id);
  if(o){
    const outAt=Date.now(),ref=S.db.doc('attendance/'+o.id);
    if(!(await wr(()=>ref.update({outAt}))))return showResult({kind:'err'});
    return showResult({kind:'out',st,rec:o,outAt,undo:()=>ref.update({outAt:null})});
  }
  const inAt=Date.now(),sh=shiftOf(st.shift),start=sh?sh.start:null;
  const rec={staffId:st.id,name:st.name,branch:devBranch(st),date:dkey(inAt),inAt,outAt:null,shiftId:st.shift||null,shiftStart:start,lateMin:lateOf(inAt,start,S.cfg.grace||0),manual:false,ts:firebase.firestore.FieldValue.serverTimestamp()};
  const ref=S.db.doc('attendance/'+st.id+'_'+inAt);
  if(!(await wr(()=>ref.set(rec))))return showResult({kind:'err'});
  showResult({kind:'in',st,rec,undo:()=>ref.delete()});
  afterIn(st,rec);
}
const CHECK='<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const WAVE='<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';
const CROSS='<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
function showResult(r){
  let body;
  if(r.kind==='err'){
    body='<div class="ic err">'+CROSS+'</div><h2>مااتسجلش</h2><p class="muted">حصلت مشكلة في الحفظ. جرب تاني.</p><button class="btn pri" data-act="close">تمام</button>';
  }else{
    const first=r.st.name.split(' ')[0];
    if(r.kind==='in'){
      const sh=shiftOf(r.st.shift),late=r.rec.lateMin;
      body='<div class="ic">'+CHECK+'</div><h2>'+(new Date().getHours()<12?'صباح الخير':'مساء الخير')+' يا '+esc(first)+'</h2>'+
        '<p>حضورك اتسجل الساعة <b class="num">'+fmtT(r.rec.inAt)+'</b></p>'+
        (late?'<span class="pill warn">متأخر '+fmtDur(late)+'</span>':'<span class="pill ok">في الميعاد</span>')+
        (sh?'<small>شيفت '+esc(sh.name)+' من '+fmtHM(sh.start)+'</small>':'');
    }else{
      body='<div class="ic out">'+WAVE+'</div><h2>مع السلامة يا '+esc(first)+'</h2><p>انصرافك اتسجل الساعة <b class="num">'+fmtT(r.outAt)+'</b></p>'+
        '<span class="pill">اشتغلت '+fmtDur((r.outAt-r.rec.inAt)/60000)+'</span>';
    }
    body+='<div class="actions" style="justify-content:center"><button class="btn pri" data-act="close">تمام</button><button class="btn" id="undo">غلطت؟ تراجع</button></div><div class="bar-t"><i></i></div>';
  }
  openModal('<div class="result">'+body+'</div>');
  const u=$('#undo');
  if(u)u.onclick=async()=>{u.disabled=true;if(await wr(r.undo)){closeModal();toast('اتلغى التسجيل')}else u.disabled=false};
  if(r.kind!=='err')resultT=setTimeout(closeModal,9000);
}

/* ---------- admin ---------- */
/* ---------- admin auth ---------- */
const isStandalone=()=>{try{return window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true}catch(e){return false}};
function enterAdmin(){S.view='admin';S.tab='today';S.adm.until=Date.now()+5*60000;S.adm.date=S.today;S.adm.branch='all';render()}
function logout(){
  S.view='kiosk';S.draft=null;S.isAdmin=false;closeModal();
  try{localStorage.removeItem('thrills.keep')}catch(e){}
  if(S.auth)S.auth.signOut().catch(()=>{});
  render();
}
function authMsg(e){
  const c=e&&e.code||'';
  if(/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c))return 'الإيميل أو الباسورد غلط';
  if(c==='auth/too-many-requests')return 'محاولات كتير. استنى شوية وجرب تاني.';
  if(c==='auth/network-request-failed')return 'مفيش نت. جرب تاني.';
  if(c==='auth/operation-not-allowed')return 'تسجيل الدخول بالإيميل مش مفعّل في Firebase. راجع خطوات README.';
  if(c==='auth/email-already-in-use')return 'الإيميل ده مستخدم قبل كده.';
  if(c==='auth/weak-password')return 'الباسورد ضعيف. استخدم 8 حروف أو أكتر.';
  if(c==='auth/invalid-email')return 'الإيميل مكتوب غلط.';
  return 'حصلت مشكلة. جرب تاني.';
}
function adminLogin(){
  if(S.isAdmin){enterAdmin();return}
  openModal('<h2>دخول المدير</h2><form id="lf" style="display:flex;flex-direction:column;gap:12px">'+
    '<label class="f">الإيميل<input id="l-em" class="inp" type="email" autocomplete="username" inputmode="email" dir="ltr" required></label>'+
    '<label class="f">الباسورد<input id="l-pw" class="inp" type="password" autocomplete="current-password" dir="ltr" required></label>'+
    '<label class="f" style="flex-direction:row;align-items:center;gap:10px"><input id="l-keep" type="checkbox" style="width:20px;height:20px"> فضّلني داخل على الجهاز ده <small>(مناسب لموبايلك إنت بس)</small></label>'+
    '<div class="err" id="l-err"></div><div class="actions"><button class="btn pri" id="l-go" type="submit">دخول</button><button class="btn" type="button" data-act="close">إلغاء</button>'+
    '<button class="linkbtn" type="button" id="l-rs">نسيت الباسورد</button></div></form>');
  const err=m=>{const e=$('#l-err');if(e)e.textContent=m};
  $('#l-rs').onclick=async()=>{
    const em=$('#l-em').value.trim();if(!em){err('اكتب الإيميل الأول');return}
    try{await S.auth.sendPasswordResetEmail(em);err('');toast('لو الإيميل ده هو المدير هيوصله لينك تغيير الباسورد')}catch(e){err(authMsg(e))}
  };
  $('#lf').onsubmit=async ev=>{
    ev.preventDefault();const em=$('#l-em').value.trim(),pw=$('#l-pw').value,keep=$('#l-keep').checked;
    $('#l-go').disabled=true;err('');
    try{
      await S.auth.setPersistence(keep?firebase.auth.Auth.Persistence.LOCAL:firebase.auth.Auth.Persistence.SESSION);
      const cred=await S.auth.signInWithEmailAndPassword(em,pw);
      const d=await S.db.doc('admins/'+cred.user.uid).get();
      if(!d.exists){await S.auth.signOut();err('الحساب ده مش حساب المدير');$('#l-go').disabled=false;return}
      S.isAdmin=true;S.adm.keep=keep;try{keep?localStorage.setItem('thrills.keep','1'):localStorage.removeItem('thrills.keep')}catch(e){}
      subAlerts();closeModal();enterAdmin();
    }catch(e){err(authMsg(e));$('#l-go').disabled=false}
  };
}
function resetPw(){
  const em=S.fbUser&&S.fbUser.email;if(!em)return;
  S.auth.sendPasswordResetEmail(em).then(()=>toast('بعتنا لينك تغيير الباسورد على '+em)).catch(e=>toast(authMsg(e)));
}
let unsubAlerts=null;
function subAlerts(){
  if(unsubAlerts||!S.db)return;
  unsubAlerts=S.db.collection('alerts').orderBy('ts','desc').limit(60).onSnapshot(q=>{S.alerts=mapDocs(q);inval('alerts')},()=>{});
}
let deferredPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e});
function installApp(){
  if(deferredPrompt){deferredPrompt.prompt();deferredPrompt=null;return}
  if(isStandalone()){toast('التطبيق متثبّت بالفعل');return}
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent);
  openModal('<h2>تثبيت التطبيق</h2><p style="margin:0">'+(ios?'من Safari: اضغط زر المشاركة (المربع اللي فيه سهم لفوق) ثم اختار "Add to Home Screen" (إضافة إلى الشاشة الرئيسية).':'من قايمة المتصفح (النقط الثلاث): اختار "Install app" أو "Add to Home screen" (تثبيت التطبيق).')+'</p><div class="actions"><button class="btn pri" data-act="close">تمام</button></div>');
}

/* ---------- alerts (push to manager through ntfy.sh) ---------- */
function newTopic(){const a=new Uint8Array(12);crypto.getRandomValues(a);return 'thrills-'+Array.from(a).map(x=>(x%36).toString(36)).join('')}
function push(msg,kind){
  const t=S.cfg&&S.cfg.ntfyTopic;if(!t)return;
  const tags={late:'alarm_clock',early:'star',absent:'no_entry',forgot:'warning',test:'bell'}[kind]||'bell';
  const pr={absent:4,late:3,forgot:4,early:2,test:3}[kind]||3;
  try{fetch('https://ntfy.sh/',{method:'POST',body:JSON.stringify({topic:t,title:'Thrills - الحضور',message:msg,priority:pr,tags:[tags]})}).catch(()=>{})}catch(e){}
}
async function claimAlert(id,kind,st,msg){
  if(!S.db||!S.cfg||S.sent.has(id))return false;
  S.sent.add(id);
  const ref=S.db.doc('alerts/'+id);
  const data={kind,staffId:st?st.id:'',name:st?st.name:'',branch:st&&st.branch?st.branch:'',msg,date:dkey(Date.now()),ts:firebase.firestore.FieldValue.serverTimestamp()};
  try{
    if(S.isAdmin){const s=await ref.get();if(s.exists)return false}
    await Promise.race([ref.set(data),new Promise((_,rj)=>setTimeout(()=>rj({code:'slow'}),6000))]);
  }catch(e){return false}
  push(msg,kind);return true;
}
function afterIn(st,rec){
  if(!S.cfg||!S.cfg.ntfyTopic)return;
  const on=S.cfg.alertOn||{},sh=shiftOf(st.shift),id=st.id+'_'+rec.inAt,where=brName(rec.branch||st.branch);
  const off=sh?offsetOf(rec.inAt,sh.start):null;if(off==null)return;
  const early=S.cfg.earlyMin==null?30:S.cfg.earlyMin;
  if(rec.lateMin>0){if(on.late!==false)claimAlert('late_'+id,'late',st,'⏰ '+st.name+' اتأخر '+fmtDur(rec.lateMin)+(where?' ('+where+')':'')+' - حضر '+fmtT(rec.inAt))}
  else if(-off>=early&&early>0){if(on.early!==false)claimAlert('early_'+id,'early',st,'⭐ '+st.name+' حضر بدري '+fmtDur(-off)+(where?' ('+where+')':'')+' - الساعة '+fmtT(rec.inAt))}
}
function sweep(){
  if(!S.db||!S.cfg||!S.cfg.ntfyTopic||!S.loaded.staff||!S.loaded.att)return;
  const on=S.cfg.alertOn||{},now=Date.now(),today=S.today,wd=fromKey(today).getDay();
  const absAfter=(S.cfg.absentAfter==null?60:S.cfg.absentAfter)*60000,fg=(S.cfg.forgotHours==null?12:S.cfg.forgotHours)*3600e3;
  S.staff.forEach(st=>{
    if(st.active===false)return;
    const sh=shiftOf(st.shift),where=brName(st.branch);
    if(on.absent!==false&&sh&&st.dayOff!==wd){
      const start=atTime(today,sh.start);
      if(now>=start+absAfter&&now<start+14*3600e3&&(st.createdAt||0)<start&&!S.att.some(r=>r.staffId===st.id&&r.inAt>=start-4*3600e3))
        claimAlert('absent_'+st.id+'_'+today,'absent',st,'🚫 '+st.name+' لسه ماحضرش'+(where?' ('+where+')':'')+' - شيفت '+sh.name+' بدأ '+fmtHM(sh.start));
    }
    if(on.forgot!==false){
      const o=S.att.find(r=>r.staffId===st.id&&!r.outAt&&now-r.inAt>=fg);
      if(o)claimAlert('forgot_'+o.id,'forgot',st,'⚠️ '+st.name+' مسجل حضور من '+fmtT(o.inAt)+' وماسجلش انصراف'+(where?' ('+where+')':''));
    }
  });
}
function clockFlag(r){
  try{const t=r.ts&&r.ts.toMillis&&r.ts.toMillis();if(t&&!r.manual&&Math.abs(t-r.inAt)>10*60000)return '<span class="pill warn" title="وقت الجهاز مختلف عن وقت السيرفر">⚠ وقت الجهاز</span>'}catch(e){}
  return '';
}
async function testAlert(){
  if(!S.cfg||!S.cfg.ntfyTopic){toast('احفظ الإعدادات الأول');return}
  const ok=await claimAlert('test_'+Date.now(),'test',null,'🔔 تجربة: التنبيهات شغالة تمام ✅');
  toast(ok?'اتبعت تنبيه تجربة. شوفه على موبايلك':'مقدرتش أبعت التنبيه');
}
function copyTopic(){
  const t=S.cfg&&S.cfg.ntfyTopic;if(!t)return;
  (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>toast('اتنسخ: '+t)).catch(()=>toast('الاسم: '+t));
}
const ALERT_KINDS={late:['متأخر','warn'],early:['حضر بدري','ok'],absent:['غياب','bad'],forgot:['نسي الانصراف','warn'],test:['تجربة','']};
function tabAlerts(){
  const t=S.cfg.ntfyTopic||'';
  return '<h2 style="font-size:1.3rem">التنبيهات</h2>'+
    '<section class="sec"><h3>استلم التنبيهات على موبايلك</h3><small>1) نزّل تطبيق <b dir="ltr">ntfy</b> (مجاني) من Google Play أو App Store.<br>2) افتحه واضغط + ثم اكتب اسم الـ Topic ده بالظبط:</small>'+
    '<div class="num" dir="ltr" style="font-family:var(--f-display);font-size:1.15rem;overflow-wrap:anywhere">'+esc(t||'—')+'</div>'+
    '<div class="actions"><button class="btn sm" data-act="copy-topic">نسخ اسم الـ Topic</button><button class="btn sm pri" data-act="test-alert">ابعت تنبيه تجربة</button></div>'+
    '<small>التنبيهات بتتبعت وقت ما حد يسجل (تأخير / حضور بدري). تنبيه الغياب ونسيان الانصراف بيتحسب من أي جهاز مفتوح عليه التطبيق (غالباً تاب الكاشير)، فسيبه مفتوح أثناء ساعات الشغل.</small></section>'+
    '<h3>آخر التنبيهات</h3><div class="list">'+(S.alerts.length?S.alerts.map(a=>{
      const k=ALERT_KINDS[a.kind]||[a.kind,''],ms=a.ts&&a.ts.toMillis?a.ts.toMillis():null;
      return '<article class="item"><span class="pill '+k[1]+'">'+esc(k[0])+'</span><div style="flex:1 1 220px"><b>'+esc(a.msg)+'</b></div><small class="num">'+(ms?esc(fmtDateY(dkey(ms)))+' '+fmtT(ms):'')+'</small></article>';
    }).join(''):'<div class="empty">مفيش تنبيهات لسه.</div>')+'</div>';
}

function adminBody(){
  const el=$('#abody');if(!el)return;
  el.innerHTML={today:tabToday,report:tabReport,staff:tabStaff,alerts:tabAlerts,settings:tabSettings}[S.tab]();
}
function branchChips(cur,act){
  const brs=S.cfg.branches||[];if(brs.length<2)return '';
  return '<div class="chips">'+['all'].concat(brs.map(b=>b.id)).map(id=>'<button class="chip" data-act="'+act+'" data-b="'+esc(id)+'" aria-pressed="'+(cur===id)+'">'+(id==='all'?'كل الفروع':esc(brName(id)))+'</button>').join('')+'</div>';
}
function dayStatus(st,rs,k){
  if(rs.length)return rs.some(r=>!r.outAt&&Date.now()-r.inAt<OPEN_MAX)?'in':'done';
  if(k>S.today)return 'future';
  if(st.dayOff===fromKey(k).getDay())return 'off';
  if(k===S.today&&!shiftPassed(st))return 'wait';
  return 'absent';
}
function tabToday(){
  const k=S.adm.date,recs=recordsFor(k);
  const staff=S.staff.filter(s=>s.active!==false&&(S.adm.branch==='all'||s.branch===S.adm.branch)).sort((a,b)=>a.name.localeCompare(b.name,'ar'));
  const rows=staff.map(st=>{const rs=recs.filter(r=>r.staffId===st.id).sort((a,b)=>a.inAt-b.inAt);return{st,rs,status:dayStatus(st,rs,k)}});
  const ids=new Set(staff.map(s=>s.id));
  recs.filter(r=>!ids.has(r.staffId)&&(S.adm.branch==='all'||r.branch===S.adm.branch)).forEach(r=>{
    let row=rows.find(x=>x.st.id===r.staffId);
    if(!row){row={st:{id:r.staffId,name:r.name,branch:r.branch,orphan:true},rs:[],status:'done'};rows.push(row)}row.rs.push(r)});
  const c={in:0,done:0,late:0,absent:0};
  rows.forEach(x=>{if(x.status==='in')c.in++;if(x.status==='done')c.done++;if(x.status==='absent')c.absent++;if(x.rs[0]&&x.rs[0].lateMin>0)c.late++});
  const order={in:0,done:1,absent:2,wait:3,off:4,future:5};
  rows.sort((a,b)=>(order[a.status]-order[b.status])||a.st.name.localeCompare(b.st.name,'ar'));
  const pill=x=>({in:'<span class="pill ok">جوه دلوقتي</span>',done:'<span class="pill">خلّص</span>',absent:'<span class="pill bad">غايب</span>',
    wait:'<span class="pill">لسه ميعاده ماجاش</span>',off:'<span class="pill">إجازة</span>',future:'<span class="pill">—</span>'}[x.status]);
  return '<div class="ctrl"><button class="btn sm" data-act="d-prev">اليوم اللي قبله</button><label class="f" style="flex:0 1 170px"><input id="adate" class="inp" type="date" value="'+k+'"></label>'+
    '<button class="btn sm" data-act="d-next">اليوم اللي بعده</button>'+(k!==S.today?'<button class="btn sm" data-act="d-today">النهارده</button>':'')+
    '<button class="btn sm pri" data-act="rec-new" style="margin-inline-start:auto">+ تسجيل يدوي</button></div>'+
    '<h2 style="font-size:1.3rem">'+esc(fmtDate(k))+'</h2>'+branchChips(S.adm.branch,'a-chip')+
    '<div class="tiles"><div class="stat ok"><b class="num">'+c.in+'</b><span>جوه دلوقتي</span></div><div class="stat"><b class="num">'+c.done+'</b><span>خلصوا</span></div>'+
    '<div class="stat warn"><b class="num">'+c.late+'</b><span>متأخرين</span></div><div class="stat bad"><b class="num">'+c.absent+'</b><span>غايبين</span></div></div>'+
    '<div class="list">'+(rows.length?rows.map(x=>{
      const st=x.st,sh=shiftOf(st.shift);
      return '<article class="item"><div class="who"><span class="av">'+esc(Array.from(st.name)[0]||'؟')+'</span><div><b>'+esc(st.name)+'</b><small>'+
        esc([brName(st.branch),sh?sh.name+' '+fmtHM(sh.start):''].filter(Boolean).join(' · '))+'</small></div></div><div class="st">'+pill(x)+'</div><div class="tm">'+
        (x.rs.length?x.rs.map(r=>'<div><span>'+fmtT(r.inAt)+' ← '+(r.outAt?fmtT(r.outAt):(Date.now()-r.inAt>=OPEN_MAX?'<span class="pill bad">نسي الانصراف</span>':'لسه'))+'</span>'+
          (r.outAt?'<small>'+fmtDur((r.outAt-r.inAt)/60000)+'</small>':'')+(r.lateMin>0?'<span class="pill warn">متأخر '+fmtDur(r.lateMin)+'</span>':'')+
          (r.manual?'<small>(يدوي)</small>':'')+clockFlag(r)+'<button class="btn sm" data-act="rec-edit" data-id="'+esc(r.id)+'">تعديل</button></div>').join(''):
          (st.orphan?'':'<div><button class="btn sm" data-act="rec-new" data-staff="'+esc(st.id)+'">سجّل يدوي</button></div>'))+'</div></article>';
    }).join(''):'<div class="empty">مفيش موظفين متسجلين لسه. ضيفهم من تبويب "الموظفين".</div>')+'</div>';
}

/* records */
function recModal(rec,staffId){
  const isNew=!rec;
  const st=rec?(S.staff.find(x=>x.id===rec.staffId)||{id:rec.staffId,name:rec.name}):S.staff.find(x=>x.id===staffId);
  const date=rec?rec.date:S.adm.date;
  const active=S.staff.filter(s=>s.active!==false).sort((a,b)=>a.name.localeCompare(b.name,'ar'));
  if(isNew&&!active.length){toast('ضيف موظفين الأول من تبويب "الموظفين"');return}
  openModal('<h2>'+(isNew?'تسجيل يدوي':'تعديل التسجيل')+'</h2>'+
    (isNew?'<label class="f">الموظف<select id="r-st" class="inp">'+active.map(s=>'<option value="'+esc(s.id)+'"'+(st&&st.id===s.id?' selected':'')+'>'+esc(s.name)+'</option>').join('')+'</select></label>':
      '<b style="font-size:1.1rem">'+esc(st.name)+'</b>')+
    '<label class="f">التاريخ<input id="r-date" class="inp" type="date" value="'+date+'"></label>'+
    '<div class="row2"><label class="f">وقت الحضور<input id="r-in" class="inp" type="time" value="'+(rec?hm(rec.inAt):'')+'"></label>'+
    '<label class="f">وقت الانصراف<input id="r-out" class="inp" type="time" value="'+(rec&&rec.outAt?hm(rec.outAt):'')+'"><small>سيبه فاضي لو لسه جوه</small></label></div>'+
    '<div class="err" id="r-err"></div><div class="actions"><button class="btn pri" id="r-save">حفظ</button><button class="btn" data-act="close">إلغاء</button>'+
    (isNew?'':'<button class="btn bad" id="r-del" style="margin-inline-start:auto">حذف</button>')+'</div>');
  $('#r-save').onclick=async()=>{
    const d=$('#r-date').value,ti=$('#r-in').value,to=$('#r-out').value;
    if(!d||!ti){$('#r-err').textContent='اكتب التاريخ ووقت الحضور';return}
    const sid=isNew?$('#r-st').value:rec.staffId;const s=S.staff.find(x=>x.id===sid)||st;
    if(!s){$('#r-err').textContent='اختار الموظف';return}
    const inAt=atTime(d,ti);let outAt=null;if(to){outAt=atTime(d,to);if(outAt<=inAt)outAt+=864e5}
    const sh=shiftOf(s.shift),start=sh?sh.start:(rec?rec.shiftStart:null);
    const data={staffId:sid,name:s.name,branch:rec?rec.branch:s.branch,date:d,inAt,outAt,shiftId:s.shift||null,shiftStart:start||null,lateMin:lateOf(inAt,start,S.cfg.grace||0),manual:true};
    const id=isNew?sid+'_'+inAt:rec.id;
    $('#r-save').disabled=true;
    if(await wr(()=>S.db.doc('attendance/'+id).set(data))){S.dayCache={};closeModal();adminBody();toast('اتحفظ')}else $('#r-save').disabled=false;
  };
  const del=$('#r-del');
  if(del)del.onclick=async()=>{
    if(del.dataset.sure!=='1'){del.dataset.sure='1';del.textContent='اضغط تاني للتأكيد';return}
    if(await wr(()=>S.db.doc('attendance/'+rec.id).delete())){S.dayCache={};closeModal();adminBody();toast('اتحذف')}
  };
}

/* reports */
function weekStart(k){const d=fromKey(k);return addDays(k,-((d.getDay()+1)%7))}
function preset(n){
  const t=S.today,d=fromKey(t);
  if(n==='week')return[weekStart(t),t];
  if(n==='lastweek'){const s=addDays(weekStart(t),-7);return[s,addDays(s,6)]}
  if(n==='month')return[dkey(new Date(d.getFullYear(),d.getMonth(),1).getTime()),t];
  return[dkey(new Date(d.getFullYear(),d.getMonth()-1,1).getTime()),dkey(new Date(d.getFullYear(),d.getMonth(),0).getTime())];
}
async function runReport(){
  const R=S.rep;if(!R.from||!R.to||R.from>R.to){toast('اختار فترة صحيحة');return}
  R.loading=true;adminBody();
  try{const q=await S.db.collection('attendance').where('date','>=',R.from).where('date','<=',R.to).get();R.recs=mapDocs(q)}
  catch(e){R.recs=null;toast('مقدرتش أحمّل التقرير، جرب تاني')}
  R.loading=false;if(S.view==='admin'&&S.tab==='report')adminBody();
}
function calc(st,recs,from,to){
  const mine=recs.filter(r=>r.staffId===st.id),days=[];
  const o={days,present:0,mins:0,lateN:0,lateM:0,abs:0,forgot:0};
  const created=st.createdAt?dkey(st.createdAt):'0000-00-00';
  let k=from,guard=0;
  while(k<=to&&guard++<400){
    const rs=mine.filter(r=>r.date===k).sort((a,b)=>a.inAt-b.inAt);let status;
    if(rs.length){status='present';o.present++;
      rs.forEach(r=>{if(r.outAt)o.mins+=(r.outAt-r.inAt)/60000;else if(Date.now()-r.inAt>=OPEN_MAX)o.forgot++});
      if(rs[0].lateMin>0){o.lateN++;o.lateM+=rs[0].lateMin}}
    else if(k>S.today)status='future';
    else if(k<created)status='before';
    else if(st.dayOff===fromKey(k).getDay())status='off';
    else if(k===S.today&&!shiftPassed(st))status='wait';
    else{status='absent';o.abs++}
    days.push({k,rs,status});k=addDays(k,1);
  }
  return o;
}
function reportRows(){
  const R=S.rep,recs=R.recs||[];
  const list=S.staff.filter(s=>(s.active!==false||recs.some(r=>r.staffId===s.id))&&(R.branch==='all'||s.branch===R.branch));
  const ids=new Set(S.staff.map(s=>s.id));
  recs.forEach(r=>{if(!ids.has(r.staffId)&&(R.branch==='all'||r.branch===R.branch)&&!list.some(x=>x.id===r.staffId))list.push({id:r.staffId,name:r.name,branch:r.branch,orphan:true})});
  return list.sort((a,b)=>a.name.localeCompare(b.name,'ar')).map(st=>({st,c:calc(st,recs,R.from,R.to)}));
}
function tabReport(){
  const R=S.rep;
  if(!R.from){const p=preset('week');R.from=p[0];R.to=p[1]}
  if(R.recs===null&&!R.loading&&!R.asked){R.asked=true;setTimeout(runReport,0)}
  let table='';
  if(R.loading)table='<div class="empty">بيحمّل التقرير...</div>';
  else if(R.recs){
    const rows=reportRows();const T={present:0,mins:0,lateN:0,lateM:0,abs:0,forgot:0};
    rows.forEach(r=>{for(const k in T)T[k]+=r.c[k]});
    table='<div class="scroll"><table class="tbl"><thead><tr><th>الموظف</th><th>الفرع</th><th>أيام الحضور</th><th>ساعات العمل</th><th>مرات التأخير</th><th>دقايق التأخير</th><th>أيام الغياب</th><th>نسي الانصراف</th></tr></thead><tbody>'+
      (rows.length?rows.map(r=>'<tr class="click" data-act="rep-detail" data-id="'+esc(r.st.id)+'"><td><b>'+esc(r.st.name)+'</b></td><td>'+esc(brName(r.st.branch))+'</td><td>'+r.c.present+'</td><td>'+fmtDur(r.c.mins)+'</td><td>'+r.c.lateN+'</td><td>'+Math.round(r.c.lateM)+'</td><td>'+
        (r.c.abs?'<span class="pill bad">'+r.c.abs+'</span>':'0')+'</td><td>'+(r.c.forgot?'<span class="pill warn">'+r.c.forgot+'</span>':'0')+'</td></tr>').join(''):'<tr><td colspan="8" class="muted">مفيش بيانات في الفترة دي.</td></tr>')+
      '</tbody>'+(rows.length?'<tfoot><tr><td>الإجمالي</td><td></td><td>'+T.present+'</td><td>'+fmtDur(T.mins)+'</td><td>'+T.lateN+'</td><td>'+Math.round(T.lateM)+'</td><td>'+T.abs+'</td><td>'+T.forgot+'</td></tr></tfoot>':'')+'</table></div>'+
      '<small>اضغط على أي موظف تشوف تفاصيل أيامه. التأخير بيتحسب بعد فترة السماح اللي في الإعدادات.</small>';
  }
  return '<div class="chips">'+[['week','الأسبوع ده'],['lastweek','الأسبوع اللي فات'],['month','الشهر ده'],['lastmonth','الشهر اللي فات']].map(p=>'<button class="chip" data-act="preset" data-p="'+p[0]+'">'+p[1]+'</button>').join('')+'</div>'+
    '<div class="ctrl"><label class="f">من<input id="rfrom" class="inp" type="date" value="'+R.from+'"></label><label class="f">إلى<input id="rto" class="inp" type="date" value="'+R.to+'"></label>'+
    '<button class="btn pri" data-act="rep-run">عرض التقرير</button></div>'+branchChips(R.branch,'r-chip')+table+
    (R.recs&&!R.loading?'<div class="actions"><button class="btn" data-act="csv-sum">تحميل الملخص (Excel)</button><button class="btn" data-act="csv-det">تحميل كل التسجيلات (Excel)</button></div>':'');
}
function repDetail(id){
  const row=reportRows().find(r=>r.st.id===id);if(!row)return;
  const lbl={absent:'<span class="pill bad">غايب</span>',off:'<span class="pill">إجازة</span>',wait:'<span class="pill">لسه</span>'};
  openModal('<h2>'+esc(row.st.name)+'</h2><small>'+esc(fmtDateY(S.rep.from))+' إلى '+esc(fmtDateY(S.rep.to))+'</small><div class="list">'+
    row.c.days.filter(d=>d.status!=='future'&&d.status!=='before').reverse().map(d=>'<div class="item"><b style="flex:0 0 150px">'+esc(fmtDate(d.k))+'</b><div class="tm" style="flex:1">'+
      (d.rs.length?d.rs.map(r=>'<div><span>'+fmtT(r.inAt)+' ← '+(r.outAt?fmtT(r.outAt):'<span class="pill warn">بدون انصراف</span>')+'</span>'+(r.outAt?'<small>'+fmtDur((r.outAt-r.inAt)/60000)+'</small>':'')+
        (r.lateMin>0?'<span class="pill warn">متأخر '+fmtDur(r.lateMin)+'</span>':'')+'</div>').join(''):'<div>'+(lbl[d.status]||'')+'</div>')+'</div></div>').join('')+'</div>'+
    '<div class="actions"><button class="btn" data-act="close">إغلاق</button></div>','wide');
}
async function saveCsv(name,rows){
  const csv='﻿'+rows.map(r=>r.map(c=>'"'+String(c==null?'':c).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  try{const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000)}
  catch(e){toast('مقدرتش أنزّل الملف')}
}
function csvSummary(){
  const R=S.rep;
  saveCsv('thrills-attendance-summary-'+R.from+'_'+R.to+'.csv',[['الموظف','الفرع','أيام الحضور','ساعات العمل','مرات التأخير','دقايق التأخير','أيام الغياب','نسي الانصراف']].concat(
    reportRows().map(r=>[r.st.name,brName(r.st.branch),r.c.present,(r.c.mins/60).toFixed(2),r.c.lateN,Math.round(r.c.lateM),r.c.abs,r.c.forgot])));
}
function csvDetail(){
  const R=S.rep,names={};S.staff.forEach(s=>names[s.id]=s);
  saveCsv('thrills-attendance-records-'+R.from+'_'+R.to+'.csv',[['التاريخ','الموظف','الفرع','حضور','انصراف','الساعات','دقايق التأخير','تسجيل يدوي']].concat(
    (R.recs||[]).slice().sort((a,b)=>a.inAt-b.inAt).map(r=>[r.date,r.name,brName(r.branch),fmtT(r.inAt),r.outAt?fmtT(r.outAt):'',r.outAt?((r.outAt-r.inAt)/3600000).toFixed(2):'',r.lateMin||0,r.manual?'نعم':''])));
}

/* staff */
function tabStaff(){
  const act=S.staff.filter(s=>s.active!==false),off=S.staff.filter(s=>s.active===false);
  const item=s=>{const sh=shiftOf(s.shift);return '<article class="item"><div class="who"><span class="av">'+esc(Array.from(s.name)[0]||'؟')+'</span><div><b>'+esc(s.name)+'</b><small>'+
    esc([brName(s.branch),sh?sh.name:'',s.dayOff>=0?'إجازة '+DAYS[s.dayOff]:''].filter(Boolean).join(' · '))+'</small></div></div><button class="btn sm" data-act="staff-edit" data-id="'+esc(s.id)+'">تعديل</button></article>'}
  return '<div class="ctrl"><button class="btn pri" data-act="staff-new">+ موظف جديد</button><button class="btn" data-act="staff-bulk">إضافة كذا موظف مرة واحدة</button></div>'+
    '<div class="list">'+(act.length?act.sort((a,b)=>a.name.localeCompare(b.name,'ar')).map(item).join(''):'<div class="empty">لسه مفيش موظفين. ضيف أول موظف.</div>')+'</div>'+
    (off.length?'<h3>موقوفين</h3><div class="list">'+off.map(item).join('')+'</div>':'');
}
const dayOpts=sel=>'<option value="-1">مفيش</option>'+DAYS.map((d,i)=>'<option value="'+i+'"'+(sel===i?' selected':'')+'>'+d+'</option>').join('');
const brOpts=sel=>(S.cfg.branches||[]).map(b=>'<option value="'+esc(b.id)+'"'+(sel===b.id?' selected':'')+'>'+esc(b.name)+'</option>').join('');
const shOpts=sel=>(S.cfg.shifts||[]).map(x=>'<option value="'+esc(x.id)+'"'+(sel===x.id?' selected':'')+'>'+esc(x.name)+' - '+fmtHM(x.start)+'</option>').join('');
function staffModal(id){
  const s=id?S.staff.find(x=>x.id===id):null;
  openModal('<h2>'+(s?'تعديل موظف':'موظف جديد')+'</h2><label class="f">الاسم<input id="s-name" class="inp" value="'+esc(s?s.name:'')+'" autocomplete="off"></label>'+
    '<div class="row2"><label class="f">الفرع<select id="s-br" class="inp">'+brOpts(s?s.branch:S.branch)+'</select></label><label class="f">الشيفت<select id="s-sh" class="inp">'+shOpts(s?s.shift:'')+'</select></label></div>'+
    '<div class="row2"><label class="f">يوم الإجازة الأسبوعي<select id="s-off" class="inp">'+dayOpts(s?s.dayOff:-1)+'</select></label>'+
    '<label class="f">الرقم السري (4 أرقام)<input id="s-pin" class="inp num" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="'+(s?'سيبه فاضي لو مش هتغيره':'مثلاً 4821')+'"></label></div>'+
    '<div class="actions"><button class="btn sm" id="s-rand">رقم عشوائي</button></div>'+
    (s?'<label class="f" style="flex-direction:row;align-items:center;gap:10px"><input id="s-act" type="checkbox"'+(s.active!==false?' checked':'')+' style="width:20px;height:20px"> شغّال حالياً</label>':'')+
    '<div class="err" id="s-err"></div><div class="actions"><button class="btn pri" id="s-save">حفظ</button><button class="btn" data-act="close">إلغاء</button>'+
    (s?'<button class="btn bad" id="s-del" style="margin-inline-start:auto">حذف</button>':'')+'</div>');
  $('#s-rand').onclick=()=>{$('#s-pin').value=randPin()};
  $('#s-save').onclick=async()=>{
    const name=$('#s-name').value.trim(),pin=$('#s-pin').value.trim();
    if(!name){$('#s-err').textContent='اكتب الاسم';return}
    if(!s&&!/^\d{4}$/.test(pin)){$('#s-err').textContent='الرقم السري لازم يكون 4 أرقام';return}
    if(pin&&!/^\d{4}$/.test(pin)){$('#s-err').textContent='الرقم السري لازم يكون 4 أرقام';return}
    const sid=s?s.id:uid('s');
    const data={name,branch:$('#s-br').value,shift:$('#s-sh').value||null,dayOff:Number($('#s-off').value),active:s?$('#s-act').checked:true,
      pinHash:pin?await hashPin(sid,pin):s.pinHash,createdAt:s?(s.createdAt||Date.now()):Date.now()};
    $('#s-save').disabled=true;
    if(await wr(()=>S.db.doc('staff/'+sid).set(data))){closeModal();toast(pin&&s?'اتحفظ. الرقم السري الجديد: '+pin:'اتحفظ')}else $('#s-save').disabled=false;
  };
  const del=$('#s-del');
  if(del)del.onclick=async()=>{
    if(del.dataset.sure!=='1'){del.dataset.sure='1';del.textContent='اضغط تاني للتأكيد';return}
    if(await wr(()=>S.db.doc('staff/'+s.id).delete())){closeModal();toast('اتحذف. سجلاته القديمة فضلت موجودة')}
  };
}
function bulkModal(){
  openModal('<h2>إضافة كذا موظف</h2><label class="f">الأسماء، كل اسم في سطر<textarea id="b-names" class="inp" placeholder="أحمد محمد&#10;منى علي&#10;..."></textarea></label>'+
    '<div class="row2"><label class="f">الفرع<select id="b-br" class="inp">'+brOpts(S.branch)+'</select></label><label class="f">الشيفت<select id="b-sh" class="inp">'+shOpts('')+'</select></label></div>'+
    '<label class="f">يوم الإجازة الأسبوعي<select id="b-off" class="inp">'+dayOpts(-1)+'</select></label>'+
    '<small>هيتعمل لكل موظف رقم سري عشوائي، وهيظهرلك مرة واحدة بس عشان تسلمه.</small><div class="err" id="b-err"></div>'+
    '<div class="actions"><button class="btn pri" id="b-save">إضافة</button><button class="btn" data-act="close">إلغاء</button></div>');
  $('#b-save').onclick=async()=>{
    const names=$('#b-names').value.split('\n').map(x=>x.trim()).filter(Boolean);
    if(!names.length){$('#b-err').textContent='اكتب اسم واحد على الأقل';return}
    $('#b-save').disabled=true;const out=[];
    for(const n of names){
      const sid=uid('s'),pin=randPin();
      const ok=await wr(async()=>S.db.doc('staff/'+sid).set({name:n,branch:$('#b-br').value,shift:$('#b-sh').value||null,dayOff:Number($('#b-off').value),active:true,pinHash:await hashPin(sid,pin),createdAt:Date.now()}));
      if(ok)out.push([n,pin]);else break;
    }
    openModal('<h2>الأرقام السرية</h2><p class="muted" style="margin:0">سجّلها دلوقتي. مش هتظهر تاني، ولو حد نسي رقمه تعمله رقم جديد من "تعديل".</p>'+
      '<div class="list">'+out.map(o=>'<div class="item"><b style="flex:1">'+esc(o[0])+'</b><span class="num" style="font-family:var(--f-display);font-size:1.4rem;letter-spacing:.1em">'+o[1]+'</span></div>').join('')+'</div>'+
      '<div class="actions"><button class="btn" id="b-copy">نسخ القائمة</button><button class="btn pri" data-act="close">تمام</button></div>','wide');
    $('#b-copy').onclick=()=>{const t=out.map(o=>o[0]+' : '+o[1]).join('\n');
      (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>toast('اتنسخت')).catch(()=>toast('النسخ مش شغال هنا. انقل الأرقام يدوي'))};
  };
}

/* settings / setup */
function newDraft(c){
  c=c||{};const al=c.alertOn||{};
  return{branches:(c.branches&&c.branches.length?c.branches:[{id:uid('b'),name:''}]).map(b=>({id:b.id,name:b.name})),
    shifts:(c.shifts&&c.shifts.length?c.shifts:[{id:uid('sh'),name:'صباحي',start:'09:00'},{id:uid('sh'),name:'مسائي',start:'17:00'}]).map(x=>({id:x.id,name:x.name,start:x.start})),
    grace:c.grace==null?10:c.grace,earlyMin:c.earlyMin==null?30:c.earlyMin,absentAfter:c.absentAfter==null?60:c.absentAfter,forgotHours:c.forgotHours==null?12:c.forgotHours,
    alertOn:{late:al.late!==false,early:al.early!==false,absent:al.absent!==false,forgot:al.forgot!==false},
    ntfyTopic:c.ntfyTopic||newTopic(),email:'',pw:'',pw2:''};
}
function cfgForm(setup){
  const d=S.draft;
  const num=(k,label,hint,max)=>'<label class="f">'+label+'<input class="inp num" type="number" min="0" max="'+max+'" data-k="'+k+'" value="'+esc(d[k])+'">'+(hint?'<small>'+hint+'</small>':'')+'</label>';
  const ck=(k,label)=>'<label class="f" style="flex-direction:row;align-items:center;gap:10px"><input type="checkbox" data-ck="'+k+'"'+(d.alertOn[k]?' checked':'')+' style="width:20px;height:20px"> '+label+'</label>';
  return '<section class="sec"><h3>الفروع</h3>'+d.branches.map((b,i)=>'<div class="line"><label class="f">اسم الفرع<input class="inp" data-list="branches" data-i="'+i+'" data-f="name" value="'+esc(b.name)+'" placeholder="مثلاً: فرع المعادي"></label>'+
      (d.branches.length>1?'<button class="btn sm bad" data-act="cfg-del" data-l="branches" data-i="'+i+'">شيل</button>':'')+'</div>').join('')+
    '<div><button class="btn sm" data-act="cfg-add" data-l="branches">+ فرع</button></div></section>'+
    '<section class="sec"><h3>الشيفتات</h3>'+d.shifts.map((x,i)=>'<div class="line"><label class="f">الاسم<input class="inp" data-list="shifts" data-i="'+i+'" data-f="name" value="'+esc(x.name)+'"></label>'+
      '<label class="f">بيبدأ الساعة<input class="inp" type="time" data-list="shifts" data-i="'+i+'" data-f="start" value="'+esc(x.start)+'"></label>'+
      (d.shifts.length>1?'<button class="btn sm bad" data-act="cfg-del" data-l="shifts" data-i="'+i+'">شيل</button>':'')+'</div>').join('')+
    '<div><button class="btn sm" data-act="cfg-add" data-l="shifts">+ شيفت</button></div></section>'+
    '<section class="sec"><h3>التأخير والتنبيهات</h3>'+num('grace','فترة السماح بالدقايق','الموظف مش بيتحسب متأخر لو حضر في الفترة دي بعد بداية الشيفت.',120)+
    '<div class="row2">'+num('earlyMin','يتحسب "حضر بدري" لو حضر قبل الشيفت بـ (دقيقة)','',240)+num('absentAfter','تنبيه الغياب بعد بداية الشيفت بـ (دقيقة)','',480)+'</div>'+
    num('forgotHours','تنبيه "نسي الانصراف" بعد (ساعة) من الحضور','',16)+
    '<div class="list" style="gap:6px;margin-top:4px">'+ck('late','نبّهني لما حد يتأخر')+ck('early','نبّهني لما حد يحضر بدري')+ck('absent','نبّهني لما حد يغيب')+ck('forgot','نبّهني لما حد ينسى الانصراف')+'</div>'+
    '<label class="f">اسم قناة التنبيهات (Topic)<input class="inp" dir="ltr" data-k="ntfyTopic" value="'+esc(d.ntfyTopic)+'" autocomplete="off"><small>اتولّد عشوائي. بتشترك فيه من تطبيق ntfy على موبايلك. متشاركوش مع حد.</small></label></section>'+
    (setup?'<section class="sec"><h3>حساب المدير</h3><small>الإيميل والباسورد دول هتدخل بيهم لوحة المدير. اكتبهم وخليهم معاك.</small>'+
      '<label class="f">الإيميل<input class="inp" type="email" dir="ltr" autocomplete="username" data-k="email" value="'+esc(d.email)+'"></label>'+
      '<label class="f">الباسورد (8 حروف أو أكتر)<input class="inp" type="password" dir="ltr" autocomplete="new-password" data-k="pw" value="'+esc(d.pw)+'"></label>'+
      '<label class="f">أكّد الباسورد<input class="inp" type="password" dir="ltr" autocomplete="new-password" data-k="pw2" value="'+esc(d.pw2)+'"></label></section>':
    '<section class="sec"><h3>حساب المدير</h3><small>داخل بـ <b dir="ltr">'+esc(S.fbUser&&S.fbUser.email||'')+'</b></small><div class="actions"><button class="btn sm" data-act="reset-pw">ابعتلي لينك تغيير الباسورد</button></div></section>')+
    '<div class="err" id="c-err"></div><div class="actions"><button class="btn pri" data-act="cfg-save" id="c-save">'+(setup?'ابدأ':'حفظ الإعدادات')+'</button></div>';
}
function setupHTML(){return '<main class="panel"><h2>إعداد أولي</h2><p class="muted" style="margin:0">خطوة واحدة بس. بعدها تضيف الموظفين من لوحة المدير.</p>'+cfgForm(true)+'</main>'}
function tabSettings(){if(!S.draft)S.draft=newDraft(S.cfg);return '<h2 style="font-size:1.3rem">الإعدادات</h2>'+cfgForm(false)}
async function saveCfg(setup){
  const d=S.draft,err=m=>{const e=$('#c-err');if(e)e.textContent=m};
  const branches=d.branches.map(b=>({id:b.id,name:b.name.trim()})).filter(b=>b.name);
  if(!branches.length)return err('اكتب اسم فرع واحد على الأقل');
  const shifts=d.shifts.map(x=>({id:x.id,name:x.name.trim(),start:x.start})).filter(x=>x.name);
  if(!shifts.length||shifts.some(x=>!/^\d{2}:\d{2}$/.test(x.start)))return err('كل شيفت محتاج اسم ووقت بداية');
  const grace=Number(d.grace),earlyMin=Number(d.earlyMin),absentAfter=Number(d.absentAfter),forgotHours=Number(d.forgotHours);
  if(!(grace>=0&&grace<=120))return err('فترة السماح بين 0 و 120 دقيقة');
  if(!(earlyMin>=0&&earlyMin<=240))return err('الحضور بدري بين 0 و 240 دقيقة');
  if(!(absentAfter>=0&&absentAfter<=480))return err('تنبيه الغياب بين 0 و 480 دقيقة');
  if(!(forgotHours>=1&&forgotHours<=16))return err('تنبيه نسيان الانصراف بين 1 و 16 ساعة');
  const topic=String(d.ntfyTopic||'').trim();
  if(!/^[A-Za-z0-9_-]{8,64}$/.test(topic))return err('اسم الـ Topic حروف إنجليزي وأرقام بس (8 أو أكتر)');
  if(!setup){const gone=(S.cfg.branches||[]).filter(b=>!branches.some(x=>x.id===b.id));
    if(gone.some(b=>S.staff.some(s=>s.branch===b.id)))return err('في موظفين على فرع عايز تشيله. انقلهم لفرع تاني الأول.')}
  const next={branches,shifts,grace,earlyMin,absentAfter,forgotHours,alertOn:Object.assign({},d.alertOn),ntfyTopic:topic,createdAt:setup?Date.now():(S.cfg.createdAt||Date.now())};
  const btn=$('#c-save');
  if(setup){
    const em=String(d.email||'').trim(),pw=String(d.pw||'');
    if(!/^\S+@\S+\.\S+$/.test(em))return err('اكتب إيميل صحيح');
    if(pw.length<8)return err('الباسورد لازم يكون 8 حروف أو أكتر');
    if(pw!==d.pw2)return err('الباسورد مش متطابق');
    if(btn)btn.disabled=true;err('');
    S.settingUp=true;let cred;
    try{
      await S.auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
      cred=await S.auth.createUserWithEmailAndPassword(em,pw);
    }catch(e){S.settingUp=false;err(authMsg(e));if(btn)btn.disabled=false;return}
    try{
      const uid=cred.user.uid,b=S.db.batch();
      b.set(S.db.doc('admins/'+uid),{email:em,createdAt:Date.now()});
      b.set(S.db.doc('meta/initialized'),{at:Date.now(),by:uid});
      b.set(S.db.doc('config/main'),next);
      await b.commit();
    }catch(e){
      S.settingUp=false;try{await cred.user.delete()}catch(x){}
      err(e&&e.code==='permission-denied'?'النظام اتظبط قبل كده من جهاز تاني. افتح الصفحة تاني وادخل كمدير.':errMsg(e));if(btn)btn.disabled=false;return;
    }
    S.settingUp=false;S.fbUser=cred.user;S.cfg=next;S.isAdmin=true;S.adm.keep=false;S.draft=null;subAlerts();
    S.view='admin';S.tab='staff';S.adm.until=Date.now()+5*60000;render();toast('تمام. دلوقتي ضيف الموظفين');
    return;
  }
  if(await wr(()=>S.db.doc('config/main').set(next))){
    S.cfg=next;S.draft=newDraft(next);adminBody();toast('اتحفظت الإعدادات');
  }
}


/* ---------- events ---------- */
document.addEventListener('pointerdown',()=>{if(S.view==='admin')S.adm.until=Date.now()+5*60000},true);
document.addEventListener('click',async e=>{
  const t=e.target.closest('[data-act]');if(!t)return;
  const a=t.dataset.act;
  switch(a){
    case 'close':closeModal();break;
    case 'me-go':await meGo();break;
    case 'me-pick':mePick(t.dataset.id);break;
    case 'me-unbind':S.me=null;try{localStorage.removeItem('thrills.me')}catch(x){}render();break;
    case 'go-kiosk':S.meMode=false;render();break;
    case 'pick':pick(t.dataset.id);break;
    case 'chip':S.branch=t.dataset.b;try{localStorage.setItem('thrills.branch',S.branch)}catch(x){}render();break;
    case 'admin-login':adminLogin();break;
    case 'install':installApp();break;
    case 'test-alert':testAlert();break;
    case 'copy-topic':copyTopic();break;
    case 'reset-pw':resetPw();break;
    case 'logout':logout();break;
    case 'tab':S.tab=t.dataset.t;if(S.tab==='settings')S.draft=newDraft(S.cfg);render();break;
    case 'a-chip':S.adm.branch=t.dataset.b;adminBody();break;
    case 'd-prev':S.adm.date=addDays(S.adm.date,-1);adminBody();break;
    case 'd-next':S.adm.date=addDays(S.adm.date,1);adminBody();break;
    case 'd-today':S.adm.date=S.today;adminBody();break;
    case 'rec-new':recModal(null,t.dataset.staff);break;
    case 'rec-edit':{const r=recordsFor(S.adm.date).find(x=>x.id===t.dataset.id);if(r)recModal(r)}break;
    case 'preset':{const p=preset(t.dataset.p);S.rep.from=p[0];S.rep.to=p[1];runReport()}break;
    case 'rep-run':S.rep.from=$('#rfrom').value;S.rep.to=$('#rto').value;runReport();break;
    case 'r-chip':S.rep.branch=t.dataset.b;adminBody();break;
    case 'rep-detail':repDetail(t.dataset.id);break;
    case 'csv-sum':csvSummary();break;
    case 'csv-det':csvDetail();break;
    case 'staff-new':staffModal();break;
    case 'staff-edit':staffModal(t.dataset.id);break;
    case 'staff-bulk':bulkModal();break;
    case 'cfg-add':{const l=t.dataset.l;S.draft[l].push(l==='branches'?{id:uid('b'),name:''}:{id:uid('sh'),name:'',start:'09:00'});S.view==='admin'?adminBody():render()}break;
    case 'cfg-del':{S.draft[t.dataset.l].splice(Number(t.dataset.i),1);S.view==='admin'?adminBody():render()}break;
    case 'cfg-save':await saveCfg(!S.cfg);break;
  }
});
document.addEventListener('input',e=>{
  const t=e.target;
  if(t.id==='q'){S.search=t.value;fillGrid();return}
  if(t.id==='mq'){S.meSearch=t.value;meFill();return}
  if(t.dataset.list){S.draft[t.dataset.list][Number(t.dataset.i)][t.dataset.f]=t.value;return}
  if(t.dataset.k&&S.draft){S.draft[t.dataset.k]=t.value}
});
document.addEventListener('change',e=>{
  if(e.target.dataset&&e.target.dataset.ck&&S.draft){S.draft.alertOn[e.target.dataset.ck]=e.target.checked;return}
  if(e.target.id==='adate'&&e.target.value){S.adm.date=e.target.value;adminBody()}
});

/* ---------- boot ---------- */
async function boot(){
  render();
  const cfg=window.FIREBASE_CONFIG;
  if(!cfg||!cfg.apiKey||/PASTE|YOUR/i.test(cfg.apiKey)){S.cfgErr='لسه ما اتحطش إعداد Firebase. اتبع خطوات ملف README.';render();return}
  if(!window.firebase){S.cfgErr='مقدرتش أحمّل مكتبة Firebase. اتأكد من النت وافتح الصفحة تاني.';render();return}
  try{
    firebase.initializeApp(cfg);S.db=firebase.firestore();S.auth=firebase.auth();
    try{await S.db.enablePersistence({synchronizeTabs:true})}catch(e){}
  }catch(e){S.db=null;S.cfgErr='إعداد Firebase غلط. راجع firebase-config.js';render();return}
  S.auth.onAuthStateChanged(async u=>{
    S.fbUser=u;if(S.settingUp)return;let adm=false;
    if(u){try{const d=await S.db.doc('admins/'+u.uid).get();adm=d.exists}catch(e){}}
    let keep=false;try{keep=localStorage.getItem('thrills.keep')==='1'}catch(e){}
    if(u&&!adm){S.auth.signOut().catch(()=>{})}
    S.isAdmin=adm;if(adm)S.adm.keep=keep;
    if(adm)subAlerts();
    else{if(unsubAlerts){unsubAlerts();unsubAlerts=null}S.alerts=[];if(S.view==='admin')S.view='kiosk'}
    if(!(S.view==='admin'&&adm&&S.tab==='settings'&&$('#abody')))render();
  });
  S.db.doc('config/main').onSnapshot(s=>{S.cfg=s.exists?s.data():null;S.loaded.cfg=true;S.cfgErr='';
    if(S.view==='admin'&&S.tab==='settings'&&S.cfg&&$('#abody'))return;
    render()},e=>{S.loaded.cfg=true;S.cfgErr=(e&&e.code==='permission-denied')?'مفيش صلاحية قراءة. لازم تنشر قواعد Firestore (ملف firestore.rules) من خطوات README.':'مفيش اتصال بقاعدة البيانات. اتأكد من النت.';render()});
  S.db.collection('staff').onSnapshot(q=>{S.staff=mapDocs(q);S.loaded.staff=true;inval('staff')},()=>{});
  subAtt();
  setInterval(tick,5000);
  setInterval(sweep,60000);setTimeout(sweep,10000);
  if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
}
boot();


})();
