"""
Standalone Manim scene loaded by the CLI. Renders ONE scene spec (JSON at
$YVA_SPEC) using the primitive library, then holds to fill the target
duration. Any primitive error falls back to a concept card so a single bad
scene never fails the render.
"""
import json
import os
from manim import Scene, config
from animator import palette, primitives

config.background_color = palette.BG


class PlanScene(Scene):
    def construct(self):
        spec = json.load(open(os.environ["YVA_SPEC"]))
        # Per-medication visual theme (varies BG + accent colors).
        palette.set_theme(int(spec.get("theme", 0)))
        config.background_color = palette.BG
        self.camera.background_color = palette.BG
        target = float(spec.get("target_seconds", 6.0))
        mol_dir = spec.get("mol_dir", ".")
        ptype = spec.get("type", "concept_card")
        params = spec.get("params", {}) or {}
        fn = primitives.REGISTRY.get(ptype, primitives.build_concept_card)
        try:
            fn(self, params, mol_dir)
        except Exception as exc:  # noqa: BLE001 — resilience is the point
            print(f"[animator] primitive '{ptype}' failed: {exc}; using fallback")
            self.clear()
            self.camera.background_color = palette.BG
            primitives.build_concept_card(self, {
                "headline": params.get("title") or params.get("headline") or "Key point",
                "sublines": [],
            }, mol_dir)
        # Fill remaining time so the clip length matches the narration.
        try:
            elapsed = float(self.renderer.time)
        except Exception:
            elapsed = 0.0
        remaining = target - elapsed
        self.wait(remaining if remaining > 0.25 else 0.4)
