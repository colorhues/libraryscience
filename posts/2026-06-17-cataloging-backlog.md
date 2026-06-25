---
title: Why hand-cataloging the donations stack wasn't going to scale
date: 2026-06-17
tags: [tools]
---

An 80-book donation came in last week. Each book would normally mean copying ISBN data into Destiny by hand — about ten minutes a record between looking up the bibliographic info, transcribing it, and triple-checking the call number.

I started timing it on the second book and stopped on the fifth. About eight and a half minutes average. Eighty books would take a full school day, and I had two hours.

So I built the first version of [MARC File Creator](/marc-file-creator/) to see if I could get that under thirty seconds. Got it to fifteen.

The trick was that ninety percent of what gets typed into Destiny is already in Open Library or Google Books, just sitting there as a JSON response one HTTP request away. The remaining ten percent — local barcode, call number, copy number — is the part that genuinely has to be human-entered.

Now the workflow is: scan ISBN, scan local barcode, scan next book. Twelve seconds. The cataloging backlog cleared in under an hour.

The first AI-assisted tool of the project, and the one that's been most immediately useful. Other ideas in the queue: a shelf-reading checklist generator, a "where does this book belong" lookup that takes a Dewey number and tells you which physical shelf it's on, and something to help with the read-aloud calendar.
