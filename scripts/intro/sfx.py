#!/usr/bin/env python3
"""인트로 8비트 효과음 — python3 sfx.py 출력.wav [ball|team] (48kHz 스테레오 16비트).
시각은 intro.ts 의 T 와 맞춘다. 외부 소리 파일 없이 사각파·삼각파·잡음으로만 만든다(저작권 걱정 없음)."""
import math, random, struct, sys, wave

SR = 48000
random.seed(3)

def note(f): return 440.0 * 2 ** ((f - 69) / 12)  # MIDI → Hz

def add(t0, dur, fn, vol, attack=0.004, release=0.04):
    a, n = int(t0 * SR), int(dur * SR)
    for i in range(n):
        j = a + i
        if j >= N: break
        t = i / SR
        env = min(1, t / attack) * min(1, (dur - t) / release) if dur > release else 1
        buf[j] += fn(t) * vol * max(0, env)

def square(f, duty=0.5): return lambda t: 1.0 if (t * f) % 1 < duty else -1.0
def tri(f): return lambda t: 4 * abs((t * f) % 1 - 0.5) - 1
def noise(): return lambda t: random.uniform(-1, 1)
def sweep(f0, f1, dur, duty=0.5):
    def fn(t):
        f = f0 + (f1 - f0) * min(1, t / dur)
        return 1.0 if (f0 * t + (f1 - f0) * t * t / (2 * dur)) % 1 < duty else -1.0
    return fn

VARIANT = sys.argv[2] if len(sys.argv) > 2 else 'ball'
# intro.ts TIMES 와 같은 값
KICK = VARIANT == 'kick'
HOPS = (1.35, 1.55) if KICK else (0.6, 0.9, 1.1)
LOGO = 1.35 if KICK else 1.1
RUN = (0.1, 0.9) if KICK else (1.5, 2.5) if VARIANT == 'team' else None
DUR = {'kick': 3.2, 'team': 3.5}.get(VARIANT, 3.0)
N = int(SR * DUR)
buf = [0.0] * N

# 킥 — 뻥(낮은 쿵 + 잡음) 뒤로 날아가는 휘익
if KICK:
    add(0.9, 0.05, noise(), 0.4, release=0.03)
    add(0.9, 0.08, square(note(36)), 0.3, release=0.05)
    add(0.93, 0.4, sweep(note(74), note(86), 0.4, 0.25), 0.08, release=0.1)
# 공 튀김 — 내려가는 블립, 점점 작게
for t0, v in zip(HOPS, (0.34, 0.22, 0.13)):
    add(t0, 0.07, sweep(note(67), note(55), 0.07), v)
# 로고 징글 — 도·미·솔·도(로고가 찍히는 동안) + 화음
for i, m in enumerate([72, 76, 79, 84]):
    add(LOGO + 0.05 + i * 0.1, 0.1, square(note(m), 0.25), 0.18)
for m in (84, 88, 91):
    add(LOGO + 0.45, 0.8, tri(note(m)), 0.16, release=0.5)
add(LOGO + 0.45, 0.8, square(note(60), 0.5), 0.07, release=0.5)
# 팀이 달려오는 발소리 — 짧은 잡음 틱
if RUN:
    t = RUN[0]
    while t < RUN[1] - (0.0 if KICK else 0.2):
        add(t, 0.018, noise(), 0.08 + 0.05 * random.random(), release=0.012)
        t += 0.05 + 0.03 * random.random()

peak = max(abs(x) for x in buf) or 1
g = 0.5 / peak  # 최고점 약 -6dBFS
with wave.open(sys.argv[1], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(b''.join(struct.pack('<hh', v, v) for v in (int(max(-1, min(1, x * g)) * 32767) for x in buf)))
