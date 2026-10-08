// Telt "draw calls": hoe vaak per frame de GPU de opdracht krijgt om iets te tekenen.
// Minder is beter. We tellen mee door de twee WebGL-tekenfuncties in te pakken.

class DrawCallCounter {
  constructor(game) {
    this.current = 0;
    this.lastFrame = 0;
    const renderer = game.renderer;
    if (!renderer || !renderer.gl) { this.lastFrame = NaN; return; }

    const gl = renderer.gl;
    const self = this;
    const origElements = gl.drawElements.bind(gl);
    const origArrays = gl.drawArrays.bind(gl);
    gl.drawElements = function (...args) { self.current++; return origElements(...args); };
    gl.drawArrays = function (...args) { self.current++; return origArrays(...args); };

    renderer.on(Phaser.Renderer.Events.PRE_RENDER, () => { self.current = 0; });
    renderer.on(Phaser.Renderer.Events.POST_RENDER, () => { self.lastFrame = self.current; });
  }
}

window.DrawCallCounter = DrawCallCounter;
