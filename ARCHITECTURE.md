# Architekturprinzipien – Meine Live-Karte

## Ziel

**Eine App, keine separaten Tagesanwendungen.** Orte, Tage und Reiseabschnitte
sind Daten. Anzeige, Kartensteuerung, Pop-ups, GPS, Routen und Tickets sind
wiederverwendbare Funktionen. Ein Fehlerfix in einer gemeinsamen Funktion
muss für Kyoto, Nara, Osaka, Nikkō sowie neue Orte gelten.

## Aktueller Stand und Grenzen

Die historische `app.js` enthält noch umfangreiche Zustands- und UI-Logik.
Diese wird schrittweise extrahiert – kein riskanter Big-Bang-Rewrite während
der Reise. Bereits getrennte Kernmodule: `core.js`,
`multi-day-core.js`, `walking-core.js`, `day-plan-core.js`,
`route-discovery.js`, `place-search-core.js`.

Mit dem ersten Architekturbaustein `map-popup-core.js` benutzen **alle
Leaflet-Markierungstypen** dieselbe Methode `bindMapPopup`:
- normale Orte / Sehenswürdigkeiten in allen Städten und Tagen;
- entdeckte Orte entlang einer Route;
- Zwischenstopps einer Tour;
- Bahnhöfe und Reiseabschnitt-Stationen.

Ein kurzer Tap bedient Buttons und Links normal; ein Wisch über Titel, Text
oder einen Button bewegt die Karte unter dem verankerten Pop-up.
Native Formfelder / Auswahlmenüs sind von dieser Geste ausgenommen;
lange, überlaufende Texte können gescrollt werden.
Es gibt keinen zweiten speziellen „Nara-Popup“-Code.
Die Implementierung ist unabhängig von Tagesdaten, Browser-Storage und Netz.

## Modulverträge und Folgereihenfolge

1. **Map UI / Pop-ups:** `map-popup-core.js` wird zur einzigen Quelle für
   Bindung, Autopan, mobile Abstände und Wischgesten. `app.js` darf
   `marker.bindPopup` nicht direkt aufrufen.
2. **Kartensteuerung:** Standortsicht, Tagesziel-Fit und GPS-Folgen bleiben
   unterschiedliche Aktionen mit gemeinsamem Zustandsmodell.
3. **Tagesplanung:** `multi-day-core.js` liefert aktive Ziele eines Datums;
   eine einzige Tourkomponente verarbeitet diese, statt Ortsnamen abzufragen.
4. **Routen:** reale Gehwege nur bei ausdrücklichem Routing-Aufruf;
   lokale Luftlinienvorschau muss erkennbar davon unterschieden werden.
5. **Persistenz:** gespeicherte Orte, Tickets und GPS-Einstellungen bleiben
   in ihren bisherigen Stores; keine Migration ohne gezielte Tests.

## Definition of Done für künftige UI-Funktionen

- Die Implementierung liegt in einem gemeinsamen Modul und nicht in einer
  `if(day==='Nara')`-Ausnahme.
- Testabdeckung prüft Verhalten statt nur Codefragmente – insbesondere:
  Popup-Tap, Swipe auf Buttons/Text, native Eingabefelder, Pop-up schließen.
- Derselbe Testvertrag wird für Reiseziele, Tourstopps, Fundorte und
  Bahnhöfe sowie für verschiedene Tagesauswahlen erfüllt.
- Android/PWA: Touch, externer Browser und Offline-Shell werden berücksichtigt.
- Bei Datenänderungen bleiben alte Reisen und gespeicherte Nutzerdaten erhalten.

## Noch offen

Die Aufteilung der großen `app.js` in Kartensteuerung, Tagesansicht,
Reisestrecken und persistente Einstellungen ist als **mehrstufiger Refactor**
zu betrachten. Die erste Stufe vereinheitlicht Pop-ups; sie bedeutet nicht,
dass bereits die gesamte Anwendung vollständig modularisiert wäre.

## Kartensteuerung – Architekturbaustein 2

`map-camera-core.js` verwaltet vier mutually exclusive Kamera-Modi:
`manual` (Karte vom Nutzer verschoben),
`gps-follow` (Standort immer zentrieren),
`day-goals` (Ziele des Tages im Fokus) und
`overview` (Standort und Ziele zusammen).
Die Kartenansicht ist flüchtiger UI-Zustand und enthält keinerlei gespeicherte
GPS-Koordinaten. `app.js` enthält nur noch eine gemeinsame Adapterstelle
`setCameraMode`/`withCameraView` und ruft keine eigenen booleschen
Folge-Modi pro Reiseabschnitt auf. Programmatische `fitBounds`-/
`setView`-Aktionen sind als solche gekennzeichnet, sodass sie nicht
versehentlich manuelles Verschieben auslösen. Manuelle Drag-/Zoom-Gesten
verlassen jeden aktiven Kamera-Modus. GPS-Updates bewegen die Karte nur im
`gps-follow`-Modus.

**Noch zu erledigen:** Die verbleibenden alten `map.setView`-/
`map.fitBounds`-Aufrufe in Spezialabläufen (Bahnhöfe, Import, Tour)
inkrementell durch dieselbe Kamera-API ersetzen. Nicht stillschweigend
davon ausgehen, dass `app.js` insgesamt bereits modular ist.
