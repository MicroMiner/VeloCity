# Discord-News-Editor aktivieren

## Was bereits besteht und so bleibt

- Webseite: GitHub Pages, News-Übersicht, Detailseite und manuelle Admin-Verwaltung.
- Admin-/News-Worker: `holy-sunset-4eb4velocity-admin-api`, vorhandene D1-Bindung
  `NEWS_DB`, bestehendes Website-Passwort und signierte Website-Sitzungen.
- Discord-Abgleich: `.github/workflows/sync-news.yml`, manuell startbar und
  `17 * * * *`. Das ist ein automatischer Lauf pro Stunde zur Minute 17.
  GitHub wertet Cron in UTC aus; in der Schweiz ist es ebenfalls Minute 17.
  GitHub kann die Ausführung verzögern. Danach wird die Webseite veröffentlicht;
  eine bereits geöffnete Seite muss neu geladen werden.
- Gelöschte Discord-Nachrichten werden im aktiven statischen Import weiterhin
  aufbewahrt. Die manuelle Website-Verwaltung kann sie wie bisher ausblenden/löschen;
  deren D1-Überlagerungen werden von späteren Importen nicht überschrieben.

Es gibt keinen neuen dauerhaften Bot-Prozess und keine zweite Datenbank.
Die Discord-Anwendung empfängt Interaktionen über den vorhandenen Worker.
Ihre sichtbare Offline-Präsenz in Discord ist dafür unerheblich.

## 1. Werte bereitstellen

Im Discord Developer Portal dieselbe Anwendung öffnen, deren Bot schon vom
bestehenden News-Import verwendet wird.

| Einstellung | Fundort / Verwendung |
|---|---|
| `DISCORD_APPLICATION_ID` | General Information → Application ID |
| `DISCORD_PUBLIC_KEY` | General Information → Public Key, 64 Hex-Zeichen; öffentlich |
| `DISCORD_GUILD_ID` | ID eures Discord-Servers |
| `DISCORD_CHANNEL_ID` | bestehende News-Kanal-ID |
| `DISCORD_NEWS_ADMIN_ROLE_IDS` | erlaubte Rollen-IDs, kommagetrennt |
| `DISCORD_NEWS_ADMIN_USER_IDS` | optional erlaubte Benutzer-IDs, kommagetrennt |
| `DISCORD_BOT_TOKEN` | Bot-Token dieser Anwendung; ausschliesslich als Secret |

Discord-IDs lassen sich bei aktiviertem Entwicklermodus per Rechtsklick kopieren.
Rollen-IDs werden in den Servereinstellungen bei den Rollen kopiert. Mindestens
eine Rollen- oder Benutzerfreigabe muss gesetzt sein. Ohne Freigabe verweigert
der Worker alle Editor-Zugriffe, auch für Discord-Administratoren.

Das vorhandene GitHub-Actions-Secret `DISCORD_BOT_TOKEN` bleibt bestehen.
Für das Veröffentlichen durch den Worker wird derselbe Token zusätzlich als
Cloudflare-Secret benötigt. Er ist weder das Website-Admin-Passwort noch der
`DISCORD_INGEST_TOKEN`. Keine Tokens in Frontend-Dateien oder ins Repository schreiben.
Falls der ursprüngliche Token nicht mehr vorliegt und zurückgesetzt werden muss,
müssen anschliessend **Cloudflare und das bestehende GitHub-Secret** aktualisiert
werden, damit der laufende Import nicht ausfällt. Nicht unnötig zurücksetzen.

Beispiel ohne echte Zugangsdaten: `worker/discord-editor.env.example`.

## 2. Cloudflare-Worker aktualisieren

Im bestehenden Admin-/News-Worker unter Settings → Variables and Secrets die
öffentlichen Einstellungen aus der Tabelle als Textvariablen hinzufügen und
`DISCORD_BOT_TOKEN` als Secret setzen. `ADMIN_PASSWORD`, `GITHUB_TOKEN`,
`DISCORD_INGEST_TOKEN` und die Datenbankbindung `NEWS_DB` unverändert lassen.

Dann Edit code öffnen und den gesamten Code durch
[`worker/dashboard-worker.mjs`](../worker/dashboard-worker.mjs) ersetzen; Deploy klicken.
**Nicht den separaten BlueMap-Proxy ersetzen.** Neue SQL-Migrationen sind nicht nötig.

Alternativ mit bereits angemeldetem Wrangler:
`npx wrangler deploy --config worker/wrangler.toml`.
Bei Wrangler die öffentlichen Variablen tatsächlich konfigurieren; die Beispiele
in `wrangler.toml` sind absichtlich auskommentiert. Tokens nur per Secret verwalten.

Die Einzeldatei wird mit `node scripts/build-news-worker.mjs` erzeugt.

## 3. Interactions Endpoint im Developer Portal

Unter General Information → Interactions Endpoint URL eintragen:

`https://holy-sunset-4eb4velocity-admin-api.red-base-d220.workers.dev/discord/interactions`

Speichern. Discord prüft dabei eine signierte PING-Anfrage. Der Worker antwortet
nur bei gültiger Ed25519-Signatur mit PONG; falsche Signaturen erhalten HTTP 401.
PING braucht kein Website-Admin-Passwort und keine neue Website-Anmeldung.

Schlägt das Speichern fehl: Deployment und Public Key prüfen. Public Key und
Application ID müssen aus derselben Anwendung stammen. Ein Browser-Aufruf der
Endpoint-URL zeigt absichtlich HTTP 405; das ist kein gültiger Discord-PING.

## 4. Slash-Command registrieren – ohne Codespaces-Anmeldung

Im Repository unter Actions den Workflow **Discord news command einrichten** wählen.
Run workflow → Branch `main`, Application ID und Guild ID eintragen, starten.
Er verwendet das bereits vorhandene GitHub-Secret `DISCORD_BOT_TOKEN`.
Es wird nur der Guild-Command `/news` mit dem Unterbefehl `erstellen` registriert
oder aktualisiert. Andere Command-Namen werden nicht gelöscht. Die Optionen eines
bereits bestehenden `/news`-Commands werden durch diese Definition ersetzt.
Die Registrierung erstellt **keinen News-Beitrag** und ist wiederholbar.

Alternativ lokal mit den drei gesetzten Umgebungsvariablen:

```bash
node scripts/register-discord-news.mjs --dry-run
node scripts/register-discord-news.mjs --apply
```

Ohne `--apply` gibt es keine Discord-Schreibzugriffe. Echte lokale Secret-Dateien
werden durch `.gitignore` ausgeschlossen. Tokens nicht in die Shell-Historie schreiben.

## 5. Discord-Berechtigungen

Die Anwendung muss mit `bot` und `applications.commands` im Server installiert sein.
Im News-Kanal braucht der Bot View Channel, Read Message History, Send Messages,
Embed Links und Attach Files. Der vorhandene Message Content Intent bleibt für
normale Kanalnachrichten aktiviert; der Editor ersetzt ihn nicht.

Der registrierte Command ist standardmässig für Nicht-Administratoren deaktiviert.
Unter Servereinstellungen → Integrationen → Anwendung → `/news` gegebenenfalls die
erlaubten Rollen/Benutzer freigeben. Zusätzlich bleibt die Worker-Allowlist aus
Schritt 1 zwingend. Die Discord-Sichtbarkeit allein ist keine Veröffentlichungsfreigabe.

Der Worker prüft signierten Server, Anwendung, Eigentümer und aktuelle Rollen bei
jeder Editor-Aktion. Unmittelbar vor dem Senden werden Mitgliedschaft/Rollen erneut
per Discord-REST gelesen; auch Bot-Anwendung und Zielkanal werden überprüft.

## Bedienung

`/news erstellen` öffnet fünf Felder (das Maximum eines Discord-Modals):

| Feld | Vorgabe |
| --- | --- |
| Titel | Pflicht, 1–160 Zeichen |
| Kategorie | Ankündigung, Update, Info, Changelog oder Wartung. Standard: Update |
| Beitragsinhalt | Pflicht, 1–3500 Zeichen, Markdown direkt eingeben |
| Anzeigebild (Discord & Website) | Optional, ein Bild, erscheint gross in Discord und auf der Website |
| Weitere Bilder (nur Website) | Optional, bis 6 Bilder, erscheinen gross im Bericht auf der Website |

Alle Bilder: JPEG, PNG, WebP oder GIF, je maximal 8 MB, zusammen maximal 24 MB
(Discord erlaubt höchstens 25 MiB pro Nachricht). Die frühere Kurzbeschreibung
entfällt. Der Inhalt ist auf 3500 Zeichen begrenzt, weil Discord in einer
Komponenten-Nachricht insgesamt 4000 Zeichen Text erlaubt und Kopfzeile, Titel
und Fusszeile Platz brauchen.

Danach erscheint nur für den Ersteller eine Vorschau mit **Veröffentlichen,
Bearbeiten, Abbrechen, Formatierung**. Bearbeiten füllt die Texte wieder aus.
Bereits gewählte Bilder bleiben erhalten, wenn ein Bildfeld leer bleibt; eine neue
Auswahl ersetzt das Anzeigebild bzw. alle weiteren Bilder. Datei-Uploads
können vom Modal selbst nicht als bereits ausgewählte Datei vorgefüllt werden.
Entwürfe/Vorschauen laufen nach 15 Minuten ab.

Erst Veröffentlichen erzeugt die Nachricht im konfigurierten Kanal. Es gibt keine
automatischen Erwähnungen/Pings. Bilder werden aus der privaten Interaktion als
öffentliche Nachrichtenanhänge neu hochgeladen (`title-image.*`, `gallery-1.*` …),
nicht bloss über die kurzlebigen Vorschaulinks referenziert. Die weiteren Bilder
sind angehängt, werden aber von keiner Komponente eingebunden; Discord zeigt sie
deshalb nicht an, der Website-Import findet sie trotzdem. Mit
`discordNewsShowGallery = true` in `shared/discord-news.mjs` erscheinen sie in
Discord zusätzlich als Galerie unter dem Text. Erfolgreich bestätigte Veröffentlichungen liefern den
Discord-Link. Bei unklarem Netzwerkergebnis wird nicht blind erneut gesendet;
stattdessen zuerst den News-Kanal prüfen. Atomare Statuswechsel plus Discord-Nonce
verhindern doppelte Sendungen durch wiederholte oder parallele Klicks.

## Wie der bestehende Import beide Formate verarbeitet

Normale menschliche Nachrichten behalten ihre bisherige Titel-/Textverarbeitung.
Andere Bot-Nachrichten und Webhooks werden weiter ignoriert. Nur Nachrichten des
durch den bestehenden Import-Token identifizierten Bots werden als strukturierte
News akzeptiert, in drei Formaten:

- **v3 (aktuell):** Komponenten-Nachricht (`IS_COMPONENTS_V2`). Kopfzeile, Titel,
  Anzeigebild, Inhalt und Fusszeile tragen die festen Komponenten-IDs 101–105;
  die Fusszeile enthält den Link `…/neuigkeiten.html#discord-news-v3`.
- **v2:** Embed mit Marker-URL `#discord-news-v2`, Footer und Kategorie im Autor.
- **v1:** Embed mit Footer `VeloCity News · v1`.

Bot-ID, Marker und Feldgrenzen werden geprüft.

Der Worker schreibt beim Discord-Veröffentlichen **keinen Beitrag in `news_posts`**.
Die Übernahme auf die Webseite geschieht allein durch den bestehenden Kanalabgleich,
mit derselben Nachrichten-ID (`discord-<message-id>`). Wiederholte Importe bleiben
duplikatfrei. Änderungen in den gelesenen Nachrichten werden weiter übernommen;
der bisherige 200-Nachrichten-Lesebereich und die Aufbewahrung älterer Beiträge bleiben.

Strukturierte Anzeigebilder und weitere Bilder werden dabei nach `assets/img/news/`
archiviert (`discord-<Nachricht>-<Anhang>.<Endung>`); weitere Bilder landen als
`gallery` im Beitrag von `updates.json`. Kann ein Bild nicht geladen werden, bleibt
die bisherige Fassung des Beitrags stehen, der Workflow meldet eine Warnung und
veröffentlicht die Website trotzdem; der nächste Lauf versucht es erneut. Die Bilder werden mit
demselben Workflow veröffentlicht. Dadurch bleiben ältere Bilder auch nach Ablauf
signierter Discord-CDN-Links verfügbar. Wiederholte Importe laden dieselbe Anhang-ID
nicht erneut. Der bestehende optionale API-Bridge-Modus verarbeitet die strukturierten
Felder ebenfalls; dort zeigt das Bild auf das gemeinsam veröffentlichte GitHub-Asset.
Für eine andere öffentliche Basisadresse kann `NEWS_PUBLIC_BASE_URL` gesetzt werden.
Archivierte Bilder zählen zum Speicher des GitHub-Repositories; alte Bilddateien
werden zur Erhaltung älterer Beiträge nicht automatisch entfernt.

## Prüfung und noch ausstehende Live-Aktivierung

Lokal geprüft, ohne produktive Discord-Nachrichten:

- Signierte PINGs, ungültige Signaturen, veränderte Bodies, alte Zeitstempel.
- Guild-/Rollen-/Benutzerfreigabe, Eigentümer, abgelaufene Entwürfe, entzogene Rollen.
- Fünf Modal-Felder inkl. Discord-Textgrenzen, Längengrenzen, Vorschau, Bearbeiten
  (Bilder bleiben erhalten), zu viele Bilder und Abbrechen.
- Explizites Senden als Komponenten-Nachricht, Anhänge (Anzeigebild sichtbar,
  weitere Bilder nur angehängt), Textlimit, Website-Anstoss, Nonce/Doppelklickschutz,
  sichere Fehlerfälle.
- Tatsächlicher Importer als separater Prozess mit simuliertem Discord: normale
  Nachrichten (inkl. `[Info]`), v1/v2-Embeds und v3-Komponenten, Anzeigebild und
  weitere Bilder in Upload-Reihenfolge, Bildfehler ohne Abbruch, Änderungen,
  Aufbewahrung und wiederholte Synchronisierung.
- Idempotente Command-Registrierung und bestehende News-/Website-Authentifizierung.

```bash
node tests/discord-editor.test.mjs
node tests/discord-editor-sync.test.mjs
node tests/discord-news-client.test.mjs
node tests/news-worker.test.mjs
```

Der reale Portal-PING, die echte Command-Registrierung und eine produktive
Veröffentlichung können erst nach den obigen Einrichtungsschritten bestätigt
werden. Es wurde kein produktiver Testbeitrag veröffentlicht. Ein Live-Test mit
Veröffentlichen soll nur nach ausdrücklicher Freigabe erfolgen. Die vorhandene
manuelle GitHub-Synchronisierung kann danach zum Prüfen sofort gestartet werden.

API-Referenzen: [Discord-Modals](https://docs.discord.com/developers/components/using-modal-components),
[Komponenten inkl. File Upload](https://docs.discord.com/developers/components/reference),
[Interactions](https://docs.discord.com/developers/interactions/receiving-and-responding),
[Commands](https://docs.discord.com/developers/interactions/application-commands),
[Nachrichten und Nonce](https://docs.discord.com/developers/resources/message).

### Veröffentlichung und Status (Aktualisierung)
Beim Bestätigen wird die private Vorschau sofort durch eine Fortschrittsanzeige mit
„Status aktualisieren“ ersetzt. Dieser Button liest den gespeicherten Entwurf und
sendet keine neue Kanalnachricht. Auch wenn Discord das nachträgliche Aktualisieren
der Vorschau ablehnt, bleibt der gespeicherte Erfolg oder Fehler darüber abrufbar.
Unterbrochene Veröffentlichungen werden nach 40 Sekunden als unklar angezeigt;
in diesem Fall den Kanal prüfen, nicht automatisch erneut veröffentlichen.

REST-Aufrufe haben Zeitlimits. Nur das private, idempotente Status-PATCH wird bei
vorübergehenden Fehlern wiederholt. Der öffentliche Nachrichten-POST wird nie
 automatisch wiederholt. Logs enthalten Ereignis, Entwurfs-ID, Verarbeitungsschritt,
HTTP-Status und numerischen Discord-Fehlercode, keine Tokens oder Beitragsinhalte.

### Darstellung in Discord (v3)

Neue Beiträge sind Komponenten-Nachrichten ohne Container und nutzen damit die
volle Breite des Chats statt der schmalen Embed-Box:

1. kleine Kopfzeile mit Kategorie-Symbol (📢 Ankündigung, 🔄 Update, ℹ️ Info,
   📝 Changelog, 🛠️ Wartung),
2. grosser Titel (`# Titel`),
3. Anzeigebild in voller Breite,
4. Trennlinie, Beitragsinhalt (Zwischentitel mit `##` werden gross dargestellt),
5. Trennlinie und kleine Fusszeile mit Link zur News-Seite.

Die frühere farbige Seitenlinie entfällt, weil sie nur mit der schmaleren
Container-Box möglich ist; die Kategorie ist am Symbol erkennbar. Private
Vorschau und Statusmeldungen verwenden dasselbe Format. Überschreitet eine
private Vorschau mit langer Fehlermeldung das Textlimit, wird nur dort der
Inhalt sichtbar gekürzt; Entwurf und veröffentlichter Beitrag bleiben vollständig.

### Website sofort aktualisieren

Nach erfolgreichem Senden stösst der Worker den Workflow **Sync and publish
VeloCity news** per `workflow_dispatch` an. Er nutzt dafür den vorhandenen
`GITHUB_TOKEN` (`GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH`). Der Token
braucht dafür zusätzlich die Berechtigung **Actions: Read and write**
(Fine-grained Token) bzw. den Scope `repo`/`workflow` (klassischer Token). Fehlt sie,
meldet der Bot „beim nächsten regulären Abgleich (stündlich)“; sonst „in wenigen
Minuten“. Ein Fehlschlag wird nur geloggt und verhindert nichts.

Deployment: `node scripts/build-news-worker.mjs` ausführen und den Inhalt von
`worker/dashboard-worker.mjs` im bestehenden Admin-/News-Worker veröffentlichen.
Keine neue Datenbank, keine neuen Secrets und keine erneute Befehlsregistrierung
erforderlich. Vor dem Deployment geöffnete Vorschauen bitte neu erstellen.

### Formatierung im Discord-Editor
Die private Vorschau enthält zusätzlich „Formatierung“. Die nur für den Ersteller
sichtbare Hilfe zeigt Markdown-Beispiele und öffnet über „Inhalt bearbeiten“ den
vorausgefüllten Entwurf. Danach erneut die Vorschau erzeugen und erst bei Bedarf
veröffentlichen. Die Hilfe verändert und veröffentlicht keinen Beitrag.

Die Hilfe nennt nur Formate, die Discord und die Website gleich darstellen:
`## Zwischentitel`, `**fett**`, `*kursiv*`, `` `Code` ``, `-`-Listen, nummerierte
Listen (`1.`), `>`-Hinweise und `[Links](https://…)`. Das native Modal unterstützt
keine eigene Rich-Text-Werkzeugleiste; Formatzeichen werden direkt im Inhaltsfeld
eingegeben.
