#!/usr/bin/env python3
"""
Generate constellation line data for Siderea.

Reads HYG v4.2 CSV to get star positions by HIP ID, then outputs
static/data/constellations.json with pre-computed 3D line segments
in parsecs (J2000 equatorial), matching the star catalog coordinate system.

Constellation stick figure definitions from IAU standard patterns,
using Hipparcos catalog IDs for each star endpoint.

Usage:
  python scripts/generate-constellations.py
"""

import csv
import gzip
import json
import math
import os
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(PROJECT_ROOT, "data", "raw")
OUT_DIR = os.path.join(PROJECT_ROOT, "static", "data")

HYG_CACHED = os.path.join(RAW_DIR, "hyg_v42.csv.gz")

# IAU constellation stick figures: each entry is (abbreviation, full_name, [hip_id_chains])
# Each chain is a list of HIP IDs to connect sequentially (line strip).
# Source: Standard IAU constellation patterns (Hipparcos IDs).
CONSTELLATIONS = {
    "And": {
        "name": "Andromeda",
        "chains": [[677, 5447, 9640, 14576], [5447, 4436], [9640, 8903]]
    },
    "Ant": {
        "name": "Antlia",
        "chains": [[51172, 46515]]
    },
    "Aps": {
        "name": "Apus",
        "chains": [[72370, 81065, 80047, 81852]]
    },
    "Aqr": {
        "name": "Aquarius",
        "chains": [[109074, 110395, 112961, 114341], [110395, 109139, 106278, 104459, 102618],
                    [106278, 105881, 106786, 110003, 110672, 111497, 112029, 114724],
                    [110003, 109074]]
    },
    "Aql": {
        "name": "Aquila",
        "chains": [[97649, 97278, 95501, 93747, 93244],
                    [97649, 98036, 99473],
                    [97649, 93805]]
    },
    "Ara": {
        "name": "Ara",
        "chains": [[85792, 85267, 83081, 82363, 83153, 85267],
                    [85792, 85727, 88714]]
    },
    "Ari": {
        "name": "Aries",
        "chains": [[9884, 8903, 8832]]
    },
    "Aur": {
        "name": "Auriga",
        "chains": [[24608, 23015, 23416, 28360, 28380, 25428, 24608],
                    [25428, 23453]]
    },
    "Boo": {
        "name": "Boötes",
        "chains": [[69673, 67927, 67459, 65477, 63608],
                    [69673, 72105, 71075, 67927],
                    [69673, 71795, 73555, 74666, 75411]]
    },
    "Cae": {
        "name": "Caelum",
        "chains": [[21770, 21060]]
    },
    "Cam": {
        "name": "Camelopardalis",
        "chains": [[17959, 16228, 23522, 22783]]
    },
    "Cnc": {
        "name": "Cancer",
        "chains": [[42911, 40526, 42806, 44066],
                    [42806, 43103]]
    },
    "CVn": {
        "name": "Canes Venatici",
        "chains": [[63125, 61317]]
    },
    "CMa": {
        "name": "Canis Major",
        "chains": [[32349, 33579, 34444, 35904, 33152],
                    [33579, 33856, 35037],
                    [32349, 31592, 30324],
                    [32349, 33160]]
    },
    "CMi": {
        "name": "Canis Minor",
        "chains": [[36188, 37279]]
    },
    "Cap": {
        "name": "Capricornus",
        "chains": [[100345, 100064, 104139, 105881, 106985, 107556, 100345],
                    [104139, 105515]]
    },
    "Car": {
        "name": "Carina",
        "chains": [[30438, 45238, 50099, 52419, 51576, 45556, 42913, 41037, 30438]]
    },
    "Cas": {
        "name": "Cassiopeia",
        "chains": [[3179, 4427, 6686, 8886, 11569]]
    },
    "Cen": {
        "name": "Centaurus",
        "chains": [[68702, 66657, 61932, 59196, 56561, 56480],
                    [61932, 60823, 59747, 56343],
                    [71683, 68702, 68933],
                    [60823, 61359]]
    },
    "Cep": {
        "name": "Cepheus",
        "chains": [[105199, 106032, 109492, 112724, 116727, 105199],
                    [109492, 107259, 102422]]
    },
    "Cet": {
        "name": "Cetus",
        "chains": [[14135, 12706, 12387, 13954, 14135],
                    [12706, 11484, 8645, 6537, 3419],
                    [8645, 5364]]
    },
    "Cha": {
        "name": "Chamaeleon",
        "chains": [[40702, 51839, 60000, 58484]]
    },
    "Cir": {
        "name": "Circinus",
        "chains": [[71908, 74824, 75323]]
    },
    "Col": {
        "name": "Columba",
        "chains": [[25859, 27628, 28328, 26634, 25859],
                    [28328, 30277]]
    },
    "Com": {
        "name": "Coma Berenices",
        "chains": [[64394, 60742, 64241]]
    },
    "CrA": {
        "name": "Corona Australis",
        "chains": [[93174, 92953, 91875, 90887, 90422, 89908]]
    },
    "CrB": {
        "name": "Corona Borealis",
        "chains": [[76127, 76267, 76952, 77512, 78159, 78493, 78944]]
    },
    "Crv": {
        "name": "Corvus",
        "chains": [[59803, 60965, 61359, 59316, 59803, 59199]]
    },
    "Crt": {
        "name": "Crater",
        "chains": [[53740, 54682, 55705, 57283, 55282, 53740]]
    },
    "Cru": {
        "name": "Crux",
        "chains": [[60718, 62434], [59747, 61084]]
    },
    "Cyg": {
        "name": "Cygnus",
        "chains": [[102098, 100453, 97165, 95947, 94779],
                    [100453, 98110, 95853, 94779],
                    [100453, 104060, 107310]]
    },
    "Del": {
        "name": "Delphinus",
        "chains": [[101421, 101769, 102281, 101958, 101421, 102532]]
    },
    "Dor": {
        "name": "Dorado",
        "chains": [[21281, 26069, 27890, 27100, 21281]]
    },
    "Dra": {
        "name": "Draconis",
        "chains": [[87585, 85670, 85829, 87833, 89937, 94376, 97433, 94648, 89908, 87585],
                    [85670, 83895, 80331, 78527, 75458, 68756, 61281, 56211]]
    },
    "Equ": {
        "name": "Equuleus",
        "chains": [[104521, 104858, 104987]]
    },
    "Eri": {
        "name": "Eridanus",
        "chains": [[21421, 20535, 19587, 18216, 17378, 16611, 15510, 14146, 13847, 12843,
                     12413, 11407, 10602, 9007, 7588, 7588]]
    },
    "For": {
        "name": "Fornax",
        "chains": [[14879, 13147, 9677]]
    },
    "Gem": {
        "name": "Gemini",
        "chains": [[36850, 35550, 34088, 32246, 31681],
                    [37826, 35350, 34693, 33018, 30883, 29655, 28734],
                    [37826, 36850]]
    },
    "Gru": {
        "name": "Grus",
        "chains": [[109268, 112122, 114421, 112623, 109268, 108085, 105319],
                    [112623, 113638, 114131]]
    },
    "Her": {
        "name": "Hercules",
        "chains": [[84345, 85693, 86414, 87933, 86974, 85693],
                    [84345, 83207, 81693, 80463, 80170],
                    [84345, 84379, 81126, 79992],
                    [86414, 87808, 88794]]
    },
    "Hor": {
        "name": "Horologium",
        "chains": [[19747, 12225, 12484]]
    },
    "Hya": {
        "name": "Hydra",
        "chains": [[42799, 42402, 43234, 43813, 46390, 47431, 49841, 51069, 52943, 53740],
                    [42313, 42402],
                    [42799, 43109, 42313]]
    },
    "Hyi": {
        "name": "Hydrus",
        "chains": [[2021, 9236, 17678, 2021]]
    },
    "Ind": {
        "name": "Indus",
        "chains": [[101772, 103227, 108431]]
    },
    "Lac": {
        "name": "Lacerta",
        "chains": [[111022, 111104, 111169, 110351, 109937, 110538, 111022]]
    },
    "Leo": {
        "name": "Leo",
        "chains": [[49583, 49669, 50583, 54872, 57632, 54879],
                    [49669, 47908, 46750, 48455, 50583],
                    [57632, 57757]]
    },
    "LMi": {
        "name": "Leo Minor",
        "chains": [[51233, 49593, 46952]]
    },
    "Lep": {
        "name": "Lepus",
        "chains": [[25606, 25985, 27288, 28910, 27654, 25606, 24305, 24436, 23685],
                    [27288, 27072]]
    },
    "Lib": {
        "name": "Libra",
        "chains": [[72622, 76333, 74785, 73714, 72622]]
    },
    "Lup": {
        "name": "Lupus",
        "chains": [[75141, 73273, 71860, 70576, 68282],
                    [73273, 74395, 75264, 75141],
                    [71860, 73273]]
    },
    "Lyn": {
        "name": "Lynx",
        "chains": [[45860, 44700, 41075, 36145, 33449, 30060]]
    },
    "Lyr": {
        "name": "Lyra",
        "chains": [[91262, 91971, 92420, 93194, 92791, 91971]]
    },
    "Men": {
        "name": "Mensa",
        "chains": [[25918, 21949]]
    },
    "Mic": {
        "name": "Microscopium",
        "chains": [[102831, 103738, 105140]]
    },
    "Mon": {
        "name": "Monoceros",
        "chains": [[30867, 29651, 34769, 31216]]
    },
    "Mus": {
        "name": "Musca",
        "chains": [[61585, 62322, 63613, 61199, 57363, 61585]]
    },
    "Nor": {
        "name": "Norma",
        "chains": [[80000, 78914, 80582, 80000]]
    },
    "Oct": {
        "name": "Octans",
        "chains": [[70638, 107089, 112405]]
    },
    "Oph": {
        "name": "Ophiuchus",
        "chains": [[84012, 86032, 86742, 87108, 84893, 80883, 80763, 79593, 80473, 84012],
                    [80763, 80569, 79593]]
    },
    "Ori": {
        "name": "Orion",
        "chains": [[26727, 26311, 25930, 25336, 24436, 22449, 22509, 22845],
                    [27989, 27366, 26727],
                    [26311, 28614, 29426],
                    [25336, 25930, 27989, 28691, 29038]]
    },
    "Pav": {
        "name": "Pavo",
        "chains": [[100751, 98495, 93015, 90098, 86929, 88866, 91792, 93015]]
    },
    "Peg": {
        "name": "Pegasus",
        "chains": [[677, 113963, 112158, 109410, 113881, 112748, 112158],
                    [113963, 109176, 107315, 109410]]
    },
    "Per": {
        "name": "Perseus",
        "chains": [[18532, 17448, 15863, 14576, 14328, 13268, 13531, 14576],
                    [18532, 18614, 17358, 14668, 13254, 13268]]
    },
    "Phe": {
        "name": "Phoenix",
        "chains": [[2081, 5165, 6867, 2081, 765, 2081],
                    [5165, 5348, 8837]]
    },
    "Pic": {
        "name": "Pictor",
        "chains": [[27321, 32607]]
    },
    "Psc": {
        "name": "Pisces",
        "chains": [[3786, 4906, 7097, 8198, 9487, 8833, 7884, 6193, 5586, 5742, 4889, 3786],
                    [7097, 7007]]
    },
    "PsA": {
        "name": "Piscis Austrinus",
        "chains": [[113368, 111954, 109285, 107608, 109285, 111188, 113246, 113368]]
    },
    "Pup": {
        "name": "Puppis",
        "chains": [[35264, 36917, 38170, 39429, 39757, 38170],
                    [35264, 38070, 39953]]
    },
    "Pyx": {
        "name": "Pyxis",
        "chains": [[42515, 43409, 39429]]
    },
    "Ret": {
        "name": "Reticulum",
        "chains": [[19780, 17440, 19921, 18597, 19780]]
    },
    "Sge": {
        "name": "Sagitta",
        "chains": [[96837, 97365, 98337, 96757]]
    },
    "Sgr": {
        "name": "Sagittarius",
        "chains": [[90185, 89931, 92041, 93506, 93864, 92855, 90185, 89642, 88635, 90496],
                    [93506, 95168, 95294, 93864],
                    [92855, 93085, 92855]]
    },
    "Sco": {
        "name": "Scorpius",
        "chains": [[78820, 79593, 80112, 80763, 82396, 82514, 82729, 84143, 86228, 87073, 86670],
                    [78820, 78265, 78401]]
    },
    "Scl": {
        "name": "Sculptor",
        "chains": [[4577, 117452, 115102]]
    },
    "Sct": {
        "name": "Scutum",
        "chains": [[91117, 90595, 89931, 91726, 91117]]
    },
    "Ser": {
        "name": "Serpens",
        "chains": [[77070, 77233, 77450, 78072, 77622, 76852, 76276, 75141],
                    [86263, 86565, 88048, 89962, 92946]]
    },
    "Sex": {
        "name": "Sextans",
        "chains": [[49641, 48437, 51362]]
    },
    "Tau": {
        "name": "Taurus",
        "chains": [[21421, 20205, 20455, 18724],
                    [21421, 20889, 20894, 21881, 25428],
                    [26451, 24608]]
    },
    "Tel": {
        "name": "Telescopium",
        "chains": [[90422, 90568]]
    },
    "Tri": {
        "name": "Triangulum",
        "chains": [[10064, 8796, 10559, 10064]]
    },
    "TrA": {
        "name": "Triangulum Australe",
        "chains": [[77952, 74946, 82273, 77952]]
    },
    "Tuc": {
        "name": "Tucana",
        "chains": [[110130, 114996, 2484, 1599, 110130]]
    },
    "UMa": {
        "name": "Ursa Major",
        "chains": [[54061, 53910, 58001, 59774, 62956, 65378, 67301],
                    [59774, 59000, 54539, 53910, 48319, 46733, 48402, 53910]]
    },
    "UMi": {
        "name": "Ursa Minor",
        "chains": [[11767, 85822, 82080, 77055, 75097, 72607, 77055],
                    [72607, 79822, 82080]]
    },
    "Vel": {
        "name": "Vela",
        "chains": [[42913, 44816, 46651, 48774, 50191, 52727, 45941, 42913]]
    },
    "Vir": {
        "name": "Virgo",
        "chains": [[65474, 63608, 61941, 60129, 57757],
                    [63608, 66249, 69701, 72220],
                    [66249, 68520, 71957]]
    },
    "Vol": {
        "name": "Volans",
        "chains": [[34481, 39794, 41312, 37504, 34481]]
    },
    "Vul": {
        "name": "Vulpecula",
        "chains": [[95771, 97886, 98543]]
    }
}


def parse_float(val, default=0.0):
    """Parse a CSV field as float, returning default if empty/invalid."""
    if not val or val.strip() == "":
        return default
    try:
        return float(val)
    except ValueError:
        return default


def load_hyg_positions():
    """Load HIP ID → (x, y, z) mapping from HYG catalog."""
    if not os.path.exists(HYG_CACHED):
        print(f"Error: {HYG_CACHED} not found. Run process-hyg.py first.", file=sys.stderr)
        sys.exit(1)

    print("Loading HYG catalog positions...")
    hip_positions = {}  # HIP ID → (x, y, z) in parsecs
    hip_mag = {}  # HIP ID → apparent magnitude

    with gzip.open(HYG_CACHED, "rt", encoding="utf-8") as gz:
        reader = csv.DictReader(gz)
        for row in reader:
            hip_val = (row.get("hip", "") or "").strip()
            if not hip_val:
                continue
            try:
                hip_id = int(float(hip_val))
            except ValueError:
                continue

            x = parse_float(row.get("x", ""))
            y = parse_float(row.get("y", ""))
            z = parse_float(row.get("z", ""))
            dist = parse_float(row.get("dist", ""), default=100000.0)

            if dist >= 100000.0:
                ra_rad = parse_float(row.get("rarad", ""))
                dec_rad = parse_float(row.get("decrad", ""))
                far_dist = 1000.0
                x = far_dist * math.cos(dec_rad) * math.cos(ra_rad)
                y = far_dist * math.cos(dec_rad) * math.sin(ra_rad)
                z = far_dist * math.sin(dec_rad)

            hip_positions[hip_id] = (x, y, z)
            hip_mag[hip_id] = parse_float(row.get("mag", ""), default=20.0)

    print(f"Loaded {len(hip_positions)} stars with HIP IDs")
    return hip_positions, hip_mag


def generate_constellations():
    """Generate constellation JSON data."""
    hip_positions, hip_mag = load_hyg_positions()

    constellations = []
    total_lines = 0
    missing_stars = set()

    for abbr, data in sorted(CONSTELLATIONS.items()):
        lines = []  # Each line is [x1,y1,z1, x2,y2,z2]
        all_positions = []  # For computing center
        valid = True

        for chain in data["chains"]:
            for i in range(len(chain) - 1):
                hip_a = chain[i]
                hip_b = chain[i + 1]

                if hip_a not in hip_positions:
                    missing_stars.add(hip_a)
                    valid = False
                    continue
                if hip_b not in hip_positions:
                    missing_stars.add(hip_b)
                    valid = False
                    continue

                pa = hip_positions[hip_a]
                pb = hip_positions[hip_b]
                lines.append([
                    round(pa[0], 6), round(pa[1], 6), round(pa[2], 6),
                    round(pb[0], 6), round(pb[1], 6), round(pb[2], 6)
                ])
                all_positions.append(pa)
                all_positions.append(pb)

        if not lines:
            print(f"  Warning: {abbr} ({data['name']}) has no valid lines")
            continue

        # Compute center as average of all endpoint positions (for label placement)
        cx = sum(p[0] for p in all_positions) / len(all_positions)
        cy = sum(p[1] for p in all_positions) / len(all_positions)
        cz = sum(p[2] for p in all_positions) / len(all_positions)

        constellations.append({
            "id": abbr,
            "name": data["name"],
            "lines": lines,
            "center": [round(cx, 6), round(cy, 6), round(cz, 6)]
        })
        total_lines += len(lines)

    if missing_stars:
        print(f"  Warning: {len(missing_stars)} HIP IDs not found in catalog: {sorted(missing_stars)[:20]}...")

    # Write output
    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, "constellations.json")
    output = {
        "format_version": 1,
        "coordinate_system": "J2000 equatorial, parsecs",
        "description": "IAU constellation stick figures with pre-computed 3D positions",
        "constellation_count": len(constellations),
        "total_line_segments": total_lines,
        "constellations": constellations
    }

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, separators=(",", ":"))

    size_kb = os.path.getsize(out_path) / 1024
    print(f"\nOutput: {out_path} ({size_kb:.1f} KB)")
    print(f"Constellations: {len(constellations)}/88")
    print(f"Line segments: {total_lines}")


if __name__ == "__main__":
    generate_constellations()
