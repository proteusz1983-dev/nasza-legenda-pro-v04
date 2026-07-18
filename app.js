'use strict';

const VERSION = '0.5.0';
const STORAGE_KEY = 'nasza_legenda_v050';
const appRoot = document.getElementById('app');
const toastEl = document.getElementById('toast');

const ROLE_DEFS = [
  {title:'Kartograf Wspomnień', icon:'🗺️', task:'Znajdź rzecz związaną z miejscem, podróżą albo ważnym wspomnieniem.', words:['Podróż','Dom','Ślad']},
  {title:'Operator Sygnału', icon:'📡', task:'Znajdź rzecz z przyciskiem, kontrolką, ekranem albo pilotem.', words:['Sygnał','Drużyna','Gra']},
  {title:'Strażnik Kierunku', icon:'🧭', task:'Znajdź rzecz, która pomaga wybrać drogę lub podjąć decyzję.', words:['Kierunek','Odwaga','Cel']},
  {title:'Łącznik Drużyny', icon:'🔗', task:'Znajdź rzecz kojarzącą się z rozmową, pomocą albo bliskością.', words:['Razem','Zaufanie','Pomoc']},
  {title:'Tropiciel Czasu', icon:'⌛', task:'Znajdź rzecz związaną z czasem, rytmem albo codziennym zwyczajem.', words:['Czas','Chwila','Powrót']},
  {title:'Opiekun Przyszłości', icon:'✨', task:'Znajdź rzecz kojarzącą się z marzeniem lub planem na przyszłość.', words:['Marzenie','Plan','Przyszłość']}
];
const PALETTE = ['#66d9ef','#ff9db9','#ffd166','#a991ff','#85e5a4','#ffad66'];
const GLYPHS = ['⌛','🔑','🌙','📱','🧭','⭐','🪶','🔔','🗺️'];
const SCENES = ['prologue','cast','huntBrief','hunt','anchor','secrets','signal','memoryBrief','memoryShow','memoryAnswer','shadow','branch','plan','portal','twist','finale','artifact','recap'];

function defaultParticipants(count = 2){
  return Array.from({length:Math.max(2,Math.min(6,count))},(_,i)=>({
    name:i===0?'Iwona':i===1?'Szymon':`Osoba ${i+1}`,
    age:i===0?'':i===1?'9':'',
    interest:i===0?'podróże i rodzinne wyjazdy':i===1?'gry na telefon':''
  }));
}
function defaultState(){
  return {
    version:VERSION, screen:'home', scene:'prologue', sound:true, voiceMode:'voice', voiceActivated:false,
    team:'Jabłońscy', groupType:'rodzina', participantCount:2, participants:defaultParticipants(2),
    dream:'wspólna rodzinna wycieczka', startedAt:null, completedAt:null,
    objects:[], anchor:null, secretWords:[], secretIndex:0, secretMode:'choose',
    memorySequence:[], memoryAnswer:[], memoryScore:0, branch:'', branchResult:'', armedPeople:[],
    planId:'', planTitle:'', planDetail:'', portalMethod:'', finalChoice:'', artifact:null,
    feedback:{}, diagnostics:{speechStarts:0,speechReplays:0,speechErrors:[],voiceActivatedAt:null}, recapPlayed:false
  };
}
let state = loadState();
let audioCtx = null;
let selectedVoice = null;
let speechToken = 0;
let timerHandle = null;
let portalInterval = null;
let portalPointers = new Set();
let portalProgress = 0;
let recapHandle = null;

function loadState(){
  try{
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(!raw) return defaultState();
    const merged = Object.assign(defaultState(),raw);
    const count = Math.max(2,Math.min(6,Number(merged.participantCount || merged.participants?.length || 2)));
    const defs = defaultParticipants(count);
    merged.participantCount = count;
    merged.participants = Array.from({length:count},(_,i)=>Object.assign(defs[i],merged.participants?.[i]||{}));
    merged.version = VERSION;
    return merged;
  }catch(err){
    return defaultState();
  }
}
function save(){ state.version=VERSION; localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); }
function resetAll(){
  stopRuntime();
  localStorage.removeItem(STORAGE_KEY);
  state=defaultState();
  render();
  toast('Test wyczyszczony');
}
function esc(value){ return String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function safeFile(value){ return String(value||'druzyna').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'druzyna'; }
function participants(){ return state.participants; }
function namesText(){
  const n=participants().map(p=>p.name).filter(Boolean);
  if(n.length===2) return `${n[0]} i ${n[1]}`;
  return `${n.slice(0,-1).join(', ')} i ${n.at(-1)}`;
}
function sceneIndex(){ return Math.max(0,SCENES.indexOf(state.scene)); }
function roleFor(i){ return ROLE_DEFS[i]||ROLE_DEFS.at(-1); }
function toast(message){
  toastEl.textContent=message; toastEl.classList.add('show');
  setTimeout(()=>toastEl.classList.remove('show'),2200);
}
function stopRuntime(){
  clearInterval(timerHandle); timerHandle=null;
  clearInterval(portalInterval); portalInterval=null;
  cancelAnimationFrame(recapHandle); recapHandle=null;
  portalPointers.clear(); portalProgress=0;
  stopSpeech();
}

function ensureAudio(){
  if(!audioCtx){
    const AC=window.AudioContext||window.webkitAudioContext;
    if(AC) audioCtx=new AC();
  }
  if(audioCtx?.state==='suspended') audioCtx.resume().catch(()=>{});
  return audioCtx;
}
function tone(freq=440,duration=.16,type='sine',volume=.035,delay=0){
  if(!state.sound) return;
  const ctx=ensureAudio(); if(!ctx) return;
  const osc=ctx.createOscillator(), gain=ctx.createGain();
  osc.type=type; osc.frequency.value=freq;
  gain.gain.setValueAtTime(0.0001,ctx.currentTime+delay);
  gain.gain.exponentialRampToValueAtTime(volume,ctx.currentTime+delay+.02);
  gain.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+delay+duration);
  osc.connect(gain).connect(ctx.destination); osc.start(ctx.currentTime+delay); osc.stop(ctx.currentTime+delay+duration+.03);
}
function motif(kind='open'){
  if(kind==='open'){tone(330,.22,'sine',.035,0);tone(440,.24,'sine',.03,.13);tone(660,.4,'triangle',.025,.28);}
  if(kind==='danger'){tone(160,.45,'sawtooth',.025,0);tone(120,.6,'sine',.035,.22);}
  if(kind==='success'){tone(392,.18,'sine',.035,0);tone(523,.2,'sine',.035,.14);tone(784,.5,'triangle',.03,.29);}
  if(kind==='tap'){tone(620,.08,'sine',.02,0);}
}
function getVoice(){
  const voices='speechSynthesis' in window?speechSynthesis.getVoices():[];
  selectedVoice=voices.find(v=>/^pl/i.test(v.lang)&&/Zofia|Paulina|Google|Polish/i.test(v.name))||voices.find(v=>/^pl/i.test(v.lang))||voices[0]||null;
  return selectedVoice;
}
function speechChunks(text,max=170){
  const words=String(text).trim().split(/\s+/); const out=[]; let current='';
  words.forEach(word=>{ const next=current?`${current} ${word}`:word; if(next.length>max&&current){out.push(current);current=word;}else current=next; });
  if(current) out.push(current); return out;
}
function stopSpeech(){
  speechToken++;
  if('speechSynthesis' in window) speechSynthesis.cancel();
}
function say(text,{replay=false,onEnd=null}={}){
  if(state.voiceMode!=='voice'||!state.sound||!state.voiceActivated||!('speechSynthesis' in window)){ if(onEnd) onEnd(); return; }
  stopSpeech(); const token=speechToken; const chunks=speechChunks(text); let i=0;
  state.diagnostics.speechStarts++; if(replay) state.diagnostics.speechReplays++; save();
  const next=()=>{
    if(token!==speechToken) return;
    if(i>=chunks.length){ if(onEnd) onEnd(); return; }
    const utter=new SpeechSynthesisUtterance(chunks[i++]);
    utter.lang='pl-PL'; utter.rate=.94; utter.pitch=1; utter.volume=1; utter.voice=getVoice();
    utter.onend=next;
    utter.onerror=e=>{ state.diagnostics.speechErrors.push({scene:state.scene,error:e.error||'speech-error',at:new Date().toISOString()}); save(); if(i<chunks.length) next(); else if(onEnd) onEnd(); };
    try{ speechSynthesis.speak(utter); }catch(err){ state.diagnostics.speechErrors.push({scene:state.scene,error:String(err),at:new Date().toISOString()}); save(); if(onEnd) onEnd(); }
  };
  next();
}

function actorHtml(p,i,{active=false,mini=false}={}){
  const initial=(p.name||'?').trim().charAt(0).toUpperCase();
  return `<div class="actor ${active?'active':''} ${mini?'mini-avatar':''}" style="--actor:${PALETTE[i%PALETTE.length]}">
    <div class="actor-head"></div><div class="actor-hair"></div><div class="actor-eye l"></div><div class="actor-eye r"></div>
    <div class="actor-body"></div><div class="actor-arm l"></div><div class="actor-arm r"></div><div class="actor-leg l"></div><div class="actor-leg r"></div>
    <div class="actor-badge">${esc(initial)}</div><div class="actor-name">${esc(p.name)}</div>
  </div>`;
}
function cinema({mood='',subtitle='',actors=true,active=-1,prop='',shadow=false,portal=false,runes=[]}={}){
  return `<div class="cinema ${esc(mood)}">
    <div class="sky"><div class="stars"></div><div class="moon"></div></div><div class="horizon"></div><div class="ground"></div><div class="path"></div><div class="fog"></div>
    ${portal?'<div class="portal-vfx"></div>':''}
    ${shadow?'<div class="shadow-figure"><div class="shadow-eyes"></div></div>':''}
    ${prop?`<div class="prop">${prop}</div>`:''}
    ${runes.length?`<div class="runes">${runes.map((r,i)=>`<div class="rune" data-rune="${i}">${r}</div>`).join('')}</div>`:''}
    ${actors?`<div class="actors">${participants().map((p,i)=>actorHtml(p,i,{active:i===active})).join('')}</div>`:''}
    <div class="subtitle">${subtitle}</div>
  </div>`;
}
function shell(content,{story=false}={}){
  const online=navigator.onLine?'online':'offline';
  return `<div class="app">
    <header class="topbar">
      <button class="brand" id="homeBtn"><img src="./logo.svg" alt=""><span><strong>NASZA LEGENDA</strong><small>INTERAKTYWNY SERIAL · ETAP 0.5</small></span></button>
      <div class="top-actions"><button class="icon-btn" id="soundBtn" title="Dźwięk">${state.sound?'🔊':'🔇'}</button>${story?'<button class="ghost-btn" id="saveExitBtn">Zapisz</button>':''}</div>
    </header>
    <main class="main">${content}</main>
    <footer class="footer"><span>${online==='online'?'Połączenie online':'Tryb offline'} · zapis automatyczny</span><button class="text-btn" id="resetBtn">Wyczyść test</button></footer>
  </div>`;
}
function storyShell(content,title){
  const idx=sceneIndex(); const pct=Math.round(((idx+1)/SCENES.length)*100);
  return shell(`<div class="progress-wrap"><div class="progress-meta"><span>Odcinek 1: Godzina, której brakowało</span><span>${idx+1}/${SCENES.length}</span></div><div class="progress"><div style="width:${pct}%"></div></div></div>
    <div class="story-tools"><span class="scene-tag">${esc(title)}</span><button class="replay" id="replayBtn">▶ Odtwórz scenę</button></div>${content}`,{story:true});
}
function bindCommon(){
  document.getElementById('soundBtn')?.addEventListener('click',()=>{state.sound=!state.sound;if(!state.sound)stopSpeech();else{ensureAudio();motif('tap');}save();render();});
  document.getElementById('resetBtn')?.addEventListener('click',()=>{if(confirm('Wyczyścić cały zapis tego testu?'))resetAll();});
  document.getElementById('homeBtn')?.addEventListener('click',()=>{state.screen='home';save();render();});
  document.getElementById('saveExitBtn')?.addEventListener('click',()=>{save();state.screen='home';save();render();toast('Przebieg zapisany');});
}
function render(){
  stopRuntime();
  if(state.screen==='home') renderHome();
  else if(state.screen==='setup') renderSetup();
  else if(state.screen==='story') renderStory();
  else if(state.screen==='feedback') renderFeedback();
  else renderHome();
  bindCommon();
}

function renderHome(){
  const generic=state.participants?.length>=2?state.participants:defaultParticipants(2);
  state.participants=generic;
  appRoot.innerHTML=shell(`<section class="card hero-card">
    ${cinema({mood:'portal-scene',subtitle:'Nie będziecie czytać historii. Wejdziecie do niej.',actors:true,portal:true,prop:'⌛'})}
    <div style="padding:clamp(20px,5vw,42px)"><span class="eyebrow">Pierwszy prototyp formy docelowej</span><h1>Oglądajcie.<br>Słuchajcie.<br>Decydujcie.</h1>
    <p class="lead">Animowany odcinek dla 2–6 osób. Postacie reprezentują graczy, narrator prowadzi sceny, a prawdziwe przedmioty i decyzje zmieniają zakończenie.</p>
    <div class="notice warning"><strong>Etap 0.5:</strong> to już nie tekstowa ankieta, lecz działający prototyp interaktywnego serialu 2D. Grafika jest celowo stylizowana i będzie rozwijana.</div>
    <div class="actions"><button class="primary" id="startVoice">🔊 Uruchom głos i rozpocznij</button><button class="secondary" id="startText">Rozpocznij bez lektora</button>${state.startedAt?'<button class="secondary" id="continueBtn">Kontynuuj zapisany odcinek</button>':''}</div></div>
  </section>`);
  document.getElementById('startVoice').addEventListener('click',()=>{
    state.sound=true;state.voiceMode='voice';state.voiceActivated=true;state.diagnostics.voiceActivatedAt=new Date().toISOString();ensureAudio();motif('open');
    say('Świat Naszej Legendy jest gotowy. Głos działa. Za chwilę stworzycie swoją drużynę.');
    state.screen='setup';save();setTimeout(render,700);
  });
  document.getElementById('startText').addEventListener('click',()=>{state.voiceMode='text';state.voiceActivated=false;state.screen='setup';save();render();});
  document.getElementById('continueBtn')?.addEventListener('click',()=>{state.screen='story';save();render();setTimeout(autoNarrate,80);});
}

function resizeParticipants(count){
  const old=state.participants||[]; const defs=defaultParticipants(count);
  state.participantCount=count; state.participants=Array.from({length:count},(_,i)=>Object.assign(defs[i],old[i]||{}));
}
function renderSetup(){
  const cards=participants().map((p,i)=>`<div class="participant-card"><div class="participant-head"><strong>Postać ${i+1}</strong><span>${roleFor(i).icon} ${roleFor(i).title}</span></div>
    <div class="grid three"><label>Imię<input data-person="${i}" data-field="name" value="${esc(p.name)}"></label><label>Wiek — opcjonalnie<input data-person="${i}" data-field="age" inputmode="numeric" value="${esc(p.age)}"></label><label>Zainteresowanie<input data-person="${i}" data-field="interest" value="${esc(p.interest)}" placeholder="np. piłka, podróże, muzyka"></label></div></div>`).join('');
  appRoot.innerHTML=shell(`<section class="card"><span class="eyebrow">Obsada waszego odcinka</span><h2>Najpierw krótka konfiguracja</h2><p>Te dane zmienią role postaci, zadania, finał i film podsumowujący.</p>
    <div class="grid three"><label>Liczba osób<select id="participantCount">${[2,3,4,5,6].map(n=>`<option value="${n}" ${n===state.participantCount?'selected':''}>${n} ${n===2?'osoby':n<5?'osoby':'osób'}</option>`).join('')}</select></label>
    <label>Rodzaj grupy<select id="groupType">${['rodzina','rodzeństwo','para','przyjaciele','współpracownicy'].map(x=>`<option ${x===state.groupType?'selected':''}>${x}</option>`).join('')}</select></label>
    <label>Nazwa drużyny<input id="team" value="${esc(state.team)}"></label></div>
    <div class="participant-list" id="participantList">${cards}</div>
    <label style="margin-top:14px">Wspólny plan lub marzenie<input id="dream" value="${esc(state.dream)}" placeholder="np. wspólny wyjazd w góry"></label>
    <div class="actions"><button class="primary" id="beginEpisode">Rozpocznij odcinek</button><button class="secondary" id="backHome">Wróć</button></div></section>`);
  document.getElementById('participantCount').addEventListener('change',e=>{captureSetup();resizeParticipants(Number(e.target.value));save();render();});
  document.querySelectorAll('[data-person]').forEach(el=>el.addEventListener('input',e=>{const i=Number(e.target.dataset.person),f=e.target.dataset.field;state.participants[i][f]=e.target.value;save();}));
  document.getElementById('groupType').addEventListener('change',e=>{state.groupType=e.target.value;save();});
  document.getElementById('team').addEventListener('input',e=>{state.team=e.target.value;save();});
  document.getElementById('dream').addEventListener('input',e=>{state.dream=e.target.value;save();});
  document.getElementById('backHome').addEventListener('click',()=>{state.screen='home';save();render();});
  document.getElementById('beginEpisode').addEventListener('click',()=>{
    captureSetup();
    if(participants().some(p=>!p.name.trim())){toast('Każda postać potrzebuje imienia');return;}
    if(!state.dream.trim()){toast('Wpiszcie wspólny plan lub marzenie');return;}
    state.startedAt=new Date().toISOString();state.screen='story';state.scene='prologue';state.objects=[];state.anchor=null;state.secretWords=[];state.secretIndex=0;state.secretMode='choose';state.memorySequence=[];state.memoryAnswer=[];state.branch='';state.planId='';state.artifact=null;save();render();autoNarrate();
  });
}
function captureSetup(){
  document.querySelectorAll('[data-person]').forEach(el=>{const i=Number(el.dataset.person),f=el.dataset.field;if(state.participants[i])state.participants[i][f]=el.value;});
  const team=document.getElementById('team'),dream=document.getElementById('dream'),type=document.getElementById('groupType');
  if(team)state.team=team.value;if(dream)state.dream=dream.value;if(type)state.groupType=type.value;save();
}

function goto(scene,{motifKind='open'}={}){
  state.scene=scene;save();motif(motifKind);render();autoNarrate();window.scrollTo({top:0,behavior:'smooth'});
}
function sceneNarration(){
  const a=state.anchor?.item||'wybrany przedmiot';
  const texts={
    prologue:`Jutro powinny być dwadzieścia cztery godziny. Kronika widzi tylko dwadzieścia trzy. Jedna godzina zniknęła, a wraz z nią może zniknąć wasz wspólny plan: ${state.dream}. Waszym celem jest odnaleźć sygnał, otworzyć przejście i nadać temu planowi konkretny pierwszy krok.`,
    cast:`Kronika rozpoznała drużynę ${state.team}. Każda osoba otrzymuje inną rolę. Potrzebne będą wszystkie, ponieważ samotny bohater nie otworzy portalu.`,
    huntBrief:`Brakująca godzina nie potrafi mówić bezpośrednio. Zostawiła sygnał w zwykłych przedmiotach wokół was. Każda osoba odnajdzie inny ślad.`,
    hunt:`Poszukiwanie rozpoczęte. Macie czas, lecz jego upływ nie kończy historii. Znaleziony przedmiot wpiszcie przy swoim imieniu.`,
    anchor:`Spośród wszystkich śladów Kronika wybrała ${a}. Od tej chwili ten przedmiot jest Kotwicą. To on łączy wasz pokój z brakującą godziną.`,
    secrets:`Sygnał jest zaszyfrowany osobistymi słowami. Każdy wybiera jedno słowo w tajemnicy. Nie pokazujcie wyboru pozostałym.`,
    signal:`Oddzielne słowa utworzyły jedną wiadomość. To pierwszy dowód, że godzina odpowiada całej drużynie, nie jednej osobie.`,
    memoryBrief:`Cień Niedokończonych Planów zauważył połączenie. Spróbuje usunąć kolejność sześciu znaków. Zapamiętajcie je, zanim zgasną.`,
    memoryShow:`Patrzcie na znaki. Liczy się ich kolejność.`,
    memoryAnswer:`Odtwórzcie sześć znaków w tej samej kolejności. Każde trafienie wzmacnia Kotwicę.`,
    shadow:`Cień nie jest potworem. Jest przyszłością, w której wasz plan nigdy się nie wydarzył. Teraz wybierzecie sposób działania.`,
    branch:state.branch==='trust'?`Zaufaliście sygnałowi. Ustalcie, skąd naprawdę pochodzi wiadomość.`:`Zabezpieczacie portal. Każda osoba musi przekazać część energii drużyny.`,
    plan:`Brakująca godzina może wrócić tylko jako coś konkretnego. Wybierzcie jej znaczenie i zapiszcie pierwszy realny krok.`,
    portal:`Stańcie blisko Kotwicy: ${a}. Na telefonie przytrzymajcie ekran dwoma palcami. Na komputerze wystarczy przytrzymać mysz.`,
    twist:`Portal pokazał prawdę. Wiadomość nie pochodziła od obcej istoty. Wysłała ją wasza własna drużyna z przyszłości, w której wspólny plan został odłożony zbyt wiele razy.`,
    finale:`Macie ostatni wybór. Możecie otworzyć odzyskaną godzinę od razu albo zapieczętować ją do ustalonego momentu. Oba wybory prowadzą dalej, lecz pozostawiają inne ślady.`,
    artifact:`Kronika zapisała wasz wybór. Powstał osobisty artefakt tej drużyny i wiadomość prowadząca do kolejnego odcinka.`,
    recap:`Wasza wersja historii jest gotowa. Odtwórzcie krótki film i zapiszcie plakat z wynikiem.`
  };
  return texts[state.scene]||'';
}
function autoNarrate(){ if(state.screen==='story')say(sceneNarration()); }
function bindReplay(){ document.getElementById('replayBtn')?.addEventListener('click',()=>{ensureAudio();say(sceneNarration(),{replay:true});}); }

function renderStory(){
  const handlers={prologue:scenePrologue,cast:sceneCast,huntBrief:sceneHuntBrief,hunt:sceneHunt,anchor:sceneAnchor,secrets:sceneSecrets,signal:sceneSignal,memoryBrief:sceneMemoryBrief,memoryShow:sceneMemoryShow,memoryAnswer:sceneMemoryAnswer,shadow:sceneShadow,branch:sceneBranch,plan:scenePlan,portal:scenePortal,twist:sceneTwist,finale:sceneFinale,artifact:sceneArtifact,recap:sceneRecap};
  (handlers[state.scene]||scenePrologue)(); bindReplay();
}
function scenePrologue(){
  appRoot.innerHTML=storyShell(`${cinema({mood:'danger',subtitle:`Z jutrzejszego dnia zniknęła jedna godzina. Razem z nią zagrożony jest plan: „${esc(state.dream)}”.`,actors:true,shadow:true,prop:'⌛'})}
    <div class="card scene-panel"><div class="dialogue"><span class="speaker">Narrator</span><p>Cel jest prosty: odnaleźć sygnał, otworzyć przejście i zamienić marzenie w konkretny pierwszy krok.</p></div><div class="actions"><button class="primary" id="next">Wejdźcie do historii</button></div></div>`,'Prolog');
  document.getElementById('next').addEventListener('click',()=>goto('cast'));
}
function sceneCast(){
  const roles=participants().map((p,i)=>`<div class="role-card">${actorHtml(p,i,{mini:true})}<strong>${esc(p.name)}</strong><span>${roleFor(i).icon} ${roleFor(i).title}</span><span>${esc(roleFor(i).title==='Operator Sygnału'&&p.interest?`Moc: ${p.interest}`:`Zainteresowanie: ${p.interest||'nieznane'}`)}</span></div>`).join('');
  appRoot.innerHTML=storyShell(`${cinema({mood:'day',subtitle:`Kronika rozpoznała ${participants().length} bohaterów drużyny ${esc(state.team)}.`,actors:true})}<div class="card scene-panel"><div class="role-grid">${roles}</div><div class="actions"><button class="primary" id="next">Przyjmujemy role</button></div></div>`,'Obsada');
  document.getElementById('next').addEventListener('click',()=>goto('huntBrief'));
}
function sceneHuntBrief(){
  appRoot.innerHTML=storyShell(`${cinema({subtitle:'Sygnał ukrył się w zwykłych rzeczach znajdujących się wokół was.',actors:true,prop:'📡'})}<div class="card scene-panel"><h2>Misja w prawdziwym świecie</h2><div class="grid two">${participants().map((p,i)=>`<div class="task-card"><strong>${esc(p.name)} — ${roleFor(i).title}</strong><small>${esc(roleFor(i).task)}</small></div>`).join('')}</div><div class="notice" style="margin-top:14px">Nie wybierajcie niczego ostrego, ciężkiego ani trudnego do przeniesienia. Przedmiot pozostaje obok was do finału.</div><div class="actions"><button class="primary" id="next">Rozpocznij poszukiwanie</button></div></div>`,'Pierwsza misja');
  document.getElementById('next').addEventListener('click',()=>{state.huntStartedAt=Date.now();save();goto('hunt',{motifKind:'success'});});
}
function sceneHunt(){
  const seconds=120+Math.max(0,participants().length-2)*20;
  const tasks=participants().map((p,i)=>`<div class="task-card ${state.objects[i]?'done':''}"><strong>${esc(p.name)}</strong><small>${esc(roleFor(i).task)}</small><input data-object="${i}" value="${esc(state.objects[i]||'')}" placeholder="Wpisz znaleziony przedmiot"></div>`).join('');
  appRoot.innerHTML=storyShell(`${cinema({mood:'day',subtitle:'Każdy przedmiot jest potencjalnym śladem. Wybór nie musi być idealny — historia go zinterpretuje.',actors:true})}<div class="card scene-panel"><div class="timer" id="timer">${formatTime(seconds)}</div><div class="grid two">${tasks}</div><div class="actions"><button class="primary" id="next">Wszystkie ślady znalezione</button></div></div>`,'Poszukiwanie');
  document.querySelectorAll('[data-object]').forEach(el=>el.addEventListener('input',e=>{state.objects[Number(e.target.dataset.object)]=e.target.value;save();}));
  const started=state.huntStartedAt||Date.now();state.huntStartedAt=started;save();
  const tick=()=>{const left=Math.max(0,seconds-Math.floor((Date.now()-started)/1000));const t=document.getElementById('timer');if(t)t.textContent=formatTime(left);if(left===0){clearInterval(timerHandle);toast('Czas minął, ale historia trwa dalej');}};tick();timerHandle=setInterval(tick,500);
  document.getElementById('next').addEventListener('click',()=>{
    document.querySelectorAll('[data-object]').forEach(el=>state.objects[Number(el.dataset.object)]=el.value.trim());
    if(state.objects.slice(0,participants().length).some(x=>!x)){toast('Wpiszcie przedmiot każdej osoby');return;}
    state.anchor=chooseAnchor();save();goto('anchor',{motifKind:'success'});
  });
}
function formatTime(sec){return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;}
function objectScore(name,index){
  const n=String(name).toLowerCase();let score=index*.11;
  if(/pilot|telefon|głoś|radio|zeg|lamp|klucz|kompas|map|but|plecak|karta|pad/.test(n))score+=5;
  if(/stary|rodzin|wspomn|podróż|wyjazd/.test(n))score+=3;
  score+=(n.length%7)/10;return score;
}
function chooseAnchor(){
  let best={score:-1,index:0,item:state.objects[0]};
  state.objects.forEach((item,i)=>{const score=objectScore(item,i);if(score>best.score)best={score,index:i,item};});
  return {item:best.item,ownerIndex:best.index,owner:participants()[best.index].name,type:/pilot|telefon|głoś|radio|pad/.test(best.item.toLowerCase())?'nadajnik':/klucz|kompas|map/.test(best.item.toLowerCase())?'kierunek':'kotwica'};
}
function sceneAnchor(){
  const a=state.anchor;
  appRoot.innerHTML=storyShell(`${cinema({mood:'portal-scene',subtitle:`${esc(a.item)} należący do ${esc(a.owner)} odpowiedział na sygnał. Od teraz jest Kotwicą drużyny.`,actors:true,active:a.ownerIndex,prop:a.type==='nadajnik'?'📡':a.type==='kierunek'?'🧭':'✨',portal:true})}<div class="card scene-panel"><div class="artifact"><div class="artifact-icon">${a.type==='nadajnik'?'📡':a.type==='kierunek'?'🧭':'✨'}</div><h2>${esc(anchorName())}</h2><p>Połóżcie obok telefonu przedmiot: <strong>${esc(a.item)}</strong>. Wróci w finale jako część rozwiązania.</p></div><div class="actions"><button class="primary" id="next">Kotwica jest gotowa</button></div></div>`,'Przebudzenie Kotwicy');
  document.getElementById('next').addEventListener('click',()=>goto('secrets'));
}
function anchorName(){
  const a=state.anchor;if(!a)return'Kotwica';
  if(a.type==='nadajnik')return'Nadajnik Zaginionej Godziny';if(a.type==='kierunek')return'Kompas Wspólnej Drogi';return'Kotwica Niedokończonego Planu';
}
function sceneSecrets(){
  const i=state.secretIndex; const p=participants()[i];
  if(i>=participants().length){goto('signal',{motifKind:'success'});return;}
  const words=roleFor(i).words;
  const inner=state.secretMode==='cover'?`<div class="secret-cover"><div style="font-size:3.6rem">✓</div><h2>Słowo ${esc(p.name)} zostało ukryte</h2><p>Nie pokazujcie go pozostałym. Przekażcie telefon kolejnej osobie.</p><button class="primary" id="pass">${i===participants().length-1?'Odsłoń wspólny sygnał':'Zakryj ekran i przekaż dalej'}</button></div>`:`<div class="secret-screen"><div style="font-size:3.5rem">${roleFor(i).icon}</div><h2>Tylko ${esc(p.name)} patrzy na ekran</h2><p>Wybierz słowo, które najlepiej pasuje do waszej wspólnej historii. Reszta drużyny nie powinna widzieć wyboru.</p><div class="secret-word-grid">${words.map(w=>`<button class="choice-btn secret" data-word="${esc(w)}"><strong>${esc(w)}</strong><span>To słowo wróci w wiadomości.</span></button>`).join('')}</div></div>`;
  appRoot.innerHTML=storyShell(`${cinema({subtitle:`Sygnał czeka na osobiste słowo osoby: ${esc(p.name)}.`,actors:true,active:i,prop:'🔒'})}<div class="card scene-panel">${inner}</div>`,'Tajne słowa');
  document.querySelectorAll('.secret').forEach(btn=>btn.addEventListener('click',()=>{state.secretWords[i]=btn.dataset.word;state.secretMode='cover';save();motif('tap');render();}));
  document.getElementById('pass')?.addEventListener('click',()=>{state.secretIndex++;state.secretMode='choose';save();if(state.secretIndex>=participants().length)goto('signal',{motifKind:'success'});else render();});
}
function signalSentence(){
  const words=state.secretWords.filter(Boolean); const first=words[0]||'Razem',second=words[1]||'Drużyna';
  const extras=words.slice(2).join(', ');
  return `${first} ma sens dopiero wtedy, gdy ${second.toLowerCase()} wybiera wspólny pierwszy krok${extras?`. Pozostałe znaki to: ${extras}`:''}.`;
}
function sceneSignal(){
  appRoot.innerHTML=storyShell(`${cinema({mood:'portal-scene',subtitle:`„${esc(signalSentence())}”`,actors:true,portal:true,runes:state.secretWords.map(w=>w.charAt(0).toUpperCase())})}<div class="card scene-panel"><div class="dialogue"><span class="speaker">Kotwica</span><p>${esc(signalSentence())}</p></div><p style="text-align:center;margin:14px 0 0">Każdy wybrał osobno, ale wiadomość działa tylko jako całość.</p><div class="actions"><button class="primary" id="next">Odczytaliśmy sygnał</button></div></div>`,'Wspólna wiadomość');
  document.getElementById('next').addEventListener('click',()=>goto('memoryBrief',{motifKind:'danger'}));
}
function sceneMemoryBrief(){
  appRoot.innerHTML=storyShell(`${cinema({mood:'danger',subtitle:'Cień próbuje wymazać sześć znaków prowadzących do portalu.',actors:true,shadow:true,prop:'⚠️'})}<div class="card scene-panel"><h2>Próba pamięci</h2><p>Za chwilę przez 8 sekund zobaczycie sześć znaków. Zapamiętajcie ich kolejność. Potem odtworzycie ją wspólnie.</p><div class="notice">Niepowodzenie nie kończy historii. Zmieni jednak artefakt i fragment zakończenia.</div><div class="actions"><button class="primary" id="next">Pokaż znaki</button></div></div>`,'Atak Cienia');
  document.getElementById('next').addEventListener('click',()=>{state.memorySequence=createMemorySequence();state.memoryAnswer=[];state.memoryShownAt=Date.now();save();goto('memoryShow',{motifKind:'danger'});});
}
function createMemorySequence(){
  const pool=[...GLYPHS];const out=[];while(out.length<6){const i=Math.floor(Math.random()*pool.length);out.push(pool.splice(i,1)[0]);}return out;
}
function sceneMemoryShow(){
  appRoot.innerHTML=storyShell(`${cinema({mood:'danger',subtitle:'Patrzcie. Kolejność jest ważniejsza niż szybkość.',actors:false,shadow:true,runes:state.memorySequence})}<div class="card scene-panel"><div class="timer" id="memoryCountdown">08</div><p style="text-align:center">Po zgaśnięciu znaków ekran zmieni się automatycznie.</p></div>`,'Sekwencja znaków');
  const started=state.memoryShownAt||Date.now();const tick=()=>{const left=Math.max(0,8-Math.floor((Date.now()-started)/1000));const el=document.getElementById('memoryCountdown');if(el)el.textContent=String(left).padStart(2,'0');if(left===0){clearInterval(timerHandle);goto('memoryAnswer');}};tick();timerHandle=setInterval(tick,200);
}
function sceneMemoryAnswer(){
  const selected=state.memoryAnswer;
  appRoot.innerHTML=storyShell(`${cinema({mood:'danger',subtitle:'Odtwórzcie znaki. Każdy poprawny symbol osłabia Cień.',actors:true,shadow:true})}<div class="card scene-panel"><div class="answer-sequence">${selected.map(x=>`<span class="rune">${x}</span>`).join('')||'<span style="color:var(--muted);align-self:center">Wasza sekwencja pojawi się tutaj</span>'}</div><div class="memory-grid">${GLYPHS.map(g=>`<button class="memory-chip ${selected.includes(g)?'selected':''}" data-glyph="${g}" ${selected.includes(g)?'disabled':''}>${g}</button>`).join('')}</div><div class="actions"><button class="secondary" id="clearMemory">Wyczyść</button><button class="primary" id="checkMemory" ${selected.length!==6?'disabled':''}>Sprawdź sekwencję</button></div></div>`,'Odtwarzanie znaków');
  document.querySelectorAll('[data-glyph]').forEach(btn=>btn.addEventListener('click',()=>{if(state.memoryAnswer.length<6){state.memoryAnswer.push(btn.dataset.glyph);save();motif('tap');render();}}));
  document.getElementById('clearMemory').addEventListener('click',()=>{state.memoryAnswer=[];save();render();});
  document.getElementById('checkMemory').addEventListener('click',()=>{state.memoryScore=state.memorySequence.reduce((n,g,i)=>n+(state.memoryAnswer[i]===g?1:0),0);save();goto('shadow',{motifKind:state.memoryScore>=4?'success':'danger'});});
}
function sceneShadow(){
  const good=state.memoryScore>=4;
  appRoot.innerHTML=storyShell(`${cinema({mood:'danger',subtitle:good?`Ocaliliście ${state.memoryScore} z 6 znaków. Cień cofnął się, ale nie zniknął.`:`Ocaliliście ${state.memoryScore} z 6 znaków. Cień przejął część kodu, lecz Kotwica nadal działa.`,actors:true,shadow:true,prop:good?'✨':'🕳️'})}<div class="card scene-panel"><h2>Cień mówi prawdę tylko częściowo</h2><p>Twierdzi, że wspólne plany i tak zawsze przegrywają z codziennością. Możecie mu zaufać i poznać źródło sygnału albo wspólnie zabezpieczyć portal.</p><div class="grid two"><button class="choice-btn" data-branch="trust"><strong>Posłuchajmy Cienia</strong><span>Ryzyko: może wprowadzić was w błąd. Nagroda: poznacie źródło wiadomości.</span></button><button class="choice-btn" data-branch="seal"><strong>Zabezpieczmy portal razem</strong><span>Każda osoba będzie musiała aktywować swoją rolę.</span></button></div></div>`,'Prawdziwy wybór');
  document.querySelectorAll('[data-branch]').forEach(btn=>btn.addEventListener('click',()=>{state.branch=btn.dataset.branch;state.armedPeople=[];save();goto('branch',{motifKind:state.branch==='trust'?'danger':'success'});}));
}
function sceneBranch(){
  if(state.branch==='trust'){
    appRoot.innerHTML=storyShell(`${cinema({mood:'danger',subtitle:'Cień pokazuje trzy możliwe źródła wiadomości. Tylko jedno wyjaśnia wszystkie wcześniejsze znaki.',actors:true,shadow:true,portal:true})}<div class="card scene-panel"><div class="grid three"><button class="choice-btn source" data-source="shadow"><strong>Sam Cień</strong><span>Próbuje zwabić was do portalu.</span></button><button class="choice-btn source" data-source="future"><strong>Wasza przyszłość</strong><span>Wiadomość ostrzega przed utratą wspólnego planu.</span></button><button class="choice-btn source" data-source="random"><strong>Przypadkowy sygnał</strong><span>Przedmioty po prostu zareagowały.</span></button></div></div>`,'Ścieżka zaufania');
    document.querySelectorAll('.source').forEach(btn=>btn.addEventListener('click',()=>{state.branchResult=btn.dataset.source;save();goto('plan',{motifKind:btn.dataset.source==='future'?'success':'danger'});}));
  }else{
    const buttons=participants().map((p,i)=>`<button class="energy-person ${state.armedPeople.includes(i)?'armed':''}" data-arm="${i}"><div style="font-size:2rem">${roleFor(i).icon}</div><strong>${esc(p.name)}</strong><div>${state.armedPeople.includes(i)?'Energia przekazana':'Dotknij, by aktywować rolę'}</div></button>`).join('');
    appRoot.innerHTML=storyShell(`${cinema({mood:'portal-scene',subtitle:'Portal nie przyjmie energii jednej osoby. Każdy bohater musi świadomie włączyć swoją rolę.',actors:true,portal:true})}<div class="card scene-panel"><div class="team-energy">${buttons}</div><div class="actions"><button class="primary" id="next" ${state.armedPeople.length!==participants().length?'disabled':''}>Portal zabezpieczony</button></div></div>`,'Ścieżka drużyny');
    document.querySelectorAll('[data-arm]').forEach(btn=>btn.addEventListener('click',()=>{const i=Number(btn.dataset.arm);if(!state.armedPeople.includes(i))state.armedPeople.push(i);save();motif('tap');render();}));
    document.getElementById('next').addEventListener('click',()=>{state.branchResult='team';save();goto('plan',{motifKind:'success'});});
  }
}
function planOptions(){return[
  {id:'trip',icon:'🗺️',title:'Godzina Wyprawy',desc:'Pierwszy krok prowadzi poza dom.'},
  {id:'game',icon:'🎮',title:'Godzina Gry',desc:'Wspólny czas bez rozpraszaczy.'},
  {id:'surprise',icon:'🎁',title:'Godzina Niespodzianki',desc:'Jedna osoba przygotuje coś dla reszty.'},
  {id:'own',icon:'✍️',title:'Własna Godzina',desc:'Nadajcie jej własną nazwę.'}
];}
function scenePlan(){
  const opts=planOptions();
  appRoot.innerHTML=storyShell(`${cinema({mood:'day',subtitle:'Marzenie wróci tylko wtedy, gdy otrzyma nazwę i pierwszy realny krok.',actors:true,prop:'⌛'})}<div class="card scene-panel"><div class="grid two">${opts.map(o=>`<button class="choice-btn plan ${state.planId===o.id?'selected':''}" data-plan="${o.id}"><strong>${o.icon} ${o.title}</strong><span>${o.desc}</span></button>`).join('')}</div>${state.planId?`<div class="grid two" style="margin-top:14px">${state.planId==='own'?`<label>Nazwa waszej godziny<input id="planTitle" value="${esc(state.planTitle)}" placeholder="np. Godzina Rodzinnej Drogi"></label>`:''}<label>Konkretny pierwszy krok<input id="planDetail" value="${esc(state.planDetail)}" placeholder="np. w niedzielę jedziemy rowerami"></label></div>`:''}<div class="actions"><button class="primary" id="next" ${!state.planId?'disabled':''}>Nadaj godzinie znaczenie</button></div></div>`,'Odzyskanie godziny');
  document.querySelectorAll('[data-plan]').forEach(btn=>btn.addEventListener('click',()=>{const id=btn.dataset.plan;state.planId=id;const o=opts.find(x=>x.id===id);state.planTitle=id==='own'?state.planTitle:o.title;save();motif('tap');render();}));
  document.getElementById('planDetail')?.addEventListener('input',e=>{state.planDetail=e.target.value;save();});
  document.getElementById('planTitle')?.addEventListener('input',e=>{state.planTitle=e.target.value;save();});
  document.getElementById('next').addEventListener('click',()=>{
    const d=document.getElementById('planDetail');if(d)state.planDetail=d.value.trim();const t=document.getElementById('planTitle');if(t)state.planTitle=t.value.trim();
    if(!state.planDetail){toast('Wpiszcie konkretny pierwszy krok');return;}if(state.planId==='own'&&!state.planTitle){toast('Nadajcie swojej godzinie nazwę');return;}save();goto('portal',{motifKind:'success'});
  });
}
function scenePortal(){
  appRoot.innerHTML=storyShell(`${cinema({mood:'portal-scene',subtitle:`Kotwica „${esc(state.anchor.item)}” czeka na wspólny impuls.`,actors:true,portal:true,prop:'🌀'})}<div class="card scene-panel"><h2 style="text-align:center">Stańcie obok Kotwicy</h2><p style="text-align:center">Na telefonie przytrzymajcie portal dwoma palcami przez 3 sekundy. Na laptopie przytrzymajcie lewy przycisk myszy.</p><div class="portal-control" id="portalControl"><div class="portal-core" id="portalText">0%<br><small>dotknijcie razem</small></div></div><div class="portal-progress"><div id="portalBar"></div></div><div class="actions"><button class="secondary" id="fallback">Nie działa — użyj hasła drużyny</button></div></div>`,'Otwarcie portalu');
  wirePortal();
}
function wirePortal(){
  const el=document.getElementById('portalControl'),bar=document.getElementById('portalBar'),text=document.getElementById('portalText');
  const fine=matchMedia('(pointer:fine)').matches;const required=fine?1:2;
  const start=()=>{if(portalInterval)return;portalInterval=setInterval(()=>{if(portalPointers.size>=required){portalProgress=Math.min(100,portalProgress+3.4);bar.style.width=`${portalProgress}%`;text.innerHTML=`${Math.round(portalProgress)}%<br><small>${portalProgress<100?'nie puszczajcie':'portal otwarty'}</small>`;tone(260+portalProgress*3,.04,'sine',.012,0);if(portalProgress>=100){clearInterval(portalInterval);portalInterval=null;state.portalMethod=fine?'mysz':'duet';save();setTimeout(()=>goto('twist',{motifKind:'success'}),500);}}else{portalProgress=Math.max(0,portalProgress-2);bar.style.width=`${portalProgress}%`;text.innerHTML=`${Math.round(portalProgress)}%<br><small>dotknijcie razem</small>`;}},100);};
  el.addEventListener('pointerdown',e=>{e.preventDefault();el.setPointerCapture?.(e.pointerId);portalPointers.add(e.pointerId);ensureAudio();start();});
  ['pointerup','pointercancel','pointerleave'].forEach(type=>el.addEventListener(type,e=>portalPointers.delete(e.pointerId)));
  document.getElementById('fallback').addEventListener('click',()=>{const phrase=prompt(`Wypowiedzcie razem: „${state.team} otwiera godzinę”. Następnie wpiszcie słowo: OTWIERAMY`);if(String(phrase||'').trim().toUpperCase()==='OTWIERAMY'){state.portalMethod='hasło';save();goto('twist',{motifKind:'success'});}else toast('Hasło nie zostało potwierdzone');});
}
function sceneTwist(){
  const sourceCorrect=state.branch==='seal'||state.branchResult==='future';
  const line=sourceCorrect?'Rozpoznaliście źródło wiadomości przed otwarciem portalu.':'Portal otworzył się mimo błędnej interpretacji, ale Cień zachował jeden fragment kodu.';
  appRoot.innerHTML=storyShell(`${cinema({mood:'final-scene',subtitle:`${line} Sygnał wysłała wasza własna drużyna z przyszłości.`,actors:true,portal:true,shadow:true,prop:'🔮'})}<div class="card scene-panel"><div class="dialogue"><span class="speaker">Głos z przyszłości</span><p>Nie prosimy was o wielką obietnicę. Zróbcie tylko pierwszy krok: <strong>${esc(state.planDetail)}</strong>. Właśnie tego kroku zabrakło w naszej wersji przyszłości.</p></div><div class="actions"><button class="primary" id="next">Zmieniamy tę przyszłość</button></div></div>`,'Zwrot akcji');
  document.getElementById('next').addEventListener('click',()=>goto('finale',{motifKind:'success'}));
}
function sceneFinale(){
  appRoot.innerHTML=storyShell(`${cinema({mood:'final-scene',subtitle:`Odzyskana „${esc(state.planTitle)}” czeka na ostatnią decyzję.`,actors:true,portal:true,prop:'⌛'})}<div class="card scene-panel"><div class="grid two"><button class="choice-btn" data-final="open"><strong>Otwórz godzinę teraz</strong><span>Plan staje się aktywny. Finał będzie jaśniejszy i otworzy nową ścieżkę.</span></button><button class="choice-btn" data-final="sealed"><strong>Zapieczętuj ją do właściwej chwili</strong><span>Plan zostaje chroniony, ale Cień może jeszcze raz spróbować go przejąć.</span></button></div></div>`,'Ostatni wybór');
  document.querySelectorAll('[data-final]').forEach(btn=>btn.addEventListener('click',()=>{state.finalChoice=btn.dataset.final;state.artifact=computeArtifact();state.completedAt=new Date().toISOString();save();goto('artifact',{motifKind:'success'});}));
}
function computeArtifact(){
  const strong=state.memoryScore>=4;const open=state.finalChoice==='open';
  if(open&&strong)return{icon:'🧭',name:'Kompas Otwartej Godziny',desc:'Wskazuje pierwszy krok, zanim codzienność zasłoni kierunek.'};
  if(open)return{icon:'🔔',name:'Dzwon Pierwszego Kroku',desc:'Przypomina o planie nawet wtedy, gdy część znaków została utracona.'};
  if(strong)return{icon:'🔐',name:'Pieczęć Sześciu Znaków',desc:'Chroni odzyskaną godzinę do ustalonego momentu.'};
  return{icon:'🪶',name:'Pióro Niedokończonej Legendy',desc:'Zachowuje historię, ale wymaga szybkiego powrotu w kolejnym odcinku.'};
}
function legendaryAnchor(){
  const a=state.anchor;if(a.type==='nadajnik')return state.finalChoice==='open'?'Nadajnik Otwartej Drogi':'Nadajnik Zamkniętego Echa';
  if(a.type==='kierunek')return'Kompas Pierwszego Kroku';return'Kotwica Wspólnej Przyszłości';
}
function sceneArtifact(){
  const art=state.artifact;
  const cliff=state.finalChoice==='open'?`Gdy portal zgasł, ${state.anchor.item} uruchomił się jeszcze raz. Głos z przyszłości powiedział: „Drugi znak czeka tam, gdzie zacznie się: ${state.planDetail}”.`:`Kiedy pieczęć się zamknęła, ${state.anchor.item} wyświetlił jeden nowy znak. Cień zna termin i wróci przed: ${state.planDetail}.`;
  appRoot.innerHTML=storyShell(`${cinema({mood:'final-scene',subtitle:esc(cliff),actors:true,portal:true,prop:art.icon})}<div class="card scene-panel"><div class="artifact"><div class="artifact-icon">${art.icon}</div><h2>${esc(art.name)}</h2><p>${esc(art.desc)}</p><p><strong>Kotwica po przemianie:</strong> ${esc(legendaryAnchor())}</p></div><div class="notice" style="margin-top:14px"><strong>Cliffhanger Odcinka 2:</strong> ${esc(cliff)}</div><div class="actions"><button class="primary" id="next">Zobacz film waszej legendy</button></div></div>`,'Artefakt i cliffhanger');
  document.getElementById('next').addEventListener('click',()=>goto('recap',{motifKind:'success'}));
}
function sceneRecap(){
  appRoot.innerHTML=storyShell(`<div class="card"><span class="eyebrow">Wasza wersja zakończenia</span><h2>Film podsumowujący</h2><div class="recap"><canvas id="recapCanvas" width="540" height="960"></canvas></div><div class="actions" style="justify-content:center"><button class="primary" id="playRecap">▶ Odtwórz film 20 s</button><button class="secondary" id="downloadPoster">Pobierz plakat PNG</button><button class="secondary" id="feedback">Przejdź do oceny</button></div></div>`,'Podsumowanie');
  const canvas=document.getElementById('recapCanvas');drawRecap(canvas,0);
  document.getElementById('playRecap').addEventListener('click',()=>playRecap(canvas));
  document.getElementById('downloadPoster').addEventListener('click',()=>{drawRecap(canvas,1);const a=document.createElement('a');a.download=`nasza-legenda-${safeFile(state.team)}.png`;a.href=canvas.toDataURL('image/png');a.click();});
  document.getElementById('feedback').addEventListener('click',()=>{state.screen='feedback';save();render();});
}
function recapFrames(){return[
  {title:'NASZA LEGENDA',sub:`Drużyna ${state.team}`,icon:'⌛'},
  {title:'ZAGINĘŁA GODZINA',sub:`Zagrożony plan: ${state.dream}`,icon:'🌙'},
  {title:'KOTWICA ODPOWIEDZIAŁA',sub:`${state.anchor.item} → ${legendaryAnchor()}`,icon:'📡'},
  {title:'DRUŻYNA ODCZYTAŁA SYGNAŁ',sub:signalSentence(),icon:'✨'},
  {title:'PIERWSZY KROK',sub:state.planDetail,icon:'👣'},
  {title:state.artifact.name.toUpperCase(),sub:state.artifact.desc,icon:state.artifact.icon},
  {title:'TO NIE KONIEC',sub:'Drugi znak już czeka.',icon:'🔮'}
];}
function wrapText(ctx,text,x,y,maxWidth,lineHeight){
  const words=String(text).split(/\s+/);let line='';const lines=[];words.forEach(w=>{const test=line?`${line} ${w}`:w;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=w;}else line=test;});if(line)lines.push(line);lines.slice(0,6).forEach((l,i)=>ctx.fillText(l,x,y+i*lineHeight));return lines.length;
}
function drawRecap(canvas,progress=0){
  const ctx=canvas.getContext('2d');const w=canvas.width,h=canvas.height;const frames=recapFrames();const pos=Math.min(frames.length-1,Math.floor(progress*frames.length));const f=frames[pos];
  const grad=ctx.createRadialGradient(w*.5,h*.25,20,w*.5,h*.45,h*.8);grad.addColorStop(0,pos%2?'#233b61':'#3d315d');grad.addColorStop(.48,'#101a31');grad.addColorStop(1,'#050711');ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
  for(let i=0;i<55;i++){ctx.globalAlpha=.3+((i*17)%10)/20;ctx.fillStyle=i%4?'#fff':'#8fe7ff';ctx.beginPath();ctx.arc((i*83)%w,(i*137)%h,1+(i%3)*.5,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
  ctx.textAlign='center';ctx.fillStyle='#8fe7ff';ctx.font='800 20px system-ui';ctx.fillText('NASZA LEGENDA · ETAP 0.5',w/2,70);
  ctx.font='110px system-ui';ctx.fillText(f.icon,w/2,280);
  ctx.fillStyle='#ffd166';ctx.font='900 38px system-ui';wrapText(ctx,f.title,w/2,370,w-80,48);
  ctx.fillStyle='#f4f7ff';ctx.font='700 25px system-ui';wrapText(ctx,f.sub,w/2,520,w-90,36);
  const people=participants();const spacing=Math.min(80,(w-70)/people.length);const start=w/2-(spacing*(people.length-1))/2;
  people.forEach((p,i)=>{ctx.fillStyle=PALETTE[i%PALETTE.length];ctx.beginPath();ctx.arc(start+i*spacing,720,25,0,Math.PI*2);ctx.fill();ctx.fillStyle='#07101a';ctx.font='900 22px system-ui';ctx.fillText(p.name.charAt(0).toUpperCase(),start+i*spacing,728);ctx.fillStyle='#fff';ctx.font='700 14px system-ui';ctx.fillText(p.name.slice(0,10),start+i*spacing,765);});
  ctx.fillStyle='rgba(255,255,255,.78)';ctx.font='600 18px system-ui';ctx.fillText(`Drużyna ${state.team}`,w/2,855);ctx.fillStyle='#ffd166';ctx.font='900 18px system-ui';ctx.fillText('nasza-legenda.app · prototyp badawczy',w/2,900);
}
function playRecap(canvas){
  cancelAnimationFrame(recapHandle);const start=performance.now(),duration=20000;state.recapPlayed=true;save();motif('open');
  const loop=now=>{const p=Math.min(1,(now-start)/duration);drawRecap(canvas,p);if(p<1)recapHandle=requestAnimationFrame(loop);else motif('success');};recapHandle=requestAnimationFrame(loop);
}

function rating(id,label,value=3){return `<div class="feedback-scale"><label>${label}<input type="range" min="1" max="5" value="${value}" data-rating="${id}"></label><span class="score" id="score-${id}">${value}/5</span></div>`;}
function renderFeedback(){
  const f=state.feedback||{};
  appRoot.innerHTML=shell(`<section class="card"><span class="eyebrow">Badanie etapu 0.5</span><h2>Ocena musi pokazać prawdę, nie sprawić nam przyjemność</h2><p>Najważniejsze są własne słowa uczestników. Maksymalne oceny bez zrozumienia historii nie pomogą nam jej poprawić.</p>
  <div class="stack">${rating('visuals','Czy forma przypominała bardziej serial niż tekstową aplikację?',f.visuals||3)}${rating('climate','Klimat i emocje',f.climate||3)}${rating('clarity','Czy rozumieliście, co się dzieje i dlaczego?',f.clarity||3)}${rating('tasks','Zadania i wybory',f.tasks||3)}${rating('surprise','Zaskoczenie i zwrot akcji',f.surprise||3)}${rating('recap','Film podsumowujący',f.recap||3)}</div>
  <div class="grid two" style="margin-top:16px"><label>Własnymi słowami: o czym była historia?<textarea id="storyOwn">${esc(f.storyOwn||'')}</textarea></label><label>Kiedy straciliście kontekst?<textarea id="lostContext">${esc(f.lostContext||'')}</textarea></label><label>Najlepszy moment<textarea id="best">${esc(f.best||'')}</textarea></label><label>Najsłabszy moment<textarea id="worst">${esc(f.worst||'')}</textarea></label></div>
  <h3 style="margin-top:18px">Czy poszczególne osoby chcą Odcinek 2?</h3><div class="grid two">${participants().map((p,i)=>`<label>${esc(p.name)}<select data-next-person="${i}"><option value="">wybierz</option><option value="tak" ${f.wantNext?.[i]==='tak'?'selected':''}>tak</option><option value="może" ${f.wantNext?.[i]==='może'?'selected':''}>może</option><option value="nie" ${f.wantNext?.[i]==='nie'?'selected':''}>nie</option></select></label>`).join('')}</div>
  <label style="margin-top:14px">Czy zapłacilibyście za pełny odcinek 25–35 minut?<select id="wouldPay"><option value="">wybierz</option><option value="tak" ${f.wouldPay==='tak'?'selected':''}>tak</option><option value="może" ${f.wouldPay==='może'?'selected':''}>może</option><option value="nie" ${f.wouldPay==='nie'?'selected':''}>nie</option></select></label>
  <div class="actions"><button class="primary" id="export">Pobierz wynik JSON</button><button class="secondary" id="backRecap">Wróć do filmu</button></div></section>`);
  document.querySelectorAll('[data-rating]').forEach(el=>el.addEventListener('input',e=>document.getElementById(`score-${e.target.dataset.rating}`).textContent=`${e.target.value}/5`));
  document.getElementById('export').addEventListener('click',exportResults);
  document.getElementById('backRecap').addEventListener('click',()=>{state.screen='story';state.scene='recap';save();render();});
}
function exportResults(){
  const ratings={};document.querySelectorAll('[data-rating]').forEach(el=>ratings[el.dataset.rating]=Number(el.value));
  const wantNext=[];document.querySelectorAll('[data-next-person]').forEach(el=>wantNext[Number(el.dataset.nextPerson)]=el.value);
  const storyOwn=document.getElementById('storyOwn').value.trim(),lostContext=document.getElementById('lostContext').value.trim();
  if(!storyOwn){toast('Najpierw opiszcie własnymi słowami, o czym była historia');return;}
  if(wantNext.some(x=>!x)||wantNext.length!==participants().length){toast('Każda osoba powinna odpowiedzieć o Odcinku 2');return;}
  state.feedback={...ratings,storyOwn,lostContext,best:document.getElementById('best').value.trim(),worst:document.getElementById('worst').value.trim(),wantNext,wouldPay:document.getElementById('wouldPay').value};save();
  const understanding=ratings.clarity>=4&&storyOwn.length>=25?'zrozumiana':ratings.clarity>=3||storyOwn.length>=15?'częściowo zrozumiana':'niezrozumiana';
  const output={exportedAt:new Date().toISOString(),appVersion:VERSION,format:'interaktywny serial 2D',team:state.team,groupType:state.groupType,participants:participants(),dream:state.dream,durationMinutes:state.startedAt?Math.max(1,Math.round((Date.now()-new Date(state.startedAt).getTime())/60000)):null,answers:{objects:state.objects,anchor:state.anchor,legendaryAnchor:legendaryAnchor(),secretWords:state.secretWords,signalSentence:signalSentence(),branch:state.branch,branchResult:state.branchResult,planId:state.planId,planTitle:state.planTitle,planDetail:state.planDetail,portalMethod:state.portalMethod,finalChoice:state.finalChoice,artifact:state.artifact},results:{memoryScore:state.memoryScore,understanding,recapPlayed:state.recapPlayed},feedback:state.feedback,diagnostics:state.diagnostics};
  const blob=new Blob([JSON.stringify(output,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`wynik-nasza-legenda-05-${safeFile(state.team)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Wynik został pobrany');
}

window.addEventListener('online',()=>render());window.addEventListener('offline',()=>render());
if('speechSynthesis' in window){speechSynthesis.onvoiceschanged=()=>getVoice();getVoice();}
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));}
render();
