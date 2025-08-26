/**
 * Node Express TTS proxy for ElevenLabs
 * - Environment variable ELEVENLABS_API_KEY required
 * - Requires ffmpeg installed on the host for audio conversion
 * - Caches generated audio on disk (./cache)
 */

const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const morgan = require('morgan');

const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY;
if (!ELEVEN_KEY) {
  console.warn('Warning: ELEVENLABS_API_KEY is not set. Endpoint will fail without it.');
}

const CACHE_DIR = path.join(__dirname, 'cache');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR);

const app = express();
app.use(express.json({ limit: '64kb' }));
app.use(morgan('combined'));

// helper: hash
function hashText(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// helper: download from ElevenLabs (returns Buffer of audio, default mp3)
async function fetchTTSFromEleven(text, voiceId) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const payload = { text, voice_settings: { stability: 0.6, similarity_boost: 0.9 } };
  const headers = {
    'Content-Type': 'application/json',
    'xi-api-key': ELEVEN_KEY
  };

  // simple retry logic
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await axios.post(url, payload, { headers, responseType: 'arraybuffer', timeout: 30000 });
      if (resp.status >= 200 && resp.status < 300) {
        return Buffer.from(resp.data);
      } else {
        const err = new Error('Bad response: ' + resp.status);
        err.status = resp.status;
        throw err;
      }
    } catch (err) {
      if (attempt < 2 && (!err.response || err.response.status >= 500 || err.response.status === 429)) {
        // backoff
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
        continue;
      }
      throw err;
    }
  }
}

// helper: convert buffer (mp3) to wav 16k mono using ffmpeg (spawn)
// returns path to wav file
function convertMp3ToTelephonyWav(mp3Path, wavPath) {
  return new Promise((resolve, reject) => {
    // ffmpeg -y -i input.mp3 -ar 16000 -ac 1 -acodec pcm_s16le output.wav
    const args = ['-y', '-i', mp3Path, '-ar', '16000', '-ac', '1', '-acodec', 'pcm_s16le', wavPath];
    const ff = spawn('ffmpeg', args);

    ff.on('error', (err) => {
      reject(err);
    });

    ff.stderr.on('data', (data) => {
      // console.error('ffmpeg:', data.toString());
    });

    ff.on('close', (code) => {
      if (code === 0) resolve(wavPath);
      else reject(new Error('ffmpeg exited with code ' + code));
    });
  });
}

// API: POST /api/tts  body: { text, voiceId, telephony (bool) }
// returns audio stream (mp3 if telephony=false else wav)
app.post('/api/tts', async (req, res) => {
  try {
    const { text, voiceId, telephony } = req.body || {};
    if (!text || !voiceId) return res.status(400).json({ error: 'Missing text or voiceId' });

    const key = hashText(voiceId + '|' + text);
    const cachedMp3 = path.join(CACHE_DIR, key + '.mp3');
    const cachedWav = path.join(CACHE_DIR, key + '.wav');

    if (telephony && fs.existsSync(cachedWav)) {
      res.setHeader('Content-Type', 'audio/wav');
      return fs.createReadStream(cachedWav).pipe(res);
    }
    if (!telephony && fs.existsSync(cachedMp3)) {
      res.setHeader('Content-Type', 'audio/mpeg');
      return fs.createReadStream(cachedMp3).pipe(res);
    }

    // fetch from ElevenLabs
    const audioBuffer = await fetchTTSFromEleven(text, voiceId);
    // write mp3 cache
    fs.writeFileSync(cachedMp3, audioBuffer);

    if (telephony) {
      // convert to wav telephony format
      try {
        await convertMp3ToTelephonyWav(cachedMp3, cachedWav);
        res.setHeader('Content-Type', 'audio/wav');
        return fs.createReadStream(cachedWav).pipe(res);
      } catch (convErr) {
        console.error('Conversion error', convErr);
        // fallback to mp3
        res.setHeader('Content-Type', 'audio/mpeg');
        return fs.createReadStream(cachedMp3).pipe(res);
      }
    } else {
      res.setHeader('Content-Type', 'audio/mpeg');
      return fs.createReadStream(cachedMp3).pipe(res);
    }
  } catch (err) {
    console.error('TTS proxy error', err);
    const status = (err.response && err.response.status) || 500;
    res.status(status).json({ error: err.message || 'TTS proxy error' });
  }
});

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('TTS proxy listening on port', PORT));