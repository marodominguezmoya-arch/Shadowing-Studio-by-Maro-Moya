# Shadowing Studio — TTS Proxy

A tiny Vercel serverless function that proxies Google Translate TTS with CORS headers,
so the Shadowing Studio GitHub Pages app can fetch real audio files for download.

## Deploy to Vercel (free, 2 minutes)

1. Create a free account at **vercel.com**
2. Click **Add New Project**
3. Import this repo from GitHub (or drag-drop the folder)
4. Click **Deploy** — no configuration needed

Your proxy will be live at:
```
https://your-project-name.vercel.app/api/tts?text=Hello&lang=en
```

## Usage

```
GET /api/tts?text=Bonjour&lang=fr&speed=0.9
```

Returns: `audio/mpeg` (MP3)

| Parameter | Description | Example |
|-----------|-------------|---------|
| `text` | Text to synthesise (max 500 chars) | `Hello world` |
| `lang` | Language code | `en`, `fr`, `es`, `yo` |
| `speed` | Speed 0.5–1.0 (default 0.85) | `0.9` |
