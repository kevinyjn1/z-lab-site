/*
 * Home page: fills the numbers strip and the "recent publications" list from
 * the same data files the People and Publications pages use, so they never drift.
 */
(() => {
  "use strict";

  const pubs = window.ZLAB_PUBLICATIONS || [];
  const people = window.ZLAB_PEOPLE;
  const { esc, doiURL } = window.ZLab;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Numbers strip */
  const stats = {
    "stat-pubs": pubs.length,
    "stat-venues": new Set(pubs.map((p) => p.venue)).size,
  };
  if (people) {
    stats["stat-members"] = 1 + people.groups.reduce((n, g) => n + g.members.length, 0);
    stats["stat-alumni"] = people.alumni.length;
  }

  const countUp = (el, target) => {
    if (reduceMotion || !("IntersectionObserver" in window)) {
      el.textContent = String(target);
      return;
    }
    el.textContent = "0";
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const run = (now) => {
        const u = Math.min(1, (now - start) / 1100);
        el.textContent = String(Math.round(target * (1 - Math.pow(1 - u, 3))));
        if (u < 1) requestAnimationFrame(run);
      };
      requestAnimationFrame(run);
    }, { threshold: 0.4 });
    io.observe(el);
  };

  Object.keys(stats).forEach((id) => {
    const el = document.getElementById(id);
    if (el && stats[id]) countUp(el, stats[id]);
  });

  /* Recent publications: the newest few journal articles. */
  const list = document.getElementById("recent-pubs");
  if (list && pubs.length) {
    const recent = pubs
      .filter((p) => p.type === "journal")
      .map((p, i) => ({ p, i }))
      .sort((a, b) => b.p.year - a.p.year || a.i - b.i)
      .slice(0, 5)
      .map(({ p }) => p);

    list.innerHTML = recent
      .map((p) => {
        const href = doiURL(p.doi) || "publications.html";
        return (
          '<a class="pub-row" href="' + esc(href) + '">' +
          '<span class="pub-row-year">' + esc(p.year) + "</span>" +
          '<span class="pub-row-title">' + p.title +
          '<span class="pub-row-meta"><em>' + esc(p.venue) + "</em>" + (p.ref ? " " + esc(p.ref) : "") + "</span></span>" +
          '<span class="arrow" aria-hidden="true">&#8599;</span>' +
          "</a>"
        );
      })
      .join("");
  }
})();
