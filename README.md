# Z Lab website (redesign concept)

An unofficial redesign concept for the [Z Lab](https://z.engin.umich.edu/) at the
University of Michigan: *Matter in extremes, Machine for extremes.*

Plain HTML, CSS, and JavaScript. There is no build step and there are no dependencies:
open `index.html`, or copy the folder to any web server.

## Pages

| File | What it is |
| --- | --- |
| `index.html` | Home, with the 3D particle hero (liquid, then an atom, then a lattice Z) |
| `research.html` | The two research domains, with two interactive sketches |
| `people.html` | PI, current members, alums |
| `publications.html` | Searchable, filterable publication list with a papers-per-year chart |
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
assets/js/landscape.js   research page: metadynamics sketch
assets/js/swarm.js       research page: robot swarm sketch
assets/js/home.js        home page numbers and recent publications
assets/js/people.js      renders the People page from data/people.js
assets/js/publications.js renders the Publications page from data/publications.js
data/                    people and publications
```

The two interactive sketches are illustrative toy models, not research code or data.

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
  The swarm sketch draws the same mark from a small character bitmap at the top of `swarm.js`.
- All motion respects the "reduce motion" system setting, and the hero has a pause button.
- Fonts (Instrument Serif, Geist, Geist Mono) load from Google Fonts with system fallbacks.
