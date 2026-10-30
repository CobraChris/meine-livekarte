# Meine Live-Karte

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
