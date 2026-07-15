'use strict';

const STORAGE_KEY = 'nasza_legenda_pro_v04';
const VERSION = '0.4';
const app = document.getElementById('app');
const soundBtn = document.getElementById('soundBtn');
const installBtn = document.getElementById('installBtn');
const homeBtn = document.getElementById('homeBtn');
const resetBtn = document.getElementById('resetBtn');
const connectionState = document.getElementById('connectionState');
const curtain = document.getElementById('curtain');
const curtainText = document.getElementById('curtainText');

const GLYPHS = ['⌛','🔑','🌙','📱','🧭','⭐','🪶','🔔','🗺️'];
const SCENE_ORDER = [
  'safety','intro','roles','hunt','objects','anchor','privateIwona','privateSzymon','signalReveal',
  'memoryIntro','memoryShow','memoryAnswer','shadow','hourChoice','portal','twist','finalChoice','artifact','complete'
];

const defaultState = () => ({
  version: VERSION,
  screen: 'home',
  scene: 'safety',
  team: 'Jabłońscy',
  p1: {name:'Iwona', interest:'podróże i rodzinne wyjazdy'},
  p2: {name:'Szymon', interest:'gry na telefon'},
  dream: 'wspólna rodzinna wycieczka',
  forbidden: '',
  sound: true,
  voiceName: '',
  startedAt: null,
  completedAt: null,
  answers: {},
  results: {},
  memorySequence: [],
  memoryAnswer: [],
  feedback: {},
  recapReady: false
});

let state = loadState();
let deferredInstall = null;
let audioCtx = null;
let narratorVoice = null;
let activeTimer = null;
let memoryTimeout = null;
let recapAnimation = null;
let portalInterval = null;
let portalPointers = new Set();
let portalProgress = 0;

function loadState(){
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return raw ? Object.assign(defaultState(), raw) : defaultState();
  } catch {
    return defaultState();
  }
}
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function esc(value){
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
}
function normalize(value){
  return String(value || '').toLocaleLowerCase('pl').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}
function safeFile(value){
  return normalize(value).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'druzyna';
}
function sceneIndex(){ return Math.max(0, SCENE_ORDER.indexOf(state.scene)); }
function sceneShell(content, label=''){
  const idx = sceneIndex();
  const pct = Math.round(((idx + 1) / SCENE_ORDER.length) * 100);
  return `
    <div class="progress-meta"><span>Godzina, której brakowało</span><span>${label || `${idx+1}/${SCENE_ORDER.length}`}</span></div>
    <div class="progress"><div style="width:${pct}%"></div></div>
    ${content}`;
}
function clearRuntime(){
  if(activeTimer){ activeTimer.stop?.(); clearInterval(activeTimer.interval); clearTimeout(activeTimer.countdownTimeout); activeTimer = null; }
  if(memoryTimeout){ clearTimeout(memoryTimeout); memoryTimeout = null; }
  if(recapAnimation){ cancelAnimationFrame(recapAnimation); recapAnimation = null; }
  if(portalInterval){ clearInterval(portalInterval); portalInterval = null; }
  portalPointers.clear(); portalProgress = 0;
  if('speechSynthesis' in window) speechSynthesis.cancel();
}

function ensureAudio(){
  if(!audioCtx){
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if(AudioContext) audioCtx = new AudioContext();
  }
  if(audioCtx?.state === 'suspended') audioCtx.resume().catch(()=>{});
}
function tone(freq=440, duration=.16, type='sine', volume=.045, delay=0){
  if(!state.sound) return;
  ensureAudio();
  if(!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type; osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, audioCtx.currentTime + delay);
  gain.gain.exponentialRampToValueAtTime(volume, audioCtx.currentTime + delay + .015);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + delay + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(audioCtx.currentTime + delay);
  osc.stop(audioCtx.currentTime + delay + duration + .03);
}
function motif(kind='open'){
  if(!state.sound) return;
  const patterns = {
    open:[[330,0],[440,.11],[660,.22]],
    warning:[[180,0],[155,.22],[130,.44]],
    reveal:[[392,0],[523,.13],[659,.27],[784,.42]],
    success:[[523,0],[659,.12],[784,.24],[1047,.39]],
    fail:[[300,0],[250,.18],[200,.36]],
    tick:[[850,0]],
    portal:[[220,0],[330,.14],[440,.28],[660,.45]]
  };
  (patterns[kind] || patterns.open).forEach(([f,d])=>tone(f,.2,'sine',.04,d));
}

function getVoices(){ return 'speechSynthesis' in window ? speechSynthesis.getVoices() : []; }
function pickVoice(){
  const voices = getVoices();
  narratorVoice = voices.find(v=>v.name===state.voiceName) ||
    voices.find(v=>/^pl/i.test(v.lang) && /Google|Natural|Zofia|Marek|Paulina|Agnieszka|Maja/i.test(v.name)) ||
    voices.find(v=>/^pl/i.test(v.lang)) || voices[0] || null;
  if(narratorVoice && !state.voiceName){ state.voiceName = narratorVoice.name; saveState(); }
}
if('speechSynthesis' in window){
  pickVoice();
  speechSynthesis.onvoiceschanged = () => { pickVoice(); if(state.screen==='setup') render(); };
}
function speak(text, onEnd){
  if(!state.sound || !('speechSynthesis' in window)){ onEnd?.(); return; }
  pickVoice();
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(String(text).replace(/\s+/g,' ').trim());
  utterance.lang = 'pl-PL'; utterance.rate = .88; utterance.pitch = .94; utterance.volume = 1;
  if(narratorVoice) utterance.voice = narratorVoice;
  let ended = false;
  const finish = () => { if(ended) return; ended = true; onEnd?.(); };
  utterance.onend = finish; utterance.onerror = finish;
  speechSynthesis.speak(utterance);
  setTimeout(finish, Math.max(4000, String(text).length * 95));
}
function voiceOptions(){
  const voices = getVoices().filter(v=>/^pl/i.test(v.lang));
  if(!voices.length) return '<option value="">Domyślny głos urządzenia</option>';
  return voices.map(v=>`<option value="${esc(v.name)}" ${v.name===state.voiceName?'selected':''}>${esc(v.name)}</option>`).join('');
}

function showCurtain(text='Kronika analizuje sygnał…', duration=1250){
  curtainText.textContent = text;
  curtain.classList.remove('hidden');
  motif('open');
  return new Promise(resolve=>setTimeout(()=>{ curtain.classList.add('hidden'); resolve(); }, duration));
}
async function gotoScene(scene, transitionText='Kronika otwiera następny fragment…'){
  clearRuntime();
  await showCurtain(transitionText);
  state.screen = 'episode'; state.scene = scene; saveState(); render();
}

function updateConnection(){
  connectionState.textContent = navigator.onLine ? 'Online — aplikacja gotowa do zapisania offline' : 'Offline — historia działa bez internetu';
}
window.addEventListener('online',updateConnection); window.addEventListener('offline',updateConnection); updateConnection();
window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); deferredInstall=e; installBtn.classList.remove('hidden'); });
installBtn.addEventListener('click', async()=>{ if(!deferredInstall) return; deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall=null; installBtn.classList.add('hidden'); });
soundBtn.addEventListener('click',()=>{ state.sound=!state.sound; soundBtn.textContent=state.sound?'🔊':'🔇'; if(!state.sound && 'speechSynthesis' in window) speechSynthesis.cancel(); saveState(); });
homeBtn.addEventListener('click',()=>{ clearRuntime(); state.screen='home'; saveState(); render(); });
resetBtn.addEventListener('click',()=>{
  if(confirm('Usunąć cały przebieg testu i zacząć od początku?')){
    clearRuntime(); localStorage.removeItem(STORAGE_KEY); state=defaultState(); render();
  }
});

function render(){
  clearRuntime(); soundBtn.textContent = state.sound ? '🔊' : '🔇';
  if(state.screen==='home') renderHome();
  else if(state.screen==='setup') renderSetup();
  else if(state.screen==='recap') renderRecap();
  else if(state.screen==='feedback') renderFeedback();
  else renderEpisode();
}

function renderHome(){
  const hasProgress = state.startedAt && !state.completedAt;
  app.innerHTML = `
    <section class="card hero">
      <img src="./logo.svg" class="hero-logo" alt="">
      <span class="badge">ODCINEK TESTOWY PRO</span>
      <h1>Jutro będzie miało tylko 23 godziny.</h1>
      <p>Iwona i Szymon mają odnaleźć brakującą godzinę, zanim Cień Niedokończonych Planów zamieni ją w pusty fragment rodzinnej historii.</p>
      <div class="note"><strong>To nie jest formularz z zagadkami.</strong> Przedmioty, słowa, wynik czasu i decyzje wrócą później w fabule.</div>
      <div class="actions">
        <button id="mainStart" class="primary" type="button">${hasProgress?'Kontynuuj odcinek':'Przygotuj test'}</button>
        ${state.completedAt?'<button id="openRecap" class="secondary" type="button">Otwórz podsumowanie</button>':''}
      </div>
    </section>
    <section class="card">
      <span class="badge">35–45 MINUT · 2 OSOBY · OFFLINE</span>
      <h2 style="margin-top:14px">Godzina, której brakowało</h2>
      <div class="scene-list">
        <div><strong>Historia reaguje</strong><br><span class="muted">Kotwica i własne słowa wracają w finale.</span></div>
        <div><strong>Porażka nie kończy odcinka</strong><br><span class="muted">Spóźnienie wzmacnia Cień i zmienia artefakt.</span></div>
        <div><strong>Fizyczny rytuał drużyny</strong><br><span class="muted">Dwie osoby muszą jednocześnie otworzyć portal na telefonie.</span></div>
      </div>
    </section>`;
  document.getElementById('mainStart').onclick=()=>{
    ensureAudio();
    if(hasProgress){ state.screen='episode'; saveState(); render(); }
    else { state.screen='setup'; saveState(); render(); }
  };
  const recap = document.getElementById('openRecap'); if(recap) recap.onclick=()=>{state.screen='recap';saveState();render();};
}

function renderSetup(){
  app.innerHTML = `
    <section class="card">
      <span class="badge">PRZYGOTOWANIE DRUŻYNY</span>
      <h2 style="margin-top:14px">Dane tylko do tej historii</h2>
      <p class="muted">Pseudonimy wystarczą. Wszystkie odpowiedzi pozostają na tym urządzeniu.</p>
      <div class="grid two">
        <div><label>Nazwa drużyny</label><input id="team" value="${esc(state.team)}"></div>
        <div><label>Wspólne marzenie lub plan</label><input id="dream" value="${esc(state.dream)}"></div>
        <div><label>Osoba 1</label><input id="p1name" value="${esc(state.p1.name)}"></div>
        <div><label>Zainteresowanie Iwony</label><input id="p1interest" value="${esc(state.p1.interest)}"></div>
        <div><label>Osoba 2</label><input id="p2name" value="${esc(state.p2.name)}"></div>
        <div><label>Zainteresowanie Szymona</label><input id="p2interest" value="${esc(state.p2.interest)}"></div>
      </div>
      <div style="margin-top:15px"><label>Tematy, których nie używać</label><input id="forbidden" value="${esc(state.forbidden)}" placeholder="opcjonalnie"></div>
      <div class="grid two" style="margin-top:15px">
        <div><label>Głos narratora dostępny na urządzeniu</label><select id="voiceSelect">${voiceOptions()}</select></div>
        <div><label>Podgląd głosu</label><button id="voicePreview" class="secondary" type="button" style="width:100%">Posłuchaj próbki</button></div>
      </div>
      <div class="note warning"><strong>Uczciwie:</strong> głos przeglądarki nadal jest wersją testową. Docelowy produkt otrzyma naturalnego lektora i gotową ścieżkę audio.</div>
      <div class="actions"><button id="startEpisode" class="primary" type="button">Uruchom tryb filmowy</button><button id="backHome" class="secondary" type="button">Wróć</button></div>
    </section>`;
  document.getElementById('voiceSelect').onchange=e=>{state.voiceName=e.target.value;saveState();pickVoice();};
  document.getElementById('voicePreview').onclick=()=>{ensureAudio();state.voiceName=document.getElementById('voiceSelect').value;saveState();pickVoice();speak('Jutro będzie miało tylko dwadzieścia trzy godziny. Kronika czeka na decyzję Iwony i Szymona.');};
  document.getElementById('backHome').onclick=()=>{state.screen='home';saveState();render();};
  document.getElementById('startEpisode').onclick=async()=>{
    state.team=document.getElementById('team').value.trim()||'Jabłońscy';
    state.dream=document.getElementById('dream').value.trim()||'wspólna rodzinna przygoda';
    state.p1={name:document.getElementById('p1name').value.trim()||'Iwona',interest:document.getElementById('p1interest').value.trim()||'podróże'};
    state.p2={name:document.getElementById('p2name').value.trim()||'Szymon',interest:document.getElementById('p2interest').value.trim()||'gry'};
    state.forbidden=document.getElementById('forbidden').value.trim();
    state.voiceName=document.getElementById('voiceSelect').value;
    state.startedAt=new Date().toISOString(); state.completedAt=null; state.scene='safety'; state.answers={}; state.results={}; state.memorySequence=[]; state.memoryAnswer=[]; state.feedback={};
    saveState(); ensureAudio(); await gotoScene('safety','Kronika rozpoznaje drużynę…');
  };
}

const narrations = {
  safety:()=>`Ta historia wykorzystuje wyłącznie bezpieczne, zwykłe przedmioty. Nie używajcie noży, lekarstw, dokumentów, pieniędzy ani ciężkich rzeczy. Nie wspinajcie się. W każdej chwili możecie przerwać próbę. Historia zawsze poprowadzi was dalej.`,
  intro:()=>`Jutro będzie miało dwadzieścia trzy godziny. Dokładnie o północy z kalendarza drużyny ${state.team} zniknęła jedna godzina. Nie została przesunięta ani skreślona. Po prostu nigdy się nie wydarzy. Kronika wysłała ostatni sygnał do ${state.p1.name} i ${state.p2.name}. Macie odnaleźć czas, którego jeszcze nie zdążyliście stracić.`,
  roles:()=>`${state.p1.name} zostaje Kartografką Wspomnień. ${state.p2.name} zostaje Operatorem Sygnału. Jedna osoba odnajdzie znaczenie. Druga uruchomi ukryty mechanizm.`,
  hunt:()=>`Pierwszy ślad ukrył się w dwóch zwykłych przedmiotach. ${state.p1.name}, znajdź coś związanego z podróżą, miejscem albo wspomnieniem. ${state.p2.name}, znajdź urządzenie z ekranem, kontrolką lub przyciskami, które potrafi przekazać sygnał. Macie dziewięćdziesiąt sekund.`,
  shadow:()=>`Światło Kroniki przygasa. Z porwanej strony wychodzi Cień Niedokończonych Planów. Mówi: myślicie, że ukradłem waszą godzinę? Nie musiałem. Pozostawiliście ją pustą. Jeśli naprawdę chcecie ją odzyskać, pokażcie mi, na co ją przeznaczycie.`,
  hourChoice:()=>`Macie sto dwadzieścia sekund, aby wybrać jedną prawdziwą godzinę. Nie ogólną obietnicę. Potrzebny jest konkretny plan i termin. Gdy narrator skończy, czas uruchomi się automatycznie.`
};

function renderEpisode(){
  const renderer = sceneRenderers[state.scene];
  if(!renderer){ state.scene='safety'; saveState(); return renderEpisode(); }
  app.innerHTML = sceneShell(renderer(), `${sceneIndex()+1}/${SCENE_ORDER.length}`);
  wireScene(state.scene);
}

const sceneRenderers = {
  safety:()=>`<section class="card scene"><span class="badge">ZASADA ZERO</span><h2>Bezpieczna Legenda</h2><div class="note warning">Nie używajcie ostrych narzędzi, leków, dokumentów, pieniędzy ani rzeczy znajdujących się wysoko. Nie przesuwajcie ciężkich mebli.</div><p>Telefon jest tylko portalem. Najważniejsze wydarzenia mają rozegrać się między Wami.</p><div class="actions"><button id="next" class="primary">Rozumiemy — otwórz Kronikę</button></div></section>`,
  intro:()=>`<section class="card scene"><span class="badge">PROLOG</span><h2>Jutro będzie miało 23 godziny</h2><div class="story">Dokładnie o północy z kalendarza drużyny <strong>${esc(state.team)}</strong> zniknęła jedna godzina.<br><br>Nie została przesunięta. Nie została skreślona. Po prostu nigdy się nie wydarzy.</div><blockquote>„Nie oddamy czasu, którego jeszcze nie przeżyliśmy.”</blockquote><div class="actions"><button id="next" class="primary">Wypowiedzcie zdanie i rozpocznijcie</button></div></section>`,
  roles:()=>`<section class="card scene"><span class="badge">ROLE</span><h2>Kronika wybrała dwie osoby</h2><div class="role-grid"><div class="role-card"><strong>${esc(state.p1.name)} · Kartografka Wspomnień</strong><span>Rozpoznaje miejsca, wspomnienia i znaczenie przedmiotów.</span></div><div class="role-card"><strong>${esc(state.p2.name)} · Operator Sygnału</strong><span>Uruchamia urządzenia, odczytuje wzory i zakłócenia.</span></div></div><div class="note">Wasze zainteresowania również mają znaczenie: <strong>${esc(state.p1.interest)}</strong> i <strong>${esc(state.p2.interest)}</strong>.</div><div class="actions"><button id="next" class="primary">Przyjmujemy role</button></div></section>`,
  hunt:()=>`<section class="card scene"><span class="badge">PRÓBA 1 · DWA PRZEDMIOTY</span><h2>Pierwszy ślad</h2><div class="role-grid"><div class="role-card"><strong>${esc(state.p1.name)}</strong><span>Znajdź bezpieczny przedmiot związany z podróżą, miejscem albo wspomnieniem.</span></div><div class="role-card"><strong>${esc(state.p2.name)}</strong><span>Znajdź urządzenie z ekranem, kontrolką lub przyciskami, które przekazuje sygnał.</span></div></div>${timerMarkup(90,'huntTimer')}<div class="actions"><button id="huntDone" class="primary">Znaleźliśmy oba</button><button id="huntRescue" class="secondary">Mamy tylko jeden</button></div></section>`,
  objects:()=>`<section class="card scene"><span class="badge">ZAPIS ŚLADÓW</span><h2>Co znaleźliście?</h2><p>Kronika sama wybierze Kotwicę. Nie wiecie jeszcze, dlaczego właśnie ten przedmiot będzie ważniejszy.</p><div class="grid two"><div><label>Przedmiot ${esc(state.p1.name)}</label><input id="object1" value="${esc(state.answers.object1||'')}" placeholder="np. walizka, zdjęcie, klucz"></div><div><label>Przedmiot ${esc(state.p2.name)}</label><input id="object2" value="${esc(state.answers.object2||'')}" placeholder="np. telefon, pilot, głośnik"></div></div><div class="actions"><button id="analyzeObjects" class="primary">Pozwól Kronice wybrać</button></div></section>`,
  anchor:()=>anchorScene(),
  privateIwona:()=>privateChoiceScene('p1'),
  privateSzymon:()=>privateChoiceScene('p2'),
  signalReveal:()=>signalRevealScene(),
  memoryIntro:()=>`<section class="card scene"><span class="badge">PRÓBA 2 · ECHO PAMIĘCI</span><h2>Sygnał pojawi się tylko raz</h2><p>Za chwilę zobaczycie sześć symboli. Macie <strong>10 sekund</strong>, aby zapamiętać ich kolejność. Potem znikną.</p><div class="note">Możecie sobie pomagać. Celem nie jest indywidualny wynik, tylko wspólne odtworzenie sygnału.</div><div class="actions"><button id="startMemory" class="primary">Pokaż sygnał</button></div></section>`,
  memoryShow:()=>memoryShowScene(),
  memoryAnswer:()=>memoryAnswerScene(),
  shadow:()=>shadowScene(),
  hourChoice:()=>hourChoiceScene(),
  portal:()=>portalScene(),
  twist:()=>twistScene(),
  finalChoice:()=>finalChoiceScene(),
  artifact:()=>artifactScene(),
  complete:()=>completeScene()
};

function timerMarkup(seconds,id){
  const m=String(Math.floor(seconds/60)).padStart(2,'0'), s=String(seconds%60).padStart(2,'0');
  return `<div class="timer-box"><div class="timer-label">Próba ruszy automatycznie</div><div id="${id}" class="timer">${m}:${s}</div><div id="${id}Countdown" class="countdown"></div><div class="timer-controls"><button id="${id}Pause" class="secondary" type="button">Pauza</button></div></div>`;
}
function startAutoTimer({seconds,displayId,countdownId,pauseId,onExpire}){
  let remaining=seconds, running=false, expired=false, count=3;
  const display=document.getElementById(displayId), countdown=document.getElementById(countdownId), pause=document.getElementById(pauseId);
  function paint(){
    const m=String(Math.floor(remaining/60)).padStart(2,'0'), s=String(remaining%60).padStart(2,'0');
    if(display){display.textContent=`${m}:${s}`;display.classList.toggle('danger',remaining<=10)}
  }
  paint(); countdown.textContent='Start za 3…'; motif('tick');
  const countInterval=setInterval(()=>{ count--; if(count>0){countdown.textContent=`Start za ${count}…`;motif('tick')} else {clearInterval(countInterval);countdown.textContent='CZAS RUSZYŁ';running=true;motif('open');tickInterval=setInterval(tick,1000)} },900);
  let tickInterval=null;
  function tick(){
    if(!running||expired)return; remaining--; paint(); if(remaining<=10&&remaining>0)tone(700,.08,'square',.018); if(remaining<=0){expired=true;running=false;clearInterval(tickInterval);countdown.textContent='CZAS MINĄŁ — możecie dokończyć';motif('warning');navigator.vibrate?.([160,80,160]);onExpire?.();}
  }
  pause.onclick=()=>{running=!running;pause.textContent=running?'Pauza':'Wznów';countdown.textContent=running?'Czas trwa':'Próba wstrzymana'};
  activeTimer={get remaining(){return remaining},get expired(){return expired},interval:tickInterval,countdownTimeout:countInterval,stop(){clearInterval(countInterval);clearInterval(tickInterval);running=false;}};
  return activeTimer;
}

function classifyObject(name){
  const n=normalize(name);
  const groups=[
    {type:'czas',score:0,keys:['zegar','zegarek','budzik','kalendarz','minutnik','timer']},
    {type:'sygnał',score:0,keys:['telefon','pilot','radio','glosnik','głośnik','tablet','laptop','komputer','smartfon','sluchawki','słuchawki','telewizor']},
    {type:'droga',score:0,keys:['klucz','walizka','plecak','mapa','but','samochod','samochód','bilet','paszport']},
    {type:'pamięć',score:0,keys:['zdjecie','zdjęcie','album','pamiatka','pamiątka','kubek','ksiazka','książka']}
  ];
  for(const g of groups) for(const k of g.keys) if(n.includes(normalize(k))) g.score+=3;
  groups.sort((a,b)=>b.score-a.score); return groups[0].score?groups[0].type:'zwykły';
}
function anchorScore(name, owner){
  const type=classifyObject(name); const priority={czas:10,'sygnał':8,droga:6,'pamięć':5,'zwykły':2}[type];
  const length=Math.min(4,normalize(name).replace(/\s/g,'').length/4);
  const roleBonus=owner==='p2'&&type==='sygnał'?2:owner==='p1'&&(type==='droga'||type==='pamięć')?2:0;
  return priority+length+roleBonus;
}
function chooseAnchor(){
  const one={item:state.answers.object1,owner:state.p1.name,ownerKey:'p1'};
  const two={item:state.answers.object2,owner:state.p2.name,ownerKey:'p2'};
  const chosen=anchorScore(one.item,'p1')>=anchorScore(two.item,'p2')?one:two;
  chosen.type=classifyObject(chosen.item); state.answers.anchor=chosen; saveState(); return chosen;
}
function anchorInterpretation(anchor){
  const lines={
    czas:`${anchor.item} nie tylko pokazuje czas. Kronika wykryła, że jedna z jego minut nie należy do dzisiejszego dnia.`,
    'sygnał':`${anchor.item} odebrał sygnał, którego nie wysłało żadne znane urządzenie. Wiadomość pochodzi dokładnie godzinę z przyszłości.`,
    droga:`${anchor.item} pamięta kierunek podróży, która jeszcze się nie rozpoczęła. Brakująca godzina ukryła się na jej początku.`,
    'pamięć':`${anchor.item} przechowuje ślad chwili, która mogła się wydarzyć, ale została pominięta.`,
    'zwykły':`Kronika wybrała ${anchor.item}, ponieważ Cień najbardziej lubi ukrywać ważne rzeczy w zwyczajnych przedmiotach.`
  };
  return lines[anchor.type]||lines['zwykły'];
}
function anchorScene(){
  const a=state.answers.anchor||chooseAnchor();
  return `<section class="card scene"><span class="badge">KOTWICA CZASU</span><h2>Kronika dokonała wyboru</h2><div class="artifact"><div class="artifact-symbol">${a.type==='czas'?'⌛':a.type==='sygnał'?'📡':a.type==='droga'?'🧭':a.type==='pamięć'?'🪶':'✦'}</div><h3>${esc(a.item)}</h3><p>${esc(anchorInterpretation(a))}</p></div><div class="note">Kotwicę znalazł(a): <strong>${esc(a.owner)}</strong>. Nie odkładajcie jej daleko. Wróci w rytuale i finale.</div><div class="actions"><button id="next" class="primary">Zachowujemy Kotwicę</button></div></section>`;
}

function privateChoiceScene(personKey){
  const isP1=personKey==='p1'; const person=isP1?state.p1:state.p2;
  const options=isP1?['Podróż','Dom','Wspomnienie']:['Gra','Zwycięstwo','Drużyna'];
  return `<section class="card scene"><span class="badge">TAJNY WYBÓR</span><h2>Telefon przejmuje ${esc(person.name)}</h2><div class="private-step"><p><strong>Druga osoba odwraca wzrok.</strong> ${esc(person.name)} wybiera jedno słowo bez konsultacji.</p><div class="choice-list">${options.map(o=>`<button class="choice" data-private="${esc(o)}">${esc(o)}</button>`).join('')}</div></div><p class="micro">Wybór pozostanie ukryty do chwili odsłonięcia obu sygnałów.</p></section>`;
}
function signalConnection(w1,w2){
  const key=`${w1}|${w2}`;
  const map={
    'Podróż|Gra':'Najlepsza podróż zaczyna się wtedy, gdy droga staje się wspólną grą.',
    'Podróż|Zwycięstwo':'Prawdziwym zwycięstwem jest dotarcie razem do miejsca, o którym wcześniej tylko mówiliście.',
    'Podróż|Drużyna':'Droga ma sens dopiero wtedy, gdy cała drużyna zna wspólny kierunek.',
    'Dom|Gra':'Nawet zwykły dom może stać się planszą najważniejszej przygody.',
    'Dom|Zwycięstwo':'Najważniejsze zwycięstwa są tymi, do których chce się wracać do domu.',
    'Dom|Drużyna':'Dom nie jest miejscem. Jest drużyną, która potrafi do siebie wrócić.',
    'Wspomnienie|Gra':'Najlepsza gra kończy się wtedy, gdy zostaje po niej prawdziwe wspomnienie.',
    'Wspomnienie|Zwycięstwo':'Zwycięstwo przemija, ale wspomnienie wspólnej chwili zostaje.',
    'Wspomnienie|Drużyna':'Wspomnienia stają się silniejsze, gdy cała drużyna pamięta je inaczej.'
  };
  return map[key]||`${w1} i ${w2} tworzą jeden sygnał, którego Cień nie potrafi rozdzielić.`;
}
function signalRevealScene(){
  const w1=state.answers.word1,w2=state.answers.word2;
  const generated=state.answers.signalSentence||signalConnection(w1,w2);
  state.answers.signalSentence=generated;saveState();
  return `<section class="card scene"><span class="badge">ODSŁONIĘCIE SYGNAŁÓW</span><h2>Dwa różne słowa połączyły się</h2><div class="signal-pair"><div class="signal-word">${esc(w1)}</div><div class="signal-link">＋</div><div class="signal-word">${esc(w2)}</div></div><div class="reveal-panel"><strong>Kronika odczytała zdanie:</strong><blockquote>${esc(generated)}</blockquote></div><label>Możecie zostawić zdanie albo poprawić je własnymi słowami</label><textarea id="signalSentence">${esc(generated)}</textarea><div class="actions"><button id="saveSignal" class="primary">Zapiszcie wiadomość przyszłości</button></div></section>`;
}

function createMemorySequence(){
  const seed=(normalize(state.answers.anchor?.item).length + normalize(state.answers.word1).length*3 + normalize(state.answers.word2).length*5) || 17;
  const pool=[...GLYPHS]; const seq=[];
  for(let i=0;i<6;i++){ const idx=(seed+i*7+i*i)%pool.length; seq.push(pool.splice(idx%pool.length,1)[0]); }
  state.memorySequence=seq;saveState();return seq;
}
function memoryShowScene(){
  const seq=state.memorySequence.length?state.memorySequence:createMemorySequence();
  return `<section class="card scene"><span class="badge">SYGNAŁ AKTYWNY</span><h2>Zapamiętajcie kolejność</h2><div class="memory-board">${seq.map(g=>`<div class="glyph">${g}</div>`).join('')}</div><div class="timer-box"><div class="timer-label">Sygnał zniknie za</div><div id="memoryClock" class="timer">00:10</div></div><p class="muted" style="text-align:center">Nie zapisujcie. Patrzcie razem.</p></section>`;
}
function memoryAnswerScene(){
  const selected=state.memoryAnswer||[];
  const shuffled=[...state.memorySequence,...GLYPHS.filter(g=>!state.memorySequence.includes(g)).slice(0,3)].sort((a,b)=>normalize(a+state.team).length%3-normalize(b+state.team).length%3 || a.localeCompare(b));
  const available=shuffled.filter(g=>!selected.includes(g));
  return `<section class="card scene"><span class="badge">ODTWÓRZCIE ECHO</span><h2>Wybierzcie sześć symboli w kolejności</h2><div class="memory-board memory-hidden">${Array.from({length:6},(_,i)=>`<div class="glyph">${selected[i]||'?'}</div>`).join('')}</div><div class="answer-chips">${available.map(g=>`<button class="chip" data-glyph="${g}">${g}</button>`).join('')}</div><div class="actions"><button id="undoGlyph" class="secondary">Cofnij symbol</button><button id="checkMemory" class="primary">Sprawdź sygnał</button></div></section>`;
}
function scoreMemory(){
  let correct=0; for(let i=0;i<6;i++) if(state.memoryAnswer[i]===state.memorySequence[i]) correct++;
  state.results.memoryCorrect=correct;
  state.results.memory=correct===6?'czysty':correct>=3?'zakłócony':'utracony';
  saveState(); return correct;
}

function shadowScene(){
  const a=state.answers.anchor; const memory=state.results.memory;
  const memoryLine=memory==='czysty'?'Odtworzyliście sygnał bez błędu. Cień nie zna jego pełnej treści.':memory==='zakłócony'?'Część sygnału została odtworzona, ale Cień usłyszał brakujące fragmenty.':'Sygnał zniknął, lecz Kronika zachowała jego pierwszy i ostatni znak.';
  return `<section class="card scene"><span class="badge">PIERWSZY ZWROT</span><h2>Cień przemawia</h2><div class="story">Światło przygasa. Na ekranie pojawia się postać bez twarzy.<br><br><strong>Cień Niedokończonych Planów.</strong></div><blockquote>„Myślicie, że ukradłem Waszą godzinę? Nie musiałem. Pozostawiliście ją pustą.”</blockquote><p>Cień dotyka nazwy Kotwicy: <strong>${esc(a.item)}</strong>.</p><div class="note">${esc(memoryLine)}</div><blockquote>„Jeśli naprawdę chcecie ją odzyskać, pokażcie mi, na co ją przeznaczycie.”</blockquote><div class="actions"><button id="next" class="primary">Nie oddamy tej godziny</button></div></section>`;
}

function hourOptions(){
  return [
    {id:'game',title:'Godzina Gry',desc:`${state.p2.name} wybiera wspólną grę. Przez godzinę żadnych innych telefonów ani rozpraszaczy.`,example:'np. sobota, 18:00 — wspólna gra przez godzinę'},
    {id:'trip',title:'Godzina Wyprawy',desc:`${state.p1.name} wybiera spacer, mały wyjazd albo zaplanowanie ${state.dream}.`,example:'np. niedziela, 11:00 — planujemy lub wykonujemy wyprawę'},
    {id:'surprise',title:'Godzina Niespodzianki',desc:'Przygotujecie coś dla Mateusza i Ewy, którzy nie uczestniczą w tym odcinku.',example:'np. w piątek przygotujemy dla nich niespodziankę'},
    {id:'own',title:'Własna Godzina',desc:'Wymyślacie inne konkretne działanie trwające mniej więcej godzinę.',example:'wpiszcie dokładnie co i kiedy zrobicie'}
  ];
}
function hourChoiceScene(){
  const selected=state.answers.hourId||'';
  return `<section class="card scene"><span class="badge">PRÓBA 3 · ODZYSKANIE GODZINY</span><h2>Na co przeznaczycie odzyskany czas?</h2>${timerMarkup(120,'hourTimer')}<div class="option-grid">${hourOptions().map(o=>`<button class="choice ${selected===o.id?'selected':''}" data-hour="${o.id}"><strong>${o.title}</strong><small>${esc(o.desc)}</small></button>`).join('')}</div><div style="margin-top:15px"><label id="hourDetailLabel">Konkretny termin i działanie</label><input id="hourDetail" value="${esc(state.answers.hourDetail||'')}" placeholder="${selected?esc(hourOptions().find(o=>o.id===selected)?.example):'Najpierw wybierzcie rodzaj godziny'}"></div><div class="actions"><button id="saveHour" class="primary">Zapisz odzyskaną godzinę</button><button id="fateHour" class="secondary hidden">Nie możemy się zgodzić — Los Kroniki</button></div></section>`;
}

function portalScene(){
  const a=state.answers.anchor;
  return `<section class="card scene"><span class="badge">RYTUAŁ KOTWICY</span><h2>Połóżcie ${esc(a.item)} między sobą</h2><p>Kronika potrzebuje dwóch osób naraz. Na telefonie przyłóżcie <strong>dwa palce jednocześnie</strong> do portalu i utrzymajcie je przez trzy sekundy.</p><div class="portal-wrap"><div id="portal" class="portal"><div class="portal-core"><span id="portalText">DWA DOTKNIĘCIA</span></div></div><div class="hold-progress"><div id="holdBar"></div></div><div id="portalHint" class="micro">Na laptopie przytrzymaj lewy przycisk myszy.</div></div><div class="actions"><button id="portalFallback" class="secondary">Tryb awaryjny — wspólne hasło</button></div></section>`;
}
function twistScene(){
  const a=state.answers.anchor; const sentence=state.answers.signalSentence; const hour=state.answers.hourTitle;
  const portalLine=state.results.portal==='duet'?'Portal rozpoznał dwa dotknięcia. Kronika potwierdziła, że decyzja należała do Was obojga.':'Portal otworzył się przez wspólne hasło. Cień zapamiętał, że potrzebowaliście drogi awaryjnej.';
  return `<section class="card scene"><span class="badge">DRUGI ZWROT</span><h2>Cień nie jest złodziejem</h2><div class="story">Kotwica — <strong>${esc(a.item)}</strong> — reaguje po raz drugi. Kronika odtwarza zdanie:<blockquote>${esc(sentence)}</blockquote></div><p>${esc(portalLine)}</p><blockquote>„Nie jestem tym, kto zabrał godzinę” — mówi Cień. „Jestem wersją przyszłości, w której nigdy nie wykonaliście tego planu.”</blockquote><p>Odzyskana godzina ma już nazwę: <strong>${esc(hour)}</strong>. Teraz musicie zdecydować, czy ją zamknąć, czy otworzyć dla całej rodziny.</p><div class="actions"><button id="next" class="primary">Podejmujemy ostatnią decyzję</button></div></section>`;
}
function finalChoiceScene(){
  return `<section class="card scene"><span class="badge">FINAŁOWA DECYZJA</span><h2>Co stanie się z odzyskaną godziną?</h2><button class="choice" data-final="sealed"><strong>A — Zamknąć godzinę</strong><small>Plan staje się bezpieczny i należy do Iwony oraz Szymona. Nie można go zmienić.</small></button><button class="choice" data-final="open"><strong>B — Pozostawić godzinę otwartą</strong><small>W Odcinku 2 Mateusz i Ewa będą mogli wejść do historii, ale Cień również otrzyma nową szansę.</small></button></section>`;
}

function legendaryAnchorName(){
  const a=state.answers.anchor; const hour=state.answers.hourId; const memory=state.results.memory;
  const typeWord={czas:'Zegar',sygnał:'Nadajnik',droga:'Kompas','pamięć':'Kronika','zwykły':'Kotwica'}[a.type]||'Kotwica';
  const effect=state.answers.finalChoice==='open'?'Otwartej Godziny':memory==='czysty'?'Czystego Sygnału':hour==='trip'?'Wspólnej Drogi':hour==='game'?'Odzyskanej Gry':'Powracającego Czasu';
  return `${typeWord} ${effect}`;
}
function computeArtifact(){
  const finalOpen=state.answers.finalChoice==='open';
  const perfect=state.results.memory==='czysty'&&state.results.hunt==='sukces'&&state.results.hour==='sukces'&&state.results.portal==='duet';
  if(finalOpen && perfect) return {symbol:'🧭',name:'Kompas Czterech Godzin',desc:'Otwiera nowy fragment historii dla całej rodziny.'};
  if(finalOpen) return {symbol:'🌀',name:'Kompas Otwartej Godziny',desc:'Może prowadzić do większej historii, ale pozostawia drogę dla Cienia.'};
  if(state.results.hour==='spóźnienie') return {symbol:'⌛',name:'Pieczęć Godziny z Rysą',desc:'Czas został odzyskany, choć wahanie pozostawiło na nim ślad.'};
  if(state.results.memory==='utracony') return {symbol:'🔔',name:'Pieczęć Ostatniego Echa',desc:'Kronika zachowała tylko pierwszy i ostatni znak, ale to wystarczyło.'};
  return {symbol:'✺',name:'Pieczęć Odzyskanego Czasu',desc:'Chroni konkretną godzinę, którą drużyna naprawdę zamierza przeżyć.'};
}
function artifactScene(){
  const artifact=computeArtifact(); state.answers.artifact=artifact; state.answers.legendaryAnchor=legendaryAnchorName(); saveState();
  const ending=state.answers.finalChoice==='open'?'Kronika nie zamknęła się. Na jej stronach pojawiły się cztery miejsca: dla Iwony, Szymona, Mateusza i Ewy.':'Kronika zamknęła się z cichym uderzeniem. Odzyskana godzina wróciła do jutra i została zapisana pod konkretnym planem.';
  return `<section class="card scene"><span class="badge">ARTEFAKT ZDOBYTY</span><h2>${esc(ending)}</h2><div class="artifact"><div class="artifact-symbol">${artifact.symbol}</div><h3>${esc(artifact.name)}</h3><p>${esc(artifact.desc)}</p></div><div class="note"><strong>Kotwica otrzymała legendarną nazwę:</strong><br>${esc(state.answers.legendaryAnchor)}</div><blockquote>„Odzyskaliście jedną godzinę. Zobaczymy, ile kolejnych pozwolicie mi zabrać.”</blockquote><div class="actions"><button id="next" class="primary">Zapiszcie finał w Kronice</button></div></section>`;
}
function completeScene(){
  const a=state.answers.anchor, artifact=state.answers.artifact||computeArtifact();
  return `<section class="card scene"><span class="badge">ODCINEK UKOŃCZONY</span><h2>${esc(state.p1.name)} i ${esc(state.p2.name)} odzyskali brakującą godzinę</h2><div class="success note">Historia zapamiętała przedmioty, słowa, wynik pamięci, spóźnienia, rytuał i finałową decyzję.</div><div class="summary-grid">
    <div class="summary-row"><strong>Kotwica:</strong> ${esc(a.item)} → ${esc(state.answers.legendaryAnchor)}</div>
    <div class="summary-row"><strong>Wiadomość:</strong> ${esc(state.answers.signalSentence)}</div>
    <div class="summary-row"><strong>Echo pamięci:</strong> ${state.results.memoryCorrect}/6 symboli</div>
    <div class="summary-row"><strong>Odzyskana godzina:</strong> ${esc(state.answers.hourTitle)} — ${esc(state.answers.hourDetail)}</div>
    <div class="summary-row"><strong>Artefakt:</strong> ${esc(artifact.name)}</div>
  </div><div class="actions"><button id="openRecap" class="primary">Zobacz filmowe podsumowanie</button><button id="exportTest" class="secondary">Eksportuj wynik testu</button><button id="openFeedback" class="secondary">Oceń odcinek</button></div></section>`;
}

function wireScene(scene){
  const narration=narrations[scene]?.();
  if(narration) setTimeout(()=>speak(narration,()=>{ if(scene==='hunt') wireHuntTimer(); if(scene==='hourChoice') startHourTimer(); }),180);
  else if(scene==='hunt') setTimeout(wireHuntTimer,500);

  if(scene==='safety') document.getElementById('next').onclick=()=>gotoScene('intro','Kronika usuwa jedną godzinę…');
  if(scene==='intro') document.getElementById('next').onclick=()=>gotoScene('roles','Kronika przydziela role…');
  if(scene==='roles') document.getElementById('next').onclick=()=>gotoScene('hunt','Pierwsza próba zostaje odblokowana…');
  if(scene==='hunt'){
    document.getElementById('huntDone').onclick=()=>{ const expired=activeTimer?.expired;activeTimer?.stop?.();state.results.hunt=expired?'spóźnienie':'sukces';saveState();gotoScene('objects',expired?'Cień zobaczył Wasze przedmioty…':'Kronika zabezpiecza oba ślady…'); };
    document.getElementById('huntRescue').onclick=()=>{activeTimer?.stop?.();state.results.hunt='ratunek';saveState();gotoScene('objects','Kronika uruchamia drogę improwizacji…');};
  }
  if(scene==='objects') document.getElementById('analyzeObjects').onclick=()=>{
    const o1=document.getElementById('object1').value.trim(),o2=document.getElementById('object2').value.trim();
    if(!o1||!o2){alert('Wpiszcie oba przedmioty. Jeśli znaleźliście tylko jeden, drugi może być bezpiecznym przedmiotem zastępczym.');return;}
    state.answers.object1=o1;state.answers.object2=o2;chooseAnchor();saveState();gotoScene('anchor',`Kronika porównuje: ${o1} i ${o2}…`);
  };
  if(scene==='anchor') document.getElementById('next').onclick=()=>gotoScene('privateIwona',`Telefon przejmuje ${state.p1.name}…`);
  if(scene==='privateIwona') document.querySelectorAll('[data-private]').forEach(btn=>btn.onclick=()=>{state.answers.word1=btn.dataset.private;saveState();gotoScene('privateSzymon',`Wybór ${state.p1.name} został ukryty. Telefon przejmuje ${state.p2.name}…`);});
  if(scene==='privateSzymon') document.querySelectorAll('[data-private]').forEach(btn=>btn.onclick=()=>{state.answers.word2=btn.dataset.private;state.answers.signalSentence=signalConnection(state.answers.word1,state.answers.word2);saveState();gotoScene('signalReveal','Kronika łączy dwa tajne sygnały…');});
  if(scene==='signalReveal') document.getElementById('saveSignal').onclick=()=>{const v=document.getElementById('signalSentence').value.trim();if(!v){alert('Zdanie nie może być puste.');return;}state.answers.signalSentence=v;saveState();gotoScene('memoryIntro','Wiadomość została wysłana godzinę w przyszłość…');};
  if(scene==='memoryIntro') document.getElementById('startMemory').onclick=()=>{createMemorySequence();gotoScene('memoryShow','Sygnał pojawi się tylko raz…');};
  if(scene==='memoryShow') startMemoryDisplay();
  if(scene==='memoryAnswer') wireMemoryAnswer();
  if(scene==='shadow') document.getElementById('next').onclick=()=>gotoScene('hourChoice','Cień rozpoczyna ostatnie odliczanie…');
  if(scene==='hourChoice') wireHourChoice();
  if(scene==='portal') wirePortal();
  if(scene==='twist') document.getElementById('next').onclick=()=>gotoScene('finalChoice','Kronika otwiera dwie wersje jutra…');
  if(scene==='finalChoice') document.querySelectorAll('[data-final]').forEach(btn=>btn.onclick=()=>{state.answers.finalChoice=btn.dataset.final;saveState();gotoScene('artifact',state.answers.finalChoice==='open'?'Kronika pozostaje otwarta…':'Kronika zamyka odzyskaną godzinę…');});
  if(scene==='artifact') document.getElementById('next').onclick=()=>{state.completedAt=new Date().toISOString();state.recapReady=true;saveState();gotoScene('complete','Kronika zapisuje Wasz odcinek…');};
  if(scene==='complete'){
    document.getElementById('openRecap').onclick=()=>{state.screen='recap';saveState();render();};
    document.getElementById('exportTest').onclick=exportResults;
    document.getElementById('openFeedback').onclick=()=>{state.screen='feedback';saveState();render();};
  }
}
function wireHuntTimer(){ if(state.scene!=='hunt'||activeTimer)return; startAutoTimer({seconds:90,displayId:'huntTimer',countdownId:'huntTimerCountdown',pauseId:'huntTimerPause',onExpire:()=>{state.results.huntExpired=true;saveState();}}); }
function startMemoryDisplay(){
  let remaining=10; const clock=document.getElementById('memoryClock'); motif('reveal');
  const interval=setInterval(()=>{remaining--;if(clock)clock.textContent=`00:${String(remaining).padStart(2,'0')}`;if(remaining<=3)tone(760,.08,'square',.02);if(remaining<=0){clearInterval(interval);gotoScene('memoryAnswer','Sygnał zniknął. Odtwórzcie go razem…');}},1000);
  memoryTimeout=interval;
}
function wireMemoryAnswer(){
  state.memoryAnswer=state.memoryAnswer||[];
  document.querySelectorAll('[data-glyph]').forEach(btn=>btn.onclick=()=>{if(state.memoryAnswer.length>=6)return;state.memoryAnswer.push(btn.dataset.glyph);saveState();renderEpisode();});
  document.getElementById('undoGlyph').onclick=()=>{state.memoryAnswer.pop();saveState();renderEpisode();};
  document.getElementById('checkMemory').onclick=()=>{if(state.memoryAnswer.length!==6){alert('Wybierzcie dokładnie sześć symboli.');return;}const correct=scoreMemory();const text=correct===6?'Czysty sygnał. Cień nie poznał kodu.':correct>=3?`Odtworzyliście ${correct} z 6 pozycji. Cień usłyszał zakłócenia.`:'Sygnał zniknął, ale Kronika zachowała pierwszy i ostatni znak.';gotoScene('shadow',text);};
}
let hourExpiredLocal=false;
function startHourTimer(){
  if(state.scene!=='hourChoice'||activeTimer)return;
  startAutoTimer({seconds:120,displayId:'hourTimer',countdownId:'hourTimerCountdown',pauseId:'hourTimerPause',onExpire:()=>{hourExpiredLocal=true;state.results.hourExpired=true;document.getElementById('fateHour')?.classList.remove('hidden');saveState();}});
}
function wireHourChoice(){
  hourExpiredLocal=false;
  document.querySelectorAll('[data-hour]').forEach(btn=>btn.onclick=()=>{state.answers.hourId=btn.dataset.hour;document.querySelectorAll('[data-hour]').forEach(x=>x.classList.toggle('selected',x===btn));const o=hourOptions().find(x=>x.id===btn.dataset.hour);document.getElementById('hourDetail').placeholder=o.example;saveState();});
  document.getElementById('saveHour').onclick=()=>{
    const id=state.answers.hourId,detail=document.getElementById('hourDetail').value.trim();
    if(!id){alert('Najpierw wybierzcie rodzaj odzyskanej godziny.');return;}if(!detail){alert('Wpiszcie konkretnie co i kiedy zrobicie.');return;}
    const option=hourOptions().find(o=>o.id===id);state.answers.hourTitle=option.title;state.answers.hourDetail=detail;state.results.hour=(activeTimer?.expired||hourExpiredLocal)?'spóźnienie':'sukces';activeTimer?.stop?.();saveState();gotoScene('portal',state.results.hour==='sukces'?'Odzyskana godzina otrzymała konkretny termin…':'Cień pozostawił na godzinie Rysę Wahania…');
  };
  document.getElementById('fateHour').onclick=()=>{
    const options=hourOptions().slice(0,3);const idx=(normalize(state.answers.anchor?.item).length+state.memorySequence.length)%3;const o=options[idx];state.answers.hourId=o.id;state.answers.hourTitle=o.title;state.answers.hourDetail=`Los Kroniki: ${o.example.replace('np. ','')}`;state.results.hour='los';activeTimer?.stop?.();saveState();gotoScene('portal','Kronika podjęła decyzję za Was. Cień zapamięta ten dług…');
  };
}
function wirePortal(){
  const portal=document.getElementById('portal'),bar=document.getElementById('holdBar'),text=document.getElementById('portalText'),hint=document.getElementById('portalHint');
  const isTouch='ontouchstart' in window||navigator.maxTouchPoints>0;
  let startedAt=null;
  function reset(){portal.classList.remove('armed');portalProgress=0;bar.style.width='0%';text.textContent='DWA DOTKNIĘCIA';startedAt=null;if(portalInterval){clearInterval(portalInterval);portalInterval=null;}}
  function begin(){if(portalInterval)return;startedAt=Date.now();portal.classList.add('armed');text.textContent='UTRZYMAJCIE';motif('portal');portalInterval=setInterval(()=>{portalProgress=Math.min(100,(Date.now()-startedAt)/30);bar.style.width=`${portalProgress}%`;if(portalProgress>=100){clearInterval(portalInterval);portalInterval=null;state.results.portal=isTouch?'duet':'mysz';saveState();text.textContent='PORTAL OTWARTY';motif('success');navigator.vibrate?.([100,60,220]);setTimeout(()=>gotoScene('twist','Kotwica odpowiada na wspólny dotyk…'),700);}},50);}
  portal.onpointerdown=e=>{e.preventDefault();portal.setPointerCapture?.(e.pointerId);portalPointers.add(e.pointerId);if((isTouch&&portalPointers.size>=2)||(!isTouch&&portalPointers.size>=1))begin();else{hint.textContent='Potrzebne jest jeszcze drugie dotknięcie.';}};
  const end=e=>{portalPointers.delete(e.pointerId);if(!state.results.portal)reset();};portal.onpointerup=end;portal.onpointercancel=end;portal.onpointerleave=e=>{if(!isTouch)end(e)};
  document.getElementById('portalFallback').onclick=()=>{const phrase=prompt('Wypowiedzcie razem i wpiszcie wspólne hasło:', 'Nie oddamy naszej godziny');if(!phrase)return;state.results.portal='hasło';state.answers.portalPhrase=phrase;saveState();gotoScene('twist','Kronika rozpoznaje wspólne hasło…');};
}

function recapFrames(){
  const a=state.answers.anchor, art=state.answers.artifact||computeArtifact();
  const memory=state.results.memoryCorrect===6?'Odtworzyli cały sygnał':`Odtworzyli ${state.results.memoryCorrect||0} z 6 znaków`;
  const hunt=state.results.hunt==='sukces'?'Zdążyli przed Cieniem':state.results.hunt==='spóźnienie'?'Czas minął, ale nie zrezygnowali':'Stworzyli drogę improwizacji';
  return [
    {t:0,d:2.1,k:'NASZA LEGENDA',v:'Godzina, której brakowało'},
    {t:2.1,d:3.0,k:'DRUŻYNA',v:`${state.p1.name} i ${state.p2.name}`},
    {t:5.1,d:3.0,k:'KOTWICA CZASU',v:a.item},
    {t:8.1,d:3.0,k:'PIERWSZA PRÓBA',v:hunt},
    {t:11.1,d:3.0,k:'ECHO PAMIĘCI',v:memory},
    {t:14.1,d:3.5,k:'ODZYSKANA GODZINA',v:state.answers.hourTitle},
    {t:17.6,d:3.4,k:'ICH PLAN',v:state.answers.hourDetail},
    {t:21.0,d:3.0,k:'ARTEFAKT',v:art.name},
    {t:24.0,d:3.0,k:'CIĄG DALSZY NASTĄPI',v:state.answers.finalChoice==='open'?'Cztery miejsca czekają w Kronice':'Cień wróci sprawdzić plan'},
    {t:27.0,d:2.5,k:'NASZA LEGENDA',v:'Ta historia powstała z ich decyzji'}
  ];
}
function canvasWrap(ctx,text,x,y,maxWidth,lineHeight){
  const words=String(text).split(/\s+/);let line='',lines=[];
  words.forEach(w=>{const test=line?`${line} ${w}`:w;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=w}else line=test});if(line)lines.push(line);
  const start=y-(lines.length-1)*lineHeight/2;lines.forEach((l,i)=>ctx.fillText(l,x,start+i*lineHeight));
}
function drawLogoCanvas(ctx,cx,cy,scale=1){
  ctx.save();ctx.translate(cx,cy);ctx.lineWidth=5*scale;ctx.strokeStyle='#ffd166';ctx.fillStyle='#111629';ctx.beginPath();ctx.arc(0,-8*scale,52*scale,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.strokeStyle='#78dcff';ctx.lineWidth=4*scale;ctx.beginPath();ctx.moveTo(-61*scale,31*scale);ctx.quadraticCurveTo(-30*scale,12*scale,0,34*scale);ctx.quadraticCurveTo(30*scale,12*scale,61*scale,31*scale);ctx.stroke();ctx.strokeStyle='#ffd166';ctx.beginPath();ctx.moveTo(0,-58*scale);ctx.lineTo(0,34*scale);ctx.stroke();ctx.restore();
}
function drawRecap(canvas,seconds){
  const ctx=canvas.getContext('2d'),W=canvas.width,H=canvas.height,frames=recapFrames();
  const frame=frames.find(f=>seconds>=f.t&&seconds<f.t+f.d)||frames[frames.length-1];const local=Math.max(0,Math.min(1,(seconds-frame.t)/frame.d));const alpha=Math.min(1,local*4,(1-local)*4);
  const grad=ctx.createLinearGradient(0,0,W,H);grad.addColorStop(0,'#070914');grad.addColorStop(.52,'#17213d');grad.addColorStop(1,'#2b1b3a');ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
  for(let i=0;i<34;i++){const x=(i*173+seconds*37)%W,y=(i*257+seconds*19)%H;ctx.fillStyle=`rgba(255,209,102,${.035+(i%5)*.012})`;ctx.beginPath();ctx.arc(x,y,2+i%4,0,Math.PI*2);ctx.fill();}
  ctx.globalAlpha=alpha;drawLogoCanvas(ctx,W/2,H*.15,1.25);ctx.textAlign='center';ctx.fillStyle='#ffd166';ctx.font='800 42px system-ui';ctx.fillText(frame.k,W/2,H*.29);ctx.fillStyle='#fff';ctx.font='900 76px system-ui';canvasWrap(ctx,frame.v,W/2,H*.43,W*.8,90);ctx.strokeStyle='rgba(255,255,255,.17)';ctx.lineWidth=3;ctx.strokeRect(48,48,W-96,H-96);ctx.fillStyle='rgba(255,255,255,.72)';ctx.font='500 27px system-ui';ctx.fillText('Interaktywny serial stworzony przez uczestników',W/2,H*.87);ctx.fillStyle='#ffd166';ctx.font='850 31px system-ui';ctx.fillText('NASZA LEGENDA · PROTOTYP PRO',W/2,H*.92);ctx.globalAlpha=1;
}
function playRecap(canvas,onDone){
  if(recapAnimation)cancelAnimationFrame(recapAnimation);const start=performance.now(),duration=29500;motif('open');
  function tick(now){const elapsed=now-start;drawRecap(canvas,elapsed/1000);if(elapsed<duration)recapAnimation=requestAnimationFrame(tick);else{recapAnimation=null;motif('success');onDone?.();}}
  recapAnimation=requestAnimationFrame(tick);
}
function createRecapAudioStream(duration=30){
  const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return null;const ctx=new Ctx();const dest=ctx.createMediaStreamDestination();const master=ctx.createGain();master.gain.value=.11;master.connect(dest);master.connect(ctx.destination);
  const notes=[196,247,294,392,330,440,523,392,659];notes.forEach((freq,i)=>{const osc=ctx.createOscillator(),gain=ctx.createGain(),start=ctx.currentTime+i*3.15;osc.type=i%2?'sine':'triangle';osc.frequency.value=freq;gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.16,start+.08);gain.gain.exponentialRampToValueAtTime(.0001,start+2.1);osc.connect(gain).connect(master);osc.start(start);osc.stop(start+2.2)});setTimeout(()=>ctx.close().catch(()=>{}),duration*1000+1500);return dest.stream;
}
function recordRecap(canvas){
  if(!canvas.captureStream||!window.MediaRecorder){alert('Ta przeglądarka nie obsługuje nagrania. Użyj plakatu PNG lub nagrywania ekranu.');return;}
  try{
    const videoStream=canvas.captureStream(30),audioStream=createRecapAudioStream(30),combined=new MediaStream([...videoStream.getVideoTracks(),...(audioStream?audioStream.getAudioTracks():[])]);
    const types=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];const mime=types.find(t=>MediaRecorder.isTypeSupported(t))||'';const rec=new MediaRecorder(combined,mime?{mimeType:mime}:{}),chunks=[];
    rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};rec.onstop=()=>{const blob=new Blob(chunks,{type:rec.mimeType||'video/webm'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`nasza-legenda-${safeFile(state.team)}.webm`;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000)};rec.start();playRecap(canvas,()=>rec.stop());
  }catch(err){console.error(err);alert('Nie udało się nagrać filmu. Zapisz plakat PNG albo użyj nagrywania ekranu.');}
}
function renderRecap(){
  app.innerHTML=`<section class="card"><span class="badge">FILMOWE PODSUMOWANIE 9:16</span><h2 style="margin-top:14px">Zwiastun Iwony i Szymona</h2><p class="muted">Treść filmu powstała z ich przedmiotów, wyników i decyzji. To prototyp renderowany lokalnie, bez wysyłania danych.</p><div class="recap-wrap"><canvas id="recapCanvas" width="1080" height="1920"></canvas></div><div class="actions"><button id="playRecap" class="primary">▶ Odtwórz</button><button id="savePoster" class="secondary">Zapisz plakat PNG</button><button id="recordRecap" class="secondary">Nagraj WebM z dźwiękiem</button><button id="feedbackBtn" class="secondary">Oceń odcinek</button></div><div class="note">Docelowo system wygeneruje MP4 z naturalnym lektorem, muzyką i awatarami. Ta wersja sprawdza, czy treść podsumowania chce się pokazać innym.</div></section>`;
  const canvas=document.getElementById('recapCanvas');drawRecap(canvas,0);
  document.getElementById('playRecap').onclick=()=>playRecap(canvas);
  document.getElementById('savePoster').onclick=()=>{drawRecap(canvas,21.7);const a=document.createElement('a');a.download=`nasza-legenda-${safeFile(state.team)}.png`;a.href=canvas.toDataURL('image/png');a.click();};
  document.getElementById('recordRecap').onclick=()=>recordRecap(canvas);
  document.getElementById('feedbackBtn').onclick=()=>{state.screen='feedback';saveState();render();};
}

function feedbackSlider(id,label){const value=state.feedback[id]||3;return `<div class="feedback-row"><label for="${id}">${label}</label><input id="${id}" type="range" min="1" max="5" value="${value}"><span id="${id}Value" class="feedback-score">${value}</span></div>`;}
function renderFeedback(){
  app.innerHTML=`<section class="card"><span class="badge">OCENA TESTU</span><h2 style="margin-top:14px">Bez grzecznościowych ocen</h2><p class="muted">Szukamy problemów, nie pochwał. Najważniejsze pytanie: czy chcecie kolejny odcinek?</p>${feedbackSlider('climate','Klimat historii')}${feedbackSlider('tasks','Ciekawość zadań')}${feedbackSlider('personal','Czy historia była o Was')}${feedbackSlider('surprise','Poziom zaskoczenia')}${feedbackSlider('recap','Czy podsumowanie chce się pokazać innym')}<div class="grid two"><div><label>Najlepszy moment</label><textarea id="best">${esc(state.feedback.best||'')}</textarea></div><div><label>Najsłabszy moment</label><textarea id="worst">${esc(state.feedback.worst||'')}</textarea></div></div><div style="margin-top:13px"><label>Co było niejasne albo wybiło z klimatu?</label><textarea id="unclear">${esc(state.feedback.unclear||'')}</textarea></div><div style="margin-top:13px"><label>Czy chcecie Odcinek 2?</label><select id="wantNext"><option value="">— wybierz —</option><option value="tak" ${state.feedback.wantNext==='tak'?'selected':''}>Tak, chcemy od razu</option><option value="może" ${state.feedback.wantNext==='może'?'selected':''}>Może po poprawkach</option><option value="nie" ${state.feedback.wantNext==='nie'?'selected':''}>Nie</option></select></div><div class="actions"><button id="saveFeedback" class="primary">Zapisz i pobierz wynik testu</button><button id="backRecap" class="secondary">Wróć do podsumowania</button></div></section>`;
  ['climate','tasks','personal','surprise','recap'].forEach(id=>{const el=document.getElementById(id),out=document.getElementById(`${id}Value`);el.oninput=()=>out.textContent=el.value;});
  document.getElementById('backRecap').onclick=()=>{state.screen='recap';saveState();render();};
  document.getElementById('saveFeedback').onclick=()=>{
    ['climate','tasks','personal','surprise','recap'].forEach(id=>state.feedback[id]=Number(document.getElementById(id).value));state.feedback.best=document.getElementById('best').value.trim();state.feedback.worst=document.getElementById('worst').value.trim();state.feedback.unclear=document.getElementById('unclear').value.trim();state.feedback.wantNext=document.getElementById('wantNext').value;saveState();exportResults();
  };
}
function exportResults(){
  const payload={exportedAt:new Date().toISOString(),appVersion:VERSION,team:state.team,participants:[state.p1,state.p2],dream:state.dream,durationMinutes:state.startedAt&&state.completedAt?Math.round((new Date(state.completedAt)-new Date(state.startedAt))/60000):null,answers:state.answers,results:state.results,feedback:state.feedback};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`wynik-testu-${safeFile(state.team)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}

if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));
render();
