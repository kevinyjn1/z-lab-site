/*
 * Rare Event leaderboard: where scores are sent and where they are read from.
 *
 * Leave everything empty and the game keeps a top-ten list on each visitor's own device.
 * To share one leaderboard between all visitors, point these at a Google Form and a
 * published Google Sheet (the steps are under "Leaderboard" in README.md):
 *
 *   form    the form's address, ending in /formResponse
 *   fields  the form's question ids, each like "entry.123456789"
 *   scores  the published CSV address of the public names-and-scores spreadsheet
 *
 * Names and scores are public. Emails go only to the form's private responses spreadsheet;
 * the published spreadsheet does not contain them and the site never reads them.
 */
window.ZLAB_LEADERBOARD = {
  form: "https://docs.google.com/forms/d/e/1FAIpQLSc57dAcFOtykQCpO_uNWpUVNOD0Uqa0z5eHh99On3PwykwdPw/formResponse",
  fields: {
    name: "entry.1564947945",
    email: "entry.277817562",
    score: "entry.1088926959",
    events: "entry.937260517",
    streak: "entry.1661265435",
    seconds: "entry.521244317",
  },
  scores: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRZ-yCaXevRieL92GpY16o5j5xEKzAYRVP67l2hYEhg97nuVu5zb80J6kf003it-Amt3RsARXVes2QU/pub?output=csv",
};
