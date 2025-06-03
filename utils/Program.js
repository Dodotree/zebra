// Program constructor that takes a WebGL context and script tag IDs
// to extract vertex and fragment shader source code from the page
export default class Program {
    constructor(gl, vertexShaderId, fragmentShaderId) {
        this.gl = gl;
        this.program = gl.createProgram();

        if (!(vertexShaderId && fragmentShaderId)) {
            throw new Error("No shader IDs were provided");
        }

        gl.attachShader(this.program, this.getShader(vertexShaderId));
        gl.attachShader(this.program, this.getShader(fragmentShaderId));
        gl.linkProgram(this.program);
        // gl.validateProgram(this.program);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            throw new Error("Could not initialize shaders." + gl.getProgramInfoLog(this.program));
        }

        // eslint-disable-next-line no-console
        console.log(
            "constructed program status",
            gl.getProgramParameter(this.program, gl.LINK_STATUS)
        );

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
        attributes.forEach((attribute) => {
            this[attribute] = this.gl.getAttribLocation(
                this.program,
                attribute
            );
            // gl.enableVertexAttribArray(attributes[attributeName]); // from webgl prev version
        });
    }

    // called from .load(a,u)
    setUniformLocations(uniforms) {
        uniforms.forEach((uniform) => {
            this[uniform] = this.gl.getUniformLocation(this.program, uniform);
            // gl.enableVertexAttribArray(attributes[uniformName]); // from webgl prev version
        });

        this.logUniforms(uniforms);
    }

    getUniform(uniformLocation) {
        return this.gl.getUniform(this.program, uniformLocation);
    }

    // log uniform addresses
    logUniforms(uniforms) {
        // const numUniforms = this.gl.getProgramParameter(this.program, this.gl.ACTIVE_UNIFORMS);
        // for (let i = 0; i < numUniforms; ++i) {
        //     const info = this.gl.getActiveUniform(this.program, i);
        //     let uniformsLocation = this.gl.getUniformLocation(this.program, info.name);
        // }
        uniforms.forEach((uniform) => {
            // eslint-disable-next-line no-console
            console.log("uniforms given", uniform, this[uniform]);
        });
    }

    // Given an id for a shader script, return a compiled shader
    getShader(id) {
        const script = document.getElementById(id);
        if (!script) {
            return null;
        }

        const shaderString = script.text.trim();

        let shader;
        if (script.type === "x-shader/x-vertex") {
            shader = this.gl.createShader(this.gl.VERTEX_SHADER);
        } else if (script.type === "x-shader/x-fragment") {
            shader = this.gl.createShader(this.gl.FRAGMENT_SHADER);
        } else {
            return null;
        }

        this.gl.shaderSource(shader, shaderString);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            throw new Error(`Problem compiling shader with id ${id}`, this.gl.getShaderInfoLog(shader));
        }

        return shader;
    }

    destroy() {
        if (this.program) {
            this.gl.deleteProgram(this.program);
            this.program = null;
        }
    }
}
