"""Reusable Manim building blocks shared across primitives."""
from __future__ import annotations
import math
import numpy as np
from manim import (
    VGroup, VMobject, RegularPolygon, RoundedRectangle, Circle, Text,
    Arrow, PI, DEGREES, ORIGIN, UP, DOWN, LEFT, RIGHT, ManimColor,
)
from . import palette as P


def particle(color=P.PARTICLE, edge=P.PARTICLE_EDGE, size=0.16):
    """A small labelled hexagon representing a molecule/ion/substance unit."""
    h = RegularPolygon(n=6, start_angle=PI / 6)
    h.set(width=size * 2)
    h.set_fill(color, opacity=1).set_stroke(edge, width=2)
    return h


def scatter(n, box_w, box_h, center=ORIGIN, color=P.PARTICLE, edge=P.PARTICLE_EDGE,
            size=0.16, rng=None):
    """A group of particles scattered (deterministically) in a box."""
    rng = rng or np.random.default_rng(7)
    grp = VGroup()
    for _ in range(n):
        p = particle(color, edge, size)
        p.move_to(center + np.array([
            rng.uniform(-box_w / 2, box_w / 2),
            rng.uniform(-box_h / 2, box_h / 2), 0]))
        grp.add(p)
    return grp


def label(text, color=P.INK, scale=0.42, weight="NORMAL"):
    return Text(text, color=color, weight=weight).scale(scale)


def vessel(width=12, height=2.4, center=DOWN * 0.4):
    v = RoundedRectangle(width=width, height=height, corner_radius=height / 2)
    v.set_fill(P.BLOOD, opacity=0.55).set_stroke(P.BLOOD_EDGE, width=3)
    v.move_to(center)
    return v


# Stylised organ silhouettes (simple, recognizable, not clinical diagrams).
def organ(name, width=2.6):
    fill, edge = P.organ_color(name)
    pts = {
        "liver": [[-2.2, 0.9], [1.4, 1.1], [2.1, 0.2], [1.2, -0.9], [-1.8, -0.8], [-2.6, 0.0]],
        "kidney": [[-0.9, 1.1], [0.6, 1.0], [1.0, 0.2], [0.7, -0.9], [-0.7, -1.0],
                   [-1.0, -0.2], [-0.3, 0.0], [-1.0, 0.4]],
        "muscle": None,  # rounded rect below
        "cell": None,
    }
    if name in ("muscle", "cell", "gut", "intestine", "stomach", "pancreas",
                "lung", "thyroid", "bone"):
        r = RoundedRectangle(width=width, height=width * 0.62, corner_radius=0.25)
        r.set_fill(fill, opacity=1).set_stroke(edge, width=4)
        return r
    if name == "heart":
        # Two lobes + point, drawn as a smooth polygon.
        heart_pts = [[0, -1.0], [-1.1, 0.2], [-0.9, 1.0], [-0.3, 1.0], [0, 0.55],
                     [0.3, 1.0], [0.9, 1.0], [1.1, 0.2]]
        m = VMobject().set_points_as_corners(
            [np.array([x, y, 0]) for x, y in heart_pts] + [np.array([heart_pts[0][0], heart_pts[0][1], 0])])
        m.set_fill(fill, opacity=1).set_stroke(edge, width=4)
        return m.scale(width / 2.2)
    if name == "brain":
        c = Circle(radius=width / 2.4).set_fill(fill, opacity=1).set_stroke(edge, width=4)
        return c
    poly = pts.get(name, pts["liver"])
    m = VMobject().set_points_as_corners(
        [np.array([x, y, 0]) for x, y in poly] + [np.array([poly[0][0], poly[0][1], 0])])
    m.set_fill(fill, opacity=1).set_stroke(edge, width=4)
    m.set(width=width)
    return m


def molecule_glyph(color=P.DRUG, edge=P.DRUG_EDGE):
    """Fallback stylised molecule (linked circles) when no real structure."""
    a = Circle(radius=0.22).set_fill(color, opacity=1).set_stroke(edge, width=3)
    b = Circle(radius=0.16).set_fill(color, opacity=1).set_stroke(edge, width=3).next_to(a, RIGHT, buff=0.1)
    c = Circle(radius=0.16).set_fill(color, opacity=1).set_stroke(edge, width=3).next_to(a, UP + RIGHT * 0.4, buff=0.05)
    from manim import Line
    l1 = Line(a.get_center(), b.get_center(), color=edge, stroke_width=4)
    l2 = Line(a.get_center(), c.get_center(), color=edge, stroke_width=4)
    return VGroup(l1, l2, a, b, c)


def lerp_color(a, b, t):
    return interpolate_color_safe(a, b, t)


def interpolate_color_safe(a, b, t):
    from manim import interpolate_color
    return interpolate_color(ManimColor(a), ManimColor(b), max(0.0, min(1.0, t)))
