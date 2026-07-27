"""
Animator CLI.

Usage:  python render.py <plan.json> <out_dir>

<plan.json>:
{
  "fps": 30,
  "width": 1920,
  "height": 1080,
  "mol_dir": "/abs/path/for/molecule/pngs",
  "scenes": [
     {"id":"scene_1","type":"bloodstream_level","params":{...},"target_seconds":8.2},
     ...
  ]
}

Renders each scene to <out_dir>/<id>.mp4 (silent, 1080p). Isolated per
scene: a scene that fails to render is retried once as a concept_card, and
if that still fails it is recorded as failed in the manifest (the caller
decides whether to abort). Writes <out_dir>/manifest.json.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))


def probe_duration(path: str) -> float:
    try:
        out = subprocess.check_output(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "csv=p=0", path], text=True, timeout=60)
        return float(out.strip())
    except Exception:
        return 0.0


def render_scene(scene: dict, out_path: str, fps: int, width: int, height: int,
                 mol_dir: str) -> bool:
    spec = {
        "type": scene.get("type", "concept_card"),
        "params": scene.get("params", {}),
        "target_seconds": float(scene.get("target_seconds", 6.0)),
        "mol_dir": mol_dir,
    }
    workdir = tempfile.mkdtemp(prefix="yva_scene_")
    spec_path = os.path.join(workdir, "spec.json")
    with open(spec_path, "w") as f:
        json.dump(spec, f)
    media_dir = os.path.join(workdir, "media")
    env = dict(os.environ)
    env["YVA_SPEC"] = spec_path
    env["PYTHONPATH"] = HERE + os.pathsep + env.get("PYTHONPATH", "")
    # Quality flag -qh = 1080p; override fps; pin resolution explicitly.
    cmd = [
        sys.executable, "-m", "manim", "render",
        "-o", "clip", "--format", "mp4",
        "--fps", str(fps),
        "-r", f"{width},{height}",
        "--media_dir", media_dir,
        "--disable_caching", "-v", "ERROR",
        os.path.join(HERE, "plan_scene.py"), "PlanScene",
    ]
    try:
        subprocess.run(cmd, cwd=HERE, env=env, check=True, timeout=900,
                       stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    except subprocess.CalledProcessError as e:
        print(f"[animator] render failed for {scene.get('id')}: "
              f"{(e.stderr or b'').decode()[-500:]}")
        shutil.rmtree(workdir, ignore_errors=True)
        return False
    except Exception as e:  # timeout etc.
        print(f"[animator] render error for {scene.get('id')}: {e}")
        shutil.rmtree(workdir, ignore_errors=True)
        return False
    # Find the produced mp4 under media_dir.
    found = None
    for root, _dirs, files in os.walk(media_dir):
        for fn in files:
            if fn.endswith(".mp4"):
                found = os.path.join(root, fn)
                break
        if found:
            break
    if not found:
        shutil.rmtree(workdir, ignore_errors=True)
        return False
    shutil.move(found, out_path)
    shutil.rmtree(workdir, ignore_errors=True)
    return True


def main():
    if len(sys.argv) < 3:
        print("usage: render.py <plan.json> <out_dir>")
        sys.exit(2)
    plan = json.load(open(sys.argv[1]))
    out_dir = sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    fps = int(plan.get("fps", 30))
    width = int(plan.get("width", 1920))
    height = int(plan.get("height", 1080))
    mol_dir = plan.get("mol_dir", out_dir)
    os.makedirs(mol_dir, exist_ok=True)

    manifest = {"scenes": [], "ok": True}
    for i, scene in enumerate(plan.get("scenes", [])):
        sid = scene.get("id", f"scene_{i+1}")
        out_path = os.path.join(out_dir, f"{sid}.mp4")
        ok = render_scene(scene, out_path, fps, width, height, mol_dir)
        if not ok:
            # Retry once as a plain concept card.
            fallback = {
                "id": sid,
                "type": "concept_card",
                "params": {"headline": (scene.get("params", {}) or {}).get("title")
                           or (scene.get("params", {}) or {}).get("headline")
                           or "Key point"},
                "target_seconds": scene.get("target_seconds", 6.0),
            }
            ok = render_scene(fallback, out_path, fps, width, height, mol_dir)
        dur = probe_duration(out_path) if ok else 0.0
        manifest["scenes"].append({"id": sid, "file": f"{sid}.mp4",
                                   "ok": ok, "duration": dur,
                                   "type": scene.get("type")})
        if not ok:
            manifest["ok"] = False
        print(f"[animator] {sid}: {'OK' if ok else 'FAILED'} ({dur:.1f}s)")

    with open(os.path.join(out_dir, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"[animator] done: {sum(s['ok'] for s in manifest['scenes'])}/"
          f"{len(manifest['scenes'])} scenes rendered")
    sys.exit(0 if manifest["ok"] else 1)


if __name__ == "__main__":
    main()
