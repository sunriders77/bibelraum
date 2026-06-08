/* =========================================
   Spiegel-Komponente für A-Frame
   Dekorativer Spiegel – glänzend + Rahmen
   (Dynamische Reflexion in VR zu instabil)
   ========================================= */
(function() {
  'use strict';

  AFRAME.registerComponent('mirror', {
    schema: {
      width: { default: 0.9 },
      height: { default: 2.0 },
      color: { default: '#D0D8E8' }
    },

    init: function() {
      var data = this.data;
      var el = this.el;
      var w = data.width;
      var h = data.height;

      // === Spiegel-Glas (silbrig-glänzend) ===
      var glass = document.createElement('a-plane');
      glass.setAttribute('width', w);
      glass.setAttribute('height', h);
      glass.setAttribute('position', '0 0 0.01');
      glass.setAttribute('material', 
        'color: ' + data.color + '; ' +
        'metalness: 0.95; roughness: 0.05; ' +
        'transparent: true; opacity: 0.85; ' +
        'side: double'
      );
      el.appendChild(glass);

      // === Rahmen (links) ===
      var frameLeft = document.createElement('a-box');
      frameLeft.setAttribute('width', '0.04');
      frameLeft.setAttribute('height', h + 0.1);
      frameLeft.setAttribute('depth', '0.06');
      frameLeft.setAttribute('position', (-w/2 - 0.02) + ' 0 0');
      frameLeft.setAttribute('color', '#5C3A1E');
      frameLeft.setAttribute('material', 'roughness: 0.8');
      el.appendChild(frameLeft);

      // === Rahmen (rechts) ===
      var frameRight = document.createElement('a-box');
      frameRight.setAttribute('width', '0.04');
      frameRight.setAttribute('height', h + 0.1);
      frameRight.setAttribute('depth', '0.06');
      frameRight.setAttribute('position', (w/2 + 0.02) + ' 0 0');
      frameRight.setAttribute('color', '#5C3A1E');
      frameRight.setAttribute('material', 'roughness: 0.8');
      el.appendChild(frameRight);

      // === Rahmen (oben) ===
      var frameTop = document.createElement('a-box');
      frameTop.setAttribute('width', w + 0.12);
      frameTop.setAttribute('height', '0.04');
      frameTop.setAttribute('depth', '0.06');
      frameTop.setAttribute('position', '0 ' + (h/2 + 0.02) + ' 0');
      frameTop.setAttribute('color', '#5C3A1E');
      frameTop.setAttribute('material', 'roughness: 0.8');
      el.appendChild(frameTop);

      // === Rahmen (unten) ===
      var frameBottom = document.createElement('a-box');
      frameBottom.setAttribute('width', w + 0.12);
      frameBottom.setAttribute('height', '0.04');
      frameBottom.setAttribute('depth', '0.06');
      frameBottom.setAttribute('position', '0 ' + (-h/2 - 0.02) + ' 0');
      frameBottom.setAttribute('color', '#5C3A1E');
      frameBottom.setAttribute('material', 'roughness: 0.8');
      el.appendChild(frameBottom);

      // === Lichtreflex (schräger Glanzstreifen) ===
      var glare = document.createElement('a-plane');
      glare.setAttribute('width', w * 0.15);
      glare.setAttribute('height', h * 0.6);
      glare.setAttribute('position', (w * 0.2) + ' ' + (h * 0.15) + ' 0.02');
      glare.setAttribute('rotation', '0 0 15');
      glare.setAttribute('material',
        'color: #FFFFFF; ' +
        'transparent: true; opacity: 0.08; ' +
        'side: double'
      );
      el.appendChild(glare);

      console.log('[Spiegel] ✅ Dekorative Spiegel (' + w + '×' + h + 'm)');
    }
  });

  console.log('[Spiegel] 🪞 Mirror-Komponente registriert');
})();
