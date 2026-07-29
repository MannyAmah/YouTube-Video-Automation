"""
Rich, detailed cell environment for real biological-process simulations.

Builds an anatomically-suggestive animated cell: a lipid-bilayer boundary,
a nucleus with envelope + pores + chromatin, mitochondria with cristae, rough
ER with ribosomes, and freely diffusing molecules given gentle Brownian
updaters so the interior is alive. Locations are exposed so a mechanism can
place the drug's target at the membrane, in the cytoplasm, on the nucleus, or
inside a mitochondrion.
"""
from __future__ import annotations
import math
import numpy as np
from manim import (
    VGroup, VMobject, Ellipse, Circle, Line, Dot, Arc, ParametricFunction,
    ORIGIN, UP, DOWN, LEFT, RIGHT, PI, TAU, rate_functions,
)
from . import palette as P


def _bilayer_ellipse(width, height, center, color="#3a6a8a", edge="#5b93b8"):
    """A membrane drawn as a double outline suggesting the bilayer."""
    outer = Ellipse(width=width, height=height).set_stroke(edge, width=6).set_fill(opacity=0)
    inner = Ellipse(width=width - 0.28, height=height - 0.28).set_stroke(color, width=4).set_fill(opacity=0)
    fill = Ellipse(width=width, height=height).set_fill("#132234", opacity=0.92).set_stroke(width=0)
    grp = VGroup(fill, outer, inner)
    grp.move_to(center)
    return grp


def mitochondrion(width=1.5, center=ORIGIN, angle=0.0):
    body = Ellipse(width=width, height=width * 0.5)\
        .set_fill("#c98a5a", opacity=1).set_stroke("#8a5a34", width=3)
    grp = VGroup(body)
    # Cristae — folded inner membrane.
    for dx in np.linspace(-width * 0.3, width * 0.3, 4):
        cr = VMobject().set_points_smoothly([
            [dx - 0.1, width * 0.16, 0], [dx + 0.1, 0, 0], [dx - 0.1, -width * 0.16, 0],
        ]).set_stroke("#8a5a34", width=2.5)
        grp.add(cr)
    grp.rotate(angle).move_to(center)
    return grp


def nucleus(width=3.2, center=ORIGIN):
    env_out = Ellipse(width=width, height=width * 0.8).set_stroke("#5b7fb0", width=5).set_fill("#243a5c", opacity=1)
    env_in = Ellipse(width=width - 0.18, height=width * 0.8 - 0.18).set_stroke("#3a5a86", width=3).set_fill(opacity=0)
    grp = VGroup(env_out, env_in)
    # Nuclear pores.
    for t in np.linspace(0, TAU, 10, endpoint=False):
        x = math.cos(t) * width / 2
        y = math.sin(t) * width * 0.8 / 2
        grp.add(Dot([x, y, 0], radius=0.06, color="#7fa8d8"))
    # Chromatin texture.
    rng = np.random.default_rng(11)
    for _ in range(14):
        px = rng.uniform(-width * 0.32, width * 0.32)
        py = rng.uniform(-width * 0.26, width * 0.26)
        grp.add(Dot([px, py, 0], radius=0.04, color="#4a6a96"))
    grp.move_to(center)
    return grp


def rough_er(center=ORIGIN, width=2.6):
    grp = VGroup()
    for i, dy in enumerate(np.linspace(-0.5, 0.5, 3)):
        wave = ParametricFunction(
            lambda t, dy=dy: np.array([t, dy + 0.12 * math.sin(t * 3), 0]),
            t_range=[-width / 2, width / 2, 0.1],
        ).set_stroke("#7a6aa0", width=3)
        grp.add(wave)
    # Ribosomes on the ER.
    rng = np.random.default_rng(5)
    for _ in range(16):
        grp.add(Dot([rng.uniform(-width / 2, width / 2), rng.uniform(-0.55, 0.55), 0],
                    radius=0.045, color="#b0a0d0"))
    grp.move_to(center)
    return grp


class Cell:
    """A composed cell with named anchor locations for placing action."""

    def __init__(self, width=11.0, height=6.2, center=ORIGIN, organelles=True):
        self.center = np.array(center, dtype=float)
        self.width = width
        self.height = height
        self.membrane = _bilayer_ellipse(width, height, center)
        self.group = VGroup(self.membrane)
        self.nucleus = None
        self.mitos = []
        if organelles:
            self.nucleus = nucleus(width * 0.30, self.center + np.array([-width * 0.24, -height * 0.05, 0]))
            self.mitos = [
                mitochondrion(1.7, self.center + np.array([width * 0.22, height * 0.24, 0]), angle=0.3),
                mitochondrion(1.5, self.center + np.array([width * 0.30, -height * 0.22, 0]), angle=-0.4),
            ]
            self.er = rough_er(self.center + np.array([-width * 0.02, height * 0.22, 0]), width * 0.24)
            self.group.add(self.er, self.nucleus, *self.mitos)

    def location(self, where: str) -> np.ndarray:
        where = (where or "cytoplasm").lower()
        if where in ("membrane", "surface", "cell surface", "receptor"):
            return self.center + np.array([self.width * 0.5 - 0.15, 0, 0])
        if where in ("nucleus", "dna", "gene", "genes"):
            return self.nucleus.get_center() if self.nucleus is not None else self.center
        if where in ("mitochondrion", "mitochondria", "mitochondrial", "complex i"):
            return self.mitos[0].get_center() if self.mitos else self.center
        # cytoplasm / default: a spot between nucleus and the right side.
        return self.center + np.array([self.width * 0.12, -self.height * 0.06, 0])

    def diffusers(self, n=14, color=None, edge=None, seed=1):
        """Free molecules that gently drift inside the cytoplasm (updaters)."""
        from .helpers import particle
        rng = np.random.default_rng(seed)
        grp = VGroup()
        for _ in range(n):
            p = particle(color or "#ffd166", edge or "#e8a90c", 0.12)
            px = self.center[0] + rng.uniform(-self.width * 0.36, self.width * 0.42)
            py = self.center[1] + rng.uniform(-self.height * 0.34, self.height * 0.34)
            p.move_to([px, py, 0])
            phase = rng.uniform(0, TAU)
            speed = rng.uniform(0.4, 1.0)
            amp = rng.uniform(0.06, 0.16)

            def upd(m, dt, phase=phase, speed=speed, amp=amp):
                m.shift(np.array([
                    math.cos(phase + speed * m.get_center()[0]) * amp * dt,
                    math.sin(phase + speed * m.get_center()[1]) * amp * dt, 0]))
            p.add_updater(upd)
            grp.add(p)
        return grp
