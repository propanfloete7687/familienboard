"""
Holt die Einkaufsliste aus Bring! (inoffizielle Schnittstelle, Bibliothek bring-api,
dieselbe wie in Home Assistant) und schreibt sie als bring.json.

Umgebungsvariablen:
  BRING_EMAIL, BRING_PASSWORD   Zugangsdaten
  BRING_LIST_NAME               optional: Name der Liste (sonst die erste)

Aufruf: python scripts/bring_fetch.py bring.json
"""

import asyncio
import json
import os
import sys

import aiohttp
from bring_api import Bring


def item_to_dict(item):
    urgent = any(a.content and a.content.urgent for a in item.attributes)
    return {"name": item.itemId, "spec": item.specification or "", "urgent": bool(urgent)}


async def main(out_path):
    email, password = os.environ.get("BRING_EMAIL"), os.environ.get("BRING_PASSWORD")
    if not email or not password:
        print("Keine Bring!-Zugangsdaten hinterlegt – übersprungen.")
        return

    wanted = (os.environ.get("BRING_LIST_NAME") or "").strip().lower()
    async with aiohttp.ClientSession() as session:
        bring = Bring(session, email, password)
        await bring.login()
        lists = (await bring.load_lists()).lists
        if not lists:
            sys.exit("Keine Bring!-Liste gefunden.")
        chosen = next((l for l in lists if l.name.strip().lower() == wanted), None) if wanted else None
        if wanted and not chosen:
            names = ", ".join(l.name for l in lists)
            sys.exit(f"Liste '{wanted}' nicht gefunden. Vorhanden: {names}")
        chosen = chosen or lists[0]

        data = await bring.get_list(chosen.listUuid)
        items = [item_to_dict(i) for i in data.items.purchase]
        items.sort(key=lambda x: (not x["urgent"], x["name"].lower()))

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"list": chosen.name, "items": items}, f, ensure_ascii=False)
    print(f"Bring!: {len(items)} Artikel aus '{chosen.name}'.")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "bring.json"))
