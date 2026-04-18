#!/usr/bin/env python3
"""
Validate notable-objects.json structure, required fields, and coordinate consistency.

Usage:
  python scripts/validate-notable-objects.py
"""

import json
import math
import os
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REGISTRY_PATH = os.path.join(PROJECT_ROOT, "static", "data", "notable-objects.json")

VALID_TYPES = {"nebula", "cluster", "blackhole", "pulsar", "magnetar", "variable_star"}

TYPE_SUBTYPES = {
    "nebula": {"emission", "reflection", "planetary", "dark", "supernova_remnant"},
    "cluster": {"globular", "open"},
    "blackhole": {"stellar", "supermassive"},
    "pulsar": {"radio", "millisecond", "x-ray"},
    "magnetar": {"sgr", "axp"},
    "variable_star": {"eclipsing", "pulsating", "eruptive", "cataclysmic", "rotating"},
}

TYPE_REQUIRED_FIELDS = {
    "nebula": ["subtype", "angular_size_arcmin"],
    "cluster": ["subtype", "angular_size_arcmin", "star_count"],
    "blackhole": ["subtype", "mass_solar"],
    "pulsar": ["subtype", "period_ms"],
    "magnetar": ["subtype", "period_s", "magnetic_field_T"],
    "variable_star": ["subtype", "period_days", "mag_range"],
}

BASE_FIELDS = [
    "id", "name", "catalog_ids", "type", "ra", "dec",
    "dist_pc", "x", "y", "z", "description", "texture_ref",
]


def validate():
    errors = []
    warnings = []

    if not os.path.exists(REGISTRY_PATH):
        print(f"ERROR: {REGISTRY_PATH} not found")
        sys.exit(1)

    with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Top-level structure
    if data.get("format_version") != 1:
        errors.append(f"format_version should be 1, got {data.get('format_version')}")

    objects = data.get("objects", [])
    total = data.get("total_objects", 0)

    if total != len(objects):
        errors.append(f"total_objects ({total}) != actual count ({len(objects)})")

    # Unique IDs
    ids = [o.get("id") for o in objects]
    if len(set(ids)) != len(ids):
        dupes = [i for i in ids if ids.count(i) > 1]
        errors.append(f"Duplicate IDs: {set(dupes)}")

    for obj in objects:
        oid = obj.get("id", "?")

        # Base fields
        for field in BASE_FIELDS:
            if field not in obj:
                errors.append(f"{oid}: missing base field '{field}'")

        # Type check
        otype = obj.get("type")
        if otype not in VALID_TYPES:
            errors.append(f"{oid}: invalid type '{otype}'")
            continue

        # Subtype check
        subtype = obj.get("subtype")
        if subtype not in TYPE_SUBTYPES.get(otype, set()):
            errors.append(f"{oid}: invalid subtype '{subtype}' for type '{otype}'")

        # Type-specific fields
        for field in TYPE_REQUIRED_FIELDS.get(otype, []):
            if field not in obj:
                errors.append(f"{oid}: missing field '{field}' for type '{otype}'")

        # Coordinate consistency
        ra = obj.get("ra", 0)
        dec = obj.get("dec", 0)
        dist = obj.get("dist_pc", 0)

        if not (0 <= ra <= 360):
            errors.append(f"{oid}: RA {ra} out of range [0, 360]")
        if not (-90 <= dec <= 90):
            errors.append(f"{oid}: Dec {dec} out of range [-90, 90]")
        if dist <= 0:
            errors.append(f"{oid}: distance {dist} must be positive")

        ra_rad = ra * math.pi / 180
        dec_rad = dec * math.pi / 180
        ex = dist * math.cos(dec_rad) * math.cos(ra_rad)
        ey = dist * math.cos(dec_rad) * math.sin(ra_rad)
        ez = dist * math.sin(dec_rad)

        tol = max(1, dist * 0.01)
        if abs(obj.get("x", 0) - ex) > tol:
            errors.append(f"{oid}: x={obj.get('x')} but expected {ex:.1f}")
        if abs(obj.get("y", 0) - ey) > tol:
            errors.append(f"{oid}: y={obj.get('y')} but expected {ey:.1f}")
        if abs(obj.get("z", 0) - ez) > tol:
            errors.append(f"{oid}: z={obj.get('z')} but expected {ez:.1f}")

        # Description quality
        desc = obj.get("description", "")
        if len(desc) < 10:
            warnings.append(f"{oid}: description too short ({len(desc)} chars)")

    # Report
    type_counts = {}
    for obj in objects:
        t = obj.get("type", "?")
        type_counts[t] = type_counts.get(t, 0) + 1

    print(f"Notable Object Registry: {len(objects)} objects")
    for t, c in sorted(type_counts.items()):
        print(f"  {t}: {c}")

    if warnings:
        print(f"\n{len(warnings)} warning(s):")
        for w in warnings:
            print(f"  WARN: {w}")

    if errors:
        print(f"\n{len(errors)} error(s):")
        for e in errors:
            print(f"  ERROR: {e}")
        sys.exit(1)
    else:
        print("\nAll checks passed.")


if __name__ == "__main__":
    validate()
