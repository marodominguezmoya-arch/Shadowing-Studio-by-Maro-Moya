/**
 * Shadowing Studio — app.js
 *
 * TTS ENGINE: meSpeak.js (eSpeak compiled to JS)
 *  - Runs 100% in the browser, no server, no API, no CORS
 *  - Generates real WAV audio buffers directly
 *  - Works in Safari, Chrome, Firefox, on iPhone and Android
 *  - Voice is synthetic (eSpeak style) but fully functional
 *
 * TWO MODES:
 *  1. Play session  — synthesises and plays each phrase live via AudioContext
 *  2. Build & Download — synthesises all phrases + silences, merges into one WAV, offers download
 */

'use strict';

const $ = id => document.getElementById(id);

/* ── DOM ── */
const phraseInput     = $('phraseInput');
const langSel         = $('langSel');
const repsIn          = $('repsIn');
const pauseIn         = $('pauseIn');
const speedIn         = $('speedIn');
const genBtn          = $('genBtn');
const buildBtn        = $('buildBtn');
const counterEl       = $('counter');
const vdot            = $('vdot');
const vtext           = $('vtext');
const apiKeyInput     = $('apiKey');
const saveKeyBtn      = $('saveKeyBtn');
const phoneticBtn     = $('phoneticBtn');
const phonLangSel     = $('phonLangSel');
const phoneticResults = $('phoneticResults');
const loadingMsg      = $('loadingMsg');
const loadingSub      = $('loadingSub');
const progressFill    = $('progressFill');
const phraseList      = $('phraseList');
const npPhrase        = $('npPhrase');
const npPhonetic      = $('npPhonetic');
const npMeta          = $('npMeta');
const repDots         = $('repDots');
const playBtn         = $('playBtn');
const stopBtn         = $('stopBtn');
const resetBtn        = $('resetBtn');
const retryBtn        = $('retryBtn');
const errorText       = $('errorText');
const downloadWrap    = $('downloadWrap');
const downloadBtn     = $('downloadBtn');
const audioPlayer     = $('audioPlayer');

/* ── State ── */
let sessionPhrases = [], phoneticCache = {};
let reps = 5, pauseSec = 3, ttsSpeed = 130;
let isPlaying = false, stopRequested = false;
let meReady = false;
let currentAudioSource = null; // for stopping playback
let audioCtx = null;

/* ─────────────────────────────────────────────
   meSPEAK LANGUAGE MAP
   meSpeak uses eSpeak language codes
───────────────────────────────────────────── */
const ME_LANG = {
  en:'en', es:'es', fr:'fr', de:'de', it:'it', pt:'pt',
  nl:'nl', sv:'sv', fi:'fi', da:'da', nb:'nb',
  pl:'pl', cs:'cs', ro:'ro', hu:'hu', ru:'ru', el:'el',
  tr:'tr', ar:'ar', hi:'hi', zh:'zh', vi:'vi', id:'id',
  sw:'sw', af:'af',
};

/* ─────────────────────────────────────────────
   INIT meSPEAK
───────────────────────────────────────────── */
function initMeSpeak() {
  if (typeof meSpeak === 'undefined') {
    vdot.style.color = 'var(--danger)';
    vtext.textContent = 'Voice engine failed to load. Check your internet connection and reload.';
    return;
  }

  meSpeak.loadConfig('https://cdn.jsdelivr.net/npm/mespeak@2.0.2/src/mespeak_config.json', () => {
    // Load English voice first as default
    loadMeSpeakVoice('en', () => {
      meReady = true;
      vdot.style.color = 'var(--green)';
      vtext.textContent = 'Voice engine ready — eSpeak (synthetic, downloadable)';
      genBtn.disabled = false;
      buildBtn.disabled = false;
    });
  });
}

function loadMeSpeakVoice(lang, cb) {
  const voiceUrl = `https://cdn.jsdelivr.net/npm/mespeak@2.0.2/voices/${lang}.json`;
  meSpeak.loadVoice(voiceUrl, () => {
    if (cb) cb();
  });
}

/* ─────────────────────────────────────────────
   WAV UTILITIES
───────────────────────────────────────────── */

/**
 * meSpeak.speak() with export:true returns a WAV ArrayBuffer.
 * We wrap it in a Promise for async/await usage.
 */
function synthesise(text, lang, speed) {
  return new Promise((resolve, reject) => {
    const code = ME_LANG[lang] || 'en';
    try {
      const wav = meSpeak.speak(text, {
        amplitude: 100,
        pitch: 50,
        speed: speed || 130,
        voice: code,
        rawdata: 'buffer', // returns ArrayBuffer
      });
      if (!wav) reject(new Error('meSpeak returned empty audio'));
      else resolve(wav);
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Parse a WAV ArrayBuffer and extract raw PCM Float32 samples + sample rate.
 */
function parseWAV(buffer) {
  const view = new DataView(buffer);
  const sampleRate  = view.getUint32(24, true);
  const bitsPerSample = view.getUint16(34, true);
  const numChannels = view.getUint16(22, true);
  const dataOffset  = 44; // standard PCM WAV
  const numSamples  = (buffer.byteLength - dataOffset) / (bitsPerSample / 8);
  const pcm = new Float32Array(numSamples / numChannels);
  for (let i = 0; i < pcm.length; i++) {
    if (bitsPerSample === 16) {
      pcm[i] = view.getInt16(dataOffset + i * 2 * numChannels, true) / 32768;
    } else {
      pcm[i] = (view.getUint8(dataOffset + i * numChannels) - 128) / 128;
    }
  }
  return { pcm, sampleRate };
}

/**
 * Encode Float32 PCM + sampleRate → WAV ArrayBuffer.
 */
function encodePCMtoWAV(pcm, sampleRate) {
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view   = new DataView(buffer);
  const wr = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };
  wr(0, 'RIFF');
  view.setUint32(4,  36 + pcm.length * 2, true);
  wr(8, 'WAVE');
  wr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1,  true);          // PCM
  view.setUint16(22, 1,  true);          // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2,  true);
  view.setUint16(34, 16, true);
  wr(36, 'data');
  view.setUint32(40, pcm.length * 2, true);
  let off = 44;
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    off += 2;
  }
  return buffer;
}

/** Generate silence as Float32Array */
function silencePCM(durationSec, sampleRate) {
  return new Float32Array(Math.floor(sampleRate * durationSec));
}

/* ─────────────────────────────────────────────
   PLAY A WAV BUFFER via AudioContext
───────────────────────────────────────────── */
function getAudioCtx() {
  if (!audioCtx || audioCtx.state === 'closed') {
    const AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
  }
  return audioCtx;
}

function playWAVBuffer(wavBuffer) {
  return new Promise((resolve, reject) => {
    if (stopRequested) { resolve(); return; }
    const ctx = getAudioCtx();
    ctx.decodeAudioData(wavBuffer.slice(0), decoded => {
      const source = ctx.createBufferSource();
      source.buffer = decoded;
      source.connect(ctx.destination);
      currentAudioSource = source;
      source.onended = () => { currentAudioSource = null; resolve(); };
      source.start(0);
    }, reject);
  });
}

function stopCurrentAudio() {
  if (currentAudioSource) {
    try { currentAudioSource.stop(); } catch (_) {}
    currentAudioSource = null;
  }
}

/* ─────────────────────────────────────────────
   UTILITIES
───────────────────────────────────────────── */
const sleep  = ms  => new Promise(r => setTimeout(r, ms));
const esc    = s   => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const parsePhrases = () => phraseInput.value.split('\n').map(l => l.trim()).filter(l => l.length > 0);

function updateCounter() {
  const n = parsePhrases().length;
  counterEl.textContent = n === 0 ? '0 phrases' : n === 1 ? '1 phrase' : `${n} phrases`;
  phoneticBtn.disabled  = n === 0 || !apiKeyInput.value.trim();
}

function showState(s) {
  ['empty','loading','result','error'].forEach(n => { const e = $(n+'State'); if (e) e.classList.add('hidden'); });
  const t = $(s+'State'); if (t) t.classList.remove('hidden');
}

/* ── Card / dot builders ── */
function buildDots() {
  repDots.innerHTML = '';
  for (let i = 0; i < reps; i++) {
    const d = document.createElement('div');
    d.className = 'dot'; d.id = `dot_${i}`;
    repDots.appendChild(d);
  }
}

function updateDots(cur) {
  for (let i = 0; i < reps; i++) {
    const d = $(`dot_${i}`); if (!d) continue;
    d.className = 'dot';
    if (i < cur)        d.classList.add('done');
    else if (i === cur) d.classList.add('active');
  }
}

function buildCards(phrases) {
  phraseList.innerHTML = '';
  phrases.forEach((p, i) => {
    const cached = phoneticCache[p];
    const lang   = phonLangSel.value.toUpperCase();
    const c = document.createElement('div');
    c.className = 'pcard'; c.id = `pc_${i}`;
    c.innerHTML = `
      <div class="pcard-top">
        <span class="pcard-num">${i + 1}</span>
        <span class="pcard-text">${esc(p)}</span>
        <span class="pcard-rep" id="pr_${i}">×${reps}</span>
      </div>
      <p class="pcard-phonetic${cached ? ' show' : ''}" id="pph_${i}">
        ${cached ? `<span class="pcard-ph-lang">${lang}</span>${esc(cached)}` : ''}
      </p>`;
    phraseList.appendChild(c);
  });
}

function updateCards(idx) {
  document.querySelectorAll('.pcard').forEach((c, i) => {
    c.className = 'pcard';
    if (i < idx)       c.classList.add('done');
    if (i === idx)     c.classList.add('active');
  });
}

/* ─────────────────────────────────────────────
   MODE 1 — PLAY SESSION (live audio, no file)
───────────────────────────────────────────── */
async function ensureVoiceLoaded(lang) {
  return new Promise(resolve => {
    loadMeSpeakVoice(ME_LANG[lang] || 'en', resolve);
  });
}

async function runPlaySession(phrases, lang, speed) {
  isPlaying = true; stopRequested = false;
  const total = phrases.length * reps; let done = 0;

  showState('result');
  buildCards(phrases);
  buildDots();
  downloadWrap.classList.add('hidden');

  // Load the selected language voice
  npMeta.textContent = 'Loading voice…';
  await ensureVoiceLoaded(lang);

  for (let pi = 0; pi < phrases.length; pi++) {
    if (stopRequested) break;
    updateCards(pi);
    npPhrase.textContent   = phrases[pi];
    npPhonetic.textContent = phoneticCache[phrases[pi]] || '';

    for (let ri = 0; ri < reps; ri++) {
      if (stopRequested) break;
      updateDots(ri);
      npMeta.textContent = `Phrase ${pi + 1}/${phrases.length} · Rep. ${ri + 1}/${reps}`;
      const repEl = $(`pr_${pi}`);
      if (repEl) repEl.textContent = `${ri + 1}/${reps}`;

      // Synthesise → play
      const wavBuf = await synthesise(phrases[pi], lang, speed);
      await playWAVBuffer(wavBuf);

      done++;
      progressFill.style.width = Math.round((done / total) * 100) + '%';

      if (ri < reps - 1 && !stopRequested) {
        npMeta.textContent = `⏸ Pause ${pauseSec}s…`;
        await sleep(pauseSec * 1000);
      }
    }

    if (!stopRequested && pi < phrases.length - 1) {
      npMeta.textContent = '⏸ Next phrase…';
      await sleep(800);
    }
  }

  isPlaying = false;
  if (!stopRequested) {
    npPhrase.textContent   = '✓ Session complete!';
    npPhonetic.textContent = '';
    npMeta.textContent     = `${phrases.length} phrase${phrases.length > 1 ? 's' : ''} · ${phrases.length * reps} repetitions`;
    updateDots(reps);
    updateCards(phrases.length);
    playBtn.disabled = false;
    playBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor"><polygon points="1,0.5 10,5.5 1,10.5"/></svg> Repeat session`;
  }
}

/* ─────────────────────────────────────────────
   MODE 2 — BUILD & DOWNLOAD (generates WAV file)
───────────────────────────────────────────── */
async function runBuildSession(phrases, lang, speed) {
  showState('loading');
  progressFill.style.width = '0%';
  loadingMsg.textContent = 'Building audio file…';
  loadingSub.textContent = `${phrases.length} phrase${phrases.length > 1 ? 's' : ''} × ${reps} reps · ${pauseSec}s pause`;
  downloadWrap.classList.add('hidden');

  await ensureVoiceLoaded(lang);

  const total   = phrases.length * reps;
  let done      = 0;
  let sampleRate = 22050; // meSpeak default
  const allPCM  = []; // array of Float32Array chunks

  try {
    for (let pi = 0; pi < phrases.length; pi++) {
      if (stopRequested) break;

      loadingMsg.textContent = `Synthesising phrase ${pi + 1} / ${phrases.length}…`;

      // Synthesise phrase once, reuse for all reps
      const wavBuf = await synthesise(phrases[pi], lang, speed);
      const { pcm, sampleRate: sr } = parseWAV(wavBuf);
      sampleRate = sr;

      for (let ri = 0; ri < reps; ri++) {
        if (stopRequested) break;
        allPCM.push(pcm);
        allPCM.push(silencePCM(pauseSec, sampleRate));
        done++;
        progressFill.style.width = Math.round((done / total) * 100) + '%';
        loadingMsg.textContent = `Building: phrase ${pi + 1}/${phrases.length} · rep ${ri + 1}/${reps}`;
        // yield to UI so the progress bar updates
        await sleep(0);
      }
    }

    if (allPCM.length === 0 || stopRequested) { showState('empty'); return; }

    loadingMsg.textContent = 'Encoding WAV file…';
    await sleep(50);

    // Merge all PCM chunks
    const totalLen = allPCM.reduce((a, c) => a + c.length, 0);
    const merged   = new Float32Array(totalLen);
    let offset = 0;
    for (const chunk of allPCM) { merged.set(chunk, offset); offset += chunk.length; }

    // Encode to WAV
    const wavOutput = encodePCMtoWAV(merged, sampleRate);
    const blob      = new Blob([wavOutput], { type: 'audio/wav' });
    const url       = URL.createObjectURL(blob);

    // Show player + download button
    audioPlayer.src       = url;
    downloadBtn.href      = url;
    downloadBtn.download  = `shadowing-${lang}-${Date.now()}.wav`;

    showState('result');
    buildCards(phrases);
    npPhrase.textContent   = '✓ Audio file ready!';
    npPhonetic.textContent = '';
    npMeta.textContent     = `${phrases.length} phrase${phrases.length > 1 ? 's' : ''} · ${reps} reps · ${pauseSec}s pause`;
    progressFill.style.width = '100%';
    downloadWrap.classList.remove('hidden');

  } catch (err) {
    errorText.textContent = `Build failed: ${err.message}`;
    showState('error');
  }
}

/* ─────────────────────────────────────────────
   START HANDLERS
───────────────────────────────────────────── */
function readParams() {
  reps      = Math.max(1,   parseInt(repsIn.value)   || 5);
  pauseSec  = Math.max(1,   parseInt(pauseIn.value)  || 3);
  ttsSpeed  = Math.max(80,  parseInt(speedIn.value)  || 130);
}

async function startPlaySession() {
  if (!meReady) { errorText.textContent = 'Voice engine not ready yet. Please wait a moment.'; showState('error'); return; }
  const phrases = parsePhrases();
  if (!phrases.length) { errorText.textContent = 'Write at least one phrase.'; showState('error'); return; }
  readParams();
  sessionPhrases = phrases;
  genBtn.disabled = true;
  await runPlaySession(phrases, langSel.value, ttsSpeed);
  genBtn.disabled = false;
}

async function startBuildSession() {
  if (!meReady) { errorText.textContent = 'Voice engine not ready yet. Please wait a moment.'; showState('error'); return; }
  const phrases = parsePhrases();
  if (!phrases.length) { errorText.textContent = 'Write at least one phrase.'; showState('error'); return; }
  readParams();
  sessionPhrases = phrases;
  buildBtn.disabled = true;
  buildBtn.textContent = 'Building…';
  await runBuildSession(phrases, langSel.value, ttsSpeed);
  buildBtn.disabled = false;
  buildBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M6 8.5L2.5 5H5V1h2v4h2.5L6 8.5z"/><rect x="1" y="10" width="10" height="1.5" rx=".75"/></svg> Build &amp; Download`;
}

/* ─────────────────────────────────────────────
   PHONETICS VIA CLAUDE API
───────────────────────────────────────────── */
const LANG_NAMES = {
  fr:'French', es:'Spanish', en:'English', de:'German', it:'Italian',
  pt:'Portuguese', nl:'Dutch', pl:'Polish', ru:'Russian', tr:'Turkish',
  sv:'Swedish', nb:'Norwegian', ar:'Arabic', ja:'Japanese', ko:'Korean', zh:'Chinese',
};

async function getPhoneticFromClaude(phrase, targetLang, apiKey) {
  const langName   = LANG_NAMES[targetLang] || targetLang;
  const spokenLang = langSel.options[langSel.selectedIndex].text.replace(/[🇦-🇿]{2}\s*/u, '').trim();
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: `You are a phonetics expert. Write how a native ${langName} speaker would phonetically read foreign sounds using ${langName} orthography — not a translation. Return only the transcription, nothing else.`,
      messages: [{ role: 'user', content: `Phrase in ${spokenLang}: "${phrase}"\nWrite the ${langName} phonetic reading.` }],
    }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e?.error?.message || `API error ${r.status}`); }
  const d = await r.json();
  return d.content?.[0]?.text?.trim() || '';
}

function renderPhoneticItem(phrase, state, text) {
  const ex = document.querySelector(`.ph-item[data-phrase="${CSS.escape(phrase)}"]`);
  if (ex) ex.remove();
  const div = document.createElement('div');
  div.className = 'ph-item'; div.dataset.phrase = phrase;
  if (state === 'loading') {
    div.innerHTML = `<div class="ph-original">${esc(phrase)}</div><div class="ph-loading"><div class="spin"></div> Generating…</div>`;
  } else if (state === 'done') {
    div.innerHTML = `<div class="ph-original">${esc(phrase)}</div><div class="ph-transcription">${esc(text)}</div>`;
  } else {
    div.innerHTML = `<div class="ph-original">${esc(phrase)}</div><div class="ph-error">Error: ${esc(text)}</div>`;
  }
  phoneticResults.appendChild(div);
}

async function generatePhonetics() {
  const phrases = parsePhrases();
  const apiKey  = apiKeyInput.value.trim();
  if (!phrases.length) return;
  if (!apiKey) {
    phoneticResults.innerHTML = `<div class="ph-error" style="padding:8px 11px;border-radius:var(--radius)">Please enter your Claude API key.</div>`;
    return;
  }
  phoneticBtn.disabled = true;
  phoneticResults.innerHTML = '';
  phoneticCache = {};
  for (const phrase of phrases) {
    renderPhoneticItem(phrase, 'loading', '');
    try {
      const t = await getPhoneticFromClaude(phrase, phonLangSel.value, apiKey);
      phoneticCache[phrase] = t;
      renderPhoneticItem(phrase, 'done', t);
      const idx = sessionPhrases.indexOf(phrase);
      if (idx !== -1) {
        const pph = $(`pph_${idx}`);
        if (pph) {
          pph.innerHTML = `<span class="pcard-ph-lang">${phonLangSel.value.toUpperCase()}</span>${esc(t)}`;
          pph.classList.add('show');
        }
      }
      if (npPhrase.textContent === phrase) npPhonetic.textContent = t;
    } catch (err) {
      renderPhoneticItem(phrase, 'error', err.message);
    }
  }
  phoneticBtn.disabled = false;
}

/* ── API key ── */
function loadSavedKey() {
  const s = localStorage.getItem('shadowing_api_key');
  if (s) { apiKeyInput.value = s; updateCounter(); }
}
function saveKey() {
  const k = apiKeyInput.value.trim();
  if (k) { localStorage.setItem('shadowing_api_key', k); saveKeyBtn.textContent = 'Saved ✓'; }
  else   { localStorage.removeItem('shadowing_api_key'); saveKeyBtn.textContent = 'Cleared'; }
  setTimeout(() => { saveKeyBtn.textContent = 'Save'; }, 1800);
}

/* ─────────────────────────────────────────────
   EVENT LISTENERS
───────────────────────────────────────────── */
genBtn.addEventListener('click', startPlaySession);
buildBtn.addEventListener('click', startBuildSession);
phraseInput.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') startPlaySession(); });

playBtn.addEventListener('click', async () => {
  if (isPlaying) return;
  readParams();
  playBtn.disabled = true;
  await runPlaySession(sessionPhrases, langSel.value, ttsSpeed);
});

stopBtn.addEventListener('click', () => {
  stopRequested = true;
  stopCurrentAudio();
  isPlaying = false;
  npMeta.textContent = 'Stopped.';
  playBtn.disabled = false;
  genBtn.disabled  = false;
  buildBtn.disabled = false;
});

resetBtn.addEventListener('click', () => {
  stopRequested = true;
  stopCurrentAudio();
  isPlaying = false;
  downloadWrap.classList.add('hidden');
  showState('empty');
});

retryBtn.addEventListener('click', () => showState('empty'));
phraseInput.addEventListener('input', updateCounter);
phoneticBtn.addEventListener('click', generatePhonetics);
saveKeyBtn.addEventListener('click', saveKey);
apiKeyInput.addEventListener('input', updateCounter);
apiKeyInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveKey(); });

/* ─────────────────────────────────────────────
   INIT
───────────────────────────────────────────── */
window.addEventListener('load', () => {
  // Small delay to let meSpeak script fully initialise
  setTimeout(initMeSpeak, 300);
});

loadSavedKey();
updateCounter();
showState('empty');
