/*
 * Shared tools for the 3D figures (window.ZFig3D): real 3D objects drawn as ink on paper,
 * in the same hand for every figure. WebGL 2, no library. Needs figkit.js (window.ZFig).
 *
 * How a picture is made: the objects are rendered once into an off-screen image that holds,
 * for every pixel, which part is there, which way its surface faces, and how far away it is.
 * A second pass turns the places where those change into ink lines, and fills the rest with
 * paper (or maize, for the one part being pointed at).
 *
 *   const stage = ZFig3D.stage(element, options)
 *     options.height(width)     height of the picture in CSS pixels
 *     options.camera            { azimuth, elevation, center: [x, y, z], halfHeight, minHalfWidth }
 *     options.far               half the depth of the scene, in scene units (default 3)
 *     options.depthEdge         a step in distance this large draws a line (default 0.03)
 *     options.underlay(ctx, w, h, stage)   plain 2D drawing under the objects (a floor, a scale bar)
 *   stage.ok                    false when WebGL 2 is missing: only the underlay is drawn
 *   stage.mesh({ positions, indices })     -> a mesh; mesh.update(positions) moves its points
 *   stage.quantized(buffer, entry)         -> a mesh from 16-bit data (see tools/make_go2w_model.py)
 *   stage.cloud(positions)                 -> a cloud of points, for many small things
 *   stage.render(items, clouds)            draw: items [{ mesh, model, maize, quiet }],
 *                                          clouds [{ cloud, model, size, maize, strength }]
 *   stage.project([x, y, z])               -> [x, y] in CSS pixels, for the underlay and labels
 *   stage.orbit({ min, max, onTurn })      let the visitor turn the view by dragging sideways
 *   stage.camera                           the camera, to change between renders
 *
 * World axes: x to the right of the picture, z up, y away from the viewer when azimuth is 0.
 * ZFig3D.mat has the small matrix kit (column-major 4 x 4); ZFig3D.shape makes simple solids.
 */
(() => {
  "use strict";
  if (!window.ZFig) return;

  /* ---- matrices --------------------------------------------------------------------- */

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
  function scale(x, y, z) {
    const m = ident();
    m[0] = x;
    m[5] = y === undefined ? x : y;
    m[10] = z === undefined ? x : z;
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
  const mat = { ident, mul, translate, scale, rotate, rpy };

  /* ---- simple solids ------------------------------------------------------------------ */

  /* A box centered on the origin in x and y, standing on z = 0. */
  function box(w, d, h) {
    const x = w / 2;
    const y = d / 2;
    const positions = [-x, -y, 0, x, -y, 0, x, y, 0, -x, y, 0, -x, -y, h, x, -y, h, x, y, h, -x, y, h];
    const indices = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
    return { positions, indices };
  }
  /* A surface of revolution about z from a profile of [radius, z] points, closed at both ends. */
  function lathe(profile, segments) {
    const n = segments || 32;
    const positions = [];
    const indices = [];
    for (const [r, z] of profile) {
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        positions.push(Math.cos(a) * r, Math.sin(a) * r, z);
      }
    }
    for (let p = 0; p < profile.length - 1; p++) {
      for (let k = 0; k < n; k++) {
        const a = p * n + k;
        const b = p * n + ((k + 1) % n);
        indices.push(a, b, a + n, b, b + n, a + n);
      }
    }
    const cap = (ring, z, flip) => {
      const center = positions.length / 3;
      positions.push(0, 0, z);
      for (let k = 0; k < n; k++) {
        const a = ring * n + k;
        const b = ring * n + ((k + 1) % n);
        if (flip) indices.push(center, b, a);
        else indices.push(center, a, b);
      }
    };
    cap(0, profile[0][1], true);
    cap(profile.length - 1, profile[profile.length - 1][1], false);
    return { positions, indices };
  }
  /* A cylinder about z, standing on z = 0. */
  const cylinder = (r, h, segments) => lathe([[r, 0], [r, h]], segments);
  const shape = { box, lathe, cylinder };

  /* ---- shaders ------------------------------------------------------------------------ */

  const VS_SOLID = `#version 300 es
    in vec3 aPos;
    uniform vec3 uMin, uSize;
    uniform mat4 uModel, uView, uProj;
    out vec3 vView;
    void main() {
      vec4 seen = uView * uModel * vec4(uMin + aPos * uSize, 1.0);
      vView = seen.xyz;
      gl_Position = uProj * seen;
    }`;
  /* For each pixel: the facing of the surface (from how the position changes across the pixel), and which part it is. */
  const FS_SOLID = `#version 300 es
    precision highp float;
    in vec3 vView;
    uniform float uPart;
    out vec4 o;
    void main() {
      vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));
      if (n.z < 0.0) n = -n;
      o = vec4(n.xy * 0.5 + 0.5, uPart, 1.0);
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
    uniform vec2 uDepthEdge;
    in vec2 vUv;
    out vec4 o;
    vec3 facing(vec4 c) {
      vec2 xy = c.rg * 2.0 - 1.0;
      return vec3(xy, sqrt(max(0.0, 1.0 - dot(xy, xy))));
    }
    /* 1 where a sample is empty paper or a quiet part: a line that only such samples make is a gray line */
    float hushed(vec4 c) {
      return max(1.0 - c.a, step(63.5, floor(c.b * 255.0 + 0.5)));
    }
    /* how strongly a line runs between two samples; loud collects the lines that an ink part takes part in */
    float edge(vec2 a, vec2 b, inout float loud) {
      vec4 ca = texture(uSeen, a);
      vec4 cb = texture(uSeen, b);
      float both = min(ca.a, cb.a);
      float e = step(0.5, abs(ca.a - cb.a));
      e = max(e, both * step(0.002, abs(ca.b - cb.b)));
      e = max(e, both * smoothstep(uDepthEdge.x, uDepthEdge.y, abs(texture(uDepth, a).r - texture(uDepth, b).r)));
      e = max(e, both * smoothstep(0.6, 0.9, 1.0 - dot(facing(ca), facing(cb))));
      loud = max(loud, e * (1.0 - min(hushed(ca), hushed(cb))));
      return e;
    }
    void main() {
      vec4 here = texture(uSeen, vUv);
      float loud = 0.0;
      float e = edge(vUv - vec2(uStep.x, 0.0), vUv + vec2(uStep.x, 0.0), loud);
      e = max(e, edge(vUv - vec2(0.0, uStep.y), vUv + vec2(0.0, uStep.y), loud));
      e = max(e, edge(vUv - uStep, vUv + uStep, loud));
      e = max(e, edge(vUv - vec2(uStep.x, -uStep.y), vUv + vec2(uStep.x, -uStep.y), loud));
      /* the part's number carries two flags: 64 for a quiet part (gray lines), 32 for the maize part.
         The line's color goes by the parts on either side of it, not by the pixel it lands on, so the
         outline of a quiet part is gray on its outer half too. */
      float code = floor(here.b * 255.0 + 0.5);
      code -= 64.0 * step(63.5, code);
      float quiet = 1.0 - loud / max(e, 0.0001);
      float maize = step(31.5, code);
      /* paper, toned a little where the surface turns away from the light, so the form reads */
      float lit = max(0.0, dot(facing(here), normalize(vec3(-0.35, 0.55, 0.76))));
      vec3 paper = vec3(1.0) - vec3(0.085, 0.08, 0.07) * (1.0 - lit);
      vec3 fill = mix(paper, vec3(1.0, 0.796, 0.02) - vec3(0.10, 0.09, 0.0) * (1.0 - lit), maize);
      vec3 ink = mix(vec3(0.071, 0.086, 0.110), vec3(0.66, 0.69, 0.72), quiet);
      float cover = max(here.a, e);
      o = vec4(mix(fill, ink, e) * cover, cover);
    }`;
  /* Many small round things, drawn straight to the picture: nearer ones larger and darker. */
  const VS_CLOUD = `#version 300 es
    in vec3 aPos;
    uniform mat4 uModel, uView, uProj;
    uniform float uPixels;
    out float vNear;
    void main() {
      vec4 seen = uView * uModel * vec4(aPos, 1.0);
      gl_Position = uProj * seen;
      vNear = clamp(0.5 - gl_Position.z * 0.5, 0.0, 1.0);
      gl_PointSize = max(1.5, uPixels);
    }`;
  const FS_CLOUD = `#version 300 es
    precision highp float;
    uniform vec3 uColor;
    uniform float uStrength;
    in float vNear;
    out vec4 o;
    void main() {
      float d = length(gl_PointCoord - 0.5) * 2.0;
      float a = (1.0 - smoothstep(0.7, 1.0, d)) * uStrength * mix(0.45, 1.0, vNear);
      o = vec4(uColor * a, a);
    }`;

  function program(gl, vs, fs) {
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

  /* ---- a stage --------------------------------------------------------------------------- */

  function stage(el, options) {
    const o = options || {};
    const far = o.far || 3;
    const depthEdge = (o.depthEdge || 0.03) / (2 * far);
    const camera = Object.assign({ azimuth: 0.5, elevation: 0.2, center: [0, 0, 0], halfHeight: 1, minHalfWidth: 0 }, o.camera || {});
    let size = { w: 1, h: 1 };
    let last = { items: [], clouds: [] };

    /* Two canvases, one exactly over the other. The layout is set here, not in the stylesheet,
       so an out-of-date copy of the stylesheet cannot pull them apart. */
    const under = document.createElement("canvas");
    under.setAttribute("aria-hidden", "true");
    const over = document.createElement("canvas");
    over.setAttribute("aria-hidden", "true");
    el.style.position = "relative";
    Object.assign(over.style, { position: "absolute", inset: "0", width: "100%", height: "100%", touchAction: "pan-y" });
    el.append(under, over);

    function view() {
      const a = camera.azimuth;
      const e = camera.elevation;
      const d = [Math.sin(a) * Math.cos(e), -Math.cos(a) * Math.cos(e), Math.sin(e)]; /* from the scene toward the camera */
      const r = [Math.cos(a), Math.sin(a), 0];
      const u = [d[1] * r[2] - d[2] * r[1], d[2] * r[0] - d[0] * r[2], d[0] * r[1] - d[1] * r[0]];
      const c = camera.center;
      const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
      const hh = Math.max(camera.halfHeight, (camera.minHalfWidth * size.h) / size.w); /* a narrow picture zooms out until the scene fits */
      const hw = (hh * size.w) / size.h;
      return {
        viewM: new Float32Array([r[0], u[0], d[0], 0, r[1], u[1], d[1], 0, r[2], u[2], d[2], 0, -dot(r, c), -dot(u, c), -dot(d, c), 1]),
        proj: new Float32Array([1 / hw, 0, 0, 0, 0, 1 / hh, 0, 0, 0, 0, -1 / far, 0, 0, 0, 0, 1]),
        project: (p) => [((dot(r, p) - dot(r, c)) / hw + 1) * 0.5 * size.w, (1 - (dot(u, p) - dot(u, c)) / hh) * 0.5 * size.h],
        halfWidth: hw,
        halfHeight: hh,
      };
    }

    const api = { ok: false, camera, mat, el, canvas: over };
    Object.defineProperty(api, "size", { get: () => size });
    Object.defineProperty(api, "halfWidth", { get: () => view().halfWidth });
    api.project = (p) => view().project(p);

    const flat = window.ZFig.canvas(under, o.height || ((w) => Math.round(w * 0.6)), (ctx, w, h) => {
      size = { w, h };
      if (o.underlay) o.underlay(ctx, w, h, api);
    });
    size = { w: flat.w, h: flat.h };

    let gl = null;
    try {
      gl = over.getContext("webgl2", { antialias: false, alpha: true, premultipliedAlpha: true, depth: true });
    } catch (e) {
      gl = null;
    }
    let drawSolid = () => {};
    if (gl) {
      try {
        const solid = program(gl, VS_SOLID, FS_SOLID);
        const ink = program(gl, VS_INK, FS_INK);
        const dots = program(gl, VS_CLOUD, FS_CLOUD);
        const U = (p, n) => gl.getUniformLocation(p, n);
        const uni = {
          model: U(solid, "uModel"), view: U(solid, "uView"), proj: U(solid, "uProj"), min: U(solid, "uMin"), size: U(solid, "uSize"), part: U(solid, "uPart"),
          seen: U(ink, "uSeen"), depth: U(ink, "uDepth"), step: U(ink, "uStep"), depthEdge: U(ink, "uDepthEdge"),
          cModel: U(dots, "uModel"), cView: U(dots, "uView"), cProj: U(dots, "uProj"), cPixels: U(dots, "uPixels"), cColor: U(dots, "uColor"), cStrength: U(dots, "uStrength"),
        };
        const aPos = gl.getAttribLocation(solid, "aPos");
        const quad = gl.createVertexArray();
        gl.bindVertexArray(quad);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const corner = gl.getAttribLocation(ink, "aCorner");
        gl.enableVertexAttribArray(corner);
        gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);

        function makeMesh(data, type, normalized, indices, min, extent) {
          const vao = gl.createVertexArray();
          gl.bindVertexArray(vao);
          const vbo = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
          gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
          gl.enableVertexAttribArray(aPos);
          gl.vertexAttribPointer(aPos, 3, type, normalized, 0, 0);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
          gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
          gl.bindVertexArray(null);
          return {
            vao, count: indices.length, min, extent, index: indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
            update(positions) {
              gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
              gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions instanceof Float32Array ? positions : new Float32Array(positions));
            },
          };
        }
        api.mesh = (m) => {
          const count = m.positions.length / 3;
          const indices = count > 65535 ? new Uint32Array(m.indices) : new Uint16Array(m.indices);
          return makeMesh(m.positions instanceof Float32Array ? m.positions : new Float32Array(m.positions), gl.FLOAT, false, indices, [0, 0, 0], [1, 1, 1]);
        };
        api.quantized = (buffer, m) =>
          makeMesh(new Uint16Array(buffer, m.vertexOffset, m.vertexCount * 3), gl.UNSIGNED_SHORT, true, new Uint16Array(buffer, m.indexOffset, m.indexCount), m.min, [m.max[0] - m.min[0], m.max[1] - m.min[1], m.max[2] - m.min[2]]);
        api.cloud = (positions) => {
          const vao = gl.createVertexArray();
          gl.bindVertexArray(vao);
          gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
          gl.bufferData(gl.ARRAY_BUFFER, positions instanceof Float32Array ? positions : new Float32Array(positions), gl.STATIC_DRAW);
          const loc = gl.getAttribLocation(dots, "aPos");
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
          gl.bindVertexArray(null);
          return { vao, count: positions.length / 3 };
        };

        /* the off-screen image: color holds facing and part, plus a depth image to read distances from */
        const target = gl.createFramebuffer();
        const seen = gl.createTexture();
        const depth = gl.createTexture();
        let px = { w: 0, h: 0, scale: 1 };
        const resize = () => {
          const s = Math.max(2, Math.min(3, (window.devicePixelRatio || 1) * 1.5)); /* drawn larger than shown, so the lines come out smooth */
          const w = Math.round(size.w * s);
          const h = Math.round(size.h * s);
          if (w === px.w && h === px.h) return;
          px = { w, h, scale: s };
          over.width = w;
          over.height = h;
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
        };

        drawSolid = (items, clouds) => {
          resize();
          const cam = view();
          gl.bindFramebuffer(gl.FRAMEBUFFER, target);
          gl.viewport(0, 0, px.w, px.h);
          gl.clearColor(0, 0, 0, 0);
          gl.clearDepth(1);
          gl.enable(gl.DEPTH_TEST);
          gl.disable(gl.BLEND);
          gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
          gl.useProgram(solid);
          gl.uniformMatrix4fv(uni.view, false, cam.viewM);
          gl.uniformMatrix4fv(uni.proj, false, cam.proj);
          items.forEach((item, k) => {
            const m = item.mesh;
            gl.bindVertexArray(m.vao);
            gl.uniformMatrix4fv(uni.model, false, item.model || ident());
            gl.uniform3fv(uni.min, m.min);
            gl.uniform3fv(uni.size, m.extent);
            gl.uniform1f(uni.part, ((k % 31) + 1 + (item.maize ? 32 : 0) + (item.quiet ? 64 : 0)) / 255);
            gl.drawElements(gl.TRIANGLES, m.count, m.index, 0);
          });

          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.viewport(0, 0, px.w, px.h);
          gl.disable(gl.DEPTH_TEST);
          gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
          if (items.length) {
            gl.useProgram(ink);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, seen);
            gl.uniform1i(uni.seen, 0);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, depth);
            gl.uniform1i(uni.depth, 1);
            const half = 0.55 * px.scale; /* half the line's width, in off-screen pixels */
            gl.uniform2f(uni.step, half / px.w, half / px.h);
            gl.uniform2f(uni.depthEdge, depthEdge * 0.8, depthEdge * 1.6);
            gl.bindVertexArray(quad);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          }
          if (clouds && clouds.length) {
            gl.useProgram(dots);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.uniformMatrix4fv(uni.cView, false, cam.viewM);
            gl.uniformMatrix4fv(uni.cProj, false, cam.proj);
            for (const c of clouds) {
              gl.bindVertexArray(c.cloud.vao);
              gl.uniformMatrix4fv(uni.cModel, false, c.model || ident());
              gl.uniform1f(uni.cPixels, ((c.size || 0.01) / cam.halfHeight) * 0.5 * px.h);
              gl.uniform3fv(uni.cColor, c.maize ? [1.0, 0.796, 0.02] : [0.071, 0.086, 0.11]);
              gl.uniform1f(uni.cStrength, c.strength === undefined ? 1 : c.strength);
              gl.drawArrays(gl.POINTS, 0, c.count === undefined ? c.cloud.count : Math.min(c.count, c.cloud.count));
            }
            gl.disable(gl.BLEND);
          }
          gl.bindVertexArray(null);
        };
        api.ok = true;
      } catch (e) {
        api.ok = false;
      }
    }

    /* Draw the picture: the underlay first, then the objects. */
    api.render = (items, clouds) => {
      last = { items: items || [], clouds: clouds || [] };
      flat.redraw();
      if (api.ok) drawSolid(last.items, last.clouds);
    };
    if ("ResizeObserver" in window) new ResizeObserver(() => api.ok && drawSolid(last.items, last.clouds)).observe(el);

    /* Drag sideways on the picture to walk around the scene; up and down still scrolls the page. */
    api.orbit = (limits) => {
      const lim = Object.assign({ min: -1.3, max: 1.3, speed: 0.008 }, limits || {});
      let from = null;
      over.style.cursor = "grab";
      over.addEventListener("pointerdown", (e) => {
        from = { x: e.clientX, azimuth: camera.azimuth };
        over.setPointerCapture(e.pointerId);
        over.style.cursor = "grabbing";
      });
      over.addEventListener("pointermove", (e) => {
        if (!from) return;
        camera.azimuth = Math.max(lim.min, Math.min(lim.max, from.azimuth - (e.clientX - from.x) * lim.speed));
        if (lim.onTurn) lim.onTurn(camera.azimuth);
        else api.render(last.items, last.clouds);
      });
      const end = () => {
        from = null;
        over.style.cursor = "grab";
      };
      over.addEventListener("pointerup", end);
      over.addEventListener("pointercancel", end);
    };
    return api;
  }

  window.ZFig3D = { stage, mat, shape, supported: !!window.WebGL2RenderingContext };
})();
