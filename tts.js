/**
 * api/tts.js — Vercel Serverless Function
 *
 * Acts as a CORS proxy between your GitHub Pages app
 * and Google Translate TTS.
 *
 * Usage: GET /api/tts?text=Hello&lang=en&speed=0.9
 * Returns: audio/mpeg (MP3)
 */

export default async function handler(req, res) {
  // ── CORS headers — allow your GitHub Pages domain ──────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { text, lang, speed } = req.query;

  if (!text || !lang) {
    res.status(400).json({ error: 'Missing text or lang parameter' });
    return;
  }

  // Sanitize inputs
  const safeText  = String(text).slice(0, 500); // max 500 chars
  const safeLang  = String(lang).replace(/[^a-zA-Z-]/g, '').slice(0, 10);
  const safeSpeed = parseFloat(speed) || 0.85;
  const clampedSpeed = Math.min(1, Math.max(0.5, safeSpeed));

  const gttsUrl = `https://translate.googleapis.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(safeText)}&tl=${safeLang}&client=gtx&ttsspeed=${clampedSpeed}`;

  try {
    const upstream = await fetch(gttsUrl, {
      headers: {
        // Mimic a browser request so Google doesn't block it
        'User-Agent': 'Mozilla/5.0 (compatible; ShadowingStudio/1.0)',
        'Referer': 'https://translate.google.com/',
      },
    });

    if (!upstream.ok) {
      res.status(502).json({ error: `Google TTS returned ${upstream.status}` });
      return;
    }

    const audioBuffer = await upstream.arrayBuffer();

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // cache 1h
    res.status(200).send(Buffer.from(audioBuffer));

  } catch (err) {
    console.error('TTS proxy error:', err);
    res.status(500).json({ error: 'Failed to fetch audio' });
  }
}
