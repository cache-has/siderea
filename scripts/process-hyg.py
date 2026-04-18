#!/usr/bin/env python3
"""
Process HYG star catalog v4.2 into compact binary format for Siderea.

Downloads HYG v4.2 CSV from Codeberg, extracts relevant fields, and outputs:
  - static/data/stars.bin   — GPU-friendly binary (positions, magnitudes, colors, proper motion)
  - static/data/stars-meta.json — Notable star metadata (names, designations, catalog IDs)

Binary format (little-endian):
  Header (20 bytes):
    magic:    4 bytes  "SIDR"
    version:  uint32   format version (1)
    count:    uint32   total star count
    notable:  uint32   notable star count
    reserved: uint32   0

  Data arrays (tightly packed, no padding):
    positions:    float32[count * 3]   x, y, z in parsecs (J2000 equatorial)
    app_mag:      float32[count]       apparent visual magnitude
    abs_mag:      float32[count]       absolute visual magnitude
    color_index:  uint8[count]         quantized B-V: val = (bv + 0.5) / 3.0 * 255, clamped [0,255]
    padding:      0-3 bytes            align to 4-byte boundary
    pmra:         float32[count]       proper motion RA (mas/yr)
    pmdec:        float32[count]       proper motion Dec (mas/yr)

Usage:
  python scripts/process-hyg.py [--no-download]
"""

import csv
import gzip
import io
import json
import math
import os
import struct
import sys
import urllib.request

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(PROJECT_ROOT, "data", "raw")
CURATED_DIR = os.path.join(PROJECT_ROOT, "data", "curated")
OUT_DIR = os.path.join(PROJECT_ROOT, "static", "data")

HYG_URL = "https://codeberg.org/astronexus/hyg/media/branch/main/data/hyg/CURRENT/hyg_v42.csv.gz"
HYG_CACHED = os.path.join(RAW_DIR, "hyg_v42.csv.gz")

# Binary format constants
MAGIC = b"SIDR"
FORMAT_VERSION = 1

# B-V quantization range: [-0.5, 2.5] → [0, 255]
BV_MIN = -0.5
BV_MAX = 2.5
BV_RANGE = BV_MAX - BV_MIN


def download_hyg():
    """Download HYG v4.2 CSV if not cached."""
    if os.path.exists(HYG_CACHED):
        print(f"Using cached {HYG_CACHED}")
        return
    os.makedirs(RAW_DIR, exist_ok=True)
    print(f"Downloading HYG v4.2 from {HYG_URL}...")
    urllib.request.urlretrieve(HYG_URL, HYG_CACHED)
    size_mb = os.path.getsize(HYG_CACHED) / (1024 * 1024)
    print(f"Downloaded {size_mb:.1f} MB")


def parse_float(val, default=0.0):
    """Parse a CSV field as float, returning default if empty/invalid."""
    if not val or val.strip() == "":
        return default
    try:
        return float(val)
    except ValueError:
        return default


def quantize_bv(bv):
    """Quantize B-V color index to uint8 [0, 255]."""
    normalized = (bv - BV_MIN) / BV_RANGE
    return max(0, min(255, int(normalized * 255 + 0.5)))


def process_catalog(no_download=False):
    """Process HYG CSV into binary catalog + JSON metadata."""
    if not no_download:
        download_hyg()

    if not os.path.exists(HYG_CACHED):
        print(f"Error: {HYG_CACHED} not found. Run without --no-download first.", file=sys.stderr)
        sys.exit(1)

    print("Parsing HYG catalog...")

    # Arrays for binary output
    positions = []  # (x, y, z) in parsecs
    app_mags = []
    abs_mags = []
    color_indices = []  # quantized uint8
    pmra_vals = []
    pmdec_vals = []

    # Notable stars (those with proper names)
    notable_stars = []

    # Index maps for finding manual entries by HIP or Bayer designation
    hip_to_index = {}
    bf_to_index = {}
    catalog_dist = {}
    manual_spectral = {}
    manual_constellation = {}
    manual_ra = {}
    manual_dec = {}

    with gzip.open(HYG_CACHED, "rt", encoding="utf-8") as gz:
        reader = csv.DictReader(gz)

        for row in reader:
            x = parse_float(row.get("x", ""))
            y = parse_float(row.get("y", ""))
            z = parse_float(row.get("z", ""))
            dist = parse_float(row.get("dist", ""), default=100000.0)

            # Skip stars with no meaningful position (dist >= 100000 = missing parallax)
            # but keep them with default position for completeness
            if dist >= 100000.0:
                # Use RA/Dec with large default distance for directionality
                ra_rad = parse_float(row.get("rarad", ""))
                dec_rad = parse_float(row.get("decrad", ""))
                far_dist = 1000.0  # place at 1000 pc for background stars
                x = far_dist * math.cos(dec_rad) * math.cos(ra_rad)
                y = far_dist * math.cos(dec_rad) * math.sin(ra_rad)
                z = far_dist * math.sin(dec_rad)

            positions.extend([x, y, z])

            app_mag = parse_float(row.get("mag", ""), default=20.0)
            abs_mag = parse_float(row.get("absmag", ""), default=20.0)
            app_mags.append(app_mag)
            abs_mags.append(abs_mag)

            bv = parse_float(row.get("ci", ""), default=0.62)  # default to Sun-like
            color_indices.append(quantize_bv(bv))

            pmra_vals.append(parse_float(row.get("pmra", "")))
            pmdec_vals.append(parse_float(row.get("pmdec", "")))

            # Track HIP/Bayer → index for manual entries lookup
            idx = len(app_mags) - 1
            hip_val = (row.get("hip", "") or "").strip()
            bf_val = (row.get("bf", "") or "").strip()
            if hip_val:
                try:
                    hip_id = int(float(hip_val))
                    hip_to_index[hip_id] = idx
                    manual_spectral[hip_id] = (row.get("spect", "") or "").strip()
                    manual_constellation[hip_id] = (row.get("con", "") or "").strip()
                    manual_ra[hip_id] = parse_float(row.get("ra", ""))
                    manual_dec[hip_id] = parse_float(row.get("dec", ""))
                except ValueError:
                    pass
            if bf_val:
                bf_to_index[bf_val] = idx
            catalog_dist[idx] = dist

            # Check if this is a notable star
            proper = (row.get("proper", "") or "").strip()
            if proper:
                idx = len(app_mags) - 1
                notable = {
                    "index": idx,
                    "name": proper,
                    "spectral": (row.get("spect", "") or "").strip(),
                    "constellation": (row.get("con", "") or "").strip(),
                    "ra": parse_float(row.get("ra", "")),
                    "dec": parse_float(row.get("dec", "")),
                    "dist": dist,
                    "mag": app_mag,
                    "absmag": abs_mag,
                    "bv": parse_float(row.get("ci", ""), default=0.62),
                }
                # Add catalog IDs if present
                hip = (row.get("hip", "") or "").strip()
                if hip:
                    notable["hip"] = int(float(hip))
                hd = (row.get("hd", "") or "").strip()
                if hd:
                    notable["hd"] = int(float(hd))
                bayer = (row.get("bf", "") or "").strip()
                if bayer:
                    notable["bayer"] = bayer

                notable_stars.append(notable)

    count = len(app_mags)
    print(f"Processed {count} stars, {len(notable_stars)} notable")

    # Merge star descriptions from curated data
    desc_path = os.path.join(CURATED_DIR, "star-descriptions.json")
    if os.path.exists(desc_path):
        with open(desc_path, "r", encoding="utf-8") as f:
            descriptions = json.load(f)
        matched = 0
        for star in notable_stars:
            desc = descriptions.get(star["name"])
            if desc:
                star["description"] = desc
                matched += 1
        print(f"Merged {matched}/{len(notable_stars)} star descriptions")

    # Merge extended star properties (categories, features, mass/radius)
    ext_path = os.path.join(CURATED_DIR, "star-extended.json")
    if os.path.exists(ext_path):
        with open(ext_path, "r", encoding="utf-8") as f:
            extended = json.load(f)

        # Build index of existing notable stars by name for quick lookup
        notable_by_name = {s["name"]: s for s in notable_stars}
        # Also index by Bayer designation
        notable_by_bayer = {}
        for s in notable_stars:
            if "bayer" in s:
                notable_by_bayer[s["bayer"].strip()] = s

        # Add manual entries (stars not in HYG's proper name field)
        # These need to be found in the catalog by HIP or Bayer designation
        manual_entries = extended.get("manual_entries", [])
        manual_added = 0
        for entry in manual_entries:
            if entry["name"] in notable_by_name:
                continue  # Already exists as a notable star
            # Find by HIP ID in the catalog CSV — we need to re-scan
            # Instead, find by Bayer designation in existing notable stars
            bf = entry.get("bf", "")
            hip = entry.get("hip")
            # Search through all catalog rows to find the index
            found = False
            for i, star in enumerate(notable_stars):
                b = (star.get("bayer") or "").replace(" ", "")
                if bf and b.replace(" ", "") == bf.replace(" ", ""):
                    found = True
                    break
                if hip and star.get("hip") == hip:
                    found = True
                    break
            if not found:
                # Need to find the star's index in the binary catalog by HIP
                # This requires a second pass, but we saved hip→index during parsing
                idx = hip_to_index.get(hip) if hip else bf_to_index.get(bf)
                if idx is not None:
                    manual = {
                        "index": idx,
                        "name": entry["name"],
                        "spectral": manual_spectral.get(hip, ""),
                        "constellation": manual_constellation.get(hip, ""),
                        "ra": manual_ra.get(hip, 0.0) if hip else 0.0,
                        "dec": manual_dec.get(hip, 0.0) if hip else 0.0,
                        "dist": catalog_dist.get(idx, 1000.0),
                        "mag": app_mags[idx],
                        "absmag": abs_mags[idx],
                        "bv": (color_indices[idx] / 255.0) * BV_RANGE + BV_MIN,
                    }
                    if hip:
                        manual["hip"] = hip
                    if bf:
                        manual["bayer"] = bf
                    if "description" in entry:
                        manual["description"] = entry["description"]
                    if "categories" in entry:
                        manual["categories"] = entry["categories"]
                    if "notable_features" in entry:
                        manual["notable_features"] = entry["notable_features"]
                    notable_stars.append(manual)
                    notable_by_name[entry["name"]] = manual
                    manual_added += 1
                    print(f"  Added manual entry: {entry['name']} (idx {idx})")
                else:
                    print(f"  Warning: Could not find manual entry {entry['name']} in catalog")

        if manual_added:
            print(f"Added {manual_added} manual notable star entries")

        # Merge extensions (categories, features, mass/radius) into existing notable stars
        extensions = extended.get("extensions", {})
        ext_matched = 0
        for star in notable_stars:
            ext = extensions.get(star["name"])
            if ext:
                for key in ("categories", "notable_features", "mass_solar", "radius_solar"):
                    if key in ext:
                        star[key] = ext[key]
                ext_matched += 1

        # Auto-assign categories based on data
        for star in notable_stars:
            cats = set(star.get("categories", []))
            if star["mag"] <= 1.5 and star["name"] != "Sol":
                cats.add("brightest")
            if 0 < star["dist"] < 5:
                cats.add("nearest")
            if cats:
                star["categories"] = sorted(cats)

        print(f"Merged {ext_matched} extended star entries, auto-categorized all")

    # Write binary catalog
    os.makedirs(OUT_DIR, exist_ok=True)
    bin_path = os.path.join(OUT_DIR, "stars.bin")

    with open(bin_path, "wb") as f:
        # Header (20 bytes)
        f.write(MAGIC)
        f.write(struct.pack("<I", FORMAT_VERSION))
        f.write(struct.pack("<I", count))
        f.write(struct.pack("<I", len(notable_stars)))
        f.write(struct.pack("<I", 0))  # reserved

        # Positions: float32[count * 3]
        f.write(struct.pack(f"<{len(positions)}f", *positions))

        # Apparent magnitudes: float32[count]
        f.write(struct.pack(f"<{count}f", *app_mags))

        # Absolute magnitudes: float32[count]
        f.write(struct.pack(f"<{count}f", *abs_mags))

        # Color indices: uint8[count]
        f.write(struct.pack(f"<{count}B", *color_indices))

        # Pad to 4-byte alignment after uint8 array
        padding = (4 - (count % 4)) % 4
        f.write(b"\x00" * padding)

        # Proper motion RA: float32[count]
        f.write(struct.pack(f"<{count}f", *pmra_vals))

        # Proper motion Dec: float32[count]
        f.write(struct.pack(f"<{count}f", *pmdec_vals))

    bin_size = os.path.getsize(bin_path)
    print(f"Binary catalog: {bin_path} ({bin_size / (1024 * 1024):.2f} MB)")

    # Write notable stars metadata
    meta_path = os.path.join(OUT_DIR, "stars-meta.json")
    meta = {
        "format_version": FORMAT_VERSION,
        "total_stars": count,
        "bv_quantization": {"min": BV_MIN, "max": BV_MAX},
        "coordinate_system": "J2000 equatorial, parsecs",
        "source": "HYG v4.2 (Codeberg astronexus/hyg)",
        "license": "CC-BY-SA 4.0",
        "stars": notable_stars,
    }
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, separators=(",", ":"))

    meta_size = os.path.getsize(meta_path)
    print(f"Notable metadata: {meta_path} ({meta_size / 1024:.1f} KB)")
    print(f"Total: {(bin_size + meta_size) / (1024 * 1024):.2f} MB")


if __name__ == "__main__":
    no_download = "--no-download" in sys.argv
    process_catalog(no_download=no_download)
