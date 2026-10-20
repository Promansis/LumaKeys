#!/usr/bin/env python3
"""Analyse sitting 1 listening captures (items 5, 6, 7) made by sitting1-audio-desktop.mjs
and ../browser/sitting1-audio-web.mjs. numpy only.

Usage: python3 -I sitting1-audio-analyse.py <capture dir> [<second capture dir> ...]
Optional env REF=<dir> with decoded references (48 kHz mono float32 .f32):
  REF/classic/<clip id>.f32, REF/animals/<clip id>.f32  (soundboard clips, for item 5b)
Prints one block per capture and cross-capture comparisons for item 6.
"""
import json
import math
import os
import struct
import sys

import numpy as np

SR = 48000
NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
INTERVALS = {'perfect unison': 0, 'minor 2nd': 1, 'major 2nd': 2, 'minor 3rd': 3, 'major 3rd': 4, 'perfect 4th': 5,
             'tritone': 6, 'perfect 5th': 7, 'minor 6th': 8, 'major 6th': 9, 'minor 7th': 10, 'major 7th': 11,
             'perfect octave': 12}


def read_wav(path):
    b = open(path, 'rb').read()
    if b[:4] != b'RIFF' or b[8:12] != b'WAVE':
        raise ValueError(f'{path}: not a WAV')
    i, fmt, data = 12, None, None
    while i + 8 <= len(b):
        cid, size = b[i:i + 4], struct.unpack('<I', b[i + 4:i + 8])[0]
        body = b[i + 8:i + 8 + size]
        if cid == b'fmt ':
            tag, ch, sr, _, _, bits = struct.unpack('<HHIIHH', body[:16])
            if tag == 0xFFFE:
                tag = struct.unpack('<H', body[24:26])[0]
            fmt = (tag, ch, sr, bits)
        elif cid == b'data':
            data = b[i + 8:]  # parec may leave the size unset; take the rest
            if size and size <= len(data):
                data = data[:size]
            break
        i += 8 + size + (size & 1)
    tag, ch, sr, bits = fmt
    if tag == 3 and bits == 32:
        x = np.frombuffer(data[:len(data) // 4 * 4], dtype='<f4').astype(np.float64)
    elif tag == 1 and bits == 16:
        x = np.frombuffer(data[:len(data) // 2 * 2], dtype='<i2').astype(np.float64) / 32768
    else:
        raise ValueError(f'{path}: unsupported format {fmt}')
    x = x[:len(x) // ch * ch].reshape(-1, ch).mean(axis=1)
    if sr != SR:
        raise ValueError(f'{path}: rate {sr}')
    return x


def load(d, name):
    meta = json.load(open(os.path.join(d, name + '.json')))
    parts = [read_wav(os.path.join(d, f)) for f in meta['files']]
    n = max(len(p) for p in parts)
    x = np.zeros(n)
    for p in parts:
        x[:len(p)] += p
    return meta, x


def dbfs(v):
    return 20 * math.log10(max(float(v), 1e-15))


def env_db(x, win=480, hop=240):
    n = max(1, (len(x) - win) // hop + 1)
    idx = np.arange(win)[None, :] + hop * np.arange(n)[:, None]
    r = np.sqrt((x[idx] ** 2).mean(axis=1))
    return 20 * np.log10(np.maximum(r, 1e-15)), hop


def onsets(x, min_gap=0.15, k=0.3, nfft=1024, hop=240, comp=10.0):
    """Spectral-flux onsets on a level-independent log spectrum (first flux peak above k * max
    in each min_gap cluster). Returns times (s)."""
    if len(x) < nfft * 2:
        return []
    w = np.hanning(nfft)
    n = (len(x) - nfft) // hop
    idx = np.arange(nfft)[None, :] + hop * np.arange(n)[:, None]
    mag = np.abs(np.fft.rfft(x[idx] * w, axis=1))
    ref = mag.max() or 1.0
    lm = np.log1p(comp * mag / ref)
    flux = np.concatenate([[0], np.maximum(0, np.diff(lm, axis=0)).sum(axis=1)])
    thr = k * flux.max()
    out = []
    gap = int(min_gap * SR / hop)
    for t in range(1, len(flux) - 1):
        if flux[t] > thr and flux[t] >= flux[t - 1] and flux[t] >= flux[t + 1]:
            if out and t - out[-1] < gap:
                continue
            out.append(t)
    return [(t * hop + nfft / 2) / SR for t in out]


def f0_hps(seg, fmin=50, fmax=2100, nh=4, prev=None):
    """Harmonic-product-spectrum pitch. With prev (the same length of audio just before the
    onset), the earlier note still ringing is subtracted first, so the new note is measured."""
    if len(seg) < 2048:
        return None
    nfft = 1 << 17
    spec = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), nfft))
    if prev is not None and len(prev) == len(seg):
        spec = np.maximum(spec - 1.2 * np.abs(np.fft.rfft(prev * np.hanning(len(prev)), nfft)), 0)
    freqs = np.fft.rfftfreq(nfft, 1 / SR)
    lo, hi = int(fmin * nfft / SR), int(fmax * nfft / SR)
    hps = np.log(spec[lo:hi] + 1e-12 * spec.max()).copy()
    for h in range(2, nh + 1):
        dec = spec[::h][lo:hi]
        hps[:len(dec)] += np.log(dec + 1e-12 * spec.max())
    k = lo + int(np.argmax(hps))
    # refine on the raw spectrum near k
    a = max(k - 3, 1)
    k2 = a + int(np.argmax(spec[a:k + 4]))
    y0, y1, y2 = np.log(spec[k2 - 1:k2 + 2] + 1e-20)
    d = 0.5 * (y0 - y2) / (y0 - 2 * y1 + y2) if (y0 - 2 * y1 + y2) != 0 else 0
    f = freqs[k2] + d * SR / nfft
    # octave check: if half the frequency carries a strong partial, prefer it
    half = f / 2
    if half >= fmin:
        hb = int(round(half * nfft / SR))
        if spec[hb - 3:hb + 4].max() > 0.3 * spec[k2]:
            sub = [spec[int(round(half * m * nfft / SR)) - 2:int(round(half * m * nfft / SR)) + 3].max() for m in (1, 3, 5)]
            if min(sub) > 0.05 * spec[k2]:
                f = half
    return f


def midi_of(f):
    return 69 + 12 * math.log2(f / 440.0)


def name_of(m):
    r = int(round(m))
    return f'{NOTE_NAMES[r % 12]}{r // 12 - 1}'


def note_stats(x, t, t_next=None, t_prev=None):
    a = int(t * SR)
    b = int((t_next if t_next else t + 1.5) * SR)
    seg = x[a + int(0.03 * SR): min(b - int(0.01 * SR), a + int(0.35 * SR))]
    prev = None
    if t_prev is not None and a - len(seg) >= int(t_prev * SR):
        prev = x[a - len(seg): a]
    f = f0_hps(seg, prev=prev)
    e, hop = env_db(x)
    i0 = int(a / hop)
    i1 = min(len(e), int(b / hop)) if t_next else len(e)
    pk = e[i0:i0 + int(0.15 * SR / hop)].max() if i0 < len(e) else -300
    # time the note stays within 40 dB of its own peak (to the next onset or the end)
    tail = e[i0:i1]
    above = np.nonzero(tail > pk - 40)[0]
    dur = (above[-1] + 1) * hop / SR if len(above) else 0
    return f, pk, dur


def harmonic_profile(seg, f0, n=10):
    nfft = 1 << 17
    spec = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), nfft))
    amps = []
    for h in range(1, n + 1):
        k = int(round(h * f0 * nfft / SR))
        w = max(2, int(0.03 * h * f0 * nfft / SR))
        amps.append(spec[max(0, k - w):k + w + 1].max() if k < len(spec) else 0)
    amps = np.array(amps)
    return 20 * np.log10(np.maximum(amps, 1e-20) / max(amps.max(), 1e-20))


def centroid(seg):
    spec = np.abs(np.fft.rfft(seg * np.hanning(len(seg))))
    fr = np.fft.rfftfreq(len(seg), 1 / SR)
    return float((spec * fr).sum() / max(spec.sum(), 1e-20))


def ncc_max(a, b):
    """Max normalised cross-correlation of two equal-length-ish segments (lag search +-50 ms)."""
    n = 1 << int(math.ceil(math.log2(len(a) + len(b))))
    c = np.fft.irfft(np.fft.rfft(a, n) * np.conj(np.fft.rfft(b, n)), n)
    lag = int(0.05 * SR)
    cc = np.concatenate([c[-lag:], c[:lag + 1]])
    return float(cc.max() / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-30))


def level_line(x):
    e, _ = env_db(x)
    return f'peak {dbfs(np.abs(x).max()):.1f} dBFS, loudest 10 ms RMS {e.max():.1f} dBFS'


def describe_notes(x, label, expect_midi=None):
    ts = onsets(x)
    print(f'  {label}: {len(ts)} onsets; {level_line(x)}')
    rows = []
    for i, t in enumerate(ts):
        nxt = ts[i + 1] if i + 1 < len(ts) else None
        f, pk, dur = note_stats(x, t, nxt, ts[i - 1] if i else None)
        m = midi_of(f) if f else None
        rows.append((t, f, m, pk, dur))
        print(f'    onset {t:6.3f} s  f0 {f:7.2f} Hz  = {name_of(m)} {100 * (m - round(m)):+.0f} cents  peak {pk:6.1f} dBFS  '
              f'sounds {dur:.2f} s{" (until next onset)" if nxt else ""}' if f else f'    onset {t:6.3f} s  f0 n/a')
    if expect_midi is not None:
        got = [int(round(r[2])) for r in rows if r[2] is not None]
        ok = got == list(expect_midi)
        print(f'    expected {[name_of(m) for m in expect_midi]}, got {[name_of(m) for m in got]} -> {"MATCH" if ok else "DIFFERENT"}')
    return rows


def item5a(d, name):
    meta, x = load(d, name)
    print(f'\n[5a] {name}  capture: {meta["capture"]}')
    describe_notes(x, 'Free Play Z X C', [48, 50, 52])


def find_clip(x, ref, step_lag=True):
    """Normalised cross-correlation of a reference clip against the capture. Returns (peak ncc, time s)."""
    L = len(ref)
    if L < 1000 or len(x) < 1000:
        return 0.0, 0.0
    n = 1 << int(math.ceil(math.log2(len(x) + L)))
    c = np.fft.irfft(np.fft.rfft(x, n) * np.conj(np.fft.rfft(ref, n)), n)[:len(x)]
    cs = np.concatenate([[0], np.cumsum(x ** 2)])
    end = np.minimum(np.arange(len(x)) + L, len(x))
    local = np.sqrt(np.maximum(cs[end] - cs[:len(x)], 1e-30))
    ncc = c / (local * np.linalg.norm(ref) + 1e-30)
    ncc[local < 1e-6 * np.sqrt(cs[-1] + 1e-30)] = 0
    k = int(np.argmax(ncc))
    return float(ncc[k]), k / SR


def item5b(d, name, refdir, manifest):
    meta, x = load(d, name)
    print(f'\n[5b] {name}  capture: {meta["capture"]}; keys {meta.get("keys")} every {meta.get("gapMs")} ms')
    print(f'  {level_line(x)}')
    down = [m['t'] / 1000 for m in meta['markers'] if m['what'].startswith('down')]
    print(f'  key presses (s from capture start): {[round(t, 2) for t in down]}')
    e, hop = env_db(x)
    if e.max() < -120:
        print(f'  SILENT: no sound at all for {len(down)} presses')
        return
    floor = e.max() - 50
    active = np.nonzero(e > floor)[0]
    if len(active):
        print(f'  sound present from {active[0] * hop / SR:.2f} s to {(active[-1] + 1) * hop / SR:.2f} s '
              f'(ring time {(active[-1] - active[0] + 1) * hop / SR:.2f} s, threshold peak-50 dB)')
    found = []
    resid = x.copy()
    for _ in range(8):
        best = None
        for clip in manifest:
            p = os.path.join(refdir, clip['mode'], clip['id'] + '.f32')
            if not os.path.exists(p):
                continue
            ref = np.fromfile(p, dtype='<f4').astype(np.float64)
            v, t = find_clip(resid, ref)
            if best is None or v > best[0]:
                best = (v, t, clip, ref)
        if best is None or best[0] < 0.6:
            break
        v, t, clip, ref = best
        seg = resid[int(t * SR):int(t * SR) + len(ref)]
        g = float(np.dot(seg, ref[:len(seg)]) / (np.dot(ref[:len(seg)], ref[:len(seg)]) + 1e-30))
        # a weak partial match far below the clips already found is leftover of an imperfect
        # subtraction, not another clip
        if found and (v < 0.9 and dbfs(abs(g)) < max(dbfs(abs(f[5])) for f in found) - 30):
            break
        resid[int(t * SR):int(t * SR) + len(seg)] -= g * ref[:len(seg)]
        found.append((t, f"{clip['mode']}/{clip['id']}", clip['midi'], v, len(ref) / SR, g))
    found.sort()
    for t, cid, midi, v, dur, g in found:
        print(f'  clip {cid:16s} (key {name_of(midi)}) starts {t:6.3f} s, length {dur:.2f} s, match {v:.3f}, gain {dbfs(abs(g)):.1f} dB')
    print(f'  residual after removing found clips: {dbfs(np.sqrt((resid ** 2).mean()) + 1e-30):.1f} dB RMS vs capture {dbfs(np.sqrt((x ** 2).mean())):.1f} dB')
    ov = 0
    for i in range(len(found)):
        for j in range(i + 1, len(found)):
            a0, a1 = found[i][0], found[i][0] + found[i][4]
            b0 = found[j][0]
            if b0 < a1 - 0.02:
                ov += 1
    print(f'  {len(found)} distinct clips heard for {len(down)} presses; overlapping pairs: {ov}; max clips sounding at once: '
          f'{max([sum(1 for f in found if f[0] <= t < f[0] + f[4]) for t in np.arange(0, len(x) / SR, 0.01)] or [0])}')


def item5c(d, name):
    meta, x = load(d, name)
    stated = meta.get('statedInterval')
    semis = INTERVALS.get((stated or '').lower())
    print(f'\n[5c] {name}  stated interval: {stated} ({semis} semitones)  capture: {meta["capture"]}')
    rows = describe_notes(x, 'question audio')
    ms = [r[2] for r in rows if r[2] is not None]
    if len(ms) >= 2:
        diff = ms[1] - ms[0]
        print(f'  measured: {name_of(ms[0])} then {name_of(ms[1])}, {diff:+.2f} semitones; gap between onsets {rows[1][0] - rows[0][0]:.3f} s'
              f' -> {"MATCHES stated interval" if semis is not None and abs(diff - semis) < 0.3 else "DOES NOT match"}'
              f'{"; the two notes have the SAME pitch" if abs(diff) < 0.3 else "; two distinct pitches"}')


def item5d(d, name):
    meta, x = load(d, name)
    print(f'\n[5d] {name}  source {os.path.basename(meta["source"])} ({meta["sourceSeconds"]} s, {meta["sourceHz"]} Hz)  capture: {meta["capture"]}')
    print(f'  {level_line(x)}  (source file peak is -18.1 dBFS)')
    e, hop = env_db(x)
    floor = e.max() - 40
    active = np.nonzero(e > floor)[0]
    play = next((m['t'] / 1000 for m in meta['markers'] if 'Play' in m['what']), None)
    if len(active) and e.max() > -200:
        s, t = active[0] * hop / SR, (active[-1] + 1) * hop / SR
        seg = x[int(s * SR):int(t * SR)]
        spec = np.abs(np.fft.rfft(seg * np.hanning(len(seg))))
        f = np.fft.rfftfreq(len(seg), 1 / SR)[int(np.argmax(spec))]
        print(f'  sound from {s:.2f} s to {t:.2f} s ({t - s:.2f} s long; Play clicked at {play:.2f} s), dominant frequency {f:.1f} Hz')
    else:
        print('  no sound in the capture')


def item6_features(d, name):
    """One note per key-down marker: the note starts where the level first rises 6 dB above the
    level at the key press (the earlier note may still be ringing) within 0.5 s, and the
    analysed window is 20-450 ms after that start."""
    meta, x = load(d, name)
    e, hop = env_db(x)
    notes = []
    for m in meta.get('markers', []):
        if not m['what'].startswith('down '):
            continue
        label = m['what'].split()[-1]
        t_key = m['t'] / 1000
        k0 = int(t_key * SR / hop)
        base = float(e[max(0, k0 - 2): k0 + 1].max())
        win = e[k0: k0 + int(0.5 * SR / hop)]
        rise = np.nonzero((win > base + 6) & (win > e.max() - 60))[0]
        local = [(k0 + int(rise[0])) * hop / SR] if len(rise) else []
        if not local or float(np.max(np.abs(x[int(t_key * SR): int((t_key + 0.6) * SR)]))) < 1e-6:
            notes.append({'label': label, 't': t_key, 'f0': None, 'midi': None, 'peak': -300.0, 'dur': 0.0,
                          'seg': np.zeros(int(0.43 * SR)), 'cent': 0.0, 'harm': None, 'lat': None})
            continue
        t = local[0]
        a = int(t * SR)
        seg = x[a + int(0.02 * SR): a + int(0.45 * SR)]
        prev = x[a - len(seg): a] if a >= len(seg) else None
        f = f0_hps(seg, prev=prev)
        i0 = int(a / hop)
        pk = float(e[i0: i0 + int(0.3 * SR / hop)].max())
        ip = i0 + int(np.argmax(e[i0: i0 + int(0.3 * SR / hop)]))
        below = np.nonzero(e[ip:] < pk - 30)[0]
        dur = (ip - i0 + (below[0] if len(below) else len(e) - ip)) * hop / SR
        notes.append({'label': label, 't': t, 'f0': f, 'midi': midi_of(f) if f else None, 'peak': pk, 'dur': dur, 'seg': seg,
                      'cent': centroid(seg), 'harm': harmonic_profile(seg, f) if f else None, 'lat': t - t_key})
    return meta, x, notes


def item6(dirs_names):
    feats = {}
    for d, name in dirs_names:
        meta, x, notes = item6_features(d, name)
        feats[name] = notes
        print(f'\n[6] {name} ({meta.get("runtime")}, {meta.get("sound")})  capture: {meta["capture"]}')
        print(f'  {level_line(x)}; {len(notes)} key presses')
        for n in notes:
            h = ' '.join(f'{v:.0f}' for v in n['harm'][:8]) if n['harm'] is not None else '-'
            lat = f'{n["lat"] * 1000:4.0f} ms' if n['lat'] is not None else ' none '
            print(f'    key {n["label"]:3s} at {n["t"]:6.3f} s (+{lat})  heard {name_of(n["midi"]) if n["midi"] else "?":4s} f0 {n["f0"] or 0:7.2f} Hz  peak {n["peak"]:6.1f} dBFS'
                  f'  rings {n["dur"]:.2f} s to -30 dB  centroid {n["cent"]:6.0f} Hz  harmonics 1-8 (dB re strongest) {h}')
    return feats


def compare6(feats, a, b, label):
    A, B = feats.get(a), feats.get(b)
    if not A or not B:
        return
    print(f'\n[6] compare {label}: {a}  vs  {b}')
    by = {n['label']: n for n in B}
    for n in A:
        m = n['label']
        o = by.get(m)
        if not o or n['harm'] is None or o['harm'] is None:
            print(f'    {m}: missing or silent in one capture')
            continue
        L = min(len(n['seg']), len(o['seg']))
        sim = ncc_max(n['seg'][:L], o['seg'][:L])
        hd = float(np.sqrt(np.mean((n['harm'] - o['harm']) ** 2))) if n['harm'] is not None and o['harm'] is not None else float('nan')
        # log-spectral distance of the average magnitude spectra (level-normalised)
        sa = np.abs(np.fft.rfft(n['seg'][:L] * np.hanning(L)))
        sb = np.abs(np.fft.rfft(o['seg'][:L] * np.hanning(L)))
        fr = np.fft.rfftfreq(L, 1 / SR)
        band = (fr > 80) & (fr < 8000)
        la = 20 * np.log10(sa[band] / sa[band].max() + 1e-6)
        lb = 20 * np.log10(sb[band] / sb[band].max() + 1e-6)
        keep = (la > -60) | (lb > -60)
        lsd = float(np.sqrt(np.mean((la[keep] - lb[keep]) ** 2)))
        verdict = 'SAME sound' if sim > 0.9 and hd < 3 else 'DIFFERENT sound'
        print(f'    {m}: waveform match {sim:.3f}, harmonic-profile distance {hd:4.1f} dB, log-spectral distance {lsd:4.1f} dB, '
              f'level {n["peak"]:6.1f} vs {o["peak"]:6.1f} dBFS, centroid {n["cent"]:5.0f} vs {o["cent"]:5.0f} Hz -> {verdict}')


def comb_track(x, f0s, hop=240, nfft=2048, band=(2500, 16000)):
    """Per frame: fraction of 2.5-16 kHz power on the odd-harmonic comb of each click pitch."""
    n = (len(x) - nfft) // hop
    idx = np.arange(nfft)[None, :] + hop * np.arange(n)[:, None]
    spec = np.abs(np.fft.rfft(x[idx] * np.hanning(nfft), axis=1)) ** 2
    fr = np.fft.rfftfreq(nfft, 1 / SR)
    inb = (fr >= band[0]) & (fr <= band[1])
    tot = spec[:, inb].sum(axis=1) + 1e-30
    out = {}
    for f0 in f0s:
        mask = np.zeros_like(fr, dtype=bool)
        for h in range(1, 64, 2):
            fh = f0 * h
            if band[0] <= fh <= band[1]:
                mask |= np.abs(fr - fh) <= 1.5 * SR / nfft
        out[f0] = (spec[:, mask].sum(axis=1) / tot, spec[:, mask].sum(axis=1))
    times = (np.arange(n) * hop + nfft / 2) / SR
    return times, out, tot


def item7(d, name):
    meta, x = load(d, name)
    tempo = meta.get('tempo')
    print(f'\n[7] {name}  tempo {tempo} (slider shows {meta.get("tempoShown")}), song {meta.get("song")} at {meta.get("songBpm")} BPM  capture: {meta["capture"]}')
    print(f'  {level_line(x)}')
    space = next((m['t'] / 1000 for m in meta['markers'] if m['what'] == 'Space'), 0)
    beat = 60 / (meta['songBpm'] * tempo)
    print(f'  Space pressed at {space:.2f} s; the beat at this tempo lasts {beat:.3f} s of wall time')
    # clicks: Tone.Synth square wave, C5 (523.25 Hz) normal, C6 (1046.5 Hz) accent
    times, comb, tot = comb_track(x, [523.25, 1046.5])
    clicks = []
    for f0, (ratio, pw) in comb.items():
        lv = 10 * np.log10(pw + 1e-30)
        thr = lv.max() - 30
        on = (ratio > 0.5) & (lv > thr)
        k = 0
        while k < len(on):
            if on[k]:
                j = k
                while j < len(on) and on[j]:
                    j += 1
                clicks.append((times[k], f0, float(lv[k:j].max())))
                k = j + int(0.15 * SR / 240)
            else:
                k += 1
    clicks.sort()
    ci = [c for c in clicks]
    print(f'  click detector (odd-harmonic comb share > 50% in 2.5-16 kHz): {len(ci)} clicks')
    for c in ci:
        print(f'    click {c[0]:6.3f} s  {"accent C6" if c[1] > 800 else "normal C5"}  {c[2]:6.1f} dB')
    count_in = [c for c in ci if c[0] < space + 3.05]
    play = [c for c in ci if c[0] >= space + 3.05]
    gi = np.diff([c[0] for c in count_in]).round(3).tolist()
    gp = np.diff([c[0] for c in play]).round(3).tolist()
    print(f'  count-in clicks {len(count_in)} (intervals {gi}); clicks during playback {len(play)}, intervals {gp}')
    # note onsets: piano C4..F4 (fundamentals 262-349 Hz); classify onsets by f0, ignoring clicks
    ts = onsets(x, k=0.08)
    notes = []
    for i, t in enumerate(ts):
        if any(abs(t - c[0]) < 0.03 for c in ci) and not any(abs(t - c[0]) < 0.03 for c in []):
            pass
        a = int(t * SR)
        seg = x[a + int(0.03 * SR): a + int(0.2 * SR)]
        # low-pass view: f0 search 200-400 Hz
        f = f0_hps(seg, fmin=200, fmax=420, nh=3)
        if f and 240 < f < 370:
            notes.append((t, f))
    if notes:
        ng = np.diff([n[0] for n in notes]).round(3).tolist()
        print(f'  note onsets with f0 in C4-F4: {len(notes)}: ' + ', '.join(f'{t:.2f}s {name_of(midi_of(f))}' for t, f in notes))
        print(f'  note intervals {ng}; median {np.median(ng) if ng else float("nan"):.3f} s')
    if len(play) >= 2:
        med = float(np.median(gp))
        print(f'  RESULT: median click interval during playback {med:.3f} s vs beat {beat:.3f} s -> {med / beat:.2f} beats per click')
        if notes:
            first_note = notes[0][0]
            offs = [round(min(abs(c[0] - n[0]) for n in notes), 3) for c in play]
            print(f'  each playback click to the nearest note onset (s): {offs}')
    return clicks


def main():
    dirs = sys.argv[1:]
    refdir = os.environ.get('REF')
    manifest = []
    for mode, f in (('classic', 'classicSoundboardManifest.json'), ('animals', 'animalSoundboardManifest.json')):
        for c in json.load(open('/media/storage/LumaKeys/src/lib/audio/' + f)):
            manifest.append({**c, 'mode': mode})
    item6_pairs = []
    for d in dirs:
        names = sorted(f[:-5] for f in os.listdir(d) if f.endswith('.json'))
        print(f'\n===== {d} =====')
        for n in names:
            try:
                if n.startswith('5a-'):
                    item5a(d, n)
                elif n.startswith('5b-') and refdir:
                    item5b(d, n, refdir, manifest)
                elif n.startswith('5c-'):
                    item5c(d, n)
                elif n.startswith('5d-'):
                    item5d(d, n)
                elif n.startswith('7-'):
                    item7(d, n)
                elif n.startswith('6-'):
                    item6_pairs.append((d, n))
            except Exception as e:  # keep going; report the failure
                print(f'  {n}: analysis failed: {e!r}')
    if item6_pairs:
        feats = item6(item6_pairs)
        names = [n for _, n in item6_pairs]
        pairs = [('6-desktop-flute-pack', '6-desktop-flute-builtin', 'desktop: pack vs built-in'),
                 ('6-web-flute-pack', '6-web-flute-builtin', 'web: pack vs built-in'),
                 ('6-web-flute-builtin', '6-desktop-flute-builtin', 'built-in: web vs desktop'),
                 ('6-web-flute-pack', '6-desktop-flute-pack', 'pack: web vs desktop')]
        for a, b, label in pairs:
            if a in names and b in names:
                compare6(feats, a, b, label)


if __name__ == '__main__':
    main()
