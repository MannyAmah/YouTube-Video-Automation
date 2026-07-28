"""Shared visual palette for MedExplained animations."""

BG = "#0e1726"
BLOOD = "#3a4a63"
BLOOD_EDGE = "#55688a"
GLUCOSE = "#ffd166"
GLUCOSE_EDGE = "#e8a90c"
PARTICLE = "#ffd166"
PARTICLE_EDGE = "#e8a90c"
DRUG = "#7db2ff"
DRUG_EDGE = "#4a86e8"
GOOD = "#5fd18c"
WARN = "#ff6b6b"
INK = "#e8eef7"
MUTE = "#9fb3d1"
PANEL = "#132033"
PANEL_EDGE = "#2c4060"

ORGAN_COLORS = {
    "liver": ("#b5646e", "#8a4a53"),
    "kidney": ("#c98a5a", "#a06a3f"),
    "heart": ("#d16a6a", "#a84e4e"),
    "stomach": ("#c9a15a", "#a07f3f"),
    "gut": ("#c9a15a", "#a07f3f"),
    "intestine": ("#c9a15a", "#a07f3f"),
    "pancreas": ("#a0a05a", "#7f7f3f"),
    "lung": ("#7fa8c9", "#5f86a0"),
    "brain": ("#b58ac9", "#8a63a0"),
    "muscle": ("#5b8c7b", "#3f6558"),
    "blood_vessel": (BLOOD, BLOOD_EDGE),
    "cell": ("#4a6a8a", "#35506a"),
    "bone": ("#c9c4b5", "#a09a8a"),
    "thyroid": ("#c97fa1", "#a05f7f"),
}


def organ_color(name: str):
    return ORGAN_COLORS.get(name, ("#6b7a94", "#4a5a74"))


# Per-medication visual themes so no two medications' videos look alike.
THEMES = [
    {"BG": "#0e1726", "DRUG": "#7db2ff", "DRUG_EDGE": "#4a86e8", "GOOD": "#5fd18c"},
    {"BG": "#151022", "DRUG": "#b98cff", "DRUG_EDGE": "#8a5ad6", "GOOD": "#5fd18c"},
    {"BG": "#0d1f1b", "DRUG": "#57d1b4", "DRUG_EDGE": "#2fa088", "GOOD": "#ffd166"},
    {"BG": "#1c1420", "DRUG": "#ff9bb5", "DRUG_EDGE": "#e0658a", "GOOD": "#7dd3a8"},
    {"BG": "#0f1a24", "DRUG": "#7dd3ff", "DRUG_EDGE": "#3f9fd6", "GOOD": "#ffb86b"},
    {"BG": "#181410", "DRUG": "#ffc46b", "DRUG_EDGE": "#e09a3c", "GOOD": "#7db2ff"},
    {"BG": "#101625", "DRUG": "#9be15d", "DRUG_EDGE": "#6fae35", "GOOD": "#7db2ff"},
    {"BG": "#141a1e", "DRUG": "#ff8f6b", "DRUG_EDGE": "#d9633c", "GOOD": "#5fd1c0"},
]


def set_theme(index: int) -> None:
    """Mutate the module palette to a per-medication theme (by index)."""
    global BG, DRUG, DRUG_EDGE, GOOD, PARTICLE, PARTICLE_EDGE
    t = THEMES[index % len(THEMES)]
    BG = t["BG"]
    DRUG = t["DRUG"]
    DRUG_EDGE = t["DRUG_EDGE"]
    GOOD = t["GOOD"]
