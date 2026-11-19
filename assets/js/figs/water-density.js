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
 *
 * The figure plays by itself: a marker cools along the measured points, from 290 K
 * down to 160 K and back, and reads out the point it is on. Moving a pointer over the
 * plot takes the marker over. The marker only ever rests on measured points; between
 * them it travels along the line that joins them.
 */
(() => {
  "use strict";

  const root = document.querySelector('[data-fig="water-density"]');
  if (!root || !window.ZFig) return;
  const { color, font, canvas, axes, path, dot, text, rule, pointer, run } = window.ZFig;

  const DATA = [
    [160, 1.061], [170, 1.059], [180, 1.057], [190, 1.053], [200, 1.046], [210, 1.041], [220, 1.042],
    [230, 1.047], [240, 1.06], [250, 1.071], [260, 1.088], [270, 1.097], [280, 1.104], [290, 1.106],
  ];
  const T_MIN = 210;
  const T_MAX = 284; /* stated in the paper; it falls between two measured temperatures */
  const T_BULK_FREEZES = 235;

  let picked = DATA.findIndex((d) => d[0] === T_MIN); /* the measured point being read */
  let at = picked; /* where the marker is along the points, as a fractional index */
  let hand = false; /* true while a pointer is choosing the point */

  const stage = canvas(root.querySelector("canvas"), (w) => (w >= 900 ? 430 : w >= 520 ? 360 : 300), (ctx, w, h) => {
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
    DATA.forEach(([t, d]) => dot(ctx, X(t), Y(d), 4, color.ink, color.paper, 1.4));

    /* the marker, on the line between the two measured points it is passing, and the value of the one it is nearest */
    const i = Math.max(0, Math.min(DATA.length - 2, Math.floor(at)));
    const f = at - i;
    const mx = X(DATA[i][0] + (DATA[i + 1][0] - DATA[i][0]) * f);
    const my = Y(DATA[i][1] + (DATA[i + 1][1] - DATA[i][1]) * f);
    rule(ctx, Math.round(mx) + 0.5, my, Math.round(mx) + 0.5, box.b, color.ruleStrong);
    dot(ctx, mx, my, 7, color.maize, color.ink, 1.5);
    /* The reading stays in the one corner the curve never enters (warm and light), so it cannot
       run into a label; on a phone that corner is narrow and the reading takes two lines. */
    const [pt, pd] = DATA[picked];
    const reading = [pt + " K", pd.toFixed(3) + " g/cm³"];
    ctx.font = font.mono;
    const oneLine = ctx.measureText(reading.join("   ")).width <= box.r - xf - 20;
    /* in two lines it stands a row higher, clear of the note under the minimum, which reaches this far on a small phone */
    (oneLine ? [reading.join("   ")] : reading).forEach((line, k, lines) => {
      text(ctx, line, box.r - 8, box.b - (oneLine ? 14 : 36) - 17 * (lines.length - 1 - k), { align: "right", color: color.ink });
    });

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

  /* Cooling and warming along the points, with a rest at each end and a longer look at the minimum. */
  const REST = { [DATA.length - 1]: 0.9, [DATA.findIndex((d) => d[0] === T_MIN)]: 1.4, 0: 0.9 };
  const LAST = DATA.length - 1;
  let direction = -1; /* toward colder first */
  let resting = 0;
  let stopped = -1; /* the point it last rested at, so that it does not rest there again on its way out */
  const loop = run(root.querySelector("canvas"), (dt) => {
    if (hand) return;
    if (resting > 0) {
      resting -= dt;
      return;
    }
    at = Math.max(0, Math.min(LAST, at + direction * dt * 2.6));
    /* the reading is always that of the measured point the marker is nearest */
    picked = Math.round(at);
    if (picked !== stopped && REST[picked] && Math.abs(at - picked) < 0.08) {
      at = picked;
      stopped = picked;
      resting = REST[picked];
    }
    /* at either end it turns back, whichever way it came to be there */
    if (at <= 0) direction = 1;
    else if (at >= LAST) direction = -1;
    stage.redraw();
  });
  if (!loop.paused) {
    /* when it plays, it starts warm */
    at = LAST;
    picked = LAST;
    stopped = LAST;
  }

  pointer(root.querySelector("canvas"), {
    move: (x) => {
      const w = stage.w;
      const t = 150 + ((x - 50) / (w - 14 - 50)) * 150;
      let best = 0;
      DATA.forEach((d, k) => {
        if (Math.abs(d[0] - t) < Math.abs(DATA[best][0] - t)) best = k;
      });
      hand = true;
      picked = best;
      at = best;
      stage.redraw();
    },
    leave: () => {
      hand = false;
      resting = 0.6;
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

  stage.redraw();
})();
