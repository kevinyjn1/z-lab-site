/*
 * Shared behavior for every page: navigation state, mobile menu, theme toggle,
 * scroll reveal, and a few helpers used by the page scripts (window.ZLab).
 */
(() => {
  "use strict";

  const root = document.documentElement;
  const nav = document.getElementById("site-nav");

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

  /* Helpers shared with the page scripts. */
  const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);

  /* Author list as HTML with the PI's name in bold ("Y Z" or "Y. Zhang" as a whole author). */
  const authorsHTML = (authors) =>
    esc(authors).replace(/(^|, |\band )(Y Z|Y\. Zhang)(\*?)(?=,|$)/g, "$1<b>$2</b>$3");

  const doiURL = (doi) => (doi ? "https://doi.org/" + doi : "");

  window.ZLab = { esc, authorsHTML, doiURL, reveal };
})();
