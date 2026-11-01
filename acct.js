/* Thrills - تقفيل اليوم والحسابات.
   الكاشير (من التابلت): يرفع ملف مبيعات جيديا ويكتب العهدة والمصروفات والكاش اللي عدّه -> البرنامج يقارن ويطلّع الفرق.
   المدير/الشركا: تبويب "الحسابات" (التقفيلات، المصروفات، ملخص الشهر والأرباح). collections: closings, expenses, acfg. */
(function(){
'use strict';
const T=()=>window.__T;
const AR='٠١٢٣٤٥٦٧٨٩';
const n=v=>{const x=parseFloat(String(v==null?'':v).replace(/[٠-٩]/g,d=>AR.indexOf(d)).replace(/[٫,]/g,'.'));return isFinite(x)?x:0};
const r2=x=>Math.round(x*100+(x<0?-1e-9:1e-9))/100;
const nf=x=>Number(x).toLocaleString('ar-EG-u-nu-latn',{minimumFractionDigits:0,maximumFractionDigits:2});
const money=x=>nf(x)+' ج';
const sgn=x=>(x>0?'+':x<0?'−':'')+nf(Math.abs(x));
const pad=x=>String(x).padStart(2,'0');
const range=m=>{const p=m.split('-').map(Number);return [m+'-01',m+'-'+pad(new Date(p[0],p[1],0).getDate())]};
const shiftM=(m,d)=>{const p=m.split('-').map(Number);const x=new Date(p[0],p[1]-1+d,1);return x.getFullYear()+'-'+pad(x.getMonth()+1)};
const fmtMonth=m=>{const p=m.split('-').map(Number);return new Date(p[0],p[1]-1,1).toLocaleDateString('ar-EG-u-nu-latn',{month:'long',year:'numeric'})};
const dayTxt=k=>new Date(k+'T12:00:00').toLocaleDateString('ar-EG-u-nu-latn',{weekday:'short',day:'numeric',month:'short'});
const DRAW='مسحوبات الشركاء';
const CATS=['خامات ومشتريات','مصنع','إيجار','كهرباء ومياه وغاز','صيانة','نظافة وأدوات','تسويق','مواصلات ونقل','أخرى'];
const FROM={drawer:'من الدرج',owner:'شريك دفع من جيبه',bank:'من البنك / انستاباي',credit:'آجل (لسه متدفعش)'};
const A={month:'',cl:[],ex:[],cfg:{},ok:{c:false,e:false,g:false},unsubs:[],uid:null,subMonth:'',f:null,openId:null,edit:null,sure:null,cat:'all',sal:null,salBusy:false,xform:null};

/* ---------- قارئ ملف xlsx (من غير مكتبات) ---------- */
async function unzipIndex(buf){
  const dv=new DataView(buf),u8=new Uint8Array(buf);let e=-1;
  for(let i=buf.byteLength-22;i>=Math.max(0,buf.byteLength-65557);i--){if(dv.getUint32(i,true)===0x06054b50){e=i;break}}
  if(e<0)throw new Error('notzip');
  const cnt=dv.getUint16(e+10,true);let p=dv.getUint32(e+16,true);const files={};
  for(let i=0;i<cnt;i++){
    if(dv.getUint32(p,true)!==0x02014b50)throw new Error('notzip');
    const method=dv.getUint16(p+10,true),csize=dv.getUint32(p+20,true),nl=dv.getUint16(p+28,true),xl=dv.getUint16(p+30,true),cl=dv.getUint16(p+32,true),lo=dv.getUint32(p+42,true);
    files[new TextDecoder().decode(u8.subarray(p+46,p+46+nl))]={method,csize,lo};p+=46+nl+xl+cl;
  }
  return files;
}
async function readEntry(buf,f){
  const dv=new DataView(buf),nl=dv.getUint16(f.lo+26,true),xl=dv.getUint16(f.lo+28,true);
  const data=new Uint8Array(buf,f.lo+30+nl+xl,f.csize);
  if(f.method===0)return new TextDecoder().decode(data);
  if(f.method!==8||typeof DecompressionStream==='undefined')throw new Error('nodeflate');
  const stream=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return await new Response(stream).text();
}
const colOf=ref=>{const m=/^[A-Z]+/.exec(ref||'');if(!m)return -1;let x=0;for(const ch of m[0])x=x*26+ch.charCodeAt(0)-64;return x-1};
const FIELDS={cash:'cash',card:'card',mobile:'mobile',custom:'custom',total:'total sales',tips:'tips',refund:'refund',orders:'orders qty',net:'net sales',gross:'gross sales',tax:'tax'};
async function parseXlsx(buf){
  const files=await unzipIndex(buf);
  const sheetName=Object.keys(files).filter(k=>/^xl\/worksheets\/[^/]+\.xml$/.test(k)).sort()[0];
  if(!sheetName)throw new Error('nosheet');
  const doc=s=>new DOMParser().parseFromString(s,'application/xml');
  const shared=[];
  if(files['xl/sharedStrings.xml']){
    const sd=doc(await readEntry(buf,files['xl/sharedStrings.xml']));
    Array.from(sd.getElementsByTagName('si')).forEach(si=>shared.push(Array.from(si.getElementsByTagName('t')).map(t=>t.textContent).join('')));
  }
  const sd=doc(await readEntry(buf,files[sheetName]));
  const rows=Array.from(sd.getElementsByTagName('row')).map(r=>{
    const o={};Array.from(r.getElementsByTagName('c')).forEach(c=>{
      const i=colOf(c.getAttribute('r'));if(i<0)return;const t=c.getAttribute('t');let v='';
      if(t==='inlineStr')v=Array.from(c.getElementsByTagName('t')).map(x=>x.textContent).join('');
      else{const ve=c.getElementsByTagName('v')[0];v=ve?ve.textContent:'';if(t==='s')v=shared[Number(v)]||''}
      o[i]=v;
    });return o;
  }).filter(r=>Object.keys(r).length);
  const hi=rows.findIndex(r=>{const l=Object.values(r).map(x=>String(x).trim().toLowerCase());return l.indexOf('cash')>=0&&l.indexOf('total sales')>=0});
  if(hi<0)throw new Error('noheader');
  const idx={};Object.keys(rows[hi]).forEach(c=>{idx[String(rows[hi][c]).trim().toLowerCase()]=c});
  const data=rows.slice(hi+1).filter(r=>Object.keys(r).some(c=>String(r[c]).trim()!==''&&isFinite(parseFloat(r[c]))));
  if(data.length!==1)throw new Error(data.length?'multi':'nodata');
  const d=data[0],g=name=>idx[name]==null?0:r2(n(d[idx[name]]));
  const pos={};Object.keys(FIELDS).forEach(k=>{pos[k]=g(FIELDS[k])});
  pos.disc=r2(g('auto discounts')+g('manual discounts'));
  const sum=r2(pos.cash+pos.card+pos.mobile+pos.custom);
  return {pos,sum,mismatch:Math.abs(sum-pos.total)>=1};
}
const MON={january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};
function dateFromName(name){
  const m=/(\d{1,2})_([A-Za-z]+)_(\d{4})_-_(\d{1,2})_([A-Za-z]+)_(\d{4})/.exec(name||'');if(!m)return null;
  const mk=(d,mo,y)=>{const x=MON[mo.toLowerCase()];return x?y+'-'+pad(x)+'-'+pad(Number(d)):null};
  const from=mk(m[1],m[2],m[3]),to=mk(m[4],m[5],m[6]);return from&&to?{from,to}:null;
}
const PERR={notzip:'الملف ده مش Excel (xlsx) سليم.',nosheet:'مش لاقي بيانات جوه الملف.',noheader:'مش لاقي أعمدة Cash و Total Sales. اتأكد إنه تقرير "Sales Summary" من جيديا.',
  multi:'الملف فيه أكتر من يوم. اطلع التقرير ليوم واحد بس.',nodata:'الملف مفيش فيه أرقام.',nodeflate:'المتصفح هنا مش بيقرا الملف. ادخل الأرقام بإيدك.'};

/* ---------- حسابات التقفيل ---------- */
function posOf(f){
  if(f.manual){
    const m=f.m,p={cash:r2(n(m.cash)),card:r2(n(m.card)),mobile:r2(n(m.mobile)),custom:r2(n(m.custom)),orders:Math.round(n(m.orders))};
    p.total=r2(p.cash+p.card+p.mobile+p.custom);return p;
  }
  return f.pos;
}
function calc(f){
  const p=posOf(f),cash=p?n(p.cash):0;
  const exp=r2(f.exps.reduce((a,x)=>a+n(x.amount),0));
  const expected=r2(n(f.opening)+cash-exp-n(f.withdrawn));
  const diff=f.counted===''?null:r2(n(f.counted)-expected);
  return {cash,exp,expected,diff};
}
const closeId=(d,b)=>d+'_'+b;

/* ---------- شاشة الكاشير ---------- */
function newForm(st,admin,date){
  const t=T(),S=t.S;let fl='';try{fl=localStorage.getItem('thrills.float')||''}catch(e){}
  const hr=new Date().getHours(),dflt=date||(hr<5?t.addDays(S.today,-1):S.today);
  const brs=S.cfg.branches||[],br=admin?(S.adm&&S.adm.branch&&S.adm.branch!=='all'?S.adm.branch:(brs[0]||{}).id):(S.branch!=='all'?S.branch:(st&&st.branch)||(brs[0]||{}).id);
  return {admin:!!admin,byId:st?st.id:'',by:st?st.name:'المدير',branch:br||'',date:dflt,pos:null,file:'',parseErr:'',warn:'',manual:false,m:{cash:'',card:'',mobile:'',custom:'',orders:''},
    opening:admin?'':fl,exps:[],withdrawn:'',counted:'',note:'',err:'',busy:false};
}
function openWho(){
  const t=T(),{S,esc,openModal}=t;
  const list=S.staff.filter(s=>s.active!==false&&s.pinHash&&(S.branch==='all'||!s.branch||s.branch===S.branch)).sort((a,b)=>a.name.localeCompare(b.name,'ar'));
  openModal('<h2>تقفيل اليوم</h2><p class="muted">مين اللي بيقفل؟ (هيطلب الرقم السري)</p><div class="list">'+
    (list.length?list.map(s=>'<button class="btn lg" data-aa="who" data-id="'+esc(s.id)+'">'+esc(s.name)+'</button>').join(''):'<div class="empty">مفيش موظفين</div>')+
    '</div><div class="actions"><button class="btn" data-act="close">إلغاء</button></div>');
}
function pickWho(id){
  const t=T(),S=t.S;const st=S.staff.find(x=>x.id===id);if(!st)return;
  t.openPin({key:id,name:st.name,title:'تقفيل اليوم',hint:'اكتب رقمك السري',verify:p=>t.hashPin(st.id,p).then(h=>h===st.pinHash),onOk:()=>{
    if(!A.f||A.f.byId!==st.id||A.f.admin)A.f=newForm(st,false);
    renderForm();
  }});
}
function renderForm(keepScroll){
  const t=T(),{esc,openModal,$}=t;const f=A.f;if(!f)return;
  const sh=$('#modal .sheet'),sc=keepScroll&&sh?sh.scrollTop:0;
  const tile=(l,v)=>'<div class="stat"><b class="num">'+nf(v)+'</b><span>'+l+'</span></div>';
  let sales='';
  if(f.manual){
    const fld=(k,l)=>'<label class="f">'+l+'<input class="inp num" type="number" inputmode="decimal" min="0" step="any" data-af="m.'+k+'" value="'+esc(f.m[k])+'"></label>';
    sales='<div class="ctrl">'+fld('cash','كاش')+fld('card','فيزا')+fld('mobile','محافظ')+fld('custom','انستاباي / أخرى')+fld('orders','عدد الأوردرات')+'</div>'+
      '<div class="sr"><span>إجمالي المبيعات</span><b class="num" id="af-mtot">'+money(posOf(f).total)+'</b></div>'+
      '<button class="linkbtn" data-aa="f-file">ارجع لرفع الملف</button>';
  }else{
    sales='<label class="btn pri filebtn">'+(f.pos?'غيّر الملف':'اختار ملف جيديا (Excel)')+'<input id="af-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden></label>'+
      (f.parseErr?'<div class="err">'+esc(f.parseErr)+'</div>':'')+
      (f.pos?'<div class="muted">'+esc(f.file)+'</div><div class="tiles">'+tile('كاش',f.pos.cash)+tile('فيزا',f.pos.card)+tile('محافظ',f.pos.mobile)+tile('انستاباي / أخرى',f.pos.custom)+tile('الإجمالي',f.pos.total)+tile('أوردرات',f.pos.orders)+'</div>'+
        (f.warn?'<div class="unkmsg">'+esc(f.warn)+'</div>':''):'')+
      '<button class="linkbtn" data-aa="f-manual">مفيش ملف؟ ادخل الأرقام بإيدك</button>';
  }
  const xr=f.exps.map((x,i)=>'<div class="fr xr"><select class="inp" data-af="x.cat" data-i="'+i+'">'+CATS.map(c=>'<option'+(x.cat===c?' selected':'')+'>'+esc(c)+'</option>').join('')+'</select>'+
    '<input class="inp num xa" type="number" inputmode="decimal" min="0" step="any" placeholder="المبلغ" data-af="x.amount" data-i="'+i+'" value="'+esc(x.amount)+'">'+
    '<input class="inp" placeholder="اشتريت إيه / من مين" data-af="x.note" data-i="'+i+'" value="'+esc(x.note)+'" maxlength="120">'+
    '<button class="btn sm bad" data-aa="f-delexp" data-i="'+i+'" aria-label="شيل">✕</button></div>').join('');
  const nfld=(k,l,h)=>'<label class="f">'+l+(h?'<small>'+h+'</small>':'')+'<input class="inp num" type="number" inputmode="decimal" min="0" step="any" data-af="'+k+'" value="'+esc(f[k])+'"></label>';
  const today=t.S.today;
  openModal('<div class="pf acf"><h2>'+(f.admin?'تقفيل يدوي (مدير)':'تقفيل اليوم')+'</h2><div class="muted">'+esc(f.by)+'</div>'+
    '<label class="f">تاريخ اليوم<input class="inp" id="af-date" type="date" data-af="date" value="'+esc(f.date)+'"'+(f.admin?'':' max="'+today+'"')+'></label>'+
    '<h3>مبيعات اليوم (من جيديا)</h3>'+sales+
    '<h3>الدرج</h3>'+nfld('opening','العهدة اللي كانت في الدرج أول اليوم','الفكة اللي سايبينها من امبارح')+
    '<div class="xs"><b>مصروفات اتدفعت من الدرج</b>'+(xr||'<div class="muted">مفيش</div>')+'<button class="btn sm" data-aa="f-addexp">+ مصروف</button></div>'+
    nfld('withdrawn','اتسحب من الدرج (تسليم لشريك / إيداع)','لو سلّمت فلوس لحد أو دخّلتها البنك')+
    nfld('counted','الكاش اللي عدّيته في الدرج دلوقتي','عدّ الفلوس الفعلية')+
    '<div class="sum" id="af-calc"></div>'+
    '<label class="f">سبب الفرق / ملاحظة<input class="inp" data-af="note" maxlength="300" value="'+esc(f.note)+'" placeholder="لو فيه فرق اكتب السبب"></label>'+
    '<div class="err" id="af-err">'+esc(f.err)+'</div><div class="actions"><button class="btn pri" data-aa="f-submit"'+(f.busy?' disabled':'')+'>قفّل اليوم</button><button class="btn" data-act="close">إلغاء (الأرقام هتفضل محفوظة)</button></div></div>','wide');
  updateCalc();
  const sh2=$('#modal .sheet');if(sh2&&sc)sh2.scrollTop=sc;
}
function updateCalc(){
  const t=T(),{$}=t;const f=A.f,el=$('#af-calc');if(!f||!el)return;
  const c=calc(f),p=posOf(f);
  const d=c.diff;
  el.innerHTML='<div class="sr"><span>عهدة أول اليوم</span><b class="num">'+money(n(f.opening))+'</b></div>'+
    '<div class="sr"><span>+ كاش المبيعات</span><b class="num">'+money(c.cash)+'</b></div>'+
    '<div class="sr"><span>− مصروفات من الدرج</span><b class="num">'+money(c.exp)+'</b></div>'+
    '<div class="sr"><span>− اتسحب من الدرج</span><b class="num">'+money(n(f.withdrawn))+'</b></div>'+
    '<div class="sr big"><span>المفروض في الدرج</span><b class="num">'+money(c.expected)+'</b></div>'+
    '<div class="sr"><span>الفرق</span>'+(d==null?'<span class="muted">اكتب الكاش اللي عدّيته</span>':d===0?'<span class="pill ok">مظبوط ✓</span>':'<span class="pill '+(d<0?'bad':'warn')+'">'+(d<0?'عجز ':'زيادة ')+money(Math.abs(d))+'</span>')+'</div>';
  const m=$('#af-mtot');if(m&&p)m.textContent=money(p.total);
}
function setField(k,v,i){
  const f=A.f;if(!f)return;
  if(k.indexOf('m.')===0)f.m[k.slice(2)]=v;
  else if(k.indexOf('x.')===0){const x=f.exps[Number(i)];if(x)x[k.slice(2)]=v}
  else f[k]=v;
}
async function onFile(file){
  const f=A.f;if(!f||!file)return;f.parseErr='';f.warn='';
  try{
    const r=await parseXlsx(await file.arrayBuffer());
    const d=dateFromName(file.name);
    if(d&&d.from!==d.to)throw new Error('multi');
    f.pos=r.pos;f.file=file.name;
    if(d)f.date=d.from;else f.warn='اسم الملف مفيهوش تاريخ. اتأكد من تاريخ اليوم فوق.';
    if(r.mismatch)f.warn=(f.warn?f.warn+' ':'')+'مجموع الكاش والفيزا والمحافظ والأخرى ('+nf(r.sum)+') مش بيساوي الإجمالي ('+nf(r.pos.total)+'). راجع الملف.';
  }catch(e){f.pos=null;f.file='';f.parseErr=PERR[e.message]||'مقدرتش أقرا الملف. جرب ملف تاني أو ادخل الأرقام بإيدك.'}
  renderForm(true);
}
async function submit(){
  const t=T(),{S,$}=t;const f=A.f;if(!f||f.busy)return;
  const fail=m=>{f.err=m;const e=$('#af-err');if(e)e.textContent=m;return false};
  f.err='';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(f.date))return fail('اختار تاريخ اليوم');
  if(!f.admin&&f.date>S.today)return fail('التاريخ ده لسه ماجاش');
  if(!f.admin&&t.fromKey(f.date)<t.fromKey(t.addDays(S.today,-40)))return fail('التاريخ قديم أوي. كلّم المدير.');
  const pos=posOf(f);
  if(!pos||(f.manual&&!(pos.total>0)))return fail('ارفع ملف المبيعات أو ادخل الأرقام بإيدك');
  if(f.counted==='')return fail('اكتب الكاش اللي عدّيته في الدرج');
  const exps=[];
  for(const x of f.exps){
    const a=r2(n(x.amount));
    if(!(a>0)&&!String(x.note).trim())continue;
    if(!(a>0))return fail('اكتب مبلغ كل مصروف أو شيله');
    if(a>=100000)return fail('مبلغ المصروف كبير أوي، راجعه');
    exps.push({cat:x.cat||'أخرى',amount:a,note:String(x.note||'').trim().slice(0,150)});
  }
  const ff=Object.assign({},f,{exps});const c=calc(ff);
  if(Math.abs(c.diff)>=1&&!String(f.note).trim())return fail('فيه فرق '+money(Math.abs(c.diff))+'. اكتب السبب في خانة الملاحظة.');
  if(!f.branch)return fail('الفرع مش متحدد');
  f.busy=true;const btn=document.querySelector('[data-aa="f-submit"]');if(btn)btn.disabled=true;
  const id=closeId(f.date,f.branch),ts=firebase.firestore.FieldValue.serverTimestamp();
  const clean=o=>{const r={};Object.keys(o).forEach(k=>{r[k]=typeof o[k]==='number'&&!isFinite(o[k])?0:o[k]});return r};
  const doc={date:f.date,branch:f.branch,by:f.by,byId:f.byId||'',pos:clean(pos),manualPos:!!f.manual,file:f.file||'',opening:r2(n(f.opening)),counted:r2(n(f.counted)),withdrawn:r2(n(f.withdrawn)),
    expTotal:c.exp,expected:c.expected,diff:c.diff,note:String(f.note||'').trim().slice(0,300),ts};
  const b=S.db.batch();b.set(S.db.doc('closings/'+id),doc);
  exps.forEach(x=>b.set(S.db.doc('expenses/'+t.uid('ex')),{date:f.date,branch:f.branch,cat:x.cat,amount:x.amount,supplier:'',note:x.note,from:'drawer',closingId:id,by:f.by,ts}));
  const p=b.commit();p.catch(()=>{});
  const r=await Promise.race([p.then(()=>'ok',e=>e),new Promise(res=>setTimeout(()=>res('slow'),5000))]);
  f.busy=false;
  if(r!=='ok'&&r!=='slow'){
    const denied=r&&r.code==='permission-denied';
    renderForm(true);
    return fail(denied?'اليوم ده اتقفل قبل كده (أو مفيش صلاحية). لو محتاج تعديل كلّم المدير.':'مقدرتش أسجّل. اتأكد من النت وجرب تاني.');
  }
  if(!f.admin){try{localStorage.setItem('thrills.float',String(r2(n(f.counted)-n(f.withdrawn))))}catch(e){}}
  const total=pos.total;
  t.push('تقفيل '+f.date+' - '+f.by+': مبيعات '+nf(total)+' (كاش '+nf(pos.cash)+')'+(c.diff===0?' · الدرج مظبوط':c.diff<0?' · عجز '+nf(Math.abs(c.diff)):' · زيادة '+nf(c.diff)),c.diff<0?'closebad':'close');
  A.f=null;
  t.openModal('<div class="pf acf"><h2>'+(r==='slow'?'اتحفظ على الجهاز':'اتقفل اليوم ✓')+'</h2>'+(r==='slow'?'<p class="muted">مفيش نت دلوقتي. هيتسجل أول ما النت يرجع. متقفلش التابلت.</p>':'')+
    '<div class="sum"><div class="sr"><span>مبيعات '+t.esc(f.date)+'</span><b class="num">'+money(total)+'</b></div><div class="sr"><span>المفروض في الدرج</span><b class="num">'+money(c.expected)+'</b></div>'+
    '<div class="sr"><span>الفرق</span>'+(c.diff===0?'<span class="pill ok">مظبوط ✓</span>':'<span class="pill '+(c.diff<0?'bad':'warn')+'">'+(c.diff<0?'عجز ':'زيادة ')+money(Math.abs(c.diff))+'</span>')+'</div></div>'+
    '<div class="actions"><button class="btn pri" data-act="close">تمام</button></div></div>');
}

/* ---------- بيانات المدير ---------- */
function sub(){
  const t=T(),S=t.S;const u=S.fbUser&&S.fbUser.uid;if(!S.db||!u)return;
  if(!A.month)A.month=S.today.slice(0,7);
  if(A.uid===u&&A.subMonth===A.month)return;
  A.unsubs.forEach(f=>{try{f()}catch(e){}});A.unsubs=[];A.uid=u;A.subMonth=A.month;A.ok={c:false,e:false,g:false};A.cl=[];A.ex=[];
  const [a,b]=range(A.month),fail=()=>{A.uid=null};
  A.unsubs.push(S.db.collection('closings').where('date','>=',a).where('date','<=',b).onSnapshot(q=>{A.cl=t.mapDocs(q);A.ok.c=true;refresh()},()=>{A.ok.c=true;fail();refresh()}));
  A.unsubs.push(S.db.collection('expenses').where('date','>=',a).where('date','<=',b).onSnapshot(q=>{A.ex=t.mapDocs(q);A.ok.e=true;refresh()},()=>{A.ok.e=true;fail();refresh()}));
  A.unsubs.push(S.db.doc('acfg/main').onSnapshot(s=>{A.cfg=s.exists?s.data():{};A.ok.g=true;refresh()},()=>{A.ok.g=true;fail();refresh()}));
}
function clear(){
  A.unsubs.forEach(f=>{try{f()}catch(e){}});A.unsubs=[];A.uid=null;A.subMonth='';A.cl=[];A.ex=[];A.cfg={};A.ok={c:false,e:false,g:false};A.month='';A.openId=null;A.edit=null;A.sure=null;A.sal=null;A.cat='all';A.xform=null;
}
const ready=()=>A.ok.c&&A.ok.e&&A.ok.g;
const TABS=['closes','exps','pnl'];
function tabHTML(name){return {closes:tabCloses,exps:tabExps,pnl:tabPnl}[name]()}
function refresh(){
  const t=T();if(!t)return;const {S,$}=t;
  if(S.view!=='admin'||TABS.indexOf(S.tab)<0||!$('#abody'))return;
  const a=document.activeElement;if(a&&a.closest&&a.closest('#abody')&&/INPUT|SELECT|TEXTAREA/.test(a.tagName))return;
  $('#abody').innerHTML=tabHTML(S.tab);
  if(A.openId&&$('#modal .cd'))openDetail(A.openId);
}
function tab(name){sub();return ready()?tabHTML(name):'<div class="empty">جاري التحميل...</div>'}
function monthBar(){
  return '<div class="ctrl"><button class="btn sm" data-aa="mprev">← الشهر اللي قبله</button><b class="mname">'+fmtMonth(A.month)+'</b><button class="btn sm" data-aa="mnext">الشهر اللي بعده →</button></div>';
}
const diffPill=d=>d===0?'<span class="pill ok">مظبوط</span>':'<span class="pill '+(d<0?'bad':'warn')+'">'+(d<0?'عجز ':'زيادة ')+money(Math.abs(d))+'</span>';
function startKey(){
  if(A.cfg.start)return A.cfg.start;
  const ds=A.cl.map(c=>c.date).sort();return ds[0]||null;
}
function sumPos(k){return r2(A.cl.reduce((a,c)=>a+n(c.pos&&c.pos[k]),0))}

/* ---------- تبويب التقفيلات ---------- */
function tabCloses(){
  const t=T(),{S,esc,addDays}=t;const [a,b]=range(A.month);
  const byDate={};A.cl.forEach(c=>{byDate[c.date]=c});
  const last=b<S.today?b:addDays(S.today,-1),st=startKey();
  const rows=[];let k=a;const miss=[];
  while(k<=b){
    if(byDate[k])rows.push({k,c:byDate[k]});
    else if(st&&k>=st&&k<=last)miss.push(k),rows.push({k,c:null});
    k=addDays(k,1);
  }
  rows.sort((x,y)=>x.k<y.k?1:-1);
  const sales=sumPos('total'),diff=r2(A.cl.reduce((x,c)=>x+n(c.diff),0)),other=r2(sumPos('card')+sumPos('mobile')+sumPos('custom'));
  const list=rows.map(r=>r.c?
    '<article class="item rc" data-aa="cdet" data-id="'+esc(r.c.id)+'" role="button" tabindex="0"><div class="who"><div><b>'+esc(dayTxt(r.k))+'</b><small class="muted">'+esc(r.c.by||'')+(r.c.manualPos?' · أرقام يدوي':'')+'</small></div></div>'+
      '<div class="tm"><div><b class="num">'+money(n(r.c.pos&&r.c.pos.total))+'</b><small class="muted">كاش '+nf(n(r.c.pos&&r.c.pos.cash))+'</small></div></div><div class="st">'+diffPill(n(r.c.diff))+(r.c.shortageItem?'<span class="pill">اتخصم</span>':'')+'</div></article>':
    '<article class="item"><div class="who"><div><b>'+esc(dayTxt(r.k))+'</b></div></div><div class="st"><span class="pill warn">ما اتقفلش</span><button class="btn sm" data-aa="mclose" data-d="'+r.k+'">قفّله</button></div></article>').join('');
  return monthBar()+
    '<div class="tiles"><div class="stat"><b class="num">'+nf(sales)+'</b><span>مبيعات الشهر</span></div><div class="stat"><b class="num">'+nf(sumPos('cash'))+'</b><span>كاش</span></div>'+
    '<div class="stat"><b class="num">'+nf(other)+'</b><span>فيزا / محافظ / أخرى</span></div><div class="stat"><b class="num">'+A.cl.length+'</b><span>أيام اتقفلت</span></div>'+
    '<div class="stat '+(miss.length?'warn':'')+'"><b class="num">'+miss.length+'</b><span>أيام ما اتقفلتش</span></div>'+
    '<div class="stat '+(diff<0?'bad':diff>0?'warn':'ok')+'"><b class="num">'+sgn(diff)+'</b><span>صافي الفروق</span></div></div>'+
    '<div class="ctrl"><label class="f">بداية استخدام التقفيل<input class="inp" type="date" data-acfg="start" value="'+esc(A.cfg.start||st||'')+'"><small>الأيام قبل التاريخ ده مش بتتحسب "ما اتقفلتش".</small></label>'+
    '<button class="btn" data-aa="mclose" data-d="">+ تقفيل يدوي</button></div>'+
    '<div class="list">'+(list||'<div class="empty">مفيش تقفيلات في الشهر ده</div>')+'</div>';
}
function openDetail(id){
  const t=T(),{S,esc,openModal}=t;const c=A.cl.find(x=>x.id===id);if(!c){t.closeModal();return}
  A.openId=id;const p=c.pos||{};
  const exps=A.ex.filter(x=>x.closingId===id);
  const ts=c.ts&&c.ts.toMillis?c.ts.toMillis():null;
  const row=(l,v,cls)=>'<div class="sr'+(cls?' '+cls:'')+'"><span>'+l+'</span><b class="num">'+v+'</b></div>';
  const active=S.staff.filter(s=>s.active!==false||s.id===c.byId);
  const shortage=n(c.diff)<0&&!c.shortageItem?
    '<div class="sum"><b>عجز '+money(Math.abs(c.diff))+'</b><label class="f">اخصمه من مرتب<select id="cd-who" class="inp">'+active.map(s=>'<option value="'+esc(s.id)+'"'+(s.id===c.byId?' selected':'')+'>'+esc(s.name)+'</option>').join('')+'</select></label>'+
    '<button class="btn pri" data-aa="short" data-id="'+esc(id)+'">اخصم العجز من المرتب</button></div>':
    c.shortageItem?'<div class="sum"><span class="pill">العجز اتسجّل على المرتب</span><button class="btn sm bad" data-aa="unshort" data-id="'+esc(id)+'">الغي الخصم</button></div>':'';
  const edits=(c.edits||[]).length?'<h3>التعديلات</h3><div class="list">'+c.edits.map(e=>'<div class="fr"><b>'+esc(e.reason||'')+'</b><small class="muted">'+esc(e.by||'')+' · '+(e.ts?new Date(e.ts).toLocaleDateString('ar-EG-u-nu-latn'):'')+'</small></div>').join('')+'</div>':'';
  openModal('<div class="pf acf cd"><h2>تقفيل '+esc(dayTxt(c.date))+'</h2><div class="muted">'+esc(c.by||'')+(ts?' · '+t.fmtT(ts):'')+(c.file?' · '+esc(c.file):'')+(c.manualPos?' · الأرقام مدخلة يدوي':'')+'</div>'+
    '<h3>المبيعات</h3><div class="sum">'+row('كاش',money(n(p.cash)))+row('فيزا',money(n(p.card)))+row('محافظ',money(n(p.mobile)))+row('انستاباي / أخرى',money(n(p.custom)))+row('الإجمالي',money(n(p.total)),'big')+
    (p.orders?row('عدد الأوردرات',nf(p.orders)):'')+(n(p.refund)?row('مرتجعات',money(n(p.refund))):'')+(n(p.disc)?row('خصومات',money(n(p.disc))):'')+'</div>'+
    '<h3>الدرج</h3><div class="sum">'+row('عهدة أول اليوم',money(n(c.opening)))+row('+ كاش المبيعات',money(n(p.cash)))+
    (exps.length?exps.map(x=>'<div class="sr"><span>− '+esc(x.cat)+(x.note?' · '+esc(x.note):'')+'</span><b class="num">'+money(n(x.amount))+' <button class="btn sm bad" data-aa="cexp-del" data-id="'+esc(x.id)+'" aria-label="احذف المصروف">✕</button></b></div>').join(''):row('− مصروفات من الدرج',money(0)))+
    row('− اتسحب',money(n(c.withdrawn)))+row('المفروض في الدرج',money(n(c.expected)),'big')+row('اللي اتعدّ',money(n(c.counted)))+
    '<div class="sr"><span>الفرق</span>'+diffPill(n(c.diff))+'</div></div>'+
    (c.note?'<p><b>ملاحظة:</b> '+esc(c.note)+'</p>':'')+shortage+edits+
    '<div class="actions"><button class="btn" data-aa="cedit" data-id="'+esc(id)+'">تعديل</button>'+
    '<button class="btn bad" data-aa="cdel" data-id="'+esc(id)+'">'+(A.sure===id?'اضغط تاني للتأكيد':'حذف التقفيل')+'</button><button class="btn" data-act="close">قفل</button></div></div>','wide');
}
function openEdit(id){
  const t=T(),{esc,openModal}=t;const c=A.cl.find(x=>x.id===id);if(!c)return;A.edit=id;const p=c.pos||{};
  const fld=(k,l,v)=>'<label class="f">'+l+'<input class="inp num" type="number" inputmode="decimal" step="any" id="ae-'+k+'" value="'+esc(v)+'"></label>';
  openModal('<div class="pf acf"><h2>تعديل تقفيل '+esc(dayTxt(c.date))+'</h2><div class="ctrl">'+fld('cash','كاش',n(p.cash))+fld('card','فيزا',n(p.card))+fld('mobile','محافظ',n(p.mobile))+fld('custom','انستاباي / أخرى',n(p.custom))+'</div>'+
    '<div class="ctrl">'+fld('opening','العهدة',n(c.opening))+fld('withdrawn','اتسحب',n(c.withdrawn))+fld('counted','اللي اتعدّ',n(c.counted))+'</div>'+
    '<label class="f">سبب التعديل (مطلوب)<input class="inp" id="ae-reason" maxlength="200"></label><div class="err" id="ae-err"></div>'+
    (c.shortageItem?'<div class="unkmsg">العجز كان اتخصم من المرتب. لو الفرق اتغيّر عدّل الخصم من المرتبات.</div>':'')+
    '<div class="actions"><button class="btn pri" data-aa="cedit-save">حفظ</button><button class="btn" data-aa="cedit-back" data-id="'+esc(id)+'">رجوع</button></div></div>');
}
async function saveEdit(){
  const t=T(),{S,$,wr,toast}=t;const c=A.cl.find(x=>x.id===A.edit);if(!c)return;
  const v=k=>r2(n($('#ae-'+k).value)),reason=$('#ae-reason').value.trim();
  if(!reason){$('#ae-err').textContent='اكتب سبب التعديل';return}
  const p0=c.pos||{},pos=Object.assign({},p0,{cash:v('cash'),card:v('card'),mobile:v('mobile'),custom:v('custom')});
  if(['cash','card','mobile','custom'].some(k=>pos[k]!==n(p0[k])))pos.total=r2(pos.cash+pos.card+pos.mobile+pos.custom);
  const exp=r2(A.ex.filter(x=>x.closingId===c.id).reduce((a,x)=>a+n(x.amount),0));
  const expected=r2(v('opening')+pos.cash-exp-v('withdrawn')),diff=r2(v('counted')-expected);
  const edits=(c.edits||[]).concat([{ts:Date.now(),by:(S.fbUser&&S.fbUser.email)||'',reason,before:{cash:n(p0.cash),card:n(p0.card),mobile:n(p0.mobile),custom:n(p0.custom),opening:n(c.opening),withdrawn:n(c.withdrawn),counted:n(c.counted),diff:n(c.diff)}}]);
  if(await wr(()=>S.db.doc('closings/'+c.id).update({pos,opening:v('opening'),withdrawn:v('withdrawn'),counted:v('counted'),expTotal:exp,expected,diff,edits}))){toast('اتعدّل');A.edit=null;openDetail(c.id)}
}
async function shortage(id){
  const t=T(),{S,$,wr,toast}=t;const c=A.cl.find(x=>x.id===id);if(!c||!(n(c.diff)<0))return;
  const who=$('#cd-who')?$('#cd-who').value:c.byId;if(!who)return toast('اختار الموظف');
  const month=c.date.slice(0,7);
  if(window.ThrillsPay&&window.ThrillsPay.isLocked&&window.ThrillsPay.isLocked(month))return toast('كشف مرتبات '+month+' مقفول. افتحه الأول.');
  const pid=t.uid('pi'),amount=Math.abs(n(c.diff));
  const b=S.db.batch();
  b.set(S.db.doc('payitems/'+pid),{staffId:who,month,type:'shortage',amount,date:c.date,note:'عجز تقفيل '+c.date,closingId:c.id,ts:Date.now(),by:(S.fbUser&&S.fbUser.email)||''});
  b.update(S.db.doc('closings/'+c.id),{shortageItem:pid,shortageStaff:who});
  if(await wr(()=>b.commit()))toast('اتسجّل على المرتب');
}
async function unshort(id){
  const t=T(),{S,wr,toast}=t;const c=A.cl.find(x=>x.id===id);if(!c||!c.shortageItem)return;
  const b=S.db.batch();b.delete(S.db.doc('payitems/'+c.shortageItem));b.update(S.db.doc('closings/'+c.id),{shortageItem:null,shortageStaff:null});
  if(await wr(()=>b.commit()))toast('اتلغى الخصم');
}
async function delClosing(id){
  const t=T(),{S,wr,toast,closeModal}=t;const c=A.cl.find(x=>x.id===id);if(!c)return;
  if(A.sure!==id){A.sure=id;openDetail(id);return}
  const b=S.db.batch();b.delete(S.db.doc('closings/'+id));
  A.ex.filter(x=>x.closingId===id).forEach(x=>b.delete(S.db.doc('expenses/'+x.id)));
  if(c.shortageItem)b.delete(S.db.doc('payitems/'+c.shortageItem));
  A.sure=null;
  if(await wr(()=>b.commit())){A.openId=null;closeModal();toast('اتحذف')}
}
async function delClosingExp(expId){
  const t=T(),{S,wr,toast}=t;const x=A.ex.find(e=>e.id===expId);if(!x)return;const c=A.cl.find(k=>k.id===x.closingId);
  const b=S.db.batch();b.delete(S.db.doc('expenses/'+expId));
  if(c){
    const exp=r2(A.ex.filter(e=>e.closingId===c.id&&e.id!==expId).reduce((a,e)=>a+n(e.amount),0));
    const expected=r2(n(c.opening)+n(c.pos&&c.pos.cash)-exp-n(c.withdrawn)),diff=r2(n(c.counted)-expected);
    const edits=(c.edits||[]).concat([{ts:Date.now(),by:(S.fbUser&&S.fbUser.email)||'',reason:'حذف مصروف: '+x.cat+' '+x.amount,before:{diff:n(c.diff)}}]);
    b.update(S.db.doc('closings/'+c.id),{expTotal:exp,expected,diff,edits});
  }
  if(await wr(()=>b.commit()))toast('اتحذف المصروف');
}

/* ---------- المصروفات ---------- */
function tabExps(){
  const t=T(),{esc}=t;
  const all=A.ex.slice().sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:(b.ts&&b.ts.toMillis?b.ts.toMillis():0)-(a.ts&&a.ts.toMillis?a.ts.toMillis():0));
  const cats=Array.from(new Set(all.map(x=>x.cat))).sort();
  const list=all.filter(x=>A.cat==='all'||x.cat===A.cat);
  const total=r2(list.reduce((a,x)=>a+n(x.amount),0));
  return monthBar()+'<div class="ctrl"><button class="btn pri" data-aa="xadd">+ مصروف</button></div>'+
    '<div class="chips">'+['all'].concat(cats).map(c=>'<button class="chip" data-aa="xcat" data-c="'+esc(c)+'" aria-pressed="'+(A.cat===c)+'">'+(c==='all'?'الكل':esc(c))+'</button>').join('')+'</div>'+
    '<div class="tiles"><div class="stat"><b class="num">'+nf(total)+'</b><span>إجمالي '+(A.cat==='all'?'المصروفات':esc(A.cat))+'</span></div><div class="stat"><b class="num">'+list.length+'</b><span>عدد البنود</span></div></div>'+
    '<div class="list">'+(list.map(x=>'<article class="item rc" data-aa="'+(x.closingId?'cdet':'xedit')+'" data-id="'+esc(x.closingId||x.id)+'" role="button" tabindex="0"><div class="who"><div><b>'+esc(x.cat)+(x.supplier?' · '+esc(x.supplier):'')+'</b><small class="muted">'+esc(dayTxt(x.date))+(x.note?' · '+esc(x.note):'')+'</small></div></div>'+
      '<div class="st"><b class="num">'+money(n(x.amount))+'</b><span class="pill">'+esc(FROM[x.from]||x.from||'')+(x.closingId?' (تقفيل)':'')+'</span></div></article>').join('')||'<div class="empty">مفيش مصروفات</div>')+'</div>';
}
function xForm(id){
  const t=T(),{S,esc,openModal}=t;const x=id?A.ex.find(e=>e.id===id):null;
  const d=x||{date:S.today<range(A.month)[0]||S.today>range(A.month)[1]?range(A.month)[1]:S.today,cat:CATS[0],amount:'',supplier:'',from:'owner',payer:'',note:''};
  A.xform={id:id||null};
  const cats=CATS.concat([DRAW]);
  openModal('<div class="pf acf"><h2>'+(x?'تعديل مصروف':'مصروف جديد')+'</h2>'+
    '<label class="f">التاريخ<input class="inp" id="xf-date" type="date" value="'+esc(d.date)+'"></label>'+
    '<label class="f">النوع<select class="inp" id="xf-cat">'+cats.map(c=>'<option'+(d.cat===c?' selected':'')+'>'+esc(c)+'</option>').join('')+'</select><small>"'+DRAW+'" مش بتتحسب مصروف في الأرباح.</small></label>'+
    '<label class="f">المبلغ (ج)<input class="inp num" id="xf-amt" type="number" inputmode="decimal" min="0" step="any" value="'+esc(d.amount)+'"></label>'+
    '<label class="f">المورّد / اللي اشتريت منه<input class="inp" id="xf-sup" maxlength="60" value="'+esc(d.supplier||'')+'"></label>'+
    '<label class="f">اتدفع إزاي<select class="inp" id="xf-from">'+['owner','bank','credit'].map(k=>'<option value="'+k+'"'+(d.from===k?' selected':'')+'>'+FROM[k]+'</option>').join('')+'</select></label>'+
    '<label class="f">مين دفع (لو شريك)<input class="inp" id="xf-payer" maxlength="40" value="'+esc(d.payer||'')+'"></label>'+
    '<label class="f">ملاحظة<input class="inp" id="xf-note" maxlength="150" value="'+esc(d.note||'')+'"></label><div class="err" id="xf-err"></div>'+
    '<div class="actions"><button class="btn pri" data-aa="xsave">حفظ</button>'+(x?'<button class="btn bad" data-aa="xdel" data-id="'+esc(id)+'">حذف</button>':'')+'<button class="btn" data-act="close">إلغاء</button></div></div>');
}
async function saveX(){
  const t=T(),{S,$,wr,toast,closeModal}=t;const err=m=>{$('#xf-err').textContent=m};
  const date=$('#xf-date').value,amount=r2(n($('#xf-amt').value));
  if(!date)return err('اختار التاريخ');if(!(amount>0))return err('اكتب المبلغ');
  const old=A.xform.id?A.ex.find(e=>e.id===A.xform.id):null;
  const doc={date,branch:old?old.branch:((S.cfg.branches||[])[0]||{}).id||'',cat:$('#xf-cat').value,amount,supplier:$('#xf-sup').value.trim(),note:$('#xf-note').value.trim(),from:$('#xf-from').value,payer:$('#xf-payer').value.trim(),by:(S.fbUser&&S.fbUser.email)||'',ts:firebase.firestore.FieldValue.serverTimestamp()};
  if(await wr(()=>S.db.doc('expenses/'+(A.xform.id||t.uid('ex'))).set(doc))){A.xform=null;closeModal();toast('اتحفظ')}
}

/* ---------- ملخص الشهر (أرباح وخسائر) ---------- */
function partners(){
  const S=T().S;return Math.max(1,Math.round(n(A.cfg.partners))||((Array.isArray(S.cfg&&S.cfg.owners)&&S.cfg.owners.length)||3));
}
function pnl(){
  const sales=sumPos('total'),byCat={};let draws=0,exTotal=0;
  A.ex.forEach(x=>{const a=n(x.amount);if(x.cat===DRAW)draws+=a;else{byCat[x.cat]=(byCat[x.cat]||0)+a;exTotal+=a}});
  const sal=A.sal&&A.sal.month===A.month&&A.sal.res?r2(A.sal.res.cents/100):null;
  const profit=sal==null?null:r2(sales-exTotal-sal);
  return {sales,byCat,draws:r2(draws),exTotal:r2(exTotal),sal,profit,diff:r2(A.cl.reduce((x,c)=>x+n(c.diff),0))};
}
function loadSal(){
  const P=window.ThrillsPay;if(!P||!P.salaryCost)return;
  if(A.sal&&A.sal.month===A.month&&Date.now()-A.sal.ts<20000)return;
  if(A.salBusy)return;A.salBusy=true;const m=A.month;
  P.salaryCost(m).then(res=>{A.sal={month:m,res,ts:Date.now()}}).catch(()=>{A.sal={month:m,res:null,ts:Date.now()}}).then(()=>{A.salBusy=false;refresh()});
}
function tabPnl(){
  const t=T(),{esc}=t;loadSal();
  const p=pnl(),k=partners(),cats=Object.keys(p.byCat).sort((a,b)=>p.byCat[b]-p.byCat[a]);
  const row=(l,v,cls)=>'<div class="sr'+(cls?' '+cls:'')+'"><span>'+l+'</span><b class="num">'+v+'</b></div>';
  const miss=(()=>{const st=startKey();if(!st)return 0;const [a,b]=range(A.month),last=b<t.S.today?b:t.addDays(t.S.today,-1);let c=0,d=a;while(d<=last){if(d>=st&&!A.cl.some(x=>x.date===d))c++;d=t.addDays(d,1)}return c})();
  const share=p.profit==null?null:r2(p.profit/k);
  return monthBar()+
    (miss?'<div class="unkmsg">فيه '+miss+' يوم ما اتقفلش في الشهر ده، فالمبيعات ممكن تكون ناقصة.</div>':'')+
    '<section class="sum"><h3>الإيرادات</h3>'+row('كاش',money(sumPos('cash')))+row('فيزا',money(sumPos('card')))+row('محافظ',money(sumPos('mobile')))+row('انستاباي / أخرى',money(sumPos('custom')))+row('إجمالي المبيعات',money(p.sales),'big')+
    (sumPos('orders')?row('عدد الأوردرات',nf(sumPos('orders')))+row('متوسط الأوردر',money(sumPos('orders')?p.sales/sumPos('orders'):0)):'')+'</section>'+
    '<section class="sum"><h3>المصروفات</h3>'+(cats.map(c=>row(esc(c),money(p.byCat[c])+' <small class="muted">'+(p.sales?Math.round(p.byCat[c]/p.sales*100):0)+'٪</small>')).join('')||'<div class="muted">مفيش مصروفات متسجّلة</div>')+
    row('إجمالي المصروفات',money(p.exTotal),'big')+row('مرتبات الموظفين'+(A.sal&&A.sal.res&&A.sal.res.locked?'':' <small class="muted">(تقديري لحد ما الشهر يتقفل)</small>'),p.sal==null?'...':money(p.sal))+'</section>'+
    '<section class="sum"><h3>صافي الربح</h3>'+row('الإيرادات − المصروفات − المرتبات',p.profit==null?'...':money(p.profit),'big')+
    (p.profit!=null&&p.sales?row('هامش الربح',Math.round(p.profit/p.sales*100)+'٪'):'')+
    (share!=null?row('نصيب كل شريك (÷ '+k+')',money(share)):'')+
    (p.draws?row('اتسحب فعلاً (شركا)',money(p.draws))+(share!=null?row('الباقي للتوزيع لكل شريك',money(r2(share-p.draws/k))):''):'')+
    '<label class="f" style="max-width:200px">عدد الشركاء<input class="inp num" type="number" min="1" max="20" data-acfg="partners" value="'+k+'"></label></section>'+
    '<section class="sum"><h3>للعلم</h3>'+row('صافي فروق الدرج',sgn(p.diff)+' ج')+
    '<small class="muted">تكلفة الخامات هنا = المشتريات المسجّلة في المصروفات. التكلفة الفعلية لكل صنف هتبقى دقيقة لما نربط تقرير الأصناف المباعة من جيديا.</small></section>'+
    '<div class="actions"><button class="btn" data-aa="csv">تصدير Excel</button></div>';
}
function saveCsv(name,data){
  const csv='﻿'+data.map(r=>r.map(c=>'"'+String(c==null?'':c).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  try{const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000)}
  catch(e){T().toast('مقدرتش أنزّل الملف')}
}
function csv(){
  const p=pnl(),k=partners(),out=[['البند','القيمة'],['مبيعات كاش',sumPos('cash')],['مبيعات فيزا',sumPos('card')],['مبيعات محافظ',sumPos('mobile')],['مبيعات انستاباي / أخرى',sumPos('custom')],['إجمالي المبيعات',p.sales]];
  Object.keys(p.byCat).forEach(c=>out.push(['مصروف: '+c,p.byCat[c]]));
  out.push(['إجمالي المصروفات',p.exTotal],['مرتبات',p.sal==null?'':p.sal],['صافي الربح',p.profit==null?'':p.profit],['عدد الشركاء',k],['نصيب الشريك',p.profit==null?'':r2(p.profit/k)],['مسحوبات الشركاء',p.draws],['صافي فروق الدرج',p.diff]);
  out.push([],['التقفيلات'],['التاريخ','كاش','فيزا','محافظ','أخرى','الإجمالي','العهدة','مصروفات','اتسحب','المفروض','اتعدّ','الفرق','قفّل','ملاحظة']);
  A.cl.slice().sort((a,b)=>a.date<b.date?-1:1).forEach(c=>{const q=c.pos||{};out.push([c.date,q.cash,q.card,q.mobile,q.custom,q.total,c.opening,c.expTotal,c.withdrawn,c.expected,c.counted,c.diff,c.by,c.note||''])});
  out.push([],['المصروفات'],['التاريخ','النوع','المبلغ','المورّد','اتدفع','ملاحظة']);
  A.ex.slice().sort((a,b)=>a.date<b.date?-1:1).forEach(x=>out.push([x.date,x.cat,x.amount,x.supplier||'',FROM[x.from]||x.from,x.note||'']));
  saveCsv('thrills-accounts-'+A.month+'.csv',out);
}

/* ---------- events ---------- */
document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-aa]');if(!el)return;const t=T();if(!t)return;const {S,$,toast}=t;const a=el.dataset.aa;
  const rerender=()=>{if(S.view==='admin'&&$('#abody')&&TABS.indexOf(S.tab)>=0)$('#abody').innerHTML=tab(S.tab)};
  const setMonth=m=>{A.month=m;A.sal=null;A.openId=null;rerender()};
  switch(a){
    case 'open':openWho();break;
    case 'who':pickWho(el.dataset.id);break;
    case 'f-manual':if(A.f){A.f.manual=true;A.f.parseErr='';renderForm(true)}break;
    case 'f-file':if(A.f){A.f.manual=false;renderForm(true)}break;
    case 'f-addexp':if(A.f){A.f.exps.push({cat:CATS[0],amount:'',note:''});renderForm(true)}break;
    case 'f-delexp':if(A.f){A.f.exps.splice(Number(el.dataset.i),1);renderForm(true)}break;
    case 'f-submit':await submit();break;
    case 'mprev':setMonth(shiftM(A.month,-1));break;
    case 'mnext':setMonth(shiftM(A.month,1));break;
    case 'cdet':A.sure=null;openDetail(el.dataset.id);break;
    case 'short':await shortage(el.dataset.id);break;
    case 'unshort':await unshort(el.dataset.id);break;
    case 'cedit':openEdit(el.dataset.id);break;
    case 'cedit-back':A.edit=null;openDetail(el.dataset.id);break;
    case 'cedit-save':await saveEdit();break;
    case 'cdel':await delClosing(el.dataset.id);break;
    case 'cexp-del':await delClosingExp(el.dataset.id);break;
    case 'mclose':A.f=newForm(null,true,el.dataset.d||S.today);renderForm();break;
    case 'xadd':xForm(null);break;
    case 'xedit':xForm(el.dataset.id);break;
    case 'xsave':await saveX();break;
    case 'xdel':{const {wr,closeModal}=t;if(await wr(()=>S.db.doc('expenses/'+el.dataset.id).delete())){closeModal();toast('اتحذف')}}break;
    case 'xcat':A.cat=el.dataset.c;rerender();break;
    case 'csv':csv();break;
  }
});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches&&e.target.matches('[data-aa="cdet"],[data-aa="xedit"]')){e.preventDefault();e.target.click()}});
function onInput(e){
  const x=e.target;if(!x||!x.dataset||!x.dataset.af||!A.f)return;
  setField(x.dataset.af,x.value,x.dataset.i);updateCalc();
}
document.addEventListener('input',onInput);
document.addEventListener('change',async e=>{
  const x=e.target;if(!x)return;
  if(x.id==='af-file'){await onFile(x.files&&x.files[0]);return}
  if(x.dataset&&x.dataset.af)onInput(e);
  if(x.dataset&&x.dataset.acfg){
    const t=T(),{S,wr,toast}=t;const k=x.dataset.acfg;let v=x.value;
    if(k==='partners')v=Math.max(1,Math.min(20,Math.round(n(v))||1));
    x.blur();
    if(await wr(()=>S.db.doc('acfg/main').set({[k]:v},{merge:true})))toast('اتحفظ');
  }
});

window.ThrillsAcct={tab,clear,_t:{parseXlsx,dateFromName,calc,r2}};
})();
