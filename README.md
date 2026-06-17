# Bibliographic Ingest

Scan ISBN and local barcode pairs, look them up, and generate a Destiny-ready MARC 21 file. A single-page web app built for school librarians who need to add books to Follett Destiny faster than typing each record by hand.

Single HTML file. No build step. No framework. Runs in any modern browser.

---

## What it does

Point a USB barcode scanner at a book's ISBN. The cursor advances to a barcode field. Scan the local library barcode you've affixed to the book. The row commits — it's saved to local storage immediately — and a lookup fires in the background against Open Library, falling back to Google Books.

Resolved rows turn green. Unresolved rows surface in a sidebar for manual enrichment. When you finish a batch, click **Complete ingestion job** and the app writes a binary MARC 21 (`.mrc`) file you can upload directly into Follett Destiny under **Catalog > Import Titles**.

## Why it exists

Cataloging a donated cart of 60 books in Destiny by hand is roughly 90 minutes of typing. Cataloging the same cart with this app is roughly 15 minutes of scanning, plus a few minutes editing the records Open Library doesn't fully resolve. The MARC output is byte-compatible with what Destiny expects.

---

## Requirements

- Any modern browser (Chrome, Firefox, Safari, or Edge from the last few years)
- A USB barcode scanner — any HID-compliant model works (they type the scanned digits and emit Enter)
- Internet access for lookups (the app itself runs offline once loaded; scans persist, lookups queue and retry on reconnect)
- ISBNs printed on the books you're cataloging

## Quick start

### For librarians

1. Open the deployed app in your browser.
2. Click **Start new ingestion**.
3. Set the cataloging code (your library's MARC organization code, e.g. `LRRM`), pick the audience level for the batch (Juvenile / Young Adult / Adult), choose the Dewey fallback for books with no Dewey number (`E` for picture books or `[Fic]` for fiction), and name the batch.
4. Scan the book's ISBN, then the local barcode. Repeat.
5. When the cart is done, click **Complete ingestion job**. A `.mrc` file downloads.
6. In Destiny, go to **Catalog > Import Titles**, upload the `.mrc`, follow the prompts.

### For local development

```bash
git clone https://github.com/<your-username>/<this-repo>
cd <this-repo>
python3 -m http.server 8000
# Open http://localhost:8000
```

You can also open `index.html` directly from disk, but some browsers block API calls from `file://` origins. A yellow banner in the app explains the issue and gives the one-line fix.

---

## Architecture

The entire app is one file. No bundler, no transpiler, no dependencies installed. Everything is inline:

```
index.html
├── <head>
│   └── Google Fonts: Manrope, Geist, Geist Mono (with system fallbacks)
├── <style>
│   ├── Crayon Box design tokens (light + dark)
│   ├── Sky header (gradient + stars)
│   ├── Components (buttons, tables, modals, chips)
│   └── Responsive rules
├── <body>
│   ├── Sky header (live gradient, theme toggle, network indicator)
│   ├── file:// banner (dismissable)
│   └── #view-root (home / setup / ingest / complete views)
└── <script>
    ├── CONSTANTS — statuses, audience codes, sky keyframes
    ├── STATE — in-memory app state
    ├── UTIL — helpers
    ├── INDEXEDDB — promise wrapper around IDB
    ├── LOOKUP — Open Library + Google Books (with JSONP fallback)
    ├── MARC — ISO 2709 binary writer
    ├── SKY & THEME — time-of-day interpolation, theme management
    ├── RENDER — view rendering
    └── INIT
```

### Data model

IndexedDB has two object stores:

```
groups: {
  id:        string,
  name:      string,
  createdAt: number,
  completedAt: number | null,
  settings: {
    catalogCode:     string,   // → MARC 040 $a, $c
    audienceKey:     string,   // 'juvenile' | 'young_adult' | 'adult'
    defaultLanguage: string,
    fictionFallback: string,   // 'E' or '[Fic]'
  }
}

rows: {
  id:        string,
  groupId:   string,   // indexed
  isbn:      string,
  barcode:   string,
  status:    'pending' | 'looking_up' | 'resolved' | 'edited' | 'failed' | 'offline_queued',
  data:      { title, authors[], publishers[], pubYear, pages,
               illustrations, dimensions, language, dewey, subjects[], summary } | null,
  source:    'openlibrary' | 'googlebooks' | 'manual' | null,
  errorMsg:  string | null,
  createdAt, updatedAt: number,
}
```

Every state change writes back to IndexedDB immediately. Closing the tab mid-session and reopening it later restores the exact same state.

### MARC 21 output

The writer produces **MARC 21 / ISO 2709 binary**, suitable for direct ingest into Follett Destiny. It was verified byte-for-byte against a known-good Destiny export.

Per-record field mapping:

| Tag  | Subfields & indicators | Source                                                   |
|------|------------------------|----------------------------------------------------------|
| 001  | data                   | Local barcode (also appears in 852 $p)                   |
| 005  | data                   | Last-modified timestamp (`YYYYMMDDHHMMSS.0`)             |
| 008  | data                   | Date entered + pub year + audience byte + language code  |
| 020  | `$a`                   | ISBN (13- or 10-digit)                                   |
| 040  | `$a $b $e $c`          | Catalog code, `eng`, `rda`, catalog code                 |
| 092  | `$a`                   | Dewey + Cutter, or fiction-fallback + Cutter             |
| 100  | `1_ $a`                | First author (surname-first form)                        |
| 245  | `1_ 0_ $a $c`          | Title + statement of responsibility                      |
| 264  | `_1 $a $b $c`          | Place (placeholder if unknown), publisher, year          |
| 300  | `$a $b $c`             | Pages, illustrations, dimensions                         |
| 336  | constant `$a $b $2`    | `text / txt / rdacontent`                                |
| 337  | constant `$a $b $2`    | `unmediated / n / rdamedia`                              |
| 338  | constant `$a $b $2`    | `volume / nc / rdacarrier`                               |
| 520  | `$a`                   | Summary (from API, or templated fallback)                |
| 650  | `_0 $a`                | Subject headings (one 650 per subject, up to 8)          |
| 852  | `$h $p $t`             | Call number, local barcode, copy number                  |

A few notes worth highlighting for contributors:

- The `008` is **30 characters**, not the standard 40. This matches the sample `.mrc` Destiny was already accepting. If your ILS rejects it, switch to a standard 40-char layout in `buildMarcRecord()`.
- The `001` carries the **local barcode** (not a national bibliographic identifier). This is per the Destiny-style records in the sample. If you're targeting a different ILS, you may want OCLC or LCCN here instead.
- Duplicate ISBNs within the same job auto-increment `852 $t` (`1`, `2`, `3`, …).
- Subject indicator 2 is `0` (LCSH). If your subject vocabulary is different, change the `650` indicator in `buildMarcRecord()`.

### Cutter rules

The Cutter (the alphabetic suffix of a call number, e.g. `GLY` in `305.9 GLY`):

1. First 3 letters of the first author's surname, uppercased. If the name is stored "Last, First", the part before the comma is used.
2. If there's no author, first 3 letters of the title, skipping leading "The/A/An".

### Lookup pipeline

```
ISBN scanned
   ↓
Open Library: bibkeys endpoint (fetch)
   ↓ if fetch fails with a CORS/network error
Open Library: same endpoint via JSONP (script tag, bypasses CORS)
   ↓ if both fail
Google Books: volumes endpoint (fetch)
   ↓ if all fail
Row marked failed, surfaced in unresolved sidebar
```

Both APIs are queried browser-direct. No API keys. No proxy.

### Sky and theme

`SKY_KEYFRAMES` is an array of 13 `{ hour, top, mid, horizon }` tuples spanning midnight to midnight. `computeSky(hour)` finds the surrounding pair and linearly interpolates. The sky updates every 60 seconds, and on tab visibility change.

Star opacity ramps from 0 at 6:30am to full at 7:30pm and back. Text color over the bar flips between dark and light based on horizon perceived-brightness, so labels remain readable through every part of the cycle.

Effective theme is `'auto' | 'light' | 'dark'`, stored in `localStorage`. In auto mode, the app uses Crayon Box's Twilight Ink palette between 19:30 and 06:00, Warm Paper otherwise.

---

## Contributing

The single-file architecture is a feature. It keeps the deployment story simple (one commit, one file) and means you can read the entire application without context-switching. Contributions are welcome; please preserve this property unless there's a strong reason not to.

### How to contribute

1. Open an issue describing the problem or proposal first. For bug reports, include browser + OS + a sample ISBN that reproduces the issue.
2. Fork the repo. Make changes in `index.html`.
3. Test in Chrome and Safari at minimum. Verify scanning, lookups, edit modal, MARC export, theme switching, and offline behavior all still work.
4. If you change the MARC writer, verify your output against a known-good ILS. The original verification used `pymarc` to parse both the sample and the generated file and confirmed identical field structures.
5. Open a pull request.

### Code style

- Vanilla JS. No frameworks. No build step.
- IndexedDB calls go through the promise wrapper at the top of the script.
- DOM events go through the single dispatcher in `document.addEventListener('click', ...)`. Use `data-action` attributes; don't add ad-hoc handlers.
- CSS uses tokens. No hex colors in component styles — define a token in `:root` (and its dark equivalent in `[data-theme="dark"]`) and reference it.
- Functions are flat, not nested in classes or modules. Section comments separate concerns.

### Areas open to contributions

- **Additional bibliographic sources.** Library of Congress SRU and OCLC WorldCat both have richer data than Open Library for less-common books. Both require a CORS proxy or a small server-side component.
- **More MARC fields.** 490 series statements, 500 general notes, 700 added author entries, 856 electronic resource links.
- **ILS-specific output variants.** Sirsi Symphony, Koha, Evergreen, Alma each have small MARC quirks.
- **Internationalization.** All UI copy is currently English. Strings are inline in render functions and would need extraction.
- **Service Worker.** Would enable true first-open-offline (currently the page must be loaded once with network).
- **Bulk import.** Drag-and-drop a CSV of ISBN + barcode pairs instead of scanning live.

---

## Known limitations

- **Open Library data quality varies.** Picture books and recent self-published titles often have sparse records. The Edit modal exists for this reason — most batches will have a handful of rows requiring manual touch-up.
- **No Service Worker.** Opening the page for the first time while offline won't work. After one online load, the browser cache covers most cases.
- **Local storage is per-browser.** Two librarians ingesting on different machines can't see each other's batches. There's no server-side sync.
- **GitHub Pages requires a public repo** for the free tier. The HTML file contains nothing sensitive, so this is fine in practice. GitHub Pro supports private Pages.
- **Manrope, Geist, and Geist Mono load from Google Fonts.** If the page is opened while offline before the fonts are cached, the system fallback stack is used (functionally fine, visually different).

---

## Deployment

The app is deployed via **GitHub Pages** with a custom domain. To deploy your own copy:

1. Fork the repository.
2. Repo **Settings → Pages**. Set source to **Deploy from a branch**, branch `main`, folder `/`.
3. (Optional) Set a custom domain in the same panel. If you do, configure DNS A records on your domain pointing to GitHub's IPs:
   ```
   185.199.108.153
   185.199.109.153
   185.199.110.153
   185.199.111.153
   ```
   And a CNAME for `www` pointing to `<your-username>.github.io`.
4. Enable **Enforce HTTPS** once DNS verification succeeds.

Updates: edit `index.html`, commit, push. The new version is live within ~30 seconds.

---

## Credits

- **Bibliographic data:** [Open Library](https://openlibrary.org/) (primary) and [Google Books](https://books.google.com/) (fallback). Both are queried browser-direct, no API key.
- **Design language:** the Warm Paper / Twilight Ink palette and the Manrope + Geist + Geist Mono typography stack are adapted from the [Crayon Box, Inc.](https://crayonbox.ai/) brand guidelines. This project is not affiliated with Crayon Box.
- **MARC 21 reference:** the [Library of Congress MARC documentation](https://www.loc.gov/marc/).

---

## License

Not yet specified. If you plan to fork, redistribute, or build commercially on this work, please open an issue first.

For an eventual open source license, MIT or Apache 2.0 are the usual defaults for a project this size — see [choosealicense.com](https://choosealicense.com/) for the trade-offs.
