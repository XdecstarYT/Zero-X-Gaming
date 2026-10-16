"""Download the matching row groups of an Overture theme, keep rows inside the game's box, save as parquet."""
import sys, json, pyarrow as pa, pyarrow.parquet as pq, pyarrow.compute as pc
from rng import HttpFile
theme = sys.argv[1]; cols = sys.argv[2].split(",")
BB = (144.915, -37.876, 145.012, -37.790)
hits = json.load(open(theme.replace("/", "_") + ".json"))
parts = []
for k, s, rgs in hits:
    f = pq.ParquetFile(HttpFile(k, s), buffer_size=1 << 22)
    for r in rgs:
        t = f.read_row_group(r, columns=cols + ["bbox"])
        b = t.column("bbox")
        xmin = pc.struct_field(b, "xmin"); xmax = pc.struct_field(b, "xmax"); ymin = pc.struct_field(b, "ymin"); ymax = pc.struct_field(b, "ymax")
        m = pc.and_(pc.and_(pc.greater_equal(xmax, BB[0]), pc.less_equal(xmin, BB[2])), pc.and_(pc.greater_equal(ymax, BB[1]), pc.less_equal(ymin, BB[3])))
        t = t.filter(m)
        if t.num_rows: parts.append(t); print(k[-30:], r, t.num_rows, flush=True)
out = pa.concat_tables(parts)
pq.write_table(out, theme.replace("/", "_") + ".parquet")
print("rows", out.num_rows)
