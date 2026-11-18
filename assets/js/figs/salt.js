/*
 * Research, "A pinch of fission product in a reactor salt".
 *
 * Panel a, a model: the self-diffusivity of the ions in molten eutectic
 * 7LiF-NaF-KF (FLiNaK), pure and with a little cesium, zirconium, or cerium
 * fluoride, drawn from the Arrhenius law D = D0 exp(-Ea / kT) with the four
 * fitted parameter pairs of Table 3 of G. S. Rakib, S.-C. Lee, M. A. Rose,
 * R. Mills, D. Pajerowski, Y Z, and B. J. Heuser, ACS Appl. Energy Mater. 8,
 * 3638 (2025). The law is the paper's and so are the parameters; the browser
 * only evaluates it. The paper measured at 500, 580, 670, and 750 C by
 * quasi-elastic neutron scattering. Its diffusivities at those temperatures
 * are published only as a plot, so no measured point is drawn: only the
 * fitted lines, and only across the measured range. The prefactors D0 carry
 * large uncertainties (they are listed in the table under the figure).
 *
 * Panel b, a re-plot of published values: the thermal conductivity of molten
 * eutectic LiF-NaF with and without 9.1 mol % ThF4 at six temperatures, from
 * molecular dynamics with a machine-learned potential. Source: Table III of
 * V. F. Grizzi, B. Nebgen, and Y Z, Phys. Rev. Mater. 10, 065606 (2026). The
 * twelve values and their uncertainties are joined by straight segments. No
 * fit is drawn and nothing is smoothed.
 *
 * Nothing here is illustration. The two panels are different base salts and
 * share no axis.
 */
(() => {
  "use strict";

  const root = document.querySelector('[data-fig="salt"]');
  if (!root || !window.ZFig) return;
  const { color, font, canvas, axes, path, dot, text, rule, pointer } = window.ZFig;

  const K_B = 8.617333e-5; /* Boltzmann constant in eV/K, a physical constant */
  const ZERO_C = 273.15;

  /*
   * Rakib et al. 2025, Table 3: Arrhenius fits to the diffusivity measured from 500 to 750 C.
   * ea is the activation energy in eV/atom and d0 the prefactor in cm2/s, each with its
   * published uncertainty. The additive amounts (mol %, total-atom basis) are from Table 1.
   */
  const SALTS = [
    { id: "pure", tag: "pure", name: "pure salt", sample: "None (pure salt)", ea: 0.77, eaErr: 0.02, d0: 0.29, d0Err: 0.17 },
    { id: "cs", tag: "+ Cs", name: "with Cs", sample: "0.499 mol % Cs", ea: 0.71, eaErr: 0.03, d0: 0.13, d0Err: 0.55 },
    { id: "zr", tag: "+ Zr", name: "with Zr", sample: "1.21 mol % Zr", ea: 0.88, eaErr: 0.01, d0: 0.35, d0Err: 0.1 },
    { id: "ce", tag: "+ Ce", name: "with Ce", sample: "0.988 mol % Ce", ea: 1.02, eaErr: 0.02, d0: 2.88, d0Err: 0.01 },
  ];
  const T_MEASURED = [500, 580, 670, 750]; /* C: the four temperatures of the experiment (Rakib et al. 2025, methods) */
  const T_LOW = T_MEASURED[0];
  const T_HIGH = T_MEASURED[3];

  /*
   * Grizzi, Nebgen, and Z 2026, Table III: thermal conductivity in W m-1 K-1.
   * [temperature (K), pure LiF-NaF, its uncertainty, LiF-NaF with 9.1 mol % ThF4, its uncertainty]
   */
  const KAPPA = [
    [973, 1.273, 0.005, 1.1, 0.022],
    [1073, 1.247, 0.013, 1.08, 0.023],
    [1173, 1.243, 0.005, 1.064, 0.017],
    [1273, 1.197, 0.013, 1.034, 0.033],
    [1373, 1.183, 0.013, 0.998, 0.021],
    [1473, 1.137, 0.005, 0.952, 0.016],
  ];

  /* The paper's law (Rakib et al. 2025, methods): D = D0 exp(-Ea / kT), with T in kelvin. */
  const diffusivity = (s, tC) => s.d0 * Math.exp(-s.ea / (K_B * (tC + ZERO_C)));
  const inverse = (tC) => 1000 / (tC + ZERO_C);

  const superscript = (n) => String(n).replace(/-/g, "⁻").replace(/\d/g, (d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[d]);
  /* Two significant figures, as 1.0 × 10⁻⁵. */
  function scientific(v) {
    let e = Math.floor(Math.log10(v));
    let m = (v / Math.pow(10, e)).toFixed(1);
    if (m === "10.0") {
      m = "1.0";
      e += 1;
    }
    return m + " × 10" + superscript(e);
  }

  const strong = font.note.replace("12px", "600 12px");
  const panelTag = font.note.replace("12px", "600 13px");

  const slider = root.querySelector("[data-pick]");
  const tempOut = root.querySelector("[data-temp-out]");
  const values = root.querySelector("[data-values]");
  const buttons = Array.from(root.querySelectorAll("[data-salt]"));
  let picked = SALTS.findIndex((s) => s.id === "ce");
  let temp = 580;

  /* Nudges labels apart until neighbours are at least `gap` pixels from each other. */
  function spread(items, gap) {
    items.sort((a, b) => a.y - b.y);
    for (let pass = 0; pass < 12; pass++) {
      for (let i = 1; i < items.length; i++) {
        const overlap = items[i - 1].y + gap - items[i].y;
        if (overlap > 0) {
          items[i - 1].y -= overlap / 2;
          items[i].y += overlap / 2;
        }
      }
    }
    return items;
  }

  /* Panel a: the four Arrhenius lines. Temperature runs left to right on a 1/T scale, so each law is a straight line. */
  const boxA = (w, h) => ({ l: 50, t: 16, r: w - 46, b: h - 44 });
  const rangeA = [inverse(490), inverse(T_HIGH)];
  const diffusionCanvas = root.querySelector('[data-panel="diffusion"]');

  const stageA = canvas(diffusionCanvas, (w) => (w < 480 ? 300 : 340), (ctx, w, h) => {
    const box = boxA(w, h);
    const { X, Y } = axes(ctx, box, {
      x: rangeA,
      y: [4e-7, 2.5e-4],
      yLog: true,
      xTicks: T_MEASURED.map(inverse),
      xFormat: (v) => String(Math.round(1000 / v - ZERO_C)),
      xLabel: "temperature (°C), spaced as 1/T",
      yLabel: "self-diffusivity (cm²/s)",
    });
    text(ctx, "a", 0, box.t + 2, { font: panelTag, color: color.ink, baseline: "top" });

    const chosen = SALTS[picked];
    const pure = SALTS[0];
    const xt = X(inverse(temp));
    rule(ctx, Math.round(xt) + 0.5, box.t + 26, Math.round(xt) + 0.5, box.b, color.ruleStrong);

    const line = (s) => [T_LOW, T_HIGH].map((t) => [X(inverse(t)), Y(diffusivity(s, t))]);
    for (const s of SALTS) {
      if (s !== chosen) path(ctx, line(s), s === pure ? color.ink : color.ink3, s === pure ? 1.6 : 1.2);
    }
    path(ctx, line(chosen), color.ink, 5.4);
    path(ctx, line(chosen), color.maize, 2.8);

    const labels = spread(SALTS.map((s) => ({ s, y: Y(diffusivity(s, T_HIGH)) })), 15);
    for (const { s, y } of labels) {
      text(ctx, s.tag, box.r + 10, y, { font: s === chosen ? strong : font.note, color: s === chosen || s === pure ? color.ink : color.ink3 });
    }

    if (chosen !== pure) dot(ctx, xt, Y(diffusivity(pure, temp)), 3.5, color.ink, color.paper, 1.4);
    dot(ctx, xt, Y(diffusivity(chosen, temp)), 6, color.maize, color.ink, 1.4);
  });

  /* Panel b: thermal conductivity of a different salt, LiF-NaF, with and without thorium fuel. */
  canvas(root.querySelector('[data-panel="fuel"]'), (w) => (w < 480 ? 230 : 250), (ctx, w, h) => {
    const box = { l: 50, t: 16, r: w - 14, b: h - 44 };
    const yTicks = [0.9, 1, 1.1, 1.2, 1.3];
    const { X, Y } = axes(ctx, box, {
      x: [940, 1500],
      y: [0.9, 1.4],
      xTicks: KAPPA.map((row) => row[0]),
      yTicks,
      yFormat: (v) => v.toFixed(1),
      xLabel: "temperature (K)",
      yLabel: "thermal conductivity (W m⁻¹ K⁻¹)",
    });
    text(ctx, "b", 0, box.t + 2, { font: panelTag, color: color.ink, baseline: "top" });

    const series = (col, fill) => {
      path(ctx, KAPPA.map((row) => [X(row[0]), Y(row[col])]), color.ink, 1.6);
      for (const row of KAPPA) {
        const x = Math.round(X(row[0])) + 0.5;
        const top = Y(row[col] + row[col + 1]);
        const bottom = Y(row[col] - row[col + 1]);
        rule(ctx, x, top, x, bottom, color.ink, 1.2);
        rule(ctx, x - 3, top, x + 3, top, color.ink, 1.2);
        rule(ctx, x - 3, bottom, x + 3, bottom, color.ink, 1.2);
        dot(ctx, X(row[0]), Y(row[col]), 4, fill, fill === color.ink ? color.paper : color.ink, 1.4);
      }
    };
    series(1, color.ink);
    series(3, color.paper);

    /* Each series is named where the plot is empty: above the right end of one, below the left end of the other. */
    const step = X(KAPPA[1][0]) - X(KAPPA[0][0]);
    const clear = (y, away) => yTicks.reduce((at, v) => (Math.abs(Y(v) - at) < 9 ? Y(v) + away * 10 : at), y); /* keeps a label off the gridlines */
    ctx.font = font.note;
    const right = X(KAPPA[5][0]) + 5;
    const reach = right - ctx.measureText("pure LiF-NaF").width - step;
    const roof = Math.min(...KAPPA.filter((row) => X(row[0]) >= reach).map((row) => Y(row[1] + row[2])));
    text(ctx, "pure LiF-NaF", right, clear(roof - 12, -1), { font: font.note, color: color.ink, align: "right" });
    const left = X(KAPPA[0][0]) - 5;
    const span = left + ctx.measureText("with 9.1 mol % ThF₄").width + step;
    const floor = Math.max(...KAPPA.filter((row) => X(row[0]) <= span).map((row) => Y(row[3] - row[4])));
    text(ctx, "with 9.1 mol % ThF₄", left, clear(floor + 13, 1), { font: font.note, color: color.ink });
  });

  function part(label, value) {
    const span = document.createElement("span");
    span.append(label + " ");
    window.ZFig.label(span.appendChild(document.createElement("b")), value);
    return span;
  }

  function show() {
    const s = SALTS[picked];
    const d = diffusivity(s, temp);
    const pure = diffusivity(SALTS[0], temp);
    const parts = [[s.name, scientific(d) + " cm²/s"]];
    if (s !== SALTS[0]) parts.push(["pure salt", scientific(pure) + " cm²/s"], ["ratio to pure", (d / pure).toPrecision(2)]);
    parts.push(["barrier", s.ea.toFixed(2) + " ± " + s.eaErr.toFixed(2) + " eV"]);
    if (values) values.replaceChildren(...parts.map((p) => part(p[0], p[1])));
    if (tempOut) tempOut.textContent = temp + " °C";
    if (slider) {
      slider.value = String(temp);
      slider.setAttribute("aria-valuetext", temp + " °C: " + parts.map((p) => p.join(" ")).join(", "));
    }
    for (const b of buttons) b.setAttribute("aria-pressed", String(b.dataset.salt === s.id));
    stageA.redraw();
  }

  if (slider) {
    slider.min = String(T_LOW);
    slider.max = String(T_HIGH);
    slider.addEventListener("input", () => {
      temp = Number(slider.value);
      show();
    });
  }
  for (const b of buttons) {
    b.addEventListener("click", () => {
      picked = Math.max(0, SALTS.findIndex((s) => s.id === b.dataset.salt));
      show();
    });
  }
  pointer(diffusionCanvas, {
    move: (x) => {
      const box = boxA(stageA.w, stageA.h);
      const at = rangeA[0] + ((x - box.l) / (box.r - box.l)) * (rangeA[1] - rangeA[0]);
      const t = Math.max(T_LOW, Math.min(T_HIGH, Math.round((1000 / at - ZERO_C) / 5) * 5));
      if (t !== temp) {
        temp = t;
        show();
      }
    },
  });

  /* The same numbers as tables. */
  function table(host, head, rows) {
    if (!host) return;
    const el = document.createElement("table");
    el.innerHTML = "<thead><tr>" + head.map((h) => "<th scope=\"col\">" + h + "</th>").join("") + "</tr></thead>";
    const body = el.appendChild(document.createElement("tbody"));
    for (const row of rows) {
      const tr = body.appendChild(document.createElement("tr"));
      row.forEach((cell, i) => {
        tr.appendChild(document.createElement(i ? "td" : "th")).textContent = cell;
        if (!i) tr.lastChild.scope = "row";
      });
    }
    host.replaceChildren(el);
  }
  table(
    root.querySelector('[data-table="fits"]'),
    ["Additive", "E<sub>a</sub> (eV/atom)", "D<sub>0</sub> (cm²/s)"],
    SALTS.map((s) => [s.sample, s.ea.toFixed(2) + " ± " + s.eaErr.toFixed(2), s.d0.toFixed(2) + " ± " + s.d0Err.toFixed(2)])
  );
  table(
    root.querySelector('[data-table="kappa"]'),
    ["Temperature (K)", "Pure LiF-NaF", "With 9.1 mol % ThF₄"],
    KAPPA.map((row) => [String(row[0]), row[1].toFixed(3) + " ± " + row[2].toFixed(3), row[3].toFixed(3) + " ± " + row[4].toFixed(3)])
  );

  show();
})();
