#!/usr/bin/env python3
"""Encrypt a confirmed single-leg ticket update for a paired Live-Karte device.

Usage:
  python scripts/encrypt_ticket_update.py --pairing '{"v":1,"device":"...","publicKey":"..."}' \
    --plan ride-takayama --date 30.10.2026 --from-station Odawara \
    --to-station Nagoya --departure 10:11 --status ready

Only the resulting JSON ciphertext may be committed to sync/inbox/<device>.json.
The pairing JSON is a PUBLIC key; never accept a private key here.
Requires Python 3.10+ and 'cryptography'.
"""
import argparse
import base64
import hashlib
import json
import re
import secrets
import sys
import time
from datetime import datetime, timezone
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa


def b64url_decode(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def b64url_encode(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def validated_pairing(text):
    data = json.loads(text)
    if data.get("v") != 1 or not isinstance(data.get("publicKey"), str):
        raise ValueError("Unsupported pairing data")
    der = b64url_decode(data["publicKey"])
    ident = hashlib.sha256(der).hexdigest()[:24]
    if data.get("device") != ident:
        raise ValueError("Pairing device identifier does not match the public key")
    key = serialization.load_der_public_key(der)
    if not isinstance(key, rsa.RSAPublicKey) or key.key_size != 3072:
        raise ValueError("Expected RSA 3072-bit public key")
    return ident, key


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--pairing", required=True, help="The PUBLIC JSON code from the user's app")
    p.add_argument("--plan", required=True)
    p.add_argument("--date", required=True)
    p.add_argument("--from-station", required=True)
    p.add_argument("--to-station", required=True)
    p.add_argument("--departure", required=True)
    p.add_argument("--status", required=True, choices=("unknown", "missing", "booked", "ready"))
    p.add_argument("--inbox", help="Optional existing inbox JSON file to append to (no cleartext)")
    args = p.parse_args()
    device, pub = validated_pairing(args.pairing)
    if not re.fullmatch(r"\d\d\.\d\d\.\d{4}", args.date):
        raise ValueError("Date must be DD.MM.YYYY")
    if not re.fullmatch(r"[012]\d:[0-5]\d", args.departure):
        raise ValueError("Departure must be HH:MM")
    event_id = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S") + "-" + secrets.token_hex(5)
    ticket = dict(v=1, plan=args.plan, date=args.date, **{
        "from": args.from_station, "to": args.to_station,
        "departure": args.departure, "status": args.status
    })
    message = dict(v=1, id=event_id, issuedAt=int(time.time()*1000), ticket=ticket)
    plain = json.dumps(message, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    if len(plain) > 300:
        raise ValueError("Message too large for RSA-OAEP; shorten station names")
    ciphertext = pub.encrypt(plain, padding.OAEP(mgf=padding.MGF1(algorithm=hashes.SHA256()),
                                                  algorithm=hashes.SHA256(), label=None))
    if args.inbox:
        with open(args.inbox, encoding="utf-8") as fp:
            inbox=json.load(fp)
        if inbox.get("v") != 1 or inbox.get("device") != device:
            raise ValueError("Existing inbox belongs to a different device")
        if not isinstance(inbox.get("messages"), list):
            raise ValueError("Invalid message list")
    else:
        inbox=dict(v=1, device=device, messages=[])
    inbox["messages"].append(dict(id=event_id, ciphertext=b64url_encode(ciphertext)))
    inbox["messages"]=inbox["messages"][-90:]
    # Output contains ONLY ciphertext and public routing metadata. No ticket fields.
    print(json.dumps(inbox, separators=(",", ":")))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("Error:", exc, file=sys.stderr)
        sys.exit(1)
