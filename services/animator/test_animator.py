"""
Smoke test for the animation engine. Renders a small multi-primitive plan
and asserts each scene produces a valid MP4 at the target duration.

Run:  /opt/animenv/bin/python -m pytest services/animator/test_animator.py
   or /opt/animenv/bin/python services/animator/test_animator.py
"""
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))


def _probe(path):
    out = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-show_entries", "stream=codec_name,width,height",
         "-of", "json", path], text=True)
    return json.loads(out)


def test_renders_all_primitives():
    plan = {
        "fps": 30, "width": 1920, "height": 1080,
        "scenes": [
            {"id": "s1", "type": "title_card",
             "params": {"title": "Test", "subtitle": "engine check"}, "target_seconds": 3},
            {"id": "s2", "type": "molecule_intro",
             "params": {"name": "metformin"}, "target_seconds": 3},
            {"id": "s3", "type": "gauge",
             "params": {"metricLabel": "blood sugar", "from": "high", "to": "normal"},
             "target_seconds": 3},
            {"id": "s4", "type": "receptor_binding",
             "params": {"drugLabel": "drug", "receptorLabel": "receptor", "effect": "blocks"},
             "target_seconds": 3},
            {"id": "s5", "type": "not_a_real_primitive",  # must fall back, not crash
             "params": {"title": "Fallback works"}, "target_seconds": 3},
        ],
    }
    outdir = tempfile.mkdtemp(prefix="anim_test_")
    plan["mol_dir"] = os.path.join(outdir, "mols")
    plan_path = os.path.join(outdir, "plan.json")
    with open(plan_path, "w") as f:
        json.dump(plan, f)

    subprocess.run([sys.executable, os.path.join(HERE, "render.py"), plan_path, outdir],
                   check=True, timeout=1200)

    manifest = json.load(open(os.path.join(outdir, "manifest.json")))
    assert len(manifest["scenes"]) == 5
    for s in manifest["scenes"]:
        assert s["ok"], f"scene {s['id']} failed to render"
        info = _probe(os.path.join(outdir, s["file"]))
        assert abs(float(info["format"]["duration"]) - 3.0) < 1.2
        streams = {st["codec_name"] for st in info["streams"]}
        assert "h264" in streams
        vid = [st for st in info["streams"] if st.get("width")][0]
        assert vid["width"] == 1920 and vid["height"] == 1080
    print("OK: all 5 scenes rendered, fallback handled")


if __name__ == "__main__":
    test_renders_all_primitives()
