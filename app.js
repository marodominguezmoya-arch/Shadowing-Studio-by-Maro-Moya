/**
 * Shadowing Studio — app.js
 *
 * Features:
 *  - Optimised voice selection per language (OS-native first, ranked preferences)
 *  - Voice quality indicator
 *  - Chrome keep-alive workaround for long pauses
 *  - AI phonetic transcription in any language via Claude API
 *  - API key persisted in localStorage
 */

'use strict';

/* ─────────────────────────────────────────────
   DOM references
───────────────────────────────────────────── */
const $ = id => document.getElementById(id);

const phraseInput   = $('phraseInput');
const langSel       = $('langSel');
const voiceSel      = $('voiceSel');
const repsIn        = $('repsIn');
const pauseIn       = $('pauseIn');
const rateIn        = $('rateIn');
const genBtn        = $('genBtn');
const counterEl     = $('counter');
const vdot          = $('vdot');
const vtext         = $('vtext');
const apiKeyInput   = $('apiKey');
const saveKeyBtn    = $('saveKeyBtn');
const phoneticBtn   = $('phoneticBtn');
const phonLangSel   = $('phonLangSel');
const phoneticResults = $('phoneticResults');

const loadingMsg    = $('loadingMsg');
const loadingSub    = $('loadingSub');
const progressFill  = $('progressFill');
const phraseList    = $('phraseList');
const npPhrase      = $('npPhrase');
const npPhonetic    = $('npPhonetic');
const npMeta        = $('npMeta');
const repDots       = $('repDots');
const playBtn       = $('playBtn');
const stopBtn       = $('stopBtn');
const resetBtn      = $('resetBtn');
const retryBtn      = $('retryBtn');
const errorText     = $('errorText');

/* ─────────────────────────────────────────────
   State
───────────────────────────────────────────── */
const synth = window.speechSynthesis;
let voices         = [];
let sessionPhrases = [];
let phoneticCache  = {}; // phrase → transcription string
let reps = 5, pauseSec = 3, speechRate = 0.9;
let isPlaying = false, stopRequested = false;

/* ─────────────────────────────────────────────
   VOICE PREFERENCE TABLE
   Ordered from best to fallback for each lang code.
   Covers: macOS, Windows, iOS/Android, Chrome built-ins.
───────────────────────────────────────────── */
const VOICE_PREFS = {
  // Spanish — Monica (macOS), Paulina (macOS MX), Diego (macOS AR)
  es: ['Monica','Paulina','Diego','Marisol','Jorge','Google español de Estados Unidos',
       'Google español','Microsoft Helena','Microsoft Laura','Microsoft Pablo','Microsoft Sabina'],

  // French — Thomas (macOS), Amelie (macOS CA), Marie (macOS)
  fr: ['Thomas','Amelie','Marie','Google français','Microsoft Julie','Microsoft Henri',
       'Microsoft Guillaume','Microsoft Hortense'],

  // English — Samantha (macOS), Daniel (macOS UK), Karen (macOS AU)
  en: ['Samantha','Daniel','Karen','Moira','Tessa','Google US English',
       'Google UK English Female','Google UK English Male',
       'Microsoft Zira','Microsoft David','Microsoft Hazel','Microsoft Susan'],

  // German — Anna (macOS), Yannick (macOS)
  de: ['Anna','Yannick','Google Deutsch','Microsoft Hedda','Microsoft Stefan','Microsoft Katja'],

  // Italian — Alice (macOS), Luca (macOS)
  it: ['Alice','Luca','Google italiano','Microsoft Elsa','Microsoft Cosimo'],

  // Portuguese — Joana (macOS PT), Luciana (macOS BR), Felipe (macOS BR)
  pt: ['Joana','Luciana','Felipe','Google português do Brasil','Google português',
       'Microsoft Helia','Microsoft Maria','Microsoft Daniel'],

  // Dutch — Xander (macOS)
  nl: ['Xander','Google Nederlands','Microsoft Frank','Microsoft Hanneke'],

  // Swedish — Alva (macOS)
  sv: ['Alva','Google svenska','Microsoft Bengt','Microsoft Hedvig'],

  // Norwegian — Nora (macOS)
  nb: ['Nora','Google norsk','Microsoft Jon'],
  no: ['Nora','Google norsk','Microsoft Jon'],

  // Danish — Sara (macOS)
  da: ['Sara','Google dansk','Microsoft Helle'],

  // Finnish — Satu (macOS)
  fi: ['Satu','Google suomi','Microsoft Heidi'],

  // Russian — Milena (macOS), Yuri (macOS)
  ru: ['Milena','Yuri','Google русский','Microsoft Irina','Microsoft Pavel'],

  // Polish — Zosia (macOS)
  pl: ['Zosia','Google polski','Microsoft Paulina'],

  // Czech
  cs: ['Zuzana','Google čeština','Microsoft Jakub'],

  // Romanian
  ro: ['Ioana','Google română','Microsoft Andrei'],

  // Hungarian
  hu: ['Mariska','Google magyar','Microsoft Szabolcs'],

  // Greek — Melina (macOS)
  el: ['Melina','Google ελληνικά','Microsoft Stefanos'],

  // Turkish — Yelda (macOS)
  tr: ['Yelda','Google Türkçe','Microsoft Tolga'],

  // Arabic — Maged (macOS)
  ar: ['Maged','Google العربية','Microsoft Naayf','Microsoft Hoda'],

  // Hebrew — Carmit (macOS)
  he: ['Carmit','Google עברית','Microsoft Asaf'],

  // Hindi — Lekha (macOS)
  hi: ['Lekha','Google हिन्दी','Microsoft Kalpana','Microsoft Hemant'],

  // Japanese — Kyoko (macOS), Otoya (macOS)
  ja: ['Kyoko','Otoya','Google 日本語','Microsoft Ichiro','Microsoft Haruka'],

  // Korean — Yuna (macOS)
  ko: ['Yuna','Google 한국의','Microsoft Heami'],

  // Chinese Mandarin — Ting-Ting (macOS), Mei-Jia (macOS TW)
  zh: ['Ting-Ting','Mei-Jia','Google 普通话（中国大陆）','Google 國語（臺灣）',
       'Microsoft Huihui','Microsoft Yaoyao','Microsoft Tracy'],

  // Thai — Kanya (macOS)
  th: ['Kanya','Google ภาษาไทย'],

  // Vietnamese
  vi: ['Google Tiếng Việt','Microsoft An'],

  // Indonesian
  id: ['Google Bahasa Indonesia','Microsoft Andika'],

  // Malay
  ms: ['Google Bahasa Melayu'],

  // Swahili
  sw: ['Google Swahili'],

  // Afrikaans
  af: ['Google Afrikaans'],

  // Ukrainian
  uk: ['Lesya','Google українська','Microsoft Ostap'],

  // Croatian
  hr: ['Lana','Google hrvatski','Microsoft Matej'],

  // Slovak
  sk: ['Laura','Google slovenčina','Microsoft Filip'],

  // Catalan
  ca: ['Montserrat','Google català','Microsoft Herena'],

  // Persian/Farsi
  fa: ['Google فارسی'],

  // Bengali
  bn: ['Google বাংলা'],

  // Urdu
  ur: ['Google اردو'],
};

/* ─────────────────────────────────────────────
   VOICE QUALITY RATING
───────────────────────────────────────────── */
function rateVoiceQuality(voice) {
  if (!voice) return 'none';
  const n = voice.name.toLowerCase();
  // Local OS voices (macOS, Windows SAPI) are highest quality
  if (voice.localService) return 'high';
  // Google built-in voices in Chrome are very good
  if (n.includes('google')) return 'high';
  // Microsoft Online (Neural) voices
  if (n.includes('online') || n.includes('natural')) return 'high';
  // Standard Microsoft voices
  if (n.includes('microsoft')) return 'medium';
  return 'medium';
}

function updateVoiceBar(voice) {
  if (!voice) {
    vdot.style.color = 'var(--faint)';
    vtext.textContent = 'No voice available for this language in your browser.';
    return;
  }
  const q = rateVoiceQuality(voice);
  const config = {
    high:   { color: 'var(--green)', label: `High quality — ${voice.localService ? 'OS native voice' : 'Google / Neural'}` },
    medium: { color: 'var(--amber)', label: `Standard quality — ${voice.name.split(' ').slice(0,2).join(' ')}` },
    none:   { color: 'var(--faint)', label: 'Quality unknown' },
  };
  const c = config[q] || config.none;
  vdot.style.color = c.color;
  vtext.textContent = `${c.label} · ${voice.lang}`;
}

/* ─────────────────────────────────────────────
   VOICE LOADING & FILTERING
───────────────────────────────────────────── */
function loadVoices() {
  const raw = synth.getVoices();
  if (!raw.length) return; // not ready yet

  // Sort: local first, then alphabetical by name
  voices = [...raw].sort((a, b) => {
    if (a.localService && !b.localService) return -1;
    if (!a.localService && b.localService) return 1;
    return a.name.localeCompare(b.name);
  });

  filterVoicesForLang(langSel.value);
}

function langCode(locale) {
  return locale.split('-')[0].toLowerCase();
}

function getBestVoice(locale) {
  const code = langCode(locale);
  const pool = voices.filter(v => v.lang.toLowerCase().startsWith(code));
  if (!pool.length) return null;

  const prefs = VOICE_PREFS[code] || [];
  for (const pref of prefs) {
    const found = pool.find(v => v.name.includes(pref));
    if (found) return found;
  }
  // Fallback: best local, then first available
  return pool.find(v => v.localService) || pool[0];
}

function filterVoicesForLang(locale) {
  const code = langCode(locale);
  const pool = voices.filter(v => v.lang.toLowerCase().startsWith(code));

  voiceSel.innerHTML = '';

  if (!pool.length) {
    voiceSel.innerHTML = '<option value="">— Default system voice —</option>';
    updateVoiceBar(null);
    return;
  }

  // Sort pool: preferred voices at top, then local, then rest
  const prefs = VOICE_PREFS[code] || [];
  const sorted = [...pool].sort((a, b) => {
    const ai = prefs.findIndex(p => a.name.includes(p));
    const bi = prefs.findIndex(p => b.name.includes(p));
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    if (a.localService && !b.localService) return -1;
    if (!a.localService && b.localService) return 1;
    return a.name.localeCompare(b.name);
  });

  sorted.forEach(v => {
    const o   = document.createElement('option');
    o.value   = v.name;
    const q   = rateVoiceQuality(v);
    const star = q === 'high' ? '★ ' : q === 'medium' ? '◆ ' : '○ ';
    const clean = v.name.replace(/Microsoft |Google /g, '').trim();
    const tag   = v.localService ? ' (local)' : '';
    o.textContent = star + clean + tag;
    voiceSel.appendChild(o);
  });

  // Auto-select best
  const best = getBestVoice(locale);
  if (best) voiceSel.value = best.name;

  updateVoiceBar(getSelectedVoice());
}

function getSelectedVoice() {
  return voices.find(v => v.name === voiceSel.value) || null;
}

/* ─────────────────────────────────────────────
   PHRASE PARSING
───────────────────────────────────────────── */
function parsePhrases() {
  return phraseInput.value.split('\n').map(l => l.trim()).filter(l => l.length > 0);
}

function updateCounter() {
  const n = parsePhrases().length;
  counterEl.textContent = n === 0 ? '0 phrases' : n === 1 ? '1 phrase' : `${n} phrases`;
  // Enable phonetic button only if there are phrases AND an API key
  phoneticBtn.disabled = (n === 0 || !apiKeyInput.value.trim());
}

/* ─────────────────────────────────────────────
   STATE MANAGEMENT
───────────────────────────────────────────── */
function showState(s) {
  ['empty', 'loading', 'result', 'error'].forEach(n => {
    const el = $(n + 'State');
    if (el) el.classList.add('hidden');
  });
  const target = $(s + 'State');
  if (target) target.classList.remove('hidden');
}

/* ─────────────────────────────────────────────
   SPEECH SYNTHESIS
   — Fixes: Chrome requires cancel() before new utterance
            after a pause, and needs keep-alive pings.
───────────────────────────────────────────── */
const sleep = ms => new Promise(r => setTimeout(r, ms));

function speak(text, locale, voice, rate) {
  return new Promise((resolve, reject) => {
    if (stopRequested) { resolve(); return; }

    // Chrome bug: cancel any stale utterance before speaking
    if (synth.speaking || synth.pending) synth.cancel();

    const utt   = new SpeechSynthesisUtterance(text);
    utt.lang    = locale;
    utt.rate    = rate || 0.9;
    utt.pitch   = 1;
    utt.volume  = 1;
    if (voice) utt.voice = voice;

    let keepAlive;

    const cleanup = () => {
      clearInterval(keepAlive);
    };

    utt.onstart = () => {
      // Chrome stop-speaking bug: resume every 10s
      keepAlive = setInterval(() => {
        if (synth.speaking) { synth.pause(); synth.resume(); }
        else                { clearInterval(keepAlive); }
      }, 10000);
    };

    utt.onend = () => {
      cleanup();
      resolve();
    };

    utt.onerror = e => {
      cleanup();
      if (e.error === 'interrupted' || e.error === 'canceled') {
        resolve();
      } else {
        reject(new Error(`Speech error: ${e.error}`));
      }
    };

    // Small delay ensures Chrome has flushed previous utterance
    setTimeout(() => synth.speak(utt), 50);
  });
}

/* ─────────────────────────────────────────────
   UI BUILDERS
───────────────────────────────────────────── */
function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function buildDots() {
  repDots.innerHTML = '';
  for (let i = 0; i < reps; i++) {
    const d = document.createElement('div');
    d.className = 'dot';
    d.id = `dot_${i}`;
    repDots.appendChild(d);
  }
}

function updateDots(cur) {
  for (let i = 0; i < reps; i++) {
    const d = $(`dot_${i}`);
    if (!d) continue;
    d.className = 'dot';
    if (i < cur)       d.classList.add('done');
    else if (i === cur) d.classList.add('active');
  }
}

function buildCards(phrases) {
  phraseList.innerHTML = '';
  phrases.forEach((p, i) => {
    const cached = phoneticCache[p];
    const lang   = phonLangSel.value.toUpperCase();
    const c      = document.createElement('div');
    c.className  = 'pcard';
    c.id         = `pc_${i}`;
    c.innerHTML  = `
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

function updateCards(activeIdx) {
  document.querySelectorAll('.pcard').forEach((c, i) => {
    c.className = 'pcard';
    if (i < activeIdx) c.classList.add('done');
    if (i === activeIdx) c.classList.add('active');
  });
}

/* ─────────────────────────────────────────────
   SESSION RUNNER
───────────────────────────────────────────── */
async function runSession(phrases, locale, voice, rate) {
  isPlaying = true;
  stopRequested = false;
  const total = phrases.length * reps;
  let done = 0;

  showState('result');
  buildCards(phrases);
  buildDots();

  for (let pi = 0; pi < phrases.length; pi++) {
    if (stopRequested) break;
    updateCards(pi);
    npPhrase.textContent   = phrases[pi];
    npPhonetic.textContent = phoneticCache[phrases[pi]] || '';

    for (let ri = 0; ri < reps; ri++) {
      if (stopRequested) break;
      updateDots(ri);
      npMeta.textContent = `Phrase ${pi + 1} / ${phrases.length}  ·  Rep. ${ri + 1} / ${reps}`;

      const repEl = $(`pr_${pi}`);
      if (repEl) repEl.textContent = `${ri + 1}/${reps}`;

      await speak(phrases[pi], locale, voice, rate);
      done++;
      progressFill.style.width = Math.round((done / total) * 100) + '%';

      if (ri < reps - 1) {
        npMeta.textContent = `⏸ Pause ${pauseSec}s…`;
        await sleep(pauseSec * 1000);
      }
    }

    if (!stopRequested && pi < phrases.length - 1) {
      npMeta.textContent = '⏸ Next phrase…';
      await sleep(900);
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

async function startSession() {
  const phrases = parsePhrases();

  if (!phrases.length) {
    errorText.textContent = 'Write at least one phrase before starting.';
    showState('error');
    return;
  }
  if (!synth) {
    errorText.textContent = 'Your browser does not support Web Speech API. Please use Chrome or Edge.';
    showState('error');
    return;
  }

  reps        = Math.max(1, parseInt(repsIn.value)   || 5);
  pauseSec    = Math.max(1, parseInt(pauseIn.value)  || 3);
  speechRate  = Math.max(0.5, parseFloat(rateIn.value) || 0.9);
  sessionPhrases = phrases;

  const locale = langSel.value;
  const voice  = getSelectedVoice();

  showState('loading');
  loadingMsg.textContent = 'Preparing shadowing session…';
  loadingSub.textContent = `${phrases.length} phrase${phrases.length > 1 ? 's' : ''} · ${reps} reps · ${pauseSec}s pause`;
  progressFill.style.width = '12%';
  await sleep(500);
  progressFill.style.width = '55%';
  await sleep(350);
  progressFill.style.width = '100%';
  await sleep(180);

  await runSession(phrases, locale, voice, speechRate);
}

/* ─────────────────────────────────────────────
   PHONETIC TRANSCRIPTION VIA CLAUDE API
───────────────────────────────────────────── */

/**
 * Full language name map for the system prompt.
 */
const LANG_NAMES = {
  fr: 'French', es: 'Spanish', en: 'English', de: 'German',
  it: 'Italian', pt: 'Portuguese', nl: 'Dutch', pl: 'Polish',
  ru: 'Russian', tr: 'Turkish', sv: 'Swedish', nb: 'Norwegian',
  ar: 'Arabic', ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
};

/**
 * Calls Claude API to get phonetic transcription for a single phrase.
 * Returns the transcription string.
 */
async function getPhoneticFromClaude(phrase, targetLang, apiKey) {
  const langName = LANG_NAMES[targetLang] || targetLang;
  const spokenLang = langSel.options[langSel.selectedIndex].text.replace(/[🇦-🇿]{2}\s*/u, '').trim();

  const systemPrompt = `You are a phonetics expert. Your task is to write a phonetic transcription of foreign-language phrases, showing exactly how a native ${langName} speaker would *read* those sounds using ${langName} orthography and pronunciation rules — not a translation, just a phonetic approximation. Keep it concise. Return only the phonetic transcription, nothing else, no explanations, no punctuation around it.`;

  const userPrompt = `Phrase in ${spokenLang}: "${phrase}"
Write how a native ${langName} speaker would phonetically read this phrase using ${langName} sounds and spelling conventions.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
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
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${response.status}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text?.trim() || '';
}

/**
 * Renders a loading placeholder for a phrase card in the phonetic results area.
 */
function renderPhoneticItem(phrase, state, text) {
  const existing = document.querySelector(`.ph-item[data-phrase="${CSS.escape(phrase)}"]`);
  if (existing) existing.remove();

  const div = document.createElement('div');
  div.className = 'ph-item';
  div.dataset.phrase = phrase;

  if (state === 'loading') {
    div.innerHTML = `
      <div class="ph-original">${esc(phrase)}</div>
      <div class="ph-loading"><div class="spin"></div> Generating…</div>`;
  } else if (state === 'done') {
    div.innerHTML = `
      <div class="ph-original">${esc(phrase)}</div>
      <div class="ph-transcription">${esc(text)}</div>`;
  } else if (state === 'error') {
    div.innerHTML = `
      <div class="ph-original">${esc(phrase)}</div>
      <div class="ph-error">Error: ${esc(text)}</div>`;
  }

  phoneticResults.appendChild(div);
}

/**
 * Main phonetic generation handler.
 * Processes phrases one-by-one, updating the UI progressively.
 */
async function generatePhonetics() {
  const phrases = parsePhrases();
  const apiKey  = apiKeyInput.value.trim();
  const targetLang = phonLangSel.value;

  if (!phrases.length) return;
  if (!apiKey) {
    phoneticResults.innerHTML = `<div class="ph-error" style="padding:8px 11px;border-radius:var(--radius)">Please enter your Claude API key in the header.</div>`;
    return;
  }

  phoneticBtn.disabled = true;
  phoneticResults.innerHTML = '';

  // Clear cache for current run so we regenerate fresh
  phoneticCache = {};

  for (const phrase of phrases) {
    renderPhoneticItem(phrase, 'loading', '');

    try {
      const transcription = await getPhoneticFromClaude(phrase, targetLang, apiKey);
      phoneticCache[phrase] = transcription;
      renderPhoneticItem(phrase, 'done', transcription);

      // Also update any open session cards
      const idx = sessionPhrases.indexOf(phrase);
      if (idx !== -1) {
        const pph = $(`pph_${idx}`);
        if (pph) {
          pph.innerHTML = `<span class="pcard-ph-lang">${targetLang.toUpperCase()}</span>${esc(transcription)}`;
          pph.classList.add('show');
        }
      }
      // Update now-playing if this phrase is active
      if (npPhrase.textContent === phrase) {
        npPhonetic.textContent = transcription;
      }

    } catch (err) {
      renderPhoneticItem(phrase, 'error', err.message);
    }
  }

  phoneticBtn.disabled = false;
}

/* ─────────────────────────────────────────────
   API KEY PERSISTENCE
───────────────────────────────────────────── */
function loadSavedKey() {
  const saved = localStorage.getItem('shadowing_api_key');
  if (saved) {
    apiKeyInput.value = saved;
    updateCounter(); // re-evaluate phonetic button
  }
}

function saveKey() {
  const key = apiKeyInput.value.trim();
  if (key) {
    localStorage.setItem('shadowing_api_key', key);
    saveKeyBtn.textContent = 'Saved ✓';
    setTimeout(() => { saveKeyBtn.textContent = 'Save'; }, 1800);
  } else {
    localStorage.removeItem('shadowing_api_key');
    saveKeyBtn.textContent = 'Cleared';
    setTimeout(() => { saveKeyBtn.textContent = 'Save'; }, 1800);
  }
}

/* ─────────────────────────────────────────────
   EVENT LISTENERS
───────────────────────────────────────────── */

// Start session
genBtn.addEventListener('click', startSession);

// Ctrl+Enter shortcut from textarea
phraseInput.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') startSession();
});

// Play (repeat) button
playBtn.addEventListener('click', async () => {
  if (isPlaying) return;
  reps       = Math.max(1, parseInt(repsIn.value)    || 5);
  pauseSec   = Math.max(1, parseInt(pauseIn.value)   || 3);
  speechRate = Math.max(0.5, parseFloat(rateIn.value) || 0.9);
  buildDots();
  progressFill.style.width = '0%';
  playBtn.disabled = true;
  await runSession(sessionPhrases, langSel.value, getSelectedVoice(), speechRate);
});

// Stop
stopBtn.addEventListener('click', () => {
  stopRequested = true;
  synth.cancel();
  isPlaying = false;
  npMeta.textContent = 'Stopped.';
  playBtn.disabled = false;
  playBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor"><polygon points="1,0.5 10,5.5 1,10.5"/></svg> Resume`;
});

// Reset
resetBtn.addEventListener('click', () => {
  synth.cancel();
  isPlaying = false;
  stopRequested = true;
  progressFill.style.width = '0%';
  showState('empty');
});

// Error retry
retryBtn.addEventListener('click', () => showState('empty'));

// Phrase counter update
phraseInput.addEventListener('input', updateCounter);

// Language change → filter voices
langSel.addEventListener('change', () => filterVoicesForLang(langSel.value));

// Voice selection change → update quality bar
voiceSel.addEventListener('change', () => updateVoiceBar(getSelectedVoice()));

// Phonetics
phoneticBtn.addEventListener('click', generatePhonetics);

// API key
saveKeyBtn.addEventListener('click', saveKey);
apiKeyInput.addEventListener('input', updateCounter);
apiKeyInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') saveKey();
});

/* ─────────────────────────────────────────────
   INIT
───────────────────────────────────────────── */

// Load voices — Chrome fires onvoiceschanged, Firefox/Safari load synchronously
if (synth.onvoiceschanged !== undefined) {
  synth.onvoiceschanged = loadVoices;
}
// Also try immediately (works on Firefox + Safari) and after a delay (Chrome fallback)
loadVoices();
setTimeout(loadVoices, 300);
setTimeout(loadVoices, 1000); // extra fallback for slow systems

loadSavedKey();
updateCounter();
showState('empty');
