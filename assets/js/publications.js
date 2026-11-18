/*
 * Publications page: search, type and highlight filters, two figures that double
 * as filters (papers per year, and the journals with the most papers), and the
 * list itself, all from data/publications.js.
 * Filters are mirrored in the URL (?q=&type=&year=&venue=&hl=1) so views can be shared.
 *
 * Each figure counts the papers that pass every filter except its own, so its
 * selection can be changed in place. Its scale never moves: a faint mark keeps
 * the full count in view behind the papers that match.
 */
(() => {
  "use strict";

  const mount = document.getElementById("pub-list");
  if (!mount) return;

  const { esc, authorsHTML, doiURL } = window.ZLab;
  const input = document.getElementById("pub-search");
  const countEl = document.getElementById("pub-count");
  const yearFig = document.getElementById("fig-years");
  const venueFig = document.getElementById("fig-venues");
  const typeBtns = Array.from(document.querySelectorAll("[data-type]"));
  const hlBtn = document.getElementById("pub-hl");

  const stripTags = (html) => html.replace(/<[^>]*>/g, " ");
  const TYPE_LABEL = { journal: "J", proceedings: "C" };
  const papers = (n) => n + (n === 1 ? " paper" : " papers");

  /* Builds an element; text goes in as text, never as markup. */
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

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
  const perYear = {};
  all.forEach((p) => (perYear[p.year] = (perYear[p.year] || 0) + 1));

  /* The journals and venues with the most papers, in a fixed order. */
  const VENUE_ROWS = 7;
  const perVenue = new Map();
  all.forEach((p) => perVenue.set(p.venue, (perVenue.get(p.venue) || 0) + 1));
  const ranked = Array.from(perVenue, ([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
  let cut = Math.min(VENUE_ROWS, ranked.length);
  if (ranked.length > cut && ranked[cut].total === ranked[cut - 1].total) {
    /* Never split a tie: stop before the group that straddles the cut. */
    const first = ranked.findIndex((v) => v.total === ranked[cut].total);
    if (first > 0) cut = first;
  }
  const topVenues = ranked.slice(0, cut);
  const otherVenues = ranked.slice(cut);

  const state = { q: "", type: "all", year: null, venue: null, hl: false };

  /* URL <-> state */
  const params = new URLSearchParams(location.search);
  state.q = params.get("q") || "";
  if (["journal", "proceedings"].includes(params.get("type"))) state.type = params.get("type");
  const urlYear = parseInt(params.get("year"), 10);
  if (urlYear >= minYear && urlYear <= maxYear) state.year = urlYear;
  if (topVenues.some((v) => v.name === params.get("venue"))) state.venue = params.get("venue");
  state.hl = params.get("hl") === "1";

  const syncURL = () => {
    const next = new URLSearchParams();
    if (state.q.trim()) next.set("q", state.q.trim());
    if (state.type !== "all") next.set("type", state.type);
    if (state.year) next.set("year", String(state.year));
    if (state.venue) next.set("venue", state.venue);
    if (state.hl) next.set("hl", "1");
    const qs = next.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
  };

  /* Search, type, and highlights. The year and the venue are applied per figure. */
  const matches = (p) => {
    if (state.type !== "all" && p.type !== state.type) return false;
    if (state.hl && !(p.highlights && p.highlights.length)) return false;
    const tokens = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    return tokens.every((tok) => p.hay.includes(tok));
  };

  /* A table twin for a figure, so every value can be read without the chart. */
  const fillTable = (holder, caption, head, rows) => {
    if (!holder) return;
    const table = el("table");
    table.appendChild(el("caption", "visually-hidden", caption));
    const headRow = table.appendChild(el("thead")).appendChild(el("tr"));
    head.forEach((h) => {
      const th = el("th", "", h);
      th.scope = "col";
      headRow.appendChild(th);
    });
    const body = table.appendChild(el("tbody"));
    rows.forEach((cells) => {
      const tr = body.appendChild(el("tr"));
      cells.forEach((cell, i) => {
        const td = el(i ? "td" : "th", "", String(cell));
        if (!i) td.scope = "row";
        tr.appendChild(td);
      });
    });
    holder.replaceChildren(table);
  };

  /* Papers per year: one column per year, built once and updated in place. */
  const yearChart = (() => {
    if (!yearFig) return null;
    const plotHost = yearFig.querySelector("[data-plot]");
    const subEl = yearFig.querySelector("[data-sub]");
    const clearBtn = yearFig.querySelector("[data-clear]");
    const tableEl = yearFig.querySelector("[data-table]");

    const peakAll = Math.max.apply(null, Object.values(perYear));
    const step = [1, 2, 4, 5, 10, 20, 25, 50, 100].find((s) => Math.ceil(peakAll / s) <= 4) || Math.ceil(peakAll / 4);
    const top = Math.ceil(peakAll / step) * step;
    plotHost.style.setProperty("--top", String(top));
    plotHost.style.setProperty("--steps", String(top / step));

    const ticks = plotHost.appendChild(el("div", "cols-ticks"));
    ticks.setAttribute("aria-hidden", "true");
    for (let v = top; v >= 0; v -= step) ticks.appendChild(el("span", "", String(v))).style.setProperty("--v", String(v));

    const plot = plotHost.appendChild(el("div", "cols-plot"));
    plot.setAttribute("role", "group");
    plot.setAttribute("aria-label", "Papers per year. Choose a year to filter the list.");
    const axis = plotHost.appendChild(el("div", "cols-axis"));
    axis.setAttribute("aria-hidden", "true");
    const tip = plotHost.appendChild(el("div", "fig-tip"));
    tip.setAttribute("aria-hidden", "true");
    const tipValue = tip.appendChild(el("b"));
    const tipLabel = tip.appendChild(el("span"));

    const cols = {};
    const labels = {};
    let counts = {};

    const showTip = (yr) => {
      const total = perYear[yr] || 0;
      const n = counts[yr] || 0;
      tipValue.textContent = n === total ? papers(n) : n + " of " + papers(total);
      tipLabel.textContent = String(yr);
      const host = plotHost.getBoundingClientRect();
      const area = plot.getBoundingClientRect();
      const col = cols[yr].getBoundingClientRect();
      tip.hidden = false;
      plot.classList.add("is-reading");
      const half = tip.offsetWidth / 2;
      const x = Math.min(host.width - half, Math.max(half, col.left + col.width / 2 - host.left));
      const y = area.bottom - (Math.max(total, n) / top) * area.height - host.top - 10;
      tip.style.left = x + "px";
      tip.style.top = y + "px";
    };
    const hideTip = () => {
      tip.hidden = true;
      plot.classList.remove("is-reading");
    };
    hideTip();

    for (let yr = minYear; yr <= maxYear; yr++) {
      const btn = el("button", "col");
      btn.type = "button";
      btn.appendChild(el("span", "col-ghost"));
      btn.appendChild(el("span", "col-fill"));
      btn.appendChild(el("span", "col-label"));
      btn.style.setProperty("--total", String(perYear[yr] || 0));
      btn.style.setProperty("--i", String(yr - minYear));
      btn.addEventListener("click", () => {
        if (btn.getAttribute("aria-disabled") === "true") return;
        state.year = state.year === yr ? null : yr;
        render();
      });
      btn.addEventListener("pointerenter", (e) => {
        if (e.pointerType !== "touch") showTip(yr);
      });
      btn.addEventListener("pointerleave", hideTip);
      btn.addEventListener("focus", () => {
        if (btn.matches(":focus-visible")) showTip(yr);
      });
      btn.addEventListener("blur", hideTip);
      plot.appendChild(btn);
      cols[yr] = btn;
      labels[yr] = axis.appendChild(el("span", "", String(yr)));
    }
    clearBtn.addEventListener("click", () => {
      state.year = null;
      render();
    });

    return (slice) => {
      counts = {};
      slice.forEach((p) => (counts[p.year] = (counts[p.year] || 0) + 1));
      const filtered = slice.length !== all.length;
      let peakYear = null;
      for (let yr = minYear; yr <= maxYear; yr++) {
        if ((counts[yr] || 0) > 0 && (peakYear === null || counts[yr] >= counts[peakYear])) peakYear = yr;
      }
      for (let yr = minYear; yr <= maxYear; yr++) {
        const n = counts[yr] || 0;
        const total = perYear[yr] || 0;
        const btn = cols[yr];
        const picked = state.year === yr;
        btn.style.setProperty("--n", String(n));
        btn.querySelector(".col-label").textContent = String(n);
        btn.classList.toggle("is-peak", yr === peakYear && !state.year);
        btn.setAttribute("aria-pressed", String(picked));
        btn.setAttribute("aria-label", yr + ": " + (filtered ? n + " of " + papers(total) + " match" : papers(n)));
        if (n === 0 && !picked) btn.setAttribute("aria-disabled", "true");
        else btn.removeAttribute("aria-disabled");
        /* Axis: every fifth year and the first one, plus the chosen year in place of its neighbors. */
        const regular = yr % 5 === 0 || (yr === minYear && yr % 5 !== 4);
        const crowded = state.year && Math.abs(yr - state.year) <= 2;
        labels[yr].classList.toggle("show", picked || (regular && !crowded));
        labels[yr].classList.toggle("is-pick", picked);
      }
      plot.classList.toggle("has-pick", Boolean(state.year));
      clearBtn.hidden = !state.year;
      if (!slice.length) subEl.textContent = "No papers match these filters";
      else if (filtered) subEl.textContent = slice.length + " of " + all.length + " match, most in " + peakYear;
      else subEl.textContent = all.length + " since " + minYear + ", most in " + peakYear;

      const rows = [];
      for (let yr = maxYear; yr >= minYear; yr--) rows.push(filtered ? [yr, counts[yr] || 0, perYear[yr] || 0] : [yr, perYear[yr] || 0]);
      fillTable(tableEl, "Papers per year", filtered ? ["Year", "Matching", "All papers"] : ["Year", "Papers"], rows);
    };
  })();

  /* Where the work appears: ranked bars for the venues with the most papers. */
  const venueChart = (() => {
    if (!venueFig || !topVenues.length) return null;
    const list = venueFig.querySelector("[data-plot]");
    const subEl = venueFig.querySelector("[data-sub]");
    const footEl = venueFig.querySelector("[data-foot]");
    const clearBtn = venueFig.querySelector("[data-clear]");
    const tableEl = venueFig.querySelector("[data-table]");
    const top = topVenues[0].total;
    const inTop = topVenues.reduce((n, v) => n + v.total, 0);
    list.style.setProperty("--top", String(top));

    const rows = topVenues.map((venue, i) => {
      const btn = el("button", "rank");
      btn.style.setProperty("--i", String(i));
      btn.type = "button";
      btn.appendChild(el("span", "rank-name", venue.name));
      const value = btn.appendChild(el("span", "rank-val"));
      const track = btn.appendChild(el("span", "rank-track"));
      track.appendChild(el("span", "rank-ghost"));
      track.appendChild(el("span", "rank-fill"));
      btn.style.setProperty("--total", String(venue.total));
      btn.addEventListener("click", () => {
        if (btn.getAttribute("aria-disabled") === "true") return;
        state.venue = state.venue === venue.name ? null : venue.name;
        render();
      });
      list.appendChild(el("li")).appendChild(btn);
      return { venue, btn, value };
    });
    clearBtn.addEventListener("click", () => {
      state.venue = null;
      render();
    });

    if (footEl && otherVenues.length) {
      const lo = otherVenues[otherVenues.length - 1].total;
      const hi = otherVenues[0].total;
      footEl.textContent =
        "The other " + otherVenues.length + " have " + (lo === hi ? papers(hi) : lo + " to " + papers(hi)) + " each.";
    }

    return (slice) => {
      const counts = new Map();
      slice.forEach((p) => counts.set(p.venue, (counts.get(p.venue) || 0) + 1));
      const filtered = slice.length !== all.length;
      let held = 0;
      rows.forEach(({ venue, btn, value }) => {
        const n = counts.get(venue.name) || 0;
        const picked = state.venue === venue.name;
        held += n;
        btn.style.setProperty("--n", String(n));
        value.textContent = String(n);
        btn.setAttribute("aria-pressed", String(picked));
        btn.setAttribute("aria-label", venue.name + ": " + (filtered ? n + " of " + papers(venue.total) + " match" : papers(n)));
        if (n === 0 && !picked) btn.setAttribute("aria-disabled", "true");
        else btn.removeAttribute("aria-disabled");
      });
      list.classList.toggle("has-pick", Boolean(state.venue));
      clearBtn.hidden = !state.venue;
      if (!slice.length) subEl.textContent = "No papers match these filters";
      else if (filtered) subEl.textContent = "These " + rows.length + " hold " + held + " of the " + slice.length + " that match";
      else subEl.textContent = "These " + rows.length + " of " + ranked.length + " hold " + inTop + " of the " + all.length + " papers";

      fillTable(
        tableEl,
        "Papers by journal or venue",
        filtered ? ["Journal or venue", "Matching", "All papers"] : ["Journal or venue", "Papers"],
        rows.map(({ venue }) => (filtered ? [venue.name, counts.get(venue.name) || 0, venue.total] : [venue.name, venue.total]))
      );
    };
  })();

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
        state.venue = null;
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

  /*
   * The figures enter once, their marks rising in order. After that entrance, or
   * as soon as a filter is used, every update is immediate.
   */
  const figs = document.querySelector(".figs");
  const settle = () => figs && figs.classList.add("is-settled");
  if (figs && "MutationObserver" in window && !figs.classList.contains("is-in")) {
    new MutationObserver((_, watcher) => {
      if (!figs.classList.contains("is-in")) return;
      watcher.disconnect();
      setTimeout(settle, 1500);
    }).observe(figs, { attributes: true, attributeFilter: ["class"] });
  } else {
    settle();
  }
  let drawn = false;

  function render() {
    if (drawn) settle();
    drawn = true;
    const base = all.filter(matches);
    const inYear = (p) => !state.year || p.year === state.year;
    const inVenue = (p) => !state.venue || p.venue === state.venue;
    const shown = base.filter((p) => inYear(p) && inVenue(p));
    if (yearChart) yearChart(base.filter(inVenue));
    if (venueChart) venueChart(base.filter(inYear));
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
