

## 1) Présentation
Application web de gestion opérationnelle (agences/transport) : dossiers, missions, fiches de mouvement, ressources, ordres de mission (PDF), planning.

- **Front** : React (SPA)  
- **Back** : Django + Django REST Framework  
- **DB** : MySQL  
- **Auth** : JWT (Bearer access) + refresh cookie HttpOnly (rotation/blacklist)

## 2) Stack (principale)
### Front (package.json)
- react, react-router-dom, axios, bootstrap
- @fullcalendar/react (+ interaction, resource-timeline)
- xlsx (imports)

### Back (d’après le code)
- Django, DRF, SimpleJWT, django-cors-headers, django-filter, python-decouple
- MySQL driver (mysqlclient) recommandé

## 3) Structure
### Front
- `src/app/routes.jsx` : routes + protections (ProtectedRoute) + redirections par rôle
- `src/auth/AuthContext.jsx` : gestion session
- `src/api/*` : client Axios

### Back
- `config/settings.py` : settings env, DB, DRF, JWT, CORS
- `config/urls.py` : routes API (router + endpoints dédiés)
- `apps/models.py` : modèles métier
- `apps/views/*` : endpoints & logique

## 4) Variables d’environnement (⚠️ secrets)
> Ne commitez jamais les secrets. Utilisez `.env.example` + secrets manager.

### Exemple `.env.example` (Back)
```env
DJANGO_SECRET_KEY=<secret>
DEBUG=True
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1

DB_NAME=b2b
DB_USER=root
DB_PASSWORD=<secret>
DB_HOST=localhost
DB_PORT=3306

CORS_ALLOW_ALL_ORIGINS=True
CORS_ALLOWED_ORIGINS=http://localhost:3000

GOOGLE_MAPS_API_KEY=<secret>
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=<email>
EMAIL_HOST_PASSWORD=<secret>
DEFAULT_FROM_EMAIL=<email>
```

### Exemple `.env.example` (Front)
```env
REACT_APP_API_URL=http://127.0.0.1:8000
```

## 5) Installation locale (exemple)
### Back
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

### Front
```bash
npm install
npm start
```

## 6) API (résumé)
### Auth
- `POST /api/auth/login/`
- `POST /api/auth/refresh/`
- `POST /api/auth/logout/`
- `GET /api/auth/me/`
- `POST /api/auth/change-password/`

### Router (REST)
- `/api/fiches-mouvement/` (FicheMouvementViewSet)
- `/api/missions/` (MissionViewSet)
- `/api/vehicules/` (VehiculeViewSet)
- `/api/chauffeurs/` (ChauffeurViewSet)
- `/api/zones/` (ZoneViewSet)
- `/api/excursion-templates/` (ExcursionTemplateViewSet)
- `/api/excursion-steps/` (ExcursionStepViewSet)
- `/api/excursion-events/` (ExcursionEventViewSet)
- `/api/agences/demandes-inscription/` (DemandeInscriptionAgenceViewSet)
- `/api/agences/` (AgenceVoyageViewSet)
- `/api/admin/agency-applications/` (AgencyApplicationAdminViewSet)

### Spécifiques
- `/api/calendar/missions`
- `/api/calendar/resources`
- `/api/ordres-mission/<ordre_id>/pdf/`
- `/api/importer-dossier/`, `/api/importer-fiches/`, `/api/importer-vehicules/`, `/api/importer-chauffeurs/`
- `/api/dossiers/to-fiche/`
- `/api/fiches-mouvement/<fiche_id>/horaires/`
- `/api/fiches-mouvement/create/`
- `/api/public/demandes-inscription/*`
- `/api/agency-applications/*`
- `/api/fournisseur/*`
- `/api/rentout/available-vehicles/`


## Environnement d’hébergement & sécurité (serveur)

- **OS**: Ubuntu 24.04.4 LTS (noble) — kernel 6.8.0-100-generic (x86_64)
- **Hostname**: ns3075581 — timezone UTC (NTP actif)
- **Ressources**: 31 GiB RAM, swap 511 MiB, disque `/` ~108 GiB (≈10% utilisé)
- **IP**: IPv4 217.182.139.14 — IPv6 2001:41d0:303:1f0e::1 (eno1)
- **Ports exposés**: 22 (SSH), 80 (HTTP), 443 (HTTPS)
- **Reverse proxy**: Nginx 1.24.0 (Ubuntu)
- **Backend interne**: 127.0.0.1:8000 (non exposé directement)
- **DB interne**: 127.0.0.1:3306 (MySQL/MariaDB — non exposé)

### Données restantes pour documenter précisément Fail2ban/HTTPS/Firewall

Copier/coller les sorties suivantes (sans secrets) :
```bash
sudo fail2ban-client status
sudo fail2ban-client status sshd
sudo ufw status verbose
sudo certbot certificates 2>/dev/null || true
sudo ls -lah /etc/nginx/sites-enabled /etc/nginx/sites-available
sudo grep -R "mouha.ophony.com" -n /etc/nginx/sites-available /etc/nginx/sites-enabled | head -n 200
```

> ⚠️ Ne jamais partager : `SECRET_KEY`, mots de passe DB, tokens, clés privées TLS (`privkey.pem`).

### Détails sécurité (Fail2ban / UFW / HTTPS)

- **Fail2ban**: 1 jail (`sshd`)
  - Total failed: 14701
  - Total banned: 2181
  - Currently banned: 2
  - IPs bannies: 80.94.92.177, 80.94.92.166
- **UFW**: actif — default deny incoming / allow outgoing — logging low
  - ALLOW IN: 80,443/tcp (Nginx Full)
  - ALLOW IN: 22/tcp (OpenSSH)
- **TLS** (Certbot / Let’s Encrypt): cert `mouha.ophony.com` (ECDSA)
  - Expiration: 2026-05-10 21:22:26+00:00
  - fullchain: `/etc/letsencrypt/live/mouha.ophony.com/fullchain.pem`
  - privkey: `/etc/letsencrypt/live/mouha.ophony.com/privkey.pem` (**ne pas partager**)
- **Nginx vhost**: `/etc/nginx/sites-available/mouha` (symlink dans `sites-enabled`)
- **Services systemd**: `mouha-back.service`, `mouha-backend.service` (enabled) — à préciser via `systemctl cat/status`.

À exécuter pour compléter :
```bash
sudo systemctl status mouha-back --no-pager
sudo systemctl cat mouha-back
sudo journalctl -u mouha-back -n 200 --no-pager
sudo systemctl status mouha-backend --no-pager
sudo systemctl cat mouha-backend
sudo journalctl -u mouha-backend -n 200 --no-pager
sudo cat /etc/nginx/sites-available/mouha
```

## Déploiement serveur (systemd + Gunicorn) & Nginx (reverse proxy)

### Service systemd (backend)
- **Service actif**: `mouha-back.service` (Gunicorn)
  - ExecStart: `/home/ubuntu/mouhaB2B/.venv/bin/gunicorn config.wsgi:application --bind 127.0.0.1:8000 --workers 3 --timeout 120`
  - WorkingDirectory: `/home/ubuntu/mouhaB2B/backend1`
  - User/Group: `ubuntu` / `www-data`
- **Service à corriger**: `mouha-backend.service` (status=203/EXEC, chemin gunicorn invalide + conflit port 8000 probable)
  - Reco: désactiver si inutile: `sudo systemctl disable --now mouha-backend`

### Nginx vhost : /etc/nginx/sites-available/mouha
- **HTTP → HTTPS**: 301 (`return 301 https://$host$request_uri;`)
- **TLS**: Let’s Encrypt (Certbot), http2, include `options-ssl-nginx.conf` + `ssl-dhparams.pem`
- **Front React**: root `/home/ubuntu/mouhaB2B/frontend/build` + SPA fallback `try_files $uri /index.html;`
- **Assets React**: `/static/` cache 7 jours
- **Django static**: `/dj-static/` alias `/home/ubuntu/mouhaB2B/backend1/staticfiles/`
- **Admin**: `/admin/` → `proxy_pass http://127.0.0.1:8000/admin/`
- **API**: `/api/` → `proxy_pass http://127.0.0.1:8000/`
- **Client max body**: 50M

### Observations logs (sécurité & erreurs)
- Scans Internet courants sur `/.env`, `/admin/.env`, `/v1/.env`, `/v2/.env`
- `DisallowedHost` sur `HTTP_HOST=217.182.139.14` : accès direct par IP rejeté (OK)
- `Not Found` sur `/auth/login/` et `/auth/refresh/` : endpoints à aligner avec tes routes DRF


### Runbook (ops)
```bash
sudo systemctl restart mouha-back
sudo journalctl -u mouha-back -n 200 --no-pager
sudo nginx -t && sudo systemctl reload nginx
sudo certbot renew --dry-run
```
