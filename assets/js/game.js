/*
 * Rare Event: a small game.
 *
 * Pilot the Atombot mark through a sample of matter that keeps changing state
 * (liquid, crystal, gas, glass), catch rare events before they fade, and drop
 * bias hills to push the atoms away. A toy for fun, not research code or data.
 *
 * Drawn like the figures on the site: ink on paper. Atoms are ink (filled when they
 * move freely, hollow when frozen), and maize marks only the player and the rare events.
 *
 * site.js loads this file, game.css, and data/leaderboard.js on demand, so a normal page
 * view pays nothing. Everything is created on open and torn down on close.
 *
 * Leaderboard: the start and result screens list the top scores, and a finished run can be
 * posted with a name and an optional email. Where scores go is set in data/leaderboard.js;
 * with nothing set there, each device keeps its own list. The shared list reaches the page a
 * few minutes late, so a device also remembers what it posted and shows those scores until the
 * shared list has them. Scores come from the visitor's browser, so they can be faked: treat
 * the list as fun, not as a record.
 *
 *   window.ZLabGame.open()      show the game over the current page;
 *                               open({ view: "board" }) puts the leaderboard up front
 *   window.ZLabGame.close()     remove it and give the page back
 *   window.ZLabGame.snapshot()  read-only copy of the current state (for tests and the curious)
 */
(() => {
  "use strict";
  if (window.ZLabGame) return;

  const SELF = document.currentScript && document.currentScript.src
    ? document.currentScript.src
    : new URL("assets/js/game.js", document.baseURI).href;
  const MARK_URL = new URL("../img/atombot-mark.webp", SELF).href;
  const BEST_KEY = "zlab-rare-event-best";
  const BOARD_KEY = "zlab-rare-event-board"; /* the scores posted from this device */
  const NAME_KEY = "zlab-rare-event-name"; /* the name last posted from this device */
  const BOARD_SIZE = 10;
  const MAX_SCORE = 3000; /* more than a real run reaches; larger posted scores are ignored */
  const AWAIT_MS = 60 * 60 * 1000; /* how long a posted score is shown here while the shared list lacks it */

  /* The site's ink and its one highlight (see assets/css/style.css). */
  const INK = "#12161c";
  const INK_RGB = "18,22,28";
  const MAIZE = "#ffcb05";
  const MAIZE_RGB = "255,203,5";
  const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';

  /* Tuning. Lengths are in "units": about one CSS pixel on a laptop, smaller on a phone. */
  const STEP = 1 / 120; /* fixed simulation step, seconds */
  const MAX_ATOMS = 240;
  const SPACING = 116; /* mean distance between atoms in the first cycle */
  const MIN_SPACING = 86;
  const ATOM_R = 7; /* hit radius of an atom */
  const PLAYER_R = 11; /* hit radius of Atombot (smaller than the mark, to be fair) */
  const CATCH_R = 30;
  const INTEGRITY = 3;
  const MAX_CHARGES = 3;
  const EVENTS_PER_CHARGE = 5;
  const CUE = 2.2; /* seconds of warning before the sample changes state */
  const HILL_R = 132;
  const HILL_LIFE = 3.2;
  const HOP_FLASH = 0.8; /* a glass atom flashes this long before it hops */
  const HOP_MOVE = 0.3;
  const SPARK_LIFE = 4.6;

  const MATTER = {
    liquid: { secs: 10, next: "crystal", cue: "cooling slowly", verb: "cooling", heat: 0, tip: "Atoms drift with the flow." },
    crystal: { secs: 9, next: "gas", cue: "heating", verb: "heating", heat: -0.45, tip: "The lanes between rows are safe." },
    gas: { secs: 9, next: "glass", cue: "quenching", verb: "quenching", heat: 1, tip: "Fast atoms. A bias hill clears space." },
    glass: { secs: 10, next: "liquid", cue: "warming", verb: "warming", heat: -1, tip: "Frozen in place, until one flashes and hops." },
  };

  /* Score needed, title, note. */
  const RANKS = [
    [0, "Visiting student", "A short stay in the sample."],
    [8, "Undergrad researcher", "First real data."],
    [24, "MS student", "Enough events for a thesis chapter."],
    [55, "PhD candidate", "Statistically significant."],
    [110, "Postdoc", "Long timescales are your thing."],
    [200, "Principal investigator", "The sample reports to you now."],
  ];

  const ICON_PAUSE = '<svg class="zg-ic-pause" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="5" width="3.6" height="14" rx="1"/><rect x="13.9" y="5" width="3.6" height="14" rx="1"/></svg>';
  const ICON_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  /* The three marks of the game, as the canvas draws them. */
  const DOT_ATOM = '<svg class="zg-dot" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="6" fill="#2b333d" stroke="#12161c"/></svg>';
  const DOT_EVENT = '<svg class="zg-dot" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1l2.3 5.5L18 9l-5.2 2.4L10 19l-2.6-7.6L2 9l5.6-2.5z" fill="#ffcb05" stroke="#12161c" stroke-width="1.2" stroke-linejoin="round"/></svg>';
  const DOT_HILL = '<svg class="zg-dot" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="#12161c"><circle cx="10" cy="10" r="9" fill="#fff3c4" stroke-opacity="0.45"/><circle cx="10" cy="10" r="5.5" stroke-opacity="0.7"/><circle cx="10" cy="10" r="2"/></svg>';

  const BOARD_HTML =
    '<aside class="zg-board" data-board aria-label="Leaderboard">' +
      '<p class="label zg-board-head"><span>Leaderboard</span><span class="zg-board-scope" data-board-scope></span></p>' +
      '<ol class="zg-board-list" data-board-list></ol>' +
      '<p class="zg-board-note" data-board-note>Loading scores</p>' +
    "</aside>";

  const TEMPLATE =
    '<canvas class="zgame-canvas" aria-hidden="true"></canvas>' +
    '<div class="zgame-top">' +
      '<div class="zgame-hud">' +
        '<span class="zg-item zg-n">N <b data-n>0</b></span>' +
        '<span class="zg-item zg-state">state <b data-state>liquid</b><i class="zg-bar" aria-hidden="true"><i data-clock></i></i></span>' +
        '<span class="zg-item">events <b data-events>0</b></span>' +
        '<span class="zg-item zg-mult"><b data-mult>&times;1</b></span>' +
        '<span class="zg-item zg-pips" data-integrity role="img" aria-label="Integrity 3 of 3"><i></i><i></i><i></i></span>' +
      "</div>" +
      '<div class="zgame-tools">' +
        '<button class="zg-btn" type="button" data-pause aria-label="Pause">' + ICON_PAUSE + "</button>" +
        '<button class="zg-btn" type="button" data-close aria-label="Close the game">' + ICON_CLOSE + "</button>" +
      "</div>" +
    "</div>" +
    '<button class="zgame-bias" type="button" data-bias aria-label="Drop a bias hill">' +
      '<span class="zg-charges" aria-hidden="true"><i></i><i></i><i></i></span>' +
      "<span>bias</span>" +
    "</button>" +
    '<div class="zgame-cue" data-cue aria-hidden="true"><em></em><span></span></div>' +
    '<div class="zgame-panel zgame-panel--wide" data-panel="start">' +
      '<div class="zg-main">' +
      '<span class="zg-logo" aria-hidden="true"></span>' +
      '<p class="label">Z Lab &middot; hidden sample</p>' +
      '<h2 class="zg-title">Rare <em>Event</em></h2>' +
      '<p class="zg-lead">Pilot Atombot through matter in extremes. Catch the rare events before they fade, and keep clear of the atoms.</p>' +
      '<ul class="zg-how">' +
        '<li>' + DOT_ATOM + '<span><b>Atoms</b> cost one integrity each. The sample keeps changing state: liquid, crystal, gas, glass.</span></li>' +
        '<li>' + DOT_EVENT + '<span><b>Rare events</b> score. Catch several in a row to raise the multiplier.</span></li>' +
        '<li>' + DOT_HILL + '<span><b>Bias hills</b> push the atoms away for a few seconds. Every five events earns one.</span></li>' +
      "</ul>" +
      '<p class="zg-controls zg-controls--keys"><span><b>Move</b> mouse or WASD</span><span><b>Bias hill</b> click or Space</span><span><b>Pause</b> P</span></p>' +
      '<p class="zg-controls zg-controls--touch"><span><b>Move</b> drag anywhere</span><span><b>Bias hill</b> second finger or the bias button</span></p>' +
      '<div class="zg-actions">' +
        '<button class="btn btn--solid" type="button" data-start>Start run <span class="arrow" aria-hidden="true">&rarr;</span></button>' +
        '<button class="btn" type="button" data-close>Back to the site</button>' +
      "</div>" +
      '<p class="zg-best" data-best></p>' +
      "</div>" +
      BOARD_HTML +
    "</div>" +
    '<div class="zgame-panel zgame-panel--small" data-panel="pause" hidden>' +
      '<p class="label">Run on hold</p>' +
      '<h2 class="zg-title">Paused</h2>' +
      '<div class="zg-actions">' +
        '<button class="btn btn--solid" type="button" data-resume>Resume</button>' +
        '<button class="btn" type="button" data-close>Back to the site</button>' +
      "</div>" +
    "</div>" +
    '<div class="zgame-panel zgame-panel--wide" data-panel="over" hidden>' +
      '<div class="zg-main">' +
      '<p class="label">Run complete &middot; your rank</p>' +
      '<h2 class="zg-title" data-rank></h2>' +
      '<p class="zg-lead" data-rank-note></p>' +
      '<dl class="zg-stats">' +
        "<div><dt>Score</dt><dd data-score>0</dd></div>" +
        "<div><dt>Events</dt><dd data-caught>0</dd></div>" +
        "<div><dt>Best streak</dt><dd data-streak>0</dd></div>" +
        '<div><dt>Survived</dt><dd><span data-time>0</span><span class="zg-unit">s</span></dd></div>' +
      "</dl>" +
      '<p class="zg-best" data-best-over></p>' +
      '<form class="zg-post" data-post novalidate>' +
        '<p class="zg-post-title">Post your score</p>' +
        '<div class="zg-fields">' +
          '<label><span>Name</span><input name="name" type="text" maxlength="20" autocomplete="nickname" spellcheck="false" required></label>' +
          '<label class="zg-field-email"><span>Email <i>optional</i></span><input name="email" type="email" maxlength="80" autocomplete="email" spellcheck="false"></label>' +
        "</div>" +
        '<div class="zg-post-row">' +
          '<button class="btn btn--small" type="submit">Post score</button>' +
          '<p class="zg-post-status" data-post-status role="status"></p>' +
        "</div>" +
        '<p class="zg-post-note" data-post-note></p>' +
      "</form>" +
      '<div class="zg-actions">' +
        '<button class="btn btn--solid" type="button" data-start>Run again <span class="arrow" aria-hidden="true">&rarr;</span></button>' +
        '<button class="btn" type="button" data-close>Back to the site</button>' +
      "</div>" +
      "</div>" +
      BOARD_HTML +
    "</div>";

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const ease = (v) => {
    const t = clamp(v, 0, 1);
    return t * t * (3 - 2 * t);
  };
  const rand = (a, b) => a + Math.random() * (b - a);

  const readBest = () => {
    try {
      return Math.max(0, parseInt(localStorage.getItem(BEST_KEY), 10) || 0);
    } catch (e) {
      return 0;
    }
  };
  const writeBest = (value) => {
    try {
      localStorage.setItem(BEST_KEY, String(value));
    } catch (e) {
      /* storage unavailable: the best score lasts for this visit only */
    }
  };

  /* Leaderboard --------------------------------------------------------------- */

  const boardConfig = () => Object.assign({ form: "", fields: {}, scores: "" }, window.ZLAB_LEADERBOARD || {});
  const sharesBoard = () => {
    const config = boardConfig();
    return Boolean(config.form && config.fields && config.fields.name && config.fields.score);
  };
  const cleanName = (value) =>
    String(value == null ? "" : value)
      .replace(/[\u0000-\u001f\u007f<>]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 20);
  const validRow = (row) => row.name.length >= 2 && Number.isFinite(row.score) && row.score > 0 && row.score <= MAX_SCORE;
  const byScore = (a, b) => b.score - a.score || a.name.localeCompare(b.name);
  const toRow = (name, score) => ({ name: cleanName(name), score: Math.round(Number(score)) });
  const sameScore = (a) => (b) => a.name === b.name && a.score === b.score;

  /*
   * The scores posted from this device, best first. Each one remembers when it was posted (at),
   * whether its request to the shared leaderboard left (sent), and whether the shared list has
   * shown it since (seen).
   */
  let unsaved = null; /* the rows, held here once storage has refused them */

  function deviceRows() {
    if (unsaved) return unsaved.slice();
    try {
      const rows = JSON.parse(localStorage.getItem(BOARD_KEY) || "[]");
      if (!Array.isArray(rows)) return [];
      return rows
        .map((r) => Object.assign(toRow(r && r.name, r && r.score), { at: Number(r && r.at) || 0, sent: Boolean(r && r.sent), seen: Boolean(r && r.seen) }))
        .filter(validRow)
        .sort(byScore);
    } catch (e) {
      return [];
    }
  }

  /* Sent to the shared leaderboard a short while ago, and its list has not shown it yet. */
  const awaited = (row) => row.sent && !row.seen && Math.abs(Date.now() - row.at) < AWAIT_MS;

  /* Keeps the device's top scores, plus any the shared list still has to catch up with. */
  function saveDevice(rows) {
    const top = rows.slice().sort(byScore).slice(0, BOARD_SIZE);
    const kept = rows.filter((row) => top.includes(row) || awaited(row));
    try {
      localStorage.setItem(BOARD_KEY, JSON.stringify(kept));
      unsaved = null;
    } catch (e) {
      unsaved = kept; /* storage unavailable: the scores last for this visit only */
    }
  }

  /* Adds a posted score, or replaces it if it is already kept. */
  function keepOnDevice(row) {
    const rows = deviceRows().filter((old) => !(old.at === row.at && sameScore(old)(row)));
    rows.push(row);
    saveDevice(rows);
  }

  const readName = () => {
    try {
      return cleanName(localStorage.getItem(NAME_KEY));
    } catch (e) {
      return "";
    }
  };
  const writeName = (name) => {
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch (e) {
      /* storage unavailable */
    }
  };

  /* A small CSV reader: commas, quoted cells, doubled quotes inside them. */
  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    const endRow = () => {
      row.push(cell);
      cell = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
    };
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c !== '"') cell += c;
        else if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else if (c === '"') quoted = true;
      else if (c === ",") {
        row.push(cell);
        cell = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        endRow();
      } else cell += c;
    }
    endRow();
    return rows;
  }

  /* Kept between openings of the game on the same page. rows is the shared list as last loaded. */
  const board = { rows: [], shared: false, failed: false, loaded: false };

  function loadBoard() {
    const config = boardConfig();
    if (!config.scores) {
      board.rows = [];
      board.shared = false;
      board.failed = false;
      board.loaded = true;
      return Promise.resolve();
    }
    return fetch(config.scores, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("leaderboard " + res.status);
        return res.text();
      })
      .then((text) => {
        const table = parseCsv(text);
        const head = (table[0] || []).map((value) => value.trim().toLowerCase());
        const named = head.includes("name") && head.includes("score");
        const nameAt = named ? head.indexOf("name") : 0;
        const scoreAt = named ? head.indexOf("score") : 1;
        board.rows = table
          .slice(named ? 1 : 0)
          .map((cells) => toRow(cells[nameAt], cells[scoreAt]))
          .filter(validRow)
          .sort(byScore);
        board.shared = true;
        board.failed = false;
        /* From here on the shared list speaks for the scores of this device that it shows. */
        const own = deviceRows();
        const arrived = own.filter((row) => !row.seen && board.rows.some(sameScore(row)));
        for (const row of arrived) row.seen = true;
        if (arrived.length) saveDevice(own);
      })
      .catch(() => {
        board.rows = [];
        board.shared = false;
        board.failed = true;
      })
      .then(() => {
        board.loaded = true;
      });
  }

  /* Scores this device sent that the shared list does not show yet. */
  function awaitedRows() {
    if (!board.loaded || !board.shared) return [];
    return deviceRows().filter((row) => awaited(row) && !board.rows.some(sameScore(row)));
  }

  /* The list to show: the shared one plus this device's scores it has yet to catch up with, or the device's own. */
  function boardRows() {
    if (!board.loaded) return [];
    if (!board.shared) return deviceRows();
    return board.rows.concat(awaitedRows()).sort(byScore);
  }

  /* A page that is going away drops its unfinished requests, which looks like a failed send but is not one. */
  let leaving = false;
  window.addEventListener("pagehide", () => {
    leaving = true;
  });
  window.addEventListener("pageshow", () => {
    leaving = false;
  });

  /* Resolves true once sent to the shared leaderboard, false if that failed, null if there is none. */
  function postScore(entry) {
    const shared = sharesBoard();
    /* kept before the request settles, so the score survives a refresh made right after posting */
    const row = Object.assign(toRow(entry.name, entry.score), { at: Date.now(), sent: shared, seen: false });
    keepOnDevice(row);
    if (!shared) return Promise.resolve(null);
    const config = boardConfig();
    const fields = config.fields;
    const body = new URLSearchParams();
    body.set(fields.name, row.name);
    body.set(fields.score, String(row.score));
    if (fields.email && entry.email) body.set(fields.email, entry.email);
    if (fields.events) body.set(fields.events, String(entry.events));
    if (fields.streak) body.set(fields.streak, String(entry.streak));
    if (fields.seconds) body.set(fields.seconds, String(entry.seconds));
    /*
     * The form sends no cross-origin headers, so its reply cannot be read: a request that left is all
     * that can be known. keepalive lets it finish if the page is refreshed or closed meanwhile.
     */
    return fetch(config.form, { method: "POST", mode: "no-cors", body, keepalive: true }).then(
      () => true,
      () => {
        if (leaving) return true;
        row.sent = false;
        keepOnDevice(row);
        return false;
      }
    );
  }

  function createGame(options) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const listeners = new AbortController();
    const on = (target, type, fn, opts) => target.addEventListener(type, fn, Object.assign({ signal: listeners.signal }, opts || {}));
    const returnFocus = document.activeElement;

    const root = document.createElement("div");
    root.className = "zgame" + (options && options.view === "board" ? " zgame--board" : "");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Rare Event, a game");
    root.tabIndex = -1;
    root.innerHTML = TEMPLATE;

    const $ = (sel) => root.querySelector(sel);
    const canvas = $(".zgame-canvas");
    const ctx = canvas.getContext("2d");
    const topBar = $(".zgame-top");
    const biasBtn = $("[data-bias]");
    const cueEl = $("[data-cue]");
    const panels = { start: $('[data-panel="start"]'), pause: $('[data-panel="pause"]'), over: $('[data-panel="over"]') };
    const hud = {
      n: $("[data-n]"), state: $("[data-state]"), clock: $("[data-clock]"), events: $("[data-events]"),
      mult: $("[data-mult]"), pips: $("[data-integrity]"), charges: $(".zg-charges"),
    };
    const shown = {}; /* last value written to each HUD field */

    let mark = null; /* the Atombot mark in ink, once the image has loaded */
    const markImg = new Image();
    markImg.decoding = "async";
    markImg.onload = () => {
      const c = document.createElement("canvas");
      c.width = 192;
      c.height = Math.round((192 * markImg.naturalHeight) / markImg.naturalWidth);
      const x = c.getContext("2d");
      x.drawImage(markImg, 0, 0, c.width, c.height);
      x.globalCompositeOperation = "source-in";
      x.fillStyle = INK;
      x.fillRect(0, 0, c.width, c.height);
      mark = c;
    };
    markImg.src = MARK_URL;

    /* ---- state ---------------------------------------------------------- */

    let W = 0;
    let H = 0;
    let dpr = 1;
    let u = 1; /* size unit in CSS px */
    const arena = { x0: 0, y0: 0, x1: 0, y1: 0 };
    let keepOut = null; /* corner covered by the bias button: no events spawn there */
    let bg = null;

    let mode = "start"; /* start | play | pause | over */
    let raf = 0;
    let last = 0;
    let acc = 0;
    let clock = 0; /* simulation time, seconds */
    let slowT = 0; /* brief slow motion after a hit */
    let dying = 0; /* seconds left before the end screen */
    let fps = 60;
    let destroyed = false;

    const f32 = () => new Float32Array(MAX_ATOMS);
    const ax = f32(), ay = f32(), vx = f32(), vy = f32();
    const gx = f32(), gy = f32(); /* lattice site, glass anchor, or gas heading */
    const hx = f32(), hy = f32(), hop = f32(); /* glass hop: target and progress (-1 when resting) */
    const seed = f32(), fade = f32();
    const late = new Uint8Array(MAX_ATOMS); /* 1 when a glass atom follows a neighbor's hop */
    let n = 0;

    let matter = "liquid";
    let matterT = 0;
    let cycle = 0;
    let speedMul = 1;
    let cueOn = false;
    let cueUntil = 0;
    let heat = 0; /* drawn temperature: -1 glass ... +1 gas */
    let order = 0; /* 0..1, how crystalline the sample looks */
    let lattice = null; /* { a, sites, rows } prepared during the warning */
    let bonds = [];
    let wave = { qx: 0, qy: 0, px: 0, py: 0, amp: 0, w: 0 };
    let anchored = false;
    let hopTimer = 0;

    const player = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, angle: 0, invuln: 0, alive: false, trail: 0 };
    let control = "pointer";
    let pointerKind = "mouse";
    const keys = { up: false, down: false, left: false, right: false };
    let touchId = null;
    let touch0 = null;

    let integrity = INTEGRITY;
    let charges = 1;
    let events = 0;
    let score = 0;
    let streak = 0;
    let bestStreak = 0;
    let mult = 1;
    let runTime = 0;
    let best = readBest();

    let sparks = [];
    let hills = [];
    let rings = [];
    let parts = [];
    let texts = [];
    let sparkTimer = 0;
    const beam = { on: false, y: 0, h: 0, t: 0, life: 7, timer: 17 };
    let shake = 0;
    let flash = 0;

    /* ---- layout --------------------------------------------------------- */

    function layout() {
      W = root.clientWidth;
      H = root.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      u = clamp(Math.sqrt(W * H) / 1050, 0.66, 1.12);
      const origin = root.getBoundingClientRect();
      const pad = Math.round(clamp(W * 0.012, 8, 18));
      arena.x0 = pad;
      arena.y0 = Math.round(topBar.getBoundingClientRect().bottom - origin.top + 10);
      arena.x1 = W - pad;
      arena.y1 = H - pad;
      const b = biasBtn.getBoundingClientRect();
      keepOut = { x: b.left - origin.left - 24, y: b.top - origin.top - 24 };
      buildBackground();
      const r = ATOM_R * u;
      for (let i = 0; i < n; i++) {
        ax[i] = clamp(ax[i], arena.x0 + r, arena.x1 - r);
        ay[i] = clamp(ay[i], arena.y0 + r, arena.y1 - r);
        gx[i] = matter === "gas" ? gx[i] : clamp(gx[i], arena.x0 + r, arena.x1 - r);
        gy[i] = matter === "gas" ? gy[i] : clamp(gy[i], arena.y0 + r, arena.y1 - r);
      }
      if (matter === "crystal" || (cueOn && MATTER[matter].next === "crystal")) {
        prepareLattice();
        if (matter === "crystal") assignLattice();
      }
      player.x = clamp(player.x, arena.x0, arena.x1);
      player.y = clamp(player.y, arena.y0, arena.y1);
      player.tx = clamp(player.tx, arena.x0, arena.x1);
      player.ty = clamp(player.ty, arena.y0, arena.y1);
      for (const s of sparks) {
        s.x = clamp(s.x, arena.x0 + 30 * u, arena.x1 - 30 * u);
        s.y = clamp(s.y, arena.y0 + 30 * u, arena.y1 - 30 * u);
      }
      /* the sample was just squeezed into a new shape (a rotated phone): do not punish that */
      if (mode === "play") player.invuln = Math.max(player.invuln, 1.6);
    }

    /* Paper, with a faint dot grid inside the sample cell, like graph paper. */
    function buildBackground() {
      bg = document.createElement("canvas");
      bg.width = canvas.width;
      bg.height = canvas.height;
      const c = bg.getContext("2d");
      c.scale(dpr, dpr);
      c.fillStyle = "#ffffff";
      c.fillRect(0, 0, W, H);
      c.fillStyle = "#d3d6da";
      const cell = 46 * u;
      for (let y = arena.y0 + cell / 2; y < arena.y1; y += cell) {
        for (let x = arena.x0 + cell / 2; x < arena.x1; x += cell) c.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
      }
    }

    /* ---- atoms ---------------------------------------------------------- */

    function targetCount() {
      const area = (arena.x1 - arena.x0) * (arena.y1 - arena.y0);
      const s = Math.max(MIN_SPACING, SPACING * Math.pow(0.93, cycle)) * u;
      return clamp(Math.round(area / (s * s)), 16, MAX_ATOMS);
    }

    function seedAtoms() {
      n = targetCount();
      const w = arena.x1 - arena.x0;
      const h = arena.y1 - arena.y0;
      const cols = Math.max(1, Math.round(Math.sqrt((n * w) / h)));
      const rows = Math.ceil(n / cols);
      for (let i = 0; i < n; i++) {
        const c = i % cols;
        const r = Math.floor(i / cols);
        ax[i] = arena.x0 + ((c + 0.5 + rand(-0.36, 0.36)) * w) / cols;
        ay[i] = arena.y0 + ((r + 0.5 + rand(-0.36, 0.36)) * h) / rows;
        vx[i] = vy[i] = 0;
        gx[i] = ax[i];
        gy[i] = ay[i];
        hop[i] = -1;
        seed[i] = Math.random();
        fade[i] = 1;
      }
    }

    /* New atoms condense at the edge of the sample, away from the player, and fade in. */
    function addAtoms(count) {
      for (let k = 0; k < count && n < MAX_ATOMS; k++) {
        let x = 0;
        let y = 0;
        for (let tries = 0; tries < 12; tries++) {
          const side = Math.floor(Math.random() * 4);
          const inset = rand(14, 60) * u;
          x = side === 0 ? arena.x0 + inset : side === 1 ? arena.x1 - inset : rand(arena.x0, arena.x1);
          y = side === 2 ? arena.y0 + inset : side === 3 ? arena.y1 - inset : rand(arena.y0, arena.y1);
          if (Math.hypot(x - player.x, y - player.y) > 220 * u) break;
        }
        const i = n++;
        ax[i] = gx[i] = x;
        ay[i] = gy[i] = y;
        vx[i] = vy[i] = 0;
        hop[i] = -1;
        seed[i] = Math.random();
        fade[i] = 0;
      }
    }

    /* A hexagonal lattice with one site per atom; the few sites left over stay empty (vacancies). */
    function prepareLattice() {
      const m = 30 * u;
      const w = arena.x1 - arena.x0 - 2 * m;
      const h = arena.y1 - arena.y0 - 2 * m;
      const build = (a) => {
        const rowH = a * 0.866;
        const nRows = Math.max(1, Math.floor(h / rowH) + 1);
        const cols = Math.max(2, Math.floor(w / a) + 1);
        const x0 = arena.x0 + m + (w - (cols - 1) * a) / 2;
        const y0 = arena.y0 + m + (h - (nRows - 1) * rowH) / 2;
        const rows = [];
        let count = 0;
        for (let r = 0; r < nRows; r++) {
          const odd = r % 2 === 1;
          const row = [];
          for (let c = 0; c < (odd ? cols - 1 : cols); c++) row.push({ x: x0 + (odd ? a / 2 : 0) + c * a, y: y0 + r * rowH });
          rows.push(row);
          count += row.length;
        }
        return { a, rows, count };
      };
      /* the widest spacing whose site count is closest to (and at least) the number of atoms */
      const a0 = Math.sqrt((w * h) / (n * 0.866));
      let best = null;
      for (let f = 1.3; f > 0.5 && !(best && best.count === n); f -= 0.004) {
        const cand = build(a0 * f);
        if (cand.count >= n && (!best || cand.count < best.count)) best = cand;
      }
      if (!best) best = build(a0 * 0.5);
      let extra = best.count - n;
      for (let guard = 0; extra > 0 && guard < 4000; guard++) {
        const row = best.rows[Math.floor(Math.random() * best.rows.length)];
        const c = Math.floor(Math.random() * row.length);
        const crowded = (row[c - 1] && row[c - 1].empty) || (row[c + 1] && row[c + 1].empty);
        if (row[c].empty || (crowded && guard < 3000)) continue;
        row[c].empty = true;
        extra--;
      }
      const rows = best.rows.map((row) => row.filter((site) => !site.empty));
      lattice = { a: best.a, rows, sites: rows.flat() };
    }

    /* Give every atom the site that keeps its travel short: bands by height, then left to right. */
    function assignLattice() {
      if (!lattice) prepareLattice();
      const idx = Array.from({ length: n }, (_, i) => i).sort((p, q) => ay[p] - ay[q]);
      const siteOf = new Int16Array(n);
      let at = 0;
      let s = 0;
      for (const row of lattice.rows) {
        const band = idx.slice(at, at + row.length).sort((p, q) => ax[p] - ax[q]);
        for (let c = 0; c < band.length; c++) {
          gx[band[c]] = row[c].x;
          gy[band[c]] = row[c].y;
          siteOf[band[c]] = s + c;
        }
        at += row.length;
        s += row.length;
      }
      bonds = [];
      const reach2 = (lattice.a * 1.1) ** 2;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const dx = gx[i] - gx[j];
          const dy = gy[i] - gy[j];
          if (dx * dx + dy * dy < reach2) bonds.push(i, j);
        }
      }
      const ang = rand(0, Math.PI * 2);
      const q = (Math.PI * 2) / (lattice.a * 4.6);
      const pol = ang + (Math.random() < 0.5 ? 0 : Math.PI / 2); /* longitudinal or transverse */
      wave = {
        qx: Math.cos(ang) * q, qy: Math.sin(ang) * q, px: Math.cos(pol), py: Math.sin(pol),
        amp: lattice.a * Math.min(0.27, 0.14 + 0.035 * cycle), w: 2.1 * speedMul,
      };
    }

    function enterMatter(name) {
      const from = matter;
      matter = name;
      matterT = 0;
      cueOn = false;
      if (name === "liquid" && from === "glass") {
        cycle++;
        speedMul = Math.min(2, 1 + 0.14 * cycle);
        addAtoms(targetCount() - n);
      }
      if (name === "crystal") assignLattice();
      if (name === "gas") {
        for (let i = 0; i < n; i++) {
          const a = rand(0, Math.PI * 2);
          gx[i] = Math.cos(a);
          gy[i] = Math.sin(a);
        }
      }
      if (name === "glass") {
        anchored = false;
        hopTimer = 1.3;
      }
      for (let i = 0; i < n; i++) hop[i] = -1;
      if (mode === "play") {
        showCue(name, cycle === 0 ? MATTER[name].tip : "", cycle === 0 ? 3 : 1.3);
        if (!reduce) {
          /* a front sweeps through the sample as it changes state */
          const tint = { liquid: "124,200,255", crystal: "190,228,255", gas: "255,222,140", glass: "128,156,196" }[name];
          rings.push({ x: (arena.x0 + arena.x1) / 2, y: (arena.y0 + arena.y1) / 2, t: 0, life: 1.25, r0: 0, r1: Math.hypot(W, H) * 0.62, color: tint, width: 3 });
        }
      }
    }

    function startHop() {
      const p = player;
      let i = -1;
      let tx = 0;
      let ty = 0;
      if (p.alive && Math.random() < 0.42) {
        /* the nearest resting atom jumps at where Atombot is now */
        let bestD = (250 * u) ** 2;
        for (let k = 0; k < n; k++) {
          if (hop[k] >= 0 || fade[k] < 0.9) continue;
          const d = (gx[k] - p.x) ** 2 + (gy[k] - p.y) ** 2;
          if (d < bestD && d > (60 * u) ** 2) {
            bestD = d;
            i = k;
          }
        }
        if (i >= 0) {
          tx = p.x;
          ty = p.y;
        }
      }
      if (i < 0) {
        i = Math.floor(Math.random() * n);
        if (hop[i] >= 0 || fade[i] < 0.9) return;
        const a = rand(0, Math.PI * 2);
        const d = rand(110, 210) * u;
        tx = gx[i] + Math.cos(a) * d;
        ty = gy[i] + Math.sin(a) * d;
      }
      const r = ATOM_R * u;
      hx[i] = clamp(tx, arena.x0 + r, arena.x1 - r);
      hy[i] = clamp(ty, arena.y0 + r, arena.y1 - r);
      hop[i] = 0;
      late[i] = 0;
      if (cycle >= 1) {
        /* later on, a neighbor follows into the cage that was just vacated */
        let j = -1;
        let bestD = (170 * u) ** 2;
        for (let k = 0; k < n; k++) {
          if (k === i || hop[k] >= 0 || fade[k] < 0.9) continue;
          const d = (gx[k] - gx[i]) ** 2 + (gy[k] - gy[i]) ** 2;
          if (d < bestD) {
            bestD = d;
            j = k;
          }
        }
        if (j >= 0) {
          hx[j] = gx[i];
          hy[j] = gy[i];
          hop[j] = 0;
          late[j] = 1; /* same flash, a slightly later move */
        }
      }
    }

    function stepAtoms(dt) {
      const def = MATTER[matter];
      const tm = matterT;
      const r = ATOM_R * u;
      const x0 = arena.x0 + r;
      const x1 = arena.x1 - r;
      const y0 = arena.y0 + r;
      const y1 = arena.y1 - r;
      heat += (def.heat - heat) * Math.min(1, dt * 2.4);
      order += ((matter === "crystal" ? 1 : 0) - order) * Math.min(1, dt * (matter === "crystal" ? 1.5 : 4.5));

      if (matter === "liquid") {
        const k = (Math.PI * 2) / (560 * u);
        const sp = 58 * u * speedMul;
        const t = clock;
        const m = 46 * u;
        const rate = Math.min(1, dt * 2.6);
        for (let i = 0; i < n; i++) {
          const x = ax[i];
          const y = ay[i];
          /* velocity from a stream function, so the flow swirls without piling atoms up */
          const a1 = k * x + 0.31 * t;
          const b1 = 0.9 * k * y + 0.23 * t;
          const a2 = 1.3 * k * x + 0.27 * t + 0.7;
          const b2 = 1.6 * k * y - 0.19 * t + 1.3;
          let fx = sp * (0.9 * Math.sin(a1) * Math.cos(b1) + 0.88 * Math.sin(a2) * Math.cos(b2));
          let fy = -sp * (Math.cos(a1) * Math.sin(b1) + 0.715 * Math.cos(a2) * Math.sin(b2));
          if (x < arena.x0 + m) fx += sp * 1.7 * (1 - (x - arena.x0) / m);
          else if (x > arena.x1 - m) fx -= sp * 1.7 * (1 - (arena.x1 - x) / m);
          if (y < arena.y0 + m) fy += sp * 1.7 * (1 - (y - arena.y0) / m);
          else if (y > arena.y1 - m) fy -= sp * 1.7 * (1 - (arena.y1 - y) / m);
          vx[i] += (fx - vx[i]) * rate;
          vy[i] += (fy - vy[i]) * rate;
        }
        const r0 = 44 * u;
        const r02 = r0 * r0;
        const push = 170 * u * dt;
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            const dx = ax[j] - ax[i];
            if (dx > r0 || dx < -r0) continue;
            const dy = ay[j] - ay[i];
            const d2 = dx * dx + dy * dy;
            if (d2 >= r02 || d2 < 1e-6) continue;
            const d = Math.sqrt(d2);
            const f = ((1 - d / r0) * push) / d;
            vx[i] -= dx * f;
            vy[i] -= dy * f;
            vx[j] += dx * f;
            vy[j] += dy * f;
          }
        }
        for (let i = 0; i < n; i++) {
          ax[i] += vx[i] * dt;
          ay[i] += vy[i] * dt;
        }
      } else if (matter === "crystal") {
        const stiff = 44 * ease(tm / 2) + 1.2; /* the order sets in gently, so the settling atoms can be dodged */
        const swing = ease((tm - 1.6) / 1.6);
        const cap = 170 * u;
        for (let i = 0; i < n; i++) {
          const ph = Math.sin(wave.qx * gx[i] + wave.qy * gy[i] - wave.w * clock) * wave.amp * swing;
          vx[i] += ((gx[i] + wave.px * ph - ax[i]) * stiff - vx[i] * 9) * dt;
          vy[i] += ((gy[i] + wave.py * ph - ay[i]) * stiff - vy[i] * 9) * dt;
          const s = Math.hypot(vx[i], vy[i]);
          if (s > cap) {
            vx[i] *= cap / s;
            vy[i] *= cap / s;
          }
          ax[i] += vx[i] * dt;
          ay[i] += vy[i] * dt;
        }
      } else if (matter === "gas") {
        const vg = 175 * u * speedMul * ease(tm / 1.4);
        const rate = Math.min(1, dt * 4);
        for (let i = 0; i < n; i++) {
          vx[i] += (gx[i] * vg - vx[i]) * rate;
          vy[i] += (gy[i] * vg - vy[i]) * rate;
          ax[i] += vx[i] * dt;
          ay[i] += vy[i] * dt;
          if ((ax[i] < x0 && gx[i] < 0) || (ax[i] > x1 && gx[i] > 0)) {
            gx[i] = -gx[i];
            vx[i] = -vx[i];
          }
          if ((ay[i] < y0 && gy[i] < 0) || (ay[i] > y1 && gy[i] > 0)) {
            gy[i] = -gy[i];
            vy[i] = -vy[i];
          }
        }
      } else {
        /* glass: a fast quench, then every atom rattles in its cage until a rare hop */
        if (!anchored) {
          const keep = Math.max(0, 1 - dt * 7);
          for (let i = 0; i < n; i++) {
            vx[i] *= keep;
            vy[i] *= keep;
            ax[i] += vx[i] * dt;
            ay[i] += vy[i] * dt;
          }
          if (tm >= 0.6) {
            anchored = true;
            for (let i = 0; i < n; i++) {
              gx[i] = clamp(ax[i], x0, x1);
              gy[i] = clamp(ay[i], y0, y1);
              vx[i] = vy[i] = 0;
            }
          }
        } else {
          hopTimer -= dt;
          if (hopTimer <= 0 && tm < def.secs - 0.5) {
            startHop();
            hopTimer = rand(0.65, 1.1) / (speedMul * (1 + 0.2 * cycle));
          }
          for (let i = 0; i < n; i++) {
            const s1 = seed[i];
            let jig = 1.3 * u;
            if (hop[i] >= 0) {
              hop[i] += dt;
              const start = HOP_FLASH + (late[i] ? 0.16 : 0);
              if (hop[i] >= start + HOP_MOVE) {
                gx[i] = hx[i];
                gy[i] = hy[i];
                hop[i] = -1;
              } else if (hop[i] > start) {
                const s = ease((hop[i] - start) / HOP_MOVE);
                ax[i] = gx[i] + (hx[i] - gx[i]) * s;
                ay[i] = gy[i] + (hy[i] - gy[i]) * s;
                continue;
              } else {
                jig = (1.3 + 3.2 * (hop[i] / start)) * u;
              }
            }
            ax[i] = gx[i] + Math.sin(clock * 31 + s1 * 40) * jig;
            ay[i] = gy[i] + Math.cos(clock * 27 + s1 * 71) * jig;
          }
        }
      }

      /* bias hills (and the shock after a hit) push atoms outward */
      for (const hill of hills) {
        const R = hill.r;
        const R2 = R * R;
        const left = hill.life - hill.t;
        const mv = hill.push * Math.min(1, left / (hill.life * 0.25)) * dt;
        for (let i = 0; i < n; i++) {
          const dx = ax[i] - hill.x;
          const dy = ay[i] - hill.y;
          const d2 = dx * dx + dy * dy;
          if (d2 >= R2) continue;
          const d = Math.sqrt(d2) || 1;
          const nx = dx / d;
          const ny = dy / d;
          const s = (1 - d / R) * mv;
          ax[i] += nx * s;
          ay[i] += ny * s;
          if (matter === "glass" && anchored) {
            gx[i] = clamp(gx[i] + nx * s, x0, x1);
            gy[i] = clamp(gy[i] + ny * s, y0, y1);
          } else if (matter === "gas") {
            const dot = gx[i] * nx + gy[i] * ny;
            if (dot < 0) {
              const speed = Math.hypot(vx[i], vy[i]);
              gx[i] -= 2 * dot * nx;
              gy[i] -= 2 * dot * ny;
              vx[i] = gx[i] * speed;
              vy[i] = gy[i] * speed;
            }
          }
        }
      }

      for (let i = 0; i < n; i++) {
        if (ax[i] < x0) ax[i] = x0;
        else if (ax[i] > x1) ax[i] = x1;
        if (ay[i] < y0) ay[i] = y0;
        else if (ay[i] > y1) ay[i] = y1;
        if (fade[i] < 1) fade[i] = Math.min(1, fade[i] + dt / 1.6);
      }
    }

    /* ---- player, events, hills ------------------------------------------ */

    function stepPlayer(dt) {
      const p = player;
      if (!p.alive) return;
      let wantX;
      let wantY;
      if (control === "keys") {
        const dx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
        const dy = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
        const l = Math.hypot(dx, dy) || 1;
        wantX = (dx / l) * 440 * u;
        wantY = (dy / l) * 440 * u;
      } else {
        wantX = (p.tx - p.x) * 11;
        wantY = (p.ty - p.y) * 11;
        const s = Math.hypot(wantX, wantY);
        const cap = 860 * u;
        if (s > cap) {
          wantX *= cap / s;
          wantY *= cap / s;
        }
      }
      const rate = Math.min(1, dt * 16);
      p.vx += (wantX - p.vx) * rate;
      p.vy += (wantY - p.vy) * rate;
      const m = 15 * u;
      p.x = clamp(p.x + p.vx * dt, arena.x0 + m, arena.x1 - m);
      p.y = clamp(p.y + p.vy * dt, arena.y0 + m, arena.y1 - m);
      const speed = Math.hypot(p.vx, p.vy);
      p.angle += dt * (1.1 + speed / (85 * u));
      if (p.invuln > 0) p.invuln -= dt;
      p.trail -= dt;
      if (p.trail <= 0 && speed > 70 * u) {
        p.trail = 0.028;
        parts.push({ x: p.x + rand(-3, 3) * u, y: p.y + rand(-3, 3) * u, vx: -p.vx * 0.08, vy: -p.vy * 0.08, t: 0, life: 0.5, size: 3.4 * u, color: MAIZE });
      }

      if (p.invuln <= 0) {
        const reach2 = ((ATOM_R + PLAYER_R) * u) ** 2;
        for (let i = 0; i < n; i++) {
          if (fade[i] < 0.75) continue;
          const dx = ax[i] - p.x;
          const dy = ay[i] - p.y;
          if (dx * dx + dy * dy < reach2) {
            hit();
            break;
          }
        }
      }
    }

    function burst(x, y, color, count, speed) {
      for (let k = 0; k < count; k++) {
        const a = rand(0, Math.PI * 2);
        const s = rand(0.25, 1) * speed * u;
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: rand(0.35, 0.8), size: rand(1.6, 3.2) * u, color });
      }
      if (parts.length > 420) parts.splice(0, parts.length - 420);
    }

    function hit() {
      const p = player;
      integrity--;
      streak = 0;
      mult = 1;
      p.invuln = 1.8;
      hills.push({ x: p.x, y: p.y, t: 0, life: 0.55, r: 150 * u, push: 780 * u, kind: "shock" });
      rings.push({ x: p.x, y: p.y, t: 0, life: 0.5, r0: 14 * u, r1: 150 * u, color: INK_RGB, width: 2.4 });
      burst(p.x, p.y, INK, 24, 300);
      if (!reduce) {
        shake = 0.32;
        flash = 1;
        slowT = 0.22;
      }
      if (integrity <= 0) {
        p.alive = false;
        dying = 1;
        burst(p.x, p.y, INK, 46, 420);
        rings.push({ x: p.x, y: p.y, t: 0, life: 0.9, r0: 10 * u, r1: 260 * u, color: INK_RGB, width: 3 });
      }
    }

    function dropHill() {
      const p = player;
      if (mode !== "play" || !p.alive) return;
      if (charges <= 0) {
        /* nothing left: a small grey fizzle instead of silence */
        rings.push({ x: p.x, y: p.y, t: 0, life: 0.28, r0: 12 * u, r1: 36 * u, color: "169,175,183", width: 1.6 });
        return;
      }
      charges--;
      hills.push({ x: p.x, y: p.y, t: 0, life: HILL_LIFE, r: HILL_R * u, push: 520 * u, kind: "bias" });
      rings.push({ x: p.x, y: p.y, t: 0, life: 0.45, r0: 12 * u, r1: HILL_R * u, color: INK_RGB, width: 2 });
      p.invuln = Math.max(p.invuln, 0.3);
    }

    function spawnSpark() {
      const p = player;
      const m = 34 * u;
      for (let tries = 0; tries < 16; tries++) {
        let x;
        let y;
        if (matter === "crystal" && lattice && order > 0.6) {
          const s = lattice.sites[Math.floor(Math.random() * lattice.sites.length)];
          x = s.x + lattice.a / 2;
          y = s.y + lattice.a * 0.289; /* the pocket between three neighbors */
        } else {
          x = rand(arena.x0 + m, arena.x1 - m);
          y = beam.on && Math.random() < 0.7 ? rand(beam.y + 14 * u, beam.y + beam.h - 14 * u) : rand(arena.y0 + m, arena.y1 - m);
        }
        if (x < arena.x0 + m || x > arena.x1 - m || y < arena.y0 + m || y > arena.y1 - m) continue;
        if (keepOut && x > keepOut.x && y > keepOut.y) continue;
        if (Math.hypot(x - p.x, y - p.y) < 150 * u) continue;
        let clear = true;
        const gap2 = (38 * u) ** 2;
        for (let i = 0; i < n && clear; i++) {
          const dx = ax[i] - x;
          const dy = ay[i] - y;
          if (dx * dx + dy * dy < gap2) clear = false;
        }
        if (!clear && tries < 12) continue;
        const life = Math.max(3.4, SPARK_LIFE - 0.25 * cycle);
        sparks.push({ x, y, life, max: life, age: 0, rot: rand(0, 6) });
        return;
      }
    }

    function catchSpark(s) {
      const inBeam = beam.on && s.y > beam.y && s.y < beam.y + beam.h;
      const gain = mult * (inBeam ? 2 : 1);
      score += gain;
      events++;
      streak++;
      bestStreak = Math.max(bestStreak, streak);
      mult = 1 + Math.min(4, Math.floor(streak / 3));
      burst(s.x, s.y, MAIZE, 18, 260);
      rings.push({ x: s.x, y: s.y, t: 0, life: 0.45, r0: 8 * u, r1: 50 * u, color: INK_RGB, width: 2 });
      texts.push({ x: s.x, y: s.y - 16 * u, text: "+" + gain, t: 0, life: 0.95, color: INK_RGB });
      if (events % EVENTS_PER_CHARGE === 0 && charges < MAX_CHARGES) {
        charges++;
        texts.push({ x: s.x, y: s.y + 22 * u, text: "bias hill +1", t: 0, life: 1.3, color: "61,70,82" });
      }
    }

    function stepWorld(dt) {
      const p = player;
      /* rare events */
      if (mode === "play" && p.alive) {
        sparkTimer -= dt;
        if (sparkTimer <= 0 && sparks.length < 3) {
          spawnSpark();
          sparkTimer = Math.max(0.95, 1.55 - 0.06 * cycle);
        }
      }
      const reach2 = (CATCH_R * u) ** 2;
      for (let k = sparks.length - 1; k >= 0; k--) {
        const s = sparks[k];
        s.age += dt;
        s.life -= dt;
        if (p.alive && (s.x - p.x) ** 2 + (s.y - p.y) ** 2 < reach2) {
          catchSpark(s);
          sparks.splice(k, 1);
        } else if (s.life <= 0) {
          burst(s.x, s.y, "#a9afb7", 6, 90);
          sparks.splice(k, 1);
        }
      }
      /* beamtime: a band where a catch counts double */
      if (mode === "play" && p.alive) {
        if (beam.on) {
          beam.t += dt;
          if (beam.t >= beam.life) {
            beam.on = false;
            beam.timer = rand(15, 21);
          }
        } else {
          beam.timer -= dt;
          if (beam.timer <= 0) {
            beam.on = true;
            beam.t = 0;
            beam.h = (arena.y1 - arena.y0) * 0.26;
            beam.y = rand(arena.y0 + 20 * u, arena.y1 - 20 * u - beam.h);
          }
        }
      }
      for (let k = hills.length - 1; k >= 0; k--) {
        hills[k].t += dt;
        if (hills[k].t >= hills[k].life) hills.splice(k, 1);
      }
      for (let k = rings.length - 1; k >= 0; k--) {
        rings[k].t += dt;
        if (rings[k].t >= rings[k].life) rings.splice(k, 1);
      }
      for (let k = parts.length - 1; k >= 0; k--) {
        const q = parts[k];
        q.t += dt;
        if (q.t >= q.life) {
          parts.splice(k, 1);
          continue;
        }
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.vx *= 1 - Math.min(1, dt * 2.6);
        q.vy *= 1 - Math.min(1, dt * 2.6);
      }
      for (let k = texts.length - 1; k >= 0; k--) {
        texts[k].t += dt;
        if (texts[k].t >= texts[k].life) texts.splice(k, 1);
      }
    }

    function step(dt) {
      clock += dt;
      if (mode === "play" && player.alive) {
        runTime += dt;
        matterT += dt;
        const def = MATTER[matter];
        if (!cueOn && matterT >= def.secs - CUE) {
          cueOn = true;
          if (def.next === "crystal") prepareLattice();
          showCue(def.cue, "then " + def.next, CUE);
        }
        if (matterT >= def.secs) enterMatter(def.next);
      } else {
        matterT += dt; /* behind a menu the liquid just keeps flowing */
      }
      stepPlayer(dt);
      stepAtoms(dt);
      stepWorld(dt);
    }

    /* ---- drawing -------------------------------------------------------- */

    const ink = (alpha) => "rgba(" + INK_RGB + "," + clamp(alpha, 0, 1).toFixed(3) + ")";
    const maize = (alpha) => "rgba(" + MAIZE_RGB + "," + clamp(alpha, 0, 1).toFixed(3) + ")";

    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.drawImage(bg, 0, 0, W, H);
      if (shake > 0) {
        const s = (shake / 0.32) * 7 * u;
        ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
      }
      const hot = clamp(heat, 0, 1);
      const cold = clamp(-heat, 0, 1);
      const cellW = arena.x1 - arena.x0;
      const cellH = arena.y1 - arena.y0;

      if (beam.on) {
        /* beamtime: a highlighted band, with neutrons streaming through it */
        const a = Math.min(1, beam.t / 0.5, (beam.life - beam.t) / 0.7);
        ctx.fillStyle = maize(0.2 * a);
        ctx.fillRect(arena.x0, beam.y, cellW, beam.h);
        ctx.strokeStyle = ink(0.4 * a);
        ctx.lineWidth = 1.2;
        ctx.lineCap = "round";
        ctx.beginPath();
        const span = cellW + 80;
        for (let k = 0; k < 26; k++) {
          const fx = (k * 0.6180339) % 1;
          const fy = (k * 0.7548777 + 0.13) % 1;
          const x = arena.x0 - 40 + ((fx * span + clock * (260 + 140 * fy) * u) % span);
          const y = beam.y + beam.h * (0.14 + 0.72 * fy);
          ctx.moveTo(clamp(x, arena.x0, arena.x1), y);
          ctx.lineTo(clamp(x + 16 * u, arena.x0, arena.x1), y);
        }
        ctx.stroke();
        ctx.lineCap = "butt";
        ctx.fillStyle = ink(a);
        ctx.font = "500 " + Math.round(11 * Math.max(u, 0.9)) + "px " + MONO;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText("Beamtime ×2", arena.x0 + 14 * u, beam.y + 9 * u);
      }

      /* during the warning before a crystal, the lattice sites show where the atoms will settle */
      if (cueOn && mode === "play" && MATTER[matter].next === "crystal" && lattice) {
        const a = ease((matterT - (MATTER[matter].secs - CUE)) / 0.6) * (0.4 + 0.1 * Math.sin(clock * 9));
        ctx.strokeStyle = ink(a);
        ctx.lineWidth = 1;
        ctx.beginPath();
        const rr = 6.5 * u;
        for (const s of lattice.sites) {
          ctx.moveTo(s.x + rr, s.y);
          ctx.arc(s.x, s.y, rr, 0, Math.PI * 2);
        }
        ctx.stroke();
      }

      /* a bias hill, drawn the way a map draws a hill: stepped tints and contour lines */
      for (const hill of hills) {
        if (hill.kind === "shock") continue;
        const left = hill.life - hill.t;
        const a = Math.min(1, hill.t / 0.2, left / 0.8);
        for (let k = 3; k >= 0; k--) {
          const r = hill.r * (0.28 + 0.24 * k) * (1 + 0.025 * Math.sin(clock * 5 - k * 1.3));
          ctx.beginPath();
          ctx.arc(hill.x, hill.y, r, 0, Math.PI * 2);
          ctx.fillStyle = maize(0.1 * a);
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = ink(a * (0.62 - 0.14 * k));
          ctx.stroke();
        }
      }

      if (order > 0.02 && bonds.length) {
        const far2 = (lattice.a * 1.45) ** 2;
        ctx.strokeStyle = ink(0.26 * order);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let k = 0; k < bonds.length; k += 2) {
          const i = bonds[k];
          const j = bonds[k + 1];
          if (i >= n || j >= n) continue;
          const dx = ax[i] - ax[j];
          const dy = ay[i] - ay[j];
          if (dx * dx + dy * dy > far2) continue;
          ctx.moveTo(ax[i], ay[i]);
          ctx.lineTo(ax[j], ay[j]);
        }
        ctx.stroke();
      }

      /* hot atoms leave a short stroke behind them */
      if (hot > 0.05) {
        ctx.strokeStyle = ink(0.42 * hot);
        ctx.lineWidth = 1.4 * u;
        ctx.lineCap = "round";
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          ctx.moveTo(ax[i] - vx[i] * 0.07, ay[i] - vy[i] * 0.07);
          ctx.lineTo(ax[i], ay[i]);
        }
        ctx.stroke();
        ctx.lineCap = "butt";
      }

      /* a glass atom about to hop shows where it is going */
      if (matter === "glass") {
        ctx.lineWidth = 1.3;
        for (let i = 0; i < n; i++) {
          if (hop[i] < 0) continue;
          const start = HOP_FLASH + (late[i] ? 0.16 : 0);
          const f = clamp(hop[i] / start, 0, 1);
          ctx.strokeStyle = ink(0.35 + 0.6 * f);
          ctx.setLineDash([4 * u, 5 * u]);
          ctx.beginPath();
          ctx.moveTo(ax[i], ay[i]);
          ctx.lineTo(hx[i], hy[i]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.arc(hx[i], hy[i], 9 * u, 0, Math.PI * 2);
          ctx.stroke();
          if (hop[i] < start) {
            ctx.beginPath();
            ctx.arc(ax[i], ay[i], (17 - 8 * f) * u, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }

      /* atoms: filled ink when they move freely, hollow when frozen; one about to hop fills in */
      const radius = 6.4 * u * (1 + 0.14 * hot - 0.06 * cold);
      const fillOf = (f) => "rgb(" + Math.round(43 + 212 * f) + "," + Math.round(51 + 204 * f) + "," + Math.round(61 + 194 * f) + ")";
      const restFill = fillOf(cold);
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = INK;
      for (let i = 0; i < n; i++) {
        const a = fade[i];
        if (a < 0.02) continue;
        const flashing = matter === "glass" && hop[i] >= 0;
        ctx.globalAlpha = a;
        ctx.fillStyle = flashing ? INK : restFill;
        ctx.beginPath();
        ctx.arc(ax[i], ay[i], flashing ? radius * 1.12 : radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      /* rare events: a maize star with an ink outline, and a ring that runs down as it fades */
      ctx.lineJoin = "round";
      for (const s of sparks) {
        const grow = ease(s.age / 0.25);
        const beat = 1 + 0.12 * Math.sin(s.age * 6);
        const left = s.life / s.max;
        ctx.globalAlpha = left < 0.25 ? 0.55 + 0.45 * Math.sin(s.age * 26) : 1;
        ctx.beginPath();
        const R = 11 * u * grow * beat;
        for (let k = 0; k < 8; k++) {
          const rr = k % 2 ? R * 0.4 : R;
          const a = s.rot + s.age * 1.1 + (k * Math.PI) / 4;
          ctx.lineTo(s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fillStyle = MAIZE;
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.3;
        ctx.stroke();
        ctx.lineWidth = 1.5 * u;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 18 * u * grow, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
        ctx.stroke();
      }
      ctx.lineJoin = "miter";

      for (const q of parts) {
        ctx.globalAlpha = 1 - q.t / q.life;
        ctx.fillStyle = q.color;
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.size, 0, Math.PI * 2);
        ctx.fill();
      }

      /* the player: the one maize disc on the page, with the Atombot mark in ink */
      const p = player;
      if (p.alive) {
        ctx.globalAlpha = p.invuln > 0 ? (reduce ? 0.55 : 0.45 + 0.4 * Math.sin(clock * 30)) : 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 18 * u, 0, Math.PI * 2);
        ctx.fillStyle = MAIZE;
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        const mw = 25 * u;
        if (mark) {
          const mh = (mw * mark.height) / mark.width;
          ctx.drawImage(mark, -mw / 2, -mh / 2, mw, mh);
        } else {
          ctx.lineWidth = 2.6 * u;
          ctx.lineCap = "round";
          for (let k = 0; k < 3; k++) {
            ctx.beginPath();
            ctx.arc(0, 0, mw * 0.36, (k * Math.PI * 2) / 3, (k * Math.PI * 2) / 3 + 1.5);
            ctx.stroke();
          }
        }
        ctx.restore();
        /* integrity, readable without looking up at the readout */
        ctx.lineWidth = 2.2 * u;
        ctx.lineCap = "round";
        for (let k = 0; k < INTEGRITY; k++) {
          const a0 = -Math.PI / 2 + (k * Math.PI * 2) / INTEGRITY + 0.2;
          ctx.strokeStyle = k < integrity ? INK : "#d3d6da";
          ctx.beginPath();
          ctx.arc(p.x, p.y, 26 * u, a0, a0 + (Math.PI * 2) / INTEGRITY - 0.4);
          ctx.stroke();
        }
        ctx.lineCap = "butt";
        if (control === "pointer" && pointerKind === "mouse" && Math.hypot(p.tx - p.x, p.ty - p.y) > 34 * u) {
          ctx.globalAlpha = 0.5;
          ctx.strokeStyle = INK;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(p.tx, p.ty, 6 * u, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      ctx.globalAlpha = 1;
      for (const ring of rings) {
        const f = ring.t / ring.life;
        ctx.strokeStyle = "rgba(" + ring.color + "," + (0.8 * (1 - f)).toFixed(3) + ")";
        ctx.lineWidth = ring.width * (1 - 0.5 * f);
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.r0 + (ring.r1 - ring.r0) * (1 - (1 - f) ** 3), 0, Math.PI * 2);
        ctx.stroke();
      }
      if (texts.length) {
        /* numbers sit on a little paper so they read over the atoms */
        ctx.font = "500 " + Math.round(13 * Math.max(u, 0.85)) + "px " + MONO;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        ctx.lineWidth = 4;
        for (const t of texts) {
          const f = t.t / t.life;
          const a = f < 0.7 ? 1 : (1 - f) / 0.3;
          const x = clamp(t.x, arena.x0 + 44, arena.x1 - 44);
          const y = t.y - 30 * u * (1 - (1 - f) ** 2);
          ctx.strokeStyle = "rgba(255,255,255," + a.toFixed(3) + ")";
          ctx.strokeText(t.text, x, y);
          ctx.fillStyle = "rgba(" + t.color + "," + a.toFixed(3) + ")";
          ctx.fillText(t.text, x, y);
        }
        ctx.lineJoin = "miter";
      }

      /* the sample cell: an ink frame. It thickens as the next state approaches, and stamps on a hit. */
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const pulse = cueOn && mode === "play" ? 0.5 + 0.5 * Math.sin(clock * 12) : 0;
      const frameW = 1 + 2 * pulse + 9 * flash;
      ctx.lineWidth = frameW;
      ctx.strokeStyle = INK;
      ctx.strokeRect(arena.x0 + frameW / 2, arena.y0 + frameW / 2, cellW - frameW, cellH - frameW);
    }

    /* ---- HUD and panels ------------------------------------------------- */

    function put(key, value, write) {
      if (shown[key] !== value) {
        shown[key] = value;
        write(value);
      }
    }

    function syncHud() {
      const def = MATTER[matter];
      put("n", n, (v) => (hud.n.textContent = String(v)));
      put("state", cueOn && mode !== "start" ? def.verb : matter, (v) => (hud.state.textContent = v));
      put("cue", cueOn && mode === "play", (v) => root.classList.toggle("is-cue", v));
      put("events", events, (v) => (hud.events.textContent = String(v)));
      put("mult", mult, (v) => {
        hud.mult.textContent = "×" + v;
        hud.mult.parentNode.classList.toggle("is-up", v > 1);
      });
      put("integrity", integrity, (v) => {
        hud.pips.setAttribute("aria-label", "Integrity " + v + " of " + INTEGRITY);
        Array.from(hud.pips.children).forEach((el, k) => el.classList.toggle("is-on", k < v));
      });
      put("charges", charges, (v) => {
        Array.from(hud.charges.children).forEach((el, k) => el.classList.toggle("is-on", k < v));
        biasBtn.classList.toggle("is-empty", v === 0);
        biasBtn.setAttribute("aria-label", "Drop a bias hill, " + v + " left");
      });
      hud.clock.style.transform = "scaleX(" + (mode === "start" ? 0 : clamp(matterT / def.secs, 0, 1)).toFixed(3) + ")";
      if (cueUntil && clock > cueUntil) {
        cueUntil = 0;
        cueEl.classList.remove("is-on");
      }
    }

    function showCue(big, small, secs) {
      cueEl.firstChild.textContent = big;
      cueEl.lastChild.textContent = small || "";
      cueEl.classList.remove("is-on");
      void cueEl.offsetWidth; /* restart the entrance */
      cueEl.classList.add("is-on");
      cueUntil = clock + secs;
    }

    /* ---- leaderboard ------------------------------------------------------ */

    const boardEls = Array.from(root.querySelectorAll("[data-board]"));
    const postForm = $("[data-post]");
    const postStatus = $("[data-post-status]");
    let mine = null; /* the row posted for the run just finished */

    function renderBoard() {
      const rows = boardRows();
      /* On the shared list every score posted from this device is marked; on the device's own list, the one just posted. */
      const yours = board.shared ? deviceRows() : mine ? [mine] : [];
      const isYours = (row) => yours.some(sameScore(row));
      /* the row to show even when it is below the top ten: the newest one posted lately, else this device's best */
      const lately = yours.filter((row) => Math.abs(Date.now() - row.at) < AWAIT_MS).sort((a, b) => b.at - a.at)[0];
      const latestAt = mine || lately ? rows.findIndex(sameScore(mine || lately)) : -1;
      const showAt = latestAt >= 0 ? latestAt : rows.findIndex(isYours);
      const catchingUp = awaitedRows().length > 0;
      for (const el of boardEls) {
        el.querySelector("[data-board-scope]").textContent = !board.loaded ? "" : board.shared ? "all players" : "this device";
        const list = el.querySelector("[data-board-list]");
        list.textContent = "";
        const add = (row, place, you) => {
          const item = document.createElement("li");
          if (you) item.className = "is-you";
          for (const [cls, text] of [["zg-rank", String(place).padStart(2, "0")], ["zg-name", row.name], ["zg-score", String(row.score)]]) {
            const span = document.createElement("span");
            span.className = cls;
            span.textContent = text;
            item.append(span);
          }
          list.append(item);
        };
        rows.slice(0, BOARD_SIZE).forEach((row, i) => add(row, i + 1, isYours(row)));
        if (showAt >= BOARD_SIZE) add(rows[showAt], showAt + 1, true);
        el.querySelector("[data-board-note]").textContent = !board.loaded
          ? "Loading scores"
          : board.failed
            ? "The shared leaderboard could not be reached, so these are this device's scores."
            : catchingUp
              ? "Your new score is saved. Other players will see it in a few minutes."
              : rows.length
                ? ""
                : "No scores yet. Be the first.";
      }
    }

    function refreshBoard() {
      renderBoard();
      loadBoard().then(() => {
        if (!destroyed) renderBoard();
      });
    }

    /* Get the form ready for the run that just ended. */
    function readyPost() {
      mine = null;
      const shared = sharesBoard();
      postForm.hidden = score <= 0;
      postForm.classList.toggle("zg-post--device", !shared);
      postForm.elements.name.value = readName();
      postForm.elements.email.value = "";
      for (const el of postForm.elements) el.disabled = false;
      postStatus.textContent = "";
      $("[data-post-note]").textContent = shared
        ? "Your name and score appear on the leaderboard. Your email is optional, is never shown, and goes only to the people who run this site."
        : "Scores are kept on this device.";
    }

    on(postForm, "submit", (e) => {
      e.preventDefault();
      if (mine || mode !== "over") return;
      const name = cleanName(postForm.elements.name.value);
      const email = postForm.elements.email.value.trim();
      if (name.length < 2) {
        postStatus.textContent = "Enter a name of at least two characters.";
        postForm.elements.name.focus();
        return;
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        postStatus.textContent = "That email does not look right. Fix it or leave it empty.";
        postForm.elements.email.focus();
        return;
      }
      mine = toRow(name, score);
      writeName(name);
      for (const el of postForm.elements) el.disabled = true;
      postStatus.textContent = "Posting";
      postScore({ name, email, score, events, streak: bestStreak, seconds: Math.round(runTime) }).then((sent) => {
        if (destroyed) return;
        postStatus.textContent =
          sent === true
            ? "Posted."
            : sent === false
              ? "Saved on this device. The shared leaderboard could not be reached."
              : "Saved on this device.";
        renderBoard();
      });
      renderBoard();
    });

    function showPanel(name) {
      for (const key of Object.keys(panels)) panels[key].hidden = key !== name;
      root.dataset.mode = mode;
    }

    function bestLine() {
      return best > 0 ? "Best so far: " + best : "";
    }

    function startRun() {
      mode = "play";
      cycle = 0;
      speedMul = 1;
      matter = "liquid";
      matterT = 0;
      cueOn = false;
      heat = 0;
      order = 0;
      lattice = null;
      bonds = [];
      const want = targetCount();
      if (n > want) n = want;
      for (let i = 0; i < n; i++) hop[i] = -1;
      integrity = INTEGRITY;
      charges = 1;
      events = 0;
      score = 0;
      streak = 0;
      bestStreak = 0;
      mult = 1;
      runTime = 0;
      sparks = [];
      hills = [];
      rings = [];
      parts = [];
      texts = [];
      sparkTimer = 1.2;
      beam.on = false;
      beam.timer = 17;
      shake = flash = slowT = dying = 0;
      const p = player;
      p.x = p.tx = (arena.x0 + arena.x1) / 2;
      p.y = p.ty = (arena.y0 + arena.y1) / 2;
      p.vx = p.vy = 0;
      p.invuln = 2.2;
      p.alive = true;
      keys.up = keys.down = keys.left = keys.right = false;
      touchId = null;
      addAtoms(want - n);
      /* a free hill clears the starting spot and shows what a bias hill does */
      hills.push({ x: p.x, y: p.y, t: 0, life: 2.4, r: 150 * u, push: 520 * u, kind: "bias" });
      showPanel(null);
      showCue("liquid", MATTER.liquid.tip, 2.6);
      root.focus({ preventScroll: true });
      last = performance.now();
      acc = 0;
      if (!raf) raf = requestAnimationFrame(frame);
    }

    function endRun() {
      mode = "over";
      const isBest = score > best;
      if (isBest) {
        best = score;
        writeBest(best);
      }
      let rank = RANKS[0];
      for (const r of RANKS) if (score >= r[0]) rank = r;
      $("[data-rank]").textContent = rank[1];
      $("[data-rank-note]").textContent = rank[2];
      $("[data-score]").textContent = String(score);
      $("[data-caught]").textContent = String(events);
      $("[data-streak]").textContent = String(bestStreak);
      $("[data-time]").textContent = String(Math.round(runTime));
      $("[data-best-over]").textContent = isBest && score > 0 ? "New best." : bestLine();
      $("[data-best]").textContent = bestLine();
      readyPost();
      refreshBoard();
      sparks = [];
      beam.on = false;
      cueOn = false;
      matter = "liquid"; /* the sample relaxes behind the result */
      matterT = 0;
      for (let i = 0; i < n; i++) hop[i] = -1;
      cueEl.classList.remove("is-on");
      showPanel("over");
      /* a short wait so a key that was meant for the game does not restart it */
      const again = panels.over.querySelector("[data-start]");
      again.disabled = true;
      setTimeout(() => {
        if (destroyed) return;
        again.disabled = false;
        if (mode === "over") again.focus({ preventScroll: true });
      }, 650);
    }

    function pause() {
      if (mode !== "play" || !player.alive) return;
      mode = "pause";
      cancelAnimationFrame(raf);
      raf = 0;
      showPanel("pause");
      panels.pause.querySelector("[data-resume]").focus({ preventScroll: true });
    }

    function resume() {
      if (mode !== "pause") return;
      mode = "play";
      showPanel(null);
      root.focus({ preventScroll: true });
      keys.up = keys.down = keys.left = keys.right = false;
      last = performance.now();
      acc = 0;
      if (!raf) raf = requestAnimationFrame(frame);
    }

    /* ---- loop ----------------------------------------------------------- */

    function frame(now) {
      raf = requestAnimationFrame(frame);
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.1) dt = 0.1;
      if (dt > 0) fps += (1 / dt - fps) * 0.05;
      let scale = 1;
      if (dying > 0) {
        scale = 0.3;
        dying -= dt;
        if (dying <= 0) endRun();
      } else if (slowT > 0) {
        scale = 0.45;
        slowT -= dt;
      }
      if (shake > 0) shake = Math.max(0, shake - dt);
      if (flash > 0) flash = Math.max(0, flash - dt * 2.6);
      acc += dt * scale;
      let steps = 0;
      while (acc >= STEP && steps < 14) {
        step(STEP);
        acc -= STEP;
        steps++;
      }
      if (steps === 14) acc = 0;
      draw();
      syncHud();
    }

    /* ---- input ---------------------------------------------------------- */

    const DIRS = { arrowup: "up", w: "up", arrowdown: "down", s: "down", arrowleft: "left", a: "left", arrowright: "right", d: "right" };

    function focusables() {
      return Array.from(root.querySelectorAll("button, input")).filter(
        (el) => !el.disabled && el.offsetParent !== null && getComputedStyle(el).visibility !== "hidden"
      );
    }

    on(document, "keydown", (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "escape") {
        e.preventDefault();
        e.stopPropagation();
        api.close();
        return;
      }
      if (key === "tab") {
        const items = focusables();
        if (!items.length) return;
        const at = items.indexOf(document.activeElement);
        const next = e.shiftKey ? (at <= 0 ? items.length - 1 : at - 1) : at === items.length - 1 ? 0 : at + 1;
        e.preventDefault();
        items[next].focus({ preventScroll: true });
        return;
      }
      e.stopPropagation(); /* the page behind should not react to game keys */
      if (e.target && e.target.tagName === "INPUT") return; /* typing a name or email */
      if (mode === "play") {
        if (DIRS[key]) {
          keys[DIRS[key]] = true;
          control = "keys";
          e.preventDefault();
        } else if (key === " ") {
          e.preventDefault();
          if (!e.repeat) dropHill();
        } else if (key === "p") {
          pause();
        }
      } else if (mode === "pause" && key === "p") {
        resume();
      } else if (DIRS[key] && key.startsWith("arrow")) {
        e.preventDefault();
      }
    }, { capture: true });

    on(document, "keyup", (e) => {
      const dir = DIRS[e.key.toLowerCase()];
      if (dir) keys[dir] = false;
      if (e.key === " " && mode === "play") e.preventDefault(); /* Space is the bias hill, not a button press */
    }, { capture: true });

    const point = (e) => {
      const o = root.getBoundingClientRect();
      return { x: e.clientX - o.left, y: e.clientY - o.top };
    };

    on(root, "pointermove", (e) => {
      if (e.pointerType === "mouse") {
        const q = point(e);
        pointerKind = "mouse";
        control = "pointer";
        player.tx = q.x;
        player.ty = q.y;
      } else if (e.pointerId === touchId && touch0) {
        const q = point(e);
        control = "pointer";
        player.tx = clamp(touch0.tx + (q.x - touch0.x) * 1.25, arena.x0, arena.x1);
        player.ty = clamp(touch0.ty + (q.y - touch0.y) * 1.25, arena.y0, arena.y1);
      }
    });

    on(canvas, "pointerdown", (e) => {
      if (mode !== "play") return;
      e.preventDefault();
      if (e.pointerType === "mouse") {
        if (e.button === 0) dropHill();
        return;
      }
      pointerKind = "touch";
      if (touchId === null) {
        /* drag anywhere: Atombot moves with the finger, so the finger never has to cover it */
        const q = point(e);
        touchId = e.pointerId;
        touch0 = { x: q.x, y: q.y, tx: player.x, ty: player.y };
        player.tx = player.x;
        player.ty = player.y;
        control = "pointer";
      } else {
        dropHill(); /* a second finger drops a hill */
      }
    });

    const liftTouch = (e) => {
      if (e.pointerId === touchId) {
        touchId = null;
        touch0 = null;
        player.tx = player.x;
        player.ty = player.y;
      }
    };
    on(root, "pointerup", liftTouch);
    on(root, "pointercancel", liftTouch);
    on(root, "contextmenu", (e) => e.preventDefault());
    on(canvas, "touchmove", (e) => e.preventDefault(), { passive: false });

    on(root, "click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      if (btn.hasAttribute("data-close")) api.close();
      else if (btn.hasAttribute("data-start")) startRun();
      else if (btn.hasAttribute("data-resume")) resume();
      else if (btn.hasAttribute("data-pause")) {
        if (mode === "play") pause();
        else if (mode === "pause") resume();
      } else if (btn.hasAttribute("data-bias")) {
        dropHill();
        if (mode === "play") root.focus({ preventScroll: true });
      }
    });

    on(document, "visibilitychange", () => {
      if (document.hidden) pause();
    });
    on(window, "blur", pause);
    on(window, "resize", layout);

    /* ---- open ----------------------------------------------------------- */

    const inerted = [];
    for (const el of Array.from(document.body.children)) {
      if (!el.inert) {
        el.inert = true;
        inerted.push(el);
      }
    }
    document.documentElement.classList.add("zgame-lock");
    /* page scripts can listen for this to rest their own animations while the game covers them */
    document.dispatchEvent(new CustomEvent("zlab:game", { detail: { open: true } }));
    document.body.appendChild(root);
    layout();
    seedAtoms();
    $("[data-best]").textContent = bestLine();
    showPanel("start");
    refreshBoard();
    syncHud();
    panels.start.querySelector("[data-start]").focus({ preventScroll: true });
    last = performance.now();
    raf = requestAnimationFrame(frame);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        if (!destroyed) layout();
      });
    }

    return {
      destroy() {
        destroyed = true;
        cancelAnimationFrame(raf);
        raf = 0;
        listeners.abort();
        markImg.onload = null;
        root.remove();
        for (const el of inerted) el.inert = false;
        document.documentElement.classList.remove("zgame-lock");
        document.dispatchEvent(new CustomEvent("zlab:game", { detail: { open: false } }));
        if (returnFocus && document.contains(returnFocus) && returnFocus.focus) returnFocus.focus({ preventScroll: true });
      },
      snapshot() {
        const atoms = [];
        for (let i = 0; i < n; i++) atoms.push([ax[i], ay[i], vx[i], vy[i], fade[i]]);
        return {
          mode, matter, cueOn, cycle, n, score, events, streak, mult, integrity, charges, best,
          time: runTime, fps: Math.round(fps), unit: u, arena: Object.assign({}, arena),
          player: { x: player.x, y: player.y, alive: player.alive, invulnerable: player.invuln > 0 },
          atoms, sparks: sparks.map((s) => [s.x, s.y, s.life]), hills: hills.map((h) => [h.x, h.y, h.r, h.kind]),
          beam: beam.on ? { y: beam.y, h: beam.h } : null, running: raf !== 0,
          effects: { reduce, shake, flash, slow: slowT },
        };
      },
    };
  }

  let game = null;
  const api = {
    open(options) {
      if (!game) game = createGame(options);
    },
    close() {
      if (!game) return;
      game.destroy();
      game = null;
      if (location.hash === "#play" || location.hash === "#leaderboard") history.replaceState(null, "", location.pathname + location.search);
    },
    snapshot() {
      return game ? game.snapshot() : null;
    },
  };
  window.ZLabGame = api;
})();
