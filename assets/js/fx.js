/*
 * Motion shared by every page. Everything here is decoration: the pages work
 * without it, and it steps aside for prefers-reduced-motion and touch input.
 *
 *   1. Scroll progress bar
 *   2. Headings that rise word by word out of a mask   [data-split]
 *   3. Cards that tilt toward the pointer              [data-tilt]
 *   4. A spotlight that follows the pointer over cards
 *   5. A lattice with waves running through it, behind each page header
 */
(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* 1. Scroll progress ---------------------------------------------------- */
  const bar = document.createElement("div");
  bar.className = "scroll-progress";
  bar.setAttribute("aria-hidden", "true");
  document.body.appendChild(bar);
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.transform = "scaleX(" + (max > 0 ? Math.min(1, window.scrollY / max) : 0).toFixed(4) + ")";
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });

  /* 2. Word-by-word headings ---------------------------------------------- */
  if (!reduceMotion) {
    document.querySelectorAll("[data-split]").forEach((el) => {
      let index = 0;
      const walk = (node) => {
        Array.from(node.childNodes).forEach((child) => {
          if (child.nodeType === Node.ELEMENT_NODE) {
            walk(child);
            return;
          }
          if (child.nodeType !== Node.TEXT_NODE) return;
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) {
              frag.appendChild(document.createTextNode(" "));
              return;
            }
            const mask = document.createElement("span");
            mask.className = "w";
            const word = document.createElement("span");
            word.textContent = part;
            word.style.setProperty("--i", String(index++));
            mask.appendChild(word);
            frag.appendChild(mask);
          });
          node.replaceChild(frag, child);
        });
      };
      walk(el);
      el.classList.add("is-split");
    });
  }

  /* 3. Tilt ---------------------------------------------------------------- */
  if (finePointer && !reduceMotion) {
    document.querySelectorAll("[data-tilt]").forEach((el) => {
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        el.style.setProperty("--ry", ((x - 0.5) * 9).toFixed(2) + "deg");
        el.style.setProperty("--rx", ((0.5 - y) * 7).toFixed(2) + "deg");
        el.style.setProperty("--gx", (x * 100).toFixed(1) + "%");
        el.style.setProperty("--gy", (y * 100).toFixed(1) + "%");
      });
      el.addEventListener("pointerleave", () => {
        el.style.setProperty("--ry", "0deg");
        el.style.setProperty("--rx", "0deg");
      });
    });
  }

  /* 4. Spotlight ----------------------------------------------------------- */
  if (finePointer) {
    document.addEventListener(
      "pointermove",
      (e) => {
        const card = e.target.closest ? e.target.closest(".card, .topic, .feature, .demo, .year-chart") : null;
        if (!card) return;
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", (e.clientX - r.left).toFixed(0) + "px");
        card.style.setProperty("--my", (e.clientY - r.top).toFixed(0) + "px");
      },
      { passive: true }
    );
  }

  /* 5. Page header lattice -------------------------------------------------- */
  const head = document.querySelector(".page-head");
  if (head) {
    const canvas = document.createElement("canvas");
    canvas.className = "page-head-canvas";
    canvas.setAttribute("aria-hidden", "true");
    head.insertBefore(canvas, head.firstChild);
    head.classList.add("has-canvas");
    const ctx = canvas.getContext("2d");
    const STEP = 26;
    let W = 0;
    let H = 0;
    let sites = [];
    let rafId = 0;
    let inView = true;
    const pointer = { x: -9999, y: -9999, on: false };

    const layout = () => {
      const r = head.getBoundingClientRect();
      W = Math.max(1, r.width);
      H = Math.max(1, r.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sites = [];
      const rowH = STEP * 0.866;
      for (let j = 0, y = -rowH; y < H + rowH; j++, y += rowH) {
        for (let x = (j % 2 ? STEP / 2 : 0) - STEP; x < W + STEP; x += STEP) {
          /* fade toward the left so the lattice never competes with the title */
          const fade = Math.max(0, Math.min(1, (x / W - 0.3) / 0.55)) * Math.max(0.25, 1 - y / (H * 1.25));
          if (fade > 0.02) sites.push(x, y, fade);
        }
      }
    };

    const draw = (now) => {
      const t = now * 0.001;
      ctx.clearRect(0, 0, W, H);
      for (let pass = 0; pass < 2; pass++) {
        ctx.fillStyle = pass ? "#ffcb05" : "#7cc8ff";
        for (let i = 0; i < sites.length; i += 3) {
          const x = sites[i];
          const y = sites[i + 1];
          /* two plane waves crossing the lattice, like phonons */
          const p1 = x * 0.021 + y * 0.012 - t * 1.25;
          const p2 = x * -0.009 + y * 0.027 - t * 0.8;
          const crest = (Math.sin(p1) + Math.sin(p2)) * 0.5;
          const warm = crest > 0.62;
          if (warm !== Boolean(pass)) continue;
          let dx = Math.cos(p1) * 4.2 + Math.cos(p2) * -1.6;
          let dy = Math.cos(p1) * 2.4 + Math.cos(p2) * 4.4;
          if (pointer.on) {
            const rx = x - pointer.x;
            const ry = y - pointer.y;
            const d2 = rx * rx + ry * ry;
            if (d2 < 32400) {
              const d = Math.sqrt(d2) + 0.01;
              const push = (1 - d / 180) ** 2 * 26;
              dx += (rx / d) * push;
              dy += (ry / d) * push;
            }
          }
          const rad = 1.1 + (crest + 1) * 0.75;
          ctx.globalAlpha = sites[i + 2] * (0.28 + (crest + 1) * 0.3);
          ctx.beginPath();
          ctx.arc(x + dx, y + dy, rad, 0, 6.2832);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    };

    const tick = (now) => {
      rafId = 0;
      draw(now);
      schedule();
    };
    const schedule = () => {
      if (!rafId && inView && !reduceMotion && !document.hidden) rafId = requestAnimationFrame(tick);
    };

    head.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch") return;
      const r = head.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
      pointer.on = true;
    });
    head.addEventListener("pointerleave", () => {
      pointer.on = false;
    });
    new ResizeObserver(() => {
      layout();
      draw(performance.now());
    }).observe(head);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        inView = entries[0].isIntersecting;
        schedule();
      }).observe(head);
    }
    document.addEventListener("visibilitychange", schedule);
    layout();
    draw(performance.now());
    schedule();
  }
})();
