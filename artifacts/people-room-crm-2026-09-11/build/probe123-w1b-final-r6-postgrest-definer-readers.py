#!/usr/bin/env python3
"""probe123 — W1b final review r6, over the public API.

Two questions:
  1. Do 00627's four SECURITY DEFINER access-grant readers answer over
     /rest/v1/rpc/... to a caller who is NOT a member of the owning studio but
     merely shares ANY organization with its designer of record?
  2. Does r5 BLOCKING-1 stay closed (identity_phone_numbers)?

Local stack only. Actors are minted by probe124's SQL companion, which must be
COMMITTED for the API to see them; this script only reads.
"""
import base64, hmac, hashlib, json, sys, time, urllib.request, urllib.error

SECRET = b"super-secret-jwt-token-with-at-least-32-characters-long"
def b64(x): return base64.urlsafe_b64encode(x).rstrip(b"=")
def jwt(sub):
    now = int(time.time())
    hdr = b64(json.dumps({"alg":"HS256","typ":"JWT"}).encode())
    pl  = b64(json.dumps({"sub":sub,"role":"authenticated","aud":"authenticated",
                          "iat":now,"exp":now+3600}).encode())
    return (hdr+b"."+pl+b"."+b64(hmac.new(SECRET,hdr+b"."+pl,hashlib.sha256).digest())).decode()

def rpc(tok, name, body):
    req = urllib.request.Request(f"http://127.0.0.1:54321/rest/v1/rpc/{name}",
        data=json.dumps(body).encode(),
        headers={"apikey":tok,"Authorization":"Bearer "+tok,"Content-Type":"application/json"})
    try:    return 200, urllib.request.urlopen(req).read().decode()
    except urllib.error.HTTPError as e: return e.code, e.read().decode()[:220]

def get(tok, path):
    req = urllib.request.Request(f"http://127.0.0.1:54321/rest/v1/{path}",
        headers={"apikey":tok,"Authorization":"Bearer "+tok})
    try:    return 200, urllib.request.urlopen(req).read().decode()[:400]
    except urllib.error.HTTPError as e: return e.code, e.read().decode()[:220]

OUTSIDER = sys.argv[1]           # member of the shared org, NOT of Local Dev Studio
FOREIGN_CARD = sys.argv[2]       # a Local Dev Studio rolodex card uuid
MY_ORG = sys.argv[3]             # the outsider's own org

tok = jwt(OUTSIDER)
print("=== 00627's four definer readers, over /rest/v1/rpc ===")
for fn in ("access_grants_invoice_links","access_grants_plan_transmittals",
           "access_grants_trade_rfq","access_grants_trade_agreement_links"):
    code, body = rpc(tok, fn, {})
    print(f"  {fn:38s} -> HTTP {code} {body[:300]}")

print("=== v_access_grants, over /rest/v1 ===")
code, body = get(tok, "v_access_grants?select=tier,scope_type,scope_id&order=tier")
print(f"  v_access_grants -> HTTP {code} {body}")

print("=== r5 BLOCKING-1 control: identity_phone_numbers with my own org + a foreign key ===")
code, body = rpc(tok, "identity_phone_numbers",
                 {"p_organization_id": MY_ORG, "p_identity_key": FOREIGN_CARD,
                  "p_card_phone_e164": None})
print(f"  identity_phone_numbers -> HTTP {code} {body[:200]}")

print("=== controls: the objects r5 tightened ===")
for rel in ("people_directory","people_directory_seats","project_site_access_cards",
            "project_party_authority","studio_compliance_documents"):
    code, body = get(tok, f"{rel}?select=*&limit=2")
    print(f"  {rel:28s} -> HTTP {code} {body[:120]}")
