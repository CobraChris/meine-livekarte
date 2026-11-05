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

## Kartensteuerung – Architekturbaustein 3

Die früheren direkten Kameraänderungen aus Bahnhofsmodi, Touren, Routing,
Suche, Import und Ortskarten laufen nun durch zwei einheitliche Adapter:
`focusMapPoint(point,zoom)` für eine einzelne Zielposition (Kameramodus
`manual`) und `fitMapArea(bounds,options)` für Routen und mehrere Ziele
(Kameramodus `day-goals`). Die Adapter rufen den `map-camera-core.js`-
Controller auf; Zoom- und Verschiebeereignisse während einer absichtlichen
Kameraänderung werden nicht irrtümlich als Fingerbewegung erkannt.
`animate:false` verhindert nachlaufende animierte Zoom-Ereignisse.

GPS-Folgen und die kombinierte Übersicht bleiben eigene gemeinsame Modi.
Die initiale Leaflet-Weltkarte und GPS-Zentrierung nutzen ihre dafür
vorgesehenen bisherigen Initialisierungs-/Folgefunktionen. Keine Änderung
der gespeicherten Reisen, Tickets, Orte oder Datenschutzeinstellungen.

**Nächste strukturelle Etappe:** Tageskontext (Reiseabschnitt, Datum, Ziele)
als ein einheitliches Datenobjekt ableiten, anschließend weitere Teile der
großen `app.js` modularisieren und mobile Browser-End-to-End-Tests ergänzen.

## Tageskontext – Architekturbaustein 4

`day-context-core.js` liefert für jeden ausgewählten Reiseabschnitt
eine einzige **rein abgeleitete, schreibgeschützte** Datenansicht mit
Reiseabschnitt, optionalem Reise-/Bahnplan, Datum, erlaubten Tagen,
Ortsliste, nach Tag sichtbaren Orten, Tageszielanzahl, Hotel-/Zieltrennung,
geographischem Kartenfokus und geordneter Routenvorschau.
`app.js` stellt sie über `currentDayContext()` bereit; Karte,
Google-Ansicht, Tagesschaltflächen, Routenliste und Tour-Entwürfe
lesen daraus, statt eigene Tagesfilter und Reihenfolgen zu bilden.

Der Kontext ändert keine Orte, Tickets, lokale Speicherstände,
GPS-Koordinaten oder Reiseverbindungen. Neue Kalendertage sind erst
zulässig, wenn `multi-day-core.js` sie ausdrücklich für einen
Reiseabschnitt definiert; für Reisen ohne Tageskalender bleibt
der bestehende ungefilterte Abschnitt erhalten. Nur die aktuelle
Kyoto-Reise besitzt derzeit eine konfigurierten Tageskalender; Nara
und Osaka sind Untertage dieses Abschnitts, keine getrennten Apps.

**Noch offen:** Die konkrete Tagesdarstellung und Fahr-/Gehwegetappen
vollständig aus einem gemeinsamen Routenmodell rendern sowie weitere
UI-Controller aus `app.js` extrahieren. Für neue Reisetypen
müssen weiterhin eigene Reise-*daten*, aber keine neue Kartennavigation
angelegt werden.

## Einheitliches Routenmodell – Architekturbaustein 5

`route-model-core.js` normalisiert **drei klar getrennte Geometrietypen**:
`straight` (lokale Luftlinienvorschau), `routed-foot` (berechnete
Gehweggeometrie) und `schematic-rail` (schematische Bahnstrecke).
Jeder Routentyp besitzt dieselbe Schnittstelle mit `stops`, `points`,
`segments`, `distance`, `duration`, `style`, `note` und `real`.
Erkennbar fehlende Werte werden `null` und niemals geschätzt.
Die Bahnverbindung enthält nur verifizierte Haltepunkte, Umstiegszeiten und
bereits gespeicherte `via`-Punkte, keine vermeintlichen Gleisgeometrien.
Alle Koordinaten werden vor der Darstellung geprüft.

`currentDayRoute()` verbindet den gemeinsamen Tageskontext mit diesem
Routenmodell. Leaflet und die optionale Google-Demo nutzen dieselbe
Stoppreihenfolge und dieselbe Unterscheidung von Vorschau und echter Route.
Die einzelnen Fußweg- und Tourberechnungen normalisieren ihre
Darstellungsdaten ebenfalls über dieses Modell, belassen aber die
bewährten OSRM-Rohdaten unverändert für die laufende GPS-Navigation.
`renderJourney()` bezieht die Bahnstück-Geometrie aus dem selben Modul.

**Nächste Etappe:** Die getrennten Karten-Panels und Fußweg-/Bahntageslisten
weiter in eine durchgängige, generische Routenansicht integrieren; dazu
echte Touch-End-to-End-Tests für Android-/PWA-Ansichten hinzufügen.

## Mobile End-to-End-Tests – Architekturbaustein 6

Das GitHub-Actions-CI-Gate startet nach den Node-Unit-Tests einen **echten
headless Google-Chrome-Browser** mit Android-ähnlichem Touch-/Viewport-Profil
(393 × 852, Geräte-Pixelverhältnis 2). Das Browser-Testskript liegt in
`tests/mobile-browser.e2e.cjs`; der Test nutzt `playwright-core` und das
bereits auf dem GitHub-Runner vorhandene Chrome. Ein separater
Browser-Download oder bezahlter Kartenanbieter ist nicht erforderlich.

- Die Webseite wird lokal von einem kurzlebigen HTTP-Server geladen.
- Jeder Zugriff auf Drittanbieter (OSM-Kacheln, Routing, Google) wird
  blockiert; eine simulierte GPS-Position existiert nur im Browserkontext.
- Testmatrix: Kyoto 03.11., Nara 04.11., Osaka 05.11. und
  Nikkō (Bahnanreise). Derselbe Tagesschalter und die drei Kartenbuttons
  müssen überall funktionstüchtig bleiben.
- Auf Nara werden die Pop-up-Aktionen tatsächlich im Browser angetippt.
  Ein echtes Chrome-Touchereignis wird auf einer Pop-up-Schaltfläche
  ausgelöst, die Karte muss sich darunter bewegen, das Pop-up geöffnet
  bleiben und es darf kein Fußweg versehentlich aktiviert werden.
- Die Tagesübersicht muss sowohl den simulierten GPS-Punkt als auch
  Nara-Ziele zeigen. Der GPS-Punkt darf nicht hinter den Kartenbuttons
  liegen.
- Browser-Laufzeitfehler lassen den Test scheitern; bei Fehlern wird
  ein Screenshot für die GitHub-Actions-Diagnose gespeichert.
- Der Test ist Bestandteil des bereits bestehenden `test`-Jobs.
  Ein fehlschlagender Mobildurchlauf **blockiert die Veröffentlichung**.

Dies ist ein realer Chrome-Touchtest, **kein Test auf einer echten
Samsung-Uhr oder einem konkreten Galaxy-Gerät**. Geräteübergreifende
Unterschiede (Samsung Internet, Android-System-PWA) bleiben weiterhin
ein begrenztes Restrisiko.

## Tagesauswahl als eigenständiges UI-Modul – Architekturbaustein 7

`day-selector-ui.js` rendert Datums-Buttons, Zielanzahl, Tageszusammenfassung,
Kartenfokus-Beschriftung und die Datumswahl in Orts-Pop-ups aus dem
zentralen `day-context-core.js`. Es kennt weder GPS noch `localStorage`,
`fetch`, Leaflet oder Tickets. Tageswechsel und Zuordnungen werden über
Callbacks an `app.js` zurückgegeben; das UI-Modul verändert die Daten nicht.

`app.js` enthält nur noch dünne Adapter `renderCityDays()` und
`makePlaceDayPicker()`. Der bewährte persistente Zustand,
die Reiseabschnittswechsel und die Route-Invalidierung bleiben dort,
bis sie in einer getrennt getesteten Etappe sicher ausgelagert werden.

Das Modul unterstützt datengetrieben beliebige Reiseabschnitte mit
explizit definiertem Tageskalender. Die derzeit vorhandenen Kyoto-/Nara-/
Osaka-Tage bleiben unverändert. Node-DOM-Verhaltenstests und das reale
mobile Chrome-Gate prüfen gemeinsam die Darstellung.
