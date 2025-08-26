// --- ElevenLabs Voice Integration with Multiple Voices ---
const ELEVEN_API_KEY = "YOUR_11LABS_API_KEY"; // replace securely
const DEFAULT_MODEL = "eleven_monolingual_v1";

// Available voices (add more from ElevenLabs dashboard)
const voices = {
  Rachel: "pNInz6obpgDQGcFmaJgB",
  Adam: "EXAVITQu4vr4xnSDxMaL",
  Bella: "MF3mGyEYCl7XYWbV9V6O",
  Elliot: "TxGEqnHWrfWFTfGW9XjX"
};

let selectedVoice = voices.Rachel; // default

async function speak(text, { voiceId = selectedVoice, modelId = DEFAULT_MODEL } = {}) {
  try {
    if (!text || typeof text !== "string") {
      console.warn("speak() called with invalid text");
      return;
    }

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": ELEVEN_API_KEY
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const audioData = await response.blob();
    const audioURL = URL.createObjectURL(audioData);

    if (window._jarvisAudio) {
      window._jarvisAudio.pause();
      window._jarvisAudio.currentTime = 0;
      URL.revokeObjectURL(window._jarvisAudio.src);
    }

    window._jarvisAudio = new Audio(audioURL);
    window._jarvisAudio.play().catch(err => console.error("Audio playback failed", err));
  } catch (err) {
    console.error("speak() error:", err);
  }
}

// Function to switch voices dynamically
function setVoice(name) {
  if (voices[name]) {
    selectedVoice = voices[name];
    console.log(`Voice switched to: ${name}`);
  } else {
    console.warn("Voice not found, keeping current");
  }
}
