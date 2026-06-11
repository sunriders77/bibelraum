/* =========================================
   Bibelraum – Client-Logik
   ========================================= */

// === GLOBAL STATE ===
let socket;
let myId = null;
let myName = '';
let myAvatar = null;
let remoteAvatars = {}; // userId -> Entity
let isVRMode = false;
let moveState = { forward: false, backward: false, left: false, right: false };
let lastPosition = { x: 0, y: 1.6, z: 3 };
let lastRotation = { x: 0, y: 0, z: 0 };
let posUpdateInterval = null;
let cameraRig, camera;

// === FARBEN FÜR AVATARE ===
const AVATAR_COLORS = [
  '#E57373', '#64B5F6', '#81C784', '#FFB74D', '#BA68C8',
  '#4DD0E1', '#FF8A65', '#AED581', '#F06292', '#7986CB'
];

// geteilte Socket-Instanz für die Login-Benutzerliste
let previewSocket = null;

// === BENUTZERLISTE VOR DEM LOGIN ===
function startUserPreview() {
  // Socket nur für die Benutzerliste (ohne Raum beizutreten)
  previewSocket = io({ query: { preview: 'true' } });

  previewSocket.on('users:list', (users) => {
    const list = document.getElementById('preview-user-list');
    if (!list) return;
    if (users.length === 0) {
      list.innerHTML = '<li style="color:#888">👥 Noch niemand da</li>';
    } else {
      list.innerHTML = users.map(u =>
        `<li>${u.isVR ? '🥽 ' : ''}${escapeHtml(u.name)}</li>`
      ).join('');
    }
    // Auch den Counter aktualisieren
    const countEl = document.getElementById('preview-count');
    if (countEl) countEl.textContent = users.length;
  });

  previewSocket.on('connect', () => {
    console.log('📋 Benutzer-Vorschau verbunden');
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// === SOCKET.IO VERBINDUNG (für den Raum) ===
function connectSocket() {
  socket = io();

  socket.on('connect', () => {
    console.log('✅ Mit Server verbunden:', socket.id);
    myId = socket.id;
  });

  socket.on('room:init', (data) => {
    myId = data.yourId;
    // Existierende Avatare erstellen
    data.users.forEach(user => {
      createRemoteAvatar(user);
    });
    updateUserCount();
  });

  socket.on('user:joined', (user) => {
    if (user.id !== myId) {
      createRemoteAvatar(user);
      showToast(`👋 ${user.name} ist beigetreten`);
      updateUserCount();
    }
  });

  socket.on('user:moved', (data) => {
    updateRemoteAvatar(data.id, data.position, data.rotation);
  });

  socket.on('user:left', (userId) => {
    removeRemoteAvatar(userId);
    showToast(`👋 Jemand hat den Raum verlassen`);
    updateUserCount();
  });

  socket.on('user:updated', (data) => {
    updateRemoteAvatarName(data.id, data.name);
  });

  // Bot-Nachrichten (Sprechblase)
  socket.on('bot:message', (text) => {
    const bubble = document.getElementById('bot-bubble');
    if (bubble) {
      bubble.setAttribute('value', '💬 ' + text);
      // Nach 10 Sekunden zurück zur Standard-Meldung
      setTimeout(() => {
        const b = document.getElementById('bot-bubble');
        if (b && b.getAttribute('value') === '💬 ' + text) {
          b.setAttribute('value', '🤖');
        }
      }, 10000);
    }
  });

  // Chat-Nachrichten
  socket.on('chat:message', (msg) => {
    addChatMessage(msg);
  });
}

// === AVATAR ERSTELLEN ===
function createOwnAvatar(name, avatarColor) {
  if (!myId) return;

  const scene = document.querySelector('a-scene');
  const container = document.getElementById('my-avatar-container');
  if (!container) return;

  // Alten Avatar entfernen falls vorhanden
  while (container.firstChild && container.firstChild.id !== 'my-avatar-name') {
    container.removeChild(container.firstChild);
  }

  const color = avatarColor || AVATAR_COLORS[myId.charCodeAt(myId.length-1) % AVATAR_COLORS.length];

  myAvatar = document.createElement('a-entity');
  myAvatar.setAttribute('id', 'my-avatar-body');

  // Körper
  const body = document.createElement('a-box');
  body.setAttribute('depth', '0.4');
  body.setAttribute('height', '0.6');
  body.setAttribute('width', '0.4');
  body.setAttribute('color', color);
  body.setAttribute('position', '0 0.3 0');
  body.setAttribute('material', 'roughness: 0.7');
  myAvatar.appendChild(body);

  // Kopf
  const head = document.createElement('a-sphere');
  head.setAttribute('radius', '0.18');
  head.setAttribute('color', '#FFDCB5');
  head.setAttribute('position', '0 0.75 0');
  myAvatar.appendChild(head);

  // Augen
  const eyeL = document.createElement('a-sphere');
  eyeL.setAttribute('radius', '0.04');
  eyeL.setAttribute('color', '#333');
  eyeL.setAttribute('position', '-0.08 0.78 0.17');
  myAvatar.appendChild(eyeL);

  const eyeR = document.createElement('a-sphere');
  eyeR.setAttribute('radius', '0.04');
  eyeR.setAttribute('color', '#333');
  eyeR.setAttribute('position', '0.08 0.78 0.17');
  myAvatar.appendChild(eyeR);

  container.appendChild(myAvatar);

  // Namenslabel aktualisieren
  const nameLabel = document.getElementById('my-avatar-name');
  if (nameLabel) {
    nameLabel.setAttribute('text', `value: ${name}; align: center; color: ${color}; negate: false`);
  }

  // Avatar-Position an Kamera binden
  updateAvatarPosition();
}

function createRemoteAvatar(user) {
  // Prüfen ob schon vorhanden
  if (document.getElementById(`avatar-${user.id}`)) return;

  const container = document.getElementById('remote-avatars');
  if (!container) return;

  // Bot bekommt feste Farbe (pink), andere User per ID
  const color = user.isBot ? '#F06292' : AVATAR_COLORS[user.id.charCodeAt(user.id.length-1) % AVATAR_COLORS.length];

  const entity = document.createElement('a-entity');
  entity.setAttribute('id', `avatar-${user.id}`);

  entity.setAttribute('position', `${user.position.x} ${user.position.y} ${user.position.z}`);

  // Körper
  const body = document.createElement('a-box');
  body.setAttribute('depth', '0.4');
  body.setAttribute('height', '0.6');
  body.setAttribute('width', '0.4');
  body.setAttribute('color', color);
  body.setAttribute('position', '0 0.3 0');
  body.setAttribute('material', 'roughness: 0.7');
  entity.appendChild(body);

  // Kopf
  const head = document.createElement('a-sphere');
  head.setAttribute('radius', '0.18');
  head.setAttribute('color', '#FFDCB5');
  head.setAttribute('position', '0 0.75 0');
  entity.appendChild(head);

  // Augen
  const eyeL = document.createElement('a-sphere');
  eyeL.setAttribute('radius', '0.04');
  eyeL.setAttribute('color', '#333');
  eyeL.setAttribute('position', '-0.08 0.78 0.17');
  entity.appendChild(eyeL);

  const eyeR = document.createElement('a-sphere');
  eyeR.setAttribute('radius', '0.04');
  eyeR.setAttribute('color', '#333');
  eyeR.setAttribute('position', '0.08 0.78 0.17');
  entity.appendChild(eyeR);

  // Namenslabel
  const label = document.createElement('a-text');
  label.setAttribute('id', `label-${user.id}`);
  label.setAttribute('value', user.name || 'Gast');
  label.setAttribute('align', 'center');
  label.setAttribute('color', color);
  label.setAttribute('negate', 'false');
  label.setAttribute('position', '0 1.2 0');
  label.setAttribute('scale', '0.4 0.4 0.4');
  label.setAttribute('width', '4');
  entity.appendChild(label);

  // Bot-Sprechblase (zweite Textzeile)
  if (user.isBot) {
    const bubble = document.createElement('a-text');
    bubble.setAttribute('id', 'bot-bubble');
    bubble.setAttribute('value', '💬 ...');
    bubble.setAttribute('align', 'center');
    bubble.setAttribute('color', '#FFFFFF');
    bubble.setAttribute('negate', 'false');
    bubble.setAttribute('position', '0 1.6 0');
    bubble.setAttribute('scale', '0.35 0.35 0.35');
    bubble.setAttribute('width', '5');
    bubble.setAttribute('material', 'color: #F06292; transparent: true; opacity: 0.8');
    bubble.setAttribute('side', 'double');
    entity.appendChild(bubble);
  }

  // VR-Badge
  if (user.isVR) {
    const badge = document.createElement('a-text');
    badge.setAttribute('value', '🥽');
    badge.setAttribute('align', 'center');
    badge.setAttribute('position', '0 1.4 0');
    badge.setAttribute('scale', '0.3 0.3 0.3');
    entity.appendChild(badge);
  }

  container.appendChild(entity);
  remoteAvatars[user.id] = entity;
}

function removeRemoteAvatar(userId) {
  const avatar = document.getElementById(`avatar-${userId}`);
  if (avatar) {
    avatar.parentNode.removeChild(avatar);
    delete remoteAvatars[userId];
  }
}

function updateRemoteAvatar(userId, position, rotation) {
  const avatar = document.getElementById(`avatar-${userId}`);
  if (avatar) {
    avatar.setAttribute('position', `${position.x} ${position.y} ${position.z}`);
  }
}

function updateRemoteAvatarName(userId, name) {
  const avatar = document.getElementById(`avatar-${userId}`);
  if (avatar) {
    const label = avatar.querySelector('a-text');
    if (label) {
      label.setAttribute('value', name);
    }
  }
}

function updateUserCount() {
  const countEl = document.getElementById('user-count');
  if (countEl) {
    const count = Object.keys(remoteAvatars).length + 1; // +1 für uns selbst
    countEl.textContent = count;
  }
}

// === EIGENE AVATAR-POSITION SYNCEN ===
function initPositionSync() {
  posUpdateInterval = setInterval(() => {
    if (!cameraRig || !socket) return;

    const pos = cameraRig.getAttribute('position');
    const rot = cameraRig.getAttribute('rotation');

    // Nur senden wenn sich was geändert hat
    if (Math.abs(pos.x - lastPosition.x) > 0.01 ||
        Math.abs(pos.z - lastPosition.z) > 0.01 ||
        Math.abs(rot.y - lastRotation.y) > 0.5) {

      lastPosition = { x: pos.x, y: pos.y, z: pos.z };
      lastRotation = { x: rot.x, y: rot.y, z: rot.z };

      socket.emit('user:move', {
        position: lastPosition,
        rotation: lastRotation
      });

      // Eigenen Body-Avatar positionieren
      updateAvatarPosition();
    }
  }, 100); // 10x pro Sekunde
}

function updateAvatarPosition() {
  if (!cameraRig || !myAvatar) return;
  const camPos = cameraRig.getAttribute('position');
  myAvatar.setAttribute('position', `0 -1.1 0`); // Relativ zum Rig
}

// === BEWEGUNGSSTEUERUNG (via A-Frame movement-controls) ===
function initMovement() {
  cameraRig = document.getElementById('camera-rig');
  camera = document.getElementById('camera');

  if (!cameraRig || !camera) {
    setTimeout(initMovement, 500);
    return;
  }
  // Bewegung läuft komplett über das movement-controls am camera-rig
  // (unterstützt WASD + Maus am PC UND VR-Controller-Sticks auf Quest)
  console.log('🕹️ Bewegung bereit (movement-controls)');
}

// === VR-ERKENNUNG ===
function checkVR() {
  const scene = document.querySelector('a-scene');
  if (!scene) return;

  scene.addEventListener('enter-vr', () => {
    isVRMode = true;
    if (socket) socket.emit('user:vr', true);
    showToast('🥽 VR-Modus aktiv!');
  });

  scene.addEventListener('exit-vr', () => {
    isVRMode = false;
    if (socket) socket.emit('user:vr', false);
  });
}

// === LIVEKIT INTEGRATION ===
let livekitRoom = null;
let livekitParticipantTracks = {}; // identity -> { video: HTMLVideoElement, name: string }
let localStream = null;
let livekitConnected = false;
let canvasAnimFrame = null;

// LiveKit-Raum beitreten (AUTOMATISCH nach Login – ohne eigene Kamera!)
async function joinLiveKitRoom(userName) {
  if (livekitConnected) return;

  try {
    const roomName = 'bibelraum-live';

    // Token vom Server holen
    const resp = await fetch(`/api/livekit/token?name=${encodeURIComponent(userName)}&room=${encodeURIComponent(roomName)}`);
    const data = await resp.json();

    if (data.error) {
      showToast('⚠️ LiveKit-Fehler: ' + data.error);
      return;
    }

    const room = new LivekitClient.Room({
      adaptiveStream: false,
      dynacast: true,
      autoSubscribe: true,
    });

    room.on('participantConnected', (participant) => {
      console.log('👤 LiveKit: ' + participant.identity + ' beigetreten');
      showToast('👤 ' + participant.identity + ' ist dem LiveKit-Raum beigetreten!');
      addLiveKitParticipant(participant);
      participant.trackPublications.forEach(function(pub) {
        if (pub.track && pub.track.kind === 'video') {
          handleRemoteVideoTrack(pub.track, participant);
        }
      });
      participant.on('trackSubscribed', function(track, pub) {
        if (track.kind === 'video') {
          console.log('📹 Remote Track subscribed (per participant): ' + participant.identity);
          handleRemoteVideoTrack(track, participant);
        }
      });
    });

    room.on('participantDisconnected', (participant) => {
      console.log('👤 LiveKit: ' + participant.identity + ' verlassen');
      removeLiveKitParticipant(participant.identity);
    });

    room.on('trackSubscribed', (track, publication, participant) => {
      console.log('📹 LiveKit Track subscribed (per room): ' + track.kind + ' von ' + participant.identity);
      if (track.kind === 'video') {
        handleRemoteVideoTrack(track, participant);
      }
    });

    room.on('trackUnsubscribed', (track, publication, participant) => {
      console.log('📹 LiveKit Track unsubscribed: ' + participant.identity);
      removeLiveKitParticipant(participant.identity);
    });

    // Zum Server verbinden (NUR als Zuschauer – KEINE eigene Kamera!)
    await room.connect(data.host, data.token);
    console.log('✅ LiveKit verbunden (Zuschauer): ' + roomName);

    // Bereits verbundene Teilnehmer aktiv scannen
    scanAllRemoteTracks(room);

    // Periodischer Scan (Sicherheitsnetz)
    if (window._remoteTrackScanner) clearInterval(window._remoteTrackScanner);
    window._remoteTrackScanner = setInterval(function() {
      if (livekitRoom && livekitConnected) {
        scanAllRemoteTracks(livekitRoom);
      }
    }, 2000);

    livekitRoom = room;
    livekitConnected = true;

    // Desktop-Galerie anzeigen
    const lkContainer = document.getElementById('livekit-container');
    if (lkContainer) lkContainer.classList.remove('hidden');

    showToast('🔗 Mit LiveKit-Raum verbunden');
  } catch (e) {
    console.error('LiveKit-Fehler:', e);
    showToast('⚠️ LiveKit-Fehler: ' + e.message);
  }
}

// Eigene Kamera ein-/ausschalten (OHNE den LiveKit-Raum zu verlassen)
async function toggleOwnCamera(enable) {
  if (!livekitRoom || !livekitConnected) {
    showToast('⚠️ Nicht mit LiveKit verbunden');
    return;
  }
  try {
    await livekitRoom.localParticipant.setCameraEnabled(enable);
    if (enable) {
      console.log('📷 Eigene Kamera EINGESCHALTET');
      showToast('📷 Kamera an');
    } else {
      console.log('📷 Eigene Kamera AUSGESCHALTET');
      showToast('📷 Kamera aus');
    }
  } catch (e) {
    console.warn('⚠️ Kamera-Umschaltung fehlgeschlagen:', e);
    showToast('⚠️ Kamera-Fehler: ' + e.message);
  }
}

function addLiveKitParticipant(participant) {
  if (!livekitParticipantTracks[participant.identity]) {
    livekitParticipantTracks[participant.identity] = { video: null, name: participant.identity };
  }
}

function removeLiveKitParticipant(identity) {
  delete livekitParticipantTracks[identity];

  // Video-Element entfernen
  const vid = document.getElementById('lk-video-' + identity);
  if (vid) vid.remove();

  // Aus Desktop-Galerie entfernen
  const tile = document.getElementById('lk-tile-' + identity);
  if (tile) tile.remove();

  updateGridText();

  // A-Frame-Kacheln neu aufbauen
  rebuildVideoGrid();
}

function addToDesktopGrid(identity, videoEl) {
  // Prüfen ob schon ein Tile existiert
  var existingTile = document.getElementById('lk-tile-' + identity);
  if (existingTile) return;

  const grid = document.getElementById('livekit-grid');
  if (!grid) return;

  const tile = document.createElement('div');
  tile.id = 'lk-tile-' + identity;
  tile.style.cssText = 'width:50%;height:50%;position:relative;background:#222;overflow:hidden;border-radius:4px;';

  // ECHTES Video-Element in den Tile verschieben (nicht klonen!)
  videoEl.id = 'lk-tile-video-' + identity;
  videoEl.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;opacity:1;position:relative;';
  tile.appendChild(videoEl);

  // Mikrofon-Status
  const micBadge = document.createElement('div');
  micBadge.id = 'lk-mic-' + identity;
  micBadge.style.cssText = 'position:absolute;bottom:4px;right:4px;font-size:14px;background:rgba(0,0,0,0.6);padding:2px 6px;border-radius:4px;';
  micBadge.textContent = '🟢';
  tile.appendChild(micBadge);

  const nameLabel = document.createElement('div');
  nameLabel.style.cssText = 'position:absolute;bottom:4px;left:4px;font-size:11px;color:#fff;background:rgba(0,0,0,0.6);padding:2px 6px;border-radius:4px;';
  nameLabel.textContent = identity;
  tile.appendChild(nameLabel);

  grid.appendChild(tile);
}

function updateGridText() {
  const count = Object.keys(livekitParticipantTracks).length;
  const gridText = document.getElementById('grid-text');
  if (gridText) {
    gridText.setAttribute('value', count > 0 ? '📹 ' + count + ' Teilnehmer' : '📹 Webcams');
  }
}

// LiveKit-Raum verlassen
async function leaveLiveKitRoom() {
  if (canvasAnimFrame) {
    cancelAnimationFrame(canvasAnimFrame);
    canvasAnimFrame = null;
  }

  if (livekitRoom) {
    await livekitRoom.disconnect();
    livekitRoom = null;
  }

  livekitConnected = false;
  livekitParticipantTracks = {};

  // Alle LiveKit-Video-Elemente entfernen
  document.querySelectorAll('[id^="lk-video-"], [id^="lk-tile-"]').forEach(el => el.remove());

  // Desktop-Galerie ausblenden
  const lkContainer = document.getElementById('livekit-container');
  if (lkContainer) lkContainer.classList.add('hidden');

  // Canvas leeren
  const canvas = document.getElementById('video-grid-canvas');
  if (canvas) {
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#0a0a1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  var screenText = document.getElementById('screen-text');
  if (screenText) screenText.setAttribute('value', '📺 Bibelstunde');

  updateGridText();
}

function setupLocalVideo(userName, track) {
  try {
    var localVideoEl = document.createElement('video');
    localVideoEl.id = 'lk-video-' + userName;
    localVideoEl.srcObject = new MediaStream([track.mediaStreamTrack]);
    localVideoEl.autoplay = true;
    localVideoEl.playsInline = true;
    localVideoEl.muted = true;
    localVideoEl.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0.01;pointer-events:none;z-index:-1;';
    document.body.appendChild(localVideoEl);
    localVideoEl.play().catch(function(e) { console.warn('⚠️ Lokales Video play error:', e); });

    if (!livekitParticipantTracks[userName]) {
      livekitParticipantTracks[userName] = { video: null, name: userName };
    }
    livekitParticipantTracks[userName].video = localVideoEl;
    livekitParticipantTracks[userName].name = userName;

    addToDesktopGrid(userName, localVideoEl);
    console.log('📹 Lokaler LiveKit-Track geladen');
    rebuildVideoGrid();
    // Lokales Video NIEMALS auf die Leinwand – nur Remote!
  } catch(e) {
    console.warn('⚠️ Lokaler Video-Track nicht verfügbar:', e);
  }
}

// === REMOTE VIDEO-TRACK EMPFANGEN (Gemini Pro Methode) ===
function handleRemoteVideoTrack(track, participant) {
  var identity = participant.identity;

  // Prüfen ob schon verarbeitet
  if (document.getElementById('lk-tile-' + identity)) {
    console.log('⏩ Remote Track übersprungen (existiert bereits): ' + identity);
    return;
  }

  console.log('📹 Empfange Video von ' + identity);

  // ★ GEMINI FIX: Video-Element SELBST erstellen & ins DOM einfügen BEVOR track.attach()
  var videoEl = document.createElement('video');
  videoEl.id = 'lk-tile-video-' + identity;  // Feste ID – A-Frame referenziert diese!
  videoEl.autoplay = true;
  videoEl.playsInline = true;
  videoEl.webkitPlaysInline = true;
  videoEl.muted = true;
  // Unsichtbar im Body
  videoEl.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0.01;pointer-events:none;z-index:-1;';
  document.body.appendChild(videoEl);

  // ★ GEMINI FIX: track.attach(videoEl) – Stream in BESTEHENDES Element leiten!
  track.attach(videoEl);

  // Video starten
  videoEl.play().catch(function(err) {
    console.warn('⚠️ Remote Autoplay-Fehler: ' + identity, err);
  });

  // In Datenstruktur speichern
  if (!livekitParticipantTracks[identity]) {
    livekitParticipantTracks[identity] = { video: null, name: identity };
  }
  livekitParticipantTracks[identity].video = videoEl;
  livekitParticipantTracks[identity].name = identity;

  console.log('✅ Remote Video von ' + identity + ' gespeichert');
  showToast('📹 ' + identity + ' Kamera empfangen');

  // Desktop-Galerie (das Video-Element in einen Tile legen)
  addToDesktopGrid(identity, videoEl);

  // ★ A-Frame-Kacheln NEU aufbauen – Video ist BEREITS im DOM, A-Frame erkennt es!
  rebuildVideoGrid();
}

// === AKTIVE SUCHE NACH REMOTE TRACKS ===
function scanAllRemoteTracks(room) {
  room.remoteParticipants.forEach(function(participant) {
    console.log('🔍 Scanne Remote: ' + participant.identity);
    participant.trackPublications.forEach(function(pub) {
      if (pub.track && pub.track.kind === 'video') {
        handleRemoteVideoTrack(pub.track, participant);
      }
    });
  });
}

// === VIDEO-KACHELN AUF DER LINKEN WAND ===
// Jede Kamera bekommt eine eigene A-Frame-Plane mit dem Video direkt als Textur
function rebuildVideoGrid() {
  const container = document.getElementById('video-grid-container');
  if (!container) return;

  // Alte Kacheln entfernen
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  // Teilnehmer mit Video holen
  const participants = Object.entries(livekitParticipantTracks).filter(([id, p]) => p.video !== null);
  const count = participants.length;

  if (count === 0) {
    updateGridText();
    return;
  }

  // Raster berechnen
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const tileW = 4.3 / cols;
  const tileH = 2.6 / rows;

  participants.forEach(([identity, p], index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = -4.3/2 + col * tileW + tileW/2;
    const y = 2.6/2 - row * tileH - tileH/2;

    // Plane für diese Kamera erstellen
    const plane = document.createElement('a-plane');
    plane.setAttribute('depth', '0.01');
    plane.setAttribute('width', (tileW - 0.1).toString());
    plane.setAttribute('height', (tileH - 0.1).toString());
    plane.setAttribute('position', x + ' ' + y + ' 0');

    // Video direkt als Textur setzen (KEIN Canvas!)
    var videoId = 'lk-tile-video-' + identity;
    var videoEl = document.getElementById(videoId);
    if (videoEl && videoEl.srcObject) {
      plane.setAttribute('material', 'shader: flat; src: #' + videoId + '; color: #ffffff');
    } else {
      // Fallback: schwarze Kachel
      plane.setAttribute('material', 'color: #1a1a2e');
    }

    container.appendChild(plane);
  });

  updateGridText();
}

// === LOKALE WEBCAM FÜR DIE CONTENT-LEINWAND (vorne) ===
function startCamOnScreen() {
  // Wird jetzt von LiveKit übernommen
  // Die Content-Leinwand zeigt den Namen des aktiven Sprechers
}

function stopCamOnScreen() {
  // Wird jetzt von LiveKit übernommen
}

// === UI-STEUERUNG ===
function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);

  setTimeout(() => { toast.style.opacity = '1'; }, 10);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

function copyRoomLink() {
  const url = window.location.href;
  navigator.clipboard.writeText(url).then(() => {
    showToast('🔗 Link kopiert!');
  }).catch(() => {
    showToast('Link: ' + url);
  });
}

// === CHAT-FUNKTIONEN ===
function addChatMessage(msg) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const div = document.createElement('div');
  div.className = 'chat-msg ' + (msg.isBot ? 'bot' : 'user');
  div.innerHTML = '<div class="name">' + escapeHtml(msg.name) + '<span class="time">' + (msg.time || '') + '</span></div>' + escapeHtml(msg.text);
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function sendChatMessage() {
  const input = document.getElementById('chat-input');
  if (!input || !input.value.trim() || !socket) return;
  const text = input.value.trim();
  if (text.length > 200) return;
  socket.emit('chat:message', { text: text });
  input.value = '';
}

// === INIT ===
document.addEventListener('DOMContentLoaded', () => {
  // Benutzer-Vorschau starten (vor dem Login)
  startUserPreview();

  // Login
  const loginBox = document.getElementById('login-box');
  const nameInput = document.getElementById('name-input');
  const enterBtn = document.getElementById('enter-btn');
  const toolbar = document.getElementById('toolbar');

  enterBtn.addEventListener('click', () => {
    const name = nameInput.value.trim() || 'Gast';
    myName = name;

    // Ausgewählte Avatar-Farbe holen
    var avatarColor = '#E57373';
    var selected = document.querySelector('.av-choice.selected');
    if (selected) avatarColor = selected.getAttribute('data-color') || avatarColor;

    loginBox.style.display = 'none';
    toolbar.style.display = 'flex';

    // Socket verbinden
    connectSocket();

    // Nach Verbindung: Avatar + Name setzen
    socket.on('connect', () => {
      setTimeout(() => {
        socket.emit('user:name', myName);
        createOwnAvatar(myName, avatarColor);
        initMovement();
        initPositionSync();
        checkVR();

        // ★ LIVEKIT AUTOMATISCH BEITRETEN (ohne Kamera!)
        joinLiveKitRoom(myName);
      }, 500);
    });
  });

  // Avatar-Auswahl Klick-Handler
  document.querySelectorAll('.av-choice').forEach(function(el) {
    el.addEventListener('click', function() {
      document.querySelectorAll('.av-choice').forEach(function(e) { e.classList.remove('selected'); });
      this.classList.add('selected');
    });
  });

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') enterBtn.click();
  });

  // Kamera-Button: Nur Kamera ein/aus (OHNE LiveKit-Raum zu verlassen!)
  var myCameraEnabled = false;
  document.getElementById('toggle-cam')?.addEventListener('click', () => {
    myCameraEnabled = !myCameraEnabled;
    toggleOwnCamera(myCameraEnabled);
    document.getElementById('toggle-cam').textContent = myCameraEnabled ? '📹 Aus' : '📹 Kamera';
  });

  // Chat-Toggle
  document.getElementById('toggle-chat')?.addEventListener('click', () => {
    const cp = document.getElementById('chat-panel');
    cp.classList.toggle('hidden');
    if (!cp.classList.contains('hidden')) {
      document.getElementById('chat-input')?.focus();
    }
  });

  // Chat-Close
  document.getElementById('chat-close')?.addEventListener('click', () => {
    document.getElementById('chat-panel')?.classList.add('hidden');
  });

  // Chat-Senden per Button
  document.getElementById('chat-send')?.addEventListener('click', sendChatMessage);

  // Chat-Senden per Enter
  document.getElementById('chat-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendChatMessage();
    }
  });

  document.getElementById('copy-link')?.addEventListener('click', copyRoomLink);

  // Verlassen-Button: sauber ausloggen
  document.getElementById('leave-btn')?.addEventListener('click', leaveRoom);

  // Beim Seiten-Refresh/Closing: sauber trennen
  window.addEventListener('beforeunload', () => {
    if (socket) socket.disconnect();
  });
});

// === RAUM VERLASSEN ===
function leaveRoom() {
  leaveLiveKitRoom();
  if (socket) {
    socket.disconnect();
  }
  // Seite neuladen – zurück zum Login
  window.location.reload();
}
