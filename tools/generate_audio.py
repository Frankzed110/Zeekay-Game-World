#!/usr/bin/env python3
"""Procedural audio generator for Zeekay Game World.

Synthesizes every music loop and sound effect used by the game and writes
them as 22050 Hz / mono / 16-bit PCM WAV files into
``frontend/assets/audio/`` (relative to the repository root).

Usage (from the repository root):

    python3 tools/generate_audio.py

Requirements: Python 3 + numpy only. Output is deterministic (fixed RNG seed),
so reruns produce byte-identical files. Music loops are 8 bars long and are
made seamless by wrapping note tails into the head with a short crossfade.
"""
import math
import wave
from pathlib import Path

import numpy as np

SR = 22050
PEAK = 0.89  # about -1 dBFS
OUT_DIR = Path(__file__).resolve().parent.parent / "frontend" / "assets" / "audio"
rng = np.random.default_rng(1234)

MAJOR = [0, 2, 4, 5, 7, 9, 11]
LYDIAN = [0, 2, 4, 6, 7, 9, 11]
DORIAN = [0, 2, 3, 5, 7, 9, 10]
PHRYGIAN = [0, 1, 3, 5, 7, 8, 10]
AEOLIAN = [0, 2, 3, 5, 7, 8, 10]


# ---------------------------------------------------------------- primitives
def midi(n):
    return 440.0 * 2.0 ** ((n - 69) / 12.0)


def times(n):
    return np.arange(n) / SR


def secs(s):
    return max(1, int(round(s * SR)))


def env(n, a, d, s, r):
    """Piecewise-linear ADSR over n samples; a/d/r in seconds, s = level."""
    T = n / SR
    pts = np.maximum.accumulate(np.clip([0, a, a + d, T - r, T], 0, T))
    return np.interp(times(n), pts, [0, 1, s, s, 0])


def lowpass(x, cutoff_hz):
    """One-pole lowpass, applied exactly in the frequency domain (fast)."""
    x = np.asarray(x, float)
    a = 1.0 - math.exp(-2 * math.pi * min(cutoff_hz, 0.49 * SR) / SR)
    n = len(x)
    m = n + int(min(4 * SR, 14 / a)) + 16
    X = np.fft.rfft(x, m)
    z = np.exp(-2j * np.pi * np.arange(len(X)) / m)
    return np.fft.irfft(X * (a / (1 - (1 - a) * z)), m)[:n]


def highpass(x, cutoff_hz):
    return x - lowpass(x, cutoff_hz)


def bandpass(x, lo, hi):
    return lowpass(highpass(x, lo), hi)


def sine(freq, t):
    """Sine partial, silenced above ~Nyquist to avoid aliasing."""
    return np.sin(2 * np.pi * freq * t) if freq < 0.45 * SR else np.zeros_like(t)


def osc(kind, freq, n):
    t = times(n)
    ph = (freq * t) % 1.0
    if kind == "sine":
        return np.sin(2 * np.pi * ph)
    if kind == "tri":
        return 4 * np.abs(ph - 0.5) - 1
    if kind == "saw":
        return lowpass(2 * ph - 1, min(freq * 6, 6000)) * 1.3
    if kind == "square":
        return lowpass(np.where(ph < 0.5, 1.0, -1.0), min(freq * 5, 5000)) * 0.9
    raise ValueError(kind)


def noise(n):
    return rng.standard_normal(n)


def sweep(f0, f1, n, tau=None):
    """Sine whose pitch glides f0 -> f1 (exponentially if tau given)."""
    t = times(n)
    f = f1 + (f0 - f1) * np.exp(-t / tau) if tau else f0 * (f1 / f0) ** (t / t[-1])
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def decay(n, tau, attack=0.002):
    t = times(n)
    return np.exp(-t / tau) * (1 - np.exp(-t / attack))


def place(buf, x, pos_s, gain=1.0):
    i = int(round(pos_s * SR))
    if i < len(buf):
        seg = x[: len(buf) - i]
        buf[i:i + len(seg)] += gain * seg


# ---------------------------------------------------------------- percussion
def kick(n):
    t = times(n)
    body = sweep(130, 45, n, tau=0.04) * np.exp(-t / 0.18)
    click = lowpass(noise(n), 3000) * np.exp(-t / 0.004) * 0.25
    return body + click


def hat(n):
    return highpass(noise(n), 7000) * decay(n, 0.018, 0.0005)


def drum(n, pitch):
    """Tom / war drum: pitched membrane plus a filtered skin slap."""
    t = times(n)
    body = sweep(pitch * 1.6, pitch, n, tau=0.03) * np.exp(-t / 0.3)
    skin = lowpass(noise(n), pitch * 8) * np.exp(-t / 0.05) * 0.5
    return body + skin


# ---------------------------------------------------------------- voices
def voice(kind, f, dur):
    n = secs(dur)
    t = times(n)
    if kind == "marimba":
        return (np.sin(2 * np.pi * f * t) * decay(n, 0.35)
                + 0.3 * sine(4 * f, t) * decay(n, 0.05)
                + 0.12 * sine(10 * f, t) * decay(n, 0.015))
    if kind == "saw":
        return lowpass(osc("saw", f, n), min(f * 3, 2400)) * env(n, 0.01, 0.15, 0.55, 0.08)
    if kind == "bell":
        n = secs(dur + 1.4)
        t = times(n)
        tone = 0.7 * np.sin(2 * np.pi * f * t) + 0.3 * osc("tri", f, n)
        return (tone * decay(n, 1.1, 0.004)
                + 0.18 * sine(2.76 * f, t) * decay(n, 0.4)
                + 0.08 * sine(5.4 * f, t) * decay(n, 0.15))
    if kind == "pluck":
        return (osc("tri", f, n) + 0.5 * lowpass(osc("saw", f, n), f * 2.5)) * decay(n, 0.22)
    if kind == "soft":
        return (osc("sine", f, n) + 0.3 * osc("tri", f, n)) * env(n, 0.03, 0.25, 0.6, 0.25)
    if kind == "warm":  # pad
        x = osc("sine", f, n) + 0.4 * osc("tri", f * 1.003, n) + 0.3 * osc("tri", f * 0.997, n)
        return x * env(n, 0.45, 0.5, 0.8, 0.6)
    if kind == "sawpad":
        x = osc("saw", f * 0.996, n) + osc("saw", f * 1.004, n)
        return lowpass(x, 900) * 0.6 * env(n, 0.35, 0.5, 0.8, 0.6)
    if kind == "bass":
        return lowpass(osc("sine", f, n) + 0.4 * osc("tri", f, n), 600) * env(n, 0.006, 0.1, 0.7, 0.05)
    if kind == "sawbass":
        return lowpass(osc("saw", f, n), 420) * 1.4 * env(n, 0.005, 0.1, 0.6, 0.04)
    raise ValueError(kind)


# ---------------------------------------------------------------- music
def deg_to_midi(tonic, scale, deg):
    octv, i = divmod(deg, 7)
    return tonic + 12 * octv + scale[i]


def root_degree(tonic, scale, root):
    idx = scale.index((root - tonic) % 12)
    return idx + 7 * ((root - tonic - scale[idx]) // 12)


def seamless(buf, n, fade_s=0.08):
    """Wrap everything past the loop end into the head, crossfading the
    tail into the first ~80 ms so the loop point is click-free."""
    out = buf[:n].copy()
    over = buf[n:]
    f = secs(fade_s)
    out[:f] *= np.linspace(0, 1, f)
    out[:len(over)] += over
    return out


BASS_PAT = [0, 0, 7, 0, 12, 0, 7, 0]  # semitones over the bar root, eighths


def music(bpm, bars, prog, lead, bass, pad, pattern, perc):
    """lead = (voice, scale, octave_offset); prog = bar roots (tonic first)."""
    beat = 60.0 / bpm
    bar = 4 * beat
    s16 = beat / 4
    n = secs(bars * bar)
    tail = secs(max(3.0, 2 * bar))
    L, M = np.zeros(n + tail), np.zeros(n + tail)
    lv, scale, loct = lead
    tonic = prog[0]
    K, H = kick(secs(0.4)), hat(secs(0.07))
    D1, D2 = drum(secs(0.6), 70), drum(secs(0.45), 120)
    sk = secs(0.09)
    SK = highpass(noise(sk), 3500) * env(sk, 0.012, 0.05, 0.0, 0.0)
    sh = secs(1.4)
    SH = highpass(noise(sh), 6000) * env(sh, 0.5, 0.2, 0.6, 0.7)
    sw = secs(2 * bar)
    SW = (np.sin(2 * np.pi * 48 * times(sw)) + 0.6 * lowpass(noise(sw), 250)) \
        * np.sin(np.pi * times(sw) / (2 * bar)) ** 2

    for b in range(bars):
        root = prog[b % len(prog)]
        t0 = b * bar
        d0 = root_degree(tonic, scale, root)
        for k in (0, 2, 4):  # diatonic triad pad
            place(M, voice(pad, midi(deg_to_midi(tonic, scale, d0 + k) + 12), bar + 0.6), t0, 0.11)
        for i, off in enumerate(BASS_PAT):
            place(M, voice(bass, midi(root - 12 + off), beat / 2 * 0.9),
                  t0 + i * beat / 2, 0.3 if i % 4 == 0 else 0.22)
        pat = pattern[::-1] if b % 4 == 3 else pattern
        step = bar / len(pat)
        for i, off in enumerate(pat):
            if off is not None:
                f = midi(deg_to_midi(tonic, scale, d0 + off) + loct)
                place(L, voice(lv, f, step * 1.8), t0 + i * step, 0.25)

        if perc == "soft":
            hits = [(K, 0, 0.45), (K, 8, 0.35)] + [(H, s, 0.1) for s in (2, 6, 10, 14)]
        elif perc == "war":
            hits = ([(K, 0, 0.6), (K, 8, 0.5)] + [(D1, s, 0.5) for s in (0, 3, 6, 8, 11)]
                    + [(D2, s, 0.32) for s in (12, 14)] + [(H, s, 0.06) for s in range(0, 16, 2)])
            if b % 4 == 3:
                hits += [(D2, s, 0.12 + 0.04 * (s - 8)) for s in range(8, 16)]
        elif perc == "air":
            hits = [(SH, 0, 0.07), (SH, 8, 0.05), (H, 6, 0.04), (H, 14, 0.04)]
            hits += [(K, 0, 0.3)] if b % 2 == 0 else []
        elif perc == "tide":
            hits = [(SK, s, (0.08, 0.03, 0.055, 0.03)[s % 4]) for s in range(16)]
            hits += [(K, 0, 0.4), (K, 10, 0.25)] + ([(SW, 0, 0.16)] if b % 2 == 0 else [])
        else:
            raise ValueError(perc)
        for x, s, g in hits:
            place(M, x, t0 + s * s16, g)

    L, M = seamless(L, n), seamless(M, n)
    d = secs(beat * 0.75)  # dotted-eighth echo on the lead, wrapped circularly
    L = L + 0.28 * np.roll(L, d) + 0.1 * np.roll(L, 2 * d)
    return M + L


# ---------------------------------------------------------------- sfx
def sfx_draw():
    n = secs(0.9)
    t = times(n)
    r = t / t[-1]
    nz = noise(n)
    swell = (bandpass(nz, 300, 1500) * (1 - r) + bandpass(nz, 800, 4000) * r)
    swell *= r ** 1.5 * env(n, 0.0, 0.0, 1.0, 0.08)
    imp = np.zeros(n)
    pos = 0.1
    while pos < 0.85:
        imp[secs(pos)] = rng.uniform(0.4, 1.0) * (0.4 + pos)
        pos += rng.uniform(0.018, 0.045)
    k = secs(0.03)
    kern = np.sin(2 * np.pi * 260 * times(k)) * np.exp(-times(k) / 0.006)
    creak = lowpass(np.convolve(imp, kern)[:n], 2000)
    return 0.5 * swell + 0.6 * creak


def sfx_release():
    n = secs(0.6)
    t = times(n)
    ph = np.cumsum(196 * (1 + 0.05 * np.exp(-t / 0.02))) / SR
    twang = (np.sin(2 * np.pi * ph) + 0.4 * lowpass(2 * (ph % 1) - 1, 1800)) * decay(n, 0.12, 0.001)
    nz = noise(n)
    r = np.minimum(t / 0.35, 1)
    whoosh = (bandpass(nz, 3000, 6000) * (1 - r) + bandpass(nz, 500, 1500) * r) * np.sin(np.pi * r)
    return 0.7 * twang + 0.6 * whoosh


def sfx_hit(n=None):
    n = n or secs(0.3)
    t = times(n)
    slap = lowpass(noise(n), 2500) * np.exp(-t / 0.025)
    body = sweep(160, 60, n, tau=0.03) * decay(n, 0.06, 0.001)
    return 0.8 * slap + body


def sfx_crit():
    n = secs(0.9)
    t = times(n)
    ring = sum(a * sine(f, t) for f, a in ((1568, 0.4), (2349, 0.25), (3136, 0.15)))
    return sfx_hit(n) + ring * decay(n, 0.35, 0.01)


def sfx_thud():
    def impact(n):
        t = times(n)
        return sweep(95, 38, n, tau=0.05) * decay(n, 0.12) + 1.5 * lowpass(noise(n), 350) * np.exp(-t / 0.05)
    out = np.zeros(secs(0.6))
    place(out, impact(secs(0.45)), 0.0)
    place(out, impact(secs(0.3)), 0.16, 0.45)
    return out


def sfx_explosion():
    n = secs(1.4)
    t = times(n)
    nz = noise(n)
    r = np.minimum(t / 0.6, 1)
    body = (lowpass(nz, 4000) * (1 - r) + lowpass(nz, 500) * r) * decay(n, 0.35, 0.005)
    boom = sweep(70, 28, n, tau=0.3) * decay(n, 0.45, 0.004)
    crackle = lowpass(nz * (rng.random(n) > 0.995), 3000) * np.exp(-t / 0.3) * 3
    return 0.9 * body + 1.2 * boom + crackle


def arpeggio(notes, gap, dur, kind="bell", total=None):
    out = np.zeros(secs(total or (gap * len(notes) + dur + 1.4)))
    for i, m in enumerate(notes):
        place(out, voice(kind, midi(m), dur), i * gap, 0.6)
    return out


def sfx_pickup():
    x = arpeggio([76, 80, 83, 88], 0.07, 0.2, total=0.85)
    return x * env(len(x), 0, 0, 1, 0.15)


def sfx_ui():
    n = secs(0.12)
    t = times(n)
    return np.sin(2 * np.pi * 1100 * t) * decay(n, 0.025, 0.001) + 0.3 * np.sin(2 * np.pi * 2200 * t) * decay(n, 0.01, 0.001)


def sfx_blocked():
    n = secs(0.55)
    t = times(n)
    parts = ((523, 0.5, 0.25), (1187, 0.4, 0.18), (1742, 0.35, 0.12), (2463, 0.25, 0.09), (3311, 0.15, 0.06))
    ring = sum(a * (sine(f, t) + 0.6 * sine(f * 1.004, t)) * decay(n, tau, 0.0005) for f, a, tau in parts)
    click = highpass(noise(n), 2000) * np.exp(-t / 0.005)
    return ring + 0.6 * click


def sfx_hurt():
    n = secs(0.4)
    t = times(n)
    f = 105 + 45 * np.exp(-t / 0.12) + 4 * np.sin(2 * np.pi * 28 * t)
    ph = np.cumsum(f) / SR
    src = lowpass(2 * (ph % 1) - 1, 900) + 0.3 * bandpass(noise(n), 300, 1500)
    return (0.6 * src + bandpass(src, 400, 1200)) * env(n, 0.01, 0.1, 0.6, 0.18)


def jingle(win):
    if win:
        x = arpeggio([72, 76, 79, 84], 0.12, 0.3, total=2.2)
        chord = sum(voice("warm", midi(m), 1.6) for m in (60, 64, 67))
        place(x, chord, 0.48, 0.15)
        return x * env(len(x), 0, 0, 1, 0.3)
    x = arpeggio([67, 63, 60, 55], 0.28, 0.5, kind="soft", total=2.4)
    place(x, sum(voice("warm", midi(m), 1.6) for m in (48, 55, 51)), 0.84, 0.12)
    return lowpass(x, 2500) * env(len(x), 0, 0, 1, 0.4)


def sfx_levelup():
    x = arpeggio([72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96], 0.07, 0.15, total=1.4)
    n = len(x)
    x += highpass(noise(n), 6000) * env(n, 0.6, 0.2, 0.5, 0.5) * 0.08
    return x * env(n, 0, 0, 1, 0.25)


# ---------------------------------------------------------------- output
def write_wav(path, x):
    x = np.asarray(x, float)
    x = x - x.mean() if len(x) > SR else x
    x = x * (PEAK / max(np.max(np.abs(x)), 1e-9))
    data = np.clip(np.round(x * 32767), -32768, 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


MUSIC = {
    "music_forest": (84, 8, [53, 55, 50, 48, 53, 55, 57, 48], ("marimba", LYDIAN, 24),
                     "bass", "warm", [0, 2, 4, 7, 4, 2, 4, 2], "soft"),
    "music_ember": (112, 8, [52, 53, 52, 50, 52, 53, 55, 50], ("saw", PHRYGIAN, 12),
                    "sawbass", "sawpad", [0, None, 0, 2, 4, None, 2, 1], "war"),
    "music_frost": (68, 8, [57, 53, 48, 55, 57, 53, 55, 52], ("bell", AEOLIAN, 24),
                    "bass", "warm", [7, None, 4, None, 2, None, 4, None], "air"),
    "music_isles": (104, 8, [50, 55, 50, 48, 50, 55, 57, 48], ("pluck", DORIAN, 24),
                    "bass", "warm", [0, 4, 7, 4, 2, 4, 9, 4], "tide"),
    "music_title": (76, 8, [48, 56, 51, 58, 48, 56, 53, 55], ("soft", AEOLIAN, 24),
                    "bass", "warm", [4, None, 2, None, 0, None, 2, 4], "soft"),
    "music_boss": (126, 8, [50, 51, 50, 48, 50, 51, 53, 51], ("saw", PHRYGIAN, 12),
                   "sawbass", "sawpad", [0, 0, 1, 0, 4, 0, 3, 1, 0, 0, 1, 0, 5, 4, 3, 1], "war"),
}

SFX = {
    "sfx_draw": sfx_draw, "sfx_release": sfx_release, "sfx_hit": sfx_hit,
    "sfx_crit": sfx_crit, "sfx_thud": sfx_thud, "sfx_explosion": sfx_explosion,
    "sfx_pickup": sfx_pickup, "sfx_ui": sfx_ui, "sfx_blocked": sfx_blocked,
    "sfx_hurt": sfx_hurt, "sfx_victory": lambda: jingle(True),
    "sfx_defeat": lambda: jingle(False), "sfx_levelup": sfx_levelup,
}


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    count = 0
    jobs = [(k, lambda a=a: music(*a)) for k, a in MUSIC.items()] + list(SFX.items())
    for name, fn in jobs:
        x = fn()
        if name.startswith("sfx_"):  # 5 ms fade-out so one-shots end on silence
            x[-secs(0.005):] *= np.linspace(1, 0, secs(0.005))
        path = OUT_DIR / f"{name}.wav"
        write_wav(path, x)
        count += 1
        print(f"wrote {path.relative_to(OUT_DIR.parent.parent.parent)}  ({len(x) / SR:.2f} s)")
    print(f"{count} files written to {OUT_DIR}")


if __name__ == "__main__":
    main()
