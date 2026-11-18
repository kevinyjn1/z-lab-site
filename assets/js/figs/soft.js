/*
 * Research, "Soft is not linear".
 *
 * Two panels.
 * First: a 100 mm bar of Dragon Skin 20 silicone pulled along its length, and the
 * stress in it against stretch under two material laws: the neo-Hookean
 * (hyperelastic) law that the lab's Kraken simulator uses, and a straight line.
 * Second: how far the oscillation frequencies simulated with Kraken fell from the
 * measured ones, for bellows actuators of three silicones carrying a 100 g mass.
 *
 * Sources:
 *   K. Wandke and Y Z, "MOOSE-based finite element hyperelastic modeling for soft
 *   robot simulations", IEEE Access 9, 139627 (2021),
 *   doi:10.1109/ACCESS.2021.3119009. Called "the statics paper" below.
 *   K. Wandke and Y Z, "Physics-based finite element simulation of the dynamics
 *   of soft robots", IEEE Access 11, 67996 (2023),
 *   doi:10.1109/ACCESS.2023.3291617. Called "the dynamics paper" below.
 *
 * What is what:
 *   The paper's equation, run in the browser: the neo-Hookean curve. It is Eq. 3
 *   of the statics paper as printed, stress = C1 (L^2 - 1/L) with L the stretch
 *   ratio, which is what Kraken's law (Eq. 2, stress = 2 D1 (J - 1) I + 2 C1 B)
 *   gives for an incompressible bar pulled along its length. C1 is that paper's
 *   value for Dragon Skin 20.
 *   Derived here, not taken from the paper: the linear law. It is the tangent to
 *   that curve at rest, stress = 3 C1 (L - 1): the straight line that agrees with
 *   it for small stretch. The paper also ran a linear-elastic finite element
 *   model for comparison; its modulus was not to hand when this figure was
 *   written, so that run is not reproduced here.
 *   Published data, re-plotted: the measured and simulated frequencies in TESTS
 *   (Tables 1 to 3 of the dynamics paper). The percentage differences are
 *   computed here from those two columns; the paper does not print them.
 *   Illustration: the drawing of the bar. Its length follows the stretch and its
 *   thinning follows from constant volume; nothing else is implied.
 *
 * On the material constant: the two papers use different C1 for Dragon Skin 20
 * (0.0822 MPa in the statics paper, 0.116 MPa in the dynamics paper). The curve
 * uses only the statics paper's value, with that paper's equation. The second
 * panel uses no material constant at all.
 */
(() => {
  "use strict";

  const root = document.querySelector('[data-fig="soft"]');
  if (!root || !window.ZFig) return;
  const { color, font, canvas, axes, path, dot, text, rule, pointer } = window.ZFig;

  /* C1 = 0.0822 MPa for Dragon Skin 20: the best neo-Hookean fit over 0 to 110% strain (statics paper). In kPa. */
  const C1 = 82.2;
  /* The paper's test bar is 100 mm x 10 mm x 10 mm (statics paper). */
  const BAR = { length: 100, side: 10 };
  /* Its bar test ran to 192 mm of displacement, where simulation was at most 10.8 kPa under this curve (statics paper). */
  const L_MAX = 2.92;
  const hyper = (L) => C1 * (L * L - 1 / L); /* Eq. 3 of the statics paper, as printed */
  const linear = (L) => 3 * C1 * (L - 1); /* its tangent at L = 1, where d/dL of Eq. 3 is 3 C1 */

  /*
   * Resonant frequencies in Hz of a bellows with a 100 g mass, measured by motion capture and simulated with
   * Kraken, for Ecoflex 00-50, Dragon Skin 20, and Dragon Skin 30 in that order (dynamics paper).
   * Each row: direction of motion, measured, simulated.
   */
  const RUBBERS = ["Ecoflex 00-50", "Dragon Skin 20", "Dragon Skin 30"];
  const TESTS = [
    { name: "Bounce", rows: [["vertical", [2.05, 4.2, 5.57], [2.06, 4.33, 5.44]]] } /* Table 1 */,
    {
      name: "Swing in a plane" /* Table 2 */,
      rows: [
        ["vertical", [2.01, 2.88, 3.07], [1.85, 3.14, 3.25]],
        ["horizontal", [1.04, 1.44, 1.53], [1.3, 1.58, 1.62]],
      ],
    },
    {
      name: "Swing in 3D" /* Table 3 */,
      rows: [
        ["vertical", [1.91, 2.96, 3.22], [2.82, 3.31, 3.52]],
        ["horizontal", [1.1, 1.57, 1.61], [1.45, 1.69, 1.78]],
        ["depth", [1.1, 1.57, 1.61], [1.45, 1.77, 1.87]],
      ],
    },
  ];
  const off = (measured, simulated) => (100 * (simulated - measured)) / measured;

  /* ---- The bar and the two laws --------------------------------------------- */

  const slider = root.querySelector("[data-stretch]");
  const readout = root.querySelector("[data-readout]");
  let stretch = slider ? Number(slider.value) : 2.5;

  const WALL = 14; /* x of the wall the bar is fixed to */
  const BAND = 100; /* height of the strip the bar is drawn in */
  const geometry = (w, h) => ({ unit: (w - WALL - 24) / L_MAX, box: { l: 46, t: BAND + 6, r: w - 14, b: h - 44 } });

  const barCanvas = root.querySelector("canvas");
  const stage = canvas(barCanvas, (w) => (w < 480 ? 372 : 410), (ctx, w, h) => {
    const { unit, box } = geometry(w, h);
    const y = 46;
    const end = WALL + stretch * unit;
    const rest = (unit * BAR.side) / BAR.length;
    const thick = rest / Math.sqrt(stretch); /* constant volume: the cross-section shrinks as the bar lengthens */

    /* The wall, the bar at rest (dashed), and the bar as stretched, with ten marks that were evenly spaced at rest. */
    for (let k = -24; k <= 16; k += 8) rule(ctx, WALL, y + k, WALL - 8, y + k + 8, color.ink3);
    rule(ctx, WALL, y - 25, WALL, y + 25, color.ink, 2);
    path(ctx, [[WALL, y - rest / 2], [WALL + unit, y - rest / 2], [WALL + unit, y + rest / 2], [WALL, y + rest / 2]], color.ink3, 1, [3, 3]);
    ctx.fillStyle = color.wash;
    ctx.fillRect(WALL, y - thick / 2, end - WALL, thick);
    for (let k = 1; k < 10; k++) {
      const x = Math.round(WALL + ((end - WALL) * k) / 10) + 0.5;
      rule(ctx, x, y - thick / 2, x, y + thick / 2, color.ink3);
    }
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = color.ink;
    ctx.strokeRect(WALL, y - thick / 2, end - WALL, thick);
    dot(ctx, end, y, 6, color.maize, color.ink, 1.6);
    text(ctx, Math.round(BAR.length * stretch) + " mm", Math.min(end, w - 24), y - 28, { color: color.ink, align: "center" });
    text(ctx, BAR.length + " mm at rest", WALL + 6, y + 30, { font: font.note, color: color.ink3 });

    const { X, Y } = axes(ctx, box, {
      x: [1, 3],
      y: [0, 800],
      xTicks: [1, 1.5, 2, 2.5, 3],
      yTicks: [0, 200, 400, 600, 800],
      xFormat: (v) => v.toFixed(1),
      xLabel: "length ÷ rest length",
      yLabel: "stress (kPa)",
    });
    const curve = (law) => {
      const pts = [];
      for (let k = 0; k <= 100; k++) pts.push([X(1 + k / 50), Y(law(1 + k / 50))]);
      return pts;
    };
    path(ctx, curve(linear), color.ink3, 1.5, [5, 4]);
    path(ctx, curve(hyper), color.ink, 1.8);

    /* The two laws at this stretch. */
    const x = Math.round(X(stretch)) + 0.5;
    rule(ctx, x, Y(hyper(stretch)), x, box.b, color.ruleStrong);
    dot(ctx, x, Y(linear(stretch)), 3.5, color.paper, color.ink, 1.4);
    dot(ctx, x, Y(hyper(stretch)), 5.5, color.maize, color.ink, 1.6);

    const lx = box.l + 12;
    const ly = box.t + 36;
    const vx = Math.min(lx + 166, box.r - 30); /* the values keep clear of the curve on the narrowest screens */
    path(ctx, [[lx, ly], [lx + 20, ly]], color.ink, 1.8);
    text(ctx, "neo-Hookean", lx + 28, ly, { font: font.note, color: color.ink });
    text(ctx, Math.round(hyper(stretch)) + " kPa", vx, ly, { color: color.ink, align: "right" });
    path(ctx, [[lx, ly + 18], [lx + 20, ly + 18]], color.ink3, 1.5, [5, 4]);
    text(ctx, "linear", lx + 28, ly + 18, { font: font.note, color: color.ink });
    text(ctx, Math.round(linear(stretch)) + " kPa", vx, ly + 18, { color: color.ink, align: "right" });
    text(ctx, "C₁ = 0.0822 MPa", lx, ly + 37, { color: color.ink3 });
  });

  function set(value) {
    stretch = Math.max(1, Math.min(L_MAX, Math.round(value * 100) / 100));
    const a = Math.round(hyper(stretch));
    const b = Math.round(linear(stretch));
    if (slider) {
      slider.value = String(stretch);
      slider.setAttribute("aria-valuetext", stretch.toFixed(2) + " times the rest length: neo-Hookean " + a + " kilopascals, linear " + b + " kilopascals");
    }
    if (readout) readout.textContent = "stretch " + stretch.toFixed(2);
    stage.redraw();
  }
  if (slider) {
    slider.max = String(L_MAX);
    slider.addEventListener("input", () => set(Number(slider.value)));
  }

  /* The bar's end, or the plot, can also be dragged. A touch must move sideways first, so scrolling the page is left alone. */
  let drag = null;
  const stretchAt = (x) => {
    const { unit, box } = geometry(stage.w, stage.h);
    return drag.onBar ? (x - WALL) / unit : 1 + (2 * (x - box.l)) / (box.r - box.l);
  };
  pointer(barCanvas, {
    down: (x, y, e) => {
      drag = { x, y, onBar: y < BAND, live: e.pointerType === "mouse" };
      if (drag.live) {
        try {
          barCanvas.setPointerCapture(e.pointerId); /* keep following the mouse past the canvas edge */
        } catch (err) {
          /* the pointer is already gone: nothing to follow */
        }
        set(stretchAt(x));
      }
    },
    move: (x, y) => {
      if (!drag) return;
      if (!drag.live && (Math.abs(x - drag.x) < 10 || Math.abs(x - drag.x) < Math.abs(y - drag.y))) return;
      drag.live = true;
      set(stretchAt(x));
    },
  });
  for (const type of ["pointerup", "pointercancel"]) barCanvas.addEventListener(type, () => (drag = null));
  barCanvas.style.cursor = "ew-resize";

  /* ---- Kraken against measurement ------------------------------------------- */

  const fills = [color.paper, color.ruleStrong, color.ink]; /* softest rubber lightest */
  const checkCanvas = root.querySelector("canvas[data-check]");
  if (checkCanvas) {
    const wraps = (w) => w < 350; /* the third legend entry drops to a second line */
    canvas(checkCanvas, (w) => (wraps(w) ? 290 : 274), (ctx, w) => {
      const l = 104;
      const r = w - 16;
      const X = (v) => l + ((v + 10) / 60) * (r - l);
      text(ctx, "Kraken against experiment", 0, 8, { font: font.note, color: color.ink });
      let kx = 0;
      let ky = 28;
      RUBBERS.forEach((name, i) => {
        if (i === 2 && wraps(w)) {
          kx = 0;
          ky += 16;
        }
        dot(ctx, kx + 5, ky, 4.5, fills[i], color.ink, 1.3);
        text(ctx, name, kx + 14, ky, { font: font.note });
        kx += 14 + ctx.measureText(name).width + 16;
      });

      const top = ky + 16;
      let y = top + 8;
      const marks = [];
      for (const test of TESTS) {
        text(ctx, test.name, 0, y, { font: font.note, color: color.ink });
        y += 17;
        for (const [direction, measured, simulated] of test.rows) {
          text(ctx, direction, 10, y, { font: font.note });
          marks.push([y, measured.map((m, i) => off(m, simulated[i]))]);
          y += 17;
        }
        y += 7;
      }
      const base = y - 12;
      for (const v of [-10, 10, 20, 30, 40, 50]) rule(ctx, Math.round(X(v)) + 0.5, top, Math.round(X(v)) + 0.5, base, color.rule);
      for (const [my] of marks) rule(ctx, l, my + 0.5, r, my + 0.5, color.rule);
      rule(ctx, Math.round(X(0)) + 0.5, top, Math.round(X(0)) + 0.5, base, color.ink);
      for (const [my, values] of marks) values.forEach((v, i) => dot(ctx, X(v), my, 4.5, fills[i], color.ink, 1.3));
      rule(ctx, l, base + 0.5, r, base + 0.5, color.ink);
      for (const v of [-10, 0, 10, 20, 30, 40, 50]) {
        const x = Math.round(X(v)) + 0.5;
        rule(ctx, x, base, x, base + 4, color.ink);
        if (r - l < 190 && v % 20) continue; /* every other label where they would touch */
        text(ctx, (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v), x, base + 13, { align: "center" });
      }
      text(ctx, "simulated − measured frequency (%)", r, base + 32, { font: font.label, color: color.ink, align: "right" });
    }).redraw();
  }

  /* The same frequencies as a table. */
  const table = root.querySelector("[data-table]");
  if (table) {
    const el = document.createElement("table");
    el.innerHTML = '<thead><tr><th scope="col">Silicone</th><th scope="col">Measured (Hz)</th><th scope="col">Simulated (Hz)</th><th scope="col">Difference</th></tr></thead>';
    for (const test of TESTS) {
      for (const [direction, measured, simulated] of test.rows) {
        const body = el.appendChild(document.createElement("tbody"));
        const head = body.appendChild(document.createElement("tr")).appendChild(document.createElement("th"));
        head.colSpan = 4;
        head.scope = "rowgroup";
        head.textContent = test.name + ", " + direction;
        RUBBERS.forEach((name, i) => {
          const tr = body.appendChild(document.createElement("tr"));
          tr.appendChild(document.createElement("th")).textContent = name;
          tr.lastChild.scope = "row";
          const d = off(measured[i], simulated[i]);
          for (const cell of [measured[i].toFixed(2), simulated[i].toFixed(2), (d < 0 ? "−" : "+") + Math.abs(d).toFixed(1) + "%"]) tr.appendChild(document.createElement("td")).textContent = cell;
        });
      }
    }
    table.replaceChildren(el);
  }

  set(stretch);
})();
