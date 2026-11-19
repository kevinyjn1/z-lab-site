/*
 * Two clocks in a glass-forming salt: how a density fluctuation in molten CKN fades, as
 * measured by neutron time of flight and neutron spin echo.
 *
 * Source: P. Luo, Y. Zhai, P. Falus, V. Garcia Sakai, M. Hartl, M. Kofu, K. Nakajima,
 * A. Faraone, and Y Z, "Q-dependent collective relaxation dynamics of glass-forming liquid
 * Ca0.4K0.6(NO3)1.4 investigated by wide-angle neutron spin-echo", Nature Communications 13,
 * 2092 (2022), DOI 10.1038/s41467-022-29778-4, published under CC BY 4.0.
 *
 * Everything drawn is published: the points and their error bars are the measured
 * intermediate scattering functions from the paper's Source Data file (Figs. 2a, 2b, and 6),
 * and the line through the chosen curve is the paper's fitted law for the slow step,
 * f exp(-(t / tau)^beta), with the fitted values from the same file (Fig. 3). The numbers
 * live in clocks-data.js, which tools/make_clocks_data.py builds from that file.
 * Nothing is modeled or interpolated here.
 *
 * It plays by itself: the chosen curve steps through the measured temperatures (or wave
 * vectors) and back. Pointing at a curve chooses it.
 */
(() => {
  "use strict";
  const root = document.querySelector('[data-fig="clocks"]');
  const data = window.ZFigData && window.ZFigData.clocks;
  if (!root || !window.ZFig || !data) return;
  const { canvas, axes, path, dot, text, rule, label, run, color, font } = window.ZFig;

  /* Three views of the same measurements. `list` is what the figure steps through. */
  const VIEWS = {
    both: { list: data.bothSteps, start: 1, x: [1e-4, 2], name: (c) => waveVector(c.q) },
    cooling: { list: data.byTemperature, start: 6, x: [2e-3, 2], name: (c) => c.T + " K" },
    scale: { list: data.byWaveVector, start: 4, x: [2e-3, 2], name: (c) => waveVector(c.q) + " (" + (6.2832 / c.q).toFixed(1) + " Å)" },
  };
  const picked = { both: VIEWS.both.start, cooling: VIEWS.cooling.start, scale: VIEWS.scale.start };
  let view = "cooling";

  function waveVector(q) {
    return q.toFixed(2) + " Å⁻¹";
  }
  /* A time in nanoseconds, written in the unit a reader would use. */
  function time(ns) {
    if (ns >= 1) return Number(ns.toPrecision(3)) + " ns";
    const ps = ns * 1000;
    return Number(ps.toPrecision(ps < 10 ? 2 : 3)) + " ps";
  }
  const tick = (v) => (v >= 1 ? v + " ns" : Number((v * 1000).toPrecision(1)) + " ps");

  const buttons = Array.from(root.querySelectorAll("[data-view]"));
  const plot = root.querySelector("canvas");
  let hand = false; /* true while a pointer is choosing the curve */
  let scales = null; /* the plot's data-to-pixel maps, kept for the pointer */

  /* Measured points with their published error bars. */
  function points(ctx, pts, X, Y, opt) {
    ctx.strokeStyle = opt.stroke;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const [t, i, e] of pts) {
      if (Math.abs(Y(i + e) - Y(i - e)) < 3) continue;
      const x = Math.round(X(t)) + 0.5;
      ctx.moveTo(x, Y(i + e));
      ctx.lineTo(x, Y(i - e));
    }
    ctx.stroke();
    for (const [t, i] of pts) dot(ctx, X(t), Y(i), opt.r, opt.fill, opt.stroke, 1.1);
  }

  /* A span of time along the top of the plot, with its name starting at its left end. */
  function bracket(ctx, x0, x1, y, name) {
    rule(ctx, x0, y + 0.5, x1, y + 0.5, color.ink3);
    rule(ctx, Math.round(x0) + 0.5, y - 3, Math.round(x0) + 0.5, y + 4, color.ink3);
    rule(ctx, Math.round(x1) + 0.5, y - 3, Math.round(x1) + 0.5, y + 4, color.ink3);
    text(ctx, name, x0 + 1, y - 9, { font: font.note, color: color.ink2 });
  }

  const stage = canvas(plot, (w) => (w >= 900 ? 440 : w >= 520 ? 360 : 324), (ctx, w, h) => {
    const v = VIEWS[view];
    const box = { l: 44, t: 46, r: w - 14, b: h - 44 };
    const narrow = w < 420;
    /* whether a label, set as an axis label, is no wider than the room it has */
    const fits = (label, room) => {
      ctx.font = font.label;
      return ctx.measureText(label).width <= room;
    };
    const { X, Y } = axes(ctx, box, {
      x: v.x,
      y: [0, 1],
      xLog: true,
      xTicks: (view === "both" ? [1e-4, 1e-3, 1e-2, 1e-1, 1] : [1e-2, 1e-1, 1]).filter((t, k) => !narrow || view !== "both" || k % 2 === 0),
      xFormat: tick,
      yTicks: [0, 0.25, 0.5, 0.75, 1],
      xLabel: fits("time since the fluctuation (logarithmic)", box.r - box.l) ? "time since the fluctuation (logarithmic)" : "time since the fluctuation (log)",
    });
    const item = v.list[picked[view]];
    scales = { X, Y, box };
    /* the one thing that changes, named in the corner: the temperature or the wave vector of the chosen curve */
    const corner = font.mono.replace("11px", "500 13px");
    const name = v.name(item);
    text(ctx, name, box.r, 12, { font: corner, color: color.ink, align: "right" });
    /* the axis label gives way to it on a small phone, where both do not fit on the line */
    ctx.font = corner;
    const room = box.r - box.l - 8 - ctx.measureText(name).width - 14;
    text(ctx, fits("share of the fluctuation left", room) ? "share of the fluctuation left" : "share left", box.l + 8, 12, { font: font.label, color: color.ink });

    if (view === "both") {
      /* cold pair in ink, warm pair in gray; open dots are time of flight, filled dots spin echo */
      const [tofCold, nseCold, tofWarm, nseWarm] = item.runs;
      /* each instrument's span of time, named with the step it catches */
      bracket(ctx, X(tofCold.pts[0][0]), X(tofCold.pts[tofCold.pts.length - 1][0]), box.t - 6, "time of flight: the fast step");
      bracket(ctx, X(nseCold.pts[0][0]), X(nseCold.pts[nseCold.pts.length - 1][0]), box.t + 16, "spin echo: the slow step");
      points(ctx, tofWarm.pts, X, Y, { r: 2.2, fill: color.paper, stroke: color.ink3 });
      points(ctx, nseWarm.pts, X, Y, { r: 2.4, fill: color.ink3, stroke: color.ink3 });
      points(ctx, tofCold.pts, X, Y, { r: 2.2, fill: color.paper, stroke: color.ink });
      points(ctx, nseCold.pts, X, Y, { r: 2.4, fill: color.ink, stroke: color.ink });

      /* each temperature named beside its curve: the colder above it, the warmer below */
      const midCold = nseCold.pts.find((p) => p[1] < 0.62) || nseCold.pts[nseCold.pts.length - 1];
      text(ctx, nseCold.T + " K", Math.min(X(midCold[0]) + 10, box.r - 34), Y(midCold[1]) - 13, { font: font.note, color: color.ink });
      const midWarm = nseWarm.pts.find((p) => p[1] < 0.3) || nseWarm.pts[nseWarm.pts.length - 1];
      text(ctx, nseWarm.T + " K", X(midWarm[0]) - 17, Y(midWarm[1]) + 17, { font: font.note, color: color.ink3, align: "right" });
      return;
    }

    /* The paper's fit to the slow step, drawn only across the times that were measured. */
    const fitted = (c) => {
      const t0 = c.pts[0][0];
      const t1 = c.pts[c.pts.length - 1][0];
      const line = [];
      for (let k = 0; k <= 100; k++) {
        const t = t0 * Math.pow(t1 / t0, k / 100);
        line.push([X(t), Y(c.fit.f * Math.exp(-Math.pow(t / c.fit.tau, c.fit.beta)))]);
      }
      return line;
    };
    const measured = (c) => c.pts.map(([t, i]) => [X(t), Y(i)]);
    /* every other curve faintly (its fit, or its points where the paper gives no fit), so the chosen one is read against the rest */
    v.list.forEach((c, k) => {
      if (k !== picked[view]) path(ctx, c.fit.tau ? fitted(c) : measured(c), color.ruleStrong, 1.1);
    });
    if (view === "cooling") {
      /* the coldest and warmest curves are named, unless one of them is the chosen curve (the corner names that one) */
      const first = v.list[0].pts;
      const last = v.list[v.list.length - 1].pts;
      if (picked[view] !== 0) text(ctx, v.list[0].T + " K", box.r - 2, Y(first[first.length - 1][1]) - 11, { font: font.note, color: color.ink3, align: "right" });
      const low = last.find((p) => p[1] < 0.3) || last[last.length - 1];
      if (picked[view] !== v.list.length - 1) text(ctx, v.list[v.list.length - 1].T + " K", X(low[0]) - 9, Y(low[1]) + 6, { font: font.note, color: color.ink3, align: "right" });
    }

    /* the chosen curve: the paper's fit as a line where there is one, and the measured points */
    const fit = item.fit;
    if (fit.tau) {
      path(ctx, fitted(item), color.maize, 5);
      path(ctx, fitted(item), color.ink, 1.4);
    } else {
      path(ctx, measured(item), color.maize, 5);
    }
    points(ctx, item.pts, X, Y, { r: 2.6, fill: color.ink, stroke: color.ink });
    /* the slow time: where the fitted step has fallen to 1/e of its plateau */
    if (fit.tau && fit.tau <= v.x[1]) {
      const x = X(fit.tau);
      const y = Y(fit.f / Math.E);
      /* when the slow time lies past the last measured time, the fit is carried on to it as a dashed line */
      const tEnd = item.pts[item.pts.length - 1][0];
      if (fit.tau > tEnd) {
        const beyond = [];
        for (let k = 0; k <= 20; k++) {
          const t = tEnd * Math.pow(fit.tau / tEnd, k / 20);
          beyond.push([X(t), Y(fit.f * Math.exp(-Math.pow(t / fit.tau, fit.beta)))]);
        }
        path(ctx, beyond, color.ink, 1.2, [4, 4]);
      }
      rule(ctx, Math.round(x) + 0.5, y, Math.round(x) + 0.5, box.b, color.ink3);
      dot(ctx, x, y, 6, color.maize, color.ink, 1.4);
      /* on a narrow plot the label would lie across the other curves; the readout below gives the value */
      if (!narrow) {
        /* near the right edge the label goes to the lower left of its dot, on a halo of paper so the faint curves do not run through it */
        const left = x > box.r - 110;
        const note = "slow time, " + time(fit.tau);
        const at = [x + (left ? -11 : 11), y + (left ? 15 : -8)];
        ctx.font = font.note;
        ctx.textAlign = left ? "right" : "left";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        ctx.lineWidth = 4;
        ctx.strokeStyle = color.paper;
        ctx.strokeText(note, at[0], at[1]);
        text(ctx, note, at[0], at[1], { font: font.note, color: color.ink, align: left ? "right" : "left" });
      }
    }
  });

  function show() {
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === view)));
    stage.redraw();
  }

  /* It plays by itself: the chosen curve steps through the temperatures (or wave vectors) and back. */
  let direction = -1;
  let wait = 0;
  run(plot, (dt) => {
    if (hand) return;
    wait -= dt;
    if (wait > 0) return;
    const n = VIEWS[view].list.length;
    const first = view === "cooling" ? 2 : 0; /* the two coldest curves barely decay in the window; the sweep turns before them */
    let next = picked[view] + direction;
    if (next < first || next > n - 1) {
      direction = -direction;
      next = picked[view] + direction;
    }
    picked[view] = Math.max(0, Math.min(n - 1, next));
    wait = view === "both" ? 2.6 : picked[view] === first || picked[view] === n - 1 ? 1.3 : 0.62;
    stage.redraw();
  });

  buttons.forEach((b) =>
    b.addEventListener("click", () => {
      view = b.dataset.view;
      wait = 1.2;
      show();
    })
  );

  /* Point at a curve to choose it: the one nearest the pointer at that time. Leaving hands it back. */
  plot.addEventListener("pointermove", (e) => {
    if (view === "both" || !scales) return;
    const r = plot.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (x < scales.box.l || x > scales.box.r || y < scales.box.t - 10 || y > scales.box.b) return;
    let best = picked[view];
    let bestD = Infinity;
    VIEWS[view].list.forEach((c, k) => {
      const p = c.pts.reduce((a, q) => (Math.abs(scales.X(q[0]) - x) < Math.abs(scales.X(a[0]) - x) ? q : a));
      const d = Math.abs(scales.Y(p[1]) - y);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    });
    hand = true;
    if (best !== picked[view]) {
      picked[view] = best;
      stage.redraw();
    }
  });
  plot.addEventListener("pointerleave", () => {
    hand = false;
    wait = 0.8;
  });

  /* The fitted values of the slow step as a table: one row for each curve in the two slices. */
  const host = root.querySelector("[data-table]");
  if (host) {
    const el = document.createElement("table");
    el.innerHTML = '<thead><tr><th scope="col">Curve</th><th scope="col">Plateau f</th><th scope="col">Slow time</th><th scope="col">Stretch β</th></tr></thead>';
    const body = el.appendChild(document.createElement("tbody"));
    const group = (title, list, name) => {
      const head = body.appendChild(document.createElement("tr")).appendChild(document.createElement("th"));
      head.colSpan = 4;
      head.scope = "rowgroup";
      label(head, title);
      for (const c of list) {
        const tr = body.appendChild(document.createElement("tr"));
        const th = tr.appendChild(document.createElement("th"));
        th.scope = "row";
        label(th, name(c));
        for (const cell of [c.fit.f.toFixed(3), c.fit.tau ? time(c.fit.tau) : "not fitted", c.fit.tau ? c.fit.beta.toFixed(3) : "not fitted"]) tr.appendChild(document.createElement("td")).textContent = cell;
      }
    };
    group("At " + waveVector(data.waveVectorAt) + ", by temperature", data.byTemperature, (c) => c.T + " K");
    group("At " + data.temperatureAt + " K, by wave vector", data.byWaveVector, (c) => waveVector(c.q));
    host.replaceChildren(el);
  }

  show();
})();
