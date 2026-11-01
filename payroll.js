/* Thrills - المرتبات (للمدير بس): بتحسب من الحضور حسب قواعدك: تأخير، غياب، إجازات، نسيان انصراف، إضافي، سلف، عجز كاشير.
   المرتبات والقواعد في collections مقفولة للمدير (pay, paycfg, payitems, paymonths). */
(function(){
'use strict';
const T=()=>window.__T;
const DEF={divisor:30,grace:30,fullAfter:120,lateHalf:0.5,lateFull:1,absentDays:3,leavesMax:3,forgotFree:5,forgotDays:0.5,otRate:1,otMin:15,payDay:5,coverReplace:true};
const P={pay:{},items:[],months:{},cfg:Object.assign({},DEF),month:'',recs:null,recsFor:'',loading:false,uid:null,unsubs:[],ok:{p:false,i:false,m:false,c:false},openId:null,sure:null};
const AR='٠١٢٣٤٥٦٧٨٩';
const n=v=>{const x=parseFloat(String(v==null?'':v).replace(/[٠-٩]/g,d=>AR.indexOf(d)).replace(/[٫,]/g,'.'));return isFinite(x)?x:0};
const pad=x=>String(x).padStart(2,'0');
const nf=(x,d)=>Number(x).toLocaleString('ar-EG-u-nu-latn',{minimumFractionDigits:0,maximumFractionDigits:d==null?2:d});
const c100=v=>Math.round(v*100+1e-9);                  // الفلوس بالقروش (أعداد صحيحة) عشان مفيش فروق تقريب
const money=c=>nf(c/100,2)+' ج';
const sgn=c=>(c>0?'+':c<0?'−':'')+nf(Math.abs(c)/100,2);
const monthOf=k=>k.slice(0,7);
const range=m=>{const p=m.split('-').map(Number);return [m+'-01',m+'-'+pad(new Date(p[0],p[1],0).getDate())]};
const shiftM=(m,d)=>{const p=m.split('-').map(Number);const x=new Date(p[0],p[1]-1+d,1);return x.getFullYear()+'-'+pad(x.getMonth()+1)};
const fmtMonth=m=>{const p=m.split('-').map(Number);return new Date(p[0],p[1]-1,1).toLocaleDateString('ar-EG-u-nu-latn',{month:'long',year:'numeric'})};
const payDateTxt=m=>{const p=shiftM(m,1).split('-').map(Number);return new Date(p[0],p[1]-1,P.cfg.payDay).toLocaleDateString('ar-EG-u-nu-latn',{day:'numeric',month:'long'})};
const defMonth=()=>{const d=new Date();const m=d.getFullYear()+'-'+pad(d.getMonth()+1);return d.getDate()<=P.cfg.payDay?shiftM(m,-1):m};

/* ---------- pure calculation (بتتختبر لوحدها) ---------- */
function compute(st,pay,recs,items,cfg,month,env){
  const salary=n(pay&&pay.salary),day=salary/cfg.divisor,hour=day/env.shiftHours;
  const [from,to]=range(month),mine=recs.filter(r=>r.staffId===st.id);
  const its=items.filter(i=>i.staffId===st.id&&i.month===month);
  const coverIn=items.filter(i=>i.type==='cover'&&i.month===month&&i.coverId===st.id);   // اللي غطّى
  const coverOut=items.filter(i=>i.type==='cover'&&i.month===month&&i.lateId===st.id);   // المتأخر
  const created=st.createdAt?env.dkey(st.createdAt):'0000-00-00';
  const days=[],lines=[],warns=[],leaves=[],forgot=[];
  const L=(k,label,cents,date)=>{if(cents)lines.push({k,label,c:cents,date:date||null})};
  let k=from;
  while(k<=to){
    const rs=mine.filter(r=>r.date===k).sort((a,b)=>a.inAt-b.inAt),row={k,status:'',late:0,ot:0,otOk:0,note:''};
    if(k>env.today){row.status='future'}
    else if(rs.length){
      row.status='present';const r0=rs[0];
      const off=r0.shiftStart?env.offsetOf(r0.inAt,r0.shiftStart):null;
      row.late=off!=null&&off>0?Math.round(off):0;
      const waive=its.some(i=>i.type==='late_ok'&&i.date===k),cov=coverOut.find(i=>i.date===k&&i.replace);
      let dd=row.late>cfg.fullAfter?cfg.lateFull:row.late>cfg.grace?cfg.lateHalf:0;
      row.lateDays=dd;
      if(dd&&waive){row.lateWaived=true;dd=0}
      if(dd&&cov){row.lateCover=true;dd=0}
      if(dd)L('late','تأخير '+row.late+' د ('+(dd===1?'يوم':'نص يوم')+')',-c100(dd*day),k);
      if(off!=null){
        const end=r0.inAt-off*60000+env.shiftHours*3600e3,last=rs.filter(r=>r.outAt).sort((a,b)=>b.outAt-a.outAt)[0];
        if(last){const m=Math.floor((last.outAt-end)/60000);if(m>=cfg.otMin)row.ot=m}
      }
      const oi=its.find(i=>i.type==='ot'&&i.date===k);
      if(oi){row.otOk=n(oi.mins);L('ot','إضافي '+row.otOk+' د',c100(row.otOk/60*hour*cfg.otRate),k)}
      if(rs.some(r=>r.earlyLeave))row.early=rs.find(r=>r.earlyLeave).earlyLeave;
      if(rs.some(r=>!r.outAt&&(k<env.today||env.now-r.inAt>=env.openMax))){row.forgot=true;forgot.push(k)}
    }else if(k<created){row.status='before'}
    else if(st.dayOff===env.dow(k)){row.status='off'}
    else if(k===env.today){row.status='today'}
    else if(its.some(i=>i.type==='leave'&&i.date===k)){row.status='leave';leaves.push(k)}
    else if(its.some(i=>i.type==='absent_ok'&&i.date===k)){row.status='waived'}
    else{row.status='absent';L('absent','غياب بدون إذن '+k.slice(8)+' ('+cfg.absentDays+' أيام)',-c100(cfg.absentDays*day),k)}
    days.push(row);k=env.addDays(k,1);
  }
  forgot.forEach((d,i)=>{if(i>=cfg.forgotFree)L('forgot','نسيان انصراف رقم '+(i+1)+' (بعد '+cfg.forgotFree+' تحذيرات)',-c100(cfg.forgotDays*day),d)});
  if(forgot.length&&forgot.length<=cfg.forgotFree)warns.push('نسي الانصراف '+forgot.length+' من '+cfg.forgotFree+' (تحذير)');
  if(leaves.length>cfg.leavesMax)warns.push('إجازات بإذن '+leaves.length+' أكتر من المسموح ('+cfg.leavesMax+')');
  if(leaves.some(d=>leaves.indexOf(env.addDays(d,1))>=0))warns.push('فيه إجازات ورا بعض');
  its.forEach(i=>{
    const a=c100(n(i.amount));
    if(i.type==='advance')L('advance','سلفة'+(i.note?' - '+i.note:''),-a,i.date);
    else if(i.type==='shortage')L('shortage','عجز كاشير'+(i.note?' - '+i.note:''),-a,i.date);
    else if(i.type==='penalty')L('penalty','جزاء'+(i.note?' - '+i.note:''),-a,i.date);
    else if(i.type==='bonus')L('bonus','مكافأة'+(i.note?' - '+i.note:''),a,i.date);
  });
  coverIn.forEach(i=>L('cover','غطّى مكان زميل '+n(i.hours)+' ساعة',c100(n(i.hours)*hour*cfg.otRate),i.date));
  coverOut.forEach(i=>L('cover','اتغطّى مكانه '+n(i.hours)+' ساعة',-c100(n(i.hours)*(i.rate||hour)*cfg.otRate),i.date));
  const base=c100(salary);let net=base;lines.forEach(l=>{net+=l.c});
  const sum=ks=>lines.filter(l=>ks.indexOf(l.k)>=0).reduce((a,l)=>a+l.c,0);
  if(salary>0&&net<0)warns.push('الصافي سالب');
  return {id:st.id,name:st.name,branch:st.branch,salary,base,day:c100(day),hour:c100(hour),days,lines,warns,net,
    late:sum(['late']),absent:sum(['absent']),forgot:sum(['forgot']),adv:sum(['advance']),short:sum(['shortage']),pen:sum(['penalty']),
    ot:sum(['ot']),bonus:sum(['bonus']),cover:sum(['cover']),
    cnt:{late:days.filter(d=>d.lateDays&&!d.lateWaived).length,absent:days.filter(d=>d.status==='absent').length,leave:leaves.length,forgot:forgot.length}};
}

/* ---------- data ---------- */
function env(){
  const t=T();return {today:t.dkey(Date.now()),now:Date.now(),openMax:t.OPEN_MAX,shiftHours:Number(t.S.cfg&&t.S.cfg.shiftHours)||9,offsetOf:t.offsetOf,addDays:t.addDays,dkey:t.dkey,dow:k=>t.fromKey(k).getDay()};
}
function sub(){
  const t=T(),S=t.S;const u=S.fbUser&&S.fbUser.uid;if(!S.db||!u||P.uid===u)return;
  P.unsubs.forEach(f=>{try{f()}catch(e){}});P.unsubs=[];P.uid=u;P.ok={p:false,i:false,m:false,c:false};if(!P.month)P.month=defMonth();
  const fail=()=>{P.uid=null};
  P.unsubs.push(S.db.collection('pay').onSnapshot(q=>{P.pay={};q.docs.forEach(d=>{P.pay[d.id]=d.data()});P.ok.p=true;refresh()},()=>{P.ok.p=true;fail();refresh()}));
  P.unsubs.push(S.db.collection('payitems').onSnapshot(q=>{P.items=t.mapDocs(q);P.ok.i=true;refresh()},()=>{P.ok.i=true;fail();refresh()}));
  P.unsubs.push(S.db.collection('paymonths').onSnapshot(q=>{P.months={};q.docs.forEach(d=>{P.months[d.id]=d.data()});P.ok.m=true;refresh()},()=>{P.ok.m=true;fail();refresh()}));
  P.unsubs.push(S.db.doc('paycfg/main').onSnapshot(s=>{P.cfg=Object.assign({},DEF,s.exists?s.data():{});P.ok.c=true;refresh()},()=>{P.ok.c=true;fail();refresh()}));
}
function clear(){
  P.unsubs.forEach(f=>{try{f()}catch(e){}});P.unsubs=[];P.uid=null;P.pay={};P.items=[];P.months={};P.recs=null;P.recsFor='';P.cfg=Object.assign({},DEF);P.openId=null;P.month='';
  P.ok={p:false,i:false,m:false,c:false};
}
const ready=()=>P.ok.p&&P.ok.i&&P.ok.m&&P.ok.c;
async function loadRecs(){
  const {S,mapDocs}=T();if(P.recsFor===P.month&&P.recs)return;
  if(P.loading)return;P.loading=true;const m=P.month,[a,b]=range(m);
  try{const q=await S.db.collection('attendance').where('date','>=',a).where('date','<=',b).get();P.recs=mapDocs(q);P.recsFor=m}
  catch(e){P.recs=[];P.recsFor=m;T().toast('مقدرتش أحمّل الحضور، جرب تاني')}
  P.loading=false;refresh();
}
function activeStaff(){
  const {S}=T();return S.staff.filter(s=>s.active!==false||(P.recs||[]).some(r=>r.staffId===s.id)).sort((a,b)=>a.name.localeCompare(b.name,'ar'));
}
function rows(){
  const snap=P.months[P.month];
  if(snap&&snap.locked&&snap.rows)return snap.rows.map(r=>Object.assign({snap:true},r));
  const e=env();return activeStaff().map(s=>compute(s,P.pay[s.id],P.recs||[],P.items,P.cfg,P.month,e));
}
function refresh(){
  const t=T();if(!t)return;const {S,$}=t;
  if(S.view!=='admin'||!$('#abody'))return;
  if(S.tab==='payroll'){
    const a=document.activeElement;if(a&&a.closest&&a.closest('#abody')&&/INPUT|SELECT|TEXTAREA/.test(a.tagName))return;
    $('#abody').innerHTML=tabPayroll();
    if(P.openId&&$('#modal .pd'))openDetail(P.openId);
  }else if(S.tab==='payset'&&!(document.activeElement&&document.activeElement.closest&&document.activeElement.closest('#abody')&&/INPUT|SELECT/.test(document.activeElement.tagName))){
    $('#abody').innerHTML=tabSet();
  }
}

/* ---------- statement tab ---------- */
const ST={present:'حاضر',absent:'غياب',leave:'إجازة بإذن',waived:'معفى',off:'إجازة أسبوعية',future:'',before:'',today:'النهارده'};
function tabPayroll(){
  sub();if(!ready())return '<div class="empty">جاري التحميل...</div>';
  if(!P.month)P.month=defMonth();
  loadRecs();
  const {esc}=T();const snap=P.months[P.month],locked=!!(snap&&snap.locked);
  const head='<h2 style="font-size:1.3rem">مرتبات '+fmtMonth(P.month)+'</h2>'+
    '<div class="ctrl"><button class="btn sm" data-pa="mprev">← الشهر اللي قبله</button><button class="btn sm" data-pa="mnext">الشهر اللي بعده →</button>'+
    '<span class="pill '+(locked?'ok':'warn')+'">'+(locked?'مقفول':'مفتوح')+'</span><small class="muted">يُصرف '+payDateTxt(P.month)+'</small></div>';
  if(!locked&&(P.recsFor!==P.month||!P.recs))return head+'<div class="empty">جاري تحميل الحضور...</div>';
  const rs=rows(),tot=a=>rs.reduce((x,r)=>x+(a(r)||0),0);
  const withSal=rs.filter(r=>r.salary>0);
  const noSal=rs.filter(r=>!(r.salary>0));
  const ded=tot(r=>r.late+r.absent+r.forgot+r.adv+r.short+r.pen+Math.min(0,r.cover)),add=tot(r=>r.ot+r.bonus+Math.max(0,r.cover));
  const tiles='<div class="tiles"><div class="stat"><b>'+nf(tot(r=>r.base)/100,0)+'</b><span>إجمالي المرتبات</span></div><div class="stat bad"><b>'+nf(Math.abs(ded)/100,0)+'</b><span>خصومات</span></div><div class="stat ok"><b>'+nf(add/100,0)+'</b><span>إضافي ومكافآت</span></div><div class="stat"><b>'+nf(tot(r=>r.salary>0?r.net:0)/100,0)+'</b><span>صافي المطلوب دفعه</span></div></div>';
  const paid=(snap&&snap.paid)||{};
  const card=r=>'<article class="item rc" data-pa="det" data-id="'+esc(r.id)+'" role="button" tabindex="0"><div class="who"><span class="av">'+esc(Array.from(r.name)[0]||'؟')+'</span><div><b>'+esc(r.name)+'</b><small>'+esc((r.branch?T().brName(r.branch):'')+(r.salary>0?' · مرتب '+nf(r.salary,0):''))+'</small></div></div>'+
    '<div class="st">'+(r.salary>0?'':'<span class="pill warn">حدد المرتب</span>')+(r.cnt&&r.cnt.late?'<span class="pill warn">تأخير '+r.cnt.late+'</span>':'')+(r.cnt&&r.cnt.absent?'<span class="pill bad">غياب '+r.cnt.absent+'</span>':'')+(r.cnt&&r.cnt.forgot?'<span class="pill">نسيان '+r.cnt.forgot+'</span>':'')+((r.warns||[]).length?'<span class="pill warn">⚠</span>':'')+
    (paid[r.id]?'<span class="pill ok">اتدفع</span>':'')+(r.salary>0?'<b class="num" style="font-family:var(--f-display);font-size:1.15rem">'+money(r.net)+'</b>':'')+'</div></article>';
  return head+tiles+
    '<div class="ctrl"><button class="btn" data-pa="csv">تصدير Excel (ملخص)</button><button class="btn" data-pa="csvd">تصدير Excel (التفاصيل)</button>'+
    (locked?'<button class="btn bad sm" data-pa="unlock">إعادة فتح الشهر</button>':'<button class="btn pri" data-pa="lock">اقفل الشهر</button>')+'</div>'+
    (locked?'<div class="fnote" style="background:var(--ok-bg);color:var(--ok)">الشهر مقفول، الأرقام ثابتة ومش هتتأثر بأي تعديل بعد كده. لو محتاج تعدّل افتحه الأول.</div>':'<div class="muted" style="font-size:.9rem">الأرقام مبدئية لحد ما تراجعها وتقفل الشهر. اضغط على أي موظف تشوف التفاصيل وتعدّل.</div>')+
    '<div class="list">'+(withSal.length?withSal.map(card).join(''):'')+(noSal.length?'<h3 style="margin:10px 0 0">من غير مرتب مسجّل</h3>'+noSal.map(card).join(''):'')+(rs.length?'':'<div class="empty">مفيش موظفين.</div>')+'</div>';
}

/* ---------- detail ---------- */
function rowOf(id){return rows().find(r=>r.id===id)}
function openDetail(id){
  const t=T(),{esc,openModal,fmtDateY}=t;const r=rowOf(id);if(!r)return;P.openId=id;
  const locked=!!(P.months[P.month]&&P.months[P.month].locked);
  const lineHTML=l=>'<div class="sr"><span>'+esc(l.label)+(l.date?' <small class="muted">'+esc(l.date.slice(5))+'</small>':'')+'</span><b style="color:var(--'+(l.c<0?'bad':'ok')+')">'+sgn(l.c)+'</b></div>';
  const sum='<div class="sum"><div class="sr"><span>المرتب الأساسي</span><b>'+money(r.base)+'</b></div>'+(r.lines.length?r.lines.map(lineHTML).join(''):'<div class="muted">مفيش خصومات ولا إضافات</div>')+
    '<div class="sr big"><span>الصافي</span><b>'+money(r.net)+'</b></div></div>';
  const warns=(r.warns||[]).map(w=>'<div class="fnote">⚠ '+esc(w)+'</div>').join('');
  let table='';
  if(!locked&&r.days){
    const act=d=>{
      const b=[];
      if(d.status==='absent')b.push(['leave','إجازة بإذن'],['absent_ok','إعفاء']);
      if(d.lateDays&&!d.lateWaived&&!d.lateCover)b.push(['late_ok','إعفاء'],['cover','اتغطّى مكانه']);
      if(d.ot&&!d.otOk)b.push(['ot','اعتمد '+d.ot+' د']);
      if(d.otOk)b.push(['unot','إلغاء الإضافي']);
      return b.map(x=>'<button class="btn sm" data-pa="day" data-d="'+d.k+'" data-t="'+x[0]+'" data-m="'+(d.ot||0)+'">'+x[1]+'</button>').join(' ');
    };
    const det=d=>{
      const a=[];
      if(d.status==='present'){if(d.late>0)a.push('وصل متأخر '+d.late+' د'+(d.lateWaived?' (معفى)':d.lateCover?' (اتغطّى)':''));else a.push('في الميعاد');
        if(d.early)a.push('انصرف بدري وبلّغ '+d.early.to);if(d.forgot)a.push('نسي الانصراف');if(d.ot)a.push('زيادة '+d.ot+' د'+(d.otOk?' (معتمد)':''))}
      return a.join(' · ');
    };
    const vis=r.days.filter(d=>d.status!=='future'&&d.status!=='before'&&(d.status!=='present'||d.late>0||d.ot||d.forgot||d.early));
    table='<h3>الأيام اللي محتاجة نظرة</h3>'+(vis.length?'<div class="scroll"><table class="tbl" style="min-width:0"><tbody>'+vis.map(d=>'<tr><td>'+esc(d.k.slice(8))+'/'+esc(d.k.slice(5,7))+'</td><td>'+esc(ST[d.status]||'')+'</td><td style="white-space:normal">'+esc(det(d))+'</td><td>'+act(d)+'</td></tr>').join('')+'</tbody></table></div>':'<div class="muted">كل الأيام تمام.</div>');
  }
  const its=P.items.filter(i=>i.month===P.month&&(i.staffId===id||i.coverId===id||i.lateId===id)).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  const TL={advance:'سلفة',shortage:'عجز كاشير',bonus:'مكافأة',penalty:'جزاء',leave:'إجازة بإذن',absent_ok:'إعفاء غياب',late_ok:'إعفاء تأخير',ot:'إضافي',cover:'تغطية'};
  const itemsHTML=its.length&&!locked?'<h3>اللي اتسجّل</h3><div class="list">'+its.map(i=>'<div class="fr"><b>'+esc(TL[i.type]||i.type)+(i.date?' <small class="muted">'+esc(i.date.slice(5))+'</small>':'')+'</b><span>'+(i.amount?nf(i.amount):i.mins?i.mins+' د':i.hours?i.hours+' س':'')+(i.note?' · '+esc(i.note):'')+'</span><button class="btn sm bad" data-pa="delitem" data-id="'+esc(i.id)+'">شيل</button></div>').join('')+'</div>':'';
  const adds=locked?'':'<div class="actions"><button class="btn sm" data-pa="add" data-t="advance">+ سلفة</button><button class="btn sm" data-pa="add" data-t="shortage">+ عجز كاشير</button><button class="btn sm" data-pa="add" data-t="bonus">+ مكافأة</button><button class="btn sm" data-pa="add" data-t="penalty">+ جزاء</button><button class="btn sm" data-pa="add" data-t="leave">+ إجازة بإذن</button><button class="btn sm" data-pa="add" data-t="ot">+ إضافي</button></div>';
  const snap=P.months[P.month],paid=snap&&snap.paid&&snap.paid[id];
  openModal('<div class="pd"><h2>'+esc(r.name)+' <small class="muted">· '+fmtMonth(P.month)+'</small></h2>'+
    (r.salary>0?'<div class="muted">اليوم = '+money(r.day||0)+' · الساعة = '+money(r.hour||0)+'</div>':'<div class="fnote">مفيش مرتب مسجّل للموظف ده. حدده من "المرتبات والقواعد".</div>')+
    warns+sum+table+itemsHTML+adds+
    (locked&&r.salary>0?'<div class="actions"><button class="btn '+(paid?'':'pri')+'" data-pa="paid" data-id="'+esc(id)+'">'+(paid?'اتدفع ✓ (دوس للإلغاء)':'تم دفع المرتب')+'</button></div>':'')+
    '<div class="actions"><button class="btn" data-act="close">إغلاق</button></div></div>','wide');
}
async function addItem(o){
  const t=T(),S=t.S;const id=t.uid('pi');
  const doc=Object.assign({ts:Date.now(),by:(S.fbUser&&S.fbUser.email)||''},o);
  return t.wr(()=>S.db.doc('payitems/'+id).set(doc));
}
function form(type,staffId,preDate){
  const t=T(),{esc,openModal,S}=t;const r=rowOf(staffId);P.openId=null;P.form={type,staffId};
  const today=t.dkey(Date.now()),[a,b]=range(P.month),dflt=preDate||(today>=a&&today<=b?today:b);
  const TTL={advance:'سلفة',shortage:'عجز كاشير',bonus:'مكافأة',penalty:'جزاء',leave:'إجازة بإذن',ot:'إضافي معتمد',cover:'تغطية مكان زميل'};
  const amt='<label class="f">المبلغ (ج)<input id="pf-amt" class="inp num" type="number" inputmode="decimal" min="0" step="any"></label>';
  const dt='<label class="f">التاريخ<input id="pf-date" class="inp" type="date" value="'+dflt+'" min="'+a+'" max="'+b+'"></label>';
  const note='<label class="f">ملاحظة<input id="pf-note" class="inp" autocomplete="off"></label>';
  let body='';
  if(type==='advance')body=amt+'<label class="f">يتخصم على كام شهر؟<input id="pf-parts" class="inp num" type="number" min="1" max="12" value="1"><small>لو أكتر من 1 هتتقسم بالتساوي من الشهر ده.</small></label>'+note;
  else if(type==='shortage')body=amt+dt+note;
  else if(type==='bonus'||type==='penalty')body=amt+note;
  else if(type==='leave')body=dt;
  else if(type==='ot')body=dt+'<label class="f">الدقايق<input id="pf-min" class="inp num" type="number" min="1" step="1"></label>';
  openModal('<div class="pf"><h2>'+TTL[type]+' · '+esc(r?r.name:'')+'</h2>'+body+'<div class="err" id="pf-err"></div><div class="actions"><button class="btn pri" data-pa="formsave">حفظ</button><button class="btn" data-pa="formback">رجوع</button></div></div>');
}
async function saveForm(){
  const {$}=T();const f=P.form;if(!f)return;const err=m=>{$('#pf-err').textContent=m};
  const base={staffId:f.staffId,month:P.month,type:f.type};const val=id=>$(id)?$(id).value:'';
  let ok=true;
  if(f.type==='advance'){
    const amt=n(val('#pf-amt')),parts=Math.max(1,Math.min(12,Math.round(n(val('#pf-parts'))||1)));
    if(!(amt>0))return err('اكتب المبلغ');
    const each=Math.floor(c100(amt)/parts),rem=c100(amt)-each*parts;
    for(let i=0;i<parts&&ok;i++)ok=await addItem(Object.assign({},base,{month:shiftM(P.month,i),amount:(each+(i===parts-1?rem:0))/100,note:val('#pf-note')+(parts>1?' ('+(i+1)+'/'+parts+')':''),date:null}));
  }else if(f.type==='shortage'||f.type==='bonus'||f.type==='penalty'){
    const amt=n(val('#pf-amt'));if(!(amt>0))return err('اكتب المبلغ');
    ok=await addItem(Object.assign({},base,{amount:amt,note:val('#pf-note'),date:val('#pf-date')||null}));
  }else if(f.type==='leave'){
    const d=val('#pf-date');if(!d)return err('اختار التاريخ');
    ok=await addItem(Object.assign({},base,{date:d,month:d.slice(0,7)}));
  }else if(f.type==='ot'){
    const d=val('#pf-date'),m=Math.round(n(val('#pf-min')));if(!d||!(m>0))return err('اكتب التاريخ والدقايق');
    ok=await addItem(Object.assign({},base,{date:d,month:d.slice(0,7),mins:m}));
  }else if(f.type==='cover'){
    const cid=val('#pf-cover'),h=n(val('#pf-hours'));if(!cid||!(h>0))return err('اختار اللي غطّى وعدد الساعات');
    const cv=rowOf(cid);
    ok=await addItem({type:'cover',month:P.month,date:f.date,lateId:f.staffId,coverId:cid,hours:h,rate:(cv&&cv.hour||0)/100,replace:$('#pf-rep').checked});
  }
  if(ok){P.form=null;T().toast('اتسجّل');openDetail(f.staffId)}
}
function coverForm(staffId,date){
  const t=T(),{esc,openModal,S}=t;const r=rowOf(staffId),d=r.days.find(x=>x.k===date);P.openId=null;P.form={type:'cover',staffId,date};
  const others=activeStaff().filter(s=>s.id!==staffId);
  openModal('<div class="pf"><h2>اتغطّى مكانه · '+esc(r.name)+'</h2><p class="muted" style="margin:0">'+esc(r.name)+' اتأخر '+d.late+' دقيقة يوم '+esc(date.slice(5))+'. مين اللي استناه أو وقف مكانه؟ إضافي الزميل بيتدفع له وبيتخصم من المتأخر.</p>'+
    '<label class="f">اللي غطّى<select id="pf-cover" class="inp"><option value="">اختار</option>'+others.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+'</option>').join('')+'</select></label>'+
    '<label class="f">عدد ساعات التغطية<input id="pf-hours" class="inp num" type="number" min="0.25" step="0.25" value="'+Math.round(d.late/60*4)/4+'"></label>'+
    '<label class="f" style="flex-direction:row;align-items:center;gap:10px"><input id="pf-rep" type="checkbox" '+(P.cfg.coverReplace?'checked':'')+' style="width:20px;height:20px"> يتخصم من المتأخر بدل خصم التأخير العادي</label>'+
    '<div class="err" id="pf-err"></div><div class="actions"><button class="btn pri" data-pa="formsave">حفظ</button><button class="btn" data-pa="formback">رجوع</button></div></div>');
}

/* ---------- salaries & rules tab ---------- */
function tabSet(){
  sub();if(!ready())return '<div class="empty">جاري التحميل...</div>';
  const {esc,S}=T();const c=P.cfg;
  const f=(k,label,hint,step)=>'<label class="f">'+label+'<input class="inp num" type="number" inputmode="decimal" min="0" step="'+(step||'any')+'" data-pc="'+k+'" value="'+esc(c[k])+'">'+(hint?'<small>'+hint+'</small>':'')+'</label>';
  const list=S.staff.filter(s=>s.active!==false).sort((a,b)=>a.name.localeCompare(b.name,'ar'));
  return '<h2 style="font-size:1.3rem">المرتبات والقواعد</h2>'+
    '<section class="sec"><h3>مرتب كل موظف (شهري)</h3><small class="muted">المرتبات دي ما بتظهرش غير ليك.</small><div class="list">'+
    (list.length?list.map(s=>'<div class="item"><div class="who"><span class="av">'+esc(Array.from(s.name)[0]||'؟')+'</span><div><b>'+esc(s.name)+'</b><small>'+esc(T().brName(s.branch))+'</small></div></div>'+
      '<input class="inp num" style="width:130px" type="number" inputmode="decimal" min="0" step="any" placeholder="المرتب" data-psal="'+esc(s.id)+'" value="'+((P.pay[s.id]&&P.pay[s.id].salary)||'')+'" aria-label="مرتب '+esc(s.name)+'"></div>').join(''):'<div class="empty">ضيف موظفين الأول.</div>')+'</div></section>'+
    '<section class="sec"><h3>قواعد الحساب</h3>'+
    '<div class="row2">'+f('divisor','أيام الشهر لحساب قيمة اليوم','المرتب ÷ الرقم ده = قيمة اليوم. ساعة الوردية من الإعدادات.')+f('payDay','يوم صرف المرتب في الشهر','')+'</div>'+
    '<div class="row2">'+f('grace','سماح التأخير (دقيقة)','لحد كده مفيش خصم.')+f('fullAfter','التأخير اللي بعده يوم كامل (دقيقة)','أكتر من كده يتخصم يوم كامل.')+'</div>'+
    '<div class="row2">'+f('lateHalf','خصم التأخير العادي (يوم)','بعد السماح وقبل الحد الأعلى.')+f('lateFull','خصم التأخير الكبير (يوم)','')+'</div>'+
    '<div class="row2">'+f('absentDays','خصم الغياب بدون إذن (أيام)','')+f('leavesMax','الإجازات بإذن المسموحة في الشهر','')+'</div>'+
    '<div class="row2">'+f('forgotFree','نسيان الانصراف: عدد التحذيرات في الشهر','بعدها كل مرة يتخصم.')+f('forgotDays','خصم كل مرة بعد التحذيرات (يوم)','')+'</div>'+
    '<div class="row2">'+f('otRate','معامل الإضافي','1 = الساعة بنفس سعرها العادي. 1.5 = ساعة ونص.')+f('otMin','أقل إضافي يتعرض للاعتماد (دقيقة)','')+'</div>'+
    '<label class="f" style="flex-direction:row;align-items:center;gap:10px"><input type="checkbox" data-pcb="coverReplace"'+(c.coverReplace?' checked':'')+' style="width:20px;height:20px"> التغطية تخصم من المتأخر بدل خصم التأخير العادي (الافتراضي)</label>'+
    '<div class="actions"><button class="btn pri" data-pa="cfgsave">حفظ القواعد</button></div></section>';
}

/* ---------- csv ---------- */
function saveCsv(name,data){
  const csv='﻿'+data.map(r=>r.map(c=>'"'+String(c==null?'':c).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  try{const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000)}
  catch(e){T().toast('مقدرتش أنزّل الملف')}
}
const E=c=>(c/100).toFixed(2);
function csvSummary(){
  const rs=rows();
  saveCsv('thrills-payroll-'+P.month+'.csv',[['الموظف','الفرع','المرتب','قيمة اليوم','خصم تأخير','خصم غياب','خصم نسيان انصراف','سلف','عجز كاشير','جزاءات','إضافي','مكافآت','تغطية','الصافي']].concat(
    rs.map(r=>[r.name,r.branch?T().brName(r.branch):'',E(r.base),E(r.day||0),E(r.late),E(r.absent),E(r.forgot),E(r.adv),E(r.short),E(r.pen),E(r.ot),E(r.bonus),E(r.cover),E(r.net)])));
}
function csvDetail(){
  const out=[['الموظف','التاريخ','البند','المبلغ']];
  rows().forEach(r=>{out.push([r.name,'','المرتب الأساسي',E(r.base)]);r.lines.forEach(l=>out.push([r.name,l.date||'',l.label,E(l.c)]));out.push([r.name,'','الصافي',E(r.net)])});
  saveCsv('thrills-payroll-details-'+P.month+'.csv',out);
}

/* ---------- events ---------- */
document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-pa]');if(!el)return;const t=T();if(!t)return;const {S,$,wr,toast,closeModal}=t;const a=el.dataset.pa;
  const rerender=()=>{if(S.tab==='payroll'&&$('#abody'))$('#abody').innerHTML=tabPayroll()};
  const setMonth=m=>{P.month=m;P.recs=null;P.recsFor='';P.openId=null;rerender()};
  switch(a){
    case 'mprev':setMonth(shiftM(P.month,-1));break;
    case 'mnext':setMonth(shiftM(P.month,1));break;
    case 'det':openDetail(el.dataset.id);break;
    case 'add':form(el.dataset.t,P.openId||P.lastId);break;
    case 'formback':{const id=P.form&&P.form.staffId;P.form=null;if(id)openDetail(id);else closeModal()}break;
    case 'formsave':await saveForm();break;
    case 'day':{
      const id=P.openId,d=el.dataset.d,ty=el.dataset.t;
      if(ty==='cover'){coverForm(id,d);break}
      if(ty==='unot'){const it=P.items.find(i=>i.staffId===id&&i.type==='ot'&&i.date===d);if(it)await wr(()=>S.db.doc('payitems/'+it.id).delete());break}
      const doc={staffId:id,month:d.slice(0,7),type:ty,date:d};if(ty==='ot')doc.mins=Number(el.dataset.m)||0;
      await addItem(doc);break;
    }
    case 'delitem':await wr(()=>S.db.doc('payitems/'+el.dataset.id).delete());break;
    case 'lock':{
      if(P.sure!=='lock'){P.sure='lock';el.textContent='دوس تاني للتأكيد';break}
      P.sure=null;const rs=rows().map(r=>({id:r.id,name:r.name,branch:r.branch||'',salary:r.salary,base:r.base,day:r.day,hour:r.hour,lines:r.lines,warns:r.warns||[],net:r.net,late:r.late,absent:r.absent,forgot:r.forgot,adv:r.adv,short:r.short,pen:r.pen,ot:r.ot,bonus:r.bonus,cover:r.cover,cnt:r.cnt}));
      const old=P.months[P.month]||{};
      if(await wr(()=>S.db.doc('paymonths/'+P.month).set({locked:true,lockedAt:Date.now(),by:(S.fbUser&&S.fbUser.email)||'',rows:rs,paid:old.paid||{}})))toast('الشهر اتقفل');
    }break;
    case 'unlock':{
      if(P.sure!=='unlock'){P.sure='unlock';el.textContent='دوس تاني للتأكيد';break}
      P.sure=null;const old=P.months[P.month]||{};
      if(await wr(()=>S.db.doc('paymonths/'+P.month).set({locked:false,rows:null,paid:old.paid||{}})))toast('الشهر اتفتح');
    }break;
    case 'paid':{
      const old=P.months[P.month]||{},paid=Object.assign({},old.paid||{});const id=el.dataset.id;if(paid[id])delete paid[id];else paid[id]=Date.now();
      if(await wr(()=>S.db.doc('paymonths/'+P.month).set(Object.assign({},old,{paid}))))openDetail(id);
    }break;
    case 'csv':csvSummary();break;
    case 'csvd':csvDetail();break;
    case 'cfgsave':{
      const c=Object.assign({},P.cfg);document.querySelectorAll('[data-pc]').forEach(i=>{c[i.dataset.pc]=n(i.value)});document.querySelectorAll('[data-pcb]').forEach(i=>{c[i.dataset.pcb]=i.checked});
      if(!(c.divisor>=1))return toast('أيام الشهر لازم تكون 1 أو أكتر');
      if(c.grace>c.fullAfter)return toast('السماح لازم يكون أقل من حد اليوم الكامل');
      if(await wr(()=>S.db.doc('paycfg/main').set(c))){P.cfg=Object.assign({},DEF,c);toast('اتحفظت القواعد')}
    }break;
  }
  if(a!=='lock'&&a!=='unlock')P.sure=null;
  if(a==='det')P.lastId=el.dataset.id;
});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches&&e.target.matches('[data-pa="det"]')){e.preventDefault();e.target.click()}});
document.addEventListener('change',async e=>{
  const x=e.target;if(!x||!x.dataset||!x.dataset.psal)return;const t=T();
  const v=n(x.value);const id=x.dataset.psal;
  if(await t.wr(()=>t.S.db.doc('pay/'+id).set({salary:v,updatedAt:Date.now()},{merge:true})))t.toast('اتحفظ');
});

window.ThrillsPay={tab(name){return name==='payset'?tabSet():tabPayroll()},clear,_t:{compute,DEF,c100}};
})();
