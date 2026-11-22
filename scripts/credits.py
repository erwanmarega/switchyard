"""Writes public/img/credits.json from scripts/.raw/<slug>.json (written by fetch.py)."""
import json, sys
RAW, OUT = sys.argv[1], sys.argv[2]
MAP = {"hero": "mikado", "band-semaphore": "signals", "cta-yard": "yardengine", "solution-bg": "consolidation",
       "card-1": "levers", "card-2": "canyon", "card-3": "empire", "card-4": "yardengine", "card-5": "yardtower", "card-6": "signals"}
out = []
for name, slug in MAP.items():
    m = json.load(open(f"{RAW}/{slug}.json"))
    out.append({"file": f"{name}.webp", "title": m["title"], "author": m["author"],
                "source_url": m["source_url"], "license": "Public domain"})
json.dump(out, open(OUT, "w"), indent=2, ensure_ascii=False)
