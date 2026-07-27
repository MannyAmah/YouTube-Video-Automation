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
