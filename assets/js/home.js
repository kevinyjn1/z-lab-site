/*
 * Home page: fills the numbers table, the contents list, and the "recent
 * publications" list from the same data files the People and Publications
 * pages use, so they never drift.
 */
(() => {
  "use strict";

  const pubs = window.ZLAB_PUBLICATIONS || [];
  const people = window.ZLAB_PEOPLE;
  const { esc, doiURL } = window.ZLab;

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const list = (parts) =>
    parts.length > 2 ? parts.slice(0, -1).join(", ") + ", and " + parts[parts.length - 1] : parts.join(" and ");
  const setText = (id, text) => {
    const node = document.getElementById(id);
    if (node) node.textContent = text;
  };

  const rows = [];

  /* Publications: the count, and the papers per year as a row of small columns. */
  if (pubs.length) {
    const perYear = {};
    pubs.forEach((p) => (perYear[p.year] = (perYear[p.year] || 0) + 1));
    const years = Object.keys(perYear).map(Number);
    const first = Math.min.apply(null, years);
    const last = Math.max.apply(null, years);
    let peak = first;
    for (let yr = first; yr <= last; yr++) if ((perYear[yr] || 0) >= (perYear[peak] || 0)) peak = yr;

    const spark = el("span", "spark");
    spark.setAttribute("role", "img");
    spark.setAttribute("aria-label", "Papers per year from " + first + " to " + last + ".");
    for (let yr = first; yr <= last; yr++) {
      const bar = spark.appendChild(el("i", yr === peak ? "is-peak" : ""));
      bar.style.height = Math.max(6, ((perYear[yr] || 0) / perYear[peak]) * 100) + "%";
      bar.title = yr + ": " + (perYear[yr] || 0);
    }
    const detail = el("span");
    detail.append(spark, " most in " + peak + ", with " + perYear[peak]);
    rows.push(["Publications since " + first, pubs.length, detail]);
    setText("toc-pubs", pubs.length + " papers, " + first + " to " + last);

    /* Venues: how many, and which lead. */
    const perVenue = new Map();
    pubs.forEach((p) => perVenue.set(p.venue, (perVenue.get(p.venue) || 0) + 1));
    const ranked = Array.from(perVenue, ([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n);
    const leaders = ranked.filter((v) => v.n === ranked[0].n).map((v) => v.name);
    rows.push([
      "Journals and venues",
      ranked.length,
      el("span", "", list(leaders) + (leaders.length > 1 ? ", " + ranked[0].n + " papers each" : ", " + ranked[0].n + " papers")),
    ]);
  }

  if (people) {
    /* Members by career stage. Groups this list does not know get a row of their own. */
    const STAGE = { undergrad: "undergraduates", phd: "PhD and MS students", ms: "PhD and MS students", postdocs: "postdocs" };
    const stages = new Map();
    let total = 1; /* the PI */
    people.groups.forEach((g) => {
      const name = STAGE[g.id] || g.title.toLowerCase();
      stages.set(name, (stages.get(name) || 0) + g.members.length);
      total += g.members.length;
    });
    const parts = Array.from(stages, ([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n).map((s) => s.n + " " + s.name);
    rows.push(["Current members", total, el("span", "", list(parts.concat("the PI")))]);

    /* Alums by what they finished here: the first word of the degree line. */
    const DEGREE = { PhD: "PhD", MS: "MS", Postdoc: "postdoc" };
    const degrees = new Map();
    people.alumni.forEach((a) => {
      const key = String(a.degree || "").split(" ")[0];
      const name = DEGREE[key] || key || "other";
      degrees.set(name, (degrees.get(name) || 0) + 1);
    });
    const dparts = Array.from(degrees, ([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n).map((d) => d.n + " " + d.name + (d.name === "postdoc" && d.n !== 1 ? "s" : ""));
    rows.push(["Grad and postdoc alums", people.alumni.length, el("span", "", list(dparts))]);
    setText("toc-people", total + " members, " + people.alumni.length + " alums");
  }

  const body = document.getElementById("numbers-body");
  if (body && rows.length) {
    body.replaceChildren(
      ...rows.map(([name, value, detail]) => {
        const tr = el("tr");
        tr.append(el("td", "", name), el("td", "num", String(value)));
        tr.appendChild(el("td")).appendChild(detail);
        return tr;
      })
    );
  }

  /* Recent publications: the newest few journal articles. */
  const recentEl = document.getElementById("recent-pubs");
  if (recentEl && pubs.length) {
    const recent = pubs
      .filter((p) => p.type === "journal")
      .map((p, i) => ({ p, i }))
      .sort((a, b) => b.p.year - a.p.year || a.i - b.i)
      .slice(0, 5)
      .map(({ p }) => p);

    recentEl.innerHTML = recent
      .map((p) => {
        const href = doiURL(p.doi) || "publications.html";
        return (
          '<a class="pub-row" href="' + esc(href) + '">' +
          '<span class="pub-row-year">' + esc(p.year) + "</span>" +
          '<span class="pub-row-title">' + p.title + "</span>" +
          '<span class="pub-row-meta"><em>' + esc(p.venue) + "</em></span>" +
          "</a>"
        );
      })
      .join("");
  }
})();
