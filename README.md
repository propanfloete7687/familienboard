# Familienboard (TimeTree → Tablet)

Ein Wand-Board für das Tablet: Uhr, Termine von heute und den nächsten Tagen (farbig nach TimeTree-Label), Wetter für Eschweiler und eure Einkaufsliste aus Bring!.

**So funktioniert es:** GitHub ruft alle 20 Minuten deinen TimeTree-Kalender ab (inoffizielles Tool [timetree-exporter](https://github.com/eoleedi/TimeTree-Exporter)), dazu die Bring!-Liste (inoffizielle Bibliothek [bring-api](https://github.com/miaucl/bring-api), die auch Home Assistant nutzt). Beides wird und zusammen mit dem Board über GitHub Pages. Das Tablet entschlüsselt sie mit deinem Board-Schlüssel. Ohne den Schlüssel kann niemand die Termine lesen, obwohl die Seite öffentlich erreichbar ist.

Termine tragt ihr weiter in TimeTree ein, Einkäufe in Bring!. Das Board zeigt beides nur an und aktualisiert sich alle 20 Minuten.

---

## Einrichtung (einmalig, ca. 15 Minuten)

### 1. TimeTree-Konto für das Board (empfohlen)
Leg ein zweites TimeTree-Konto an, zum Beispiel mit einer neuen Gmail-Adresse, und lade es in euren Familienkalender ein. Dann liegt bei GitHub nicht dein Hauptpasswort.

### 2. Kalender-Code herausfinden
Öffne am PC **timetreeapp.com**, melde dich an und öffne den Familienkalender. In der Adresszeile steht dann `…/calendars/XXXXXXXX`. Dieser Teil `XXXXXXXX` ist der Kalender-Code.

### 3. Repository anlegen
1. Erstelle auf github.com ein neues Repository, z. B. `familienboard`. Es muss **Public** sein, denn GitHub Pages ist nur für öffentliche Repos kostenlos. Die Termine liegen dort nur verschlüsselt.
2. Lade den Inhalt dieses Ordners hoch (**Add file → Upload files**, alles hineinziehen).
   Prüfe danach, ob die Datei `.github/workflows/timetree.yml` angekommen ist, denn versteckte Ordner werden beim Hochladen manchmal übersprungen. Falls sie fehlt: **Add file → Create new file**, als Namen `.github/workflows/timetree.yml` eintippen und den Inhalt hineinkopieren.

### 4. Zugangsdaten hinterlegen
Im Repo **Settings → Secrets and variables → Actions**:

| Reiter | Name | Wert |
|---|---|---|
| Secrets | `TIMETREE_EMAIL` | E-Mail des TimeTree-Kontos |
| Secrets | `TIMETREE_PASSWORD` | Passwort des TimeTree-Kontos |
| Secrets | `BOARD_KEY` | eine lange Passphrase (mind. 12 Zeichen, z. B. vier zufällige Wörter) – brauchst du gleich am Tablet |
| Variables | `TIMETREE_CALENDAR_CODE` | der Kalender-Code aus Schritt 2 |
| Secrets | `BRING_EMAIL` | E-Mail eures Bring!-Kontos |
| Secrets | `BRING_PASSWORD` | Passwort eures Bring!-Kontos |
| Variables | `BRING_LIST_NAME` | *optional:* Name der Liste, z. B. `Zuhause` – sonst wird die erste Liste genommen |

**Bring!-Hinweis:** Wenn ihr euch bei Bring! mit Google oder Apple anmeldet, hat das Konto kein Passwort. Dann in der Bring!-App ein Passwort festlegen oder über „Passwort vergessen“ eins setzen. Auch hier ist ein eigenes Bring!-Konto fürs Board sinnvoll, das ihr zur Liste einladet.

### 5. Ersten Abruf starten
**Actions** → ggf. „I understand my workflows, enable them“ → **TimeTree abholen** → **Run workflow**.
Nach ca. einer Minute sollte ein grüner Haken erscheinen. Bei einem roten Kreuz: Log öffnen, meistens stimmt das Passwort oder der Kalender-Code nicht.

### 6. GitHub Pages einschalten
**Settings → Pages** → Source: *Deploy from a branch* → Branch: `gh-pages` / `(root)` → Save.
Nach 1–2 Minuten ist das Board erreichbar unter
`https://DEIN-GITHUB-NAME.github.io/familienboard/`

### 7. Tablet einrichten
1. Die Adresse in Chrome öffnen und den Board-Schlüssel (`BOARD_KEY`) eingeben.
2. Chrome-Menü → **Zum Startbildschirm hinzufügen** – dann startet das Board im Vollbild wie eine App.
3. Damit der Bildschirm an bleibt: In den Android-Entwickleroptionen **„Wach bleiben“** (beim Laden aktiv bleiben) einschalten und das Tablet am Ladekabel lassen.

---

## Anpassen
In `board/config.js`:
- **`labelFarben`** – eigene Farbe pro TimeTree-Label, z. B. `"Ingo": "#4f8cff"`. Am besten legt ihr in TimeTree ein Label pro Person an.
- **`tageVoraus`**, **Nachtmodus** (gedimmt 22–6 Uhr), **Ort/Koordinaten** für das Wetter.

Nach dem Speichern einer Änderung auf GitHub wird das Board automatisch neu veröffentlicht.

## Gut zu wissen
- **Unten im Board** siehst du, wann TimeTree zuletzt abgerufen wurde. Liegt das länger als 90 Minuten zurück, wird die Zeile rot.
- **Wenn der Abruf ausfällt** (z. B. weil TimeTree seine Web-Version ändert), schickt GitHub dir eine E-Mail. Dann hilft meist ein Update des Exporters: Er wird bei jedem Lauf frisch installiert, eine neue Version kommt also von selbst.
- **Bei langer Inaktivität** pausiert GitHub zeitgesteuerte Abläufe in Repos manchmal nach 60 Tagen. Du bekommst vorher eine Mail und kannst es mit einem Klick wieder aktivieren.
- **Die Einkaufsliste** zeigt die offenen Artikel aus Bring!, dringende (in Bring! als „dringend“ markiert) stehen rot oben. Fällt der Bring!-Abruf aus, laufen die Termine trotzdem weiter.
- **Nach dem Wechsel des `BOARD_KEY`** musst du ihn am Tablet unter „Einstellungen“ (unten rechts) neu eingeben.
