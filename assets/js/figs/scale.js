/*
 * Research, "From 100 atoms to 100,000".
 *
 * A re-plot of published values. Nothing here is modelled, fitted, or smoothed.
 *
 * (a) For four machine-learned interatomic potentials for molten salts: the
 * number of atoms in the first-principles runs behind each potential (its
 * training or reference data), the number of atoms in the runs made with the
 * learned potential, how long those runs were, and the force error each paper
 * reports. One paper also reports a measured speed-up.
 * (b) For molten FLiNaK: the relative squared error in the forces, against
 * first-principles forces, of a classical model, the same model refitted, and
 * the neural network.
 *
 * Sources:
 *   S.-C. Lee, Y. Zhai, Z. Li, N. P. Walter, M. Rose, B. J. Heuser, and Y Z,
 *   J. Phys. Chem. B 125, 10562 (2021), doi:10.1021/acs.jpcb.1c05608 (FLiNaK).
 *   S.-C. Lee and Y Z, J. Chem. Phys. 161, 044502 (2024),
 *   doi:10.1063/5.0215370 (zinc chloride).
 *   L. Murg, S.-C. Lee, V. F. Grizzi, and Y Z, J. Appl. Phys. 137, 064701
 *   (2025), doi:10.1063/5.0244036 (LiF-NaF).
 *   V. F. Grizzi, B. Nebgen, and Y Z, Phys. Rev. Mater. 10, 065606 (2026),
 *   doi:10.1103/4dsc-6432 (LiF-NaF with ThF4).
 *
 * The four force errors are different measures (relative squared, root mean
 * square, mean absolute) and are printed as each paper gives them; they are not
 * put on a common axis. The spreads of the FLiNaK errors are larger than their
 * means, so panel (b) plots the means and the table carries the spreads.
 */
(() => {
  "use strict";

  const root = document.querySelector('[data-fig="scale"]');
  if (!root || !window.ZFig) return;
  const { color, font, canvas, axes, path, dot, text, rule } = window.ZFig;

  const PAPERS = [
    {
      salt: "FLiNaK",
      cite: "Lee et al. 2021",
      first: 100 /* atoms, first-principles runs: Lee et al. 2021, Methods (50 F, 23 Li, 6 Na, 21 K) */,
      learned: [{ atoms: 10000, time: "1 ns" }] /* Lee et al. 2021, Methods: 10,000 atoms, 1 ns of production */,
      faster: 2140 /* Lee et al. 2021, Results: about 2140 times faster than first principles on one 12-core node */,
      error: "force error 0.0043, relative squared" /* Lee et al. 2021, Table 2 */,
      rows: [
        ["First principles", "100 atoms, 34.5 ps in total"] /* Methods: five runs, 34.5 ps of production in total */,
        ["Learned potential", "10,000 atoms, 1 ns"],
        ["Speed-up", "about 2140 times"],
        ["Force error, relative squared: classical model", "1.17 ± 3.61"] /* Table 2, Tosi-Fumi model */,
        ["Force error: classical model, refitted", "0.065 ± 0.20"] /* Table 2, refitted with the least-squares loss */,
        ["Force error: neural network", "0.0043 ± 0.012"] /* Table 2 */,
        ["Energy error, relative squared: classical model", "0.0059 ± 0.0003"] /* Table 2 */,
        ["Energy error: classical model, refitted", "0.094 ± 0.0004"] /* Table 2, least-squares loss */,
        ["Energy error: neural network", "below 0.001"] /* Table 2 */,
      ],
    },
    {
      salt: "ZnCl₂",
      cite: "Lee and Z 2024",
      first: 108 /* atoms: Lee and Z 2024, Methods (36 Zn, 72 Cl) */,
      learned: [{ atoms: 2916, time: "6 ns" }] /* Lee and Z 2024, Methods: 2916 atoms, production runs of 6 ns */,
      error: "force error 0.0697 eV/Å, root mean square" /* Lee and Z 2024, Methods: final errors of the force field */,
      rows: [
        ["First principles", "108 atoms"],
        ["Learned potential", "2,916 atoms, 6 ns, longer at the lowest temperatures"],
        ["Force error, root mean square", "0.0697 eV/Å"],
        ["Energy error, root mean square", "0.00139 eV/atom"] /* same sentence of the Methods */,
      ],
    },
    {
      salt: "LiF-NaF",
      cite: "Murg et al. 2025",
      first: 100 /* atoms: Murg et al. 2025, Methods, all three first-principles data sets */,
      /* Murg et al. 2025, Methods: 800 atoms for structure and dynamics; 2400 atoms for thermal conductivity, 400 ps with heat exchange */
      learned: [{ atoms: 800 }, { atoms: 2400, time: "400 ps" }],
      error: "force error 15.679 meV/Å, mean absolute" /* Murg et al. 2025, Table II */,
      rows: [
        ["First principles", "100 atoms, 4 ps each for training"],
        ["Learned potential", "800 atoms, 200 ps analyzed; 2,400 atoms, 400 ps with heat exchange"],
        ["Force error, mean absolute", "15.679 meV/Å"],
        ["Energy error, mean absolute", "1.186 meV/atom"] /* Table II */,
      ],
    },
    {
      salt: "LiF-NaF-ThF₄",
      cite: "Grizzi et al. 2026",
      first: 100 /* atoms, reference first-principles runs: Grizzi et al. 2026, Methods */,
      learned: [{ atoms: 100000, time: "400 ps" }] /* Grizzi et al. 2026, Methods: 100,000 atoms, 400 ps */,
      error: "force error 0.153 eV/Å, root mean square" /* Grizzi et al. 2026, Table I, final model (iteration 136) */,
      rows: [
        ["First principles", "100 atoms; labels on cells of 100 to 120 atoms"],
        ["Learned potential", "100,000 atoms, 400 ps"],
        ["Force error, root mean square", "0.153 eV/Å"],
        ["Atomic-energy error, root mean square", "0.0038 eV"] /* Table I, iteration 136 */,
      ],
    },
  ];

  /* Relative squared error in the forces for molten FLiNaK: Lee et al. 2021, Table 2 (means). */
  const MODELS = [
    { name: "classical model", error: 1.17 },
    { name: "classical, refitted", error: 0.065 },
    { name: "neural network", error: 0.0043, learned: true },
  ];

  const strong = '600 12px "IBM Plex Sans", system-ui, sans-serif';
  const count = (n) => n.toLocaleString("en-US");

  /* Where things go for a canvas of width w: names beside the plots, or above them on a narrow screen. */
  function layout(w) {
    const side = w >= 520;
    const l = side ? 150 : 16;
    const r = w - (side ? 28 : 26);
    const pitchA = side ? 62 : 84;
    const topA = side ? 34 : 50;
    const bottomA = topA + PAPERS.length * pitchA;
    const pitchB = side ? 26 : 36;
    const topB = bottomA + (side ? 84 : 92);
    const bottomB = topB + MODELS.length * pitchB + 2;
    return { side, l, r, pitchA, topA, bottomA, pitchB, topB, bottomB, h: bottomB + 44 };
  }

  /* A logarithmic axis along the bottom of a panel. It has no vertical axis: the rows are a list, not a scale. */
  function axis(ctx, L, bottom, options) {
    return axes(ctx, { l: L.l, r: L.r, t: bottom - 5, b: bottom }, Object.assign({ y: [0, 1], yTicks: [], xLog: true, grid: false }, options)).X;
  }

  /* Faint marks at the ticks beside a row, so every row reads against the same axis. */
  function marks(ctx, X, values, y) {
    values.forEach((v) => rule(ctx, Math.round(X(v)) + 0.5, y - 8, Math.round(X(v)) + 0.5, y + 8, color.ruleStrong));
  }

  function width(ctx, str, fontSpec) {
    ctx.font = fontSpec;
    return ctx.measureText(str).width;
  }

  /* (a) Atoms in the first-principles runs and in the runs with the learned potential. */
  function drawSizes(ctx, L, w) {
    const decades = [100, 1000, 10000, 100000];
    const X = axis(ctx, L, L.bottomA, { x: [50, 200000], xTicks: decades, xFormat: count, xLabel: "atoms in the simulation box" });

    /* The panel letter, then what the two kinds of dot are. */
    text(ctx, "a", 0, 12, { font: strong, color: color.ink });
    let lx = 18;
    let ly = 12;
    [["first-principles run", false], ["run with the learned potential", true]].forEach(([label, learned]) => {
      const span = 20 + width(ctx, label, font.note);
      if (lx > 18 && lx + span > w) {
        lx = 18;
        ly += 18;
      }
      dot(ctx, lx + 7, ly, learned ? 5.5 : 4.5, learned ? color.maize : color.paper, color.ink, 1.4);
      text(ctx, label, lx + 20, ly + 0.5, { font: font.note, color: color.ink2 });
      lx += span + 20;
    });

    PAPERS.forEach((p, k) => {
      const y0 = L.topA + k * L.pitchA;
      const yNumbers = y0 + (L.side ? 8 : 26);
      const yLine = yNumbers + (L.side ? 17 : 15);
      const yError = yLine + 18;
      if (L.side) {
        text(ctx, p.salt, 0, yLine - 8, { font: strong, color: color.ink });
        text(ctx, p.cite, 0, yLine + 9, { font: font.note, color: color.ink3 });
      } else {
        text(ctx, p.salt, 0, y0 + 8, { font: strong, color: color.ink });
        text(ctx, p.cite, width(ctx, p.salt, strong) + 10, y0 + 8, { font: font.note, color: color.ink3 });
      }

      marks(ctx, X, decades, yLine);
      const xFirst = X(p.first);
      path(ctx, [[xFirst, yLine], [X(p.learned[p.learned.length - 1].atoms), yLine]], color.ink, 1.6);
      text(ctx, count(p.first), xFirst, yNumbers, { align: "center", color: color.ink });
      dot(ctx, xFirst, yLine, 4.5, color.paper, color.ink, 1.4);
      let free = xFirst + 18; /* the labels over the line must not run into one another */
      p.learned.forEach((run) => {
        const x = X(run.atoms);
        const label = count(run.atoms) + (run.time ? " for " + run.time : "");
        const span = width(ctx, label, font.mono);
        const start = run.time ? Math.min(x - 6, w - 2 - span) : x - span / 2;
        text(ctx, label, start, yNumbers, { color: color.ink });
        dot(ctx, x, yLine, 5.5, color.maize, color.ink, 1.4);
        /* The one measured speed-up is written over the line it belongs to, in fewer characters on a narrow screen. */
        const faster = [p.faster + " times faster", p.faster + "× faster"].find((words) => start - free > width(ctx, words, font.note) + 12);
        if (p.faster && faster) text(ctx, faster, (free + start) / 2, yNumbers, { font: font.note, color: color.ink2, align: "center" });
        free = start + span + 8;
      });
      text(ctx, p.error, L.side ? xFirst - 5 : 0, yError, { font: font.note, color: color.ink2 });
    });
  }

  /* (b) Force error of three models of one salt, all measured the same way. */
  function drawErrors(ctx, L) {
    const ticks = [0.001, 0.01, 0.1, 1, 10];
    const X = axis(ctx, L, L.bottomB, { x: [0.001, 10], xTicks: ticks, xFormat: String, xLabel: "relative squared error in the forces" });
    text(ctx, "b", 0, L.topB - 26, { font: strong, color: color.ink });
    text(ctx, "three models of molten FLiNaK", 18, L.topB - 25.5, { font: font.note, color: color.ink2 });

    MODELS.forEach((m, k) => {
      const y0 = L.topB + k * L.pitchB;
      const y = y0 + (L.side ? 13 : 25);
      const x = X(m.error);
      text(ctx, m.name, 0, L.side ? y : y0 + 8, { font: font.note, color: color.ink });
      marks(ctx, X, ticks, y);
      rule(ctx, L.l, y + 0.5, x, y + 0.5, color.ruleStrong);
      dot(ctx, x, y, m.learned ? 5.5 : 4.5, m.learned ? color.maize : color.ink, m.learned ? color.ink : color.paper, 1.4);
      /* The value sits on the row, so clear the tick marks from under it. */
      ctx.fillStyle = color.paper;
      ctx.fillRect(x + 8, y - 8, width(ctx, String(m.error), font.mono) + 7, 17);
      text(ctx, String(m.error), x + 11, y, { color: color.ink });
    });
  }

  canvas(root.querySelector("canvas"), (w) => layout(w).h, (ctx, w) => {
    const L = layout(w);
    drawSizes(ctx, L, w);
    drawErrors(ctx, L);
  }).redraw();

  /* The same values as a table, salt by salt. */
  const table = root.querySelector("[data-table]");
  if (table) {
    const el = document.createElement("table");
    PAPERS.forEach((p) => {
      const body = el.appendChild(document.createElement("tbody"));
      const head = body.appendChild(document.createElement("tr")).appendChild(document.createElement("th"));
      head.colSpan = 2;
      head.scope = "rowgroup";
      head.appendChild(document.createElement("b")).textContent = p.salt;
      head.append(", " + p.cite);
      p.rows.forEach(([name, value]) => {
        const tr = body.appendChild(document.createElement("tr"));
        tr.appendChild(document.createElement("th")).textContent = name;
        tr.lastChild.scope = "row";
        tr.appendChild(document.createElement("td")).textContent = value;
      });
    });
    table.replaceChildren(el);
  }
})();
