# Tankverwaltung – Doppelachser und Einachser

Responsive React-Web-App mit Supabase-Anmeldung, Datenbank und individuellen Tank-URLs.

## Einrichtung

1. Ein Supabase-Projekt anlegen. Unter **Authentication > Users** die berechtigten Betanker als Benutzer mit E-Mail und Passwort anlegen. Öffentliche Registrierung wird in dieser App nicht angeboten.
2. Im Supabase SQL Editor die Datei `supabase/schema.sql` ausführen. **Wichtig:** Die Startwerte 280/850 Liter und 12.450/50.200 Liter sind DEMODATEN. Vor dem echten Einsatz die beiden Tankbestände und Pumpenzählerstände anhand der tatsächlichen Werte im SQL Editor korrigieren. Den Startbestand nie als echte Messung behandeln.
3. `.env.example` als `.env` kopieren und die Projekt-URL sowie den Supabase Publishable/Anon Key eintragen. **Niemals den Service-Role-Key in `.env` eintragen.**
4. Für den Passwortschutz Supabase CLI verwenden: `supabase login`, `supabase link --project-ref DEINE_PROJEKT_ID`, `supabase secrets set REFILL_PASSWORD=112244`, `supabase functions deploy refill`. Die Edge Function verwendet die serverseitig von Supabase bereitgestellten Umgebungsvariablen. In Supabase Function Settings die JWT-Prüfung aktiviert lassen.
5. `npm install` und `npm run dev` für lokale Entwicklung. Für Produktion `npm run build` und den Ordner `dist/` bei Vercel/Netlify mit HTTPS hosten; die drei `VITE_`-Variablen dort setzen. Bei SPA-Routing reicht hier `/`, da Tankauswahl über Query-Parameter erfolgt.
6. Die QR-Codes erst mit der **endgültigen öffentlichen HTTPS-Adresse** erstellen. URLs: `https://DEINE-APP-DOMAIN/?tank=doppelachser` und `https://DEINE-APP-DOMAIN/?tank=einachser`. Die QR-Code-Generator-Datei `qr_codes.py` erzeugt zwei PNGs und eine Druck-PDF.

## Funktionen

- Zwei Tanks, jeweils eigener kumulativer Pumpenzähler und Bestand.
- Betankungen atomar per SQL-Funktion (verhindert doppelte Überbuchung bei parallelen Benutzern).
- Betreiber-Namen werden gespeichert und später vorgeschlagen; vier feste Flugzeugrufzeichen plus Freitext.
- Auffüllungen mit serverseitigem Passwort, automatisch berechnetem und optional korrigiertem Bestand. Der Pumpenzähler bleibt unverändert.
- Änderungsprotokoll mit Zeitstempel und angemeldetem Benutzer; nur angemeldete Nutzer können Daten lesen.
- QR-Code öffnet den richtigen Tank. Anmeldung ist bei Bedarf erforderlich.

## Noch nicht produktionsbereit

- **Push-Benachrichtigungen an Steffen** sind noch nicht implementiert. Es werden keine Warnungen an Betanker angezeigt. Für echte iPhone-Web-Pushs sind eine Home-Screen-PWA mit Service Worker, iOS 16.4+, eine erteilte Benachrichtigungsberechtigung, Steffens Geräte-Abonnement und ein serverseitiger Versanddienst nötig. Ein Datenbank-Webhook auf neue Betankungen unter 200 L ist die geeignete Auslösung. Derzeit werden **keine** Push-Nachrichten versendet.
- Passwort für Auffüllung ist als geteiltes Geheimnis implementiert; vor echtem Betrieb Rate-Limiting und idealerweise benutzerspezifische Berechtigungen ergänzen. Der Demo-Code besitzt keine serverseitige Rate-Limit-Sperre.
- Echte Tankbestände, Nutzerberechtigungen, Auditierung und Datenbank-Backups vor Inbetriebnahme prüfen.
- Die Web-App besitzt ein Manifest, aber noch keinen vollständigen Offline-/Push-Service-Worker.

## QR-Code-Generator

Tankverwaltung – erste Veröffentlichung

`python qr_codes.py https://deine-domain.example`

Benötigt Python-Pakete `qrcode[pil]` und `reportlab`. Die PNG-Dateien und die PDF werden im Ordner `qr-output` erzeugt.
