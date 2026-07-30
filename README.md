# Westsachsen Ferienfreizeiten - Webportal

Dieses Projekt ist ein regionales Webportal für Ferienfreizeiten in Westsachsen. Jugendvereine können hier ihre Angebote verwalten und Endnutzer können nach diesen filtern (inkl. Kartenansicht).

## Voraussetzungen

* **Lokal (ohne Docker):** Node.js >= 18, PHP >= 8.2 (mit SQLite Erweiterung)
* **Mit Docker:** Docker und Docker Compose

## Lokale Entwicklung (Schnellstart)

Das Projekt nutzt standardmäßig eine lokale SQLite-Datenbank (`backend/database.sqlite`), die beim ersten Start automatisch eingerichtet wird.

1. Installiere die Node-Abhängigkeiten (Root & Frontend):
   ```bash
   npm install
   cd frontend && npm install && cd ..
   ```

2. Starte das Projekt:
   ```bash
   npm run dev
   ```

Dies startet das React-Frontend unter `http://localhost:5173` und das PHP-Backend unter `http://localhost:8000`.

**Standard Admin-Account:**
* Benutzername: `admin`
* Passwort: `admin`

**Standard Testverein:**
* Benutzername: `testverein`
* Passwort: `testverein`

Die lokale SQLite-Installation erzeugt zusätzlich drei dynamische Demo-Freizeiten für diesen Testverein: eine vergangene, eine laufende und eine bevorstehende. Im Docker-Entwicklungsstack sind sie ebenfalls aktiviert. In produktiven MySQL- oder PostgreSQL-Installationen bleiben sie standardmäßig aus und können bei Bedarf über `SEED_DEMO_DATA=1` eingeschaltet werden.

## Ausführung via Docker (Gesamter Stack)

Um die gesamte Anwendung vollständig isoliert (Frontend, PHP-Backend und MySQL-Datenbank) laufen zu lassen:

```bash
docker-compose up -d --build
```

Nachdem die Container gestartet sind, erreichst du:
* **Frontend:** `http://localhost:8080`
* **Backend API:** `http://localhost:8000`

Die Datenbank-Tabellen werden beim ersten Aufruf automatisch erstellt.

## Produktion Deployment

Für den produktiven Einsatz wird ein dedizierter Webserver (z. B. Apache, Nginx) und eine SQL-Datenbank (MySQL oder PostgreSQL) empfohlen.

### 1. Frontend kompilieren
```bash
cd frontend
npm run build
```
Die fertigen statischen Dateien liegen dann im Verzeichnis `frontend/dist`. Kopiere den Inhalt dieses Ordners in den Webroot deiner Domain. Die Datei `frontend/public/.htaccess` wird beim Build mit nach `frontend/dist/.htaccess` kopiert und leitet `/api/...` sowie `/uploads/...` passend an den Backend-Ordner weiter.

### 2. Backend aufsetzen (Apache)
Kopiere den Inhalt des `backend/` Ordners in einen Ordner `backend/` im Webroot deiner Domain. Stelle sicher, dass `mod_rewrite` aktiviert ist (für die `.htaccess` Dateien) und dass das Verzeichnis `backend/uploads/` durch den Webserver (z. B. `www-data`) beschreibbar ist.

### 3. Datenbank konfigurieren
Das PHP-Skript erstellt die Tabellen automatisch beim ersten Request, wenn diese fehlen. Für Deployment ohne eingecheckte Zugangsdaten kannst du `backend/config.example.php` nach `backend/config.local.php` kopieren und dort die echten Verbindungsdaten eintragen. `backend/config.local.php` wird von Git ignoriert.

Alternativ kannst du die Verbindungsdaten über Umgebungsvariablen setzen (z.B. im Apache vHost oder einer `.env` via Server-Config). Umgebungsvariablen haben Vorrang vor `backend/config.local.php`:

* `DB_CONNECTION`: `mysql`, `pgsql` oder leer lassen für `sqlite`
* `DB_HOST`: Hostname (z. B. `localhost` oder eine IP)
* `DB_NAME`: Datenbankname (z. B. `westsachsen_camps`)
* `DB_USER`: Datenbank-Benutzer
* `DB_PASSWORD`: Datenbank-Passwort

Beispiel Apache SetEnv in vhost-Config:
```apache
<VirtualHost *:80>
    ServerName api.deinedomain.de
    DocumentRoot /var/www/westsachsen/backend

    SetEnv DB_CONNECTION mysql
    SetEnv DB_HOST 127.0.0.1
    SetEnv DB_NAME meine_db
    SetEnv DB_USER mein_user
    SetEnv DB_PASSWORD mein_passwort

    <Directory /var/www/westsachsen/backend>
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>
```
