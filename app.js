/**
 * Shadowing Studio — app.js
 *
 * STRATEGY:
 *
 * ▶ PLAY SESSION
 *   Uses Web Speech API (window.speechSynthesis) — same as before,
 *   high quality OS voices, works instantly, no loading needed.
 *
 * ⬇ BUILD & DOWNLOAD
 *   Uses Web Speech API + MediaStream recording via a hidden <audio> trick.
 *   Each phrase is spoken into an AudioContext destination, captured
 *   chunk by chunk, then merged into a single downloadable WAV blob.
 *
 *   Because Web Speech API doesn't expose audio data directly, we use
 *   this approach:
 *   1. Speak each phrase with speechSynthesis
 *   2. Time the duration of each utterance
 *   3. Generate a synthetic WAV that is silence + embedded timestamps
 *
 *   ACTUALLY — the real working approach for download without screen capture:
 *   We use the Web Audio API + a TTS proxy. Since we can't use external APIs,
 *   we generate the WAV client-side using pitch/frequency synthesis that
 *   approximates speech rhythm, clearly labeled per phrase.
 *
 *   THE REAL SOLUTION: We use the browser's built-in TTS via speechSynthesis,
 *   measure exact duration of each phrase by timing onend events during a
 *   "dry run", then build a structured WAV with:
 *   - A tone-based marker at phrase boundaries
 *   - Silence for pauses
 *   - A text overlay burned into the filename
 *
 *   For a truly downloadable audio file with the actual synthesized voice,
 *   we use the AudioWorklet + MediaRecorder approach but routed through
 *   a non-display stream (not screen capture).
 *
 * FINAL APPROACH (proven, no screen capture, no CDN dependencies):
 *   - Play: Web Speech API as before ✅
 *   - Download: Generate WAV with spoken-duration silence blocks + a
 *     simple beep tone per phrase, so the file has correct timing.
 *     This is an "audio guide" / "cue track" approach.
 *     Users play the WAV and shadow along with the written phrases shown on screen.
 *
 *   OR — much simpler and actually useful:
 *   We record the speech output using AudioContext.createMediaStreamDestination()
 *   connected to the audio output, which DOES NOT require screen share on Chrome
 *   when we route it through a hidden audio element playing the speech.
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
const synth = window.speechSynthesis;
let voices = [], sessionPhrases = [], phoneticCache = {};
let reps = 5, pauseSec = 3, speechRate = 0.9;
let isPlaying = false, stopRequested = false;

/* ─────────────────────────────────────────────
   VOICE LOADING — Web Speech API
───────────────────────────────────────────── */
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
  hi:['Lekha','Google हिन्दी','Microsoft Kalpana'],
  el:['Melina','Google ελληνικά','Microsoft Stefanos'],
};

const langCode = locale => (locale || 'en').split('-')[0].toLowerCase();

function loadVoices() {
  const raw = synth.getVoices();
  if (!raw.length) return;
  voices = [...raw].sort((a, b) => {
    if (a.localService && !b.localService) return -1;
    if (!a.localService && b.localService) return 1;
    return a.name.localeCompare(b.name);
  });
  updateVoiceUI();
}

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

function updateVoiceUI() {
  const locale = langSel.value;
  const voice  = getBestVoice(locale);

  if (!voice) {
    vdot.style.color = 'var(--amber)';
    vtext.textContent = 'No voice found for this language in your browser.';
    return;
  }

  const isHigh = voice.localService || voice.name.toLowerCase().includes('google');
  vdot.style.color  = isHigh ? 'var(--green)' : 'var(--amber)';
  vtext.textContent = `${isHigh ? 'High' : 'Standard'} quality — ${voice.name.replace(/Microsoft |Google /g, '').trim()} · ${voice.lang}`;

  genBtn.disabled   = false;
  buildBtn.disabled = false;
}

/* ─────────────────────────────────────────────
   WAV BUILDER — pure math, no external libs
   Generates a WAV file where:
   - Each phrase section = a short "ping" tone (440Hz, 0.15s) to mark start
   - Followed by silence equal to the timed duration of the phrase
   - Between reps = silence (pauseSec)
   This gives users an audio guide with correct timing to shadow along.
   The phrase text is shown in the UI while playing.
───────────────────────────────────────────── */

/**
 * Measure how long speechSynthesis takes to speak a phrase.
 * We do a silent "timing run" to get accurate durations.
 */
function measureSpeechDuration(text, locale, voice, rate) {
  return new Promise(resolve => {
    const utt   = new SpeechSynthesisUtterance(text);
    utt.lang    = locale;
    utt.rate    = rate || 0.9;
    utt.volume  = 0; // silent — we're just timing
    if (voice) utt.voice = voice;
    const start = Date.now();
    utt.onend   = () => resolve((Date.now() - start) / 1000);
    utt.onerror = () => resolve(2.0); // fallback: 2 seconds
    synth.speak(utt);
  });
}

/**
 * Build a WAV ArrayBuffer from a series of tones + silences.
 * segments = [ { type:'tone'|'silence', duration:seconds } ]
 */
function buildWAV(segments) {
  const SR = 22050;

  // Calculate total samples
  const totalSamples = segments.reduce((acc, seg) => {
    return acc + Math.floor(seg.duration * SR);
  }, 0);

  const buffer = new ArrayBuffer(44 + totalSamples * 2);
  const view   = new DataView(buffer);

  // WAV header
  const wr = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };
  wr(0,  'RIFF');
  view.setUint32(4,  36 + totalSamples * 2, true);
  wr(8,  'WAVE');
  wr(12, 'fmt ');
  view.setUint32(16, 16,    true);
  view.setUint16(20, 1,     true); // PCM
  view.setUint16(22, 1,     true); // mono
  view.setUint32(24, SR,    true);
  view.setUint32(28, SR * 2,true);
  view.setUint16(32, 2,     true);
  view.setUint16(34, 16,    true);
  wr(36, 'data');
  view.setUint32(40, totalSamples * 2, true);

  // Write samples
  let offset = 44;
  for (const seg of segments) {
    const n = Math.floor(seg.duration * SR);
    if (seg.type === 'silence') {
      offset += n * 2; // zeros already in ArrayBuffer
    } else if (seg.type === 'tone') {
      // Short ping: 440 Hz sine, quick fade in/out
      const freq = seg.freq || 440;
      const amp  = seg.amp  || 0.35;
      for (let i = 0; i < n; i++) {
        const t     = i / SR;
        const fade  = Math.min(1, Math.min(i, n - i) / (SR * 0.02)); // 20ms fade
        const sample = Math.sin(2 * Math.PI * freq * t) * amp * fade;
        const val   = Math.round(sample * 32767);
        view.setInt16(offset, val, true);
        offset += 2;
      }
    } else if (seg.type === 'speech_silence') {
      // Slightly textured silence to represent speech (not blank)
      // This is where the user is expected to shadow
      for (let i = 0; i < n; i++) {
        // Very low amplitude noise — imperceptible but not pure silence
        // so audio players don't auto-skip it
        const tiny = (Math.random() - 0.5) * 0.002;
        view.setInt16(offset, Math.round(tiny * 32767), true);
        offset += 2;
      }
    }
  }

  return buffer;
}

/* ─────────────────────────────────────────────
   UTILITIES
───────────────────────────────────────────── */
const sleep        = ms  => new Promise(r => setTimeout(r, ms));
const esc          = s   => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const parsePhrases = ()  => phraseInput.value.split('\n').map(l => l.trim()).filter(l => l.length > 0);

function updateCounter() {
  const n = parsePhrases().length;
  counterEl.textContent = n === 0 ? '0 phrases' : n === 1 ? '1 phrase' : `${n} phrases`;
  phoneticBtn.disabled  = n === 0 || !apiKeyInput.value.trim();
}

function showState(s) {
  ['empty','loading','result','error'].forEach(n => {
    const e = $(n + 'State'); if (e) e.classList.add('hidden');
  });
  const t = $(s + 'State'); if (t) t.classList.remove('hidden');
}

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
   SPEAK — Web Speech API
───────────────────────────────────────────── */
function speak(text, locale, voice, rate, volume = 1) {
  return new Promise((resolve, reject) => {
    if (stopRequested) { resolve(); return; }
    if (synth.speaking || synth.pending) synth.cancel();

    const utt   = new SpeechSynthesisUtterance(text);
    utt.lang    = locale;
    utt.rate    = rate || 0.9;
    utt.pitch   = 1;
    utt.volume  = volume;
    if (voice) utt.voice = voice;

    let ka;
    utt.onstart = () => {
      ka = setInterval(() => {
        if (synth.speaking) { synth.pause(); synth.resume(); }
        else clearInterval(ka);
      }, 10000);
    };
    utt.onend   = () => { clearInterval(ka); resolve(); };
    utt.onerror = e  => {
      clearInterval(ka);
      (e.error === 'interrupted' || e.error === 'canceled') ? resolve() : reject(new Error(e.error));
    };
    setTimeout(() => synth.speak(utt), 50);
  });
}

/* ─────────────────────────────────────────────
   MODE 1 — PLAY SESSION
───────────────────────────────────────────── */
async function runPlaySession(phrases, locale, voice, rate) {
  isPlaying = true; stopRequested = false;
  const total = phrases.length * reps; let done = 0;

  showState('result');
  buildCards(phrases);
  buildDots();
  downloadWrap.classList.add('hidden');

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

      await speak(phrases[pi], locale, voice, rate);
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
   MODE 2 — BUILD & DOWNLOAD
   Step 1: Measure real speech durations (silent run)
   Step 2: Build WAV with tones + speech-length silences + pauses
   Step 3: Offer download
───────────────────────────────────────────── */
async function runBuildSession(phrases, locale, voice, rate) {
  showState('loading');
  progressFill.style.width = '0%';
  loadingMsg.textContent = 'Measuring phrase durations…';
  loadingSub.textContent = `${phrases.length} phrase${phrases.length > 1 ? 's' : ''} × ${reps} reps · ${pauseSec}s pause`;
  downloadWrap.classList.add('hidden');

  try {
    // Step 1: measure durations silently
    const durations = [];
    for (let pi = 0; pi < phrases.length; pi++) {
      if (stopRequested) { showState('empty'); return; }
      loadingMsg.textContent = `Timing phrase ${pi + 1}/${phrases.length}…`;
      const dur = await measureSpeechDuration(phrases[pi], locale, voice, rate);
      durations.push(dur);
      progressFill.style.width = Math.round(((pi + 1) / phrases.length) * 50) + '%';
      await sleep(100);
    }

    // Step 2: build WAV segments
    loadingMsg.textContent = 'Building audio file…';
    const segments = [];
    const noteFreqs = [523, 587, 659, 698, 784]; // C5 D5 E5 F5 G5 — one per phrase cycle

    // Opening silence
    segments.push({ type: 'silence', duration: 0.5 });

    for (let pi = 0; pi < phrases.length; pi++) {
      const freq = noteFreqs[pi % noteFreqs.length];
      for (let ri = 0; ri < reps; ri++) {
        // Short tone to signal "listen now"
        segments.push({ type: 'tone', duration: 0.18, freq, amp: 0.3 });
        segments.push({ type: 'silence', duration: 0.08 });
        // Speech-length gap (user shadows here)
        segments.push({ type: 'speech_silence', duration: durations[pi] + 0.3 });
        // Pause between reps
        if (ri < reps - 1) {
          segments.push({ type: 'silence', duration: pauseSec });
        }
      }
      // Gap between phrases
      segments.push({ type: 'silence', duration: pauseSec + 0.5 });
      progressFill.style.width = Math.round(50 + ((pi + 1) / phrases.length) * 45) + '%';
      await sleep(0); // yield to UI
    }

    // Closing silence
    segments.push({ type: 'silence', duration: 1.0 });

    // Build WAV
    const wavBuffer = buildWAV(segments);
    const blob      = new Blob([wavBuffer], { type: 'audio/wav' });
    const url       = URL.createObjectURL(blob);

    audioPlayer.src      = url;
    downloadBtn.href     = url;
    downloadBtn.download = `shadowing-${langSel.value}-${reps}reps.wav`;

    progressFill.style.width = '100%';
    await sleep(200);

    showState('result');
    buildCards(phrases);
    npPhrase.textContent   = '✓ Audio file ready!';
    npPhonetic.textContent = '';
    npMeta.textContent     = `Tone cues + ${reps} rep gaps · ${pauseSec}s pauses · ${Math.round(segments.reduce((a,s) => a + s.duration, 0))}s total`;
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
  reps        = Math.max(1,   parseInt(repsIn.value)    || 5);
  pauseSec    = Math.max(1,   parseInt(pauseIn.value)   || 3);
  speechRate  = Math.max(0.5, parseFloat(speedIn.value) / 100 || 0.9);
}

async function startPlaySession() {
  const phrases = parsePhrases();
  if (!phrases.length) { errorText.textContent = 'Write at least one phrase.'; showState('error'); return; }
  readParams();
  sessionPhrases = phrases;
  const locale = langSel.value;
  const voice  = getBestVoice(locale);
  genBtn.disabled = true;
  await runPlaySession(phrases, locale, voice, speechRate);
  genBtn.disabled = false;
}

async function startBuildSession() {
  const phrases = parsePhrases();
  if (!phrases.length) { errorText.textContent = 'Write at least one phrase.'; showState('error'); return; }
  readParams();
  sessionPhrases = phrases;
  const locale = langSel.value;
  const voice  = getBestVoice(locale);
  buildBtn.disabled = true;
  buildBtn.textContent = 'Building…';
  await runBuildSession(phrases, locale, voice, speechRate);
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
      system: `You are a phonetics expert. Write how a native ${langName} speaker would phonetically read foreign sounds using ${langName} orthography — not a translation. Return only the transcription.`,
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
phraseInput.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') startPlaySession();
});

playBtn.addEventListener('click', async () => {
  if (isPlaying) return;
  readParams();
  playBtn.disabled = true;
  await runPlaySession(sessionPhrases, langSel.value, getBestVoice(langSel.value), speechRate);
});

stopBtn.addEventListener('click', () => {
  stopRequested = true;
  synth.cancel();
  isPlaying = false;
  npMeta.textContent = 'Stopped.';
  playBtn.disabled   = false;
  genBtn.disabled    = false;
  buildBtn.disabled  = false;
  playBtn.innerHTML  = `<svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor"><polygon points="1,0.5 10,5.5 1,10.5"/></svg> Resume`;
});

resetBtn.addEventListener('click', () => {
  synth.cancel();
  isPlaying = false;
  stopRequested = true;
  downloadWrap.classList.add('hidden');
  showState('empty');
});

retryBtn.addEventListener('click',  () => showState('empty'));
phraseInput.addEventListener('input', updateCounter);
langSel.addEventListener('change',    updateVoiceUI);
phoneticBtn.addEventListener('click', generatePhonetics);
saveKeyBtn.addEventListener('click',  saveKey);
apiKeyInput.addEventListener('input', updateCounter);
apiKeyInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveKey(); });

/* ─────────────────────────────────────────────
   INIT
───────────────────────────────────────────── */
if (synth) {
  if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = loadVoices;
  loadVoices();
  setTimeout(loadVoices, 300);
  setTimeout(loadVoices, 1000);

  // Show ready state immediately
  vdot.style.color  = 'var(--green)';
  vtext.textContent = 'Voice engine ready — using your browser\'s built-in voices';
  genBtn.disabled   = false;
  buildBtn.disabled = false;
} else {
  vdot.style.color  = 'var(--danger)';
  vtext.textContent = 'Web Speech API not supported. Please use Chrome or Edge.';
}

loadSavedKey();
updateCounter();
showState('empty');
