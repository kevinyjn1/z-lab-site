/*
 * Research, "Where the straight line ends".
 *
 * A model: the high-temperature Arrhenius law for atomic diffusion in the
 * molten bulk metallic glass former LM601 (Zr51Cu36Ni4Al9),
 * D = D0 exp(-EA / RT), with the fitted D0 and EA reported in
 * A. Jaiswal, S. O'Keeffe, R. Mills, A. Podlesynak, G. Ehlers, W. Dmowski,
 * K. Lokshin, J. Stevick, T. Egami, and Y. Zhang, J. Phys. Chem. B 120, 1142
 * (2016), who measured the diffusion coefficient by quasi-elastic neutron
 * scattering from 900 to 1100 C in 25 C steps.
 *
 * Published values: D0, EA, the onset temperature TA = 1300 +/- 50 K below
 * which the measured diffusion falls under the Arrhenius line, the glass
 * transition (697 K), the end of melting (1170 K), and the measured range.
 * The paper's equation run in the browser: the line itself.
 * Not shown, because the paper gives them only as a plot: the measured
 * diffusion coefficients. So below the onset the line continues as a dashed
 * reference and no curve or point is drawn under it. The small arrow under
 * the marker only says "lower than this", not by how much.
 */
(() => {
  "use strict";

  const root = document.querySelector('[data-fig="metal"]');
  if (!root || !window.ZFig) return;
  const { color, font, canvas, axes, path, dot, text, rule, pointer } = window.ZFig;

  const R = 8.314462618e-3; /* gas constant in kJ/(mol K), a physical constant */
  const ZERO_C = 273.15;

  const D0 = 13.0; /* Å²/ps: prefactor of the high-temperature Arrhenius fit (Jaiswal et al. 2016, results) */
  const D0_ERR = 3.1; /* Å²/ps: its stated uncertainty (same) */
  const EA = 55.8; /* kJ/mol: activation energy of the same fit (Jaiswal et al. 2016, results) */
  const EA_ERR = 2.7; /* kJ/mol: its stated uncertainty (same) */
  const T_ONSET = 1300; /* K: the data leave the Arrhenius line below this temperature (Jaiswal et al. 2016, results) */
  const T_ONSET_ERR = 50; /* K: its stated uncertainty (same) */
  const T_GLASS = 697; /* K: glass transition of LM601 from calorimetry (Jaiswal et al. 2016, sample) */
  const T_MELT = 1170; /* K: melting complete, from calorimetry (Jaiswal et al. 2016, sample) */
  /* Neutron spectra were taken from 900 to 1100 C in 25 C steps (Jaiswal et al. 2016, methods). */
  const T_MEASURED = Array.from({ length: 9 }, (_, i) => 900 + 25 * i + ZERO_C);
  const T_FIRST = T_MEASURED[0];
  const T_LAST = T_MEASURED[8];

  /* The paper's law: D = D0 exp(-EA / RT). */
  const arrhenius = (t) => D0 * Math.exp(-EA / (R * t));
  const inverse = (t) => 1000 / t;

  const slider = root.querySelector("[data-pick]");
  const tempOut = root.querySelector("[data-temp-out]");
  const values = root.querySelector("[data-values]");
  let picked = 2; /* 950 C, in the cooperative regime */

  const boxOf = (w, h) => ({ l: 50, t: 16, r: w - 14, b: h - 44 });
  const range = [inverse(1150), inverse(1450)];
  const plot = root.querySelector("canvas");

  const stage = canvas(plot, (w) => (w < 480 ? 320 : 340), (ctx, w, h) => {
    const box = boxOf(w, h);
    const yTicks = [0.02, 0.05, 0.1];
    const { X, Y } = axes(ctx, box, {
      x: range,
      y: [0.02, 0.18],
      yLog: true,
      xTicks: [1200, 1250, 1300, 1350, 1400, 1450].map(inverse),
      yTicks,
      xFormat: (v) => String(Math.round(1000 / v)),
      yFormat: (v) => String(v),
      xLabel: "temperature (K), spaced as 1/T",
      yLabel: "diffusion coefficient (Å²/ps)",
    });
    const at = (t) => [X(inverse(t)), Y(arrhenius(t))];
    const xMelt = Math.round(X(inverse(T_MELT))) + 0.5;
    const xOnset = Math.round(X(inverse(T_ONSET))) + 0.5;
    const top = box.t + 30;

    /* Between the end of melting and the onset the alloy is a stable liquid, yet already off the line. */
    ctx.fillStyle = color.wash;
    ctx.fillRect(xMelt, top, xOnset - xMelt, box.b - top);
    for (const v of yTicks) {
      if (Y(v) < box.b - 1) rule(ctx, xMelt, Math.round(Y(v)) + 0.5, xOnset, Math.round(Y(v)) + 0.5, color.ruleStrong);
    }
    rule(ctx, xMelt, top, xMelt, box.b, color.ink3);
    rule(ctx, xOnset, top, xOnset, box.b, color.ink3);

    /* The onset and its uncertainty. */
    const x0 = X(inverse(T_ONSET - T_ONSET_ERR));
    const x1 = X(inverse(T_ONSET + T_ONSET_ERR));
    rule(ctx, x0, top + 0.5, x1, top + 0.5, color.ink, 1.4);
    rule(ctx, x0, top - 4, x0, top + 5, color.ink, 1.4);
    rule(ctx, x1, top - 4, x1, top + 5, color.ink, 1.4);
    text(ctx, "onset, " + T_ONSET + " ± " + T_ONSET_ERR + " K", xOnset + 8, top + 16, { font: font.note, color: color.ink });

    text(ctx, "measured values", xMelt + 8, top + 16, { font: font.note, color: color.ink2 });
    text(ctx, "fall below the line", xMelt + 8, top + 31, { font: font.note, color: color.ink2 });
    text(ctx, "melting ends", xMelt + 8, box.b - 27, { font: font.note, color: color.ink2 });
    text(ctx, T_MELT + " K", xMelt + 8, box.b - 12, { font: font.note, color: color.ink2 });

    /* The range the neutrons covered, as a heavy stretch of the axis. */
    rule(ctx, X(inverse(T_FIRST)), box.b + 0.5, X(inverse(T_LAST)), box.b + 0.5, color.ink, 4);
    text(ctx, "measured range", xOnset + 8, box.b - 27, { font: font.note, color: color.ink2 });
    text(ctx, Math.round(T_FIRST) + " to " + Math.round(T_LAST) + " K", xOnset + 8, box.b - 12, { font: font.note, color: color.ink2 });

    /* The Arrhenius law: solid where the data follow it, a thin dashed reference below the onset. */
    path(ctx, [at(T_FIRST), at(T_ONSET)], color.ink3, 1.2, [5, 4]);
    path(ctx, [at(T_ONSET), at(T_LAST)], color.ink, 1.8);
    text(ctx, "Arrhenius law", xOnset + 8, Y(arrhenius(T_ONSET)) + 16, { font: font.note, color: color.ink });

    /* The marker. Below the onset range the measured value is lower than the law, by an amount the paper only plots. */
    const t = T_MEASURED[picked];
    const [x, y] = at(t);
    if (t <= T_ONSET - T_ONSET_ERR) {
      rule(ctx, x, y + 9, x, y + 25, color.ink, 1.4);
      path(ctx, [[x - 4, y + 20], [x, y + 26], [x + 4, y + 20]], color.ink, 1.4);
    }
    dot(ctx, x, y, 6, color.maize, color.ink, 1.4);
  });

  function part(label, value, after) {
    const span = document.createElement("span");
    if (label) span.append(label + " ");
    span.appendChild(document.createElement("b")).textContent = value;
    if (after) span.append(" " + after);
    return span;
  }

  function pick(i) {
    picked = Math.max(0, Math.min(T_MEASURED.length - 1, i));
    const t = T_MEASURED[picked];
    const kelvin = Math.round(t);
    const law = arrhenius(t).toFixed(3) + " Å²/ps";
    let regime = "within the onset range, " + T_ONSET + " ± " + T_ONSET_ERR + " K";
    if (t >= T_ONSET + T_ONSET_ERR) regime = "on the Arrhenius line";
    if (t <= T_ONSET - T_ONSET_ERR) regime = "below the onset: measured diffusion is under the line";
    const ratio = (t / T_GLASS).toFixed(2);
    if (tempOut) tempOut.textContent = kelvin + " K (" + Math.round(t - ZERO_C) + " °C)";
    if (values) values.replaceChildren(part("", regime), part("Arrhenius law gives", law), part("", ratio, "× glass transition temperature"));
    if (slider) {
      slider.value = String(picked);
      slider.setAttribute("aria-valuetext", kelvin + " kelvin: " + regime + ". The Arrhenius law gives " + law + ". " + ratio + " times the glass transition temperature.");
    }
    stage.redraw();
  }

  if (slider) {
    slider.max = String(T_MEASURED.length - 1);
    slider.addEventListener("input", () => pick(Number(slider.value)));
  }
  pointer(plot, {
    move: (x) => {
      const box = boxOf(stage.w, stage.h);
      const t = 1000 / (range[0] + ((x - box.l) / (box.r - box.l)) * (range[1] - range[0]));
      let best = 0;
      T_MEASURED.forEach((m, i) => {
        if (Math.abs(m - t) < Math.abs(T_MEASURED[best] - t)) best = i;
      });
      if (best !== picked) pick(best);
    },
  });

  /* The published values the figure is built from, as a table. */
  const table = root.querySelector("[data-table]");
  if (table) {
    const el = document.createElement("table");
    el.innerHTML = "<thead><tr><th scope=\"col\">Quantity</th><th scope=\"col\">Published value</th></tr></thead>";
    const body = el.appendChild(document.createElement("tbody"));
    [
      ["Prefactor of the fit", D0.toFixed(1) + " ± " + D0_ERR.toFixed(1) + " Å²/ps"],
      ["Activation energy", EA.toFixed(1) + " ± " + EA_ERR.toFixed(1) + " kJ/mol"],
      ["Onset of the departure", T_ONSET + " ± " + T_ONSET_ERR + " K"],
      ["Glass transition", T_GLASS + " K"],
      ["Melting complete", T_MELT + " K"],
      ["Measured range", "900 to 1100 °C"],
    ].forEach(([name, value]) => {
      const tr = body.appendChild(document.createElement("tr"));
      tr.appendChild(document.createElement("th")).textContent = name;
      tr.lastChild.scope = "row";
      tr.appendChild(document.createElement("td")).textContent = value;
    });
    table.replaceChildren(el);
  }

  pick(picked);
})();
