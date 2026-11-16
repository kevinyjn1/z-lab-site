/*
 * Runs before first paint (loaded without defer in <head>) so the page never
 * flashes the wrong theme. Uses the saved choice, else the system setting.
 */
(function () {
  var root = document.documentElement;
  var theme = null;
  root.classList.add("js");
  try {
    theme = localStorage.getItem("zlab-theme");
  } catch (e) {
    /* storage unavailable: fall through to the system setting */
  }
  if (theme !== "light" && theme !== "dark") {
    theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  root.dataset.theme = theme;
})();
