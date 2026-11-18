/*
 * Research, "The water that never froze".
 *
 * A re-plot of published values: the density of heavy water (D2O) confined in
 * the 15 A pores of the silica MCM-41-S, measured by small-angle neutron
 * scattering at 14 temperatures from 290 K down to 160 K.
 * Source: Table 1 of D. Liu, Y. Zhang, C.-C. Chen, C.-Y. Mou, P. H. Poole, and
 * S.-H. Chen, Proc. Natl. Acad. Sci. U.S.A. 104, 9570 (2007).
 * The paper puts the density maximum at 284 +/- 5 K and the minimum at
 * 210 +/- 5 K (1.041 +/- 0.003 g/cm3), and notes that bulk water crystallizes
 * at about 235 K. Nothing here is modelled or smoothed.
 */
(() => {
  "use strict";

  const root = document.querySelector('[data-fig="water-density"]');
  if (!root || !window.ZFig) return;
  const { color, font, canvas, axes, path, dot, text, rule, pointer } = window.ZFig;

  const DATA = [
    [160, 1.061], [170, 1.059], [180, 1.057], [190, 1.053], [200, 1.046], [210, 1.041], [220, 1.042],
    [230, 1.047], [240, 1.06], [250, 1.071], [260, 1.088], [270, 1.097], [280, 1.104], [290, 1.106],
  ];
  const T_MIN = 210;
  const T_MAX = 284; /* stated in the paper; it falls between two measured temperatures */
  const T_BULK_FREEZES = 235;

  const slider = root.querySelector("[data-pick]");
  const readout = root.querySelector("[data-readout]");
  let picked = DATA.findIndex((d) => d[0] === T_MIN);

  const stage = canvas(root.querySelector("canvas"), (w) => (w < 480 ? 300 : 340), (ctx, w, h) => {
    const box = { l: 50, t: 40, r: w - 14, b: h - 44 };
    const { X, Y } = axes(ctx, box, {
      x: [150, 300],
      y: [1.03, 1.11],
      xTicks: [160, 180, 200, 220, 240, 260, 280, 300],
      yTicks: [1.04, 1.06, 1.08, 1.1],
      yFormat: (v) => v.toFixed(2),
      xLabel: "temperature (K)",
      yLabel: "density of D₂O (g/cm³)",
    });

    /* Below about 235 K bulk water has already frozen; only confined water gets here. */
    const xf = Math.round(X(T_BULK_FREEZES)) + 0.5;
    ctx.fillStyle = color.wash;
    ctx.fillRect(box.l + 1, box.t + 24, xf - box.l - 1, box.b - box.t - 24);
    for (const v of [1.04, 1.06, 1.08, 1.1]) rule(ctx, box.l, Math.round(Y(v)) + 0.5, xf, Math.round(Y(v)) + 0.5, color.ruleStrong);
    rule(ctx, xf, box.t + 24, xf, box.b, color.ink3);
    /* the note takes two lines when the washed region is narrower than its words (a phone) */
    const washNote = "bulk water has frozen by here";
    ctx.font = font.note;
    const washLines = ctx.measureText(washNote).width <= xf - box.l - 16 ? [washNote] : ["bulk water has", "frozen by here"];
    washLines.forEach((line, i) => text(ctx, line, xf - 8, box.t + 37 + 15 * i, { font: font.note, color: color.ink2, align: "right" }));

    path(ctx, DATA.map(([t, d]) => [X(t), Y(d)]), color.ink, 1.6);
    DATA.forEach(([t, d], i) => {
      const isMin = t === T_MIN;
      dot(ctx, X(t), Y(d), i === picked ? 6 : 4, isMin || i === picked ? color.maize : color.ink, isMin || i === picked ? color.ink : color.paper, 1.4);
    });

    /* The two turning points the paper reports. */
    /* Each label sits on the open side of its turning point (under the minimum, over the
       maximum), where the curve cannot run through it at any width. */
    const min = DATA.find((d) => d[0] === T_MIN);
    const minNote = "minimum, 210 K";
    ctx.font = font.note;
    text(ctx, minNote, Math.min(X(T_MIN), xf - 7 - ctx.measureText(minNote).width / 2), Y(min[1]) + 21, { font: font.note, color: color.ink, align: "center" });
    const yTop = Y(1.106);
    const maxNote = "maximum, 284 K";
    ctx.font = font.note;
    rule(ctx, X(T_MAX), yTop - 9, X(T_MAX), yTop - 19, color.ink);
    text(ctx, maxNote, Math.min(X(T_MAX) + ctx.measureText(maxNote).width / 2, box.r), yTop - 28, { font: font.note, color: color.ink, align: "right" });
  });

  function pick(i) {
    picked = Math.max(0, Math.min(DATA.length - 1, i));
    const [t, d] = DATA[picked];
    if (slider) slider.value = String(picked);
    if (readout) readout.textContent = t + " K: " + d.toFixed(3) + " g/cm³";
    stage.redraw();
  }

  if (slider) {
    slider.max = String(DATA.length - 1);
    slider.addEventListener("input", () => pick(Number(slider.value)));
  }
  pointer(root.querySelector("canvas"), {
    move: (x) => {
      const w = stage.w;
      const t = 150 + ((x - 50) / (w - 14 - 50)) * 150;
      let best = 0;
      DATA.forEach((d, i) => {
        if (Math.abs(d[0] - t) < Math.abs(DATA[best][0] - t)) best = i;
      });
      if (best !== picked) pick(best);
    },
  });

  /* The same values as a table. */
  const table = root.querySelector("[data-table]");
  if (table) {
    const el = document.createElement("table");
    el.innerHTML = "<thead><tr><th scope=\"col\">Temperature (K)</th><th scope=\"col\">Density (g/cm³)</th></tr></thead>";
    const body = el.appendChild(document.createElement("tbody"));
    DATA.slice().reverse().forEach(([t, d]) => {
      const tr = body.appendChild(document.createElement("tr"));
      tr.appendChild(document.createElement("th")).textContent = String(t);
      tr.lastChild.scope = "row";
      tr.appendChild(document.createElement("td")).textContent = d.toFixed(3);
    });
    table.replaceChildren(el);
  }

  pick(picked);
})();
