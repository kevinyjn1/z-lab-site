/*
 * Home page scroll story: the robots the lab builds, in the place they are built for.
 *
 * The section is several screens tall. A sticky stage stays in view while scrolling moves
 * a camera along one long illustrated room: a reactor hall, a hot cell with a soft arm,
 * an open floor for the CookieBot swarm, a stairwell for the wheel-leg robot, and a
 * finale where all three meet. Scroll position picks the scene and how far its action
 * has played; everything also keeps moving on its own (vibration, radiation tracks,
 * wheels) between scroll events. On the hot cell and finale scenes the arm follows the
 * mouse.
 *
 * With "reduce motion" on, the stage is not pinned: each scene is drawn once, as a
 * still, next to its text.
 *
 * The drawings illustrate ideas from the lab's robotics seminar. They are not the lab's
 * actual designs.
 */
(() => {
  "use strict";

  const section = document.getElementById("story");
  if (!section) return;

  const stage = section.querySelector(".story-stage");
  const mainCanvas = section.querySelector(".story-canvas");
  const steps = Array.from(section.querySelectorAll(".story-step"));
  const navButtons = Array.from(section.querySelectorAll(".story-nav button"));
  const zoneOut = section.querySelector("[data-zone-out]");
  const fieldBar = section.querySelector("[data-field]");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const N = steps.length; /* scenes */
  const DWELL = 0.7; /* share of a scene spent parked; the rest is the camera traveling on */
  const SPAN = N - 0.1; /* story length in scenes: the last one has nowhere to travel to */
  const FLOOR = 150; /* depth of the floor plane in world units */
  const FIELD = [1, 0.78, 0.56, 0.42, 0.3]; /* radiation level shown in each scene */
  const STILL = [0.5, 0.6, 0.8, 0.62, 1]; /* how far each scene has played in its still */
  const TAU = Math.PI * 2;

  const INK = "#d7e3f2";
  const SKY = "#7cc8ff";
  const MAIZE = "#ffcb05";
  const PANEL = "#0a1a2e";
  const SOFT = "rgba(124, 200, 255, 0.32)";

  /* Wheel-leg robot proportions, world units. */
  const BIG = 1.45; /* the stairwell and its robot are drawn this much larger than the other scenes */
  const WHEEL_R = 19;
  const LEG = 60; /* thigh and shank length */
  const HALF_BASE = 62; /* half the distance between front and rear wheels */
  const STEPS = [
    [-40, 42],
    [55, 84],
    [150, 126],
  ]; /* [x of the riser, height on top of it] */

  let ctx = mainCanvas.getContext("2d");
  let W = 0;
  let H = 0;
  let q = 1; /* pixels per world unit */
  let cx = 0; /* screen x of the camera's focus */
  let gy = 0; /* screen y of the ground line */
  let ZW = 1000; /* world distance between scenes */
  let wide = true;
  let botSize = 1;
  let aim = [0, 0, 0, 0, 0]; /* how far right of each scene's middle the camera parks */
  let park = 230; /* where the wheel-leg robot stops in the finale */

  let g = 0; /* story position in scenes, eased toward gTarget */
  let gTarget = 0;
  let cam = 0; /* world x under the camera's focus */
  let time = 0;
  let last = 0;
  let rafId = 0;
  let inView = false;
  let still = false;
  let activeStep = -1;
  const pointer = { x: 0, y: 0, active: false };

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (v) => {
    const u = clamp(v, 0, 1);
    return u * u * (3 - 2 * u);
  };
  const seg = (v, from, to) => smooth((v - from) / (to - from));
  const hash = (i) => {
    const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  /* How far scene c's action has played, 0 to 1. */
  const act = (c) => clamp((g - c) / DWELL, 0, 1);

  /* ---------- drawing helpers ---------- */

  const line = (x1, y1, x2, y2) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  const box = (x, y, w, h, r) => {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r || 0);
    else ctx.rect(x, y, w, h);
  };
  const disc = (x, y, r) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
  };

  /* Run draw() in world units, with the origin on the ground at the middle of scene c. */
  function inZone(c, draw) {
    if (Math.abs(c * ZW - cam) > ZW * 1.2) return;
    ctx.save();
    ctx.translate(cx + (c * ZW - cam) * q, gy);
    ctx.scale(q, q);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    draw();
    ctx.restore();
  }

  /* A point on the floor: d is depth, 0 at the back wall and 1 nearest the viewer. */
  function floorPoint(wx, d) {
    return { x: cx + (wx - cam) * q * (1 + 0.1 * d), y: gy + d * FLOOR * q, s: 0.84 + 0.36 * d };
  }

  /* The radiation warning trefoil on a maize plate. */
  function trefoil(x, y, r) {
    ctx.fillStyle = MAIZE;
    box(x - r * 1.35, y - r * 1.35, r * 2.7, r * 2.7, r * 0.3);
    ctx.fill();
    ctx.fillStyle = "#1b1500";
    disc(x, y, r * 0.2);
    ctx.fill();
    for (let k = 0; k < 3; k++) {
      const mid = Math.PI / 2 + (k * TAU) / 3;
      ctx.beginPath();
      ctx.arc(x, y, r, mid - Math.PI / 6, mid + Math.PI / 6);
      ctx.arc(x, y, r * 0.32, mid + Math.PI / 6, mid - Math.PI / 6, true);
      ctx.closePath();
      ctx.fill();
    }
  }

  /* ---------- backdrop: wall, pipes, floor ---------- */

  function drawBackdrop() {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#040d1a");
    sky.addColorStop(1, "#061629");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    /* Back wall, moving slower than the foreground. */
    const shift = cam * 0.45;
    const left = shift - cx / q;
    const right = left + W / q;
    const seam = 260;
    ctx.save();
    ctx.translate(cx - shift * q, gy);
    ctx.scale(q, q);
    ctx.lineWidth = 1.4;
    for (let x = Math.floor(left / seam) * seam; x < right + seam; x += seam) {
      ctx.strokeStyle = "rgba(124, 200, 255, 0.09)";
      line(x, -1600, x, 0);
      ctx.fillStyle = "rgba(124, 200, 255, 0.16)";
      for (const y of [-44, -270, -500]) {
        disc(x + 14, y, 2.3);
        ctx.fill();
      }
      ctx.strokeStyle = "rgba(124, 200, 255, 0.2)";
      box(x + 122, -566, 16, 34, 3);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(124, 200, 255, 0.16)";
    line(left - 20, -558, right + 20, -558);
    line(left - 20, -540, right + 20, -540);
    /* ceiling lamps and the light they throw down the wall */
    const lamp = 520;
    for (let x = Math.floor(left / lamp) * lamp + 180; x < right + lamp; x += lamp) {
      const cone = ctx.createLinearGradient(0, -520, 0, 0);
      cone.addColorStop(0, "rgba(150, 210, 255, 0.11)");
      cone.addColorStop(1, "rgba(150, 210, 255, 0)");
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(x - 20, -522);
      ctx.lineTo(x + 20, -522);
      ctx.lineTo(x + 190, 0);
      ctx.lineTo(x - 190, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(190, 228, 255, 0.5)";
      box(x - 22, -530, 44, 8, 3);
      ctx.fill();
    }
    ctx.restore();

    /* Floor. */
    const floor = ctx.createLinearGradient(0, gy, 0, gy + FLOOR * q * 1.6);
    floor.addColorStop(0, "#0b2038");
    floor.addColorStop(1, "#061324");
    ctx.fillStyle = floor;
    ctx.fillRect(0, gy, W, H - gy);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(124, 200, 255, 0.08)";
    for (const d of [0.36, 0.72, 1.1, 1.6]) line(0, gy + d * FLOOR * q, W, gy + d * FLOOR * q);
    const tile = 170;
    const from = cam - cx / q - 300;
    for (let x = Math.floor(from / tile) * tile; x < from + W / q + 600; x += tile) {
      const a = floorPoint(x, 0);
      const b = floorPoint(x, 2.4);
      line(a.x, a.y, b.x, b.y);
    }
    ctx.strokeStyle = "rgba(124, 200, 255, 0.42)";
    ctx.lineWidth = Math.max(1, 1.6 * q);
    line(0, gy, W, gy);
  }

  /* ---------- scene 1: reactor hall ---------- */

  const tracks = Array.from({ length: 56 }, (_, i) => ({
    a: hash(i) * TAU,
    r: hash(i + 9) * 950,
    v: 380 + hash(i + 3) * 520,
    l: 24 + hash(i + 5) * 64,
    warm: hash(i + 7) < 0.18,
  }));

  function drawReactor() {
    inZone(0, () => {
      const halo = ctx.createRadialGradient(0, -210, 60, 0, -210, 640);
      halo.addColorStop(0, "rgba(70, 160, 255, 0.2)");
      halo.addColorStop(1, "rgba(70, 160, 255, 0)");
      ctx.fillStyle = halo;
      ctx.fillRect(-640, -850, 1280, 850);

      /* shield block */
      ctx.fillStyle = PANEL;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.4;
      box(-250, -384, 500, 384, 14);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = SOFT;
      ctx.lineWidth = 1.3;
      for (let k = 0; k < 5; k++) {
        line(-240 + k * 9, -20, -222 + k * 9, -2);
        line(214 + k * 9 - 36, -20, 232 + k * 9 - 36, -2);
      }

      /* pool with the core glowing at the bottom */
      const water = ctx.createLinearGradient(0, -340, 0, -30);
      water.addColorStop(0, "rgba(22, 66, 122, 0.55)");
      water.addColorStop(1, "rgba(6, 26, 62, 0.95)");
      ctx.fillStyle = water;
      box(-196, -340, 392, 312, 10);
      ctx.fill();
      ctx.save();
      box(-196, -340, 392, 312, 10);
      ctx.clip();
      const pulse = 0.5 + 0.07 * Math.sin(time * 2.1) + 0.03 * Math.sin(time * 5.3);
      const glow = ctx.createRadialGradient(0, -112, 10, 0, -112, 270);
      glow.addColorStop(0, "rgba(150, 225, 255, " + (pulse + 0.25).toFixed(3) + ")");
      glow.addColorStop(0.45, "rgba(70, 170, 255, " + (pulse * 0.6).toFixed(3) + ")");
      glow.addColorStop(1, "rgba(40, 120, 255, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(-196, -340, 392, 312);
      /* bubbles */
      ctx.strokeStyle = "rgba(190, 235, 255, 0.5)";
      ctx.lineWidth = 1.1;
      for (let k = 0; k < 16; k++) {
        const rise = (time * (26 + hash(k) * 30) + hash(k + 30) * 260) % 260;
        const bx = -150 + hash(k + 60) * 300 + Math.sin(time * 1.3 + k) * 4;
        disc(bx, -60 - rise, 1.6 + hash(k + 90) * 2.6);
        ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = "rgba(124, 200, 255, 0.6)";
      ctx.lineWidth = 1.8;
      box(-196, -340, 392, 312, 10);
      ctx.stroke();

      /* fuel assemblies on their support plate */
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 7; k++) {
        const x = -132 + k * 44 - 15;
        ctx.fillStyle = "rgba(170, 230, 255, 0.2)";
        ctx.strokeStyle = "rgba(200, 240, 255, 0.95)";
        box(x, -172, 30, 122, 3);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = "rgba(200, 240, 255, 0.45)";
        line(x + 10, -166, x + 10, -56);
        line(x + 20, -166, x + 20, -56);
      }
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.2;
      line(-176, -48, 176, -48);

      /* water line, bridge, control rods */
      ctx.strokeStyle = "rgba(190, 235, 255, 0.7)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let x = -194; x <= 194; x += 8) {
        const y = -316 + Math.sin(x * 0.06 + time * 1.6) * 1.8;
        if (x === -194) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = PANEL;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      box(-262, -404, 524, 20, 4);
      ctx.fill();
      ctx.stroke();
      for (const x of [-88, 0, 88]) {
        const dip = 10 + 8 * Math.sin(time * 0.6 + x);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2.2;
        line(x, -384, x, -182 + dip);
        ctx.fillStyle = PANEL;
        box(x - 11, -430, 22, 26, 4);
        ctx.fill();
        ctx.stroke();
      }
      ctx.strokeStyle = SOFT;
      ctx.lineWidth = 1.6;
      for (let x = -250; x <= 250; x += 50) line(x, -404, x, -448);
      line(-250, -448, 250, -448);

      /* warning sign and a chained-off walkway */
      trefoil(352, -262, 26);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.6;
      for (const x of [292, 372, 452]) {
        line(x, 0, x, -72);
        ctx.fillStyle = MAIZE;
        disc(x, -74, 4.2);
        ctx.fill();
      }
      ctx.strokeStyle = MAIZE;
      ctx.lineWidth = 1.8;
      ctx.setLineDash([7, 5]);
      for (const x of [292, 372]) {
        ctx.beginPath();
        ctx.moveTo(x, -68);
        ctx.quadraticCurveTo(x + 40, -44, x + 80, -68);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    });
  }

  function drawTracks(dt) {
    inZone(0, () => {
      ctx.globalCompositeOperation = "lighter";
      ctx.lineWidth = 1.7;
      for (const p of tracks) {
        p.r += p.v * dt;
        if (p.r > 1000) {
          p.r = 30 + Math.random() * 70;
          p.a = Math.random() * TAU;
        }
        const c = Math.cos(p.a);
        const s = Math.sin(p.a) * 0.82;
        const alpha = 0.6 * (1 - p.r / 1000);
        ctx.strokeStyle = (p.warm ? "rgba(255, 203, 5, " : "rgba(150, 215, 255, ") + alpha.toFixed(3) + ")";
        line(c * p.r, -112 + s * p.r, c * (p.r + p.l), -112 + s * (p.r + p.l));
      }
      ctx.globalCompositeOperation = "source-over";
    });
  }

  /* Stray tracks that drift through every later scene, thinning with distance from the core. */
  const strays = Array.from({ length: 26 }, (_, i) => ({
    x: hash(i + 20),
    y: hash(i + 40),
    v: 0.22 + hash(i + 60) * 0.5,
    l: 28 + hash(i + 80) * 54,
  }));

  function drawStrays(dt, field) {
    const fade = smooth((cam / ZW - 0.35) / 0.6);
    if (fade <= 0) return;
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(1, 1.5 * q);
    strays.forEach((p, i) => {
      p.x += p.v * dt;
      if (p.x > 1.1) {
        p.x = -0.1;
        p.y = Math.random();
      }
      if (i / strays.length > field) return;
      const x = p.x * W;
      const y = p.y * (gy + 30 * q);
      ctx.strokeStyle = "rgba(150, 215, 255, " + (0.3 * field * fade).toFixed(3) + ")";
      line(x, y, x + p.l * q, y + p.l * q * 0.14);
    });
    ctx.globalCompositeOperation = "source-over";
  }

  /* ---------- soft arm ---------- */

  function drawCanister(x, y, tilt) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt || 0);
    const halo = ctx.createRadialGradient(0, 0, 4, 0, 0, 52);
    halo.addColorStop(0, "rgba(255, 203, 5, 0.34)");
    halo.addColorStop(1, "rgba(255, 203, 5, 0)");
    ctx.fillStyle = halo;
    ctx.fillRect(-52, -52, 104, 104);
    ctx.fillStyle = "#2a2204";
    ctx.strokeStyle = MAIZE;
    ctx.lineWidth = 2;
    box(-14, -23, 28, 46, 5);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 1.3;
    line(-14, -13, 14, -13);
    line(-14, 13, 14, 13);
    ctx.restore();
  }

  /*
   * A soft bellows arm hanging from (bx, by) and reaching to (tx, ty). The spine is one
   * smooth curve, so the arm lengthens and shortens a little the way a bellows does.
   * grip runs from 0 (open) to 1 (closed); carry draws the sample between the fingers.
   */
  function drawArm(bx, by, tx, ty, grip, carry) {
    const dx = tx - bx;
    const dy = ty - by;
    const dist = Math.hypot(dx, dy) || 1;
    /* the gripper comes in mostly from above, leaning along the reach */
    let ax = (dx / dist) * 0.5;
    let ay = (dy / dist) * 0.5 + 0.7;
    const al = Math.hypot(ax, ay);
    ax /= al;
    ay /= al;
    const lead = Math.max(72, dist * 0.32);
    const c1x = bx;
    const c1y = by + Math.max(92, dist * 0.42);
    const c2x = tx - ax * lead;
    const c2y = ty - ay * lead;

    const n = 36;
    const sx = [];
    const sy = [];
    const nx = [];
    const ny = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;
      sx.push(u * u * u * bx + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * tx);
      sy.push(u * u * u * by + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * ty);
      let gx = 3 * u * u * (c1x - bx) + 6 * u * t * (c2x - c1x) + 3 * t * t * (tx - c2x);
      let gyv = 3 * u * u * (c1y - by) + 6 * u * t * (c2y - c1y) + 3 * t * t * (ty - c2y);
      const gl = Math.hypot(gx, gyv) || 1;
      gx /= gl;
      gyv /= gl;
      nx.push(-gyv);
      ny.push(gx);
    }
    const half = (i) => lerp(20, 12, i / n) + (i % 2 ? 1.8 : 0); /* ribbed outline */

    /* mount */
    ctx.fillStyle = PANEL;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    box(bx - 30, by - 22, 60, 26, 5);
    ctx.fill();
    ctx.stroke();

    /* body */
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const x = sx[i] + nx[i] * half(i);
      const y = sy[i] + ny[i] * half(i);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = n; i >= 0; i--) ctx.lineTo(sx[i] - nx[i] * half(i), sy[i] - ny[i] * half(i));
    ctx.closePath();
    ctx.fillStyle = "#102741";
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.1;
    ctx.stroke();
    ctx.strokeStyle = "rgba(124, 200, 255, 0.5)";
    ctx.lineWidth = 1.2;
    for (let i = 2; i < n; i += 2) {
      line(sx[i] + nx[i] * half(i), sy[i] + ny[i] * half(i), sx[i] - nx[i] * half(i), sy[i] - ny[i] * half(i));
    }

    /* wrist collar, sample, fingers */
    const ex = sx[n] - sx[n - 1];
    const ey = sy[n] - sy[n - 1];
    const el = Math.hypot(ex, ey) || 1;
    const fx = ex / el;
    const fy = ey / el;
    const px = -fy;
    const py = fx;
    ctx.strokeStyle = MAIZE;
    ctx.lineWidth = 4;
    line(tx + px * 13.5, ty + py * 13.5, tx - px * 13.5, ty - py * 13.5);
    if (carry) drawCanister(tx + fx * 27, ty + fy * 27, Math.atan2(fy, fx) - Math.PI / 2);
    const open = lerp(19, 12.5, grip);
    ctx.lineWidth = 5.6;
    for (const side of [-1, 1]) {
      const rootX = tx + px * 9 * side;
      const rootY = ty + py * 9 * side;
      const midX = tx + fx * 16 + px * (open + 5) * side;
      const midY = ty + fy * 16 + py * (open + 5) * side;
      const tipX = tx + fx * 36 + px * open * 0.8 * side;
      const tipY = ty + fy * 36 + py * open * 0.8 * side;
      ctx.strokeStyle = INK;
      ctx.beginPath();
      ctx.moveTo(rootX, rootY);
      ctx.quadraticCurveTo(midX, midY, tipX, tipY);
      ctx.stroke();
    }
  }

  /* Where the hot-cell arm's hand should be, and what the sample is doing, at action a. */
  const REST = [62, -238];
  const ABOVE_PICK = [-170, -168];
  const PICK = [-170, -108];
  const ABOVE_PLACE = [170, -232];
  const PLACE = [170, -166];
  const along = (p0, p1, t) => [lerp(p0[0], p1[0], smooth(t)), lerp(p0[1], p1[1], smooth(t))];

  function armScript(a) {
    let hand;
    if (a < 0.14) hand = along(REST, ABOVE_PICK, a / 0.14);
    else if (a < 0.26) hand = along(ABOVE_PICK, PICK, (a - 0.14) / 0.12);
    else if (a < 0.34) hand = PICK;
    else if (a < 0.45) hand = along(PICK, ABOVE_PICK, (a - 0.34) / 0.11);
    else if (a < 0.65) hand = along(ABOVE_PICK, ABOVE_PLACE, (a - 0.45) / 0.2);
    else if (a < 0.75) hand = along(ABOVE_PLACE, PLACE, (a - 0.65) / 0.1);
    else if (a < 0.82) hand = PLACE;
    else if (a < 0.92) hand = along(PLACE, ABOVE_PLACE, (a - 0.82) / 0.1);
    else hand = along(ABOVE_PLACE, REST, (a - 0.92) / 0.08);
    const grip = a < 0.26 ? 0 : a < 0.34 ? (a - 0.26) / 0.08 : a < 0.76 ? 1 : a < 0.82 ? 1 - (a - 0.76) / 0.06 : 0;
    return { hand, grip, held: a >= 0.31 && a < 0.78, dropped: a >= 0.78, lid: seg(a, 0.9, 1) };
  }

  const cellArm = { x: REST[0], y: REST[1] };
  const waveArm = { x: -190, y: -250 };

  /* Ease an arm's hand toward a target, or toward the mouse when it is over the scene. */
  function steerArm(arm, zone, target, baseX, dt) {
    let tx = target[0];
    let ty = target[1];
    if (pointer.active && !still && Math.abs(zone * ZW - cam) < ZW * 0.2) {
      const mx = (pointer.x - cx) / q + cam - zone * ZW - baseX;
      const my = (pointer.y - gy) / q + 446;
      const reach = Math.hypot(mx, my) || 1;
      const r = clamp(reach, 120, 372);
      tx = baseX + (mx / reach) * r;
      ty = Math.min(-34, -446 + Math.max(60, (my / reach) * r));
    }
    const k = dt ? 1 - Math.exp(-dt * 9) : 1;
    arm.x += (tx - arm.x) * k;
    arm.y += (ty - arm.y) * k;
  }

  function drawCell(dt) {
    const a = act(1);
    const script = armScript(a);
    steerArm(cellArm, 1, script.hand, 0, dt);
    inZone(1, () => {
      /* cell frame with a thick window */
      ctx.fillStyle = "rgba(124, 200, 255, 0.035)";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.4;
      box(-300, -470, 600, 470, 8);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = SOFT;
      ctx.lineWidth = 1.3;
      box(-286, -442, 572, 430, 4);
      ctx.stroke();
      ctx.fillStyle = PANEL;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.2;
      box(-300, -470, 600, 22, 4);
      ctx.fill();
      ctx.stroke();
      trefoil(-252, -398, 15);

      /* hazard band along the sill */
      ctx.save();
      box(-298, -12, 596, 10, 2);
      ctx.clip();
      ctx.strokeStyle = "rgba(255, 203, 5, 0.5)";
      ctx.lineWidth = 5;
      for (let x = -310; x < 310; x += 18) line(x, 0, x + 12, -14);
      ctx.restore();

      /* pedestal */
      ctx.fillStyle = PANEL;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.2;
      box(-205, -58, 70, 58, 4);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = SOFT;
      ctx.lineWidth = 1.3;
      line(-205, -44, -135, -44);

      /* cask: sample inside once dropped, then front wall and lid over it */
      if (script.dropped) drawCanister(170, lerp(-140, -64, seg(a, 0.78, 0.86)), 0);
      ctx.fillStyle = PANEL;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(112, -126);
      ctx.lineTo(112, 0);
      ctx.lineTo(228, 0);
      ctx.lineTo(228, -126);
      ctx.lineTo(208, -126);
      ctx.lineTo(208, -22);
      ctx.lineTo(132, -22);
      ctx.lineTo(132, -126);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(10, 26, 46, 0.72)";
      ctx.fillRect(133, -100, 74, 77);
      ctx.strokeStyle = SOFT;
      ctx.lineWidth = 1.3;
      line(112, -64, 132, -64);
      line(208, -64, 228, -64);
      /* lid, hinged on the right rim: upright while the arm works, shut at the end */
      ctx.save();
      ctx.translate(232, -126);
      ctx.rotate(lerp(Math.PI / 2 + 0.1, 0, script.lid));
      ctx.fillStyle = PANEL;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.2;
      box(-128, -18, 132, 18, 5);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = MAIZE;
      disc(232, -126, 3.6);
      ctx.fill();

      if (!script.held && !script.dropped) drawCanister(-170, -81, 0);
      drawArm(0, -446, cellArm.x, cellArm.y, script.grip, script.held);
    });
  }

  /* ---------- CookieBot swarm ---------- */

  const bots = [];
  let zSlots = [];
  const TABLE = { x0: -170, x1: 40, back: 0.18, front: 0.62, top: 62 };
  const BALL_FROM = [150, 0.82];
  const BALL_TO = [330, 0.5];
  const AERIAL = [-326, -208]; /* tip of the base station's antenna, in open-floor coordinates */

  function seedBots(n) {
    bots.length = 0;
    for (let i = 0; i < n; i++) {
      bots.push({ x: 2 * ZW - ZW * 0.5 + (i % 6) * 40, d: 0.2 + 0.12 * Math.floor(i / 6), vx: 0, vd: 0, hd: 0, ph: hash(i) * TAU });
    }
    /* the letter Z laid on the floor, far bar, diagonal, near bar */
    const bar = Math.round(n * 0.29);
    const diag = n - bar * 2;
    zSlots = [];
    for (let k = 0; k < bar; k++) zSlots.push({ x: lerp(-170, 170, k / (bar - 1)), d: 0.16 });
    for (let k = 0; k < diag; k++) zSlots.push({ x: lerp(138, -138, (k + 0.5) / diag), d: lerp(0.27, 0.8, (k + 0.5) / diag) });
    for (let k = 0; k < bar; k++) zSlots.push({ x: lerp(-170, 170, k / (bar - 1)), d: 0.92 });
  }

  function ballAt() {
    const s = seg(act(2), 0.64, 0.96);
    return { x: 2 * ZW + lerp(BALL_FROM[0], BALL_TO[0], s), d: lerp(BALL_FROM[1], BALL_TO[1], s), home: s };
  }

  const want = { x: 0, d: 0 };
  function botTarget(i) {
    const Z2 = 2 * ZW;
    const col = i % 6;
    const row = Math.floor(i / 6);
    if (g >= 3 + DWELL * 0.9) {
      want.x = 4 * ZW + zSlots[i].x;
      want.d = zSlots[i].d;
    } else if (g < 1.88) {
      want.x = Z2 - ZW * 0.5 + col * 40;
      want.d = 0.2 + 0.12 * row;
    } else {
      const a = act(2);
      if (a < 0.24) {
        /* stream under the table to the far side */
        want.x = Z2 + 96 + col * 44 + hash(i + 7) * 26;
        want.d = 0.14 + 0.135 * row + hash(i + 17) * 0.07;
      } else if (a < 0.56) {
        /* spread out and wander */
        want.x = Z2 - 390 + hash(i + 1) * 760 + Math.sin(time * 0.5 + i) * 40;
        want.d = 0.12 + hash(i + 51) * 0.84 + Math.cos(time * 0.4 + i * 1.7) * 0.05;
      } else {
        /* gather behind the ball and push */
        const ball = ballAt();
        let ring = 0;
        let first = 0;
        while (i >= first + 5 + ring * 4) {
          first += 5 + ring * 4;
          ring++;
        }
        const seats = 5 + ring * 4;
        const turn = Math.PI * (0.56 + (0.88 * (i - first + 0.5)) / seats);
        const r = 54 + ring * 37;
        want.x = ball.x + Math.cos(turn) * r;
        want.d = ball.d + (Math.sin(turn) * r * 0.42) / FLOOR;
      }
    }
    want.d = clamp(want.d, 0.08, 0.98);
  }

  function stepBots(dt) {
    const n = bots.length;
    for (let i = 0; i < n; i++) {
      const b = bots[i];
      botTarget(i);
      let ax = want.x - b.x;
      let ad = (want.d - b.d) * FLOOR;
      let dist = Math.hypot(ax, ad);
      if (dist > ZW * 1.15) {
        /* too far to drive: rejoin from just off-screen on the side it would arrive from */
        b.x = want.x - Math.sign(ax) * ZW * 0.85;
        b.d = want.d;
        ax = want.x - b.x;
        ad = 0;
        dist = Math.abs(ax);
      }
      const speed = Math.min(dist * 3.2, dist > 500 ? 1500 : 210);
      let vx = dist > 0.5 ? (ax / dist) * speed : 0;
      let vd = dist > 0.5 ? (ad / dist) * speed : 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const ox = b.x - bots[j].x;
        const od = (b.d - bots[j].d) * FLOOR * 1.7; /* depth is foreshortened, so keep more of it */
        const o2 = ox * ox + od * od;
        if (o2 < 2116 && o2 > 0.01) {
          const o = Math.sqrt(o2);
          const push = ((46 - o) / 46) * 260;
          vx += (ox / o) * push;
          vd += (od / o) * push;
        }
      }
      /* vibration drive: never quite a straight line */
      const shake = dist > 6 ? 46 : 12;
      vx += (Math.random() - 0.5) * shake;
      vd += (Math.random() - 0.5) * shake;
      const k = 1 - Math.exp(-dt * 7);
      b.vx += (vx - b.vx) * k;
      b.vd += (vd - b.vd) * k;
      b.x += b.vx * dt;
      b.d = clamp(b.d + (b.vd / FLOOR) * dt, 0.06, 0.99);
      if (Math.hypot(b.vx, b.vd) > 14) {
        const turn = Math.atan2(b.vd, b.vx) - b.hd;
        b.hd += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, dt * 8);
      }
    }
  }

  function drawBot(b, lit) {
    const p = floorPoint(b.x, b.d);
    if (p.x < -60 || p.x > W + 60) return;
    const k = q * p.s * botSize;
    const moving = Math.hypot(b.vx, b.vd) > 22;
    const buzz = moving && !still ? Math.sin(time * 58 + b.ph) * 0.7 : 0;
    ctx.save();
    ctx.translate(p.x + buzz * k, p.y);
    ctx.scale(k, k);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    /* shadow, bristle feet */
    ctx.fillStyle = "rgba(0, 0, 0, 0.36)";
    ctx.beginPath();
    ctx.ellipse(0, 4, 21, 7.4, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(215, 227, 242, 0.7)";
    ctx.lineWidth = 1.2;
    for (const x of [-12, -6, 0, 6, 12]) line(x, 3, x + (moving ? 1.5 : 0), 7);
    /* body */
    ctx.fillStyle = PANEL;
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 6.6, 0, 0, TAU);
    ctx.fill();
    ctx.fillRect(-18, -8, 36, 8);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(-18, -8);
    ctx.lineTo(-18, 0);
    ctx.ellipse(0, 0, 18, 6.6, 0, Math.PI, 0, true);
    ctx.lineTo(18, -8);
    ctx.stroke();
    ctx.fillStyle = "#143050";
    ctx.strokeStyle = SKY;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(0, -8, 18, 6.6, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    /* battery */
    ctx.fillStyle = "#1e3d60";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.1;
    box(-8, -15, 15, 7, 2);
    ctx.fill();
    ctx.stroke();
    /* status light on the leading edge */
    const lx = Math.cos(b.hd) * 12.5;
    const ly = -8 + Math.sin(b.hd) * 4.4;
    const blink = lit ? 1 : 0.55 + 0.45 * Math.sin(time * 3 + b.ph);
    ctx.fillStyle = lit ? "rgba(255, 203, 5, 0.28)" : "rgba(124, 200, 255, 0.24)";
    disc(lx, ly, 6);
    ctx.fill();
    ctx.globalAlpha = blink;
    ctx.fillStyle = lit ? MAIZE : SKY;
    disc(lx, ly, 2.3);
    ctx.fill();
    ctx.globalAlpha = 1;
    /* buzz marks */
    if (moving) {
      ctx.strokeStyle = "rgba(124, 200, 255, 0.55)";
      ctx.lineWidth = 1.2;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(side * 20, -3, 5, side > 0 ? -0.7 : Math.PI - 0.7, side > 0 ? 0.7 : Math.PI + 0.7);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(side * 20, -3, 9, side > 0 ? -0.5 : Math.PI - 0.5, side > 0 ? 0.5 : Math.PI + 0.5);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /* The base station at the back of the open floor. */
  function drawConsole() {
    inZone(2, () => {
      ctx.fillStyle = PANEL;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.2;
      box(-372, -124, 92, 124, 6);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = SOFT;
      ctx.lineWidth = 1.3;
      box(-360, -110, 68, 40, 3);
      ctx.stroke();
      ctx.strokeStyle = SKY;
      for (let k = 0; k < 4; k++) line(-352, -100 + k * 8, -352 + 22 + hash(k + Math.floor(time * 2)) * 30, -100 + k * 8);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      line(AERIAL[0], -124, AERIAL[0], AERIAL[1] + 4);
      ctx.fillStyle = MAIZE;
      disc(AERIAL[0], AERIAL[1], 4.4);
      ctx.fill();
      for (let k = 0; k < 3; k++) {
        const r = ((time * 34 + k * 30) % 90) + 8;
        ctx.strokeStyle = "rgba(255, 203, 5, " + (0.5 * (1 - r / 98)).toFixed(3) + ")";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(AERIAL[0], AERIAL[1], r, -1.1, 0.5);
        ctx.stroke();
      }
    });
  }

  /* Everything standing on the floor, drawn back to front. */
  function drawFloorThings() {
    const Z2 = 2 * ZW;
    const things = [];
    const ball = ballAt();
    const nearSwarm = Math.abs(Z2 - cam) < ZW * 1.2;

    if (nearSwarm) {
      const corner = (x, d) => {
        const p = floorPoint(Z2 + x, d);
        return { x: p.x, y: p.y, top: p.y - TABLE.top * q * p.s };
      };
      const bl = corner(TABLE.x0, TABLE.back);
      const br = corner(TABLE.x1, TABLE.back);
      const fl = corner(TABLE.x0, TABLE.front);
      const fr = corner(TABLE.x1, TABLE.front);
      const leg = (c) => {
        ctx.strokeStyle = INK;
        ctx.lineWidth = Math.max(1.2, 3 * q);
        line(c.x, c.y, c.x, c.top);
      };
      things.push({
        d: TABLE.back - 0.01,
        draw: () => {
          leg(bl);
          leg(br);
        },
      });
      things.push({
        d: TABLE.front,
        draw: () => {
          ctx.beginPath();
          ctx.moveTo(bl.x, bl.top);
          ctx.lineTo(br.x, br.top);
          ctx.lineTo(fr.x, fr.top);
          ctx.lineTo(fl.x, fl.top);
          ctx.closePath();
          ctx.fillStyle = "rgba(20, 50, 82, 0.78)";
          ctx.fill();
          ctx.strokeStyle = INK;
          ctx.lineWidth = Math.max(1.2, 2 * q);
          ctx.stroke();
          const edge = 8 * q;
          ctx.fillStyle = PANEL;
          ctx.beginPath();
          ctx.rect(fl.x, fl.top, fr.x - fl.x, edge);
          ctx.fill();
          ctx.stroke();
          ctx.strokeStyle = INK;
          ctx.lineWidth = Math.max(1.2, 3 * q);
          line(fl.x, fl.top + edge, fl.x, fl.y);
          line(fr.x, fr.top + edge, fr.x, fr.y);
          /* a crate on top, so it reads as furniture */
          const seat = floorPoint(Z2 + TABLE.x0 + 62, 0.42);
          const k = q * seat.s;
          ctx.save();
          ctx.translate(seat.x, seat.y - TABLE.top * k);
          ctx.scale(k, k);
          ctx.fillStyle = PANEL;
          ctx.strokeStyle = INK;
          ctx.lineWidth = 1.8;
          box(-30, -40, 60, 40, 4);
          ctx.fill();
          ctx.stroke();
          ctx.strokeStyle = SOFT;
          ctx.lineWidth = 1.2;
          line(-30, -27, 30, -27);
          ctx.strokeStyle = MAIZE;
          ctx.lineWidth = 2;
          line(-8, -16, 8, -16);
          ctx.restore();
        },
      });
      /* goal ring on the floor, then the ball */
      const goal = floorPoint(Z2 + BALL_TO[0], BALL_TO[1]);
      things.push({
        d: -1,
        draw: () => {
          ctx.save();
          ctx.translate(goal.x, goal.y);
          ctx.scale(q * goal.s, q * goal.s);
          ctx.strokeStyle = MAIZE;
          ctx.lineWidth = 2;
          ctx.setLineDash([8, 6]);
          ctx.beginPath();
          ctx.ellipse(0, 0, 50, 18, 0, 0, TAU);
          ctx.stroke();
          ctx.setLineDash([]);
          if (ball.home > 0.98) {
            const beat = still ? 0.5 : (time * 0.9) % 1;
            ctx.strokeStyle = "rgba(255, 203, 5, " + (0.7 * (1 - beat)).toFixed(3) + ")";
            ctx.beginPath();
            ctx.ellipse(0, 0, 50 + beat * 44, 18 + beat * 16, 0, 0, TAU);
            ctx.stroke();
          }
          ctx.restore();
        },
      });
      things.push({
        d: ball.d,
        draw: () => {
          const p = floorPoint(ball.x, ball.d);
          const k = q * p.s;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.scale(k, k);
          ctx.fillStyle = "rgba(0, 0, 0, 0.36)";
          ctx.beginPath();
          ctx.ellipse(0, 3, 26, 8, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = "#12304f";
          ctx.strokeStyle = INK;
          ctx.lineWidth = 2;
          disc(0, -24, 24);
          ctx.fill();
          ctx.stroke();
          ctx.save();
          disc(0, -24, 24);
          ctx.clip();
          ctx.translate(0, -24);
          ctx.rotate((ball.x - Z2) / 24);
          ctx.strokeStyle = MAIZE;
          ctx.lineWidth = 3;
          line(-30, 0, 30, 0);
          ctx.strokeStyle = SOFT;
          ctx.lineWidth = 1.4;
          line(0, -30, 0, 30);
          ctx.restore();
          ctx.restore();
        },
      });
    }

    const pushing = g >= 2 && g < 3 + DWELL * 0.9 && act(2) >= 0.56;
    const inZ = g >= 3 + DWELL * 0.9;
    bots.forEach((b, i) => things.push({ d: b.d, draw: () => drawBot(b, pushing || (inZ && i % 3 === 0)) }));

    things.sort((a, b) => a.d - b.d);
    for (const thing of things) thing.draw();

    /* the base station talks to a few robots at a time */
    if (nearSwarm && !still && g >= 2 && g < 3 && act(2) > 0.2) {
      const from = { x: cx + (Z2 + AERIAL[0] - cam) * q, y: gy + AERIAL[1] * q };
      const turn = Math.floor(time * 1.4);
      const beat = (time * 1.4) % 1;
      ctx.setLineDash([3 * q + 2, 5 * q + 2]);
      ctx.lineWidth = Math.max(1, 1.3 * q);
      ctx.strokeStyle = "rgba(255, 203, 5, " + (0.42 * Math.sin(Math.PI * beat)).toFixed(3) + ")";
      for (let k = 0; k < 3; k++) {
        const b = bots[Math.floor(hash(turn * 3 + k) * bots.length)];
        const to = floorPoint(b.x, b.d);
        line(from.x, from.y, to.x, to.y - 12 * q * to.s * botSize);
      }
      ctx.setLineDash([]);
    }
  }

  /* ---------- wheel-leg robot ---------- */

  /* Height of a wheel's center above the floor at x (measured from the stairwell's middle). */
  function wheelHeight(x) {
    let low = 0;
    for (const [edge, high] of STEPS) {
      const s = (x - (edge - WHEEL_R - 64)) / 70; /* the leg lifts the wheel over each riser */
      if (s <= 0) break;
      if (s < 1) return lerp(low, high, smooth(s)) + WHEEL_R + Math.sin(Math.PI * s) * 14;
      low = high;
    }
    return low + WHEEL_R;
  }

  /* Where the robot is along the stairwell, in stairwell units (before the enlargement). */
  function robotAt() {
    if (g < 3) return -470 - (3 - g) * 220;
    const a = act(3);
    let x;
    if (a < 0.26) x = lerp(-470, -150, smooth(a / 0.26));
    else if (a < 0.88) x = lerp(-150, 250, smooth((a - 0.26) / 0.62));
    else x = lerp(250, 290, smooth((a - 0.88) / 0.12));
    /* then along the platform to its place in the finale */
    const onward = smooth((g - (3 + DWELL)) / (1 - DWELL + 0.22));
    return x + onward * ((ZW + park) / BIG - 290);
  }

  function drawStairs() {
    const end = (ZW + 660) / BIG;
    inZone(3, () => {
      ctx.scale(BIG, BIG);
      ctx.fillStyle = PANEL;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(STEPS[0][0], 0);
      let low = 0;
      for (const [edge, high] of STEPS) {
        ctx.lineTo(edge, -low);
        ctx.lineTo(edge, -high);
        low = high;
      }
      ctx.lineTo(end, -low);
      ctx.lineTo(end, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      /* tread edges in maize, panel seams along the platform */
      ctx.strokeStyle = MAIZE;
      ctx.lineWidth = 2.6;
      for (const [edge, high] of STEPS) line(edge, -high, edge + 16, -high);
      ctx.strokeStyle = SOFT;
      ctx.lineWidth = 1;
      for (let x = 250; x < end; x += 96) line(x, -118, x, -8);
      line(STEPS[2][0] + 8, -112, end, -112);
    });
    /* the lab's name stenciled on the platform where everything gathers */
    inZone(4, () => {
      ctx.fillStyle = "rgba(255, 203, 5, 0.5)";
      ctx.font = "600 44px 'Geist Mono', ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Z LAB", 60, -88);
    });
  }

  function drawRobot() {
    if (g < 2 + DWELL) return; /* out of the picture until the camera heads for the stairwell */
    const local = robotAt();
    if (Math.abs(3 * ZW + local * BIG - cam) > ZW * 1.3) return;
    const bob = still ? 0 : Math.sin(time * 9) * 0.7;

    /* wheel centers for the near side, and the far side a little ahead in its stride */
    const wheel = (offset) => ({ x: local + offset, y: -wheelHeight(local + offset) });
    const nearF = wheel(HALF_BASE);
    const nearR = wheel(-HALF_BASE);
    const farF = wheel(HALF_BASE + 26);
    const farR = wheel(-HALF_BASE + 26);
    const rise = -(nearF.y + nearR.y + farF.y + farR.y) / 4;
    const pitch = Math.atan2(-(nearF.y - nearR.y), HALF_BASE * 2) * 0.62;
    const bodyX = local + 6;
    const bodyY = -(rise + 84) + bob;
    const cp = Math.cos(-pitch);
    const sp = Math.sin(-pitch);
    const hip = (hx, hy) => ({ x: bodyX + hx * cp - hy * sp, y: bodyY + hx * sp + hy * cp });

    const leg = (h, w, color, core) => {
      const dx = w.x - h.x;
      const dy = w.y - h.y;
      const d = clamp(Math.hypot(dx, dy), 14, LEG * 2 - 2);
      const base = Math.atan2(dy, dx);
      const bend = Math.acos(clamp(d / (LEG * 2), -1, 1));
      const kx = h.x + Math.cos(base + bend) * LEG; /* knees point backward */
      const ky = h.y + Math.sin(base + bend) * LEG;
      const limb = () => {
        ctx.beginPath();
        ctx.moveTo(h.x, h.y);
        ctx.lineTo(kx, ky);
        ctx.lineTo(w.x, w.y);
        ctx.stroke();
      };
      ctx.strokeStyle = color; /* an outlined limb: a wide stroke with a darker one inside */
      ctx.lineWidth = 10.5;
      limb();
      ctx.strokeStyle = core;
      ctx.lineWidth = 6.6;
      limb();
      ctx.fillStyle = core;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      for (const [jx, jy] of [[kx, ky], [h.x, h.y]]) {
        disc(jx, jy, 6.2);
        ctx.fill();
        ctx.stroke();
      }
    };
    const tire = (w, color, hub) => {
      ctx.fillStyle = PANEL;
      ctx.strokeStyle = color;
      ctx.lineWidth = 4.4;
      disc(w.x, w.y, WHEEL_R - 2.2);
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = 1.5;
      const spin = local / WHEEL_R;
      for (let k = 0; k < 3; k++) {
        const a = spin + (k * TAU) / 3;
        line(w.x, w.y, w.x + Math.cos(a) * (WHEEL_R - 5), w.y + Math.sin(a) * (WHEEL_R - 5));
      }
      ctx.fillStyle = hub;
      disc(w.x, w.y, 4.6);
      ctx.fill();
    };

    inZone(3, () => {
      ctx.scale(BIG, BIG);
      const dim = "rgba(110, 175, 225, 0.62)";
      /* far side first */
      leg(hip(60, 10), farF, dim, "#0c2036");
      leg(hip(-44, 10), farR, dim, "#0c2036");
      tire(farF, dim, "rgba(124, 200, 255, 0.6)");
      tire(farR, dim, "rgba(124, 200, 255, 0.6)");

      ctx.save();
      ctx.translate(bodyX, bodyY);
      ctx.rotate(-pitch);
      /* the sensor head sweeps a scan ahead of the robot */
      if (!still) {
        const sweep = Math.sin(time * 1.7) * 0.3;
        const fan = ctx.createRadialGradient(80, -23, 6, 80, -23, 210);
        fan.addColorStop(0, "rgba(124, 200, 255, 0.26)");
        fan.addColorStop(1, "rgba(124, 200, 255, 0)");
        ctx.fillStyle = fan;
        ctx.beginPath();
        ctx.moveTo(80, -23);
        ctx.arc(80, -23, 210, sweep + 0.02, sweep + 0.5);
        ctx.closePath();
        ctx.fill();
      }
      /* body */
      ctx.fillStyle = "#102741";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.2;
      box(-78, -24, 156, 46, 13);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = MAIZE;
      ctx.lineWidth = 3;
      line(-52, 9, 30, 9);
      ctx.strokeStyle = SOFT;
      ctx.lineWidth = 1.3;
      line(-58, -8, 40, -8);
      line(-10, -24, -10, -8);
      /* sensor head and its eye */
      ctx.fillStyle = PANEL;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      box(52, -38, 40, 30, 8);
      ctx.fill();
      ctx.stroke();
      const look = 0.75 + 0.25 * Math.sin(time * 2.2);
      ctx.fillStyle = "rgba(124, 200, 255, 0.3)";
      disc(78, -23, 9);
      ctx.fill();
      ctx.fillStyle = "rgba(124, 200, 255, " + look.toFixed(3) + ")";
      disc(78, -23, 4.4);
      ctx.fill();
      /* payload and antenna */
      ctx.fillStyle = PANEL;
      box(-58, -36, 42, 12, 3);
      ctx.fill();
      ctx.stroke();
      line(-62, -24, -70, -58);
      ctx.fillStyle = MAIZE;
      disc(-70, -60, 3.4);
      ctx.fill();
      ctx.restore();

      /* near side */
      leg(hip(52, 12), nearF, INK, "#102741");
      leg(hip(-52, 12), nearR, INK, "#102741");
      tire(nearF, INK, MAIZE);
      tire(nearR, INK, MAIZE);
    });
  }

  /* ---------- finale: second arm ---------- */

  function drawFinaleArm(dt) {
    const sway = still ? 0 : time;
    steerArm(waveArm, 4, [-250 + Math.sin(sway * 1.5) * 46, -214 + Math.cos(sway * 1.1) * 20], -300, dt);
    inZone(4, () => {
      ctx.fillStyle = PANEL;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.2;
      box(-420, -470, 240, 22, 4);
      ctx.fill();
      ctx.stroke();
      const grip = still ? 0.2 : 0.5 + 0.5 * Math.sin(time * 2.4);
      drawArm(-300, -446, waveArm.x, waveArm.y, grip, false);
    });
  }

  /* ---------- between rooms ---------- */

  /* The wall between two rooms, cut through: a lintel overhead and a threshold on the floor. */
  function drawDoorways() {
    for (let c = 0; c < N - 1; c++) {
      const wx = (c + 0.5) * ZW;
      if (Math.abs(wx - cam) > ZW * 0.9) continue;
      ctx.save();
      ctx.translate(cx + (wx - cam) * q, gy);
      ctx.scale(q, q);
      ctx.fillStyle = "#07192d";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.2;
      box(-46, -1700, 92, 1700 - 520, 0);
      ctx.fill();
      ctx.stroke();
      ctx.save();
      box(-46, -540, 92, 20, 0);
      ctx.clip();
      ctx.strokeStyle = "rgba(255, 203, 5, 0.75)";
      ctx.lineWidth = 7;
      for (let x = -70; x < 70; x += 22) line(x, -518, x + 16, -542);
      ctx.restore();
      ctx.restore();
      const a = floorPoint(wx, 0);
      const b = floorPoint(wx, 1.6);
      ctx.strokeStyle = "rgba(255, 203, 5, 0.5)";
      ctx.lineWidth = Math.max(1.5, 4 * q);
      ctx.setLineDash([10 * q + 3, 8 * q + 3]);
      line(a.x, a.y, b.x, b.y);
      ctx.setLineDash([]);
    }
  }

  /* A dark column close to the camera sweeps past as it moves from one room to the next. */
  function drawWipe() {
    const near = 1.5;
    for (let c = 0; c < N - 1; c++) {
      const x = cx + ((c + 0.5) * ZW * near - cam * near) * q;
      const half = 150 * q;
      if (x < -half * 2 || x > W + half * 2) continue;
      const shade = ctx.createLinearGradient(x - half, 0, x + half, 0);
      shade.addColorStop(0, "rgba(2, 8, 16, 0)");
      shade.addColorStop(0.22, "rgba(2, 8, 16, 0.96)");
      shade.addColorStop(0.78, "rgba(2, 8, 16, 0.96)");
      shade.addColorStop(1, "rgba(2, 8, 16, 0)");
      ctx.fillStyle = shade;
      ctx.fillRect(x - half, 0, half * 2, H);
    }
  }

  /* ---------- frame ---------- */

  function cameraAt(pos) {
    const c = Math.min(N - 1, Math.floor(pos));
    if (c === N - 1) return c * ZW + aim[c];
    const travel = smooth((pos - c - DWELL) / (1 - DWELL));
    return lerp(c * ZW + aim[c], (c + 1) * ZW + aim[c + 1], travel);
  }

  function fieldNow() {
    const at = clamp(cam / ZW, 0, N - 1);
    const lo = Math.floor(at);
    return lerp(FIELD[lo], FIELD[Math.min(N - 1, lo + 1)], at - lo);
  }

  function draw(dt) {
    cam = cameraAt(g);
    drawBackdrop();
    drawReactor();
    drawConsole();
    drawStairs();
    drawTracks(dt);
    drawStrays(dt, fieldNow());
    drawCell(dt);
    drawRobot();
    drawFinaleArm(dt);
    drawDoorways();
    drawFloorThings();
    drawWipe();
  }

  function syncInterface() {
    const c = Math.min(N - 1, Math.floor(g));
    const showing = g - c > 0.86 && c < N - 1 ? c + 1 : c;
    if (showing !== activeStep) {
      activeStep = showing;
      steps.forEach((el, i) => el.classList.toggle("is-active", i === showing));
      navButtons.forEach((el, i) => {
        if (i === showing) el.setAttribute("aria-current", "step");
        else el.removeAttribute("aria-current");
      });
      if (zoneOut) zoneOut.textContent = steps[showing].dataset.zone || "";
    }
    if (fieldBar) fieldBar.style.transform = "scaleX(" + fieldNow().toFixed(3) + ")";
  }

  function tick(now) {
    rafId = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    time += dt;
    g += (gTarget - g) * (1 - Math.exp(-dt * 9));
    if (Math.abs(gTarget - g) < 0.0004) g = gTarget;
    stepBots(dt);
    draw(dt);
    syncInterface();
    schedule();
  }

  function schedule() {
    if (rafId || still) return;
    if (inView && !document.hidden && !document.documentElement.classList.contains("zgame-lock")) {
      rafId = requestAnimationFrame(tick);
    } else {
      last = 0;
    }
  }

  /* ---------- layout and wiring ---------- */

  function fit(canvas) {
    const rect = canvas.getBoundingClientRect();
    W = Math.max(1, rect.width);
    H = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* Put the scene in the space the text leaves free: the right side when wide, the top when narrow. */
  function frameScene(full) {
    wide = full && W >= 900;
    const boxW = wide ? W * 0.56 : W - 20;
    const boxH = wide ? H - 226 : full ? H * 0.5 : H - 16;
    const boxTop = wide ? 100 : full ? 78 : 8;
    q = Math.min(boxW / 760, boxH / 640);
    cx = wide ? W - boxW / 2 - Math.max(24, W * 0.035) : W / 2;
    gy = boxTop + (boxH - 640 * q) / 2 + 482 * q;
    ZW = Math.max((W * 1.06) / q, 940);
    botSize = q < 0.62 ? 1.45 : 1;
    /* the action in the later scenes runs to the right, so the camera leads it a little */
    aim = wide ? [0, 0, 70, 230, 40] : full ? [0, 0, 70, 150, 0] : [0, 0, 80, 150, 0];
    park = wide ? 230 : 170;
  }

  function readScroll() {
    const rect = section.getBoundingClientRect();
    const total = rect.height - stage.offsetHeight;
    gTarget = total > 0 ? clamp(-rect.top / total, 0, 1) * SPAN : 0;
  }

  function setUpLive() {
    still = false;
    section.classList.remove("story--still");
    section.querySelectorAll(".story-still").forEach((el) => el.remove());
    fit(mainCanvas);
    frameScene(true);
    seedBots(wide ? 34 : 24);
    readScroll();
    g = gTarget;
    activeStep = -1;
    syncInterface();
    draw(0);
    schedule();
  }

  /* Reduced motion: no pinning; one still per scene, beside its text. */
  function setUpStills() {
    still = true;
    cancelAnimationFrame(rafId);
    rafId = 0;
    section.classList.add("story--still");
    section.querySelectorAll(".story-still").forEach((el) => el.remove());
    steps.forEach((el, c) => {
      el.classList.add("is-active");
      const canvas = document.createElement("canvas");
      canvas.className = "story-still";
      canvas.setAttribute("aria-hidden", "true");
      el.appendChild(canvas);
      fit(canvas);
      frameScene(false);
      seedBots(24);
      g = Math.min(SPAN, c + STILL[c] * DWELL);
      time = 1.3;
      for (let k = 0; k < 420; k++) {
        time += 1 / 30;
        stepBots(1 / 30);
      }
      draw(0);
    });
  }

  const setUp = () => (reduceMotion.matches ? setUpStills() : setUpLive());

  window.addEventListener(
    "scroll",
    () => {
      if (still) return;
      readScroll();
      schedule();
    },
    { passive: true }
  );

  stage.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    const rect = stage.getBoundingClientRect();
    pointer.x = e.clientX - rect.left;
    pointer.y = e.clientY - rect.top;
    pointer.active = wide ? pointer.x > W * 0.4 : pointer.y < H * 0.56;
  });
  stage.addEventListener("pointerleave", () => {
    pointer.active = false;
  });

  navButtons.forEach((button, c) => {
    button.addEventListener("click", () => {
      const rect = section.getBoundingClientRect();
      const total = rect.height - stage.offsetHeight;
      const at = Math.min(SPAN, c + 0.32) / SPAN;
      window.scrollTo({ top: window.scrollY + rect.top + at * total, behavior: reduceMotion.matches ? "auto" : "smooth" });
    });
  });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      inView = entries[0].isIntersecting;
      schedule();
    }).observe(section);
  } else {
    inView = true;
  }
  document.addEventListener("visibilitychange", schedule);
  document.addEventListener("zlab:game", schedule); /* rest while the hidden game covers the page */

  let resizeTimer = 0;
  let lastW = 0;
  let lastH = 0;
  new ResizeObserver(() => {
    const rect = stage.getBoundingClientRect();
    /* ignore the small height changes mobile browsers make when their toolbars slide */
    if (Math.abs(rect.width - lastW) < 2 && Math.abs(rect.height - lastH) < 120) return;
    lastW = rect.width;
    lastH = rect.height;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(setUp, 120);
  }).observe(stage);
  reduceMotion.addEventListener("change", setUp);

  section.classList.add("is-ready");
  setUp();
})();
