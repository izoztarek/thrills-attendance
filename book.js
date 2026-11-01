/* Thrills - كتاب الوصفات للباريستا (بدون أي أسعار): قايمة، تفاصيل بمقادير قابلة للضرب، وتدريب بكروت.
   الرابط: #recipes. البيانات من collection اسمها recipebook (المدير بيحدّثها من قسم التكلفة والوصفات). */
(function(){
'use strict';
const T=()=>window.__T;
const UL={g:'جم',ml:'مل',pc:'حبة'};
const B={recs:[],ok:false,subbed:false,q:'',cat:'all',openId:null,scale:1,quiz:null,
  learned:new Set()};
try{B.learned=new Set(JSON.parse(localStorage.getItem('thrills.learned')||'[]'))}catch(e){}
const saveLearned=()=>{try{localStorage.setItem('thrills.learned',JSON.stringify(Array.from(B.learned)))}catch(e){}};
const nf=x=>Number(x).toLocaleString('ar-EG-u-nu-latn',{maximumFractionDigits:2});

function sub(){
  const {S,mapDocs}=T();if(B.subbed||!S.db)return;B.subbed=true;
  S.db.collection('recipebook').onSnapshot(q=>{
    B.recs=mapDocs(q).sort((a,b)=>(a.order||0)-(b.order||0)||String(a.name).localeCompare(b.name));
    B.ok=true;if(B.openId&&!B.recs.some(r=>r.id===B.openId))B.openId=null;refresh();
  },()=>{B.ok=true;B.subbed=false;refresh()});
}
function refresh(){
  const {S,$}=T();if(S.view!=='recipes')return;
  const a=document.activeElement;if(a&&a.id==='b-q'){fillList();return}
  if(B.quiz)return;               // ما نقطعش التدريب لو جه تحديث
  if(B.openId){return}            // ولا نقطع حد بيقرا وصفة
  render();
}
const cats=()=>{const seen=[];B.recs.forEach(r=>{if(r.cat&&seen.indexOf(r.cat)<0)seen.push(r.cat)});return seen};
const homeBtn=()=>'<button class="linkbtn" data-ba="home">الشاشة الرئيسية</button>';

function render(){const {setApp}=T();sub();setApp(view())}
function view(){
  const {head}=T();const h=head(false,'وصفات Thrills');
  if(!B.ok)return h+'<div class="grid"><div class="skeleton"></div><div class="skeleton"></div></div>';
  if(B.quiz)return h+quizHTML();
  if(B.openId){const r=B.recs.find(x=>x.id===B.openId);if(r)return h+detailHTML(r)}
  return h+listHTML();
}

/* ---------- list ---------- */
function listHTML(){
  const {esc}=T();
  if(!B.recs.length)return '<div class="empty">لسه مفيش وصفات هنا. المدير هيضيفها من لوحة المدير ← التكلفة والوصفات.</div><div class="foot"><span></span>'+homeBtn()+'</div>';
  const total=B.recs.length,done=B.recs.filter(r=>B.learned.has(r.id)).length,pct=Math.round(done/total*100);
  const cs=cats();
  return '<main class="panel">'+
    '<section class="sec"><div class="bkprog"><div><b>حفظت '+done+' من '+total+' وصفة</b><small class="muted"> · '+pct+'%</small></div><button class="btn pri sm" data-ba="quiz">اختبرني</button></div><div class="bar-t" style="--w:'+pct+'%"><i style="width:'+pct+'%;animation:none"></i></div></section>'+
    '<label class="search" style="max-width:none"><input id="b-q" class="inp" type="search" autocomplete="off" placeholder="دوّر على وصفة أو اسم مشروب" value="'+esc(B.q)+'"></label>'+
    '<div class="chips">'+['all'].concat(cs).map(c=>'<button class="chip" data-ba="cat" data-c="'+esc(c)+'" aria-pressed="'+(B.cat===c)+'">'+(c==='all'?'الكل':esc(c))+'</button>').join('')+'</div>'+
    '<div id="b-list">'+cardsHTML()+'</div></main><div class="foot"><span></span>'+homeBtn()+'</div>';
}
function cardsHTML(){
  const {esc,norm}=T();const q=norm(B.q);
  const list=B.recs.filter(r=>(B.cat==='all'||r.cat===B.cat)&&(!q||norm(r.name+' '+(r.nick||'')).includes(q)));
  if(!list.length)return '<div class="empty">مفيش وصفة بالاسم ده</div>';
  let out='',last=null;
  list.forEach(r=>{
    if(B.cat==='all'&&!q&&r.cat!==last){last=r.cat;out+='<h3 class="bkh">'+esc(r.cat||'')+'</h3>'}
    out+='<button class="bkc'+(B.learned.has(r.id)?' ok':'')+'" data-ba="show" data-id="'+esc(r.id)+'"><span><b>'+esc(r.name)+'</b>'+(r.nick?'<small>'+esc(r.nick)+'</small>':'')+'</span><span class="bkm">'+(B.learned.has(r.id)?'✓ ':'')+((r.lines||[]).length?(r.lines.length+' مكوّن'):'')+'</span></button>';
  });
  return out;
}
function fillList(){const {$}=T();const el=$('#b-list');if(el)el.innerHTML=cardsHTML()}

/* ---------- detail ---------- */
function detailHTML(r){
  const {esc}=T();const sc=B.scale;
  const lines=(r.lines||[]).map(l=>{
    const qty=l.q?('<span class="qty">'+nf(l.q*sc)+' '+(UL[l.u]||esc(l.u||''))+'</span>'):'<span class="qty">—</span>';
    return '<label class="ck"><input type="checkbox">'+qty+'<span class="nm">'+esc(l.n)+'</span>'+(l.note?'<small>'+esc(l.note)+'</small>':'')+'</label>';
  }).join('');
  const steps=String(r.steps||'').split(/\n+/).map(x=>x.trim()).filter(Boolean).map((x,i)=>'<label class="ck"><input type="checkbox"><span class="qty">'+(i+1)+'</span><span class="nm">'+esc(x)+'</span></label>').join('');
  const learned=B.learned.has(r.id);
  return '<main class="panel"><button class="linkbtn" data-ba="back" style="align-self:flex-start">← رجوع للقايمة</button>'+
    '<section class="sec"><h2 style="font-size:1.6rem">'+esc(r.name)+'</h2>'+(r.nick?'<div class="muted" style="font-weight:600">'+esc(r.nick)+'</div>':'')+
    (r.desc?'<p style="margin:0;font-style:italic">'+esc(r.desc)+'</p>':'')+
    '<div class="chips"><span class="pill">'+esc(r.cat||'')+'</span>'+(r.price?'<span class="pill ok">سعر البيع '+nf(r.price)+' ج</span>':'')+'</div></section>'+
    ((r.lines||[]).length?'<section class="sec"><div class="bkprog"><h3>المكوّنات</h3><div class="chips" aria-label="عدد الكاسات">'+[1,2,3,4].map(n=>'<button class="chip" data-ba="scale" data-n="'+n+'" aria-pressed="'+(sc===n)+'">×'+n+'</button>').join('')+'</div></div>'+
      '<div class="muted" style="font-size:.88rem">دوس على المكوّن كل ما تحطّه (للمراجعة بس)</div>'+lines+'</section>':'')+
    (steps?'<section class="sec"><h3>الخطوات / ملاحظات</h3>'+steps+'</section>':'')+
    ((r.lines||[]).length||steps?'':'<div class="empty">الوصفة دي لسه مفيهاش تفاصيل.</div>')+
    '<button class="btn'+(learned?'':' pri')+'" data-ba="learn" data-id="'+esc(r.id)+'">'+(learned?'✓ محفوظة (دوس للإلغاء)':'حفظتها ✓')+'</button></main>'+
    '<div class="foot"><span></span>'+homeBtn()+'</div>';
}

/* ---------- quiz (flashcards) ---------- */
function startQuiz(){
  const pool=B.recs.filter(r=>B.cat==='all'||r.cat===B.cat);
  const todo=pool.filter(r=>!B.learned.has(r.id));
  const list=(todo.length?todo:pool).slice();
  for(let i=list.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[list[i],list[j]]=[list[j],list[i]]}
  B.quiz={list,i:0,show:false,yes:0,no:0};
}
function quizHTML(){
  const {esc}=T();const z=B.quiz;
  if(!z.list.length)return '<div class="empty">مفيش وصفات تتختبر.</div><div class="actions"><button class="btn" data-ba="qexit">رجوع</button></div>';
  if(z.i>=z.list.length)return '<main class="panel"><section class="sec" style="text-align:center"><h2>خلّصت الجولة 🎉</h2><p style="margin:0">عرفت <b>'+z.yes+'</b> وكرّرت <b>'+z.no+'</b>.</p><div class="actions" style="justify-content:center"><button class="btn pri" data-ba="quiz">جولة جديدة</button><button class="btn" data-ba="qexit">رجوع</button></div></section></main>';
  const r=z.list[z.i];
  const lines=(r.lines||[]).map(l=>'<li>'+(l.q?nf(l.q)+' '+(UL[l.u]||'')+' ':'')+esc(l.n)+(l.note?' <small>('+esc(l.note)+')</small>':'')+'</li>').join('');
  return '<main class="panel"><div class="bkprog"><button class="linkbtn" data-ba="qexit">← خروج</button><small class="muted">'+(z.i+1)+' / '+z.list.length+'</small></div>'+
    '<section class="sec" style="text-align:center"><div class="muted">فاكر مكوّنات وكميات:</div><h2 style="font-size:1.8rem">'+esc(r.name)+'</h2>'+(r.nick?'<div class="muted">'+esc(r.nick)+'</div>':'')+
    (z.show?('<ul class="oi" style="align-items:flex-start;text-align:start;margin-top:8px">'+(lines||'<li>مفيش مكوّنات مسجّلة</li>')+'</ul>'+(r.steps?'<div class="fnote" style="text-align:start">'+esc(r.steps)+'</div>':'')+
      '<div class="actions" style="justify-content:center"><button class="btn pri" data-ba="qyes">عرفتها ✓</button><button class="btn" data-ba="qno">لسه، كرّرها</button></div>'):
      '<div class="actions" style="justify-content:center"><button class="btn pri" data-ba="qshow">اعرض الإجابة</button></div>')+'</section></main>';
}

/* ---------- events ---------- */
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-ba]');if(!el)return;
  const t=T();if(!t)return;const {S,render:appRender}=t;const a=el.dataset.ba;
  switch(a){
    case 'open':S.view='recipes';appRender();break;
    case 'home':
      try{localStorage.removeItem('thrills.mode')}catch(x){}
      S.view='kiosk';S.meMode=false;B.openId=null;B.quiz=null;if(location.hash)history.replaceState(null,'',location.pathname+location.search);appRender();break;
    case 'cat':B.cat=el.dataset.c;render();break;
    case 'show':B.openId=el.dataset.id;B.scale=1;render();window.scrollTo(0,0);break;
    case 'back':B.openId=null;render();break;
    case 'scale':B.scale=Number(el.dataset.n)||1;render();break;
    case 'learn':{const id=el.dataset.id;if(B.learned.has(id))B.learned.delete(id);else B.learned.add(id);saveLearned();render()}break;
    case 'quiz':startQuiz();render();break;
    case 'qshow':B.quiz.show=true;render();break;
    case 'qyes':{const r=B.quiz.list[B.quiz.i];B.learned.add(r.id);saveLearned();B.quiz.yes++;B.quiz.i++;B.quiz.show=false;render()}break;
    case 'qno':B.quiz.no++;B.quiz.i++;B.quiz.show=false;render();break;
    case 'qexit':B.quiz=null;render();break;
  }
});
document.addEventListener('input',e=>{if(e.target.id==='b-q'){B.q=e.target.value;fillList()}});

window.ThrillsBook={render};
})();
