"""Builds assets/js/figs/clocks-data.js from the Source Data file of

    P. Luo, Y. Zhai, P. Falus, V. Garcia Sakai, M. Hartl, M. Kofu, K. Nakajima, A. Faraone,
    and Y Z, "Q-dependent collective relaxation dynamics of glass-forming liquid
    Ca0.4K0.6(NO3)1.4 investigated by wide-angle neutron spin-echo",
    Nature Communications 13, 2092 (2022), https://doi.org/10.1038/s41467-022-29778-4

The article and its Source Data file are published under the Creative Commons Attribution
4.0 International License. Get the file from the article's "Source data" link
(41467_2022_29778_MOESM3_ESM.xlsx) and run:

    python3 tools/make_clocks_data.py path/to/41467_2022_29778_MOESM3_ESM.xlsx

Only the standard library is used. The spreadsheet is read as data: nothing in it is run.
Values are copied as published, rounded to four significant figures (errors to two).
"""
import json
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main", "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "js", "figs", "clocks-data.js")


def col_index(ref):
    n = 0
    for ch in re.match(r"[A-Z]+", ref).group(0):
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def load(path):
    """{sheet name: {row number: {column index: text}}}"""
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
            shared.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))
    rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
    sheets = {}
    for s in ET.fromstring(z.read("xl/workbook.xml")).find("m:sheets", NS):
        target = rels[s.get("{%s}id" % NS["r"])]
        root = ET.fromstring(z.read(target.lstrip("/") if target.startswith("/") else "xl/" + target))
        rows = {}
        for row in root.iter("{%s}row" % NS["m"]):
            cells = {}
            for c in row.findall("m:c", NS):
                v = c.find("m:v", NS)
                if v is None:
                    continue
                cells[col_index(c.get("r"))] = shared[int(v.text)] if c.get("t") == "s" else v.text
            if cells:
                rows[int(row.get("r"))] = cells
        sheets[s.get("name")] = rows
    return sheets


def num(text):
    try:
        return float(text)
    except (TypeError, ValueError):
        return None


def sig(x, digits=4):
    return float("%.*g" % (digits, x))


def series(rows, col, first_row):
    """[[t in ns, I(Q,t)/I(Q,0), error], ...] from three neighboring columns, without t = 0."""
    out = []
    for r in sorted(rows):
        if r < first_row:
            continue
        t, i, e = (num(rows[r].get(col + k)) for k in range(3))
        if t is None or i is None or t <= 0:
            continue
        out.append([sig(t), sig(i), sig(e or 0, 2)])
    return sorted(out)  # the spin echo sheets list two overlapping settings one after the other


def labelled(rows, row, pattern):
    """{column: number} for the header cells in a row that match a pattern such as 'T = 444 K'."""
    found = {}
    for col, text in rows[row].items():
        m = re.search(pattern, text)
        if m:
            found[col] = float(m.group(1))
    return dict(sorted(found.items()))


def main(path):
    sheets = load(path)

    # Fig. 2a: twelve wave vectors at 444 K. Fig. 2b: twelve temperatures at 1.86 per angstrom.
    a = sheets["Figure 2a"]
    assert "T = 444 K" in a[1][0], a[1][0]
    by_q = [{"q": q, "pts": series(a, col, 5)} for col, q in labelled(a, 3, r"Q = ([\d.]+)").items()]
    b = sheets["Figure 2b"]
    assert "Q = 1.86" in b[1][0], b[1][0]
    by_t = [{"T": int(t), "pts": series(b, col, 5)} for col, t in labelled(b, 3, r"T = ([\d.]+)").items()]

    # Fig. 6: time of flight (AMATERAS) and spin echo (WASP) together, at three wave vectors.
    six = sheets["Figure 6"]
    both = []
    for col, q in labelled(six, 3, r"Q = ([\d.]+)").items():
        runs = []
        for k in range(4):
            head = six[4][col + 3 * k]
            m = re.match(r"(AMATERAS|WASP) T = (\d+)", head)
            runs.append({"by": "time of flight" if m.group(1) == "AMATERAS" else "spin echo", "T": int(m.group(2)), "pts": series(six, col + 3 * k, 6)})
        both.append({"q": q, "runs": runs})

    # Fig. 3: the fitted plateau f, slow time, and stretching exponent at each temperature and wave vector.
    three = sheets["Figure 3a,b,c"]
    blocks = labelled(three, 3, r"T\s*=\s*([\d.]+)")
    cols = sorted(blocks)
    fits = {}
    for n, col in enumerate(cols):
        end = cols[n + 1] if n + 1 < len(cols) else max(three[4]) + 1
        where = {three[4][c].strip(): c for c in range(col, end) if c in three[4] and three[4][c].strip() in ("Q (Å-1)", "f", "τslow (ns)", "β")}
        rows = {}
        for r in sorted(three):
            if r < 5:
                continue
            q = num(three[r].get(where["Q (Å-1)"]))
            if q is None:
                continue
            get = lambda name: num(three[r].get(where[name])) if name in where else None
            rows[q] = {"f": get("f"), "tau": get("τslow (ns)"), "beta": get("β")}
        fits[int(blocks[col])] = rows

    def fit(temp, q):
        row = fits[temp]
        nearest = min(row, key=lambda x: abs(x - q))
        assert abs(nearest - q) < 0.03, (temp, q, nearest)
        v = row[nearest]
        return {k: (None if v[k] is None else sig(v[k], 3)) for k in ("f", "tau", "beta")}

    for c in by_t:
        c["fit"] = fit(c["T"], 1.86)
    for c in by_q:
        c["fit"] = fit(444, c["q"])

    data = {"temperatureAt": 444, "waveVectorAt": 1.86, "byTemperature": by_t, "byWaveVector": by_q, "bothSteps": both}
    head = (
        "/*\n"
        " * GENERATED FILE. Do not edit by hand: run tools/make_clocks_data.py to rebuild it.\n"
        " *\n"
        " * Measured intermediate scattering functions of molten CKN and their fitted parameters,\n"
        " * copied from the Source Data file of P. Luo et al., Nature Communications 13, 2092 (2022),\n"
        " * https://doi.org/10.1038/s41467-022-29778-4 (Figs. 2a, 2b, 3, and 6), which is published\n"
        " * under the Creative Commons Attribution 4.0 International License\n"
        " * (https://creativecommons.org/licenses/by/4.0/). Values are as published, rounded to four\n"
        " * significant figures. Each point is [time in ns, I(Q,t)/I(Q,0), error].\n"
        " */\n"
    )
    body = "window.ZFigData = window.ZFigData || {};\nwindow.ZFigData.clocks = " + json.dumps(data, separators=(",", ":"), ensure_ascii=False) + ";\n"
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(head + body)

    print("wrote", os.path.normpath(OUT), "(%d bytes)" % (len(head) + len(body.encode("utf-8"))))
    print("by temperature:", [(c["T"], len(c["pts"]), c["fit"]) for c in by_t][:3], "...")
    print("by wave vector:", [(c["q"], len(c["pts"]), c["fit"]) for c in by_q][:3], "...")
    for blk in both:
        print("both steps, q =", blk["q"], [(r["by"], r["T"], len(r["pts"]), r["pts"][0][0], r["pts"][-1][0]) for r in blk["runs"]])


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
