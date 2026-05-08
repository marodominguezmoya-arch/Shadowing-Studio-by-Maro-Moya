/**
 * Shadowing Studio — app.js
 * Features: optimised voices, AI phonetics, audio recording + download
 */
'use strict';

const $ = id => document.getElementById(id);

/* ── DOM ── */
const phraseInput     = $('phraseInput');
const langSel         = $('langSel');
const voiceSel        = $('voiceSel');
const repsIn          = $('repsIn');
const pauseIn         = $('pauseIn');
const rateIn          = $('rateIn');
const genBtn          = $('genBtn');
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
const recordingBadge  = $('recordingBadge');

/* ── State ── */
const synth = window.speechSynthesis;
let voices = [], sessionPhrases = [], phoneticCache = {};
let reps = 5, pauseSec = 3, speechRate = 0.9;
let isPlaying = false, stopRequested = false;
let mediaRecorder = null, recordedChunks = [], audioStream = null, lastAudioURL = null;

/* ─────────────────────────────────────────────
   VOICE PREFERENCES
───────────────────────────────────────────── */
const VOICE_PREFS = {
  es: ['Monica','Paulina','Diego','Marisol','Jorge','Google español de Estados Unidos','Google español','Microsoft Helena','Microsoft Laura','Microsoft Pablo','Microsoft Sabina'],
  fr: ['Thomas','Amelie','Marie','Google français','Microsoft Julie','Microsoft Henri','Microsoft Guillaume','Microsoft Hortense'],
  en: ['Samantha','Daniel','Karen','Moira','Tessa','Google US English','Google UK English Female','Google UK English Male','Microsoft Zira','Microsoft David','Microsoft Hazel','Microsoft Susan'],
  de: ['Anna','Yannick','Google Deutsch','Microsoft Hedda','Microsoft Stefan','Microsoft Katja'],
  it: ['Alice','Luca','Google italiano','Microsoft Elsa','Microsoft Cosimo'],
  pt: ['Joana','Luciana','Felipe','Google português do Brasil','Google português','Microsoft Helia','Microsoft Maria','Microsoft Daniel'],
  nl: ['Xander','Google Nederlands','Microsoft Frank','Microsoft Hanneke'],
  sv: ['Alva','Google svenska','Microsoft Bengt','Microsoft Hedvig'],
  nb: ['Nora','Google norsk','Microsoft Jon'], no: ['Nora','Google norsk','Microsoft Jon'],
  da: ['Sara','Google dansk','Microsoft Helle'],
  fi: ['Satu','Google suomi','Microsoft Heidi'],
  ru: ['Milena','Yuri','Google русский','Microsoft Irina','Microsoft Pavel'],
  pl: ['Zosia','Google polski','Microsoft Paulina'],
  cs: ['Zuzana','Google čeština','Microsoft Jakub'],
  ro: ['Ioana','Google română','Microsoft Andrei'],
  hu: ['Mariska','Google magyar','Microsoft Szabolcs'],
  el: ['Melina','Google ελληνικά','Microsoft Stefanos'],
  tr: ['Yelda','Google Türkçe','Microsoft Tolga'],
  ar: ['Maged','Google العربية','Microsoft Naayf','Microsoft Hoda'],
  he: ['Carmit','Google עברית','Microsoft Asaf'],
  hi: ['Lekha','Google हिन्दी','Microsoft Kalpana','Microsoft Hemant'],
  ja: ['Kyoko','Otoya','Google 日本語','Microsoft Ichiro','Microsoft Haruka'],
  ko: ['Yuna','Google 한국의','Microsoft Heami'],
  zh: ['Ting-Ting','Mei-Jia','Google 普通话（中国大陆）','Google 國語（臺灣）','Microsoft Huihui','Microsoft Yaoyao','Microsoft Tracy'],
  th: ['Kanya','Google ภาษาไทย'],
  vi: ['Google Tiếng Việt','Microsoft An'],
  id: ['Google Bahasa Indonesia','Microsoft Andika'],
  ms: ['Google Bahasa Melayu'], sw: ['Google Swahili'], af: ['Google Afrikaans'],
  uk: ['Lesya','Google українська','Microsoft Ostap'],
  hr: ['Lana','Google hrvatski','Microsoft Matej'],
  sk: ['Laura','Google slovenčina','Microsoft Filip'],
  ca: ['Montserrat','Google català','Microsoft Herena'],
  fa: ['Google فارسی'], bn: ['Google বাংলা'], ur: ['Google اردو'],
};

/* ── Voice quality ── */
function rateVoiceQuality(v) {
  if (!v) return 'none';
  const n = v.name.toLowerCase();
  if (v.localService) return 'high';
  if (n.includes('google')) return 'high';
  if (n.includes('online') || n.includes('natural')) return 'high';
  if (n.includes('microsoft')) return 'medium';
  return 'medium';
}

function updateVoiceBar(v) {
  if (!v) { vdot.style.color='var(--faint)'; vtext.textContent='No voice available.'; return; }
  const q = rateVoiceQuality(v);
  const cfg = {
    high:   { color:'var(--green)', label:`High quality — ${v.localService?'OS native voice':'Google / Neural'}` },
    medium: { color:'var(--amber)', label:`Standard quality — ${v.name.split(' ').slice(0,2).join(' ')}` },
    none:   { color:'var(--faint)', label:'Quality unknown' },
  };
  const c = cfg[q]||cfg.none;
  vdot.style.color = c.color;
  vtext.textContent = `${c.label} · ${v.lang}`;
}

/* ── Voice loading ── */
function loadVoices() {
  const raw = synth.getVoices();
  if (!raw.length) return;
  voices = [...raw].sort((a,b) => {
    if (a.localService && !b.localService) return -1;
    if (!a.localService && b.localService) return 1;
    return a.name.localeCompare(b.name);
  });
  filterVoicesForLang(langSel.value);
}

const langCode = locale => locale.split('-')[0].toLowerCase();

function getBestVoice(locale) {
  const code = langCode(locale);
  const pool = voices.filter(v => v.lang.toLowerCase().startsWith(code));
  if (!pool.length) return null;
  for (const pref of (VOICE_PREFS[code]||[])) {
    const found = pool.find(v => v.name.includes(pref));
    if (found) return found;
  }
  return pool.find(v => v.localService) || pool[0];
}

function filterVoicesForLang(locale) {
  const code = langCode(locale);
  const pool = voices.filter(v => v.lang.toLowerCase().startsWith(code));
  voiceSel.innerHTML = '';
  if (!pool.length) { voiceSel.innerHTML='<option value="">— Default system voice —</option>'; updateVoiceBar(null); return; }
  const prefs = VOICE_PREFS[code]||[];
  [...pool].sort((a,b) => {
    const ai=prefs.findIndex(p=>a.name.includes(p)), bi=prefs.findIndex(p=>b.name.includes(p));
    if (ai!==-1&&bi!==-1) return ai-bi;
    if (ai!==-1) return -1; if (bi!==-1) return 1;
    if (a.localService&&!b.localService) return -1;
    if (!a.localService&&b.localService) return 1;
    return a.name.localeCompare(b.name);
  }).forEach(v => {
    const o=document.createElement('option'); o.value=v.name;
    const q=rateVoiceQuality(v), star=q==='high'?'★ ':q==='medium'?'◆ ':'○ ';
    o.textContent=star+v.name.replace(/Microsoft |Google /g,'').trim()+(v.localService?' (local)':'');
    voiceSel.appendChild(o);
  });
  const best=getBestVoice(locale); if (best) voiceSel.value=best.name;
  updateVoiceBar(getSelectedVoice());
}

const getSelectedVoice = () => voices.find(v=>v.name===voiceSel.value)||null;

/* ── Phrases ── */
const parsePhrases = () => phraseInput.value.split('\n').map(l=>l.trim()).filter(l=>l.length>0);

function updateCounter() {
  const n=parsePhrases().length;
  counterEl.textContent=n===0?'0 phrases':n===1?'1 phrase':`${n} phrases`;
  phoneticBtn.disabled=(n===0||!apiKeyInput.value.trim());
}

/* ── States ── */
function showState(s) {
  ['empty','loading','result','error'].forEach(n=>{ const e=$(n+'State'); if(e) e.classList.add('hidden'); });
  const t=$(s+'State'); if(t) t.classList.remove('hidden');
}

/* ─────────────────────────────────────────────
   AUDIO RECORDING
   Strategy: capture system audio via getDisplayMedia.
   Chrome 74+ supports tab audio capture with "Share tab audio" checkbox.
   If denied/unavailable, we skip silently and show a notice.
───────────────────────────────────────────── */
async function startRecording() {
  recordedChunks = [];
  try {
    // Ask user to share tab audio
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'browser', width: 1, height: 1, frameRate: 1 },
      audio: { suppressLocalAudioPlayback: false },
      selfBrowserSurface: 'include',
      systemAudio: 'include',
      preferCurrentTab: true,
    });

    // Drop video tracks — we only want audio
    stream.getVideoTracks().forEach(t => t.stop());
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) { stream.getTracks().forEach(t=>t.stop()); return false; }

    audioStream = new MediaStream(audioTracks);

    const mimeType = ['audio/webm;codecs=opus','audio/webm','audio/ogg']
      .find(m => MediaRecorder.isTypeSupported(m)) || '';

    mediaRecorder = new MediaRecorder(audioStream, mimeType ? { mimeType } : {});
    mediaRecorder.ondataavailable = e => { if (e.data?.size>0) recordedChunks.push(e.data); };
    mediaRecorder.start(200);
    recordingBadge.classList.remove('hidden');
    return true;
  } catch (e) {
    // User cancelled or browser doesn't support — fail silently
    console.info('Recording skipped:', e.message);
    return false;
  }
}

function stopRecording() {
  return new Promise(resolve => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') { resolve(null); return; }
    mediaRecorder.onstop = () => {
      const mime = mediaRecorder.mimeType || 'audio/webm';
      const blob = new Blob(recordedChunks, { type: mime });
      recordedChunks = []; mediaRecorder = null;
      if (audioStream) { audioStream.getTracks().forEach(t=>t.stop()); audioStream=null; }
      recordingBadge.classList.add('hidden');
      resolve(blob.size > 2000 ? blob : null); // ignore empty blobs
    };
    mediaRecorder.stop();
  });
}

function showDownloadButton(blob) {
  if (!blob) return;
  if (lastAudioURL) URL.revokeObjectURL(lastAudioURL);
  lastAudioURL = URL.createObjectURL(blob);
  const ext = blob.type.includes('ogg') ? 'ogg' : 'webm';
  downloadBtn.href     = lastAudioURL;
  downloadBtn.download = `shadowing-session.${ext}`;
  downloadWrap.classList.remove('hidden');
}

/* ── Speech ── */
const sleep = ms => new Promise(r => setTimeout(r, ms));

function speak(text, locale, voice, rate) {
  return new Promise((resolve, reject) => {
    if (stopRequested) { resolve(); return; }
    if (synth.speaking||synth.pending) synth.cancel();
    const utt=new SpeechSynthesisUtterance(text);
    utt.lang=locale; utt.rate=rate||0.9; utt.pitch=1; utt.volume=1;
    if (voice) utt.voice=voice;
    let ka;
    utt.onstart=()=>{ ka=setInterval(()=>{ if(synth.speaking){synth.pause();synth.resume();}else clearInterval(ka); },10000); };
    utt.onend=()=>{ clearInterval(ka); resolve(); };
    utt.onerror=e=>{ clearInterval(ka); (e.error==='interrupted'||e.error==='canceled')?resolve():reject(new Error(e.error)); };
    setTimeout(()=>synth.speak(utt), 50);
  });
}

/* ── UI builders ── */
const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function buildDots() {
  repDots.innerHTML='';
  for(let i=0;i<reps;i++){ const d=document.createElement('div'); d.className='dot'; d.id=`dot_${i}`; repDots.appendChild(d); }
}

function updateDots(cur) {
  for(let i=0;i<reps;i++){
    const d=$(`dot_${i}`); if(!d) continue; d.className='dot';
    if(i<cur) d.classList.add('done'); else if(i===cur) d.classList.add('active');
  }
}

function buildCards(phrases) {
  phraseList.innerHTML='';
  phrases.forEach((p,i)=>{
    const cached=phoneticCache[p], lang=phonLangSel.value.toUpperCase();
    const c=document.createElement('div'); c.className='pcard'; c.id=`pc_${i}`;
    c.innerHTML=`<div class="pcard-top"><span class="pcard-num">${i+1}</span><span class="pcard-text">${esc(p)}</span><span class="pcard-rep" id="pr_${i}">×${reps}</span></div>
    <p class="pcard-phonetic${cached?' show':''}" id="pph_${i}">${cached?`<span class="pcard-ph-lang">${lang}</span>${esc(cached)}`:''}</p>`;
    phraseList.appendChild(c);
  });
}

function updateCards(idx) {
  document.querySelectorAll('.pcard').forEach((c,i)=>{
    c.className='pcard'; if(i<idx) c.classList.add('done'); if(i===idx) c.classList.add('active');
  });
}

/* ─────────────────────────────────────────────
   SESSION
───────────────────────────────────────────── */
async function runSession(phrases, locale, voice, rate) {
  isPlaying=true; stopRequested=false;
  downloadWrap.classList.add('hidden');
  const total=phrases.length*reps; let done=0;

  showState('result'); buildCards(phrases); buildDots();

  // Start recording (user will be prompted to share tab audio)
  const didRecord = await startRecording();

  for (let pi=0; pi<phrases.length; pi++) {
    if (stopRequested) break;
    updateCards(pi);
    npPhrase.textContent=phrases[pi];
    npPhonetic.textContent=phoneticCache[phrases[pi]]||'';

    for (let ri=0; ri<reps; ri++) {
      if (stopRequested) break;
      updateDots(ri);
      npMeta.textContent=`Phrase ${pi+1} / ${phrases.length}  ·  Rep. ${ri+1} / ${reps}`;
      const repEl=$(`pr_${pi}`); if(repEl) repEl.textContent=`${ri+1}/${reps}`;
      await speak(phrases[pi], locale, voice, rate);
      done++; progressFill.style.width=Math.round((done/total)*100)+'%';
      if (ri<reps-1) { npMeta.textContent=`⏸ Pause ${pauseSec}s…`; await sleep(pauseSec*1000); }
    }
    if (!stopRequested&&pi<phrases.length-1) { npMeta.textContent='⏸ Next phrase…'; await sleep(900); }
  }

  const blob = await stopRecording();
  if (didRecord && blob) showDownloadButton(blob);

  isPlaying=false;
  if (!stopRequested) {
    npPhrase.textContent='✓ Session complete!'; npPhonetic.textContent='';
    npMeta.textContent=`${phrases.length} phrase${phrases.length>1?'s':''} · ${phrases.length*reps} repetitions`;
    updateDots(reps); updateCards(phrases.length);
    playBtn.disabled=false;
    playBtn.innerHTML=`<svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor"><polygon points="1,0.5 10,5.5 1,10.5"/></svg> Repeat session`;
  }
}

async function startSession() {
  const phrases=parsePhrases();
  if (!phrases.length) { errorText.textContent='Write at least one phrase before starting.'; showState('error'); return; }
  if (!synth) { errorText.textContent='Your browser does not support Web Speech API.'; showState('error'); return; }
  reps=Math.max(1,parseInt(repsIn.value)||5);
  pauseSec=Math.max(1,parseInt(pauseIn.value)||3);
  speechRate=Math.max(0.5,parseFloat(rateIn.value)||0.9);
  sessionPhrases=phrases;
  const locale=langSel.value, voice=getSelectedVoice();
  showState('loading');
  loadingMsg.textContent='Preparing shadowing session…';
  loadingSub.textContent=`${phrases.length} phrase${phrases.length>1?'s':''} · ${reps} reps · ${pauseSec}s pause`;
  progressFill.style.width='12%'; await sleep(500);
  progressFill.style.width='55%'; await sleep(350);
  progressFill.style.width='100%'; await sleep(180);
  await runSession(phrases, locale, voice, speechRate);
}

/* ── Phonetics ── */
const LANG_NAMES={fr:'French',es:'Spanish',en:'English',de:'German',it:'Italian',pt:'Portuguese',nl:'Dutch',pl:'Polish',ru:'Russian',tr:'Turkish',sv:'Swedish',nb:'Norwegian',ar:'Arabic',ja:'Japanese',ko:'Korean',zh:'Chinese'};

async function getPhoneticFromClaude(phrase, targetLang, apiKey) {
  const langName=LANG_NAMES[targetLang]||targetLang;
  const spokenLang=langSel.options[langSel.selectedIndex].text.replace(/[🇦-🇿]{2}\s*/u,'').trim();
  const r=await fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
    body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:256,
      system:`You are a phonetics expert. Write how a native ${langName} speaker would phonetically read foreign sounds using ${langName} orthography — not a translation. Return only the transcription.`,
      messages:[{role:'user',content:`Phrase in ${spokenLang}: "${phrase}"\nWrite the ${langName} phonetic reading.`}]})
  });
  if (!r.ok) { const e=await r.json().catch(()=>({})); throw new Error(e?.error?.message||`API error ${r.status}`); }
  const d=await r.json(); return d.content?.[0]?.text?.trim()||'';
}

function renderPhoneticItem(phrase, state, text) {
  const ex=document.querySelector(`.ph-item[data-phrase="${CSS.escape(phrase)}"]`); if(ex) ex.remove();
  const div=document.createElement('div'); div.className='ph-item'; div.dataset.phrase=phrase;
  if (state==='loading') div.innerHTML=`<div class="ph-original">${esc(phrase)}</div><div class="ph-loading"><div class="spin"></div> Generating…</div>`;
  else if (state==='done') div.innerHTML=`<div class="ph-original">${esc(phrase)}</div><div class="ph-transcription">${esc(text)}</div>`;
  else div.innerHTML=`<div class="ph-original">${esc(phrase)}</div><div class="ph-error">Error: ${esc(text)}</div>`;
  phoneticResults.appendChild(div);
}

async function generatePhonetics() {
  const phrases=parsePhrases(), apiKey=apiKeyInput.value.trim();
  if (!phrases.length) return;
  if (!apiKey) { phoneticResults.innerHTML=`<div class="ph-error" style="padding:8px 11px;border-radius:var(--radius)">Please enter your Claude API key.</div>`; return; }
  phoneticBtn.disabled=true; phoneticResults.innerHTML=''; phoneticCache={};
  for (const phrase of phrases) {
    renderPhoneticItem(phrase,'loading','');
    try {
      const t=await getPhoneticFromClaude(phrase,phonLangSel.value,apiKey);
      phoneticCache[phrase]=t; renderPhoneticItem(phrase,'done',t);
      const idx=sessionPhrases.indexOf(phrase);
      if (idx!==-1) { const pph=$(`pph_${idx}`); if(pph){pph.innerHTML=`<span class="pcard-ph-lang">${phonLangSel.value.toUpperCase()}</span>${esc(t)}`;pph.classList.add('show');} }
      if (npPhrase.textContent===phrase) npPhonetic.textContent=t;
    } catch(err) { renderPhoneticItem(phrase,'error',err.message); }
  }
  phoneticBtn.disabled=false;
}

/* ── API key ── */
function loadSavedKey() { const s=localStorage.getItem('shadowing_api_key'); if(s){apiKeyInput.value=s;updateCounter();} }
function saveKey() {
  const k=apiKeyInput.value.trim();
  if(k){localStorage.setItem('shadowing_api_key',k);saveKeyBtn.textContent='Saved ✓';}
  else{localStorage.removeItem('shadowing_api_key');saveKeyBtn.textContent='Cleared';}
  setTimeout(()=>{saveKeyBtn.textContent='Save';},1800);
}

/* ── Events ── */
genBtn.addEventListener('click', startSession);
phraseInput.addEventListener('keydown', e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter') startSession();});
playBtn.addEventListener('click', async()=>{
  if(isPlaying) return;
  reps=Math.max(1,parseInt(repsIn.value)||5); pauseSec=Math.max(1,parseInt(pauseIn.value)||3); speechRate=Math.max(0.5,parseFloat(rateIn.value)||0.9);
  buildDots(); progressFill.style.width='0%'; playBtn.disabled=true;
  await runSession(sessionPhrases,langSel.value,getSelectedVoice(),speechRate);
});
stopBtn.addEventListener('click', async()=>{
  stopRequested=true; synth.cancel(); isPlaying=false;
  npMeta.textContent='Stopped.'; playBtn.disabled=false;
  playBtn.innerHTML=`<svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor"><polygon points="1,0.5 10,5.5 1,10.5"/></svg> Resume`;
  const blob=await stopRecording(); if(blob) showDownloadButton(blob);
});
resetBtn.addEventListener('click',()=>{synth.cancel();isPlaying=false;stopRequested=true;stopRecording();progressFill.style.width='0%';downloadWrap.classList.add('hidden');showState('empty');});
retryBtn.addEventListener('click',()=>showState('empty'));
phraseInput.addEventListener('input',updateCounter);
langSel.addEventListener('change',()=>filterVoicesForLang(langSel.value));
voiceSel.addEventListener('change',()=>updateVoiceBar(getSelectedVoice()));
phoneticBtn.addEventListener('click',generatePhonetics);
saveKeyBtn.addEventListener('click',saveKey);
apiKeyInput.addEventListener('input',updateCounter);
apiKeyInput.addEventListener('keydown',e=>{if(e.key==='Enter') saveKey();});

/* ── Init ── */
if(synth.onvoiceschanged!==undefined) synth.onvoiceschanged=loadVoices;
loadVoices(); setTimeout(loadVoices,300); setTimeout(loadVoices,1000);
loadSavedKey(); updateCounter(); showState('empty');
