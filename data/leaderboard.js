/*
 * Rare Event leaderboard: where scores are sent and where they are read from.
 *
 * Leave everything empty and the game keeps a top-ten list on each visitor's own device.
 * To share one leaderboard between all visitors, point these at a Google Form and its
 * Sheet (the steps are under "Leaderboard" in README.md):
 *
 *   form    the form's address, ending in /formResponse
 *   fields  the form's question ids, each like "entry.123456789"
 *   scores  the published CSV address of the sheet's Leaderboard tab
 *
 * Names and scores are public. Emails go only to the sheet; the site never reads them back.
 */
window.ZLAB_LEADERBOARD = {
  form: "",
  fields: { name: "", email: "", score: "", events: "", streak: "", seconds: "" },
  scores: "",
};
