/*
 * People page: renders the roster, alumni table, and Atombot alumni from data/people.js.
 */
(() => {
  "use strict";

  const data = window.ZLAB_PEOPLE;
  const roster = document.getElementById("roster");
  if (!data || !roster) return;

  const { esc, reveal } = window.ZLab;

  const initials = (name) => {
    const parts = name.replace(/\(.*?\)/g, " ").trim().split(/\s+/);
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  };

  /* Stable hue per name, kept between maize and sky so monograms match the palette. */
  const hue = (name) => {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return 42 + (h % 165);
  };

  const person = (m, i) => {
    const picture = m.photo
      ? '<img src="' + esc(data.photoBase + m.photo) + '" alt="" loading="lazy" decoding="async" width="560" height="560" style="object-position:' + esc(m.pos || "50% 22%") + '">'
      : '<div class="monogram" style="--hue:' + hue(m.name) + '" aria-hidden="true">' + esc(initials(m.name)) + "</div>";
    const cv = m.cv
      ? '<a class="person-cv" href="' + esc(data.cvBase + m.cv) + '" aria-label="CV of ' + esc(m.name) + '">CV</a>'
      : "";
    return (
      '<figure class="person" data-reveal style="--d:' + (i % 8) * 45 + 'ms">' +
      '<div class="person-photo">' + picture + "</div>" +
      '<figcaption><span class="person-name">' + esc(m.name) + "</span>" + cv + "</figcaption>" +
      "</figure>"
    );
  };

  roster.innerHTML = data.groups
    .map(
      (g) =>
        '<section class="group" id="' + esc(g.id) + '">' +
        '<div class="group-head" data-reveal><h2>' + esc(g.title) + '</h2><span class="group-count">' + String(g.members.length).padStart(2, "0") + "</span></div>" +
        '<div class="roster' + (g.size === "lg" ? " roster--lg" : "") + '">' + g.members.map(person).join("") + "</div>" +
        "</section>"
    )
    .join("");

  const alumniRows = document.getElementById("alumni-rows");
  if (alumniRows) {
    alumniRows.innerHTML = data.alumni
      .map(
        (a) =>
          "<tr><td>" + esc(a.name) + "</td>" +
          "<td>" + esc(a.degree) + (a.school ? ", " + esc(a.school) : "") + "</td>" +
          "<td>" + esc(a.year) + "</td>" +
          "<td>" + (a.now ? esc(a.now) : "") + "</td></tr>"
      )
      .join("");
  }

  const cloud = document.getElementById("atombot-alumni");
  if (cloud) {
    cloud.innerHTML = data.atombotAlumni.map((n) => '<li class="chip">' + esc(n) + "</li>").join("");
  }

  document.querySelectorAll("[data-count]").forEach((el) => {
    const key = el.getAttribute("data-count");
    const n = key === "alumni" ? data.alumni.length : key === "atombot" ? data.atombotAlumni.length : null;
    if (n !== null) el.textContent = String(n).padStart(2, "0");
  });

  reveal(roster);

  /* The groups did not exist when the browser first looked for the #hash target. */
  if (location.hash) {
    const target = document.getElementById(location.hash.slice(1));
    if (target) target.scrollIntoView();
  }
})();
