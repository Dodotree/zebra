'use strict';

// Simple implementation of the pub/sub pattern to decouple components
class EventEmitter {

    constructor() {
      this.events = {};
    }
  
    on(event, callback) {
      if (!this.events[event]) {
        this.events[event] = [];
      }
      this.events[event].push(callback);
    }
  
    remove(event, listener) {
      if (this.events[event]) {
        const index = this.events[event].indexOf(listener);
        if (~index) {
          this.events[event].splice(index, 1);
        }
      }
    }
  
    emit(event) {
      const events = this.events[event];
      if (events) {
        events.forEach((event) => event());
      }
    }
  
  }

// Abstracts away the requestAnimationFrame in an effort to provide a clock instance
// to sync various parts of an application
export class Clock extends EventEmitter {

    constructor() {
        super();

        // gives "illegal invocation" error 
        //this.requestAnimationFrame = (window.requestAnimationFrame || window.mozRequestAnimationFrame ||
        //    window.webkitRequestAnimationFrame || window.msRequestAnimationFrame);
        // this.cancelAnimationFrame = (window.cancelAnimationFrame || window.mozCancelAnimationFrame);

        this.isRunning = true;

        this.tick = this.tick.bind(this);
        this.tick();

        window.onblur = () => {
            this.stop();
        };

        window.onfocus = () => {
            this.start();
        };
    }

    tick() {
        if (this.isRunning) {
            this.emit('tick');
        }
        requestAnimationFrame(this.tick);
    }

    start() {
        this.isRunning = true;
    }

    stop() {
        this.isRunning = false;
    }
}



export const utils = {

    getCanvas(id) {
        const canvas = document.getElementById(id);

        if (!canvas) {
            console.error(`There is no canvas with id ${id} on this page.`);
            return null;
        }
        return canvas;
    },


    stayFullScreen(canvas) {
        const expandFullScreen = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        expandFullScreen();
        // Resize screen when the browser has triggered the resize event
        window.addEventListener('resize', expandFullScreen);
    },


    getGLContext(canvas) {
        const gl = canvas.getContext('webgl2', {
            antialias: false,
            willReadFrequently: true
          });
        console.log('gl context', gl);
        return gl || console.assert(gl && gl instanceof WebGLRenderingContext, "WebGL is NOT available");
    },

    // Given a WebGL context and an id for a shader script, return a compiled shader
    getShader(gl, id) {
        const script = document.getElementById(id);
        if (!script) {
            return null;
        }

        const shaderString = script.text.trim();

        let shader;
        if (script.type === 'x-shader/x-vertex') {
            shader = gl.createShader(gl.VERTEX_SHADER);
        }
        else if (script.type === 'x-shader/x-fragment') {
            shader = gl.createShader(gl.FRAGMENT_SHADER);
        }
        else {
            return null;
        }

        gl.shaderSource(shader, shaderString);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error(gl.getShaderInfoLog(shader));
            return null;
        }

        return shader;
    },

    // Normalize colors from 0-255 to 0-1
    normalizeColor(color) {
        return color.map(c => c / 255);
    },

    // De-normalize colors from 0-1 to 0-255
    denormalizeColor(color) {
        return color.map(c => c * 255);
    }
};


// Program constructor that takes a WebGL context and script tag IDs
// to extract vertex and fragment shader source code from the page
export class Program {

    constructor(gl, vertexShaderId, fragmentShaderId) {
        this.gl = gl;
        this.program = gl.createProgram();

        if (!(vertexShaderId && fragmentShaderId)) {
            return console.error('No shader IDs were provided');
        }

        gl.attachShader(this.program, utils.getShader(gl, vertexShaderId));
        gl.attachShader(this.program, utils.getShader(gl, fragmentShaderId));
        gl.linkProgram(this.program);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            return console.error('Could not initialize shaders.' + gl.getProgramInfoLog(this.program));
        }

        console.log('constructed program status', gl.getProgramParameter(this.program, gl.LINK_STATUS));

        gl.useProgram(this.program);
    }


    useProgram() {
        this.gl.useProgram(this.program);
    }


    load(attributes, uniforms) {
        this.gl.useProgram(this.program);
        this.setAttributeLocations(attributes);
        this.setUniformLocations(uniforms);
    }

    // called from .load(a,u)
    // Set references to attributes onto the program instance
    setAttributeLocations(attributes) {
        attributes.forEach(attribute => {
            this[attribute] = this.gl.getAttribLocation(this.program, attribute);
            // gl.enableVertexAttribArray(attributes[attributeName]); // from webgl prev version
        });
    }

    // called from .load(a,u)
    setUniformLocations(uniforms) {
        uniforms.forEach(uniform => {
            this[uniform] = this.gl.getUniformLocation(this.program, uniform);
            // gl.enableVertexAttribArray(attributes[uniformName]); // from webgl prev version
        });

        this.uniforms = uniforms;
        this.logUniforms();
    }


    getUniform(uniformLocation) {
        return this.gl.getUniform(this.program, uniformLocation);
    }


    logUniforms() {
        const numUniforms = this.gl.getProgramParameter(this.program, this.gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < numUniforms; ++i) {
            const info = this.gl.getActiveUniform(this.program, i);
            let loct = this.gl.getUniformLocation(this.program, info.name);
        }
        this.uniforms.forEach(uniform => {
            console.log('given >>', uniform, this[uniform]);
        });
    }

}



// Encapsulates creating of WebGL textures
export class Textures {

    constructor(gl) {
        this.gl = gl;
        this.textures = [];
        this.glTextures = [];
        console.log('textures constructed', this.gl)
    }

    init( slot, options = {source:null, flip:false, mipmap:false, params:{}}){
        this.textures[slot] = options;
        this.gl.activeTexture(this.gl.TEXTURE0 + slot);
        this.glTextures[slot] = this.gl.createTexture();
        this.video = options.source;
        console.log(this.video);
    // could be onload version where it's needed
    //     this.image = new Image();
    //     this.image.onload = () => this.handleLoadedTexture(slot);

    //     if (options.source) {
    //         this.image.src = source;
    //     }
    // }
    // // Configure texture
    // handleLoadedTexture(slot) {

        this.gl.activeTexture(this.gl.TEXTURE0 + slot);
        // Bind
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.glTextures[slot]);
        // Configure
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, this.video);

        for (const [key, value] of Object.entries(this.textures[slot].params)) {
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl[key], this.gl[value]);
        }

        if (this.textures[slot].mipmap) this.gl.generateMipmap(this.gl.TEXTURE_2D);

        // Clean
        this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    }

    update(slot) {

        if (this.video.readyState < 3) return; // not ready to display pixels
        this.gl.activeTexture(this.gl.TEXTURE0 + slot);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.glTextures[slot]);
        //# next line fails in Safari if input video is NOT from same domain/server as this html code
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGB, this.gl.RGB, this.gl.UNSIGNED_BYTE, this.video);

        // from 3d camera example
        // webgl2 this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.R32F, this.gl.RED, this.gl.FLOAT, this.video);
        // webgl gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, gl.RGBA, gl.FLOAT, video);
    }

}
