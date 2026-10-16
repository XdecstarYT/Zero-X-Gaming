"""
Heatwave's Melbourne, from real map data (Overture Maps: OpenStreetMap and others, ODbL).

    python3 probe.py theme=buildings/type=building      # find the row groups that cover the box
    python3 fetch.py theme=buildings/type=building <columns>   # download them (see README.md)
    ...the same for building_part, transportation/segment, base/water, base/land_use, base/infrastructure
    python3 build.py <dir with the parquet files> ../../public/heatwave/melbourne.bin

Everything is projected to local metres round the corner of Flinders and Swanston Sts (x east,
z south), cropped to the game's box, cleaned up for play (buildings kept off the carriageways,
tiny islands of road dropped, roads split into straight pieces) and packed into one gzipped
binary that src/games/heatwave/mapdata.ts reads.
"""
import collections, gzip, math, struct, sys

import numpy as np
import pyarrow.parquet as pq
import shapely
from shapely import STRtree
from shapely.geometry import LineString, MultiPolygon, Polygon, box
from shapely.ops import substring, unary_union

SRC = sys.argv[1]
OUT = sys.argv[2]

LAT0, LON0 = -37.8178, 144.9672
R = 6371008.8
KX = math.cos(math.radians(LAT0)) * R * math.pi / 180
KZ = R * math.pi / 180
W, E, N, S = 144.918, 145.008, -37.792, -37.874
X0, X1 = (W - LON0) * KX, (E - LON0) * KX
Z0, Z1 = -(N - LAT0) * KZ, -(S - LAT0) * KZ
AREA = box(X0, Z0, X1, Z1)
CELL = 4.0


def proj(g):
    return shapely.transform(g, lambda c: np.column_stack([(c[:, 0] - LON0) * KX, -(c[:, 1] - LAT0) * KZ]))


def read(name):
    return pq.read_table(f"{SRC}/{name}.parquet").to_pylist()


names: dict[str, int] = {"": 0}


def name_id(s):
    if not s:
        return 0
    s = s.strip()[:60]
    if s not in names:
        names[s] = len(names)
    return names[s]


def primary(r):
    n = r.get("names") or {}
    return n.get("primary") or ""


def whole(rules, pred):
    """A linear-referenced rule that covers (most of) the feature."""
    for f in rules or []:
        b = f.get("between")
        if pred(f) and (b is None or (b[1] - b[0]) > 0.5):
            return f
    return None


def any_part(rules, pred):
    return any(pred(f) for f in rules or [])


# ------------------------------------------------------------------------------------- roads
print("roads", flush=True)
CLS = {"trunk": 0, "primary": 1, "secondary": 1, "tertiary": 2, "residential": 2, "unclassified": 2, "living_street": 2, "unknown": 2, "service": 3}
HALF = {0: 10.5, 1: 7.0, 2: 4.5, 3: 2.4}
DROP_SUB = {"driveway", "parking_aisle", "sidewalk", "crosswalk", "cycle_crossing"}
F_BRIDGE, F_FWD, F_BACK, F_ALLEY = 1, 2, 4, 8

node_at: dict[str, int] = {}
nodes: list[tuple[float, float]] = []
edges: list[list] = []  # a, b, cls, flags, width (m), name
rails: list[tuple[int, LineString]] = []
elevated: list[tuple[float, LineString]] = []


def node(key, x, z):
    i = node_at.get(key)
    if i is None:
        i = len(nodes)
        node_at[key] = i
        nodes.append((x, z))
    return i


def oneway(r):
    for a in r.get("access_restrictions") or []:
        w = a.get("when") or {}
        if a.get("access_type") != "denied" or w.get("during") or w.get("using"):
            continue
        modes = w.get("mode")
        if modes and not any(m in ("motor_vehicle", "vehicle", "car") for m in modes):
            continue
        b = a.get("between")
        if b is not None and (b[1] - b[0]) < 0.5:
            continue
        if w.get("heading") == "backward":
            return F_FWD
        if w.get("heading") == "forward":
            return F_BACK
    return 0


for r in read("theme=transportation_type=segment"):
    g = proj(shapely.from_wkb(r["geometry"]))
    if g.geom_type != "LineString" or not g.intersects(AREA.buffer(60)):
        continue
    rf = r.get("road_flags") or []
    tunnel = any_part(rf, lambda f: "is_tunnel" in f["values"] or "is_indoor" in f["values"]) or any_part(r.get("rail_flags"), lambda f: "is_tunnel" in f["values"])
    under = any_part(r.get("level_rules"), lambda f: (f.get("value") or 0) < 0)
    if r["subtype"] == "rail":
        if tunnel or under:
            continue
        rails.append((0 if r["class"] == "tram" else 1, g.simplify(0.4)))
        continue
    if r["subtype"] != "road":
        continue
    c = r["class"]
    if c == "motorway":
        if not tunnel and not under:
            elevated.append((7.0, g.simplify(1.0)))
        continue
    if c not in CLS or r.get("subclass") in DROP_SUB or tunnel or under:
        continue
    cls = CLS[c]
    flags = oneway(r)
    if r.get("subclass") == "alley":
        flags |= F_ALLEY
    if any_part(rf, lambda f: "is_bridge" in f["values"]):
        flags |= F_BRIDGE
    wr = whole(r.get("width_rules"), lambda f: f.get("value"))
    width = float(wr["value"]) if wr else 0.0
    nm = name_id(primary(r))
    conns = sorted((cn["at"], cn["connector_id"]) for cn in (r.get("connectors") or []))
    if not conns or conns[0][0] > 1e-6:
        conns.insert(0, (0.0, r["id"] + ":s"))
    if conns[-1][0] < 1 - 1e-6:
        conns.append((1.0, r["id"] + ":e"))
    for (a0, k0), (a1, k1) in zip(conns, conns[1:]):
        if a1 - a0 < 1e-9:
            continue
        piece = substring(g, a0, a1, normalized=True)
        if piece.geom_type != "LineString" or piece.length < 0.3:
            continue
        piece = piece.simplify(0.8)
        pts = list(piece.coords)
        ia = node(k0, *pts[0])
        ib = node(k1, *pts[-1])
        prev = ia
        for j, (x, z) in enumerate(pts[1:-1]):
            nid = node(f"{r['id']}:{a0:.6f}:{j}", x, z)
            edges.append([prev, nid, cls, flags, width, nm])
            prev = nid
        if prev != ib:
            edges.append([prev, ib, cls, flags, width, nm])

# Inside the box (with a margin), and only the connected network: drop islands.
inside = [AREA.buffer(40).contains(shapely.Point(x, z)) for x, z in nodes]
edges = [e for e in edges if inside[e[0]] or inside[e[1]]]
adj = collections.defaultdict(list)
for i, e in enumerate(edges):
    adj[e[0]].append(i)
    adj[e[1]].append(i)
comp = {}
sizes = []
for start in list(adj):
    if start in comp:
        continue
    cid = len(sizes)
    stack = [start]
    comp[start] = cid
    n = 0
    while stack:
        v = stack.pop()
        for ei in adj[v]:
            n += 1
            e = edges[ei]
            for w in (e[0], e[1]):
                if w not in comp:
                    comp[w] = cid
                    stack.append(w)
    sizes.append(n // 2)
edges = [e for e in edges if sizes[comp[e[0]]] >= 30]
# Renumber the nodes that are left.
used = sorted({v for e in edges for v in (e[0], e[1])})
remap = {v: i for i, v in enumerate(used)}
nodes = [nodes[v] for v in used]
for e in edges:
    e[0] = remap[e[0]]
    e[1] = remap[e[1]]
deg = collections.Counter(v for e in edges for v in (e[0], e[1]))
print("nodes", len(nodes), "edges", len(edges), "components kept", sum(1 for s in sizes if s >= 30), flush=True)

# ------------------------------------------------------------------------------------- points
print("infrastructure", flush=True)
PT = {"bench": 0, "waste_basket": 1, "street_lamp": 2, "bus_stop": 3, "power_pole": 4, "stop_position": 5, "fountain": 6, "catenary_mast": 7, "traffic_signals": 8, "artwork": 9, "toilets": 10, "drinking_water": 11}
points = []
signals = []
piers = []
for r in read("theme=base_type=infrastructure"):
    g = proj(shapely.from_wkb(r["geometry"]))
    if not g.intersects(AREA):
        continue
    if r["class"] in ("pier", "breakwater", "quay") and g.geom_type in ("Polygon", "MultiPolygon"):
        piers.append(g)
        continue
    if r["class"] == "pier" and g.geom_type == "LineString":
        piers.append(g.buffer(2.0, cap_style="flat"))
        continue
    t = PT.get(r["class"])
    if t is None:
        continue
    p = g.centroid if g.geom_type != "Point" else g
    if t == 8:
        signals.append(p)
    points.append((t, p.x, p.y, name_id(primary(r)) if t in (3, 5) else 0))
sig_tree = STRtree(signals)
lights = np.zeros(len(nodes), dtype=np.uint8)
for i, (x, z) in enumerate(nodes):
    if deg[i] >= 3 and len(sig_tree.query(shapely.Point(x, z).buffer(22))):
        lights[i] = 1
print("lit junctions", int(lights.sum()), flush=True)

# ------------------------------------------------------------------------------------- buildings
print("buildings", flush=True)
carriage = []
for a, b, cls, flags, width, nm in edges:
    half = (width / 2 if width else HALF[cls]) + (0.6 if cls == 3 else 1.6)
    half = min(half, HALF[cls] + (0.6 if cls == 3 else 1.6))
    carriage.append(LineString([nodes[a], nodes[b]]).buffer(half, cap_style="round", quad_segs=2))
road_tree = STRtree(carriage)

CAT = {"house": 0, "detached": 0, "bungalow": 0, "terrace": 1, "semidetached_house": 1, "apartments": 2, "residential": 2, "commercial": 3, "retail": 3, "supermarket": 3, "kiosk": 3, "office": 4, "industrial": 5, "warehouse": 5, "factory": 5, "garage": 7, "garages": 7, "shed": 7, "carport": 7, "roof": 7, "hut": 7, "church": 6, "cathedral": 6, "chapel": 6, "school": 6, "university": 6, "college": 6, "hospital": 6, "civic": 6, "public": 6, "government": 6, "train_station": 8, "transportation": 8, "stadium": 9, "grandstand": 9, "hotel": 10}
SUB = {"residential": 2, "commercial": 3, "industrial": 5, "education": 6, "civic": 6, "religious": 6, "medical": 6, "transportation": 8, "outbuilding": 7, "entertainment": 9, "service": 5, "agricultural": 7, "military": 6}
DEFAULT_H = {0: 6.0, 1: 7.2, 2: 13.0, 3: 8.5, 4: 18.0, 5: 8.0, 6: 11.0, 7: 3.2, 8: 10.0, 9: 20.0, 10: 24.0, 11: 7.0}
ROOF = {"flat": 1, "gabled": 2, "hipped": 3, "pyramidal": 4, "dome": 5, "round": 5, "onion": 5, "skillion": 6, "gambrel": 2, "saltbox": 2, "mansard": 3, "half_hipped": 3}
MAT = {"brick": 1, "glass": 2, "concrete": 3, "wood": 4, "metal": 5, "stone": 6, "plaster": 7, "cement_block": 3, "timber_framing": 4, "sandstone": 6}
CBD = box((144.9505 - LON0) * KX, -(-37.8075 - LAT0) * KZ, (144.9745 - LON0) * KX, -(-37.8225 - LAT0) * KZ)


def rgb565(h):
    if not h or not h.startswith("#") or len(h) not in (4, 7):
        return 0
    if len(h) == 4:
        h = "#" + "".join(ch * 2 for ch in h[1:])
    try:
        r, g, b = int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16)
    except ValueError:
        return 0
    return max(1, ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3))


buildings = []  # (h, minh, cat, roof, mat, color, name, rings)


def emit(poly, h, minh, cat, roof, mat, color, nm, solid=True):
    if poly.is_empty:
        return
    polys = list(poly.geoms) if isinstance(poly, MultiPolygon) else [poly] if isinstance(poly, Polygon) else [p for p in getattr(poly, "geoms", []) if isinstance(p, Polygon)]
    for p in polys:
        if p.area < 12:
            continue
        p = p.simplify(0.3, preserve_topology=True)
        if p.is_empty or p.geom_type != "Polygon" or p.area < 12:
            continue
        ext = list(p.exterior.coords)[:-1]
        if len(ext) > 250:
            p = p.simplify(1.0, preserve_topology=True)
            ext = list(p.exterior.coords)[:-1]
        if len(ext) < 3 or len(ext) > 250:
            continue
        rings = [ext]
        for hole in p.interiors:
            hp = Polygon(hole)
            if hp.area > 40 and len(hole.coords) - 1 <= 250:
                rings.append(list(hole.coords)[:-1])
        buildings.append((h, minh, cat, roof, mat, color, nm, rings, solid))


parts_by = collections.defaultdict(list)
for p in read("theme=buildings_type=building_part"):
    if p.get("building_id"):
        parts_by[p["building_id"]].append(p)

skipped = 0
for r in read("theme=buildings_type=building"):
    if r.get("is_underground"):
        continue
    g = proj(shapely.from_wkb(r["geometry"]))
    if not g.intersects(AREA) or not g.is_valid and not (g := g.buffer(0)).is_valid:
        continue
    cat = CAT.get(r.get("class") or "", SUB.get(r.get("subtype") or "", 11))
    area = g.area
    h = r.get("height")
    if not h and r.get("num_floors"):
        h = r["num_floors"] * 3.2 + (0.8 if r["num_floors"] > 2 else 0)
    if not h:
        h = DEFAULT_H[cat]
        if cat == 11:
            h = 3.5 if area < 50 else 7.0 if area < 500 else 10.0 if area < 3000 else 14.0
        if CBD.contains(g.centroid):
            h = max(h, 14.0 if area > 150 else 9.0)
    h = float(min(h, 320))
    roof = ROOF.get(r.get("roof_shape") or "", 0)
    mat = MAT.get(r.get("facade_material") or "", 0)
    color = rgb565(r.get("facade_color"))
    nm = name_id(primary(r))
    # Keep the carriageways clear (the data's footprints and our road widths don't quite agree).
    near = road_tree.query(g)
    if len(near):
        cut = unary_union([carriage[i] for i in near])
        g2 = g.difference(cut)
        if g2.area < g.area * 0.35:
            skipped += 1
            continue
        g = g2
    if r.get("has_parts") and parts_by.get(r["id"]):
        # Tall buildings drawn from their parts (setbacks, podiums, crowns).
        emit(g, min(h, max(3.0, min((pp.get("min_height") or 0) for pp in parts_by[r["id"]]) or 3.0)), 0, cat, 1, mat, color, nm)
        for pp in parts_by[r["id"]]:
            pg = proj(shapely.from_wkb(pp["geometry"]))
            ph = pp.get("height") or ((pp.get("num_floors") or 0) * 3.2) or h
            pm = pp.get("min_height") or ((pp.get("min_floor") or 0) * 3.2)
            if ph <= pm + 0.5:
                continue
            if len(near):
                pg = pg.difference(cut)
            emit(pg, float(min(ph, 320)), float(pm), cat, ROOF.get(pp.get("roof_shape") or "", 1), MAT.get(pp.get("facade_material") or "", mat), rgb565(pp.get("facade_color")) or color, nm, solid=pm < 2.5)
        continue
    emit(g, h, float(r.get("min_height") or 0), cat, roof, mat, color, nm)
print("buildings", len(buildings), "dropped on roads", skipped, flush=True)

# ------------------------------------------------------------------------------------- the ground
print("ground raster", flush=True)
NX = int(math.ceil((X1 - X0) / CELL))
NZ = int(math.ceil((Z1 - Z0) / CELL))
gx = X0 + CELL / 2 + np.arange(NX) * CELL
gz = Z0 + CELL / 2 + np.arange(NZ) * CELL
XX, ZZ = np.meshgrid(gx, gz)
ras = np.zeros((NZ, NX), dtype=np.uint8)
clipbox = AREA.buffer(200)


def mask(geoms):
    geoms = [g.intersection(clipbox) for g in geoms]
    geoms = [g for g in geoms if not g.is_empty]
    if not geoms:
        return np.zeros((NZ, NX), dtype=bool)
    u = unary_union(geoms)
    shapely.prepare(u)
    return shapely.contains_xy(u, XX, ZZ)


water_rows = read("theme=base_type=water")
WATER_CLS = {"bay", "ocean", "river", "lake", "pond", "basin", "canal", "water", "reservoir", "dock", "strait", "harbour"}
water = []
bay = []
for r in water_rows:
    if r["class"] not in WATER_CLS:
        continue
    g = proj(shapely.from_wkb(r["geometry"]))
    if g.geom_type not in ("Polygon", "MultiPolygon") or not g.intersects(clipbox):
        continue
    water.append(g)
    if r["class"] in ("bay", "ocean", "strait"):
        bay.append(g)
wmask = mask(water)
bmask = mask(bay)
lu = read("theme=base_type=land_use")
GRASS = {"grass", "garden", "park", "playground", "recreation_ground", "meadow", "green", "tee", "fairway", "rough", "golf_course", "nature_reserve", "dog_park", "flowerbed", "allotments", "cemetery", "village_green", "zoo", "driving_range"}
SPORT = {"pitch", "track", "stadium"}
PAVED = {"pedestrian", "plaza"}
groups = collections.defaultdict(list)
for r in lu:
    c = r["class"]
    k = 1 if c in GRASS else 3 if c in SPORT else 4 if c in PAVED else 5 if c == "railway" else 0
    if not k:
        continue
    g = proj(shapely.from_wkb(r["geometry"]))
    if g.geom_type in ("Polygon", "MultiPolygon") and g.intersects(clipbox):
        groups[k].append(g)
for k in (1, 3, 4, 5):
    ras[mask(groups[k])] = k
# Sand: a strip of land along the bay, from Port Melbourne round to St Kilda.
land = ~wmask
near_bay = bmask.copy()
for _ in range(11):
    near_bay = near_bay | np.roll(near_bay, 1, 0) | np.roll(near_bay, -1, 0) | np.roll(near_bay, 1, 1) | np.roll(near_bay, -1, 1)
shore_band = (ZZ > -(-37.835 - LAT0) * KZ) & (XX < (144.990 - LON0) * KX)
ras[land & near_bay & shore_band & (ras != 4)] = 2
# Water, with depth by distance from the land.
depth = np.zeros((NZ, NX), dtype=np.uint8)
grow = land.copy()
for step in range(1, 16):
    grow = grow | np.roll(grow, 1, 0) | np.roll(grow, -1, 0) | np.roll(grow, 1, 1) | np.roll(grow, -1, 1)
    depth[(depth == 0) & grow & wmask] = step
depth[(depth == 0) & wmask] = 15
ras[wmask] = 16 + depth[wmask]
# Piers and jetties stand on the water.
if piers:
    ras[mask(piers)] = 6
print("raster", NX, NZ, collections.Counter(ras.flatten().tolist()).most_common(8), flush=True)

# ------------------------------------------------------------------------------------- pack
print("pack", flush=True)
out = bytearray()


def pad4():
    while len(out) % 4:
        out.append(0)


def put(fmt, *v):
    out.extend(struct.pack("<" + fmt, *v))


def arr(a):
    pad4()
    out.extend(a.tobytes())


def q(v):
    return int(max(-32767, min(32767, round(v * 4))))


put("4sI", b"HWM2", 2)
put("6f", LAT0, LON0, X0, Z0, X1, Z1)
# Names.
nl = sorted(names.items(), key=lambda kv: kv[1])
put("I", len(nl))
for s, _ in nl:
    b = s.encode("utf-8")
    put("H", len(b))
    out.extend(b)
# Nodes.
put("I", len(nodes))
arr(np.array([[q(x), q(z)] for x, z in nodes], dtype=np.int16))
arr(lights)
# Edges.
put("I", len(edges))
arr(np.array([[e[0], e[1]] for e in edges], dtype=np.uint32))
arr(np.array([e[2] for e in edges], dtype=np.uint8))
arr(np.array([e[3] for e in edges], dtype=np.uint8))
arr(np.array([min(255, int(round(e[4] * 4))) for e in edges], dtype=np.uint8))
arr(np.array([e[5] for e in edges], dtype=np.uint16))
# Buildings: fixed fields, then ring counts, ring lengths and coordinates.
put("I", len(buildings))
arr(np.array([min(65535, int(round(b[0] * 10))) for b in buildings], dtype=np.uint16))
arr(np.array([min(65535, int(round(b[1] * 10))) for b in buildings], dtype=np.uint16))
arr(np.array([b[2] | (0 if b[8] else 128) for b in buildings], dtype=np.uint8))
arr(np.array([b[3] | (b[4] << 4) for b in buildings], dtype=np.uint8))
arr(np.array([b[5] for b in buildings], dtype=np.uint16))
arr(np.array([b[6] for b in buildings], dtype=np.uint16))
arr(np.array([len(b[7]) for b in buildings], dtype=np.uint8))
ring_len = [len(r) for b in buildings for r in b[7]]
put("I", len(ring_len))
arr(np.array(ring_len, dtype=np.uint16))
coords = np.array([[q(x), q(z)] for b in buildings for r in b[7] for x, z in r], dtype=np.int16)
put("I", len(coords))
arr(coords)


def lines(items):
    put("I", len(items))
    arr(np.array([t for t, _ in items], dtype=np.float32))
    lens = []
    pts = []
    for _, g in items:
        gs = list(g.geoms) if hasattr(g, "geoms") else [g]
        c = [p for gg in gs for p in gg.coords]
        lens.append(len(c))
        pts.extend(c)
    arr(np.array(lens, dtype=np.uint16))
    put("I", len(pts))
    arr(np.array([[q(x), q(z)] for x, z in pts], dtype=np.int16))


lines([(float(t), g) for t, g in rails if g.intersects(AREA)])
lines([(w, g) for w, g in elevated if g.intersects(AREA)])
# Piers (polygons, outer rings).
pp = []
for g in piers:
    for p in (g.geoms if hasattr(g, "geoms") else [g]):
        if isinstance(p, Polygon) and p.area > 8:
            pp.append((0.0, LineString(list(p.simplify(0.3).exterior.coords)[:-1])))
lines(pp)
# Points.
pts = [p for p in points if X0 <= p[1] <= X1 and Z0 <= p[2] <= Z1]
put("I", len(pts))
arr(np.array([p[0] for p in pts], dtype=np.uint8))
arr(np.array([[q(p[1]), q(p[2])] for p in pts], dtype=np.int16))
arr(np.array([p[3] for p in pts], dtype=np.uint16))
# The ground.
put("IIf", NX, NZ, CELL)
arr(ras)
raw = bytes(out)
with open(OUT, "wb") as f:
    f.write(gzip.compress(raw, 9))
print("wrote", OUT, len(raw), "bytes raw", flush=True)
