/*
 * Research page: an illustrative toy model of metadynamics on a rugged 1D
 * potential energy landscape (not research data).
 *
 * A walker follows overdamped Langevin dynamics on V(x) + bias(x). Small
 * Gaussian hills of bias are deposited wherever the walker currently is, so the
 * wells it has visited fill up and it can cross barriers it would otherwise
 * almost never cross. When every basin is filled a new landscape is drawn.
 *
 * The figure has two panels on one horizontal axis: the landscape, with the
 * bias drawn in layers as it builds up, and under it a strip that traces where
 * the walker has been, newest at the top. Energies are labeled in units of kT.
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
  const PAD = { left: 58, right: 16, top: 36, bottom: 26 };
  const MID_ROW = 26; /* the basin letters, between the two panels */
  const TICK_KT = 20; /* a gridline every 20 kT */
  const TRAIL_N = 420; /* frames of history in the strip */
  const LAYER_EVERY = 60; /* hills between two layer lines, to begin with */
  const LAYER_MAX = 24;

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
  let layers = []; /* snapshots of the bias, drawn as lines inside the fill */
  let layerEvery = LAYER_EVERY;
  let hoverU = null; /* where the pointer is reading the landscape */
  const trail = new Float32Array(TRAIL_N); /* ring buffer of positions; NaN breaks the line */
  let trailHead = 0;
  let trailLen = 0;
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
    /* Where each basin actually bottoms out, once the ripples are in. */
    wells.forEach((well) => {
      let at = Math.round(well.c / DX);
      for (let i = Math.round((well.c - well.w) / DX); i <= Math.round((well.c + well.w) / DX); i++) {
        if (i > 0 && i < NB && V[i] < V[at]) at = i;
      }
      well.min = at * DX;
    });
    resetBias();
  }

  function resetBias() {
    B.fill(0);
    layers = [];
    layerEvery = LAYER_EVERY;
    trailHead = 0;
    trailLen = 0;
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
    if (hills % layerEvery === 0) {
      layers.push(B.slice());
      if (layers.length > LAYER_MAX) {
        /* Keep every other layer and space the next ones twice as far apart. */
        layers = layers.filter((_, k) => k % 2 === 1);
        layerEvery *= 2;
      }
    }
  }

  function remember(u) {
    trail[trailHead] = u;
    trailHead = (trailHead + 1) % TRAIL_N;
    trailLen = Math.min(TRAIL_N, trailLen + 1);
  }

  function advance() {
    for (let s = 0; s < SUBSTEPS; s++) {
      pos += -MOBILITY * slopeAt(pos) + NOISE * gauss();
      pos = Math.min(0.985, Math.max(0.015, pos));
      if (++stepCount % HILL_EVERY === 0) addHill(pos);
    }
    remember(pos);
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
      ? { land: "#e6e0cf", ridge: "#0a1a2f", bias: "#ffcb05", biasEdge: "#c79a00", layer: "rgba(27,21,0,0.3)", walker: "#0a1a2f", walkerRing: "#ffffff", grid: "rgba(12,32,60,0.13)", base: "rgba(12,32,60,0.3)", label: "#46586e", faint: "#8a96a8", text: "#0a1a2f", trail: "10,26,47" }
      : { land: "#14263d", ridge: "#b9c8da", bias: "#ffcb05", biasEdge: "#ffe27a", layer: "rgba(27,21,0,0.34)", walker: "#ffffff", walkerRing: "#040c17", grid: "rgba(150,180,215,0.16)", base: "rgba(150,180,215,0.32)", label: "#a3b4c8", faint: "#5d7089", text: "#e7edf4", trail: "231,237,244" };
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

  /* Whole-pixel rows, so every hairline is crisp. */
  const stripH = () => Math.round(Math.min(96, Math.max(54, H * 0.17)));
  const stripBottom = () => Math.round(H - PAD.bottom);
  const stripTop = () => stripBottom() - stripH();
  const floorY = () => stripTop() - MID_ROW;
  const X = (u) => PAD.left + u * (W - PAD.left - PAD.right);
  const Y = (e) => floorY() - (Math.min(e, Y_MAX) / Y_MAX) * (floorY() - PAD.top);

  function hairline(x0, y0, x1, y1, color) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineWidth = 1;
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  function setFont(spacing) {
    ctx.font = '500 10px "Geist Mono", ui-monospace, Menlo, monospace';
    if ("letterSpacing" in ctx) ctx.letterSpacing = spacing || "0px";
  }

  /* One row above the plot naming the three things drawn in it. */
  function drawLegend() {
    setFont("0.3px");
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const y = 15;
    let x = PAD.left;
    const item = (name, swatch) => {
      swatch(x, y);
      ctx.fillStyle = colors.label;
      ctx.fillText(name, x + 20, y + 0.5);
      x += 20 + ctx.measureText(name).width + 18;
    };
    item("landscape", (sx, sy) => {
      ctx.fillStyle = colors.land;
      ctx.fillRect(sx, sy - 1, 14, 6);
      hairline(sx, sy - 1.5, sx + 14, sy - 1.5, colors.ridge);
    });
    item("added bias", (sx, sy) => {
      ctx.fillStyle = colors.bias;
      ctx.fillRect(sx + 2, sy - 5, 10, 10);
    });
    item("walker", (sx, sy) => {
      ctx.beginPath();
      ctx.arc(sx + 7, sy, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = colors.walker;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = colors.walkerRing;
      ctx.stroke();
    });
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const floor = floorY();
    const top = stripTop();
    const bottom = stripBottom();
    const left = PAD.left;
    const right = W - PAD.right;

    /* Energy grid, in units of kT. The landscape is drawn over it. */
    setFont();
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const topTick = Math.floor(1 / (TICK_KT * KT)) * TICK_KT;
    for (let kt = 0; kt <= topTick; kt += TICK_KT) {
      const y = Math.round(Y(kt * KT)) + 0.5;
      if (kt > 0) hairline(left, y, right, y, colors.grid);
      ctx.fillStyle = colors.faint;
      ctx.fillText(kt === topTick ? kt + " kT" : String(kt), left - 8, y);
    }

    /* Bias: the region between the bare landscape and the filled surface. */
    ctx.beginPath();
    ctx.moveTo(X(0), Y(V[0] + B[0]));
    for (let i = 1; i < NB; i++) ctx.lineTo(X(i * DX), Y(V[i] + B[i]));
    for (let i = NB - 1; i >= 0; i--) ctx.lineTo(X(i * DX), Y(V[i]));
    ctx.closePath();
    ctx.fillStyle = colors.bias;
    ctx.fill();

    /* Earlier surfaces of the bias, so the fill shows how it built up. */
    ctx.lineWidth = 1;
    ctx.lineJoin = "round";
    ctx.strokeStyle = colors.layer;
    layers.forEach((layer, k) => {
      /* Only where the bias kept growing afterwards, so no line is drawn twice. */
      const next = layers[k + 1] || B;
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i < NB; i++) {
        if (layer[i] > 0.004 && next[i] - layer[i] > 0.006) {
          if (pen) ctx.lineTo(X(i * DX), Y(V[i] + layer[i]));
          else ctx.moveTo(X(i * DX), Y(V[i] + layer[i]));
          pen = true;
        } else {
          pen = false;
        }
      }
      ctx.stroke();
    });

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

    hairline(left, floor + 0.5, right, floor + 0.5, colors.base);

    /* Basins: a letter under each, and a guide down through the strip. */
    setFont();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    wells.forEach((well, k) => {
      const x = Math.round(X(well.min)) + 0.5;
      hairline(x, floor, x, floor + 5, colors.base);
      hairline(x, top, x, bottom, colors.grid);
      ctx.fillStyle = visited[k] ? colors.text : colors.faint;
      ctx.fillText(String.fromCharCode(65 + k), x, floor + MID_ROW / 2 + 1);
    });

    /* The strip: where the walker has been, newest at the top. */
    hairline(left, top + 0.5, right, top + 0.5, colors.grid);
    hairline(left, bottom + 0.5, right, bottom + 0.5, colors.base);
    ctx.textAlign = "right";
    ctx.fillStyle = colors.faint;
    ctx.fillText("now", left - 8, top + 6);
    ctx.fillText("earlier", left - 8, bottom - 5);
    if (trailLen > 1) {
      const fade = ctx.createLinearGradient(0, top, 0, bottom);
      fade.addColorStop(0, "rgba(" + colors.trail + ",0.95)");
      fade.addColorStop(1, "rgba(" + colors.trail + ",0.12)");
      ctx.beginPath();
      let down = false;
      for (let k = 0; k < trailLen; k++) {
        const u = trail[(trailHead - 1 - k + TRAIL_N * 2) % TRAIL_N];
        if (Number.isNaN(u)) {
          down = false;
          continue;
        }
        const y = top + 3 + (k / (TRAIL_N - 1)) * (bottom - top - 5);
        if (down) ctx.lineTo(X(u), y);
        else ctx.moveTo(X(u), y);
        down = true;
      }
      ctx.lineWidth = 1.25;
      ctx.lineJoin = "round";
      ctx.strokeStyle = fade;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(X(pos), top + 3, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = colors.walker;
    ctx.fill();

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

    /* Reading the landscape under the pointer. */
    if (hoverU !== null) {
      const x = Math.round(X(hoverU)) + 0.5;
      const i = Math.min(NB - 1, Math.max(0, Math.round(hoverU / DX)));
      hairline(x, PAD.top, x, floor, colors.base);
      ctx.beginPath();
      ctx.arc(x, Y(V[i] + B[i]), 3, 0, Math.PI * 2);
      ctx.fillStyle = colors.text;
      ctx.fill();
      const bias = Math.round(B[i] / KT);
      const reading = Math.round(V[i] / KT) + " kT" + (bias > 0 ? " + " + bias + " kT bias" : "");
      setFont();
      ctx.textBaseline = "middle";
      const flip = x + 12 + ctx.measureText(reading).width > right;
      ctx.textAlign = flip ? "right" : "left";
      ctx.fillStyle = colors.text;
      ctx.fillText(reading, x + (flip ? -8 : 8), PAD.top + 8);
    }

    drawLegend();

    setFont("0.6px");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = colors.label;
    ctx.fillText("generalized coordinate", (left + right) / 2, H - PAD.bottom / 2 + 2);
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
    if (!rafId && inView && !paused && !document.hidden && !document.documentElement.classList.contains("zgame-lock")) rafId = requestAnimationFrame(tick);
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
  const coordinateAt = (e) => {
    const rect = canvas.getBoundingClientRect();
    return (e.clientX - rect.left - PAD.left) / (rect.width - PAD.left - PAD.right);
  };
  canvas.addEventListener("pointerdown", (e) => {
    pos = Math.min(0.985, Math.max(0.015, coordinateAt(e)));
    remember(NaN); /* a jump, not a path: lift the pen */
    draw();
  });
  canvas.addEventListener("pointermove", (e) => {
    const u = coordinateAt(e);
    hoverU = e.pointerType !== "touch" && u >= 0 && u <= 1 ? u : null;
    if (!rafId) draw();
  });
  canvas.addEventListener("pointerleave", () => {
    hoverU = null;
    if (!rafId) draw();
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
  document.addEventListener("zlab:game", schedule); /* rest while the hidden game covers the page */
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
