/*
 * Shared behavior for every page: the small-screen menu, the reveal that lets
 * figures draw themselves when they scroll into view, the loader for the game,
 * and a few helpers used by the page scripts (window.ZLab).
 */
(() => {
  "use strict";

  const nav = document.getElementById("site-nav");
  const here = document.currentScript && document.currentScript.src
    ? document.currentScript.src
    : new URL("assets/js/site.js", document.baseURI).href;

  /* The menu on small screens: a button that opens the list of sections under the running head. */
  if (nav) {
    const toggle = nav.querySelector(".menu-toggle");
    if (toggle) {
      const setOpen = (open) => {
        nav.classList.toggle("is-open", open);
        toggle.setAttribute("aria-expanded", String(open));
        toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
        toggle.textContent = open ? "Close" : "Menu";
      };
      toggle.addEventListener("click", () => setOpen(!nav.classList.contains("is-open")));
      nav.querySelectorAll(".nav-links a").forEach((a) => a.addEventListener("click", () => setOpen(false)));
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && nav.classList.contains("is-open")) {
          setOpen(false);
          toggle.focus();
        }
      });
      window.matchMedia("(min-width: 960px)").addEventListener("change", (e) => {
        if (e.matches) setOpen(false);
      });
    }
  }

  /* Scroll reveal for elements marked with data-reveal. */
  const reveal = (scope) => {
    const items = (scope || document).querySelectorAll("[data-reveal]:not(.is-in)");
    if (!("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
    );
    items.forEach((el) => io.observe(el));
  };
  reveal();

  /*
   * The game ("Rare Event", assets/js/game.js). Nothing is downloaded until a visitor opens
   * it: a "Play Rare Event" or "Leaderboard" button, typing "atombot", or a page address
   * ending in #play or #leaderboard. view "board" opens it with the leaderboard up front.
   */
  let gameFiles = null;
  const openGame = (view) => {
    if (!gameFiles) {
      gameFiles = new Promise((resolve, reject) => {
        const css = document.createElement("link");
        css.rel = "stylesheet";
        css.href = new URL("../css/game.css", here).href;
        const board = document.createElement("script");
        board.src = new URL("../../data/leaderboard.js", here).href;
        const js = document.createElement("script");
        js.src = new URL("game.js", here).href;
        const parts = [css, board, js];
        let waiting = parts.length;
        const loaded = () => {
          if (--waiting === 0) resolve();
        };
        const failed = () => {
          parts.forEach((el) => el.remove());
          gameFiles = null; /* let the next attempt try again */
          reject(new Error("game files did not load"));
        };
        parts.forEach((el) => {
          el.addEventListener("load", loaded);
          el.addEventListener("error", failed);
        });
        document.head.append(...parts);
      });
    }
    gameFiles.then(() => window.ZLabGame.open({ view: view || "" })).catch(() => {});
  };
  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-game]");
    if (trigger) {
      e.preventDefault();
      openGame(trigger.dataset.game);
    }
  });
  let typed = "";
  document.addEventListener("keydown", (e) => {
    const el = e.target;
    if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
    typed = (typed + e.key.toLowerCase()).slice(-7);
    if (typed === "atombot") {
      typed = "";
      openGame();
    }
  });
  const openFromHash = () => {
    if (location.hash === "#play") openGame();
    else if (location.hash === "#leaderboard") openGame("board");
  };
  window.addEventListener("hashchange", openFromHash);
  openFromHash();
  console.log("%cZ Lab%c A rare event is hidden on this site. Type \"atombot\" on any page to find it.", "font-weight:bold;color:#ffcb05;background:#00274c;padding:2px 6px;border-radius:4px", "");

  /* Helpers shared with the page scripts. */
  const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);

  /* Author list as HTML with the PI's name in bold ("Y Z" or "Y. Zhang" as a whole author). */
  const authorsHTML = (authors) =>
    esc(authors).replace(/(^|, |\band )(Y Z|Y\. Zhang)(\*?)(?=,|$)/g, "$1<b>$2</b>$3");

  const doiURL = (doi) => (doi ? "https://doi.org/" + doi : "");

  window.ZLab = { esc, authorsHTML, doiURL, reveal };
})();
