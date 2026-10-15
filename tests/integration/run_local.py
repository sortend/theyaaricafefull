"""Runs shim + migrations + seed + SQL test on a throwaway Postgres (pip install pgserver). Usage: python tests/integration/run_local.py"""
import glob, pathlib, sys, tempfile, pgserver
root = pathlib.Path(__file__).resolve().parents[2]
srv = pgserver.get_server(tempfile.mkdtemp(), cleanup_mode="delete")
files = [root/"tests/integration/supabase_shim.sql", *sorted((root/"supabase/migrations").glob("*.sql")), root/"supabase/seed.sql", root/"tests/integration/order_flow.test.sql"]
for f in files:
    out = srv.psql(f"\\set ON_ERROR_STOP on\n\\i {f}")
    bad = [l for l in str(out).splitlines() if "ERROR" in l or "FATAL" in l]
    print(("FAIL " if bad else "ok   ") + f.name, *bad[:3], *[l for l in str(out).splitlines() if "ASSERTIONS PASSED" in l], sep="\n     " if bad else " ")
    if bad: sys.exit(1)
