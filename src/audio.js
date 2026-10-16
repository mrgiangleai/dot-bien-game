// Âm thanh tổng hợp bằng WebAudio (không cần file âm thanh).
let ctx = null, master = null, noiseBuf = null, lastShot = 0;

export function initAudio() {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.45;
      master.connect(ctx.destination);
      const len = ctx.sampleRate;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch (e) { ctx = null; }
}

function noise({ dur = 0.1, freq = 1200, q = 1, vol = 0.5, type = 'lowpass', delay = 0 }) {
  if (!ctx || vol < 0.01) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

function tone({ freq = 440, freq2 = freq, dur = 0.1, vol = 0.2, type = 'square', delay = 0 }) {
  if (!ctx || vol < 0.01) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(freq2, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

const att = (d) => Math.max(0, 1 - d / 55);

export const sfx = {
  shot(d, local) {
    if (!ctx) return;
    if (!local) {
      if (ctx.currentTime - lastShot < 0.045) return;
      lastShot = ctx.currentTime;
    }
    const v = local ? 1 : att(d) * 0.7;
    noise({ dur: 0.08, freq: 2600, vol: 0.45 * v });
    noise({ dur: 0.14, freq: 420, vol: 0.6 * v });
  },
  knife(d = 0) { noise({ dur: 0.12, freq: 3200, type: 'bandpass', q: 2, vol: 0.3 * att(d) }); },
  claw(d = 0) { noise({ dur: 0.15, freq: 900, type: 'bandpass', q: 3, vol: 0.35 * att(d) }); },
  hit(head) { tone({ freq: head ? 1500 : 950, freq2: head ? 2200 : 1300, dur: 0.05, vol: 0.12, type: 'triangle' }); },
  explode(d) {
    const v = att(d * 0.6);
    noise({ dur: 0.9, freq: 280, vol: 1.0 * v });
    noise({ dur: 0.3, freq: 1600, vol: 0.4 * v });
  },
  reload() {
    tone({ freq: 300, freq2: 260, dur: 0.06, vol: 0.12, delay: 0.1 });
    tone({ freq: 500, freq2: 420, dur: 0.06, vol: 0.12, delay: 1.5 });
  },
  infect(d = 0) { tone({ freq: 220, freq2: 70, dur: 0.45, vol: 0.25 * att(d), type: 'sawtooth' }); },
  round() { tone({ freq: 440, freq2: 880, dur: 0.35, vol: 0.18, type: 'triangle' }); },
};
