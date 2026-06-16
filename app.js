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

/* ═══════════════════════════════════════════════════════════
   LOCAL PHONETIC ENGINE
   Converts foreign text → how a French/Spanish/English/etc.
   speaker would read it, using linguistic rules.
   100% offline, no API key needed.
═══════════════════════════════════════════════════════════ */

/**
 * Each rule set maps source-language sounds to target-language
 * approximate pronunciation spelling.
 *
 * Format: array of [regex, replacement] pairs applied in order.
 */
const PHONETIC_RULES = {

  /* ────────────────────────────────────────────
     ENGLISH → FRENCH phonetic approximation
     "The quick brown fox" → "ze kwik braoun foks"
  ──────────────────────────────────────────── */
  'en→fr': [
    // Digraphs first
    [/th/gi,  'z'],         // "the" → "ze"
    [/wh/gi,  'ou'],        // "where" → "ouère"
    [/sh/gi,  'ch'],        // "show" → "cho"
    [/ch/gi,  'tch'],       // "chair" → "tchère"
    [/ph/gi,  'f'],         // "phone" → "fone"
    [/ck/gi,  'k'],         // "quick" → "kouik"
    [/qu/gi,  'k'],         // "queen" → "kouine"
    [/ng/gi,  'ng'],
    [/oo/gi,  'ou'],        // "food" → "foud"
    [/ee/gi,  'i'],         // "see" → "si"
    [/ea/gi,  'i'],         // "read" → "rid"
    [/ow/gi,  'aou'],       // "brown" → "braoun"
    [/oi/gi,  'oï'],
    [/ou/gi,  'aou'],       // "out" → "aout"
    [/igh/gi, 'aï'],        // "night" → "naït"
    [/ay/gi,  'é'],         // "day" → "dé"
    [/ai/gi,  'é'],         // "rain" → "rén"
    [/aw/gi,  'o'],         // "saw" → "so"
    [/ew/gi,  'iou'],       // "new" → "niou"
    // Single letters
    [/w/gi,   'ou'],        // "will" → "ouil"
    [/y(?=[aeiou])/gi, 'y'],
    [/y/gi,   'i'],
    [/j/gi,   'dj'],        // "job" → "djob"
    [/v/gi,   'v'],
    [/z/gi,   'z'],
    [/x/gi,   'ks'],
    [/c(?=[ei])/gi, 's'],   // "city" → "siti"
    [/c/gi,   'k'],
    [/g(?=[ei])/gi, 'dj'],  // "gene" → "djine"
    [/r/gi,   'r'],
    [/a(?=\b)/gi, 'a'],
    // Final silent e
    [/e\b/gi, ''],
    // h at start
    [/^h/i,   '(h)'],
  ],

  /* ────────────────────────────────────────────
     TURKISH → FRENCH
  ──────────────────────────────────────────── */
  'tr→fr': [
    [/ş/g,  'ch'],
    [/ç/g,  'tch'],
    [/ğ/g,  ''],          // silent ğ
    [/ı/g,  'eu'],        // undotted i
    [/ö/g,  'eu'],
    [/ü/g,  'u'],
    [/â/g,  'â'],
    [/c/g,  'dj'],        // Turkish c = English j
    [/j/g,  'j'],
    [/y/g,  'y'],
    [/v/g,  'v'],
    [/z/g,  'z'],
    [/k/g,  'k'],
    [/r/g,  'r'],
    [/h/g,  'h'],
    [/n/g,  'n'],
    [/m/g,  'm'],
    [/l/g,  'l'],
    [/p/g,  'p'],
    [/t/g,  't'],
    [/s/g,  's'],
    [/b/g,  'b'],
    [/d/g,  'd'],
    [/f/g,  'f'],
    [/g/g,  'g'],
  ],

  /* ────────────────────────────────────────────
     SPANISH → FRENCH
  ──────────────────────────────────────────── */
  'es→fr': [
    [/ll/gi,  'y'],
    [/ñ/gi,   'gn'],
    [/qu/gi,  'k'],
    [/rr/gi,  'r'],
    [/ch/gi,  'tch'],
    [/j/gi,   'kh'],      // jota → guttural
    [/g(?=[ei])/gi, 'kh'],
    [/h/gi,   ''],        // silent h in Spanish
    [/v/gi,   'b'],       // Spanish v ≈ b
    [/z/gi,   's'],       // Lat Am
    [/c(?=[ei])/gi, 's'],
    [/x/gi,   'ks'],
    [/y/gi,   'y'],
    [/ú/gi,   'ou'],
    [/ó/gi,   'o'],
    [/í/gi,   'i'],
    [/é/gi,   'é'],
    [/á/gi,   'a'],
    [/ü/gi,   'ou'],
  ],

  /* ────────────────────────────────────────────
     GERMAN → FRENCH
  ──────────────────────────────────────────── */
  'de→fr': [
    [/sch/gi,  'ch'],
    [/tsch/gi, 'tch'],
    [/ch(?=[aou])/gi, 'kh'],  // Bach, Buch
    [/ch/gi,   'ch'],
    [/ei/gi,   'aï'],
    [/eu/gi,   'oï'],
    [/äu/gi,   'oï'],
    [/ie/gi,   'i'],
    [/ü/gi,    'u'],
    [/ö/gi,    'eu'],
    [/ä/gi,    'è'],
    [/ß/gi,    'ss'],
    [/w/gi,    'v'],
    [/v/gi,    'f'],
    [/z/gi,    'ts'],
    [/qu/gi,   'kv'],
    [/j/gi,    'y'],
    [/sp(?=[aeiou])/gi, 'chp'],
    [/st(?=[aeiou])/gi, 'cht'],
    [/pf/gi,   'pf'],
    [/ng/gi,   'ng'],
  ],

  /* ────────────────────────────────────────────
     ITALIAN → FRENCH
  ──────────────────────────────────────────── */
  'it→fr': [
    [/gl(?=[i])/gi, 'ly'],
    [/gn/gi,   'gn'],
    [/ch/gi,   'k'],
    [/ci(?=[aeo])/gi, 'tch'],
    [/ce/gi,   'tché'],
    [/gi(?=[aeo])/gi, 'dj'],
    [/sci/gi,  'ch'],
    [/sce/gi,  'ché'],
    [/z/gi,    'ts'],
    [/zz/gi,   'ts'],
    [/qu/gi,   'kou'],
    [/gli/gi,  'lyi'],
  ],

  /* ────────────────────────────────────────────
     PORTUGUESE → FRENCH
  ──────────────────────────────────────────── */
  'pt→fr': [
    [/nh/gi,  'gn'],
    [/lh/gi,  'ly'],
    [/ch/gi,  'ch'],
    [/ão/gi,  'aon'],
    [/ãe/gi,  'aïn'],
    [/õe/gi,  'oin'],
    [/ã/gi,   'an'],
    [/ê/gi,   'é'],
    [/ô/gi,   'o'],
    [/â/gi,   'a'],
    [/ç/gi,   's'],
    [/j/gi,   'j'],
    [/x/gi,   'ch'],
    [/qu/gi,  'k'],
    [/rr/gi,  'r'],
    [/r(?=^)/gi, 'r'],
  ],

  /* ────────────────────────────────────────────
     JAPANESE (romaji) → FRENCH
  ──────────────────────────────────────────── */
  'ja→fr': [
    [/tsu/gi, 'tsou'],
    [/shi/gi, 'chi'],
    [/chi/gi, 'tchi'],
    [/fu/gi,  'fou'],
    [/wa/gi,  'oua'],
    [/wo/gi,  'o'],
    [/yu/gi,  'you'],
    [/ya/gi,  'ya'],
    [/yo/gi,  'yo'],
    [/u/gi,   'ou'],
    [/i/gi,   'i'],
    [/e/gi,   'é'],
    [/o/gi,   'o'],
    [/a/gi,   'a'],
    [/n(?=[bp])/gi, 'm'],
    [/n/gi,   'n'],
    [/r/gi,   'r'],
    [/h/gi,   'h'],
    [/k/g,    'k'],
    [/s/g,    's'],
    [/t/g,    't'],
    [/m/g,    'm'],
    [/p/g,    'p'],
    [/b/g,    'b'],
    [/d/g,    'd'],
    [/g/g,    'g'],
    [/z/g,    'z'],
    [/w/g,    'ou'],
    [/y/g,    'y'],
    [/f/g,    'f'],
    [/j/g,    'dj'],
  ],

  /* ────────────────────────────────────────────
     KOREAN (romanized) → FRENCH
  ──────────────────────────────────────────── */
  'ko→fr': [
    [/eu/gi,  'eu'],
    [/eo/gi,  'eu'],
    [/ae/gi,  'é'],
    [/oe/gi,  'oé'],
    [/ui/gi,  'oui'],
    [/wi/gi,  'oui'],
    [/wa/gi,  'oua'],
    [/wo/gi,  'ouo'],
    [/yu/gi,  'you'],
    [/ya/gi,  'ya'],
    [/yo/gi,  'yo'],
    [/ye/gi,  'yé'],
    [/u/gi,   'ou'],
    [/i/gi,   'i'],
    [/e/gi,   'é'],
    [/o/gi,   'o'],
    [/a/gi,   'a'],
    [/ng/gi,  'ng'],
    [/ss/gi,  'ss'],
    [/kk/gi,  'k'],
    [/tt/gi,  't'],
    [/pp/gi,  'p'],
    [/ch/gi,  'tch'],
    [/j/gi,   'dj'],
    [/g/gi,   'g'],
    [/n/gi,   'n'],
    [/d/gi,   'd'],
    [/r/gi,   'r'],
    [/m/gi,   'm'],
    [/b/gi,   'b'],
    [/s/gi,   's'],
    [/h/gi,   'h'],
    [/k/gi,   'k'],
    [/t/gi,   't'],
    [/p/gi,   'p'],
  ],

  /* ────────────────────────────────────────────
     ARABIC (romanized) → FRENCH
  ──────────────────────────────────────────── */
  'ar→fr': [
    [/kh/gi, 'kh'],
    [/gh/gi, 'r'],         // غ ≈ French r
    [/sh/gi, 'ch'],
    [/th/gi, 'z'],
    [/dh/gi, 'z'],
    [/aa/gi, 'â'],
    [/ee/gi, 'i'],
    [/oo/gi, 'ou'],
    [/\'|ʿ|ʾ/g, ''],      // remove ayin/hamza
    [/q/gi,  'k'],
    [/x/gi,  'kh'],
    [/j/gi,  'dj'],
    [/w/gi,  'ou'],
    [/y/gi,  'y'],
    [/a/gi,  'a'],
    [/i/gi,  'i'],
    [/u/gi,  'ou'],
  ],

  /* ────────────────────────────────────────────
     RUSSIAN (romanized) → FRENCH
  ──────────────────────────────────────────── */
  'ru→fr': [
    [/shch/gi, 'chtch'],
    [/sh/gi,   'ch'],
    [/ch/gi,   'tch'],
    [/zh/gi,   'j'],
    [/ts/gi,   'ts'],
    [/kh/gi,   'kh'],
    [/ya/gi,   'ya'],
    [/yu/gi,   'you'],
    [/yo/gi,   'yo'],
    [/ye/gi,   'yé'],
    [/y/gi,    'i'],
    [/w/gi,    'v'],
    [/j/gi,    'y'],
    [/u/gi,    'ou'],
    [/e/gi,    'yé'],
    [/o/gi,    'o'],
    [/a/gi,    'a'],
    [/i/gi,    'i'],
    [/r/gi,    'r'],
    [/g/gi,    'g'],
    [/d/gi,    'd'],
    [/b/gi,    'b'],
    [/v/gi,    'v'],
    [/z/gi,    'z'],
    [/n/gi,    'n'],
    [/m/gi,    'm'],
    [/l/gi,    'l'],
    [/k/gi,    'k'],
    [/p/gi,    'p'],
    [/t/gi,    't'],
    [/s/gi,    's'],
    [/f/gi,    'f'],
    [/h/gi,    'kh'],
    [/\'|ʼ/g,  ''],        // soft sign
  ],

  /* ────────────────────────────────────────────
     DUTCH → FRENCH
  ──────────────────────────────────────────── */
  'nl→fr': [
    [/sch/gi,  'skh'],
    [/ch/gi,   'kh'],
    [/ij/gi,   'éï'],
    [/ei/gi,   'éï'],
    [/ou/gi,   'aou'],
    [/ui/gi,   'öy'],
    [/oe/gi,   'ou'],
    [/aa/gi,   'â'],
    [/ee/gi,   'é'],
    [/ie/gi,   'i'],
    [/oo/gi,   'o'],
    [/uu/gi,   'u'],
    [/v/gi,    'v'],
    [/w/gi,    'v'],
    [/g/gi,    'kh'],
    [/j/gi,    'y'],
    [/z/gi,    'z'],
    [/r/gi,    'r'],
  ],

  /* ────────────────────────────────────────────
     SWEDISH → FRENCH
  ──────────────────────────────────────────── */
  'sv→fr': [
    [/sj/gi,  'ch'],
    [/sk(?=[ei])/gi, 'ch'],
    [/tj/gi,  'ch'],
    [/kj/gi,  'ch'],
    [/ck/gi,  'k'],
    [/ng/gi,  'ng'],
    [/rs/gi,  'ch'],
    [/å/gi,   'o'],
    [/ä/gi,   'è'],
    [/ö/gi,   'eu'],
    [/y/gi,   'u'],
    [/j/gi,   'y'],
    [/v/gi,   'v'],
    [/w/gi,   'v'],
    [/z/gi,   's'],
    [/x/gi,   'ks'],
    [/r/gi,   'r'],
    [/g(?=[ei])/gi, 'y'],
    [/k(?=[ei])/gi, 'ch'],
  ],

  /* ────────────────────────────────────────────
     NORWEGIAN → FRENCH
  ──────────────────────────────────────────── */
  'nb→fr': [
    [/sj/gi,  'ch'],
    [/sk(?=[ei])/gi, 'ch'],
    [/kj/gi,  'ch'],
    [/ng/gi,  'ng'],
    [/å/gi,   'o'],
    [/æ/gi,   'è'],
    [/ø/gi,   'eu'],
    [/y/gi,   'u'],
    [/j/gi,   'y'],
    [/v/gi,   'v'],
    [/w/gi,   'v'],
    [/z/gi,   's'],
    [/r/gi,   'r'],
    [/g(?=[ei])/gi, 'y'],
    [/k(?=[ei])/gi, 'ch'],
  ],

  /* ────────────────────────────────────────────
     POLISH → FRENCH
  ──────────────────────────────────────────── */
  'pl→fr': [
    [/szcz/gi, 'chtch'],
    [/cz/gi,   'tch'],
    [/sz/gi,   'ch'],
    [/ch/gi,   'kh'],
    [/dż/gi,   'dj'],
    [/dź/gi,   'dj'],
    [/rz/gi,   'j'],
    [/ź/gi,    'j'],
    [/ż/gi,    'j'],
    [/ć/gi,    'tch'],
    [/ś/gi,    'ch'],
    [/ń/gi,    'gn'],
    [/ł/gi,    'ou'],
    [/ą/gi,    'on'],
    [/ę/gi,    'en'],
    [/ó/gi,    'ou'],
    [/ź/gi,    'j'],
    [/w/gi,    'v'],
    [/j/gi,    'y'],
    [/y/gi,    'i'],
    [/c(?=[ei])/gi, 'ts'],
    [/c/gi,    'ts'],
  ],

  /* ────────────────────────────────────────────
     TURKISH → SPANISH (bonus)
  ──────────────────────────────────────────── */
  'tr→es': [
    [/ş/g,  'sh'],
    [/ç/g,  'ch'],
    [/ğ/g,  ''],
    [/ı/g,  'i'],
    [/ö/g,  'ö'],
    [/ü/g,  'ü'],
    [/c/g,  'dj'],
    [/j/g,  'zh'],
    [/y/g,  'y'],
  ],

  /* ────────────────────────────────────────────
     ENGLISH → SPANISH
  ──────────────────────────────────────────── */
  'en→es': [
    [/th/gi,  'z'],
    [/sh/gi,  'ch'],
    [/ch/gi,  'ch'],
    [/ck/gi,  'k'],
    [/wh/gi,  'gu'],
    [/qu/gi,  'ku'],
    [/ph/gi,  'f'],
    [/oo/gi,  'u'],
    [/ee/gi,  'i'],
    [/ea/gi,  'i'],
    [/ay/gi,  'ei'],
    [/ai/gi,  'ei'],
    [/ow/gi,  'au'],
    [/ou/gi,  'au'],
    [/igh/gi, 'ai'],
    [/ng/gi,  'ng'],
    [/w/gi,   'gu'],
    [/j/gi,   'y'],
    [/y(?=[aeiou])/gi, 'y'],
    [/y/gi,   'i'],
    [/v/gi,   'b'],
    [/x/gi,   'ks'],
    [/z/gi,   's'],
    [/c(?=[ei])/gi, 's'],
    [/c/gi,   'k'],
    [/g(?=[ei])/gi, 'y'],
    [/e\b/gi, ''],
    [/r/gi,   'r'],
    [/h/gi,   'j'],
  ],


  /* ────────────────────────────────────────────
     YORUBA → FRENCH phonetic approximation
     Yoruba has 3 tones (high ́, low ̀, mid unmarked),
     nasals (n, m), and unique vowels.
     We map Yoruba orthography to French reading.
  ──────────────────────────────────────────── */
  'yo→fr': [
    // Special Yoruba letters
    [/gb/gi,  'gb'],         // labial-velar — keep as is, closest French can do
    [/ẹ/gi,   'è'],          // open-mid e
    [/ọ/gi,   'o'],          // open-mid o
    [/ṣ/gi,   'ch'],         // retroflex s → French ch
    [/s/gi,   's'],
    // Tonal marks — strip (tone is prosodic, not segmental in spelling)
    [/́/g,  ''],              // combining acute (high tone)
    [/̀/g,  ''],              // combining grave (low tone)
    [/̄/g,  ''],              // combining macron (mid tone)
    // Vowels
    [/ẹ/gi,   'è'],
    [/ọ/gi,   'o'],
    [/u/gi,   'ou'],          // u → French ou
    [/o/gi,   'o'],
    [/e/gi,   'é'],
    [/i/gi,   'i'],
    [/a/gi,   'a'],
    // Digraphs
    [/kp/gi,  'kp'],          // labial-velar stop
    [/gb/gi,  'gb'],
    [/ny/gi,  'gn'],          // palatal nasal
    // Consonants
    [/j/gi,   'y'],           // Yoruba j = English y
    [/y/gi,   'y'],
    [/w/gi,   'ou'],
    [/r/gi,   'r'],
    [/l/gi,   'l'],
    [/n/gi,   'n'],
    [/m/gi,   'm'],
    [/k/gi,   'k'],
    [/g/gi,   'g'],
    [/d/gi,   'd'],
    [/t/gi,   't'],
    [/b/gi,   'b'],
    [/p/gi,   'p'],
    [/f/gi,   'f'],
    [/h/gi,   'h'],
    [/v/gi,   'v'],
    [/z/gi,   'z'],
  ],

  /* ────────────────────────────────────────────
     YORUBA → SPANISH
  ──────────────────────────────────────────── */
  'yo→es': [
    [/gb/gi,  'gb'],
    [/kp/gi,  'kp'],
    [/ẹ/gi,   'e'],
    [/ọ/gi,   'o'],
    [/ṣ/gi,   'sh'],
    [/́/g,  ''],
    [/̀/g,  ''],
    [/u/gi,   'u'],
    [/o/gi,   'o'],
    [/e/gi,   'e'],
    [/i/gi,   'i'],
    [/a/gi,   'a'],
    [/j/gi,   'y'],
    [/y/gi,   'y'],
    [/w/gi,   'u'],
    [/ny/gi,  'ñ'],
    [/r/gi,   'r'],
    [/l/gi,   'l'],
    [/n/gi,   'n'],
    [/m/gi,   'm'],
    [/k/gi,   'k'],
    [/g/gi,   'g'],
    [/d/gi,   'd'],
    [/t/gi,   't'],
    [/b/gi,   'b'],
    [/p/gi,   'p'],
    [/f/gi,   'f'],
    [/h/gi,   'j'],
    [/s/gi,   's'],
  ],

  /* ────────────────────────────────────────────
     YORUBA → ENGLISH
  ──────────────────────────────────────────── */
  'yo→en': [
    [/gb/gi,  'gb'],
    [/kp/gi,  'kp'],
    [/ẹ/gi,   'eh'],
    [/ọ/gi,   'aw'],
    [/ṣ/gi,   'sh'],
    [/́/g,  ''],
    [/̀/g,  ''],
    [/u/gi,   'oo'],
    [/o/gi,   'oh'],
    [/e/gi,   'ay'],
    [/i/gi,   'ee'],
    [/a/gi,   'ah'],
    [/j/gi,   'y'],
    [/y/gi,   'y'],
    [/w/gi,   'w'],
    [/ny/gi,  'ny'],
    [/r/gi,   'r'],
    [/l/gi,   'l'],
    [/n/gi,   'n'],
    [/m/gi,   'm'],
    [/k/gi,   'k'],
    [/g/gi,   'g'],
    [/d/gi,   'd'],
    [/t/gi,   't'],
    [/b/gi,   'b'],
    [/p/gi,   'p'],
    [/f/gi,   'f'],
    [/h/gi,   'h'],
    [/s/gi,   's'],
  ],

  /* ────────────────────────────────────────────
     FRENCH → YORUBA reading approximation
     (how a Yoruba speaker might read French)
  ──────────────────────────────────────────── */
  'fr→yo': [
    [/eau/gi,  'o'],
    [/ou/gi,   'u'],
    [/eu/gi,   'ẹ'],
    [/oi/gi,   'ua'],
    [/ai/gi,   'è'],
    [/ei/gi,   'è'],
    [/au/gi,   'o'],
    [/an/gi,   'an'],
    [/en/gi,   'an'],
    [/in/gi,   'in'],
    [/on/gi,   'on'],
    [/un/gi,   'un'],
    [/ch/gi,   'ṣ'],
    [/gn/gi,   'ny'],
    [/qu/gi,   'k'],
    [/ph/gi,   'f'],
    [/th/gi,   't'],
    [/é/gi,    'e'],
    [/è/gi,    'ẹ'],
    [/ê/gi,    'ẹ'],
    [/à/gi,    'a'],
    [/â/gi,    'a'],
    [/î/gi,    'i'],
    [/ô/gi,    'o'],
    [/û/gi,    'u'],
    [/ù/gi,    'u'],
    [/ü/gi,    'u'],
    [/ï/gi,    'i'],
    [/j/gi,    'gb'],         // French j has no exact Yoruba equiv
    [/r/gi,    'r'],
    [/h/gi,    ''],           // silent h
    [/w/gi,    'u'],
    [/x/gi,    'ks'],
    [/z/gi,    's'],
    [/e/gi,  ''],           // silent final e
  ],

  /* ────────────────────────────────────────────
     ENGLISH → YORUBA reading approximation
  ──────────────────────────────────────────── */
  'en→yo': [
    [/th/gi,   'd'],
    [/sh/gi,   'ṣ'],
    [/ch/gi,   'tṣ'],
    [/ph/gi,   'f'],
    [/wh/gi,   'u'],
    [/ck/gi,   'k'],
    [/oo/gi,   'u'],
    [/ee/gi,   'i'],
    [/ea/gi,   'i'],
    [/ow/gi,   'au'],
    [/ou/gi,   'au'],
    [/igh/gi,  'ai'],
    [/ay/gi,   'e'],
    [/ai/gi,   'e'],
    [/aw/gi,   'ọ'],
    [/ng/gi,   'ng'],
    [/w/gi,    'u'],
    [/y(?=[aeiou])/gi, 'y'],
    [/y/gi,    'i'],
    [/j/gi,    'y'],
    [/v/gi,    'b'],
    [/z/gi,    's'],
    [/x/gi,    'ks'],
    [/c(?=[ei])/gi, 's'],
    [/c/gi,    'k'],
    [/g(?=[ei])/gi, 'gb'],
    [/qu/gi,   'ku'],
    [/r/gi,    'r'],
    [/e/gi,  ''],
  ],
  /* ────────────────────────────────────────────
     ENGLISH → GERMAN
  ──────────────────────────────────────────── */
  'en→de': [
    [/th/gi,  'ð'],
    [/sh/gi,  'sch'],
    [/ch/gi,  'tsch'],
    [/ck/gi,  'k'],
    [/wh/gi,  'w'],
    [/ph/gi,  'f'],
    [/oo/gi,  'u'],
    [/ee/gi,  'i'],
    [/ea/gi,  'i'],
    [/ay/gi,  'ej'],
    [/ai/gi,  'ej'],
    [/ow/gi,  'au'],
    [/ou/gi,  'au'],
    [/igh/gi, 'aj'],
    [/w/gi,   'w'],
    [/j/gi,   'dsch'],
    [/y(?=[aeiou])/gi, 'j'],
    [/y/gi,   'i'],
    [/v/gi,   'w'],
    [/z/gi,   's'],
    [/c(?=[ei])/gi, 's'],
    [/c/gi,   'k'],
    [/g(?=[ei])/gi, 'dsch'],
    [/e\b/gi, ''],
    [/s(?=[aeiou])/gi, 's'],
  ],
};

/**
 * Apply phonetic rules for a given source→target language pair.
 * Falls back to a generic Latin-script approximation if no rule set exists.
 */
function applyPhoneticRules(text, sourceLang, targetLang) {
  const key  = `${sourceLang}→${targetLang}`;
  const rules = PHONETIC_RULES[key];

  if (!rules) {
    // No specific rule set — return a note
    return `[${text}] — phonetic guide for ${sourceLang}→${targetLang} not yet available`;
  }

  let result = text.toLowerCase();
  for (const [pattern, replacement] of rules) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Get the source language code from the locale selector.
 * "tr-TR" → "tr", "en-US" → "en", etc.
 */
function getSourceLangCode() {
  return langSel.value.split('-')[0].toLowerCase();
}

/* ─────────────────────────────────────────────
   GOOGLE TTS FALLBACK
   For languages with no browser voice (Yoruba, Swahili…)
   we fetch real audio from Google Translate TTS via a
   CORS proxy. No API key, no screen capture.
───────────────────────────────────────────── */
const NO_VOICE_LOCALES = new Set([
  'sw-KE', // Swahili — rare
  'af-ZA', // Afrikaans — rare
  'bn-BD', // Bengali  — rare
  'ur-PK', // Urdu     — rare
  'fa-IR', // Persian  — rare
]);

const GTTS_CODE = {
'sw-KE':'sw','af-ZA':'af','bn-BD':'bn','ur-PK':'ur','fa-IR':'fa',
  'es-ES':'es','es-MX':'es','es-AR':'es','es-CO':'es',
  'en-US':'en','en-GB':'en','en-AU':'en','en-IN':'en',
  'fr-FR':'fr','fr-CA':'fr','fr-BE':'fr',
  'de-DE':'de','de-AT':'de','it-IT':'it',
  'pt-PT':'pt','pt-BR':'pt','nl-NL':'nl',
  'tr-TR':'tr','ar-SA':'ar','ar-EG':'ar',
  'hi-IN':'hi','ja-JP':'ja','ko-KR':'ko',
  'zh-CN':'zh-CN','zh-TW':'zh-TW',
  'ru-RU':'ru','pl-PL':'pl','sv-SE':'sv',
  'nb-NO':'no','da-DK':'da','fi-FI':'fi',
  'el-GR':'el','he-IL':'iw','uk-UA':'uk',
};

/* Public CORS proxies — tried in order until one works.
   No backend to deploy or maintain. */
const CORS_PROXIES = [
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  u => `https://thingproxy.freeboard.io/fetch/${u}`,
  u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
];

let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx || _audioCtx.state === 'closed') {
    const AC = window.AudioContext || window.webkitAudioContext;
    _audioCtx = new AC();
  }
  return _audioCtx;
}

let currentGTTSSource = null;

/**
 * Google Translate TTS has a ~200 character limit per request.
 * Longer phrases get silently truncated or rejected.
 * We split long text into chunks at sentence/word boundaries.
 */
function splitForTTS(text, maxLen = 180) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let remaining = text.trim();
  while (remaining.length > maxLen) {
    let cut = remaining.lastIndexOf(' ', maxLen);
    if (cut <= 0) cut = maxLen;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

/**
 * Fetch one chunk of audio through CORS proxies.
 * Retries each proxy up to 2 times before moving to the next.
 */
async function fetchOneChunk(text, lang) {
  const base = `https://translate.googleapis.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=gtx&ttsspeed=0.85`;

  let lastError = null;
  for (const proxy of CORS_PROXIES) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(proxy(base), { signal: AbortSignal.timeout(12000) });
        if (res.ok) {
          const buf = await res.arrayBuffer();
          // A valid MP3 from Google TTS is always > 2000 bytes for real speech
          if (buf.byteLength > 2000) return buf;
          lastError = new Error(`Audio too small (${buf.byteLength} bytes)`);
        } else {
          lastError = new Error(`HTTP ${res.status}`);
        }
      } catch (e) {
        lastError = e;
      }
      await new Promise(r => setTimeout(r, 300)); // brief delay before retry
    }
  }
  throw new Error(lastError?.message || 'No proxy responded');
}

/**
 * Fetch full audio for a phrase, splitting long text into chunks
 * and fetching each chunk, to be concatenated by the caller.
 * Returns an array of ArrayBuffers (one per chunk).
 */
async function fetchGTTSAudioChunks(text, locale) {
  const lang   = GTTS_CODE[locale] || locale.split('-')[0];
  const pieces = splitForTTS(text);
  const buffers = [];
  for (const piece of pieces) {
    const buf = await fetchOneChunk(piece, lang);
    buffers.push(buf);
  }
  return buffers;
}

/** Back-compat single-buffer fetch (used by live Play mode fallback) */
async function fetchGTTSAudio(text, locale) {
  const chunks = await fetchGTTSAudioChunks(text, locale);
  return chunks[0]; // first chunk is enough for short live playback
}

/**
 * Fetch real speech audio for Build & Download.
 * Returns an array of ArrayBuffers (MP3 chunks) to decode and concatenate.
 */
async function fetchRealTTS(text, locale, speed) {
  return await fetchGTTSAudioChunks(text, locale);
}

function playAudioBuffer(buf) {
  return new Promise((resolve, reject) => {
    if (stopRequested) { resolve(); return; }
    const ctx = getAudioCtx();
    ctx.decodeAudioData(buf.slice(0), decoded => {
      const src = ctx.createBufferSource();
      src.buffer = decoded;
      src.connect(ctx.destination);
      currentGTTSSource = src;
      src.onended = () => { currentGTTSSource = null; resolve(); };
      src.start(0);
    }, reject);
  });
}

function stopGTTSPlayback() {
  if (currentGTTSSource) {
    try { currentGTTSSource.stop(); } catch (_) {}
    currentGTTSSource = null;
  }
}

/* ─────────────────────────────────────────────
   VOICE LOADING
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
  yo:['Google Yorùbá','Google yoruba'],
};

const langCode = locale => (locale || 'en').split('-')[0].toLowerCase();

// loadVoices kept for compatibility
function loadVoices() { tryLoadVoices(); }

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

  // Yoruba — Web Speech API with lang='yo'. Chrome uses Google online TTS.
  if (locale === 'yo-NG') {
    vdot.style.color  = 'var(--green)';
    vtext.textContent = '🌐 Yoruba — Google online TTS via Chrome (requires internet)';
    genBtn.disabled   = false;
    buildBtn.disabled = false;
    return;
  }

  // Other rare languages with no local voice → GTTS proxy
  if (NO_VOICE_LOCALES.has(locale)) {
    vdot.style.color  = 'var(--accent)';
    vtext.textContent = '🌐 Online voice — requires internet connection';
    genBtn.disabled   = false;
    buildBtn.disabled = false;
    return;
  }

  // Try to find a browser voice
  const voice = getBestVoice(locale);

  if (!voice) {
    // Voices may still be loading — keep waiting if no voices at all
    if (voices.length === 0) {
      vdot.style.color  = 'var(--amber)';
      vtext.textContent = 'Loading voices…';
      // Don't disable buttons — poll will call us again
      return;
    }
    // Voices loaded but none for this language — GTTS fallback
    vdot.style.color  = 'var(--accent)';
    vtext.textContent = '🌐 No local voice for this language — using Google TTS';
    genBtn.disabled   = false;
    buildBtn.disabled = false;
    return;
  }

  // Good browser voice found
  const isHigh = voice.localService || voice.name.toLowerCase().includes('google');
  vdot.style.color  = isHigh ? 'var(--green)' : 'var(--amber)';
  vtext.textContent = `${isHigh ? '★ High' : '◆ Standard'} quality — ${voice.name.replace(/Microsoft |Google /g, '').trim()} · ${voice.lang}`;
  genBtn.disabled   = false;
  buildBtn.disabled = false;
}

/* ─────────────────────────────────────────────
   WAV BUILDER (tone cue + silence gaps)
───────────────────────────────────────────── */
function measureSpeechDuration(text, locale, voice, rate) {
  return new Promise(resolve => {
    const utt  = new SpeechSynthesisUtterance(text);
    utt.lang   = locale; utt.rate = rate || 0.9; utt.volume = 0;
    if (voice) utt.voice = voice;
    const start = Date.now();
    utt.onend   = () => resolve((Date.now() - start) / 1000);
    utt.onerror = () => resolve(2.0);
    synth.speak(utt);
  });
}

function buildWAV(segments) {
  const SR = 22050;
  const totalSamples = segments.reduce((a, s) => a + Math.floor(s.duration * SR), 0);
  const buf  = new ArrayBuffer(44 + totalSamples * 2);
  const view = new DataView(buf);
  const wr   = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };
  wr(0,'RIFF'); view.setUint32(4, 36 + totalSamples * 2, true);
  wr(8,'WAVE'); wr(12,'fmt '); view.setUint32(16,16,true);
  view.setUint16(20,1,true); view.setUint16(22,1,true);
  view.setUint32(24,SR,true); view.setUint32(28,SR*2,true);
  view.setUint16(32,2,true); view.setUint16(34,16,true);
  wr(36,'data'); view.setUint32(40, totalSamples * 2, true);
  let off = 44;
  for (const seg of segments) {
    const n = Math.floor(seg.duration * SR);
    if (seg.type === 'tone') {
      for (let i = 0; i < n; i++) {
        const fade = Math.min(1, Math.min(i, n - i) / (SR * 0.02));
        const s    = Math.sin(2 * Math.PI * (seg.freq || 440) * i / SR) * (seg.amp || 0.3) * fade;
        view.setInt16(off, Math.round(s * 32767), true); off += 2;
      }
    } else if (seg.type === 'speech_silence') {
      for (let i = 0; i < n; i++) {
        view.setInt16(off, Math.round((Math.random() - 0.5) * 0.002 * 32767), true); off += 2;
      }
    } else {
      off += n * 2; // silence = zeros
    }
  }
  return buf;
}

/* ─────────────────────────────────────────────
   UTILITIES
───────────────────────────────────────────── */
const sleep        = ms => new Promise(r => setTimeout(r, ms));
const esc          = s  => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const parsePhrases = () => phraseInput.value.split('\n').map(l => l.trim()).filter(l => l.length > 0);

function updateCounter() {
  const n = parsePhrases().length;
  counterEl.textContent = n === 0 ? '0 phrases' : n === 1 ? '1 phrase' : `${n} phrases`;
  // Phonetic button always enabled when there are phrases — no API key needed
  phoneticBtn.disabled = n === 0;
}

function showState(s) {
  ['empty','loading','result','error'].forEach(n => { const e = $(n+'State'); if (e) e.classList.add('hidden'); });
  const t = $(s+'State'); if (t) t.classList.remove('hidden');
}

function buildDots() {
  repDots.innerHTML = '';
  for (let i = 0; i < reps; i++) {
    const d = document.createElement('div'); d.className = 'dot'; d.id = `dot_${i}`; repDots.appendChild(d);
  }
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
    c.innerHTML = `
      <div class="pcard-top">
        <span class="pcard-num">${i+1}</span>
        <span class="pcard-text">${esc(p)}</span>
        <span class="pcard-rep" id="pr_${i}">×${reps}</span>
      </div>
      <p class="pcard-phonetic${cached?' show':''}" id="pph_${i}">
        ${cached?`<span class="pcard-ph-lang">${lang}</span>${esc(cached)}`:''}
      </p>`;
    phraseList.appendChild(c);
  });
}

function updateCards(idx) {
  document.querySelectorAll('.pcard').forEach((c, i) => {
    c.className = 'pcard';
    if (i < idx) c.classList.add('done');
    if (i === idx) c.classList.add('active');
  });
}

/* ─────────────────────────────────────────────
   SPEAK
───────────────────────────────────────────── */
async function speak(text, locale, voice, rate, vol = 1) {
  if (stopRequested) return;

  // ── All languages including Yoruba: Web Speech API ───────────────────────
  // For Yoruba (yo-NG): Chrome uses Google's online TTS when lang='yo' is set.
  // We force the lang tag and let the browser handle it — no external library needed.
  return new Promise((resolve, reject) => {
    if (stopRequested) { resolve(); return; }
    if (synth.speaking || synth.pending) synth.cancel();

    const utt   = new SpeechSynthesisUtterance(text);
    // For Yoruba, use the bare 'yo' tag — Chrome recognises it and uses Google TTS
    utt.lang    = (locale === 'yo-NG') ? 'yo' : locale;
    utt.rate    = rate || 0.9;
    utt.pitch   = 1;
    utt.volume  = vol;

    // Only assign a voice object for languages that have local voices.
    // For Yoruba, leave utt.voice unset so the browser picks online TTS.
    if (voice && locale !== 'yo-NG') utt.voice = voice;

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
   PLAY SESSION
───────────────────────────────────────────── */
async function runPlaySession(phrases, locale, voice, rate) {
  isPlaying = true; stopRequested = false;
  const total = phrases.length * reps; let done = 0;
  showState('result'); buildCards(phrases); buildDots();
  downloadWrap.classList.add('hidden');

  for (let pi = 0; pi < phrases.length; pi++) {
    if (stopRequested) break;
    updateCards(pi);
    npPhrase.textContent   = phrases[pi];
    npPhonetic.textContent = phoneticCache[phrases[pi]] || '';

    for (let ri = 0; ri < reps; ri++) {
      if (stopRequested) break;
      updateDots(ri);
      npMeta.textContent = `Phrase ${pi+1}/${phrases.length} · Rep. ${ri+1}/${reps}`;
      const el = $(`pr_${pi}`); if (el) el.textContent = `${ri+1}/${reps}`;
      await speak(phrases[pi], locale, voice, rate);
      done++; progressFill.style.width = Math.round((done/total)*100)+'%';
      if (ri < reps-1 && !stopRequested) { npMeta.textContent = `⏸ Pause ${pauseSec}s…`; await sleep(pauseSec*1000); }
    }
    if (!stopRequested && pi < phrases.length-1) { npMeta.textContent = '⏸ Next phrase…'; await sleep(800); }
  }

  isPlaying = false;
  if (!stopRequested) {
    npPhrase.textContent = '✓ Session complete!'; npPhonetic.textContent = '';
    npMeta.textContent   = `${phrases.length} phrase${phrases.length>1?'s':''} · ${phrases.length*reps} reps`;
    updateDots(reps); updateCards(phrases.length);
    playBtn.disabled = false;
    playBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor"><polygon points="1,0.5 10,5.5 1,10.5"/></svg> Repeat session`;
  }
}

/* ─────────────────────────────────────────────
   BUILD & DOWNLOAD
───────────────────────────────────────────── */
async function runBuildSession(phrases, locale, voice, rate) {
  showState('loading');
  progressFill.style.width = '0%';
  loadingMsg.textContent   = 'Fetching audio…';
  loadingSub.textContent   = `${phrases.length} phrase${phrases.length > 1 ? 's' : ''} × ${reps} reps · ${pauseSec}s pause`;
  downloadWrap.classList.add('hidden');

  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const actx     = new AudioCtx();
    const SR       = actx.sampleRate;
    const allPCM   = [];
    const total    = phrases.length * reps;
    let   done     = 0;
    let   failedPhrases = [];

    // Silence chunk
    const silencePCM = sec => new Float32Array(Math.floor(SR * sec));

    // Decode MP3 ArrayBuffer → mono Float32 PCM
    async function mp3ToPCM(buf) {
      const decoded = await actx.decodeAudioData(buf.slice(0));
      const ch  = decoded.numberOfChannels;
      const len = decoded.length;
      const out = new Float32Array(len);
      for (let c = 0; c < ch; c++) {
        const d = decoded.getChannelData(c);
        for (let i = 0; i < len; i++) out[i] += d[i] / ch;
      }
      return out;
    }

    /**
     * Fetch all chunks for a phrase, decode each, and concatenate
     * into one continuous PCM buffer for that phrase.
     */
    async function buildPhrasePCM(text) {
      const mp3Chunks = await fetchRealTTS(text, locale, rate || 0.85);
      const pcmChunks = [];
      for (const mp3 of mp3Chunks) {
        pcmChunks.push(await mp3ToPCM(mp3));
        pcmChunks.push(silencePCM(0.12)); // tiny gap between chunks of same phrase
      }
      const len = pcmChunks.reduce((a, c) => a + c.length, 0);
      const out = new Float32Array(len);
      let off = 0;
      for (const c of pcmChunks) { out.set(c, off); off += c.length; }
      return out;
    }

    // Encode Float32 PCM → WAV ArrayBuffer
    function pcmToWAV(pcm, sr) {
      const buf  = new ArrayBuffer(44 + pcm.length * 2);
      const view = new DataView(buf);
      const wr   = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };
      wr(0, 'RIFF'); view.setUint32(4, 36 + pcm.length * 2, true);
      wr(8, 'WAVE'); wr(12, 'fmt ');
      view.setUint32(16, 16, true); view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);  view.setUint32(24, sr, true);
      view.setUint32(28, sr * 2, true); view.setUint16(32, 2, true);
      view.setUint16(34, 16, true); wr(36, 'data');
      view.setUint32(40, pcm.length * 2, true);
      let off = 44;
      for (let i = 0; i < pcm.length; i++) {
        const s = Math.max(-1, Math.min(1, pcm[i]));
        view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        off += 2;
      }
      return buf;
    }

    allPCM.push(silencePCM(0.4)); // opening silence

    for (let pi = 0; pi < phrases.length; pi++) {
      if (stopRequested) break;
      loadingMsg.textContent = `Fetching phrase ${pi + 1} / ${phrases.length}…`;

      // Fetch real voice audio once, reuse for all reps
      let phrasePCM = null;
      let lastErr    = null;

      // Try up to 2 full attempts before giving up on this phrase
      for (let attempt = 0; attempt < 2 && !phrasePCM; attempt++) {
        try {
          phrasePCM = await buildPhrasePCM(phrases[pi]);
        } catch (e) {
          lastErr = e;
          console.warn(`Attempt ${attempt + 1} failed for "${phrases[pi]}":`, e.message);
        }
      }

      if (!phrasePCM) {
        // Real failure — track it and use a clearly audible marker (not silent!)
        failedPhrases.push(phrases[pi]);
        console.error(`Could not fetch audio for "${phrases[pi]}":`, lastErr?.message);
        // Use a short buzzer tone so the gap is audible/obvious, not mistaken for a pause
        const buzzLen = Math.floor(SR * 0.5);
        phrasePCM = new Float32Array(buzzLen);
        for (let i = 0; i < buzzLen; i++) {
          phrasePCM[i] = Math.sin(2 * Math.PI * 220 * (i / SR)) * 0.25;
        }
      }

      for (let ri = 0; ri < reps; ri++) {
        if (stopRequested) break;
        allPCM.push(phrasePCM);            // real voice (or buzz if failed)
        allPCM.push(silencePCM(pauseSec)); // pause
        done++;
        progressFill.style.width = Math.round((done / total) * 90) + '%';
        loadingMsg.textContent   = `Building: phrase ${pi + 1}/${phrases.length} · rep ${ri + 1}/${reps}`;
        await sleep(0); // yield to browser
      }

      allPCM.push(silencePCM(0.6)); // gap between phrases
    }

    actx.close();
    if (!allPCM.length || stopRequested) { showState('empty'); return; }

    loadingMsg.textContent = 'Encoding WAV file…';
    await sleep(30);

    // Merge all PCM chunks
    const totalLen = allPCM.reduce((a, c) => a + c.length, 0);
    const merged   = new Float32Array(totalLen);
    let   offset   = 0;
    for (const chunk of allPCM) { merged.set(chunk, offset); offset += chunk.length; }

    // Encode to WAV and offer download
    const wavBuf = pcmToWAV(merged, SR);
    const blob   = new Blob([wavBuf], { type: 'audio/wav' });
    const url    = URL.createObjectURL(blob);

    audioPlayer.src      = url;
    downloadBtn.href     = url;
    downloadBtn.download = `shadowing-${locale}-${reps}reps.wav`;
    progressFill.style.width = '100%';
    await sleep(150);

    showState('result');
    buildCards(phrases);

    if (failedPhrases.length === 0) {
      npPhrase.textContent   = '✓ Audio ready — real voices!';
      npMeta.textContent     = `${phrases.length} phrase${phrases.length > 1 ? 's' : ''} · ${reps} reps · ${pauseSec}s pause`;
    } else {
      npPhrase.textContent   = `⚠️ ${failedPhrases.length} phrase(s) failed to load`;
      npMeta.textContent     = `Listen for the beep tone where audio is missing — try Build again, or check your connection.`;
    }
    npPhonetic.textContent = '';
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
  reps       = Math.max(1,   parseInt(repsIn.value)    || 5);
  pauseSec   = Math.max(1,   parseInt(pauseIn.value)   || 3);
  speechRate = Math.max(0.5, parseFloat(speedIn.value) / 100 || 0.9);
}

async function startPlaySession() {
  const phrases = parsePhrases();
  if (!phrases.length) { errorText.textContent = 'Write at least one phrase.'; showState('error'); return; }
  readParams(); sessionPhrases = phrases;
  genBtn.disabled = true;
  await runPlaySession(phrases, langSel.value, getBestVoice(langSel.value), speechRate);
  genBtn.disabled = false;
}

async function startBuildSession() {
  const phrases = parsePhrases();
  if (!phrases.length) { errorText.textContent = 'Write at least one phrase.'; showState('error'); return; }
  readParams(); sessionPhrases = phrases;
  buildBtn.disabled = true; buildBtn.textContent = 'Building…';
  await runBuildSession(phrases, langSel.value, getBestVoice(langSel.value), speechRate);
  buildBtn.disabled = false;
  buildBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M6 8.5L2.5 5H5V1h2v4h2.5L6 8.5z"/><rect x="1" y="10" width="10" height="1.5" rx=".75"/></svg> Build &amp; Download`;
}

/* ─────────────────────────────────────────────
   PHONETICS — LOCAL ENGINE (no API key needed)
───────────────────────────────────────────── */
function renderPhoneticItem(phrase, state, text) {
  const ex = document.querySelector(`.ph-item[data-phrase="${CSS.escape(phrase)}"]`);
  if (ex) ex.remove();
  const div = document.createElement('div'); div.className = 'ph-item'; div.dataset.phrase = phrase;
  if (state === 'loading') {
    div.innerHTML = `<div class="ph-original">${esc(phrase)}</div><div class="ph-loading"><div class="spin"></div> Processing…</div>`;
  } else if (state === 'done') {
    div.innerHTML = `<div class="ph-original">${esc(phrase)}</div><div class="ph-transcription">${esc(text)}</div>`;
  } else {
    div.innerHTML = `<div class="ph-original">${esc(phrase)}</div><div class="ph-error">${esc(text)}</div>`;
  }
  phoneticResults.appendChild(div);
}

async function generatePhonetics() {
  const phrases    = parsePhrases();
  const sourceLang = getSourceLangCode();
  const targetLang = phonLangSel.value;

  if (!phrases.length) return;

  phoneticBtn.disabled = true;
  phoneticResults.innerHTML = '';
  phoneticCache = {};

  for (const phrase of phrases) {
    renderPhoneticItem(phrase, 'loading', '');
    await sleep(30); // small delay so UI renders the spinner

    try {
      const transcription = applyPhoneticRules(phrase, sourceLang, targetLang);
      phoneticCache[phrase] = transcription;
      renderPhoneticItem(phrase, 'done', transcription);

      // Update session card if open
      const idx = sessionPhrases.indexOf(phrase);
      if (idx !== -1) {
        const pph = $(`pph_${idx}`);
        if (pph) {
          pph.innerHTML = `<span class="pcard-ph-lang">${targetLang.toUpperCase()}</span>${esc(transcription)}`;
          pph.classList.add('show');
        }
      }
      if (npPhrase.textContent === phrase) npPhonetic.textContent = transcription;

    } catch (err) {
      renderPhoneticItem(phrase, 'error', err.message);
    }
  }

  phoneticBtn.disabled = false;
}

/* ── API key (optional, kept for future use) ── */
function loadSavedKey() {
  const s = localStorage.getItem('shadowing_api_key');
  if (s) apiKeyInput.value = s;
}
function saveKey() {
  const k = apiKeyInput.value.trim();
  if (k) { localStorage.setItem('shadowing_api_key', k); saveKeyBtn.textContent = 'Saved ✓'; }
  else   { localStorage.removeItem('shadowing_api_key'); saveKeyBtn.textContent = 'Cleared'; }
  setTimeout(() => { saveKeyBtn.textContent = 'Save'; }, 1800);
}

/* ─────────────────────────────────────────────
   EVENTS
───────────────────────────────────────────── */
genBtn.addEventListener('click',   startPlaySession);
buildBtn.addEventListener('click', startBuildSession);
phraseInput.addEventListener('keydown', e => { if ((e.ctrlKey||e.metaKey) && e.key==='Enter') startPlaySession(); });

playBtn.addEventListener('click', async () => {
  if (isPlaying) return;
  readParams(); playBtn.disabled = true;
  await runPlaySession(sessionPhrases, langSel.value, getBestVoice(langSel.value), speechRate);
});

stopBtn.addEventListener('click', () => {
  stopRequested = true; synth.cancel(); isPlaying = false;
  npMeta.textContent = 'Stopped.';
  playBtn.disabled = genBtn.disabled = buildBtn.disabled = false;
  playBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor"><polygon points="1,0.5 10,5.5 1,10.5"/></svg> Resume`;
});

resetBtn.addEventListener('click', () => {
  synth.cancel();
  stopGTTSPlayback();
  isPlaying = false; stopRequested = true;
  downloadWrap.classList.add('hidden'); showState('empty');
});

retryBtn.addEventListener('click',    () => showState('empty'));
phraseInput.addEventListener('input',  updateCounter);
langSel.addEventListener('change',     updateVoiceUI);
phoneticBtn.addEventListener('click',  generatePhonetics);
saveKeyBtn.addEventListener('click',   saveKey);
apiKeyInput.addEventListener('keydown', e => { if (e.key==='Enter') saveKey(); });

/* ─────────────────────────────────────────────
   INIT — voice loading
   Chrome: fires onvoiceschanged, may also need polling
   Safari: voices available synchronously after load
   Firefox: voices available synchronously
───────────────────────────────────────────── */

// Initial state
vdot.style.color  = 'var(--amber)';
vtext.textContent = 'Loading voices…';
genBtn.disabled   = true;
buildBtn.disabled = true;

function tryLoadVoices() {
  if (!synth) return false;
  const raw = synth.getVoices();
  if (raw.length === 0) return false;
  voices = [...raw].sort((a, b) => {
    if (a.localService && !b.localService) return -1;
    if (!a.localService && b.localService) return 1;
    return a.name.localeCompare(b.name);
  });
  updateVoiceUI(); // updates the badge and enables buttons
  return true;
}

if (!synth) {
  // Browser doesn't support speech at all
  vdot.style.color  = 'var(--danger)';
  vtext.textContent = 'Web Speech API not supported — use Chrome or Edge.';
  // Still allow Yoruba (uses GTTS, not synth)
  genBtn.disabled   = false;
  buildBtn.disabled = false;
} else {
  // Try immediately (works on Safari/Firefox)
  const gotVoices = tryLoadVoices();

  if (!gotVoices) {
    // Chrome: hook onvoiceschanged (fires once voices are ready)
    synth.onvoiceschanged = () => {
      tryLoadVoices();
      synth.onvoiceschanged = null; // fire once only
    };

    // Also poll as a safety net for browsers that don't fire the event
    let ticks = 0;
    const poll = setInterval(() => {
      ticks++;
      if (tryLoadVoices() || ticks > 50) {
        clearInterval(poll); // stop after success or 5s timeout
        if (ticks > 50 && voices.length === 0) {
          // Timed out with no voices — enable GTTS fallback mode
          vdot.style.color  = 'var(--accent)';
          vtext.textContent = '🌐 No local voice found — online TTS will be used';
          genBtn.disabled   = false;
          buildBtn.disabled = false;
        }
      }
    }, 100);
  }
}

langSel.addEventListener('change', updateVoiceUI);
loadSavedKey();
updateCounter();
showState('empty');
