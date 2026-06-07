# Vitalis Visual Style Guide

> Source of truth for the parametric anatomical asset library (PLAN §5). Governs
> both library assets (illustrator deliverables) and the limited raster-gen
> background prompts. **Stub** — fully specified in Phase 1 with the illustrator.

## Style DNA (adapted from the Xiaohei principles, translated to English)
- **Cognitive anchors, not decoration.** Illustrate the *mechanism* — the receptor,
  the cascade, the transporter — never generic stock bodies.
- **Style over template.** A recognizable look, not copied compositions. Reinvent
  the metaphor per video.
- Base aesthetic: **anatomical line-art on near-white (`#fbfbf9`)**, restrained
  physiological color accents — arterial red, venous blue, neural gold. Generous
  white space. Clean, not clinical-gross.

## Library rules
- Load-bearing mechanism diagrams come from **validated library assets only**.
- Flux/Ideogram raster gen is for **non-anatomical backgrounds/texture only** — never
  the diagram.
- Every asset is **RN-validated once** before entering the library (the accuracy
  guarantee, §5.2). Correctness lives in the asset, not per-render inference.

## Launch scope
- Axis: **drugs / mechanisms** — the drug is the recurring unit; disease is context (PLAN §1).
- Wedge = the **universal PK/PD primitive set** (PLAN §5.3): ADME path (absorption,
  CYP450 first-pass, distribution, renal clearance) + target-interaction archetypes
  (receptor agonist/antagonist, enzyme inhibition, transporter/ion-channel blockade,
  signal cascade). Launch drugs are chosen to **span** these primitives, not cluster in a disease.
- Coverage rule: **no drug outruns the library.**
