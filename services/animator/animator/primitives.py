"""
Medically-meaningful animation primitives. Each `build_*` function plays a
short, dynamic sequence on the given Manim Scene, illustrating one concept.

Every builder is defensive: missing/oddly-typed params fall back to sane
defaults, and any exception is caught by the dispatcher which renders a
concept_card instead — so a single bad scene never fails the video.
"""
from __future__ import annotations
import os
import numpy as np
from manim import (
    Scene, VGroup, Text, Circle, Square, RoundedRectangle, Arrow, Line,
    FadeIn, FadeOut, Create, Write, Transform, GrowFromCenter, GrowArrow,
    DrawBorderThenFill, LaggedStart, MoveAlongPath, CubicBezier, Flash,
    ValueTracker, always_redraw, ImageMobject, rate_functions,
    UP, DOWN, LEFT, RIGHT, ORIGIN, PI, DEGREES, ManimColor,
)
from . import palette as P
from . import helpers as H
from .molecules import render_molecule


def _lvl(level):
    return {"high": 30, "elevated": 26, "normal": 14, "low": 7}.get(str(level).lower(), 16)


def _txt(params, *keys, default=""):
    for k in keys:
        v = params.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return default


def _title(scene, text):
    if not text:
        return None
    t = H.label(text, color=P.INK, scale=0.62, weight="BOLD").to_edge(UP, buff=0.5)
    scene.play(FadeIn(t, shift=DOWN * 0.2), run_time=0.7)
    return t


# --------------------------------------------------------------------------- #
def build_title_card(scene, params, mol_dir):
    title = _txt(params, "title", default="How This Medication Works")
    subtitle = _txt(params, "subtitle", default="explained simply")
    t = H.label(title, color=P.INK, scale=1.0, weight="BOLD")
    s = H.label(subtitle, color=P.MUTE, scale=0.5).next_to(t, DOWN, buff=0.3)
    scene.play(FadeIn(t, shift=UP * 0.3), run_time=1.0)
    scene.play(FadeIn(s), run_time=0.6)
    scene.play(t.animate.shift(UP * 0.2), rate_func=rate_functions.ease_in_out_sine, run_time=1.0)


def build_bloodstream_level(scene, params, mol_dir):
    title = _title(scene, _txt(params, "title"))
    substance = _txt(params, "substanceLabel", "substance", default="sugar")
    level = _txt(params, "level", default="high")
    color = params.get("color") if isinstance(params.get("color"), str) else P.GLUCOSE
    v = H.vessel()
    vlabel = H.label("bloodstream", color=P.MUTE, scale=0.4).next_to(v, UP, buff=0.15)\
        .align_to(v, RIGHT).shift(LEFT * 0.4)
    scene.play(Create(v), FadeIn(vlabel), run_time=0.9)
    n = _lvl(level)
    parts = H.scatter(n, 10.6, 1.6, center=v.get_center(), color=color,
                      rng=np.random.default_rng(3))
    scene.play(LaggedStart(*[FadeIn(p, scale=0.5) for p in parts], lag_ratio=0.02),
               run_time=1.4)
    tag_color = P.WARN if level.lower() in ("high", "elevated") else (
        P.GOOD if level.lower() in ("normal", "low") else P.INK)
    tag = H.label(f"{substance}: {level}", color=tag_color, scale=0.5, weight="BOLD")\
        .next_to(v, DOWN, buff=0.3)
    scene.play(Write(tag), run_time=0.7)
    # Alive drift.
    scene.play(*[p.animate.shift(RIGHT * np.random.default_rng(i).uniform(-0.25, 0.25)
                                 + UP * np.random.default_rng(i + 99).uniform(-0.12, 0.12))
                 for i, p in enumerate(parts)], run_time=1.1)


def build_organ_action(scene, params, mol_dir):
    title = _title(scene, _txt(params, "title"))
    name = _txt(params, "organ", default="liver").lower()
    action = _txt(params, "action", default="releases").lower()
    substance = _txt(params, "substanceLabel", "substance", default="sugar")
    note = _txt(params, "note")
    org = H.organ(name, width=2.4).shift(LEFT * 3.3 + UP * 1.2)
    org_lbl = H.label(name, color=P.INK, scale=0.5, weight="BOLD").move_to(org.get_center())
    v = H.vessel()
    scene.play(DrawBorderThenFill(org), FadeIn(org_lbl), Create(v), run_time=1.0)
    if note:
        n = H.label(note, color="#f0c36b", scale=0.4).next_to(org, RIGHT, buff=0.3).shift(UP * 0.1)
        scene.play(FadeIn(n), run_time=0.6)
    parts = VGroup(*[H.particle() for _ in range(7)])
    for p in parts:
        p.move_to(org.get_bottom())
    scene.add(parts)
    anims = []
    absorbing = action in ("absorbs", "takes", "uptake", "filters", "removes")
    for i, p in enumerate(parts):
        start = v.get_top() + LEFT * (2 - i * 0.5) if absorbing else org.get_bottom()
        end = org.get_bottom() if absorbing else (P.BLOOD and (DOWN * 0.4 + LEFT * (2 - i * 0.5)))
        if absorbing:
            p.move_to(start)
        path = CubicBezier(p.get_center(),
                           p.get_center() + DOWN * 0.6 + RIGHT * 0.2,
                           end + UP * 0.6, end)
        anims.append(MoveAlongPath(p, path, rate_func=rate_functions.ease_in_out_sine))
    scene.play(LaggedStart(*anims, lag_ratio=0.12), run_time=2.0)


def build_molecule_intro(scene, params, mol_dir):
    title = _title(scene, _txt(params, "title"))
    name = _txt(params, "name", "drugLabel", default="the drug")
    caption = _txt(params, "caption", default="the actual molecule")
    png = os.path.join(mol_dir, f"mol_{name.lower().replace(' ', '_')}.png")
    have = render_molecule(name, png)
    if have and os.path.exists(png):
        mol = ImageMobject(png).scale(0.6)
    else:
        mol = H.molecule_glyph()
    mol.move_to(ORIGIN + UP * 0.3)
    nm = H.label(name, color=P.DRUG, scale=0.6, weight="BOLD").next_to(mol, DOWN, buff=0.3)
    cap = H.label(caption, color=P.MUTE, scale=0.36).next_to(nm, DOWN, buff=0.12)
    # Larger, and animate it in with a slow rotate/scale so it reads as a
    # real molecule arriving, not a static logo.
    if isinstance(mol, ImageMobject):
        mol.scale(1.6)  # ~0.6*1.6 ≈ fills the frame nicely
        mol.move_to(UP * 0.35)
        nm.next_to(mol, DOWN, buff=0.35)
        cap.next_to(nm, DOWN, buff=0.12)
        mol.set_opacity(0.0)
        scene.play(mol.animate.set_opacity(1.0).scale(1.06), run_time=1.1,
                   rate_func=rate_functions.ease_out_sine)
        scene.play(FadeIn(nm), FadeIn(cap), run_time=0.6)
        scene.play(mol.animate.shift(UP * 0.12), rate_func=rate_functions.ease_in_out_sine,
                   run_time=1.0)
    else:
        scene.play(GrowFromCenter(mol), run_time=1.0)
        scene.play(FadeIn(nm), FadeIn(cap), run_time=0.7)
        scene.play(mol.animate.shift(UP * 0.15), rate_func=rate_functions.ease_in_out_sine,
                   run_time=1.0)


def build_receptor_binding(scene, params, mol_dir):
    title = _title(scene, _txt(params, "title"))
    drug = _txt(params, "drugLabel", "drug", default="the drug")
    receptor = _txt(params, "receptorLabel", "receptor", default="receptor")
    effect = _txt(params, "effect", default="activates").lower()
    # Receptor = a notched slot; drug = a matching key.
    rec = RoundedRectangle(width=2.2, height=2.6, corner_radius=0.2)\
        .set_fill("#3a5a4a" if effect == "activates" else "#5a3a3a", opacity=1)\
        .set_stroke(P.INK, width=3).shift(RIGHT * 2.2)
    notch = Square(0.7).set_fill(P.BG, opacity=1).set_stroke(P.INK, width=2)\
        .move_to(rec.get_left())
    rec_lbl = H.label(receptor, color=P.INK, scale=0.44, weight="BOLD").next_to(rec, UP, buff=0.2)
    scene.play(FadeIn(rec), FadeIn(notch), FadeIn(rec_lbl), run_time=0.8)
    key = Square(0.66).set_fill(P.DRUG, opacity=1).set_stroke(P.DRUG_EDGE, width=3)\
        .shift(LEFT * 4)
    key_lbl = H.label(drug, color=P.DRUG, scale=0.44, weight="BOLD").next_to(key, UP, buff=0.2)
    scene.play(FadeIn(key, shift=RIGHT * 0.4), FadeIn(key_lbl), run_time=0.7)
    scene.play(key.animate.move_to(notch.get_center()),
               key_lbl.animate.next_to(notch.get_center(), UP, buff=1.4).set_opacity(0),
               run_time=1.2)
    col = P.GOOD if effect == "activates" else P.WARN
    verb = "switched ON" if effect == "activates" else "blocked"
    scene.play(rec.animate.set_fill(col, opacity=0.9),
               Flash(rec, color=col, num_lines=16, flash_radius=1.4), run_time=0.9)
    res = H.label(f"{receptor} {verb}", color=col, scale=0.5, weight="BOLD")\
        .next_to(rec, DOWN, buff=0.3)
    scene.play(Write(res), run_time=0.7)


def build_enzyme_inhibition(scene, params, mol_dir):
    title = _title(scene, _txt(params, "title"))
    drug = _txt(params, "drugLabel", "drug", default="the drug")
    enzyme = _txt(params, "enzymeLabel", "enzyme", default="enzyme")
    substrate = _txt(params, "substrateLabel", default="A")
    product = _txt(params, "productLabel", default="B")
    enz = Circle(radius=0.8).set_fill("#6a5a8a", opacity=1).set_stroke(P.INK, width=3)
    enz_lbl = H.label(enzyme, color=P.INK, scale=0.4, weight="BOLD").move_to(enz)
    sub = H.particle(P.GLUCOSE, P.GLUCOSE_EDGE, 0.24).shift(LEFT * 3.5)
    sub_lbl = H.label(substrate, color=P.MUTE, scale=0.34).next_to(sub, DOWN, buff=0.15)
    prod = H.particle(P.GOOD, "#3fa06a", 0.24).shift(RIGHT * 3.5)
    prod_lbl = H.label(product, color=P.MUTE, scale=0.34).next_to(prod, DOWN, buff=0.15)
    arrow1 = Arrow(sub.get_right(), enz.get_left(), color=P.MUTE, buff=0.2)
    arrow2 = Arrow(enz.get_right(), prod.get_left(), color=P.MUTE, buff=0.2)
    scene.play(FadeIn(enz), FadeIn(enz_lbl), FadeIn(sub), FadeIn(sub_lbl),
               FadeIn(prod), FadeIn(prod_lbl), GrowArrow(arrow1), GrowArrow(arrow2), run_time=1.0)
    # Drug docks onto the enzyme and blocks it.
    drugm = Square(0.55).set_fill(P.DRUG, opacity=1).set_stroke(P.DRUG_EDGE, width=3).shift(UP * 2.4)
    drug_lbl = H.label(drug, color=P.DRUG, scale=0.4, weight="BOLD").next_to(drugm, UP, buff=0.15)
    scene.play(FadeIn(drugm, shift=DOWN * 0.3), FadeIn(drug_lbl), run_time=0.6)
    scene.play(drugm.animate.move_to(enz.get_center()), run_time=1.0)
    scene.play(enz.animate.set_fill("#4a4a5a", opacity=0.6),
               arrow2.animate.set_opacity(0.15), prod.animate.set_opacity(0.2),
               Flash(enz, color=P.WARN, num_lines=14, flash_radius=1.1), run_time=0.9)
    res = H.label(f"{enzyme} blocked — less {product}", color=P.GOOD, scale=0.46, weight="BOLD")\
        .to_edge(DOWN, buff=0.8)
    scene.play(Write(res), run_time=0.7)


def build_channel_transporter(scene, params, mol_dir):
    title = _title(scene, _txt(params, "title"))
    channel = _txt(params, "channelLabel", "channel", default="channel")
    ion = _txt(params, "ion", "substanceLabel", default="ions")
    action = _txt(params, "action", default="block").lower()
    # A membrane with a channel; ions try to pass.
    mem_top = Line(LEFT * 5, RIGHT * 5, color=P.BLOOD_EDGE, stroke_width=8).shift(UP * 0.4)
    mem_bot = Line(LEFT * 5, RIGHT * 5, color=P.BLOOD_EDGE, stroke_width=8).shift(DOWN * 0.4)
    gate_l = Line(UP * 0.4, DOWN * 0.4, color=P.INK, stroke_width=8).shift(LEFT * 0.5)
    gate_r = Line(UP * 0.4, DOWN * 0.4, color=P.INK, stroke_width=8).shift(RIGHT * 0.5)
    ch_lbl = H.label(channel, color=P.INK, scale=0.42, weight="BOLD").next_to(gate_r, UP, buff=0.6).shift(RIGHT)
    scene.play(Create(mem_top), Create(mem_bot), Create(gate_l), Create(gate_r),
               FadeIn(ch_lbl), run_time=1.0)
    ions = VGroup(*[H.particle(P.GLUCOSE, P.GLUCOSE_EDGE, 0.14).move_to(UP * 1.4 + LEFT * (2 - i))
                    for i in range(4)])
    scene.play(LaggedStart(*[FadeIn(x) for x in ions], lag_ratio=0.1), run_time=0.7)
    if action in ("block", "close", "inhibit"):
        block = Square(0.55).set_fill(P.DRUG, opacity=1).set_stroke(P.DRUG_EDGE, width=3)\
            .move_to(ORIGIN)
        scene.play(FadeIn(block, scale=0.5), run_time=0.5)
        scene.play(*[x.animate.move_to(UP * 0.9 + RIGHT * np.random.default_rng(i).uniform(-1.5, 1.5))
                     for i, x in enumerate(ions)], run_time=1.0)
        res = H.label(f"{channel} blocked — {ion} can't pass", color=P.GOOD,
                      scale=0.44, weight="BOLD").to_edge(DOWN, buff=0.8)
    else:
        scene.play(*[x.animate.move_to(DOWN * 1.4 + LEFT * (2 - i)) for i, x in enumerate(ions)],
                   run_time=1.2)
        res = H.label(f"{channel} open — {ion} flow through", color=P.GOOD,
                      scale=0.44, weight="BOLD").to_edge(DOWN, buff=0.8)
    scene.play(Write(res), run_time=0.7)


def build_pathway_switch(scene, params, mol_dir):
    title = _title(scene, _txt(params, "title"))
    node = _txt(params, "nodeLabel", "node", default="AMPK")
    node_sub = _txt(params, "nodeSubtitle", default="the cell's fuel gauge")
    state = _txt(params, "state", default="on").lower()
    downstream = _txt(params, "downstreamLabel", default="sugar factory")
    effect = _txt(params, "downstreamEffect", default="down").lower()
    panel = RoundedRectangle(width=8.5, height=3.6, corner_radius=0.3)\
        .set_fill(P.PANEL, opacity=0.96).set_stroke(P.PANEL_EDGE, width=2)
    ptitle = H.label(_txt(params, "panelTitle", default="inside the cell"),
                     color=P.MUTE, scale=0.36).next_to(panel.get_top(), DOWN, buff=0.2)
    scene.play(FadeIn(panel), FadeIn(ptitle), run_time=0.7)
    nd = Circle(radius=0.6).set_fill(P.WARN, opacity=1).set_stroke("#ffffff", width=2)\
        .move_to(panel.get_center() + LEFT * 2.2)
    nd_lbl = H.label(node, color=P.INK, scale=0.42, weight="BOLD").move_to(nd)
    nd_sub = H.label(node_sub, color=P.MUTE, scale=0.3).next_to(nd, DOWN, buff=0.2)
    scene.play(GrowFromCenter(nd), FadeIn(nd_lbl), FadeIn(nd_sub), run_time=0.7)
    fac = Square(1.1).set_fill(P.organ_color("liver")[0], opacity=1)\
        .set_stroke(P.organ_color("liver")[1], width=3).move_to(panel.get_center() + RIGHT * 2.5)
    fac_lbl = H.label(downstream, color=P.INK, scale=0.3)
    if fac_lbl.width > fac.width - 0.15:
        fac_lbl.scale((fac.width - 0.15) / fac_lbl.width)
    fac_lbl.move_to(fac)
    arrow = Arrow(nd.get_right(), fac.get_left(), color=P.INK, buff=0.15, stroke_width=5)
    scene.play(GrowArrow(arrow), FadeIn(fac), FadeIn(fac_lbl), run_time=0.7)
    on = state in ("on", "activated", "active")
    col = P.GOOD if on else P.WARN
    scene.play(nd.animate.set_fill(col, opacity=1),
               Flash(nd, color=col, num_lines=16, flash_radius=1.0), run_time=0.8)
    scene.play(Transform(nd_sub, H.label("ON" if on else "OFF", color=col, scale=0.4, weight="BOLD")
                         .move_to(nd_sub)), run_time=0.4)
    if effect in ("down", "decrease", "less", "inhibit"):
        scene.play(fac.animate.set_fill(P.organ_color("liver")[1], opacity=0.3).scale(0.7), run_time=0.9)
        res = H.label("dialed DOWN", color=P.GOOD, scale=0.36).next_to(fac, DOWN, buff=0.2)
    else:
        scene.play(fac.animate.scale(1.2), Flash(fac, color=P.GOOD, flash_radius=1.0), run_time=0.9)
        res = H.label("turned UP", color=P.GOOD, scale=0.36).next_to(fac, DOWN, buff=0.2)
    scene.play(FadeIn(res), run_time=0.5)


def build_cell_uptake(scene, params, mol_dir):
    title = _title(scene, _txt(params, "title"))
    cell = _txt(params, "cellLabel", "organ", default="muscle")
    substance = _txt(params, "substanceLabel", "substance", default="sugar")
    v = H.vessel(height=2.0, center=DOWN * 0.6)
    org = H.organ(cell if cell in ("muscle", "cell") else "muscle", width=2.2)\
        .to_edge(RIGHT, buff=1.0).shift(UP * 1.4)
    org_lbl = H.label(cell, color=P.INK, scale=0.42, weight="BOLD").next_to(org, UP, buff=0.12)
    scene.play(Create(v), FadeIn(org), FadeIn(org_lbl), run_time=0.9)
    parts = H.scatter(12, 9, 1.2, center=v.get_center(), rng=np.random.default_rng(5))
    scene.play(LaggedStart(*[FadeIn(p, scale=0.5) for p in parts], lag_ratio=0.03), run_time=1.0)
    movers = parts[:8]
    scene.play(LaggedStart(*[p.animate.move_to(org.get_center()
                            + np.array([np.random.default_rng(i).uniform(-0.5, 0.5),
                                        np.random.default_rng(i + 5).uniform(-0.3, 0.3), 0])).scale(0.7)
                            for i, p in enumerate(movers)], lag_ratio=0.08), run_time=1.8)
    res = H.label(f"{cell} takes in {substance}", color=P.GOOD, scale=0.46, weight="BOLD")\
        .to_edge(DOWN, buff=0.6)
    scene.play(Write(res), run_time=0.7)


def build_gauge(scene, params, mol_dir):
    title = _title(scene, _txt(params, "title"))
    metric = _txt(params, "metricLabel", "metric", default="blood sugar")
    frm = _txt(params, "from", default="high").lower()
    to = _txt(params, "to", default="normal").lower()
    fmap = {"high": 1.0, "elevated": 0.85, "normal": 0.35, "low": 0.15}
    v0, v1 = fmap.get(frm, 0.9), fmap.get(to, 0.35)
    bar_bg = RoundedRectangle(width=6.5, height=0.6, corner_radius=0.3)\
        .set_fill("#22314a", opacity=1).set_stroke("#3a4a63", width=2)
    tracker = ValueTracker(v0)
    bar = always_redraw(lambda: RoundedRectangle(
        width=max(0.6, 6.5 * tracker.get_value()), height=0.6, corner_radius=0.3)
        .set_fill(H.interpolate_color_safe(P.GOOD, P.WARN, tracker.get_value()), opacity=1)
        .set_stroke(width=0).align_to(bar_bg, LEFT).set_y(bar_bg.get_y()))
    glabel = H.label(metric, color=P.MUTE, scale=0.44).next_to(bar_bg, UP, buff=0.25)
    reading = always_redraw(lambda: H.label(
        "HIGH" if tracker.get_value() > 0.66 else ("BETTER" if tracker.get_value() > 0.4 else "NORMAL"),
        color=H.interpolate_color_safe(P.GOOD, P.WARN, tracker.get_value()),
        scale=0.5, weight="BOLD").next_to(bar_bg, RIGHT, buff=0.4))
    scene.play(FadeIn(bar_bg), FadeIn(glabel), FadeIn(bar), FadeIn(reading), run_time=0.8)
    scene.play(tracker.animate.set_value(v1), run_time=2.4, rate_func=rate_functions.ease_in_out_sine)
    scene.wait(0.3)


def build_journey(scene, params, mol_dir):
    title = _title(scene, _txt(params, "title"))
    steps = params.get("steps")
    if not isinstance(steps, list) or not steps:
        steps = ["pill", "stomach", "bloodstream", "target"]
    steps = [str(s) for s in steps][:5]
    n = len(steps)
    xs = np.linspace(-5, 5, n)
    nodes, labels = VGroup(), VGroup()
    for x, s in zip(xs, steps):
        c = Circle(radius=0.45).set_fill(P.PANEL, opacity=1).set_stroke(P.DRUG, width=3)\
            .move_to([x, 0.3, 0])
        l = H.label(s, color=P.INK, scale=0.34).next_to(c, DOWN, buff=0.2)
        nodes.add(c); labels.add(l)
    scene.play(LaggedStart(*[GrowFromCenter(c) for c in nodes], lag_ratio=0.1),
               LaggedStart(*[FadeIn(l) for l in labels], lag_ratio=0.1), run_time=1.2)
    arrows = VGroup(*[Arrow(nodes[i].get_right(), nodes[i + 1].get_left(), color=P.MUTE,
                            buff=0.1, stroke_width=4) for i in range(n - 1)])
    scene.play(LaggedStart(*[GrowArrow(a) for a in arrows], lag_ratio=0.2), run_time=1.0)
    dot = H.particle(P.DRUG, P.DRUG_EDGE, 0.16).move_to(nodes[0].get_center())
    scene.add(dot)
    for i in range(n - 1):
        scene.play(dot.animate.move_to(nodes[i + 1].get_center()),
                   nodes[i + 1].animate.set_fill(P.DRUG, opacity=0.4),
                   run_time=0.8, rate_func=rate_functions.ease_in_out_sine)


def build_warning_vignette(scene, params, mol_dir):
    title = _title(scene, _txt(params, "title", default="Side effects to know"))
    items = params.get("items")
    if not isinstance(items, list) or not items:
        items = [_txt(params, "note", default="talk to your doctor")]
    items = [str(x) for x in items][:4]
    signs = VGroup()
    xs = np.linspace(-4.5, 4.5, len(items))
    for x, it in zip(xs, items):
        post = Line([x, -1.6, 0], [x, 0.2, 0], color="#8a7a5a", stroke_width=6)
        board = RoundedRectangle(width=2.4, height=1.0, corner_radius=0.15)\
            .set_fill("#3a3320", opacity=1).set_stroke("#f0c36b", width=3).move_to([x, 0.7, 0])
        txt = H.label(it, color="#f6dd9a", scale=0.3).move_to(board)
        if txt.width > board.width - 0.2:
            txt.scale((board.width - 0.2) / txt.width)
        signs.add(VGroup(post, board, txt))
    scene.play(LaggedStart(*[FadeIn(s, shift=UP * 0.3) for s in signs], lag_ratio=0.2), run_time=1.6)
    scene.wait(0.4)


def build_two_panel_compare(scene, params, mol_dir):
    title = _title(scene, _txt(params, "title"))
    lt = _txt(params, "leftTitle", default="Before")
    rt = _txt(params, "rightTitle", default="After")
    ln = _txt(params, "leftNote", default="")
    rn = _txt(params, "rightNote", default="")
    left = RoundedRectangle(width=5.2, height=3.4, corner_radius=0.2)\
        .set_fill("#3a2630", opacity=0.9).set_stroke(P.WARN, width=2).shift(LEFT * 3.1)
    right = RoundedRectangle(width=5.2, height=3.4, corner_radius=0.2)\
        .set_fill("#24382e", opacity=0.9).set_stroke(P.GOOD, width=2).shift(RIGHT * 3.1)
    lh = H.label(lt, color=P.WARN, scale=0.5, weight="BOLD").next_to(left.get_top(), DOWN, buff=0.2)
    rh = H.label(rt, color=P.GOOD, scale=0.5, weight="BOLD").next_to(right.get_top(), DOWN, buff=0.2)
    scene.play(FadeIn(left, shift=RIGHT * 0.2), FadeIn(lh), run_time=0.7)
    scene.play(FadeIn(right, shift=LEFT * 0.2), FadeIn(rh), run_time=0.7)
    if ln:
        lnl = H.label(ln, color=P.INK, scale=0.36).move_to(left.get_center())
        if lnl.width > left.width - 0.4:
            lnl.scale((left.width - 0.4) / lnl.width)
        scene.play(FadeIn(lnl), run_time=0.5)
    if rn:
        rnl = H.label(rn, color=P.INK, scale=0.36).move_to(right.get_center())
        if rnl.width > right.width - 0.4:
            rnl.scale((right.width - 0.4) / rnl.width)
        scene.play(FadeIn(rnl), run_time=0.5)
    scene.wait(0.4)


def build_drug_interactions(scene, params, mol_dir):
    title = _title(scene, _txt(params, "title", default="What it doesn't mix with"))
    drug = _txt(params, "drugLabel", "drug", "name", default="this drug")
    partners = params.get("interactsWith")
    if not isinstance(partners, list) or not partners:
        partners = [_txt(params, "note", default="certain medicines")]
    partners = [str(x) for x in partners][:4]
    # The drug as a puzzle piece in the centre.
    center = RoundedRectangle(width=2.2, height=1.4, corner_radius=0.15)\
        .set_fill(P.DRUG, opacity=1).set_stroke(P.DRUG_EDGE, width=3)
    notch = Circle(radius=0.28).set_fill(P.BG, opacity=1).set_stroke(P.DRUG_EDGE, width=2)\
        .move_to(center.get_right())
    dlbl = H.label(drug, color=P.BG, scale=0.4, weight="BOLD")
    if dlbl.width > center.width - 0.3:
        dlbl.scale((center.width - 0.3) / dlbl.width)
    dlbl.move_to(center)
    scene.play(FadeIn(center), FadeIn(notch), FadeIn(dlbl), run_time=0.7)
    # Clashing partners approach but don't fit (bump back).
    ys = np.linspace(2.0, -2.0, len(partners))
    for y, name in zip(ys, partners):
        piece = RoundedRectangle(width=1.9, height=1.0, corner_radius=0.15)\
            .set_fill(P.WARN, opacity=1).set_stroke("#a83e3e", width=3)\
            .move_to([5.2, y, 0])
        # A square bump that clearly won't fit the round notch.
        bump = Square(0.42).set_fill(P.WARN, opacity=1).set_stroke("#a83e3e", width=2)\
            .move_to(piece.get_left())
        plbl = H.label(name, color=P.INK, scale=0.34, weight="BOLD")
        if plbl.width > piece.width - 0.2:
            plbl.scale((piece.width - 0.2) / plbl.width)
        plbl.move_to(piece)
        grp = VGroup(piece, bump, plbl)
        scene.play(FadeIn(grp, shift=LEFT * 0.3), run_time=0.4)
        scene.play(grp.animate.shift(LEFT * 2.2), run_time=0.5,
                   rate_func=rate_functions.ease_out_sine)
        scene.play(grp.animate.shift(RIGHT * 0.5), Flash(bump, color=P.WARN, flash_radius=0.6),
                   run_time=0.35)
    res = H.label("tell your doctor about these", color="#f0c36b", scale=0.42)\
        .to_edge(DOWN, buff=0.7)
    scene.play(FadeIn(res), run_time=0.5)


def build_how_to_take(scene, params, mol_dir):
    title = _title(scene, _txt(params, "title", default="How to take it safely"))
    timing = _txt(params, "timing", default="once daily")
    with_food = bool(params.get("withFood", False))
    tips = params.get("tips")
    if not isinstance(tips, list):
        tips = []
    tips = [str(t) for t in tips][:3]
    # A simple 7-day calendar with pill marks.
    cal = VGroup()
    for i in range(7):
        cell = Square(0.8).set_fill(P.PANEL, opacity=1).set_stroke(P.PANEL_EDGE, width=2)
        cal.add(cell)
    cal.arrange(RIGHT, buff=0.15).shift(UP * 1.2)
    cal_lbl = H.label(timing, color=P.GOOD, scale=0.44, weight="BOLD").next_to(cal, UP, buff=0.3)
    scene.play(LaggedStart(*[FadeIn(c) for c in cal], lag_ratio=0.06), FadeIn(cal_lbl), run_time=1.0)
    pills = VGroup()
    for cell in cal:
        pill = RoundedRectangle(width=0.34, height=0.16, corner_radius=0.08)\
            .set_fill(P.DRUG, opacity=1).set_stroke(P.DRUG_EDGE, width=2).move_to(cell)
        pills.add(pill)
    scene.play(LaggedStart(*[GrowFromCenter(p) for p in pills], lag_ratio=0.08), run_time=1.0)
    # Food icon.
    food_txt = ("take WITH food" if with_food else "with or without food")
    plate = Circle(radius=0.5).set_fill("#3a4a63", opacity=1).set_stroke(P.INK, width=3)\
        .shift(DOWN * 0.6 + LEFT * 3)
    food_lbl = H.label(food_txt, color=P.INK, scale=0.4).next_to(plate, RIGHT, buff=0.3)
    scene.play(FadeIn(plate), FadeIn(food_lbl), run_time=0.6)
    if tips:
        grp = VGroup(*[H.label("• " + t, color=P.MUTE, scale=0.4) for t in tips])
        for g in grp:
            if g.width > 6:
                g.scale(6 / g.width)
        grp.arrange(DOWN, aligned_edge=LEFT, buff=0.22).to_edge(DOWN, buff=0.7)
        scene.play(LaggedStart(*[FadeIn(x, shift=RIGHT * 0.2) for x in grp], lag_ratio=0.2),
                   run_time=1.0)


def build_concept_card(scene, params, mol_dir):
    headline = _txt(params, "headline", "title", "text", default="Key point")
    sublines = params.get("sublines")
    accent = Circle(radius=0.5).set_fill(P.DRUG, opacity=0.9).set_stroke(P.DRUG_EDGE, width=3)\
        .to_edge(UP, buff=1.3)
    h = H.label(headline, color=P.INK, scale=0.6, weight="BOLD")
    if h.width > 11:
        h.scale(11 / h.width)
    h.next_to(accent, DOWN, buff=0.5)
    scene.play(GrowFromCenter(accent), Flash(accent, color=P.DRUG, flash_radius=0.9), run_time=0.7)
    scene.play(Write(h), run_time=0.9)
    if isinstance(sublines, list) and sublines:
        grp = VGroup()
        for s in [str(x) for x in sublines][:3]:
            item = H.label("• " + s, color=P.MUTE, scale=0.42)
            if item.width > 10:
                item.scale(10 / item.width)
            grp.add(item)
        grp.arrange(DOWN, aligned_edge=LEFT, buff=0.28).next_to(h, DOWN, buff=0.5)
        scene.play(LaggedStart(*[FadeIn(x, shift=RIGHT * 0.2) for x in grp], lag_ratio=0.2), run_time=1.2)


def build_outro_card(scene, params, mol_dir):
    line1 = _txt(params, "line1", "text", default="Understanding your medication")
    line2 = _txt(params, "line2", default="is a big step toward taking it safely.")
    a = H.label(line1, color=P.INK, scale=0.56)
    b = H.label(line2, color=P.GOOD, scale=0.56, weight="BOLD")
    for m in (a, b):
        if m.width > 11:
            m.scale(11 / m.width)
    a.move_to(UP * 0.4)
    b.next_to(a, DOWN, buff=0.3)
    scene.play(Write(a), run_time=1.0)
    scene.play(FadeIn(b, shift=UP * 0.2), run_time=0.8)
    scene.wait(0.6)


REGISTRY = {
    "title_card": build_title_card,
    "bloodstream_level": build_bloodstream_level,
    "organ_action": build_organ_action,
    "molecule_intro": build_molecule_intro,
    "receptor_binding": build_receptor_binding,
    "enzyme_inhibition": build_enzyme_inhibition,
    "channel_transporter": build_channel_transporter,
    "pathway_switch": build_pathway_switch,
    "cell_uptake": build_cell_uptake,
    "gauge": build_gauge,
    "journey": build_journey,
    "warning_vignette": build_warning_vignette,
    "two_panel_compare": build_two_panel_compare,
    "drug_interactions": build_drug_interactions,
    "how_to_take": build_how_to_take,
    "concept_card": build_concept_card,
    "outro_card": build_outro_card,
}

PRIMITIVE_NAMES = list(REGISTRY.keys())
