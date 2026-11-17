/*
 * Research page: an illustrative robot swarm (not the lab's control software).
 *
 * Each robot follows a few simple rules: keep a little distance from its
 * neighbors, steer around the pointer, and either flock with nearby robots or
 * head for its slot in a shared shape. Together they flock, form a ring, pack
 * into a lattice, spell a Z, or draw the Atombot mark, and they close ranks
 * again after being pushed.
 */
(() => {
  "use strict";

  const root = document.querySelector("[data-swarm]");
  if (!root) return;

  const canvas = root.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const modeEl = root.querySelector("[data-mode]");
  const formedEl = root.querySelector("[data-formed]");
  const buttons = Array.from(root.querySelectorAll("[data-formation]"));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const MODES = ["flock", "ring", "lattice", "z", "atombot"];
  const LABELS = { flock: "Flock", ring: "Ring", lattice: "Lattice", z: "Letter Z", atombot: "Atombot mark" };
  const Z_OUTLINE = [[0, 0], [0.8, 0], [0.8, 0.2], [0.28, 0.8], [0.8, 0.8], [0.8, 1], [0, 1], [0, 0.8], [0.52, 0.2], [0, 0.2]];
  const HOLD_SECS = 7; /* how long each formation shows while auto-cycling */


  let W = 0;
  let H = 0;
  let N = 0;
  let x, y, vx, vy, hd, tx, ty;
  let mode = "flock";
  let auto = true;
  let modeT = 0;
  let colors = {};
  let rafId = 0;
  let lastTime = 0;
  let inView = false;
  const pointer = { x: 0, y: 0, on: false };

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  function insideZ(ux, uy) {
    let inside = false;
    for (let i = 0, j = Z_OUTLINE.length - 1; i < Z_OUTLINE.length; j = i++) {
      const [xi, yi] = Z_OUTLINE[i];
      const [xj, yj] = Z_OUTLINE[j];
      if (yi > uy !== yj > uy && ux < ((xj - xi) * (uy - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  /* Centers of the inked bitmap cells, centered on the art and scaled so its longer side is 1. */

  /*
   * Spread n points evenly over a set of cells: start from farthest-point
   * sampling (each new point is the cell farthest from all points so far), then
   * relax with a few rounds of Lloyd's algorithm (move each point to the middle
   * of the cells closest to it).
   */
  function spread(cells, n) {
    const m = cells.length;
    const far = new Float32Array(m).fill(Infinity);
    const pts = [];
    let next = 0;
    let best = Infinity;
    for (let c = 0; c < m; c++) {
      const d = cells[c][0] ** 2 + cells[c][1] ** 2;
      if (d < best) {
        best = d;
        next = c;
      }
    }
    while (pts.length < n) {
      const p = cells[next];
      pts.push([p[0], p[1]]);
      let farthest = -1;
      for (let c = 0; c < m; c++) {
        const d = (cells[c][0] - p[0]) ** 2 + (cells[c][1] - p[1]) ** 2;
        if (d < far[c]) far[c] = d;
        if (farthest < 0 || far[c] > far[farthest]) farthest = c;
      }
      next = farthest;
    }
    for (let round = 0; round < 12; round++) {
      const sum = pts.map(() => [0, 0, 0]);
      for (let c = 0; c < m; c++) {
        let near = 0;
        let nearD = Infinity;
        for (let k = 0; k < n; k++) {
          const d = (cells[c][0] - pts[k][0]) ** 2 + (cells[c][1] - pts[k][1]) ** 2;
          if (d < nearD) {
            nearD = d;
            near = k;
          }
        }
        sum[near][0] += cells[c][0];
        sum[near][1] += cells[c][1];
        sum[near][2]++;
      }
      for (let k = 0; k < n; k++) {
        if (sum[k][2]) pts[k] = [sum[k][0] / sum[k][2], sum[k][1] / sum[k][2]];
      }
    }
    return pts;
  }

  const atombotCells = window.ZLabAtombot.cells; /* from atombot-art.js */
  const atombotSlots = {}; /* cache: swarm size -> slots */

  function readColors() {
    const light = document.documentElement.dataset.theme === "light";
    colors = light
      ? { body: "#0a5c9e", core: "#b98f00", link: "rgba(10,92,158,0.2)", ring: "rgba(10,26,47,0.14)" }
      : { body: "#7cc8ff", core: "#ffcb05", link: "rgba(124,200,255,0.2)", ring: "rgba(163,180,200,0.16)" };
  }

  /* Slots for the current formation, as [x, y] pairs. */
  function slots(kind) {
    const cx = W / 2;
    const cy = H / 2;
    const size = Math.min(W, H);
    const out = [];
    if (kind === "ring") {
      const outer = Math.ceil(N * 0.62);
      for (let i = 0; i < N; i++) {
        const onOuter = i < outer;
        const count = onOuter ? outer : N - outer;
        const a = ((onOuter ? i : i - outer) / count) * Math.PI * 2 + (onOuter ? 0 : 0.2);
        const r = size * (onOuter ? 0.37 : 0.24);
        out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
    } else if (kind === "lattice") {
      /* hexagonal packing: fill outward from the center, ring by ring */
      const s = Math.min(26, (size * 0.8) / Math.sqrt(N * 1.3));
      const all = [];
      for (let j = -12; j <= 12; j++) {
        for (let i = -12; i <= 12; i++) {
          const px = (i + (j % 2 ? 0.5 : 0)) * s;
          const py = j * s * 0.866;
          all.push([px, py, px * px + py * py]);
        }
      }
      all.sort((a, b) => a[2] - b[2]);
      for (let i = 0; i < N; i++) out.push([cx + all[i][0], cy + all[i][1]]);
    } else if (kind === "z") {
      /* try nearby lattice spacings and keep the one whose site count is closest to N from above */
      const zh = size * 0.78;
      const guess = Math.sqrt((0.488 * zh * zh) / (N * 0.866));
      let best = null;
      for (let s = guess * 1.08; s > guess * 0.9; s -= guess * 0.002) {
        const sites = [];
        for (let j = 0, py = s * 0.433; py < zh; j++, py += s * 0.866) {
          for (let px = j % 2 ? s * 0.75 : s * 0.25; px < zh * 0.8; px += s) {
            if (insideZ(px / zh, py / zh)) sites.push([cx - zh * 0.4 + px, cy - zh * 0.5 + py]);
          }
        }
        if (sites.length >= N && (!best || sites.length < best.length)) best = sites;
        if (best && best.length === N) break;
      }
      /* trim any extras evenly from the two ends so the letter stays symmetric */
      while (best.length > N) {
        if ((best.length - N) % 2) best.pop();
        else best.shift();
      }
      for (let i = 0; i < N; i++) out.push(best[i]);
    } else if (kind === "atombot") {
      if (!atombotSlots[N]) atombotSlots[N] = spread(atombotCells, N);
      const scale = size * 0.92;
      atombotSlots[N].forEach(([u, v]) => out.push([cx + u * scale, cy + v * scale]));
    }
    return out;
  }

  /* Hand each robot the nearest free slot (greedy), so paths rarely cross. */
  function assign(kind) {
    if (kind === "flock") return;
    const free = slots(kind);
    const order = Array.from({ length: N }, (_, i) => i).sort(() => Math.random() - 0.5);
    order.forEach((i) => {
      let best = 0;
      let bestD = Infinity;
      for (let s = 0; s < free.length; s++) {
        const d = (free[s][0] - x[i]) ** 2 + (free[s][1] - y[i]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      tx[i] = free[best][0];
      ty[i] = free[best][1];
      free.splice(best, 1);
    });
  }

  function setMode(next, byUser) {
    mode = next;
    modeT = 0;
    if (byUser) auto = false;
    assign(mode);
    if (modeEl) modeEl.textContent = LABELS[mode];
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.formation === mode)));
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = Math.max(1, rect.width);
    H = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const wanted = clamp(Math.round((W * H) / 1500), 70, 150);
    if (wanted !== N) {
      N = wanted;
      x = new Float32Array(N);
      y = new Float32Array(N);
      vx = new Float32Array(N);
      vy = new Float32Array(N);
      hd = new Float32Array(N);
      tx = new Float32Array(N);
      ty = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        x[i] = Math.random() * W;
        y[i] = Math.random() * H;
        const a = Math.random() * Math.PI * 2;
        vx[i] = Math.cos(a);
        vy[i] = Math.sin(a);
        hd[i] = a;
      }
    }
    assign(mode);
  }

  function step(dt) {
    modeT += dt / 60;
    if (auto && modeT > HOLD_SECS) setMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length], false);

    let settled = 0;
    const personal = mode === "flock" ? 15 : 12.5; /* robots pack a little tighter inside a formation */
    for (let i = 0; i < N; i++) {
      let ax = 0;
      let ay = 0;
      let alignX = 0;
      let alignY = 0;
      let cohX = 0;
      let cohY = 0;
      let near = 0;

      for (let j = 0; j < N; j++) {
        if (j === i) continue;
        const dx = x[j] - x[i];
        const dy = y[j] - y[i];
        const d2 = dx * dx + dy * dy;
        if (d2 > 2500) continue;
        const d = Math.sqrt(d2) + 0.01;
        if (d < personal) {
          /* separation */
          const push = (personal - d) / personal;
          ax -= (dx / d) * push * 0.9;
          ay -= (dy / d) * push * 0.9;
        }
        if (mode === "flock") {
          alignX += vx[j];
          alignY += vy[j];
          cohX += dx;
          cohY += dy;
          near++;
        }
      }

      if (mode === "flock") {
        if (near) {
          ax += (alignX / near - vx[i]) * 0.06 + (cohX / near) * 0.0016;
          ay += (alignY / near - vy[i]) * 0.06 + (cohY / near) * 0.0016;
        }
        /* stay on stage, and drift toward the pointer if there is one */
        const m = 46;
        if (x[i] < m) ax += (m - x[i]) * 0.004;
        if (x[i] > W - m) ax -= (x[i] - (W - m)) * 0.004;
        if (y[i] < m) ay += (m - y[i]) * 0.004;
        if (y[i] > H - m) ay -= (y[i] - (H - m)) * 0.004;
        if (pointer.on) {
          ax += (pointer.x - x[i]) * 0.00035;
          ay += (pointer.y - y[i]) * 0.00035;
        }
        vx[i] += ax * dt;
        vy[i] += ay * dt;
        const sp = Math.hypot(vx[i], vy[i]) + 0.001;
        const want = clamp(sp, 1.1, 2.1);
        vx[i] *= want / sp;
        vy[i] *= want / sp;
      } else {
        /* head for the slot, slowing down on arrival */
        const dx = tx[i] - x[i];
        const dy = ty[i] - y[i];
        const d = Math.hypot(dx, dy) + 0.001;
        const speed = Math.min(2.6, d * 0.07);
        if (d < 5) settled++;
        if (pointer.on) {
          const px = x[i] - pointer.x;
          const py = y[i] - pointer.y;
          const pd = Math.hypot(px, py) + 0.01;
          if (pd < 70) {
            const push = ((70 - pd) / 70) * 1.6;
            ax += (px / pd) * push;
            ay += (py / pd) * push;
          }
        }
        vx[i] += ((dx / d) * speed - vx[i]) * 0.12 * dt + ax * dt;
        vy[i] += ((dy / d) * speed - vy[i]) * 0.12 * dt + ay * dt;
      }

      x[i] += vx[i] * dt;
      y[i] += vy[i] * dt;
      if (Math.hypot(vx[i], vy[i]) > 0.25) {
        let turn = Math.atan2(vy[i], vx[i]) - hd[i];
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        hd[i] += turn * 0.18 * dt;
      }
    }
    if (formedEl) formedEl.textContent = mode === "flock" ? "free" : Math.round((settled / N) * 100) + "%";
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    /* who can "hear" whom */
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const dx = x[j] - x[i];
        const dy = y[j] - y[i];
        if (dx * dx + dy * dy < 1100) {
          ctx.moveTo(x[i], y[i]);
          ctx.lineTo(x[j], y[j]);
        }
      }
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = colors.link;
    ctx.stroke();

    if (pointer.on && mode !== "flock") {
      ctx.beginPath();
      ctx.arc(pointer.x, pointer.y, 70, 0, Math.PI * 2);
      ctx.strokeStyle = colors.ring;
      ctx.setLineDash([4, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    /* robots: a ring for the body, a tick for the heading, a dot for the core */
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = colors.body;
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      ctx.moveTo(x[i] + 5, y[i]);
      ctx.arc(x[i], y[i], 5, 0, Math.PI * 2);
      ctx.moveTo(x[i] + Math.cos(hd[i]) * 5, y[i] + Math.sin(hd[i]) * 5);
      ctx.lineTo(x[i] + Math.cos(hd[i]) * 9, y[i] + Math.sin(hd[i]) * 9);
    }
    ctx.stroke();
    ctx.fillStyle = colors.core;
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      ctx.moveTo(x[i] + 2, y[i]);
      ctx.arc(x[i], y[i], 2, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  function tick(now) {
    rafId = 0;
    const dt = lastTime ? clamp((now - lastTime) / 16.667, 0.2, 2.5) : 1;
    lastTime = now;
    step(dt);
    draw();
    schedule();
  }

  function schedule() {
    if (rafId) return;
    if (inView && !reduceMotion.matches && !document.hidden) rafId = requestAnimationFrame(tick);
    else lastTime = 0;
  }

  /* Wiring */
  buttons.forEach((b) =>
    b.addEventListener("click", () => {
      setMode(b.dataset.formation, true);
      if (reduceMotion.matches) {
        /* no animation: jump straight to the finished formation */
        for (let i = 0; i < N; i++) {
          if (mode !== "flock") {
            x[i] = tx[i];
            y[i] = ty[i];
          }
        }
        draw();
      }
    })
  );
  canvas.addEventListener("pointermove", (e) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = e.clientX - rect.left;
    pointer.y = e.clientY - rect.top;
    pointer.on = true;
  });
  canvas.addEventListener("pointerleave", () => {
    pointer.on = false;
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
  if (reduceMotion.matches) {
    /* show a finished formation instead of a frozen random scatter */
    setMode("lattice", false);
    for (let i = 0; i < N; i++) {
      x[i] = tx[i];
      y[i] = ty[i];
    }
  } else {
    setMode("flock", false);
  }
  draw();
  schedule();
})();
