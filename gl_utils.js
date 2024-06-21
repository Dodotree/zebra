'use strict';

// Abstracts away the requestAnimationFrame in an effort to provide a clock instance
// to sync various parts of an application
class Clock extends EventEmitter {

    constructor() {
        super();

        this.requestAnimationFrame = (window.requestAnimationFrame || window.mozRequestAnimationFrame ||
            window.webkitRequestAnimationFrame || window.msRequestAnimationFrame);
        this.cancelAnimationFrame = (window.cancelAnimationFrame || window.mozCancelAnimationFrame);

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
        this.requestAnimationFrame(this.tick);
    }

    start() {
        this.isRunning = true;
    }

    stop() {
        this.isRunning = false;
    }
}



const utils = {

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
        const gl = canvas.getContext('webgl2');
        return gl || console.assert(gl && gl instanceof WebGLRenderingContext, "WebGL is NOT available");

        // Depth: The extension tells us if we can use single component R32F texture format.
        // webgl2 gl.color_buffer_float_ext = gl.getExtension('EXT_color_buffer_float');
        // webgl gl.getExtension("OES_texture_float");
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
class Program {

    constructor(gl, vertexShaderId, fragmentShaderId) {
        this.gl = gl;
        this.program = gl.createProgram();

        if (!(vertexShaderId && fragmentShaderId)) {
            return console.error('No shader IDs were provided');
        }

        gl.attachShader(this.program, utils.getShader(gl, vertexShaderId));
        gl.attachShader(this.program, utils.getShader(gl, fragmentShaderId));
        gl.linkProgram(this.program);

        if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
            return console.error('Could not initialize shaders.');
        }

        console.log('constructed program status', this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS));

        this.gl.useProgram(this.program);
    }


    useProgram() {
        this.gl.useProgram(this.program);
    }


    load(attributes, uniforms) {
        this.gl.useProgram(this.program);
        this.setAttributeLocations(attributes);
        this.setUniformLocations(uniforms);
    }


    // Set references to attributes onto the program instance
    setAttributeLocations(attributes) {
        attributes.forEach(attribute => {
            this[attribute] = this.gl.getAttribLocation(this.program, attribute);
        });
    }


    setUniformLocations(uniforms) {
        uniforms.forEach(uniform => {
            console.log(uniform);
            this[uniform] = this.gl.getUniformLocation(this.program, uniform);
            console.log(this[uniform]);
        });

        this.uniforms = uniforms;
        console.log('set uniforms', uniforms);
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
            console.log('XX >> name:', info.name, 'type:', info.type, 'size:', info.size);
            console.log('XX val>>', this.gl.getUniform(this.program, loct));
        }
        this.uniforms.forEach(uniform => {
            console.log('given >>', uniform, this[uniform]);
        });
    }

}