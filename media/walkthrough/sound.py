# 5-minute calm bed for the walkthrough: slow pad, soft section swells, a very light tick on each camera move.
import json, wave, numpy as np
from scipy.signal import lfilter
import sys; SR = 48000; D = float(sys.argv[1]) if len(sys.argv) > 1 else 300.0; N = int(SR * D); t = np.arange(N) / SR
rng = np.random.default_rng(3); noise = rng.standard_normal(N)
def lp(x, fc): a = np.exp(-2 * np.pi * fc / SR); return lfilter([1 - a], [1, -a], x)
out = np.zeros(N)
def add(tc, s):
    i0 = int(tc * SR); n = min(len(s), N - i0)
    if n > 0 and i0 >= 0: out[i0:i0 + n] += s[:n]
prog = [[73.4, 110, 146.8, 220, 277.2], [65.4, 98, 130.8, 196, 246.9], [58.3, 87.3, 116.5, 174.6, 220], [69.3, 103.8, 138.6, 207.7, 261.6]]
seg = 12.0
for i, tc in enumerate(np.arange(0, D, seg)):
    fs = prog[i % 4]; n = int((seg + 3) * SR); tt = np.arange(n) / SR; s = np.zeros(n)
    for k, f in enumerate(fs):
        for det in (-.15, .15): s += np.sin(2 * np.pi * (f + det * (k + 1)) * tt + k + i) * (.05 if k else .07) * (1 + .25 * np.sin(2 * np.pi * .05 * tt + k))
    e = np.minimum(1, np.minimum(tt / 2.5, (n / SR - tt) / 2.5)); add(tc - 1.5, s * e)
out += lp(lp(noise, 600), 600) * .04
tl = json.load(open(sys.argv[2] if len(sys.argv) > 2 else '/tmp/claude-0/walk/timeline.json'))
for s in tl:
    if s['kicker'] in ('WALKTHROUGH', 'LIVE DEMO', 'AI ECONOMICS', 'GEN7') and s['dur'] < 8:
        n = int(3 * SR); tt = np.arange(n) / SR; add(s['start'] - .4, lp(noise[:n] * np.exp(-((tt - 1.0) / .45) ** 2), 1400) * .25)
    else:
        n = int(.02 * SR); add(s['start'], np.sin(2 * np.pi * 1800 * np.arange(n) / SR) * np.exp(-np.linspace(0, 7, n)) * .025)
fade = np.minimum(1, t / 2) * np.minimum(1, (D - t) / 3)
out = out * fade; out = out / np.max(np.abs(out)) * .5
st = np.stack([out, np.roll(out, 480)], 1)
with wave.open(f'/tmp/claude-0/walk/bed{int(D)}.wav', 'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((st * 32767).astype(np.int16).tobytes())
print('ok')
