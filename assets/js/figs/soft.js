/*
 * Research, "A simulator for soft machines".
 *
 * What it shows: the test the lab used to check Kraken, its open-source simulator for soft
 * materials and robots. A silicone bellows hangs with a 100 g mass on its end and bounces up
 * and down. Three silicones are drawn side by side. Each is drawn twice: in ink, bouncing at
 * the frequency measured by motion capture, and in gray beside it, bouncing at the frequency
 * Kraken simulated. The two start together, so how far they have drifted apart is how far
 * simulation is from measurement. When the pair that drifts fastest is half a cycle apart
 * (the two Dragon Skin pairs reach that together), all come to rest and start again together.
 *
 * Sources:
 *   K. Wandke and Y Z, "Physics-based finite element simulation of the dynamics of soft
 *   robots", IEEE Access 11, 67996 (2023), doi:10.1109/ACCESS.2023.3291617. Every published
 *   number in this file comes from its Tables 1 to 3.
 *   K. Wandke and Y Z, "MOOSE-based finite element hyperelastic modeling for soft robot
 *   simulations", IEEE Access 9, 139627 (2021), doi:10.1109/ACCESS.2021.3119009. It sets
 *   out the neo-Hookean (hyperelastic) material law Kraken uses. No number is taken from it.
 *
 * What is what:
 *   Published: the measured and simulated frequencies in TESTS. The drawing uses the bounce
 *   test (Table 1), in hertz: Ecoflex 00-50 2.05 measured and 2.06 simulated, Dragon Skin 20
 *   4.20 and 4.33, Dragon Skin 30 5.57 and 5.44. The table under "About this figure" lists
 *   all three tables.
 *   Computed here, not printed in the paper: the percentage differences in that table, and
 *   the moment of the restart (half a cycle divided by the largest difference in frequency).
 *   Slowed: time runs SLOW (4) times slower than life, for every bellows alike, so the ratio
 *   of simulated to measured frequency, which is the point, is unchanged.
 *   Illustration: the shape and size of the bellows, the mass, and the plate they hang from;
 *   the size of the bounce, chosen to be seen; the way it starts (pulled down and let go);
 *   and the absence of damping (a real bounce dies away; this one keeps its size until the
 *   restart, when it is faded out by hand).
 *
 * Drawing: the shared 3D kit (fig3d.js), which renders the parts as ink lines on paper.
 * Without WebGL 2 the same motion is drawn flat, as outlines.
 */
(() => {
  "use strict";

  const root = document.querySelector('[data-fig="soft"]');
  if (!root || !window.ZFig) return;
  const { text, rule, run, color } = window.ZFig;

  /*
   * Resonant frequencies in Hz of a bellows with a 100 g mass, measured by motion capture and simulated with
   * Kraken, for Ecoflex 00-50, Dragon Skin 20, and Dragon Skin 30 in that order (the 2023 paper).
   * Each row: direction of motion, measured, simulated.
   */
  const RUBBERS = ["Ecoflex 00-50", "Dragon Skin 20", "Dragon Skin 30"];
  const TESTS = [
    { name: "Bounce", rows: [["vertical", [2.05, 4.2, 5.57], [2.06, 4.33, 5.44]]] } /* Table 1 */,
    {
      name: "Swing in a plane" /* Table 2 */,
      rows: [
        ["vertical", [2.01, 2.88, 3.07], [1.85, 3.14, 3.25]],
        ["horizontal", [1.04, 1.44, 1.53], [1.3, 1.58, 1.62]],
      ],
    },
    {
      name: "Swing in 3D" /* Table 3 */,
      rows: [
        ["vertical", [1.91, 2.96, 3.22], [2.82, 3.31, 3.52]],
        ["horizontal", [1.1, 1.57, 1.61], [1.45, 1.69, 1.78]],
        ["depth", [1.1, 1.57, 1.61], [1.45, 1.77, 1.87]],
      ],
    },
  ];
  const off = (measured, simulated) => (100 * (simulated - measured)) / measured;
  const hz = (f) => f.toFixed(2) + " Hz";

  /* The same frequencies as a table, for every test and direction. */
  const table = root.querySelector("[data-table]");
  if (table) {
    const el = document.createElement("table");
    el.innerHTML = '<thead><tr><th scope="col">Silicone</th><th scope="col">Measured (Hz)</th><th scope="col">Simulated (Hz)</th><th scope="col">Difference</th></tr></thead>';
    for (const test of TESTS) {
      for (const [direction, measured, simulated] of test.rows) {
        const body = el.appendChild(document.createElement("tbody"));
        const head = body.appendChild(document.createElement("tr")).appendChild(document.createElement("th"));
        head.colSpan = 4;
        head.scope = "rowgroup";
        head.textContent = test.name + ", " + direction;
        RUBBERS.forEach((name, i) => {
          const tr = body.appendChild(document.createElement("tr"));
          tr.appendChild(document.createElement("th")).textContent = name.replace(/ /g, "\u00a0"); /* a name stays on one line */
          tr.lastChild.scope = "row";
          const d = off(measured[i], simulated[i]);
          for (const cell of [measured[i].toFixed(2), simulated[i].toFixed(2), (d < 0 ? "−" : "+") + Math.abs(d).toFixed(1) + "%"]) tr.appendChild(document.createElement("td")).textContent = cell;
        });
      }
    }
    table.replaceChildren(el);
  }

  const stageEl = root.querySelector("[data-stage]");
  const playBtn = root.querySelector("[data-play]");
  if (!stageEl || !window.ZFig3D) return;
  const { mul, translate, scale } = window.ZFig3D.mat;
  const { lathe, cylinder } = window.ZFig3D.shape;

  /* ---- the bounce ------------------------------------------------------------------------ */

  const [, MEASURED, SIMULATED] = TESTS[0].rows[0]; /* the vertical bounce, Table 1 */
  const SLOW = 4; /* seconds on screen for one second of the test */
  /* A pair is half a cycle apart 0.5 / |simulated - measured| seconds into the test; the soonest of the three sets the restart. */
  const RUN = (SLOW * 0.5) / Math.max(...MEASURED.map((m, i) => Math.abs(SIMULATED[i] - m)));
  /* Then, in seconds on screen: the bounce is faded out, the masses hang still, are drawn down together, and are held before the release. */
  const SETTLE = 1.4;
  const REST = 0.5;
  const PULL = 1.1;
  const HOLD = 0.4;
  const LOOP = RUN + SETTLE + REST + PULL + HOLD;
  const ease = (u) => u * u * (3 - 2 * u);

  /* How far below its resting place a mass hangs, as a fraction of the full bounce, t seconds on screen after the release. */
  function drop(f, t) {
    if (t < RUN + SETTLE) return (t < RUN ? 1 : 1 - ease((t - RUN) / SETTLE)) * Math.cos((2 * Math.PI * f * t) / SLOW);
    const u = (t - RUN - SETTLE - REST) / PULL;
    return u <= 0 ? 0 : u >= 1 ? 1 : ease(u);
  }

  /* ---- the shapes: an illustration, in arbitrary units -------------------------------------- */

  const LENGTH = 0.62; /* of a bellows with its mass hanging still */
  const BOUNCE = 0.13; /* how far the mass moves each way */
  const LONGER = 1.15; /* a narrow picture has height to spare: there the bellows and its bounce are drawn up to this much longer */
  const PLEATS = 7;
  const RIDGE = 0.082; /* radius at a ridge */
  const FOLD = 0.036; /* and at the bottom of a fold */
  const CUFF = { r: 0.056, part: 0.05 }; /* the plain ends: radius, and share of the length */
  const MASS = { r: 0.066, h: 0.12 };
  const PLATE = { r: 0.188, h: 0.022 }; /* the disc a pair hangs from */
  const APART = 0.118; /* each bellows of a pair is this far from the middle of its plate */
  const ASIDE = 0.45; /* the simulated copy sits to the right and a little behind: this angle off the line across the picture */
  const TILT = -0.17; /* the view looks up a little, to where they hang from */
  const TURN = 0.9; /* how far the view turns each way */

  /* A ridged tube hanging from z = 0 down to z = -1; the model matrix stretches it to its length. */
  const tube = [[CUFF.r, 0], [CUFF.r, -CUFF.part]];
  for (let k = 0; k <= 2 * PLEATS; k++) tube.push([k % 2 ? RIDGE : FOLD, -CUFF.part - ((1 - 2 * CUFF.part) * k) / (2 * PLEATS)]);
  tube.push([CUFF.r, CUFF.part - 1], [CUFF.r, -1]);

  /* What the picture must hold above and below the line everything hangs from, in the same units, as the tilted camera sees it. */
  const ABOVE = PLATE.h * Math.cos(TILT) + PLATE.r * Math.abs(Math.sin(TILT));
  const UNDER = (APART + MASS.r) * Math.abs(Math.sin(TILT)); /* the far edge of a mass shows below its middle */
  const tall = (longer) => ABOVE + (longer * (LENGTH + BOUNCE) + MASS.h) * Math.cos(TILT) + UNDER;
  const COLUMN = 2 * PLATE.r + 0.06; /* the least width one pair needs */
  const TOP = 10; /* pixels kept clear above the picture */

  /* ---- the labels: all the text on the picture ---------------------------------------------- */

  const sans = (px, weight) => (weight ? weight + " " : "") + px + 'px "IBM Plex Sans", system-ui, sans-serif';
  const WORDS = ["measured", "simulated"];
  const DOT = "  ·  ";
  const VALUES = RUBBERS.map((name, i) => [hz(MEASURED[i]), hz(SIMULATED[i])]);
  const ruler = document.createElement("canvas").getContext("2d");
  /* The first of these sizes at which every string is at most max pixels wide, or 0. */
  function fits(strings, sizes, weight, max) {
    return (
      sizes.find((px) => {
        ruler.font = sans(px, weight);
        return strings.every((str) => ruler.measureText(str).width <= max);
      }) || 0
    );
  }
  /* How the label under a pair is set where pairs are `column` pixels apart: the two frequencies on one line, on two, or word over number. */
  function labelPlan(column) {
    if (fits(VALUES.map((v) => WORDS[0] + " " + v[0] + DOT + WORDS[1] + " " + v[1]), [12], "", column - 24)) return { rows: 2, name: 13, size: 12, below: 56 };
    const name = fits(RUBBERS, [12, 11, 10], 600, column - 10) || 10;
    const size = fits(VALUES.flatMap((v) => [WORDS[0] + " " + v[0], WORDS[1] + " " + v[1]]), [11, 10.5, 10], "", column - 10);
    return size ? { rows: 3, name, size, below: 66 } : { rows: 5, name, size: fits(WORDS, [11, 10], "", column - 10) || 10, below: 94 };
  }
  function labels(ctx, lay, h) {
    const { rows, name, size } = lay.plan;
    const set = (str, x, y, ink, align) => text(ctx, str, x, y, { font: sans(size), color: ink ? color.ink : color.ink3, align: align || "center" });
    lay.pairs.forEach((pair, i) => {
      const x = Math.round(pair.column);
      const [m, s] = VALUES[i].map((v, k) => WORDS[k] + " " + v);
      text(ctx, pair.name, x, h - (rows === 2 ? 35 : rows === 3 ? 46 : 74), { font: sans(name, 600), color: color.ink, align: "center" });
      if (rows === 2) {
        ctx.font = sans(size);
        const wm = ctx.measureText(m).width;
        const wd = ctx.measureText(DOT).width;
        const left = x - (wm + wd + ctx.measureText(s).width) / 2;
        set(m, left, h - 15, true, "left");
        set(DOT, left + wm, h - 15, false, "left");
        set(s, left + wm + wd, h - 15, false, "left");
      } else if (rows === 3) {
        set(m, x, h - 29, true);
        set(s, x, h - 14, false);
      } else {
        set(WORDS[0], x, h - 57, true);
        set(VALUES[i][0], x, h - 43, true);
        set(WORDS[1], x, h - 28, false);
        set(VALUES[i][1], x, h - 14, false);
      }
    });
  }

  /* ---- where things are ----------------------------------------------------------------------- */

  let now = (SLOW * 0.25) / Math.abs(SIMULATED[1] - MEASURED[1]); /* the still picture when nothing moves: the middle pair a quarter cycle apart */
  let fixed = null; /* what follows from the size of the picture alone, kept until the size changes */

  /* Scale and place for a picture w by h pixels: sets the camera, returns the pixel layout and the six bellows as they are now. */
  function arrange(w, h, camera) {
    if (!fixed || fixed.w !== w || fixed.h !== h) {
      const plan = labelPlan(w / 3);
      const room = h - TOP - plan.below; /* the labels go under the picture */
      const ppu = Math.min(room / tall(1), w / (3 * COLUMN)); /* pixels per unit: the picture is as large as its height or its width lets it be */
      const longer = Math.max(1, Math.min(LONGER, ((room / ppu - ABOVE - UNDER) / Math.cos(TILT) - MASS.h) / (LENGTH + BOUNCE)));
      fixed = { w, h, plan, ppu, longer, gap: Math.min(w / 3 / ppu, 1), hang: TOP + ABOVE * ppu };
    }
    const { plan, ppu, longer, gap, hang } = fixed;
    camera.elevation = TILT;
    camera.halfHeight = h / (2 * ppu);
    camera.minHalfWidth = 0;
    camera.center = [0, 0, (hang - h / 2) / (ppu * Math.cos(TILT))]; /* puts z = 0 on the line y = hang */
    /* The pairs stand along the line across the picture however the view is turned, so each stays over its label and turns in place. */
    const a = camera.azimuth;
    const pairs = RUBBERS.map((name, i) => {
      const cx = (i - 1) * gap * Math.cos(a);
      const cy = (i - 1) * gap * Math.sin(a);
      const one = (simulated) => {
        const side = simulated ? 1 : -1;
        const f = simulated ? SIMULATED[i] : MEASURED[i];
        return { simulated, x: cx + side * APART * Math.cos(ASIDE), y: cy + side * APART * Math.sin(ASIDE), length: longer * (LENGTH + BOUNCE * drop(f, now)) };
      };
      return { name, cx, cy, column: w / 2 + (i - 1) * gap * ppu, measured: one(false), simulated: one(true) };
    });
    return { plan, hang, pairs };
  }

  /* ---- the picture ------------------------------------------------------------------------- */

  const stage = window.ZFig3D.stage(stageEl, {
    height: (w) => (w >= 900 ? 480 : w >= 520 ? 420 : 340),
    camera: { azimuth: 0, elevation: TILT },
    /* The undersides of the plates and masses are seen almost edge-on, so distance changes fast across them; at the
       kit's default a small picture would ink them in. Lines here come from folds and outlines, not from steps in distance. */
    depthEdge: 0.07,
    /* the line they hang from and the labels; and the whole picture, flat, where WebGL 2 is missing */
    underlay(ctx, w, h, st) {
      const lay = arrange(w, h, st.camera);
      rule(ctx, 0, Math.round(lay.hang) + 0.5, w, Math.round(lay.hang) + 0.5, color.ink);
      if (!st.ok) flat(ctx, lay, st);
      labels(ctx, lay, h);
    },
  });

  /* The same picture as flat outlines, drawn with the kit's own projection. */
  function flat(ctx, lay, st) {
    const a = st.camera.azimuth;
    const across = [Math.cos(a), Math.sin(a)];
    const outline = (x, y, profile, zScale, zShift, stroke, fill) => {
      const side = (sign) => profile.map(([r, z]) => st.project([x + sign * r * across[0], y + sign * r * across[1], z * zScale + zShift]));
      const pts = side(1).concat(side(-1).reverse());
      ctx.beginPath();
      pts.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.lineJoin = "round";
      ctx.strokeStyle = stroke;
      ctx.stroke();
    };
    for (const pair of lay.pairs) {
      const behind = Math.sin(ASIDE - a) >= 0 ? [pair.simulated, pair.measured] : [pair.measured, pair.simulated]; /* far one first */
      for (const b of behind) {
        const stroke = b.simulated ? "#a8b0b8" : color.ink; /* the gray the kit draws a quiet part in */
        outline(b.x, b.y, tube, b.length, 0, stroke, color.paper);
        outline(b.x, b.y, [[MASS.r, 0], [MASS.r, -MASS.h]], 1, -b.length, stroke, b.simulated ? color.paper : color.maize);
      }
      outline(pair.cx, pair.cy, [[PLATE.r, PLATE.h], [PLATE.r, 0]], 1, 0, color.ink, color.paper);
    }
  }

  const mesh = stage.ok ? { tube: stage.mesh(lathe(tube, 48)), mass: stage.mesh(cylinder(MASS.r, MASS.h, 48)), plate: stage.mesh(cylinder(PLATE.r, PLATE.h, 64)) } : null;

  function show() {
    if (!mesh) {
      stage.render([]);
      return;
    }
    const lay = arrange(stage.size.w, stage.size.h, stage.camera);
    const items = [];
    for (const pair of lay.pairs) {
      items.push({ mesh: mesh.plate, model: translate(pair.cx, pair.cy, 0) });
      for (const b of [pair.simulated, pair.measured]) {
        items.push({ mesh: mesh.tube, model: mul(translate(b.x, b.y, 0), scale(1, 1, b.length)), quiet: b.simulated });
        items.push({ mesh: mesh.mass, model: translate(b.x, b.y, -b.length - MASS.h), quiet: b.simulated, maize: !b.simulated });
      }
    }
    stage.render(items);
  }

  const loop = run(stageEl, (dt) => {
    now += dt;
    if (now >= LOOP) now -= LOOP;
    show();
  });
  function setPlaying(on) {
    loop.setPaused(!on);
    if (playBtn) {
      playBtn.setAttribute("aria-pressed", String(on));
      playBtn.textContent = on ? "Pause" : "Play";
    }
  }
  if (playBtn) playBtn.addEventListener("click", () => setPlaying(loop.paused));

  /* drag sideways to turn the view, or use the arrow keys when the picture has the focus */
  stage.orbit({ min: -TURN, max: TURN, onTurn: show });
  stageEl.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    stage.camera.azimuth = Math.max(-TURN, Math.min(TURN, stage.camera.azimuth + (e.key === "ArrowLeft" ? 0.12 : -0.12)));
    show();
    e.preventDefault();
  });
  /* the spacing follows the width, so a new width needs the parts placed again, also while paused */
  if ("ResizeObserver" in window) new ResizeObserver(() => requestAnimationFrame(show)).observe(stageEl);
  /* the labels are measured to choose their setting, so they are measured again once the page's type has loaded */
  if (document.fonts && document.fonts.addEventListener) {
    const again = () => {
      fixed = null;
      show();
    };
    document.fonts.ready.then(again);
    document.fonts.addEventListener("loadingdone", again);
  }

  if (!loop.paused) now = LOOP - HOLD - PULL; /* when it plays, it starts with the masses being drawn down, then let go */
  setPlaying(!loop.paused);
  show();
})();
