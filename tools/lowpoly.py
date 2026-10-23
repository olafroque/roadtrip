"""Low-poly game-piece builder.

Writes flat-shaded, faceted .glb models (one vertex color per triangle, tiny per-facet
tint changes) for the trip map. Authoring space is Z-up meters: x = east, y = north,
z = up, with the piece's front facing south (-y). Run:  python3 tools/lowpoly.py
"""
import math, struct, json, os, hashlib

def hexrgb(h):
    """sRGB hex -> linear RGB (glTF vertex colors are linear)."""
    h = h.lstrip("#"); s = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in s]

class Mesh:
    def __init__(self):
        self.tris = []   # (p0, p1, p2, rgb)

    # ---- low-level
    def tri(self, a, b, c, color, jitter=0.06):
        rgb = hexrgb(color) if isinstance(color, str) else color
        # deterministic per-facet tint: the classic low-poly look
        k = int(hashlib.md5(repr((a, b, c)).encode()).hexdigest()[:6], 16) / 0xFFFFFF
        f = 1 + (k - 0.5) * 2 * jitter
        self.tris.append((a, b, c, [min(1, max(0, v * f)) for v in rgb]))

    def quad(self, a, b, c, d, color, jitter=0.06):
        self.tri(a, b, c, color, jitter); self.tri(a, c, d, color, jitter)

    # ---- shapes
    def prism(self, pts, z0, z1, side, top=None, bottom=None, jitter=0.06):
        """Extrude a convex polygon (counter-clockwise xy points)."""
        top = top or side; bottom = bottom or side
        n = len(pts)
        for i in range(n):
            (x0, y0), (x1, y1) = pts[i], pts[(i + 1) % n]
            self.quad((x0, y0, z0), (x1, y1, z0), (x1, y1, z1), (x0, y0, z1), side, jitter)
        c = (sum(p[0] for p in pts) / n, sum(p[1] for p in pts) / n)
        for i in range(n):
            (x0, y0), (x1, y1) = pts[i], pts[(i + 1) % n]
            self.tri((c[0], c[1], z1), (x0, y0, z1), (x1, y1, z1), top, jitter)
            self.tri((c[0], c[1], z0), (x1, y1, z0), (x0, y0, z0), bottom, jitter)

    def box(self, x0, y0, x1, y1, z0, z1, side, top=None, jitter=0.06):
        self.prism([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], z0, z1, side, top, jitter=jitter)

    def ngon(self, cx, cy, r, n, rot=0.0):
        return [(cx + r * math.cos(rot + 2 * math.pi * i / n), cy + r * math.sin(rot + 2 * math.pi * i / n)) for i in range(n)]

    def frustum(self, cx, cy, r0, r1, z0, z1, n, side, top=None, rot=0.0, jitter=0.06):
        top = top or side
        a, b = self.ngon(cx, cy, r0, n, rot), self.ngon(cx, cy, r1, n, rot)
        for i in range(n):
            j = (i + 1) % n
            self.quad((*a[i], z0), (*a[j], z0), (*b[j], z1), (*b[i], z1), side, jitter)
            self.tri((cx, cy, z1), (*b[i], z1), (*b[j], z1), top, jitter)
            self.tri((cx, cy, z0), (*a[j], z0), (*a[i], z0), side, jitter)

    def cone(self, cx, cy, r, z0, z1, n, color, rot=0.0, jitter=0.08):
        a = self.ngon(cx, cy, r, n, rot)
        for i in range(n):
            j = (i + 1) % n
            self.tri((*a[i], z0), (*a[j], z0), (cx, cy, z1), color, jitter)
            self.tri((cx, cy, z0), (*a[j], z0), (*a[i], z0), color, jitter)

    def gable(self, x0, x1, y0, y1, z0, ridge, wall, roof, along="y", overhang=0.0):
        """Walls from z0 up to the eave, then a pitched roof. along = ridge direction."""
        eave = z0  # walls are drawn separately; this draws the roof prism and its gable ends
        if along == "y":
            xm = (x0 + x1) / 2
            ox0, ox1, oy0, oy1 = x0 - overhang, x1 + overhang, y0 - overhang, y1 + overhang
            # gable end triangles (wall color), slightly inset from the overhang
            self.tri((x0, y0, eave), (x1, y0, eave), (xm, y0, ridge), wall)
            self.tri((x1, y1, eave), (x0, y1, eave), (xm, y1, ridge), wall)
            self.quad((ox0, oy0, eave), (xm, oy0, ridge), (xm, oy1, ridge), (ox0, oy1, eave), roof)
            self.quad((ox1, oy1, eave), (xm, oy1, ridge), (xm, oy0, ridge), (ox1, oy0, eave), roof)
            # underside
            self.quad((ox0, oy0, eave), (ox0, oy1, eave), (ox1, oy1, eave), (ox1, oy0, eave), roof)
        else:
            ym = (y0 + y1) / 2
            ox0, ox1, oy0, oy1 = x0 - overhang, x1 + overhang, y0 - overhang, y1 + overhang
            self.tri((x1, y0, eave), (x1, y1, eave), (x1, ym, ridge), wall)
            self.tri((x0, y1, eave), (x0, y0, eave), (x0, ym, ridge), wall)
            self.quad((ox0, oy0, eave), (ox1, oy0, eave), (ox1, ym, ridge), (ox0, ym, ridge), roof)
            self.quad((ox1, oy1, eave), (ox0, oy1, eave), (ox0, ym, ridge), (ox1, ym, ridge), roof)
            self.quad((ox0, oy0, eave), (ox0, oy1, eave), (ox1, oy1, eave), (ox1, oy0, eave), roof)

    def rock(self, cx, cy, r, z0, color, seed=1):
        """Jittered octahedron: a chunky low-poly rock."""
        rnd = lambda i: (int(hashlib.md5(f"{seed}:{i}".encode()).hexdigest()[:4], 16) / 0xFFFF - 0.5)
        ring = [(cx + r * (1 + 0.3 * rnd(i)) * math.cos(i * math.pi / 3), cy + r * (1 + 0.3 * rnd(i + 9)) * math.sin(i * math.pi / 3), z0 + r * 0.45 * (1 + rnd(i + 20))) for i in range(6)]
        top, bot = (cx + r * 0.15 * rnd(40), cy + r * 0.15 * rnd(41), z0 + r * 1.15), (cx, cy, z0)
        for i in range(6):
            a, b = ring[i], ring[(i + 1) % 6]
            self.tri(a, b, top, color, 0.12); self.tri(b, a, bot, color, 0.12)

    def rotated(self, fn, pivot, angle_deg, axis="x"):
        """Run shape-building fn into a temp mesh, rotate it about pivot, then merge."""
        tmp = Mesh(); fn(tmp)
        a = math.radians(angle_deg); c, s = math.cos(a), math.sin(a)
        px, py, pz = pivot
        def rot(p):
            x, y, z = p[0] - px, p[1] - py, p[2] - pz
            if axis == "x": y, z = y * c - z * s, y * s + z * c
            elif axis == "y": x, z = x * c + z * s, -x * s + z * c
            else: x, y = x * c - y * s, x * s + y * c
            return (x + px, y + py, z + pz)
        for a_, b_, c_, col in tmp.tris: self.tris.append((rot(a_), rot(b_), rot(c_), col))

    # ---- export
    def glb(self, path):
        pos, nor, col = [], [], []
        mn, mx = [1e9] * 3, [-1e9] * 3
        for a, b, c, rgb in self.tris:
            # Z-up authoring -> glTF Y-up: (x, y, z) -> (x, z, -y)
            A, B, C = [(p[0], p[2], -p[1]) for p in (a, b, c)]
            u = [B[i] - A[i] for i in range(3)]; v = [C[i] - A[i] for i in range(3)]
            n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
            L = math.sqrt(sum(x * x for x in n)) or 1; n = [x / L for x in n]
            for P in (A, B, C):
                pos += P; nor += n; col += [*rgb, 1.0]
                for i in range(3): mn[i] = min(mn[i], P[i]); mx[i] = max(mx[i], P[i])
        count = len(pos) // 3
        bpos = struct.pack(f"<{len(pos)}f", *pos); bnor = struct.pack(f"<{len(nor)}f", *nor); bcol = struct.pack(f"<{len(col)}f", *col)
        binary = bpos + bnor + bcol
        gltf = {
            "asset": {"version": "2.0", "generator": "roadtrip lowpoly.py"},
            "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0}],
            "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1, "COLOR_0": 2}, "material": 0}]}],
            "materials": [{"pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1], "metallicFactor": 0, "roughnessFactor": 0.9}, "doubleSided": True}],
            "buffers": [{"byteLength": len(binary)}],
            "bufferViews": [
                {"buffer": 0, "byteOffset": 0, "byteLength": len(bpos), "target": 34962},
                {"buffer": 0, "byteOffset": len(bpos), "byteLength": len(bnor), "target": 34962},
                {"buffer": 0, "byteOffset": len(bpos) + len(bnor), "byteLength": len(bcol), "target": 34962}],
            "accessors": [
                {"bufferView": 0, "componentType": 5126, "count": count, "type": "VEC3", "min": mn, "max": mx},
                {"bufferView": 1, "componentType": 5126, "count": count, "type": "VEC3"},
                {"bufferView": 2, "componentType": 5126, "count": count, "type": "VEC4"}],
        }
        js = json.dumps(gltf, separators=(",", ":")).encode()
        js += b" " * ((4 - len(js) % 4) % 4)
        binary += b"\0" * ((4 - len(binary) % 4) % 4)
        out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binary))
        out += struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(binary), 0x004E4942) + binary
        os.makedirs(os.path.dirname(path), exist_ok=True)
        open(path, "wb").write(out)
        return len(self.tris)

# ---------------------------------------------------------------- pieces

def stand(m, r, top="#efe6d2", rim="#cdbb94", n=8):
    """Board-game stand: a beveled octagon tile the piece stands on."""
    m.frustum(0, 0, r + 1.2, r + 0.6, 0, 1.4, n, rim, rim, rot=math.pi / n)
    m.frustum(0, 0, r + 0.6, r, 1.4, 1.9, n, top, top, rot=math.pi / n)
    return 1.9

def aquarium():
    m = Mesh(); g = stand(m, 22, top="#ead9b3")
    # the bay: a water inlay on the back-right of the tile with kelp, rocks and a whale tail
    m.prism([(4, 6), (19, 6), (21, 12), (16, 19), (5, 17)], g, g + 0.25, "#3f97cf", "#4aa3d8", jitter=0.08)
    for i, (x, y, h) in enumerate([(7, 14, 7), (8.5, 15.5, 5.5), (6, 11.5, 4.5)]):
        m.cone(x, y, 0.9, g, g + h, 5, "#3f8f3a", rot=i)
    m.rock(17.5, 8, 2.2, g, "#8e9294", 3); m.rock(19, 11, 1.6, g, "#7f8486", 7)
    def tail(t):
        t.frustum(13, 13, 1.1, 0.7, g, g + 3.0, 6, "#2d3e50")
        t.prism([(13, 12.3), (17.5, 12.6), (16.8, 13.4), (13, 13.7)], g + 2.8, g + 3.5, "#2d3e50")
        t.prism([(13, 13.7), (8.5, 13.4), (9.2, 12.6), (13, 12.3)], g + 2.8, g + 3.5, "#2d3e50")
    m.rotated(tail, (13, 13, g + 3), 8, "y")
    # main cannery hall, gable end facing the street (front = south, -y)
    wall, roof = "#e4ddcf", "#7f8f99"
    m.box(-10, -6, 9, 7, g, g + 11, wall, roof)
    m.gable(-10, 9, -6, 7, g + 11, g + 17, wall, roof, along="y", overhang=0.6)
    # multi-pane industrial windows: white frame, dark glass, a mullion bar
    for x in (-8, -4.5, 1, 4.5):
        for z in (g + 1.6, g + 6.2):
            if x in (-4.5, 1) and z < g + 3: continue
            m.box(x - 0.2, -6.25, x + 2.7, -6, z - 0.2, z + 3.4, "#f5f2ea")
            m.box(x, -6.4, x + 2.5, -6.2, z, z + 3.2, "#2f4b5f", jitter=0.1)
            m.box(x + 1.15, -6.5, x + 1.35, -6.35, z, z + 3.2, "#f5f2ea")
    # gable-end round vent
    m.frustum(-0.5, -6.2, 1.3, 1.3, g + 12.2, g + 12.25, 8, "#2f4b5f")
    # blue sign band
    m.box(-7.5, -6.6, 6.5, -6, g + 9.6, g + 11, "#1f6fa5", jitter=0.03)
    m.box(-5.5, -6.75, 4.5, -6.55, g + 10.05, g + 10.55, "#ffffff", jitter=0.0)
    # glass entry pavilion with a dark canopy and doors
    m.box(-4.5, -10.5, 3.5, -6, g, g + 6, "#9fd8f0", "#7fb8d0", jitter=0.08)
    m.box(-5.8, -11.6, 4.8, -5.8, g + 6, g + 6.9, "#2f3a40")
    m.box(-2, -10.65, 1, -10.5, g, g + 4.2, "#2f3a40")
    m.box(-0.55, -10.75, -0.45, -10.6, g, g + 4.2, "#9fd8f0")
    # side wing with the three original cannery smokestacks
    m.box(-17, -3, -10, 7, g, g + 8, "#d6cfbf", "#8d9aa1")
    for (x, y, h) in [(-15, -1, 26), (-12.2, 2.2, 30), (-15, 5, 23)]:
        m.frustum(x, y, 1.45, 1.15, g + 8, g + h, 8, "#8a6f60", "#3a2f2a")
        m.frustum(x, y, 1.55, 1.55, g + h - 3, g + h - 2, 8, "#2f3a40")
    # sidewalk + planters out front
    m.box(-16, -14, 15, -11.6, g, g + 0.3, "#d8d2c4")
    for x in (-12, 8):
        m.box(x - 1.5, -13.5, x + 1.5, -12, g + 0.3, g + 1.4, "#9c7b5c")
        m.cone(x, -12.75, 1.6, g + 1.4, g + 3.6, 6, "#5aa04a")
    return m

if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    n = aquarium().glb(os.path.join(here, "..", "models", "aquarium.glb"))
    print("aquarium.glb", n, "triangles")
