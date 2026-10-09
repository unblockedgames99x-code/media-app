import type { PersonalizationSettings } from '../stores/personalizationStore';

let context: AudioContext | undefined;
let lastPlayed = 0;

export const playInterfaceSound = (
  sounds: PersonalizationSettings['sounds'],
  preview = false,
) => {
  if ((!sounds.enabled && !preview) || !sounds.volume || !window.AudioContext) {
    return;
  }
  const now = performance.now();
  if (now - lastPlayed < 70) {
    return;
  }
  lastPlayed = now;
  context ??= new AudioContext();
  const soundContext = context;
  void soundContext
    .resume()
    .then(() => {
      const oscillator = soundContext.createOscillator();
      const gain = soundContext.createGain();
      const start = soundContext.currentTime;
      oscillator.type = sounds.tone === 'digital' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(
        sounds.tone === 'bright' ? 880 : sounds.tone === 'digital' ? 620 : 440,
        start,
      );
      oscillator.frequency.exponentialRampToValueAtTime(
        sounds.tone === 'soft' ? 330 : 660,
        start + 0.08,
      );
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(
        (sounds.volume / 100) * 0.12,
        start + 0.008,
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.1);
      oscillator.connect(gain).connect(soundContext.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.12);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    })
    .catch(() => {});
};
