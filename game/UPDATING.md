# Updating 13–0 when an event finishes

This is the runbook the scheduled check follows. Everything happens in this repo; pushing to `main`
makes Cloudflare (Workers Builds) redeploy the site in a couple of minutes.

## What a run does

1. **Find finished events.** Read `game/data/tracker.txt`.
   - Lines marked `watch`: check on vlr.gg whether the event has finished (grand final played).
     If it has, process it.
   - Look for newly announced or finished events that aren't in the tracker: current-season Kickoff,
     Stage 1 and Stage 2 for Americas, EMEA, Pacific and China, Masters, Champions, and Ascension.
     Add `watch` lines for upcoming ones.
   - Then work through the `todo` backlog, oldest first: **at most 4 events per run**, counting new
     events first.
2. **Add each event** (below), then build, check and test.
3. **Commit and push** to `main`, then confirm the Cloudflare build succeeded.
4. **Report** in a few lines what was added, what's left in the backlog, and any problems.

If nothing finished and the backlog is empty, change nothing and report "no new events".

## Getting pages from vlr.gg

The shell can't reach vlr.gg. Use the web tools instead. WebFetch only opens links that came from a
search result or an earlier fetched page, so:

1. WebSearch something like `vlr.gg VCT 2026 Americas Stage 2`. Fetch an event or pick'em link from the results.
2. Ask WebFetch for the event's dates, whether it's completed, the winner, and the full URL of its
   Stats tab (`https://www.vlr.gg/event/stats/<id>/<slug>`).
3. Fetch the Stats URL and ask for every row of the "Player Performance and Stats" table as CSV, in
   exactly this order:
   `PlayerName TAG,Agent1;Agent2;Agent3,Rnd,R,ACS,K:D,KAST,ADR,KPR,APR,FKPR,FDPR,HS`
   Ask for KAY/O as `Kayo`, numbers as shown without `%`, and a final `TOTAL ROWS=<n>` line.
   If FKPR/FDPR aren't columns, FK and FD divided by rounds is fine. If the answer looks cut off,
   fetch again with an offset.

## Adding an event

Create `game/data/events/NNN_<id>.txt`, where NNN is the next number after the highest one already
there. **Never edit or reorder existing files.** Rows of old events must stay byte-identical, and
`tools/check_stable.py` enforces this.

```
## <id>|<name>|<year>|<type>|<winner tag>|<vlr id>|region=<Region>|end=<YYYY-MM-DD>
PlayerName TAG,Agent1;Agent2,Rnd,R,ACS,K:D,KAST,ADR,KPR,APR,FKPR,FDPR,HS
...
```

- **id**: region code + year + stage, as in the tracker (`ame26s2`, `pac25ko`, `emea24asc`).
  For internationals use the city style (`stg26`, `cha26`, `mad24`).
- **name**: `Americas Stage 2`, `Pacific Kickoff`, `EMEA League` (2023), `China Ascension`.
  For internationals: `Masters London`, `Champions Shanghai`.
- **type**: `League` for Kickoff, Stage 1, Stage 2 and the 2023 leagues. `Ascension` for Ascension.
  `Masters` or `Champions` for internationals; those take `city=<City>` instead of `region=`.
- **end**: the date of the grand final. This sets the order events are listed in.
- Optional: `note=partial data` if vlr is missing part of the table.

### Check the rows before building

- The number of rows matches `TOTAL ROWS`.
- **Every tag is right.** The page reader sometimes glues a player's last letter onto the tag
  (`kelly STS` was really `kellyS TS`). Every team should have 5–7 players. A team with 1–2 players,
  or a tag that's one letter longer than a real one, usually means this happened. Fix the line.
- **New teams** go in `game/data/teams.txt` as `TAG|Team name|Region`. Use the tag vlr shows, and
  check the full team name on the event page.
- **New agents** go in `ROLE` at the top of `game/build_data.py` (Duelist, Initiator, Controller or
  Sentinel).
- The winner's tag must appear in the rows.

### Internationals only: map picks

For a new Masters or Champions event, also fetch its vlr Agents tab and add a block to
`game/data/meta.txt` in the existing format:
`## <id>` then `Map|maps played|attack win %|defence win %|Agent:pick%;Agent:pick%...`
(agents at 30%+ only, plus an `All maps` line first).

### Optional: birth years

`game/data/born.txt` holds `player|birth year` from Liquipedia player pages (found via WebSearch).
If a run has time left, add up to 20 birth years for the players with the most rounds who don't
have one yet. The "23 and under" category switches on by itself at 150 players.

## Build, check, test

From the repo root:

```
python3 game/build_data.py                  # must print no errors
python3 game/tools/check_stable.py          # must print OK
python3 game/build_html.py                  # writes public/index.html
python3 -m http.server 8000 -d public &     # serve the built site
node game/tests/smoke.js http://127.0.0.1:8000/ <new event ids...>   # must print SMOKE TEST PASSED
```

`build_data.py` also lists teams with fewer than 5 players. That's normal for subs and partial
tables, but a whole team showing up there is a sign of a tag mistake.

Then:
- update `game/data/tracker.txt`: set the line to `done` and fill in the vlr id
- commit with a message like `Data: add Americas Stage 2 2026 (vlr 2774)` and push to `main`
- confirm the Cloudflare build passed: `gh api repos/adsrmp/13-0/commits/HEAD/check-runs`

If any step fails and you can't fix it, don't push. Report what went wrong instead.

## Good to know

- The daily draft's category list ignores categories that only appear once enough data exists, so
  adding data doesn't reshuffle which category a day gets. Today's deck can change slightly when an
  event lands mid-day; that's expected.
- The Claude artifact copy of the game (`game/dist/thirteen-0.html`) is optional to republish.
  The website is the main version.
