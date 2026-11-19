/*
 * A Unitree Go2-W rolling in, doing a backflip, and rolling on, drawn live as an ink line drawing.
 *
 * The robot is the manufacturer's own model: the joint tree comes from the URDF of the
 * go2w_description package in https://github.com/unitreerobotics/unitree_ros (BSD 3-Clause,
 * Copyright (c) 2016-2022 HangZhou YuShu TECHNOLOGY CO.,LTD.), and the meshes are simplified
 * copies of that package's meshes (see go2w-model.js and tools/make_go2w_model.py).
 *
 * The motion is NOT a recording, a simulation, or a controller: it is a set of joint-angle
 * keyframes written by hand for this page, kept inside the URDF's joint limits. Two things
 * in it are computed and not drawn by eye: while a wheel is on the ground the body's height
 * follows from the leg angles (the lowest wheel touches the floor), and in the air the
 * body's height follows the ballistic arc for the time it spends there (g = 9.81 m/s^2).
 *
 * Drawing: the shared 3D kit (fig3d.js), which renders the parts as ink lines on paper.
 */
(() => {
  "use strict";
  const root = document.querySelector('[data-fig="go2w"]');
  const model = window.ZFigData && window.ZFigData.go2w;
  if (!root || !window.ZFig || !window.ZFig3D || !model) return;
  const { text, rule, run, color } = window.ZFig;
  const { mul, translate, rotate, rpy } = window.ZFig3D.mat;
  const SELF = document.currentScript && document.currentScript.src ? document.currentScript.src : new URL("assets/js/figs/go2w.js", document.baseURI).href;
  const MODEL_URL = new URL("../../models/go2w.bin" + new URL(SELF).search, SELF).href; /* same version stamp as this script */

  const stageEl = root.querySelector("[data-stage]");
  const poster = root.querySelector(".go2w-poster");
  const playBtn = root.querySelector("[data-play]");
  const note = root.querySelector("[data-note]");
  const frame = (xyz, angles) => mul(translate(xyz[0], xyz[1], xyz[2]), rpy(angles[0], angles[1], angles[2]));

  /* ---- the robot's joint tree, from the URDF ---------------------------------------- */

  const joints = model.joints.map((j) => ({
    name: j.name,
    parent: j.parent,
    child: j.child,
    origin: frame(j.xyz, j.rpy),
    axis: j.axis,
    leg: j.name.slice(0, 2), /* FL, FR, RL, RR */
    part: j.name.split("_")[1], /* hip, thigh, calf, foot */
  }));
  const linkNames = Object.keys(model.links);
  const visual = {};
  linkNames.forEach((name) => {
    visual[name] = frame(model.links[name].xyz, model.links[name].rpy);
  });
  const WHEEL_R = (model.meshes["left_wheel.dae"].max[0] - model.meshes["left_wheel.dae"].min[0]) / 2;

  /* World transform of every link for a body transform and a set of joint angles. */
  function linkTransforms(body, pose) {
    const world = { base: body };
    for (const j of joints) {
      const front = j.leg[0] === "F";
      let q = 0;
      if (j.part === "thigh") q = front ? pose.fT : pose.rT;
      else if (j.part === "calf") q = front ? pose.fC : pose.rC;
      else if (j.part === "foot") q = pose.spin;
      world[j.child] = mul(mul(world[j.parent], j.origin), rotate(j.axis, q));
    }
    return world;
  }

  /* ---- the flip: hand-written keyframes -------------------------------------------- */

  const G = 9.81;
  const T = { roll: 1.5, crouch: 1.95, push: 2.1, lift: 2.2, land: 2.78, squat: 2.98, up: 3.4, end: 4.9 };
  let edge = 2.3; /* how far to each side the robot starts and ends, in meters; measure() keeps it just outside the picture */
  const AIR = T.land - T.lift;
  const APEX = (G * AIR * AIR) / 8; /* rise of a body that is in the air for AIR seconds */
  const STAND = [0.75, -1.5]; /* thigh and calf angles, radians */

  /* A value along a list of [time, value, "lin"?] keys; eased between keys unless marked linear. */
  function along(keys, t) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let k = 1; k < keys.length; k++) {
      if (t <= keys[k][0]) {
        const u = (t - keys[k - 1][0]) / (keys[k][0] - keys[k - 1][0]);
        const s = keys[k][2] === "lin" ? u : u * u * (3 - 2 * u);
        return keys[k - 1][1] + (keys[k][1] - keys[k - 1][1]) * s;
      }
    }
    return keys[keys.length - 1][1];
  }
  /* Where the robot is along its track: in from one edge, the flip in the middle, out at the other edge. */
  const track = () => [[0, -edge, "lin"], [T.roll * 0.55, -edge * 0.36, "lin"], [T.roll, 0.03], [T.lift, 0.03], [T.land, -0.15, "lin"], [T.up, -0.17], [T.up + (T.end - T.up) * 0.45, edge * 0.3], [T.end, edge, "lin"]];
  const KEYS = {
    pitch: [[0, 0], [T.roll, 0], [T.crouch, 0.04], [T.push, -0.42], [T.lift, -0.85], [T.land, -2 * Math.PI - 0.12, "lin"], [T.squat, -2 * Math.PI + 0.05], [T.up, -2 * Math.PI], [T.end, -2 * Math.PI]],
    fT: [[0, STAND[0]], [T.roll, STAND[0]], [T.crouch, 1.35], [T.push, 0.35], [T.lift + 0.2, 1.25], [T.land - 0.14, 1.25], [T.land, 0.95], [T.squat, 1.2], [T.up, STAND[0]], [T.end, STAND[0]]],
    fC: [[0, STAND[1]], [T.roll, STAND[1]], [T.crouch, -2.55], [T.push, -0.95], [T.lift + 0.2, -2.5], [T.land - 0.14, -2.5], [T.land, -1.75], [T.squat, -2.3], [T.up, STAND[1]], [T.end, STAND[1]]],
    rT: [[0, STAND[0]], [T.roll, STAND[0]], [T.crouch, 1.35], [T.push, 1.3], [T.lift, 0.55], [T.lift + 0.2, 1.4], [T.land - 0.14, 1.4], [T.land, 0.95], [T.squat, 1.25], [T.up, STAND[0]], [T.end, STAND[0]]],
    rC: [[0, STAND[1]], [T.roll, STAND[1]], [T.crouch, -2.55], [T.push, -2.45], [T.lift, -1.0], [T.lift + 0.2, -2.55], [T.land - 0.14, -2.55], [T.land, -1.75], [T.squat, -2.35], [T.up, STAND[1]], [T.end, STAND[1]]],
  };

  /* Height of the body's origin when its lowest wheel rests on the floor. */
  function resting(pitch, pose) {
    const world = linkTransforms(rotate([0, 1, 0], pitch), pose);
    let lowest = Infinity;
    for (const j of joints) if (j.part === "foot") lowest = Math.min(lowest, world[j.child][14]);
    return WHEEL_R - lowest;
  }
  const jointsAt = (t) => ({ fT: along(KEYS.fT, t), fC: along(KEYS.fC, t), rT: along(KEYS.rT, t), rC: along(KEYS.rC, t), spin: 0 });
  const Z_LIFT = resting(along(KEYS.pitch, T.lift), jointsAt(T.lift));
  const Z_LAND = resting(along(KEYS.pitch, T.land), jointsAt(T.land));

  function state(t) {
    const pose = jointsAt(t);
    const pitch = along(KEYS.pitch, t);
    const X = track();
    const x = along(X, t);
    let z;
    let phase;
    if (t > T.lift && t < T.land) {
      const s = (t - T.lift) / AIR;
      z = Z_LIFT + (Z_LAND - Z_LIFT) * s + 4 * APEX * s * (1 - s);
      phase = "in the air";
    } else {
      z = resting(pitch, pose);
      phase = t < T.roll ? "rolling up" : t < T.crouch ? "crouching" : t <= T.lift ? "pushing off" : t < T.up ? "landing" : "standing";
    }
    /* the wheels turn with the distance rolled; in the air they keep turning at the speed they left with */
    const before = along(X, T.lift) - X[0][1];
    pose.spin = (t <= T.lift ? x - X[0][1] : t < T.land ? before + (t - T.lift) * 1.2 : before + AIR * 1.2 + (x - along(X, T.land))) / WHEEL_R;
    return { pose, pitch, x, z, phase, turned: -pitch };
  }

  /* ---- the picture ---------------------------------------------------------------------- */

  let now = T.lift + AIR * 0.42; /* the still picture when nothing moves: mid-flip */
  let meshes = null;

  /* Seen from a quarter to one side, the track runs a little downhill across the picture (the
     robot comes nearer as it crosses). The view is framed to hold all of it: the wheels at the
     lower edge of the track, and the flip's highest point in the middle. */
  const TURN = 0.9; /* how far to either side the view can be turned, in radians */
  /* The robot starts and ends just outside the picture, however wide it is and however it is turned. */
  function measure(st) {
    edge = (st.halfWidth + 0.6) / Math.cos(Math.max(-TURN, Math.min(TURN, st.camera.azimuth)));
  }

  const stage = window.ZFig3D.stage(stageEl, {
    height: (w) => (w >= 900 ? 560 : w >= 520 ? 430 : 350),
    far: 6,
    depthEdge: 0.036,
    camera: { azimuth: 0.45, elevation: 0.2, center: [0, 0, 0.53], halfHeight: 0.73, minHalfWidth: 0.7 },
    /* the floor, the shadow, and a scale bar, drawn flat under the robot */
    underlay(ctx, w, h, st) {
      measure(st);
      const s = state(now);
      const outline = (cx, cy, rx, ry) => {
        const pts = [];
        for (let k = 0; k < 72; k++) {
          const a = (k / 72) * Math.PI * 2;
          pts.push(st.project([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 0]));
        }
        return pts;
      };
      const ellipse = (cx, cy, rx, ry) => {
        ctx.beginPath();
        outline(cx, cy, rx, ry).forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        ctx.closePath();
      };
      /* the floor: a long disc of faint wash with a hairline edge, as long as the picture can hold whole */
      let reach = st.halfWidth * 0.94;
      const fits = (r) => outline(0, 0, r, 0.42).every((p) => p[0] > 6 && p[0] < w - 6 && p[1] < h - 8);
      for (let k = 0; k < 24 && !fits(reach); k++) reach *= 0.95;
      ellipse(0, 0, reach, 0.42);
      ctx.fillStyle = "#f6f7f8";
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = color.ruleStrong;
      ctx.stroke();
      /* the shadow under the body: smaller and fainter the higher the robot is */
      const lift = Math.max(0, Math.min(1, (s.z - 0.2) / 0.75));
      ellipse(s.x, 0, 0.36 - 0.12 * lift, 0.2 - 0.07 * lift);
      ctx.fillStyle = "rgba(18,22,28," + (0.13 - 0.07 * lift).toFixed(3) + ")";
      ctx.fill();
      /* a scale bar, half a meter along the floor */
      const a = st.project([-0.25, -0.5, 0]);
      const b = st.project([0.25, -0.5, 0]);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const x0 = 18;
      const y = h - 26;
      rule(ctx, x0, y + 0.5, x0 + len, y + 0.5, color.ink);
      rule(ctx, x0 + 0.5, y - 3, x0 + 0.5, y + 4, color.ink);
      rule(ctx, Math.round(x0 + len) + 0.5, y - 3, Math.round(x0 + len) + 0.5, y + 4, color.ink);
      text(ctx, "0.5 m", x0 + len / 2, y + 13, { align: "center" });
    },
  });
  if (poster) Object.assign(poster.style, { position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain", background: "#fff", zIndex: "1" });

  function show() {
    if (!meshes) {
      stage.render([]);
      return;
    }
    measure(stage);
    const s = state(now);
    const body = mul(translate(s.x, 0, s.z), rotate([0, 1, 0], s.pitch));
    const world = linkTransforms(body, s.pose);
    stage.render(linkNames.map((name) => ({ mesh: meshes[model.links[name].mesh], model: mul(world[name], visual[name]) })));
  }

  const loop = run(stageEl, (dt) => {
    now += dt;
    if (now >= T.end) now -= T.end;
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
  /* drag sideways to walk around the robot, or use the arrow keys when the picture has the focus */
  stage.orbit({ min: -TURN, max: TURN, onTurn: show });
  stageEl.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    stage.camera.azimuth = Math.max(-TURN, Math.min(TURN, stage.camera.azimuth + (e.key === "ArrowLeft" ? 0.12 : -0.12)));
    show();
    e.preventDefault();
  });

  /* The model (under 300 kB) is fetched only when the figure comes near the screen. */
  function load() {
    if (!stage.ok) {
      if (note) note.textContent = "This drawing needs WebGL 2, which this browser does not offer; a still picture is shown instead.";
      return;
    }
    fetch(MODEL_URL)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("model " + r.status))))
      .then((buffer) => {
        meshes = {};
        for (const [file, m] of Object.entries(model.meshes)) meshes[file] = stage.quantized(buffer, m);
        stageEl.classList.add("is-live");
        if (poster) poster.style.display = "none"; /* the live drawing takes over from the still */
        show();
      })
      .catch(() => {
        if (note) note.textContent = "The robot's model could not be loaded; a still picture is shown instead.";
      });
  }
  if ("IntersectionObserver" in window) {
    const near = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          near.disconnect();
          load();
        }
      },
      { rootMargin: "800px 0px" }
    );
    near.observe(stageEl);
  } else {
    load();
  }

  if (!loop.paused) now = 0; /* when it plays, it starts by rolling in */
  setPlaying(!loop.paused);
  show();
})();
