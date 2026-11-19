/*
 * Research, "Steer the underwater arm".
 *
 * The lab's two-module, water-driven soft arm lying in its shallow tank, drawn live in
 * three dimensions as ink lines. A goal square lies on the tank floor; the arm works its
 * eight valves by itself until its tip is over the goal. The visitor moves the goal (a
 * click or a drag in the tank, or the arrow keys) and the arm follows from wherever it is.
 * Left alone, the goal moves among three of the paper's targets.
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
 *   Published data, as printed: the scores in SCORES (Table I of the control paper),
 *   shown as a table in the figure's fine print.
 *   Published numbers used as settings: module lengths, the pressure range and
 *   its limit, the command rate, the length of a run, the goal size, three target
 *   positions, the area of the 40 targets, the pressure difference at which each
 *   module starts to bend, the bend it reaches at 20 kPa, and the average times the
 *   bench test took to fill and to empty a bellows. Each is marked where it is defined.
 *   A simplified model written for this site: everything about how the arm moves
 *   (the functions shape, along, and advance). A module is a circular arc; its
 *   length follows the mean pressure of its two bellows and its bend follows
 *   their difference, both in straight lines between the published end values,
 *   and a bellows fills and empties at a constant rate. This is not the lab's
 *   learned model and not recorded motion. It leaves out the hysteresis the
 *   hardware paper measured (on the real arm the lower module stays bent by 8.5
 *   degrees after emptying) and the left-right asymmetry the control paper
 *   reports. Nothing here imitates how any of the five controllers behaved.
 *   Also written for this site: the time-lapse (the picture runs SPEED times faster
 *   than the bench clock, because a bellows takes about 40 s to fill) and the rule
 *   that works the valves (the function plan: try every valve setting, look ahead
 *   with the same model, keep the one whose tip comes nearest the target). The rule
 *   is not one of the lab's controllers. On the bench every run started from the
 *   emptied, straight arm and lasted 50 s; here the arm steers on from wherever it
 *   is, the goal may be put anywhere in the area of the paper's targets and not only
 *   on a target, and how long a goal is kept is this page's choice (see step).
 *   Drawing: the solids are made for this page. In plan they follow the home page's
 *   line drawing of the same arm (base plate and bracket, two bellows per module with
 *   ten ridges each, end plates, four rungs); the heights of the parts are not
 *   published and are drawn by eye. The valves, the circuit boards, and the camera
 *   markers the real arm carries are left out. The tank is this page's frame around
 *   the arm's working range, not the bench tank's measured size, and its walls are
 *   cut low: on the bench the water stands as high as the top of the arm.
 *   The plate at the tip turns maize while the tip is inside the goal square, and
 *   where the arm stands in front of the goal the square's outline shows dotted.
 *   The shared 3D kit (fig3d.js) renders the solids as ink lines on paper. Without
 *   WebGL 2 the arm is drawn flat on the tank floor instead.
 */
(() => {
  "use strict";

  const root = document.querySelector('[data-fig="arm"]');
  if (!root || !window.ZFig) return;
  const { color, path, run } = window.ZFig;

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
  /* This page's choice, not the paper's: the picture runs this many times faster than the bench clock. */
  const SPEED = 5;
  /* This page's choice: the rule compares valve settings this many bench seconds ahead, nearest first. */
  const LOOK_AHEAD = [2, 4, 8, 16];
  /* This page's choice: left alone, the goal moves on once the tip has rested in it for this many bench seconds. */
  const REST_SECONDS = 8;
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
    goal: { x: GOALS[2].x, y: GOALS[2].y } /* where the tip is to go, in cm */,
    p: [P_REST, P_REST, P_REST, P_REST],
    open: new Array(8).fill(false) /* the valves as last commanded: [inlet, outlet] for each bellows */,
    t: 0 /* bench seconds */,
    nextCommand: 0,
    run: 0 /* bench seconds since the goal last moved */,
    held: 0 /* bench seconds the tip has now stayed inside the goal */,
  };
  const inGoal = (tip) => Math.abs(tip.x - sim.goal.x) <= GOAL_SIDE / 2 && Math.abs(tip.y - sim.goal.y) <= GOAL_SIDE / 2;
  const toTarget = (tip) => Math.hypot(tip.x - sim.goal.x, tip.y - sim.goal.y);

  /*
   * The rule that works the valves, written for this page and not one of the lab's controllers:
   * try every setting of the valves (each bellows held, filled, or drained), look a little way
   * ahead with the same model, and keep the setting whose tip comes nearest the target. It looks
   * 2, 4, 8, and 16 bench seconds ahead, because a module does not bend until its two pressures
   * differ by 1 to 2 kPa, and a single short look cannot see across that gap.
   */
  function plan() {
    let best = new Array(8).fill(false);
    let bestScore = Infinity;
    for (let c = 0; c < 81; c++) {
      const choices = [];
      const want = new Array(8).fill(false);
      let n = c;
      let busy = 0;
      let allowed = true;
      for (let i = 0; i < 4; i++) {
        const choice = n % 3; /* 0 hold, 1 fill, 2 drain */
        n = (n - choice) / 3;
        choices.push(choice);
        if (choice === 1) {
          if (sim.p[i] + MODULES[i >> 1].fill > P_LIMIT - 1) allowed = false; /* never fill a bellows that is near its limit */
          want[2 * i] = true;
          busy++;
        } else if (choice === 2) {
          want[2 * i + 1] = true;
          busy++;
        }
      }
      if (!allowed) continue;
      let nearest = Infinity;
      for (const ahead of LOOK_AHEAD) {
        const p = sim.p.map((v, i) => {
          const k = MODULES[i >> 1];
          if (choices[i] === 1) return Math.min(P_LIMIT - 1, v + k.fill * ahead);
          if (choices[i] === 2) return Math.max(P_REST, v - k.drain * ahead);
          return v;
        });
        nearest = Math.min(nearest, toTarget(shape(p).tip) + 0.002 * (ahead - LOOK_AHEAD[0])); /* on a tie, the sooner */
      }
      const score = nearest + 0.004 * busy; /* on a tie, the setting with fewer valves open */
      if (score < bestScore) {
        bestScore = score;
        best = want;
      }
    }
    return best;
  }

  /* Runs the model for some bench seconds. Valve commands are taken up at the robot's command rate; pressures move in between. */
  function advance(seconds) {
    let left = seconds;
    while (left > 1e-9) {
      if (sim.t >= sim.nextCommand - 1e-9) {
        sim.open = plan();
        sim.nextCommand += 1 / COMMAND_HZ;
      }
      const h = Math.min(left, sim.nextCommand - sim.t);
      left -= h;
      for (let i = 0; i < 4; i++) {
        const k = MODULES[i >> 1];
        const rate = (sim.open[2 * i] ? k.fill : 0) - (sim.open[2 * i + 1] ? k.drain : 0);
        sim.p[i] = Math.min(P_LIMIT, Math.max(P_REST, sim.p[i] + rate * h)); /* the rule never fills this far; the limit holds all the same */
      }
      sim.t += h;
      sim.run += h;
      sim.held = inGoal(shape(sim.p).tip) ? sim.held + h : 0;
    }
  }

  /* Runs the model on until the rule closes every valve: the pose the arm comes to rest in for this goal. */
  function settle() {
    for (let k = 0; k < 4 * RUN_SECONDS * COMMAND_HZ; k++) {
      advance(1 / COMMAND_HZ);
      if (!sim.open.some(Boolean)) break;
    }
  }

  /* ---- The scores on the real arm, as a table -------------------------------- */

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

  /* ---- The arm as solids ------------------------------------------------------ */

  const stageEl = root.querySelector("[data-stage]");
  if (!stageEl || !window.ZFig3D) return;
  const { mul, translate, rotate } = window.ZFig3D.mat;
  const solid = window.ZFig3D.shape;

  /*
   * Sizes in cm; x across the arm, y along it from the fixed base, z up from the tank floor.
   * The plan sizes are the home page drawing's (1 unit to 1 mm); the heights are drawn by eye.
   */
  const SIDE = 2.3; /* each bellows' axis lies this far to one side of the module's centerline */
  const NECK = 0.75; /* radius of a bellows in the groove between two ridges */
  const RIDGE = 1.35; /* radius over a ridge */
  const RIDGES = 10;
  const AXIS = 1.8; /* height of the bellows' axes */
  const PLATE = { w: 8.4, t: 1.3, h: 3.6 }; /* an end plate: w across, t along the arm, h high */
  const RUNGS = 4;
  const RUNG = { w: 3.3, t: 0.5, h: 0.5, z: 1.75 }; /* a rung, and the height of its underside */
  const BASE = { w: 11.6, t: 2, h: 4.2, y: -1.8 }; /* the base plate, centered at y */
  const BRACKET = { w: 7.6, t: 1.6, h: 2.6, y: -3.6, wall: 0.5 }; /* the bracket behind it: three walls of this thickness */
  const TANK = { x: [-15, 15], y: [-6.5, 39] }; /* the tank floor */
  const WALL = { t: 0.4, h: 2 }; /* its walls, cut low so that they hide nothing */

  /* A point d cm along module m and o cm to the right of its centerline, with the heading there. */
  function at(m, d, o) {
    const q = along(m, d / m.len);
    return { x: q.x + o * Math.cos(q.phi), y: q.y - o * Math.sin(q.phi), phi: q.phi };
  }

  /*
   * Where the parts of each module sit: an end plate at each end (two modules meet plate to plate),
   * the bellows between the plates' faces, and the rungs at every second groove of the bellows.
   */
  function parts(sh) {
    return sh.mods.map((m, i) => {
      const s0 = i === 0 ? 0 : PLATE.t / 2;
      const s1 = i === sh.mods.length - 1 ? m.len : m.len - PLATE.t / 2;
      const e0 = s0 + PLATE.t / 2;
      const e1 = s1 - PLATE.t / 2;
      const plates = [at(m, s0, 0), at(m, s1, 0)];
      plates[0].phi = m.phi; /* a plate is square to the end of its module */
      plates[1].phi = m.phi + m.bend;
      const rungs = [];
      for (let k = 1; k <= RUNGS; k++) rungs.push(at(m, e0 + ((e1 - e0) * k) / (RUNGS + 1), 0));
      return { m, e0, e1, plates, rungs };
    });
  }

  /*
   * A bellows: a tube of rings that follows its module's arc. Each ridge is a rounded bead and two
   * beads meet in a sharp groove, so the kit draws one line per groove. The stations along one ridge:
   */
  const AROUND = 24;
  const CUTS = [0, 0.07, 0.2, 0.35, 0.5, 0.65, 0.8, 0.93];
  /* each ring of the tube: how far along the bellows it sits (0 to 1), and its radius */
  const STATIONS = [];
  for (let k = 0; k <= RIDGES; k++) {
    for (const u of k < RIDGES ? CUTS : [0]) STATIONS.push({ f: (k + u) / RIDGES, r: NECK + (RIDGE - NECK) * Math.sqrt(1 - (2 * u - 1) * (2 * u - 1)) });
  }
  const RINGS = STATIONS.length;
  const TURN = Array.from({ length: AROUND }, (_, j) => [Math.cos((j / AROUND) * Math.PI * 2), Math.sin((j / AROUND) * Math.PI * 2)]);
  const TUBE_INDICES = [];
  for (let k = 0; k < RINGS - 1; k++) {
    for (let j = 0; j < AROUND; j++) {
      const a = k * AROUND + j;
      const b = k * AROUND + ((j + 1) % AROUND);
      TUBE_INDICES.push(a, b, a + AROUND, b, b + AROUND, a + AROUND);
    }
  }
  /* The points of the bellows o cm to the right of module part q's centerline, written into `out`. Its ends reach a little into the plates. */
  function tube(out, q, o) {
    let n = 0;
    for (const st of STATIONS) {
      const c = at(q.m, q.e0 - 0.1 + (q.e1 - q.e0 + 0.2) * st.f, o);
      const ax = Math.cos(c.phi);
      const ay = -Math.sin(c.phi);
      for (const [cos, sin] of TURN) {
        out[n++] = c.x + st.r * cos * ax;
        out[n++] = c.y + st.r * cos * ay;
        out[n++] = AXIS + st.r * sin;
      }
    }
    return out;
  }

  /* An end plate: a slab with rounded ends that holds the two bellows; across x, t thick along y, standing on z = 0. */
  function slab(w, t, h) {
    const r = h / 2;
    const c = w / 2 - r;
    const outline = [];
    for (let k = 0; k <= 14; k++) outline.push([c + r * Math.sin((k / 14) * Math.PI), r - r * Math.cos((k / 14) * Math.PI)]);
    for (let k = 0; k <= 14; k++) outline.push([-c - r * Math.sin((k / 14) * Math.PI), r + r * Math.cos((k / 14) * Math.PI)]);
    const n = outline.length;
    const positions = [];
    const indices = [];
    for (const [x, z] of outline) positions.push(x, -t / 2, z, x, t / 2, z);
    positions.push(0, -t / 2, r, 0, t / 2, r);
    for (let k = 0; k < n; k++) {
      const a = 2 * k;
      const b = 2 * ((k + 1) % n);
      indices.push(a, b, a + 1, b, b + 1, a + 1, 2 * n, a, b, 2 * n + 1, b + 1, a + 1);
    }
    return { positions, indices };
  }

  /* Several solids as one, each moved to its place. */
  function join(list) {
    const positions = [];
    const indices = [];
    for (const [s, x, y] of list) {
      const first = positions.length / 3;
      for (let k = 0; k < s.positions.length; k += 3) positions.push(s.positions[k] + x, s.positions[k + 1] + y, s.positions[k + 2]);
      for (const i of s.indices) indices.push(first + i);
    }
    return { positions, indices };
  }

  /* ---- The picture ------------------------------------------------------------- */

  const view = { turned: false };
  const WIDE = { azimuth: Math.PI / 2 - 0.25, elevation: 0.55 }; /* a wide picture: the arm runs across it */
  const TALL = { azimuth: 0.15, elevation: 0.85 }; /* a narrow one: the arm runs up it */
  const FIT = []; /* what the picture must hold: the tank with its walls, and the top of the base */
  for (const x of [TANK.x[0] - WALL.t, TANK.x[1] + WALL.t]) for (const y of [TANK.y[0] - WALL.t, TANK.y[1] + WALL.t]) for (const z of [0, WALL.h]) FIT.push([x, y, z]);
  for (const x of [-BASE.w / 2, BASE.w / 2]) for (const y of [BRACKET.y - BRACKET.t / 2, BASE.y + BASE.t / 2]) FIT.push([x, y, BASE.h]);
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  /* Points the camera so that the whole tank fills the picture, whatever its shape and however it is turned. */
  function frame(cam, w, h) {
    if (!view.turned) {
      const t = Math.max(0, Math.min(1, (w / h - 1.2) / 0.3));
      cam.azimuth = TALL.azimuth + (WIDE.azimuth - TALL.azimuth) * t;
      cam.elevation = TALL.elevation + (WIDE.elevation - TALL.elevation) * t;
    }
    const a = cam.azimuth;
    const e = cam.elevation;
    const right = [Math.cos(a), Math.sin(a), 0];
    const up = [-Math.sin(e) * Math.sin(a), Math.sin(e) * Math.cos(a), Math.cos(e)];
    const toward = [Math.sin(a) * Math.cos(e), -Math.cos(a) * Math.cos(e), Math.sin(e)];
    let r0 = Infinity;
    let r1 = -Infinity;
    let u0 = Infinity;
    let u1 = -Infinity;
    for (const p of FIT) {
      r0 = Math.min(r0, dot3(right, p));
      r1 = Math.max(r1, dot3(right, p));
      u0 = Math.min(u0, dot3(up, p));
      u1 = Math.max(u1, dot3(up, p));
    }
    const margin = 12; /* pixels kept clear all round */
    cam.minHalfWidth = 0;
    cam.halfHeight = Math.max(((u1 - u0) / 2) * (h / (h - 2 * margin)), ((r1 - r0) / 2) * (h / (w - 2 * margin)));
    const cr = (r0 + r1) / 2;
    const cu = (u0 + u1) / 2;
    const cd = dot3(toward, [0, (TANK.y[0] + TANK.y[1]) / 2, 0]);
    cam.center = [0, 1, 2].map((k) => right[k] * cr + up[k] * cu + toward[k] * cd);
  }

  const poly = (ctx, points, fill, stroke, width, dash) => {
    ctx.beginPath();
    points.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.lineWidth = width || 1;
      ctx.lineJoin = "round";
      ctx.strokeStyle = stroke;
      ctx.setLineDash(dash || []);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  };

  /* Without WebGL 2 the solids cannot be drawn: the arm is drawn flat on the tank floor instead, as seen from above. */
  function flatArm(ctx, P) {
    const lw = 1.3;
    const sh = shape(sim.p);
    /* a w by t rectangle centered on c and square to its heading */
    const quad = (c, w, t) => {
      const ax = [(Math.cos(c.phi) * w) / 2, (-Math.sin(c.phi) * w) / 2];
      const ay = [(Math.sin(c.phi) * t) / 2, (Math.cos(c.phi) * t) / 2];
      return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => P(c.x + i * ax[0] + j * ay[0], c.y + i * ax[1] + j * ay[1]));
    };
    const back = BRACKET.y - BRACKET.t / 2;
    const front = BASE.y - BASE.t / 2;
    path(ctx, [P(-BRACKET.w / 2, front), P(-BRACKET.w / 2, back), P(BRACKET.w / 2, back), P(BRACKET.w / 2, front)], color.ink, lw);
    poly(ctx, quad({ x: 0, y: BASE.y, phi: 0 }, BASE.w, BASE.t), color.paper, color.ink, lw);
    parts(sh).forEach((q, i, all) => {
      for (const o of [-SIDE, SIDE]) {
        const one = [];
        const other = [];
        for (const st of STATIONS) {
          const d = q.e0 + (q.e1 - q.e0) * st.f;
          const a = at(q.m, d, o - st.r);
          const b = at(q.m, d, o + st.r);
          one.push(P(a.x, a.y));
          other.push(P(b.x, b.y));
        }
        poly(ctx, one.concat(other.slice().reverse()), color.paper, color.ink, lw);
        for (let k = CUTS.length; k < RINGS - 1; k += CUTS.length) path(ctx, [one[k], other[k]], color.ink, 1);
      }
      for (const r of q.rungs) poly(ctx, quad(r, 2 * (SIDE - NECK), RUNG.t), color.paper, color.ink, lw);
      q.plates.forEach((c, k) => poly(ctx, quad(c, PLATE.w, PLATE.t), k === 1 && i === all.length - 1 && inGoal(sh.tip) ? color.maize : color.paper, color.ink, lw));
    });
  }

  const stage = window.ZFig3D.stage(stageEl, {
    height: (w) => (w >= 900 ? 520 : w >= 520 ? 420 : 340),
    far: 60,
    depthEdge: 3,
    /* the tank floor, the area the goal may be put in, and the goal, drawn flat under the arm */
    underlay(ctx, w, h, st) {
      frame(st.camera, w, h);
      const P = (x, y) => st.project([x, y, 0]);
      const rect = (x0, x1, y0, y1) => [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];
      poly(ctx, rect(TANK.x[0], TANK.x[1], TANK.y[0], TANK.y[1]), "#f6f7f8", st.ok ? null : color.ruleStrong, 1); /* the walls are solids; without them the floor gets an edge */
      poly(ctx, rect(TARGET_AREA.x[0], TARGET_AREA.x[1], TARGET_AREA.y[0], TARGET_AREA.y[1]), null, color.ink3, 1, [3, 4]);
      const g = sim.goal;
      const s = GOAL_SIDE / 2;
      poly(ctx, rect(g.x - s, g.x + s, g.y - s, g.y + s), color.maize, color.ink, 1.4);
      if (!st.ok) flatArm(ctx, P);
    },
  });

  const placed = (c, z) => mul(translate(c.x, c.y, z), rotate([0, 0, 1], -c.phi));
  let solids = null;
  if (stage.ok) {
    const q = parts(shape(sim.p));
    const leg = solid.box(BRACKET.wall, BRACKET.t, BRACKET.h);
    const end = solid.box(TANK.x[1] - TANK.x[0] + 2 * WALL.t, WALL.t, WALL.h);
    const side = solid.box(WALL.t, TANK.y[1] - TANK.y[0], WALL.h);
    solids = {
      base: stage.mesh(join([[solid.box(BASE.w, BASE.t, BASE.h), 0, BASE.y]])),
      bracket: stage.mesh(
        join([
          [leg, -(BRACKET.w - BRACKET.wall) / 2, BRACKET.y],
          [leg, (BRACKET.w - BRACKET.wall) / 2, BRACKET.y],
          [solid.box(BRACKET.w, BRACKET.wall, BRACKET.h), 0, BRACKET.y - (BRACKET.t - BRACKET.wall) / 2],
        ])
      ),
      walls: stage.mesh(
        join([
          [end, 0, TANK.y[0] - WALL.t / 2],
          [end, 0, TANK.y[1] + WALL.t / 2],
          [side, TANK.x[0] - WALL.t / 2, (TANK.y[0] + TANK.y[1]) / 2],
          [side, TANK.x[1] + WALL.t / 2, (TANK.y[0] + TANK.y[1]) / 2],
        ])
      ),
      plate: stage.mesh(slab(PLATE.w, PLATE.t, PLATE.h)),
      rung: stage.mesh(solid.box(RUNG.w, RUNG.t, RUNG.h)),
      tubes: q.map((part) =>
        [-SIDE, SIDE].map((o) => {
          const points = new Float32Array(RINGS * AROUND * 3);
          return { o, points, mesh: stage.mesh({ positions: tube(points, part, o), indices: TUBE_INDICES }) };
        })
      ),
    };
  }

  /*
   * The goal's outline once more, as a row of fine dots that the kit draws over the solids: where the
   * arm stands in front of the goal its outline still shows, dotted, as a hidden edge does in a drawing.
   */
  const dotted = {};
  function outline(perSide) {
    if (!dotted[perSide]) {
      const s = GOAL_SIDE / 2;
      const points = [];
      for (let k = 0; k < perSide; k++) {
        const t = -s + (GOAL_SIDE * k) / perSide;
        points.push(t, -s, 0, s, t, 0, -t, s, 0, -s, -t, 0);
      }
      dotted[perSide] = stage.cloud(points);
    }
    return dotted[perSide];
  }

  function show() {
    if (!solids) {
      stage.render([]);
      return;
    }
    const sh = shape(sim.p);
    const reached = inGoal(sh.tip);
    frame(stage.camera, stage.size.w, stage.size.h);
    const scale = stage.size.h / (2 * stage.camera.halfHeight); /* pixels per cm, to size the dots */
    const items = [{ mesh: solids.walls, quiet: true }, { mesh: solids.base }, { mesh: solids.bracket }];
    parts(sh).forEach((q, i, all) => {
      items.push({ mesh: solids.plate, model: placed(q.plates[0], 0) });
      for (const t of solids.tubes[i]) {
        t.mesh.update(tube(t.points, q, t.o));
        items.push({ mesh: t.mesh });
      }
      for (const r of q.rungs) items.push({ mesh: solids.rung, model: placed(r, RUNG.z) });
      /* the plate at the tip turns maize while the tip is inside the goal, which it then covers */
      items.push({ mesh: solids.plate, model: placed(q.plates[1], 0), maize: i === all.length - 1 && reached });
    });
    const hidden = { cloud: outline(Math.max(3, Math.round((GOAL_SIDE * scale) / 5))), model: translate(sim.goal.x, sim.goal.y, 0), size: 2 / scale, strength: 1.6 };
    stage.render(items, reached ? [] : [hidden]);
  }

  /* ---- The goal: moved by the visitor, or by the figure when it is left alone ----- */

  let tour = 2; /* which of GOALS the figure last chose by itself */
  let own = true; /* false while the goal is where the visitor put it */

  function moveGoal(x, y) {
    sim.goal.x = Math.max(TARGET_AREA.x[0], Math.min(TARGET_AREA.x[1], x));
    sim.goal.y = Math.max(TARGET_AREA.y[0], Math.min(TARGET_AREA.y[1], y));
    sim.run = 0;
    sim.held = 0;
  }

  /*
   * One frame. A goal the figure chose is left once the tip has rested in it, or after one run of the
   * paper's 50 s. A goal the visitor placed is kept for a whole run, and for a second one if the tip
   * is still not resting in it.
   */
  function step(dt) {
    advance(dt * SPEED); /* bench seconds to run in this frame */
    const rested = sim.held >= REST_SECONDS;
    if (own ? rested || sim.run >= RUN_SECONDS : sim.run >= RUN_SECONDS && (rested || sim.run >= 2 * RUN_SECONDS)) {
      tour = (tour + 1) % GOALS.length;
      own = true;
      moveGoal(GOALS[tour].x, GOALS[tour].y);
    }
    show();
  }
  const loop = run(stageEl, step);

  /* The visitor's goal. With motion reduced nothing is animated: the arm is shown where it comes to rest. */
  function place(x, y) {
    own = false;
    moveGoal(x, y);
    if (loop.paused) settle();
    show();
  }

  /* The point of the tank floor under a point of the picture. The camera has no perspective, so the map is a plain linear one. */
  function floorAt(px, py) {
    const o = stage.project([0, 0, 0]);
    const ex = stage.project([1, 0, 0]);
    const ey = stage.project([0, 1, 0]);
    const a = ex[0] - o[0];
    const b = ey[0] - o[0];
    const c = ex[1] - o[1];
    const d = ey[1] - o[1];
    const det = a * d - b * c;
    return { x: (d * (px - o[0]) - b * (py - o[1])) / det, y: (a * (py - o[1]) - c * (px - o[0])) / det };
  }
  const pad = stage.canvas;
  const under = (e) => {
    const box = pad.getBoundingClientRect();
    return floorAt(e.clientX - box.left, e.clientY - box.top);
  };
  const inTank = (q) => q.x >= TANK.x[0] && q.x <= TANK.x[1] && q.y >= TANK.y[0] && q.y <= TANK.y[1];

  /*
   * A press inside the tank moves the goal, and a drag carries it along. A press outside the tank is
   * left to the kit, which turns the view on a sideways drag. A finger may be starting to scroll the
   * page, so a touch moves the goal only when it lifts where it came down (a tap) or once it has gone
   * sideways (a drag); a finger that goes up or down the page is left alone.
   */
  let hold = null; /* the press that is moving the goal */
  let turning = false;
  pad.addEventListener("pointerdown", (e) => {
    if (e.button) return;
    const q = under(e);
    if (!inTank(q)) {
      turning = true;
      return;
    }
    e.stopImmediatePropagation();
    hold = { id: e.pointerId, x: e.clientX, y: e.clientY, live: e.pointerType !== "touch" };
    if (hold.live) {
      pad.setPointerCapture(e.pointerId);
      place(q.x, q.y);
    }
  });
  pad.addEventListener("pointermove", (e) => {
    if (hold && e.pointerId === hold.id) {
      const dx = Math.abs(e.clientX - hold.x);
      const dy = Math.abs(e.clientY - hold.y);
      if (!hold.live && dy > 10 && dy > dx) hold = null;
      else if (!hold.live && dx > 6) hold.live = true;
      if (hold && hold.live) {
        const q = under(e);
        place(q.x, q.y);
      }
    } else if (!turning) {
      pad.style.cursor = inTank(under(e)) ? "crosshair" : "grab";
    }
  });
  pad.addEventListener("pointerup", (e) => {
    if (hold && e.pointerId === hold.id && !hold.live) {
      const q = under(e);
      place(q.x, q.y);
    }
    hold = null;
    turning = false;
  });
  pad.addEventListener("pointercancel", () => {
    hold = null;
    turning = false;
  });
  stage.orbit({
    min: -0.6,
    max: Math.PI / 2 + 0.6,
    onTurn() {
      view.turned = true;
      show();
    },
  });

  /* With the picture in focus, each arrow key moves the goal 1 cm the way the arrow points in the picture. */
  stageEl.addEventListener("keydown", (e) => {
    const way = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (!way || e.altKey || e.ctrlKey || e.metaKey) return;
    const a = stage.camera.azimuth;
    const x = way[0] * Math.cos(a) - way[1] * Math.sin(a);
    const y = way[0] * Math.sin(a) + way[1] * Math.cos(a);
    if (Math.abs(x) >= Math.abs(y)) place(sim.goal.x + Math.sign(x), sim.goal.y);
    else place(sim.goal.x, sim.goal.y + Math.sign(y));
    e.preventDefault();
  });

  /* The first picture, and the still one when motion is reduced: the arm at rest on its first goal. */
  settle();
  sim.run = 0;
  sim.held = 0;
  show();
})();
