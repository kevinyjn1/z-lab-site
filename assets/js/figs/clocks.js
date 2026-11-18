/*
 * Research, "Two clocks in a glass-forming salt".
 *
 * A model, not measured curves: the two-step law that P. Luo, Y. Zhai, P. Falus,
 * V. Garcia-Sakai, M. Hartl, M. Kofu, K. Nakajima, A. Faraone, and Y Z fit to
 * the decay of density fluctuations in the molten salt Ca0.4K0.6(NO3)1.4 (CKN),
 * Nature Commun. 13, 2092 (2022), Eq. 1:
 *
 *   I(Q,t)/I(Q,0) = (1 - f) exp(-t/tau_fast) + f exp(-(t/tau_slow)^beta)
 *
 * run in the browser. The fast time comes from the follow-up paper, P. Luo,
 * Y. Zhai, Z. Cai, L. Trojanowski, M. Kofu, K. Nakajima, A. Faraone, and Y Z,
 * J. Phys. Chem. Lett. 16, 12386 (2025).
 *
 * Published (each constant below names its source): the equation; the ranges of
 * f and beta and how they trend with Q and temperature; the Vogel-Fulcher-
 * Tammann (VFT) law for the slow time, Eq. 2, with the D and T0 of the
 * macroscopic shear relaxation time, which the paper says match the average of
 * its low-Q values; one absolute slow time (about 15 ps at 530 K and
 * 1.86 A^-1); the range of the fast time; the change of regime at 2.4 A^-1; the
 * measured ranges of Q, temperature, and time.
 *
 * The website's own choices, because the papers' text gives ranges and trends
 * but no value at each Q and temperature (they are marked "website" below):
 *   - "in phase with S(Q)" is stood in for by one smooth bump centered on the
 *     main peak of S(Q). The measured S(Q) has a second, broad peak at
 *     2.85 A^-1 that the model leaves out.
 *   - half of each reported range (f, beta) is given to Q and half to temperature,
 *     and beta's response to temperature fades out linearly between 2.33 and
 *     2.60 A^-1, the two wave vectors at which the paper describes it.
 *   - the VFT prefactor is fixed by the one absolute slow time quoted.
 *   - the slow time is the same at every Q. The paper finds that it follows
 *     S(Q)/Q^2 and turns more Arrhenius-like above 2.4 A^-1, without numbers
 *     in the text, so the model does not show it.
 *   - the fast time is held at the middle of its reported range.
 * Nothing is illustration, and no measured point is drawn.
 */
(() => {
  "use strict";

  const root = document.querySelector('[data-fig="clocks"]');
  if (!root || !window.ZFig) return;
  const { color, font, canvas, axes, path, dot, text, rule } = window.ZFig;

  /* Luo et al. 2022, wide-angle spin echo (WASP) and time of flight (AMATERAS). */
  const Q_PEAK = 1.86; /* main peak of S(Q), 1/angstrom */
  const Q_REGIME = 2.4; /* change of regime, 1/angstrom: a length of about 2.6 angstrom */
  const F = [0.45, 0.85]; /* amplitude f of the slow step: "about 0.45 to about 0.85", in phase with S(Q) */
  const BETA = [0.45, 0.75]; /* stretching exponent: "about 0.45 to about 0.75", largest near the S(Q) maximum */
  const T_FLAT = 470; /* K: f falls linearly on heating up to here and is flat above; beta is constant above */
  const T_F_LOW = 383; /* K: lowest temperature measured; f is reported down to here */
  const T_BETA_LOW = 402; /* K: lowest temperature at which beta and the slow time are reported */
  const Q_BETA_FALLS = 2.33; /* 1/angstrom: up to here beta falls on cooling below 470 K */
  const Q_BETA_FLAT = 2.6; /* 1/angstrom: from here on beta shows no systematic temperature dependence */
  const VFT_D = 1.53; /* tau = A exp(D T0 / (T - T0)), Eq. 2: D = 1.53 +/- 0.15 from the shear relaxation time */
  const VFT_T0 = 340.0; /* K: T0 = 340.0 +/- 3.5 K, same fit */
  const WINDOW_TOF = [0.1, 6]; /* ps: time-of-flight spectra turned into the time domain (Fig. 6) */
  const WINDOW_NSE = [2.6, 1200]; /* ps: spin echo (Fig. 6) */

  /* Luo et al. 2025, inelastic neutron scattering on the same salt. */
  const TAU_FAST = 0.2; /* ps: the middle of the reported 0.1 to 0.3 ps (website: held fixed) */
  const TAU_AT = [530, 15]; /* K, ps: the slow time "is still about 15 ps at 530 K" at 1.86 1/angstrom */

  /* Website: the VFT prefactor that puts the slow time at 15 ps at 530 K. About 0.97 ps. */
  const VFT_A = TAU_AT[1] / Math.exp((VFT_D * VFT_T0) / (TAU_AT[0] - VFT_T0));
  /* Website: width (1/angstrom) of the bump that stands in for "in phase with S(Q)". */
  const BUMP = 0.3;

  const clamp = (v) => Math.max(0, Math.min(1, v));
  const model = (T, Q) => {
    const peak = Math.exp(-0.5 * Math.pow((Q - Q_PEAK) / BUMP, 2)); /* website: 1 at the S(Q) peak, 0 far from it */
    const coolF = clamp((T_FLAT - T) / (T_FLAT - T_F_LOW)); /* 0 at and above 470 K, 1 at 383 K */
    const coolB = clamp((T_FLAT - T) / (T_FLAT - T_BETA_LOW)); /* 0 at and above 470 K, 1 at and below 402 K */
    const follows = clamp((Q_BETA_FLAT - Q) / (Q_BETA_FLAT - Q_BETA_FALLS)); /* website: how much beta follows temperature */
    const halfF = (F[1] - F[0]) / 2;
    const halfB = (BETA[1] - BETA[0]) / 2;
    return {
      f: F[0] + halfF * peak + halfF * coolF,
      beta: BETA[1] - halfB * (1 - peak) - halfB * coolB * follows,
      slow: VFT_A * Math.exp((VFT_D * VFT_T0) / (T - VFT_T0)),
      fast: TAU_FAST,
    };
  };
  const decay = (m, t) => (1 - m.f) * Math.exp(-t / m.fast) + m.f * Math.exp(-Math.pow(t / m.slow, m.beta));

  const TIME_AXIS = [0.1, 10000]; /* ps: the time axis, layout; it runs a little past the measured window */
  const two = (v) => Number(v.toPrecision(2));
  const clock = (ps) => (two(ps) < 1000 ? two(ps) + " ps" : two(ps / 1000) + " ns");

  const tSlider = root.querySelector("[data-t]");
  const qSlider = root.querySelector("[data-q]");
  const out = (name) => root.querySelector("[data-" + name + "]");
  const state = { T: 444, Q: Q_PEAK };

  const stage = canvas(root.querySelector("canvas"), (w) => (w < 480 ? 310 : 350), (ctx, w, h) => {
    const box = { l: 44, t: 32, r: w - 24, b: h - 46 };
    const width = (str, f) => {
      ctx.font = f;
      return ctx.measureText(str).width;
    };
    const { X, Y } = axes(ctx, box, {
      x: TIME_AXIS,
      y: [0, 1.3],
      xLog: true,
      xTicks: box.r - box.l < 230 ? [0.1, 10, 1000] : undefined, /* every other decade on a narrow plot */
      xFormat: (v) => (v < 1000 ? v + " ps" : v / 1000 + " ns"),
      yTicks: [0, 0.25, 0.5, 0.75, 1],
      xLabel: "time (logarithmic)",
    });
    const note = (str, px, py, o) => text(ctx, str, px, py, Object.assign({ font: font.note, color: color.ink2 }, o));
    const yLabel = "fluctuation remaining, I(Q,t)/I(Q,0)";
    text(ctx, width(yLabel, font.label) <= w - box.l - 4 ? yLabel : "I(Q,t)/I(Q,0)", box.l, box.t - 16, { font: font.label, color: color.ink });

    /* Longer times than either instrument reached. */
    const xEnd = Math.round(X(WINDOW_NSE[1])) + 0.5;
    ctx.fillStyle = color.wash;
    ctx.fillRect(xEnd, box.t, box.r - xEnd, box.b - box.t);
    for (const v of [0.25, 0.5, 0.75, 1]) rule(ctx, xEnd, Math.round(Y(v)) + 0.5, box.r, Math.round(Y(v)) + 0.5, color.ruleStrong);

    /* The time windows of the two measurements. */
    const bracket = (span, level, label) => {
      const y = Math.round(Y(level)) + 0.5;
      rule(ctx, X(span[0]), y, X(span[1]), y, color.ink3);
      rule(ctx, Math.round(X(span[0])) + 0.5, y - 4, Math.round(X(span[0])) + 0.5, y + 4, color.ink3);
      rule(ctx, Math.round(X(span[1])) + 0.5, y - 4, Math.round(X(span[1])) + 0.5, y + 4, color.ink3);
      note(label, Math.max((X(span[0]) + X(span[1])) / 2, box.l + 5 + width(label, font.note) / 2), y - 10, { align: "center" });
    };
    bracket(WINDOW_TOF, 1.2, "time of flight");
    bracket(WINDOW_NSE, 1.07, "spin echo");

    const m = model(state.T, state.Q);

    /* The plateau between the two steps. */
    path(ctx, [[box.l, Y(m.f)], [box.r, Y(m.f)]], color.ink3, 1, [2, 4]);
    note("plateau f", box.r - 6, Y(m.f) - 9, { align: "right" });

    /* The slow clock: where the slow step has fallen to 1/e of its height. */
    const onPlot = m.slow <= TIME_AXIS[1];
    const xs = X(m.slow);
    const ys = Y(decay(m, m.slow));
    if (onPlot) rule(ctx, xs, ys, xs, box.b, color.ink);

    const pts = [];
    for (let i = 0; i <= 250; i++) {
      const t = TIME_AXIS[0] * Math.pow(TIME_AXIS[1] / TIME_AXIS[0], i / 250);
      pts.push([X(t), Y(decay(m, t))]);
    }
    path(ctx, pts, color.ink, 1.8);

    /* The fast clock. */
    const xf = X(m.fast);
    const yf = Y(decay(m, m.fast));
    dot(ctx, xf, yf, 3.5, color.ink);
    note("fast clock", xf + 10, yf - 9, { color: color.ink });

    const label = "slow clock " + clock(m.slow);
    if (onPlot) {
      dot(ctx, xs, ys, 6, color.maize, color.ink, 1.4);
      const fits = xs + 12 + width(label, font.note) < box.r - 4;
      if (fits) note(label, xs + 12, ys - 5, { color: color.ink });
      else note(label, xs - 12, ys + 18, { color: color.ink, align: "right" });
    } else {
      note(label + ", off the axis →", box.r - 6, Y(m.f / Math.E), { color: color.ink, align: "right" });
    }
  });

  function update() {
    const { T, Q } = state;
    const m = model(T, Q);
    const length = (2 * Math.PI / Q).toFixed(1);
    const local = Q >= Q_REGIME;
    const side = local ? "shorter than 2.6" : "longer than 2.6";
    const pair = local ? "nitrate to cation" : "nitrate to nitrate";
    if (tSlider) {
      tSlider.value = String(T);
      tSlider.setAttribute("aria-valuetext", T + " kelvin, slow clock " + clock(m.slow) + ", plateau " + m.f.toFixed(2) + ", stretch " + m.beta.toFixed(2));
    }
    if (qSlider) {
      qSlider.value = String(Q);
      qSlider.setAttribute("aria-valuetext", Q.toFixed(2) + " inverse angstroms, a length of " + length + " angstroms, " + side + " angstroms, " + pair + ", plateau " + m.f.toFixed(2) + ", stretch " + m.beta.toFixed(2));
    }
    const set = (name, str) => {
      const el = out(name);
      if (el) window.ZFig.label(el, str);
    };
    set("t-out", T + " K");
    set("q-out", Q.toFixed(2) + " Å⁻¹");
    set("f", m.f.toFixed(2));
    set("beta", m.beta.toFixed(2));
    set("slow", clock(m.slow));
    set("fast", clock(m.fast));
    set("scale", length + " Å, " + side + " Å: " + pair);
    set("limit", T < T_BETA_LOW ? "below 402 K the paper reports only f: the slow step leaves the window" : "");
    stage.redraw();
  }

  if (tSlider) {
    tSlider.addEventListener("input", () => {
      state.T = Number(tSlider.value);
      update();
    });
  }
  if (qSlider) {
    qSlider.addEventListener("input", () => {
      state.Q = Number(qSlider.value);
      update();
    });
  }

  /* What the model is built from. */
  const table = root.querySelector("[data-table]");
  if (table) {
    const rows = [
      ["Amplitude of the slow step, f", F[0] + " to " + F[1]],
      ["Stretching exponent, β", BETA[0] + " to " + BETA[1]],
      ["f and β stop changing above", T_FLAT + " K"],
      ["β follows temperature up to", Q_BETA_FALLS.toFixed(2) + " Å⁻¹"],
      ["β independent of temperature from", Q_BETA_FLAT.toFixed(2) + " Å⁻¹"],
      ["Change of regime", Q_REGIME.toFixed(1) + " Å⁻¹ (2.6 Å)"],
      ["Slow time, VFT D", "1.53 ± 0.15"],
      ["Slow time, VFT T₀", "340.0 ± 3.5 K"],
      ["Slow time at 530 K, 1.86 Å⁻¹", "about 15 ps"],
      ["Fast time", "0.1 to 0.3 ps"],
      ["Wave vectors measured", "1.08 to 2.82 Å⁻¹"],
      ["Temperatures measured", "383 to 519 K"],
      ["Times measured", "0.1 ps to 1.2 ns"],
    ];
    const el = document.createElement("table");
    el.innerHTML = "<thead><tr><th scope=\"col\">Reported in the papers</th><th scope=\"col\">Value</th></tr></thead>";
    const body = el.appendChild(document.createElement("tbody"));
    rows.forEach(([name, value]) => {
      const tr = body.appendChild(document.createElement("tr"));
      tr.appendChild(document.createElement("th")).textContent = name;
      tr.lastChild.scope = "row";
      tr.appendChild(document.createElement("td")).textContent = value.replace(/ /g, "\u00a0"); /* a value stays on one line */
    });
    table.replaceChildren(el);
  }

  update();
})();
