# Meine Live-Karte

Mobile, statische Leaflet-Karte mit OpenStreetMap, Dark Mode und Empfehlungen aus ChatGPT. Ohne Backend, Registrierung, Build-Schritt oder API-Schlüssel.

## Verwenden

1. Website über HTTPS öffnen (GPS funktioniert auch auf localhost).
2. **Orte importieren**: JSON oder Text einfügen. Mehrere Importe werden ergänzt; gleiche Namen an gleichen Koordinaten werden zusammengeführt. Maximal 200 Orte, 100.000 Zeichen pro Import.
3. Pins oder **Auf Karte** anklicken, Kategorien filtern, mit **Alle Orte** den Ausschnitt anpassen. Touch-Zoom und Verschieben werden unterstützt.
4. **GPS einschalten** startet kontinuierliche Standortaktualisierung mit blauem Punkt und Genauigkeitskreis. Der Browser fragt um Erlaubnis. Die Karte folgt; Verschieben pausiert das Zentrieren. Tippen auf den blauen Punkt zentriert erneut. **GPS ausschalten** beendet die Abfrage und entfernt den Standort und die Entfernungen.
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

## Datenschutz

GPS startet ausschließlich durch einen Tastendruck und wird nur im Arbeitsspeicher verarbeitet. GPS-Koordinaten werden weder lokal gespeichert noch in Links oder Navigations-URLs eingefügt. Ausschalten und Verlassen der Seite beenden die Standortabfrage. Empfehlungen (einschließlich Orten aus empfangenen Kartenlinks) bleiben im localStorage dieses Browsers. Nach erfolgreichem Speichern wird das Linkfragment aus der Adresszeile entfernt, damit „Leeren“ nicht beim Neuladen rückgängig gemacht wird. Geteilte Orte stehen im URL-Fragment (nicht im HTTP-Request an GitHub Pages); Empfänger können diese lesen und weitergeben. Keine Analyse, Cookies oder eigene Telemetrie.

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

Manueller Android-Check: Touch-Zoom, Import mehrerer Orte, Popup und Filter, GPS erlauben/verweigern, Bewegung, GPS ausschalten, Link in neuem Tab öffnen, Google-Fußgängernavigation. Reales GPS und externe Navigation müssen auf dem Endgerät geprüft werden.

## GitHub Pages veröffentlichen

Die Datei `.github/workflows/pages.yml` prüft JavaScript und Tests in Pull Requests und veröffentlicht nach Änderungen an `main` nur die öffentlichen Website-Dateien.

1. Pull Request nach `main` zusammenführen.
2. Repository **Settings → Pages → Build and deployment → Source: GitHub Actions** auswählen (Administratorrechte nötig).
3. Unter **Actions → Test and deploy static site** den erfolgreichen Lauf prüfen; nötigenfalls **Run workflow** auf `main` starten.
4. Ziel: https://cobrachris.github.io/meine-livekarte/

Alternative ohne Actions: unter Pages **Deploy from a branch**, `main` und `/ (root)` auswählen. Die Anwendung benötigt keinen Build. HTTPS für GPS aktiviert lassen. Der Workflow setzt die Pages-Konfiguration voraus; das Einchecken allein aktiviert Pages nicht.

## Hinweis bei erstem GitHub-Pages-Deployment

Nach dem erstmaligen Aktivieren von **Settings → Pages → Source: GitHub Actions** kann ein zuvor fehlgeschlagener Deploy-Lauf erneut gestartet werden. Änderungen auf `main` lösen den vorhandenen Workflow ebenfalls neu aus.
