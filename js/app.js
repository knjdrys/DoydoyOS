/* Kenjie/Doydoy OS — Final build
   No frameworks, no external services required for core features.
   Local-first storage: IndexedDB + PWA cache.
*/
const DB_NAME='doydoy-os';
const DB_VERSION=5;
const STORES=['tasks','notes','subjects','events','expenses','goals','snippets','studySessions','settings','habits','resources','projects'];
const NAV=[
  ['dashboard','Command Center','⌂','Workspace'],['tasks','Tasks','✓','Workspace'],['calendar','Calendar','▦','Workspace'],['student','Student Hub','▤','Workspace'],['notes','Notes','✎','Workspace'],
  ['developer','Developer Hub','</>','Knowledge'],['finance','Finance','₱','Knowledge'],['goals','Goals','◎','Personal'],['focus','Focus','◷','Personal'],['habits','Habits','◌','Personal'],['analytics','Analytics','◒','Insights'],['data','Data & Backup','⇅','System']
];
const state={
  page:'dashboard',calendarCursor:new Date(new Date().getFullYear(),new Date().getMonth(),1),
  taskFilter:'all',taskSearch:'',noteSearch:'',calendarType:'all',
  timer:{seconds:25*60,running:false,mode:'Focus',subjectId:''},timerTick:null
};
const $=s=>document.querySelector(s);
const $$=s=>Array.from(document.querySelectorAll(s));
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function dateISO(d=new Date()){const x=new Date(d);return new Date(x.getTime()-x.getTimezoneOffset()*60000).toISOString().slice(0,10)}
const today=()=>dateISO();
function fmtDate(v){if(!v)return 'No date';return new Date(v+'T00:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}
function daysUntil(v){if(!v)return 9999;const a=new Date();a.setHours(0,0,0,0);return Math.ceil((new Date(v+'T00:00:00')-a)/86400000)}
function addDays(v,n){const d=new Date(v+'T00:00:00');d.setDate(d.getDate()+n);return dateISO(d)}
function monthLabel(d){return d.toLocaleDateString(undefined,{month:'long',year:'numeric'})}
function money(n){return '₱'+Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
function clamp(n,min,max){return Math.max(min,Math.min(max,n))}
function toast(message,type=''){const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=message;$('#toastStack').appendChild(el);setTimeout(()=>el.remove(),3200)}
function confirmAction(message){return window.confirm(message)}

function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      STORES.forEach(store=>{if(!db.objectStoreNames.contains(store))db.createObjectStore(store,{keyPath:'id',autoIncrement:true})});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('Could not open local database.'));
  });
}
async function dbAll(store){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly');const req=tx.objectStore(store).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error)})}
async function dbAdd(store,data){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');const req=tx.objectStore(store).add({...data,createdAt:Date.now(),updatedAt:Date.now()});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function dbPut(store,data){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');const obj={...data,updatedAt:Date.now()};if(!obj.createdAt)obj.createdAt=Date.now();const req=tx.objectStore(store).put(obj);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function dbDel(store,id){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');const req=tx.objectStore(store).delete(Number(id));req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error)})}
async function dbClear(store){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');const req=tx.objectStore(store).clear();req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error)})}
async function setting(name,fallback=''){const rows=await dbAll('settings');return rows.find(x=>x.name===name)?.value??fallback}
async function setSetting(name,value){const rows=await dbAll('settings');const row=rows.find(x=>x.name===name);if(row){row.value=value;await dbPut('settings',row)}else await dbAdd('settings',{name,value})}

function priorityScore(t){
  const d=daysUntil(t.dueDate);
  const urgency=d<0?48:d===0?46:d===1?41:d<=3?34:d<=7?26:d<=14?16:7;
  const importance={critical:28,high:22,medium:14,low:6}[t.priority]??8;
  const effort=clamp(Math.ceil(Number(t.hours||1)*1.6),1,12);
  const academic=clamp(Number(t.weight||0)*.14,0,10);
  const stale=t.createdAt&&Date.now()-t.createdAt>10*86400000&&!t.done?4:0;
  const recurring=t.recurrence&&t.recurrence!=='none'?2:0;
  return Math.min(100,Math.round(urgency+importance+effort+academic+stale+recurring));
}
function priorityLabel(score){return score>=78?'Critical':score>=58?'High':score>=35?'Medium':'Low'}
function priorityClass(score){return score>=78?'priority-critical':score>=58?'priority-high':score>=35?'priority-med':'priority-low'}
function dueLabel(t){if(!t.dueDate)return 'No deadline';const d=daysUntil(t.dueDate);if(d<0)return `Overdue ${Math.abs(d)}d`;if(d===0)return 'Due today';if(d===1)return 'Due tomorrow';return `Due ${fmtDate(t.dueDate)}`}
function workload(tasks,events){
  const open=tasks.filter(t=>!t.done);const soon=open.filter(t=>daysUntil(t.dueDate)<=7&&daysUntil(t.dueDate)>=-7);
  const hours=soon.reduce((sum,t)=>sum+Number(t.hours||1),0);const overdue=soon.filter(t=>daysUntil(t.dueDate)<0).length;
  const exams=events.filter(e=>String(e.type).toLowerCase()==='exam'&&daysUntil(e.date)>=0&&daysUntil(e.date)<=7).length;
  const todayEvents=events.filter(e=>e.date===today()).length;const score=Math.round(hours*2.6+overdue*10+exams*9+todayEvents*1.5);
  return {hours:Math.round(hours*10)/10,score,level:score>=38?'HIGH':score>=17?'MODERATE':'LOW'};
}
function nextRecurrence(date,recurrence){if(recurrence==='daily')return addDays(date,1);if(recurrence==='weekly')return addDays(date,7);if(recurrence==='monthly'){const d=new Date(date+'T00:00:00');d.setMonth(d.getMonth()+1);return dateISO(d)}return null}
function navHTML(){let last='';return NAV.map(([id,label,icon,section])=>{const heading=section!==last?`<div class="nav-section-label">${section}</div>`:'';last=section;return `${heading}<button class="${state.page===id?'active':''}" data-page="${id}"><span class="nav-icon">${icon}</span><span>${label}</span></button>`}).join('')}
function mobileNavHTML(){return ['dashboard','tasks','calendar','student','focus'].map(id=>{const n=NAV.find(x=>x[0]===id);return `<button class="${state.page===id?'active':''}" data-page="${id}"><span class="mi">${n[2]}</span>${n[1].split(' ')[0]}</button>`}).join('')}
async function layout(){
  $('#mainNav').innerHTML=navHTML();$('#mobileNav').innerHTML=mobileNavHTML();$('#pageTitle').textContent=NAV.find(x=>x[0]===state.page)?.[1]||'Command Center';
  bindNavigation();await renderPage();
}
function bindNavigation(){
  $$('[data-page]').forEach(btn=>btn.onclick=async()=>{state.page=btn.dataset.page;await layout();if(innerWidth<781)closeSidebar()});
}
async function renderPage(){
  const pages={dashboard:dashboardPage,tasks:tasksPage,calendar:calendarPage,student:studentPage,notes:notesPage,developer:developerPage,finance:financePage,goals:goalsPage,focus:focusPage,habits:habitsPage,analytics:analyticsPage,data:dataPage};
  try{await (pages[state.page]||dashboardPage)($('#app'))}catch(error){console.error(error);$('#app').innerHTML=`<div class="card"><h2>That page hit a snag.</h2><p class="muted">${esc(error.message||'Unknown error')}</p><button class="btn primary" id="retryPage">Reload this page</button></div>`;$('#retryPage').onclick=()=>layout()}
}
function quickStat(label,value,sub){return `<div class="card"><div class="stat-label">${esc(label)}</div><div class="stat-number">${esc(value)}</div><div class="small muted">${esc(sub)}</div></div>`}
function taskRow(t,compact=false){const score=priorityScore(t);return `<div class="list-item"><button class="check ${t.done?'done':''}" data-complete="${t.id}" title="${t.done?'Reopen':'Complete'}">${t.done?'✓':''}</button><div class="grow"><strong>${esc(t.title)}</strong><small>${esc(t.subject||'General')} · ${dueLabel(t)} · ${Number(t.hours||1)}h${t.recurrence&&t.recurrence!=='none'?' · '+esc(t.recurrence):''}</small></div><span class="tag ${priorityClass(score)}">${priorityLabel(score)} ${score}</span>${compact?'':`<button class="btn icon" data-edit-task="${t.id}" title="Edit">✎</button><button class="btn icon danger" data-delete-task="${t.id}" title="Delete">×</button>`}</div>`}

async function dashboardPage(app){
  const [tasks,subjects,events,expenses,goals,sessions,habits]=await Promise.all(['tasks','subjects','events','expenses','goals','studySessions','habits'].map(dbAll));
  const name=await setting('displayName','Kenjie');const now=new Date();const hour=now.getHours();const greeting=hour<12?'Good morning':hour<18?'Good afternoon':'Good evening';
  const open=tasks.filter(t=>!t.done),done=tasks.filter(t=>t.done).length,rate=tasks.length?Math.round(done/tasks.length*100):0;
  const spend30=expenses.filter(e=>{const age=(Date.now()-new Date((e.date||today())+'T00:00:00'))/86400000;return age>=0&&age<=30}).reduce((s,e)=>s+Number(e.amount||0),0);
  const wl=workload(tasks,events);const priorities=open.map(t=>({...t,score:priorityScore(t)})).sort((a,b)=>b.score-a.score).slice(0,5);const next=priorities[0];
  const todayEvents=events.filter(e=>e.date===today()).sort((a,b)=>(a.time||'').localeCompare(b.time||''));const studyMin=sessions.filter(s=>s.date===today()).reduce((s,x)=>s+Number(x.minutes||0),0);
  const upcoming=events.filter(e=>daysUntil(e.date)>=0).sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||''))).slice(0,4);
  const habitDone=habits.filter(h=>(h.completedDates||[]).includes(today())).length;
  app.innerHTML=`
  <div class="hero"><div class="hero-copy"><div class="eyebrow">${now.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})}</div><h1>${greeting}, ${esc(name)}.</h1><p>Everything important, in one place. Your OS quietly keeps the details connected.</p></div><div class="hero-actions"><button class="btn" id="dashFocus">◷ Focus</button><button class="btn primary" id="dashQuick">＋ Quick Add</button></div></div>
  <div class="grid stats">${quickStat('Open tasks',open.length,`${open.filter(t=>daysUntil(t.dueDate)<=7).length} due within 7 days`)}${quickStat('Subjects',subjects.length,'Current academic workspace')}${quickStat('Completion',rate+'%',`${done} completed of ${tasks.length}`)}${quickStat('30-day spending',money(spend30),`${Math.round(studyMin/60*10)/10}h studied today`)}</div>
  <div class="grid two" style="margin-top:15px"><div class="card"><div class="section-head"><div><h2>🔥 Smart priorities</h2><p>Deadline + importance + effort + academic weight.</p></div><button class="btn" id="dashTasks">View all</button></div>${priorities.length?`<div class="list">${priorities.map(t=>taskRow(t,true)).join('')}</div>`:`<div class="empty">Nothing urgent right now. Add a task when something needs your attention.</div>`}</div><div class="card"><div class="section-head"><div><h2>Today</h2><p>${todayEvents.length} scheduled item${todayEvents.length===1?'':'s'} · ${studyMin} min focused</p></div><button class="btn" id="dashCalendar">Calendar</button></div>${todayEvents.length?`<div class="list">${todayEvents.slice(0,6).map(e=>`<div class="list-item"><span class="tag">${esc(e.time||'All day')}</span><div class="grow"><strong>${esc(e.title)}</strong><small>${esc(e.type||'Event')}${e.subject?' · '+esc(e.subject):''}</small></div></div>`).join('')}</div>`:`<div class="empty">No events today. A little breathing room is not a bad thing.</div>`}</div></div>
  <div class="grid three" style="margin-top:15px"><div class="card accent"><div class="section-head"><div><h2>⚡ Next best action</h2><p>The strongest item in your queue.</p></div></div>${next?`<div class="hero-stat">${esc(next.title)}</div><p class="small muted">${dueLabel(next)} · ${Number(next.hours||1)}h · ${priorityLabel(next.score)} priority</p><button class="btn primary" data-edit-task="${next.id}">Open task</button>`:`<div class="empty">Your next action will appear here.</div>`}</div><div class="card"><div class="section-head"><div><h2>Workload</h2><p>Estimated work for the next 7 days.</p></div><span class="tag ${wl.level==='HIGH'?'priority-high':wl.level==='MODERATE'?'priority-med':'priority-low'}">${wl.level}</span></div><div class="stat-number">${wl.hours}h</div><div class="progress"><span style="width:${clamp(wl.score,0,100)}%"></span></div><p class="small muted" style="margin-top:8px">Pressure score ${wl.score}/100.</p></div><div class="card"><div class="section-head"><div><h2>Little wins</h2><p>Small signals that your system noticed.</p></div></div><div class="metric"><span>Habits done today</span><strong>${habitDone}/${habits.length}</strong></div><div class="metric"><span>Goals in progress</span><strong>${goals.length}</strong></div><div class="metric"><span>Upcoming items</span><strong>${upcoming.length}</strong></div></div></div>
  <div class="grid two" style="margin-top:15px"><div class="card"><div class="section-head"><div><h2>Coming up</h2><p>Events and exams nearest to today.</p></div></div>${upcoming.length?`<div class="list">${upcoming.map(e=>`<div class="list-item"><span class="tag">${fmtDate(e.date)}</span><div class="grow"><strong>${esc(e.title)}</strong><small>${esc(e.type||'Event')}${e.time?' · '+esc(e.time):''}</small></div></div>`).join('')}</div>`:`<div class="empty">Your calendar is clear. Add a class, exam or event.</div>`}</div><div class="card"><div class="section-head"><div><h2>Quick stuff</h2><p>Shortcuts you can actually use.</p></div></div><div class="quick-add-grid"><button class="quick-option" data-quick-type="task"><span class="qo-icon">✓</span><strong>Task</strong><small>Something to finish.</small></button><button class="quick-option" data-quick-type="note"><span class="qo-icon">✎</span><strong>Note</strong><small>Save an idea or reviewer.</small></button><button class="quick-option" data-quick-type="event"><span class="qo-icon">▦</span><strong>Event</strong><small>Put it on your calendar.</small></button><button class="quick-option" data-quick-type="expense"><span class="qo-icon">₱</span><strong>Expense</strong><small>Record spending.</small></button></div></div></div>`;
  $('#dashFocus').onclick=()=>{state.page='focus';layout()};$('#dashQuick').onclick=quickAdd;$('#dashTasks').onclick=()=>{state.page='tasks';layout()};$('#dashCalendar').onclick=()=>{state.page='calendar';layout()};bindActionButtons();
}

async function tasksPage(app){
  const tasks=await dbAll('tasks');let visible=tasks.filter(t=>state.taskFilter==='all'||(state.taskFilter==='open'?!t.done:t.done));if(state.taskSearch.trim()){const q=state.taskSearch.toLowerCase();visible=visible.filter(t=>`${t.title} ${t.subject||''} ${t.description||''}`.toLowerCase().includes(q))}visible.sort((a,b)=>priorityScore(b)-priorityScore(a));
  const open=tasks.filter(t=>!t.done),overdue=open.filter(t=>daysUntil(t.dueDate)<0).length;
  app.innerHTML=`<div class="hero"><div><div class="eyebrow">Workspace</div><h1>Tasks</h1><p>One queue for school, coding and everyday work. Doydoy sorts the queue for you.</p></div><button class="btn primary" id="addTaskPage">＋ Add task</button></div><div class="grid four">${quickStat('Open',open.length,`${overdue} overdue`)}${quickStat('Completed',tasks.length-open.length,'All-time in this browser')}${quickStat('Critical',open.filter(t=>priorityScore(t)>=78).length,'Needs attention first')}${quickStat('Estimated',Math.round(open.reduce((s,t)=>s+Number(t.hours||1),0)*10)/10+'h','Total open work')}</div><div class="toolbar" style="margin-top:15px"><input id="taskSearch" class="input" placeholder="Search tasks…" value="${esc(state.taskSearch)}"><button class="btn ${state.taskFilter==='all'?'primary':''}" data-task-filter="all">All</button><button class="btn ${state.taskFilter==='open'?'primary':''}" data-task-filter="open">Open</button><button class="btn ${state.taskFilter==='done'?'primary':''}" data-task-filter="done">Completed</button></div><div class="card"><div class="section-head"><div><h2>Your queue</h2><p>${visible.length} result${visible.length===1?'':'s'}</p></div></div>${visible.length?`<div class="list">${visible.map(t=>taskRow(t)).join('')}</div>`:`<div class="empty">No tasks match this view. Add one and make it concrete.</div>`}</div>`;
  $('#addTaskPage').onclick=()=>openForm('task');$('#taskSearch').oninput=e=>{state.taskSearch=e.target.value;tasksPage(app)};$$('[data-task-filter]').forEach(b=>b.onclick=()=>{state.taskFilter=b.dataset.taskFilter;tasksPage(app)});bindActionButtons();
}

async function calendarPage(app){
  const [events,tasks]=await Promise.all(['events','tasks'].map(dbAll));const y=state.calendarCursor.getFullYear(),m=state.calendarCursor.getMonth(),first=new Date(y,m,1),start=first.getDay(),days=new Date(y,m+1,0).getDate(),prevDays=new Date(y,m,0).getDate();let cells='';
  for(let i=0;i<42;i++){const day=i-start+1;let d,muted=false;if(day<=0){d=new Date(y,m-1,prevDays+day);muted=true}else if(day>days){d=new Date(y,m+1,day-days);muted=true}else d=new Date(y,m,day);const iso=dateISO(d);const es=events.filter(e=>e.date===iso);const ts=tasks.filter(t=>t.dueDate===iso&&!t.done);cells+=`<div class="day ${muted?'muted-day':''} ${iso===today()?'today':''}"><div class="day-head"><span>${d.getDate()}</span>${iso===today()?'<span class="tag">Today</span>':''}</div>${es.slice(0,3).map(e=>`<div class="day-event ${String(e.type||'').toLowerCase()}" title="${esc(e.title)}">${esc(e.title)}</div>`).join('')}${ts.slice(0,2).map(t=>`<div class="day-event task" title="${esc(t.title)}">${esc(t.title)}</div>`).join('')}</div>`}
  const upcoming=[...events.map(e=>({...e,kind:'event'})),...tasks.filter(t=>!t.done&&t.dueDate).map(t=>({id:'t'+t.id,title:t.title,date:t.dueDate,type:'Task',time:'',kind:'task'}))].filter(x=>daysUntil(x.date)>=0).sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||''))).slice(0,10);
  app.innerHTML=`<div class="hero"><div><div class="eyebrow">Time</div><h1>Calendar</h1><p>Classes, exams, deadlines, study blocks and personal events.</p></div><div class="hero-actions"><button class="btn" id="prevMonth">←</button><button class="btn" id="todayMonth">Today</button><button class="btn" id="nextMonth">→</button><button class="btn primary" id="addEventPage">＋ Event</button></div></div><div class="card"><div class="section-head"><div><h2>${monthLabel(state.calendarCursor)}</h2><p>Tasks due on a date appear automatically.</p></div></div><div class="calendar-head">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x=>`<div>${x}</div>`).join('')}</div><div class="calendar-grid">${cells}</div></div><div class="card" style="margin-top:15px"><div class="section-head"><div><h2>Upcoming</h2><p>Next scheduled items.</p></div></div>${upcoming.length?`<div class="list">${upcoming.map(x=>`<div class="list-item"><span class="tag">${fmtDate(x.date)}</span><div class="grow"><strong>${esc(x.title)}</strong><small>${esc(x.type||'Event')}${x.time?' · '+esc(x.time):''}</small></div>${x.kind==='event'?`<button class="btn icon danger" data-delete-event="${x.id}" title="Delete">×</button>`:''}</div>`).join('')}</div>`:`<div class="empty">No upcoming items.</div>`}</div>`;
  $('#prevMonth').onclick=()=>{state.calendarCursor=new Date(y,m-1,1);calendarPage(app)};$('#nextMonth').onclick=()=>{state.calendarCursor=new Date(y,m+1,1);calendarPage(app)};$('#todayMonth').onclick=()=>{state.calendarCursor=new Date(new Date().getFullYear(),new Date().getMonth(),1);calendarPage(app)};$('#addEventPage').onclick=()=>openForm('event');bindActionButtons();
}

async function studentPage(app){
  const [subjects,tasks,events,notes,projects]=await Promise.all(['subjects','tasks','events','notes','projects'].map(dbAll));
  const graded=subjects.filter(s=>Number.isFinite(Number(s.grade))&&Number(s.grade)>0);const units=graded.reduce((s,x)=>s+Number(x.units||1),0);const weighted=units?graded.reduce((s,x)=>s+Number(x.grade)*Number(x.units||1),0)/units:0;
  app.innerHTML=`<div class="hero"><div><div class="eyebrow">Academic workspace</div><h1>Student Hub</h1><p>Keep subjects, grades, assignments, exams, projects and notes connected.</p></div><div class="hero-actions"><button class="btn" id="addProject">＋ Project</button><button class="btn primary" id="addSubject">＋ Subject</button></div></div><div class="grid four">${quickStat('Subjects',subjects.length,'Current semester')}${quickStat('Weighted average',graded.length?weighted.toFixed(2):'—','Based on units entered')}${quickStat('Assignments',tasks.filter(t=>t.subjectId||t.subject).length,'Tasks linked to subjects')}${quickStat('Projects',projects.length,'Active or archived')}</div><div class="section-head" style="margin-top:22px"><div><h2>Subjects</h2><p>Edit a subject to connect its details.</p></div></div><div class="grid three">${subjects.map(s=>{const linked=tasks.filter(t=>String(t.subjectId)===String(s.id)||t.subject===s.name);const done=linked.filter(t=>t.done).length;const pct=linked.length?Math.round(done/linked.length*100):0;const exam=events.filter(e=>String(e.subjectId)===String(s.id)&&String(e.type).toLowerCase()==='exam'&&daysUntil(e.date)>=0).sort((a,b)=>a.date.localeCompare(b.date))[0];return `<div class="card"><div class="subject-code">${esc(s.code||'SUBJECT')}</div><h3 style="margin:7px 0 4px">${esc(s.name)}</h3><p class="small muted">${esc(s.professor||'Professor not set')}${s.schedule?' · '+esc(s.schedule):''}</p><div class="metric"><span>Units</span><strong>${esc(s.units||'—')}</strong></div><div class="metric"><span>Grade</span><strong>${s.grade?esc(s.grade):'—'}</strong></div><div class="metric"><span>Task completion</span><strong>${pct}%</strong></div><div class="progress"><span style="width:${pct}%"></span></div>${exam?`<div class="tag priority-med" style="margin-top:11px">Exam ${fmtDate(exam.date)}</div>`:''}<div class="hero-actions" style="margin-top:12px;justify-content:flex-start"><button class="btn" data-edit-subject="${s.id}">Edit</button><button class="btn danger" data-delete-subject="${s.id}">Delete</button></div></div>`}).join('')||'<div class="card empty">No subjects yet. Add the subjects you are actually taking this term.</div>'}</div><div class="grid two" style="margin-top:15px"><div class="card"><div class="section-head"><div><h2>Projects</h2><p>Big pieces of work deserve their own place.</p></div></div>${projects.length?`<div class="list">${projects.map(p=>`<div class="list-item"><div class="grow"><strong>${esc(p.title)}</strong><small>${esc(p.subject||'General')} · ${p.dueDate?dueLabel({dueDate:p.dueDate}):'No deadline'}</small><div class="project-bar" style="margin-top:6px"><div class="progress"><span style="width:${clamp(Number(p.progress||0),0,100)}%"></span></div><span class="tiny">${clamp(Number(p.progress||0),0,100)}%</span></div></div><button class="btn icon" data-edit-project="${p.id}">✎</button><button class="btn icon danger" data-delete-project="${p.id}">×</button></div>`).join('')}</div>`:'<div class="empty">No projects yet.</div>'}</div><div class="card"><div class="section-head"><div><h2>Academic shortcuts</h2><p>Quickly add connected items.</p></div></div><div class="quick-add-grid"><button class="quick-option" data-quick-type="task"><span class="qo-icon">✓</span><strong>Assignment</strong><small>Track work and deadline.</small></button><button class="quick-option" data-quick-type="event"><span class="qo-icon">▦</span><strong>Exam / class</strong><small>Add a calendar item.</small></button><button class="quick-option" data-quick-type="note"><span class="qo-icon">✎</span><strong>Reviewer note</strong><small>Keep study material nearby.</small></button><button class="quick-option" data-quick-type="study"><span class="qo-icon">◷</span><strong>Study session</strong><small>Log focused time.</small></button></div></div></div>`;
  $('#addSubject').onclick=()=>openForm('subject');$('#addProject').onclick=()=>openForm('project');bindActionButtons();
}

async function notesPage(app){
  const [notes,subjects]=await Promise.all(['notes','subjects'].map(dbAll));let visible=notes.filter(n=>!state.noteSearch||`${n.title} ${n.body||''} ${n.tags||''}`.toLowerCase().includes(state.noteSearch.toLowerCase())).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.updatedAt-a.updatedAt);
  app.innerHTML=`<div class="hero"><div><div class="eyebrow">Knowledge</div><h1>Notes</h1><p>A calm place for reviewers, ideas, snippets of thought and things you don't want to forget.</p></div><button class="btn primary" id="addNote">＋ Note</button></div><div class="toolbar"><input id="noteSearch" class="input" placeholder="Search notes…" value="${esc(state.noteSearch)}"><span class="tag">${notes.length} note${notes.length===1?'':'s'}</span></div><div class="grid three">${visible.map(n=>`<article class="card"><div class="section-head"><div><h3>${esc(n.title)}</h3><small class="muted">${n.pinned?'📌 Pinned · ':''}${fmtDate(dateISO(new Date(n.updatedAt||Date.now())))}</small></div><button class="btn icon" data-pin-note="${n.id}" title="Pin">${n.pinned?'📌':'☆'}</button></div><div class="note-body">${esc(n.body||'')}</div>${n.tags?`<div style="margin-top:12px" class="tag">${esc(n.tags)}</div>`:''}<div class="hero-actions" style="margin-top:13px;justify-content:flex-start"><button class="btn" data-edit-note="${n.id}">Edit</button><button class="btn danger" data-delete-note="${n.id}">Delete</button></div></article>`).join('')||'<div class="card empty">No notes match. Start with a reviewer, a thought, or a tiny checklist.</div>'}</div>`;
  $('#addNote').onclick=()=>openForm('note');$('#noteSearch').oninput=e=>{state.noteSearch=e.target.value;notesPage(app)};bindActionButtons();
}

async function developerPage(app){
  const [snippets,resources]=await Promise.all(['snippets','resources'].map(dbAll));
  app.innerHTML=`<div class="hero"><div><div class="eyebrow">Knowledge</div><h1>Developer Hub</h1><p>Your code vault, algorithm shelf and useful links for an IT student.</p></div><div class="hero-actions"><button class="btn" id="addResource">＋ Resource</button><button class="btn primary" id="addSnippet">＋ Code snippet</button></div></div><div class="grid two"><div class="card"><div class="section-head"><div><h2>Code vault</h2><p>${snippets.length} saved snippet${snippets.length===1?'':'s'}.</p></div></div>${snippets.length?`<div class="list">${snippets.map(s=>`<div class="card compact"><div class="section-head"><div><strong>${esc(s.title)}</strong><small class="muted">${esc(s.language||'text')}${s.tags?' · '+esc(s.tags):''}</small></div><div class="hero-actions"><button class="btn icon" data-edit-snippet="${s.id}">✎</button><button class="btn icon danger" data-delete-snippet="${s.id}">×</button></div></div><pre class="code">${esc(s.code||'')}</pre></div>`).join('')}</div>`:'<div class="empty">No snippets yet. Save the patterns you keep rewriting.</div>'}</div><div class="card"><div class="section-head"><div><h2>Algorithm shelf</h2><p>A compact starting point for your own reviewer.</p></div></div>${[['Searching','Linear Search · Binary Search'],['Sorting','Bubble · Selection · Insertion · Merge'],['Data Structures','Array · Stack · Queue · Linked List'],['Complexity','Big-O · Time vs Space']].map(x=>`<div class="metric"><span>${x[0]}</span><strong>${x[1]}</strong></div>`).join('')}<div class="section-head" style="margin-top:16px"><div><h2>Resources</h2><p>Saved links you want close by.</p></div></div>${resources.length?`<div class="list">${resources.map(r=>`<div class="list-item"><div class="grow"><strong>${esc(r.title)}</strong><small>${esc(r.category||'Resource')} · ${esc(r.url)}</small></div><a class="btn" href="${esc(r.url)}" target="_blank" rel="noopener">Open</a><button class="btn icon danger" data-delete-resource="${r.id}">×</button></div>`).join('')}</div>`:'<div class="empty">No saved resources.</div>'}</div></div>`;
  $('#addSnippet').onclick=()=>openForm('snippet');$('#addResource').onclick=()=>openForm('resource');bindActionButtons();
}

async function financePage(app){
  const expenses=await dbAll('expenses');const budget=Number(await setting('monthlyBudget','0'))||0;const month=new Date().toISOString().slice(0,7);const current=expenses.filter(e=>String(e.date||'').slice(0,7)===month);const total=current.reduce((s,e)=>s+Number(e.amount||0),0);const remaining=budget?budget-total:0;const cats={};current.forEach(e=>cats[e.category||'Other']=(cats[e.category||'Other']||0)+Number(e.amount||0));const top=Object.entries(cats).sort((a,b)=>b[1]-a[1]);
  app.innerHTML=`<div class="hero"><div><div class="eyebrow">Personal</div><h1>Finance</h1><p>A simple spending log. Enough to know where your money is going without turning life into accounting software.</p></div><div class="hero-actions"><button class="btn" id="budgetBtn">Set budget</button><button class="btn primary" id="addExpense">＋ Expense</button></div></div><div class="grid four">${quickStat('This month',money(total),budget?`Budget ${money(budget)}`:'No budget set')}${quickStat('Transactions',current.length,'This month')}${quickStat('Top category',top[0]?.[0]||'—',top[0]?money(top[0][1]):'No entries')}${quickStat('Remaining',budget?money(remaining):'—',budget?(remaining<0?'Over budget':'Within budget'):'Set a budget to track')}</div><div class="grid two" style="margin-top:15px"><div class="card"><div class="section-head"><div><h2>Category breakdown</h2><p>Current month.</p></div></div>${top.length?top.map(([cat,val])=>`<div class="metric"><span>${esc(cat)}</span><strong>${money(val)}</strong></div>`).join(''):'<div class="empty">No expenses this month.</div>'}</div><div class="card"><div class="section-head"><div><h2>Recent spending</h2><p>Latest entries first.</p></div></div>${expenses.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,10).map(e=>`<div class="list-item"><div class="grow"><strong>${esc(e.note||e.category||'Expense')}</strong><small>${fmtDate(e.date)} · ${esc(e.category||'Other')}</small></div><strong>${money(e.amount)}</strong><button class="btn icon" data-edit-expense="${e.id}">✎</button><button class="btn icon danger" data-delete-expense="${e.id}">×</button></div>`).join('')||'<div class="empty">No expenses recorded yet.</div>'}</div></div>`;
  $('#addExpense').onclick=()=>openForm('expense');$('#budgetBtn').onclick=()=>budgetForm();bindActionButtons();
}

async function goalsPage(app){
  const goals=await dbAll('goals');const avg=goals.length?Math.round(goals.reduce((s,g)=>s+clamp(Number(g.progress||0),0,100),0)/goals.length):0;
  app.innerHTML=`<div class="hero"><div><div class="eyebrow">Personal</div><h1>Goals</h1><p>Big things become easier when they have a visible next step.</p></div><button class="btn primary" id="addGoal">＋ Goal</button></div><div class="grid three">${quickStat('Goals',goals.length,'Tracked locally')}${quickStat('Average progress',avg+'%','Across your goals')}${quickStat('Nearly there',goals.filter(g=>Number(g.progress)>=80&&Number(g.progress)<100).length,'80% or more')}</div><div class="grid three" style="margin-top:15px">${goals.map(g=>`<div class="card"><div class="section-head"><div><h3>${esc(g.title)}</h3><small class="muted">${g.dueDate?dueLabel({dueDate:g.dueDate}):'No deadline'}</small></div><span class="tag">${clamp(Number(g.progress||0),0,100)}%</span></div><p class="small muted">${esc(g.description||'')}</p><div class="progress"><span style="width:${clamp(Number(g.progress||0),0,100)}%"></span></div><div class="hero-actions" style="margin-top:13px;justify-content:flex-start"><button class="btn" data-edit-goal="${g.id}">Edit</button><button class="btn danger" data-delete-goal="${g.id}">Delete</button></div></div>`).join('')||'<div class="card empty">No goals yet. Keep the first one small enough to act on.</div>'}</div>`;
  $('#addGoal').onclick=()=>openForm('goal');bindActionButtons();
}

async function focusPage(app){
  const [sessions,subjects]=await Promise.all(['studySessions','subjects'].map(dbAll));const total=sessions.reduce((s,x)=>s+Number(x.minutes||0),0);const todayMin=sessions.filter(x=>x.date===today()).reduce((s,x)=>s+Number(x.minutes||0),0);const mm=String(Math.floor(state.timer.seconds/60)).padStart(2,'0'),ss=String(state.timer.seconds%60).padStart(2,'0');
  app.innerHTML=`<div class="hero"><div><div class="eyebrow">Personal</div><h1>Focus</h1><p>Use a short timer, then let the session become part of your study history.</p></div></div><div class="grid two"><div class="card timer-card"><div class="timer-modes"><button class="${state.timer.mode==='Focus'?'active':''}" data-mode="Focus">25 min</button><button class="${state.timer.mode==='Break'?'active':''}" data-mode="Break">5 min</button></div><div class="timer">${mm}:${ss}</div><div class="field" style="width:min(360px,100%);margin-bottom:15px"><label>Study subject (optional)</label><select id="focusSubject" class="select"><option value="">General focus</option>${subjects.map(s=>`<option value="${s.id}" ${String(state.timer.subjectId)===String(s.id)?'selected':''}>${esc(s.code||s.name)} — ${esc(s.name)}</option>`).join('')}</select></div><div class="timer-controls"><button class="btn primary" id="timerToggle">${state.timer.running?'Pause':'Start'}</button><button class="btn" id="timerReset">Reset</button></div></div><div class="card"><div class="section-head"><div><h2>Study history</h2><p>${todayMin} min today · ${Math.round(total/60*10)/10}h all-time</p></div><button class="btn" id="logStudy">＋ Log</button></div>${sessions.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')||b.createdAt-a.createdAt).slice(0,10).map(s=>`<div class="list-item"><span class="tag">${fmtDate(s.date)}</span><div class="grow"><strong>${Number(s.minutes||0)} min · ${esc(s.mode||'Study')}</strong><small>${esc(subjects.find(x=>String(x.id)===String(s.subjectId))?.name||'General focus')}</small></div><button class="btn icon danger" data-delete-session="${s.id}">×</button></div>`).join('')||'<div class="empty">No study sessions yet.</div>'}</div></div>`;
  $('#focusSubject').onchange=e=>state.timer.subjectId=e.target.value;$('#timerToggle').onclick=toggleTimer;$('#timerReset').onclick=resetTimer;$('#logStudy').onclick=()=>openForm('study');$$('[data-mode]').forEach(b=>b.onclick=()=>{if(state.timer.running)return;state.timer.mode=b.dataset.mode;state.timer.seconds=state.timer.mode==='Focus'?1500:300;focusPage(app)});bindActionButtons();
}

async function habitsPage(app){
  const habits=await dbAll('habits');const iso=today();
  app.innerHTML=`<div class="hero"><div><div class="eyebrow">Personal</div><h1>Habits</h1><p>Keep routines small enough that they survive busy weeks.</p></div><button class="btn primary" id="addHabit">＋ Habit</button></div><div class="grid three">${habits.map(h=>{const dates=h.completedDates||[];const checked=dates.includes(iso);const streak=calculateStreak(dates);return `<div class="card"><div class="section-head"><div><h3>${esc(h.title)}</h3><small class="muted">${esc(h.description||'Daily habit')}</small></div><button class="btn icon danger" data-delete-habit="${h.id}">×</button></div><div class="metric"><span>Current streak</span><strong>${streak} day${streak===1?'':'s'}</strong></div><div class="metric"><span>All-time check-ins</span><strong>${dates.length}</strong></div><button class="btn ${checked?'primary':''}" data-toggle-habit="${h.id}">${checked?'✓ Done today':'Mark done today'}</button></div>`}).join('')||'<div class="card empty">No habits yet. Start with one tiny repeatable thing.</div>'}</div>`;
  $('#addHabit').onclick=()=>openForm('habit');bindActionButtons();
}
function calculateStreak(dates){const set=new Set(dates);let d=new Date();d.setHours(0,0,0,0);let count=0;while(set.has(dateISO(d))){count++;d.setDate(d.getDate()-1)}return count}

async function analyticsPage(app){
  const [tasks,sessions,expenses,goals,events]=await Promise.all(['tasks','studySessions','expenses','goals','events'].map(dbAll));const done=tasks.filter(t=>t.done).length;const rate=tasks.length?Math.round(done/tasks.length*100):0;const study=sessions.reduce((s,x)=>s+Number(x.minutes||0),0);const spend=expenses.reduce((s,x)=>s+Number(x.amount||0),0);const wl=workload(tasks,events);
  const days=[];for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const iso=dateISO(d);days.push({label:d.toLocaleDateString(undefined,{weekday:'short'}),minutes:sessions.filter(s=>s.date===iso).reduce((s,x)=>s+Number(x.minutes||0),0)})}const max=Math.max(60,...days.map(x=>x.minutes));
  app.innerHTML=`<div class="hero"><div><div class="eyebrow">Insights</div><h1>Analytics</h1><p>Useful signals from the things you actually put into your OS. No fake productivity score.</p></div></div><div class="grid four">${quickStat('Task completion',rate+'%',`${done}/${tasks.length} completed`)}${quickStat('Study time',Math.round(study/60*10)/10+'h','All-time logged')}${quickStat('Total spending',money(spend),'All recorded expenses')}${quickStat('Workload',wl.level,`${wl.score}/100 pressure`)}</div><div class="grid two" style="margin-top:15px"><div class="card"><div class="section-head"><div><h2>Study minutes</h2><p>Last 7 days</p></div></div><div class="chart">${days.map(x=>`<div class="bar-wrap"><div class="bar" style="height:${Math.max(4,(x.minutes/max)*115)}px" title="${x.minutes} minutes"></div><span class="bar-label">${x.label}</span></div>`).join('')}</div></div><div class="card"><div class="section-head"><div><h2>Completion</h2><p>Tasks across the whole workspace.</p></div></div><div class="donut-wrap"><div class="donut" style="--pct:${rate}%"></div><div class="donut-value">${rate}%</div></div><div class="metric"><span>Completed</span><strong>${done}</strong></div><div class="metric"><span>Open</span><strong>${tasks.length-done}</strong></div></div></div><div class="grid three" style="margin-top:15px"><div class="card"><h2 style="font-size:14px">Goal momentum</h2><p class="small muted">Average progress across goals.</p><div class="stat-number">${goals.length?Math.round(goals.reduce((s,g)=>s+Number(g.progress||0),0)/goals.length):0}%</div></div><div class="card"><h2 style="font-size:14px">Upcoming pressure</h2><p class="small muted">Estimated work in the next week.</p><div class="stat-number">${wl.hours}h</div></div><div class="card"><h2 style="font-size:14px">Calendar density</h2><p class="small muted">Events scheduled in the next 7 days.</p><div class="stat-number">${events.filter(e=>daysUntil(e.date)>=0&&daysUntil(e.date)<=7).length}</div></div></div>`;
}

async function dataPage(app){
  const counts={};for(const s of STORES)counts[s]=(await dbAll(s)).length;const total=Object.values(counts).reduce((a,b)=>a+b,0);
  app.innerHTML=`<div class="hero"><div><div class="eyebrow">System</div><h1>Data & Backup</h1><p>Your workspace is stored in this browser. Export a backup before clearing browser data or moving to another device.</p></div><div class="hero-actions"><button class="btn primary" id="exportBtn">↓ Export backup</button><label class="btn">↑ Import backup<input id="importFile" type="file" accept="application/json,.json" hidden></label></div></div><div class="grid four">${quickStat('Local records',total,'Across all stores')}${quickStat('Tasks',counts.tasks,'Saved locally')}${quickStat('Notes',counts.notes,'Saved locally')}${quickStat('Study sessions',counts.studySessions,'Saved locally')}</div><div class="grid two" style="margin-top:15px"><div class="card"><div class="section-head"><div><h2>Storage map</h2><p>What's currently stored on this device.</p></div></div>${STORES.map(s=>`<div class="metric"><span>${s}</span><strong>${counts[s]}</strong></div>`).join('')}</div><div class="card"><div class="section-head"><div><h2>Safety</h2><p>A few boring things that save pain later.</p></div></div><div class="callout"><strong>Export regularly.</strong><br>Your local browser database is not a cloud backup.</div><div class="callout" style="margin-top:9px"><strong>Never put secrets in GitHub.</strong><br>No passwords, API keys or private tokens belong in this repository.</div><div class="hero-actions" style="margin-top:12px;justify-content:flex-start"><button class="btn" id="demoBtn">Load demo data</button><button class="btn danger" id="clearBtn">Clear all local data</button></div></div></div>`;
  $('#exportBtn').onclick=exportData;$('#importFile').onchange=e=>{if(e.target.files[0])importData(e.target.files[0])};$('#demoBtn').onclick=loadDemoData;$('#clearBtn').onclick=clearAllData;
}

function calculateStreakSafe(dates){return calculateStreak(dates||[])}

async function openForm(type,id=null){
  const subjects=await dbAll('subjects');const existing=id?await findById(type,id):null;const titleMap={task:'Task',note:'Note',event:'Event',subject:'Subject',project:'Project',expense:'Expense',goal:'Goal',snippet:'Code snippet',study:'Study session',habit:'Habit',resource:'Resource'};const title=existing?`Edit ${titleMap[type]}`:`Add ${titleMap[type]}`;
  let html=`<h2>${title}</h2><div class="modal-subtitle">${formSubtitle(type)}</div><form id="entityForm"><div class="form-grid">`;
  const field=(name,label,control,opts='')=>`<div class="field ${opts.includes('full')?'full':''}"><label for="f_${name}">${label}</label>${control}</div>`;
  if(type==='task'){
    html+=field('title','Title',`<input id="f_title" name="title" class="input" required maxlength="140" value="${esc(existing?.title||'')}">`,'full');
    html+=field('subjectId','Subject',`<select id="f_subjectId" name="subjectId" class="select"><option value="">General</option>${subjects.map(s=>`<option value="${s.id}" ${String(existing?.subjectId||'')===String(s.id)?'selected':''}>${esc(s.code||s.name)} — ${esc(s.name)}</option>`).join('')}</select>`);
    html+=field('dueDate','Due date',`<input id="f_dueDate" name="dueDate" class="input" type="date" value="${esc(existing?.dueDate||today())}">`);
    html+=field('priority','Priority',selectHTML('priority',{low:'Low',medium:'Medium',high:'High',critical:'Critical'},existing?.priority||'medium'));
    html+=field('hours','Estimated hours',`<input id="f_hours" name="hours" class="input" type="number" min="0.25" max="100" step="0.25" value="${esc(existing?.hours||1)}">`);
    html+=field('weight','Academic weight',`<input id="f_weight" name="weight" class="input" type="number" min="0" max="100" step="1" value="${esc(existing?.weight||0)}"><span class="field-help">Optional. Higher values make academic work rise sooner.</span>`);
    html+=field('recurrence','Repeat',selectHTML('recurrence',{none:'Does not repeat',daily:'Daily',weekly:'Weekly',monthly:'Monthly'},existing?.recurrence||'none'));
    html+=field('subtasks','Subtasks',`<textarea id="f_subtasks" name="subtasks" class="textarea" placeholder="One subtask per line">${esc((existing?.subtasks||[]).join('\n'))}</textarea>`,'full');
    html+=field('description','Details',`<textarea id="f_description" name="description" class="textarea" placeholder="What needs to be done?">${esc(existing?.description||'')}</textarea>`,'full');
  }else if(type==='note'){
    html+=field('title','Title',`<input id="f_title" name="title" class="input" required maxlength="120" value="${esc(existing?.title||'')}">`,'full');
    html+=field('subjectId','Subject',`<select id="f_subjectId" name="subjectId" class="select"><option value="">No subject</option>${subjects.map(s=>`<option value="${s.id}" ${String(existing?.subjectId||'')===String(s.id)?'selected':''}>${esc(s.code||s.name)} — ${esc(s.name)}</option>`).join('')}</select>`);
    html+=field('tags','Tags',`<input id="f_tags" name="tags" class="input" placeholder="arrays, reviewer, python" value="${esc(existing?.tags||'')}">`);
    html+=field('body','Note',`<textarea id="f_body" name="body" class="textarea" style="min-height:260px" required>${esc(existing?.body||'')}</textarea>`,'full');
    html+=`<div class="field full"><label class="checkline"><input type="checkbox" name="pinned" ${existing?.pinned?'checked':''}> Pin this note</label></div>`;
  }else if(type==='event'){
    html+=field('title','Title',`<input id="f_title" name="title" class="input" required maxlength="120" value="${esc(existing?.title||'')}">`,'full');
    html+=field('date','Date',`<input id="f_date" name="date" class="input" type="date" required value="${esc(existing?.date||today())}">`);
    html+=field('time','Time',`<input id="f_time" name="time" class="input" type="time" value="${esc(existing?.time||'')}">`);
    html+=field('type','Type',selectHTML('type',{Class:'Class',Exam:'Exam',Deadline:'Deadline',Study:'Study',Personal:'Personal',Event:'Event'},existing?.type||'Event'));
    html+=field('subjectId','Subject',`<select id="f_subjectId" name="subjectId" class="select"><option value="">No subject</option>${subjects.map(s=>`<option value="${s.id}" ${String(existing?.subjectId||'')===String(s.id)?'selected':''}>${esc(s.code||s.name)} — ${esc(s.name)}</option>`).join('')}</select>`);
    html+=field('notes','Notes',`<textarea id="f_notes" name="notes" class="textarea">${esc(existing?.notes||'')}</textarea>`,'full');
  }else if(type==='subject'){
    html+=field('name','Subject name',`<input id="f_name" name="name" class="input" required value="${esc(existing?.name||'')}">`);
    html+=field('code','Code',`<input id="f_code" name="code" class="input" placeholder="CC4" value="${esc(existing?.code||'')}">`);
    html+=field('professor','Professor',`<input id="f_professor" name="professor" class="input" value="${esc(existing?.professor||'')}">`);
    html+=field('schedule','Schedule',`<input id="f_schedule" name="schedule" class="input" placeholder="Mon/Wed · 9:00 AM" value="${esc(existing?.schedule||'')}">`);
    html+=field('units','Units',`<input id="f_units" name="units" class="input" type="number" min="0" max="20" step="1" value="${esc(existing?.units||3)}">`);
    html+=field('grade','Current grade',`<input id="f_grade" name="grade" class="input" type="number" min="0" max="100" step="0.01" value="${esc(existing?.grade||'')}">`);
    html+=field('target','Target grade',`<input id="f_target" name="target" class="input" type="number" min="0" max="100" step="0.01" value="${esc(existing?.target||'')}">`);
  }else if(type==='project'){
    html+=field('title','Project title',`<input id="f_title" name="title" class="input" required value="${esc(existing?.title||'')}">`,'full');
    html+=field('subject','Subject',`<input id="f_subject" name="subject" class="input" placeholder="CC4" value="${esc(existing?.subject||'')}">`);
    html+=field('dueDate','Deadline',`<input id="f_dueDate" name="dueDate" class="input" type="date" value="${esc(existing?.dueDate||'')}">`);
    html+=field('progress','Progress',`<input id="f_progress" name="progress" class="input" type="number" min="0" max="100" value="${esc(existing?.progress||0)}">`);
    html+=field('description','Description',`<textarea id="f_description" name="description" class="textarea">${esc(existing?.description||'')}</textarea>`,'full');
  }else if(type==='expense'){
    html+=field('amount','Amount',`<input id="f_amount" name="amount" class="input" type="number" min="0" step="0.01" required value="${esc(existing?.amount||'')}">`);
    html+=field('date','Date',`<input id="f_date" name="date" class="input" type="date" required value="${esc(existing?.date||today())}">`);
    html+=field('category','Category',selectHTML('category',{Food:'Food',Transport:'Transport',School:'School',Bills:'Bills',Shopping:'Shopping',Entertainment:'Entertainment',Savings:'Savings',Other:'Other'},existing?.category||'Other'));
    html+=field('note','Note',`<input id="f_note" name="note" class="input" placeholder="What was it for?" value="${esc(existing?.note||'')}">`,'full');
  }else if(type==='goal'){
    html+=field('title','Goal',`<input id="f_title" name="title" class="input" required value="${esc(existing?.title||'')}">`,'full');
    html+=field('progress','Progress',`<input id="f_progress" name="progress" class="input" type="number" min="0" max="100" value="${esc(existing?.progress||0)}">`);
    html+=field('dueDate','Target date',`<input id="f_dueDate" name="dueDate" class="input" type="date" value="${esc(existing?.dueDate||'')}">`);
    html+=field('description','Why it matters / next step',`<textarea id="f_description" name="description" class="textarea">${esc(existing?.description||'')}</textarea>`,'full');
  }else if(type==='snippet'){
    html+=field('title','Snippet name',`<input id="f_title" name="title" class="input" required value="${esc(existing?.title||'')}">`);
    html+=field('language','Language',`<input id="f_language" name="language" class="input" placeholder="Python" value="${esc(existing?.language||'')}">`);
    html+=field('tags','Tags',`<input id="f_tags" name="tags" class="input" value="${esc(existing?.tags||'')}">`,'full');
    html+=field('code','Code',`<textarea id="f_code" name="code" class="textarea" style="min-height:250px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace" required>${esc(existing?.code||'')}</textarea>`,'full');
  }else if(type==='study'){
    html+=field('date','Date',`<input id="f_date" name="date" class="input" type="date" required value="${esc(existing?.date||today())}">`);
    html+=field('minutes','Minutes',`<input id="f_minutes" name="minutes" class="input" type="number" min="1" max="1440" required value="${esc(existing?.minutes||25)}">`);
    html+=field('subjectId','Subject',`<select id="f_subjectId" name="subjectId" class="select"><option value="">General focus</option>${subjects.map(s=>`<option value="${s.id}">${esc(s.code||s.name)} — ${esc(s.name)}</option>`).join('')}</select>`);
    html+=field('mode','Type',selectHTML('mode',{Focus:'Focus',Study:'Study',Review:'Review'},existing?.mode||'Study'));
  }else if(type==='habit'){
    html+=field('title','Habit',`<input id="f_title" name="title" class="input" required value="${esc(existing?.title||'')}">`,'full');
    html+=field('description','Description',`<input id="f_description" name="description" class="input" placeholder="Daily habit" value="${esc(existing?.description||'')}">`,'full');
  }else if(type==='resource'){
    html+=field('title','Title',`<input id="f_title" name="title" class="input" required value="${esc(existing?.title||'')}">`);
    html+=field('category','Category',`<input id="f_category" name="category" class="input" value="${esc(existing?.category||'Documentation')}">`);
    html+=field('url','URL',`<input id="f_url" name="url" class="input" type="url" placeholder="https://…" required value="${esc(existing?.url||'')}">`,'full');
  }
  html+=`</div><div class="modal-actions"><button type="button" class="btn" id="cancelForm">Cancel</button><button type="submit" class="btn primary">${existing?'Save changes':'Save'}</button></div></form>`;
  $('#modal').innerHTML=html;$('#modalBackdrop').classList.remove('hidden');$('#modal').querySelector('input,textarea,select')?.focus();
  $('#cancelForm').onclick=closeModal;
  $('#entityForm').onsubmit=async e=>{e.preventDefault();await saveForm(type,id,new FormData(e.target));};
}
function formSubtitle(type){return {task:'Give it a deadline and a realistic estimate. The priority engine will handle the rest.',note:'Keep it searchable and short enough to find later.',event:'Classes, exams and personal plans can all live here.',subject:'Add the details you want available whenever you open Student Hub.',project:'Track a larger piece of work without turning it into another complicated tool.',expense:'A quick record is enough. You can always add more detail later.',goal:'Define a result and a visible next step.',snippet:'Save patterns, solutions and code you do not want to rewrite.',study:'Log focused time so Analytics can show real study patterns.',habit:'Pick something repeatable and small.',resource:'Save a documentation page, tutorial or reference.'}[type]||''}
function selectHTML(name,options,current){return `<select id="f_${name}" name="${name}" class="select">${Object.entries(options).map(([v,label])=>`<option value="${esc(v)}" ${String(current)===String(v)?'selected':''}>${esc(label)}</option>`).join('')}</select>`}
async function findById(type,id){const store=type==='task'?'tasks':type==='note'?'notes':type==='event'?'events':type==='subject'?'subjects':type==='project'?'projects':type==='expense'?'expenses':type==='goal'?'goals':type==='snippet'?'snippets':type==='study'?'studySessions':type==='habit'?'habits':'resources';return (await dbAll(store)).find(x=>x.id===Number(id))}
async function saveForm(type,id,fd){
  const obj=Object.fromEntries(fd.entries());const existing=id?await findById(type,id):null;const store={task:'tasks',note:'notes',event:'events',subject:'subjects',project:'projects',expense:'expenses',goal:'goals',snippet:'snippets',study:'studySessions',habit:'habits',resource:'resources'}[type];
  if(type==='task'){obj.hours=Number(obj.hours||1);obj.weight=Number(obj.weight||0);obj.subtasks=(obj.subtasks||'').split('\n').map(x=>x.trim()).filter(Boolean);obj.done=existing?.done||false;if(!obj.title.trim()){toast('Give the task a title.','error');return}}
  if(type==='note'){obj.pinned=fd.has('pinned');obj.tags=(obj.tags||'').trim()}
  if(type==='subject'){obj.units=Number(obj.units||0);obj.grade=obj.grade===''?'':Number(obj.grade);obj.target=obj.target===''?'':Number(obj.target)}
  if(type==='project')obj.progress=clamp(Number(obj.progress||0),0,100);
  if(type==='expense')obj.amount=Number(obj.amount||0);
  if(type==='goal')obj.progress=clamp(Number(obj.progress||0),0,100);
  if(type==='study')obj.minutes=Number(obj.minutes||0);
  if(type==='habit')obj.completedDates=existing?.completedDates||[];
  if(type==='resource'){try{const u=new URL(obj.url);obj.url=u.href}catch{toast('Please enter a valid URL.','error');return}}
  try{if(existing){await dbPut(store,{...existing,...obj})}else await dbAdd(store,obj);closeModal();toast(existing?'Saved changes ✓':'Added successfully ✓','success');await layout()}catch(e){console.error(e);toast('Could not save that item.','error')}
}

function quickAdd(){
  $('#modal').innerHTML=`<h2>Quick Add</h2><div class="modal-subtitle">Capture something without leaving your current page.</div><div class="quick-add-grid">${[['task','✓','Task','Something to finish.'],['note','✎','Note','Save an idea or reviewer.'],['event','▦','Event','Put it on the calendar.'],['expense','₱','Expense','Record spending.'],['goal','◎','Goal','Track a bigger objective.'],['habit','◌','Habit','Build a repeatable routine.'],['study','◷','Study session','Log focused time.'],['project','▤','Project','Track a larger deliverable.']].map(x=>`<button class="quick-option" data-quick-type="${x[0]}"><span class="qo-icon">${x[1]}</span><strong>${x[2]}</strong><small>${x[3]}</small></button>`).join('')}</div>`;$('#modalBackdrop').classList.remove('hidden');$$('[data-quick-type]').forEach(b=>b.onclick=()=>{closeModal();openForm(b.dataset.quickType)});
}
function closeModal(){state.modalType=null;$('#modalBackdrop').classList.add('hidden');$('#modal').innerHTML=''}
function bindActionButtons(){
  $$('[data-edit-task]').forEach(b=>b.onclick=()=>openForm('task',b.dataset.editTask));
  $$('[data-delete-task]').forEach(b=>b.onclick=()=>deleteItem('tasks',b.dataset.deleteTask,'Task deleted.'));
  $$('[data-complete]').forEach(b=>b.onclick=()=>completeTask(b.dataset.complete));
  $$('[data-edit-subject]').forEach(b=>b.onclick=()=>openForm('subject',b.dataset.editSubject));
  $$('[data-delete-subject]').forEach(b=>b.onclick=()=>deleteItem('subjects',b.dataset.deleteSubject,'Subject deleted.'));
  $$('[data-edit-project]').forEach(b=>b.onclick=()=>openForm('project',b.dataset.editProject));
  $$('[data-delete-project]').forEach(b=>b.onclick=()=>deleteItem('projects',b.dataset.deleteProject,'Project deleted.'));
  $$('[data-edit-note]').forEach(b=>b.onclick=()=>openForm('note',b.dataset.editNote));
  $$('[data-delete-note]').forEach(b=>b.onclick=()=>deleteItem('notes',b.dataset.deleteNote,'Note deleted.'));
  $$('[data-pin-note]').forEach(b=>b.onclick=()=>togglePin(b.dataset.pinNote));
  $$('[data-delete-event]').forEach(b=>b.onclick=()=>deleteItem('events',b.dataset.deleteEvent,'Event deleted.'));
  $$('[data-edit-expense]').forEach(b=>b.onclick=()=>openForm('expense',b.dataset.editExpense));
  $$('[data-delete-expense]').forEach(b=>b.onclick=()=>deleteItem('expenses',b.dataset.deleteExpense,'Expense deleted.'));
  $$('[data-edit-goal]').forEach(b=>b.onclick=()=>openForm('goal',b.dataset.editGoal));
  $$('[data-delete-goal]').forEach(b=>b.onclick=()=>deleteItem('goals',b.dataset.deleteGoal,'Goal deleted.'));
  $$('[data-edit-snippet]').forEach(b=>b.onclick=()=>openForm('snippet',b.dataset.editSnippet));
  $$('[data-delete-snippet]').forEach(b=>b.onclick=()=>deleteItem('snippets',b.dataset.deleteSnippet,'Snippet deleted.'));
  $$('[data-delete-resource]').forEach(b=>b.onclick=()=>deleteItem('resources',b.dataset.deleteResource,'Resource deleted.'));
  $$('[data-delete-session]').forEach(b=>b.onclick=()=>deleteItem('studySessions',b.dataset.deleteSession,'Study session deleted.'));
  $$('[data-delete-habit]').forEach(b=>b.onclick=()=>deleteItem('habits',b.dataset.deleteHabit,'Habit deleted.'));
  $$('[data-toggle-habit]').forEach(b=>b.onclick=()=>toggleHabit(b.dataset.toggleHabit));
}
async function deleteItem(store,id,message){if(!confirmAction('Delete this item? This cannot be undone.'))return;await dbDel(store,id);toast(message,'success');layout()}
async function completeTask(id){const tasks=await dbAll('tasks');const task=tasks.find(t=>t.id===Number(id));if(!task)return;task.done=!task.done;await dbPut('tasks',task);if(task.done&&task.recurrence&&task.recurrence!=='none'){const next=nextRecurrence(task.dueDate||today(),task.recurrence);if(next){await dbAdd('tasks',{title:task.title,subjectId:task.subjectId||'',dueDate:next,priority:task.priority,hours:task.hours,weight:task.weight,recurrence:task.recurrence,subtasks:task.subtasks||[],description:task.description||'',done:false})}}toast(task.done?'Task completed ✓':'Task reopened',task.done?'success':'');layout()}
async function togglePin(id){const notes=await dbAll('notes');const n=notes.find(x=>x.id===Number(id));if(n){n.pinned=!n.pinned;await dbPut('notes',n);layout()}}
async function toggleHabit(id){const habits=await dbAll('habits');const h=habits.find(x=>x.id===Number(id));if(!h)return;h.completedDates=h.completedDates||[];const i=h.completedDates.indexOf(today());if(i>=0)h.completedDates.splice(i,1);else h.completedDates.push(today());await dbPut('habits',h);toast(i>=0?'Habit unchecked':'Habit completed ✓',i>=0?'':'success');layout()}

async function budgetForm(){const current=await setting('monthlyBudget','0');$('#modal').innerHTML=`<h2>Monthly budget</h2><div class="modal-subtitle">This is a simple spending ceiling for the current month.</div><form id="budgetForm"><div class="field"><label>Budget amount</label><input class="input" id="budgetInput" type="number" min="0" step="0.01" value="${esc(current)}"></div><div class="modal-actions"><button type="button" class="btn" id="budgetCancel">Cancel</button><button class="btn primary">Save budget</button></div></form>`;$('#modalBackdrop').classList.remove('hidden');$('#budgetCancel').onclick=closeModal;$('#budgetForm').onsubmit=async e=>{e.preventDefault();await setSetting('monthlyBudget',Number($('#budgetInput').value||0));closeModal();toast('Budget saved ✓','success');layout()}}

async function exportData(){const backup={app:'Kenjie/Doydoy OS',version:5,exportedAt:new Date().toISOString(),data:{}};for(const s of STORES)backup.data[s]=await dbAll(s);const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`doydoy-os-backup-${today()}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Backup exported ✓','success')}
async function importData(file){try{const raw=JSON.parse(await file.text());if(!raw?.data||typeof raw.data!=='object')throw new Error('That file does not look like a Doydoy OS backup.');const replace=confirmAction('OK = replace local data with this backup. Cancel = merge the backup into your current data.');if(replace)for(const s of STORES)await dbClear(s);for(const s of STORES)for(const item of (raw.data[s]||[])){const copy={...item};delete copy.id;await dbAdd(s,copy)}toast(replace?'Backup restored ✓':'Backup merged ✓','success');layout()}catch(e){console.error(e);toast(e.message||'Import failed.','error')}}
async function clearAllData(){if(!confirmAction('This will permanently clear all Kenjie/Doydoy OS data stored in this browser. Continue?'))return;if(!confirmAction('Last check: have you exported a backup?'))return;for(const s of STORES)await dbClear(s);localStorage.removeItem('doydoy-theme');localStorage.removeItem('doydoy-chat');toast('Local workspace cleared.','success');location.reload()}
async function loadDemoData(){if(!confirmAction('Load a small demo workspace? Existing data will stay.'))return;const subjectId=await dbAdd('subjects',{name:'Data Structures & Algorithms',code:'CC4',professor:'Demo Professor',schedule:'Mon / Wed · 9:00 AM',units:3,grade:91,target:95});await dbAdd('tasks',{title:'Review linked lists',subjectId,dueDate:addDays(today(),1),priority:'high',hours:1.5,weight:80,recurrence:'none',subtasks:['Review nodes','Write traversal pseudocode'],description:'Demo task for the priority engine.',done:false});await dbAdd('tasks',{title:'Clean up portfolio README',dueDate:addDays(today(),4),priority:'medium',hours:1,weight:20,recurrence:'none',subtasks:[],description:'Demo personal task.',done:false});await dbAdd('events',{title:'CC4 demo exam',date:addDays(today(),3),time:'09:00',type:'Exam',subjectId,notes:'Demo event'});await dbAdd('goals',{title:'Finish semester portfolio',progress:45,dueDate:addDays(today(),30),description:'Keep the next milestone visible.'});await dbAdd('habits',{title:'Review for 20 minutes',description:'A small daily review.',completedDates:[]});await dbAdd('notes',{title:'Quick reviewer',body:'Arrays → linked lists → stacks → queues. Keep examples small and practice traversal.',tags:'CC4, reviewer',subjectId,pinned:true});toast('Demo workspace added ✓','success');layout()}

function globalSearch(){const bd=$('#searchBackdrop');bd.classList.remove('hidden');$('#searchInput').value='';$('#searchInput').focus();renderSearchResults('')}
function closeSearch(){$('#searchBackdrop').classList.add('hidden')}
async function renderSearchResults(query){const q=query.trim().toLowerCase();const defs=[['tasks','Task','tasks','tasks'],['notes','Note','notes','notes'],['subjects','Subject','student','subjects'],['events','Event','calendar','events'],['goals','Goal','goals','goals'],['habits','Habit','habits','habits'],['snippets','Code','developer','snippets'],['resources','Resource','developer','resources'],['projects','Project','student','projects'],['expenses','Expense','finance','expenses']];let hits=[];for(const [label,type,page,store] of defs){const rows=await dbAll(store);rows.forEach(x=>{const text=`${x.title||x.name||x.note||''} ${x.description||x.body||x.tags||x.category||x.code||''}`;if(!q||text.toLowerCase().includes(q))hits.push({type,label,page,store,item:x})})}hits=hits.slice(0,40);$('#searchResults').innerHTML=hits.length?hits.map(h=>`<div class="search-result" data-search-page="${h.page}"><strong>${esc(h.item.title||h.item.name||h.item.note||h.item.category||'Untitled')}</strong><small>${h.label} · ${esc((h.item.description||h.item.body||h.item.tags||h.item.url||'').slice(0,120))}</small></div>`).join(''):'<div class="empty">Nothing found. Try another word.</div>';$$('[data-search-page]').forEach(b=>b.onclick=()=>{closeSearch();state.page=b.dataset.searchPage;layout()})}

let timerPersistLock=false;
function toggleTimer(){if(state.timer.running){state.timer.running=false;clearInterval(state.timerTick);$('#timerToggle')?.replaceChildren(document.createTextNode('Start'));return}state.timer.running=true;state.timerTick=setInterval(async()=>{if(state.timer.seconds>0){state.timer.seconds--;updateTimerDom()}else{clearInterval(state.timerTick);state.timer.running=false;await finishFocusSession();toast('Focus session complete ✓','success');focusPage($('#app'))}},1000);focusPage($('#app'))}
function updateTimerDom(){const el=document.querySelector('.timer');if(!el)return;el.textContent=`${String(Math.floor(state.timer.seconds/60)).padStart(2,'0')}:${String(state.timer.seconds%60).padStart(2,'0')}`;const btn=$('#timerToggle');if(btn)btn.textContent=state.timer.running?'Pause':'Start'}
function resetTimer(){clearInterval(state.timerTick);state.timer.running=false;state.timer.seconds=state.timer.mode==='Focus'?1500:300;focusPage($('#app'))}
async function finishFocusSession(){if(state.timer.mode==='Focus'){await dbAdd('studySessions',{date:today(),minutes:25,subjectId:state.timer.subjectId||'',mode:'Focus'})}state.timer.seconds=state.timer.mode==='Focus'?1500:300}

const chatState={history:[]};
function chatSave(){localStorage.setItem('doydoy-chat',JSON.stringify(chatState.history.slice(-20)))}
function chatRender(){const box=$('#doydoyMessages');box.innerHTML='';chatState.history.forEach(m=>{const el=document.createElement('div');el.className=`chat-msg ${m.role}`;el.textContent=m.text;box.appendChild(el)});box.scrollTop=box.scrollHeight}
function chatAdd(role,text){chatState.history.push({role,text});chatSave();chatRender()}
function chatOpen(){const panel=$('#doydoyChat');panel.classList.add('open');panel.setAttribute('aria-hidden','false');$('#doydoyFab').setAttribute('aria-expanded','true');if(!chatState.history.length)chatAdd('bot',"Hey, Kenjie. I'm just hanging out here in the corner. If you need a quick nudge, ask me what to do next.");else chatRender();setTimeout(()=>$('#doydoyInput').focus(),70)}
function chatClose(){const panel=$('#doydoyChat');panel.classList.remove('open');panel.setAttribute('aria-hidden','true');$('#doydoyFab').setAttribute('aria-expanded','false')}
async function chatReply(input){const text=input.trim();if(!text)return;chatAdd('user',text);const typing=document.createElement('div');typing.className='typing';typing.innerHTML='<i></i><i></i><i></i>';$('#doydoyMessages').appendChild(typing);$('#doydoyMessages').scrollTop=99999;const [tasks,events,goals,habits,sessions]=await Promise.all(['tasks','events','goals','habits','studySessions'].map(dbAll));const open=tasks.filter(t=>!t.done).sort((a,b)=>priorityScore(b)-priorityScore(a));let reply='';const q=text.toLowerCase();
  if(q.includes('next')||q.includes('priority')||q.includes('do first'))reply=open[0]?`I’d start with “${open[0].title}”. It scores ${priorityScore(open[0])}/100 right now. Give it one focused block, then reassess.`:'Your queue is empty. Add one concrete task and I’ll help you spot it.';
  else if(q.includes('today'))reply=`Today you have ${open.length} open task${open.length===1?'':'s'}, ${events.filter(e=>e.date===today()).length} calendar item${events.filter(e=>e.date===today()).length===1?'':'s'}, and ${sessions.filter(s=>s.date===today()).reduce((n,s)=>n+Number(s.minutes||0),0)} minutes of study logged.`;
  else if(q.includes('task'))reply=`You have ${open.length} open task${open.length===1?'':'s'}. ${open[0]?`The strongest one is “${open[0].title}”.`:''}`;
  else if(q.includes('study')||q.includes('focus')){const min=sessions.filter(s=>s.date===today()).reduce((n,s)=>n+Number(s.minutes||0),0);reply=`You’ve logged ${min} minutes today. If you want another block, the Focus page is ready.`}
  else if(q.includes('goal'))reply=goals.length?`You’re tracking ${goals.length} goal${goals.length===1?'':'s'}. Pick the goal with the clearest next milestone.`:'No goals yet. Add one concrete result instead of a vague wish.';
  else if(q.includes('habit'))reply=habits.length?`You have ${habits.length} habit${habits.length===1?'':'s'}. Keep them small enough to survive exam week.`:'No habits yet. One tiny repeatable action is enough to start.';
  else if(q.includes('money')||q.includes('spend')){const ex=await dbAll('expenses');reply=`You have ${ex.length} expense record${ex.length===1?'':'s'} saved. Open Finance for the current-month breakdown.`}
  else if(q.includes('reset')||q.includes('break'))reply='Quick reset: step away for a minute, drink some water, then choose one small thing. You do not need to fix the entire day at once.';
  else if(q.includes('add'))reply='Tap the + button in the top bar. You can add a task, note, event, expense, goal, habit, study session or project.';
  else reply='Try asking “what should I do next?”, “what’s today?”, “how much have I studied?”, or “show my tasks”.';
  setTimeout(()=>{typing.remove();chatAdd('bot',reply)},240)}
function initChat(){
  try{chatState.history=JSON.parse(localStorage.getItem('doydoy-chat')||'[]');if(!Array.isArray(chatState.history))chatState.history=[]}catch{chatState.history=[]}
  $('#doydoyFab').onclick=()=>$('#doydoyChat').classList.contains('open')?chatClose():chatOpen();$('#doydoyClose').onclick=chatClose;$('#doydoyForm').onsubmit=e=>{e.preventDefault();const i=$('#doydoyInput');const v=i.value;i.value='';chatReply(v)};$$('[data-chat]').forEach(b=>b.onclick=()=>chatReply({next:'What should I do?',today:"What's today?",reset:'Quick reset'}[b.dataset.chat]));
}

async function settingsModal(){const name=await setting('displayName','Kenjie');const budget=await setting('monthlyBudget','0');$('#modal').innerHTML=`<h2>Settings</h2><div class="modal-subtitle">A few controls for your local workspace.</div><form id="settingsForm"><div class="form-grid"><div class="field"><label>Your display name</label><input class="input" name="displayName" value="${esc(name)}" maxlength="40"></div><div class="field"><label>Monthly budget</label><input class="input" name="monthlyBudget" type="number" min="0" step="0.01" value="${esc(budget)}"></div></div><div class="callout" style="margin-top:14px"><strong>Keyboard shortcuts</strong><br>Ctrl/⌘ + K search · N quick add · Esc close overlays</div><div class="modal-actions"><button type="button" class="btn" id="settingsCancel">Cancel</button><button class="btn primary">Save settings</button></div></form>`;$('#modalBackdrop').classList.remove('hidden');$('#settingsCancel').onclick=closeModal;$('#settingsForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);await setSetting('displayName',String(fd.get('displayName')||'Kenjie').trim()||'Kenjie');await setSetting('monthlyBudget',Number(fd.get('monthlyBudget')||0));closeModal();toast('Settings saved ✓','success');layout()}}
function toggleTheme(){const dark=document.body.classList.toggle('dark');localStorage.setItem('doydoy-theme',dark?'dark':'light');document.querySelector('meta[name=theme-color]').content=dark?'#080d1d':'#f5f7fb';toast(dark?'Dark theme on':'Light theme on')}
function closeSidebar(){$('#sidebar').classList.remove('open');$('#sidebarOverlay').style.display='none'}
function initGlobal(){
  $('#quickAddBtn').onclick=quickAdd;$('#globalSearchBtn').onclick=globalSearch;$('#themeBtn').onclick=toggleTheme;$('#settingsBtn').onclick=settingsModal;$('#profileBtn').onclick=settingsModal;
  $('#menuBtn').onclick=()=>{const open=$('#sidebar').classList.toggle('open');$('#sidebarOverlay').style.display=open?'block':'none'};$('#sidebarOverlay').onclick=closeSidebar;
  $('#modalBackdrop').onclick=e=>{if(e.target.id==='modalBackdrop')closeModal()};$('#searchBackdrop').onclick=e=>{if(e.target.id==='searchBackdrop')closeSearch()};$('#searchInput').oninput=e=>renderSearchResults(e.target.value);
  document.addEventListener('keydown',e=>{const tag=document.activeElement?.tagName;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();globalSearch()}else if(e.key.toLowerCase()==='n'&&!['INPUT','TEXTAREA','SELECT'].includes(tag)){e.preventDefault();quickAdd()}else if(e.key==='Escape'){closeModal();closeSearch();chatClose()}});
  window.addEventListener('online',()=>{$('#connectionStatus').textContent='● Online';$('#connectionStatus').style.color='var(--success)'});window.addEventListener('offline',()=>{$('#connectionStatus').textContent='● Offline-ready'});
  if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(err=>console.warn('PWA registration failed',err)));
}
function initWelcome(){
  const screen=$('#welcomeScreen');
  const proceed=$('#proceedBtn');
  const dateEl=$('#welcomeDate');
  if(!screen||!proceed)return;
  const d=new Date();
  dateEl.textContent=d.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});
  const welcomed=localStorage.getItem('doydoy-welcomed')==='1';
  if(welcomed) screen.classList.add('hidden');
  proceed.onclick=()=>{
    localStorage.setItem('doydoy-welcomed','1');
    screen.classList.add('hidden');
    setTimeout(()=>$('#app')?.focus?.(),350);
  };
}

async function boot(){
  const theme=localStorage.getItem('doydoy-theme');if(theme!=='light')document.body.classList.add('dark');
  initGlobal();initChat();initWelcome();await openDB();await layout();$('#appLoading').classList.add('loaded');
}
boot().catch(error=>{console.error(error);$('#appLoading').innerHTML='<div class="loading-mark">!</div><strong>Could not open the workspace.</strong><span>Refresh the page and try again.</span>';});
