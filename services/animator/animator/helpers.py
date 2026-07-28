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


def lipid_bilayer(width=11.0, center=ORIGIN, gap=0.5):
    """A phospholipid bilayer: two rows of round heads with inward tails."""
    from manim import Line, Ellipse
    grp = VGroup()
    head_r = 0.13
    n = int(width / (head_r * 2.2))
    xs = np.linspace(-width / 2, width / 2, n)
    top_y = center[1] + gap / 2
    bot_y = center[1] - gap / 2
    for x in xs:
        for y, tail_dir in ((top_y, -1), (bot_y, 1)):
            head = Ellipse(width=head_r * 2, height=head_r * 2.2)\
                .set_fill("#d9a441", opacity=1).set_stroke("#a87a2a", width=1)\
                .move_to([x + center[0], y, 0])
            t1 = Line([x + center[0] - 0.05, y, 0],
                      [x + center[0] - 0.05, y + tail_dir * 0.26, 0],
                      color="#c9952f", stroke_width=2)
            t2 = Line([x + center[0] + 0.05, y, 0],
                      [x + center[0] + 0.05, y + tail_dir * 0.26, 0],
                      color="#c9952f", stroke_width=2)
            grp.add(head, t1, t2)
    return grp


def mitochondrion(width=1.1, center=ORIGIN):
    """A small mitochondrion with cristae."""
    from manim import Ellipse, VMobject
    body = Ellipse(width=width, height=width * 0.55)\
        .set_fill("#c98a5a", opacity=1).set_stroke("#8a5a34", width=3).move_to(center)
    grp = VGroup(body)
    # A few cristae as wavy inner lines.
    for i, dx in enumerate(np.linspace(-width * 0.28, width * 0.28, 3)):
        cr = VMobject().set_points_as_corners([
            [center[0] + dx - 0.08, center[1] + width * 0.18, 0],
            [center[0] + dx + 0.08, center[1], 0],
            [center[0] + dx - 0.08, center[1] - width * 0.18, 0],
        ]).set_stroke("#8a5a34", width=2)
        grp.add(cr)
    return grp


def cell_backdrop(width=9.0, height=4.6, center=ORIGIN, with_nucleus=True,
                  with_mito=True):
    """A cell: membrane blob, cytoplasm, optional nucleus + mitochondria."""
    from manim import Ellipse
    cyto = Ellipse(width=width, height=height)\
        .set_fill("#1b2c44", opacity=0.9).set_stroke("#3a6a8a", width=5).move_to(center)
    grp = VGroup(cyto)
    if with_nucleus:
        nuc = Ellipse(width=width * 0.32, height=height * 0.5)\
            .set_fill("#2a3f5f", opacity=1).set_stroke("#5b7fb0", width=3)\
            .move_to(center + np.array([-width * 0.22, 0, 0]))
        grp.add(nuc)
    if with_mito:
        grp.add(mitochondrion(1.1, center + np.array([width * 0.24, height * 0.22, 0])))
        grp.add(mitochondrion(1.0, center + np.array([width * 0.30, -height * 0.20, 0])))
    return grp


def lerp_color(a, b, t):
    return interpolate_color_safe(a, b, t)


def interpolate_color_safe(a, b, t):
    from manim import interpolate_color
    return interpolate_color(ManimColor(a), ManimColor(b), max(0.0, min(1.0, t)))
