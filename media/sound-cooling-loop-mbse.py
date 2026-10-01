# Soundtrack for the Cooling Loop A MBSE cinematic: a calm synthesized pad following the chapters plus sparse cues.
# Deterministic (seeded). Usage: python3 sound-cooling-loop-mbse.py out.wav
import sys, wave, numpy as np
from scipy.signal import lfilter
SR, D = 48000, 104.0; N = int(SR * D); t = np.arange(N) / SR
SC = dict(title=0, recap=6, future=15, reason=23, ask=33, who=41, base=48, sim=56, trace=63.5, eng=70.5, cmp=78.5, ver=86.5, decide=92.5, end=97.5)
rng = np.random.default_rng(29); noise = rng.standard_normal(N)
def lp(x, fc): a = np.exp(-2 * np.pi * fc / SR); return lfilter([1 - a], [1, -a], x)
L = np.zeros(N); Rr = np.zeros(N)
def add(tc, s, pan=0.0):
    i0 = int(tc * SR); n = min(len(s), N - i0)
    if n > 0: L[i0:i0 + n] += s[:n] * (1 - pan) ** .5; Rr[i0:i0 + n] += s[:n] * (1 + pan) ** .5
def env(n, a, r): e = np.ones(n); ka, kr = int(a * SR), int(r * SR); e[:ka] = np.linspace(0, 1, ka); e[-kr:] *= np.linspace(1, 0, kr); return e
chords = [(0, SC['future'], [73.4, 146.8, 220, 293.7, 349.2]), (SC['future'], SC['ask'], [65.4, 130.8, 196, 261.6, 311.1]),
          (SC['ask'], SC['sim'], [58.3, 116.5, 174.6, 233.1, 293.7]), (SC['sim'], SC['eng'], [55.0, 110, 164.8, 220, 261.6]),
          (SC['eng'], SC['decide'], [61.7, 123.5, 185, 246.9, 311.1]), (SC['decide'], D, [73.4, 146.8, 220, 293.7, 370])]
for a, b, fs in chords:
    n = int((b - a + 1.5) * SR); tt = np.arange(n) / SR; s = np.zeros(n)
    for k, f in enumerate(fs):
        for det in (-.12, .12): s += np.sin(2 * np.pi * (f + det * (k + 1)) * tt + k) * (.05 if k else .08) * (1 + .3 * np.sin(2 * np.pi * .07 * tt + k))
    add(max(0, a - .75), s * env(n, 1.5, 1.5) * .9)
air = lp(lp(noise, 700), 700) * .05 * np.clip(t / 3, 0, 1); L += air; Rr += np.roll(air, 999)
def tick(tc, f=2600, g=.03, pan=0): n = int(.016 * SR); add(tc, np.sin(2 * np.pi * f * np.arange(n) / SR) * np.exp(-np.linspace(0, 7, n)) * g, pan)
def whoosh(tc, w=.6, g=.07, fc=1400): i0 = max(0, int((tc - 2.5 * w) * SR)); n = int(5 * w * SR); tt = np.arange(n) / SR - 2.5 * w; add(i0 / SR, lp(noise[i0:i0 + n] * np.exp(-(tt / w) ** 2), fc) * g * 3)
def bell(tc, f, g=.045, dec=2.5, pan=0): n = int(3 * SR); tt = np.arange(n) / SR; add(tc, (np.sin(2 * np.pi * f * tt) + .3 * np.sin(2 * np.pi * f * 2.01 * tt)) * np.exp(-tt * dec) * g, pan)
def pulse(tc, f=55, g=.16, dec=2.2): n = int(2.5 * SR); tt = np.arange(n) / SR; add(tc, np.sin(2 * np.pi * f * tt) * np.exp(-tt * dec) * (1 - np.exp(-tt * 60)) * g)
for k, v in SC.items():
    if v > 0: whoosh(v + .2, .5, .05)
bell(1.0, 440, .03); bell(SC['recap'] + 5.6, 523.3, .035)
pulse(SC['future'] + 2.9, 49, .2); pulse(SC['future'] + 4.3, 49, .14)
for i in range(4): tick(SC['reason'] + 1.9 + i * .9, 1500, .03)
bell(SC['reason'] + 5.7, 349.2, .04)
for i in range(9): tick(SC['ask'] + 3.0 + i * .42, 2400 + 80 * i, .025, np.sin(i))
bell(SC['who'] + 1.0, 587.3, .035)
for i in range(4): tick(SC['sim'] + 1.0 + i * .6, 2000, .03)
pulse(SC['sim'] + 3.7, 46, .18)
bell(SC['eng'] + 1.4, 659.3, .035); bell(SC['cmp'] + 2.5, 784, .04)
bell(SC['ver'] + 1.7, 880, .035)
bell(SC['end'] + .6, 440, .04); bell(SC['end'] + 1.2, 659.3, .035)
fade = np.clip((D - t) / 2.5, 0, 1) * np.clip(t / .8, 0, 1); L *= fade; Rr *= fade
m = max(np.abs(L).max(), np.abs(Rr).max()); L, Rr = L / m * .7, Rr / m * .7
out = (np.stack([L, Rr], 1) * 32767).astype(np.int16)
with wave.open(sys.argv[1], 'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(out.tobytes())
print('wrote', sys.argv[1])
