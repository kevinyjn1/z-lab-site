/*
 * Runs before first paint (loaded without defer in <head>): marks the page as
 * scripted, so styles that depend on scripts apply from the first frame.
 */
document.documentElement.classList.add("js");
