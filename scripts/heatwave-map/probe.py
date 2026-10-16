import sys, json, pyarrow.parquet as pq
from rng import HttpFile, listing
REL = "release/2026-09-23.1/"
theme = sys.argv[1]
files = [f for f in listing(REL + theme + "/") if f[0].endswith(".parquet")]
print(len(files), "files")
BB = (144.88, -37.90, 145.03, -37.77)
hits = []
for k, s in files:
    f = pq.ParquetFile(HttpFile(k, s))
    md = f.metadata
    sch = f.schema_arrow
    names = [n for n in md.schema.names]
    # find bbox columns
    idx = {md.schema.column(i).path: i for i in range(md.num_columns)}
    rg = []
    for r in range(md.num_row_groups):
        g = md.row_group(r)
        st = {p: g.column(i).statistics for p, i in idx.items() if p.startswith("bbox.")}
        try:
            xmin = st["bbox.xmin"].min; xmax = st["bbox.xmax"].max; ymin = st["bbox.ymin"].min; ymax = st["bbox.ymax"].max
        except Exception: continue
        if xmax >= BB[0] and xmin <= BB[2] and ymax >= BB[1] and ymin <= BB[3]: rg.append(r)
    if rg: hits.append((k, s, rg)); print("HIT", k, len(rg), "of", md.num_row_groups, flush=True)
json.dump(hits, open(theme.replace("/", "_") + ".json", "w"))
print("schema", sch)
