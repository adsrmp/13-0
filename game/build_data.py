"""Turn the raw vlr.gg stats tables in data/ into game/data.json for 13-0.

Files read (see UPDATING.md for the formats):
  data/raw_*.txt         the original 18 international events (never reorder these)
  data/events/*.txt      every event added later, one file each, named NNN_<eventid>.txt
  data/meta.txt          map pick rates per event (optional per event)
  data/teams.txt         TAG|Team name|Region
  data/born.txt          player|birth year (optional)

Player rows keep the order of the files above, and new event files sort after the old ones,
so adding an event never changes the ids of rows that already exist.
"""
import json, glob, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')
REGIONS = ('Americas', 'EMEA', 'Pacific', 'China')
INTL = ('Masters', 'Champions')
TYPES = INTL + ('League', 'Ascension', 'Challengers')

# ---------- teams ----------
TEAMS = {}
for line in open(os.path.join(DATA, 'teams.txt'), encoding='utf-8'):
    line = line.strip()
    if not line or line.startswith('#'):
        continue
    tag, name, reg = line.split('|')
    assert reg in REGIONS, ('bad region', line)
    assert tag not in TEAMS, ('duplicate tag', tag)
    TEAMS[tag] = (name, reg)

def team_region(tag, year):
    if tag == 'G2':
        return 'EMEA' if year <= 2022 else 'Americas'
    if tag == 'FPX':
        return 'EMEA' if year <= 2023 else 'China'
    return TEAMS[tag][1]

TAGS = sorted(TEAMS, key=len, reverse=True)

def split_tag(s):
    s = s.strip()
    if ' ' in s:
        name, last = s.rsplit(' ', 1)
        if last in TEAMS:
            return name, last
    for t in TAGS:
        if s.endswith(t) and len(s) > len(t):
            return s[: -len(t)], t
    raise ValueError('Unknown team tag at the end of "%s". Add the team to data/teams.txt.' % s)

# ---------- agents ----------
ROLE = {}
for a in 'Jett Reyna Raze Phoenix Yoru Neon Iso Waylay'.split(): ROLE[a] = 'Duelist'
for a in 'Sova Breach Skye Kayo Fade Gekko Tejo'.split(): ROLE[a] = 'Initiator'
for a in 'Brimstone Omen Viper Astra Harbor Clove'.split(): ROLE[a] = 'Controller'
for a in 'Killjoy Cypher Sage Chamber Deadlock Vyse Veto'.split(): ROLE[a] = 'Sentinel'
# New agent? Add it to the right line above (and to AG_SHORT in app.html if two letters would clash).

def num(x):
    x = x.strip().rstrip('%')
    return float(x) if x else None

# ---------- events and rows ----------
BASE = sorted(glob.glob(os.path.join(DATA, 'raw_*.txt')))
files = BASE + sorted(glob.glob(os.path.join(DATA, 'events', '*.txt')))
events, rows = {}, []
n_base = None
for f in files:
    if f not in BASE and n_base is None:
        n_base = len(rows)
    cur = None
    for ln, line in enumerate(open(f, encoding='utf-8'), 1):
        line = line.rstrip('\n')
        if not line.strip() or (line.startswith('#') and not line.startswith('## ')):
            continue
        if line.startswith('## '):
            parts = line[3:].split('|')
            eid, name, year, typ, win, vlr = parts[:6]
            extra = dict(p.split('=', 1) for p in parts[6:])
            assert typ in TYPES, (f, 'event type must be one of', TYPES)
            assert eid not in events, ('duplicate event id', eid)
            assert re.fullmatch(r'\d{4}-\d{2}-\d{2}', extra.get('end', '')), (f, 'add end=YYYY-MM-DD to the header')
            ev = dict(id=eid, name=name, year=int(year), type=typ, winner=win, vlr=int(vlr),
                      city=extra.get('city', ''), end=extra['end'])
            if typ not in INTL:
                assert extra.get('region') in REGIONS, (f, 'regional events need region=Americas|EMEA|Pacific|China')
                ev['region'] = extra['region']
            if extra.get('note'):
                ev['note'] = extra['note']
            events[eid] = ev
            cur = eid
            continue
        parts = line.split(',')
        assert len(parts) == 13, (f, ln, 'expected 13 comma-separated fields', line)
        pl, ag, rnd, rat, acs, kd, kast, adr, kpr, apr, fk, fd, hs = parts
        name, tag = split_tag(pl)
        fk, fd = num(fk), num(fd)
        if fk is not None and fk >= 1: fk /= 100
        if fd is not None and fd >= 1: fd /= 100
        agents = [a for a in ag.split(';') if a and not a.startswith('+')]
        for a in agents:
            assert a in ROLE, (f, ln, 'unknown agent', a)
        assert agents, (f, ln, 'no agents')
        rows.append(dict(p=name, t=tag, e=cur, ag=agents, rnd=int(rnd), r=num(rat), acs=num(acs), kd=num(kd),
                         kast=num(kast), adr=num(adr), kpr=num(kpr), apr=num(apr), fk=fk, fd=fd, hs=num(hs)))

# Some events (Masters Shanghai 2024) have no Rating column on vlr: estimate it with a least-squares fit on the rest.
missing = [r for r in rows if r['r'] is None]
if missing:
    import numpy as np
    feat = ['acs', 'kd', 'adr', 'kpr', 'apr', 'fk', 'fd']
    # fit on the original 18 events only, so adding events never changes these estimates
    train = [r for r in rows[:n_base if n_base is not None else len(rows)] if r['r'] is not None and all(r[k] is not None for k in feat)]
    X = np.array([[r[k] for k in feat] + [1] for r in train]); y = np.array([r['r'] for r in train])
    coef, *_ = np.linalg.lstsq(X, y, rcond=None)
    for r in missing:
        assert all(r[k] is not None for k in feat), ('cannot estimate rating', r)
        r['r'] = round(float(np.dot([r[k] for k in feat] + [1], coef)), 2)
        r['est'] = 1

for r in rows:
    w = {}
    for i, a in enumerate(r['ag']):
        w[ROLE[a]] = w.get(ROLE[a], 0) + (3 - i if i < 3 else 0.5)
    r['role'] = max(w, key=w.get)
    ev = events[r['e']]
    r['reg'] = ev.get('region') or team_region(r['t'], ev['year'])

# ---------- map meta (optional per event) ----------
meta, cur = {}, None
for line in open(os.path.join(DATA, 'meta.txt'), encoding='utf-8'):
    line = line.strip()
    if not line or (line.startswith('#') and not line.startswith('## ')): continue
    if line.startswith('## '):
        cur = line[3:]; assert cur in events, ('meta for unknown event', cur); meta[cur] = []; continue
    m, played, atk, dfn, picks = line.split('|')
    meta[cur].append(dict(map=m, n=int(played), atk=int(atk), dfn=int(dfn),
                          picks=[[a.split(':')[0], int(a.split(':')[1])] for a in picks.split(';')]))
for ev in meta.values():
    for m in ev:
        for a, _ in m['picks']:
            assert a in ROLE, a

# ---------- birth years (optional) ----------
born = {}
for line in open(os.path.join(DATA, 'born.txt'), encoding='utf-8'):
    line = line.strip()
    if not line or line.startswith('#'): continue
    p, y = line.rsplit('|', 1)
    assert 1985 <= int(y) <= 2012, line
    born[p.strip().lower()] = int(y)

# ---------- in-game leaders (optional) ----------
igl = {}
present = {}
for r in rows: present.setdefault(r['e'] + '|' + r['t'], set()).add(r['p'].lower())
p_igl = os.path.join(DATA, 'igl.txt')
if os.path.exists(p_igl):
    for line in open(p_igl, encoding='utf-8'):
        line = line.strip()
        if not line or line.startswith('#'): continue
        e, t, pl = line.split('|')
        k = e + '|' + t
        assert k in present, ('igl.txt: no roster for', k)
        assert pl == '-' or pl.lower() in present[k], ('igl.txt: player not on that roster', line)
        igl[k] = pl.lower()

# ---------- checks ----------
order = sorted(events, key=lambda e: (events[e]['end'], e))
bad = []
for eid in order:
    by = {}
    for r in rows:
        if r['e'] == eid: by.setdefault(r['t'], []).append(r)
    assert by, ('event has no rows', eid)
    for t, ps in by.items():
        if len(ps) < 5: bad.append((eid, t, len(ps)))
    assert events[eid]['winner'] in by, ('winner has no rows', eid, events[eid]['winner'])

out = dict(events=[events[e] for e in order], teams={k: v[0] for k, v in TEAMS.items()}, roles=ROLE,
           rows=rows, meta=meta, born=born, igl=igl)
json.dump(out, open(os.path.join(HERE, 'data.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
by_type = {}
for e in events.values(): by_type[e['type']] = by_type.get(e['type'], 0) + 1
print('events', len(events), by_type, '| rows', len(rows), '| players', len({r['p'].lower() for r in rows}), '| birth years', len(born), '| IGLs', sum(1 for v in igl.values() if v != '-'))
print('teams with <5 players (left out of draft spins):', bad)
