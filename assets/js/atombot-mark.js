/*
 * The Atombot mark, painted in.
 *
 * The mark is three brush strokes circling a center. Here each stroke is laid down in turn,
 * from its heavy head to its thin tail, with the ragged leading edge of a brush that is
 * running dry.
 *
 * It works from the mark's own image. Each pixel of ink is given to one of the three strokes
 * by where it sits around the center (the strokes are a third of a turn apart, and where one
 * stroke's tail passes inside the next one's head, the radius tells them apart). A stroke is
 * then uncovered ring by ring around the center, each ring a little behind or ahead of its
 * neighbors, which is what makes the front look like bristles.
 *
 * Markup: <button class="atombot-mark" data-atombot><img src="...atombot-mark.webp" alt=""></button>
 * The image is what shows without JavaScript. The animation plays once when the mark comes
 * into view, and again on a click, on Enter or Space, or when a pointer comes over it. With
 * "reduce motion" on, the finished mark is shown and nothing moves.
 */
(() => {
  "use strict";
  const marks = Array.from(document.querySelectorAll("[data-atombot]"));
  if (!marks.length) return;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* The mark's geometry, in the pixels of its 640 by 588 image. Angles are in degrees,
     clockwise from the right, as a canvas measures them. */
  const SIZE = [640, 588];
  const CENTER = [310.6, 345.2];
  const HEADS = [350, 110, 230]; /* where each stroke's heavy head begins */
  const SWEEP = 162; /* how far around a stroke runs, head to tail */
  const SPLIT = 172; /* a tail passes inside this radius, the next head outside it */
  const RINGS = 40; /* thin rings, so the front breaks up into bristle streaks */
  const RING_FROM = 92;
  const RING_TO = 336;
  const RAGGED = 17; /* how many degrees one ring may trail behind the front */
  const INK = [18, 22, 28];
  const rad = (deg) => (deg * Math.PI) / 180;

  /* Splits the mark's image into three canvases, one for each stroke, in the site's ink. */
  function strokesOf(img) {
    const [w, h] = SIZE;
    const src = document.createElement("canvas");
    src.width = w;
    src.height = h;
    const sx = src.getContext("2d", { willReadFrequently: true });
    sx.drawImage(img, 0, 0, w, h);
    const from = sx.getImageData(0, 0, w, h).data;
    const layers = [0, 1, 2].map(() => new ImageData(w, h));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const alpha = from[i + 3];
        if (alpha < 6) continue;
        const dx = x - CENTER[0];
        const dy = y - CENTER[1];
        const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
        let k = 0;
        let along = 0;
        for (let s = 0; s < 3; s++) {
          const a = (angle - HEADS[s] + 360) % 360;
          if (a < 120) {
            k = s;
            along = a;
          }
        }
        /* early in a stroke's sector and close to the center: this is the tail of the stroke before it */
        if (along < 44 && Math.hypot(dx, dy) < SPLIT) k = (k + 2) % 3;
        const to = layers[k].data;
        to[i] = INK[0];
        to[i + 1] = INK[1];
        to[i + 2] = INK[2];
        to[i + 3] = alpha;
      }
    }
    return layers.map((data) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      c.getContext("2d").putImageData(data, 0, 0);
      return c;
    });
  }

  /* A fixed scatter, so every visitor sees the same brush. */
  function scatter(seed) {
    let s = seed;
    return () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
  }

  function setUp(host, strokes) {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    const ctx = canvas.getContext("2d");
    const random = scatter(7);
    /* how far each ring trails the front, 0 to 1: a slow wander across the stroke plus a fine scatter, like bristles */
    const lag = [0, 1, 2].map(() => {
      const coarse = Array.from({ length: 7 }, () => random());
      return Array.from({ length: RINGS }, (_, r) => {
        const at = (r / (RINGS - 1)) * (coarse.length - 1);
        const i = Math.min(coarse.length - 2, Math.floor(at));
        const f = at - i;
        const wander = coarse[i] * (1 - f) + coarse[i + 1] * f;
        return Math.min(1, 0.62 * wander + 0.46 * random());
      });
    });
    let raf = 0;
    let began = 0;
    let scale = 1;
    let painted = still.matches; /* false until the mark has been painted in once */

    function fit() {
      const w = host.clientWidth || 160;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(((w * SIZE[1]) / SIZE[0]) * dpr);
      scale = canvas.width / SIZE[0];
    }

    /* One stroke, uncovered from its head as far as `front` degrees, ring by ring. */
    function paint(k, front) {
      if (front >= SWEEP + RAGGED) {
        ctx.drawImage(strokes[k], 0, 0);
        return;
      }
      if (front <= 0) return;
      const start = rad(HEADS[k] - 6);
      const step = (RING_TO - RING_FROM) / RINGS;
      for (let r = 0; r < RINGS; r++) {
        const reach = front - lag[k][r] * RAGGED;
        if (reach <= 0) continue;
        const end = rad(HEADS[k] + Math.min(reach, SWEEP + 4));
        ctx.save();
        ctx.beginPath();
        ctx.arc(CENTER[0], CENTER[1], RING_FROM + step * (r + 1) + 0.5, start, end);
        ctx.arc(CENTER[0], CENTER[1], RING_FROM + step * r, end, start, true);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(strokes[k], 0, 0);
        ctx.restore();
      }
    }

    /* Draws the mark `t` seconds into the animation; returns false once it is finished. */
    function draw(t) {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, SIZE[0], SIZE[1]);
      let busy = false;
      for (let k = 0; k < 3; k++) {
        const u = Math.max(0, Math.min(1, (t - 0.2 * k) / 1.25));
        const eased = (1 - Math.cos(Math.PI * u)) / 2; /* in gently, a steady stroke, out gently */
        paint(k, (SWEEP + RAGGED + 4) * eased);
        if (u < 1) busy = true;
      }
      return busy;
    }

    function frame(now) {
      raf = 0;
      if (!began) began = now;
      if (draw((now - began) / 1000)) raf = requestAnimationFrame(frame);
      else painted = true;
    }
    function play() {
      if (raf) return;
      if (still.matches) {
        draw(99);
        return;
      }
      began = 0;
      raf = requestAnimationFrame(frame);
    }

    fit();
    draw(painted ? 99 : -1); /* blank until it plays, or finished when nothing should move */
    host.replaceChildren(canvas);
    host.classList.add("is-live");
    host.addEventListener("click", play);
    if (window.matchMedia("(hover: hover)").matches) host.addEventListener("pointerenter", play);
    if ("ResizeObserver" in window) {
      new ResizeObserver(() => {
        fit();
        if (!raf) draw(painted ? 99 : -1);
      }).observe(host);
    }
    if ("IntersectionObserver" in window && !still.matches) {
      const seen = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            seen.disconnect();
            play();
          }
        },
        { threshold: 0.6 }
      );
      seen.observe(host);
    } else {
      painted = true;
      draw(99);
    }
  }

  /* One image is read once and shared by every mark on the page. */
  const first = marks[0].querySelector("img");
  if (!first) return;
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    let strokes;
    try {
      strokes = strokesOf(img);
    } catch (e) {
      return; /* the image could not be read: the plain image stays */
    }
    marks.forEach((host) => setUp(host, strokes));
  };
  img.src = first.currentSrc || first.src;
})();
