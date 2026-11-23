# ASL motion examples

Fifty-nine selected training recordings from PopSign ASL v1.0, game category (2023), by Thad Starner, Sean Forbes, Matthew So, David Martin, Rohit Sridhar, Gururaj Deshpande, Sam Sepah, Sahir Shahryar, Khushi Bhardwaj, and collaborators. Published by Georgia Institute of Technology and Deaf Professional Arts Network.

Source and license statement: https://signdata.cc.gatech.edu/view/datasets/popsign_v1_0/
License: Creative Commons Attribution 4.0 International — https://creativecommons.org/licenses/by/4.0/

Changes: resized to 480-pixel width and compressed to H.264 MP4, audio removed, playback duration retained. The player optionally slows or repeats playback. These are individual labeled examples, not narrated lessons; sign variants exist. No endorsement by the authors is implied. Original archive URLs, member names, and original/derived SHA-256 checksums are in `sources.json` (original thirteen) and `catalog-sources.json` (forty-six additional examples).

The searchable library also links to publisher-hosted PopSign v2.1 previews and ASLU/Lifeprint lessons. Those external videos are not copied or redistributed. A related-word lesson does not demonstrate an entire English phrase.

Nineteen further files in this folder are ASL Citizen clips, not PopSign: the core seven (`belt`, `eat`, `empty`, `peg`, `soccer`, `squeeze`, `vlog`) and the extended twelve (`lock`, `duck`, `baseballcap`, `other`, `whatfor`, `drag`, `microscope`, `party`, `demand`, `edit`, `mechanic`, `deaf`). See the core-word section below for their source, changes and licence caveat.

## Daily conversation embedded lessons

NAME, WANT and LOVE use official ASL University / Bill Vicars YouTube embeds, linked from these publisher lessons. These recordings are not downloaded or rehosted.

- NAME: https://www.lifeprint.com/asl101/pages-signs/n/name.htm — YouTube GbeC9TFuSX4
- WANT: https://www.lifeprint.com/asl101/pages-signs/w/want.htm — YouTube IRUlCZ9jRjM
- LOVE: https://www.lifeprint.com/asl101/pages-signs/l/love.htm — YouTube DAZB0eVf5t0

HOME and HAVE reuse the already credited local PopSign examples. Publisher videos may use a different signing variant from the recognition training data; watching a lesson does not guarantee a match.

## Core and extended examples (ASL Citizen)

`belt.mp4`, `eat.mp4`, `empty.mp4`, `peg.mp4`, `soccer.mp4`, `squeeze.mp4` and
`vlog.mp4` are the Watch & practice examples for the seven core words. The twelve
extended-tier files (`lock`, `duck`, `baseballcap`, `other`, `whatfor`, `drag`,
`microscope`, `party`, `demand`, `edit`, `mechanic`, `deaf`) use the same pipeline.
They come from the **ASL Citizen** research dataset (Microsoft Research) — the
same dataset the model was trained on — and are *not* PopSign clips, so the
CC BY 4.0 credit above does not cover them.

- Dataset and terms: https://www.microsoft.com/en-us/research/project/asl-citizen/
- Split: test (the held-out clips used for the reported per-word results)
- Changes: audio track removed, scaled to 480 px wide, trimmed to a 2.2 s window
  starting at sign onset, re-encoded H.264 (CRF 26) with faststart
- Provenance for the core seven (original file name, participant, gloss, ASL-LEX
  code, source and derived SHA-256, clip window): `core-sources.json`

**Licence caveat.** ASL Citizen is released for research use, not under a
Creative Commons licence, and its terms restrict redistribution of the
recordings. These nineteen files are bundled so the coursework demo has a local
example for every core and extended word. Remove or replace them before publishing
the site publicly; the player falls back to the Signing Savvy lesson link when a
file is missing.

