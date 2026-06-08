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

// === JITSI INTEGRATION ===
let jitsiInitialized = false;
let localCamStream = null;
let vrCamVideo = null;

// Starte lokale Webcam auf der 3D-Leinwand (für VR!)
function startCamOnScreen() {
  if (localCamStream) return;

  navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360 }, audio: false })
    .then(function(stream) {
      localCamStream = stream;

      // Verstecktes Video-Element
      vrCamVideo = document.createElement('video');
      vrCamVideo.id = 'vr-cam-video';
      vrCamVideo.srcObject = stream;
      vrCamVideo.autoplay = true;
      vrCamVideo.playsInline = true;
      vrCamVideo.muted = true;
      vrCamVideo.style.display = 'none';
      document.body.appendChild(vrCamVideo);

      vrCamVideo.onloadedmetadata = function() {
        vrCamVideo.play();
        var screen = document.getElementById('video-screen');
        if (screen) {
          screen.setAttribute('material', 'src', '#vr-cam-video');
        }
        var text = document.getElementById('screen-text');
        if (text) text.setAttribute('value', '📺 Kamera aktiv');
        showToast('📹 Kamera auf der Leinwand aktiv!');
      };
    })
    .catch(function(err) {
      console.warn('Kamera nicht verfügbar:', err);
      showToast('⚠️ Kamera nicht verfügbar');
    });
}

function stopCamOnScreen() {
  if (vrCamVideo) {
    vrCamVideo.srcObject = null;
    vrCamVideo.remove();
    vrCamVideo = null;
  }
  if (localCamStream) {
    localCamStream.getTracks().forEach(function(t) { t.stop(); });
    localCamStream = null;
  }
  var screen = document.getElementById('video-screen');
  if (screen) {
    screen.setAttribute('material', 'src', '');
  }
  var text = document.getElementById('screen-text');
  if (text) text.setAttribute('value', '📺 Bibelstunde');
}

function initJitsi() {
  const container = document.getElementById('jitsi-container');
  if (!container) return;

  const roomName = 'Bibelraum-' + generateRoomCode();

  // Lade Jitsi External API
  const script = document.createElement('script');
  script.src = 'https://meet.jit.si/external_api.js';
  script.onload = () => {
    const domain = 'meet.jit.si';
    const options = {
      roomName: roomName,
      parentNode: document.querySelector('#jitsi-meeting'),
      configOverrides: {
        startWithAudioMuted: false,
        startWithVideoMuted: false,
        disableDeepLinking: true,
        disableSimulcast: false,
        toolbarButtons: ['microphone', 'camera', 'desktop', 'fullscreen', 'fodeviceselection', 'hangup'],
        doNotStoreRoom: true
      },
      interfaceConfigOverrides: {
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        TOOLBAR_ALWAYS_VISIBLE: true,
        DISABLE_JOIN_LEAVE_NOTIFICATIONS: true
      }
    };
    try {
      new JitsiMeetExternalAPI(domain, options);
      jitsiInitialized = true;
      console.log('📺 Jitsi gestartet');
    } catch(e) {
      console.warn('Jitsi konnte nicht gestartet werden:', e);
    }
  };
  document.body.appendChild(script);
}

function generateRoomCode() {
  return 'bibel' + Math.random().toString(36).substring(2, 8).toUpperCase();
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
        // Jitsi wird nur geladen wenn der Button geklickt wird
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

  // Toolbar-Buttons
  document.getElementById('toggle-jitsi')?.addEventListener('click', () => {
    const jc = document.getElementById('jitsi-container');
    const isActive = !jc.classList.contains('hidden');
    if (isActive) {
      // Ausschalten: Jitsi-Seitenleiste aus + Kamera aus
      jc.classList.add('hidden');
      stopCamOnScreen();
    } else {
      // Einschalten: Jitsi starten + Kamera auf Leinwand
      if (!jitsiInitialized) {
        initJitsi();
      }
      jc.classList.remove('hidden');
      startCamOnScreen();
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
  if (socket) {
    socket.disconnect();
  }
  // Seite neuladen – zurück zum Login
  window.location.reload();
}
