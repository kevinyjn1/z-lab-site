/*
 * Research, "Flood the landscape".
 *
 * A model with an illustration on top of it.
 *
 * What is shown: the potential energy landscape of pentane as a function of its
 * two C-C-C-C dihedral angles, on a square that wraps around in both directions,
 * and beside it the zero-dimensional barcode of that landscape: one bar per
 * valley, from the energy of its minimum to the energy at which it merges into a
 * deeper valley. A walker explores the landscape by metadynamics.
 *
 * Sources:
 *   J. Mirth, Y. Zhai, J. Bush, E. G. Alvarado, H. Jordan, M. Heim,
 *   B. Krishnamoorthy, M. Pflaum, A. Clark, Y Z, and H. Adams, "Representations
 *   of energy landscapes by sublevelset persistent homology: an example with
 *   n-alkanes", J. Chem. Phys. 154, 114114 (2021), doi:10.1063/5.0036747.
 *   S.-C. Lee and Y Z, "Interpretation of autoencoder-learned collective
 *   variables using Morse-Smale complex and sublevelset persistent homology: an
 *   application on molecular trajectories", J. Chem. Phys. 160, 144104 (2024),
 *   doi:10.1063/5.0191446 (the rising sea level reading of the same diagrams).
 *
 * Published data: only the three constants c1, c2, c3 of Eq. 1 of Mirth et al.
 *
 * The paper's equation run in the browser: the landscape itself (Eq. 1 summed
 * over the two angles), and its barcode in dimension zero, found by the paper's
 * rule (flood from the bottom, a valley is born at its minimum and dies where it
 * joins an older one) on a 180 x 180 periodic grid. Minima, passes, and every
 * energy printed in the figure are computed here from the formula; none is
 * copied from the paper. (Eq. 1 puts the side valleys at 63.4 and 296.6 degrees
 * and the passes at 118.4 and 241.6 degrees, so the energies come out as 3.47,
 * 6.95, 13.81, and 17.28 kJ/mol, a little off the values Eq. 1 takes at exactly
 * 60 and 120 degrees.) The paper's barcode also has bars for loops and for the
 * void; they are not drawn.
 *
 * Illustration: the walker. It follows overdamped Langevin dynamics on the
 * landscape plus a bias, and a small Gaussian hill of bias is added where it
 * stands, which is metadynamics in its textbook form. Its temperature, mobility,
 * and hill size are chosen for the picture and come from no paper. The lab's own
 * all-atom metadynamics biases every atomic coordinate; its equations are not
 * published in the papers above and it is not what runs here.
 */
(() => {
  "use strict";

  const root = document.querySelector('[data-fig="flood"]');
  if (!root || !window.ZFig) return;
  const { color, font, canvas, axes, path, dot, text, rule, run } = window.ZFig;

  /* The landscape ---------------------------------------------------------- */

  const C1 = 355.03; /* c1/kB in kelvin: Mirth et al. 2021, Eq. 1 */
  const C2 = -68.19; /* c2/kB in kelvin: Mirth et al. 2021, Eq. 1 */
  const C3 = 791.32; /* c3/kB in kelvin: Mirth et al. 2021, Eq. 1 */
  const KJ_PER_K = 0.008314462618; /* the gas constant in kJ/(mol K), to print V/kB (kelvin) in kJ/mol */
  const TAU = Math.PI * 2;

  /* Eq. 1 for one dihedral angle, and its slope. Pentane is this function of each of its two angles, added. */
  const torsion = (p) => C1 * (1 + Math.cos(p)) + C2 * (1 - Math.cos(2 * p)) + C3 * (1 + Math.cos(3 * p));
  const torsionSlope = (p) => -C1 * Math.sin(p) + 2 * C2 * Math.sin(2 * p) - 3 * C3 * Math.sin(3 * p);

  const N = 180; /* grid points around each angle (2 degrees apart) */
  const H = TAU / N;
  const V = new Float32Array(N * N); /* the landscape, in kelvin */
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) V[j * N + i] = torsion(i * H) + torsion(j * H);
  const around = (k) => {
    const i = k % N;
    const j = (k - i) / N;
    return [j * N + ((i + 1) % N), j * N + ((i + N - 1) % N), ((j + 1) % N) * N + i, ((j + N - 1) % N) * N + i];
  };

  /*
   * The barcode in dimension zero. Grid points are taken from the lowest up. A point
   * with no flooded neighbor starts a valley; a point that joins two valleys ends
   * the younger one (the one with the higher minimum) at that point's energy.
   */
  function barcode() {
    const order = Array.from({ length: N * N }, (_, k) => k).sort((a, b) => V[a] - V[b] || a - b);
    const parent = new Int32Array(N * N).fill(-1);
    const lowest = new Int32Array(N * N); /* for a root: the grid point of its valley's minimum */
    const find = (a) => {
      while (parent[a] !== a) a = parent[a] = parent[parent[a]];
      return a;
    };
    const bars = [];
    for (const k of order) {
      parent[k] = k;
      lowest[k] = k;
      for (const n of around(k)) {
        if (parent[n] === -1) continue;
        const a = find(k);
        const b = find(n);
        if (a === b) continue;
        const older = V[lowest[a]] < V[lowest[b]] || (V[lowest[a]] === V[lowest[b]] && lowest[a] < lowest[b]) ? a : b;
        const younger = older === a ? b : a;
        if (V[k] > V[lowest[younger]]) bars.push({ at: lowest[younger], birth: V[lowest[younger]], death: V[k] });
        parent[younger] = older;
      }
    }
    bars.push({ at: lowest[find(order[0])], birth: V[order[0]], death: Infinity });
    return bars.sort((a, b) => a.birth - b.birth || a.at - b.at);
  }

  /* Which valley each grid point drains into, by steepest descent. */
  function drainage(valleyAt) {
    const basin = new Int16Array(N * N).fill(-1);
    for (let start = 0; start < N * N; start++) {
      const trail = [];
      let k = start;
      while (basin[k] === -1) {
        trail.push(k);
        let down = k;
        for (const n of around(k)) if (V[n] < V[down]) down = n;
        if (down === k) {
          basin[k] = valleyAt.indexOf(k);
          break;
        }
        k = down;
      }
      for (const t of trail) basin[t] = basin[k];
    }
    return basin;
  }

  /* The valleys, numbered from the deepest. Angles in grid units, energies in kelvin. */
  const valleys = barcode().map((bar) => {
    const i = bar.at % N;
    const j = (bar.at - i) / N;
    /* The minimum sits between grid points: a parabola through three of them along each angle places it. */
    const vertex = (lo, mid, hi) => (0.5 * (lo - hi)) / (lo - 2 * mid + hi);
    const line = (m) => torsion(m * H);
    return { at: bar.at, birth: bar.birth, death: bar.death, i: i + vertex(line(i - 1), line(i), line(i + 1)), j: j + vertex(line(j - 1), line(j), line(j + 1)) };
  });
  const basin = drainage(valleys.map((v) => v.at));
  const kJ = (kelvin) => kelvin * KJ_PER_K;
  /* The distinct energies at which bars start and end, in kJ/mol: the ticks of the barcode's axis. */
  const energies = valleys
    .flatMap((v) => [v.birth, v.death])
    .filter(Number.isFinite)
    .map(kJ)
    .sort((a, b) => a - b)
    .filter((e, k, all) => k === 0 || e - all[k - 1] > 0.05);

  /* The walker (illustration settings, from no paper) ------------------------ */

  const HILL_HEIGHT = 20; /* kelvin */
  const HILL_WIDTH = 0.25; /* radians */
  const HILL_EVERY = 8; /* steps between two hills */
  const STEP = 2e-5; /* mobility times time step, in rad^2 per kelvin */
  const STEPS_PER_SECOND = 480;
  const NEAR = 0.35; /* radians from a minimum within which the valley counts as visited */
  const FLOODED = 60; /* kelvin of bias (0.5 kJ/mol) above which a place is drawn as flooded */
  const CONTOUR_EVERY = 4; /* kJ/mol between contour lines */
  const E_MAX = 19; /* kJ/mol, right end of the barcode axis */
  const TRAIL = 40; /* frames of the walker's recent positions */

  const B = new Float32Array(N * N); /* the bias, in kelvin */
  const level = new Float32Array(valleys.length); /* lowest point of landscape + bias left in each valley */
  const seen = valleys.map(() => false);
  const trail = [];
  let temperature = 150; /* kelvin */
  let px = 0;
  let py = 0;
  let here = 0; /* the valley the walker is in */
  let hills = 0;
  let steps = 0;
  let owed = 0;
  let found = 0;
  let slopeX = 0;
  let slopeY = 0;

  const wrap = (p) => p - TAU * Math.floor(p / TAU);
  const turn = (a, b) => Math.min(Math.abs(a - b), N - Math.abs(a - b)) * H; /* shortest way around, in radians */

  function gauss() {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  }

  /* Slope of the bias at (x, y), from the four grid points around it. */
  function biasSlope(x, y) {
    const fx = x / H;
    const fy = y / H;
    const i = Math.floor(fx) % N;
    const j = Math.floor(fy) % N;
    const tx = fx - Math.floor(fx);
    const ty = fy - Math.floor(fy);
    const i1 = (i + 1) % N;
    const j1 = (j + 1) % N;
    const b00 = B[j * N + i];
    const b10 = B[j * N + i1];
    const b01 = B[j1 * N + i];
    const b11 = B[j1 * N + i1];
    slopeX = ((b10 - b00) * (1 - ty) + (b11 - b01) * ty) / H;
    slopeY = ((b01 - b00) * (1 - tx) + (b11 - b10) * tx) / H;
  }

  function addHill(x, y) {
    const reach = Math.ceil((3.5 * HILL_WIDTH) / H);
    const ci = Math.round(x / H);
    const cj = Math.round(y / H);
    for (let dj = -reach; dj <= reach; dj++) {
      const row = ((cj + dj + N) % N) * N;
      const dy = (cj + dj) * H - y;
      for (let di = -reach; di <= reach; di++) {
        const dx = (ci + di) * H - x;
        B[row + ((ci + di + N) % N)] += HILL_HEIGHT * Math.exp(-(dx * dx + dy * dy) / (2 * HILL_WIDTH * HILL_WIDTH));
      }
    }
    hills++;
  }

  /* Overdamped Langevin steps on landscape + bias; a hill every few steps until every valley has been found. */
  function advance(count) {
    const kick = Math.sqrt(2 * STEP * temperature);
    for (let s = 0; s < count; s++) {
      biasSlope(px, py);
      px = wrap(px - STEP * (torsionSlope(px) + slopeX) + kick * gauss());
      py = wrap(py - STEP * (torsionSlope(py) + slopeY) + kick * gauss());
      if (found < valleys.length && ++steps % HILL_EVERY === 0) addHill(px, py);
    }
    const gi = px / H;
    const gj = py / H;
    here = basin[(Math.round(gj) % N) * N + (Math.round(gi) % N)];
    if (!seen[here] && Math.hypot(turn(gi, valleys[here].i), turn(gj, valleys[here].j)) < NEAR) {
      seen[here] = true;
      found++;
    }
    trail.push(gi, gj);
    if (trail.length > TRAIL * 2) trail.splice(0, 2);
  }

  function measure() {
    level.fill(Infinity);
    for (let k = 0; k < N * N; k++) {
      const e = V[k] + B[k];
      if (e < level[basin[k]]) level[basin[k]] = e;
    }
  }

  function reset() {
    B.fill(0);
    seen.fill(false);
    trail.length = 0;
    hills = 0;
    steps = 0;
    owed = 0;
    here = 0;
    seen[0] = true;
    found = 1;
    px = valleys[0].i * H;
    py = valleys[0].j * H;
    measure();
  }

  /* Drawing ------------------------------------------------------------------ */

  /*
   * Marching squares over the periodic grid, in grid units. For every cell the contour
   * field = height crosses, line(x0, y0, x1, y1) gets the crossing; if area is given it
   * gets the part of each cell that lies above the height, as a polygon [x, y, x, y, ...].
   */
  const CX = [0, 1, 1, 0];
  const CY = [0, 0, 1, 1];
  const corner = [0, 0, 0, 0];
  function march(field, height, line, area) {
    const poly = [];
    const cuts = [];
    for (let j = 0; j < N; j++) {
      const j1 = (j + 1) % N;
      for (let i = 0; i < N; i++) {
        const i1 = (i + 1) % N;
        corner[0] = field[j * N + i];
        corner[1] = field[j * N + i1];
        corner[2] = field[j1 * N + i1];
        corner[3] = field[j1 * N + i];
        const above = (corner[0] > height) + (corner[1] > height) + (corner[2] > height) + (corner[3] > height);
        if (above === 0) continue;
        if (above === 4) {
          if (area) {
            let end = i;
            while (end + 1 < N && field[j * N + ((end + 2) % N)] > height && field[j1 * N + ((end + 2) % N)] > height) end++;
            area([i, j, end + 1, j, end + 1, j + 1, i, j + 1]);
            i = end;
          }
          continue;
        }
        poly.length = 0;
        cuts.length = 0;
        for (let c = 0; c < 4; c++) {
          const n = (c + 1) & 3;
          const inside = corner[c] > height;
          if (inside) poly.push(i + CX[c], j + CY[c]);
          if (inside !== corner[n] > height) {
            const t = (height - corner[c]) / (corner[n] - corner[c]);
            const x = i + CX[c] + t * (CX[n] - CX[c]);
            const y = j + CY[c] + t * (CY[n] - CY[c]);
            poly.push(x, y);
            cuts.push(x, y, inside ? 1 : 0);
          }
        }
        if (area) area(poly);
        /* Each place the boundary leaves the inside pairs with the next place it comes back in. */
        for (let c = 0; c < cuts.length; c += 3) {
          if (!cuts[c + 2]) continue;
          const n = (c + 3) % cuts.length;
          line(cuts[c], cuts[c + 1], cuts[n], cuts[n + 1]);
        }
      }
    }
  }

  /* Where things go for a canvas of width w: map and barcode side by side, or stacked on a narrow screen. */
  function layout(w) {
    const side = w >= 500;
    const wide = w >= 900; /* the figure has the whole sheet: a larger map, and room for longer bars */
    const size = side ? Math.min(wide ? 440 : 340, Math.round(w * 0.46), w - 285) : Math.min(340, w - 58);
    const map = { l: 40, t: 30, r: 40 + size, b: 30 + size };
    const pitch = wide ? 40 : side ? 18 : 13; /* wide: the nine bars stand as tall as the map beside them */
    const left = side ? map.r + (wide ? 72 : 44) : 26;
    const top = side ? map.t + 6 : map.b + 78;
    const bars = { l: left, t: top, r: Math.min(w - 16, left + (wide ? 560 : 380)), b: top + valleys.length * pitch + 10 };
    const legend = { x: side ? bars.l - 18 : 8, y: bars.b + 58, w: side ? w - bars.l + 10 : w - 16, rows: side ? 3 : 2 };
    const h = Math.max(side ? map.b + 46 : 0, legend.y + (legend.rows - 1) * 18 + 14);
    return { side, wide, size, map, pitch, bars, legend, h };
  }

  /*
   * The parts of the map that never change, drawn once for the current size: the tinted
   * high ground, and the contour lines on a clear sheet that is laid over the bias.
   */
  const still = { size: 0, dpr: 0, tint: document.createElement("canvas"), lines: document.createElement("canvas") };
  function prepare(L) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (still.size === L.size && still.dpr === dpr) return;
    still.size = L.size;
    still.dpr = dpr;
    const scale = L.size / N;
    const sheet = (el) => {
      el.width = Math.round(L.size * dpr);
      el.height = Math.round(L.size * dpr);
      const c = el.getContext("2d");
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      return c;
    };
    const g = sheet(still.tint);
    g.fillStyle = color.paper;
    g.fillRect(0, 0, L.size, L.size);
    /* Two pale steps of grey for the high ground, so valleys read as valleys. */
    [[12, color.wash], [24, color.rule]].forEach(([above, fill]) => {
      g.beginPath();
      march(V, above / KJ_PER_K, () => {}, (p) => {
        g.moveTo(p[0] * scale, L.size - p[1] * scale);
        for (let k = 2; k < p.length; k += 2) g.lineTo(p[k] * scale, L.size - p[k + 1] * scale);
        g.closePath();
      });
      g.fillStyle = fill;
      g.fill();
    });
    const contours = [];
    for (let e = CONTOUR_EVERY; e < kJ(2 * torsion(0)); e += CONTOUR_EVERY) {
      march(V, e / KJ_PER_K, (x0, y0, x1, y1) => {
        contours.push([x0 * scale, L.size - y0 * scale], [x1 * scale, L.size - y1 * scale], null);
      });
    }
    path(sheet(still.lines), contours, color.ink3, 0.8);
  }

  function drawMap(ctx, L) {
    const m = L.map;
    const scale = L.size / N;
    const X = (gi) => m.l + gi * scale;
    const Y = (gj) => m.b - gj * scale;
    ctx.drawImage(still.tint, m.l, m.t, L.size, L.size);

    /* The bias: flooded ground in maize, with an ink shoreline. The contours stay visible through it. */
    if (hills > 0) {
      const shore = new Path2D();
      ctx.beginPath();
      march(B, FLOODED, (x0, y0, x1, y1) => {
        shore.moveTo(X(x0), Y(y0));
        shore.lineTo(X(x1), Y(y1));
      }, (p) => {
        ctx.moveTo(X(p[0]), Y(p[1]));
        for (let k = 2; k < p.length; k += 2) ctx.lineTo(X(p[k]), Y(p[k + 1]));
        ctx.closePath();
      });
      ctx.fillStyle = color.maize;
      ctx.fill();
      ctx.drawImage(still.lines, m.l, m.t, L.size, L.size);
      ctx.lineWidth = 1.4;
      ctx.lineCap = "round";
      ctx.strokeStyle = color.ink;
      ctx.stroke(shore);
    } else {
      ctx.drawImage(still.lines, m.l, m.t, L.size, L.size);
    }

    const degrees = (v) => v + "°";
    axes(ctx, m, { x: [0, 360], y: [0, 360], xTicks: [0, 60, 180, 300, 360], yTicks: [0, 60, 180, 300, 360], xFormat: degrees, yFormat: degrees, grid: false, xLabel: "first dihedral angle" });
    rule(ctx, m.l, m.t + 0.5, m.r + 1, m.t + 0.5, color.ink);
    rule(ctx, m.r + 0.5, m.t, m.r + 0.5, m.b + 1, color.ink);
    text(ctx, "second dihedral angle", m.l, m.t - 14, { font: font.label, color: color.ink });

    /* The nine minima, numbered as in the barcode; drawn in full ink once the walker has been there. */
    valleys.forEach((v, k) => {
      dot(ctx, X(v.i), Y(v.j), 7.5, color.paper, seen[k] ? color.ink : color.ink3, seen[k] ? 1.4 : 1);
      text(ctx, String(k + 1), X(v.i), Y(v.j) + 0.5, { align: "center", color: seen[k] ? color.ink : color.ink3 });
    });

    /* The walker and where it has just been. */
    ctx.fillStyle = "rgba(18, 22, 28, 0.38)";
    for (let k = 0; k < trail.length - 2; k += 2) ctx.fillRect(X(trail[k]) - 0.8, Y(trail[k + 1]) - 0.8, 1.6, 1.6);
    dot(ctx, X(px / H), Y(py / H), 5, color.ink, color.paper, 2);
  }

  function drawBarcode(ctx, L) {
    const b = L.bars;
    const thick = L.wide ? 14 : L.side ? 8 : 7;
    const tickLabel = (v) => (v === 0 ? "0" : v.toFixed(1));
    text(ctx, "barcode: one bar for each valley", b.l - 18, b.t - 20, { font: font.note, color: color.ink });
    energies.forEach((e) => {
      const x = Math.round(b.l + (e / E_MAX) * (b.r - b.l)) + 0.5;
      if (e > 0) rule(ctx, x, b.t, x, b.b, color.rule);
    });
    const { X } = axes(ctx, b, { x: [0, E_MAX], y: [0, 1], xTicks: energies, yTicks: [], xFormat: tickLabel, grid: false, xLabel: "energy (kJ/mol)" });

    valleys.forEach((v, k) => {
      const y = Math.round(b.t + 7 + k * L.pitch) + 0.5;
      const x0 = Math.round(X(kJ(v.birth))) + 0.5;
      const open = v.death === Infinity;
      const x1 = open ? b.r - 7 : Math.round(X(kJ(v.death))) + 0.5;
      const front = Math.max(x0, Math.min(x1, X(kJ(level[k]))));
      ctx.fillStyle = color.paper;
      ctx.fillRect(x0, y, x1 - x0, thick);
      if (front > x0 + 0.5) {
        ctx.fillStyle = color.maize;
        ctx.fillRect(x0, y, front - x0, thick);
        rule(ctx, front, y, front, y + thick, color.ink);
      }
      /* A bar that ends is a closed box. The deepest valley never merges: its bar stays open and runs on. */
      path(ctx, open ? [[x1, y], [x0, y], [x0, y + thick], [x1, y + thick]] : [[x0, y], [x1, y], [x1, y + thick], [x0, y + thick], [x0, y]], color.ink, 1);
      if (open) {
        ctx.beginPath();
        ctx.moveTo(b.r + 1, y + thick / 2);
        ctx.lineTo(x1, y - 2.5);
        ctx.lineTo(x1, y + thick + 2.5);
        ctx.closePath();
        ctx.fillStyle = color.ink;
        ctx.fill();
      }
      text(ctx, String(k + 1), b.l - 8, y + thick / 2, { align: "right", color: k === here ? color.ink : color.ink3 });
      if (k === here) dot(ctx, front, y + thick / 2, 3.2, color.ink, color.paper, 1.4);
    });
  }

  function drawLegend(ctx, L) {
    const items = [
      ["bias added", (x, y) => {
        ctx.fillStyle = color.maize;
        ctx.fillRect(x + 1.5, y - 5.5, 11, 11);
        ctx.lineWidth = 1;
        ctx.strokeStyle = color.ink;
        ctx.strokeRect(x + 1.5, y - 5.5, 11, 11);
      }],
      ["walker", (x, y) => dot(ctx, x + 7, y, 4.2, color.ink)],
      ["energy contours, " + CONTOUR_EVERY + " kJ/mol apart", (x, y) => rule(ctx, x, y + 0.5, x + 14, y + 0.5, color.ink3)],
    ];
    let x = L.legend.x;
    let y = L.legend.y;
    ctx.font = font.note;
    items.forEach(([label, swatch]) => {
      const width = 22 + ctx.measureText(label).width;
      if (x > L.legend.x && x + width > L.legend.x + L.legend.w) {
        x = L.legend.x;
        y += 18;
      }
      swatch(x, y);
      text(ctx, label, x + 22, y + 0.5, { font: font.note, color: color.ink2 });
      x += width + 18;
    });
  }

  const stage = canvas(root.querySelector("canvas"), (w) => layout(w).h, (ctx, w) => {
    const L = layout(w);
    prepare(L);
    drawMap(ctx, L);
    drawBarcode(ctx, L);
    drawLegend(ctx, L);
  });

  /* Running by itself ------------------------------------------------------------ */

  function frame() {
    measure();
    stage.redraw();
  }

  /* When every valley has been found the picture holds for a moment, then the landscape is emptied and it starts again. */
  let held = 0;
  const loop = run(root.querySelector("canvas"), (dt) => {
    if (found === valleys.length) {
      held += dt;
      if (held > 4.5) {
        held = 0;
        reset();
      }
    }
    owed += dt * STEPS_PER_SECOND;
    const count = Math.min(16, Math.floor(owed));
    owed -= count;
    if (count > 0) advance(count);
    frame();
  });

  /* Click or tap the map to set the walker down somewhere else. */
  const sheet = root.querySelector("canvas");
  const onMap = (e, L) => {
    const r = sheet.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    return x >= L.map.l && x <= L.map.r && y >= L.map.t && y <= L.map.b ? [x, y] : null;
  };
  sheet.addEventListener("pointermove", (e) => {
    sheet.style.cursor = onMap(e, layout(stage.w)) ? "crosshair" : "";
  });
  sheet.addEventListener("pointerdown", (e) => {
    const L = layout(stage.w);
    const at = onMap(e, L);
    if (!at) return;
    const [x, y] = at;
    px = wrap(((x - L.map.l) / L.size) * TAU);
    py = wrap(((L.map.b - y) / L.size) * TAU);
    trail.length = 0;
    frame();
  });

  /* The same barcode as a table. */
  const table = root.querySelector("[data-table]");
  if (table) {
    const el = document.createElement("table");
    el.innerHTML = "<thead><tr><th scope=\"col\">Valley</th><th scope=\"col\">Angles (°)</th><th scope=\"col\">Starts (kJ/mol)</th><th scope=\"col\">Ends (kJ/mol)</th></tr></thead>";
    const body = el.appendChild(document.createElement("tbody"));
    valleys.forEach((v, k) => {
      const tr = body.appendChild(document.createElement("tr"));
      tr.appendChild(document.createElement("th")).textContent = String(k + 1);
      tr.lastChild.scope = "row";
      [Math.round((v.i * 360) / N) + ", " + Math.round((v.j * 360) / N), kJ(v.birth).toFixed(1), v.death === Infinity ? "never" : kJ(v.death).toFixed(1)].forEach((cell) => {
        tr.appendChild(document.createElement("td")).textContent = cell;
      });
    });
    table.replaceChildren(el);
  }

  reset();
  /* Where motion is reduced the figure stays still, so show it part way: the first valleys filled and left. */
  if (loop.paused) for (let k = 0; k < 600 && found < 3; k++) advance(40);
  frame();
})();
