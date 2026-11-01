"""Fail if an update changed or reordered player rows that were already published.
Usage (from the repo root, after build_data.py):  python3 game/tools/check_stable.py
Compares game/data.json with the version in the last commit (git HEAD)."""
import json, subprocess, sys
old = json.loads(subprocess.run(['git', 'show', 'HEAD:game/data.json'], capture_output=True, text=True, check=True).stdout)
new = json.load(open('game/data.json', encoding='utf-8'))
n = len(old['rows'])
if new['rows'][:n] != old['rows']:
    bad = next(i for i, (a, b) in enumerate(zip(old['rows'], new['rows'])) if a != b) if len(new['rows']) >= n else n
    print('FAIL: published rows changed (first difference at row %d). New events must go in new files under game/data/events/.' % bad)
    sys.exit(1)
gone = {e['id'] for e in old['events']} - {e['id'] for e in new['events']}
if gone:
    print('FAIL: events disappeared:', gone); sys.exit(1)
print('OK: %d published rows unchanged, %d new rows, %d new events' % (n, len(new['rows']) - n, len(new['events']) - len(old['events'])))
