/*
 * Home, Fig. 1: a two-dimensional Lennard-Jones liquid simulated in the page,
 * with its pair distribution function g(r) and static structure factor S(k)
 * measured while it runs.
 *
 * The two functions follow the definitions in the lab's LiquidLib (Walter et
 * al., Comput. Phys. Commun. 228, 209, 2018), written here for one species
 * with unit scattering length in d = 2:
 *
 *   g(r) = < pairs at distance r > / (N rho 2 pi r dr)
 *   S(k) = (1/N) < [sum_l cos(k.r_l)]^2 + [sum_l sin(k.r_l)]^2 >
 *
 * with k restricted to the wave vectors a periodic box allows,
 * k = (2 pi / L)(n1, n2). An illustration, not research data.
 *
 * Reduced units throughout: lengths in sigma, energies in epsilon, T* = kT / epsilon.
 */
(() => {
  "use strict";

  const root = document.querySelector("[data-liquid]");
  if (!root) return;

  const canvas = root.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const slider = root.querySelector("[data-temp]");
  const tempOut = root.querySelector("[data-temp-out]");
  const playBtn = root.querySelector("[data-play]");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* The model */
  const N = 256;
  const RHO = 0.8;
  const L = Math.sqrt(N / RHO);
  const RC = 2.5;
  const RC2 = RC * RC;
  const DT = 0.006;
  const SUBSTEPS = 8;
  const FRICTION = 1.5;
  const CELLS = Math.max(1, Math.floor(L / RC));
  const CELL = L / CELLS;

  const x = new Float64Array(N);
  const y = new Float64Array(N);
  const vx = new Float64Array(N);
  const vy = new Float64Array(N);
  const fx = new Float64Array(N);
  const fy = new Float64Array(N);
  const head = new Int32Array(CELLS * CELLS);
  const next = new Int32Array(N);
  let T = Number(slider ? slider.value : 0.72) || 0.72;

  /* What is measured */
  const R_MAX = 5;
  const R_BINS = 125;
  const DR = R_MAX / R_BINS;
  const gNow = new Float64Array(R_BINS);
  const g = new Float64Array(R_BINS);
  const K_MAX = 13;
  const DK = 0.3;
  const K_BINS = Math.floor(K_MAX / DK);
  const sNow = new Float64Array(K_BINS);
  const s = new Float64Array(K_BINS);
  const sHas = new Uint8Array(K_BINS);
  const waves = []; /* [kx, ky, bin] for a few allowed wave vectors in each |k| bin */
  let measured = 0;

  let W = 0;
  let H = 0;
  let rafId = 0;
  let inView = false;
  let paused = reduceMotion.matches;
  let frame = 0;
  let gTop = 3;
  let sTop = 3;

  function gauss() {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function setUp() {
    const side = Math.ceil(Math.sqrt(N));
    const a = L / side;
    for (let i = 0; i < N; i++) {
      x[i] = ((i % side) + 0.5) * a;
      y[i] = (Math.floor(i / side) + 0.5) * a;
      vx[i] = Math.sqrt(T) * gauss();
      vy[i] = Math.sqrt(T) * gauss();
    }
    /* A few allowed wave vectors per |k| bin, spread over directions. */
    const unit = (2 * Math.PI) / L;
    const nMax = Math.ceil(K_MAX / unit);
    const perBin = Array.from({ length: K_BINS }, () => []);
    for (let n1 = 0; n1 <= nMax; n1++) {
      for (let n2 = n1 === 0 ? 1 : -nMax; n2 <= nMax; n2++) {
        const kx = n1 * unit;
        const ky = n2 * unit;
        const bin = Math.floor(Math.hypot(kx, ky) / DK);
        if (bin < K_BINS) perBin[bin].push([kx, ky, bin]);
      }
    }
    perBin.forEach((list) => {
      const keep = Math.min(list.length, 8);
      for (let j = 0; j < keep; j++) waves.push(list[Math.floor((j * list.length) / keep)]);
      if (list.length) sHas[list[0][2]] = 1;
    });
    /* Particle 0 is the one that is followed: start it near the middle of the box. */
    const mid = Math.floor(N / 2) + Math.floor(side / 2);
    [x[0], x[mid]] = [x[mid], x[0]];
    [y[0], y[mid]] = [y[mid], y[0]];
    forces();
  }

  /* Lennard-Jones forces, cut off at RC, found with a cell list. */
  function forces() {
    fx.fill(0);
    fy.fill(0);
    head.fill(-1);
    for (let i = 0; i < N; i++) {
      const c = Math.min(CELLS - 1, Math.floor(x[i] / CELL)) + CELLS * Math.min(CELLS - 1, Math.floor(y[i] / CELL));
      next[i] = head[c];
      head[c] = i;
    }
    for (let cy = 0; cy < CELLS; cy++) {
      for (let cx = 0; cx < CELLS; cx++) {
        const c = cx + CELLS * cy;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const o = ((cx + ox + CELLS) % CELLS) + CELLS * ((cy + oy + CELLS) % CELLS);
            if (o < c && CELLS > 2) continue; /* each pair of cells once */
            for (let i = head[c]; i >= 0; i = next[i]) {
              for (let j = head[o]; j >= 0; j = next[j]) {
                if (o === c && j >= i) continue;
                let dx = x[i] - x[j];
                let dy = y[i] - y[j];
                dx -= L * Math.round(dx / L);
                dy -= L * Math.round(dy / L);
                const r2 = dx * dx + dy * dy;
                if (r2 >= RC2 || r2 === 0) continue;
                const inv2 = 1 / Math.max(r2, 0.64);
                const inv6 = inv2 * inv2 * inv2;
                const f = 24 * inv2 * inv6 * (2 * inv6 - 1);
                fx[i] += f * dx;
                fy[i] += f * dy;
                fx[j] -= f * dx;
                fy[j] -= f * dy;
              }
            }
          }
        }
      }
    }
  }

  /* Velocity Verlet, then a Langevin thermostat that holds the chosen temperature. */
  function step() {
    const c1 = Math.exp(-FRICTION * DT);
    const c2 = Math.sqrt(T * (1 - c1 * c1));
    for (let i = 0; i < N; i++) {
      vx[i] += 0.5 * DT * fx[i];
      vy[i] += 0.5 * DT * fy[i];
      x[i] = (((x[i] + DT * vx[i]) % L) + L) % L;
      y[i] = (((y[i] + DT * vy[i]) % L) + L) % L;
    }
    forces();
    for (let i = 0; i < N; i++) {
      vx[i] = c1 * (vx[i] + 0.5 * DT * fx[i]) + c2 * gauss();
      vy[i] = c1 * (vy[i] + 0.5 * DT * fy[i]) + c2 * gauss();
    }
  }

  /* g(r) and S(k) for the current frame, blended into a running average. */
  function measure() {
    gNow.fill(0);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < i; j++) {
        let dx = x[i] - x[j];
        let dy = y[i] - y[j];
        dx -= L * Math.round(dx / L);
        dy -= L * Math.round(dy / L);
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r < R_MAX) gNow[Math.floor(r / DR)] += 2;
      }
    }
    const blend = measured < 12 ? 1 / (measured + 1) : 0.07;
    for (let b = 0; b < R_BINS; b++) {
      const shell = 2 * Math.PI * (b + 0.5) * DR * DR;
      g[b] += blend * (gNow[b] / (N * RHO * shell) - g[b]);
    }
    sNow.fill(0);
    const count = new Uint8Array(K_BINS);
    for (const [kx, ky, bin] of waves) {
      let c = 0;
      let sn = 0;
      for (let i = 0; i < N; i++) {
        const phase = kx * x[i] + ky * y[i];
        c += Math.cos(phase);
        sn += Math.sin(phase);
      }
      sNow[bin] += (c * c + sn * sn) / N;
      count[bin]++;
    }
    for (let b = 0; b < K_BINS; b++) {
      if (count[b]) s[b] += blend * (sNow[b] / count[b] - s[b]);
    }
    measured++;
  }

  /* ---------- drawing ---------- */

  const INK = "#12161c";
  const INK2 = "#3d4652";
  const INK3 = "#6b7480";
  const RULE = "#e6e8eb";
  const MAIZE = "#ffcb05";
  const MONO = '11px "IBM Plex Mono", ui-monospace, Menlo, monospace';
  const SERIF = 'italic 15px "STIX Two Text", "Times New Roman", serif';

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = Math.max(1, rect.width);
    const stacked = W < 520;
    H = stacked ? Math.round(Math.min(W, 300) + 346) : 336;
    canvas.style.height = H + "px";
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function line(x0, y0, x1, y1, color, width) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineWidth = width || 1;
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  function peakOf(values, from, to) {
    let at = from;
    for (let b = from; b < to; b++) if (values[b] > values[at]) at = b;
    return at;
  }

  /* One small plot: axes, ticks, the curve, and a marked peak. */
  function plot(box, values, has, bins, step, xMax, xTicks, top, xLabel, yLabel, peakBin, peakLabel) {
    const { left, right, topY, bottom } = box;
    const X = (v) => left + (v / xMax) * (right - left);
    const Y = (v) => bottom - (Math.min(v, top) / top) * (bottom - topY);
    const y1 = Math.round(Y(1)) + 0.5;
    line(left, y1, right, y1, RULE);
    line(left + 0.5, topY, left + 0.5, bottom + 0.5, INK);
    line(left, bottom + 0.5, right, bottom + 0.5, INK);
    ctx.font = MONO;
    ctx.fillStyle = INK2;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    for (const v of xTicks) {
      const px = Math.round(X(v)) + 0.5;
      line(px, bottom, px, bottom + 4, INK);
      ctx.fillText(String(v), px, bottom + 13);
    }
    ctx.textAlign = "right";
    for (let v = 0; v <= top; v += top > 6 ? 2 : 1) {
      const py = Math.round(Y(v)) + 0.5;
      line(left - 4, py, left, py, INK);
      ctx.fillText(String(v), left - 8, py);
    }
    ctx.beginPath();
    let pen = false;
    for (let b = 0; b < bins; b++) {
      if (has && !has[b]) continue;
      const px = X((b + 0.5) * step);
      if (px > right) break;
      if (pen) ctx.lineTo(px, Y(values[b]));
      else ctx.moveTo(px, Y(values[b]));
      pen = true;
    }
    ctx.lineWidth = 1.8;
    ctx.lineJoin = "round";
    ctx.strokeStyle = INK;
    ctx.stroke();
    if (measured) {
      const px = X((peakBin + 0.5) * step);
      const py = Y(values[peakBin]);
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = MAIZE;
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.font = MONO;
      ctx.fillStyle = INK;
      ctx.textAlign = "left";
      ctx.fillText(peakLabel, px + 10, Math.max(topY + 6, py));
    }
    ctx.font = SERIF;
    ctx.fillStyle = INK;
    ctx.textAlign = "right";
    ctx.fillText(xLabel, right, bottom + 30);
    ctx.textAlign = "left";
    ctx.fillText(yLabel, left + 8, topY + 6);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const stacked = W < 520;
    const side = stacked ? Math.min(W, 300) : Math.min(H - 2, Math.round(W * 0.44));
    const bx = stacked ? Math.round((W - side) / 2) : 0;
    const by = 1;
    const scale = side / L;

    /* The liquid */
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx, by, side, side);
    ctx.clip();
    const radius = 0.4 * scale;
    ctx.fillStyle = INK;
    for (let i = 1; i < N; i++) {
      ctx.beginPath();
      ctx.arc(bx + x[i] * scale, by + y[i] * scale, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    /* One particle is followed; its rings sit at the first two peaks of g(r). */
    const first = peakOf(g, Math.floor(0.8 / DR), Math.floor(1.6 / DR));
    const second = peakOf(g, Math.floor(1.7 / DR), Math.floor(2.7 / DR));
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#00274c";
    for (const b of measured ? [first, second] : []) {
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          ctx.beginPath();
          ctx.arc(bx + (x[0] + ox * L) * scale, by + (y[0] + oy * L) * scale, (b + 0.5) * DR * scale, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(bx + x[0] * scale, by + y[0] * scale, radius * 1.25, 0, Math.PI * 2);
    ctx.fillStyle = MAIZE;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, side - 1, side - 1);

    /* The two measured functions */
    const px0 = stacked ? 34 : side + 58;
    const px1 = W - 8;
    const py0 = stacked ? side + 30 : 8;
    const each = stacked ? 108 : Math.floor((H - py0 - 44 - 40) / 2);
    const gPeak = g[first] || 1;
    const sPeakBin = peakOf(s, Math.floor(4 / DK), Math.floor(9 / DK));
    const sPeak = s[sPeakBin] || 1;
    gTop += 0.12 * (Math.max(3, Math.ceil(gPeak + 0.35)) - gTop);
    sTop += 0.12 * (Math.max(3, Math.ceil(sPeak + 0.35)) - sTop);
    plot({ left: px0, right: px1, topY: py0, bottom: py0 + each }, g, null, R_BINS, DR, R_MAX, [0, 1, 2, 3, 4, 5], Math.round(gTop), "r / σ", "g(r)", first, "first shell");
    const sy0 = py0 + each + 44;
    plot({ left: px0, right: px1, topY: sy0, bottom: sy0 + each }, s, sHas, K_BINS, DK, 12, [0, 3, 6, 9, 12], Math.round(sTop), "kσ", "S(k)", sPeakBin, "main peak");
  }

  /* ---------- loop and controls ---------- */

  function tick() {
    rafId = 0;
    for (let k = 0; k < SUBSTEPS; k++) step();
    if (++frame % 2 === 0) measure();
    draw();
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

  function showTemp() {
    if (tempOut) tempOut.textContent = "T* = " + T.toFixed(2);
  }

  if (slider) {
    slider.addEventListener("input", () => {
      T = Number(slider.value);
      showTemp();
      if (paused) {
        /* let the still picture follow the slider: settle, re-measure, redraw */
        for (let k = 0; k < 240; k++) step();
        measured = 0;
        for (let k = 0; k < 24; k++) {
          for (let j = 0; j < 6; j++) step();
          measure();
        }
        draw();
      }
    });
  }
  if (playBtn) playBtn.addEventListener("click", () => setPaused(!paused));

  new ResizeObserver(() => {
    resize();
    draw();
  }).observe(canvas.parentElement);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      inView = entries[0].isIntersecting;
      schedule();
    }).observe(canvas);
  } else {
    inView = true;
  }
  document.addEventListener("visibilitychange", schedule);
  document.addEventListener("zlab:game", schedule);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);

  /* Start from a liquid, not from the lattice the particles are placed on. */
  setUp();
  for (let k = 0; k < 700; k++) step();
  for (let k = 0; k < 24; k++) {
    for (let j = 0; j < 6; j++) step();
    measure();
  }
  showTemp();
  resize();
  setPaused(paused);
  draw();
})();
