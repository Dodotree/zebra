// TODO: not sure those functions should be here
export const utils = {
    getCanvas(id) {
        const canvas = document.getElementById(id);

        if (!canvas) {
            // eslint-disable-next-line no-console
            console.error(`There is no canvas with id ${id} on this page.`);
            return null;
        }
        return canvas;
    },

    getGLContext(canvas) {
        const gl = canvas.getContext("webgl2", {
            antialias: false,
            willReadFrequently: true,
        });
        // eslint-disable-next-line no-console
        console.log("gl context", gl);

        return (
        // eslint-disable-next-line no-console
            gl || console.assert(
                gl && gl instanceof WebGLRenderingContext,
                "WebGL is NOT available"
            )
        );
    },

    // Given an id for a shader script, return a compiled shader
    getShader(gl, id) {
        const script = document.getElementById(id);
        if (!script) {
            return null;
        }

        const shaderString = script.text.trim();

        let shader;
        if (script.type === "x-shader/x-vertex") {
            shader = gl.createShader(gl.VERTEX_SHADER);
        } else if (script.type === "x-shader/x-fragment") {
            shader = gl.createShader(gl.FRAGMENT_SHADER);
        } else {
            return null;
        }

        gl.shaderSource(shader, shaderString);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            // eslint-disable-next-line no-console
            console.error(gl.getShaderInfoLog(shader));
            return null;
        }

        return shader;
    },

    // Normalize colors from 0-255 to 0-1
    normalizeColor(color) {
        return color.map((c) => c / 255);
    },

    // De-normalize colors from 0-1 to 0-255
    denormalizeColor(color) {
        return color.map((c) => c * 255);
    },
};
