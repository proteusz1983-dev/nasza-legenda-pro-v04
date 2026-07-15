'use strict';

const STORAGE_KEY = 'nasza_legenda_pro_v042';
const VERSION = '0.4.2';
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
  'safety','intro','roles','hunt','objects','anchor','privateChoice','signalReveal',
  'memoryIntro','memoryShow','memoryAnswer','shadow','hourChoice','portal','twist','finalChoice','artifact','complete'
];
const ROLE_DEFS = [
  {title:'Kartograf Wspomnień',desc:'Rozpoznaje miejsca, wspomnienia i znaczenie przedmiotów.',hunt:'Znajdź bezpieczny przedmiot związany z podróżą, miejscem albo wspomnieniem.',interest:'podróże',words:['Podróż','Dom','Wspomnienie']},
  {title:'Operator Sygnału',desc:'Uruchamia urządzenia, odczytuje wzory i zakłócenia.',hunt:'Znajdź urządzenie z ekranem, kontrolką lub przyciskami, które przekazuje sygnał.',interest:'gry',words:['Gra','Zwycięstwo','Drużyna']},
  {title:'Strażnik Kierunku',desc:'Odnajduje drogę, wybór i ukryty kierunek dalszej wyprawy.',hunt:'Znajdź przedmiot kojarzący się z drogą, kierunkiem albo podejmowaniem decyzji.',interest:'wyprawy',words:['Kierunek','Odwaga','Cel']},
  {title:'Łącznik Drużyny',desc:'Pilnuje, by żaden głos i żadna wskazówka nie zostały pominięte.',hunt:'Znajdź przedmiot kojarzący się z kontaktem, bliską osobą albo wspólnym działaniem.',interest:'wspólne chwile',words:['Razem','Zaufanie','Pomoc']},
  {title:'Tropiciel Czasu',desc:'Rozpoznaje rytm, kolejność i chwile, które łatwo przeoczyć.',hunt:'Znajdź przedmiot związany z czasem, czekaniem, rytmem albo codziennym zwyczajem.',interest:'zagadki',words:['Czas','Chwila','Powrót']},
  {title:'Opiekun Przyszłości',desc:'Chroni plany, marzenia i decyzje, które dopiero mają się wydarzyć.',hunt:'Znajdź przedmiot kojarzący się z planem, marzeniem albo przyszłym wydarzeniem.',interest:'marzenia',words:['Marzenie','Plan','Przyszłość']}
];
function defaultParticipants(count=2){
  return Array.from({length:Math.max(2,Math.min(6,count))},(_,i)=>({name:`Osoba ${i+1}`,interest:ROLE_DEFS[i].interest,age:''}));
}
const defaultState = () => ({
  version: VERSION,
  screen: 'home',
  scene: 'safety',
  team: 'Drużyna Testowa',
  participantCount: 2,
  participants: defaultParticipants(2),
  p1: {name:'Osoba 1', interest:'podróże',age:''},
  p2: {name:'Osoba 2', interest:'gry',age:''},
  dream: 'wspólny plan',
  forbidden: '',
  testMeta: {groupType:'rodzina z dzieckiem', testLabel:''},
  diagnostics: {narrationStarts:0, narrationReplays:0, narrationErrors:[], contextHelpUses:0},
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
let speechRunId = 0;
let speechKeepAlive = null;
let speechWatchdog = null;

function loadState(){
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const merged = raw ? Object.assign(defaultState(), raw) : defaultState();
    let people = Array.isArray(raw?.participants) ? raw.participants : [];
    if(people.length < 2 && raw){
      people = [
        {...(raw.p1||{}),age:raw.testMeta?.p1age||raw.p1?.age||''},
        {...(raw.p2||{}),age:raw.testMeta?.p2age||raw.p2?.age||''}
      ];
    }
    const count=Math.max(2,Math.min(6,Number(raw?.participantCount||people.length||2)));
    const defaults=defaultParticipants(count);
    merged.participants=Array.from({length:count},(_,i)=>({
      name:String(people[i]?.name||defaults[i].name),
      interest:String(people[i]?.interest||defaults[i].interest),
      age:String(people[i]?.age||'')
    }));
    merged.participantCount=count;
    if(merged.scene==='privateIwona'||merged.scene==='privateSzymon') merged.scene='privateChoice';
    merged.version=VERSION;
    syncLegacyParticipants(merged);
    return merged;
  } catch {
    return defaultState();
  }
}
function syncLegacyParticipants(target=state){
  target.participants=Array.isArray(target.participants)&&target.participants.length>=2?target.participants:defaultParticipants(2);
  target.participantCount=target.participants.length;
  target.p1=target.participants[0];
  target.p2=target.participants[1];
}
function saveState(){ syncLegacyParticipants(); localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function getParticipants(){ return state.participants||[state.p1,state.p2]; }
function teamSize(){ return getParticipants().length; }
function participant(index){ return getParticipants()[index]||getParticipants()[0]; }
function roleFor(index){ return ROLE_DEFS[index]||ROLE_DEFS[ROLE_DEFS.length-1]; }
function namesText(){
  const names=getParticipants().map(p=>p.name).filter(Boolean);
  if(names.length<=1) return names[0]||'Drużyna';
  if(names.length===2) return `${names[0]} i ${names[1]}`;
  return `${names.slice(0,-1).join(', ')} i ${names[names.length-1]}`;
}
function participantLabel(){ return teamSize()===2?'dwie osoby':`${teamSize()} osób`; }
function huntSeconds(){ return 90+Math.max(0,teamSize()-2)*20; }
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
    ${contextPanel(state.scene)}
    <div class="narration-bar">
      <button id="replayNarration" class="narration-btn" type="button">🔊 Odtwórz narrację tej sceny</button>
      <span id="narrationStatus" class="micro">Narrator gotowy</span>
    </div>
    ${content}`;
}

function sceneContext(scene){
  const a = state.answers.anchor?.item || 'wybrana Kotwica';
  const contexts = {
    safety:{past:'Zaczynacie nowy odcinek.',why:'Historia korzysta z prawdziwych przedmiotów, więc najpierw ustala bezpieczne zasady.',now:'Przeczytajcie zasady i potwierdźcie gotowość.'},
    intro:{past:'Kronika wykryła brak jednej godziny w jutrzejszym dniu.',why:'Jeżeli godzina pozostanie pusta, zamieni się w niewykorzystane wspomnienie.',now:'Wypowiedzcie zdanie drużyny i rozpocznijcie poszukiwanie.'},
    roles:{past:`Kronika rozpoznała ${participantLabel()} w drużynie.`,why:'Każda osoba otrzymuje własną funkcję, bo późniejsze próby wymagają różnych sposobów myślenia.',now:'Zapamiętajcie role i przyjmijcie je.'},
    hunt:{past:'Role zostały przydzielone.',why:`Brakująca godzina zostawiła ${teamSize()} ślady w zwykłych przedmiotach znajdujących się obok Was.`,now:'Każda osoba znajduje jeden bezpieczny przedmiot zgodnie ze swoją rolą.'},
    objects:{past:`Odnaleźliście ${teamSize()} materialne ślady.`,why:'Jeden z nich potrafi utrzymać połączenie z brakującą godziną i stanie się Kotwicą Czasu.',now:'Wpiszcie nazwy wszystkich przedmiotów, aby Kronika mogła je porównać.'},
    anchor:{past:'Kronika porównała oba przedmioty i wybrała Kotwicę.',why:`${a} będzie łączyć prawdziwy pokój z kolejnymi scenami historii.`,now:'Połóżcie Kotwicę blisko telefonu i przeczytajcie, jaki sygnał odebrała.'},
    privateChoice:{past:`Kotwica ${a} odebrała wiadomość złożoną z ${teamSize()} tajnych słów.`,why:'Każda osoba wybiera niezależnie, aby Cień nie mógł przewidzieć całego sygnału.',now:`Pozostali odwracają wzrok, a ${participant(Number(state.answers.secretIndex||0)).name} wybiera jedno słowo.`},
    signalReveal:{past:'Dwa niezależne słowa zostały zapisane.',why:'Połączone tworzą wiadomość wysłaną przez Waszą przyszłą wersję.',now:'Przeczytajcie zdanie i poprawcie je tylko wtedy, gdy nie brzmi jak Wasze.'},
    memoryIntro:{past:'Wiadomość przyszłości została wysłana przez Kotwicę.',why:'Cień próbuje usunąć kod prowadzący do brakującej godziny.',now:'Za chwilę zapamiętajcie sześć symboli w poprawnej kolejności.'},
    memoryShow:{past:'Kod pojawił się na ekranie tylko na chwilę.',why:'Każdy zapamiętany znak osłabi Cień w następnej scenie.',now:'Patrzcie razem i zapamiętajcie kolejność symboli.'},
    memoryAnswer:{past:'Cień ukrył kod, który przed chwilą widzieliście.',why:'Liczba poprawnych pozycji zmieni siłę Cienia i końcowy artefakt.',now:'Odtwórzcie dokładnie sześć symboli w tej samej kolejności.'},
    shadow:{past:'Próba pamięci ustaliła, ile fragmentów kodu udało się zachować.',why:'Cień żywi się planami, które nigdy nie otrzymały konkretnego terminu.',now:'Wysłuchajcie go, a potem zdecydujcie, na co naprawdę przeznaczycie odzyskaną godzinę.'},
    hourChoice:{past:'Cień ujawnił, że brakująca godzina była pustym planem.',why:'Godzinę można odzyskać tylko przez nadanie jej konkretnego działania i terminu.',now:'Wybierzcie rodzaj godziny i wpiszcie, co oraz kiedy zrobicie.'},
    portal:{past:'Wasza odzyskana godzina ma już cel i konkretny plan.',why:'Kronika musi sprawdzić, czy decyzję naprawdę przyjęła cała drużyna.',now:`Wszyscy dotykają ${a}, a dwie osoby otwierają portal dwoma dotknięciami.`},
    twist:{past:'Portal potwierdził wspólną decyzję i ponownie uruchomił Kotwicę.',why:'Dopiero teraz można zobaczyć prawdziwe źródło Cienia i znaczenie wcześniejszej wiadomości.',now:'Przeczytajcie zwrot akcji i przygotujcie się na finałowy wybór.'},
    finalChoice:{past:'Dowiedzieliście się, że Cień jest przyszłością, w której plan nie został wykonany.',why:'Ostatnia decyzja ustala, czy ta historia pozostanie tylko w obecnym składzie, czy otworzy drogę kolejnym osobom.',now:'Wybierzcie jedną z dwóch wersji przyszłości.'},
    artifact:{past:'Finałowa decyzja została zapisana w Kronice.',why:'Artefakt podsumowuje Wasze wyniki, błędy i sposób otwarcia portalu.',now:'Odbierzcie artefakt i poznajcie nową nazwę Kotwicy.'},
    complete:{past:'Odzyskaliście brakującą godzinę i zamknęliście pierwszy odcinek.',why:'Podsumowanie pokazuje, że historia naprawdę korzystała z Waszych decyzji.',now:'Obejrzyjcie zwiastun, a następnie oceńcie test osobno i szczerze.'}
  };
  return contexts[scene] || {past:'Historia trwa.',why:'Ta scena wynika z poprzedniej decyzji.',now:'Wykonajcie polecenie widoczne poniżej.'};
}
function contextPanel(scene){
  const c = sceneContext(scene);
  return `<details class="context-bridge" open>
    <summary>Co się dzieje i dlaczego?</summary>
    <div class="context-grid">
      <div><strong>Co się wydarzyło</strong><span>${esc(c.past)}</span></div>
      <div><strong>Dlaczego to ważne</strong><span>${esc(c.why)}</span></div>
      <div><strong>Co robicie teraz</strong><span>${esc(c.now)}</span></div>
    </div>
  </details>`;
}
function clearRuntime(){
  if(activeTimer){ activeTimer.stop?.(); clearInterval(activeTimer.interval); clearTimeout(activeTimer.countdownTimeout); activeTimer = null; }
  if(memoryTimeout){ clearTimeout(memoryTimeout); memoryTimeout = null; }
  if(recapAnimation){ cancelAnimationFrame(recapAnimation); recapAnimation = null; }
  if(portalInterval){ clearInterval(portalInterval); portalInterval = null; }
  portalPointers.clear(); portalProgress = 0;
  stopNarration();
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
function stopNarration(){
  speechRunId++;
  if(speechKeepAlive){ clearInterval(speechKeepAlive); speechKeepAlive=null; }
  if(speechWatchdog){ clearTimeout(speechWatchdog); speechWatchdog=null; }
  if('speechSynthesis' in window) speechSynthesis.cancel();
}
function speechChunks(text,maxLength=175){
  const clean=String(text||'').replace(/\s+/g,' ').trim();
  if(!clean) return [];
  const sentences=clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[clean];
  const chunks=[];
  for(const sentenceRaw of sentences){
    let sentence=sentenceRaw.trim();
    while(sentence.length>maxLength){
      let cut=sentence.lastIndexOf(' ',maxLength);
      if(cut<70) cut=maxLength;
      chunks.push(sentence.slice(0,cut).trim());
      sentence=sentence.slice(cut).trim();
    }
    if(sentence) chunks.push(sentence);
  }
  return chunks;
}
function setNarrationStatus(text,kind=''){
  const el=document.getElementById('narrationStatus');
  if(!el) return;
  el.textContent=text;
  el.classList.toggle('error',kind==='error');
  el.classList.toggle('ok',kind==='ok');
}
function speak(text,onEnd,options={}){
  if(!state.sound || !('speechSynthesis' in window)){ setNarrationStatus('Narrator wyciszony'); onEnd?.(); return; }
  const chunks=speechChunks(text);
  if(!chunks.length){ setNarrationStatus('Ta scena nie ma narracji','error'); onEnd?.(); return; }
  stopNarration();
  pickVoice();
  const runId=speechRunId;
  state.diagnostics=state.diagnostics||{narrationStarts:0,narrationReplays:0,narrationErrors:[],contextHelpUses:0};
  state.diagnostics.narrationStarts=(state.diagnostics.narrationStarts||0)+1;
  if(options.replay) state.diagnostics.narrationReplays=(state.diagnostics.narrationReplays||0)+1;
  saveState();
  let index=0,finished=false;
  setNarrationStatus(options.replay?'Powtarzam narrację…':'Narrator mówi…');
  speechKeepAlive=setInterval(()=>{
    if(runId!==speechRunId) return;
    try{ if(speechSynthesis.paused) speechSynthesis.resume(); }catch{}
  },2500);
  const finish=()=>{
    if(finished||runId!==speechRunId)return;
    finished=true;
    if(speechKeepAlive){clearInterval(speechKeepAlive);speechKeepAlive=null;}
    if(speechWatchdog){clearTimeout(speechWatchdog);speechWatchdog=null;}
    setNarrationStatus('Narracja zakończona','ok');
    onEnd?.();
  };
  const next=()=>{
    if(finished||runId!==speechRunId)return;
    if(index>=chunks.length){finish();return;}
    const chunk=chunks[index++];
    const utterance=new SpeechSynthesisUtterance(chunk);
    utterance.lang='pl-PL';utterance.rate=.88;utterance.pitch=.94;utterance.volume=1;
    if(narratorVoice) utterance.voice=narratorVoice;
    let settled=false;
    const advance=()=>{if(settled||runId!==speechRunId)return;settled=true;if(speechWatchdog){clearTimeout(speechWatchdog);speechWatchdog=null;}setTimeout(next,70);};
    utterance.onend=advance;
    utterance.onerror=e=>{
      if(settled||runId!==speechRunId)return;
      state.diagnostics.narrationErrors=state.diagnostics.narrationErrors||[];
      state.diagnostics.narrationErrors.push({scene:state.scene,error:e.error||'speech-error',at:new Date().toISOString()});
      state.diagnostics.narrationErrors=state.diagnostics.narrationErrors.slice(-20);
      saveState();
      setNarrationStatus('Głos został przerwany — przechodzę dalej','error');
      advance();
    };
    try{speechSynthesis.speak(utterance);}catch(err){utterance.onerror?.({error:err.message||'speak-exception'});return;}
    speechWatchdog=setTimeout(()=>{
      if(settled||runId!==speechRunId)return;
      state.diagnostics.narrationErrors=state.diagnostics.narrationErrors||[];
      state.diagnostics.narrationErrors.push({scene:state.scene,error:'watchdog-timeout',at:new Date().toISOString()});
      state.diagnostics.narrationErrors=state.diagnostics.narrationErrors.slice(-20);
      saveState();
      try{speechSynthesis.cancel();}catch{}
      setNarrationStatus('Głos zawiesił się — uruchomiono następny fragment','error');
      advance();
    },Math.max(5000,chunk.length*105));
  };
  next();
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
      <span class="badge">ODCINEK TESTOWY · PILOTAŻ</span>
      <h1>Jutro będzie miało tylko 23 godziny.</h1>
      <p>Wasza drużyna ma odnaleźć brakującą godzinę, zanim Cień Niedokończonych Planów zamieni ją w pusty fragment wspólnej historii.</p>
      <div class="note"><strong>To nie jest formularz z zagadkami.</strong> Przedmioty, słowa, wynik czasu i decyzje wrócą później w fabule.</div>
      <div class="actions">
        <button id="mainStart" class="primary" type="button">${hasProgress?'Kontynuuj odcinek':'Przygotuj test'}</button>
        ${state.completedAt?'<button id="openRecap" class="secondary" type="button">Otwórz podsumowanie</button>':''}
      </div>
    </section>
    <section class="card">
      <span class="badge">12–25 MINUT · 2–6 OSÓB · OFFLINE</span>
      <h2 style="margin-top:14px">Godzina, której brakowało</h2>
      <div class="scene-list">
        <div><strong>Historia reaguje</strong><br><span class="muted">Kotwica i własne słowa wracają w finale.</span></div>
        <div><strong>Porażka nie kończy odcinka</strong><br><span class="muted">Spóźnienie wzmacnia Cień i zmienia artefakt.</span></div>
        <div><strong>Fizyczny rytuał drużyny</strong><br><span class="muted">Cała grupa potwierdza decyzję, a dwie osoby otwierają portal na telefonie.</span></div>
      </div>
    </section>`;
  document.getElementById('mainStart').onclick=()=>{
    ensureAudio();
    if(hasProgress){ state.screen='episode'; saveState(); render(); }
    else { state.screen='setup'; saveState(); render(); }
  };
  const recap = document.getElementById('openRecap'); if(recap) recap.onclick=()=>{state.screen='recap';saveState();render();};
}

function setupParticipantCards(){
  const saved=getParticipants();
  return Array.from({length:6},(_,i)=>{
    const person=saved[i]||defaultParticipants(6)[i];
    return `<div class="participant-config" data-person-config="${i}">
      <div class="participant-title"><strong>Osoba ${i+1}</strong><span>${esc(roleFor(i).title)}</span></div>
      <div class="grid three">
        <div><label>Imię lub pseudonim</label><input id="personName${i}" value="${esc(person.name)}" placeholder="Osoba ${i+1}"></div>
        <div><label>Zainteresowanie</label><input id="personInterest${i}" value="${esc(person.interest)}" placeholder="np. piłka, podróże, muzyka"></div>
        <div><label>Wiek (opcjonalnie)</label><input id="personAge${i}" inputmode="numeric" value="${esc(person.age||'')}" placeholder="np. 10"></div>
      </div>
    </div>`;
  }).join('');
}
function applyParticipantVisibility(){
  const count=Number(document.getElementById('participantCount')?.value||2);
  document.querySelectorAll('[data-person-config]').forEach((el,i)=>el.classList.toggle('hidden',i>=count));
}
function renderSetup(){
  app.innerHTML = `
    <section class="card">
      <span class="badge">PRZYGOTOWANIE DRUŻYNY</span>
      <h2 style="margin-top:14px">Dane tylko do tej historii</h2>
      <p class="muted">Wybierzcie od 2 do 6 uczestników. Każda osoba otrzyma własną rolę, przedmiot, tajne słowo i osobną ocenę końcową.</p>
      <div class="grid two">
        <div><label>Nazwa drużyny</label><input id="team" value="${esc(state.team)}"></div>
        <div><label>Wspólne marzenie lub plan</label><input id="dream" value="${esc(state.dream)}"></div>
        <div><label>Liczba uczestników</label><select id="participantCount">${[2,3,4,5,6].map(n=>`<option value="${n}" ${teamSize()===n?'selected':''}>${n} ${n<=4?'osoby':'osób'}</option>`).join('')}</select></div>
        <div><label>Rodzaj grupy testowej</label><select id="groupType">
          ${['rodzina z dzieckiem','rodzina wielopokoleniowa','rodzeństwo','para','przyjaciele','współpracownicy','inna grupa'].map(x=>`<option value="${x}" ${state.testMeta?.groupType===x?'selected':''}>${x}</option>`).join('')}
        </select></div>
      </div>
      <div id="participantCards" class="participant-list">${setupParticipantCards()}</div>
      <div style="margin-top:15px"><label>Etykieta testu (opcjonalnie)</label><input id="testLabel" value="${esc(state.testMeta?.testLabel||'')}" placeholder="np. Rodzina K. — test 01"></div>
      <div style="margin-top:15px"><label>Tematy, których nie używać</label><input id="forbidden" value="${esc(state.forbidden)}" placeholder="opcjonalnie"></div>
      <div class="grid two" style="margin-top:15px">
        <div><label>Głos narratora dostępny na urządzeniu</label><select id="voiceSelect">${voiceOptions()}</select></div>
        <div><label>Podgląd głosu</label><button id="voicePreview" class="secondary" type="button" style="width:100%">Posłuchaj próbki</button></div>
      </div>
      <div class="note warning"><strong>Uczciwie:</strong> głos przeglądarki nadal jest wersją testową. Docelowy produkt otrzyma naturalnego lektora i gotową ścieżkę audio.</div>
      <div class="actions"><button id="startEpisode" class="primary" type="button">Uruchom tryb filmowy</button><button id="backHome" class="secondary" type="button">Wróć</button></div>
    </section>`;
  applyParticipantVisibility();
  document.getElementById('participantCount').onchange=applyParticipantVisibility;
  document.getElementById('voiceSelect').onchange=e=>{state.voiceName=e.target.value;saveState();pickVoice();};
  document.getElementById('voicePreview').onclick=()=>{
    ensureAudio();state.voiceName=document.getElementById('voiceSelect').value;pickVoice();
    const count=Number(document.getElementById('participantCount').value||2);
    const names=Array.from({length:count},(_,i)=>document.getElementById(`personName${i}`).value.trim()||`Osoba ${i+1}`);
    speak(`Jutro będzie miało tylko dwadzieścia trzy godziny. Kronika czeka na decyzję drużyny: ${names.join(', ')}.`,null,{replay:true});
  };
  document.getElementById('backHome').onclick=()=>{state.screen='home';saveState();render();};
  document.getElementById('startEpisode').onclick=async()=>{
    const count=Number(document.getElementById('participantCount').value||2);
    state.participants=Array.from({length:count},(_,i)=>({
      name:document.getElementById(`personName${i}`).value.trim()||`Osoba ${i+1}`,
      interest:document.getElementById(`personInterest${i}`).value.trim()||roleFor(i).interest,
      age:document.getElementById(`personAge${i}`).value.trim()
    }));
    syncLegacyParticipants();
    state.team=document.getElementById('team').value.trim()||'Drużyna Testowa';
    state.dream=document.getElementById('dream').value.trim()||'wspólny plan';
    state.forbidden=document.getElementById('forbidden').value.trim();
    state.voiceName=document.getElementById('voiceSelect').value;
    state.testMeta={groupType:document.getElementById('groupType').value,testLabel:document.getElementById('testLabel').value.trim()};
    state.diagnostics={narrationStarts:0,narrationReplays:0,narrationErrors:[],contextHelpUses:0};
    state.startedAt=new Date().toISOString(); state.completedAt=null; state.scene='safety'; state.answers={}; state.results={}; state.memorySequence=[]; state.memoryAnswer=[]; state.feedback={};
    saveState(); ensureAudio(); await gotoScene('safety','Kronika rozpoznaje drużynę…');
  };
}

const narrations = {
  safety:()=>`Ta historia wykorzystuje wyłącznie bezpieczne, zwykłe przedmioty. Nie używajcie noży, lekarstw, dokumentów, pieniędzy ani ciężkich rzeczy. Nie wspinajcie się. W każdej chwili możecie przerwać próbę. Historia zawsze poprowadzi was dalej.`,
  intro:()=>`Jutro będzie miało dwadzieścia trzy godziny. Dokładnie o północy z kalendarza drużyny ${state.team} zniknęła jedna godzina. Nie została przesunięta ani skreślona. Po prostu nigdy się nie wydarzy. Kronika wysłała ostatni sygnał do drużyny: ${namesText()}. Macie odnaleźć czas, którego jeszcze nie zdążyliście stracić.`,
  roles:()=>`${getParticipants().map((p,i)=>`${p.name} zostaje ${roleFor(i).title}.`).join(' ')} Każda rola zobaczy inny fragment tej samej historii.`,
  hunt:()=>`Pierwszy ślad rozpadł się na ${teamSize()} zwykłych przedmiotów. ${getParticipants().map((p,i)=>`${p.name}: ${roleFor(i).hunt}`).join(' ')} Macie ${huntSeconds()} sekund.`,
  objects:()=>`Znaleźliście ${teamSize()} ślady, ale tylko jeden potrafi utrzymać połączenie z brakującą godziną. Wpiszcie nazwy wszystkich przedmiotów. Kronika porówna ich znaczenie i wybierze Kotwicę Czasu.`,
  anchor:()=>{const a=state.answers.anchor||chooseAnchor();return `Kronika wybrała przedmiot ${a.item}. ${anchorInterpretation(a)} Połóżcie go blisko telefonu. Będzie wracać w kolejnych scenach i w finale.`;},
  privateChoice:()=>{const idx=Number(state.answers.secretIndex||0),p=participant(idx);return `Kotwica odebrała wiadomość złożoną z ${teamSize()} tajnych słów. Teraz wybiera ${p.name}. Pozostali odwracają wzrok. Każdy niezależny wybór utrudnia Cieniowi przewidzenie całego sygnału.`;},
  signalReveal:()=>`${teamSize()} tajnych słów połączyło się w wiadomość wysłaną przez waszą przyszłą wersję. Przeczytajcie zdanie. Możecie je poprawić, ale tylko wtedy, gdy nie brzmi jak wasze.`,
  memoryIntro:()=>`Wiadomość przyciągnęła Cień Niedokończonych Planów. Próbuje usunąć sześcioczęściowy kod prowadzący do brakującej godziny. Za chwilę zobaczycie symbole tylko przez dziesięć sekund.`,
  memoryShow:()=>`Kod jest aktywny. Zapamiętajcie sześć symboli w dokładnej kolejności. Każdy zachowany znak osłabi Cień.`,
  memoryAnswer:()=>`Kod zniknął. Wybierzcie sześć symboli w tej samej kolejności. Wynik zmieni kolejną scenę i końcowy artefakt.`,
  shadow:()=>`Światło Kroniki przygasa. Z porwanej strony wychodzi Cień Niedokończonych Planów. Mówi: myślicie, że ukradłem waszą godzinę? Nie musiałem. Pozostawiliście ją pustą. Jeśli naprawdę chcecie ją odzyskać, pokażcie mi, na co ją przeznaczycie.`,
  hourChoice:()=>`Cień ujawnił prawdę. Godzina zniknęła, ponieważ żaden plan nie otrzymał konkretnego terminu. Macie sto dwadzieścia sekund, aby wybrać jedną prawdziwą godzinę. Wpiszcie dokładnie co i kiedy zrobicie. Gdy narrator skończy, czas uruchomi się automatycznie.`,
  portal:()=>{const a=state.answers.anchor?.item||'Kotwicę';return `Wasz plan istnieje, ale Kronika musi potwierdzić zgodę całej drużyny. Wszyscy dotykają lub otaczają ${a}. Dwie osoby przykładają po jednym palcu do portalu i utrzymują dotyk przez trzy sekundy.`;},
  twist:()=>`Portal otworzył prawdziwe wspomnienie. Cień nie jest złodziejem. Jest wersją przyszłości, w której nigdy nie wykonaliście wybranego planu. Wiadomość, Kotwica i odzyskana godzina od początku prowadziły do tej chwili.`,
  finalChoice:()=>`Pozostała ostatnia decyzja. Możecie zamknąć odzyskaną godzinę dla obecnej drużyny albo pozostawić Kronikę otwartą, aby w następnym odcinku dołączyły kolejne osoby. Każda opcja zmieni zakończenie.`,
  artifact:()=>{const art=state.answers.artifact||computeArtifact();return `Kronika przetworzyła wasze decyzje i stworzyła artefakt: ${art.name}. Kotwica otrzymała również nową legendarną nazwę. Odcinek został zapisany.`;},
  complete:()=>`Odzyskaliście brakującą godzinę. Podsumowanie zawiera wasze przedmioty, tajne słowa, wynik pamięci, konkretny plan i finałową decyzję. Obejrzyjcie zwiastun, a następnie oceńcie test szczerze i osobno.`
};

function renderEpisode(){
  const renderer = sceneRenderers[state.scene];
  if(!renderer){ state.scene='safety'; saveState(); return renderEpisode(); }
  app.innerHTML = sceneShell(renderer(), `${sceneIndex()+1}/${SCENE_ORDER.length}`);
  wireScene(state.scene);
}


function rolesScene(){
  const cards=getParticipants().map((p,i)=>`<div class="role-card"><strong>${esc(p.name)} · ${esc(roleFor(i).title)}</strong><span>${esc(roleFor(i).desc)}</span><small>Zainteresowanie: ${esc(p.interest)}</small></div>`).join('');
  return `<section class="card scene"><span class="badge">ROLE · ${teamSize()} UCZESTNIKÓW</span><h2>Kronika przydzieliła role całej drużynie</h2><div class="role-grid">${cards}</div><div class="note">Każda osoba otrzyma własny przedmiot i tajne słowo. Nikt nie jest tylko obserwatorem.</div><div class="actions"><button id="next" class="primary">Przyjmujemy role</button></div></section>`;
}
function huntScene(){
  const cards=getParticipants().map((p,i)=>`<div class="role-card"><strong>${esc(p.name)}</strong><span>${esc(roleFor(i).hunt)}</span></div>`).join('');
  return `<section class="card scene"><span class="badge">PRÓBA 1 · ${teamSize()} PRZEDMIOTÓW</span><h2>Pierwszy ślad rozpadł się na całą drużynę</h2><div class="role-grid">${cards}</div>${timerMarkup(huntSeconds(),'huntTimer')}<div class="actions"><button id="huntDone" class="primary">Każdy znalazł przedmiot</button><button id="huntRescue" class="secondary">Brakuje nam części przedmiotów</button></div></section>`;
}
function objectsScene(){
  const saved=Array.isArray(state.answers.objects)?state.answers.objects:[];
  const fields=getParticipants().map((p,i)=>`<div><label>Przedmiot — ${esc(p.name)}</label><input id="object${i}" value="${esc(saved[i]?.item||state.answers[`object${i+1}`]||'')}" placeholder="${esc(i===0?'np. mapa, zdjęcie, klucz':i===1?'np. telefon, pilot, głośnik':'wpisz znaleziony przedmiot')}"></div>`).join('');
  return `<section class="card scene"><span class="badge">ZAPIS ŚLADÓW</span><h2>Co znaleźliście?</h2><p>Kronika porówna wszystkie przedmioty i wybierze jeden z nich na Kotwicę Czasu.</p><div class="grid two">${fields}</div><div class="actions"><button id="analyzeObjects" class="primary">Pozwól Kronice wybrać</button></div></section>`;
}

const sceneRenderers = {
  safety:()=>`<section class="card scene"><span class="badge">ZASADA ZERO</span><h2>Bezpieczna Legenda</h2><div class="note warning">Nie używajcie ostrych narzędzi, leków, dokumentów, pieniędzy ani rzeczy znajdujących się wysoko. Nie przesuwajcie ciężkich mebli.</div><p>Telefon jest tylko portalem. Najważniejsze wydarzenia mają rozegrać się między Wami.</p><div class="actions"><button id="next" class="primary">Rozumiemy — otwórz Kronikę</button></div></section>`,
  intro:()=>`<section class="card scene"><span class="badge">PROLOG</span><h2>Jutro będzie miało 23 godziny</h2><div class="story">Dokładnie o północy z kalendarza drużyny <strong>${esc(state.team)}</strong> zniknęła jedna godzina.<br><br>Nie została przesunięta. Nie została skreślona. Po prostu nigdy się nie wydarzy.</div><blockquote>„Nie oddamy czasu, którego jeszcze nie przeżyliśmy.”</blockquote><div class="actions"><button id="next" class="primary">Wypowiedzcie zdanie i rozpocznijcie</button></div></section>`,
  roles:()=>rolesScene(),
  hunt:()=>huntScene(),
  objects:()=>objectsScene(),
  anchor:()=>anchorScene(),
  privateChoice:()=>privateChoiceScene(),
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
function anchorScore(name, participantIndex){
  const type=classifyObject(name); const priority={czas:10,'sygnał':8,droga:6,'pamięć':5,'zwykły':2}[type];
  const length=Math.min(4,normalize(name).replace(/\s/g,'').length/4);
  const roleBonus=(participantIndex===1&&type==='sygnał')||(participantIndex===0&&(type==='droga'||type==='pamięć'))||(participantIndex===2&&type==='droga')||(participantIndex===4&&type==='czas')?2:0;
  return priority+length+roleBonus;
}
function chooseAnchor(){
  let objects=Array.isArray(state.answers.objects)?state.answers.objects:[];
  if(objects.length<2){
    objects=getParticipants().map((p,i)=>({item:state.answers[`object${i+1}`]||'',owner:p.name,ownerKey:`p${i+1}`,participantIndex:i}));
  }
  const valid=objects.filter(o=>String(o.item||'').trim());
  const chosen={...(valid.reduce((best,current)=>anchorScore(current.item,current.participantIndex)>anchorScore(best.item,best.participantIndex)?current:best,valid[0]))};
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

function privateChoiceScene(){
  const idx=Math.max(0,Math.min(teamSize()-1,Number(state.answers.secretIndex||0)));
  const person=participant(idx), options=roleFor(idx).words;
  return `<section class="card scene"><span class="badge">TAJNY WYBÓR · ${idx+1}/${teamSize()}</span><h2>Telefon przejmuje ${esc(person.name)}</h2><div class="private-step"><p><strong>Pozostałe osoby odwracają wzrok.</strong> ${esc(person.name)} wybiera jedno słowo bez konsultacji.</p><div class="choice-list">${options.map(o=>`<button class="choice" data-private="${esc(o)}">${esc(o)}</button>`).join('')}</div></div><p class="micro">Każdy uczestnik wybierze własne słowo. Wszystkie zostaną odsłonięte dopiero po ostatnim wyborze.</p></section>`;
}
function signalConnection(words){
  const list=Array.isArray(words)?words.filter(Boolean):[...arguments].filter(Boolean);
  const w1=list[0]||'Wspomnienie',w2=list[1]||'Drużyna';
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
  const base=map[key]||`${w1} i ${w2} tworzą pierwszy fragment sygnału, którego Cień nie potrafi rozdzielić.`;
  if(list.length===2) return base;
  return `Sygnał drużyny brzmi: ${list.join(' · ')}. ${base} Każde pozostałe słowo jest osobnym kluczem do tej samej brakującej godziny.`;
}
function signalRevealScene(){
  const words=Array.isArray(state.answers.secretWords)?state.answers.secretWords.filter(Boolean):[state.answers.word1,state.answers.word2].filter(Boolean);
  const generated=state.answers.signalSentence||signalConnection(words);
  state.answers.signalSentence=generated;saveState();
  return `<section class="card scene"><span class="badge">ODSŁONIĘCIE SYGNAŁÓW</span><h2>${words.length} tajnych słów połączyło się</h2><div class="signal-pair">${words.map((w,i)=>`<div class="signal-word"><small>${esc(participant(i).name)}</small>${esc(w)}</div>`).join('<div class="signal-link">＋</div>')}</div><div class="reveal-panel"><strong>Kronika odczytała zdanie:</strong><blockquote>${esc(generated)}</blockquote></div><label>Możecie zostawić zdanie albo poprawić je własnymi słowami</label><textarea id="signalSentence">${esc(generated)}</textarea><div class="actions"><button id="saveSignal" class="primary">Zapiszcie wiadomość przyszłości</button></div></section>`;
}

function createMemorySequence(){
  const words=Array.isArray(state.answers.secretWords)?state.answers.secretWords:[state.answers.word1,state.answers.word2];
  const seed=(normalize(state.answers.anchor?.item).length + words.reduce((sum,w,i)=>sum+normalize(w).length*(i+3),0)) || 17;
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
    {id:'game',title:'Godzina Gry',desc:`Cała drużyna wybiera wspólną grę lub zabawę. Przez godzinę żadnych innych telefonów ani rozpraszaczy.`,example:'np. sobota, 18:00 — wspólna gra przez godzinę'},
    {id:'trip',title:'Godzina Wyprawy',desc:`Drużyna wybiera spacer, mały wyjazd albo zaplanowanie celu: ${state.dream}.`,example:'np. niedziela, 11:00 — planujemy lub wykonujemy wyprawę'},
    {id:'surprise',title:'Godzina Niespodzianki',desc:'Przygotujecie coś dla osoby spoza tej rozgrywki albo niespodziankę dla całej grupy.',example:'np. w piątek przygotujemy wspólną niespodziankę'},
    {id:'own',title:'Własna Godzina',desc:'Wymyślacie inne konkretne działanie, w którym bierze udział obecna drużyna.',example:'wpiszcie dokładnie co i kiedy zrobicie'}
  ];
}
function hourChoiceScene(){
  const selected=state.answers.hourId||'';
  return `<section class="card scene"><span class="badge">PRÓBA 3 · ODZYSKANIE GODZINY</span><h2>Na co przeznaczycie odzyskany czas?</h2>${timerMarkup(120,'hourTimer')}<div class="option-grid">${hourOptions().map(o=>`<button class="choice ${selected===o.id?'selected':''}" data-hour="${o.id}"><strong>${o.title}</strong><small>${esc(o.desc)}</small></button>`).join('')}</div><div style="margin-top:15px"><label id="hourDetailLabel">Konkretny termin i działanie</label><input id="hourDetail" value="${esc(state.answers.hourDetail||'')}" placeholder="${selected?esc(hourOptions().find(o=>o.id===selected)?.example):'Najpierw wybierzcie rodzaj godziny'}"></div><div class="actions"><button id="saveHour" class="primary">Zapisz odzyskaną godzinę</button><button id="fateHour" class="secondary hidden">Nie możemy się zgodzić — Los Kroniki</button></div></section>`;
}

function portalScene(){
  const a=state.answers.anchor;
  return `<section class="card scene"><span class="badge">RYTUAŁ KOTWICY · ${teamSize()} OSÓB</span><h2>Połóżcie ${esc(a.item)} pośrodku drużyny</h2><p><strong>Wszyscy uczestnicy</strong> dotykają Kotwicy albo trzymają dłoń tuż przy niej. Następnie dwie wybrane osoby przykładają po jednym palcu do portalu i utrzymują dotyk przez trzy sekundy.</p><div class="portal-wrap"><div id="portal" class="portal"><div class="portal-core"><span id="portalText">DRUŻYNA + 2 DOTKNIĘCIA</span></div></div><div class="hold-progress"><div id="holdBar"></div></div><div id="portalHint" class="micro">Na laptopie cała grupa wypowiada hasło, a jedna osoba przytrzymuje lewy przycisk myszy.</div></div><div class="actions"><button id="portalFallback" class="secondary">Tryb awaryjny — wspólne hasło</button></div></section>`;
}
function twistScene(){
  const a=state.answers.anchor; const sentence=state.answers.signalSentence; const hour=state.answers.hourTitle;
  const portalLine=(state.results.portal==='duet'||state.results.portal==='drużyna')?`Portal rozpoznał wspólny rytuał. Kronika potwierdziła decyzję całej drużyny: ${namesText()}.`:'Portal otworzył się przez wspólne hasło. Cień zapamiętał, że potrzebowaliście drogi awaryjnej.';
  return `<section class="card scene"><span class="badge">DRUGI ZWROT</span><h2>Cień nie jest złodziejem</h2><div class="story">Kotwica — <strong>${esc(a.item)}</strong> — reaguje po raz drugi. Kronika odtwarza zdanie:<blockquote>${esc(sentence)}</blockquote></div><p>${esc(portalLine)}</p><blockquote>„Nie jestem tym, kto zabrał godzinę” — mówi Cień. „Jestem wersją przyszłości, w której nigdy nie wykonaliście tego planu.”</blockquote><p>Odzyskana godzina ma już nazwę: <strong>${esc(hour)}</strong>. Teraz musicie zdecydować, czy ją zamknąć dla obecnej drużyny, czy otworzyć dla kolejnych osób.</p><div class="actions"><button id="next" class="primary">Podejmujemy ostatnią decyzję</button></div></section>`;
}
function finalChoiceScene(){
  return `<section class="card scene"><span class="badge">FINAŁOWA DECYZJA</span><h2>Co stanie się z odzyskaną godziną?</h2><button class="choice" data-final="sealed"><strong>A — Zamknąć godzinę</strong><small>Plan staje się bezpieczny i należy do obecnej drużyny: ${esc(namesText())}. Nie można go zmienić.</small></button><button class="choice" data-final="open"><strong>B — Pozostawić godzinę otwartą</strong><small>W Odcinku 2 kolejne osoby będą mogły wejść do historii, ale Cień również otrzyma nową szansę.</small></button></section>`;
}

function legendaryAnchorName(){
  const a=state.answers.anchor; const hour=state.answers.hourId; const memory=state.results.memory;
  const typeWord={czas:'Zegar',sygnał:'Nadajnik',droga:'Kompas','pamięć':'Kronika','zwykły':'Kotwica'}[a.type]||'Kotwica';
  const effect=state.answers.finalChoice==='open'?'Otwartej Godziny':memory==='czysty'?'Czystego Sygnału':hour==='trip'?'Wspólnej Drogi':hour==='game'?'Odzyskanej Gry':'Powracającego Czasu';
  return `${typeWord} ${effect}`;
}
function computeArtifact(){
  const finalOpen=state.answers.finalChoice==='open';
  const perfect=state.results.memory==='czysty'&&state.results.hunt==='sukces'&&state.results.hour==='sukces'&&['duet','drużyna'].includes(state.results.portal);
  if(finalOpen && perfect) return {symbol:'🧭',name:`Kompas ${teamSize()} Strażników`,desc:'Otwiera nowy fragment historii dla całej drużyny.'};
  if(finalOpen) return {symbol:'🌀',name:'Kompas Otwartej Godziny',desc:'Może prowadzić do większej historii, ale pozostawia drogę dla Cienia.'};
  if(state.results.hour==='spóźnienie') return {symbol:'⌛',name:'Pieczęć Godziny z Rysą',desc:'Czas został odzyskany, choć wahanie pozostawiło na nim ślad.'};
  if(state.results.memory==='utracony') return {symbol:'🔔',name:'Pieczęć Ostatniego Echa',desc:'Kronika zachowała tylko pierwszy i ostatni znak, ale to wystarczyło.'};
  return {symbol:'✺',name:'Pieczęć Odzyskanego Czasu',desc:'Chroni konkretną godzinę, którą drużyna naprawdę zamierza przeżyć.'};
}
function artifactScene(){
  const artifact=computeArtifact(); state.answers.artifact=artifact; state.answers.legendaryAnchor=legendaryAnchorName(); saveState();
  const ending=state.answers.finalChoice==='open'?`Kronika nie zamknęła się. Obok imion ${namesText()} pojawiły się puste miejsca dla kolejnych uczestników.`:'Kronika zamknęła się z cichym uderzeniem. Odzyskana godzina wróciła do jutra i została zapisana pod konkretnym planem.';
  return `<section class="card scene"><span class="badge">ARTEFAKT ZDOBYTY</span><h2>${esc(ending)}</h2><div class="artifact"><div class="artifact-symbol">${artifact.symbol}</div><h3>${esc(artifact.name)}</h3><p>${esc(artifact.desc)}</p></div><div class="note"><strong>Kotwica otrzymała legendarną nazwę:</strong><br>${esc(state.answers.legendaryAnchor)}</div><blockquote>„Odzyskaliście jedną godzinę. Zobaczymy, ile kolejnych pozwolicie mi zabrać.”</blockquote><div class="actions"><button id="next" class="primary">Zapiszcie finał w Kronice</button></div></section>`;
}
function completeScene(){
  const a=state.answers.anchor, artifact=state.answers.artifact||computeArtifact();
  return `<section class="card scene"><span class="badge">ODCINEK UKOŃCZONY</span><h2>${esc(namesText())} odzyskali brakującą godzinę</h2><div class="success note">Historia zapamiętała przedmioty, słowa, wynik pamięci, spóźnienia, rytuał i finałową decyzję.</div><div class="summary-grid">
    <div class="summary-row"><strong>Kotwica:</strong> ${esc(a.item)} → ${esc(state.answers.legendaryAnchor)}</div>
    <div class="summary-row"><strong>Wiadomość:</strong> ${esc(state.answers.signalSentence)}</div>
    <div class="summary-row"><strong>Echo pamięci:</strong> ${state.results.memoryCorrect}/6 symboli</div>
    <div class="summary-row"><strong>Odzyskana godzina:</strong> ${esc(state.answers.hourTitle)} — ${esc(state.answers.hourDetail)}</div>
    <div class="summary-row"><strong>Artefakt:</strong> ${esc(artifact.name)}</div>
  </div><div class="actions"><button id="openRecap" class="primary">Zobacz filmowe podsumowanie</button><button id="exportTest" class="secondary">Eksportuj wynik testu</button><button id="openFeedback" class="secondary">Oceń odcinek</button></div></section>`;
}

function wireScene(scene){
  const narration=narrations[scene]?.();
  const replay=document.getElementById('replayNarration');
  if(replay) replay.onclick=()=>{ensureAudio();stopNarration();speak(narrations[scene]?.()||'',null,{replay:true});};
  const context=document.querySelector('.context-bridge');
  if(context) context.addEventListener('toggle',()=>{if(context.open){state.diagnostics=state.diagnostics||{};state.diagnostics.contextHelpUses=(state.diagnostics.contextHelpUses||0)+1;saveState();}},{once:true});
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
    const objects=getParticipants().map((p,i)=>({item:document.getElementById(`object${i}`).value.trim(),owner:p.name,ownerKey:`p${i+1}`,participantIndex:i}));
    if(objects.some(o=>!o.item)){alert('Każda osoba wpisuje jeden przedmiot. Brakujący przedmiot może być bezpiecznym przedmiotem zastępczym znajdującym się obok.');return;}
    state.answers.objects=objects;state.answers.object1=objects[0].item;state.answers.object2=objects[1].item;chooseAnchor();saveState();
    gotoScene('anchor',`Kronika porównuje ${objects.length} śladów…`);
  };
  if(scene==='anchor') document.getElementById('next').onclick=()=>{
    state.answers.secretWords=[];state.answers.secretIndex=0;saveState();gotoScene('privateChoice',`Telefon przejmuje ${participant(0).name}…`);
  };
  if(scene==='privateChoice') document.querySelectorAll('[data-private]').forEach(btn=>btn.onclick=()=>{
    const idx=Number(state.answers.secretIndex||0);state.answers.secretWords=state.answers.secretWords||[];state.answers.secretWords[idx]=btn.dataset.private;
    if(idx===0)state.answers.word1=btn.dataset.private;if(idx===1)state.answers.word2=btn.dataset.private;
    const next=idx+1;state.answers.secretIndex=next;saveState();
    if(next<teamSize()) gotoScene('privateChoice',`Wybór ${participant(idx).name} został ukryty. Telefon przejmuje ${participant(next).name}…`);
    else{state.answers.signalSentence=signalConnection(state.answers.secretWords);saveState();gotoScene('signalReveal','Kronika łączy wszystkie tajne sygnały…');}
  });
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
function wireHuntTimer(){ if(state.scene!=='hunt'||activeTimer)return; startAutoTimer({seconds:huntSeconds(),displayId:'huntTimer',countdownId:'huntTimerCountdown',pauseId:'huntTimerPause',onExpire:()=>{state.results.huntExpired=true;saveState();}}); }
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
  function reset(){portal.classList.remove('armed');portalProgress=0;bar.style.width='0%';text.textContent='DRUŻYNA + 2 DOTKNIĘCIA';startedAt=null;if(portalInterval){clearInterval(portalInterval);portalInterval=null;}}
  function begin(){if(portalInterval)return;startedAt=Date.now();portal.classList.add('armed');text.textContent='UTRZYMAJCIE';motif('portal');portalInterval=setInterval(()=>{portalProgress=Math.min(100,(Date.now()-startedAt)/30);bar.style.width=`${portalProgress}%`;if(portalProgress>=100){clearInterval(portalInterval);portalInterval=null;state.results.portal=isTouch?(teamSize()>2?'drużyna':'duet'):'mysz';saveState();text.textContent='PORTAL OTWARTY';motif('success');navigator.vibrate?.([100,60,220]);setTimeout(()=>gotoScene('twist','Kotwica odpowiada na wspólny dotyk…'),700);}},50);}
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
    {t:2.1,d:3.0,k:'DRUŻYNA',v:namesText()},
    {t:5.1,d:3.0,k:'KOTWICA CZASU',v:a.item},
    {t:8.1,d:3.0,k:'PIERWSZA PRÓBA',v:hunt},
    {t:11.1,d:3.0,k:'ECHO PAMIĘCI',v:memory},
    {t:14.1,d:3.5,k:'ODZYSKANA GODZINA',v:state.answers.hourTitle},
    {t:17.6,d:3.4,k:'ICH PLAN',v:state.answers.hourDetail},
    {t:21.0,d:3.0,k:'ARTEFAKT',v:art.name},
    {t:24.0,d:3.0,k:'CIĄG DALSZY NASTĄPI',v:state.answers.finalChoice==='open'?'Kronika czeka na kolejnych uczestników':'Cień wróci sprawdzić plan'},
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
  app.innerHTML=`<section class="card"><span class="badge">FILMOWE PODSUMOWANIE 9:16</span><h2 style="margin-top:14px">Zwiastun drużyny ${esc(state.team)}</h2><p class="muted">Treść filmu powstała z ich przedmiotów, wyników i decyzji. To prototyp renderowany lokalnie, bez wysyłania danych.</p><div class="recap-wrap"><canvas id="recapCanvas" width="1080" height="1920"></canvas></div><div class="actions"><button id="playRecap" class="primary">▶ Odtwórz</button><button id="savePoster" class="secondary">Zapisz plakat PNG</button><button id="recordRecap" class="secondary">Nagraj WebM z dźwiękiem</button><button id="feedbackBtn" class="secondary">Oceń odcinek</button></div><div class="note">Docelowo system wygeneruje MP4 z naturalnym lektorem, muzyką i awatarami. Ta wersja sprawdza, czy treść podsumowania chce się pokazać innym.</div></section>`;
  const canvas=document.getElementById('recapCanvas');drawRecap(canvas,0);
  document.getElementById('playRecap').onclick=()=>playRecap(canvas);
  document.getElementById('savePoster').onclick=()=>{drawRecap(canvas,21.7);const a=document.createElement('a');a.download=`nasza-legenda-${safeFile(state.team)}.png`;a.href=canvas.toDataURL('image/png');a.click();};
  document.getElementById('recordRecap').onclick=()=>recordRecap(canvas);
  document.getElementById('feedbackBtn').onclick=()=>{state.screen='feedback';saveState();render();};
}

function feedbackSlider(id,label){const value=state.feedback[id]||3;return `<div class="feedback-row"><label for="${id}">${label}</label><input id="${id}" type="range" min="1" max="5" value="${value}"><span id="${id}Value" class="feedback-score">${value}</span></div>`;}
function participantFeedbackFields(){
  const saved=Array.isArray(state.feedback.wantNextByParticipant)?state.feedback.wantNextByParticipant:[];
  return getParticipants().map((p,i)=>{
    const value=saved[i]||state.feedback[`wantNextP${i+1}`]||'';
    return `<div><label>Czy ${esc(p.name)} chce Odcinek 2?</label><select id="wantNextPerson${i}"><option value="">— wybierz —</option><option value="tak" ${value==='tak'?'selected':''}>Tak</option><option value="może" ${value==='może'?'selected':''}>Może</option><option value="nie" ${value==='nie'?'selected':''}>Nie</option></select></div>`;
  }).join('');
}
function renderFeedback(){
  app.innerHTML=`<section class="card"><span class="badge">OCENA TESTU · ${teamSize()} OSÓB</span><h2 style="margin-top:14px">Bez grzecznościowych ocen</h2><p class="muted">Szukamy problemów, nie pochwał. Każda osoba odpowiada osobno, czy chce kolejny odcinek.</p>${feedbackSlider('climate','Klimat historii')}${feedbackSlider('tasks','Ciekawość zadań')}${feedbackSlider('personal','Czy historia była o Was')}${feedbackSlider('surprise','Poziom zaskoczenia')}${feedbackSlider('clarity','Czy rozumieliście kontekst każdej sceny')}${feedbackSlider('recap','Czy podsumowanie chce się pokazać innym')}<div class="grid two"><div><label>Najlepszy moment</label><textarea id="best">${esc(state.feedback.best||'')}</textarea></div><div><label>Najsłabszy moment</label><textarea id="worst">${esc(state.feedback.worst||'')}</textarea></div></div><div style="margin-top:13px"><label>W którym momencie straciliście kontekst i czego wtedy nie rozumieliście?</label><textarea id="unclear">${esc(state.feedback.unclear||'')}</textarea></div><div class="grid two participant-feedback" style="margin-top:13px">${participantFeedbackFields()}</div>
<div style="margin-top:13px"><label>Wspólna decyzja po rozmowie</label><select id="wantNext"><option value="">— wybierz —</option><option value="tak" ${state.feedback.wantNext==='tak'?'selected':''}>Tak, chcemy od razu</option><option value="może" ${state.feedback.wantNext==='może'?'selected':''}>Może po poprawkach</option><option value="nie" ${state.feedback.wantNext==='nie'?'selected':''}>Nie</option></select></div><div class="actions"><button id="saveFeedback" class="primary">Zapisz i pobierz wynik testu</button><button id="backRecap" class="secondary">Wróć do podsumowania</button></div></section>`;
  ['climate','tasks','personal','surprise','clarity','recap'].forEach(id=>{const el=document.getElementById(id),out=document.getElementById(`${id}Value`);el.oninput=()=>out.textContent=el.value;});
  document.getElementById('backRecap').onclick=()=>{state.screen='recap';saveState();render();};
  document.getElementById('saveFeedback').onclick=()=>{
    ['climate','tasks','personal','surprise','clarity','recap'].forEach(id=>state.feedback[id]=Number(document.getElementById(id).value));
    state.feedback.best=document.getElementById('best').value.trim();state.feedback.worst=document.getElementById('worst').value.trim();state.feedback.unclear=document.getElementById('unclear').value.trim();
    state.feedback.wantNextByParticipant=getParticipants().map((_,i)=>document.getElementById(`wantNextPerson${i}`).value);
    state.feedback.wantNext=document.getElementById('wantNext').value;saveState();exportResults();
  };
}
function exportResults(){
  const participants=getParticipants().map((person,i)=>({...person,role:roleFor(i).title,wantNext:state.feedback.wantNextByParticipant?.[i]||''}));
  const payload={exportedAt:new Date().toISOString(),appVersion:VERSION,testMeta:state.testMeta,team:state.team,participantCount:teamSize(),participants,dream:state.dream,durationMinutes:state.startedAt&&state.completedAt?Math.round((new Date(state.completedAt)-new Date(state.startedAt))/60000):null,answers:state.answers,results:state.results,feedback:state.feedback,diagnostics:state.diagnostics};
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`wynik-testu-${safeFile(state.team)}-${stamp}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}

if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>reg.update()).catch(console.warn));
render();
