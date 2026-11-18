/*
 * Softer when charged: how crowding raises the viscosity and caps the conductivity of a
 * flow-battery electrolyte, and why the discharged fluid meets that wall first.
 *
 * Source: H. Farag, A. P. Kaur, L. A. Robertson, E. Sarnello, X. Liu, Y. Wang, L. Cheng,
 * I. A. Shkrob, L. Zhang, R. H. Ewoldt, T. Li, S. A. Odom, and Y Z, "Softening by charging:
 * how collective modes of ionic association in concentrated redoxmer electrolyte solutions
 * define the structural and dynamic properties in different states of charge",
 * Phys. Chem. Chem. Phys. 25, 4243 (2023), DOI 10.1039/d2cp04220g.
 *
 * Published values: the Huggins fits to the measured viscosity (the paper's Table 1:
 * intrinsic viscosity, Huggins coefficient, and the concentration up to which each fit
 * was made) and the concentrations of maximum conductivity the paper predicts from them.
 *
 * The paper's equations, run in the browser: the Huggins equation for the viscosity, and
 * the conductivity that follows from combining the Nernst-Einstein and Stokes-Einstein
 * relations, which is proportional to concentration divided by viscosity. Its prefactor
 * depends on ion sizes that do not matter for where the peak sits, so each conductivity
 * curve is drawn as a share of its own maximum and the two heights cannot be compared.
 *
 * Nothing here is a measured point: the measured values are published only as plots.
 * Beyond the fitted range the curves are extrapolations and are drawn dashed.
 */
(() => {
  "use strict";
  const root = document.querySelector('[data-fig="charge"]');
  if (!root || !window.ZFig) return;
  const { canvas, axes, path, dot, text, rule, pointer, label, color, font } = window.ZFig;

  /* Table 1 of Farag et al. 2023, fits to the measured viscosity. eta is the intrinsic
     viscosity in L/mol, kH the Huggins coefficient, fitTo the upper limit of the fit in
     mol/L, and peak the concentration of maximum conductivity the paper predicts (mol/L). */
  const STATES = [
    { key: "discharged", name: "discharged", what: "the neutral molecule with a lithium salt", eta: 0.42, kH: 16.92, fitTo: 0.75, peak: 0.57 },
    { key: "charged", name: "charged", what: "the molecule's radical cation salt", eta: 0.19, kH: 55.16, fitTo: 0.75, peak: 0.73 },
  ];
  /* The same fits to the simulated viscosity (Table 1), for the table view only. */
  const SIMULATED = [
    { name: "discharged, simulated", eta: 0.5, kH: 20.45, fitTo: 0.92, peak: 0.44 },
    { name: "charged, simulated", eta: 0.44, kH: 12.06, fitTo: 0.7, peak: 0.66 },
  ];
  const C_MIN = 0.05;
  const C_MAX = 1.2; /* how far the curves are drawn; the fits themselves end at 0.75 mol/L */

  /* Huggins equation: viscosity over the solvent's viscosity. */
  const viscosity = (s, c) => 1 + s.eta * c + s.kH * (s.eta * c) ** 2;
  /* Nernst-Einstein with Stokes-Einstein: conductivity is proportional to c / viscosity. That
     ratio is largest at 1 / (eta * sqrt(kH)), which gives 0.58 and 0.71 mol/L from the rounded
     parameters above; the paper prints 0.57 and 0.73, and those are the values marked. */
  const share = (s, c) => {
    const top = 1 / (s.eta * Math.sqrt(s.kH));
    return c / viscosity(s, c) / (top / viscosity(s, top));
  };

  let picked = 0;
  let conc = 0.6;
  let panels = []; /* [{ l, r, X }] for the pointer */
  const slider = root.querySelector("[data-pick]");
  const concOut = root.querySelector("[data-conc-out]");
  const values = root.querySelector("[data-values]");
  const buttons = Array.from(root.querySelectorAll("[data-state]"));
  const strong = font.note.replace("12px", "600 12px");

  function curve(ctx, s, X, Y, f, selected) {
    const pts = (from, to) => {
      const out = [];
      for (let k = 0; k <= 60; k++) {
        const c = from + ((to - from) * k) / 60;
        out.push([X(c), Y(f(s, c))]);
      }
      return out;
    };
    const stroke = selected ? color.ink : color.ink3;
    if (selected) path(ctx, pts(0, s.fitTo), color.maize, 5);
    path(ctx, pts(0, s.fitTo), stroke, selected ? 1.8 : 1.2);
    path(ctx, pts(s.fitTo, C_MAX), stroke, selected ? 1.6 : 1.1, [5, 4]);
  }

  function panel(ctx, box, kind) {
    const isVisc = kind === "viscosity";
    const { X, Y } = axes(ctx, box, {
      x: [0, C_MAX],
      y: isVisc ? [1, 6] : [0, 1.36], /* headroom, so the peak labels sit clear of the axis title */
      xTicks: [0, 0.3, 0.6, 0.9, 1.2],
      yTicks: isVisc ? [1, 2, 3, 4, 5, 6] : [0, 0.5, 1],
      yFormat: (v) => (isVisc ? String(v) : v === 0 ? "0" : v === 1 ? "peak" : "half"),
      xLabel: "concentration (mol/L)",
      yLabel: isVisc ? "viscosity ÷ the solvent's" : "conductivity, share of its peak",
    });
    panels.push({ l: box.l, r: box.r, X });

    /* beyond the fitted range the curves are extrapolations */
    const xf = Math.round(X(STATES[picked].fitTo)) + 0.5;
    ctx.fillStyle = color.wash;
    ctx.fillRect(xf, box.t + 24, box.r - xf, box.b - box.t - 24);
    rule(ctx, xf, box.t + 24, xf, box.b, color.ruleStrong);
    if (isVisc) text(ctx, "extrapolated", xf + 6, box.b - 12, { font: font.note, color: color.ink3 });

    const f = isVisc ? viscosity : share;
    STATES.forEach((s, i) => i !== picked && curve(ctx, s, X, Y, f, false));
    curve(ctx, STATES[picked], X, Y, f, true);

    if (isVisc) {
      /* each curve is named at its right end, in the margin, where the moving marker cannot reach */
      STATES.forEach((s, i) => {
        text(ctx, s.name, box.r + 7, Y(viscosity(s, C_MAX)), { font: i === picked ? strong : font.note, color: i === picked ? color.ink : color.ink3 });
      });
    } else {
      /* the peak the paper predicts for each state */
      STATES.forEach((s, i) => {
        const x = Math.round(X(s.peak)) + 0.5;
        const on = i === picked;
        rule(ctx, x, Y(1) - 6, x, Y(1) - 16, on ? color.ink : color.ink3);
        text(ctx, s.peak.toFixed(2), x + (i === 0 ? -4 : 4), Y(1) - 24, { font: on ? strong : font.note, color: on ? color.ink : color.ink3, align: i === 0 ? "right" : "left" });
      });
    }

    const s = STATES[picked];
    const x = X(conc);
    rule(ctx, Math.round(x) + 0.5, Y(f(s, conc)), Math.round(x) + 0.5, box.b, color.ruleStrong);
    dot(ctx, x, Y(f(s, conc)), 6, color.maize, color.ink, 1.4);
  }

  /* Both panels have the same width, so their concentration scales match; the margin to the
     right of the first holds the names of its two curves. */
  const NAMES = 78; /* room for the longer name in bold */
  const stage = canvas(root.querySelector("canvas"), (w) => (w >= 540 ? 300 : 520), (ctx, w, h) => {
    panels = [];
    if (w >= 540) {
      const pw = Math.floor((w - 40 - NAMES - 40 - 12) / 2);
      panel(ctx, { l: 40, t: 14, r: 40 + pw, b: h - 44 }, "viscosity");
      panel(ctx, { l: w - 12 - pw, t: 14, r: w - 12, b: h - 44 }, "conductivity");
    } else {
      panel(ctx, { l: 40, t: 14, r: w - NAMES, b: 260 - 44 }, "viscosity");
      panel(ctx, { l: 40, t: 274, r: w - NAMES, b: h - 44 }, "conductivity");
    }
  });

  function part(name, value) {
    const span = document.createElement("span");
    span.append(name + " ");
    label(span.appendChild(document.createElement("b")), value);
    return span;
  }

  function show() {
    const s = STATES[picked];
    buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(i === picked)));
    if (slider) {
      slider.value = String(conc);
      slider.setAttribute("aria-valuetext", conc.toFixed(2) + " moles per liter, " + s.name);
    }
    if (concOut) concOut.textContent = conc.toFixed(2) + " mol/L";
    if (values) {
      values.replaceChildren(
        part(s.name + ":", "viscosity " + viscosity(s, conc).toFixed(2) + " × the solvent's"),
        part("conductivity", Math.round(share(s, conc) * 100) + "% of its peak"),
        part("predicted peak", s.peak.toFixed(2) + " mol/L")
      );
      if (conc > s.fitTo) values.append(part("", "beyond the fitted range"));
    }
    stage.redraw();
  }

  buttons.forEach((b, i) =>
    b.addEventListener("click", () => {
      picked = i;
      show();
    })
  );
  if (slider) {
    slider.min = String(C_MIN);
    slider.max = String(C_MAX);
    slider.step = "0.01";
    slider.addEventListener("input", () => {
      conc = Number(slider.value);
      show();
    });
  }
  pointer(root.querySelector("canvas"), {
    move: (x) => {
      const p = panels.find((q) => x >= q.l - 6 && x <= q.r + 6);
      if (!p) return;
      const c = Math.max(C_MIN, Math.min(C_MAX, ((x - p.l) / (p.r - p.l)) * C_MAX));
      const next = Math.round(c * 100) / 100;
      if (next !== conc) {
        conc = next;
        show();
      }
    },
  });

  /* The fitted parameters as a table. */
  const host = root.querySelector("[data-table]");
  if (host) {
    const el = document.createElement("table");
    el.innerHTML =
      '<thead><tr><th scope="col">Fluid</th><th scope="col">Intrinsic viscosity (L/mol)</th><th scope="col">Huggins coefficient</th><th scope="col">Fitted up to (mol/L)</th><th scope="col">Predicted conductivity peak (mol/L)</th></tr></thead>';
    const body = el.appendChild(document.createElement("tbody"));
    const rows = STATES.map((s) => Object.assign({}, s, { name: s.name + ", measured" })).concat(SIMULATED);
    for (const s of rows) {
      const tr = body.appendChild(document.createElement("tr"));
      const th = tr.appendChild(document.createElement("th"));
      th.scope = "row";
      th.textContent = s.name.charAt(0).toUpperCase() + s.name.slice(1);
      for (const v of [s.eta.toFixed(2), s.kH.toFixed(2), s.fitTo.toFixed(2), s.peak.toFixed(2)]) tr.appendChild(document.createElement("td")).textContent = v;
    }
    host.replaceChildren(el);
  }

  show();
})();
