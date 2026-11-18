/*
 * Research, "Be the controller: steer the underwater arm".
 *
 * A top view of the lab's two-module, water-driven soft arm in its shallow tank,
 * with its eight valves handed to the visitor, and under it the published scores
 * of five controllers on the real arm.
 *
 * Sources:
 *   W. D. Null, J. Menezes, and Y Z, "Development of a modular and submersible
 *   soft robotic arm and corresponding learned kinematics models", 2023 IEEE
 *   International Conference on Soft Robotics (RoboSoft), pp. 1-6,
 *   doi:10.1109/RoboSoft55895.2023.10122035 (the published version). Called
 *   "the hardware paper" below.
 *   W. D. Null, W. Edwards, D. Jeong, T. Tchalakov, J. Menezes, K. Hauser, and
 *   Y Z, "Automatically-tuned model predictive control for an underwater soft
 *   robot", IEEE Robot. Autom. Lett. 9(1), 571 (2024),
 *   doi:10.1109/LRA.2023.3333662. Called "the control paper" below.
 *
 * What is what:
 *   Published data, re-plotted as printed: the scores in SCORES (Table I of the
 *   control paper), in the bar chart and in the table.
 *   Published numbers used as settings: module lengths, the pressure range and
 *   its limit, the command rate, the time limit, the goal size, three target
 *   positions, the pressure difference at which each module starts to bend, the
 *   bend it reaches at 20 kPa, and the average times the bench test took to fill
 *   and to empty a bellows. Each is marked where it is defined.
 *   A simplified model written for this site: everything about how the arm moves
 *   (the functions shape, along, and step). A module is a circular arc; its
 *   length follows the mean pressure of its two bellows and its bend follows
 *   their difference, both in straight lines between the published end values,
 *   and a bellows fills and empties at a constant rate. This is not the lab's
 *   learned model and not recorded motion. It leaves out the hysteresis the
 *   hardware paper measured (on the real arm the lower module stays bent by 8.5
 *   degrees after emptying) and the left-right asymmetry the control paper
 *   reports. Nothing here imitates how any of the five controllers behaved.
 *   Drawing: the arm is redrawn after the same line drawing as Fig. 2 of the
 *   home page (base plate, two bellows per module, rungs with three markers).
 */
(() => {
  "use strict";

  const root = document.querySelector('[data-fig="arm"]');
  if (!root || !window.ZFig) return;
  const { color, font, canvas, axes, path, dot, text, rule, run } = window.ZFig;

  /*
   * Working pressure of a bellows: 97 kPa to 118 kPa, above which it may be damaged; a run is stopped if one goes
   * over (control paper). The model takes the two ends as the fully depressurized and fully pressurized states.
   */
  const P_REST = 97;
  const P_LIMIT = 118;
  /* The eight valves are commanded twice a second (control paper; the hardware paper samples at the same 2 Hz). */
  const COMMAND_HZ = 2;
  /* Each run on a target inside the task space lasts 50 s (control paper). */
  const RUN_SECONDS = 50;
  /* A goal is a 2 cm by 2 cm square centered on its target (control paper). */
  const GOAL_SIDE = 2;
  /* Three of the paper's targets, in cm from the fixed base with y along the straight arm: those of Fig. 7 of the control paper. */
  const GOALS = [
    { x: -9, y: 27 },
    { x: 1, y: 33 },
    { x: 9, y: 27 },
  ];
  /* The 40 targets lie on a grid spanning about x = -9 to 9 cm and y = 25 to 35 cm (read from Fig. 3 of the control paper, so approximate). */
  const TARGET_AREA = { x: [-9, 9], y: [25, 35] };
  /*
   * One entry per module, base first (hardware paper):
   *   rest, full   a module is 12 cm long fully depressurized and 19 cm fully pressurized,
   *                which gives the arm's 240 mm and 380 mm of the control paper;
   *   onset        while filling, module 1 starts to bend above a pressure difference of 2 kPa, module 2 above 1 kPa;
   *   bend         the bend reached for the test's 20 kPa pressure difference: 29 and 33 degrees;
   *   fill, drain  the bench test raised one bellows by 20 kPa in 37 s (module 1) and 42 s (module 2) on average
   *                and emptied it in 62 s and 73 s. Taking these as constant rates is this model's assumption.
   */
  const BEND_AT = 20;
  const MODULES = [
    { rest: 12, full: 19, onset: 2, bend: 29, fill: BEND_AT / 37, drain: BEND_AT / 62 },
    { rest: 12, full: 19, onset: 1, bend: 33, fill: BEND_AT / 42, drain: BEND_AT / 73 },
  ];
  /*
   * Table I of the control paper, as printed, with its names for the controllers: open-loop inverse kinematics (IK),
   * visual servo, conservative Q-learning (CQL), trust region policy optimization (TRPO), and AutoMPC, the
   * automatically tuned model predictive controller. "task": the 40 targets inside the task space, 50 s per run.
   * "outside": the 18 targets at least 4 cm outside it, 70 s per run. Each row: goals passed through at any
   * time, goals still held at the end, final tip error in cm as mean (std), seconds outside the goal as mean (std).
   */
  const SCORES = [
    { name: "Open-loop IK", task: [14, 7, "2.407 (1.432)", "43.862 (10.449)"], outside: [0, 0, "4.713 (2.295)", "70.0 (0.0)"] },
    { name: "Visual servo", task: [27, 15, "1.382 (0.763)", "40.647 (12.839)"], outside: [6, 4, "2.844 (3.877)", "64.063 (13.963)"] },
    { name: "CQL", task: [14, 4, "2.765 (1.724)", "42.488 (13.633)"], outside: [2, 0, "5.826 (4.452)", "68.372 (4.854)"] },
    { name: "TRPO", task: [35, 2, "4.259 (2.058)", "41.931 (5.304)"], outside: [5, 1, "2.740 (1.595)", "65.61 (8.025)"] },
    { name: "AutoMPC", task: [40, 39, "0.296 (0.249)", "19.113 (8.343)"], outside: [10, 7, "1.496 (1.604)", "55.318 (18.723)"] },
  ];
  const TASK_TARGETS = 40;

  /* ---- The simplified model ------------------------------------------------ */

  /* The point a fraction u along a module: a circular arc of length len that turns by `bend` radians (positive toward +x). */
  function along(m, u) {
    const a = m.phi + m.bend * u;
    if (Math.abs(m.bend) < 1e-6) return { x: m.x + m.len * u * Math.sin(m.phi), y: m.y + m.len * u * Math.cos(m.phi), phi: a };
    const r = m.len / m.bend;
    return { x: m.x + r * (Math.cos(m.phi) - Math.cos(a)), y: m.y + r * (Math.sin(a) - Math.sin(m.phi)), phi: a };
  }

  /* Pressures [module 1 left, module 1 right, module 2 left, module 2 right] in kPa to the arm's shape in cm. */
  function shape(p) {
    const mods = [];
    let at = { x: 0, y: 0, phi: 0 };
    MODULES.forEach((k, i) => {
      const left = p[2 * i];
      const right = p[2 * i + 1];
      const len = k.rest + (k.full - k.rest) * (((left + right) / 2 - P_REST) / (P_LIMIT - P_REST));
      /* The fuller bellows is the longer one, so the module bends away from it. */
      const dp = left - right;
      const part = Math.min(1, Math.max(0, Math.abs(dp) - k.onset) / (BEND_AT - k.onset));
      const mod = { x: at.x, y: at.y, phi: at.phi, len, bend: (Math.sign(dp) * part * k.bend * Math.PI) / 180 };
      mods.push(mod);
      at = along(mod, 1);
    });
    return { mods, tip: at };
  }

  const sim = {
    state: "ready" /* ready, running, paused, ended */,
    goal: 2,
    p: [P_REST, P_REST, P_REST, P_REST],
    open: new Array(8).fill(false) /* the valves as last commanded: [inlet, outlet] for each bellows */,
    want: new Array(8).fill(false) /* the valves as the buttons stand */,
    t: 0,
    nextCommand: 0,
    outside: 0,
    trail: [],
  };
  const inGoal = (tip) => Math.abs(tip.x - GOALS[sim.goal].x) <= GOAL_SIDE / 2 && Math.abs(tip.y - GOALS[sim.goal].y) <= GOAL_SIDE / 2;
  const toTarget = (tip) => Math.hypot(tip.x - GOALS[sim.goal].x, tip.y - GOALS[sim.goal].y);

  /* ---- Drawing the arm ------------------------------------------------------ */

  const VIEW = { x: [-17, 17], y: [-5, 39.2] };
  const SPAN = { x: VIEW.x[1] - VIEW.x[0], y: VIEW.y[1] - VIEW.y[0] };
  const SIDE_GAUGE = 90; /* the narrowest a gauge beside the tank may be */
  const SIDE_SCALE = 10; /* pixels per cm when the gauges fit beside the tank */

  /* Wide: the tank with two gauges on either side. Narrow: the tank, then the gauges in a strip under it. */
  function layout(w) {
    const side = w >= SPAN.x * SIDE_SCALE + 2 * (SIDE_GAUGE + 38);
    const s = side ? SIDE_SCALE : Math.min((w - 28) / SPAN.x, 9);
    const l = Math.round(side ? (w - SPAN.x * s) / 2 + 6 : 26 + (w - 28 - SPAN.x * s) / 2);
    return { side, s, box: { l, t: 6, r: l + SPAN.x * s, b: 6 + SPAN.y * s } };
  }

  function stadium(ctx, cx, cy, rot, w, h, lw) {
    const r = h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.moveTo(-w / 2 + r, -r);
    ctx.lineTo(w / 2 - r, -r);
    ctx.arc(w / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(-w / 2 + r, r);
    ctx.arc(-w / 2 + r, 0, r, Math.PI / 2, (3 * Math.PI) / 2);
    ctx.closePath();
    ctx.fillStyle = color.paper;
    ctx.fill();
    ctx.lineWidth = lw;
    ctx.strokeStyle = color.ink;
    ctx.stroke();
    ctx.restore();
  }

  /* Sizes in cm, taken from the home page's drawing of the same arm at 1 unit to 1 mm. */
  function drawArm(ctx, X, Y, s, sh) {
    const lw = Math.max(1.1, 0.16 * s);
    /* A point at distance d along module m, o cm to the right of its centerline; the third value is the heading. */
    const at = (m, d, o) => {
      const q = along(m, d / m.len);
      return [X(q.x + o * Math.cos(q.phi)), Y(q.y - o * Math.sin(q.phi)), q.phi];
    };
    const markers = (m, d, tip) => {
      for (const o of [-0.8, 0, 0.8]) {
        const q = at(m, d, o);
        if (!(tip && o === 0)) dot(ctx, q[0], q[1], 0.27 * s, color.paper, color.ink, 1.1);
      }
    };

    /* Base plate and bracket. */
    ctx.lineWidth = lw;
    ctx.strokeStyle = color.ink;
    ctx.fillStyle = color.paper;
    ctx.beginPath();
    ctx.rect(X(-5.8), Y(-0.8), 11.6 * s, 2 * s);
    ctx.fill();
    ctx.stroke();
    path(ctx, [[X(-3.8), Y(-2.8)], [X(-3.8), Y(-4.4)], [X(3.8), Y(-4.4)], [X(3.8), Y(-2.8)]], color.ink, lw);

    sh.mods.forEach((m, i) => {
      const a = i === 0 ? 0 : 0.7; /* where the end plates sit along the module */
      const b = i === 0 ? m.len - 0.7 : m.len;
      for (const o of [-2.3, 2.3]) {
        /* The neck of the bellows, seen between the ridges once it stretches. */
        const neck = [];
        for (let k = 0; k <= 16; k++) neck.push(at(m, a + ((b - a) * k) / 16, o));
        path(ctx, neck, color.ink, 1.5 * s);
        path(ctx, neck, color.paper, 1.5 * s - 2 * lw);
        for (let k = 0; k < 10; k++) {
          const q = at(m, a + 0.62 + ((b - a - 0.62) * k) / 9, o);
          ctx.beginPath();
          ctx.ellipse(q[0], q[1], 1.35 * s, 0.56 * s, q[2], 0, Math.PI * 2);
          ctx.fillStyle = color.paper;
          ctx.fill();
          ctx.lineWidth = lw;
          ctx.strokeStyle = color.ink;
          ctx.stroke();
        }
      }
      for (let k = 1; k <= 4; k++) {
        const d = a + ((b - a) * k) / 5;
        const rung = [at(m, d, -1.5), at(m, d, 1.5)];
        path(ctx, rung, color.ink, 0.55 * s);
        path(ctx, rung, color.paper, 0.29 * s);
        markers(m, d);
      }
      for (const d of [a, b]) {
        const q = at(m, d, 0);
        stadium(ctx, q[0], q[1], q[2], 8.4 * s, 1.3 * s, lw);
      }
      if (i === 0) markers(m, a);
      markers(m, b, i === sh.mods.length - 1);
    });
  }

  /* A pressure gauge: a bar from 97 kPa to the 118 kPa limit, which is the heavy tick at its end. */
  function gauge(ctx, x, y, bw, p) {
    const f = Math.max(0, Math.min(1, (p - P_REST) / (P_LIMIT - P_REST)));
    ctx.fillStyle = color.paper;
    ctx.fillRect(x, y, bw, 9);
    ctx.fillStyle = color.ink;
    ctx.fillRect(x, y, bw * f, 9);
    ctx.lineWidth = 1;
    ctx.strokeStyle = color.ink;
    ctx.strokeRect(x + 0.5, y + 0.5, bw - 1, 8);
    rule(ctx, x + bw - 1, y - 3, x + bw - 1, y + 12, color.ink, 2);
  }

  const armCanvas = root.querySelector("canvas");
  const stage = canvas(
    armCanvas,
    (w) => {
      const L = layout(w);
      return L.box.b + 44 + (L.side ? 0 : 82);
    },
    (ctx, w) => {
      const { side, s, box } = layout(w);
      const { X, Y } = axes(ctx, box, {
        x: VIEW.x,
        y: VIEW.y,
        xTicks: [-10, 0, 10],
        yTicks: [0, 10, 20, 30],
        xFormat: (v) => String(v).replace("-", "−"),
        grid: false,
        xLabel: "x (cm)",
        yLabel: "y (cm)",
      });
      /* The other two walls of the tank. */
      rule(ctx, box.l, box.t + 0.5, box.r, box.t + 0.5, color.ruleStrong);
      rule(ctx, box.r - 0.5, box.t, box.r - 0.5, box.b, color.ruleStrong);

      const sh = shape(sim.p);
      const goal = GOALS[sim.goal];
      ctx.save();
      ctx.beginPath();
      ctx.rect(box.l + 1, box.t + 1, box.r - box.l - 2, box.b - box.t - 2);
      ctx.clip();

      const ax = TARGET_AREA.x;
      const ay = TARGET_AREA.y;
      path(ctx, [[X(ax[0]), Y(ay[0])], [X(ax[1]), Y(ay[0])], [X(ax[1]), Y(ay[1])], [X(ax[0]), Y(ay[1])], [X(ax[0]), Y(ay[0])]], color.ink3, 1, [3, 4]);
      text(ctx, s < 7.5 ? "the 40 targets" : "area of the 40 targets", X(ax[1]), Y(ay[1]) - 10, { font: font.note, color: color.ink3, align: "right" });

      drawArm(ctx, X, Y, s, sh);
      /* Where the tip has been. */
      if (sim.trail.length > 1) path(ctx, sim.trail.map((q) => [X(q[0]), Y(q[1])]), color.ink2, 1.2, [2, 3]);

      /* The goal: the one thing to read. The tip is the black dot. */
      const gs = GOAL_SIDE * s;
      ctx.fillStyle = color.maize;
      ctx.fillRect(X(goal.x) - gs / 2, Y(goal.y) - gs / 2, gs, gs);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = color.ink;
      ctx.strokeRect(X(goal.x) - gs / 2, Y(goal.y) - gs / 2, gs, gs);
      const left = goal.x < 0;
      const lx = X(goal.x) + (left ? -1 : 1) * (gs / 2 + 7);
      ctx.font = font.note;
      ctx.textAlign = left ? "right" : "left";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.lineWidth = 4;
      ctx.strokeStyle = color.paper; /* a paper edge, so the word stays readable when the arm passes under it */
      ctx.strokeText("goal", lx, Y(goal.y));
      text(ctx, "goal", lx, Y(goal.y), { font: font.note, color: color.ink, align: left ? "right" : "left" });
      dot(ctx, X(sh.tip.x), Y(sh.tip.y), 0.42 * s, color.ink, color.paper, 1.4);
      ctx.restore();

      /* Four gauges, placed as the bellows are: left and right, module 2 above module 1. */
      const value = (i) => sim.p[i].toFixed(1);
      if (side) {
        const gw = Math.min(118, box.l - 38);
        [box.l - 34 - gw, box.r + 16].forEach((gx, col) => {
          text(ctx, (col ? "right" : "left") + " bellows", gx, box.t + 10, { font: font.note, color: color.ink });
          [1, 0].forEach((mod) => {
            const y = Y(mod ? 18 : 6);
            text(ctx, "module " + (mod + 1), gx, y - 16, { font: font.note });
            text(ctx, value(2 * mod + col), gx + gw, y - 16, { color: color.ink, align: "right" });
            gauge(ctx, gx, y - 6, gw, sim.p[2 * mod + col]);
            text(ctx, String(P_REST), gx, y + 14, { color: color.ink3 });
            text(ctx, P_LIMIT + " kPa", gx + gw, y + 14, { color: color.ink3, align: "right" });
          });
        });
      } else {
        /* Under the tank on a narrow screen: a row per module, a column per side, like the valve buttons below. */
        const sw = Math.min(w, 420);
        const sx = (w - sw) / 2;
        const top = box.b + 44;
        const lab = 62;
        const cw = (sw - lab) / 2;
        const bw = cw - 46;
        [sx + lab, sx + lab + cw].forEach((gx, col) => {
          text(ctx, (col ? "right" : "left") + " bellows", gx, top + 8, { font: font.note, color: color.ink });
          [1, 0].forEach((mod, row) => {
            const y = top + 24 + row * 22;
            gauge(ctx, gx, y, bw, sim.p[2 * mod + col]);
            text(ctx, value(2 * mod + col), gx + bw + 7, y + 5, { color: color.ink });
          });
          text(ctx, String(P_REST), gx, top + 68, { color: color.ink3 });
          text(ctx, P_LIMIT + (bw < 70 ? "" : " kPa"), gx + bw, top + 68, { color: color.ink3, align: "right" });
        });
        [1, 0].forEach((mod, row) => text(ctx, "module " + (mod + 1), sx, top + 29 + row * 22, { font: font.note }));
      }
    }
  );

  /* ---- The scores on the real arm ------------------------------------------- */

  const scoresCanvas = root.querySelector("canvas[data-scores]");
  if (scoresCanvas) {
    const stacked = (w) => w < 290; /* the legend takes two lines on the narrowest screens */
    canvas(scoresCanvas, (w) => (stacked(w) ? 230 : 214), (ctx, w) => {
      const l = 88;
      const r = w - 26;
      const top = stacked(w) ? 60 : 44;
      const pitch = 28;
      const bottom = top + SCORES.length * pitch;
      const X = (v) => l + (v / TASK_TARGETS) * (r - l);
      text(ctx, "On the real arm: 40 targets, 50 s each", 0, 8, { font: font.note, color: color.ink });

      /* Legend. */
      ctx.fillStyle = color.ink;
      ctx.fillRect(0, 22, 10, 9);
      text(ctx, "in the goal at the end", 15, 27, { font: font.note });
      const kx = stacked(w) ? 0 : 15 + ctx.measureText("in the goal at the end").width + 16;
      const ky = stacked(w) ? 38 : 22;
      ctx.fillStyle = color.wash;
      ctx.fillRect(kx, ky, 10, 9);
      ctx.lineWidth = 1;
      ctx.strokeStyle = color.ink3;
      ctx.strokeRect(kx + 0.5, ky + 0.5, 9, 8);
      text(ctx, "passed through it", kx + 15, ky + 5, { font: font.note });

      for (const v of [10, 20, 30, 40]) rule(ctx, Math.round(X(v)) + 0.5, top - 2, Math.round(X(v)) + 0.5, bottom, color.rule);
      SCORES.forEach((row, i) => {
        const y = top + i * pitch;
        const [passed, held] = row.task;
        text(ctx, row.name, 0, y + 11, { font: font.note, color: color.ink });
        ctx.fillStyle = color.ink;
        ctx.fillRect(l, y + 1, X(held) - l, 9);
        text(ctx, String(held), X(held) + 5, y + 6, { color: color.ink });
        ctx.fillStyle = color.wash;
        ctx.fillRect(l, y + 12, X(passed) - l, 9);
        ctx.lineWidth = 1;
        ctx.strokeStyle = color.ink3;
        ctx.strokeRect(l + 0.5, y + 12.5, X(passed) - l - 1, 8);
        text(ctx, String(passed), X(passed) + 5, y + 17, { color: color.ink3 });
      });
      rule(ctx, l + 0.5, top - 2, l + 0.5, bottom + 0.5, color.ink);
      rule(ctx, l, bottom + 0.5, r, bottom + 0.5, color.ink);
      for (const v of [0, 10, 20, 30, 40]) {
        const x = Math.round(X(v)) + 0.5;
        rule(ctx, x, bottom, x, bottom + 4, color.ink);
        text(ctx, String(v), x, bottom + 13, { align: "center" });
      }
      text(ctx, "targets", l - 10, bottom + 13, { font: font.note, align: "right" });
    }).redraw();
  }

  /* The same scores, and those for the targets outside the task space, as a table. */
  const table = root.querySelector("[data-table]");
  if (table) {
    const el = document.createElement("table");
    el.innerHTML = '<thead><tr><th scope="col">Controller</th><th scope="col">Passed through goal</th><th scope="col">In goal at end</th><th scope="col">Final tip error, mean (std), cm</th><th scope="col">Time outside goal, mean (std), s</th></tr></thead>';
    for (const [key, title] of [["task", "40 targets inside the task space, 50 s per run"], ["outside", "18 targets at least 4 cm outside it, 70 s per run"]]) {
      const body = el.appendChild(document.createElement("tbody"));
      const head = body.appendChild(document.createElement("tr")).appendChild(document.createElement("th"));
      head.colSpan = 5;
      head.scope = "rowgroup";
      head.textContent = title;
      for (const row of SCORES) {
        const tr = body.appendChild(document.createElement("tr"));
        tr.appendChild(document.createElement("th")).textContent = row.name;
        tr.lastChild.scope = "row";
        for (const cell of row[key]) tr.appendChild(document.createElement("td")).textContent = String(cell);
      }
    }
    table.replaceChildren(el);
  }

  /* ---- The run --------------------------------------------------------------- */

  const valveButtons = Array.from(root.querySelectorAll("[data-valve]"));
  const goalButtons = Array.from(root.querySelectorAll("[data-goal]"));
  const startButton = root.querySelector("[data-start]");
  const resetButton = root.querySelector("[data-reset]");
  const out = { time: root.querySelector("[data-time]"), dist: root.querySelector("[data-dist]"), outside: root.querySelector("[data-outside]") };
  const status = root.querySelector("[data-status]");
  const BELLOWS = ["module 1 left", "module 1 right", "module 2 left", "module 2 right"];
  const valveIndex = (b) => 2 * Number(b.dataset.valve) + (b.dataset.way === "drain" ? 1 : 0);

  function show() {
    const tip = shape(sim.p).tip;
    const set = (el, str) => {
      if (el && el.textContent !== str) el.textContent = str;
    };
    set(out.time, (RUN_SECONDS - sim.t).toFixed(1) + " s");
    set(out.dist, toTarget(tip).toFixed(1) + " cm");
    set(out.outside, sim.outside.toFixed(1) + " s");
    stage.redraw();
  }

  function setState(state, message) {
    sim.state = state;
    if (startButton) startButton.textContent = { ready: "Start", running: "Pause", paused: "Resume", ended: "Try again" }[state];
    if (state === "ended") {
      sim.want.fill(false);
      sim.open.fill(false);
      const held = valveButtons.includes(document.activeElement);
      valveButtons.forEach((b) => {
        b.setAttribute("aria-pressed", "false");
        b.disabled = true;
      });
      if (held && startButton) startButton.focus();
    }
    if (status && message && status.textContent !== message) status.textContent = message;
    loop.setPaused(state !== "running");
  }

  function reset() {
    sim.p.fill(P_REST);
    sim.open.fill(false);
    sim.want.fill(false);
    sim.t = 0;
    sim.nextCommand = 0;
    sim.outside = 0;
    sim.trail = [[0, shape(sim.p).tip.y]];
    valveButtons.forEach((b) => {
      b.setAttribute("aria-pressed", "false");
      b.disabled = false;
    });
    setState("ready", "Open a valve, or press Start. You have 50 s, as the controllers did; the valves act twice a second.");
    show();
  }

  function finish(over) {
    const tip = shape(sim.p).tip;
    const message =
      over >= 0
        ? "Stopped: the " + BELLOWS[over] + " bellows passed 118 kPa, above which it may be damaged. Runs on the real arm were stopped the same way."
        : "Time. The tip ended " + toTarget(tip).toFixed(1) + " cm from the target, " + (inGoal(tip) ? "inside" : "outside") + " the goal, after " + sim.outside.toFixed(1) + " s outside it. On the real arm, AutoMPC averaged 0.3 cm and 19.1 s.";
    setState("ended", message);
    show();
  }

  /* One frame of the model. Valve commands are taken up at the robot's command rate; pressures move in between. */
  function step(dt) {
    if (sim.state !== "running") return;
    if (sim.t >= sim.nextCommand) {
      sim.open = sim.want.slice();
      sim.nextCommand += 1 / COMMAND_HZ;
    }
    const h = Math.min(dt, RUN_SECONDS - sim.t);
    let over = -1;
    for (let i = 0; i < 4; i++) {
      const k = MODULES[i >> 1];
      const rate = (sim.open[2 * i] ? k.fill : 0) - (sim.open[2 * i + 1] ? k.drain : 0);
      sim.p[i] = Math.max(P_REST, sim.p[i] + rate * h);
      if (sim.p[i] > P_LIMIT) over = i;
    }
    sim.t += h;
    const tip = shape(sim.p).tip;
    if (!inGoal(tip)) sim.outside += h;
    const last = sim.trail[sim.trail.length - 1];
    if (Math.hypot(tip.x - last[0], tip.y - last[1]) > 0.05) sim.trail.push([tip.x, tip.y]);
    if (over >= 0 || sim.t >= RUN_SECONDS - 1e-6) finish(over);
    else show();
  }
  const loop = run(armCanvas, step);

  valveButtons.forEach((b) =>
    b.addEventListener("click", () => {
      if (sim.state === "ended") return;
      const on = b.getAttribute("aria-pressed") !== "true";
      b.setAttribute("aria-pressed", String(on));
      sim.want[valveIndex(b)] = on;
      if (sim.state === "ready") setState("running", "Running.");
    })
  );
  goalButtons.forEach((b) =>
    b.addEventListener("click", () => {
      sim.goal = Number(b.dataset.goal);
      goalButtons.forEach((g) => g.setAttribute("aria-pressed", String(g === b)));
      reset();
    })
  );
  if (startButton) {
    startButton.addEventListener("click", () => {
      if (sim.state === "running") setState("paused", "Paused.");
      else if (sim.state === "ended") reset();
      else setState("running", "Running.");
    });
  }
  if (resetButton) resetButton.addEventListener("click", reset);

  reset();
})();
