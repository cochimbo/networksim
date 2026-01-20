#!/usr/bin/env python3
import re
import json
from pathlib import Path

repo = Path(__file__).resolve().parents[1]
lib = repo / 'src' / 'lib.rs'
api_dir = repo / 'src' / 'api'

route_re = re.compile(r'\.route\(\s*"(?P<path>[^\"]+)"\s*,\s*(?:get|post|put|delete)\s*\(\s*(?P<handler>[^)]+)\s*\)\s*\)')
route_re2 = re.compile(r'\.route\(\s*"(?P<path>[^\"]+)"\s*,\s*(?:get|post|put|delete)\s*\(\s*api::(?P<handler>[^)]+)\s*\)\s*\)')
handler_mod_re = re.compile(r'crate::api::([a-z0-9_]+)::([a-zA-Z0-9_]+)')

routes = []
content = lib.read_text()
for m in route_re.finditer(content):
    path = m.group('path')
    handler = m.group('handler').strip()
    routes.append((path, handler))

# Also try to capture api::... direct handlers
for m in route_re2.finditer(content):
    path = m.group('path')
    handler = m.group('handler').strip()
    routes.append((path, handler))

# Deduplicate
seen = set()
uniq = []
for p,h in routes:
    key = (p,h)
    if key in seen:
        continue
    seen.add(key)
    uniq.append((p,h))
routes = uniq

results = []

for path, handler in routes:
    m = handler_mod_re.search(handler)
    if m:
        modname, func = m.group(1), m.group(2)
    else:
        m2 = re.search(r'api::([a-z0-9_]+)::([a-zA-Z0-9_]+)', handler)
        if m2:
            modname, func = m2.group(1), m2.group(2)
        else:
            modname, func = None, handler

    documented = False
    file_path = None
    if modname:
        candidate = api_dir / f"{modname}.rs"
        if not candidate.exists():
            candidate = api_dir / modname / 'mod.rs'
        if candidate.exists():
            file_path = str(candidate.relative_to(repo))
            txt = candidate.read_text()
            fn_re = re.compile(r'(?:pub\s+)?(?:async\s+)?fn\s+' + re.escape(func) + r'\b')
            mfn = fn_re.search(txt)
            if mfn:
                fn_pos = mfn.start()
                prefix = txt[:fn_pos]
                lines = prefix.splitlines()
                lookback = '\n'.join(lines[-15:]) if lines else ''
                if '#[utoipa::path' in lookback:
                    documented = True
            else:
                if f'fn {func}' in txt and '#[utoipa::path' in txt:
                    documented = True

    results.append({
        'path': path,
        'handler': handler,
        'module': modname,
        'function': func,
        'file': file_path,
        'documented': documented,
    })

# Also inspect internal router() functions in api files
for f in api_dir.glob('*.rs'):
    txt = f.read_text()
    if 'fn router' in txt or 'pub fn router' in txt:
        for m in re.finditer(r'\.route\(\s*"(?P<path>[^\"]+)"\s*,\s*(?:get|post|put|delete)\s*\(\s*(?P<handler>[^)]+)\s*\)\s*\)', txt):
            path = m.group('path')
            handler = m.group('handler').strip()
            parts = handler.split('::')
            if len(parts) == 1:
                func = parts[0]
                modname = f.stem
            else:
                modname = parts[-2]
                func = parts[-1]
            if not any(r['path'] == path for r in results):
                candidate = str(f.relative_to(repo))
                documented = '#[utoipa::path' in txt and f'fn {func}' in txt
                results.append({'path': path, 'handler': handler, 'module': modname, 'function': func, 'file': candidate, 'documented': documented})

out_csv = repo / 'openapi_route_coverage.csv'
out_json = repo / 'openapi_route_coverage.json'
with out_json.open('w') as j:
    json.dump(results, j, indent=2, ensure_ascii=False)

import csv
with out_csv.open('w', newline='') as c:
    w = csv.DictWriter(c, fieldnames=['path','handler','module','function','file','documented'])
    w.writeheader()
    for r in results:
        w.writerow(r)

print(f'Wrote {out_csv} and {out_json}')
