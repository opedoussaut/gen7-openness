# Soundtrack for the System 1 / System 2 cinematic: a calm synthesized pad plus sparse cues that follow the picture.
# System 1 cues are short and crisp (parallel ticks); System 2 cues are slow, low pulses. Deterministic (seeded).
import sys, wave, numpy as np
from scipy.signal import lfilter
SR, D = 48000, 52.5; N = int(SR * D); t = np.arange(N) / SR
rng = np.random.default_rng(17); noise = rng.standard_normal(N)
def lp(x, fc): a = np.exp(-2 * np.pi * fc / SR); return lfilter([1 - a], [1, -a], x)
L = np.zeros(N); Rr = np.zeros(N)
def add(tc, s, pan=0.0):
    i0 = int(tc * SR); n = min(len(s), N - i0)
    if n > 0: L[i0:i0 + n] += s[:n] * (1 - pan) ** .5; Rr[i0:i0 + n] += s[:n] * (1 + pan) ** .5
def env(n, a, r): e = np.ones(n); ka, kr = int(a * SR), int(r * SR); e[:ka] = np.linspace(0, 1, ka); e[-kr:] *= np.linspace(1, 0, kr); return e
# pad: slow chord changes that follow the scenes (D minor colour → brighter at the end)
chords = [(0, 13, [73.4, 146.8, 220, 293.7, 349.2]), (13, 25, [65.4, 130.8, 196, 261.6, 329.6]), (25, 38, [58.3, 116.5, 174.6, 233.1, 293.7]),
          (38, 47, [69.3, 138.6, 207.7, 277.2, 349.2]), (47, 52.5, [73.4, 146.8, 220, 293.7, 370])]
for a, b, fs in chords:
    n = int((b - a + 1.5) * SR); tt = np.arange(n) / SR; s = np.zeros(n)
    for k, f in enumerate(fs):
        for det in (-.12, .12): s += np.sin(2 * np.pi * (f + det * (k + 1)) * tt + k) * (.05 if k else .08) * (1 + .3 * np.sin(2 * np.pi * .07 * tt + k))
    add(max(0, a - .75), s * env(n, 1.5, 1.5) * .9, pan=0)
air = lp(lp(noise, 700), 700) * .06 * (0.5 + 0.5 * np.clip(t / 3, 0, 1)); L += air; Rr += np.roll(air, 999)
def tick(tc, f=2600, g=.04, pan=0): n = int(.016 * SR); add(tc, np.sin(2 * np.pi * f * np.arange(n) / SR) * np.exp(-np.linspace(0, 7, n)) * g, pan)
def whoosh(tc, w=.6, g=.08, fc=1400): i0 = max(0, int((tc - 2.5 * w) * SR)); n = int(5 * w * SR); tt = np.arange(n) / SR - 2.5 * w; add(i0 / SR, lp(noise[i0:i0 + n] * np.exp(-(tt / w) ** 2), fc) * g * 3)
def bell(tc, f, g=.05, dec=2.5, pan=0): n = int(3 * SR); tt = np.arange(n) / SR; add(tc, (np.sin(2 * np.pi * f * tt) + .3 * np.sin(2 * np.pi * f * 2.01 * tt)) * np.exp(-tt * dec) * g, pan)
def pulse(tc, f=55, g=.18, dec=2.2): n = int(2.5 * SR); tt = np.arange(n) / SR; add(tc, np.sin(2 * np.pi * f * tt) * np.exp(-tt * dec) * (1 - np.exp(-tt * 60)) * g)
def boom(tc, g=.35): n = int(4 * SR); tt = np.arange(n) / SR; add(tc, (np.sin(2 * np.pi * 41 * tt) * .6 + np.sin(2 * np.pi * 61.5 * tt) * .25) * np.exp(-tt * 1.2) * g)
# complexity: scattered data glints; groom: descending filter glints
for k in range(60): tick(1.5 + rng.random() * 5, 1800 + rng.random() * 2200, .012 + rng.random() * .01, rng.random() * 1.6 - .8)
for k in range(46): tc = 7.2 + k * .09; tick(tc, 3000 - k * 35, .02, np.sin(k))
bell(12.2, 587.3, .045)
# decide: four crisp, near-simultaneous readouts
whoosh(13.3, .4, .06); bell(14.25, 880, .035, 5)
for i in range(4): tick(14.3 + i * .05, 2200 + i * 330, .06, -.3 + i * .2)
# gate: confident path glides; uncertain path halts, then escalates
tick(21.8, 1760, .05, .5); bell(22.1, 311.1, .04, 3); pulse(23.2, 73.4, .14); whoosh(23.6, .5, .06)
# reason: slow, deep, deliberate pulses
for k, tc in enumerate(np.arange(26.0, 32.2, 1.4)): pulse(tc, [55, 65.4, 58.3, 73.4][k % 4], .16, 1.6)
whoosh(32.9, .8, .08, 900)
# act: skill calls, each passing through its governed connection
for i in range(3): tick(35.6 + i * .7, 1320, .05); tick(35.8 + i * .7, 1980, .035)
# people: three warm tones as accountability rings complete
for i, f in enumerate([392, 493.9, 587.3]): bell(40.9 + i * .35, f, .045, 2.2, -.5 + i * .5)
# measure: counters
for k in range(24): tick(43.2 + k * .055, 1500 + k * 40, .025)
# ending: backbone steps, then title
for i in range(5): bell(47.3 + i * .35, [293.7, 349.2, 440, 523.3, 587.3][i], .03, 4)
boom(49.95, .32); bell(50.05, 1174.7, .03, 1.6)
fade = np.minimum(1, t / 1.0) * np.minimum(1, (D - t) / 1.2)
out = np.stack([L * fade, Rr * fade], 1); out = out / np.max(np.abs(out)) * .82
with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'sound.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((out * 32767).astype(np.int16).tobytes())
