# 🎙️ Shadowing Studio

A clean, offline-capable language shadowing app that runs entirely in your browser.  
Practice pronunciation by listening to repeated TTS audio with timed pauses — and get AI-generated phonetic transcriptions to see how phrases sound in your native language.

**[▶ Live demo](https://YOUR_USERNAME.github.io/shadowing-studio)**

---

## ✨ Features

- **40+ languages** with optimised voice selection (OS-native voices prioritised automatically)
- **Voice quality indicator** — instantly see if you have a high-quality or fallback voice
- **Configurable sessions** — repetitions, pause duration, playback speed
- **AI phonetic transcription** — powered by Claude API, choose *any* transcription language  
  *(e.g. "how would a French speaker read this Japanese phrase?")*
- **Progressive generation** — phonetics appear one phrase at a time as they're generated
- **Dark mode** — respects system preference
- **Offline ready** — no server needed, open `index.html` directly in Chrome or Edge
- **API key saved** — stored in `localStorage` so you don't retype it

---

## 🚀 Quick start (local)

```bash
git clone https://github.com/YOUR_USERNAME/shadowing-studio.git
cd shadowing-studio
# Just open index.html in Chrome or Edge — no build step needed
open index.html        # macOS
start index.html       # Windows
xdg-open index.html    # Linux
```

> **Note:** Web Speech API requires Chrome or Edge. Safari has limited support. Firefox has no TTS support.

---

## 🌐 Deploy to GitHub Pages (free hosting)

1. Push the repo to GitHub
2. Go to **Settings → Pages**
3. Set source to `main` branch, root folder `/`
4. Click **Save** — your app will be live at `https://YOUR_USERNAME.github.io/shadowing-studio`

---

## 🤖 Phonetic transcription (Claude API)

The phonetic feature uses the **Claude API** directly from your browser.

1. Get a free API key at [console.anthropic.com](https://console.anthropic.com)
2. Paste it in the **Claude API key** field in the header
3. Click **Save** — it's stored in your browser's `localStorage`
4. Write your phrases, choose a transcription language, click **Generate**

The transcription answers: *"How would a native [language] speaker read this phrase phonetically?"*  
This is **not** a translation — it's a pronunciation guide using the sounds of your chosen language.

---

## 📁 Project structure

```
shadowing-studio/
├── index.html      # App shell — HTML structure + language/voice lists
├── style.css       # All styles — light/dark mode, layout, components  
├── app.js          # All logic — voice engine, session runner, Claude API
└── README.md
```

---

## 🔧 Customisation

| What | Where |
|------|-------|
| Add a language to the dropdown | `index.html` — add `<option>` in the `<select id="langSel">` |
| Adjust voice preferences | `app.js` — `VOICE_PREFS` object |
| Change default repetitions/pause | `index.html` — `value` attributes on `repsIn`, `pauseIn` |
| Change the Claude model | `app.js` — `model` in `getPhoneticFromClaude()` |

---

## 🖥️ Voice quality by browser

| Browser | Voice quality |
|---------|--------------|
| **Chrome** (recommended) | ★ High — Google neural voices built-in |
| **Edge** | ★ High — Microsoft neural voices built-in |
| **Safari** | ◆ Medium — macOS system voices (good on Apple hardware) |
| **Firefox** | ○ Low — limited TTS support, not recommended |

For best results on any OS, install additional language voices in your system settings:
- **macOS**: System Settings → Accessibility → Spoken Content → System Voice → Manage voices
- **Windows**: Settings → Time & Language → Speech → Add voices

---

## ⚖️ Privacy

- Your API key is stored only in your own browser (`localStorage`) — never sent anywhere except the Anthropic API
- No analytics, no tracking, no cookies
- Phrases are sent to Anthropic's API only when you click **Generate phonetics**

---

## 📝 License

MIT — free to use, modify, and distribute.
