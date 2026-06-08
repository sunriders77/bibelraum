
# ✝️ Bibelraum

**Hybrider 3D-Treffpunkt für Bibelkreise** – mit VR-Avataren und eingebautem Jitsi-Videochat.

## Features
- 🏠 **3D-Raum** mit gemütlichem Sitzkreis, Tisch, Kreuz und Videoleinwand
- 🥽 **VR-Brillen** (Quest) via WebXR – Bewegung im Raum mit Controllern
- 💻 **Desktop/Handy** – Bewegung per WASD + Maus
- 📺 **Jitsi-Integration** – eingebauter Videochat für die Nicht-VR-Teilnehmer
- 👥 **Avatare** – jeder sieht die anderen als bunte Avatare im Raum

## Lokal starten

```bash
cd H:\bibelraum
npm install
npm start
```

Dann öffnen: http://localhost:3000

## Deployment auf Render.com

1. Repository auf GitHub pushen:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/DEIN-USERNAME/bibelraum.git
   git push -u origin main
   ```

2. Bei [render.com](https://render.com) anmelden (kostenlos)

3. "New +" → "Web Service" → "Build and deploy from a Git repository"

4. Dein Repository auswählen

5. Folgende Einstellungen:
   - **Name**: bibelraum
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: Free

6. "Create Web Service" klicken

7. Nach dem Build bekommst du eine URL wie `https://bibelraum.onrender.com/`

8. Fertig! Jeder mit dem Link kann beitreten 🎉

### Hinweis zum Free-Plan
Render.com schläft nach 15 Minuten Inaktivität ein. Beim ersten Aufruf dauert es ~30 Sekunden bis die Seite lädt.
