# Z Lab website (redesign concept)

An unofficial redesign concept for the [Z Lab](https://z.engin.umich.edu/) at the
University of Michigan: *Matter in extremes, machine for extremes.*

Plain HTML, CSS, and JavaScript. There is no build step and there are no dependencies:
open `index.html`, or copy the folder to any web server.

## The idea: a paper whose figures are alive

The site reads like a physics paper. White page, ink, one hairline gray, Michigan blue for
links, and maize used the way a highlighter is used: behind a few words, and as the one
filled mark in a figure. Sections and figures are numbered, tables are set with three rules,
and nothing is boxed, rounded, or shadowed. The only things that move are the figures, and
every figure shows something from the lab's own work.

The rules are written at the top of `assets/css/style.css`. Three matter most when adding
to the site:

- **A figure must trace to a source.** Each one cites the paper, code, or public talk it
  comes from, in its caption and again in a comment at the top of its script.
- **A figure says what kind of thing it is.** The small line under each caption reads
  "Re-plot of published values", "A model: the paper's equation with its published values,
  run in your browser", or "A concept illustration". Nothing is drawn that the source does
  not give: where a paper publishes only a plot, the figure draws the fitted law and says so
  instead of inventing points.
- **Maize marks one thing.** It is the point being read, the selected series, the player in
  the game. Everything else is ink.

## Pages

| File | What it is |
| --- | --- |
| `index.html` | Home: the lab's statement as an abstract, a contents list, Fig. 1 (a liquid simulated in the browser with its pair distribution function and structure factor), the lab in numbers beside Fig. 2 (the soft arm), recent papers, contact |
| `research.html` | The two research domains, each theme followed by figures built from the lab's papers (see the table below) |
| `people.html` | PI, current members, alums |
| `publications.html` | Searchable, filterable publication list with two figures that double as filters: papers per year, and the journals with the most papers |
| `code.html` | Software |
| `teaching.html` | Courses |
| `calendar.html` | The two embedded Google calendars |
| `404.html` | Not-found page (used automatically by GitHub Pages) |

File names match the current site, so existing links keep working if this replaces it.

## Figures and where they come from

| Page | Figure | Kind | Source |
| --- | --- | --- | --- |
| Home | A liquid, its g(r) and S(k) | Model | Definitions from LiquidLib (Walter et al., Comput. Phys. Commun. 2018); the liquid is a two-dimensional Lennard-Jones model for illustration |
| Home | The underwater soft arm | Line drawing | Null et al., RoboSoft 2023; Null et al., IEEE Robot. Autom. Lett. 2024 |
| Research | Flood the landscape | Model | Pentane's energy landscape (Eq. 1 and its constants) and the barcode summary of Mirth et al., J. Chem. Phys. 2021; the walker is textbook metadynamics |
| Research | The water that never froze | Re-plot | Table 1 of Liu et al., Proc. Natl. Acad. Sci. U.S.A. 2007 |
| Research | Fragile to strong | Model | Fitted laws from Chen et al., J. Chem. Phys. 2006 and Zhang et al., J. Chem. Phys. 2009 |
| Research | A pinch of fission product in a reactor salt | Model and re-plot | Table 3 of Rakib et al., ACS Appl. Energy Mater. 2025; Table III of Grizzi et al., Phys. Rev. Mater. 2026 |
| Research | Two clocks in a glass-forming salt | Re-plot | The measured curves and fitted values in the open Source Data file of Luo et al., Nature Commun. 2022 (CC BY 4.0) |
| Research | Softer when charged | Model | The Huggins fits (Table 1) and conductivity relation of Farag et al., Phys. Chem. Chem. Phys. 2023 |
| Research | Where the straight line ends | Model | The Arrhenius fit of Jaiswal et al., J. Phys. Chem. B 2016 |
| Research | From 100 atoms to 100,000 | Re-plot | Lee et al., J. Phys. Chem. B 2021; Lee and Z, J. Chem. Phys. 2024; Murg et al., J. Appl. Phys. 2025; Grizzi et al., Phys. Rev. Mater. 2026 |
| Research | Be the controller: steer the underwater arm | Simplified model, with the paper's limits and scores | Null et al., RoboSoft 2023; Null et al., IEEE Robot. Autom. Lett. 2024 |
| Research | Soft is not linear | Model and re-plot | Wandke and Z, IEEE Access 2021 (the material law) and 2023 (Tables 1 to 3) |
| Research | Lose two, keep going | Concept illustration | The PI's Michigan Robotics seminar (2025) and the Atombot page of the Multidisciplinary Design Program |
| Publications | Papers per year; where the work appears | Charts | `data/publications.js` |

The swarm figure is a concept illustration, the only figure without a paper behind it, because
the lab has not published on those robots yet. Replace it when it does.

One figure uses a paper's own data file. `assets/js/figs/clocks-data.js` holds measured values
copied from the Source Data file of Luo et al., Nature Communications 13, 2092 (2022),
which is published under the Creative Commons Attribution 4.0 International License. The
file's header and the figure's caption carry the credit; keep both if the figure moves.

## Updating content

Most routine updates are a one-line change to a data file. The comment at the top of
each file explains the fields.

- **Add a paper:** `data/publications.js`. Copy an entry and paste it at the top.
  The Publications page, the home page list, and the numbers table update themselves.
- **Add or move a person:** `data/people.js`. Drop their photo in `assets/img/people/`,
  cropped square with the face centered and the eyes a little above the middle so it lines
  up with the rest (about 560 px a side is plenty; WebP or JPEG). People without a photo
  get a monogram. Moving someone to `alumni` is a cut and paste.
- **Everything else** (research text, software, courses) is ordinary HTML in the page files.
  The header and footer are repeated in each page, so a navigation change means editing
  all eight.

### Adding a figure to Research

1. Write `assets/js/figs/<name>.js`: one self-contained script that finds
   `[data-fig="<name>"]` and draws with the shared tools in `assets/js/figkit.js`
   (`ZFig.canvas`, `axes`, `path`, `dot`, `text`, `rule`, `run`, `pointer`). Start it with a
   comment naming the source and saying which numbers are published values and which are
   modeled. `assets/js/figs/water-density.js` is the shortest example to copy.
2. Add an `<article class="unit">` to `research.html` in the same shape as the others: a
   short text with a link to the paper, the `<figure class="unit-fig" data-fig="<name>">`, a
   caption that begins with `<b class="fig-no"></b>` (the number is filled in by a counter)
   and ends with a `<span class="fig-kind">`, and a "View as table" when the figure shows
   tabular data.
3. Add the script tag at the bottom of `research.html`.

A figure should work at 320 px wide, be usable from the keyboard (native inputs and
buttons), start paused under "reduce motion" (`ZFig.run` does this), and show a meaningful
picture before anyone touches it.

## Layout

```
assets/css/style.css        all styles; the design decisions and tokens are at the top
assets/js/theme-init.js     marks the page as script-enabled before first paint
assets/js/site.js           navigation menu, shared helpers, the game's loader
assets/js/home.js           home page numbers table, contents details, recent publications
assets/js/liquid.js         Home Fig. 1: the simulated liquid, g(r), and S(k)
assets/js/figkit.js         shared drawing tools for the Research figures (window.ZFig)
assets/js/figs/             one script per Research figure (clocks-data.js is generated, see tools/)
tools/make_clocks_data.py   rebuilds clocks-data.js from the paper's Source Data spreadsheet
assets/js/people.js         renders the People page from data/people.js
assets/js/publications.js   renders the Publications page from data/publications.js
assets/js/game.js           "Rare Event", the hidden game; loaded only when a visitor opens it
assets/css/game.css         styles for the game
data/                       people, publications, and the game's leaderboard settings
```

## Charts on Publications and Home

The charts are drawn from `data/publications.js` and `data/people.js`, so they update with
the data. They follow one small set of rules, kept in `style.css` under "Figures and charts":

- **One message each.** The line under a figure's title says what it shows in plain words
  ("97 since 2006, most in 2021"), and it is rewritten when a filter changes the numbers.
- **One series color.** `--viz` is the ink of the marks, `--viz-hi` the mark being read or
  selected, `--viz-ghost` the full count shown faintly behind a filtered one, and `--viz-quiet`
  the marks that are context.
- **Labels are sparing and text is never colored like the data.** Only the peak, the selected
  mark, and ranked rows carry a number. Everything else is on the axis, in the tooltip, and
  in the "View as table" under each figure, so no value depends on hovering.
- **The scale never moves.** A filter does not rescale a figure; the faint mark keeps the
  full count in view behind the papers that match.

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
- There is a game, Rare Event: pilot the Atombot mark through a sample that cycles through
  liquid, crystal, gas, and glass, and catch rare events. It is drawn like the figures, ink
  on paper. It opens from the "Play Rare Event" button in every footer and on the 404 page;
  by typing "atombot"; or by opening any page with `#play` (handy for sharing). To remove
  it, delete `game.js`, `game.css`, the loader block in `site.js`, and the `data-game`
  buttons in the pages.
- The LiquidLib documentation site and repository linked from the official site return
  "not found" (checked November 2026), so the Software page links to the LiquidLib paper
  instead. Restore the links if the lab republishes them.
- All motion respects the "reduce motion" system setting: figures that animate start paused
  and keep their Play button.
- Fonts (STIX Two Text, IBM Plex Sans, IBM Plex Mono) load from Google Fonts with system
  fallbacks.
