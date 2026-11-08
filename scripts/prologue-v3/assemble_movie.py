"""Assemble an exact, contiguous PNG timeline and local WAV with Blender 4.5 VSE.

Example (PowerShell, from the workspace root):
  & $blender --background --factory-startup --python-exit-code 1 --python scripts/prologue-v3/assemble_movie.py -- --frames '.../frames' --output 'D:/.../opening-v3.mp4'

Default: frames 0001..0792, 24 fps, 1280x720, 33 seconds. Missing/duplicate
frames fail before encoding. Optional 4–6-frame fades pass through black at the
existing six-shot cuts without inserting, dropping, or retiming any frames.
"""
from __future__ import annotations

import argparse
import glob
import hashlib
import json
from pathlib import Path
import re
import struct
import sys
import time
import wave

ROOT = Path(__file__).resolve().parents[2]
REPORTS = ROOT / "artifacts/world-prologue-v3/assembly"
DEFAULT_AUDIO = ROOT / "asserts/ViralInvasion_Prologue_v3/production/score.wav"
CUT_SECONDS = (6, 11, 16, 21, 29)


def png_size(path: Path):
    with path.open("rb") as stream:
        header = stream.read(24)
    if header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR" or len(header) != 24:
        raise ValueError(f"Not a valid PNG image: {path}")
    return struct.unpack(">II", header[16:24])


def collect_frames(source: str, expected: int):
    directory = Path(source)
    paths = list(directory.glob("*.png")) if directory.is_dir() else [Path(path) for path in glob.glob(source, recursive=True)]
    if not paths:
        raise ValueError(f"No PNG frames matched: {source}")
    by_number = {}
    dimensions = None
    for path in paths:
        number = re.search(r"(\d+)$", path.stem)
        if not number or path.suffix.lower() != ".png" or not path.is_file():
            raise ValueError(f"Expected numbered PNG filenames such as 0001.png: {path}")
        index = int(number.group(1))
        if index in by_number:
            raise ValueError(f"Duplicate frame {index}: {by_number[index]} and {path}")
        size = png_size(path)
        if dimensions is None:
            dimensions = size
        if size != dimensions:
            raise ValueError(f"Frame dimensions changed at {path}: {size} versus {dimensions}")
        by_number[index] = path.resolve()
    required = set(range(1, expected + 1))
    missing, unexpected = sorted(required - by_number.keys()), sorted(by_number.keys() - required)
    if missing or unexpected:
        raise ValueError(f"Frame sequence is not exactly 0001..{expected:04d}; missing={missing[:24]}, unexpected={unexpected[:24]}")
    # A single VSE image sequence refers to one source directory.
    ordered = [by_number[index] for index in range(1, expected + 1)]
    if len({path.parent for path in ordered}) != 1:
        raise ValueError("Frames must share one directory; stage their global numbered filenames before assembly")
    return ordered, dimensions


class Bits:
    def __init__(self, data: bytes):
        self.data, self.position = data, 0

    def read(self, count: int):
        value = 0
        for _ in range(count):
            if self.position >= len(self.data) * 8:
                raise ValueError("Truncated H.264 SPS")
            value = value * 2 + ((self.data[self.position // 8] >> (7 - self.position % 8)) & 1)
            self.position += 1
        return value

    def ue(self):
        zeros = 0
        while self.read(1) == 0:
            zeros += 1
            if zeros > 31:
                raise ValueError("Invalid H.264 Exp-Golomb code")
        return (1 << zeros) - 1 + self.read(zeros)


def verify_h264(path: Path):
    data = path.read_bytes()
    at = data.find(b"avcC")
    if at < 4:
        raise ValueError("MP4 has no AVC/H.264 configuration record")
    size = int.from_bytes(data[at - 4:at], "big")
    avcc = data[at + 4:at - 4 + size]
    if len(avcc) < 9 or avcc[0] != 1 or not (avcc[5] & 31):
        raise ValueError("Invalid AVC/H.264 configuration")
    sps_size = int.from_bytes(avcc[6:8], "big")
    sps = avcc[8:8 + sps_size]
    rbsp = re.sub(b"\x00\x00\x03", b"\x00\x00", sps[1:])
    bits = Bits(rbsp)
    profile, _constraints, level = bits.read(8), bits.read(8), bits.read(8)
    bits.ue()  # seq_parameter_set_id
    chroma, luma_bits, chroma_bits = 1, 8, 8
    if profile in (100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135):
        chroma = bits.ue()
        if chroma == 3:
            bits.read(1)
        luma_bits, chroma_bits = bits.ue() + 8, bits.ue() + 8
    if (chroma, luma_bits, chroma_bits) != (1, 8, 8):
        raise ValueError(f"Encoder did not produce 8-bit YUV 4:2:0: chroma={chroma}, bits={luma_bits}/{chroma_bits}")
    if b"mp4a" not in data:
        raise ValueError("MP4 has no AAC audio sample entry")
    return {"codec": "H264", "pixel_format": "yuv420p", "bit_depth": 8,
            "avc_profile_idc": profile, "avc_level_idc": level, "aac_present": True}


def assemble(args, frames, source_size, audio_info, report):
    import bpy

    scene = bpy.context.scene
    scene.sequence_editor_clear()
    scene.render.resolution_x, scene.render.resolution_y = args.width, args.height
    scene.render.resolution_percentage = 100
    scene.render.pixel_aspect_x = scene.render.pixel_aspect_y = 1
    scene.render.fps = args.fps
    scene.render.fps_base = 1
    scene.frame_start, scene.frame_end = 1, len(frames)
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure, scene.view_settings.gamma = 0, 1
    scene.sequencer_colorspace_settings.name = "sRGB"
    scene.render.use_sequencer = True
    scene.render.use_compositing = False
    editor = scene.sequence_editor_create()
    strips = editor.strips
    black = strips.new_effect("Letterbox", type="COLOR", channel=1, frame_start=1, frame_end=len(frames) + 1)
    black.color = (0, 0, 0)
    sequence = strips.new_image("Opening frames", str(frames[0]), channel=2, frame_start=1)
    for frame in frames[1:]:
        sequence.elements.append(frame.name)
    sequence.frame_final_duration = len(frames)
    sequence.colorspace_settings.name = "sRGB"
    sequence.blend_type = "ALPHA_OVER"
    scale = min(args.width / source_size[0], args.height / source_size[1])
    sequence.transform.scale_x = sequence.transform.scale_y = scale
    sequence.transform.offset_x = sequence.transform.offset_y = 0
    if args.fade_frames:
        sequence.blend_alpha = 1
        sequence.keyframe_insert("blend_alpha", frame=1)
        for second in CUT_SECONDS:
            cut = round(second * args.fps) + 1
            left = args.fade_frames // 2
            right = args.fade_frames - left
            if cut + right <= len(frames):
                for frame, alpha in ((cut - left, 1), (cut, 0), (cut + right, 1)):
                    sequence.blend_alpha = alpha
                    sequence.keyframe_insert("blend_alpha", frame=frame)
        sequence.blend_alpha = 1
        sequence.keyframe_insert("blend_alpha", frame=len(frames))
        action = scene.animation_data.action if scene.animation_data else None
        if action:
            for curve in action.fcurves:
                for key in curve.keyframe_points:
                    key.interpolation = "LINEAR"
    sound = strips.new_sound("Opening score", str(args.audio), channel=3, frame_start=1)
    sound.frame_final_end = len(frames) + 1
    sound.volume = 1
    scene.render.image_settings.file_format = "FFMPEG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.ffmpeg.format = "MPEG4"
    scene.render.ffmpeg.codec = "H264"
    scene.render.ffmpeg.constant_rate_factor = "HIGH"
    scene.render.ffmpeg.ffmpeg_preset = "GOOD"
    scene.render.ffmpeg.gopsize = args.fps * 2
    scene.render.ffmpeg.audio_codec = "AAC"
    scene.render.ffmpeg.audio_bitrate = 160
    scene.render.ffmpeg.audio_mixrate = 48000
    scene.render.ffmpeg.audio_channels = "STEREO"
    scene.render.ffmpeg.use_autosplit = False
    args.output.parent.mkdir(parents=True, exist_ok=True)
    pending = args.output.with_name(args.output.stem + ".encoding.mp4")
    if pending.exists() and not args.overwrite:
        raise ValueError(f"Pending output already exists; review it or use explicit --overwrite: {pending}")
    scene.render.filepath = str(pending)
    bpy.ops.render.render(animation=True)
    report["verified_encoding"] = verify_h264(pending)
    if args.output.exists() and not args.overwrite:
        raise ValueError(f"Output appeared during encoding; preserving it: {args.output}")
    pending.replace(args.output)
    report.update({"blender_version": bpy.app.version_string, "output_bytes": args.output.stat().st_size,
                   "output_sha256": hashlib.sha256(args.output.read_bytes()).hexdigest(),
                   "scale": scale, "fit": "preserve-aspect letterbox", "color_transform": "Standard"})


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--frames", required=True, help="Directory or quoted PNG glob")
    parser.add_argument("--output", type=Path, required=True, help="Absolute MP4 destination")
    parser.add_argument("--audio", type=Path, default=DEFAULT_AUDIO)
    parser.add_argument("--fps", type=int, default=24)
    parser.add_argument("--width", type=int, default=1280)
    parser.add_argument("--height", type=int, default=720)
    parser.add_argument("--expected-frames", type=int, default=792, help="Override only for explicit short probes")
    parser.add_argument("--fade-frames", type=int, choices=(0, 4, 5, 6), default=0)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--validate-only", action="store_true")
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args(argv)
    if not args.output.is_absolute() or args.output.suffix.lower() != ".mp4":
        parser.error("--output must be an absolute .mp4 path")
    if not (1 <= args.fps <= 120) or args.expected_frames < 1:
        parser.error("fps must be 1–120 and expected frame count must be positive")
    if min(args.width, args.height) < 2 or args.width % 2 or args.height % 2:
        parser.error("width and height must be positive even numbers for yuv420p")
    if args.output.exists() and not args.overwrite:
        parser.error("output already exists; choose a new output or explicit --overwrite")
    args.audio = args.audio.resolve()
    started = time.monotonic()
    frames, source_size = collect_frames(args.frames, args.expected_frames)
    with wave.open(str(args.audio), "rb") as sound:
        audio_info = {"path": str(args.audio), "duration": sound.getnframes() / sound.getframerate(),
                      "rate": sound.getframerate(), "channels": sound.getnchannels()}
    duration = len(frames) / args.fps
    if abs(audio_info["duration"] - duration) > 1 / args.fps:
        raise ValueError(f"Score duration must match the frame timeline: audio={audio_info['duration']}s, video={duration}s")
    report = {"status": "validated", "frames": len(frames), "first": str(frames[0]), "last": str(frames[-1]),
              "source_size": source_size, "output_size": [args.width, args.height], "fps": args.fps,
              "duration_seconds": duration, "audio": audio_info, "output": str(args.output),
              "fade_frames": args.fade_frames, "fade_mode": "through-black, unchanged timeline" if args.fade_frames else "none"}
    if not args.validate_only:
        assemble(args, frames, source_size, audio_info, report)
        report["status"] = "encoded"
    report["elapsed_seconds"] = round(time.monotonic() - started, 3)
    target = (args.report or REPORTS / f"{args.output.stem}-assembly.json").resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("ASSEMBLY_JSON:" + json.dumps(report, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
