#!/usr/bin/env python3
"""Upload the AROMIN bot knowledge docs (Amytis KB + Yahya Alavi encyclopedia/FRAMEWORKS, cleaned by the bot's
tools/gen_kbdocs.py) to the dashboard knowledge base (ArvanCloud Object Storage) via POST /api/knowledge.
Run AFTER the KB-retrieval PR is deployed. Idempotent: each file gets a stable uuid5 id, so re-runs report "duplicate".

  AROMIN_USER=... AROMIN_PASS=... python3 tools/upload_kb_docs.py [--tenant team] [--dir tools/kb_docs] [--base https://dashboard.arominco.com] [--dry-run]

Credentials come only from env (AROMIN_USER / AROMIN_PASS, a manager account) and are never printed."""
import argparse, base64, glob, json, os, sys, urllib.parse, urllib.request, uuid

ap = argparse.ArgumentParser()
ap.add_argument("--tenant", default="team")
ap.add_argument("--dir", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "kb_docs"))
ap.add_argument("--base", default="https://dashboard.arominco.com")
ap.add_argument("--dry-run", action="store_true")
a = ap.parse_args()
files = sorted(glob.glob(os.path.join(a.dir, "*.md")))
if not files:
    sys.exit("no .md files in " + a.dir)
user, pw = os.environ.get("AROMIN_USER", ""), os.environ.get("AROMIN_PASS", "")
if not a.dry_run and not (user and pw):
    sys.exit("set AROMIN_USER and AROMIN_PASS (manager account)")
hdr = {"Content-Type": "application/json", "X-Aromin-User": urllib.parse.quote(user), "X-Aromin-Pass": urllib.parse.quote(pw)}
ok = 0
for f in files:
    name = os.path.basename(f)
    raw = open(f, "rb").read()
    oid = str(uuid.uuid5(uuid.NAMESPACE_URL, "aromin-bot-kb:" + a.tenant + ":" + name))
    body = {"filename": name, "data": base64.b64encode(raw).decode(), "id": oid}
    if a.dry_run:
        print(f"DRY {name} {len(raw)} bytes id={oid}"); ok += 1; continue
    req = urllib.request.Request(f"{a.base}/api/knowledge?tenant={urllib.parse.quote(a.tenant)}", json.dumps(body).encode(), hdr, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            j = json.load(r)
    except urllib.error.HTTPError as e:
        try: j = json.loads(e.read() or b"{}")
        except Exception: j = {}
        print(f"FAIL {name}: HTTP {e.code} {str(j.get('error') or '')[:120]}"); continue
    except Exception as e:
        print(f"FAIL {name}: {type(e).__name__}"); continue
    print(("DUP " if j.get("duplicate") else "OK  ") + name if j.get("ok") else f"FAIL {name}: {str(j.get('error') or '')[:120]}")
    ok += bool(j.get("ok"))
print(f"{ok}/{len(files)} uploaded")
sys.exit(0 if ok == len(files) else 1)
