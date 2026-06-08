/* =========================================
   Spiegel-Komponente für A-Frame
   Verwendet Planar-Reflektor mit
   onBeforeRender (THREE.js nativ)
   ========================================= */
(function() {
  'use strict';

  AFRAME.registerComponent('mirror', {
    schema: {
      width: { default: 1.0 },
      height: { default: 2.2 },
      resolution: { default: 256 },
      clipBias: { default: 0.005 },
      color: { default: '#AABBCC' }
    },

    init: function() {
      var data = this.data;
      var el = this.el;
      var THREE = window.THREE;

      // RenderTarget
      var res = data.resolution;
      this.renderTarget = new THREE.WebGLRenderTarget(res, Math.round(res * data.height / data.width));
      this.renderTarget.texture.magFilter = THREE.LinearFilter;
      this.renderTarget.texture.minFilter = THREE.LinearFilter;
      this.renderTarget.texture.generateMipmaps = false;

      // Plane-Geometrie
      var geometry = new THREE.PlaneGeometry(data.width, data.height);

      // Material mit RenderTarget-Textur
      var material = new THREE.MeshBasicMaterial({
        map: this.renderTarget.texture,
        side: THREE.DoubleSide,
        toneMapped: false
      });

      this.mesh = new THREE.Mesh(geometry, material);
      el.setObject3D('mesh', this.mesh);

      // Hilfsobjekte (einmal anlegen, wiederverwenden)
      var tempVec3 = new THREE.Vector3();
      var tempVec3b = new THREE.Vector3();
      var tempQuat = new THREE.Quaternion();
      var viewerCam = new THREE.PerspectiveCamera(60, data.width / data.height, 0.01, 100);
      var lookTarget = new THREE.Vector3();
      var upVec = new THREE.Vector3(0, 1, 0);
      var normal = new THREE.Vector3();

      var self = this;

      // === onBeforeRender: WIRD VON THREE.js NATIV AUFGERUFEN ===
      // Kein zusätzliches render(), kein Flackern!
      this.mesh.onBeforeRender = function(renderer, scene, camera) {
        if (!camera || !camera.parent) return;

        // In VR die richtige Kamera holen
        var activeCam = camera;
        if (renderer.xr && renderer.xr.isPresenting) {
          try {
            var xrCam = renderer.xr.getCamera();
            if (xrCam && xrCam.cameras && xrCam.cameras.length > 0) {
              activeCam = xrCam.cameras[0];
            }
          } catch(e) {}
        }

        // Welt-Position und -Rotation des Spiegels
        self.mesh.getWorldPosition(tempVec3);
        self.mesh.getWorldQuaternion(tempQuat);

        // Normale = lokale +Z Richtung (Spiegel zeigt nach vorne)
        normal.set(0, 0, 1).applyQuaternion(tempQuat).normalize();

        // Kamera-Position an der Spiegel-Ebene spiegeln
        var camPos = activeCam.position;
        var dist = camPos.clone().sub(tempVec3).dot(normal);
        var mirrorPos = tempVec3b.copy(camPos).sub(normal.clone().multiplyScalar(2 * dist));

        // Up-Vektor spiegeln
        var upDist = upVec.dot(normal);
        var mirrorUp = tempVec3b.copy(upVec).sub(normal.clone().multiplyScalar(2 * upDist));

        viewerCam.position.copy(mirrorPos);
        viewerCam.up.copy(mirrorUp);

        // Blickrichtung berechnen
        var lookDir = tempVec3.clone().sub(mirrorPos).normalize();
        var mirroredLook = lookDir.clone().sub(normal.clone().multiplyScalar(2 * lookDir.dot(normal)));
        lookTarget.copy(mirrorPos).add(mirroredLook);
        viewerCam.lookAt(lookTarget);

        // Kameraparameter
        viewerCam.aspect = self.data.width / self.data.height;
        viewerCam.updateProjectionMatrix();

        // Viewport sichern + RenderTarget render
        var oldVR = renderer.xr.isPresenting;
        if (oldVR) renderer.xr.isPresenting = false;

        renderer.setRenderTarget(self.renderTarget);
        renderer.render(scene, viewerCam);
        renderer.setRenderTarget(null);

        if (oldVR) renderer.xr.isPresenting = true;
      };

      console.log('[Spiegel] ✅ ' + data.width + '×' + data.height + 'm @ ' + res + 'px');
    },

    remove: function() {
      if (this.mesh) {
        this.mesh.onBeforeRender = null;
        this.el.removeObject3D('mesh');
      }
      if (this.renderTarget) {
        this.renderTarget.dispose();
      }
    }
  });

  console.log('[Spiegel] 🪞 Mirror-Komponente registriert');
})();
