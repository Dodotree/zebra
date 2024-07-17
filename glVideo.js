import Clock from "./utils/Clock.js";
import Program from "./utils/Program.js";
import Textures from "./utils/Textures.js";

// captureButton.addEventListener('click', takeScreenshot);

export default class VideoGL {
    constructor(
        source,
        isDepthStream,
        glCanvasID,
        out2DCanvasID,
        w,
        h
    ) {
        this.w = w;
        this.h = h;

        const vertexShaderId = "shader-vs";
        const fragmentShaderId = isDepthStream ? "depth-fs" : "shader-fs";
        const attrs = ["v"];
        const uniforms = ["s"];

        this.glCanvasID = glCanvasID;
        const canvas = document.getElementById(glCanvasID);
        if (!canvas) {
            throw new Error(`There is no canvas with id ${glCanvasID}`);
        }

        this.gl = canvas.getContext("webgl2", {
            antialias: false,
            willReadFrequently: true,
        });
        if (!(this.gl && this.gl instanceof WebGL2RenderingContext)) {
            throw new Error("WebGL2 is NOT available");
        }

        this.out2DCanvasID = out2DCanvasID;
        this.outCanvas = document.getElementById(out2DCanvasID);
        if (!this.outCanvas) {
            throw new Error(`There is no canvas with id ${out2DCanvasID}`);
        }

        this.context_2d = this.outCanvas.getContext("2d", {
            antialias: false,
            willReadFrequently: true,
        });

        // The extension tells us if we can use single component R32F texture format.
        // Important for FRAMEBUFFER_COMPLETE, makes renderbufferStorage() accept R32F.
        // webgl2:
        this.gl.color_buffer_float_ext = this.gl.getExtension(
            "EXT_color_buffer_float"
        );
        // webgl: gl.getExtension("OES_texture_float");

        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

        this.logger = document.getElementsByTagName("screen-logger")[0];

        try {
            this.program = new Program(this.gl, vertexShaderId, fragmentShaderId);
            this.program.load(attrs, uniforms);
        } catch (e) {
            this.logger.logError(e);
        }

        this.buffers = {};
        try {
            this.clock = new Clock();
            this.textures = new Textures(this.gl, isDepthStream);
        } catch (e) {
            this.logger.logError(e);
        }

        this.readPixels = isDepthStream ? this.readPixelsDepth : this.readPixelsRGB;
        this.pixelsTo2DCanvas = isDepthStream
            ? this.pixelsTo2DCanvasDepth : this.pixelsTo2DCanvasRGB;

        /**
         *       V0              V1
                (0, 0)         (1, 0)
                X-----------------X
                |                 |
                |     (0, 0)      |
                |                 |
                X-----------------X
                (0, 1)         (1, 1)
                V3               V2
         */
        // TODO: check if it's playing (Chrome warnings at start)
        this.init({
            slot: 0,
            textureOptions: {
                source: source,
                flip: false,
                mipmap: false,
                params: {
                    TEXTURE_WRAP_T: "CLAMP_TO_EDGE",
                    TEXTURE_WRAP_S: "CLAMP_TO_EDGE",
                    TEXTURE_MAG_FILTER: "NEAREST",
                    TEXTURE_MIN_FILTER: "NEAREST",
                },
            },
            uniData: { s: 0 },
            bufferData: {
                v: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
                i: new Uint16Array([0, 1, 2, 0, 2, 3]),
            }
        });
    }

    /** * HERE and below I don't use spread operator for parameters because it's slow
     * and whole point of WebGL is speed * */

    /** Boilerplate webGL initialization */
    init(params) {
        this.gl.clearColor(0.0, 0.0, 0.0, 0.0);
        this.gl.clearDepth(1.0);
        this.gl.disable(this.gl.DEPTH_TEST);
        // not sure if it should be here or in a texture class
        if (params.textureOptions.flip) {
            this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);
        }

        try {
            this.textures.init(params.slot, params.textureOptions);
        } catch (e) {
            this.logger.logError(e);
        }

        this.initUniforms(params.uniData);
        this.initBuffers(params.bufferData);
        this.initFramebuffer(params.slot);

        try {
            this.clock.on("tick", this.draw.bind(this));
        } catch (e) {
            this.logger.logError(e);
        }
    }

    initUniforms(uniData) {
        this.gl.uniform1i(this.program.s, uniData.s);
    }

    initBuffers(buffData) {
        // const texCoordBufferData = new Float32Array([]);

        this.buffers = { indices_len: buffData.i.length }; // store data needed for each draw()
        // Create VAO instance
        this.buffers.vertsVAO = this.gl.createVertexArray();
        // Bind it so we can work on it
        this.gl.bindVertexArray(this.buffers.vertsVAO); // repeat this on each draw()

        this.vertsBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertsBuffer);
        this.gl.bufferData(
            this.gl.ARRAY_BUFFER,
            buffData.v,
            this.gl.STATIC_DRAW
        ); // vertices VAO
        // Now we additionally provide instructions for VAO to use data later in draw()
        // benefit: one time on init *instead* of each draw()
        this.gl.enableVertexAttribArray(this.program.v);
        this.gl.vertexAttribPointer(
            this.program.v,
            2,
            this.gl.FLOAT,
            false,
            0,
            0
        );

        // Setting up the IBO
        this.indsBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indsBuffer);
        // here we use indices but only inds.length is needed on each draw()
        this.gl.bufferData(
            this.gl.ELEMENT_ARRAY_BUFFER,
            buffData.i,
            this.gl.STATIC_DRAW
        );

        // Clean
        this.gl.bindVertexArray(null);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null);
    }

    initFramebuffer(slot) {
        // Framebuffer for reading back the texture.
        this.framebuffer = this.gl.createFramebuffer();
        this.readBuffer = null;
        this.readFormat = null;
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
        this.gl.framebufferTexture2D(
            this.gl.FRAMEBUFFER,
            this.gl.COLOR_ATTACHMENT0,
            this.gl.TEXTURE_2D,
            this.textures.glTextures[slot],
            0
        );
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    }

    draw() {
        const slot = 0;

        try {
            this.textures.update(slot);
        } catch (e) {
            this.logger.logError(e);
        }
        this.gl.bindVertexArray(this.buffers.vertsVAO); // repeat this on each draw()
        this.gl.drawElements(
            this.gl.TRIANGLES,
            this.buffers.indices_len,
            this.gl.UNSIGNED_SHORT,
            0
        );

        this.readPixels();
        this.pixelsTo2DCanvas();
    }

    readPixelsRGB() {
        // Bind the framebuffer the texture is color-attached to.
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
        this.readBuffer = new Float32Array(this.w * this.h * 4);

        this.gl.readPixels(
            0,
            0,
            this.w,
            this.h,
            this.gl.RGBA,
            this.gl.FLOAT,
            this.readBuffer
        );
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    }

    readPixelsDepth() {
        // Bind the framebuffer the texture is color-attached to.
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
        this.readBuffer = new Float32Array(this.w * this.h);

        // TODO: sometimes it spams with zeroes, maybe check why
        this.gl.readPixels(
            0,
            0,
            this.w,
            this.h,
            this.gl.RED,
            this.gl.FLOAT,
            this.readBuffer
        );
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    }

    pixelsTo2DCanvasRGB() {
        const img = this.context_2d.getImageData(
            0,
            0,
            this.w,
            this.h
        );
        for (let i = 0, j = 0; i < img.data.length; i += 4, j += 4) {
            // data[i] = this.readBuffer[j] * 255;
            // data[i + 1] = this.readBuffer[j + 1] * 255;
            img.data[i + 2] = this.readBuffer[j + 2] * 255;
            img.data[i + 3] = 255;
        }
        this.context_2d.putImageData(img, 0, 0);
    }

    pixelsTo2DCanvasDepth() {
        const img = this.context_2d.getImageData(
            0,
            0,
            this.w,
            this.h
        );
        for (let i = 0, j = 0; i < img.data.length; i += 4, j += 1) {
            img.data[i] = Math.min(this.readBuffer[j] * 255 * 10, 255);
            img.data[i + 3] = 255;
        }
        this.context_2d.putImageData(img, 0, 0);
    }

    captureImage() {
        // this.context_2d.drawImage(this.video, 0, 0, this.w, this.h);
        const anchor = document.createElement("a");
        anchor.href = this.outCanvas.toDataURL("image/jpeg");

        const ts = new Date()
            .toISOString()
            .substring(0, 19)
            .replaceAll("-", "")
            .replaceAll(":", "");
        anchor.download = `snapshot_${ts}.jpeg`;
        anchor.click();
    }

    destroy() {
        try {
            this.clock.stop();
        } catch (e) {
            this.logger.logError(e);
        }
        this.gl.deleteProgram(this.program.program);
        this.gl.deleteBuffer(this.buffers.vertsBuffer);
        this.gl.deleteBuffer(this.buffers.indsBuffer);
        this.gl.deleteVertexArray(this.buffers.vertsVAO);
        // eslint-disable-next-line no-plusplus
        for (let i = 0; i < this.textures.glTextures.length; i++) {
            this.gl.deleteTexture(this.textures.glTextures[i]);
        }
        if (this.framebuffer) {
            this.gl.deleteFramebuffer(this.framebuffer);
        }

        this.gl = null;
        let delCanvas = document.getElementById(this.glCanvasID);
        if (delCanvas !== null) {
            delCanvas.remove();
        }

        let delCanvas2 = document.getElementById(this.out2DCanvasID);
        if (delCanvas2 !== null) {
            delCanvas2.remove();
        }
        delete this;
    }

    // Normalize colors from 0-255 to 0-1
    // normalizeColor(color) {
    //     return color.map((c) => c / 255);
    // }

    // // De-normalize colors from 0-1 to 0-255
    // denormalizeColor(color) {
    //     return color.map((c) => c * 255);
    // }
}

/**
 * Lense distortion calibration for Intel RealSense cameras.
 */

function depthCameraCalibration(label) {
    let cameraName = label.includes("R200") ? "R200" : null;
    cameraName = label.includes("Camera S") || label.includes("SR300") ? "SR300" : cameraName;

    let distortionModels = {
        NONE: 0,
        MODIFIED_BROWN_CONRADY: 1,
        INVERSE_BROWN_CONRADY: 2,
    };

    let result;

    if (cameraName === "R200") {
        result = {
            depthScale: 0.001,
            depthOffset: new Float32Array([
                233.3975067138671875, 179.2618865966796875,
            ]),
            depthFocalLength: new Float32Array([
                447.320953369140625, 447.320953369140625,
            ]),
            colorOffset: new Float32Array([
                311.841033935546875, 229.7513275146484375,
            ]),
            colorFocalLength: new Float32Array([
                627.9630126953125, 634.02410888671875,
            ]),
            depthToColor: [
                0.99998325109481811523, 0.002231199527159333229,
                0.00533978315070271492, 0, -0.0021383403800427913666,
                0.99984747171401977539, -0.017333013936877250671, 0,
                -0.0053776423446834087372, 0.017321307212114334106,
                0.99983555078506469727, 0, -0.058898702263832092285,
                -0.00020283895719330757856, -0.0001998419174924492836, 1,
            ],
            depthDistortionModel: distortionModels.NONE,
            depthDistortioncoeffs: [0, 0, 0, 0, 0],
            colorDistortionModel: distortionModels.MODIFIED_BROWN_CONRADY,
            colorDistortioncoeffs: [
                -0.078357703983783721924, 0.041351985186338424683,
                -0.00025565386749804019928, 0.0012357287341728806496, 0,
            ],
        };
    } else if (cameraName === "SR300") {
        result = {
            depthScale: 0.0001249866472790017724,
            depthOffset: new Float32Array([
                310.743988037109375, 245.1811676025390625,
            ]),
            depthFocalLength: new Float32Array([
                475.900726318359375, 475.900726318359375,
            ]),
            colorOffset: new Float32Array([
                312.073974609375, 241.969329833984375,
            ]),
            colorFocalLength: new Float32Array([
                617.65087890625, 617.65093994140625,
            ]),
            depthToColor: [
                0.99998641014099121094, -0.0051436689682304859161,
                0.00084982655243948101997, 0, 0.0051483912393450737,
                0.99997079372406005859, -0.005651625804603099823, 0,
                -0.00082073162775486707687, 0.0056559243239462375641,
                0.99998366832733154297, 0, 0.025699997320771217346,
                -0.00073326355777680873871, 0.0039400043897330760956, 1,
            ],
            depthDistortionModel: distortionModels.INVERSE_BROWN_CONRADY,
            depthDistortioncoeffs: [
                0.14655706286430358887, 0.078352205455303192139,
                0.0026113723870366811752, 0.0029218809213489294052,
                0.066788062453269958496,
            ],
            colorDistortionModel: distortionModels.NONE,
            colorDistortioncoeffs: [0, 0, 0, 0, 0],
        };
    } else {
        throw new Error("Sorry, your camera '" + cameraName + "' is not supported");
    }
    // This also de-normalizes the depth value (it's originally a 16-bit
    // integer normalized into a float between 0 and 1).
    result.depthScale *= 65535;
    return result;
}
