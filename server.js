const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const { AccessToken } = require('livekit-server-sdk');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Trust Proxy für Render.com
app.set('trust proxy', 1);

// JSON body parser für Bot-API
app.use(express.json());

// Statische Dateien aus dem public-Ordner
app.use(express.static('public'));

// Startseite
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Aktive Benutzer im Raum + Preview-Verbindungen
const connectedUsers = new Map();
const previewClients = new Set();

// === BOT: Melanie ===
const BOT_API_KEY = process.env.BOT_KEY || 'melanie2024';
const BOT_ID = 'bot-melanie';
let botMessage = '👋 Hallo, ich bin Melanie!';

// Bot-User in der User-Liste
const botUser = {
  id: BOT_ID,
  name: '🤖 Melanie (Bot)',
  position: { x: 0, y: 1.0, z: -3 },
  rotation: { x: 0, y: 0, z: 0 },
  isBot: true,
  isVR: false
};
connectedUsers.set(BOT_ID, botUser);

// Bot-Nachrichten-API
app.post('/api/bot/say', (req, res) => {
  const { key, text } = req.body;
  if (key !== BOT_API_KEY) {
    return res.status(403).json({ error: 'Ungültiger API-Key' });
  }
  if (!text || text.length > 500) {
    return res.status(400).json({ error: 'Text fehlt oder zu lang (max 500)' });
  }
  botMessage = text;
  io.emit('bot:message', text);
  console.log(`🤖 Bot-Nachricht: "${text}"`);
  res.json({ ok: true, message: text });
});

// Auch per GET (einfacher von CLI)
app.get('/api/bot/say', (req, res) => {
  const key = req.query.key;
  const text = req.query.text || req.query.msg;
  if (key !== BOT_API_KEY) {
    return res.status(403).json({ error: 'Ungültiger API-Key' });
  }
  if (!text || text.length > 500) {
    return res.status(400).json({ error: 'Text fehlt oder zu lang' });
  }
  botMessage = text;
  io.emit('bot:message', text);
  console.log(`🤖 Bot-Nachricht: "${text}"`);
  res.json({ ok: true, message: text });
});

// Bot-Daten abrufbar
app.get('/api/bot/status', (req, res) => {
  res.json({
    name: botUser.name,
    position: botUser.position,
    message: botMessage
  });
});
// ============================

// === LIVEKIT KONFIGURATION ===
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const LIVEKIT_HOST = process.env.LIVEKIT_HOST || process.env.LIVEKIT_URL || '';

// LiveKit-Token ausstellen (wird vom Client aufgerufen)
app.get('/api/livekit/token', async (req, res) => {
  const { name, room } = req.query;
  if (!name || !room) {
    return res.status(400).json({ error: 'Name und Raum benötigt' });
  }
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_HOST) {
    return res.status(500).json({ error: 'LiveKit nicht konfiguriert – LIVEKIT_API_KEY, LIVEKIT_API_SECRET und LIVEKIT_HOST in Render Umgebungsvariablen setzen' });
  }
  try {
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: name,
      ttl: '1h',
    });
    at.addGrant({ roomJoin: true, room: room, canPublish: true, canSubscribe: true });
    const token = await at.toJwt();
    res.json({ token, host: LIVEKIT_HOST, room });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// ============================

// === CHAT-SYSTEM ===
const chatMessages = [];
const MAX_CHAT = 100;

// Chat-Nachrichten abrufen (für Telegram-Abfrage)
app.get('/api/chat/messages', (req, res) => {
  const since = parseInt(req.query.since) || 0;
  const newMessages = chatMessages.filter(m => m.id > since);
  res.json({ messages: newMessages });
});

// Chat-Nachricht von außen empfangen (für Telegram)
app.post('/api/chat/send', (req, res) => {
  const { key, name, text } = req.body;
  if (key !== BOT_API_KEY) {
    return res.status(403).json({ error: 'Ungültiger API-Key' });
  }
  if (!text || text.length > 500) {
    return res.status(400).json({ error: 'Text fehlt oder zu lang' });
  }
  const msg = {
    id: Date.now(),
    name: name || 'Melanie',
    text: text,
    time: new Date().toLocaleTimeString('de-DE'),
    isBot: true
  };
  chatMessages.push(msg);
  if (chatMessages.length > MAX_CHAT) chatMessages.shift();
  io.emit('chat:message', msg);
  res.json({ ok: true });
});
// ============================

// Hilfsfunktion: sende Benutzerliste an alle Preview-Clients
function broadcastUserList() {
  const users = Array.from(connectedUsers.values())
    .filter(u => !u.isBot) // Bot nicht in der Preview-Liste
    .map(u => ({
      name: u.name,
      isVR: u.isVR
    }));
  for (const sid of previewClients) {
    const sock = io.sockets.sockets.get(sid);
    if (sock) {
      sock.emit('users:list', users);
    } else {
      previewClients.delete(sid);
    }
  }
}

io.on('connection', (socket) => {
  const isPreview = socket.handshake.query.preview === 'true';

  if (isPreview) {
    // Preview-Client (nur für Login-Benutzerliste)
    console.log(`👁️ Preview-Client verbunden: ${socket.id}`);
    previewClients.add(socket.id);
    broadcastUserList();

    socket.on('disconnect', () => {
      console.log(`👁️ Preview-Client getrennt: ${socket.id}`);
      previewClients.delete(socket.id);
    });
    return;
  }

  // Normaler Raum-Client
  console.log(`🔵 Benutzer verbunden: ${socket.id}`);

  // Benutzer initialisieren
  // Startpositionen im Halbkreis (an den Stühlen)
  var startPositions = [
    { x: -2.5, z: -1.5 },
    { x: -1.5, z: -2.5 },
    { x: 0.5, z: -2.2 },  // geändert – kein Konflikt mit Bot (0, 1.0, -3)
    { x: 1.5, z: -2.5 },
    { x: 2.5, z: -1.5 },
    { x: -3, z: 1 },
  ];
  var posIndex = connectedUsers.size % startPositions.length;
  var startPos = startPositions[posIndex];

  const user = {
    id: socket.id,
    name: `Gast ${socket.id.slice(0, 4)}`,
    position: { x: startPos.x, y: 0.5, z: startPos.z },
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
  broadcastUserList();

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
      broadcastUserList();
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
      broadcastUserList();
    }
  });

  // CHAT: Nachricht von einem Benutzer
  socket.on('chat:message', (data) => {
    const userData = connectedUsers.get(socket.id);
    const name = userData ? userData.name : 'Gast';
    const msg = {
      id: Date.now(),
      name: name,
      text: data.text || '',
      time: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
      isBot: false
    };
    chatMessages.push(msg);
    if (chatMessages.length > MAX_CHAT) chatMessages.shift();
    io.emit('chat:message', msg);
    console.log(`💬 ${name}: "${msg.text}"`);

    // @Melanie-Nachrichten: Bot-Sprechblase aktualisieren
    if (data.text && data.text.toLowerCase().includes('@melanie')) {
      botMessage = `📩 ${name}: ${data.text.replace(/@melanie/gi, '').trim()}`;
      io.emit('bot:message', botMessage);
    }
  });

  // Verbindung trennen
  socket.on('disconnect', () => {
    console.log(`🔴 Benutzer getrennt: ${socket.id}`);
    connectedUsers.delete(socket.id);
    io.emit('user:left', socket.id);
    broadcastUserList();
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✝️  Bibelraum-Server läuft auf Port ${PORT}`);
  console.log(`   Lokal: http://localhost:${PORT}`);
  console.log(`   Im Netzwerk: http://<deine-ip>:${PORT}`);
});
