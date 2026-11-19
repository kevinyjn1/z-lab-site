/*
 * Home page: fills the "recent publications" list from the same data file the
 * Publications page uses, so the two never drift.
 */
(() => {
  "use strict";

  const pubs = window.ZLAB_PUBLICATIONS || [];
  const { esc, doiURL } = window.ZLab;

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
