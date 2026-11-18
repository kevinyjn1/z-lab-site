/*
 * Shared tools for the figures on the Research page (window.ZFig), so every
 * figure is drawn with the same ink, type, axes, and manners:
 *
 *   ZFig.canvas(el, height, draw)   a crisp canvas that redraws when its width changes
 *   ZFig.axes(ctx, box, options)    axes, ticks, gridlines, labels; returns the data-to-pixel maps
 *   ZFig.path / dot / text / rule   the few marks the figures are made of
 *   ZFig.run(el, step)              an animation that rests when off screen, hidden, or paused
 *   ZFig.pointer(el, handlers)      pointer position in canvas pixels
 *
 * A figure is ink on paper. Maize marks the one thing being read. Nothing here
 * knows about any particular paper; each figure's own file states its sources.
 */
(() => {
  "use strict";

  const color = {
    ink: "#12161c",
    ink2: "#3d4652",
    ink3: "#6b7480",
    rule: "#e6e8eb",
    ruleStrong: "#c9ccd1",
    wash: "#f1f2f4",
    paper: "#ffffff",
    maize: "#ffcb05",
    blue: "#00274c",
  };
  const font = {
    mono: '11px "IBM Plex Mono", ui-monospace, Menlo, monospace',
    label: 'italic 15px "STIX Two Text", "Times New Roman", serif',
    note: '12px "IBM Plex Sans", system-ui, sans-serif',
  };
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* A canvas sized in CSS pixels. `height` is a number or a function of the width. */
  function canvas(el, height, draw) {
    const ctx = el.getContext("2d");
    const state = { w: 0, h: 0 };
    const fit = () => {
      const w = Math.max(1, Math.floor(el.clientWidth || el.parentElement.clientWidth));
      if (w === state.w) return false;
      state.w = w;
      state.h = Math.round(typeof height === "function" ? height(w) : height);
      el.style.height = state.h + "px";
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      el.width = Math.round(w * dpr);
      el.height = Math.round(state.h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return true;
    };
    const redraw = () => {
      ctx.clearRect(0, 0, state.w, state.h);
      draw(ctx, state.w, state.h);
    };
    el.style.display = "block";
    el.style.width = "100%";
    fit();
    if ("ResizeObserver" in window) new ResizeObserver(() => fit() && redraw()).observe(el.parentElement);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);
    return {
      ctx,
      redraw,
      get w() {
        return state.w;
      },
      get h() {
        return state.h;
      },
    };
  }

  /* Round tick values that cover [min, max] in about `count` steps. */
  function ticks(min, max, count) {
    const raw = (max - min) / Math.max(1, count || 5);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
    const out = [];
    for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step) out.push(Number(v.toFixed(10)));
    return out;
  }

  function rule(ctx, x0, y0, x1, y1, stroke, width) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineWidth = width || 1;
    ctx.strokeStyle = stroke || color.ink;
    ctx.stroke();
  }

  function text(ctx, str, x, y, o) {
    const opt = o || {};
    ctx.font = opt.font || font.mono;
    ctx.fillStyle = opt.color || color.ink2;
    ctx.textAlign = opt.align || "left";
    ctx.textBaseline = opt.baseline || "middle";
    ctx.fillText(str, x, y);
  }

  /*
   * Axes for a plot inside box {l, t, r, b} (pixels).
   * options: x: [min, max], y: [min, max], xLog, yLog, xTicks, yTicks (arrays; default round values),
   *          xFormat, yFormat (value -> string), xLabel, yLabel, grid (default true: horizontal hairlines)
   * Returns { X, Y }: functions from data values to pixels.
   */
  function axes(ctx, box, options) {
    const o = options;
    const lin = (v, a, b, p0, p1) => p0 + ((v - a) / (b - a)) * (p1 - p0);
    const log = (v, a, b, p0, p1) => p0 + ((Math.log10(v) - Math.log10(a)) / (Math.log10(b) - Math.log10(a))) * (p1 - p0);
    const X = (v) => (o.xLog ? log : lin)(v, o.x[0], o.x[1], box.l, box.r);
    const Y = (v) => (o.yLog ? log : lin)(v, o.y[0], o.y[1], box.b, box.t);
    const decades = (a, b) => {
      const out = [];
      for (let e = Math.ceil(Math.log10(a) - 1e-9); e <= Math.floor(Math.log10(b) + 1e-9); e++) out.push(Math.pow(10, e));
      return out;
    };
    const xt = o.xTicks || (o.xLog ? decades(o.x[0], o.x[1]) : ticks(o.x[0], o.x[1], 5));
    const yt = o.yTicks || (o.yLog ? decades(o.y[0], o.y[1]) : ticks(o.y[0], o.y[1], 4));
    const show = (v, isLog) => (isLog ? "10" + String(Math.round(Math.log10(v))).replace(/-/g, "⁻").replace(/\d/g, (d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[d]) : String(v));
    const xf = o.xFormat || ((v) => show(v, o.xLog));
    const yf = o.yFormat || ((v) => show(v, o.yLog));

    if (o.grid !== false) {
      for (const v of yt) {
        const y = Math.round(Y(v)) + 0.5;
        if (y < box.b - 1) rule(ctx, box.l, y, box.r, y, color.rule);
      }
    }
    rule(ctx, box.l + 0.5, box.t, box.l + 0.5, box.b + 0.5, color.ink);
    rule(ctx, box.l, box.b + 0.5, box.r, box.b + 0.5, color.ink);
    for (const v of xt) {
      const x = Math.round(X(v)) + 0.5;
      rule(ctx, x, box.b, x, box.b + 4, color.ink);
      text(ctx, xf(v), x, box.b + 13, { align: "center" });
    }
    for (const v of yt) {
      const y = Math.round(Y(v)) + 0.5;
      rule(ctx, box.l - 4, y, box.l, y, color.ink);
      text(ctx, yf(v), box.l - 8, y, { align: "right" });
    }
    if (o.xLabel) text(ctx, o.xLabel, box.r, box.b + 32, { font: font.label, color: color.ink, align: "right" });
    if (o.yLabel) text(ctx, o.yLabel, box.l + 8, box.t + 2, { font: font.label, color: color.ink, baseline: "top" });
    return { X, Y };
  }

  /* A polyline through [[x, y], ...] in pixels. A null point lifts the pen. */
  function path(ctx, points, stroke, width, dash) {
    ctx.beginPath();
    let pen = false;
    for (const p of points) {
      if (!p) {
        pen = false;
        continue;
      }
      if (pen) ctx.lineTo(p[0], p[1]);
      else ctx.moveTo(p[0], p[1]);
      pen = true;
    }
    ctx.lineWidth = width || 1.8;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = stroke || color.ink;
    ctx.setLineDash(dash || []);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function dot(ctx, x, y, r, fill, stroke, width) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill || color.ink;
    ctx.fill();
    if (stroke) {
      ctx.lineWidth = width || 1.4;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  }

  /*
   * Runs step(seconds since last frame) while the element is on screen, the tab is
   * visible, the game is closed, and the figure is not paused. Starts paused when the
   * visitor asked for reduced motion. Returns { paused, setPaused(bool), kick() }.
   */
  function run(el, step) {
    let rafId = 0;
    let inView = !("IntersectionObserver" in window);
    let last = 0;
    const api = { paused: reduceMotion.matches, setPaused, kick };
    function frame(now) {
      rafId = 0;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      step(dt);
      kick();
    }
    function kick() {
      if (!rafId && inView && !api.paused && !document.hidden && !document.documentElement.classList.contains("zgame-lock")) rafId = requestAnimationFrame(frame);
      else if (!rafId) last = 0;
    }
    function setPaused(value) {
      api.paused = Boolean(value);
      kick();
    }
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        inView = entries[0].isIntersecting;
        kick();
      }).observe(el);
    }
    document.addEventListener("visibilitychange", kick);
    document.addEventListener("zlab:game", kick);
    kick();
    return api;
  }

  /* Pointer position in canvas pixels. handlers: move(x, y), leave(), down(x, y). Touch scrolling is left alone. */
  function pointer(el, handlers) {
    const at = (e) => {
      const r = el.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    if (handlers.move) el.addEventListener("pointermove", (e) => handlers.move.apply(null, at(e).concat(e)));
    if (handlers.leave) el.addEventListener("pointerleave", () => handlers.leave());
    if (handlers.down) el.addEventListener("pointerdown", (e) => handlers.down.apply(null, at(e).concat(e)));
  }

  window.ZFig = { color, font, canvas, ticks, axes, path, dot, text, rule, run, pointer, reduceMotion };
})();
