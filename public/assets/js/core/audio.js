/**
 * Generative ambient soundtrack built with the Web Audio API (no audio files).
 * Starts only after a user gesture, honours a persisted preference.
 */
const STORAGE_KEY = 'tl.audio';
const CHORDS = [
  [220.0, 261.63, 329.63, 392.0],
  [174.61, 220.0, 261.63, 349.23],
  [196.0, 246.94, 293.66, 392.0],
  [164.81, 207.65, 246.94, 329.63],
];

let context = null;
let master = null;
let timer = null;
let step = 0;
let enabled = (() => { try { return localStorage.getItem(STORAGE_KEY) === 'on'; } catch { return false; } })();
const listeners = new Set();

function createReverb(ctx) {
  const length = ctx.sampleRate * 3.2;
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2.6;
  }
  const convolver = ctx.createConvolver();
  convolver.buffer = impulse;
  return convolver;
}

function ensureGraph() {
  if (context) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error('Web Audio API tidak didukung');
  context = new AudioContextClass();
  master = context.createGain();
  master.gain.value = 0;
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 2400;
  const reverb = createReverb(context);
  const wet = context.createGain();
  wet.gain.value = 0.55;
  master.connect(filter);
  filter.connect(context.destination);
  filter.connect(reverb);
  reverb.connect(wet);
  wet.connect(context.destination);
}

function playPad(chord, time) {
  chord.forEach((frequency, index) => {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = index % 2 ? 'triangle' : 'sine';
    osc.frequency.value = frequency / 2;
    osc.detune.value = (index - 1.5) * 4;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.05, time + 2.2);
    gain.gain.linearRampToValueAtTime(0, time + 7.8);
    osc.connect(gain).connect(master);
    osc.start(time);
    osc.stop(time + 8);
  });
}

function playBell(frequency, time) {
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequency * 2;
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(0.035, time + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 2.6);
  osc.connect(gain).connect(master);
  osc.start(time);
  osc.stop(time + 2.8);
}

function schedule() {
  const chord = CHORDS[step % CHORDS.length];
  const now = context.currentTime + 0.05;
  playPad(chord, now);
  [0, 1.1, 2.6, 3.4, 5.2].forEach((offset, i) => {
    if (Math.random() < 0.8) playBell(chord[(i + step) % chord.length], now + offset);
  });
  step += 1;
}

function notify() { listeners.forEach((listener) => listener(enabled)); }

export const audio = {
  get enabled() { return enabled; },
  onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  async setEnabled(value) {
    enabled = Boolean(value);
    try { localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off'); } catch { /* storage unavailable */ }
    try {
      if (enabled) {
        ensureGraph();
        await context.resume();
        master.gain.cancelScheduledValues(context.currentTime);
        master.gain.linearRampToValueAtTime(0.9, context.currentTime + 1.5);
        if (!timer) { schedule(); timer = setInterval(schedule, 6500); }
      } else if (context) {
        master.gain.cancelScheduledValues(context.currentTime);
        master.gain.linearRampToValueAtTime(0, context.currentTime + 0.6);
        clearInterval(timer);
        timer = null;
        setTimeout(() => { if (!enabled) context.suspend(); }, 700);
      }
    } catch (error) {
      console.warn('[audio]', error);
      enabled = false;
    }
    notify();
  },
  toggle() { return this.setEnabled(!enabled); },
  /** Resumes playback on the first user gesture if the preference was "on". */
  resumeOnGesture() {
    if (!enabled) return;
    enabled = false;
    const start = (event) => {
      if (event.target?.closest?.('[data-audio-toggle]')) return cleanup();
      cleanup();
      this.setEnabled(true);
    };
    const cleanup = () => {
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
    };
    window.addEventListener('pointerdown', start);
    window.addEventListener('keydown', start);
    notify();
  },
};

document.addEventListener('visibilitychange', () => {
  if (!context || !enabled) return;
  if (document.hidden) context.suspend(); else context.resume();
});
