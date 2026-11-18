"""Builds the light 3D model of the Unitree Go2-W that the Research page animates.

Input: the go2w_description package from Unitree's own repository,
https://github.com/unitreerobotics/unitree_ros (robots/go2w_description), which is
published under the BSD 3-Clause License, Copyright (c) 2016-2022 HangZhou YuShu
TECHNOLOGY CO.,LTD. ("Unitree Robotics"). Download urdf/go2w_description.urdf and the
dae/ folder, keeping the folder layout, then run:

    python3 tools/make_go2w_model.py path/to/go2w_description

Output:
    assets/models/go2w.bin            the simplified meshes (16-bit positions, 16-bit indices)
    assets/js/figs/go2w-model.js      the joint tree read from the URDF and the table of meshes

What it does: reads the URDF (links, joints, mesh references), reads each mesh (COLLADA or
STL), welds its vertices, and simplifies it with quadric error metrics (Garland and
Heckbert, 1997) to a few thousand triangles, so the whole robot is under 300 kB.
Only the standard library is used. The mesh files are read as data: nothing in them is run.
"""
import heapq
import json
import math
import os
import struct
import sys
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_BIN = os.path.join(HERE, "..", "assets", "models", "go2w.bin")
OUT_JS = os.path.join(HERE, "..", "assets", "js", "figs", "go2w-model.js")

# Triangles to keep for each mesh file (the originals have 4,000 to 78,000).
TARGET = {"base.dae": 12000, "hip.dae": 2500, "thigh.dae": 3000, "thigh_mirror.dae": 3000, "calf.stl": 3000, "calf_mirror.stl": 3000, "left_wheel.dae": 2500, "right_wheel.dae": 2500}


# ---- reading meshes ------------------------------------------------------------

def _ns(root):
    return root.tag[: root.tag.index("}") + 1] if root.tag.startswith("{") else ""


IDENT = [[1.0 if i == j else 0.0 for j in range(4)] for i in range(4)]


def _mat_mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def read_dae(path):
    """Vertices (meters, Z up) and index triples from a COLLADA file, with the transforms of its scene nodes applied."""
    root = ET.parse(path).getroot()
    ns = _ns(root)
    unit = root.find(f"{ns}asset/{ns}unit")
    scale = float(unit.get("meter")) if unit is not None and unit.get("meter") else 1.0
    up = root.findtext(f"{ns}asset/{ns}up_axis") or "Y_UP"
    geoms = {}
    for g in root.iter(f"{ns}geometry"):
        mesh = g.find(f"{ns}mesh")
        if mesh is None:
            continue
        sources = {}
        for s in mesh.findall(f"{ns}source"):
            fa = s.find(f"{ns}float_array")
            if fa is None or not fa.text:
                continue
            acc = s.find(f"{ns}technique_common/{ns}accessor")
            stride = int(acc.get("stride", "3")) if acc is not None else 3
            vals = [float(x) for x in fa.text.split()]
            sources["#" + s.get("id")] = [tuple(vals[i : i + 3]) for i in range(0, len(vals) - stride + 1, stride)]
        vmap = {}
        for v in mesh.findall(f"{ns}vertices"):
            for inp in v.findall(f"{ns}input"):
                if inp.get("semantic") == "POSITION":
                    vmap["#" + v.get("id")] = inp.get("source")
        parts = []
        for prim in mesh.findall(f"{ns}triangles"):
            inputs = prim.findall(f"{ns}input")
            stride = max(int(i.get("offset", "0")) for i in inputs) + 1
            for i in inputs:
                if i.get("semantic") == "VERTEX":
                    pos = sources[vmap.get(i.get("source"), i.get("source"))]
                    off = int(i.get("offset", "0"))
                    flat = [int(x) for p in prim.findall(f"{ns}p") if p.text for x in p.text.split()][off::stride]
                    parts.append((pos, [(flat[k], flat[k + 1], flat[k + 2]) for k in range(0, len(flat) - 2, 3)]))
        geoms["#" + g.get("id")] = parts

    verts, tris = [], []

    def emit(parts, m):
        for pos, t in parts:
            base = len(verts)
            for p in pos:
                x, y, z = p[0] * scale, p[1] * scale, p[2] * scale
                verts.append(tuple(m[i][0] * x + m[i][1] * y + m[i][2] * z + m[i][3] for i in range(3)))
            tris.extend((a + base, b + base, c + base) for a, b, c in t)

    def walk(node, m):
        for child in node:
            if child.tag == f"{ns}matrix":
                v = [float(x) for x in child.text.split()]
                mm = [v[0:4], v[4:8], v[8:12], v[12:16]]
                for i in range(3):
                    mm[i][3] *= scale
                m = _mat_mul(m, mm)
            elif child.tag in (f"{ns}translate", f"{ns}rotate", f"{ns}scale"):
                sys.exit("this COLLADA file places its nodes with " + child.tag[len(ns):] + ", which this reader does not handle: " + path)
        for child in node:
            if child.tag == f"{ns}instance_geometry" and child.get("url") in geoms:
                emit(geoms[child.get("url")], m)
            elif child.tag == f"{ns}node":
                walk(child, m)

    scene = root.find(f"{ns}library_visual_scenes/{ns}visual_scene")
    if scene is None:
        for parts in geoms.values():
            emit(parts, IDENT)
    else:
        for node in scene.findall(f"{ns}node"):
            walk(node, IDENT)
    if up == "Y_UP":
        verts = [(x, -z, y) for x, y, z in verts]
    return verts, tris


def read_stl(path):
    data = open(path, "rb").read()
    n = struct.unpack_from("<I", data, 80)[0]
    assert 84 + 50 * n == len(data), "expected a binary STL: " + path
    verts, tris = [], []
    for k in range(n):
        v = struct.unpack_from("<12f", data, 84 + 50 * k)
        verts.extend([v[3:6], v[6:9], v[9:12]])
        tris.append((3 * k, 3 * k + 1, 3 * k + 2))
    return verts, tris


# ---- simplifying ---------------------------------------------------------------

def weld(verts, tris, tol):
    """Merge vertices that fall in the same cell of size tol (their mean), and drop collapsed triangles."""
    cell, sums, counts = {}, [], []
    remap = []
    for x, y, z in verts:
        key = (round(x / tol), round(y / tol), round(z / tol))
        k = cell.get(key)
        if k is None:
            k = cell[key] = len(sums)
            sums.append([0.0, 0.0, 0.0])
            counts.append(0)
        s = sums[k]
        s[0] += x
        s[1] += y
        s[2] += z
        counts[k] += 1
        remap.append(k)
    out = [[s[0] / c, s[1] / c, s[2] / c] for s, c in zip(sums, counts)]
    seen, kept = set(), []
    for a, b, c in tris:
        a, b, c = remap[a], remap[b], remap[c]
        if a == b or b == c or a == c:
            continue
        key = tuple(sorted((a, b, c)))
        if key in seen:
            continue
        seen.add(key)
        kept.append([a, b, c])
    return out, kept


def _plane_quadric(p, q, r):
    ux, uy, uz = q[0] - p[0], q[1] - p[1], q[2] - p[2]
    vx, vy, vz = r[0] - p[0], r[1] - p[1], r[2] - p[2]
    nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
    length = math.sqrt(nx * nx + ny * ny + nz * nz)
    if length < 1e-18:
        return None, None
    nx, ny, nz = nx / length, ny / length, nz / length
    d = -(nx * p[0] + ny * p[1] + nz * p[2])
    w = 0.5 * length  # weight by area
    return (nx, ny, nz), [w * nx * nx, w * nx * ny, w * nx * nz, w * nx * d, w * ny * ny, w * ny * nz, w * ny * d, w * nz * nz, w * nz * d, w * d * d]


def _err(q, x, y, z):
    return q[0] * x * x + 2 * q[1] * x * y + 2 * q[2] * x * z + 2 * q[3] * x + q[4] * y * y + 2 * q[5] * y * z + 2 * q[6] * y + q[7] * z * z + 2 * q[8] * z + q[9]


def simplify(verts, tris, target):
    """Edge collapses in order of quadric error until `target` triangles are left."""
    nv = len(verts)
    quad = [[0.0] * 10 for _ in range(nv)]
    vt = [set() for _ in range(nv)]
    alive_t = [True] * len(tris)
    edge_count = {}
    for t, (a, b, c) in enumerate(tris):
        n, q = _plane_quadric(verts[a], verts[b], verts[c])
        if q is None:
            alive_t[t] = False
            continue
        for v in (a, b, c):
            qv = quad[v]
            for k in range(10):
                qv[k] += q[k]
            vt[v].add(t)
        for e in ((a, b), (b, c), (c, a)):
            key = (min(e), max(e))
            edge_count.setdefault(key, []).append((t, n))
    # an open edge is held in place by a plane through it, square to its triangle
    for (a, b), users in edge_count.items():
        if len(users) != 1:
            continue
        n = users[0][1]
        pa, pb = verts[a], verts[b]
        ex, ey, ez = pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]
        cx, cy, cz = ey * n[2] - ez * n[1], ez * n[0] - ex * n[2], ex * n[1] - ey * n[0]
        length = math.sqrt(cx * cx + cy * cy + cz * cz)
        if length < 1e-18:
            continue
        cx, cy, cz = cx / length, cy / length, cz / length
        d = -(cx * pa[0] + cy * pa[1] + cz * pa[2])
        w = 10.0 * (ex * ex + ey * ey + ez * ez)
        q = [w * cx * cx, w * cx * cy, w * cx * cz, w * cx * d, w * cy * cy, w * cy * cz, w * cy * d, w * cz * cz, w * cz * d, w * d * d]
        for v in (a, b):
            qv = quad[v]
            for k in range(10):
                qv[k] += q[k]

    stamp = [0] * nv
    alive_v = [True] * nv
    heap = []
    tick = 0

    def best(u, v):
        qu, qv = quad[u], quad[v]
        q = [qu[k] + qv[k] for k in range(10)]
        pu, pv = verts[u], verts[v]
        mx, my, mz = (pu[0] + pv[0]) / 2, (pu[1] + pv[1]) / 2, (pu[2] + pv[2]) / 2
        cands = [(pu[0], pu[1], pu[2]), (pv[0], pv[1], pv[2]), (mx, my, mz)]
        a, b, c, d, e, f = q[0], q[1], q[2], q[4], q[5], q[7]
        det = a * (d * f - e * e) - b * (b * f - e * c) + c * (b * e - d * c)
        scale = abs(a) + abs(d) + abs(f)
        if abs(det) > 1e-9 * scale * scale * scale and scale > 0:
            rx, ry, rz = -q[3], -q[6], -q[8]
            x = (rx * (d * f - e * e) - b * (ry * f - e * rz) + c * (ry * e - d * rz)) / det
            y = (a * (ry * f - e * rz) - rx * (b * f - e * c) + c * (b * rz - ry * c)) / det
            z = (a * (d * rz - ry * e) - b * (b * rz - ry * c) + rx * (b * e - d * c)) / det
            span = (pu[0] - pv[0]) ** 2 + (pu[1] - pv[1]) ** 2 + (pu[2] - pv[2]) ** 2
            if (x - mx) ** 2 + (y - my) ** 2 + (z - mz) ** 2 <= 4 * span:
                cands.append((x, y, z))
        cost, pos = min(((max(0.0, _err(q, *p)), p) for p in cands), key=lambda item: item[0])
        return cost, pos

    def push(u, v):
        nonlocal tick
        cost, _ = best(u, v)
        tick += 1
        heapq.heappush(heap, (cost, tick, u, v, stamp[u], stamp[v]))

    for a, b in edge_count:
        push(a, b)
    left = sum(alive_t)

    def flips(v, other, pos):
        """Would moving v to pos turn any of its triangles (other than those being removed) over?"""
        for t in vt[v]:
            tri = tris[t]
            if other in tri:
                continue
            p = [pos if w == v else verts[w] for w in tri]
            o = [verts[w] for w in tri]
            n1 = _plane_quadric(o[0], o[1], o[2])[0]
            n2 = _plane_quadric(p[0], p[1], p[2])[0]
            if n1 is None or n2 is None:
                return True
            if n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2] < 0.2:
                return True
        return False

    while left > target and heap:
        cost, _, u, v, su, sv = heapq.heappop(heap)
        if not (alive_v[u] and alive_v[v]) or stamp[u] != su or stamp[v] != sv:
            continue
        _, pos = best(u, v)
        if flips(u, v, pos) or flips(v, u, pos):
            continue
        verts[u] = [pos[0], pos[1], pos[2]]
        quad[u] = [quad[u][k] + quad[v][k] for k in range(10)]
        for t in list(vt[v]):
            tri = tris[t]
            if u in tri:
                alive_t[t] = False
                left -= 1
                for w in tri:
                    vt[w].discard(t)
            else:
                tri[tri.index(v)] = u
                vt[u].add(t)
        vt[v] = set()
        alive_v[v] = False
        stamp[u] += 1
        near = set()
        for t in vt[u]:
            near.update(tris[t])
        near.discard(u)
        for w in near:
            push(min(u, w), max(u, w))

    used = sorted({v for t, tri in enumerate(tris) if alive_t[t] for v in tri})
    index = {v: k for k, v in enumerate(used)}
    return [verts[v] for v in used], [[index[v] for v in tri] for t, tri in enumerate(tris) if alive_t[t]]


# ---- the URDF --------------------------------------------------------------------

def floats(text, default):
    return [float(x) for x in text.split()] if text else default


def read_urdf(path):
    root = ET.parse(path).getroot()
    links = {}
    for link in root.findall("link"):
        vis = link.find("visual")
        if vis is None:
            continue
        mesh = vis.find("geometry/mesh")
        if mesh is None:
            continue
        origin = vis.find("origin")
        links[link.get("name")] = {
            "mesh": mesh.get("filename").split("/")[-1],
            "rpy": floats(origin.get("rpy") if origin is not None else "", [0, 0, 0]),
            "xyz": floats(origin.get("xyz") if origin is not None else "", [0, 0, 0]),
        }
    joints = []
    for j in root.findall("joint"):
        child = j.find("child").get("link")
        if child not in links:
            continue
        origin, axis, limit = j.find("origin"), j.find("axis"), j.find("limit")
        joints.append({
            "name": j.get("name"),
            "type": j.get("type"),
            "parent": j.find("parent").get("link"),
            "child": child,
            "xyz": floats(origin.get("xyz") if origin is not None else "", [0, 0, 0]),
            "rpy": floats(origin.get("rpy") if origin is not None else "", [0, 0, 0]),
            "axis": floats(axis.get("xyz") if axis is not None else "", [0, 0, 0]),
            "limit": [float(limit.get("lower")), float(limit.get("upper"))] if limit is not None and limit.get("lower") else None,
        })
    return root.get("name"), links, joints


# ---- main ------------------------------------------------------------------------

def main(package):
    name, links, joints = read_urdf(os.path.join(package, "urdf", "go2w_description.urdf"))
    files = sorted({l["mesh"] for l in links.values()})
    blob = bytearray()
    table = {}
    for f in files:
        path = os.path.join(package, "dae", f)
        verts, tris = (read_stl if f.endswith(".stl") else read_dae)(path)
        n0 = len(tris)
        verts, tris = weld(verts, tris, 0.0012)  # 1.2 mm: below what the drawing can show
        n1 = len(tris)
        verts, tris = simplify(verts, tris, TARGET[f])
        lo = [min(v[k] for v in verts) for k in range(3)]
        hi = [max(v[k] for v in verts) for k in range(3)]
        assert len(verts) < 65536
        while len(blob) % 4:
            blob.append(0)
        v_at = len(blob)
        for v in verts:
            blob += struct.pack("<3H", *(round((v[k] - lo[k]) / (hi[k] - lo[k]) * 65535) for k in range(3)))
        while len(blob) % 4:
            blob.append(0)
        i_at = len(blob)
        for tri in tris:
            blob += struct.pack("<3H", *tri)
        table[f] = {"vertexOffset": v_at, "vertexCount": len(verts), "indexOffset": i_at, "indexCount": 3 * len(tris), "min": [round(x, 5) for x in lo], "max": [round(x, 5) for x in hi]}
        print("%-18s %6d triangles -> %6d welded -> %5d kept, %5d vertices" % (f, n0, n1, len(tris), len(verts)))

    os.makedirs(os.path.dirname(OUT_BIN), exist_ok=True)
    with open(OUT_BIN, "wb") as fh:
        fh.write(blob)
    model = {"robot": name, "links": links, "joints": joints, "meshes": table, "bytes": len(blob)}
    head = (
        "/*\n"
        " * GENERATED FILE. Do not edit by hand: run tools/make_go2w_model.py to rebuild it.\n"
        " *\n"
        " * The joint tree and mesh table of the Unitree Go2-W, read from the go2w_description\n"
        " * package in https://github.com/unitreerobotics/unitree_ros. The meshes in\n"
        " * assets/models/go2w.bin are simplified copies of that package's meshes.\n"
        " *\n"
        " * BSD 3-Clause License. Copyright (c) 2016-2022 HangZhou YuShu TECHNOLOGY CO.,LTD.\n"
        " * (\"Unitree Robotics\"). All rights reserved. Redistribution and use in source and binary\n"
        " * forms, with or without modification, are permitted provided that the conditions of that\n"
        " * license are met; its full text is in LICENSES/unitree_ros-BSD-3-Clause.txt.\n"
        " */\n"
    )
    with open(OUT_JS, "w", encoding="utf-8") as fh:
        fh.write(head + "window.ZFigData = window.ZFigData || {};\nwindow.ZFigData.go2w = " + json.dumps(model, separators=(",", ":")) + ";\n")
    print("wrote", os.path.normpath(OUT_BIN), len(blob), "bytes, and", os.path.normpath(OUT_JS))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
