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
DEFAULT_OUTPUT = ROOT / "asserts/ViralInvasion_Prologue_v4/production/score.wav"
REPORTS = ROOT / "artifacts/world-prologue-v4/review"
SHOTS = [(0, 5, "body"), (5, 10, "lung"), (10, 18, "heart"),
         (18, 23, "orders"), (23, 28, "transit"), (28, 33, "arrival")]


def load_battle_events(path: Path | None):
    """Read either scene-report battleEvents or a standalone event table."""
    if path is None:
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    found = {}
    def walk(value, shot="heart"):
        if isinstance(value, list):
            for item in value:
                walk(item, shot)
        elif isinstance(value, dict):
            current_shot = value.get("shot", shot)
            if isinstance(value.get("event"), str):
                time = value.get("filmSeconds", value.get("film_seconds", value.get("globalSeconds")))
                offset = next((start for start, _end, name in SHOTS if name == current_shot), 10)
                if time is None and isinstance(value.get("localSeconds"), (int, float)):
                    time = offset + value["localSeconds"]
                if time is None and isinstance(value.get("frame"), (int, float)):
                    time = offset + (value["frame"] - 1) / 24
                if isinstance(time, (int, float)) and math.isfinite(time) and 0 <= time <= 33:
                    event = {**value, "filmSeconds": float(time)}
                    key = (str(value.get("id", "")), value["event"], round(time, 6))
                    found[key] = event
            for nested in value.values():
                if isinstance(nested, (dict, list)):
                    walk(nested, current_shot)
    walk(data)
    return sorted(found.values(), key=lambda event: event["filmSeconds"])


class Score:
    def __init__(self, seconds: float, rate: int, battle_events=None):
        self.rate, self.seconds = rate, seconds
        self.count = round(seconds * rate)
        self.left = array("f", [0]) * self.count
        self.right = array("f", [0]) * self.count
        self.rng = random.Random(750033)
        self.events: list[dict] = []
        self.battle_events = battle_events or []

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
        self.chord(5, [116.54, 174.61, 233.08], 3.2, .018)
        self.voice(5, .65, .045, cutoff=430, pan=-.12)
        self.chord(10, [103.83, 155.56, 207.65], 4.2, .020)
        self.voice(10, .8, .035, cutoff=260, pan=.12)
        # Orders arrive at 18 s. Small membrane footfalls begin at 20.5 s.
        self.voice(18, .08, .023, 880)
        self.voice(18.14, .12, .019, 1320)
        self.chord(18, [146.83, 220, 293.66], 4.1, .017)
        for step in range(6):
            self.voice(20.5 + step * .43, .10, .012, 126, 76, pan=(-.12 if step % 2 else .12))
        self.voice(23, 2.3, .045, cutoff=600, pan=-.12)
        self.chord(23, [164.81, 246.94, 329.63], 4.4, .018)
        self.chord(28, [196, 246.94, 293.66, 392], 4.2, .022)
        self.voice(28, 1.5, .018, 783.99, pan=-.15)
        self.voice(28.22, 1.4, .015, 987.77, pan=.15)
        beat = 0.0
        while beat < min(28, self.seconds):
            self.voice(beat, .19, .055, 61, 35)
            self.voice(beat + .18, .17, .033, 47, 29)
            beat += .78 if 10 <= beat < 18 else 1.05 if beat >= 23 else 1.18
        # Background texture stays quiet; principal impacts follow the actual event table.
        clash = 5.2
        while clash < min(18, self.seconds):
            self.voice(clash, .14, .009, cutoff=750, pan=math.sin(clash * 1.7) * .4)
            clash += .91
        for index, event in enumerate(self.battle_events):
            time, kind = event["filmSeconds"], event["event"].lower()
            pan = math.sin(index * 2.4) * .25
            if "telegraph" in kind or "windup" in kind:
                self.voice(time, .27, .010, 225, 330, pan=pan)
                self.voice(time, .2, .009, cutoff=600, pan=pan)
            elif "impact" in kind or "contact" in kind:
                self.voice(time, .19, .044, 150, 52, pan=pan)
                self.voice(time, .085, .014, 410, 185, pan=-pan)
                self.voice(time, .11, .035, cutoff=950, pan=pan)
            elif "recoil" in kind or "retreat" in kind:
                self.voice(time, .22, .014, cutoff=460, pan=pan)
            elif "rescue" in kind or "cover" in kind:
                self.chord(time, [220, 293.66], .45, .008)
            elif "breach" in kind or "spread" in kind:
                self.voice(time, .45, .021, cutoff=290, pan=pan)

    def write(self, output: Path):
        peak_before = max(max(map(abs, self.left)), max(map(abs, self.right)), 1e-8)
        gain = min(2.2, .32 / peak_before)
        pcm = array("h")
        square_sum, peak = 0.0, 0.0
        fade_in, fade_out = min(.35, self.seconds / 4), min(1.5, self.seconds / 4)
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
                "events": self.events, "battle_events": self.battle_events,
                "shot_timeline": SHOTS, "reference_rhythm": "src/audio/worldPrologueAudio.ts",
                "listening_review": "not_listened; synthesis and waveform statistics only",
                "sha256": hashlib.sha256(output.read_bytes()).hexdigest()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--duration", type=float, default=33)
    parser.add_argument("--sample-rate", type=int, default=48000)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--events", type=Path, help="Actual scene-report battleEvents or approved event JSON")
    parser.add_argument("--allow-provisional", action="store_true", help="Generate a non-final timing probe without battle events")
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()
    if not .1 <= args.duration <= 120 or not 16000 <= args.sample_rate <= 96000:
        parser.error("duration must be .1–120 seconds and sample rate 16000–96000 Hz")
    output = args.output.resolve()
    if output.suffix.lower() != ".wav":
        parser.error("output must have a .wav extension")
    if output.exists() and not args.overwrite:
        parser.error("output already exists; use a new path or explicit --overwrite")
    events = load_battle_events(args.events)
    if not events and not args.allow_provisional:
        parser.error("--events must contain actual battle events; use --allow-provisional only for timing probes")
    score = Score(args.duration, args.sample_rate, events)
    score.compose()
    report = score.write(output)
    report["event_timing_status"] = "from_scene_event_table" if events else "provisional_no_battle_timing"
    report["event_table"] = str(args.events.resolve()) if args.events else None
    report["event_table_sha256"] = hashlib.sha256(args.events.read_bytes()).hexdigest() if args.events else None
    report_path = (args.report or REPORTS / f"{output.stem}-score.json").resolve()
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if key not in ("events", "battle_events")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
