/*
 * Research, "Lose two, keep going".
 *
 * A concept illustration, not a recording, not a design, and not the lab's
 * control software. A floor seen from above with 36 disc robots. Each working
 * robot shuffles in small random steps, leans toward a marked spot, and keeps
 * a little room from its working neighbors, so the robots drift together into
 * a loose group around the spot. A robot that is switched off stops where it
 * is; the others close in around it and carry on.
 *
 * Every rule of motion in this file is invented for the picture. No rules,
 * speeds, or recordings of the lab's swarm are public, and nothing here is
 * measured.
 *
 * The idea rests on public statements only:
 *   - Y Z, "Soft Robots for Hard Problems", Michigan Robotics seminar,
 *     17 September 2025, https://www.youtube.com/watch?v=_GpB51rHsZg :
 *     many simple, cheap units that together do what one robot cannot, where
 *     losing one or two does not matter (39:47 to 40:13), driven by vibration
 *     motors, without wheels (41:07).
 *   - The Atombot page of the University of Michigan Multidisciplinary Design
 *     Program, https://mdp.engin.umich.edu/research_teams/atombot-27/ :
 *     many robots following simple rules and interactions.
 *   - The overview picture on the lab's official site, which shows one swarm
 *     unit: a round printed shell with a flat battery on top. The circle and
 *     the rectangle drawn here stand for that and for nothing more.
 */
(() => {
  "use strict";

  const root = document.querySelector('[data-fig="swarm"]');
  if (!root || !window.ZFig) return;
  const { color, font, canvas, dot, text, rule, run, pointer } = window.ZFig;

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

  const el = root.querySelector("canvas");
  const pen = el.getContext("2d");
  const playBtn = root.querySelector("[data-play]");
  const offBtn = root.querySelector("[data-off]");
  const resetBtn = root.querySelector("[data-reset]");
  const countOut = root.querySelector("[data-working]");

  const x = new Float64Array(N); /* position, measured from the marked spot */
  const y = new Float64Array(N);
  const heading = new Float64Array(N);
  const sx = new Float64Array(N); /* the current shuffle, a velocity */
  const sy = new Float64Array(N);
  const ax = new Float64Array(N); /* the push from neighbors, summed each step */
  const ay = new Float64Array(N);
  const on = new Uint8Array(N);
  let hover = -1;

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

  /* The key above the floor: each label and the half-width of the small drawing beside it. */
  const KEY = [["working", 8], ["switched off", 8], ["marked spot", 10]];

  /* Where each entry of the key starts. An entry that does not fit on the line starts the next one. */
  function key(w) {
    const gap = w < 400 ? 14 : 24;
    const places = [];
    let kx = 0;
    let ky = 11;
    pen.font = font.note;
    for (const [label, half] of KEY) {
      const width = 2 * half + 6 + pen.measureText(label).width;
      if (kx > 0 && kx + width > w) {
        kx = 0;
        ky += 20;
      }
      places.push([kx, ky]);
      kx += width + gap;
    }
    return { places, height: ky + 19 };
  }

  /* The floor fills the canvas below the key. One robot radius in pixels sets the scale. */
  function floor(w, h) {
    const r = Math.max(8, Math.min(11, w / 54));
    const top = key(w).height;
    return { r, top, cx: w / 2, cy: top + (h - top) / 2, halfW: Math.max(12, w / 2 / r), halfH: Math.max(12, (h - top) / 2 / r) };
  }

  function confine(f) {
    for (let i = 0; i < N; i++) {
      x[i] = Math.max(-f.halfW + 1.3, Math.min(f.halfW - 1.3, x[i]));
      y[i] = Math.max(-f.halfH + 1.3, Math.min(f.halfH - 1.3, y[i]));
    }
  }

  /* All robots working, scattered over the floor. */
  function scatter(f) {
    seed = SEED;
    for (let i = 0; i < N; i++) {
      for (let tries = 0; tries < 400; tries++) {
        x[i] = (rand() * 2 - 1) * (f.halfW - 1.6);
        y[i] = (rand() * 2 - 1) * (f.halfH - 1.6);
        let free = Math.hypot(x[i], y[i]) > 4;
        for (let j = 0; j < i && free; j++) free = Math.hypot(x[i] - x[j], y[i] - y[j]) > 3;
        if (free) break;
      }
      heading[i] = rand() * Math.PI * 2;
      sx[i] = 0;
      sy[i] = 0;
      on[i] = 1;
    }
  }

  /* One step of the invented rules. A robot that is switched off is never moved. */
  function step(dt, f) {
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
    confine(f);
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

  /* One robot from above: a round shell with a flat battery on top. Switched off, it is drawn pale. */
  function robot(ctx, px, py, r, turn, working, pointed) {
    const line = working ? color.ink : color.ink3;
    const fill = working ? color.paper : color.wash;
    dot(ctx, px, py, r, fill, line, pointed ? 2.6 : working ? 1.5 : 1);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(turn);
    ctx.lineWidth = working ? 1.2 : 1;
    ctx.strokeStyle = line;
    ctx.strokeRect(-0.54 * r, -0.32 * r, 1.08 * r, 0.64 * r);
    ctx.restore();
  }

  /* The marked spot: the figure's one maize mark, with four ticks around it. */
  function mark(ctx, px, py, r) {
    const m = Math.max(4, 0.5 * r);
    const from = m + 0.25 * r;
    const to = m + 0.7 * r;
    for (const [ux, uy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) rule(ctx, px + ux * from, py + uy * from, px + ux * to, py + uy * to, color.ink, 1.2);
    dot(ctx, px, py, m, color.maize, color.ink, 1.4);
  }

  const stage = canvas(el, (w) => (w < 480 ? 330 : 380), (ctx, w, h) => {
    const f = floor(w, h);
    confine(f);

    /* The floor: a frame and faint tile lines, with the marked spot in the middle of a tile. */
    const tile = 4 * f.r;
    for (let gx = f.cx - (Math.floor(f.cx / tile) + 0.5) * tile; gx < w; gx += tile) {
      if (gx > 1) rule(ctx, Math.round(gx) + 0.5, f.top, Math.round(gx) + 0.5, h, color.rule);
    }
    for (let gy = f.cy - (Math.floor((f.cy - f.top) / tile) + 0.5) * tile; gy < h; gy += tile) {
      if (gy > f.top + 1) rule(ctx, 0, Math.round(gy) + 0.5, w, Math.round(gy) + 0.5, color.rule);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = color.ink;
    ctx.strokeRect(0.5, f.top + 0.5, w - 1, h - f.top - 1);

    mark(ctx, f.cx, f.cy, f.r);
    for (const working of [0, 1]) {
      for (let i = 0; i < N; i++) {
        if (on[i] === working) robot(ctx, f.cx + x[i] * f.r, f.cy + y[i] * f.r, f.r, heading[i], working, i === hover);
      }
    }

    /* The key. */
    const draw = [(px, py) => robot(ctx, px, py, 7, 0, 1, false), (px, py) => robot(ctx, px, py, 7, 0, 0, false), (px, py) => mark(ctx, px, py, 8)];
    key(w).places.forEach(([kx, ky], k) => {
      const [label, half] = KEY[k];
      draw[k](kx + half, ky);
      text(ctx, label, kx + 2 * half + 6, ky + 0.5, { font: font.note, color: color.ink2 });
    });
  });

  /* Run the rules ahead without drawing, so a still picture shows the group and not the scatter. */
  function settle() {
    const f = floor(stage.w, stage.h);
    for (let k = 0; k < 1500; k++) step(1 / 60, f);
  }

  const loop = run(el, (dt) => {
    const f = floor(stage.w, stage.h);
    const parts = Math.max(1, Math.round(dt * 60));
    for (let k = 0; k < parts; k++) step(dt / parts, f);
    stage.redraw();
  });

  function show() {
    let working = 0;
    for (let i = 0; i < N; i++) working += on[i];
    /* A figure space keeps the count two characters wide, so the buttons beside it stay put. */
    if (countOut) countOut.textContent = String(working).padStart(2, "\u2007");
    if (offBtn) {
      if (!working && document.activeElement === offBtn && resetBtn) resetBtn.focus();
      offBtn.disabled = !working;
    }
    if (hover >= 0 && !on[hover]) hover = -1;
    el.style.cursor = hover >= 0 ? "pointer" : "";
    stage.redraw();
  }

  function switchOff(i) {
    if (i < 0 || !on[i]) return;
    on[i] = 0;
    show();
  }

  function restart() {
    scatter(floor(stage.w, stage.h));
    if (loop.paused) settle();
    show();
  }

  function setPaused(value) {
    loop.setPaused(value);
    if (playBtn) {
      playBtn.textContent = loop.paused ? "Play" : "Pause";
      playBtn.setAttribute("aria-pressed", String(!loop.paused));
    }
  }

  /* The working robot under the pointer. The reach is a little wider than a robot, for fingers. */
  function robotAt(px, py) {
    const f = floor(stage.w, stage.h);
    let best = -1;
    let bestD = Math.max(f.r + 5, 17);
    for (let i = 0; i < N; i++) {
      if (!on[i]) continue;
      const d = Math.hypot(f.cx + x[i] * f.r - px, f.cy + y[i] * f.r - py);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  function point(i) {
    if (i === hover) return;
    hover = i;
    el.style.cursor = hover >= 0 ? "pointer" : "";
    if (loop.paused) stage.redraw();
  }

  pointer(el, { move: (px, py) => point(robotAt(px, py)), leave: () => point(-1) });
  /* A click, not a press: a finger that starts a scroll on the figure switches nothing off. */
  el.addEventListener("click", (e) => {
    const box = el.getBoundingClientRect();
    switchOff(robotAt(e.clientX - box.left, e.clientY - box.top));
  });

  /* From the keyboard: one working robot, picked at random from the half nearest the spot. */
  if (offBtn) {
    offBtn.addEventListener("click", () => {
      const working = [];
      for (let i = 0; i < N; i++) if (on[i]) working.push(i);
      working.sort((a, b) => Math.hypot(x[a], y[a]) - Math.hypot(x[b], y[b]));
      if (working.length) switchOff(working[Math.floor(rand() * Math.ceil(working.length / 2))]);
    });
  }
  if (resetBtn) resetBtn.addEventListener("click", restart);
  if (playBtn) playBtn.addEventListener("click", () => setPaused(!loop.paused));

  setPaused(loop.paused);
  restart();
})();
