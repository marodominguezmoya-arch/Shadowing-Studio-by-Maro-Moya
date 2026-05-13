/**
 * Shadowing Studio — app.js
 *
 * HOW AUDIO WORKS:
 *  - Each phrase is fetched as a real MP3 from Google Translate TTS
 *  - Silence gaps are generated via AudioContext (pure math, no recording)
 *  - All audio chunks are concatenated in memory into one WAV blob
 *  - The WAV blob is offered for download AND played in an <audio> element
 *  - Zero screen recording, zero MediaRecorder, works in Safari + Chrome
 */

'use strict';

const $ = id => document.getElementById(id);

/* ── DOM ── */
const phraseInput     = $('phraseInput');
const langSel         = $('langSel');
const repsIn          = $('repsIn');
const pauseIn         = $('pauseIn');
const rateIn          = $('rateIn');
const genBtn          = $('genBtn');
const buildBtn        = $('buildBtn');
const counterEl       = $('counter');
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
const synth = window.speechSynthesis;
let voices = [], sessionPhrases = [], phoneticCache = {};
let reps = 5, pauseSec = 3, speechRate = 0.9;
let isPlaying = false, stopRequested = false;

/* ─────────────────────────────────────────────
   GOOGLE TRANSLATE TTS
   Returns a real MP3 ArrayBuffer for any text + lang.
   No API key needed. Same engine as translate.google.com
───────────────────────────────────────────── */
const GTTS_LANG_MAP = {
  'es-ES':'es','es-MX':'es','es-AR':'es','es-CO':'es',
  'en-US':'en','en-GB':'en','en-AU':'en','en-IN':'en',
  'fr-FR':'fr','fr-CA':'fr','fr-BE':'fr',
  'de-DE':'de','de-AT':'de',
  'it-IT':'it',
  'pt-PT':'pt','pt-BR':'pt',
  'nl-NL':'nl',
  'sv-SE':'sv','nb-NO':'no','da-DK':'da','fi-FI':'fi',
  'pl-PL':'pl','cs-CZ':'cs','sk-SK':'sk','ro-RO':'ro',
  'hu-HU':'hu','hr-HR':'hr','uk-UA':'uk','ru-RU':'ru','el-GR':'el',
  'tr-TR':'tr','ar-SA':'ar','ar-EG':'ar','he-IL':'iw',
  'fa-IR':'fa','hi-IN':'hi','bn-BD':'bn','ur-PK':'ur',
  'ja-JP':'ja','ko-KR':'ko','zh-CN':'zh-CN','zh-TW':'zh-TW',
  'th-TH':'th','vi-VN':'vi','id-ID':'id','ms-MY':'ms',
  'sw-KE':'sw','af-ZA':'af','ca-ES':'ca',
};

async function fetchTTSAudio(text, locale) {
  const lang = GTTS_LANG_MAP[locale] || locale.split('-')[0];
  // Google Translate TTS endpoint — same one the website uses
  const url = `https://translate.googleapis.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=gtx&ttsspeed=0.8`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TTS fetch failed: ${res.status}`);
  return await res.arrayBuffer();
}

/* ─────────────────────────────────────────────
   WAV BUILDER
   Creates a valid WAV file from raw PCM samples.
   Used to generate silence gaps in memory.
───────────────────────────────────────────── */
function buildSilenceWAV(durationSec, sampleRate = 22050) {
  const numSamples = Math.floor(sampleRate * durationSec);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);
  const write = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
  write(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);   // PCM
  view.setUint16(22, 1, true);   // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, numSamples * 2, true);
  // All zeros = silence
  return buffer;
}

/* ─────────────────────────────────────────────
   MP3 CONCATENATION → WAV OUTPUT
   Strategy:
   1. Fetch each phrase as MP3 ArrayBuffer
   2. Decode MP3 → PCM via AudioContext
   3. Insert silence PCM between repetitions
   4. Encode all PCM into one WAV file
   5. Create blob URL → player + download link
───────────────────────────────────────────── */
async function decodeMp3ToPCM(arrayBuffer, audioCtx) {
  // Copy the buffer because decodeAudioData detaches it
  const copy = arrayBuffer.slice(0);
  const decoded = await audioCtx.decodeAudioData(copy);
  return decoded;
}

function audioBufferToPCM(audioBuffer) {
  // Mix down to mono if needed, return Float32Array
  const ch = audioBuffer.numberOfChannels;
  const len = audioBuffer.length;
  const out = new Float32Array(len);
  for (let c = 0; c < ch; c++) {
    const data = audioBuffer.getChannelData(c);
    for (let i = 0; i < len; i++) out[i] += data[i] / ch;
  }
  return { pcm: out, sampleRate: audioBuffer.sampleRate };
}

function float32ToWAV(pcmData, sampleRate) {
  const numSamples = pcmData.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);
  const write = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };

  write(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, pcmData[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }
  return buffer;
}

function silencePCM(durationSec, sampleRate) {
  return new Float32Array(Math.floor(sampleRate * durationSec));
}

/* ─────────────────────────────────────────────
   BUILD SESSION AUDIO
   Generates the full audio file: phrases × reps + silences
───────────────────────────────────────────── */
async function buildSessionAudio(phrases, locale) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioCtx();
  const sampleRate = audioCtx.sampleRate;

  const total = phrases.length * reps;
  let done = 0;
  const allPCM = []; // array of Float32Array chunks

  for (let pi = 0; pi < phrases.length; pi++) {
    if (stopRequested) break;

    // Fetch the phrase MP3 once, reuse for all repetitions
    updateBuildStatus(`Fetching audio: phrase ${pi + 1} / ${phrases.length}…`, done, total);
    let mp3Buffer;
    try {
      mp3Buffer = await fetchTTSAudio(phrases[pi], locale);
    } catch (e) {
      throw new Error(`Could not fetch audio for "${phrases[pi]}": ${e.message}. Make sure you are online.`);
    }

    // Decode MP3 → PCM
    const audioBuffer = await decodeMp3ToPCM(mp3Buffer, audioCtx);
    const { pcm, sampleRate: sr } = audioBufferToPCM(audioBuffer);

    for (let ri = 0; ri < reps; ri++) {
      if (stopRequested) break;
      allPCM.push(pcm);          // phrase audio
      done++;
      updateBuildStatus(
        `Building: phrase ${pi + 1}/${phrases.length} · rep ${ri + 1}/${reps}`,
        done, total
      );

      // Add silence after every repetition (including after last rep of phrase)
      allPCM.push(silencePCM(pauseSec, sr));
    }
  }

  audioCtx.close();

  if (allPCM.length === 0) return null;

  // Merge all PCM chunks into one Float32Array
  const totalLen = allPCM.reduce((acc, c) => acc + c.length, 0);
  const merged = new Float32Array(totalLen);
  let offset = 0;
  for (const chunk of allPCM) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  // Encode to WAV
  const wavBuffer = float32ToWAV(merged, audioCtx.sampleRate);
  return new Blob([wavBuffer], { type: 'audio/wav' });
}

function updateBuildStatus(msg, done, total) {
  loadingMsg.textContent = msg;
  progressFill.style.width = Math.round((done / total) * 100) + '%';
}

/* ─────────────────────────────────────────────
   PLAY SESSION (Web Speech — live, no download)
───────────────────────────────────────────── */
const sleep = ms => new Promise(r => setTimeout(r, ms));

function loadVoices() {
  const raw = synth.getVoices();
  if (!raw.length) return;
  voices = [...raw].sort((a, b) => {
    if (a.localService && !b.localService) return -1;
    if (!a.localService && b.localService) return 1;
    return a.name.localeCompare(b.name);
  });
  populateVoiceList(langSel.value);
}

const VOICE_PREFS = {
  es:['Monica','Paulina','Diego','Google español','Microsoft Helena','Microsoft Laura'],
  fr:['Thomas','Amelie','Google français','Microsoft Julie','Microsoft Henri'],
  en:['Samantha','Daniel','Google US English','Google UK English Female','Microsoft Zira','Microsoft David'],
  de:['Anna','Yannick','Google Deutsch','Microsoft Hedda'],
  it:['Alice','Luca','Google italiano','Microsoft Elsa'],
  pt:['Joana','Luciana','Google português','Microsoft Helia'],
  nl:['Xander','Google Nederlands','Microsoft Frank'],
  sv:['Alva','Google svenska','Microsoft Bengt'],
  nb:['Nora','Google norsk','Microsoft Jon'],
  da:['Sara','Google dansk','Microsoft Helle'],
  fi:['Satu','Google suomi','Microsoft Heidi'],
  ru:['Milena','Google русский','Microsoft Irina'],
  pl:['Zosia','Google polski','Microsoft Paulina'],
  tr:['Yelda','Google Türkçe','Microsoft Tolga'],
  ar:['Maged','Google العربية','Microsoft Naayf'],
  ja:['Kyoko','Otoya','Google 日本語','Microsoft Ichiro'],
  ko:['Yuna','Google 한국의','Microsoft Heami'],
  zh:['Ting-Ting','Google 普通话','Microsoft Huihui'],
};

function langCode(locale) { return locale.split('-')[0].toLowerCase(); }

function getBestVoice(locale) {
  const code = langCode(locale);
  const pool = voices.filter(v => v.lang.toLowerCase().startsWith(code));
  if (!pool.length) return null;
  for (const p of (VOICE_PREFS[code] || [])) {
    const found = pool.find(v => v.name.includes(p));
    if (found) return found;
  }
  return pool.find(v => v.localService) || pool[0];
}

function populateVoiceList(locale) {
  const code = langCode(locale);
  const pool = voices.filter(v => v.lang.toLowerCase().startsWith(code));
  const voiceSel = $('voiceSel');
  if (!voiceSel) return;
  voiceSel.innerHTML = '';
  if (!pool.length) { voiceSel.innerHTML = '<option value="">System default</option>'; return; }
  const prefs = VOICE_PREFS[code] || [];
  [...pool].sort((a, b) => {
    const ai = prefs.findIndex(p => a.name.includes(p));
    const bi = prefs.findIndex(p => b.name.includes(p));
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1; if (bi !== -1) return 1;
    return a.localService ? -1 : 1;
  }).forEach(v => {
    const o = document.createElement('option');
    o.value = v.name;
    o.textContent = v.name.replace(/Microsoft |Google /g, '').trim() + (v.localService ? ' ★' : '');
    voiceSel.appendChild(o);
  });
  const best = getBestVoice(locale);
  if (best) voiceSel.value = best.name;
}

function getSelectedVoice() {
  const voiceSel = $('voiceSel');
  return voices.find(v => v.name === voiceSel?.value) || null;
}

function speak(text, locale, voice, rate) {
  return new Promise((resolve, reject) => {
    if (stopRequested) { resolve(); return; }
    if (synth.speaking || synth.pending) synth.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = locale; utt.rate = rate || 0.9; utt.pitch = 1; utt.volume = 1;
    if (voice) utt.voice = voice;
    let ka;
    utt.onstart = () => { ka = setInterval(() => { if (synth.speaking) { synth.pause(); synth.resume(); } else clearInterval(ka); }, 10000); };
    utt.onend   = () => { clearInterval(ka); resolve(); };
    utt.onerror = e  => { clearInterval(ka); (e.error === 'interrupted' || e.error === 'canceled') ? resolve() : reject(new Error(e.error)); };
    setTimeout(() => synth.speak(utt), 50);
  });
}

/* ── UI helpers ── */
const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const parsePhrases = () => phraseInput.value.split('\n').map(l => l.trim()).filter(l => l.length > 0);

function updateCounter() {
  const n = parsePhrases().length;
  counterEl.textContent = n === 0 ? '0 phrases' : n === 1 ? '1 phrase' : `${n} phrases`;
  phoneticBtn.disabled = (n === 0 || !apiKeyInput.value.trim());
}

function showState(s) {
  ['empty','loading','result','error'].forEach(n => { const e = $(n+'State'); if (e) e.classList.add('hidden'); });
  const t = $(s+'State'); if (t) t.classList.remove('hidden');
}

function buildDots() {
  repDots.innerHTML = '';
  for (let i = 0; i < reps; i++) { const d = document.createElement('div'); d.className = 'dot'; d.id = `dot_${i}`; repDots.appendChild(d); }
}
function updateDots(cur) {
  for (let i = 0; i < reps; i++) {
    const d = $(`dot_${i}`); if (!d) continue; d.className = 'dot';
    if (i < cur) d.classList.add('done'); else if (i === cur) d.classList.add('active');
  }
}
function buildCards(phrases) {
  phraseList.innerHTML = '';
  phrases.forEach((p, i) => {
    const cached = phoneticCache[p], lang = phonLangSel.value.toUpperCase();
    const c = document.createElement('div'); c.className = 'pcard'; c.id = `pc_${i}`;
    c.innerHTML = `<div class="pcard-top"><span class="pcard-num">${i+1}</span><span class="pcard-text">${esc(p)}</span><span class="pcard-rep" id="pr_${i}">×${reps}</span></div>
    <p class="pcard-phonetic${cached?' show':''}" id="pph_${i}">${cached?`<span class="pcard-ph-lang">${lang}</span>${esc(cached)}`:''}</p>`;
    phraseList.appendChild(c);
  });
}
function updateCards(idx) {
  document.querySelectorAll('.pcard').forEach((c, i) => {
    c.className = 'pcard'; if (i < idx) c.classList.add('done'); if (i === idx) c.classList.add('active');
  });
}

/* ── Play session (Web Speech, no download) ── */
async function runPlaySession(phrases, locale, voice, rate) {
  isPlaying = true; stopRequested = false;
  const total = phrases.length * reps; let done = 0;
  showState('result'); buildCards(phrases); buildDots();
  downloadWrap.classList.add('hidden');

  for (let pi = 0; pi < phrases.length; pi++) {
    if (stopRequested) break;
    updateCards(pi);
    npPhrase.textContent = phrases[pi];
    npPhonetic.textContent = phoneticCache[phrases[pi]] || '';

    for (let ri = 0; ri < reps; ri++) {
      if (stopRequested) break;
      updateDots(ri);
      npMeta.textContent = `Phrase ${pi+1}/${phrases.length} · Rep. ${ri+1}/${reps}`;
      const repEl = $(`pr_${pi}`); if (repEl) repEl.textContent = `${ri+1}/${reps}`;
      await speak(phrases[pi], locale, voice, rate);
      done++; progressFill.style.width = Math.round((done / total) * 100) + '%';
      if (ri < reps - 1) { npMeta.textContent = `⏸ Pause ${pauseSec}s…`; await sleep(pauseSec * 1000); }
    }
    if (!stopRequested && pi < phrases.length - 1) { npMeta.textContent = '⏸ Next phrase…'; await sleep(900); }
  }

  isPlaying = false;
  if (!stopRequested) {
    npPhrase.textContent = '✓ Session complete!'; npPhonetic.textContent = '';
    npMeta.textContent = `${phrases.length} phrase${phrases.length > 1 ? 's' : ''} · ${phrases.length * reps} repetitions`;
    updateDots(reps); updateCards(phrases.length);
    playBtn.disabled = false;
    playBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor"><polygon points="1,0.5 10,5.5 1,10.5"/></svg> Repeat`;
  }
}

/* ── Build & Download ── */
async function runBuildSession(phrases, locale) {
  showState('loading');
  loadingMsg.textContent = 'Fetching audio from Google TTS…';
  loadingSub.textContent = `${phrases.length} phrase${phrases.length > 1 ? 's' : ''} × ${reps} reps · ${pauseSec}s pause`;
  progressFill.style.width = '0%';
  downloadWrap.classList.add('hidden');

  try {
    const blob = await buildSessionAudio(phrases, locale);
    if (!blob) { showState('empty'); return; }

    const url = URL.createObjectURL(blob);
    audioPlayer.src = url;
    downloadBtn.href = url;
    downloadBtn.download = `shadowing-${locale}-${Date.now()}.wav`;

    showState('result');
    buildCards(phrases);
    npPhrase.textContent = '✓ Audio ready!';
    npPhonetic.textContent = '';
    npMeta.textContent = `${phrases.length} phrase${phrases.length > 1 ? 's' : ''} · ${reps} reps · ${pauseSec}s pause`;
    downloadWrap.classList.remove('hidden');
    progressFill.style.width = '100%';

  } catch (err) {
    errorText.textContent = err.message;
    showState('error');
  }
}

/* ── Start handlers ── */
async function startPlaySession() {
  const phrases = parsePhrases();
  if (!phrases.length) { errorText.textContent = 'Write at least one phrase.'; showState('error'); return; }
  reps = Math.max(1, parseInt(repsIn.value) || 5);
  pauseSec = Math.max(1, parseInt(pauseIn.value) || 3);
  speechRate = Math.max(0.5, parseFloat(rateIn.value) || 0.9);
  sessionPhrases = phrases;
  await runPlaySession(phrases, langSel.value, getSelectedVoice(), speechRate);
}

async function startBuildSession() {
  const phrases = parsePhrases();
  if (!phrases.length) { errorText.textContent = 'Write at least one phrase.'; showState('error'); return; }
  reps = Math.max(1, parseInt(repsIn.value) || 5);
  pauseSec = Math.max(1, parseInt(pauseIn.value) || 3);
  sessionPhrases = phrases;
  buildBtn.disabled = true;
  buildBtn.textContent = 'Building…';
  await runBuildSession(phrases, langSel.value);
  buildBtn.disabled = false;
  buildBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M6 8.5L2.5 5H5V1h2v4h2.5L6 8.5z"/><rect x="1" y="10" width="10" height="1.5" rx=".75"/></svg> Build &amp; Download`;
}

/* ── Phonetics via Claude ── */
const LANG_NAMES = { fr:'French',es:'Spanish',en:'English',de:'German',it:'Italian',pt:'Portuguese',nl:'Dutch',pl:'Polish',ru:'Russian',tr:'Turkish',sv:'Swedish',nb:'Norwegian',ar:'Arabic',ja:'Japanese',ko:'Korean',zh:'Chinese' };

async function getPhoneticFromClaude(phrase, targetLang, apiKey) {
  const langName = LANG_NAMES[targetLang] || targetLang;
  const spokenLang = langSel.options[langSel.selectedIndex].text.replace(/[🇦-🇿]{2}\s*/u, '').trim();
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true' },
    body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:256,
      system:`You are a phonetics expert. Write how a native ${langName} speaker would phonetically read foreign sounds using ${langName} orthography — not a translation. Return only the transcription.`,
      messages:[{role:'user',content:`Phrase in ${spokenLang}: "${phrase}"\nWrite the ${langName} phonetic reading.`}] })
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e?.error?.message || `API error ${r.status}`); }
  const d = await r.json(); return d.content?.[0]?.text?.trim() || '';
}

function renderPhoneticItem(phrase, state, text) {
  const ex = document.querySelector(`.ph-item[data-phrase="${CSS.escape(phrase)}"]`); if (ex) ex.remove();
  const div = document.createElement('div'); div.className = 'ph-item'; div.dataset.phrase = phrase;
  if (state === 'loading') div.innerHTML = `<div class="ph-original">${esc(phrase)}</div><div class="ph-loading"><div class="spin"></div> Generating…</div>`;
  else if (state === 'done') div.innerHTML = `<div class="ph-original">${esc(phrase)}</div><div class="ph-transcription">${esc(text)}</div>`;
  else div.innerHTML = `<div class="ph-original">${esc(phrase)}</div><div class="ph-error">Error: ${esc(text)}</div>`;
  phoneticResults.appendChild(div);
}

async function generatePhonetics() {
  const phrases = parsePhrases(), apiKey = apiKeyInput.value.trim();
  if (!phrases.length) return;
  if (!apiKey) { phoneticResults.innerHTML = `<div class="ph-error" style="padding:8px 11px;border-radius:var(--radius)">Please enter your Claude API key.</div>`; return; }
  phoneticBtn.disabled = true; phoneticResults.innerHTML = ''; phoneticCache = {};
  for (const phrase of phrases) {
    renderPhoneticItem(phrase, 'loading', '');
    try {
      const t = await getPhoneticFromClaude(phrase, phonLangSel.value, apiKey);
      phoneticCache[phrase] = t; renderPhoneticItem(phrase, 'done', t);
      const idx = sessionPhrases.indexOf(phrase);
      if (idx !== -1) { const pph = $(`pph_${idx}`); if (pph) { pph.innerHTML = `<span class="pcard-ph-lang">${phonLangSel.value.toUpperCase()}</span>${esc(t)}`; pph.classList.add('show'); } }
      if (npPhrase.textContent === phrase) npPhonetic.textContent = t;
    } catch (err) { renderPhoneticItem(phrase, 'error', err.message); }
  }
  phoneticBtn.disabled = false;
}

/* ── API key ── */
function loadSavedKey() { const s = localStorage.getItem('shadowing_api_key'); if (s) { apiKeyInput.value = s; updateCounter(); } }
function saveKey() {
  const k = apiKeyInput.value.trim();
  if (k) { localStorage.setItem('shadowing_api_key', k); saveKeyBtn.textContent = 'Saved ✓'; }
  else   { localStorage.removeItem('shadowing_api_key'); saveKeyBtn.textContent = 'Cleared'; }
  setTimeout(() => { saveKeyBtn.textContent = 'Save'; }, 1800);
}

/* ── Events ── */
genBtn.addEventListener('click', startPlaySession);
buildBtn.addEventListener('click', startBuildSession);
phraseInput.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') startPlaySession(); });

playBtn.addEventListener('click', async () => {
  if (isPlaying) return;
  reps = Math.max(1, parseInt(repsIn.value) || 5);
  pauseSec = Math.max(1, parseInt(pauseIn.value) || 3);
  speechRate = Math.max(0.5, parseFloat(rateIn.value) || 0.9);
  playBtn.disabled = true;
  await runPlaySession(sessionPhrases, langSel.value, getSelectedVoice(), speechRate);
});

stopBtn.addEventListener('click', () => {
  stopRequested = true; synth.cancel(); isPlaying = false;
  npMeta.textContent = 'Stopped.';
  playBtn.disabled = false;
  playBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor"><polygon points="1,0.5 10,5.5 1,10.5"/></svg> Resume`;
});

resetBtn.addEventListener('click', () => { synth.cancel(); isPlaying = false; stopRequested = true; downloadWrap.classList.add('hidden'); showState('empty'); });
retryBtn.addEventListener('click', () => showState('empty'));
phraseInput.addEventListener('input', updateCounter);
langSel.addEventListener('change', () => populateVoiceList(langSel.value));
phoneticBtn.addEventListener('click', generatePhonetics);
saveKeyBtn.addEventListener('click', saveKey);
apiKeyInput.addEventListener('input', updateCounter);
apiKeyInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveKey(); });

/* ── Init ── */
if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = loadVoices;
loadVoices(); setTimeout(loadVoices, 300); setTimeout(loadVoices, 1000);
loadSavedKey(); updateCounter(); showState('empty');
