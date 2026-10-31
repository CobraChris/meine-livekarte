## Popups mit Abstand und verschiebbarer Karte (31.10.2026)

Bei Ortsmarkern steht das Info-Popup jetzt **24 Pixel weiter oberhalb** des Pins, mit einem größeren Schutzabstand zum oberen Kartenrand. Dadurch bleibt die Marker-Nadel sichtbar. Das Popup bleibt technisch fest an genau diesem Ort verankert.

Im Popup gibt es neben dem Titel einen kleinen Griff **„⠿ Ziehen“**. Halte ihn gedrückt und verschiebe den Finger: Die Karte wird passend darunter verschoben, sodass der Marker **gemeinsam mit seinem Popup** wandert. Ein frei losgelöstes Fenster, das einen falschen Ort suggerieren könnte, entsteht nicht. Buttons wie „＋ Tour“, „Fußweg anzeigen“, „Google Maps“, „Bearbeiten“ sowie das Schließen bleiben normal antippbar. Auf Tastaturen verschieben die Pfeiltasten bei fokussiertem Griff das Popup samt Karte in 36-Pixel-Schritten. Das Verschieben löst **keine GPS- oder Routing-Netzwerkanfrage** aus und ändert keine gespeicherten Orte.

# Meine Live-Karte

### GPS automatisch beim Öffnen und kürzere Fußwege (30.10.2026)

Beim App-Start wird mit erteilter bzw. neu angeforderter Browserberechtigung automatisch die aktuelle Position ermittelt und nach dem ersten GPS-Fix auf dem Handy zentriert. Ein manuelles **„GPS ausschalten“** deaktiviert zugleich den automatischen Start beim nächsten Öffnen; **„GPS einschalten“** aktiviert beides wieder. Nur diese Wahl wird lokal gespeichert, niemals Standortkoordinaten oder ein Bewegungsverlauf. Manuelles Kartenverschieben/Zoomen pausiert das Folgen, ohne die Messung zu beenden. Bei bereits verweigerter Berechtigung wird nicht bei jedem Öffnen erneut gefragt.

Beim expliziten Aufruf eines Fußwegs fragt die App beim FOSSGIS-OSRM-Fußgängerprofil jetzt auch nach Alternativwegen. Falls tatsächlich eine **kürzere, plausible und zeitlich vergleichbare** Strecke geliefert wird, erscheint diese statt der zuerst empfohlenen Route. Endpunkte, die deutlich vom gewählten GPS-Start oder Ziel entfernt liegen, werden strenger abgewiesen. Bei ungewöhnlich großen Umwegen oder schlechter GPS-Genauigkeit erscheint ein Warnhinweis mit Verweis zum Gegencheck in Google Maps. Ein kürzerer Weg ist nicht garantiert: Datenqualität, Gebäudeeingänge und Zielkoordinaten können zwischen OSM und Google Maps abweichen. Die App bleibt ohne Live-Abbiegeanweisungen, und Routen werden weiterhin ausschließlich nach Nutzeraktion neu abgefragt.


### Kompakte Kartensteuerung und App-Updates

Auf Smartphones sind **Ziele/Route zeigen** und **GPS ein-/ausschalten** jetzt zwei kompakte **44 × 44 px große, senkrecht angeordnete Symbole** rechts unten auf der Karte. Die gut lesbaren Beschriftungen bleiben für Screenreader, Tooltips und die internen Zustände erhalten. Das vermeidet zwei große quer über die Karte laufende Buttons. Die Bedienung über den blauen Standortpunkt, den GPS-Folgen-Button und den Vollbildbutton bleibt unverändert.

Ein Orts-Popup zeigt **„🚶 Fußweg anzeigen“** und **„↗ Google Maps“** direkt unter dem Ortsnamen, **vor** längeren Beschreibungen und Zeit-/Besuchshinweisen. Sehr lange Popups sind auf eine angemessene Höhe begrenzt und lassen sich intern scrollen.

Die installierte PWA bleibt bei schon laufendem JavaScript normalerweise auf ihrem aktuellen Stand, bis sie neu geladen wird. Die GitHub-Pages-Veröffentlichung schreibt daher bei **jedem Deploy** dieselbe Commit-ID sowohl in `build-version.js` (aktuell geladene Version) als auch in `app-version.json` (neueste veröffentlichte Version). Versionierte CSS- und JS-Dateiadressen verhindern außerdem veraltete Browser-HTTP-Caches. Wenn ein neuer Stand verfügbar ist, bietet ein kleiner Hinweis unter der Karte **„↻ Aktualisieren“** an. Die Prüfung erfolgt beim Öffnen und nach Rückkehr in den Vordergrund; sie erzwingt keinen Neustart und löscht weder lokale Reisepläne noch IndexedDB-Geräteschlüssel. Der Service Worker nutzt weiter eine strenge App-Shell-Allowlist mit Network-first und Cache-Fallback, **keine** GitHub-Tokens oder Routen-/Kartenanfragen.

**Bereits vor dieser Verbesserung geöffnete PWA:** Einmal aus der Android-Übersicht der zuletzt verwendeten Apps vollständig schließen und über das App-Symbol erneut öffnen; bisherige Browserdaten **nicht** löschen und die App **nicht** entkoppeln. Die neue Aktualisierungsaufforderung kann erst wirken, sobald die neue App-Version einmal geladen ist.

## Bonz Brew/Bonds Brew: persönlicher Food-Marker in Takayama (31.10.2026)

Auf ausdrücklichen Wunsch wurde **Bonds Brew beer craft** (vom Nutzer „Bonz Brew“ genannt) als privater Karten-Merker in der Kategorie Restaurant ergänzt. Ort: 36.1426055 N, 137.2601207 E, Kamininomachi 67-1, Takayama. Der Ort wird nur für den Takayama-Reiseabschnitt über einen gezielten einmaligen lokalen Migrationsschritt in die gespeicherten Orte übernommen. Bereits ausgewählte Rundgänge bleiben unverändert. Auch bei schon installierter App wird nach dem Versionswechsel und Neustart der Marker lokal hinzugefügt. Das Importieren erzeugt keine GPS- oder Netzwerkabfrage. Name und Koordinaten stammen aus einer überprüften Google-Maps-Ortsseite, die Beschreibung von der offiziellen Shopseite.

## Sehenswürdigkeiten entlang eines Fußwegs entdecken (31.10.2026)

Im bereits berechneten Rundgang steht der optionale Bereich **„◇ Entlang der Route entdecken“** bereit. Die App fragt **nur nach ausdrücklichem Klick** auf „Sehenswürdigkeiten suchen“ eine eng begrenzte OpenStreetMap-Overpass-Abfrage nach Museen, Kunstwerken, Aussichtspunkten, Denkmälern, Burgen und anderen benannten Sehenswürdigkeiten ab. Dabei wird **die Bounding Box des aktuellen Fußwegs einschließlich seiner GPS-Startumgebung** an `overpass-api.de` übermittelt, aber kein GPS-Verlauf. Es wird nie auf Standortaktualisierungen reagiert, automatisch nachgefragt oder die Abfrage offline gespeichert. Nur kompakte lokale Routen können durchsucht werden. Für die kostenlose Overpass-Instanz gibt es keine garantierte Verfügbarkeit.

Bis zu zwölf Treffer werden mit ungefährem Abstand zum **tatsächlichen Linienverlauf** sortiert und als zusätzliche türkisfarbene Vorschau-Pins auf der Karte angezeigt. Namen und Tags stammen aus OSM, nicht aus einer redaktionellen Prüfung. Ein Treffer kann einzeln **gespeichert** oder bei höchstens sechs gewählten Zielen über **„＋ Tour“** in den Rundgang aufgenommen werden; die Route wird dann bewusst verworfen und muss neu berechnet/optimiert werden. Die Suche verändert weder die gespeicherten Orte noch die Rundgang-Reihenfolge automatisch. Bereits gespeicherte Orte und mehrfach erfasste OSM-Objekte werden so weit möglich dedupliziert. Geschätzte Seitendistanz ist **kein** echter Umweg. Öffnungszeiten, Besuchsdauer, Zugänglichkeit und Eignung müssen vor Ort geprüft werden.

## Intelligenter Tagesplan (31.10.2026)

Nach einer Rundgangberechnung den Bereich **„🗓 Intelligenter Tagesplan“** öffnen. Der Plan nutzt **nur die bereits vom FOSSGIS-Fußwegdienst berechneten Etappen** und benötigt keine zusätzlichen Netzwerkaufrufe. Standard-Startzeit ist **10:30 Uhr**, anpassbar. Besuchsdauern werden aus vorhandenen Ortsangaben (z. B. „45–90 Min.“ als nachvollziehbarer Mittelwert) geschätzt und können einzeln geändert werden. Sind keine Dauern hinterlegt, wird **45 Min. ausdrücklich als Vorschlag** angezeigt. Zusätzliche Puffer sowie eine optionale Mittagspause zwischen 11:30 und 14:30 nach einem Stopp können eingestellt werden.

**Öffnungszeiten werden niemals erfunden oder aus unstrukturierten Notizen als verifiziert angenommen.** Pro ausgewähltem Ort gibt es freiwillige Felder „Öffnet“ und „Schließt“, die der Nutzer für den konkreten Besuchstag selbst überprüft und einträgt. Der Rechner berücksichtigt frühes Eintreffen durch Wartezeit und warnt vor verspäteter Ankunft oder Besuchsende nach Schließung. Ohne Angaben steht explizit „Öffnungszeiten nicht hinterlegt“. Freie Hinweise (z. B. spätere Beleuchtung) erscheinen im Ablauf, werden aber nicht in automatische Restriktionen umgedeutet.

Der Plan zeigt **Ankunft, tatsächliche Besuchszeit, Wege, Wartezeiten, Puffer, Mittagspause und voraussichtliches Tagesende**. Einstellungen, selbst eingetragene Dauern und Tagesöffnungsfenster werden pro Reiseabschnitt und Ziel **nur lokal** im Browser gespeichert. GPS-Koordinaten, Routengeometrie und Aufenthaltsverlauf werden nicht gespeichert. Bei einer geänderten Reihenfolge oder neu berechneter Route wird der Zeitplan passend neu erstellt; ohne Route zeigt die App ausdrücklich an, dass keine verlässlichen Fußwegzeiten verfügbar sind. Die Tageszeiten sind Schätzungen, keine Echtzeitnavigation oder automatische Prüfung aktueller Öffnungszeiten.

## Live-Rundgang mit GPS-Etappen (31.10.2026)

Nach dem Berechnen einer Mehrziel-Fußroute auf der Karte **„▶ Tour starten“** drücken. Der kompakte Karten-HUD zeigt dann **Stopp X von Y**, den Namen des nächsten Ziels sowie geschätzte Restentfernung/-gehzeit. Die GPS-Position wird gegen die bereits einmalig abgerufene Route abgeglichen – **ohne Netzwerkabruf bei GPS-Updates**. Die Kartenansicht folgt der Position, bis man sie manuell verschiebt; über den GPS-Zentrierknopf lässt sich das Folgen fortsetzen.

Bei guter GPS-Genauigkeit (höchstens 25 m) und zwei aufeinanderfolgenden Messungen in maximal 22 m Zielnähe zeigt die App **„Ziel erreicht“**. Auch ohne verlässliche Messung darf man bewusst per **„Nächster Stopp“** fortfahren; die App springt nie automatisch zur nächsten Sehenswürdigkeit. Nach dem letzten Ziel kann man die Tour abschließen. **Pause/Fortsetzen** hält die laufende Etappe an, ohne die Route zu löschen. Bei zwei verlässlichen Abweichungsmessungen erscheint ein Hinweis mit **„↻ Restweg neu“**: Dieser sendet ausschließlich nach dem Klick eine neue Fußweganfrage für die noch ausstehenden Ziele; für nur ein Ziel wird die bewährte Einzelzielroute verwendet. Danach startet die GPS-Begleitung bewusst neu. Route, Etappenstand und GPS-Verlauf werden nicht dauerhaft gespeichert; die bereits vorhandenen Tour-Orts-IDs bleiben erhalten. Sprachansagen, Hintergrundnavigation bei geschlossener App sowie automatische Umleitungen gibt es nicht.

## Routenoptimierung nach echten Fußwegen (31.10.2026)

Im Rundgang-Planer steht neben „Auswahl leeren“ jetzt **„✨ Route durch KI optimieren“**. Damit ermittelt der OSRM-Fußwegdienst die günstigste Reihenfolge für 2–6 gespeicherte Stopps **vom aktuellen GPS-Standort** und liefert gleichzeitig die durchgehende Fußwegroute, Etappen und Gehzeiten – **nur eine Anfrage**. Der Start ist fest, das Ende frei; es gibt **keine automatische Rückkehr zum Startpunkt**. Die Optimierung basiert auf den Routingkosten/Gehzeiten im Fußwegenetz (bei höchstens 7 Punkten verwendet OSRM intern eine vollständige Reihenfolgensuche) und ist keine reine Luftliniensortierung. Die als „KI“ bezeichnete Funktion verwendet einen algorithmischen OSRM-Routenoptimierer und kein generatives KI-Modell. Sie garantiert nicht, dass jede reale Situation oder Gebäudeeingang exakt abgebildet ist.

Die gefundene Reihenfolge wird für den aktiven Reiseabschnitt als Orts-IDs lokal gespeichert und im Planer, auf der Karte und in der Etappenliste übernommen. Standort und Routengeometrie werden nicht gespeichert. Mit ↑/↓ und **„🚶 Rundgang berechnen“** bleibt eine manuelle Reihenfolge jederzeit möglich. Falls der Optimierungsdienst die Anfrage nicht unterstützt oder keine zusammenhängende Route findet, wird eine verständliche Meldung angezeigt; die bisherige Auswahl bleibt erhalten. Die Sicherheitschecks für Ortsnähe, Wegpunkte und Etappen sowie das FOSSGIS-Limit von maximal einer Anfrage pro Sekunde gelten weiterhin.

## Gespeicherte Orte bearbeiten und einzeln löschen (31.10.2026)

Tippe auf einen Marker in der Karte oder öffne seinen Listeneintrag und wähle **„✎ Bearbeiten“**. Im Dialog kannst du **Name, Kategorie, eigene Notiz und Beschreibung** korrigieren. Der geografische Markerstandort bleibt dabei absichtlich unverändert. **„🗑 Diesen Ort löschen“** entfernt nach einer ausdrücklichen Rückfrage nur diesen einen Marker; **„Alle löschen“** ist nicht mehr nötig, um Testeinträge zu entfernen.

Umbenennen migriert die alten Ortsschlüssel in sämtlichen Reiseabschnitten, Rundgang-Entwürfen und persönlichen Tagesplan-Einstellungen, ohne andere Punkte zu verändern. Löschen entfernt gezielt die entsprechenden Referenzen. Betroffene aktuell berechnete Routen werden verworfen, damit keine veraltete Route angezeigt wird. Unabhängige Routen bleiben erhalten. Alle Änderungen geschehen **ausschließlich lokal auf dem Gerät**, ohne neue Netzwerk- oder GPS-Abfragen; vor dem Speichern wird auf ungültige oder doppelte Ortsnamen an derselben Position geprüft. Ein Speicherfehler führt nicht zur absichtlichen Löschung der bisherigen Daten.

## Neuen Lieblingsort direkt auf der Karte merken (31.10.2026)

In der Kartenleiste gibt es **„📌 Ort merken“**. Ein Tipp aktiviert den Platzierungsmodus; tippe auf eine freie Stelle der Karte und trage im kompakten Dialog **Name, Kategorie (Essen, Sehenswürdigkeit, Bahnhof oder Hotel) und optional eine Notiz** ein. Eine vorläufige blaue Markierung zeigt die gewählte Position, bevor sie gespeichert wird. Im Dialog kannst du alternativ **deinen aktuellen GPS-Punkt** übernehmen (nur bei aktivem und ausreichend frischem GPS). Auf Touch-Geräten kann auch ein langer Druck auf eine freie Kartenstelle den Dialog öffnen. **Abbrechen** speichert nichts.

Ein gespeicherter Ort wird dem gerade aktiven Reiseabschnitt zugeordnet, sofort als Kartenpin sichtbar und zum lokalen Browser-Speicher hinzugefügt. Bestehende gespeicherte Orte, Tour-Reihenfolgen, Tagespläne und Routen werden nicht ersetzt oder gelöscht. Ein bereits existierender Ort mit gleichem Namen in unmittelbarer Nähe wird nicht erneut angelegt. **Weder die Karteneingabe noch das Speichern lösen eine Online-Suche oder einen Routingaufruf aus**; als lokaler Merker bleibt der Ort auf diesem Gerät. Der Kartenhintergrund selbst verwendet weiterhin OpenStreetMap-Kacheln, wenn Internet verfügbar ist.

## Direkt aus der Karte Tourstopps auswählen (31.10.2026)

Im Stadt-Reiseabschnitt kannst du auf der Karte **„＋ Tour auf Karte“** wählen. Danach werden die vorhandenen Ortspins durch einen **einzigen Fingertipp** zur Tour hinzugefügt oder wieder entfernt. Du brauchst keine Namen in der Ortsliste zu suchen. Ausgewählte Pins erhalten sichtbare gelbe Nummern von 1–6; oben wird die Anzahl angezeigt. Nach **„Fertig“** springst du zum bestehenden Rundgangplaner, um die Route zu optimieren oder zu berechnen. Der gleiche Modus lässt sich über **„📍 Orte direkt auf Karte auswählen“** innerhalb des Rundgangplaners öffnen.

Im Normalmodus öffnet Antippen wie bisher das Orts-Popup; dort gibt es zusätzlich einen deutlich sichtbaren **„＋ Tour“**-Button direkt beim Namen. Bereits gespeicherte Touren werden verwendet, die Reihenfolge entspricht der Reihenfolge der Pin-Tipps. Beim Entfernen oder Hinzufügen wird eine eventuell zuvor berechnete Route wie bisher zurückgesetzt, damit nicht veraltete Gehzeiten angezeigt werden. Die Auswahl ist ausschließlich lokal gespeichert. Der Auswahlmodus benötigt weder GPS noch Internet, löst keine Routinganfragen aus und bleibt bei App-Neustart **nicht automatisch aktiviert**.

## Rundgang mit mehreren Zielen

Unter den Import-/Teilen-Schaltflächen befindet sich der **eingeklappte Rundgang-Planer**. Er ergänzt den bisher einzeln berechneten Fußweg, ohne die Karte dauerhaft mit großen Bedienelementen zu verdecken:

1. Einen Reiseabschnitt wie **Takayama** oder **Kyoto** auswählen. **Schnellmodus:** Auf der Karte „＋ Tour auf Karte“ oder im Planer „📍 Orte direkt auf Karte auswählen“ drücken. Anschließend direkt die Kartenmarkierungen antippen – sie werden mit **1–6** nummeriert und können durch erneutes Antippen abgewählt werden. Mit „Fertig“ gelangst du zum Rundgangplaner; die Auswahl ist sofort lokal gespeichert. Alternativ bei **2 bis 6 gespeicherten Orten** auf **„＋ Tour“** tippen. In den Ortskarten wird die Auswahl als **„✓ Tour“** hervorgehoben. Ein Klick darauf entfernt diesen Ort wieder aus der Tour.
2. **„🚶 Rundgang planen“** ausklappen. Die Reihenfolge mittels **↑/↓** manuell festlegen; optional **„✨ Route durch KI optimieren“** verwenden. Der Routingdienst ordnet Stopps anhand tatsächlicher **Fußweg-Kosten** ab dem GPS-Start und zeigt dabei die Route direkt an. Stopps und Besichtigungsdauern bleiben im Planer sichtbar.
3. Auf **„🚶 Rundgang berechnen“** tippen. Nur dann werden die aktuelle GPS-Startposition und alle ausgewählten Ziele in **einer** FOSSGIS-OSRM-Fußweg-Anfrage übermittelt (`/routed-foot/route/v1/driving/`). OSRM verbindet **alle Punkte in der festgelegten Reihenfolge**. Die Antwort muss für alle Zwischenstopps passende Snap-Koordinaten, eine durchgehende GeoJSON-Geometrie und nachvollziehbare Etappen enthalten; sonst gibt es eine Fehlermeldung statt einer falschen Strecke.
4. Die Karte zeigt den **gelb gestrichelten Gesamtrundgang** mit **durchnummerierten Zwischenstopps**. Der kompakte Karten-Chip zeigt Anzahl, echte Routingstrecke und reine Gehzeit; im Planer stehen die **Etappen mit Gehzeiten und Entfernungen**. Die Gehzeit umfasst **keine Besichtigungen, Pausen oder Warteschlangen**.
5. **„×“ am Tour-Karten-Chip** beendet nur die Tour-Routenanzeige. Die gespeicherten Auswahl-/Reihenfolge-IDs bleiben erhalten; du kannst die Tour später neu berechnen, auch nach einem App-Neustart. **„Auswahl leeren“** entfernt nur diese Rundgangliste, nicht deine gespeicherten Orte.

**Grenzen / Datenschutz:** Es handelt sich um eine geordnete Tour **vom aktuellen GPS-Standort bis zum letzten ausgewählten Ziel**, ohne automatische Rückfahrt zum Ausgangspunkt und ohne Abbiegesprache. Maximal sechs Ziele, maximal 12 km direkte Distanz zwischen zwei Stopps und maximal 25 km Gesamtluftlinie schützen vor absurd langen Wegen und zu großen Anfragen. Jede Route wird höchstens **einmal auf ausdrücklichen Knopfdruck** berechnet, mit einem gemeinsamen Mindestabstand von 1,2 Sekunden zwischen Einzel- und Tourrouten. **Die Auswahl/Stoppreihenfolge** wird ausschließlich im Browser gespeichert; **kein GPS-Startpunkt, kein Positionsverlauf und keine berechnete Routengeometrie** werden gespeichert oder via GitHub-Sync übertragen. FOSSGIS erhält die Start- und Zielkoordinaten der bewusst angefragten Tour und kann sie protokollieren. Die App prüft vor Anzeige sämtliche Snap-Distanzen; abgelegene Ziele, Inseln oder fehlende Fußwege können scheitern. Öffnungszeiten, Fahrtkosten und tatsächliche Sperrungen werden nicht live abgefragt. Ohne Internet keine neue Routenerstellung, aber bestehende Reisepläne bleiben nutzbar.

**Kartenlizenz:** OpenStreetMap-Mitwirkende (Kartendaten); Berechnung durch FOSSGIS: https://routing.openstreetmap.de/about.html; Probleme an der Karte melden: https://www.openstreetmap.org/fixthemap. Die Kartendaten sind offen, die öffentliche Routing-Infrastruktur ist keine garantierte kommerzielle API.

## Aktive GPS-Fußwegnavigation (bewusst einschaltbar)

Nach **„🚶 Fußweg anzeigen“** lässt sich im bestehenden Fußweg-Informationsfenster **„▶ GPS-Navigation starten“** wählen. Diese Funktion ist eine GPS-gestützte Kartenführung, **kein** turn-by-turn Navigator mit Straßennamen oder Sprachansagen.

- Die große Fußweg-Infobox klappt zur **kleinen, weiterhin antippbaren Routenanzeige** zusammen. Sie zeigt **verbleibende Meter und geschätzte Gehminuten**.
- Solange der Benutzer die Karte nicht selbst verschiebt, folgt die Karte laufend dem blauen GPS-Punkt. Manuelles Verschieben/Zoomen unterbricht nur das automatische Zentrieren; das bestehende **⌖**-Symbol stellt die GPS-Folgefunktion wieder her. **GPS ausschalten** entfernt wie bisher die Route.
- Das Fortschrittsmodell liegt lokal in `walking-core.js`. Es projiziert den GPS-Punkt auf die bereits vorhandene, echte OSRM-Fußweg-Geometrie und berechnet die verbleibenden Meter/Minuten als **Schätzwerte** entlang dieser Route. Die berechnete Gehzeit ist keine live gemessene Geschwindigkeit. Dafür sind **keine zusätzlichen Netzwerkanfragen, GPS-Verläufe oder Schlüssel erforderlich**.
- Nach **zwei aufeinanderfolgenden, ausreichend präzisen GPS-Messungen** mit mindestens ca. 40 Metern seitlicher Abweichung (GPS-Genauigkeit berücksichtigt) zeigt der kompakte Chip **„⚠ Weg verlassen · neu berechnen“** an. Tippen öffnet die Info und **„↻ Neu berechnen“** startet *nur auf ausdrücklichen Wunsch* eine neue Anfrage an den öffentlichen FOSSGIS-Dienst. Gehen oder GPS-Ereignisse lösen niemals selbst Netzwerkanfragen aus.
- Bei schlechter Genauigkeit (über ca. 60 m) wird **„GPS ungenau“** angezeigt; aus einer schlechten Messung wird weder ein Verlassen der Route noch eine sichere Zielankunft abgeleitet. Bei zwei guten Messungen innerhalb von etwa 22 Metern vom Zielpunkt erscheint **„✓ Ziel erreicht“**. Beide Schwellwerte sind Orientierungshilfen, keine Sicherheits- oder Buchungsnachweise.
- Mit **„■ GPS-Navigation stoppen“** wird ausschließlich die Live-Führung beendet; die gepunktete Route bleibt stehen. Das vorher vorhandene **„✕ Route beenden“** entfernt Route und Navigation bewusst vollständig. Die externe Google-Maps-Navigation bleibt verfügbar, wenn Sprach-/Abbiegehinweise benötigt werden.
- Bei einem aktualisierten/reberechneten Fußweg zum gleichen Ziel bleibt die manuell gestartete GPS-Navigation aktiv und verwendet danach die neue Geometrie. Ein ganz anderes Ziel benötigt eine erneute bewusste Aktivierung der Navigation.

**Datenschutz & Offline:** Die laufenden GPS-Messungen werden für diesen Modus lokal im Speicher verarbeitet, nicht gespeichert oder synchronisiert. Nur die explizite Funktion **„Fußweg anzeigen“/„Neu berechnen“** sendet Start und Ziel an FOSSGIS. Ohne Netzwerk kann eine *bereits berechnete und noch geöffnete* Route weiter anhand von GPS verfolgt werden, sofern das Gerät GPS und die App weiter zulässt. Es wird kein Offline-Routing versprochen; die Kartengrundlage kann ohne Netz fehlen. Eine installierte PWA im Hintergrund kann vom Betriebssystem angehalten werden und ist kein Ersatz für eine dafür ausgelegte Navigations-App.

## Gepunkteten Fußweg direkt in der Karte anzeigen

Aus einem gespeicherten Ort (im Marker-Popup oder in der Ortsliste) lässt sich **„🚶 Fußweg anzeigen“** wählen. Voraussetzung: GPS ist aktiv (standardmäßig automatisch beim Öffnen, sofern nicht manuell deaktiviert) und hat innerhalb der vergangenen 60 Sekunden eine gültige Positionsmessung geliefert.

- Die App fragt **nur beim Antippen** einmal eine **Fußgängerroutenberechnung einschließlich möglicher Alternativen** beim öffentlichen OSRM-Server von FOSSGIS an. Es wird ausdrücklich das `/routed-foot/`-Profil verwendet, nicht das Auto-Profil. Der `driving`-Abschnitt ist lediglich die API-Routenbezeichnung der OSRM-Instanz.
- Die Antwort enthält OpenStreetMap-basierte Weggeometrie und Gehzeit/Entfernung. Diese werden **nicht erfunden und nicht als Luftlinie** angezeigt. Auf der Karte zeichnet die App den Weg blau-weiß gepunktet; die kompakte Infobox zeigt **Meter/Kilometer, ungefähre Gehzeit und Zielname**.
- **Routeninfo ausblenden ohne Route zu löschen:** Das **×** oben rechts im Fußweg-Fenster klappt ausschließlich das Infofenster ein. Die gepunktete Linie bleibt auf der Karte, und ein kleiner Chip zeigt Distanz/Gehzeit und öffnet die Details wieder. Zum tatsächlichen Löschen gibt es eine eigene, klar beschriftete Taste **„✕ Route beenden“**. Ein Reiseabschnittswechsel, das Löschen der gespeicherten Orte oder GPS-Ausschalten entfernt die Route weiterhin aus Sicherheits- und Kontextgründen.
- **„↻ Neu berechnen“** verwendet nach einem weiteren expliziten Tippen die neueste GPS-Messung. **Kein** automatisches Neuberechnen bei jedem GPS-Update; damit schont die App Privatsphäre, Akku und die öffentlichen Server. Nach GPS-Ausschalten, Wechsel des Reiseabschnitts oder Löschen der Orte wird die Route entfernt.
- **„↗ Google Maps“** bleibt als Alternative für vollständige Sprach-/Abbiegenavigation verfügbar. Die gezeichnete Route stellt eine unverbindliche Wegeempfehlung dar; sie ist keine Echtzeit- oder Sicherheitsnavigation.
- Der öffentliche Routingdienst wird auf maximal eine Anfrage je 1,2 Sekunden begrenzt. Der Anbieter FOSSGIS erlaubt leichte nichtkommerzielle Nutzung und verlangt Attribution, Link für Kartenfehler sowie faire Nutzung: https://routing.openstreetmap.de/about.html. Für stärkere Nutzung oder gewerbliche Skalierung muss der Routingdienst ersetzt beziehungsweise eigens betrieben werden.
- **Datenschutz:** Anders als die normale Kartendarstellung sendet eine solche explizite Fußweganfrage die aktuelle GPS-Koordinate und die gewählte Zielkoordinate an `routing.openstreetmap.de`. Dieser Dienst verarbeitet die Route serverseitig und kann Anfragen protokollieren. Die App speichert die Route nicht dauerhaft, erstellt keine Standortverläufe, verschickt keine Anfragen bei jedem GPS-Schritt und gibt keine GitHub-Tokens oder Ticketinformationen an FOSSGIS weiter.
- **Offline:** Externes Fußwegrouting erfordert Internet. Der installierte Service Worker speichert ausschließlich `walking-core.js` als lokalen Programmcode, niemals Routinganfragen oder Ergebnisrouten. Wenn FOSSGIS nicht erreichbar ist, gibt es eine Fehlermeldung und die Google-Maps-Alternative – **keine falsche Gerade zum Ziel**.

## Als Android-App installieren (PWA)

Die bestehende GitHub-Pages-Live-Karte ist als **Progressive Web App (PWA)** installierbar: eigenes dunkelgrün-goldenes Kartensymbol mit **C-förmiger Reiseroute**, App-Name **„Meine Live-Karte“**, Start vom Android-Homescreen und eigenständiges Fenster ohne Browser-Adressleiste. Es wird **keine APK und kein Google-Play-Konto** benötigt. Der Web-App-Ursprung bleibt `https://cobrachris.github.io/meine-livekarte/`.

### Installation auf Android

1. Die Live-Karte möglichst im Browser öffnen, in dem die bisherige Geräte-Kopplung besteht (beispielsweise Chrome oder Samsung Internet).
2. Unterhalb der Karte den kleinen Bereich **„📲 Live-Karte als App installieren“** aufklappen. Falls der Browser einen programmatischen Installationsdialog bereitstellt, wird die Schaltfläche **„Jetzt als App installieren“** sichtbar.
3. Sonst über das Browsermenü **⋮ → App installieren** beziehungsweise **Zum Startbildschirm hinzufügen** wählen (Bezeichnung hängt vom Browser ab).
4. Auf dem Startbildschirm die neue **Live-Karte** öffnen. Die PWA verwendet das eigene `manifest.json` und die aus `icons/livekarte.svg` erzeugten PNG-Icons in 192, 512 und 512 Pixel Maskable.

**Vorsicht beim Browserwechsel:** Bei derselben Browser-/App-Profil-Partition werden gespeicherte Reisepläne, Orte, Ticketstatus und die nicht exportierbare private RSA-Kopplung aus IndexedDB weiterverwendet. Das ist bei einem Browserwechsel oder isolierten Installationsprofil **nicht garantiert**. Bestehende Browserdaten nicht löschen, nicht unnötig entkoppeln und einen neuen öffentlichen Kopplungscode nur bei tatsächlichem Schlüsselwechsel an ChatGPT senden. Ein separat angelegter Homescreen-Shortcut ist nicht immer gleich einer installierten PWA.

### Offline-Funktion und Sicherheit

Der Service Worker `sw.js` cachet *ausschließlich* die App-Oberfläche, die lokal eingebundenen Skripte, Leaflet und die Icons (Network-first mit Offline-Fallback). Bereits gespeicherte Reisepläne, Ziele und Fahrkartenstatus liegen weiterhin im Browser-Speicher des jeweiligen Profils.

- **Online:** Programmdateien werden stets zuerst aktuell vom Netzwerk geladen. Änderungen an den Reiseplänen und Ticketstatus bleiben vom Service-Worker-Cache getrennt.
- **Offline:** App-Shell und lokale Daten sind verfügbar, sofern sie zuvor erfolgreich geladen wurden. **OpenStreetMap-Hintergrundkacheln werden absichtlich nicht offline gespeichert**, daher kann die Kartenfläche ohne Internet leer erscheinen. Routenlinien und gespeicherte Ziele sind unter Umständen ohne Kartenhintergrund sichtbar. Google-Maps-Navigation und GitHub-Synchronisierung benötigen Internet.
- **Privatsphäre:** GitHub-Token, unverschlüsselte GitHub-Statusdokumente, das verschlüsselte `sync/inbox`-Postfach, GPS-Koordinaten, API-Anfragen, andere Domains und OSM-Kacheln stehen **nicht** auf der Service-Worker-Cache-Liste. Der Service Worker greift nur GET-Anfragen des eigenen App-Ursprungs aus einer festen Liste ab. Der Token für den privaten GitHub-Rückkanal bleibt weiterhin ausschließlich in der laufenden Browsersitzung und muss nach einem echten Neuladen neu eingegeben werden.
- **Aktualisierungen:** Eine Browser-Neuladung lädt bei vorhandener Verbindung die aktuelle App. Offline verwendet das System den zuletzt erfolgreich installierten Programmstand. Falls die Browserdaten gelöscht werden, können lokale Daten und der RSA-Privatschlüssel verloren gehen.

### PWA-Icon-Build auf GitHub Pages

Die editierbare Icon-Vorlage ist `icons/livekarte.svg`. Die GitHub-Actions-Veröffentlichung installiert **CairoSVG 2.8.2 in einer temporären Python-Umgebung**, erstellt mit `scripts/build_pwa_icons.py` die drei benötigten PNG-Dateien und veröffentlicht sie mit Manifest, Service Worker, JavaScript und CSS. Es gibt **keine Laufzeitabhängigkeit von CairoSVG**. Tests überprüfen Manifest, notwendige Dateien und das strikte Cache-Verhalten. Ohne eine erfolgreiche Pages-Veröffentlichung sind Installierbarkeit und Icons noch nicht live nachgewiesen.

Mobile, statische Leaflet-Karte mit OpenStreetMap, Dark Mode und Empfehlungen aus ChatGPT. Ohne Backend, Registrierung, Build-Schritt oder API-Schlüssel.

## Verwenden

1. Website über HTTPS öffnen (GPS funktioniert auch auf localhost).
2. **Orte importieren**: JSON oder Text einfügen. Mehrere Importe werden ergänzt; gleiche Namen an gleichen Koordinaten werden zusammengeführt. Maximal 200 Orte, 100.000 Zeichen pro Import.
3. Pins oder **Auf Karte** anklicken, Kategorien filtern, mit **Alle Orte** den Ausschnitt anpassen. Touch-Zoom und Verschieben werden unterstützt. **Zoom:** Zwei-Finger-Zoom ist flüssiger und rastet nicht mehr bei ganzen Zoomstufen ein; die +/−-Schaltflächen zoomen in halben Stufen. Die darunterliegenden OpenStreetMap-Rasterkacheln haben weiterhin feste Detailstufen.
4. **GPS wird beim App-Start automatisch eingeschaltet**, sofern nicht zuvor manuell ausgeschaltet. **GPS einschalten** reaktiviert die automatische Standortaktualisierung mit blauem Punkt und Genauigkeitskreis. Zusätzlich zeigt ein **blauer Richtungspfeil**, wohin das Smartphone ausgerichtet ist, falls der Browser nordbezogene Kompassdaten liefert. GPS und ggf. der Kompass fragen um Erlaubnis. Die Karte folgt zunächst dem Standort. **Manuelles Zoomen (auch +/−) oder Verschieben pausiert die automatische Zentrierung**, GPS und Kompass aktualisieren sich weiterhin. Zum erneuten Folgen erscheint ein **⌖-Button**; der blaue Standortpunkt kann ebenfalls dafür angetippt werden. **GPS ausschalten** beendet GPS und Kompass und entfernt den Standort sowie die Entfernungen. Bei fehlender Kompassunterstützung bleibt nur der blaue Punkt sichtbar.
5. **Zu Fuß** öffnet Google Maps mit dem gewählten Ziel; Google bestimmt den Startpunkt. Die angezeigte Entfernung in der Karte ist Luftlinie.
6. **Teilen** erzeugt einen Link mit allen Empfehlungen. Link kopieren oder manuell aus dem Textfeld kopieren. Beim Öffnen werden die übermittelten Orte zu den bisher gespeicherten Empfehlungen hinzugefügt (ohne doppelte Einträge), automatisch lokal im Browser gespeichert und auf der Karte hervorgehoben. Sehr große Datensätze müssen zum Teilen gekürzt werden (maximal 30.000 URL-Zeichen).
7. **Startkarte:** Ohne Empfehlungen und ohne GPS zeigt die Karte eine neutrale Weltansicht statt einer fest vorgegebenen Stadt. Mit GPS-Berechtigung folgt sie beim Start automatisch deinem Standort, außer du hast GPS bewusst deaktiviert. Auf Smartphones ist die Kartenansicht höher und hat einen **⛶ Vollbildmodus**; mit **✕** kehrst du zur Seitenansicht zurück.
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

## Mobile Oberfläche und präzise Etagenanzeige

Auf Smartphones wird die große Marken-Kopfzeile ausgeblendet, weil der Browser bereits die Seitenadresse anzeigt. Die Reiseabschnittsauswahl, GPS und Kartenaktionen bleiben erhalten. Die rein dekorative Meldung „Bereit für deinen nächsten Lieblingsort“ sowie erklärende Dopplungen unter einer vorhandenen Reiseetappe sind entfernt. Interaktionsmeldungen werden nur kurz eingeblendet, Fehler bleiben sichtbar. GPS-Genauigkeit ist über die Beschreibung des GPS-Knopfes verfügbar; sie erzeugt keinen dauerhaften Vollbreiten-Balken auf der Karte. Der OpenStreetMap-Urheberhinweis bleibt **sichtbar**, da er zur Kartennutzung gehört.

Der Nagoya-Pilot zeigt in seiner **Etagenübersicht explizit 2F → 1F → 2F**: Shinkansen-Bahnsteig (2F), Verbindungsebene und JR-Transfer-Gates (1F), JR-Bahnsteig mit Gleis 11 (2F). Die zwei Bahnsteigebenen sind tatsächlich auf derselben Höhe, aber durch einen Weg über die untere Verbindungsebene verbunden. Die schematische Darstellung ist **kein GPS-genauer Fußweg** und verwendet keine erdachten Entfernungen; bahnhofseigene Wegweiser sind verbindlich. Die Vor-/Zurück-Buttons bleiben im Scroll-Dialog gut erreichbar.

## Bidirektionale Ticketstatus-Synchronisierung (privater GitHub-Rückkanal)

Die Live-Karte besitzt jetzt zwei getrennte, ausdrücklich optionale Verbindungen:

1. **ChatGPT → Browser**: vorhandener RSA-OAEP-verschlüsselter GitHub-Pages-Eingang im öffentlichen Repository, Inhalte nur auf dem Gerät entschlüsselbar.
2. **Browser → ChatGPT**: neuer Upload auf ein **separates PRIVATES GitHub-Repository** über einen gezielt für dieses Repository ausgestellten Fine-grained GitHub-Token (Contents: Read/Write). Der eingeloggte GitHub-Connector in ChatGPT kann anschließend die private Statusdatei lesen, sofern er Zugriff auf das neue Repo hat.

**Warum getrennt?** Das bestehende Projekt `CobraChris/meine-livekarte` ist öffentlich. Ticketstatus und Reiseverlauf dürfen dort nicht als lesbare JSON-Datei landen. Die neue App verweigert deshalb den Upload, wenn GitHub das Ziel nicht ausdrücklich als `private: true` bestätigt.

### Einmalige Vorbereitung durch den Besitzer des GitHub-Accounts

1. Unter https://github.com/new ein **privates** Repository `meine-livekarte-private-sync` unter dem Konto `CobraChris` anlegen. Eine README-Datei beim Erstellen anlegen, damit das Repository einen Default-Branch besitzt.
2. Unter https://github.com/settings/personal-access-tokens/new?name=Livekarte-Private-Sync&contents=write einen **Fine-grained personal access token** erstellen. Als Repositoryzugriff nur `CobraChris/meine-livekarte-private-sync` auswählen. Nur **Contents → Read and write** (Metadaten-Lesezugriff ist GitHub-Standard) freigeben und eine kurze Ablaufzeit wählen.
3. Die Live-Karte in dem Browser öffnen, in dem bereits die RSA-Kopplung besteht. Den Bereich **🔒 ChatGPT-Synchronisierung → ↗ Status für ChatGPT bereitstellen** aufklappen. Repository-Namen und Token **nur dort** eintragen; **niemals den Token im Chat, in einem GitHub-Issue oder als URL übermitteln**.
4. **Privat verbinden und hochladen** tippen. Nach erfolgreicher Prüfung veröffentlicht die App ausschließlich `livekarte/status/<device-id>.json` im *privaten* Repository. Du erhältst eine Erfolgsmeldung mit der Zahl der Fahrten.
5. Im Chat kann der GitHub-Connector das private Dokument per `fetch_file` lesen. Wenn es zunächst nicht sichtbar ist, die GitHub-App/Connector-Berechtigung für das neue Repository erteilen. Die App überträgt Änderungen automatisch während derselben aktiven Browsersitzung; **bei neuem Seitenaufruf ist eine erneute Token-Eingabe nötig**.

### Inhalt und Datenschutz

Ein Dokument hat diese Struktur (Beispiel; **nicht** im öffentlichen Repo speichern):

```json
{"v":1,"device":"864d9d986ab66ddf2e836a26","tickets":[
  {"plan":"ride-takayama","date":"30.10.2026","from":"Odawara",
   "to":"Nagoya","departure":"10:11","status":"ready",
   "source":"manual","updatedAt":1793332800000}
]}
```

Synchronisiert werden **ausschließlich** Reisetag, Abschnittskennung, Start, Ziel, Abfahrtszeit, Ticketstatus, Herkunft und Änderungszeit. **Keine GPS-Positionen, gespeicherten Sehenswürdigkeiten, Buchungsnummern, Fahrkartenbilder, Passwörter oder QR-Codes.** Die vom Benutzer eingetragenen Ticketstatus werden nicht als durch die Bahngesellschaft unabhängig verifiziert dargestellt.

Das Dokument liegt im *privaten* GitHub-Repo als lesbares JSON. Der GitHub-Betreiber und ausdrücklich berechtigte Repository-Zugriffsberechtigte können es lesen; der Rückkanal ist **nicht Ende-zu-Ende-verschlüsselt**, im Gegensatz zur Gegenrichtung. GitHub-Dateien werden über HTTPS transportiert. Es gibt eine lokale und remote Änderungszeit pro Fahrt; ältere Angaben überschreiben keine neueren, konkurrierende Schreibzugriffe werden per Git-Blob-SHA wiederholt.

**GitHub-Schlüssel:** Wird nur während der aktiven Browsersitzung in JavaScript-Speicher gehalten, nicht in localStorage, IndexedDB, Repository, URL, ChatGPT oder Logs. Nach Neuladen oder „Rückkanal trennen“ ist eine erneute Anmeldung nötig. Ein kompromittierter Browser bzw. eingeschleuster Website-Code kann während dieser Sitzung trotzdem auf den aktiven Schlüssel zugreifen; nur kurze Tokenlaufzeit und genaue Repository-Begrenzung verwenden. Ein dauerhaftes, geräteübergreifendes OAuth-Login würde einen getrennten, authentifizierten Backend-/OAuth-Dienst erfordern.

Die Rückübertragung ist eine **explizit vom Benutzer aktivierte Sitzung**, keine Fernsteuerung von ChatGPT. Die bereits vorhandene lokale Ticketauswahl und der verschlüsselte Eingang funktionieren ohne den neuen GitHub-Token weiter. Die App meldet Erfolg erst, wenn GitHub die Datei tatsächlich bestätigt.

### Status im Chat abrufen

Nach Einrichtung verwendet ChatGPT den vorhandenen verbundenen GitHub-Connector, um die Datei `livekarte/status/<device-id>.json` aus `CobraChris/meine-livekarte-private-sync` zu lesen. Dabei gilt: Statuswerte sind Benutzer-/ChatGPT-Eingaben und keine unabhängigen Buchungsnachweise. ChatGPT kann den GitHub-Stand bei einer späteren Chat-Anfrage aktualisiert lesen; es erhält keine automatische Hintergrund-Pushbenachrichtigung.

## Geschützte Direkt-Synchronisierung mit ChatGPT (optionaler Ausbau)

Eine **einseitige, Ende-zu-Ende-verschlüsselte Inbox** erlaubt dem bereits verbundenen GitHub-Plugin in ChatGPT, bestätigte Ticketstatusänderungen für den Nutzer bereitzustellen, ohne jedes Mal einen Update-Link öffnen zu müssen.

- In der App **🔒 ChatGPT-Synchronisierung** aufklappen und **„Geschützte Verbindung vorbereiten“** wählen. Die App erzeugt ein **RSA-OAEP-3072/SHA-256**-Schlüsselpaar im Browser. Der **private, nicht exportierbare Schlüssel** wird lokal in **IndexedDB** gespeichert.
- **„Öffentlichen Kopplungscode kopieren“** und an ChatGPT senden. Der Code enthält nur Version, abgeleitete Geräte-ID und öffentlichen SPKI-Schlüssel. **Niemals private Schlüssel, Passwörter oder Tickets im Chat senden.**
- ChatGPT legt, **nach Prüfung der Buchung**, verschlüsselte Nachrichten unter `sync/inbox/<device-id>.json` über die bereits autorisierte GitHub-Verbindung ab. GitHub Pages stellt diese Datei bereit; der Browser holt sie beim Öffnen, Wiederanzeigen und alle 90 Sekunden (nur bei geöffneter App).
- Jeder Status wird ausschließlich nach lokaler Entschlüsselung auf die **exakte** Zugverbindung (Reisetag, Start, Ziel, Abfahrtszeit) angewendet. Ältere Updates überschreiben nicht den neueren manuellen Status. Es werden nur Ticketstatuswerte übertragen – **keine Buchungscodes, Ticket-QR-Codes, Adressen oder Namen**.
- Weder Backend noch API-Token im öffentlichen Web-Code nötig. Die öffentliche GitHub-Seite enthält nur **Ciphertext**, die Geräte-ID und Nachrichtenzeitpunkte. Das Repository selbst ist **nicht privat**; die Nachrichtengeheimhaltung beruht auf der Verschlüsselung. Zugang zur Publikation haben nur legitim schreibberechtigte Repository-Nutzer/verbundene GitHub-Tools.
- Es handelt sich **nicht** um eine OAuth-basierte Vollintegration. Statusänderungen aus der App werden nicht zum ChatGPT-Konto zurückgesendet. Verschiedene Browser brauchen eigene Kopplung. Ein gelöschter Browserschlüssel lässt sich nicht wiederherstellen. Bei geschlossener Website werden keine Push-Nachrichten empfangen.
- Der bisherige Bestätigungslink-Workflow bleibt als Fallback. Falls der Nutzer keine Kopplung möchte, ist alles wie bisher verwendbar.

Details und Verschlüsselungsformat: [sync/README.md](sync/README.md). Das lokale Hilfsskript `scripts/encrypt_ticket_update.py` erzeugt RSA-verschlüsselte Inbox-Ereignisse aus dem **öffentlichen** Kopplungscode (Python-Paket `cryptography`). Der Connector schreibt ausschließlich die resultierende Ciphertext-JSON-Datei.

## Ticketstatus pro Zugfahrt: manuell und aus dem Chat (30.10.2026)

Die Reiseübersicht zeigt jetzt **pro Teilstrecke** (nicht nur pro Bahnhof) einen lokalen Ticketstatus. Default ist ausnahmslos **❗ Ungeklärt**: ein angelegter Fahrplan, ein Aufenthalt im Zug oder ein gespeicherter Routenlink sind niemals ein Nachweis, dass auch alle benötigten Tickets, Reservierungen oder Zuschläge vorliegen.

- **❗ Ungeklärt (rot)** · ob alle Fahrscheine vorhanden sind, wurde noch nicht bestätigt
- **⛔ Noch kaufen (rot)** · benötigte Fahrkarten fehlen
- **◔ Gebucht · prüfen (gelb)** · Buchung bekannt, Ausgabe/QR, Gültigkeit, Zuschläge oder Reservierungen noch nicht überprüft
- **✓ Vorhanden (grün)** · nach konkreter Bestätigung ist der vollständige für die Fahrt nötige Fahrschein vorhanden

Die Statusauswahl ist direkt in jedem Abschnitt der Zug-Zeitleiste. Die Einstellungen werden **nur im selben Browser** als `livekarte-ticket-status-v1` gespeichert. Ein roter Abschnitt wird nicht automatisch grün, nur weil ein Zug im Plan steht.

**Aktualisierung durch ChatGPT ohne Backend:** Wenn ChatGPT anhand der Unterhaltung ausreichend sicher weiß, dass die nötigen Fahrkarten tatsächlich vollständig vorhanden sind, kann es einen Update-Link mit einem `#ticket=`-Fragment erzeugen. Beispiel:

`https://cobrachris.github.io/meine-livekarte/?view=ride-takayama#ticket=%7B%22v%22%3A1%2C%22plan%22%3A%22ride-takayama%22%2C%22date%22%3A%2230.10.2026%22%2C%22from%22%3A%22Odawara%22%2C%22to%22%3A%22Nagoya%22%2C%22departure%22%3A%2210%3A11%22%2C%22status%22%3A%22ready%22%7D`

Dieser konkrete Link bezieht sich **nur** auf Odawara → Nagoya mit dem Hikari 637 am 30.10.2026 um 10:11. Andere Teilstrecken bleiben ungeklärt. Das URL-Fragment enthält keine Buchungsnummer, keine personenbezogenen Daten und keinen QR-Code. Die App validiert Datum, Abschnitt und die exakte Teilstrecke, zeigt dann einen **Bestätigungsdialog** mit dem vorgeschlagenen Status und verändert den lokalen Stand erst nach explizitem Antippen von „Status übernehmen“. Linkdaten sind keine unabhängige Buchungsverifikation! Ein bloßer Link darf den Nutzer nicht irreführend als „buchungsbestätigt“ markieren.

**Wichtig:** ChatGPT hat keinen direkten Zugriff auf `localStorage` im privaten Browser. Solange die Website ohne Benutzerkonto/Backend betrieben wird, ist dieser **Bestätigungslink** der technisch sichere Weg, wie ChatGPT einen Status an den Browser übertragen kann. Der Link muss im selben Browser geöffnet werden, in dem die Live-Karte ihre Daten speichert. In-App-Browser und Chrome können getrennte Speicher besitzen. Für echte automatische geräteübergreifende Synchronisierung wäre später eine authentifizierte Datenablage nötig.

## Nagoya als erster erweiterbarer Bahnhofs-Pilot (30.10.2026)

Für den Reiseabschnitt **„30.10. Fahrt nach Takayama“** gibt es in Nagoya einen interaktiven deutschsprachigen **Bahnhofsmodus**, der ausdrücklich **ohne Indoor-GPS** funktioniert.

- **Ankunft:** Hikari 637, geplant 11:19. Westwärts fahrende Shinkansen benutzen in Nagoya gewöhnlich Gleis 16 oder 17; das Gleis des individuellen Zuges ist nicht live bestätigt.
- **Abfahrt:** Limited Express Hida 9, geplant 11:43 Richtung Takayama, regulär **Gleis 11**. Dies ist kein Echtzeit-Dienst; Bahnsteig auf der Anzeigetafel prüfen.
- **Schritte:** (1) Shinkansen verlassen → (2) zum JR-Linien-Transfer eine Ebene hinunter → (3) JR-Umsteigesperre statt Bahnhofsausgang nutzen → (4) zum Gleis 11 hinauf → (5) Hida 9 besteigen.
- Im Reiseplan **Nagoya** bzw. „Bahnhofsmodus · Gleis 11“ antippen oder, wenn die Karte Nagoya ab Zoomstufe 15 zeigt, die Schaltfläche **Nagoya · Umstieg 11** nutzen. Der dialogbasierte Wegweiser zeigt eine **deutsche, schematische Etagenübersicht**, den nächsten Schritt und die zu suchenden Schilder.
- Der Nutzer kann das tatsächliche Ankunftsgleis **manuell** auswählen und mit **Zurück / Nächster Schritt** durch die Anleitung gehen. Der Fortschritt wird lokal im Browser gespeichert. Es wird nicht angenommen, dass GPS oder Kompass innerhalb des Bahnhofs zuverlässig genug für eine genaue Gleisposition ist.
- **Originalplan auf Englisch:** https://global.jr-central.co.jp/en/info/station/_img/nagoya.jpg. Nur ergänzende Referenz; die deutsche Anleitung ist ohne Öffnen des Originalplans nutzbar.

Der Bahnhofsmodus verwendet keine bezahlten APIs und zeichnet **keine erfundenen Indoor-Fußwege** auf die Karte. Treppen, Etagen, Tore und Bahnsteige werden als Ablauf dargestellt und bei künftigen Pilotstationen separat verifiziert. Die Live-Anzeigetafeln sowie Personalhinweise haben Vorrang.

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
