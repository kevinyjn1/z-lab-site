/*
 * Home page hero: one 3D particle system, two readings.
 *
 * Machine: the particles drift like a liquid in a chaotic (ABC) flow, then paint
 *          the Atombot mark, each of its three brush strokes from head to tail.
 * Matter:  each stroke unrolls into one orbit of an atom: a nucleus with three
 *          streaming orbits.
 * Machine: the same particles then behave like a robot swarm and self-assemble,
 *          site by site along the pen stroke, into a close-packed three-layer
 *          lattice shaped like a Z. The lattice holds, melts, and the cycle repeats.
 *
 * The Atombot bitmap comes from atombot-art.js, which must load first.
 *
 * The camera orbits gently and follows the pointer, the pointer pushes nearby
 * particles, and scrolling "heats" the scene so the structure melts as the hero
 * leaves the screen. Honors prefers-reduced-motion and has a pause control.
 */
(() => {
  "use strict";

  const canvas = document.getElementById("hero-canvas");
  if (!canvas) return;

  const hero = canvas.closest(".hero");
  const title = hero.querySelector(".hero-title");
  const eyebrow = hero.querySelector(".eyebrow");
  const content = hero.querySelector(".hero-content");
  const ctx = canvas.getContext("2d");
  const hud = document.getElementById("hero-hud");
  const hudN = document.getElementById("hud-n");
  const hudState = document.getElementById("hud-state");
  const hudOrder = document.getElementById("hud-order");
  const pauseBtn = document.getElementById("hero-pause");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const MAIZE = [255, 203, 5];
  const SKY = [124, 200, 255];
  const LEVELS = 6; /* color steps between maize and sky */
  const NAV_H = 68;
  const FOCAL = 1400; /* perspective focal length, px */
  const DEPTH = 520; /* thickness of the liquid slab, px */
  const FLOW = 0.42; /* liquid drift speed, px per frame */
  const POINTER_RADIUS = 140;
  const ORBIT_SPEED = 0.011; /* radians per frame */
  const SPRITE_SCALE = 3.6; /* sprite half-size relative to the particle core radius */

  /* The letter Z as a polygon in a box 0.8 wide and 1 tall, plus its pen stroke. */
  const Z_OUTLINE = [[0, 0], [0.8, 0], [0.8, 0.2], [0.28, 0.8], [0.8, 0.8], [0.8, 1], [0, 1], [0, 0.8], [0.52, 0.2], [0, 0.2]];
  const Z_STROKE = [[0.02, 0.1], [0.72, 0.1], [0.08, 0.9], [0.78, 0.9]];

  const PHASES = [
    { name: "liquid", label: "liquid", secs: 3.2 },
    { name: "atombot", label: "atombot", secs: 7.2 },
    { name: "atom", label: "atom", secs: 7.8 },
    { name: "lattice", label: "lattice", secs: 10.5 },
    { name: "melt", label: "melting", secs: 2.3 },
  ];
  const LATTICE = PHASES.findIndex((p) => p.name === "lattice");
  const MARK = window.ZLabAtombot; /* ink cells of the Atombot mark, see atombot-art.js */

  /* Three orbits: circles tilted 70 degrees, fanned 60 degrees apart like the atom symbol. */
  const RINGS = [0, 1, 2].map((r) => {
    const fan = (r * Math.PI) / 3 + 0.26;
    const tilt = 1.22;
    return { cf: Math.cos(fan), sf: Math.sin(fan), ct: Math.cos(tilt), st: Math.sin(tilt), dir: r % 2 ? -1 : 1 };
  });

  let W = 0;
  let H = 0;
  let n = 0;
  let nBound = 0;
  let spacing = 20;
  let markSpacing = 20;
  let form = { cx: 0, cy: 0, h: 0 };
  let box = null;
  let px, py, pz, vx, vy, vz; /* world position and velocity; the origin is the formation center */
  let zx, zy, zz, dZ; /* lattice site and when the particle leaves for it */
  let aRing, aPhase, aRad, aOff, ax, ay, az, dAtom; /* orbit (or nucleus) slot in the atom, and when the particle leaves for it */
  let bx, by, bz, bMix, dBot; /* slot in the Atombot mark, its color, and when the particle leaves for it */
  let ord, mix, link, size, bound; /* link: how firmly the particle sits in a bonded structure (mark or lattice) */
  let sx, sy, sd, ss; /* projected screen position, depth, and scale */
  let bondA, bondB; /* neighbor pairs in the lattice */
  let markA, markB; /* neighbor pairs in the Atombot mark */
  let gridHead, gridNext, gridCols, gridRows, gridCell;
  let sprites = [];

  let phaseIdx = 0;
  let phaseT = PHASES[0].secs - 1.1; /* first liquid phase is short so structure shows up quickly */
  let clock = 0; /* animation time in frames; drives the orbits */
  let meanOrder = 0;
  let meanMix = 0;
  let heat = 0; /* 0 at the top of the page, 1 once the hero has mostly scrolled away */
  let yaw = -0.3;
  let pitch = 0.1;
  let frame = 0;
  let lastTime = 0;
  let rafId = 0;
  let inView = true;
  let userPaused = reduceMotion.matches;
  const pointer = { x: 0, y: 0, nx: 0, ny: 0, active: false };

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const smooth = (v) => {
    const u = clamp(v, 0, 1);
    return u * u * (3 - 2 * u);
  };

  function insideZ(ux, uy) {
    let inside = false;
    for (let i = 0, j = Z_OUTLINE.length - 1; i < Z_OUTLINE.length; j = i++) {
      const [xi, yi] = Z_OUTLINE[i];
      const [xj, yj] = Z_OUTLINE[j];
      if (yi > uy !== yj > uy && ux < ((xj - xi) * (uy - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function outlineArea() {
    let a = 0;
    for (let i = 0, j = Z_OUTLINE.length - 1; i < Z_OUTLINE.length; j = i++) {
      a += Z_OUTLINE[j][0] * Z_OUTLINE[i][1] - Z_OUTLINE[i][0] * Z_OUTLINE[j][1];
    }
    return Math.abs(a) / 2;
  }

  /* Position of a point along the pen stroke, 0 at the start and 1 at the end. */
  function strokeParam(ux, uy) {
    const lens = [];
    let total = 0;
    for (let i = 0; i < Z_STROKE.length - 1; i++) {
      const l = Math.hypot(Z_STROKE[i + 1][0] - Z_STROKE[i][0], Z_STROKE[i + 1][1] - Z_STROKE[i][1]);
      lens.push(l);
      total += l;
    }
    let best = Infinity;
    let bestS = 0;
    let walked = 0;
    for (let i = 0; i < Z_STROKE.length - 1; i++) {
      const [x0, y0] = Z_STROKE[i];
      const [x1, y1] = Z_STROKE[i + 1];
      const u = clamp(((ux - x0) * (x1 - x0) + (uy - y0) * (y1 - y0)) / (lens[i] * lens[i]), 0, 1);
      const d = Math.hypot(ux - (x0 + u * (x1 - x0)), uy - (y0 + u * (y1 - y0)));
      if (d < best) {
        best = d;
        bestS = (walked + u * lens[i]) / total;
      }
      walked += lens[i];
    }
    return bestS;
  }

  /* Soft glowing dot for each color step; drawn additively so overlaps brighten. */
  function buildSprites() {
    sprites = [];
    for (let level = 0; level < LEVELS; level++) {
      const u = level / (LEVELS - 1);
      const r = Math.round(MAIZE[0] + (SKY[0] - MAIZE[0]) * u);
      const g = Math.round(MAIZE[1] + (SKY[1] - MAIZE[1]) * u);
      const b = Math.round(MAIZE[2] + (SKY[2] - MAIZE[2]) * u);
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g2 = c.getContext("2d");
      const grad = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.12, "rgba(" + r + "," + g + "," + b + ",1)");
      grad.addColorStop(0.28, "rgba(" + r + "," + g + "," + b + ",0.85)");
      grad.addColorStop(0.5, "rgba(" + r + "," + g + "," + b + ",0.16)");
      grad.addColorStop(1, "rgba(" + r + "," + g + "," + b + ",0)");
      g2.fillStyle = grad;
      g2.fillRect(0, 0, 64, 64);
      sprites.push(c);
    }
  }

  function layout() {
    const rect = hero.getBoundingClientRect();
    W = Math.max(1, rect.width);
    H = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    /*
     * Put the formation in whatever space the headline leaves free: beside it
     * when there is room, otherwise in the band between the navigation and the text.
     */
    const gutter = Math.max(20, eyebrow.getBoundingClientRect().left - rect.left);
    const titleRight = title.getBoundingClientRect().right - rect.left;
    const sideRoom = W - gutter - titleRight - 56;
    if (W >= 900 && sideRoom >= 240) {
      const zh = Math.min(H * 0.62, sideRoom / 0.8);
      form = { cx: W - gutter - sideRoom / 2, cy: H * 0.47, h: zh };
    } else {
      const top = NAV_H + 20;
      const room = Math.max(150, eyebrow.getBoundingClientRect().top - rect.top - 28 - top);
      form = { cx: W / 2, cy: top + room / 2, h: Math.min(room, (W - 2 * gutter) / 0.8, 420) };
    }
    const zh = form.h;
    box = { x0: -form.cx - 60, x1: W - form.cx + 60, y0: -form.cy - 60, y1: H - form.cy + 60, z0: -DEPTH / 2, z1: DEPTH / 2 };

    n = clamp(Math.round((W * H) / 1050), 420, 1500);
    const layers = 3;
    spacing = Math.sqrt((outlineArea() * zh * zh) / (((n * 0.66) / layers) * 0.866));

    /* Close-packed lattice sites inside the Z: triangular layers stacked ABA. */
    const sites = [];
    const rowH = spacing * 0.866;
    for (let l = 0; l < layers; l++) {
      const shiftX = l % 2 ? spacing * 0.5 : 0;
      const shiftY = l % 2 ? spacing * 0.289 : 0;
      for (let j = 0, ly = rowH * 0.5 + shiftY; ly < zh; j++, ly += rowH) {
        for (let lx = (j % 2 ? spacing * 0.75 : spacing * 0.25) + shiftX; lx < zh * 0.8; lx += spacing) {
          if (insideZ(lx / zh, ly / zh)) {
            sites.push([lx - zh * 0.4, ly - zh * 0.5, (l - (layers - 1) / 2) * spacing * 0.816, strokeParam(lx / zh, ly / zh)]);
          }
        }
      }
    }
    for (let i = sites.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [sites[i], sites[j]] = [sites[j], sites[i]];
    }
    nBound = Math.min(sites.length, n - 40);

    const f32 = () => new Float32Array(n);
    px = f32(); py = f32(); pz = f32(); vx = f32(); vy = f32(); vz = f32();
    zx = f32(); zy = f32(); zz = f32(); dZ = f32();
    aPhase = f32(); aRad = f32(); aOff = f32(); ax = f32(); ay = f32(); az = f32(); dAtom = f32();
    bx = f32(); by = f32(); bz = f32(); bMix = f32(); dBot = f32();
    ord = f32(); mix = f32(); link = f32(); size = f32();
    sx = f32(); sy = f32(); sd = f32(); ss = f32();
    aRing = new Int8Array(n);
    bound = new Uint8Array(n);

    const orbit = zh * 0.44;
    const core = zh * 0.085;
    for (let i = 0; i < n; i++) {
      px[i] = box.x0 + Math.random() * (box.x1 - box.x0);
      py[i] = box.y0 + Math.random() * (box.y1 - box.y0);
      pz[i] = box.z0 + Math.random() * DEPTH;
      size[i] = 1.0 + Math.random() * 0.9;
      if (i >= nBound) continue;
      bound[i] = 1;
      zx[i] = sites[i][0];
      zy[i] = sites[i][1];
      zz[i] = sites[i][2];
      dZ[i] = sites[i][3] * 2.3 + Math.random() * 0.25;
      if (i < nBound * 0.13) {
        /* nucleus: a point inside a small sphere */
        aRing[i] = -1;
        const u = Math.random() * 2 - 1;
        const th = Math.random() * Math.PI * 2;
        const rr = core * Math.cbrt(Math.random());
        const s = Math.sqrt(1 - u * u);
        ax[i] = rr * s * Math.cos(th);
        ay[i] = rr * s * Math.sin(th);
        az[i] = rr * u;
      } else {
        /* evenly spaced beads along each orbit, with a little scatter so it stays organic */
        aRing[i] = i % 3;
        aPhase[i] = ((i - i % 3) / (nBound * 0.87)) * Math.PI * 2 + (Math.random() - 0.5) * 0.05;
        aRad[i] = orbit + (Math.random() + Math.random() - 1) * zh * 0.012;
        aOff[i] = (Math.random() + Math.random() - 1) * zh * 0.012;
      }
    }

    layoutMark(Math.min(zh * 0.94, W - 2 * gutter + 16));

    /* Bonds between neighboring sites, found once. */
    const neighbors = (x, y, z, reach) => {
      const a = [];
      const b = [];
      const reach2 = reach * reach;
      for (let i = 0; i < nBound; i++) {
        for (let j = i + 1; j < nBound; j++) {
          const dx = x[i] - x[j];
          const dy = y[i] - y[j];
          const dz = z[i] - z[j];
          if (dx * dx + dy * dy + dz * dz < reach2) {
            a.push(i);
            b.push(j);
          }
        }
      }
      return [Uint16Array.from(a), Uint16Array.from(b)];
    };
    [bondA, bondB] = neighbors(zx, zy, zz, spacing * 1.12);
    [markA, markB] = neighbors(bx, by, bz, markSpacing * 1.3);

    gridCell = Math.max(18, spacing * 1.15);
    gridCols = Math.ceil(W / gridCell) + 3;
    gridRows = Math.ceil(H / gridCell) + 3;
    gridHead = new Int32Array(gridCols * gridRows);
    gridNext = new Int32Array(n);

    if (hudN) hudN.textContent = String(n);
    if (userPaused) snapToLattice();
    project();
  }

  /*
   * The Atombot mark, `width` px wide: three layers of ink cells, thinned to one slot
   * per bound particle. Stroke k feeds orbit k of the atom, in order along the stroke,
   * so each brush stroke later unrolls into one ring instead of scattering.
   */
  function layoutMark(width) {
    const cell = width / MARK.cols;
    const layers = 3;
    markSpacing = cell * Math.sqrt((MARK.cells.length * layers) / nBound);
    const spots = [];
    for (let l = 0; l < layers; l++) {
      const shift = l % 2 ? cell * 0.5 : 0;
      for (const [u, v, stroke, along] of MARK.cells) {
        spots.push([u * width + shift, v * width + shift, (l - (layers - 1) / 2) * markSpacing * 0.8, stroke, along]);
      }
    }

    /* Farthest-point thinning keeps the chosen slots evenly spread through the ink. */
    const m = spots.length;
    const far = new Float32Array(m).fill(Infinity);
    const chosen = [[], [], []];
    let next = 0;
    for (let picked = 0; picked < nBound; picked++) {
      const p = spots[next];
      chosen[p[3]].push(p);
      far[next] = -1;
      let best = -1;
      for (let c = 0; c < m; c++) {
        if (far[c] < 0) continue;
        const d = (spots[c][0] - p[0]) ** 2 + (spots[c][1] - p[1]) ** 2 + (spots[c][2] - p[2]) ** 2;
        if (d < far[c]) far[c] = d;
        if (best < 0 || far[c] > far[best]) best = c;
      }
      next = best;
    }

    const rings = [[], [], []];
    const spare = []; /* nucleus particles, plus any ring particles their stroke cannot seat */
    for (let i = 0; i < nBound; i++) (aRing[i] < 0 ? spare : rings[aRing[i]]).push(i);
    const seat = (i, p) => {
      bx[i] = p[0];
      by[i] = p[1];
      bz[i] = p[2];
      bMix[i] = p[4];
      dBot[i] = 0.15 + p[4] * 1.7 + Math.random() * 0.3;
      dAtom[i] = 0.2 + (1 - p[4]) * 1.3 + Math.random() * 0.3;
    };
    const left = [];
    for (let k = 0; k < 3; k++) {
      const slots = chosen[k].sort((a, b) => a[4] - b[4]);
      const riders = rings[k].sort((a, b) => aPhase[a] - aPhase[b]);
      const taken = new Uint8Array(slots.length);
      const seated = Math.min(slots.length, riders.length);
      for (let r = 0; r < seated; r++) {
        const at = Math.floor(((r + 0.5) * slots.length) / seated);
        taken[at] = 1;
        seat(riders[r], slots[at]);
      }
      for (let r = seated; r < riders.length; r++) spare.push(riders[r]);
      slots.forEach((p, at) => {
        if (!taken[at]) left.push(p);
      });
    }
    spare.forEach((i, at) => seat(i, left[at]));
  }

  function snapToLattice() {
    phaseIdx = LATTICE;
    phaseT = 6;
    yaw = -0.34;
    pitch = 0.1;
    for (let i = 0; i < n; i++) {
      vx[i] = vy[i] = vz[i] = 0;
      if (!bound[i]) continue;
      px[i] = zx[i];
      py[i] = zy[i];
      pz[i] = zz[i];
      ord[i] = 1;
      mix[i] = 1;
      link[i] = 1;
    }
    meanOrder = 1;
    meanMix = 1;
    updateHud(true);
  }

  function enterPhase(idx) {
    phaseIdx = idx;
    phaseT = 0;
    if (PHASES[idx].name === "melt") {
      for (let i = 0; i < nBound; i++) {
        const d = Math.hypot(px[i], py[i], pz[i]) + 1;
        const kick = 2 + Math.random() * 4;
        vx[i] += (px[i] / d) * kick + (Math.random() - 0.5) * 3;
        vy[i] += (py[i] / d) * kick + (Math.random() - 0.5) * 3;
        vz[i] += (pz[i] / d) * kick + (Math.random() - 0.5) * 3;
        /* reuse the atom slot as a random destination so the liquid ends up uniform */
        ax[i] = box.x0 + Math.random() * (box.x1 - box.x0);
        ay[i] = box.y0 + Math.random() * (box.y1 - box.y0);
        az[i] = box.z0 + Math.random() * DEPTH;
      }
    } else if (PHASES[idx].name === "liquid") {
      /* give the nucleus its sphere slots back for the next cycle */
      const core = form.h * 0.085;
      for (let i = 0; i < nBound; i++) {
        if (aRing[i] !== -1) continue;
        const u = Math.random() * 2 - 1;
        const th = Math.random() * Math.PI * 2;
        const rr = core * Math.cbrt(Math.random());
        const s = Math.sqrt(1 - u * u);
        ax[i] = rr * s * Math.cos(th);
        ay[i] = rr * s * Math.sin(th);
        az[i] = rr * u;
      }
    }
    updateHud(true);
  }

  function updateHud(force) {
    if (hudState && force) hudState.textContent = heat > 0.5 ? "melting" : PHASES[phaseIdx].label;
    if (hudOrder) hudOrder.style.transform = "scaleX(" + meanOrder.toFixed(3) + ")";
  }

  function step(dt, now) {
    const phase = PHASES[phaseIdx];
    phaseT += dt / 60;
    clock += dt;
    if (phaseT >= phase.secs) {
      enterPhase((phaseIdx + 1) % PHASES.length);
      return;
    }
    const t = now * 0.001;
    const inMark = phase.name === "atombot";
    const inAtom = phase.name === "atom";
    const inLattice = phase.name === "lattice";
    const melting = phase.name === "melt";
    const cool = 1 - smooth(heat * 1.15);
    const reach = spacing * 2.6;
    const R2 = POINTER_RADIUS * POINTER_RADIUS;
    const K = 0.0105; /* flow wavenumber: one swirl is about 600 px across */
    let sumOrd = 0;
    let sumMix = 0;

    /* Camera: slow orbit plus a lean toward the pointer. */
    pointer.nx += ((pointer.active ? pointer.x / W - 0.5 : 0) - pointer.nx) * 0.05 * dt;
    pointer.ny += ((pointer.active ? pointer.y / H - 0.5 : 0) - pointer.ny) * 0.05 * dt;
    yaw += (0.3 * Math.sin(t * 0.31) + pointer.nx * 0.42 - yaw) * 0.06 * dt;
    pitch += (0.1 * Math.sin(t * 0.23 + 1) + pointer.ny * 0.22 - pitch) * 0.06 * dt;

    for (let i = 0; i < n; i++) {
      const x = px[i];
      const y = py[i];
      const z = pz[i];

      /* Liquid: a divergence-free ABC flow, so the density stays even. */
      const fx = FLOW * (Math.sin(z * K + t * 0.21) + Math.cos(y * K + t * 0.17));
      const fy = FLOW * (Math.sin(x * K + t * 0.19) + Math.cos(z * K - t * 0.13));
      const fz = FLOW * 0.6 * (Math.sin(y * K - t * 0.15) + Math.cos(x * K + t * 0.11));

      /* Structure: where this particle should be, and how firmly it is steered there. */
      let k = 0;
      let gx = 0;
      let gy = 0;
      let gz = 0;
      let ux = 0;
      let uy = 0;
      let uz = 0;
      let wantMix = 0;
      let wantLink = 0;
      if (bound[i] && (inMark || inAtom || inLattice)) {
        k = inMark ? smooth((phaseT - dBot[i]) / 1.2) : 1;
        if (inMark || (inAtom && phaseT < dAtom[i])) {
          gx = bx[i];
          gy = by[i];
          gz = bz[i];
          wantMix = bMix[i];
          wantLink = 1;
        } else if (inLattice && phaseT >= dZ[i]) {
          gx = zx[i];
          gy = zy[i];
          gz = zz[i];
          wantMix = 1;
          wantLink = 1;
        } else if (aRing[i] === -1) {
          gx = ax[i];
          gy = ay[i];
          gz = az[i];
        } else {
          const ring = RINGS[aRing[i]];
          const a = aPhase[i] + ring.dir * ORBIT_SPEED * clock;
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          const lx = aRad[i] * ca;
          const ly = aRad[i] * sa * ring.ct - aOff[i] * ring.st;
          gz = aRad[i] * sa * ring.st + aOff[i] * ring.ct;
          gx = lx * ring.cf - ly * ring.sf;
          gy = lx * ring.sf + ly * ring.cf;
          /* velocity of the slot itself, so the particle rides the orbit instead of trailing it */
          const w = ring.dir * ORBIT_SPEED * aRad[i];
          const tlx = -sa * w;
          const tly = ca * ring.ct * w;
          ux = tlx * ring.cf - tly * ring.sf;
          uy = tlx * ring.sf + tly * ring.cf;
          uz = ca * ring.st * w;
        }
        k *= cool;
      }

      if (k > 0.001) {
        const dx = gx - x;
        const dy = gy - y;
        const dz = gz - z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        let pull = 0.085;
        if (dist * pull > 11) pull = 11 / dist;
        vx[i] += (fx * (1 - k) + (dx * pull + ux) * k - vx[i]) * 0.16 * dt;
        vy[i] += (fy * (1 - k) + (dy * pull + uy) * k - vy[i]) * 0.16 * dt;
        vz[i] += (fz * (1 - k) + (dz * pull + uz) * k - vz[i]) * 0.16 * dt;
        const near = 1 - clamp(dist / reach, 0, 1);
        ord[i] += (k * near - ord[i]) * 0.14 * dt;
        mix[i] += (wantMix * near - mix[i]) * 0.09 * dt;
        link[i] += (wantLink * near - link[i]) * 0.09 * dt;
      } else {
        if (melting && bound[i]) {
          let hx = (ax[i] - x) * 0.012;
          let hy = (ay[i] - y) * 0.012;
          let hz = (az[i] - z) * 0.012;
          const sp = Math.sqrt(hx * hx + hy * hy + hz * hz);
          if (sp > 3.6) {
            hx *= 3.6 / sp;
            hy *= 3.6 / sp;
            hz *= 3.6 / sp;
          }
          vx[i] += (fx + hx - vx[i]) * 0.05 * dt;
          vy[i] += (fy + hy - vy[i]) * 0.05 * dt;
          vz[i] += (fz + hz - vz[i]) * 0.05 * dt;
        } else {
          vx[i] += (fx - vx[i]) * 0.045 * dt;
          vy[i] += (fy - vy[i]) * 0.045 * dt;
          vz[i] += (fz - vz[i]) * 0.045 * dt;
        }
        ord[i] += (0 - ord[i]) * 0.1 * dt;
        mix[i] += (0 - mix[i]) * 0.07 * dt;
        link[i] += (0 - link[i]) * 0.07 * dt;
      }

      /* Thermal jitter: strong in the liquid, faint in a structure, stronger again when scrolled. */
      const temp = 0.26 - 0.22 * k + heat * 0.25;
      vx[i] += (Math.random() - 0.5) * temp * dt;
      vy[i] += (Math.random() - 0.5) * temp * dt;
      vz[i] += (Math.random() - 0.5) * temp * dt;

      /* The pointer pushes particles away, in the screen plane. */
      if (pointer.active) {
        const dxp = sx[i] - pointer.x;
        const dyp = sy[i] - pointer.y;
        const d2 = dxp * dxp + dyp * dyp;
        if (d2 < R2) {
          const d = Math.sqrt(d2) + 0.01;
          const f = (1 - d / POINTER_RADIUS) ** 2 * 1.9 * dt;
          vx[i] += (dxp / d) * f;
          vy[i] += (dyp / d) * f;
        }
      }

      px[i] = x + vx[i] * dt;
      py[i] = y + vy[i] * dt;
      pz[i] = z + vz[i] * dt;

      /* Free particles wrap around the slab so the liquid never drains away. */
      if (k < 0.001) {
        if (px[i] < box.x0) px[i] += box.x1 - box.x0;
        else if (px[i] > box.x1) px[i] -= box.x1 - box.x0;
        if (py[i] < box.y0) py[i] += box.y1 - box.y0;
        else if (py[i] > box.y1) py[i] -= box.y1 - box.y0;
        if (pz[i] < box.z0) pz[i] += DEPTH;
        else if (pz[i] > box.z1) pz[i] -= DEPTH;
      }
      if (bound[i]) {
        sumOrd += ord[i];
        sumMix += mix[i];
      }
    }
    meanOrder = nBound ? sumOrd / nBound : 0;
    meanMix = nBound ? sumMix / nBound : 0;
  }

  /* Rotate the world about the formation center and project it with perspective. */
  function project() {
    const cyw = Math.cos(yaw);
    const syw = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    for (let i = 0; i < n; i++) {
      const x1 = px[i] * cyw + pz[i] * syw;
      const z1 = -px[i] * syw + pz[i] * cyw;
      const y1 = py[i] * cp - z1 * sp;
      const z2 = py[i] * sp + z1 * cp;
      const s = FOCAL / Math.max(300, FOCAL + z2);
      sx[i] = form.cx + x1 * s;
      sy[i] = form.cy + y1 * s;
      sd[i] = z2;
      ss[i] = s;
    }
  }

  function draw() {
    project();
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";

    /* Glow behind the structure: maize for the atom, sky for the lattice. */
    if (meanOrder > 0.02) {
      const r = Math.round(MAIZE[0] + (SKY[0] - MAIZE[0]) * meanMix);
      const g = Math.round(MAIZE[1] + (SKY[1] - MAIZE[1]) * meanMix);
      const b = Math.round(MAIZE[2] + (SKY[2] - MAIZE[2]) * meanMix);
      const rad = form.h * 0.85;
      const glow = ctx.createRadialGradient(form.cx, form.cy, 0, form.cx, form.cy, rad);
      glow.addColorStop(0, "rgba(" + r + "," + g + "," + b + "," + (0.16 * meanOrder).toFixed(3) + ")");
      glow.addColorStop(1, "rgba(" + r + "," + g + "," + b + ",0)");
      ctx.fillStyle = glow;
      ctx.fillRect(form.cx - rad, form.cy - rad, rad * 2, rad * 2);
    }

    /* Liquid: fleeting bonds between particles that happen to be close in 3D. */
    gridHead.fill(-1);
    for (let i = 0; i < n; i++) {
      if (ord[i] > 0.4 || sx[i] < 0 || sx[i] > W || sy[i] < 0 || sy[i] > H) {
        gridNext[i] = -2;
        continue;
      }
      const c = (Math.floor(sy[i] / gridCell) + 1) * gridCols + Math.floor(sx[i] / gridCell) + 1;
      gridNext[i] = gridHead[c];
      gridHead[c] = i;
    }
    const cut2 = gridCell * gridCell;
    const liquidBonds = new Path2D();
    for (let i = 0; i < n; i++) {
      if (gridNext[i] === -2) continue;
      const gx = Math.floor(sx[i] / gridCell) + 1;
      const gy = Math.floor(sy[i] / gridCell) + 1;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          for (let j = gridHead[(gy + oy) * gridCols + gx + ox]; j >= 0; j = gridNext[j]) {
            if (j <= i) continue;
            const dx = sx[j] - sx[i];
            const dy = sy[j] - sy[i];
            const dz = sd[j] - sd[i];
            if (dx * dx + dy * dy + dz * dz > cut2) continue;
            liquidBonds.moveTo(sx[i], sy[i]);
            liquidBonds.lineTo(sx[j], sy[j]);
          }
        }
      }
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,203,5,0.22)";
    ctx.stroke(liquidBonds);

    /* Structure: bonds appear as neighboring sites lock in, in the mark and later in the lattice. */
    const name = PHASES[phaseIdx].name;
    const inMark = name === "atombot" || name === "atom";
    const pairA = inMark ? markA : bondA;
    const pairB = inMark ? markB : bondB;
    const structureBonds = new Path2D();
    for (let b = 0; b < pairA.length; b++) {
      const i = pairA[b];
      const j = pairB[b];
      if (link[i] < 0.6 || link[j] < 0.6) continue;
      structureBonds.moveTo(sx[i], sy[i]);
      structureBonds.lineTo(sx[j], sy[j]);
    }
    ctx.strokeStyle = "rgba(124,200,255,0.2)";
    ctx.stroke(structureBonds);

    /* Particles: glowing sprites, larger and brighter when near the camera or locked in. */
    for (let i = 0; i < n; i++) {
      const s = ss[i];
      const rad = size[i] * s * (1 + 0.4 * ord[i]) * SPRITE_SCALE;
      const depth = clamp((s - 0.72) / 0.5, 0, 1);
      ctx.globalAlpha = (0.3 + 0.7 * depth) * (0.62 + 0.38 * ord[i]);
      ctx.drawImage(sprites[Math.min(LEVELS - 1, Math.floor(mix[i] * LEVELS))], sx[i] - rad, sy[i] - rad, rad * 2, rad * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  function tick(now) {
    rafId = 0;
    /* dt is in 60 fps frames; lastTime is 0 right after a pause, so resume with one normal frame. */
    const dt = lastTime ? clamp((now - lastTime) / 16.667, 0.2, 2.5) : 1;
    lastTime = now;
    step(dt, now);
    draw();
    if (++frame % 4 === 0) updateHud(false);
    schedule();
  }

  function schedule() {
    if (rafId) return;
    if (inView && !userPaused && !document.hidden) rafId = requestAnimationFrame(tick);
    else lastTime = 0;
  }

  function setPaused(paused) {
    userPaused = paused;
    if (hud) hud.classList.toggle("is-paused", paused);
    if (pauseBtn) pauseBtn.setAttribute("aria-label", paused ? "Play animation" : "Pause animation");
    if (!paused) schedule();
  }

  /* Scrolling heats the scene and lets the headline drift away. */
  function onScroll() {
    const next = clamp(window.scrollY / (H * 0.6), 0, 1);
    if ((next > 0.5) !== (heat > 0.5)) {
      heat = next;
      updateHud(true);
    }
    heat = next;
    if (!reduceMotion.matches) {
      content.style.transform = "translate3d(0," + (window.scrollY * 0.22).toFixed(1) + "px,0)";
      content.style.opacity = String(clamp(1 - heat * 1.15, 0, 1));
    }
  }

  /* Wiring */
  if (pauseBtn) pauseBtn.addEventListener("click", () => setPaused(!userPaused));

  hero.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    const rect = hero.getBoundingClientRect();
    pointer.x = e.clientX - rect.left;
    pointer.y = e.clientY - rect.top;
    pointer.active = true;
  });
  hero.addEventListener("pointerleave", () => {
    pointer.active = false;
  });
  window.addEventListener("scroll", onScroll, { passive: true });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      inView = entries[0].isIntersecting;
      schedule();
    }).observe(hero);
  }
  document.addEventListener("visibilitychange", schedule);

  let resizeTimer = 0;
  let lastW = 0;
  let lastH = 0;
  const relayout = () => {
    const rect = hero.getBoundingClientRect();
    lastW = rect.width;
    lastH = rect.height;
    layout();
    draw();
  };
  new ResizeObserver(() => {
    const rect = hero.getBoundingClientRect();
    /* Ignore the small height changes mobile browsers make when their toolbars slide. */
    if (Math.abs(rect.width - lastW) < 2 && Math.abs(rect.height - lastH) < 120) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(relayout, 120);
  }).observe(hero);

  /* The headline's width, which decides where the formation goes, changes once the web font loads. */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);

  buildSprites();
  relayout();
  setPaused(userPaused);
  onScroll();
  updateHud(true);
  draw();
  hero.classList.add("is-ready");
  schedule();
})();
