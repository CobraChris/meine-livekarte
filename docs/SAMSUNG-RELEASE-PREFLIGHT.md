# Samsung-Abnahme nach der Japanreise

**Gültig für:** Integrationsentwurf #124 (Pakete #115–#118). **Nicht** für die derzeitige Produktivversion. Der Entwurf bleibt bis zu erfolgreicher Abnahme unveröffentlicht.

## Bereits automatisch geprüft

- Node-Tests für Ticket-/Bahnmodell, GPS-Guidance, Kartensteuerung und Stationen.
- Echter Chrome-Test im mobilen Format: Fingergesten, GPS-Folgen, Pop-ups, Tokyo- und Nagoya-Hinweise.
- Zusätzlicher PWA-Offline-Abnahmetest: Service-Worker-Installation, Neustart ohne Netzwerk, Nikkō-Reiseabschnitt, **synthetisches** lokal gespeichertes PDF-Ticket sowie unveränderte Ticketbytes und `localStorage`. Dieser Test arbeitet ausschließlich in einem temporären Browserprofil.
- Externe Drittanbieteranfragen sind in den Browserprüfungen blockiert. Keine kostenpflichtige API.

**Wichtig:** Ein grüner Browser-Test ersetzt **nicht** die reale Samsung-PWA-Abnahme.

## Sichere Abnahme auf dem Samsung (erst nach Rückreise)

1. **Vorbereitung:** Installierte App wie gewohnt öffnen. Bei vorhandenen echten Ticketdateien eine Sicherung exportieren und außerhalb der App kontrollieren. Ein Export ist **unverschlüsselt**; weder in GitHub noch hier hochladen.
2. **Karte:** Nikkō-Reiseabschnitt und Tokyo-Umstiegshilfe öffnen. Schrittweise vor-/zurückgehen. Die Anzeige darf kein tatsächlich bestätigtes Ankunfts- oder Abfahrtsgleis behaupten.
3. **Navigation:** GPS einschalten. Bei guter Genauigkeit den Richtungspfeil drehen lassen, Karte mit dem Finger verschieben und prüfen, dass das automatische Zentrieren stoppt. Bei schlechtem Signal darf keine verbindliche Routenabweichung suggeriert werden.
4. **Lokale Daten:** Eine bereits vorhandene Ticketdatei öffnen, App vollständig schließen und wieder starten. Dieselbe Datei muss weiterhin abrufbar sein; gespeicherte Orte und Tagesplanungen bleiben vorhanden. Keine Tickets löschen, keine Daten zurücksetzen.
5. **Offline:** Zuerst **online** starten, dann Flugmodus aktivieren und PWA neu starten. Reiseabschnitte und gespeicherte Dokumente müssen erreichbar bleiben. Externe Kartenkacheln, neue Online-Routen und Live-Fahrpläne sind offline nicht garantiert. Flugmodus wieder ausschalten.
6. **Rollback/Go:** Bei Fehlern nur Symptom und betroffene Funktion dokumentieren, Screenshots ohne QR-/Buchungsdaten. Integration bleibt bis zur Reparatur Draft. Erst nach grünen Tests und diesen fünf Kernfunktionen eine separate Release-PR für `main` freigeben.

## Trennung der Versionen

- `main`: produktive, weiterhin installierte Reise-App.
- `work/115-…` bis `work/118-…`: unabhängig getestete Entwicklungszweige.
- `integration/115-118-preflight-20261105`: gemeinsame **Draft**-Integration; niemals automatisch nach `main` übernehmen.
- GitHub Pages Deployment nur aus `main` nach erfolgreich durchlaufener CI.
