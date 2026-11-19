/*
 * Research, "Lose two, keep going".
 *
 * What it shows: a round floor seen from a raised three-quarter view, with 36 small disc
 * robots on it, drawn as ink lines by the shared 3D kit (fig3d.js). Each robot is a short
 * cylinder, about as thick as a thick coin, with a flat rectangular battery lying on top.
 * The working robots shuffle in small random steps, lean toward a cross marked in the middle
 * of the floor, and keep a little room from their working neighbors, so they gather into a
 * loose group around the mark. Click or tap a robot and it is switched off: it stops where
 * it is and is drawn in gray, and the others close in around it and carry on. Left alone, the
 * figure switches two off by itself, a few seconds apart, and later switches them back on.
 *
 * A concept illustration, not a recording, not a design, and not the lab's control software.
 * Every rule of motion in this file is invented for the page: nothing about the real robots'
 * rules, speeds, or parts is public, and nothing here is measured. Lengths are counted in
 * robot radii for the same reason: no size is public either.
 *
 * The idea rests on public statements only:
 *   - Y Z, "Soft Robots for Hard Problems", Michigan Robotics seminar, 17 September 2025,
 *     https://www.youtube.com/watch?v=_GpB51rHsZg : many simple, cheap units that together
 *     do what one robot cannot, where losing one or two does not matter.
 *   - The Atombot page of the University of Michigan Multidisciplinary Design Program,
 *     https://mdp.engin.umich.edu/research_teams/atombot-27/ : many robots following simple
 *     rules and interactions.
 * The drawn shape follows the one public picture of a unit (the overview picture on the
 * lab's own site): a round shell with a flat battery on top. The cylinder and the box here
 * stand for that and for nothing more.
 */
(() => {
  "use strict";

  const root = document.querySelector('[data-fig="swarm"]');
  if (!root || !window.ZFig || !window.ZFig3D) return;
  const stageEl = root.querySelector("[data-stage]");
  if (!stageEl) return;
  const { color, run } = window.ZFig;
  const { shape } = window.ZFig3D;

  /* ---- the rules of motion ------------------------------------------------------------- */

  /* Lengths are in robot radii and times in seconds. Every value is a choice made for the picture. */
  const N = 36;
  const ROOM = 3.7; /* center-to-center distance that working robots try to keep */
  const TOUCH = 2.12; /* two discs side by side with a hairline between them */
  const PUSH = 7; /* how briskly two robots that are too close move apart */
  const PULL = 3.4; /* speed toward the marked spot from far away */
  const EDGE = 10; /* about where the group ends; inside it the pull is gentle */
  const HOLD = 0.1; /* the gentle pull inside the group, per radius of distance */
  const CLEAR = 2.7; /* working robots stop this short of the mark, so it stays in view */
  const SHUFFLE = 0.9; /* typical speed of the random shuffle */
  const SHUFFLE_T = 0.35; /* how long one shuffle keeps its direction */
  const SEED = 7;

  const x = new Float64Array(N); /* position on the floor, measured from the marked spot */
  const y = new Float64Array(N);
  const heading = new Float64Array(N);
  const sx = new Float64Array(N); /* the current shuffle, a velocity */
  const sy = new Float64Array(N);
  const ax = new Float64Array(N); /* the push from neighbors, summed each step */
  const ay = new Float64Array(N);
  const on = new Uint8Array(N);

  /* A small seeded generator, so every visitor gets the same picture. */
  let seed = SEED;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

  /* The floor is a disc of radius `floor` around the marked spot; no robot leaves it. */
  function confine(floor) {
    const reach = floor - 1.3;
    for (let i = 0; i < N; i++) {
      const d = Math.hypot(x[i], y[i]);
      if (d > reach) {
        x[i] *= reach / d;
        y[i] *= reach / d;
      }
    }
  }

  /* All robots working, scattered over the floor. */
  function scatter(floor) {
    seed = SEED;
    for (let i = 0; i < N; i++) {
      for (let tries = 0; tries < 400; tries++) {
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(rand()) * (floor - 1.6);
        x[i] = Math.cos(a) * r;
        y[i] = Math.sin(a) * r;
        let free = r > 4;
        for (let j = 0; j < i && free; j++) free = Math.hypot(x[i] - x[j], y[i] - y[j]) > 2.8;
        if (free) break;
      }
      heading[i] = rand() * Math.PI * 2;
      sx[i] = 0;
      sy[i] = 0;
      on[i] = 1;
    }
  }

  /* One step of the invented rules. A robot that is switched off is never moved. */
  function step(dt, floor) {
    ax.fill(0);
    ay.fill(0);
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        if (!on[i] && !on[j]) continue;
        /* Working robots keep room from each other; a stopped robot is only an obstacle. */
        const both = on[i] && on[j];
        const reach = both ? ROOM : TOUCH + 0.5;
        const dx = x[j] - x[i];
        const dy = y[j] - y[i];
        const d2 = dx * dx + dy * dy;
        if (d2 >= reach * reach) continue;
        const d = Math.sqrt(d2) || 1e-6;
        const p = ((both ? PUSH : 2 * PUSH) * (1 - d / reach)) / d;
        ax[i] -= dx * p;
        ay[i] -= dy * p;
        ax[j] += dx * p;
        ay[j] += dy * p;
      }
    }
    const kick = SHUFFLE * Math.sqrt((2 * dt) / SHUFFLE_T);
    for (let i = 0; i < N; i++) {
      if (!on[i]) continue;
      const d = Math.hypot(x[i], y[i]) || 1e-6;
      const inward = d < EDGE ? HOLD * d : Math.min(PULL, HOLD * EDGE + (d - EDGE) * 1.2);
      sx[i] += (-sx[i] / SHUFFLE_T) * dt + kick * gauss();
      sy[i] += (-sy[i] / SHUFFLE_T) * dt + kick * gauss();
      const vx = ax[i] - (x[i] / d) * inward + sx[i];
      const vy = ay[i] - (y[i] / d) * inward + sy[i];
      x[i] += vx * dt;
      y[i] += vy * dt;
      /* The robot turns to face the way it is going: quickly on a long run, barely while it shuffles in place. */
      const turn = Math.atan2(vy, vx) - heading[i];
      heading[i] += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, 0.35 * Math.hypot(vx, vy) * dt);
    }
    confine(floor);
    /* Discs never overlap, and working robots stay off the mark: whichever of a pair can move gives way. */
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < N; i++) {
        const d0 = Math.hypot(x[i], y[i]) || 1e-6;
        if (on[i] && d0 < CLEAR) {
          x[i] *= CLEAR / d0;
          y[i] *= CLEAR / d0;
        }
        for (let j = i + 1; j < N; j++) {
          if (!on[i] && !on[j]) continue;
          const dx = x[j] - x[i];
          const dy = y[j] - y[i];
          const d = Math.hypot(dx, dy) || 1e-6;
          if (d >= TOUCH) continue;
          const gap = (TOUCH - d) / d;
          const wi = on[i] ? (on[j] ? 0.5 : 1) : 0;
          const wj = on[j] ? (on[i] ? 0.5 : 1) : 0;
          x[i] -= dx * gap * wi;
          y[i] -= dy * gap * wi;
          x[j] += dx * gap * wj;
          y[j] += dy * gap * wj;
        }
      }
    }
  }

  /* ---- the picture ------------------------------------------------------------------------ */

  const BODY = 0.5; /* height of a robot's shell, in robot radii: a thick coin */
  const BATTERY = [1, 0.58]; /* the battery lying on top: length and width */
  const SLAB = 0.11; /* its height: low enough that, seen from the side, its far edge stays inside the shell's rim */
  const SLIVER = 0.05; /* its height on a small picture, where the lines of a thicker one would run together */
  const CROSS = [[0.16, 1.1], [0.16, 0.16], [1.1, 0.16], [1.1, -0.16], [0.16, -0.16], [0.16, -1.1], [-0.16, -1.1], [-0.16, -0.16], [-1.1, -0.16], [-1.1, 0.16], [-0.16, 0.16], [-0.16, 1.1]];
  const QUIET = "#a8b0b8"; /* the gray the kit draws a quiet part in */

  let hover = -1; /* the working robot under the mouse */
  let mouse = null; /* where the mouse is over the picture, in its pixels */
  let keys = false; /* the picture is being used from the keyboard */
  let pick = -1; /* the robot the Enter key would switch off */
  let battery = null; /* the battery's mesh, once it is made */
  let tall = SLAB; /* the battery's height as drawn */

  /* The battery's points: a box of the given height, lying on top of the shell. */
  function pack(height) {
    const solid = shape.box(BATTERY[0], BATTERY[1], height);
    for (let k = 2; k < solid.positions.length; k += 3) solid.positions[k] += BODY;
    return solid;
  }

  /* The floor is smaller, in robot radii, on a narrow picture, so the robots are never tiny on a phone. */
  const floorRadius = (w) => Math.max(14, Math.min(16.5, 12 + w / 250));

  /* The camera for a picture of this size: the floor fills the width, and the view is raised
     just enough for the floor to fill the height as well (steeper on a narrow, tall picture). */
  function frame(st, w, h) {
    const floor = floorRadius(w);
    const tilt = Math.max(0.4, Math.min(0.78, (0.86 * h) / (0.94 * w))); /* sine of the elevation */
    st.camera.elevation = Math.asin(tilt);
    st.camera.minHalfWidth = floor / 0.94;
    st.camera.halfHeight = (floor * tilt) / 0.9;
    /* the battery is a slab where a robot is drawn large enough to show its sides, a sliver where it is not */
    const s = h / (2 * Math.max(st.camera.halfHeight, (st.camera.minHalfWidth * h) / w)); /* pixels to a robot radius */
    const height = s < 26 ? SLIVER : SLAB;
    if (height !== tall) {
      tall = height;
      if (battery) battery.update(pack(tall).positions);
    }
    return floor;
  }

  /* Where points of the floor are drawn, in the picture's pixels. The camera has no perspective,
     so three projected points give every other one. */
  function plan(st) {
    const o = st.project([0, 0, 0]);
    const u = st.project([1, 0, 0]);
    const v = st.project([0, 1, 0]);
    return (fx, fy) => [o[0] + fx * (u[0] - o[0]) + fy * (v[0] - o[0]), o[1] + fx * (u[1] - o[1]) + fy * (v[1] - o[1])];
  }

  /* The robot drawn in maize: the one under the mouse, or the one the Enter key would switch off. */
  const pointed = () => (hover >= 0 ? hover : keys ? nearest() : -1);

  const stage = window.ZFig3D.stage(stageEl, {
    height: (w) => (w >= 900 ? 480 : w >= 520 ? 400 : 320),
    far: 24, /* scene units are robot radii, and the floor is at most 16.5 of them in radius */
    depthEdge: 0.25, /* a quarter of a radius: more than a robot's sloping top changes across one line */
    camera: { azimuth: 0.6, elevation: 0.42, center: [0, 0, 0] },
    /* the floor and the marked spot, drawn flat under the robots */
    underlay(ctx, w, h, st) {
      const floor = frame(st, w, h);
      confine(floor); /* a picture that has become narrower has a smaller floor */
      const tilt = Math.sin(st.camera.elevation);
      const s = w / (2 * st.halfWidth); /* pixels to a robot radius */
      const at = plan(st);
      const o = at(0, 0);
      /* the floor: a round disc of faint wash with a hairline edge */
      ctx.beginPath();
      ctx.ellipse(o[0], o[1], floor * s, floor * s * tilt, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#f6f7f8";
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = color.ruleStrong;
      ctx.stroke();
      /* the marked spot: a cross painted on the floor */
      ctx.beginPath();
      CROSS.forEach(([cx, cy], k) => {
        const p = at(cx, cy);
        if (k) ctx.lineTo(p[0], p[1]);
        else ctx.moveTo(p[0], p[1]);
      });
      ctx.closePath();
      ctx.fillStyle = color.ink;
      ctx.fill();
      if (!st.ok) flat(ctx, st, at, s, tilt);
    },
  });

  /* Without WebGL 2 the robots are drawn here, as flat outlines of the same solids, back to front. */
  function flat(ctx, st, at, s, tilt) {
    const a = st.camera.azimuth;
    const toward = [Math.sin(a), -Math.cos(a)]; /* along the floor, toward the viewer */
    const lift = Math.cos(st.camera.elevation) * s; /* pixels up the picture for one radius of height */
    const rise = BODY * lift;
    const hot = pointed();
    const order = Array.from({ length: N }, (_, i) => i).sort((i, j) => x[i] * toward[0] + y[i] * toward[1] - (x[j] * toward[0] + y[j] * toward[1]));
    ctx.lineWidth = 1.1;
    ctx.lineJoin = "round";
    const face = (points) => {
      ctx.beginPath();
      points.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };
    for (const i of order) {
      const p = at(x[i], y[i]);
      ctx.strokeStyle = on[i] ? color.ink : QUIET;
      ctx.fillStyle = i === hot ? color.maize : color.paper;
      /* the shell: its outline, then the near half of its top rim */
      ctx.beginPath();
      ctx.ellipse(p[0], p[1], s, s * tilt, 0, 0, Math.PI);
      ctx.ellipse(p[0], p[1] - rise, s, s * tilt, 0, Math.PI, Math.PI * 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(p[0], p[1] - rise, s, s * tilt, 0, 0, Math.PI);
      ctx.stroke();
      /* the battery: the sides that face the viewer, then its top */
      const c = Math.cos(heading[i]);
      const n = Math.sin(heading[i]);
      const corner = (u, v, z) => {
        const q = at(x[i] + (u * BATTERY[0] * c - v * BATTERY[1] * n) * 0.5, y[i] + (u * BATTERY[0] * n + v * BATTERY[1] * c) * 0.5);
        return [q[0], q[1] - z * lift];
      };
      const ring = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
      const low = ring.map(([u, v]) => corner(u, v, BODY));
      const high = ring.map(([u, v]) => corner(u, v, BODY + tall));
      const out = [[-n, c], [-c, -n], [n, -c], [c, n]]; /* which way each side faces */
      for (let k = 0; k < 4; k++) {
        if (out[k][0] * toward[0] + out[k][1] * toward[1] > 0) face([low[k], low[(k + 1) % 4], high[(k + 1) % 4], high[k]]);
      }
      face(high);
    }
  }

  /* One shell and one battery, made once and drawn for every robot with its own placement. */
  const items = [];
  const place = [];
  if (stage.ok) {
    const shell = stage.mesh(shape.cylinder(1, BODY, 48));
    battery = stage.mesh(pack(tall));
    for (let i = 0; i < N; i++) place.push(new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
    /* all the shells, then all the batteries: no battery shares the kit's part number with its own shell */
    for (let i = 0; i < N; i++) items.push({ mesh: shell, model: place[i], maize: false, quiet: false });
    for (let i = 0; i < N; i++) items.push({ mesh: battery, model: place[i], maize: false, quiet: false });
  }

  let asked = false;
  function show() {
    asked = false;
    const hot = pointed();
    for (let i = 0; i < items.length / 2; i++) {
      const m = place[i];
      m[0] = m[5] = Math.cos(heading[i]);
      m[1] = Math.sin(heading[i]);
      m[4] = -m[1];
      m[12] = x[i];
      m[13] = y[i];
      items[i].quiet = items[N + i].quiet = !on[i];
      items[i].maize = i === hot; /* the shell alone takes the maize; the battery stays paper */
    }
    stage.render(items);
  }
  /* Draw once at the next frame, however many things asked for it. */
  function redraw() {
    if (asked) return;
    asked = true;
    requestAnimationFrame(() => asked && show());
  }

  /* ---- handling it ------------------------------------------------------------------------ */

  const countOut = root.querySelector("[data-count]");
  const resetBtn = root.querySelector("[data-reset]");
  const hint = root.querySelector(".fig-hint");
  const over = stage.canvas;

  /* The robot drawn at a point of the picture, if it is a working one; failing that, the working robot within `reach` pixels. */
  function robotAt(px, py, reach) {
    const s = stage.size.w / (2 * stage.halfWidth);
    const e = stage.camera.elevation;
    const a = stage.camera.azimuth;
    const half = s * Math.sin(e);
    const rise = BODY * Math.cos(e) * s;
    const at = plan(stage);
    let hit = -1;
    let front = -Infinity;
    let close = -1;
    let closeD = reach;
    for (let i = 0; i < N; i++) {
      const p = at(x[i], y[i]);
      const u = (px - p[0]) / s;
      if (Math.abs(u) <= 1) {
        const bulge = Math.sqrt(1 - u * u) * half;
        const toward = x[i] * Math.sin(a) - y[i] * Math.cos(a);
        if (py <= p[1] + bulge && py >= p[1] - rise - bulge && toward > front) {
          front = toward;
          hit = i;
        }
      }
      const d = Math.hypot(px - p[0], py - (p[1] - rise / 2));
      if (on[i] && d < closeD) {
        closeD = d;
        close = i;
      }
    }
    if (hit >= 0) return on[hit] ? hit : -1;
    return close;
  }

  /* The working robot nearest the marked spot. It stays the same one while it is about as near as any, so the maize does not hop about. */
  function nearest() {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < N; i++) {
      const d = Math.hypot(x[i], y[i]);
      if (on[i] && d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (pick < 0 || !on[pick] || Math.hypot(x[pick], y[pick]) > bestD + 0.6) pick = best;
    return pick;
  }

  /* Run the rules ahead without drawing, so a still picture shows where things come to rest. */
  function settle(steps) {
    const floor = floorRadius(stage.size.w);
    for (let k = 0; k < steps; k++) step(1 / 60, floor);
  }

  /* Left alone, the figure tells its own story: two robots fail a few seconds apart, the rest
     close in and carry on, and then all are switched back on. A visitor who clicks, taps, presses
     a key, or resets takes the figure over, and the story waits until it has been left alone for
     a while. Times are in seconds since the story last began. */
  const STORY = [[0.4, "on"], [5, "off"], [8.5, "off"], [17, "again"]];
  const TAKEN = 20; /* how long the story waits after the visitor's last move */
  let idle = 0;
  let beat = 0;
  function taken() {
    idle = -TAKEN;
    beat = 0;
  }
  /* A working robot well inside the group, where the others have to close in around it. */
  function inside() {
    const group = [];
    for (let i = 0; i < N; i++) if (on[i] && Math.hypot(x[i], y[i]) < EDGE * 0.6) group.push(i);
    return group.length ? group[Math.floor(rand() * group.length)] : nearest();
  }
  function story(dt) {
    idle += dt;
    while (idle >= STORY[beat][0]) {
      const act = STORY[beat][1];
      beat += 1;
      if (act === "off") switchOff(inside());
      else if (act === "on") revive();
      else {
        idle = 0;
        beat = 0;
        break;
      }
    }
  }

  const loop = run(stageEl, (dt) => {
    const floor = floorRadius(stage.size.w);
    const parts = Math.max(1, Math.round(dt * 60));
    story(dt);
    for (let k = 0; k < parts; k++) step(dt / parts, floor);
    if (mouse) point(robotAt(mouse[0], mouse[1], 0));
    show();
  });

  function count() {
    let working = 0;
    for (let i = 0; i < N; i++) working += on[i];
    /* A figure space keeps the count two characters wide, so the button beside it stays put. */
    if (countOut) countOut.textContent = String(working).padStart(2, "\u2007");
  }

  function switchOff(i) {
    if (i < 0 || !on[i]) return;
    on[i] = 0;
    if (hover === i) point(-1);
    count();
    if (loop.paused) settle(300); /* with motion reduced, the still picture jumps to the others having closed in */
    redraw();
  }

  /* Every robot back on, where it stands. */
  function revive() {
    on.fill(1);
    count();
  }

  function restart() {
    scatter(floorRadius(stage.size.w));
    if (loop.paused) settle(1500);
    point(-1);
    count();
    redraw();
  }

  let press = null; /* where a press on the picture began, while it lasts */
  let dragged = false; /* the latest press traveled: it turned the view, so the click that ends it is not for a robot */
  let finger = false; /* the latest press was a finger's */
  function cursor() {
    over.style.cursor = press && dragged ? "grabbing" : hover >= 0 ? "pointer" : "grab";
  }
  function point(i) {
    if (i === hover) return;
    hover = i;
    cursor();
    redraw();
  }
  const where = (e) => {
    const box = over.getBoundingClientRect();
    return [e.clientX - box.left, e.clientY - box.top];
  };

  /* Drag sideways to turn the view, all the way around; a press that does not travel is a click on a robot. */
  stage.orbit({ min: -Infinity, max: Infinity, onTurn: redraw });
  over.addEventListener("pointerdown", (e) => {
    press = [e.clientX, e.clientY];
    dragged = false;
    finger = e.pointerType === "touch";
    keys = false;
    cursor();
    redraw();
  });
  over.addEventListener("pointermove", (e) => {
    if (press && Math.hypot(e.clientX - press[0], e.clientY - press[1]) > 6) dragged = true;
    mouse = e.pointerType === "mouse" && !(press && dragged) ? where(e) : null;
    point(mouse ? robotAt(mouse[0], mouse[1], 0) : -1);
    cursor();
  });
  over.addEventListener("pointerleave", () => {
    mouse = null;
    point(-1);
  });
  for (const type of ["pointerup", "pointercancel"]) {
    over.addEventListener(type, () => {
      press = null;
      cursor();
    });
  }
  /* A click, not a press: a finger that starts a scroll on the figure switches nothing off. A finger gets a wider reach. */
  over.addEventListener("click", (e) => {
    if (dragged) return;
    const p = where(e);
    taken();
    switchOff(robotAt(p[0], p[1], finger ? 22 : 8));
  });

  /* From the keyboard, with the picture in focus: the arrow keys turn the view, and Enter or
     Space switches off the working robot nearest the marked spot, which is shown in maize. */
  stageEl.addEventListener("keydown", (e) => {
    if (e.target !== stageEl || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") stage.camera.azimuth += e.key === "ArrowLeft" ? 0.12 : -0.12;
    else if (e.key === "Enter" || e.key === " ") {
      taken();
      switchOff(nearest());
    } else return;
    keys = true;
    e.preventDefault();
    redraw();
  });
  stageEl.addEventListener("focus", () => {
    try {
      keys = stageEl.matches(":focus-visible");
    } catch (err) {
      keys = false;
    }
    redraw();
  });
  stageEl.addEventListener("blur", () => {
    keys = false;
    redraw();
  });

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      taken();
      restart();
    });
  }
  if (hint && window.matchMedia("(hover: none)").matches) hint.textContent = hint.textContent.replace("Click", "Tap");

  restart();
  /* Where motion is reduced the story cannot play, so the still picture shows its middle: two robots off, the rest closed in. */
  if (loop.paused) {
    switchOff(inside());
    switchOff(inside());
  }
  show();
})();
