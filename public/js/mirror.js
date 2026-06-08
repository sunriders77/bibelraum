/* =========================================
   Spiegel-Komponente für A-Frame
   Verwendet THREE.Reflector (dynamisch geladen)
   ========================================= */

(function() {
  'use strict';

  // Reflector aus drei.js examples kompatibel machen
  // (MIT License, Copyright © 2010-2024 three.js authors)
  function createReflector(geometry, options) {

    var THREE = window.THREE;

    if (!THREE) {
      console.error('[Spiegel] THREE nicht verfügbar!');
      return null;
    }

    var textureWidth = options.textureWidth || 256;
    var textureHeight = options.textureHeight || 256;
    var clipBias = options.clipBias || 0.003;
    var color = options.color || 0x8899AA;

    // RenderTarget
    var renderTarget = new THREE.WebGLRenderTarget(textureWidth, textureHeight);
    renderTarget.texture.magFilter = THREE.LinearFilter;
    renderTarget.texture.minFilter = THREE.LinearFilter;
    renderTarget.texture.generateMipmaps = false;

    // Material
    var material = new THREE.MeshBasicMaterial({
      map: renderTarget.texture,
      side: THREE.DoubleSide,
      toneMapped: false
    });

    var reflector = new THREE.Mesh(geometry, material);
    reflector.renderOrder = 0;

    // Hilfsobjekte
    var tempCamera = new THREE.PerspectiveCamera();
    var tempVec3 = new THREE.Vector3();
    var tempVec3b = new THREE.Vector3();
    var tempQuat = new THREE.Quaternion();
    var tempMat4 = new THREE.Matrix4();
    var tempPlane = new THREE.Plane();
    var normalMatrix = new THREE.Matrix3();
    var clipPlane = new THREE.Plane();
    var viewport = new THREE.Vector4();

    var matrix = new THREE.Matrix4();
    var lookTarget = new THREE.Vector3();

    // Speichere Referenzen
    reflector.__renderTarget = renderTarget;
    reflector.__tempCamera = tempCamera;
    reflector.__tempVec3 = tempVec3;
    reflector.__tempVec3b = tempVec3b;
    reflector.__tempQuat = tempQuat;
    reflector.__tempMat4 = tempMat4;
    reflector.__tempPlane = tempPlane;
    reflector.__normalMatrix = normalMatrix;
    reflector.__clipPlane = clipPlane;
    reflector.__viewport = viewport;
    reflector.__matrix = matrix;
    reflector.__lookTarget = lookTarget;
    reflector.__clipBias = clipBias;
    reflector.__color = new THREE.Color(color);
    reflector.__material = material;
    reflector.__textureWidth = textureWidth;
    reflector.__textureHeight = textureHeight;

    reflector.update = function(renderer, scene, camera) {
      if (!camera || !renderer) return;

      // Welt-Matrix des Spiegels
      reflector.updateWorldMatrix(true, false);

      var mirrorWorldPos = tempVec3;
      reflector.getWorldPosition(mirrorWorldPos);

      var mirrorWorldQuat = tempQuat;
      reflector.getWorldQuaternion(mirrorWorldQuat);

      // Normale = Spiegels Blickrichtung (lokale +Z)
      var normal = tempVec3b.set(0, 0, 1).applyQuaternion(mirrorWorldQuat).normalize();

      // Distanz von Kamera zur Spiegel-Ebene
      var camPos = camera.position;
      var d = -mirrorWorldPos.dot(normal);
      var cameraDist = camPos.dot(normal) + d;

      // Spiegele Kamera-Position an der Ebene
      var mirrorCamPos = tempVec3b.copy(normal).multiplyScalar(-2 * cameraDist).add(camPos);

      // Spiegele Up-Vektor
      var up = new THREE.Vector3(0, 1, 0);
      var upDist = up.dot(normal);
      var mirrorUp = new THREE.Vector3().copy(normal).multiplyScalar(-2 * upDist).add(up);

      tempCamera.position.copy(mirrorCamPos);
      tempCamera.up.copy(mirrorUp);

      // Blickrichtung: vom gespiegelten Punkt zur Spiegel-Mitte
      lookTarget.copy(mirrorWorldPos);

      // Korrektur: der LookAt-Vektor muss auch gespiegelt werden
      var lookDir = lookTarget.clone().sub(mirrorCamPos).normalize();
      var mirroredLookDir = lookDir.clone().sub(normal.clone().multiplyScalar(2 * lookDir.dot(normal))).normalize();
      lookTarget.copy(mirrorCamPos).add(mirroredLookDir);

      tempCamera.lookAt(lookTarget);

      // FOV anpassen
      tempCamera.fov = camera.fov || 60;
      tempCamera.aspect = textureWidth / textureHeight;
      tempCamera.near = camera.near || 0.1;
      tempCamera.far = camera.far || 100;
      tempCamera.updateProjectionMatrix();

      // Clipping-Plane: alles hinter dem Spiegel wegschneiden
      clipPlane.set(normal, d + clipBias);
      clipPlane.applyMatrix4(reflector.matrixWorld);

      var clipNormal = clipPlane.normal;
      var clipConstant = clipPlane.constant;

      // Clip-Plane in View-Space
      var viewClipPlane = tempPlane;
      viewClipPlane.copy(clipPlane);
      viewClipPlane.applyMatrix4(tempCamera.matrixWorldInverse);

      // Spiegel die Clip-Plane
      var q = new THREE.Vector4(
        viewClipPlane.normal.x,
        viewClipPlane.normal.y,
        viewClipPlane.normal.z,
        -viewClipPlane.constant
      );

      // Für 3D-Grafik: spiegeln der Clip-Distanz
      var clipPlaneCamera = new THREE.Vector4();
      var projectionMatrix = tempCamera.projectionMatrix;
      clipPlaneCamera.x = (Math.sign(q.x) || 1) / projectionMatrix.elements[0];
      clipPlaneCamera.y = (Math.sign(q.y) || 1) / projectionMatrix.elements[5];
      clipPlaneCamera.z = -1.0;
      clipPlaneCamera.w = (1.0 + THREE.ImageUtils ? 0 : clipBias);

      // Shader-Clip-Plane setzen (via Uniform)
      // In MeshBasicMaterial nutzen wir stattdessen OpenGL Clip Planes
      renderer.clipPlane = clipPlane;

      // Viewport sichern
      viewport.copy(renderer.getViewport(new THREE.Vector4()));

      // Rendern
      var oldAutoClear = renderer.autoClear;
      renderer.autoClear = true;
      renderer.setRenderTarget(renderTarget);
      renderer.state.buffers.depth.setMask(true);
      if (renderer.clipPlane) {
        renderer.render(scene, tempCamera);
      }
      renderer.setRenderTarget(null);
      renderer.autoClear = oldAutoClear;

      // Viewport wiederherstellen
      renderer.setViewport(viewport);

      // Alpha auf Material setzen für Transparenz-Effekt
      material.opacity = 0.85;
      material.transparent = true;
    };

    reflector.dispose = function() {
      renderTarget.dispose();
      geometry.dispose();
      material.dispose();
    };

    return reflector;
  }

  // =========================================
  // A-Frame Mirror Component
  // =========================================

  var mirrorComponent = {
    schema: {
      width: { default: 1.0 },
      height: { default: 2.0 },
      resolution: { default: 256 },
      clipBias: { default: 0.003 },
      color: { default: '#8899AA' }
    },

    init: function() {
      var data = this.data;
      var el = this.el;
      var scene = el.sceneEl;
      var renderer = scene.renderer;

      // Plane-Geometrie erstellen
      var geometry = new THREE.PlaneGeometry(data.width, data.height);

      // Reflector erstellen
      this.reflector = createReflector(geometry, {
        textureWidth: data.resolution,
        textureHeight: data.resolution,
        clipBias: data.clipBias,
        color: data.color
      });

      if (this.reflector) {
        el.setObject3D('mesh', this.reflector);
        this.frameCount = 0;
        this.updateEvery = 3; // Jedes 3. Frame updaten
        console.log('[Spiegel] ✅ Erstellt (' + data.width + '×' + data.height + 'm)');
      } else {
        // Fallback: einfache graue Plane
        var fallbackGeo = new THREE.PlaneGeometry(data.width, data.height);
        var fallbackMat = new THREE.MeshBasicMaterial({
          color: 0x334466,
          transparent: true,
          opacity: 0.4
        });
        el.setObject3D('mesh', new THREE.Mesh(fallbackGeo, fallbackMat));
        console.warn('[Spiegel] ⚠️ Fallback verwendet');
      }
    },

    tick: function() {
      if (!this.reflector) return;

      // Nur jedes N. Frame updaten (Performance)
      this.frameCount++;
      if (this.frameCount % this.updateEvery !== 0) return;

      var scene = this.el.sceneEl;
      var renderer = scene.renderer;
      var camera = scene.camera;

      if (!camera || !camera.parent) return;

      // In VR: die tatsächliche gerenderte Kamera
      var activeCam = camera;
      if (renderer.xr && renderer.xr.isPresenting) {
        try {
          var xrCam = renderer.xr.getCamera();
          if (xrCam) activeCam = xrCam;
        } catch(e) {}
      }

      this.reflector.update(renderer, scene.object3D, activeCam);
    },

    remove: function() {
      if (this.reflector) {
        this.reflector.dispose();
      }
    }
  };

  AFRAME.registerComponent('mirror', mirrorComponent);
  console.log('[Spiegel] 🪞 Mirror-Komponente registriert');

})();
