/*
 * Shared behavior for every page: navigation state, mobile menu, theme toggle,
 * scroll reveal, the loader for the hidden game, and a few helpers used by the
 * page scripts (window.ZLab).
 */
(() => {
  "use strict";

  const root = document.documentElement;
  const nav = document.getElementById("site-nav");
  const here = document.currentScript && document.currentScript.src
    ? document.currentScript.src
    : new URL("assets/js/site.js", document.baseURI).href;

  /* Navigation: solid background once the page scrolls; mobile menu. */
  if (nav) {
    const onScroll = () => nav.classList.toggle("is-stuck", window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const toggle = nav.querySelector(".menu-toggle");
    if (toggle) {
      const setOpen = (open) => {
        nav.classList.toggle("is-open", open);
        toggle.setAttribute("aria-expanded", String(open));
        toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
        document.body.style.overflow = open ? "hidden" : "";
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

  /* Theme toggle. theme-init.js has already set data-theme before first paint. */
  const themeBtn = document.querySelector(".theme-toggle");
  const labelTheme = () => {
    if (themeBtn) {
      themeBtn.setAttribute("aria-label", root.dataset.theme === "light" ? "Switch to dark theme" : "Switch to light theme");
    }
  };
  const setTheme = (theme, persist) => {
    root.dataset.theme = theme;
    labelTheme();
    if (persist) {
      try {
        localStorage.setItem("zlab-theme", theme);
      } catch (e) {
        /* storage unavailable: the choice lasts for this page only */
      }
    }
    document.dispatchEvent(new CustomEvent("themechange", { detail: theme }));
  };
  labelTheme();
  if (themeBtn) {
    themeBtn.addEventListener("click", () => setTheme(root.dataset.theme === "light" ? "dark" : "light", true));
  }
  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", (e) => {
    let saved = null;
    try {
      saved = localStorage.getItem("zlab-theme");
    } catch (err) {
      /* ignore */
    }
    if (!saved) setTheme(e.matches ? "light" : "dark", false);
  });

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
   * Hidden game ("Rare Event", assets/js/game.js). Nothing is downloaded until a visitor
   * finds it: type "atombot", press the Atombot mark in the footer, or open any page with #play.
   */
  let gameFiles = null;
  const openGame = () => {
    if (!gameFiles) {
      gameFiles = new Promise((resolve, reject) => {
        const css = document.createElement("link");
        css.rel = "stylesheet";
        css.href = new URL("../css/game.css", here).href;
        const js = document.createElement("script");
        js.src = new URL("game.js", here).href;
        let waiting = 2;
        const loaded = () => {
          if (--waiting === 0) resolve();
        };
        const failed = () => {
          css.remove();
          js.remove();
          gameFiles = null; /* let the next attempt try again */
          reject(new Error("game files did not load"));
        };
        css.addEventListener("load", loaded);
        js.addEventListener("load", loaded);
        css.addEventListener("error", failed);
        js.addEventListener("error", failed);
        document.head.append(css, js);
      });
    }
    gameFiles.then(() => window.ZLabGame.open()).catch(() => {});
  };
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-game]")) {
      e.preventDefault();
      openGame();
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
