/*
 * Research, "From 100 atoms to 100,000".
 *
 * What it shows: a slowly turning cubic box of atoms. It starts as a first-principles cell
 * of 100 atoms, drawn in maize. The box then grows, step by step, to the sizes the lab
 * simulated with machine-learned interatomic potentials, and the view pulls back to keep
 * the box in the picture. The 100-atom cell stays where it is, in maize, at the center of
 * the box, so the visitor sees how small it has become. Every box is drawn at the same
 * number of atoms per volume, so its edge grows as the cube root of the number of atoms:
 * the box of 100,000 atoms has ten times the edge of the cell of 100.
 *
 * Where each system size comes from (the sizes, run lengths, and materials are the papers'):
 *   100 atoms, first principles, FLiNaK (50 F, 23 Li, 6 Na, 21 K; five runs, 34.5 ps of
 *   production in total) and 10,000 atoms, learned potential, FLiNaK (1 ns of production):
 *     S.-C. Lee, Y. Zhai, Z. Li, N. P. Walter, M. Rose, B. J. Heuser, and Y Z,
 *     J. Phys. Chem. B 125, 10562 (2021), doi:10.1021/acs.jpcb.1c05608, Methods.
 *   800 atoms (structure and dynamics; 200 ps analyzed) and 2,400 atoms (thermal
 *   conductivity; 400 ps with heat exchange), learned potential, LiF-NaF:
 *     L. Murg, S.-C. Lee, V. F. Grizzi, and Y Z, J. Appl. Phys. 137, 064701 (2025),
 *     doi:10.1063/5.0244036, Methods. Its first-principles cells have 100 atoms.
 *   2,916 atoms, learned potential, zinc chloride (production runs of 6 ns, longer at the
 *   lowest temperatures):
 *     S.-C. Lee and Y Z, J. Chem. Phys. 161, 044502 (2024), doi:10.1063/5.0215370, Methods.
 *     Its first-principles cell has 108 atoms (36 Zn, 72 Cl).
 *   100,000 atoms, learned potential, LiF-NaF with ThF4 (400 ps):
 *     V. F. Grizzi, B. Nebgen, and Y Z, Phys. Rev. Mater. 10, 065606 (2026),
 *     doi:10.1103/4dsc-6432, Methods. Its reference first-principles runs have 100 atoms.
 *
 * What is NOT from the papers: where the atoms are. They are placed at random at one
 * density, for illustration only (a jittered lattice, and in the cell random points kept
 * apart from one another; the same on every visit). They are not configurations from the
 * simulations, one kind of dot stands for every element, and the dots are not drawn to the
 * atoms' size. The one density is part of the illustration too: the boxes are not drawn to
 * each material's own density.
 *
 * Drawing: the shared 3D kit (fig3d.js). The atoms are its round points; the edges of the
 * boxes are drawn flat under them.
 */
(() => {
  "use strict";
  const root = document.querySelector('[data-fig="scale"]');
  const stageEl = root && root.querySelector("[data-stage]");
  if (!stageEl || !window.ZFig || !window.ZFig3D) return;
  const { run, rule, color } = window.ZFig;
  const { scale } = window.ZFig3D.mat;

  /* The steps, in order of size. Each line is a run in the paper named (see the top of this file). */
  const STEPS = [
    { atoms: 100, method: "first principles", salt: "FLiNaK", cite: "Lee et al. 2021", time: "34.5 ps in total" },
    { atoms: 800, method: "learned potential", salt: "LiF-NaF", cite: "Murg et al. 2025", time: "200 ps analyzed" },
    { atoms: 2400, method: "learned potential", salt: "LiF-NaF", cite: "Murg et al. 2025", time: "400 ps" },
    { atoms: 2916, method: "learned potential", salt: "ZnCl₂", cite: "Lee and Z 2024", time: "6 ns" },
    { atoms: 10000, method: "learned potential", salt: "FLiNaK", cite: "Lee et al. 2021", time: "1 ns" },
    { atoms: 100000, method: "learned potential", salt: "LiF-NaF-ThF₄", cite: "Grizzi et al. 2026", time: "400 ps" },
  ];
  /* The first-principles cells behind the other three potentials: for the table only. */
  const CELLS = [
    { atoms: 108, salt: "ZnCl₂", cite: "Lee and Z 2024", time: "" },
    { atoms: 100, salt: "LiF-NaF", cite: "Murg et al. 2025", time: "4 ps each" },
    { atoms: 100, salt: "LiF-NaF-ThF₄", cite: "Grizzi et al. 2026", time: "" },
  ];
  const LAST = STEPS.length - 1;
  const CELL = STEPS[0].atoms;
  const INK = STEPS[LAST].atoms - CELL; /* the atoms outside the first-principles cell */
  /* Edge of each box in edges of the 100-atom cell: one density, so the cube root of the count. */
  const EDGE = STEPS.map((s) => Math.cbrt(s.atoms / CELL));

  /* ---- the timeline: rest on a step, grow to the next, and after the last go back ---------- */

  const REST = [2.4, 1.9, 1.9, 1.9, 2.0, 4.6]; /* seconds on each step */
  const BACK = 1.9;
  const SPANS = [];
  let PERIOD = 0;
  STEPS.forEach((s, i) => {
    if (i) {
      const d = 1.1 + 1.5 * Math.log10(s.atoms / STEPS[i - 1].atoms); /* a larger jump takes longer */
      SPANS.push({ from: i - 1, to: i, start: PERIOD, d });
      PERIOD += d;
    }
    SPANS.push({ from: i, to: i, start: PERIOD, d: REST[i] });
    PERIOD += REST[i];
  });
  SPANS.push({ from: LAST, to: 0, start: PERIOD, d: BACK });
  PERIOD += BACK;
  const STILL = SPANS[SPANS.length - 2].start; /* the picture when nothing moves: the whole 100,000-atom box */

  const ease = (u) => {
    const x = Math.max(0, Math.min(1, u));
    return x * x * x * (x * (6 * x - 15) + 10);
  };
  /* The box's edge, the edge the view is set for, and the step named, at time t.
     Growing, the view pulls back first and the box then grows into it; going back is the reverse. */
  function state(t) {
    const span = SPANS.find((s) => t < s.start + s.d) || SPANS[SPANS.length - 1];
    if (span.from === span.to) return { box: EDGE[span.from], view: EDGE[span.from], step: span.from };
    const u = (t - span.start) / span.d;
    const a = Math.log(EDGE[span.from]);
    const b = Math.log(EDGE[span.to]);
    const first = ease(u / 0.6);
    const second = ease((u - 0.34) / 0.66);
    const grows = span.to > span.from;
    return {
      box: Math.exp(a + (b - a) * (grows ? second : first)),
      view: Math.exp(a + (b - a) * (grows ? first : second)),
      step: u < 0.34 ? span.from : span.to,
    };
  }

  /* ---- the atoms ----------------------------------------------------------------------------- */

  /* A small seeded generator, so the picture is the same on every visit. */
  function seeded(seed) {
    let s = seed;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* The 100 atoms of the cell, in a cube of edge 1 about the origin: each is the best of a few
     random tries (the one farthest from those already placed, across the periodic faces). */
  function cellAtoms(rand) {
    const out = [];
    const INSET = 0.93; /* keeps the dots inside the drawn edges */
    for (let i = 0; i < CELL; i++) {
      let best = null;
      let bestD = -1;
      for (let c = 0; c < 28; c++) {
        const p = [rand() - 0.5, rand() - 0.5, rand() - 0.5];
        let d = Infinity;
        for (const q of out) {
          let sum = 0;
          for (let k = 0; k < 3; k++) {
            const gap = Math.abs(p[k] - q[k] / INSET);
            sum += Math.min(gap, 1 - gap) ** 2;
          }
          if (sum < d) d = sum;
        }
        if (d > bestD) {
          bestD = d;
          best = p;
        }
      }
      out.push(best.map((v) => v * INSET));
    }
    return out;
  }

  /*
   * The other 99,900 atoms: a jittered cubic lattice at the cell's density, put in order of
   * "cube radius" (the largest of |x|, |y|, |z|), so that the first N of them, with the cell,
   * fill the cubic box of N + 100 atoms exactly. Each is then moved along its line from the
   * center, by a hair, to the radius its place in that order calls for at an even density.
   */
  function outerAtoms(rand) {
    const a = Math.cbrt(1 / CELL); /* lattice spacing, in cell edges */
    const M = Math.ceil((0.5 * EDGE[LAST] * 1.03) / a); /* lattice sites per half edge: a little more than the largest box */
    const R = M * a;
    const total = 8 * M * M * M;
    const xyz = new Float32Array(total * 3);
    const rad = new Float32Array(total);
    const BINS = 1 << 16;
    const bin = new Uint16Array(total);
    const startOf = new Uint32Array(BINS + 1);
    let n = 0;
    for (let i = -M; i < M; i++) {
      for (let j = -M; j < M; j++) {
        for (let l = -M; l < M; l++) {
          const x = (i + 0.5 + (rand() - 0.5) * 0.92) * a;
          const y = (j + 0.5 + (rand() - 0.5) * 0.92) * a;
          const z = (l + 0.5 + (rand() - 0.5) * 0.92) * a;
          const r = Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
          if (r < 0.5) continue; /* inside the cell, which has its own atoms */
          xyz[n * 3] = x;
          xyz[n * 3 + 1] = y;
          xyz[n * 3 + 2] = z;
          rad[n] = r;
          bin[n] = Math.min(BINS - 1, Math.floor((r / R) ** 3 * BINS)); /* bins of equal volume, so about equal counts */
          startOf[bin[n] + 1]++;
          n++;
        }
      }
    }
    for (let b = 0; b < BINS; b++) startOf[b + 1] += startOf[b];
    const order = new Uint32Array(n);
    for (let q = 0; q < n; q++) order[startOf[bin[q]]++] = q;
    const out = new Float32Array(INK * 3);
    for (let k = 0; k < INK; k++) {
      const q = order[k];
      const f = (0.5 * Math.cbrt((CELL + k + 0.5) / CELL)) / rad[q];
      out[k * 3] = xyz[q * 3] * f;
      out[k * 3 + 1] = xyz[q * 3 + 1] * f;
      out[k * 3 + 2] = xyz[q * 3 + 2] * f;
    }
    return out;
  }

  /* ---- the picture ------------------------------------------------------------------------------ */

  const FAR = 1;
  const corners = [];
  for (let c = 0; c < 8; c++) corners.push([c & 1 ? 0.5 : -0.5, c & 2 ? 0.5 : -0.5, c & 4 ? 0.5 : -0.5]);
  const edges = [];
  for (let c = 0; c < 8; c++) for (const bit of [1, 2, 4]) if (!(c & bit)) edges.push([c, c | bit]);

  /* The direction from the scene toward the viewer. */
  function toward(camera) {
    const a = camera.azimuth;
    const e = camera.elevation;
    return [Math.sin(a) * Math.cos(e), -Math.cos(a) * Math.cos(e), Math.sin(e)];
  }

  /* The twelve edges of a cube of the given edge about the origin; the three that meet at the far corner are fainter. */
  function wire(ctx, st, edge) {
    const d = toward(st.camera);
    const far = (d[0] > 0 ? 0 : 1) | (d[1] > 0 ? 0 : 2) | (d[2] > 0 ? 0 : 4);
    const p = corners.map((c) => st.project([c[0] * edge, c[1] * edge, c[2] * edge]));
    for (const behind of [true, false]) {
      for (const [i, j] of edges) {
        if ((i === far || j === far) !== behind) continue;
        rule(ctx, p[i][0], p[i][1], p[j][0], p[j][1], behind ? color.ruleStrong : color.ink, 1);
      }
    }
  }

  /* Without WebGL 2: the boxes as nested squares, their sides in proportion, the cell in maize. */
  function squares(ctx, w, h) {
    const side = Math.min(w, h) - 56;
    for (let i = LAST; i >= 0; i--) {
      const s = Math.max(6, Math.round((side * EDGE[i]) / EDGE[LAST]));
      const x = Math.round((w - s) / 2) + 0.5;
      const y = Math.round((h - s) / 2) + 0.5;
      if (i === 0) {
        ctx.fillStyle = color.maize;
        ctx.fillRect(x, y, s, s);
      }
      ctx.lineWidth = 1;
      ctx.strokeStyle = color.ink;
      ctx.strokeRect(x, y, s, s);
    }
  }

  let now = STILL;
  let seen = state(now);
  let ink = null; /* the cloud of the 99,900 atoms outside the cell */
  let one = null; /* a single point, drawn once for each atom of the cell */
  let cell = null;

  const stage = window.ZFig3D.stage(stageEl, {
    height: (w) => (w >= 900 ? 500 : w >= 520 ? 420 : 330),
    far: FAR,
    camera: { azimuth: 0.62, elevation: 0.42, center: [0, 0, 0], halfHeight: 0.82, minHalfWidth: 0.77 },
    /* the edges of the box and of the cell, drawn flat under the atoms */
    underlay(ctx, w, h, st) {
      if (!st.ok) {
        squares(ctx, w, h);
        return;
      }
      if (seen.box > 1.001) wire(ctx, st, seen.box / seen.view);
      wire(ctx, st, 1 / seen.view);
    },
  });

  /* Sizes and strengths of the dots for a view set for a box of edge v (in cell edges). The scene
     is scaled so that box has edge 1, and a dot shrinks more slowly than the box it sits in. */
  const mix = (a, b, u) => a + (b - a) * Math.max(0, Math.min(1, u));
  function look(v) {
    const out = Math.log(v) / Math.log(EDGE[LAST]); /* 0 at the cell, 1 at the largest box */
    const dot = 0.058 * v ** -0.93;
    return {
      dot,
      strength: mix(0.95, 0.5, (out - 0.4) / 0.6), /* fainter where they are many, so the box keeps its depth */
      own: dot * mix(1, 1.7, (out - 0.3) / 0.7), /* the cell's dots, a little larger when the cell is small */
      rim: mix(1, 0, (out - 0.15) / 0.6), /* their ink outline fades as they shrink */
    };
  }

  const slots = [];
  const order = [];
  function show() {
    seen = state(now);
    const items = [];
    if (stage.ok && ink) {
      const k = 1 / seen.view;
      const L = look(seen.view);
      const outside = Math.max(0, Math.min(INK, Math.round(CELL * seen.box ** 3) - CELL)); /* atoms in the box, less the cell's */
      if (outside) items.push({ cloud: ink, model: scale(k), size: L.dot, strength: L.strength, count: outside });
      /* the cell's atoms, far ones first, each a maize dot on a slightly larger ink one */
      const d = toward(stage.camera);
      for (let i = 0; i < CELL; i++) {
        const p = cell[i];
        order[i] = i;
        slots[i].depth = (p[0] * d[0] + p[1] * d[1] + p[2] * d[2]) * k;
        slots[i].model[12] = p[0] * k;
        slots[i].model[13] = p[1] * k;
        slots[i].model[14] = p[2] * k;
      }
      order.sort((a, b) => slots[a].depth - slots[b].depth);
      for (const i of order) {
        const s = slots[i];
        /* the kit dims far points; undo that here, so each maize dot is solid and only its outline tells depth */
        const dim = 0.45 + 0.55 * Math.max(0, Math.min(1, 0.5 + s.depth / (2 * FAR)));
        const near = Math.max(0, Math.min(1, 0.5 + s.depth / (1.7 * k)));
        if (L.rim > 0.01) items.push({ cloud: one, model: s.model, size: L.own * 1.34, strength: (L.rim * (0.5 + 0.5 * near)) / dim });
        items.push({ cloud: one, model: s.model, size: L.own, maize: true, strength: 1 / dim });
      }
    }
    stage.render([], items);
    name(seen.step);
  }

  /* Building the atoms takes a few hundredths of a second, so it waits until the figure is near the screen. */
  function build() {
    if (ink || !stage.ok) return;
    const rand = seeded(100000);
    cell = cellAtoms(rand);
    for (let i = 0; i < CELL; i++) slots.push({ depth: 0, model: scale(1) });
    ink = stage.cloud(outerAtoms(rand));
    one = stage.cloud([0, 0, 0]);
    show();
  }

  /* ---- the line that names the step -------------------------------------------------------------- */

  const readout = root.querySelector("[data-step]");
  const commas = (n) => n.toLocaleString("en-US");
  /* Text into an element, with the digits of a chemical formula (ZnCl₂) set as true subscripts. */
  function chem(el, str) {
    for (const piece of str.split(/([₀-₉]+)/)) {
      if (!piece) continue;
      if (piece[0] < "₀" || piece[0] > "₉") el.append(piece);
      else el.appendChild(document.createElement("sub")).textContent = Array.from(piece, (c) => String(c.charCodeAt(0) - 0x2080)).join("");
    }
    return el;
  }
  let named = -1;
  function name(i) {
    if (!readout || i === named) return;
    named = i;
    const s = STEPS[i];
    readout.textContent = "";
    readout.appendChild(document.createElement("b")).textContent = commas(s.atoms) + " atoms";
    for (const part of [s.method, s.salt, s.cite]) chem(readout.appendChild(document.createElement("span")), part);
  }
  /* The line is longer for some steps than for others and wraps on a narrow screen. Give it the
     room its longest form needs, so the page under the figure does not move as the steps change. */
  function reserve() {
    if (!readout) return;
    const controls = readout.parentElement;
    const was = named < 0 ? LAST : named;
    const tallest = () => {
      let tall = 0;
      for (let i = 0; i <= LAST; i++) {
        name(i);
        tall = Math.max(tall, readout.offsetHeight);
      }
      return tall;
    };
    /* first on one line at its full width (set with keywords only: under reduced motion the site's
       stylesheet gives every numeric property a very short transition, which a measurement would catch midway) */
    Object.assign(readout.style, { minHeight: "", flexBasis: "", flexDirection: "", flexWrap: "nowrap", minWidth: "max-content" });
    const line = tallest(); /* the height of one line */
    let wide = 0;
    for (let i = 0; i <= LAST; i++) {
      name(i);
      wide = Math.max(wide, readout.offsetWidth);
    }
    Object.assign(readout.style, { flexWrap: "", minWidth: "" });
    const gap = parseFloat(getComputedStyle(controls).columnGap) || 0;
    const beside = Array.from(controls.children).reduce((sum, el) => sum + (el === readout || !el.offsetWidth ? 0 : el.offsetWidth + gap), 0);
    if (beside + wide > controls.clientWidth) readout.style.flexBasis = "100%"; /* a line of its own, for every step */
    if (tallest() > 2.5 * line) readout.style.flexDirection = "column"; /* too narrow for two lines: one part to a line, for every step */
    readout.style.minHeight = tallest() + "px";
    name(was);
  }

  /* ---- playing, turning, and the table ----------------------------------------------------------- */

  const TURN = 0.14; /* radians a second */
  let held = false; /* the visitor is turning the box by hand */
  let fresh = true; /* nothing has played yet */
  const playBtn = root.querySelector("[data-play]");
  const loop = run(stageEl, (dt) => {
    build();
    now = (now + dt) % PERIOD;
    if (!held) stage.camera.azimuth += TURN * dt;
    show();
  });
  function setPlaying(on) {
    if (on && fresh) now = 0; /* it plays from the 100-atom cell */
    if (on) fresh = false;
    loop.setPaused(!on);
    if (playBtn) {
      playBtn.setAttribute("aria-pressed", String(on));
      playBtn.textContent = on ? "Pause" : "Play";
    }
  }
  if (playBtn) playBtn.addEventListener("click", () => setPlaying(loop.paused));

  /* drag sideways to turn the box, or use the arrow keys when the picture has the focus */
  stage.orbit({ min: -Infinity, max: Infinity, onTurn: show });
  stage.canvas.addEventListener("pointerdown", () => {
    held = true;
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    stage.canvas.addEventListener(type, () => {
      held = false;
    });
  }
  stageEl.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    stage.camera.azimuth += e.key === "ArrowLeft" ? 0.12 : -0.12;
    show();
    e.preventDefault();
  });

  /* The steps as a table, with the first-principles cells of the other three potentials. */
  const table = root.querySelector("[data-table]");
  if (table) {
    const el = document.createElement("table");
    el.innerHTML = '<thead><tr><th scope="col">Material</th><th scope="col">Paper</th><th scope="col">Atoms</th><th scope="col">Run</th></tr></thead>';
    const groups = [
      ["First principles", [STEPS[0]].concat(CELLS)],
      ["Learned potential", STEPS.slice(1)],
    ];
    for (const [title, rows] of groups) {
      const body = el.appendChild(document.createElement("tbody"));
      const head = body.appendChild(document.createElement("tr")).appendChild(document.createElement("th"));
      head.colSpan = 4;
      head.scope = "rowgroup";
      head.appendChild(document.createElement("b")).textContent = title;
      for (const r of rows) {
        const tr = body.appendChild(document.createElement("tr"));
        chem(tr.appendChild(document.createElement("th")), r.salt).scope = "row";
        /* where a cell must wrap, it breaks before the year or after the length, not inside a name */
        for (const value of [r.cite.replace(/ (?!\d{4}$)/g, "\u00a0"), commas(r.atoms), r.time.replace(/(\d) /, "$1\u00a0").replace("in total", "in\u00a0total")]) tr.appendChild(document.createElement("td")).textContent = value;
      }
    }
    /* a formula and a number stay on one line, the other cells may wrap (the room between columns is in style.css) */
    for (const row of el.rows) {
      Array.from(row.cells).forEach((c, k) => {
        if (row.cells.length === 4 && k !== 1 && k !== 3) c.style.whiteSpace = "nowrap";
      });
    }
    table.replaceChildren(el);
  }

  if (!stage.ok) {
    /* nothing to play: the still picture of nested squares, and the largest step named */
    if (playBtn) playBtn.hidden = true;
    loop.setPaused(true);
    name(LAST);
  } else {
    if ("IntersectionObserver" in window) {
      const near = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            near.disconnect();
            build();
          }
        },
        { rootMargin: "800px 0px" }
      );
      near.observe(stageEl);
    } else {
      build();
    }
    setPlaying(!loop.paused);
  }
  reserve();
  if (readout && "ResizeObserver" in window) {
    let width = readout.parentElement.clientWidth;
    new ResizeObserver(() => {
      if (readout.parentElement.clientWidth === width) return;
      width = readout.parentElement.clientWidth;
      reserve();
    }).observe(readout.parentElement);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(reserve);
  show();
})();
