/*
 * Home page: fills the numbers strip (each number with a small figure under it)
 * and the "recent publications" list from the same data files the People and
 * Publications pages use, so they never drift.
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

  /*
   * A small figure under each number, from the same data. In every one the
   * largest value wears the accent and the rest stay quiet.
   */
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const papers = (n) => n + (n === 1 ? " paper" : " papers");

  /* Ranked rows: a name, a figure, and a thin bar each. */
  const rankRows = (id, rows, label) => {
    const host = document.getElementById(id);
    if (!host || !rows.length) return;
    rows.sort((a, b) => b.n - a.n);
    const top = rows[0].n;
    const list = el("ol", "ranks ranks--mini");
    list.setAttribute("aria-label", label);
    list.style.setProperty("--top", String(top));
    rows.forEach((row, i) => {
      const item = el("li", "rank" + (row.n === top ? " is-top" : ""));
      item.style.setProperty("--n", String(row.n));
      item.style.setProperty("--i", String(i));
      item.appendChild(el("span", "rank-name", row.name));
      item.appendChild(el("span", "rank-val", String(row.n)));
      item.appendChild(el("span", "rank-track")).appendChild(el("span", "rank-fill"));
      list.appendChild(item);
    });
    host.replaceChildren(list);
  };

  /* Papers per year as a row of small columns, with one readout that follows the pointer. */
  const vizPubs = document.getElementById("viz-pubs");
  if (vizPubs && pubs.length) {
    const perYear = {};
    pubs.forEach((p) => (perYear[p.year] = (perYear[p.year] || 0) + 1));
    const yearsWith = Object.keys(perYear).map(Number);
    const first = Math.min.apply(null, yearsWith);
    const last = Math.max.apply(null, yearsWith);
    let peak = first;
    for (let yr = first; yr <= last; yr++) if ((perYear[yr] || 0) >= (perYear[peak] || 0)) peak = yr;

    const spark = el("div", "spark");
    spark.setAttribute("role", "img");
    spark.setAttribute("aria-label", "Papers per year from " + first + " to " + last + ". Most in " + peak + ", with " + perYear[peak] + ".");
    const note = spark.appendChild(el("span", "spark-note"));
    const bars = spark.appendChild(el("div", "spark-bars"));
    bars.style.setProperty("--top", String(perYear[peak]));
    const axis = spark.appendChild(el("div", "spark-axis"));
    axis.appendChild(el("span", "", String(first)));
    axis.appendChild(el("span", "", String(last)));

    const marks = {};
    let shown = null;
    const show = (yr) => {
      if (marks[shown]) marks[shown].classList.remove("is-on");
      shown = yr;
      marks[yr].classList.add("is-on");
      note.textContent = (perYear[yr] || 0) + " in " + yr;
      const half = note.offsetWidth / 2;
      const center = marks[yr].offsetLeft + marks[yr].offsetWidth / 2;
      note.style.left = Math.min(bars.offsetWidth - half, Math.max(half, center)) + "px";
    };
    for (let yr = first; yr <= last; yr++) {
      const mark = bars.appendChild(el("i"));
      mark.style.setProperty("--n", String(perYear[yr] || 0));
      mark.style.setProperty("--d", (yr - first) * 18 + "ms"); /* the columns rise in order */
      mark.addEventListener("pointerenter", () => show(yr));
      marks[yr] = mark;
    }
    bars.addEventListener("pointerleave", () => show(peak));
    vizPubs.replaceChildren(spark);
    show(peak);
    if ("ResizeObserver" in window) new ResizeObserver(() => show(shown)).observe(bars);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => show(shown));
  }

  /*
   * The journals with the most papers. A name too long for one line of a tile is
   * given in its standard abbreviated form, like the journal names around it.
   */
  const ABBREVIATED = { "Transactions of the American Nuclear Society": "Trans. Am. Nucl. Soc." };
  if (pubs.length) {
    const perVenue = new Map();
    pubs.forEach((p) => perVenue.set(p.venue, (perVenue.get(p.venue) || 0) + 1));
    const venues = Array.from(perVenue, ([name, n]) => ({ name: ABBREVIATED[name] || name, n })).sort((a, b) => b.n - a.n);
    rankRows("viz-venues", venues.slice(0, 3), "The three journals with the most papers");
  }

  if (people) {
    /* Members by career stage. Groups this list does not know get a row of their own. */
    const STAGE = { undergrad: "Undergraduates", phd: "PhD and MS students", ms: "PhD and MS students", postdocs: "Postdocs and PI" };
    const stages = new Map([[STAGE.postdocs, 1]]); /* the PI */
    people.groups.forEach((g) => {
      const name = STAGE[g.id] || g.title;
      stages.set(name, (stages.get(name) || 0) + g.members.length);
    });
    rankRows("viz-members", Array.from(stages, ([name, n]) => ({ name, n })), "Current members by career stage");

    /* Alums by what they finished here: the first word of the degree line. */
    const DEGREE = { PhD: "PhD graduates", MS: "MS graduates", Postdoc: "Postdocs" };
    const degrees = new Map();
    people.alumni.forEach((a) => {
      const key = String(a.degree || "").split(" ")[0];
      const name = DEGREE[key] || key || "Other";
      degrees.set(name, (degrees.get(name) || 0) + 1);
    });
    rankRows("viz-alumni", Array.from(degrees, ([name, n]) => ({ name, n })), "Alums by degree or position");
  }

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
