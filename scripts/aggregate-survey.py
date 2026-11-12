"""Aggregates DATA_ENGLISH.xlsx (Jonauskaite, Epicoco & Mohr, 2025; CC BY 4.0) into colour-word counts per emotion cue.

Only two things leave this script: the cue word and how many responses named each colour.
No participant IDs, demographics, dates or individual responses are written. The raw workbook
is not kept in the repository.

Usage: python3 scripts/aggregate-survey.py path/to/DATA_ENGLISH.xlsx > data/derived/survey-emotion-colour-counts.csv
"""
import collections, csv, sys
import openpyxl

EMOTION_CUES = ['Interest', 'Amusement', 'Pride', 'Joy', 'Contentment', 'Admiration', 'Love', 'Relief', 'Compassion', 'Pleasure',
                'Sadness', 'Guilt', 'Regret', 'Shame', 'Disappointment', 'Fear', 'Disgust', 'Contempt', 'Hate', 'Anger', 'Peace']
COLOURS = {'red': 'red', 'blue': 'blue', 'green': 'green', 'yellow': 'yellow', 'orange': 'orange', 'pink': 'pink', 'purple': 'purple',
           'violet': 'purple', 'black': 'black', 'white': 'white', 'grey': 'grey', 'gray': 'grey', 'brown': 'brown', 'gold': 'yellow',
           'golden': 'yellow', 'turquoise': 'teal'}

ws = openpyxl.load_workbook(sys.argv[1], read_only=True)['ALL']
rows = ws.iter_rows(values_only=True)
header = [str(h).strip() if h else '' for h in next(rows)]
index = {cue: header.index(cue) for cue in EMOTION_CUES}
counts = {cue: collections.Counter() for cue in EMOTION_CUES}
totals = collections.Counter()
for row in rows:
    for cue, i in index.items():
        value = str(row[i]).strip().lower() if row[i] is not None else ''
        if not value or value == 'na':
            continue
        totals[cue] += 1
        if value in COLOURS:
            counts[cue][COLOURS[value]] += 1

out = csv.writer(sys.stdout)
out.writerow(['cue', 'colour', 'count', 'valid_responses'])
for cue in EMOTION_CUES:
    for colour, n in counts[cue].most_common():
        out.writerow([cue.lower(), colour, n, totals[cue]])
