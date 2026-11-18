/*
 * A Unitree Go2-W rolling up and doing a backflip, drawn live as an ink line drawing.
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
 * Drawing: WebGL 2, no library. The robot is rendered once into an off-screen image that
 * holds, for every pixel, which part is there, which way its surface faces, and how far
 * away it is; a second pass turns the places where those change into ink lines on paper.
 */
(() => {
  "use strict";
  const root = document.querySelector('[data-fig="go2w"]');
  const model = window.ZFigData && window.ZFigData.go2w;
  if (!root || !window.ZFig || !model) return;
  const { canvas, text, rule, run, color, font } = window.ZFig;
  const SELF = document.currentScript && document.currentScript.src ? document.currentScript.src : new URL("assets/js/figs/go2w.js", document.baseURI).href;
  const MODEL_URL = new URL("../../models/go2w.bin", SELF).href;

  const stageEl = root.querySelector("[data-stage]");
  const floor = root.querySelector("canvas[data-floor]");
  const glCanvas = root.querySelector("canvas[data-robot]");
  const playBtn = root.querySelector("[data-play]");
  const scrub = root.querySelector("[data-time]");
  const turn = root.querySelector("[data-turn]");
  const values = root.querySelector("[data-values]");
  const note = root.querySelector("[data-note]");

  /* ---- small matrix kit (column-major 4 x 4) ------------------------------------- */

  const ident = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  function mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  }
  function translate(x, y, z) {
    const m = ident();
    m[12] = x;
    m[13] = y;
    m[14] = z;
    return m;
  }
  function rotate(axis, angle) {
    const [x, y, z] = axis;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const t = 1 - c;
    return new Float32Array([t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0, t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0, t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0, 0, 0, 0, 1]);
  }
  /* URDF roll, pitch, yaw: a rotation about x, then y, then z, of the fixed axes. */
  const rpy = (r, p, y) => mul(rotate([0, 0, 1], y), mul(rotate([0, 1, 0], p), rotate([1, 0, 0], r)));
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
  const T = { roll: 1.0, crouch: 1.45, push: 1.6, lift: 1.7, land: 2.28, squat: 2.48, up: 2.9, end: 3.6 };
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
  const KEYS = {
    x: [[0, -0.17], [T.roll, 0.03], [T.lift, 0.03], [T.land, -0.15, "lin"], [T.up, -0.17], [T.end, -0.17]],
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
    const x = along(KEYS.x, t);
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
    /* the wheels turn with the distance rolled; in the air they keep the spin they left with */
    const rolled = KEYS.x[1][1] - KEYS.x[0][1];
    pose.spin = (t <= T.lift ? x - KEYS.x[0][1] : t < T.land ? rolled + (t - T.lift) * 1.2 : rolled + AIR * 1.2 + (x - along(KEYS.x, T.land))) / WHEEL_R;
    return { pose, pitch, x, z, phase, turned: -pitch };
  }

  /* ---- the view --------------------------------------------------------------------- */

  const view = { azimuth: 0.55, elevation: 0.2, centerZ: 0.5, halfHeight: 0.62 };
  const MID_FLIP = T.lift + AIR * 0.42; /* the still picture when nothing moves */
  let now = MID_FLIP;
  let size = { w: 1, h: 1 };

  /* Camera on the robot's right side, turned toward its front by the azimuth; x runs to the right. */
  function camera() {
    const a = view.azimuth;
    const e = view.elevation;
    const d = [Math.sin(a) * Math.cos(e), -Math.cos(a) * Math.cos(e), Math.sin(e)]; /* from the scene toward the camera */
    const r = [Math.cos(a), Math.sin(a), 0];
    const u = [d[1] * r[2] - d[2] * r[1], d[2] * r[0] - d[0] * r[2], d[0] * r[1] - d[1] * r[0]];
    const c = [0, 0, view.centerZ];
    const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
    const viewM = new Float32Array([r[0], u[0], d[0], 0, r[1], u[1], d[1], 0, r[2], u[2], d[2], 0, -dot(r, c), -dot(u, c), -dot(d, c), 1]);
    const hh = Math.max(view.halfHeight, (0.66 * size.h) / size.w); /* a narrow picture zooms out until the robot's whole path fits */
    const hw = (hh * size.w) / size.h;
    const far = 3;
    const proj = new Float32Array([1 / hw, 0, 0, 0, 0, 1 / hh, 0, 0, 0, 0, -1 / far, 0, 0, 0, 0, 1]);
    /* world point to CSS pixels, for the floor drawn under the robot */
    const toScreen = (p) => [((dot(r, p) - dot(r, c)) / hw + 1) * 0.5 * size.w, (1 - (dot(u, p) - dot(u, c)) / hh) * 0.5 * size.h];
    return { viewM, proj, toScreen, halfWidth: hw };
  }

  /* ---- the floor, the shadow, and a scale bar (plain 2D canvas under the robot) --------- */

  const floorStage = canvas(floor, (w) => (w >= 520 ? 400 : 330), (ctx, w, h) => {
    size = { w, h };
    const cam = camera();
    const s = state(now);
    const ellipse = (cx, cy, rx, ry) => {
      ctx.beginPath();
      for (let k = 0; k <= 72; k++) {
        const a = (k / 72) * Math.PI * 2;
        const p = cam.toScreen([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 0]);
        if (k) ctx.lineTo(p[0], p[1]);
        else ctx.moveTo(p[0], p[1]);
      }
      ctx.closePath();
    };
    /* the floor: a disc of faint wash with a hairline edge, as wide as the picture allows */
    const reach = Math.min(0.95, cam.halfWidth * 0.9);
    ellipse(0, 0, reach, reach * 0.63);
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
    const a = cam.toScreen([-0.25, -reach * 0.63, 0]);
    const b = cam.toScreen([0.25, -reach * 0.63, 0]);
    const y = h - 26;
    const x0 = 18;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    rule(ctx, x0, y + 0.5, x0 + len, y + 0.5, color.ink);
    rule(ctx, x0 + 0.5, y - 3, x0 + 0.5, y + 4, color.ink);
    rule(ctx, Math.round(x0 + len) + 0.5, y - 3, Math.round(x0 + len) + 0.5, y + 4, color.ink);
    text(ctx, "0.5 m", x0 + len / 2, y + 13, { align: "center" });
  });

  /* ---- WebGL -------------------------------------------------------------------------- */

  const gl = glCanvas.getContext("webgl2", { antialias: false, alpha: true, premultipliedAlpha: true });
  let ready = false;
  let draw = () => {};

  const VS_ROBOT = `#version 300 es
    in vec3 aPos;
    uniform vec3 uMin, uSize;
    uniform mat4 uModel, uView, uProj;
    out vec3 vView;
    void main() {
      vec4 world = uModel * vec4(uMin + aPos * uSize, 1.0);
      vec4 seen = uView * world;
      vView = seen.xyz;
      gl_Position = uProj * seen;
    }`;
  /* For each pixel: the facing of the surface (from how the position changes across the pixel), and which part it is. */
  const FS_ROBOT = `#version 300 es
    precision highp float;
    in vec3 vView;
    uniform float uId;
    out vec4 o;
    void main() {
      vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));
      if (n.z < 0.0) n = -n;
      o = vec4(n.xy * 0.5 + 0.5, uId, 1.0);
    }`;
  const VS_INK = `#version 300 es
    in vec2 aCorner;
    out vec2 vUv;
    void main() {
      vUv = aCorner * 0.5 + 0.5;
      gl_Position = vec4(aCorner, 0.0, 1.0);
    }`;
  /* Ink where the part, the facing, or the distance changes between neighboring pixels; paper elsewhere. */
  const FS_INK = `#version 300 es
    precision highp float;
    uniform sampler2D uSeen;
    uniform highp sampler2D uDepth;
    uniform vec2 uStep;
    in vec2 vUv;
    out vec4 o;
    vec3 facing(vec4 c) {
      vec2 xy = c.rg * 2.0 - 1.0;
      return vec3(xy, sqrt(max(0.0, 1.0 - dot(xy, xy))));
    }
    float edge(vec2 a, vec2 b) {
      vec4 ca = texture(uSeen, a);
      vec4 cb = texture(uSeen, b);
      float both = min(ca.a, cb.a);
      float e = step(0.5, abs(ca.a - cb.a));
      e = max(e, both * step(0.002, abs(ca.b - cb.b)));
      e = max(e, both * smoothstep(0.004, 0.008, abs(texture(uDepth, a).r - texture(uDepth, b).r)));
      e = max(e, both * smoothstep(0.6, 0.9, 1.0 - dot(facing(ca), facing(cb))));
      return e;
    }
    void main() {
      vec4 here = texture(uSeen, vUv);
      float e = max(max(edge(vUv - vec2(uStep.x, 0.0), vUv + vec2(uStep.x, 0.0)), edge(vUv - vec2(0.0, uStep.y), vUv + vec2(0.0, uStep.y))),
                    max(edge(vUv - uStep, vUv + uStep), edge(vUv - vec2(uStep.x, -uStep.y), vUv + vec2(uStep.x, -uStep.y))));
      /* paper, toned a little where the surface turns away from the light, so the form reads */
      float lit = max(0.0, dot(facing(here), normalize(vec3(-0.35, 0.55, 0.76))));
      vec3 paper = vec3(1.0) - vec3(0.085, 0.08, 0.07) * (1.0 - lit);
      vec3 ink = vec3(0.071, 0.086, 0.110);
      float cover = max(here.a, e);
      o = vec4(mix(paper, ink, e) * cover, cover);
    }`;

  function program(vs, fs) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  function start(buffer) {
    const robot = program(VS_ROBOT, FS_ROBOT);
    const ink = program(VS_INK, FS_INK);
    const U = (p, n) => gl.getUniformLocation(p, n);
    const uni = { model: U(robot, "uModel"), view: U(robot, "uView"), proj: U(robot, "uProj"), min: U(robot, "uMin"), size: U(robot, "uSize"), id: U(robot, "uId"), seen: U(ink, "uSeen"), depth: U(ink, "uDepth"), step: U(ink, "uStep") };

    /* one vertex array for each mesh file; links that share a file share it */
    const meshes = {};
    for (const [file, m] of Object.entries(model.meshes)) {
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Uint16Array(buffer, m.vertexOffset, m.vertexCount * 3), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(robot, "aPos");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 3, gl.UNSIGNED_SHORT, true, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(buffer, m.indexOffset, m.indexCount), gl.STATIC_DRAW);
      meshes[file] = { vao, count: m.indexCount, min: m.min, size: [m.max[0] - m.min[0], m.max[1] - m.min[1], m.max[2] - m.min[2]] };
    }
    const quad = gl.createVertexArray();
    gl.bindVertexArray(quad);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const corner = gl.getAttribLocation(ink, "aCorner");
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    /* the off-screen image: color holds facing and part, plus a depth image to read distances from */
    const target = gl.createFramebuffer();
    const seen = gl.createTexture();
    const depth = gl.createTexture();
    let px = { w: 0, h: 0, scale: 1 };
    function resize() {
      const scale = Math.max(2, Math.min(3, (window.devicePixelRatio || 1) * 1.5)); /* drawn larger than shown, so the lines come out smooth */
      const w = Math.round(size.w * scale);
      const h = Math.round(size.h * scale);
      if (w === px.w && h === px.h) return;
      px = { w, h, scale };
      glCanvas.width = w;
      glCanvas.height = h;
      for (const [tex, internal, format, type] of [[seen, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE], [depth, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT]]) {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, target);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, seen, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
    }

    draw = () => {
      resize();
      const cam = camera();
      const s = state(now);
      const body = mul(translate(s.x, 0, s.z), rotate([0, 1, 0], s.pitch));
      const world = linkTransforms(body, s.pose);

      gl.bindFramebuffer(gl.FRAMEBUFFER, target);
      gl.viewport(0, 0, px.w, px.h);
      gl.clearColor(0, 0, 0, 0);
      gl.clearDepth(1);
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(robot);
      gl.uniformMatrix4fv(uni.view, false, cam.viewM);
      gl.uniformMatrix4fv(uni.proj, false, cam.proj);
      linkNames.forEach((name, k) => {
        const mesh = meshes[model.links[name].mesh];
        gl.bindVertexArray(mesh.vao);
        gl.uniformMatrix4fv(uni.model, false, mul(world[name], visual[name]));
        gl.uniform3fv(uni.min, mesh.min);
        gl.uniform3fv(uni.size, mesh.size);
        gl.uniform1f(uni.id, (k + 1) / 32);
        gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
      });

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, px.w, px.h);
      gl.disable(gl.DEPTH_TEST);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(ink);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, seen);
      gl.uniform1i(uni.seen, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, depth);
      gl.uniform1i(uni.depth, 1);
      const half = 0.55 * px.scale; /* half the line's width, in off-screen pixels */
      gl.uniform2f(uni.step, half / px.w, half / px.h);
      gl.bindVertexArray(quad);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
    };
    ready = true;
    stageEl.classList.add("is-live");
    show();
  }

  /* ---- controls and the loop -------------------------------------------------------------- */

  function part(name, value) {
    const span = document.createElement("span");
    span.append(name + " ");
    span.appendChild(document.createElement("b")).textContent = value;
    return span;
  }

  function show() {
    const s = state(now);
    if (scrub && document.activeElement !== scrub) scrub.value = now.toFixed(2);
    if (scrub) scrub.setAttribute("aria-valuetext", now.toFixed(1) + " seconds, " + s.phase);
    if (values) values.replaceChildren(part("", s.phase), part("body height", s.z.toFixed(2) + " m"), part("turned", Math.round((Math.max(0, Math.min(s.turned, 2 * Math.PI)) * 180) / Math.PI) + "°"));
    floorStage.redraw();
    if (ready) draw();
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
  if (scrub) {
    scrub.min = "0";
    scrub.max = T.end.toFixed(2);
    scrub.step = "0.01";
    scrub.addEventListener("input", () => {
      setPlaying(false);
      now = Number(scrub.value);
      show();
    });
  }
  const setTurn = (a) => {
    view.azimuth = Math.max(-1.3, Math.min(1.3, a));
    if (turn) turn.value = String(Math.round((view.azimuth * 180) / Math.PI));
    show();
  };
  if (turn) turn.addEventListener("input", () => setTurn((Number(turn.value) * Math.PI) / 180));
  /* drag sideways on the drawing to walk around the robot; up and down still scrolls the page */
  let dragFrom = null;
  glCanvas.addEventListener("pointerdown", (e) => {
    dragFrom = { x: e.clientX, azimuth: view.azimuth };
    glCanvas.setPointerCapture(e.pointerId);
  });
  glCanvas.addEventListener("pointermove", (e) => {
    if (dragFrom) setTurn(dragFrom.azimuth - (e.clientX - dragFrom.x) * 0.008);
  });
  const endDrag = () => {
    dragFrom = null;
  };
  glCanvas.addEventListener("pointerup", endDrag);
  glCanvas.addEventListener("pointercancel", endDrag);
  if ("ResizeObserver" in window) new ResizeObserver(() => ready && draw()).observe(stageEl);

  /* The model (under 300 kB) is fetched only when the figure comes near the screen. */
  function load() {
    if (!gl) {
      if (note) note.textContent = "This drawing needs WebGL 2, which this browser does not offer; the still picture is shown instead.";
      return;
    }
    fetch(MODEL_URL)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("model " + r.status))))
      .then(start)
      .catch(() => {
        if (note) note.textContent = "The robot's model could not be loaded; the still picture is shown instead.";
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

  const ends = root.querySelector("[data-time-end]");
  if (ends) ends.textContent = T.end.toFixed(1) + " s";
  if (!loop.paused) now = 0.3; /* when it plays, it starts by rolling up */
  setPlaying(!loop.paused);
  setTurn(view.azimuth);
})();
