# Dataset provenance and attribution

| Source id | Dataset | Licence | In this repo | How it was adapted |
|---|---|---|---|---|
| `emotion-dictionary` | The Emotion Dictionary v1.0.0 — https://emotioninside.org/ | CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), as stated by the project owner | `data/sources/emotion-dictionary-v1.0.0.csv` (unmodified) | Modified: the generated database carries slug, name, family, valence, arousal, neighbours and colour only. Colours are treated as the publisher's editorial choice. |
| `colour-emotion-survey` | Jonauskaite, D., Epicoco, D., & Mohr, C. (2025). Free Association Database for a 62-Word Dataset Including Emotion and Colour Terms. *Journal of Open Psychology Data*, 13:4. doi:10.5334/jopd.140. Data: https://osf.io/xzcbg/ | CC BY 4.0 | `data/derived/survey-emotion-colour-counts.csv` only. The raw workbook is **not** in the repo. | Modified: English subset aggregated to colour-word counts per emotion cue. No participant ids, demographics or individual responses. |
| `colorcombinations` | The Dictionary of Color Combinations — https://colorcombinations.org/ (palettes, colours, collections). Plates after Sanzo Wada (1933), digitised by mattdesl/dictionary-of-colour-combinations. | Site curation CC BY 4.0; Wada plates public domain; digitisation MIT | `data/sources/palettes.csv`, `colors.csv`, `collections.csv` (unmodified) | Modified: hex values, colour names, mood tags and collection keywords only. Descriptive copy is not carried into the database. |
| `palette-ai-curated` | Palette AI curated vibe layer | Project-owned | `data/curated/vibes.json` | Written for this project. Application-inferred, not research. |

Notes

- The survey authors report limits that apply here: uneven samples, more women than men, many university students, self-reported
  fluency, data collected 2019–2023. Only 7 emotion → colour associations met the threshold for inclusion.
- If you publish the app, show the three attributions above somewhere visible (an About page is enough).
