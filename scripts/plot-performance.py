"""Plot CDP counters; requires optional matplotlib, outside the game/build runtime."""
import argparse
import json
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

parser = argparse.ArgumentParser()
parser.add_argument("folder", nargs="?", default="artifacts/G4/performance-final")
folder = Path(parser.parse_args().folder)
report = json.loads((folder / "report.json").read_text(encoding="utf-8"))
rows = report["samples"]
minutes = [row["wallSeconds"] / 60 for row in rows]
switch = next(row["wallSeconds"] / 60 for row in rows if row["mode"] == "low")
fig, axes = plt.subplots(2, 1, figsize=(10, 6), sharex=True, constrained_layout=True)
for axis, fields in zip(axes, [("used", "total"), ("embedderHeapUsed", "backingStorage")]):
    for field in fields:
        axis.plot(minutes, [row["memory"][field] / 1_000_000 for row in rows], linewidth=1.2, label=field)
    axis.axvline(switch, color="#777777", linestyle="--", linewidth=0.8)
    axis.set_ylabel("MB (1,000,000 bytes)")
    axis.set_ylim(bottom=0)
    axis.grid(alpha=0.2)
    axis.legend(loc="upper left", fontsize=9)
axes[0].set_title("Viral Invasion v0.5.0: ten-minute CDP heap observations", loc="left")
axes[1].set_xlabel("Wall time (minutes); dashed line = first low-effects sample")
fig.suptitle(f"{len(rows)} samples, no forced GC; separate counters, not process RSS. Bundle {report['releaseGameJsSha256'][:12]}", fontsize=9)
fig.savefig(folder / "heap-counters.png", dpi=180)
plt.close(fig)
print(folder / "heap-counters.png")
