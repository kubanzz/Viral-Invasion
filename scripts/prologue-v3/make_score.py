"""Synthesize the opening's quiet stereo score using only Python's standard library.

Reuses the six-shot rhythm and musical cues of worldPrologueAudio.ts. No speech,
network service, samples, or existing game audio files are required or modified.
"""
from __future__ import annotations

import argparse
from array import array
import hashlib
import json
import math
from pathlib import Path
import random
import sys
import wave

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = ROOT / "asserts/ViralInvasion_Prologue_v3/production/score.wav"
REPORTS = ROOT / "artifacts/world-prologue-v3/assembly"
SHOTS = [(0, 6, "body"), (6, 11, "lung"), (11, 16, "heart"),
         (16, 21, "orders"), (21, 29, "transit"), (29, 33, "arrival")]


class Score:
    def __init__(self, seconds: float, rate: int):
        self.rate, self.seconds = rate, seconds
        self.count = round(seconds * rate)
        self.left = array("f", [0]) * self.count
        self.right = array("f", [0]) * self.count
        self.rng = random.Random(750033)
        self.events: list[dict] = []

    def voice(self, start: float, duration: float, volume: float, frequency: float | None = None,
              end_frequency: float | None = None, cutoff: float = 500, pan: float = 0):
        if start >= self.seconds:
            return
        first, length = max(0, round(start * self.rate)), round(duration * self.rate)
        end = min(self.count, first + length)
        attack = min(.045, duration * .2)
        angle = (max(-1, min(1, pan)) + 1) * math.pi / 4
        left_gain, right_gain = math.cos(angle), math.sin(angle)
        phase, noise = 0.0, 0.0
        alpha = 1 - math.exp(-2 * math.pi * cutoff / self.rate)
        glide = math.log((end_frequency or frequency) / frequency) if frequency else 0
        for frame in range(first, end):
            t = (frame - first) / self.rate
            # A soft attack and exponential tail keep all transients click-free.
            envelope = math.sin(min(1, t / max(.001, attack)) * math.pi / 2)
            envelope *= math.exp(-5.2 * max(0, t - attack) / max(.001, duration - attack))
            envelope *= min(1, max(0, duration - t) / .014)
            if frequency:
                phase += 2 * math.pi * frequency * math.exp(glide * t / duration) / self.rate
                signal = math.sin(phase)
            else:
                noise += alpha * (self.rng.uniform(-1, 1) - noise)
                signal = noise
            sample = signal * envelope * volume
            self.left[frame] += sample * left_gain
            self.right[frame] += sample * right_gain
        self.events.append({"start": round(start, 4), "duration": duration,
                            "kind": "sine" if frequency else "filtered_noise",
                            "frequency": frequency, "volume": volume, "pan": pan})

    def chord(self, start: float, notes: list[float], duration: float, volume: float):
        for index, note in enumerate(notes):
            pan = (index / max(1, len(notes) - 1) - .5) * .65
            self.voice(start + index * .045, duration, volume, note, pan=pan)

    def compose(self):
        self.chord(0, [110, 164.81, 220], 3.8, .018)
        self.chord(6, [116.54, 174.61, 233.08], 3.2, .018)
        self.voice(6, .65, .055, cutoff=430, pan=-.12)
        self.chord(11, [103.83, 155.56, 207.65], 3.2, .023)
        self.voice(11, .65, .065, 68, 28)
        self.voice(11, .8, .065, cutoff=260, pan=.12)
        self.voice(16, .08, .023, 880)
        self.voice(16.14, .12, .019, 1320)
        self.chord(16, [146.83, 220, 293.66], 3.8, .017)
        self.voice(21, 2.3, .055, cutoff=600, pan=-.12)
        self.chord(21, [164.81, 246.94, 329.63], 4.4, .018)
        self.chord(29, [196, 246.94, 293.66, 392], 3.5, .022)
        self.voice(29, 1.5, .018, 783.99, pan=-.15)
        self.voice(29.22, 1.4, .015, 987.77, pan=.15)
        beat = 0.0
        while beat < min(29, self.seconds):
            self.voice(beat, .19, .055, 61, 35)
            self.voice(beat + .18, .17, .033, 47, 29)
            beat += .72 if 11 <= beat < 16 else 1.05 if beat >= 21 else 1.18
        clash = 6.0
        while clash < min(16, self.seconds):
            pitch = 480 + math.sin(clash * 7.3) * 170
            pan = math.sin(clash * 1.7) * .45
            self.voice(clash, .09, .015, pitch, pitch * .32, pan=pan)
            self.voice(clash, .13, .023, cutoff=1000 + math.cos(clash * 3.1) * 600, pan=pan)
            if math.floor(clash * 2.3) % 3 == 0:
                self.voice(clash + .11, .21, .027, 94, 43, pan=-pan)
            clash += .42

    def write(self, output: Path):
        peak_before = max(max(map(abs, self.left)), max(map(abs, self.right)), 1e-8)
        gain = min(2.2, .32 / peak_before)
        pcm = array("h")
        square_sum, peak = 0.0, 0.0
        fade_in, fade_out = min(.35, self.seconds / 4), min(.8, self.seconds / 4)
        for index in range(self.count):
            t = index / self.rate
            fade = min(1, t / fade_in, (self.seconds - t) / fade_out)
            fade = math.sin(max(0, fade) * math.pi / 2) ** 2
            for channel in (self.left, self.right):
                sample = max(-.999, min(.999, channel[index] * gain * fade))
                peak = max(peak, abs(sample))
                square_sum += sample * sample
                pcm.append(round(sample * 32767))
        if sys.byteorder != "little":
            pcm.byteswap()
        output.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(output), "wb") as stream:
            stream.setparams((2, 2, self.rate, 0, "NONE", "not compressed"))
            stream.writeframes(pcm.tobytes())
        rms = math.sqrt(square_sum / (self.count * 2))
        return {"output": str(output), "duration_seconds": self.count / self.rate,
                "sample_rate": self.rate, "channels": 2, "pcm_bits": 16,
                "peak_dbfs": round(20 * math.log10(max(peak, 1e-12)), 3),
                "rms_dbfs": round(20 * math.log10(max(rms, 1e-12)), 3),
                "fade_in_seconds": fade_in, "fade_out_seconds": fade_out,
                "events": self.events, "reference_rhythm": "src/audio/worldPrologueAudio.ts",
                "sha256": hashlib.sha256(output.read_bytes()).hexdigest()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--duration", type=float, default=33)
    parser.add_argument("--sample-rate", type=int, default=48000)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()
    if not .1 <= args.duration <= 120 or not 16000 <= args.sample_rate <= 96000:
        parser.error("duration must be .1–120 seconds and sample rate 16000–96000 Hz")
    output = args.output.resolve()
    if output.suffix.lower() != ".wav":
        parser.error("output must have a .wav extension")
    if output.exists() and not args.overwrite:
        parser.error("output already exists; use a new path or explicit --overwrite")
    score = Score(args.duration, args.sample_rate)
    score.compose()
    report = score.write(output)
    report_path = (args.report or REPORTS / f"{output.stem}-score.json").resolve()
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if key != "events"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
