let audioPlayer = null;

async function speakWithVoice(text, voiceId) {
  try {
    const resp = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voiceId, telephony: false })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error('TTS proxy error: ' + errText);
    }

    const arrayBuffer = await resp.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
    const audioUrl = URL.createObjectURL(blob);

    if (!audioPlayer) audioPlayer = new Audio();
    audioPlayer.pause();
    audioPlayer.onended = null;
    audioPlayer.src = audioUrl;
    try {
      await audioPlayer.play();
    } catch (err) {
      // Autoplay blocked - user gesture required
      console.warn('Play blocked:', err);
    }
    audioPlayer.onended = () => URL.revokeObjectURL(audioUrl);
  } catch (err) {
    console.error('speakWithVoice error:', err);
  }
}