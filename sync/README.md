# Verschlüsseltes Synchronisierungspostfach (öffentliches GitHub Pages)

Hier werden nach der einmaligen Kopplung **nur RSA-OAEP-verschlüsselte Nachrichten** veröffentlicht. Der Inhalt der Nachricht – etwa ein Ticketstatus – darf **niemals im Klartext** im öffentlichen Repository gespeichert werden. Der private Schlüssel bleibt als **nicht exportierbarer CryptoKey** in der IndexedDB des Browsers und wird nicht an ChatGPT oder GitHub gesendet.

## Verbindung herstellen

1. In der Live-Karte den Bereich „🔒 ChatGPT-Synchronisierung“ öffnen und „Geschützte Verbindung vorbereiten“ wählen.
2. Den **öffentlichen** JSON-Kopplungscode (Version 1, Geräte-ID und SPKI-Public-Key) kopieren und in dieser ChatGPT-Unterhaltung übermitteln. Er enthält keinen privaten Schlüssel.
3. ChatGPT validiert, dass die ID den ersten 12 Byte des SHA-256-Hashs des SPKI-Schlüssels entspricht; es kann den öffentlichen Schlüssel in `sync/recipients/<device>.json` aufbewahren. Das ist unkritisch, da es nur ein **öffentlicher Schlüssel** ist.
4. ChatGPT verfasst künftig nur bei **bestätigtem Ticketstatus** eine verschlüsselte Nachricht für die konkrete Fahrt und legt sie in `sync/inbox/<device>.json` ab. Dies geschieht ausschließlich über den bestehenden authentifizierten GitHub-Connector des Nutzers.
5. GitHub Pages veröffentlicht die neue verschlüsselte Datei nach dem erfolgreichen CI-Deployment. Der Browser fragt sie beim Öffnen, Sichtbarwerden und etwa alle 90 Sekunden ab und entschlüsselt lokal.

## Nachrichtenformat (v1)

Öffentlich sichtbare Postfachdatei (Beispieldaten, keine reale Nachricht):

```json
{"v":1,"device":"aabbccddeeff001122334455","messages":[{"id":"20261030-abcde12345","ciphertext":"BASE64URL_RSA_OAEP_CIPHERTEXT"}]}
```

Die nach dem Entschlüsseln erwartete JSON-Nachricht lautet:

```json
{"v":1,"id":"20261030-abcde12345","issuedAt":1793390000000,"ticket":{"v":1,"plan":"ride-takayama","date":"30.10.2026","from":"Odawara","to":"Nagoya","departure":"10:11","status":"ready"}}
```

- RSA-OAEP, 3072 Bit, SHA-256, Schlüssel SPKI DER base64url.
- `issuedAt` ist Unix-Zeit in Millisekunden; ältere Updates überschreiben keine neuere lokale Entscheidung.
- Nur exakte Fahrtabschnitte werden akzeptiert; keine kompletten Buchungsunterlagen oder QR-Codes in der Nachricht.
- Jeder einmal verarbeitete Nachrichten-Identifier wird lokal notiert. Andere Browser/Geräte benötigen ein eigenes Schlüsselpaar; kein geräteübergreifender Ticketstatusabgleich.
- Bei gelöschten Browserdaten ist der private Schlüssel verloren; alte Nachrichten lassen sich nicht wieder entschlüsseln.
- Repos und GitHub-Pages-Daten sind **öffentlich lesbar**, allerdings nur als Ciphertext. GitHub-Repositoriumsbesitzer/Collaborators können Nachrichten ändern. Githubs Schreibberechtigung ist hier die Absenderkontrolle, **keine unabhängige kryptografische Signatur**.
- Keine hochsensiblen Daten, Identitätsnachweise, Ticket-QR-Codes, API-Keys oder persönliche Buchungsnummern ablegen. Die Metadaten (Geräte-ID, Nachrichtenanzahl, Updatezeit) sind öffentlich erkennbar.
- Das System ist eine **einseitige verschlüsselte Zustellung**, keine OAuth-basierte bidirektionale ChatGPT-App-Anbindung.

## Synchronisierung diagnostizieren

Nach Tippen auf **„Jetzt synchronisieren“** zeigt die App nun statt der pauschalen Meldung „kein neues Update“ separate Zahlen:

- **Postfach erreichbar**: GitHub Pages hat die JSON-Datei ausgeliefert
- **Bereits verarbeitet**: Diese Nachrichten-ID wurde lokal schon bestätigt
- **Neu entschlüsselt**: Das Smartphone konnte den Ciphertext mit seinem privaten Schlüssel öffnen
- **Akzeptiert**: Die Nachricht war für eine vorhandene Zugverbindung gültig und wurde verarbeitet; der Status kann bereits vorher identisch gewesen sein
- **Entschlüsselung/Format fehlgeschlagen**: Das Format oder die Verschlüsselung stimmt nicht. Die fehlerhafte Nachricht wird **nicht** als erledigt gespeichert und kann nach Korrektur erneut verarbeitet werden
- **Reiseplan passt nicht/Übernahme fehlgeschlagen**: Gültig entschlüsselte Nachricht konnte keinem gültigen aktuellen Abschnitt zugeordnet bzw. nicht lokal gespeichert werden. Auch sie bleibt erneut prüfbar.

**HTTP 404** bedeutet, dass das Postfach auf GitHub Pages noch nicht erreichbar ist – etwa weil die Veröffentlichung noch nicht abgeschlossen ist. Das beweist weder eine falsche Kopplung noch einen Schlüsselverlust.

**Sicherheit:** Kein privater Schlüssel, verschlüsselte Nutzdaten oder persönlicher Buchungsinhalt wird in Diagnosemeldungen ausgegeben. Bei Problemen nicht das Gerät entkoppeln oder die Browserdaten löschen, bevor der Fehler eingegrenzt wurde.

Am 30.10.2026 wurde die erste nicht unabhängig verifizierte Test-Ciphertext-Datei durch eine neu mit dem hinterlegten öffentlichen Gerätsschlüssel und standardmäßigem RSA-OAEP/SHA-256 erzeugte Testnachricht ersetzt. Die App darf ihren tatsächlichen Empfang erst nach erfolgreicher Entschlüsselung und Verarbeitung auf dem Smartphone bestätigen.
