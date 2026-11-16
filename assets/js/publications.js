/*
 * Publications page: search, type and highlight filters, a clickable
 * papers-per-year chart, and the list itself, all from data/publications.js.
 * Filters are mirrored in the URL (?q=&type=&year=&hl=1) so views can be shared.
 */
(() => {
  "use strict";

  const mount = document.getElementById("pub-list");
  if (!mount) return;

  const { esc, authorsHTML, doiURL } = window.ZLab;
  const input = document.getElementById("pub-search");
  const countEl = document.getElementById("pub-count");
  const barsEl = document.getElementById("year-bars");
  const axisEl = document.getElementById("year-axis");
  const clearYearBtn = document.getElementById("year-clear");
  const typeBtns = Array.from(document.querySelectorAll("[data-type]"));
  const hlBtn = document.getElementById("pub-hl");

  const stripTags = (html) => html.replace(/<[^>]*>/g, " ");
  const TYPE_LABEL = { journal: "J", proceedings: "C" };

  /* Number entries the way a CV does: oldest is 1, counted separately per type. */
  const all = (window.ZLAB_PUBLICATIONS || []).map((p) => Object.assign({}, p));
  const totals = {};
  all.forEach((p) => (totals[p.type] = (totals[p.type] || 0) + 1));
  const seen = {};
  all.forEach((p, i) => {
    seen[p.type] = (seen[p.type] || 0) + 1;
    p.index = i;
    p.num = (TYPE_LABEL[p.type] || "") + (totals[p.type] - seen[p.type] + 1);
    p.hay = [stripTags(p.title), p.authors, p.venue, p.year, p.also || "", stripTags((p.highlights || []).join(" "))]
      .join(" ")
      .toLowerCase();
  });

  const years = all.map((p) => p.year);
  const minYear = Math.min.apply(null, years);
  const maxYear = Math.max.apply(null, years);

  const state = { q: "", type: "all", year: null, hl: false };

  /* URL <-> state */
  const params = new URLSearchParams(location.search);
  state.q = params.get("q") || "";
  if (["journal", "proceedings"].includes(params.get("type"))) state.type = params.get("type");
  const urlYear = parseInt(params.get("year"), 10);
  if (urlYear >= minYear && urlYear <= maxYear) state.year = urlYear;
  state.hl = params.get("hl") === "1";

  const syncURL = () => {
    const next = new URLSearchParams();
    if (state.q.trim()) next.set("q", state.q.trim());
    if (state.type !== "all") next.set("type", state.type);
    if (state.year) next.set("year", String(state.year));
    if (state.hl) next.set("hl", "1");
    const qs = next.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
  };

  const matches = (p) => {
    if (state.type !== "all" && p.type !== state.type) return false;
    if (state.hl && !(p.highlights && p.highlights.length)) return false;
    const tokens = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    return tokens.every((tok) => p.hay.includes(tok));
  };

  /* Year chart: built once, then updated in place so the bars animate. */
  const bars = {};
  if (barsEl && axisEl) {
    for (let yr = minYear; yr <= maxYear; yr++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "year-bar";
      btn.innerHTML = '<span class="n"></span><span class="bar"></span>';
      btn.addEventListener("click", () => {
        state.year = state.year === yr ? null : yr;
        render();
      });
      barsEl.appendChild(btn);
      bars[yr] = btn;

      const tick = document.createElement("span");
      tick.textContent = String(yr);
      if (yr % 5 === 0) tick.className = "show";
      axisEl.appendChild(tick);
    }
  }
  if (clearYearBtn) {
    clearYearBtn.addEventListener("click", () => {
      state.year = null;
      render();
    });
  }

  const renderChart = (base) => {
    const counts = {};
    base.forEach((p) => (counts[p.year] = (counts[p.year] || 0) + 1));
    const peak = Math.max(1, ...Object.values(counts));
    Object.keys(bars).forEach((key) => {
      const yr = Number(key);
      const n = counts[yr] || 0;
      const btn = bars[yr];
      btn.querySelector(".n").textContent = String(n);
      btn.querySelector(".bar").style.height = n ? Math.max(4, (n / peak) * 84) + "%" : "2px";
      btn.setAttribute("aria-pressed", String(state.year === yr));
      btn.setAttribute("aria-label", yr + ": " + n + (n === 1 ? " publication" : " publications"));
      btn.disabled = n === 0 && state.year !== yr;
    });
    if (clearYearBtn) clearYearBtn.hidden = !state.year;
  };

  const pubHTML = (p) => {
    const href = doiURL(p.doi);
    const title = href ? '<a href="' + esc(href) + '">' + p.title + "</a>" : p.title;
    const meta =
      "<em>" + esc(p.venue) + "</em>" +
      '<span class="ref">' + (p.ref ? esc(p.ref) + " " : "") + "(" + esc(p.year) + ")</span>" +
      (href ? '<a class="pub-doi" href="' + esc(href) + '" aria-label="DOI for this publication">DOI &#8599;</a>' : "");
    const also = p.also ? '<p class="pub-also">' + esc(p.also) + "</p>" : "";
    const n = (p.highlights || []).length;
    const highlights = n
      ? '<details class="pub-highlights"><summary>' + n + (n === 1 ? " highlight" : " highlights") + "</summary><ul>" +
        p.highlights.map((h) => "<li>" + h + "</li>").join("") +
        "</ul></details>"
      : "";
    return (
      '<article class="pub">' +
      '<div class="pub-num">' + esc(p.num) + "</div>" +
      '<div class="pub-main">' +
      '<h3 class="pub-title">' + title + "</h3>" +
      '<p class="pub-authors">' + authorsHTML(p.authors) + "</p>" +
      '<div class="pub-meta">' + meta + "</div>" +
      also + highlights +
      "</div></article>"
    );
  };

  const renderList = (shown) => {
    if (!shown.length) {
      mount.innerHTML =
        '<div class="pub-empty"><h2>No publications match those filters.</h2>' +
        '<p><button type="button" class="btn btn--ghost btn--small" id="pub-reset">Clear filters</button></p></div>';
      document.getElementById("pub-reset").addEventListener("click", () => {
        state.q = "";
        state.type = "all";
        state.year = null;
        state.hl = false;
        if (input) input.value = "";
        render();
      });
      return;
    }
    const byYear = new Map();
    shown
      .slice()
      .sort((a, b) => b.year - a.year || a.index - b.index)
      .forEach((p) => {
        if (!byYear.has(p.year)) byYear.set(p.year, []);
        byYear.get(p.year).push(p);
      });
    let html = "";
    byYear.forEach((items, yr) => {
      html +=
        '<section class="pub-year" aria-label="' + yr + '">' +
        '<h2 class="pub-year-label">' + yr + "<small>" + items.length + (items.length === 1 ? " PAPER" : " PAPERS") + "</small></h2>" +
        '<div class="pub-list">' + items.map(pubHTML).join("") + "</div>" +
        "</section>";
    });
    mount.innerHTML = html;
  };

  function render() {
    const base = all.filter(matches);
    const shown = state.year ? base.filter((p) => p.year === state.year) : base;
    renderChart(base);
    renderList(shown);
    typeBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.type === state.type)));
    if (hlBtn) hlBtn.setAttribute("aria-pressed", String(state.hl));
    if (countEl) {
      countEl.textContent =
        shown.length === all.length ? all.length + " publications" : shown.length + " of " + all.length + " publications";
    }
    syncURL();
  }

  /* Controls */
  if (input) {
    input.value = state.q;
    input.addEventListener("input", () => {
      state.q = input.value;
      render();
    });
    document.addEventListener("keydown", (e) => {
      const tag = (document.activeElement && document.activeElement.tagName) || "";
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        input.focus();
      } else if (e.key === "Escape" && document.activeElement === input && input.value) {
        input.value = "";
        state.q = "";
        render();
      }
    });
  }
  typeBtns.forEach((b) =>
    b.addEventListener("click", () => {
      state.type = b.dataset.type;
      render();
    })
  );
  if (hlBtn) {
    hlBtn.addEventListener("click", () => {
      state.hl = !state.hl;
      render();
    });
  }
  document.querySelectorAll("[data-query]").forEach((chip) =>
    chip.addEventListener("click", () => {
      state.q = chip.dataset.query;
      if (input) input.value = state.q;
      render();
    })
  );

  /* The year labels stick just below the toolbar, whatever height it wraps to. */
  const tools = document.getElementById("pub-tools");
  if (tools && "ResizeObserver" in window) {
    new ResizeObserver(() => {
      document.documentElement.style.setProperty("--tools-h", tools.offsetHeight + "px");
    }).observe(tools);
  }

  render();
})();
