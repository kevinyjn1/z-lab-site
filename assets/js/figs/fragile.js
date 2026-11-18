/*
 * Research, "Fragile to strong".
 *
 * A model: the fitted laws two papers report for the single layer of water at
 * the surface of a biomolecule, run in the browser with the papers' published
 * constants. Neither paper's text prints the prefactors of its laws, so each
 * panel is drawn as a ratio to the value at its own crossover temperature (the
 * prefactor cancels) and the axis says so. No measured points are shown.
 *
 * Water on DNA (the unit's title): S.-H. Chen, L. Liu, X. Chu, Y. Zhang,
 * E. Fratini, P. Baglioni, A. Faraone, and E. Mamontov, J. Chem. Phys. 125,
 * 171103 (2006). The average relaxation time of the hydration water follows a
 * Vogel-Fulcher-Tammann (VFT) law from 270 K to 230 K and an Arrhenius law
 * below the crossover at 222 +/- 2 K, measured down to 185 K.
 *   Drawn from the paper's values: the Arrhenius branch (activation energy
 *   3.48 kcal/mol), the crossover at 222 K, the range the VFT law was fitted
 *   over, and the temperature at which that law would diverge (180 K).
 *   Not drawn: the VFT curve itself. Its strength constant and prefactor are
 *   not in the paper's text, so the curve cannot be placed.
 *
 * Water on lysozyme: Y. Zhang, M. Lagi, D. Liu, F. Mallamace, E. Fratini,
 * P. Baglioni, E. Mamontov, M. Hagen, and S.-H. Chen, J. Chem. Phys. 130,
 * 135101 (2009). The inverse self-diffusion constant 1/D, measured from 290 K
 * to 380 K, follows 1/D = (1/D0) exp(C T0 / (T - T0)) below the crossover at
 * 345 +/- 5 K and an Arrhenius law above it. Both branches are drawn from the
 * paper's values; the paper defines the crossover as the point where the two
 * fitted laws cross, which is why the branches meet there.
 *
 * Nothing here is illustration. The two panels are different samples, different
 * instruments, and different quantities, and are not joined into one curve.
 */
(() => {
  "use strict";

  const root = document.querySelector('[data-fig="fragile"]');
  if (!root || !window.ZFig) return;
  const { color, font, canvas, axes, path, dot, text, rule, pointer } = window.ZFig;

  const R = 1.987204e-3; /* gas constant in kcal/(mol K); a physical constant, not from either paper */

  /* Water on DNA, average translational relaxation time (Chen et al. 2006, text and Fig. 4). */
  const DNA = {
    TL: 222, /* crossover temperature: 222 +/- 2 K */
    EA: 3.48, /* Arrhenius activation energy below the crossover, kcal/mol */
    T0: 180, /* VFT temperature of the law fitted above the crossover, K */
    vft: [270, 230], /* range over which the VFT law is fitted, K */
    range: [270, 185], /* temperatures measured, K */
  };

  /* Water on lysozyme, inverse self-diffusion constant (Zhang et al. 2009, text and Fig. 6a). */
  const LYS = {
    TD: 345, /* crossover temperature: 345 +/- 5 K */
    EA: 5.97, /* Arrhenius activation energy above the crossover: 5.97 +/- 0.55 kcal/mol */
    T0: 204, /* VFT temperature below the crossover: 204 +/- 36 K */
    C: 0.94, /* VFT constant below the crossover */
    range: [380, 290], /* temperatures measured, K */
  };

  /* Each law as a ratio to its value at the crossover, so no prefactor is needed. */
  const arrhenius = (T, EA, Tref) => Math.exp((EA / R) * (1 / T - 1 / Tref));
  const dnaRatio = (T) => (T <= DNA.TL ? arrhenius(T, DNA.EA, DNA.TL) : null); /* null: the VFT branch cannot be drawn */
  const lysRatio = (T) =>
    T >= LYS.TD ? arrhenius(T, LYS.EA, LYS.TD) : Math.exp(LYS.C * LYS.T0 * (1 / (T - LYS.T0) - 1 / (LYS.TD - LYS.T0)));

  /* The two panels, in the order of cooling. Axis limits and ticks are layout, not data. */
  const PANELS = [
    {
      title: "Water on lysozyme",
      yLabel: "1/diffusivity ÷ its value at 345 K",
      hot: 386, cold: 286, ticks: [380, 360, 340, 320, 300],
      y: [0.3, 5], yTicks: [0.5, 1, 2, 4],
      ratio: lysRatio, range: LYS.range, cross: LYS.TD,
    },
    {
      title: "Water on DNA",
      yLabel: "relaxation time ÷ its value at 222 K",
      hot: 275, cold: 176.5, ticks: [270, 250, 230, 200, 180],
      y: [0.4, 16], yTicks: [0.5, 1, 2, 4, 8],
      ratio: dnaRatio, range: DNA.range, cross: DNA.TL,
    },
  ];

  /* The slider steps through every kelvin either paper measured, hottest first. */
  const TEMPS = [];
  for (const p of PANELS) for (let T = p.range[0]; T >= p.range[1]; T--) TEMPS.push(T);

  const inv = (T) => 1000 / T;
  const bold = '600 12px "IBM Plex Sans", system-ui, sans-serif';
  const times = (v) => (v >= 10 ? v.toFixed(0) : v.toFixed(2));

  /* Side by side when there is room, stacked when there is not. */
  function layout(w) {
    const wide = w >= 560;
    const top = 52;
    const plot = wide ? 200 : 172;
    const foot = 50;
    const gap = wide ? 30 : 14;
    const boxes = PANELS.map((p, i) => {
      if (wide) {
        const pw = (w - gap) / 2;
        const x0 = i * (pw + gap);
        return { l: x0 + 38, t: top, r: x0 + pw - 10, b: top + plot };
      }
      const y0 = i * (top + plot + foot + gap);
      return { l: 38, t: y0 + top, r: w - 12, b: y0 + top + plot };
    });
    return { boxes, h: wide ? top + plot + foot : 2 * (top + plot + foot) + gap };
  }

  const slider = root.querySelector("[data-pick]");
  const readout = root.querySelector("[data-readout]");
  const where = root.querySelector("[data-where]");
  const what = root.querySelector("[data-what]");
  let picked = TEMPS.indexOf(DNA.TL);

  function drawPanel(ctx, p, box) {
    const { X, Y } = axes(ctx, box, {
      x: [inv(p.hot), inv(p.cold)],
      y: p.y,
      yLog: true,
      xTicks: p.ticks.map(inv),
      yTicks: p.yTicks,
      xFormat: (v) => String(Math.round(1000 / v)),
      yFormat: (v) => String(v),
      xLabel: "temperature (K), 1/T scale",
    });
    const x = (T) => X(inv(T));
    const note = (str, px, py, o) => text(ctx, str, px, py, Object.assign({ font: font.note, color: color.ink2 }, o));
    const width = (str, f) => {
      ctx.font = f;
      return ctx.measureText(str).width;
    };
    /* The heading starts at the axis, or further left when the plot is too narrow for it. */
    const hx = Math.max(2, Math.min(box.l, box.r + 10 - width(p.yLabel, font.label)));
    text(ctx, p.title, hx, box.t - 38, { font: bold, color: color.ink });
    text(ctx, p.yLabel, hx, box.t - 17, { font: font.label, color: color.ink });

    if (p.ratio === dnaRatio) {
      /* The range over which the paper fits the curved law. Its curve is not drawn (see the header). */
      const x0 = Math.round(x(DNA.vft[0])) + 0.5;
      const x1 = Math.round(x(DNA.vft[1])) + 0.5;
      ctx.fillStyle = color.wash;
      ctx.fillRect(x0, box.t, x1 - x0, box.b - box.t);
      for (const v of p.yTicks) rule(ctx, x0, Math.round(Y(v)) + 0.5, x1, Math.round(Y(v)) + 0.5, color.ruleStrong);
      note("fragile", (x0 + x1) / 2, box.t + 66, { font: bold, color: color.ink, align: "center" });
      note("curved law", (x0 + x1) / 2, box.t + 82, { align: "center" });

      /* Where that curved law would diverge. */
      path(ctx, [[x(DNA.T0), box.t], [x(DNA.T0), box.b]], color.ink3, 1, [4, 4]);
      ["curved law", "would diverge", "at " + DNA.T0 + " K"].forEach((line, i) => note(line, x(DNA.T0) - 6, box.t + 9 + 15 * i, { align: "right" }));

      note("strong", x(207), box.b - 42, { font: bold, color: color.ink });
      note("straight law", x(207), box.b - 26);
    } else {
      /* Left of the crossover there is little room on a narrow plot. */
      const room = x(LYS.TD) - 6 - box.l;
      const second = width("straight law", font.note) + 3 <= room ? "straight law" : "straight";
      const nx = (str, f) => box.l + Math.max(3, Math.min(9, room - width(str, f)));
      note("Arrhenius", nx("Arrhenius", bold), box.t + 32, { font: bold, color: color.ink });
      note(second, nx(second, font.note), box.t + 48);
      note("super-Arrhenius", x(338), box.b - 42, { font: bold, color: color.ink });
      note("curved law", x(338), box.b - 26);
    }

    /* The crossover the paper reports. */
    const xc = Math.round(x(p.cross)) + 0.5;
    rule(ctx, xc, box.t + 18, xc, box.b, color.ink3);
    note(p.cross + " K", xc, box.t + 9, { color: color.ink, align: "center" });

    const pts = [];
    for (let T = p.range[0]; T >= p.range[1]; T--) {
      const v = p.ratio(T);
      pts.push(v === null ? null : [x(T), Y(v)]);
    }
    path(ctx, pts, color.ink, 1.8);
    dot(ctx, x(p.cross), Y(1), 3, color.ink);

    /* The temperature being read. On the branch that is not drawn the marker rests on the axis. */
    const T = TEMPS[picked];
    if (T <= p.range[0] && T >= p.range[1]) {
      const v = p.ratio(T);
      const my = v === null ? box.b : Y(v);
      if (v !== null) rule(ctx, x(T), my, x(T), box.b, color.ink);
      dot(ctx, x(T), my, 6, color.maize, color.ink, 1.4);
    }
  }

  const stage = canvas(root.querySelector("canvas"), (w) => layout(w).h, (ctx, w) => {
    const { boxes } = layout(w);
    PANELS.forEach((p, i) => drawPanel(ctx, p, boxes[i]));
  });

  /* The regime at a temperature, in the papers' own terms. */
  function describe(T) {
    if (T >= LYS.range[1]) {
      const r = "1/D is " + times(lysRatio(T)) + " times its value at 345 K";
      if (T === LYS.TD) return ["water on lysozyme", "crossover, 345 ± 5 K: straight law above, curved law below"];
      if (T > LYS.TD) return ["water on lysozyme", "Arrhenius: straight law, 5.97 kcal/mol. " + r];
      return ["water on lysozyme", "super-Arrhenius: curved law. " + r];
    }
    if (T === DNA.TL) return ["water on DNA", "crossover, 222 ± 2 K: fragile above, strong below"];
    if (T > DNA.TL) return ["water on DNA", "fragile: curved law, fitted from 270 to 230 K"];
    return ["water on DNA", "strong: straight law, 3.48 kcal/mol. Relaxation time is " + times(dnaRatio(T)) + " times its value at 222 K"];
  }

  function pick(i) {
    picked = Math.max(0, Math.min(TEMPS.length - 1, i));
    const T = TEMPS[picked];
    const [sample, regime] = describe(T);
    if (slider) {
      slider.value = String(picked);
      slider.setAttribute("aria-valuetext", T + " kelvin, " + sample + ", " + regime);
    }
    if (readout) readout.textContent = T + " K";
    if (where) where.textContent = T + " K, " + sample;
    if (what) what.textContent = regime;
    stage.redraw();
  }

  if (slider) {
    slider.max = String(TEMPS.length - 1);
    slider.addEventListener("input", () => pick(Number(slider.value)));
  }
  pointer(root.querySelector("canvas"), {
    move: (px, py) => {
      const { boxes } = layout(stage.w);
      const i = boxes.findIndex((b) => px >= b.l - 12 && px <= b.r + 10 && py >= b.t - 8 && py <= b.b + 24);
      if (i < 0) return;
      const p = PANELS[i];
      const b = boxes[i];
      const T = 1000 / (inv(p.hot) + ((px - b.l) / (b.r - b.l)) * (inv(p.cold) - inv(p.hot)));
      const near = TEMPS.indexOf(Math.round(Math.max(p.range[1], Math.min(p.range[0], T))));
      if (near >= 0 && near !== picked) pick(near);
    },
  });

  /* The published constants the two panels are drawn from. */
  const table = root.querySelector("[data-table]");
  if (table) {
    const rows = [
      ["Water on DNA: crossover", "222 ± 2 K"],
      ["Arrhenius energy below it", DNA.EA.toFixed(2) + " kcal/mol"],
      ["VFT law fitted from", DNA.vft[0] + " to " + DNA.vft[1] + " K"],
      ["VFT law would diverge at", DNA.T0 + " K"],
      ["VFT strength, prefactor", "not printed"],
      ["Water on lysozyme: crossover", "345 ± 5 K"],
      ["Arrhenius energy above it", "5.97 ± 0.55 kcal/mol"],
      ["VFT T₀ below it", "204 ± 36 K"],
      ["VFT C below it", LYS.C.toFixed(2)],
    ];
    const el = document.createElement("table");
    el.innerHTML = "<thead><tr><th scope=\"col\">Fitted law</th><th scope=\"col\">Published value</th></tr></thead>";
    const body = el.appendChild(document.createElement("tbody"));
    rows.forEach(([name, value]) => {
      const tr = body.appendChild(document.createElement("tr"));
      tr.appendChild(document.createElement("th")).textContent = name;
      tr.lastChild.scope = "row";
      tr.appendChild(document.createElement("td")).textContent = value.replace(/ /g, "\u00a0"); /* a value stays on one line */
    });
    table.replaceChildren(el);
  }

  pick(picked);
})();
