const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Trust Proxy für Render.com
app.set('trust proxy', 1);

// Statische Dateien aus dem public-Ordner
app.use(express.static('public'));

// Startseite
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Aktive Benutzer im Raum
const connectedUsers = new Map();

io.on('connection', (socket) => {
  console.log(`🔵 Benutzer verbunden: ${socket.id}`);

  // Benutzer initialisieren
  const user = {
    id: socket.id,
    name: `Gast ${socket.id.slice(0, 4)}`,
    position: { x: 0, y: 0.5, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    hasVideo: false,
    isVR: false
  };

  connectedUsers.set(socket.id, user);

  // Neuem Benutzer alle existierenden Benutzer senden
  const others = Array.from(connectedUsers.values()).filter(u => u.id !== socket.id);
  socket.emit('room:init', {
    users: others,
    yourId: socket.id
  });

  // Allen anderen den neuen Benutzer melden
  socket.broadcast.emit('user:joined', user);

  // Benutzer aktualisiert seine Position
  socket.on('user:move', (data) => {
    const userData = connectedUsers.get(socket.id);
    if (userData) {
      userData.position = data.position;
      userData.rotation = data.rotation;
      socket.broadcast.emit('user:moved', {
        id: socket.id,
        position: data.position,
        rotation: data.rotation
      });
    }
  });

  // Benutzer aktualisiert seinen Namen
  socket.on('user:name', (name) => {
    const userData = connectedUsers.get(socket.id);
    if (userData) {
      userData.name = name;
      io.emit('user:updated', {
        id: socket.id,
        name: name
      });
    }
  });

  // Benutzer meldet VR-Status
  socket.on('user:vr', (isVR) => {
    const userData = connectedUsers.get(socket.id);
    if (userData) {
      userData.isVR = isVR;
      socket.broadcast.emit('user:vrstatus', {
        id: socket.id,
        isVR: isVR
      });
    }
  });

  // Verbindung trennen
  socket.on('disconnect', () => {
    console.log(`🔴 Benutzer getrennt: ${socket.id}`);
    connectedUsers.delete(socket.id);
    io.emit('user:left', socket.id);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✝️  Bibelraum-Server läuft auf Port ${PORT}`);
  console.log(`   Lokal: http://localhost:${PORT}`);
  console.log(`   Im Netzwerk: http://<deine-ip>:${PORT}`);
});
