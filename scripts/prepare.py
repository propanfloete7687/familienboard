"""
Liest die von timetree-exporter erzeugte .ics-Datei, löst Serientermine
für die nächsten Wochen auf und schreibt sie verschlüsselt als JSON.

Aufruf:  BOARD_KEY=... python scripts/prepare.py timetree.ics out/data.enc.json

Verschlüsselung: AES-256-GCM, Schlüssel per PBKDF2-SHA256 aus BOARD_KEY.
Das Board entschlüsselt mit derselben Passphrase im Browser (Web Crypto).
"""

import base64
import json
import os
import sys
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import icalendar
import recurring_ical_events
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

TZ = ZoneInfo("Europe/Berlin")
DAYS_BACK = 1
DAYS_AHEAD = int(os.environ.get("BOARD_DAYS_AHEAD", "45"))
PBKDF2_ITERATIONS = 250_000


def to_iso(value):
    """datetime -> ISO mit Zeitzone Berlin, date -> YYYY-MM-DD."""
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=TZ)
        return value.astimezone(TZ).isoformat(timespec="minutes"), False
    return value.isoformat(), True


def read_events(ics_path):
    with open(ics_path, "rb") as f:
        cal = icalendar.Calendar.from_ical(f.read())

    today = datetime.now(TZ).date()
    start = today - timedelta(days=DAYS_BACK)
    end = today + timedelta(days=DAYS_AHEAD)

    events = []
    for ev in recurring_ical_events.of(cal).between(start, end):
        dtstart = ev.get("DTSTART").dt
        dtend_prop = ev.get("DTEND")
        dtend = dtend_prop.dt if dtend_prop else dtstart
        s, all_day = to_iso(dtstart)
        e, _ = to_iso(dtend)

        cats = ev.get("CATEGORIES")
        label = ""
        if cats is not None:
            cats = cats if isinstance(cats, list) else [cats]
            names = [str(c) for cat in cats for c in cat.cats]
            label = names[0] if names else ""

        events.append(
            {
                "title": str(ev.get("SUMMARY", "")).strip() or "(ohne Titel)",
                "start": s,
                "end": e,
                "allDay": all_day,
                "label": label,
                "color": str(ev.get("COLOR", "")) or None,
                "location": str(ev.get("LOCATION", "")).strip() or None,
            }
        )

    events.sort(key=lambda x: (x["start"], x["title"]))
    return events


def encrypt(payload: dict, passphrase: str) -> dict:
    salt = os.urandom(16)
    iv = os.urandom(12)
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(), length=32, salt=salt, iterations=PBKDF2_ITERATIONS
    )
    key = kdf.derive(passphrase.encode("utf-8"))
    plaintext = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    ct = AESGCM(key).encrypt(iv, plaintext, None)
    b64 = lambda b: base64.b64encode(b).decode("ascii")
    return {
        "v": 1,
        "kdf": "PBKDF2-SHA256",
        "iter": PBKDF2_ITERATIONS,
        "salt": b64(salt),
        "iv": b64(iv),
        "ct": b64(ct),
    }


def main():
    if len(sys.argv) != 3:
        sys.exit("Aufruf: prepare.py <eingabe.ics> <ausgabe.json>")
    passphrase = os.environ.get("BOARD_KEY")
    if not passphrase or len(passphrase) < 12:
        sys.exit("BOARD_KEY fehlt oder ist kürzer als 12 Zeichen.")

    events = read_events(sys.argv[1])
    payload = {
        "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "events": events,
    }

    # Optional: Einkaufsliste aus Bring! (von scripts/bring_fetch.py)
    bring_path = os.environ.get("BRING_JSON", "bring.json")
    if os.path.exists(bring_path):
        with open(bring_path, encoding="utf-8") as f:
            payload["shopping"] = json.load(f)
    os.makedirs(os.path.dirname(sys.argv[2]) or ".", exist_ok=True)
    with open(sys.argv[2], "w", encoding="utf-8") as f:
        json.dump(encrypt(payload, passphrase), f)
    print(f"{len(events)} Termine verschlüsselt geschrieben.")


if __name__ == "__main__":
    main()
