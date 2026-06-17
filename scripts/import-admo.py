#!/usr/bin/env python3
# Import AdMo "Spending Chart" .xlsx export(s) into the tracker.
#   races[rk].spenders[] (advertiser + side + grand-total spend)
#   races[rk].buys[]     (advertiser x market x media-week x spend)
# Media weeks: Tue-Mon, reverse-counted from the Nov 3 general (W1 = week before).
# Usage:
#   python3 scripts/import-admo.py <file.xlsx> [more.xlsx ...]
#   python3 scripts/import-admo.py            # imports all ~/Downloads/political-spending-chart*.xlsx
import sys, json, os, re, glob, subprocess
from datetime import date, timedelta
import openpyxl

HERE = os.path.dirname(__file__)
DATA = os.path.join(HERE, '..', 'data', 'data.json')
GENERAL = date(2026, 11, 3)

def parse_date(s):
    s = s or ''
    m = re.search(r'(\d{4})-(\d{1,2})-(\d{1,2})', s)
    if m: return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    m = re.search(r'(\d{1,2})/(\d{1,2})/(\d{4})', s)
    if m: return date(int(m.group(3)), int(m.group(1)), int(m.group(2)))
    return None

def tue_on_or_before(d): return d - timedelta(days=(d.weekday() - 1) % 7)
def media_week(fs):
    if not fs: return None
    return round(((tue_on_or_before(GENERAL) - timedelta(days=7)) - tue_on_or_before(fs)).days / 7) + 1
def side_of(p):
    p = (p or '').lower(); return 'D' if 'democrat' in p else 'R' if 'republican' in p else 'I' if p else None

def race_key(name, races):
    n = (name or '').strip()
    m = re.match(r'^([A-Z]{2})\s+CD-?0*(\d+)\s+(\d{4})$', n)
    if m: rk = f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    elif re.match(r'^[A-Z]{2}\s+Senate\s+\d{4}$', n): rk = re.sub(r'^([A-Z]{2})\s+Senate\s+(\d{4})$', r'\1-Sen-\2', n)
    elif re.match(r'^[A-Z]{2}\s+Governor\s+\d{4}$', n): rk = re.sub(r'^([A-Z]{2})\s+Governor\s+(\d{4})$', r'\1-Gov-\2', n)
    else: rk = None
    return rk if rk in races else None

def process_file(path, data):
    wb = openpyxl.load_workbook(path, data_only=True)
    rows = list(wb[wb.sheetnames[0]].iter_rows(values_only=True))
    race_name = next((str(r[0]).replace('Race:', '').strip() for r in rows[:10] if r[0] and str(r[0]).startswith('Race:')), None)
    rk = race_key(race_name, data['races'])
    if not rk: return ('SKIP', race_name, 0, 0, 0)
    hdr_i = next(i for i, r in enumerate(rows) if r and r[0] == 'Party')
    hdr = rows[hdr_i]
    week_cols = []
    for c in range(3, len(hdr)):
        lab = str(hdr[c] or '')
        if ' - ' in lab and '/' in lab:
            s, e = lab.split(' - '); week_cols.append((c, parse_date(s), parse_date(e)))
    spenders, buys = {}, []
    cur_party = cur_adv = None
    for r in rows[hdr_i + 2:]:
        if r[0]: cur_party = r[0]
        if r[1]: cur_adv = r[1]
        market = r[2]
        if not cur_adv or not market: continue
        if 'total' in str(market).lower() or 'grand' in str(market).lower(): continue
        side = side_of(cur_party)
        gt = r[3] if isinstance(r[3], (int, float)) else 0
        spenders.setdefault(cur_adv, {'side': side, 'amount': 0})['amount'] += gt or 0
        for (c, s, e) in week_cols:
            v = r[c] if c < len(r) and isinstance(r[c], (int, float)) else 0
            if v and v > 0:
                buys.append({'advertiser': cur_adv, 'side': side, 'market': str(market),
                             'flightStart': s.isoformat(), 'flightEnd': e.isoformat() if e else None,
                             'amount': round(v), 'week': media_week(s), 'source': 'AdImpact (AdMo)'})
    data['races'][rk]['spenders'] = [{'name': k, 'side': v['side'], 'amount': round(v['amount'])}
                                     for k, v in sorted(spenders.items(), key=lambda x: -x[1]['amount'])]
    data['races'][rk]['buys'] = buys
    return (rk, race_name, len(spenders), len(buys), len(set(b['market'] for b in buys)))

files = sys.argv[1:] or sorted(glob.glob(os.path.expanduser('~/Downloads/political-spending-chart*.xlsx')))
if not files: print('No xlsx files given or found in ~/Downloads.'); sys.exit(1)
data = json.load(open(DATA))
done = []
for f in files:
    try:
        res = process_file(f, data)
        done.append(res); print(f"  {res[0]:14} {res[1]}: {res[2]} spenders, {res[3]} buys, {res[4]} markets")
    except Exception as e:
        print(f"  ERROR {os.path.basename(f)}: {e}")
ok = [d for d in done if d[0] != 'SKIP']
data['lastUpdated'] = date.today().isoformat()
data.setdefault('changelog', []).insert(0, {'ts': date.today().isoformat(),
    'note': f"AdMo import: {len(ok)} race(s) backfilled — " + ', '.join(d[0] for d in ok[:8])})
data['changelog'] = data['changelog'][:40]
json.dump(data, open(DATA, 'w'), indent=2)
subprocess.run(['node', os.path.join(HERE, 'wrap.js')])
print(f"\nDone: {len(ok)} race(s) imported, {len([d for d in done if d[0]=='SKIP'])} skipped (not a tracked race).")
