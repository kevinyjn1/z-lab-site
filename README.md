# Z Lab website (redesign concept)

An unofficial redesign concept for the [Z Lab](https://z.engin.umich.edu/) at the
University of Michigan: *Matter in extremes, Machine for extremes.*

Plain HTML, CSS, and JavaScript. There is no build step and there are no dependencies:
open `index.html`, or copy the folder to any web server.

## Pages

| File | What it is |
| --- | --- |
| `index.html` | Home, with the 3D particle hero (liquid, then the Atombot mark, an atom, and a lattice Z), a scroll story of the lab's robots, and the lab in numbers |
| `research.html` | The two research domains, with two interactive sketches |
| `people.html` | PI, current members, alums |
| `publications.html` | Searchable, filterable publication list with two figures that double as filters: papers per year, and the journals with the most papers |
| `code.html` | Software |
| `teaching.html` | Courses |
| `calendar.html` | The two embedded Google calendars |
| `404.html` | Not-found page (used automatically by GitHub Pages) |

File names match the current site, so existing links keep working if this replaces it.

## Updating content

Most routine updates are a one-line change to a data file. The comment at the top of
each file explains the fields.

- **Add a paper:** `data/publications.js`. Copy an entry and paste it at the top.
  The Publications page, the home page list, and the numbers strip update themselves.
- **Add or move a person:** `data/people.js`. Drop their photo in `assets/img/people/`,
  cropped square with the face centered and the eyes a little above the middle so it lines
  up with the rest (about 560 px a side is plenty; WebP or JPEG). People without a photo
  get a monogram. Moving someone to `alumni` is a cut and paste.
- **Everything else** (research text, software, courses) is ordinary HTML in the page files.
  The header and footer are repeated in each page, so a navigation change means editing
  all eight.

## Layout

```
assets/css/style.css     all styles; design tokens and both themes are at the top
assets/js/theme-init.js  picks light or dark before first paint
assets/js/site.js        navigation, theme toggle, scroll reveal, shared helpers
assets/js/fx.js          decorative motion: progress bar, word reveals, tilt, header lattice
assets/js/hero.js        home page particle scene
assets/js/atombot-art.js the Atombot mark as a bitmap, shared by the hero and the swarm sketch
assets/js/story.js       home page scroll story: reactor hall, soft arm, CookieBot swarm, wheel-leg robot
assets/js/landscape.js   research page: metadynamics sketch (energy landscape, bias layers, walker trace)
assets/js/swarm.js       research page: robot swarm sketch
assets/js/home.js        home page numbers, the small figure under each, and recent publications
assets/js/people.js      renders the People page from data/people.js
assets/js/publications.js renders the Publications page from data/publications.js
assets/js/game.js        "Rare Event", the hidden game; loaded only when a visitor finds it
assets/css/game.css      styles for the game
data/                    people, publications, and the game's leaderboard settings
```

The two interactive sketches are illustrative toy models, not research code or data.

## Figures

The charts (Publications, and the numbers on Home) are drawn from `data/publications.js` and
`data/people.js`, so they update with the data. They follow one small set of rules, kept in
`style.css` under "Figures":

- **One message each.** The line under a figure's title says what it shows in plain words
  ("97 since 2006, most in 2021"), and it is rewritten when a filter changes the numbers.
- **One series color.** `--viz` is the color of the marks, `--viz-hi` the mark being read or
  selected, `--viz-ghost` the full count shown faintly behind a filtered one, and `--viz-quiet`
  the marks that are context. Each has a dark and a light value; change them in the two theme
  blocks at the top of `style.css` and nowhere else. On Home the largest value in each small
  figure wears the accent and the rest stay quiet.
- **Labels are sparing and text is never colored like the data.** Only the peak, the selected
  mark, and ranked rows carry a number. Everything else is on the axis, in the tooltip, and
  in the "View as table" under each figure, so no value depends on hovering.
- **The scale never moves.** A filter does not rescale a figure; the faint mark keeps the
  full count in view behind the papers that match.
- **Thin marks, hairline rules, no boxes.** Bars are at most 24 px wide with 3 px rounded
  ends, gridlines are solid 1 px lines, and a figure sits under a single rule instead of
  inside a card. The plot height (`--plot-h`) is a multiple of 12 so every gridline lands on
  a whole pixel.

On the Publications page a year or a journal can be chosen in its figure. Each figure counts
the papers that pass every filter except its own, so the choice can be changed in place, and
the choice is kept in the address (`?year=2021&venue=...`).

## Leaderboard for Rare Event

The game's start and result screens list the top scores, and a finished run can be posted
with a name and an optional email. Out of the box each device keeps its own top ten. To
share one leaderboard between all visitors, use a Google Form and its Sheet:

1. Create a Google Form with six short-answer questions in this order: Name, Email, Score,
   Events, Streak, Seconds. In Settings, leave "Collect email addresses" and "Limit to 1
   response" off, so no sign-in is needed. Publish the form for anyone with the link.
2. In the form's Responses tab, choose "Link to Sheets". This is the private spreadsheet:
   it holds the emails, so never publish or share it.
3. Create a second, separate spreadsheet for the public list and put this formula in cell
   A1, with the private spreadsheet's address in place of `PRIVATE_SHEET_URL`. Click "Allow
   access" when the cell asks for it.

   ```
   =QUERY(IMPORTRANGE("PRIVATE_SHEET_URL","Form Responses 1!A:G"),"select Col2, Col4, Col5 where Col2 is not null",1)
   ```

4. In that second spreadsheet: File, Share, Publish to web, choose the CSV format, publish,
   and copy the link. It carries only names, scores, and event counts.
5. Fill in `data/leaderboard.js`: `form` is the form's public link with `viewform` replaced
   by `formResponse`; `fields` are the question ids (use the form's "Get pre-filled link",
   answer each question with its own name, and read the `entry.123...` parts from the link it
   gives you); `scores` is the link from step 4.

Things to know:

- Emails stay in the private spreadsheet. The public one only imports the name, score, and
  events columns, so publishing it cannot expose an email.
- To remove a score, delete its row in the private spreadsheet's responses tab.
- A new score can take a few minutes to appear for other visitors, because Google refreshes
  the published file on its own schedule. The player who posted it sees it right away, and
  on every later visit: the game remembers the scores posted from a device and adds them to
  the list for up to an hour, until the published file has them. A score that was deleted,
  or that never arrived, drops off that player's list too once the hour is up.
- Scores are sent by the visitor's browser, so they can be faked. The game ignores posted
  scores above 3000; anything else that looks wrong has to be deleted by hand.

## Previewing locally

```bash
python3 -m http.server 4173
```

Then open <http://localhost:4173>.

## Notes for whoever adopts this

- Every page carries `<meta name="robots" content="noindex">` so this concept does not
  compete with the official site in search results. Remove that line when it becomes the
  real site.
- CV and syllabus links point at the files on the official site (`cvBase` in
  `data/people.js`). To host them alongside these pages, copy the `cv/` folder next to
  `index.html` and set `cvBase` to `"cv/"`.
- The Atombot mark (`assets/img/atombot-mark.webp`) is applied as a CSS mask, so one file takes
  whatever text color surrounds it. Use `<span class="atombot-mark" aria-hidden="true"></span>`.
  The home hero and the swarm sketch draw the same mark from the small character bitmap in
  `assets/js/atombot-art.js`.
- There is a game, Rare Event: pilot the Atombot mark through a sample that cycles through
  liquid, crystal, gas, and glass, and catch rare events. It opens from the "Play Rare Event"
  button in every footer, at the end of the scroll story, and on the 404 page; by typing
  "atombot"; or by opening any page with `#play` (handy for sharing). To remove it, delete
  `game.js`, `game.css`, the loader block in `site.js`, and the `data-game` buttons in the pages.
- The scroll story on Home pins a stage and moves a camera through five illustrated scenes as
  the page scrolls; its text lives in `index.html` and the drawing in `story.js`. It illustrates
  ideas from the lab's robotics seminar and is not a drawing of the actual robots. With "reduce
  motion" on, nothing is pinned and each scene is a still next to its text.
- All motion respects the "reduce motion" system setting, and the hero has a pause button.
- Fonts (Instrument Serif, Geist, Geist Mono) load from Google Fonts with system fallbacks.
