"""Stamps each page's links to the site's own styles and scripts with a version.

Why: browsers and GitHub Pages keep copies of files for a while. After an update, a
returning visitor can get the new page together with an old copy of the stylesheet or
of a script, and the page then looks broken until the old copy expires. A link such as
assets/css/style.css?v=3f9a1c20b7 is a different address after every change, so the page
and its files always match.

Run it after changing anything under assets/ or data/, before publishing:

    python3 tools/stamp_assets.py            rewrite the links in every page
    python3 tools/stamp_assets.py --check    change nothing; fail if a page is out of date

The version is a hash of every file under assets/ and data/, so it changes exactly when
one of them does, and running the tool twice changes nothing. Scripts that fetch further
files themselves (the game, the robot's model) pass their own version along.

Images named in a page (src="assets/img/...") are stamped too, each with a hash of that one
file, so a replaced photo shows at once and the others stay cached.
"""
import glob
import hashlib
import os
import re
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
LINK = re.compile(r'\b(href|src)="((?:assets|data)/[^"?#]+\.(?:css|js))(?:\?v=[0-9a-f]+)?"')
IMAGE = re.compile(r'\b(href|src)="(assets/img/[^"?#]+\.(?:webp|png|jpe?g|gif|svg|avif))(?:\?v=[0-9a-f]+)?"')


def version():
    digest = hashlib.sha256()
    for folder in ("assets", "data"):
        for base, dirs, files in os.walk(os.path.join(ROOT, folder)):
            dirs.sort()
            for name in sorted(files):
                if name.startswith("."):
                    continue
                path = os.path.join(base, name)
                digest.update(os.path.relpath(path, ROOT).replace(os.sep, "/").encode())
                with open(path, "rb") as fh:
                    digest.update(fh.read())
    return digest.hexdigest()[:10]


def file_version(path):
    """A hash of one file, or None if a page names a file that is not there."""
    full = os.path.join(ROOT, path)
    if not os.path.isfile(full):
        return None
    with open(full, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()[:10]


def stamp_image(match, missing):
    v = file_version(match.group(2))
    if v is None:
        missing.add(match.group(2))
        return match.group(0)
    return '%s="%s?v=%s"' % (match.group(1), match.group(2), v)


def main(check):
    v = version()
    stale = []
    missing = set()
    for page in sorted(glob.glob(os.path.join(ROOT, "*.html"))):
        with open(page, encoding="utf-8") as fh:
            old = fh.read()
        new, count = LINK.subn(lambda m: '%s="%s?v=%s"' % (m.group(1), m.group(2), v), old)
        new, images = IMAGE.subn(lambda m: stamp_image(m, missing), new)
        count += images
        name = os.path.basename(page)
        if new != old:
            stale.append(name)
            if not check:
                with open(page, "w", encoding="utf-8") as fh:
                    fh.write(new)
        print("%-18s %2d links %s" % (name, count, "out of date" if new != old and check else "stamped" if new != old else "current"))
    print("version", v)
    if missing:
        sys.exit("a page names an image that does not exist: " + ", ".join(sorted(missing)))
    if check and stale:
        sys.exit("out of date: " + ", ".join(stale) + ". Run python3 tools/stamp_assets.py")


if __name__ == "__main__":
    main("--check" in sys.argv[1:])
