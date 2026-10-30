# Meine Live-Karte

Mobile, statische Leaflet-Karte mit OpenStreetMap, Dark Mode und Empfehlungen aus ChatGPT. Ohne Backend, Registrierung, Build-Schritt oder API-Schlüssel.

## Verwenden

1. Website über HTTPS öffnen (GPS funktioniert auch auf localhost).
2. **Orte importieren**: JSON oder Text einfügen. Mehrere Importe werden ergänzt; gleiche Namen an gleichen Koordinaten werden zusammengeführt. Maximal 200 Orte, 100.000 Zeichen pro Import.
3. Pins oder **Auf Karte** anklicken, Kategorien filtern, mit **Alle Orte** den Ausschnitt anpassen. Touch-Zoom und Verschieben werden unterstützt. **Zoom:** Zwei-Finger-Zoom ist flüssiger und rastet nicht mehr bei ganzen Zoomstufen ein; die +/−-Schaltflächen zoomen in halben Stufen. Die darunterliegenden OpenStreetMap-Rasterkacheln haben weiterhin feste Detailstufen.
4. **GPS einschalten** startet kontinuierliche Standortaktualisierung mit blauem Punkt und Genauigkeitskreis. Zusätzlich zeigt ein **blauer Richtungspfeil**, wohin das Smartphone ausgerichtet ist, falls der Browser nordbezogene Kompassdaten liefert. GPS und ggf. der Kompass fragen um Erlaubnis. Die Karte folgt zunächst dem Standort. **Manuelles Zoomen (auch +/−) oder Verschieben pausiert die automatische Zentrierung**, GPS und Kompass aktualisieren sich weiterhin. Zum erneuten Folgen erscheint ein **⌖-Button**; der blaue Standortpunkt kann ebenfalls dafür angetippt werden. **GPS ausschalten** beendet GPS und Kompass und entfernt den Standort sowie die Entfernungen. Bei fehlender Kompassunterstützung bleibt nur der blaue Punkt sichtbar.
5. **Zu Fuß** öffnet Google Maps mit dem gewählten Ziel; Google bestimmt den Startpunkt. Die angezeigte Entfernung in der Karte ist Luftlinie.
6. **Teilen** erzeugt einen Link mit allen Empfehlungen. Link kopieren oder manuell aus dem Textfeld kopieren. Beim Öffnen werden die übermittelten Orte zu den bisher gespeicherten Empfehlungen hinzugefügt (ohne doppelte Einträge), automatisch lokal im Browser gespeichert und auf der Karte hervorgehoben. Sehr große Datensätze müssen zum Teilen gekürzt werden (maximal 30.000 URL-Zeichen).
7. **Startkarte:** Ohne Empfehlungen und ohne GPS zeigt die Karte eine neutrale Weltansicht statt einer fest vorgegebenen Stadt. Nach Aktivierung von GPS folgt sie deinem Standort. Auf Smartphones ist die Kartenansicht höher und hat einen **⛶ Vollbildmodus**; mit **✕** kehrst du zur Seitenansicht zurück.
8. **Leeren** löscht die lokal gespeicherten Empfehlungen nach Bestätigung. Die Orte bleiben ansonsten bei späteren Aufrufen im **selben Browser auf demselben Gerät** erhalten, solange dessen Website-Daten nicht gelöscht werden. Es gibt keine Synchronisierung zwischen Browsern oder Geräten. Auf Android ist die Seite über das Browser-Menü zum Startbildschirm hinzufügbar. Internet ist erforderlich.

### ChatGPT-Prompt

> Empfiehl mir Orte in Berlin als JSON-Array. Verwende name, lat, lng, category (restaurant, sight oder station) und description. Gib echte WGS84-Koordinaten als Dezimalzahlen an. Prüfe die Koordinaten sorgfältig.

ChatGPT ist nicht direkt angebunden. Prüfe Empfehlungen, Koordinaten und Öffnungszeiten selbst. Adressen ohne Koordinaten können nicht importiert werden; es gibt keine automatische Adresssuche.

```json
[
  {"name":"Brandenburger Tor","lat":52.516275,"lng":13.377704,"category":"sight","description":"Wahrzeichen Berlins"},
  {"name":"Berlin Hauptbahnhof","lat":52.5251,"lng":13.3694,"category":"station","description":"Zentraler Bahnhof"}
]
```

Alternativ eine Zeile je Ort, getrennt mit Semikolon (Dezimalpunkt verwenden):

```text
Brandenburger Tor;52.516275;13.377704;sight;Wahrzeichen Berlins
Berlin Hauptbahnhof;52.5251;13.3694;station;Zentraler Bahnhof
```

JSON unterstützt auch `{ "places": [...] }`, einzelne Objekte, Markdown-Codeblöcke und `lon` als Alternative zu `lng`. Eingaben werden validiert und nur als Text angezeigt, niemals als HTML.

## Reiseabschnitte: Fahrtage und Aufenthalte

Oben auf der Karte gibt es einen **Reiseabschnitt-Wähler**, auch im Vollbildmodus:

- **Alle gespeicherten Orte:** zeigt alle bereits gespeicherten Empfehlungen aus bisherigen Versionen, ohne sie zu löschen
- **30.10. – Fahrt nach Takayama:** die bestehende Hakone–Takayama-Zugroute mit Fahrplan und Hakone-Yumoto-Umstieg
- **30.10.–02.11. – Takayama:** eigener Bereich für Sehenswürdigkeiten, Restaurants und andere Ziele vor Ort
- **02.11. – Fahrt nach Kyoto:** vorbereiteter Fahrtag; **keine** erfundenen Uhrzeiten oder Strecken, bis eine konkrete Verbindung hinterlegt wurde
- **Ab 02.11. – Kyoto:** eigener Bereich für die Stadterkundung

Ein **＋** neben der Auswahl legt weitere Fahrt- oder Stadtbereiche an. Die gewählte Ansicht wird lokal gemerkt und über `?view=town-kyoto` etc. auch direkt geöffnet. Die Kamera fokussiert den jeweiligen Abschnitt. Manuelles Zoomen pausiert weiterhin GPS-Autozentrierung; der Live-Standort und Kompass arbeiten unabhängig.

**Orte organisieren:** Wenn du Orte importierst, während eine bestimmte Ansicht aktiv ist, werden sie dieser zugeordnet. Unter den Karten der vorhandenen Orte kannst du die Zuordnung später ändern. Bereits gespeicherte Orte ohne Zuordnung findest du weiterhin in **Alle gespeicherten Orte**. Jeder Ort wird nur einmal im lokalen Gesamtspeicher geführt; die Ansicht ist ein Filter, kein eigenes mehrfaches Kopieren. „Leeren“ löscht alle Orte erst nach Bestätigung – beim bloßen Wechsel wird nie etwas gelöscht.

Der Fahrplan einer Fahrt wird separat je Abschnitt verwaltet. Die bestehende Hakone–Takayama-Reise wird aus früheren Speicherständen übernommen. Künftige Reisepläne können über einen `#trip=`-Link in den gerade ausgewählten Fahrtabschnitt importiert werden; Stadttage verwenden ausschließlich Orts-Pins, keine schematischen Zuglinien. Die Funktion benötigt keine bezahlte Karten-API. Daten liegen weiterhin im Browser, nicht in einer Cloud-Datenbank.

## Reiseplan als Kartenlink

Die Live-Karte unterstützt außerdem einen separaten Reiseplan über einen Link mit `#trip=`. **Hakone-Yumoto:** Ab Zoomstufe 17 erscheint ein kompakter, **schematischer** Umstiegshinweis. Ab Zoomstufe 18 zeigt die Karte eine **leichtgewichtige, am Bahnhofspunkt verankerte Gleisorientierung**: **Gleis 3 – Richtung Gōra**, **09:16 Ankunft aus Gōra – Ankunftsgleis vor Ort prüfen**, **Gleis 2 – 09:24 Richtung Odawara** und **8 Min. Umsteigezeit**. Es werden bewusst **keine zusätzlichen künstlichen Schienenlinien** mehr über die OSM-Gleise gemalt, weil keine verifizierten Einzelgleis-Geometrien vorliegen. Die Hinweise selbst bleiben schematisch, sind keine vermessenen Gleispunkte und zeigen keinen echten Fußweg. Die Karte enthält nun eine kurze **deutsche Umstiegshilfe**: im zusammenhängenden Bahnsteigbereich bleiben, Gleis 2 Richtung Odawara suchen (8 Minuten Umsteigezeit, nicht Gehzeit). Für die Details ist der **offizielle englischsprachige** Bahnhofsführer verlinkt statt ausschließlich die japanische Odakyu-Übersicht. Das konkrete Ankunftsgleis ist weiterhin nicht bestätigt. Die Bahnhofsunterlagen nennen Gleis 3 für die Richtung Gōra, bestätigen damit aber nicht, dass der Zug aus Gōra dort eintrifft. Ein vierter Bahnsteig wird zeitweise für Ankünfte genutzt.  Du kannst auch den Bahnhof in der Zeitleiste antippen oder im Marker-Popup „Umstieg im Detail anzeigen“ wählen. Das ist **keine gleisgenaue GPS-Navigation**, kein verifizierter Ankunftsgleis-Nachweis für genau diesen Zug und keine maßstäbliche Gleisgeometrie. Die tatsächliche Anzeigetafel am Bahnhof geht vor. Offizieller Lageplan: https://www.odakyu.jp/station/hakone_yumoto/.
Ein Reiseplan enthält Datum, Stationen, Ankunfts- und Abfahrtszeiten und den jeweiligen nächsten Zug. Er erscheint als **nummerierte Stationen mit kleinen Bahnhofsnamen daneben**, **schematische gestrichelte Verbindungslinie** und **Zeitleiste mit Umstiegen**. Speziell für Hakone nach Takayama am 30.10.2026 funktioniert der kurze Link `https://cobrachris.github.io/meine-livekarte/?trip=hakone-takayama-2026-10-30`, auch direkt in der Browseradresszeile. Der Link lädt das hinterlegte Programm und speichert es lokal. Via-Punkte lassen sich für den ungefähren Streckenverlauf hinzufügen, sie sind keine gesonderten Umstiege.

Zum Erstellen kann `MapCore.encodeJourney({title,date,stops:[...]})` verwendet werden. Ein Stop hat `name`, `lat`, `lng` und optional `arrival`, `departure`, `description`, `leg` sowie `via` (Liste von Koordinatenpaaren für die Verbindung zur nächsten Station).

Der Reiseplan wird lokal und **getrennt von den gesammelten Empfehlungen** gespeichert. „Reiseplan entfernen“ löscht ihn, nicht deine Empfehlungen. Reisepläne enthalten **keine GPS-Position**. Alle Linien sind ausdrücklich *schematisch* und keine exakten Gleisgeometrien oder Echtzeit-Routen. Die geplante Reise führt mit Hikari 637 von Odawara westwärts nach Nagoya und mit Hida 9 über Gifu und Gero wieder nach Norden Richtung Takayama. Abfahrtsgleis und Zeiten am Reisetag überprüfen.

## Datenschutz

GPS und Kompass starten ausschließlich beim Tippen auf „GPS einschalten“ und werden nur im Arbeitsspeicher verarbeitet. GPS-Koordinaten und Ausrichtung werden weder lokal gespeichert noch in Links oder Navigations-URLs eingefügt. Der Kompass wird beim Ausschalten der Ortung wieder abgemeldet. Je nach Gerät, Browser und Sensorkalibrierung kann die Ausrichtung fehlen oder ungenau sein. Der Pfeil zeigt die **Geräteausrichtung**, nicht die Bewegungsrichtung oder eine geplante Route. Ausschalten und Verlassen der Seite beenden die Standortabfrage. Empfehlungen (einschließlich Orten aus empfangenen Kartenlinks) bleiben im localStorage dieses Browsers. Nach erfolgreichem Speichern wird das Linkfragment aus der Adresszeile entfernt, damit „Leeren“ nicht beim Neuladen rückgängig gemacht wird. Geteilte Orte stehen im URL-Fragment (nicht im HTTP-Request an GitHub Pages); Empfänger können diese lesen und weitergeben. Keine Analyse, Cookies oder eigene Telemetrie.

OpenStreetMap erhält IP-Adresse und angeforderte Kartenausschnitte – beim Zentrieren auch den Bereich um deinen Standort. Google erhält beim Navigationsaufruf das Ziel und kann eigenen Standortzugriff anfordern. Kartenkacheln werden nach den OpenStreetMap-Nutzungsbedingungen direkt geladen; keine Offline-Massendownloads. Leaflet 1.9.4 ist lokal mit BSD-2-Clause-Lizenz in `vendor/` eingebunden.

## Lokal entwickeln und testen

```sh
python3 -m http.server 8000
# Separates Terminal:
node --check app.js
node --check core.js
node --test tests/*.test.cjs
```

Im Browser localhost-Port 8000 öffnen. Kein npm install erforderlich. Tests prüfen Importformate, Koordinatengrenzen, fehlerhafte Daten, Unicode-Links, Entfernung und Ausschluss zusätzlicher Standortfelder.

Manueller Android-Check: Touch-Zoom, Import mehrerer Orte, Popup und Filter, GPS erlauben/verweigern, Bewegung, GPS ausschalten, Link in neuem Tab öffnen, Google-Fußgängernavigation. **Kompass:** Handy bei aktiver GPS-Ortung auf der Stelle drehen; der Richtungspfeil sollte sich verändern, der Punkt bleibt am Standort. Kompass-Berechtigung ggf. erlauben und bei Fehlrichtung Sensor kalibrieren (Handy in einer Acht bewegen). Reales GPS und externe Navigation müssen auf dem Endgerät geprüft werden.

## GitHub Pages veröffentlichen

Die Datei `.github/workflows/pages.yml` prüft JavaScript und Tests in Pull Requests und veröffentlicht nach Änderungen an `main` nur die öffentlichen Website-Dateien.

1. Pull Request nach `main` zusammenführen.
2. Repository **Settings → Pages → Build and deployment → Source: GitHub Actions** auswählen (Administratorrechte nötig).
3. Unter **Actions → Test and deploy static site** den erfolgreichen Lauf prüfen; nötigenfalls **Run workflow** auf `main` starten.
4. Ziel: https://cobrachris.github.io/meine-livekarte/

Alternative ohne Actions: unter Pages **Deploy from a branch**, `main` und `/ (root)` auswählen. Die Anwendung benötigt keinen Build. HTTPS für GPS aktiviert lassen. Der Workflow setzt die Pages-Konfiguration voraus; das Einchecken allein aktiviert Pages nicht.

## Hinweis bei erstem GitHub-Pages-Deployment

Nach dem erstmaligen Aktivieren von **Settings → Pages → Source: GitHub Actions** kann ein zuvor fehlgeschlagener Deploy-Lauf erneut gestartet werden. Änderungen auf `main` lösen den vorhandenen Workflow ebenfalls neu aus.

**Hakone-Yumoto:** Die Abschnitte von Gleis 2 und Gleis 3 liegen hintereinander an einem durchgehenden Bahnsteig. Es sind zwei getrennte Gleise, nicht dasselbe Gleis mit wechselnder Nummer. Der reguläre Odawara-Zug nutzt Gleis 2; das konkrete Ankunftsgleis aus Gōra muss vor Ort überprüft werden.
