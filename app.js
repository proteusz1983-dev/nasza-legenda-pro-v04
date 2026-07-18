'use strict';

const APP_VERSION = '0.5.1';
const EPISODE_ROOT = './episodes/signal-spoza-czasu/';
const app = document.querySelector('#app');
const toastEl = document.querySelector('#toast');

const state = {
  team: 'Nowakowie',
  participants: ['Ania', 'Michał'],
  startedAt: null,
  endedAt: null,
  item: '',
  itemTrait: 'unknown',
  taskTimedOut: false,
  taskSecondsLeft: 0,
  choice: '',
  path: '',
  sound: true,
  events: []
};

let episode;
let graph;
let video;
let overlay;
let subtitle;
let stageBg;
let currentNodeId = '';
let activeTimer = null;
let subtitleHandler = null;
const blobCache = new Map();

function log(type, data = {}) {
  state.events.push({ at: new Date().toISOString(), type, ...data });
}

function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

async function fetchJSON(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Nie można pobrać ${url}`);
  return response.json();
}

async function assetURL(relative) {
  const url = EPISODE_ROOT + relative;
  if (blobCache.has(url)) return blobCache.get(url);
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(String(response.status));
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    blobCache.set(url, objectUrl);
    return objectUrl;
  } catch (error) {
    console.warn('Fallback asset URL:', url, error);
    return url;
  }
}

function allAssets() {
  const files = new Set();
  Object.values(graph.nodes).forEach(node => {
    if (node.src) files.add(node.src);
    if (node.poster) files.add(node.poster);
  });
  return [...files];
}

async function preloadAll(onProgress) {
  const files = allAssets();
  const total = files.length;
  let done = 0;
  const workers = Array.from({ length: Math.min(3, total) }, async () => {
    while (files.length) {
      const file = files.shift();
      await assetURL(file);
      done += 1;
      onProgress?.(done, total);
    }
  });
  await Promise.all(workers);
}

function participantFields(count, existing = []) {
  return Array.from({ length: count }, (_, index) => {
    const value = existing[index] || ['Ania', 'Michał', 'Ola', 'Tomek', 'Ewa', 'Szymon'][index] || '';
    return `<div class="field"><label for="p${index}">Osoba ${index + 1}</label><input id="p${index}" maxlength="24" value="${escapeHTML(value)}" required></div>`;
  }).join('');
}

function renderSetup() {
  app.innerHTML = `
    <section class="setup">
      <div class="setup-card">
        <div class="brand">
          <img src="./logo.svg" alt="">
          <div><div class="brand-kicker">Interaktywny serial · etap ${APP_VERSION}</div><h1>Nasza Legenda</h1></div>
        </div>
        <p class="setup-copy">Pierwszy filmowy fragment odcinka <strong>„Sygnał spoza czasu”</strong>. Oglądacie scenę, wykonujecie zadanie w pokoju, a jego wynik wpływa na dalszą drogę.</p>
        <div class="field"><label for="team">Nazwa grupy lub rodziny</label><input id="team" maxlength="40" value="${escapeHTML(state.team)}"></div>
        <div class="field"><label for="count">Liczba uczestników</label><select id="count">${[2,3,4,5,6].map(n => `<option value="${n}" ${n===state.participants.length?'selected':''}>${n} osoby</option>`).join('')}</select></div>
        <div id="people" class="people">${participantFields(state.participants.length, state.participants)}</div>
        <button id="start" class="primary" disabled>PRZYGOTOWUJĘ ODCINEK…</button>
        <div id="loadState" class="load-state">Pobieranie scen filmowych 0%</div>
        <div class="version">PROTOTYP SILNIKA BANDERSNATCH · ${APP_VERSION}</div>
      </div>
    </section>`;

  const count = document.querySelector('#count');
  const people = document.querySelector('#people');
  count.addEventListener('change', () => {
    const old = [...people.querySelectorAll('input')].map(i => i.value);
    people.innerHTML = participantFields(Number(count.value), old);
  });

  const start = document.querySelector('#start');
  start.addEventListener('click', startEpisode);

  preloadAll((done, total) => {
    const pct = Math.round(done / total * 100);
    document.querySelector('#loadState').textContent = `Pobieranie scen filmowych ${pct}%`;
  }).then(() => {
    start.disabled = false;
    start.textContent = 'WEJDŹ DO KRONIKI';
    document.querySelector('#loadState').textContent = 'Odcinek gotowy — dalsze klipy są już w pamięci.';
  }).catch(error => {
    console.error(error);
    start.disabled = false;
    start.textContent = 'URUCHOM MIMO TO';
    document.querySelector('#loadState').textContent = 'Nie wszystkie sceny pobrano. Sprawdź połączenie.';
  });
}

async function startEpisode() {
  const names = [...document.querySelectorAll('#people input')].map(i => i.value.trim()).filter(Boolean);
  if (names.length < 2) return toast('Wpisz imiona minimum dwóch osób.');
  state.team = document.querySelector('#team').value.trim() || 'Drużyna';
  state.participants = names;
  state.startedAt = new Date().toISOString();
  state.events = [];
  log('episode_start', { team: state.team, participants: state.participants });
  renderPlayer();
  try { await document.documentElement.requestFullscreen?.(); } catch (_) {}
  playNode(graph.start);
}

function renderPlayer() {
  app.innerHTML = `
    <section class="player">
      <div id="stageBg" class="stage-bg"></div>
      <video id="stageVideo" class="stage-video" playsinline preload="auto"></video>
      <div class="cinema-shade"></div>
      <div class="topbar">
        <div class="mark"><img src="./logo.svg" alt=""><div><b>NASZA LEGENDA</b><small>${escapeHTML(state.team)} · ${state.participants.map(escapeHTML).join(', ')}</small></div></div>
        <button id="sound" class="sound" aria-label="Wycisz lub włącz dźwięk">🔊</button>
      </div>
      <div id="subtitle" class="subtitle"></div>
      <div id="overlay" class="overlay hidden"></div>
    </section>`;
  video = document.querySelector('#stageVideo');
  overlay = document.querySelector('#overlay');
  subtitle = document.querySelector('#subtitle');
  stageBg = document.querySelector('#stageBg');
  document.querySelector('#sound').addEventListener('click', event => {
    state.sound = !state.sound;
    video.muted = !state.sound;
    event.currentTarget.textContent = state.sound ? '🔊' : '🔇';
  });
  video.addEventListener('error', () => {
    toast('Błąd odtwarzania sceny. Spróbuj ponownie.');
  });
}

function clearRuntime() {
  if (activeTimer) clearInterval(activeTimer);
  activeTimer = null;
  if (subtitleHandler && video) video.removeEventListener('timeupdate', subtitleHandler);
  subtitleHandler = null;
  if (overlay) {
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
  }
  if (subtitle) subtitle.textContent = '';
}

async function playNode(nodeId) {
  clearRuntime();
  currentNodeId = nodeId;
  const node = graph.nodes[nodeId];
  if (!node) throw new Error(`Brak węzła ${nodeId}`);
  log('node_enter', { nodeId, nodeType: node.type });

  if (node.effect) Object.assign(state, node.effect);
  if (node.type === 'video') return playVideoNode(nodeId, node);
  if (node.type === 'task') return playTaskNode(nodeId, node);
  if (node.type === 'choice') return playChoiceNode(nodeId, node);
  if (node.type === 'end') return renderEnd();
}

async function setVideo(node, loop = false) {
  const src = await assetURL(node.src);
  const poster = node.poster ? EPISODE_ROOT + node.poster : '';
  stageBg.style.backgroundImage = poster ? `url('${poster}')` : '';
  video.poster = poster;
  video.loop = loop;
  video.muted = !state.sound;
  video.src = src;
  video.currentTime = 0;
  video.load();
  try { await video.play(); }
  catch (error) {
    console.warn(error);
    showTapToPlay(() => video.play());
  }
}

function showTapToPlay(action) {
  overlay.classList.remove('hidden');
  overlay.innerHTML = `<div class="panel"><div class="eyebrow">DŹWIĘK ZABLOKOWANY PRZEZ TELEFON</div><h2>Dotknij, aby kontynuować</h2><button class="task-button" id="tapPlay">ODTWÓRZ SCENĘ</button></div>`;
  document.querySelector('#tapPlay').addEventListener('click', async () => {
    overlay.classList.add('hidden');
    await action();
  }, { once: true });
}

function attachSubtitles(cues = []) {
  subtitleHandler = () => {
    const cue = cues.find(c => video.currentTime >= c.from && video.currentTime < c.to);
    subtitle.textContent = cue ? personalize(cue.text) : '';
  };
  video.addEventListener('timeupdate', subtitleHandler);
}

async function playVideoNode(nodeId, node) {
  attachSubtitles(node.subtitles || []);
  video.onended = () => playNode(node.next);
  await setVideo(node, false);
}

async function playTaskNode(nodeId, node) {
  video.onended = null;
  await setVideo(node, true);
  showTask(node);
}

function showTask(node) {
  let left = node.timeLimit;
  state.taskSecondsLeft = left;
  overlay.classList.remove('hidden');
  overlay.innerHTML = `
    <div class="panel">
      <div class="eyebrow">${escapeHTML(node.title)}</div>
      <h2>Odbiornik jest gdzieś blisko</h2>
      <p>${escapeHTML(node.prompt)}</p>
      <div id="timer" class="timer">00:${String(left).padStart(2,'0')}</div>
      <button id="found" class="task-button">${escapeHTML(node.completeLabel)}</button>
      <div class="hint">Czas wpływa na jakość przechwyconej wiadomości.</div>
    </div>`;

  activeTimer = setInterval(() => {
    left -= 1;
    state.taskSecondsLeft = Math.max(0, left);
    const timer = document.querySelector('#timer');
    if (timer) timer.textContent = `00:${String(Math.max(0,left)).padStart(2,'0')}`;
    if (left <= 0) {
      clearInterval(activeTimer); activeTimer = null;
      state.taskTimedOut = true;
      log('task_timeout', { nodeId: currentNodeId });
      playNode(node.onTimeout);
    }
  }, 1000);

  document.querySelector('#found').addEventListener('click', () => {
    clearInterval(activeTimer); activeTimer = null;
    showItemCapture(node);
  });
}

function showItemCapture(node) {
  overlay.innerHTML = `
    <div class="panel">
      <div class="eyebrow">PRZEDMIOT ODNALEZIONY</div>
      <h2>Co znaleźliście?</h2>
      <p>Nazwa przedmiotu zostanie zapisana i wpłynie na dalszą decyzję.</p>
      <div class="capture">
        <div class="capture-row"><input id="itemName" maxlength="40" autocomplete="off" placeholder="np. pilot, telefon, klucze"><button id="mic" title="Powiedz nazwę">🎙️</button></div>
        <button id="confirmItem" class="confirm">POTWIERDŹ PRZEDMIOT</button>
      </div>
    </div>`;
  const input = document.querySelector('#itemName');
  input.focus();
  document.querySelector('#confirmItem').addEventListener('click', () => {
    const item = input.value.trim();
    if (!item) return toast('Wpisz nazwę przedmiotu.');
    state.item = item;
    state.itemTrait = classifyItem(item);
    log('task_complete', { item, itemTrait: state.itemTrait, secondsLeft: state.taskSecondsLeft });
    playNode(node.onComplete);
  });
  document.querySelector('#mic').addEventListener('click', () => startRecognition(input));
}

function startRecognition(input) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return toast('Na tym urządzeniu wpisz nazwę ręcznie.');
  const recognition = new Recognition();
  recognition.lang = 'pl-PL';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = event => { input.value = event.results[0][0].transcript; };
  recognition.onerror = () => toast('Nie udało się rozpoznać głosu.');
  recognition.start();
}

function classifyItem(value) {
  const v = value.toLocaleLowerCase('pl');
  if (/pilot|telefon|głośnik|radio|słuchawk|zegarek|tablet|komputer|laptop/.test(v)) return 'signal';
  if (/klucz|zamek|kłódk|łańcuch|pasek|sznur/.test(v)) return 'secure';
  if (/latark|lamp|światł|świec/.test(v)) return 'light';
  return 'unknown';
}

async function playChoiceNode(nodeId, node) {
  video.onended = null;
  await setVideo(node, true);
  let left = node.timeLimit;
  const recommended = state.itemTrait === 'signal' ? 'listen' : (['secure','light'].includes(state.itemTrait) ? 'secure' : '');
  const itemLine = state.item ? `<p><strong>${escapeHTML(state.item)}</strong> reaguje na sygnał. Wybierzcie wspólnie.</p>` : '<p>Cień zabrał część sygnału. Wybierzcie wspólnie.</p>';
  overlay.classList.remove('hidden');
  overlay.innerHTML = `
    <div class="panel">
      <div class="eyebrow">DECYZJA DRUŻYNY · <span id="choiceTimer">${left}</span> S</div>
      <h2>${escapeHTML(node.title)}</h2>
      ${itemLine}
      <div class="choice-grid">
        ${node.options.map(option => `<button class="choice ${option.id==='secure'?'secure':''} ${recommended===option.id?'recommended':''}" data-option="${option.id}">${escapeHTML(option.label)}<span class="choice-caption">${choiceCaption(option.id)}</span></button>`).join('')}
      </div>
    </div>`;

  const choose = id => {
    const option = node.options.find(o => o.id === id);
    if (!option) return;
    clearInterval(activeTimer); activeTimer = null;
    state.choice = id;
    state.path = id;
    log('choice', { choice: id, itemTrait: state.itemTrait, automatic: false });
    playNode(option.next);
  };
  overlay.querySelectorAll('[data-option]').forEach(btn => btn.addEventListener('click', () => choose(btn.dataset.option)));
  activeTimer = setInterval(() => {
    left -= 1;
    const el = document.querySelector('#choiceTimer'); if (el) el.textContent = Math.max(0,left);
    if (left <= 0) {
      clearInterval(activeTimer); activeTimer = null;
      const auto = recommended || (state.taskTimedOut ? 'secure' : 'listen');
      const option = node.options.find(o => o.id === auto) || node.options[0];
      state.choice = option.id; state.path = option.id;
      log('choice', { choice: option.id, itemTrait: state.itemTrait, automatic: true });
      playNode(option.next);
    }
  }, 1000);
}

function choiceCaption(id) {
  if (id === 'listen') {
    return state.itemTrait === 'signal' ? 'Wasz przedmiot wzmacnia ten wybór' : 'Poznacie treść, ale otworzycie drogę Cieniowi';
  }
  return ['secure','light'].includes(state.itemTrait) ? 'Wasz przedmiot wzmacnia zabezpieczenie' : 'Zamkniecie drogę, ale utracicie część wiadomości';
}

function renderEnd() {
  clearRuntime();
  state.endedAt = new Date().toISOString();
  log('episode_end', { path: state.path });
  video?.pause();
  const pathText = state.path === 'listen'
    ? 'Odsłuchaliście wiadomość. Nadawca twierdzi, że jest jednym z was — wiele lat później.'
    : 'Zabezpieczyliście portal. Ktoś po drugiej stronie zna jednak wszystkie wasze imiona.';
  app.innerHTML = `
    <section class="end"><div class="end-card">
      <div class="eyebrow">KONIEC FRAGMENTU 0.5.1</div>
      <h2>To dopiero początek</h2>
      <p>To pierwszy działający pionowy fragment interaktywnego serialu: scena → zadanie z czasem → decyzja → natychmiastowy klip → konsekwencja.</p>
      <div class="summary">
        <strong>Drużyna:</strong> ${escapeHTML(state.team)}<br>
        <strong>Uczestnicy:</strong> ${state.participants.map(escapeHTML).join(', ')}<br>
        <strong>Przedmiot:</strong> ${escapeHTML(state.item || 'nie odnaleziono')}<br>
        <strong>Decyzja:</strong> ${state.path === 'listen' ? 'odsłuchaj wiadomość' : 'zabezpiecz portal'}<br><br>
        ${escapeHTML(pathText)}
      </div>
      <div class="end-actions"><button id="replay" class="secondary">ZAGRAJ PONOWNIE</button><button id="download" class="primary">POBIERZ WYNIK JSON</button></div>
    </div></section>`;
  document.querySelector('#replay').addEventListener('click', () => location.reload());
  document.querySelector('#download').addEventListener('click', downloadResult);
}

function personalize(text) {
  return text.replaceAll('{team}', state.team).replaceAll('{names}', state.participants.join(', ')).replaceAll('{item}', state.item || 'przedmiot');
}

function downloadResult() {
  const data = {
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    episode: episode.id,
    team: state.team,
    participants: state.participants,
    startedAt: state.startedAt,
    endedAt: state.endedAt,
    item: state.item,
    itemTrait: state.itemTrait,
    taskTimedOut: state.taskTimedOut,
    taskSecondsLeft: state.taskSecondsLeft,
    choice: state.choice,
    path: state.path,
    events: state.events
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wynik-nasza-legenda-051-${Date.now()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

async function boot() {
  try {
    episode = await fetchJSON(EPISODE_ROOT + 'manifest.json');
    graph = await fetchJSON(EPISODE_ROOT + episode.graph);
    renderSetup();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(console.warn);
  } catch (error) {
    console.error(error);
    app.innerHTML = `<section class="setup"><div class="setup-card"><h1>Nie udało się uruchomić odcinka</h1><p class="setup-copy">Uruchom aplikację przez START_LOCAL.bat albo GitHub Pages. Bez lokalnego serwera przeglądarka może blokować pliki historii.</p></div></section>`;
  }
}
boot();
