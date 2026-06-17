#!/usr/bin/env python3
# Import an AdMo "Spending Chart" .xlsx export into the tracker:
#   races[rk].spenders[] (advertiser + side + grand-total spend)
#   races[rk].buys[]     (advertiser x market x media-week x spend)
# Computes media weeks (Tue-Mon, reverse-counted from the race's election date).
# Usage: python3 scripts/import-admo.py <file.xlsx>
import sys, json, os, re, subprocess
from datetime import date, timedelta
import openpyxl

HERE = os.path.dirname(__file__)
DATA = os.path.join(HERE, '..', 'data', 'data.json')

def race_key(name, races):
    n = name.strip()
    m = re.match(r'^([A-Z]{2})\s+CD-?0*(\d+)\s+(\d{4})$', n)         # "MI CD-13 2026" / "PA CD-07 2026"
    if m: rk = f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    elif re.match(r'^([A-Z]{2})\s+Senate\s+\d{4}$', n): rk = re.sub(r'^([A-Z]{2})\s+Senate\s+(\d{4})$', r'\1-Sen-\2', n)
    elif re.match(r'^([A-Z]{2})\s+Governor\s+\d{4}$', n): rk = re.sub(r'^([A-Z]{2})\s+Governor\s+(\d{4})$', r'\1-Gov-\2', n)
    else: rk = None
    if rk and rk in races: return rk
    # fallback: fuzzy match on office+state already in data
    return rk if rk in races else None

def tue_on_or_before(d):
    return d - timedelta(days=(d.weekday() - 1) % 7)  # python weekday: Mon=0,Tue=1

def media_week(flight_start, election):
    if not flight_start or not election: return None
    week1 = tue_on_or_before(election) - timedelta(days=7)
    return round((week1 - tue_on_or_before(flight_start)).days / 7) + 1

def parse_date(s):
    s = s or ''
    m = re.search(r'(\d{4})-(\d{1,2})-(\d{1,2})', s)       # ISO  YYYY-MM-DD
    if m: return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    m = re.search(r'(\d{1,2})/(\d{1,2})/(\d{4})', s)       # US   MM/DD/YYYY
    if m: return date(int(m.group(3)), int(m.group(1)), int(m.group(2)))
    return None

def side_of(party):
    p = (party or '').lower()
    return 'D' if 'democrat' in p else 'R' if 'republican' in p else 'I' if p else None

xlsx = sys.argv[1]
wb = openpyxl.load_workbook(xlsx, data_only=True)
ws = wb[wb.sheetnames[0]]
rows = list(ws.iter_rows(values_only=True))

race_name = next((str(r[0]).replace('Race:', '').strip() for r in rows[:10] if r[0] and str(r[0]).startswith('Race:')), None)
data = json.load(open(DATA))
rk = race_key(race_name, data['races'])
if not rk:
    print(f"Could not map race '{race_name}' to a tracked raceKey — skipping."); sys.exit(1)
race = data['races'][rk]
# Media weeks count back from the NOVEMBER GENERAL for every race (per coworker:
# "election day November; the Tuesday before = week 1"), so the whole cycle sits
# on one positive countdown regardless of primary date.
election = parse_date(race.get('generalDate') or '2026-11-03')

# locate header rows
hdr_i = next(i for i, r in enumerate(rows) if r and r[0] == 'Party')
hdr = rows[hdr_i]
# week groups: every column from D(3) onward whose header looks like a date range; Grand Total at col 3
week_cols = []  # (col_index, start, end)
for c in range(3, len(hdr)):
    lab = str(hdr[c] or '')
    if ' - ' in lab and '/' in lab:
        s, e = lab.split(' - '); week_cols.append((c, parse_date(s), parse_date(e)))

spenders = {}   # advertiser -> {side, amount}
buys = []
cur_party = cur_adv = None
for r in rows[hdr_i + 2:]:
    if r[0]: cur_party = r[0]
    if r[1]: cur_adv = r[1]
    market = r[2]
    if not cur_adv or not market: continue
    if 'total' in str(market).lower() or 'grand' in str(market).lower(): continue
    side = side_of(cur_party)
    gt = r[3] if isinstance(r[3], (int, float)) else 0
    if cur_adv not in spenders: spenders[cur_adv] = {'side': side, 'amount': 0}
    spenders[cur_adv]['amount'] += gt or 0
    for (c, s, e) in week_cols:
        v = r[c] if c < len(r) and isinstance(r[c], (int, float)) else 0
        if v and v > 0:
            buys.append({'advertiser': cur_adv, 'side': side, 'market': str(market),
                         'flightStart': s.isoformat(), 'flightEnd': e.isoformat() if e else None,
                         'amount': round(v), 'week': media_week(s, election), 'source': 'AdImpact (AdMo export)'})

race['spenders'] = [{'name': k, 'side': v['side'], 'amount': round(v['amount'])}
                    for k, v in sorted(spenders.items(), key=lambda x: -x[1]['amount'])]
race['buys'] = buys
data['lastUpdated'] = date.today().isoformat()
data.setdefault('changelog', []).insert(0, {'ts': date.today().isoformat(),
    'note': f"AdMo import {rk}: {len(spenders)} spenders, {len(buys)} weekly buy-rows across {len(set(b['market'] for b in buys))} markets."})
data['changelog'] = data['changelog'][:40]
json.dump(data, open(DATA, 'w'), indent=2)
subprocess.run(['node', os.path.join(HERE, 'wrap.js')])
print(f"Imported {race_name} -> {rk}: {len(spenders)} spenders, {len(buys)} weekly buys, {len(week_cols)} weeks, {len(set(b['market'] for b in buys))} markets.")
