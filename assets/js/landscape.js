/*
 * Research page: an illustrative toy model of metadynamics on a rugged 1D
 * potential energy landscape (not research data).
 *
 * A walker follows overdamped Langevin dynamics on V(x) + bias(x). Small
 * Gaussian hills of bias are deposited wherever the walker currently is, so the
 * wells it has visited fill up and it can cross barriers it would otherwise
 * almost never cross. When every basin is filled a new landscape is drawn.
 */
(() => {
  "use strict";

  const root = document.querySelector("[data-landscape]");
  if (!root) return;

  const canvas = root.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const hillsEl = root.querySelector("[data-hills]");
  const basinsEl = root.querySelector("[data-basins]");
  const playBtn = root.querySelector("[data-play]");
  const restartBtn = root.querySelector("[data-restart]");
  const newBtn = root.querySelector("[data-new]");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const NB = 420; /* grid points across the coordinate */
  const DX = 1 / (NB - 1);
  const MOBILITY = 9e-4; /* high enough that the walker spreads its bias evenly */
  const KT = 0.012;
  const NOISE = Math.sqrt(2 * MOBILITY * KT);
  const HILL_HEIGHT = 0.003;
  const HILL_WIDTH = 0.016;
  const SUBSTEPS = 6;
  const HILL_EVERY = 3;
  const FULL_LEVEL = 0.9;
  const Y_MAX = 1.14;
  const PAD = { left: 36, right: 14, top: 16, bottom: 32 };

  const V = new Float32Array(NB);
  const B = new Float32Array(NB);
  let wells = [];
  let visited = [];
  let pos = 0.5;
  let hills = 0;
  let stepCount = 0;
  let seed = 7;
  let full = false;
  let fullAt = 0;
  let W = 0;
  let H = 0;
  let colors = {};
  let rafId = 0;
  let inView = false;
  let paused = reduceMotion.matches;

  /* Small seeded random generator so "Restart" can replay the same landscape. */
  function mulberry32(a) {
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gauss() {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function buildLandscape() {
    const rnd = mulberry32(seed);
    const centers = [0.19, 0.4, 0.61, 0.82];
    wells = centers.map((c) => ({
      c: c + (rnd() - 0.5) * 0.07,
      w: 0.045 + rnd() * 0.035,
      d: 0.38 + rnd() * 0.5,
    }));
    const ripples = [];
    for (let k = 0; k < 9; k++) {
      ripples.push({ f: 7 + rnd() * 20, a: 0.25 + rnd() * 0.75, ph: rnd() * Math.PI * 2 });
    }
    let lo = Infinity;
    for (let i = 0; i < NB; i++) {
      const u = i * DX;
      let v = 1;
      for (const well of wells) v -= well.d * Math.exp(-((u - well.c) ** 2) / (2 * well.w * well.w));
      let r = 0;
      for (const rp of ripples) r += (rp.a / rp.f) * Math.sin(2 * Math.PI * rp.f * u + rp.ph);
      v += 0.42 * r;
      const edge = Math.max(0, Math.abs(2 * u - 1) - 0.86) / 0.14;
      v += 2.4 * edge * edge;
      V[i] = v;
      if (u > 0.08 && u < 0.92 && v < lo) lo = v;
    }
    /* Rescale so the deepest point sits just above the axis. */
    const scale = (1 - 0.07) / (1 - lo);
    for (let i = 0; i < NB; i++) V[i] = 1 - (1 - V[i]) * scale;
    resetBias();
  }

  function resetBias() {
    B.fill(0);
    hills = 0;
    stepCount = 0;
    full = false;
    visited = wells.map(() => false);
    /* Start in the shallowest basin so the walker has somewhere to go. */
    let start = wells[0];
    for (const well of wells) if (well.d < start.d) start = well;
    pos = start.c;
    updateReadout();
  }

  function energyAt(u) {
    const f = Math.min(NB - 1.001, Math.max(0, u / DX));
    const i = Math.floor(f);
    const t = f - i;
    return (V[i] + B[i]) * (1 - t) + (V[i + 1] + B[i + 1]) * t;
  }

  function slopeAt(u) {
    const i = Math.min(NB - 2, Math.max(1, Math.round(u / DX)));
    return (V[i + 1] + B[i + 1] - V[i - 1] - B[i - 1]) / (2 * DX);
  }

  function addHill(u) {
    const reach = Math.ceil((HILL_WIDTH * 3.5) / DX);
    const center = Math.round(u / DX);
    for (let i = Math.max(0, center - reach); i <= Math.min(NB - 1, center + reach); i++) {
      const d = i * DX - u;
      B[i] += HILL_HEIGHT * Math.exp(-(d * d) / (2 * HILL_WIDTH * HILL_WIDTH));
    }
    hills++;
  }

  function advance() {
    for (let s = 0; s < SUBSTEPS; s++) {
      pos += -MOBILITY * slopeAt(pos) + NOISE * gauss();
      pos = Math.min(0.985, Math.max(0.015, pos));
      if (++stepCount % HILL_EVERY === 0) addHill(pos);
    }
    wells.forEach((well, k) => {
      if (Math.abs(pos - well.c) < well.w * 0.8) visited[k] = true;
    });
    let lowest = Infinity;
    for (let i = Math.round(0.08 / DX); i < Math.round(0.92 / DX); i++) lowest = Math.min(lowest, V[i] + B[i]);
    if (lowest >= FULL_LEVEL) {
      full = true;
      fullAt = performance.now();
    }
  }

  function updateReadout() {
    if (hillsEl) hillsEl.textContent = hills.toLocaleString("en-US");
    if (basinsEl) basinsEl.textContent = visited.filter(Boolean).length + " / " + wells.length;
  }

  function readColors() {
    const light = document.documentElement.dataset.theme === "light";
    colors = light
      ? { land: "#e6e0cf", ridge: "#0a1a2f", bias: "#ffcb05", biasEdge: "#c79a00", walker: "#0a1a2f", walkerRing: "#ffffff", axis: "rgba(10,26,47,0.55)", label: "#46586e" }
      : { land: "#14263d", ridge: "#b9c8da", bias: "#ffcb05", biasEdge: "#ffe27a", walker: "#ffffff", walkerRing: "#040c17", axis: "rgba(163,180,200,0.6)", label: "#a3b4c8" };
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = Math.max(1, rect.width);
    H = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const X = (u) => PAD.left + u * (W - PAD.left - PAD.right);
  const Y = (e) => H - PAD.bottom - (Math.min(e, Y_MAX) / Y_MAX) * (H - PAD.top - PAD.bottom);

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const floor = H - PAD.bottom;

    /* Bias: the region between the bare landscape and the filled surface. */
    ctx.beginPath();
    ctx.moveTo(X(0), Y(V[0] + B[0]));
    for (let i = 1; i < NB; i++) ctx.lineTo(X(i * DX), Y(V[i] + B[i]));
    for (let i = NB - 1; i >= 0; i--) ctx.lineTo(X(i * DX), Y(V[i]));
    ctx.closePath();
    ctx.fillStyle = colors.bias;
    ctx.fill();

    ctx.beginPath();
    let pen = false;
    for (let i = 0; i < NB; i++) {
      if (B[i] > 0.004) {
        if (pen) ctx.lineTo(X(i * DX), Y(V[i] + B[i]));
        else ctx.moveTo(X(i * DX), Y(V[i] + B[i]));
        pen = true;
      } else {
        pen = false;
      }
    }
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = colors.biasEdge;
    ctx.stroke();

    /* The landscape itself. */
    ctx.beginPath();
    ctx.moveTo(X(0), floor);
    for (let i = 0; i < NB; i++) ctx.lineTo(X(i * DX), Y(V[i]));
    ctx.lineTo(X(1), floor);
    ctx.closePath();
    ctx.fillStyle = colors.land;
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i < NB; i++) {
      if (i === 0) ctx.moveTo(X(0), Y(V[0]));
      else ctx.lineTo(X(i * DX), Y(V[i]));
    }
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.strokeStyle = colors.ridge;
    ctx.stroke();

    /* Walker */
    const wx = X(pos);
    const wy = Y(energyAt(pos)) - 8;
    ctx.beginPath();
    ctx.arc(wx, wy, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = colors.walker;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = colors.walkerRing;
    ctx.stroke();

    /* Axes and labels */
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = colors.axis;
    ctx.beginPath();
    ctx.moveTo(PAD.left, PAD.top - 4);
    ctx.lineTo(PAD.left, floor);
    ctx.lineTo(W - PAD.right + 4, floor);
    ctx.stroke();

    ctx.fillStyle = colors.label;
    ctx.font = '500 10px "Geist Mono", ui-monospace, Menlo, monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if ("letterSpacing" in ctx) ctx.letterSpacing = "1.2px";
    ctx.fillText("GENERALIZED COORDINATE", (PAD.left + W - PAD.right) / 2, H - PAD.bottom / 2 + 2);
    ctx.save();
    ctx.translate(PAD.left / 2 - 1, (PAD.top + floor) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("POTENTIAL ENERGY", 0, 0);
    ctx.restore();
  }

  function tick(now) {
    rafId = 0;
    if (full) {
      if (now - fullAt > 2600) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        buildLandscape();
      }
    } else {
      advance();
    }
    draw();
    updateReadout();
    schedule();
  }

  function schedule() {
    if (!rafId && inView && !paused && !document.hidden) rafId = requestAnimationFrame(tick);
  }

  function setPaused(value) {
    paused = value;
    if (playBtn) {
      playBtn.textContent = paused ? "Play" : "Pause";
      playBtn.setAttribute("aria-pressed", String(!paused));
    }
    schedule();
  }

  /* Wiring */
  if (playBtn) playBtn.addEventListener("click", () => setPaused(!paused));
  if (restartBtn) {
    restartBtn.addEventListener("click", () => {
      resetBias();
      draw();
      schedule();
    });
  }
  if (newBtn) {
    newBtn.addEventListener("click", () => {
      seed = (Math.random() * 4294967295) >>> 0;
      buildLandscape();
      draw();
      schedule();
    });
  }
  canvas.addEventListener("pointerdown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const u = (e.clientX - rect.left - PAD.left) / (rect.width - PAD.left - PAD.right);
    pos = Math.min(0.985, Math.max(0.015, u));
    draw();
  });

  new ResizeObserver(() => {
    resize();
    draw();
  }).observe(canvas);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      inView = entries[0].isIntersecting;
      schedule();
    }).observe(canvas);
  } else {
    inView = true;
  }
  document.addEventListener("visibilitychange", schedule);
  document.addEventListener("themechange", () => {
    readColors();
    draw();
  });

  readColors();
  resize();
  buildLandscape();
  setPaused(paused);
  draw();
})();
