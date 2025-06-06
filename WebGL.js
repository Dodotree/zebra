import Clock from "./utils/Clock.js";
import Program from "./utils/Program.js";
import Texture from "./utils/Texture.js";

export class ProcessingWEBGL {
    constructor(
        id,
        depth,
        width,
        height,
        pixelRatio = 1,
        source = null,
        watch = false,
        logger = console,
        packW = Math.ceil(width / 8),
        packH = Math.ceil(height / 4),
        maskW = Math.ceil(width / 8),
        maskH = Math.ceil(height / 16),
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
        texPosition = new Float32Array([
            0, 0, // bottom-left
            1, 0, // bottom-right
            0, 1, // top-left
            1, 1, // top-right
        ]),
        texIndices = new Uint16Array([0, 1, 2, 2, 1, 3]), // indices of triangle corners
        programs = [
            { // 0 - packing from texture 0 to texture 1
                vertexShaderId: "shader-vs",
                fragmentShaderId: "packing-fs",
                attrs: {
                    a_position: texPosition
                },
                vaoIndices: texIndices,
                uniforms: {
                    u_texture: 0
                }
            },
            { // 1 - unpacking from texture 1 to texture 3
                vertexShaderId: "shader-vs",
                fragmentShaderId: "unpacking-fs",
                attrs: {
                    a_position: texPosition
                },
                vaoIndices: texIndices,
                uniforms: {
                    p_texture: 5
                }
            },
            { // 2 - comparison
                vertexShaderId: "shader-vs",
                fragmentShaderId: "comparison-fs",
                attrs: {
                    a_position: texPosition
                },
                vaoIndices: texIndices,
                uniforms: {
                    src_texture: 1,
                    p_texture: 5,
                    u_threshold: 0.01
                }
            },
            { // 3 - copy from texture 3 to canvas
                vertexShaderId: "shader-vs",
                fragmentShaderId: "copy-fs",
                attrs: {
                    a_position: texPosition
                },
                vaoIndices: texIndices,
                uniforms: {
                    up_texture: 3
                }
            },
            { // 4 - dilation
                vertexShaderId: "shader-vs",
                fragmentShaderId: "dilation-fs",
                attrs: {
                    a_position: texPosition
                },
                vaoIndices: texIndices,
                uniforms: {
                    p_texture: 1
                }
            }
        ],
        textureOptions = [
            { // 0 - original image/video
                source,
                isVideo: true,
                flip: true,
                mipmap: false,
                width,
                height,
                depth,
                params: {
                    TEXTURE_WRAP_T: "CLAMP_TO_EDGE",
                    TEXTURE_WRAP_S: "CLAMP_TO_EDGE",
                    TEXTURE_MAG_FILTER: "NEAREST",
                    TEXTURE_MIN_FILTER: "NEAREST",
                }
            },
            { // 1 - packed texture
                source: null,
                flip: false,
                mipmap: false,
                width: packW,
                height: packH,
                depth,
                params: {
                    TEXTURE_WRAP_T: "REPEAT",
                    TEXTURE_WRAP_S: "REPEAT",
                    TEXTURE_MAG_FILTER: "NEAREST",
                    TEXTURE_MIN_FILTER: "NEAREST",
                }
            },
            // Without proper filtering parameters,
            // textures can be considered "incomplete" for framebuffer use
            // The framebuffer might still report as complete, but the rendering won't work
            // This is especially common when the default min filter expects mipmaps
            // that don't exist
            { // 2 - debugging framebuffer attachment
                source: null,
                flip: false,
                mipmap: false,
                width: packW,
                height: packH,
                depth,
                isFloat: true, // use RGBA32F for coordinates
                params: {
                    TEXTURE_MAG_FILTER: "NEAREST",
                    TEXTURE_MIN_FILTER: "NEAREST",
                }
            },
            { // 3 - unpacked texture
                source: null,
                flip: true,
                mipmap: false,
                width,
                height,
                depth,
                params: {
                    TEXTURE_MAG_FILTER: "NEAREST",
                    TEXTURE_MIN_FILTER: "NEAREST",
                }
            },
            { // 4 - occlusion framebuffer attachment for texture comparison
                source: null,
                flip: false,
                mipmap: false,
                width,
                height,
                depth,
                params: {
                    TEXTURE_MAG_FILTER: "NEAREST",
                    TEXTURE_MIN_FILTER: "NEAREST",
                }
            },
            { // 5 - dilation
                source: null,
                flip: false,
                mipmap: false,
                width: packW,
                height: packH,
                depth,
                params: {
                    TEXTURE_WRAP_T: "REPEAT",
                    TEXTURE_WRAP_S: "REPEAT",
                    TEXTURE_MAG_FILTER: "NEAREST",
                    TEXTURE_MIN_FILTER: "NEAREST",
                }
            },
            { // 6 - fg mask, 8x16 tile to pixel
                source: null,
                flip: false,
                mipmap: false,
                width: maskW,
                height: maskH,
                depth,
                params: {
                    TEXTURE_WRAP_T: "REPEAT",
                    TEXTURE_WRAP_S: "REPEAT",
                    TEXTURE_MAG_FILTER: "NEAREST",
                    TEXTURE_MIN_FILTER: "NEAREST",
                }
            }
        ],
        framebuffers = {
            packing: [
                { attachmentSlot: 0, textureSlot: 1 },
                { attachmentSlot: 1, textureSlot: 2 }, // coordinates
            ],
            unpacking: [
                { attachmentSlot: 0, textureSlot: 3 }
            ],
            occlusion: [
                { attachmentSlot: 0, textureSlot: 4 }
            ],
            dilation: [
                { attachmentSlot: 0, textureSlot: 5 }
            ],
            fgMask: [
                { attachmentSlot: 0, textureSlot: 6 }
            ]
        }
    ) {
        this.id = id; // only for destroy()
        this.w = width;
        this.h = height;
        this.packW = packW;
        this.packH = packH;
        this.logger = logger;
        this.fbConfigs = framebuffers;

        this.progs = [];
        this.textures = [];
        this.buffers = [];
        this.framebuffers = {};

        // Create canvas and get WebGL2 context
        const canvas = document.createElement("canvas");
        canvas.setAttribute("id", "webGLCanvas" + id);
        canvas.setAttribute(
            "style",
            `width: ${width / pixelRatio}px; height: ${height / pixelRatio}px;`
        );
        canvas.width = width;
        canvas.height = height;
        this.gl = canvas.getContext("webgl2", {
            antialias: false,
            willReadFrequently: true,
        });

        if (!(this.gl && this.gl instanceof WebGL2RenderingContext)) {
            throw new Error("WebGL.js: WebGL2 is NOT available");
        }

        this.gl.viewport(0, 0, width, height);

        for (let i = 0; i < programs.length; i++) {
            let p = programs[i];
            try {
                this.progs[i] = new Program(this.gl, p.vertexShaderId, p.fragmentShaderId);
                this.progs[i].load(Object.keys(p.attrs), Object.keys(p.uniforms));
            } catch (e) {
                throw new Error(e);
            }
        }

        for (let slot = 0; slot < textureOptions.length; slot++) {
            let tx = textureOptions[slot];
            try {
                this.textures[slot] = new Texture(this.gl, slot, tx);
            } catch (e) {
                throw new Error(e);
            }
        }

        // The extension tells us if we can use single component R32F texture format.
        // Important for FRAMEBUFFER_COMPLETE, makes renderbufferStorage() accept R32F.
        // Needed if we need to save position vectors for example. WebGL2:
        this.gl.color_buffer_float_ext = this.gl.getExtension(
            "EXT_color_buffer_float"
        );
        this.gl.clearColor(0.0, 0.0, 0.0, 0.0);
        this.gl.clearDepth(1.0);
        this.gl.disable(this.gl.DEPTH_TEST);

        for (let slot = 0; slot < this.textures.length; slot++) {
            try {
                this.textures[slot].init();
            } catch (e) {
                throw new Error(e);
            }
        }
        for (let progSlot = 0; progSlot < this.progs.length; progSlot++) {
            this.initUniforms(progSlot, programs[progSlot].uniforms);
            this.initBuffers(progSlot, programs[progSlot]);
        }
        Object.keys(framebuffers).forEach(fbName => {
            this.initFramebuffer(fbName);
        });

        // plain 2D canvas for debugging framebuffer
        const debugCanvas = document.createElement("canvas");
        debugCanvas.setAttribute("id", "outCanvas" + id);
        debugCanvas.setAttribute(
            "style",
            `width: ${width / pixelRatio}px; height: ${height / pixelRatio}px;`
        );
        debugCanvas.width = width;
        debugCanvas.height = height;
        this.ctx_debug = debugCanvas.getContext("2d", {
            antialias: false,
            willReadFrequently: true,
        });
        const isMono = depth === 1 || depth === 8;
        this.readPixels = isMono ? this.readPixelsDepth : this.readPixelsRGB;
        this.pixelsTo2DCanvas = isMono
            ? this.pixelsTo2DCanvasDepth : this.pixelsTo2DCanvasRGB;

        if (watch && source) {
            try {
                this.clock = new Clock();
            } catch (e) {
                this.logger.error(e);
            }

            source.parentNode.insertBefore(canvas, source);
            source.parentNode.insertBefore(debugCanvas, source);
        } else {
            document.body.appendChild(canvas);
            document.body.appendChild(debugCanvas);
        }

        this.mainProcess = this.mainProcess.bind(this);
        this.unpack = this.unpack.bind(this);
        this.processAndDraw = this.processAndDraw.bind(this);

        if (watch && source) {
            this.clock.on("tick", this.processAndDraw);
        }
    }

    initUniforms(progSlot, uniValues) {
        this.progs[progSlot].useProgram();
        Object.keys(uniValues).forEach(uniName =>{
            const uVal = uniValues[uniName];
            if (Array.isArray(uVal) && uVal.length === 2) {
                this.gl.uniform2fv(this.progs[progSlot][uniName], uVal);
            } else if (Number.isInteger(uVal)) {
                this.gl.uniform1i(this.progs[progSlot][uniName], uVal);
            } else {
                this.gl.uniform1f(this.progs[progSlot][uniName], uVal);
            }
        });
    }

    initBuffers(progSlot, buffData) {
        this.buffers[progSlot] = {
            indices_len: buffData.vaoIndices.length, // store data needed for each draw()
            vertsVAO: this.gl.createVertexArray() // Create VAO instance
        };

        // Bind it so we can work on it
        this.gl.bindVertexArray(this.buffers[progSlot].vertsVAO); // repeat this on each draw()

        Object.keys(buffData.attrs).forEach(attrName => {
            const buff = this.gl.createBuffer();
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buff);
            this.gl.bufferData(
                this.gl.ARRAY_BUFFER,
                buffData.attrs[attrName], // data
                this.gl.STATIC_DRAW
            );
            // vertices VAO
            // Now we additionally provide instructions for VAO to use data later in draw()
            // benefit: one time on init *instead* of each draw()
            this.gl.enableVertexAttribArray(this.progs[progSlot][attrName]);
            this.gl.vertexAttribPointer(
                this.progs[progSlot][attrName], // location
                2, // size
                this.gl.FLOAT,
                false,
                0,
                0
            );
        });
        // Setting up the IBO
        const indsBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indsBuffer);
        // here we set indices: only inds.length is needed on each draw()
        this.gl.bufferData(
            this.gl.ELEMENT_ARRAY_BUFFER,
            buffData.vaoIndices,
            this.gl.STATIC_DRAW
        );

        // Clean
        this.gl.bindVertexArray(null);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null);
    }

    initFramebuffer(fbName) {
        let attachments = this.fbConfigs[fbName];
        console.log("initFramebuffer", fbName, attachments);

        this.framebuffers[fbName] = this.gl.createFramebuffer();
        console.log("Created framebuffer", this.framebuffers[fbName]);
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffers[fbName]);

        attachments.forEach(attachment => {
            this.textures[attachment.textureSlot].update(null); // create empty texture
            this.gl.framebufferTexture2D(
                this.gl.FRAMEBUFFER,
                this.gl.COLOR_ATTACHMENT0 + attachment.attachmentSlot,
                this.gl.TEXTURE_2D,
                this.textures[attachment.textureSlot].glTexture,
                0
            );
        });

        this.checkFramebufferStatus(fbName);

        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
        this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    }

    checkFramebufferStatus(fbName) {
        const status = this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER);
        if (status !== this.gl.FRAMEBUFFER_COMPLETE) {
            const statusMap = {
                36054: "FRAMEBUFFER_INCOMPLETE_ATTACHMENT",
                36055: "FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT",
                36056: "FRAMEBUFFER_INCOMPLETE_DIMENSIONS",
                36057: "FRAMEBUFFER_UNSUPPORTED",
                36061: "FRAMEBUFFER_INCOMPLETE_MULTISAMPLE"
            };
            throw new Error(
                `Framebuffer ${fbName} incomplete: ${status}. Error: ${statusMap[status] || "Unknown error"}`
            );
        } else {
            console.log(`Framebuffer ${fbName} is complete!`);
        }
    }

    initRenderbuffer(width, height) {
        this.renderbuffer = this.gl.createRenderbuffer();
        this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, this.renderbuffer);
        this.gl.renderbufferStorage(this.gl.RENDERBUFFER, this.gl.DEPTH_COMPONENT16, width, height);
    }

    draw(conf = { progSlot: 0 }) {
        this.gl.bindVertexArray(this.buffers[conf.progSlot].vertsVAO); // repeat this on each draw()
        this.gl.drawElements(
            this.gl.TRIANGLES,
            this.buffers[conf.progSlot].indices_len,
            this.gl.UNSIGNED_SHORT,
            0
        );
    }

    drawToFB(conf = {
        fbId: "packing",
        progSlot: 0,
        w: this.packW,
        h: this.packH,
        debug: false
    }) {
        this.progs[conf.progSlot].useProgram();
        // Adjust viewport for packed size
        this.gl.viewport(0, 0, conf.w, conf.h);
        // Bind the framebuffer to render into texture 1
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffers[conf.fbId]);

        if (conf.debug) {
            this.checkFramebufferStatus(conf.fbId);
        }

        // don't forget to set attachment slot 1 in config if you want to debug coordinates
        let attachments = this.fbConfigs[conf.fbId]
            .map(fb => this.gl.COLOR_ATTACHMENT0 + fb.attachmentSlot);
        this.gl.drawBuffers(attachments);
        this.draw(conf);
        if (conf.debug) {
            this.framebufferReads();
        }
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    }

    processAndDraw(pixelData = null) {
        if (this.isProcessing) return;

        try {
            this.isProcessing = true;
            this.textures[0].update(pixelData);
        } catch (e) {
            throw new Error(e);
        }

        this.drawToFB({ // draws to tex 1 and 2
            fbId: "packing",
            progSlot: 0,
            w: this.packW,
            h: this.packH,
            debug: false
        });

        this.maxCount = 1;
        this.count = 0;
        // this.query = this.gl.createQuery();
        // this.queryInProgress = false;

        this.mainProcess();
    }

    /** Documentation: "A query's result may or may not be made available
   * when control returns to the user agent's event loop.
   * It is not guaranteed that using a single setTimeout callback with a delay of 0,
   * or a single requestAnimationFrame callback, will allow sufficient time
   * for the WebGL implementation to supply the query's results".
   *
   * So instead of keeping it in a single while loop you have to break it into separate function
   * with requestAnimationFrame to allow it register "return to the user agent's event loop"
   * and thus allow to process the query. If you don't need the query to know where to stop,
   * or if you can approximate it to ~ 5-6 frames, just use a single loop and avoid the query. */
    mainProcess() {
        // console.log(`Processing iteration ${this.count}`);

        // // It's most likely will be from about 2-6 frames before.
        // if (this.queryInProgress
        //     && this.gl.getQueryParameter(this.query, this.gl.QUERY_RESULT_AVAILABLE)) {
        //     const anyDifferent = this.gl.getQueryParameter(this.query, this.gl.QUERY_RESULT);
        //     console.log(`Count ${this.count}, changes detected: ${anyDifferent}`);
        //     this.queryInProgress = false;
        //     if (!anyDifferent || this.count >= this.maxCount) {
        //         console.log("No changes detected, unpacking...");
        //         this.unpack();
        //         return;
        //     }
        // }

        this.textures[1].activate();

        this.drawToFB({ // draws to tex 5
            fbId: "dilation",
            progSlot: 4,
            w: this.packW,
            h: this.packH,
            debug: false
        });

        this.textures[5].activate();

        // this.drawToFB({ // draws to tex 1
        //     fbId: "processing2",
        //     progSlot: 5,
        //     w: this.packW,
        //     h: this.packH,
        //     debug: false
        // });

        // this.drawToFB({ // draws to tex 5
        //     fbId: "processing",
        //     progSlot: 6,
        //     w: this.packW,
        //     h: this.packH,
        //     debug: false
        // });

        // this.drawToFB({ // draws to tex 1
        //     fbId: "processing2",
        //     progSlot: 7,
        //     w: this.packW,
        //     h: this.packH,
        //     debug: false
        // });

        // if (!this.queryInProgress) {
        //     this.gl.beginQuery(this.gl.ANY_SAMPLES_PASSED_CONSERVATIVE, this.query);
        //     this.drawToFB({
        //         fbId: "occlusion",
        //         progSlot: 2,
        //         w: this.packW,
        //         h: this.packH,
        //         debug: false
        //     });
        //     this.gl.endQuery(this.gl.ANY_SAMPLES_PASSED_CONSERVATIVE);
        //     this.queryInProgress = true;
        // }

        this.count++;

        if (this.count < this.maxCount) {
            requestAnimationFrame(this.mainProcess);
        } else {
            // console.log("Max count reached, unpacking...");
            this.unpack();
        }
    }

    unpack() {
        this.drawToFB({ // draws to tex 3
            fbId: "unpacking",
            progSlot: 1,
            w: this.w,
            h: this.h,
            debug: false
        });

        this.textures[3].activate();

        this.progs[3].useProgram(); // copies unpacked texture to canvas
        this.gl.viewport(0, 0, this.w, this.h);
        this.draw({ progSlot: 3 });
        this.isProcessing = false;
    }

    framebufferReads() {
        const readBuffer = new Uint8Array(this.packW * this.packH * 4);
        this.gl.readBuffer(this.gl.COLOR_ATTACHMENT0);
        this.gl.readPixels(
            0,
            0,
            this.packW,
            this.packH,
            this.gl.RGBA,
            this.gl.UNSIGNED_BYTE,
            readBuffer
        );
        const coordBuffer = new Float32Array(this.packW * this.packH * 4);
        this.gl.readBuffer(this.gl.COLOR_ATTACHMENT1);
        this.gl.readPixels(
            0,
            0,
            this.packW,
            this.packH,
            this.gl.RGBA,
            this.gl.FLOAT,
            coordBuffer
        );

        console.log("readBuffer", readBuffer);
        console.log("coordBuffer", coordBuffer);
        for (let i = 0; i < readBuffer.length; i += 4) {
            console.log(
                (coordBuffer[i] - 0.5).toString().padStart(3) + ", "
          + (coordBuffer[i + 1] - 0.5).toString().padStart(3) + " | "
          + readBuffer[i].toString().padStart(3) + ", "
          + readBuffer[i + 1].toString().padStart(3) + ", "
          + readBuffer[i + 2].toString().padStart(3)
            );
        }
    }

    destroy() {
        this.logger.log("Destroying webGL");

        try {
            if (this.clock) {
                this.clock.stop();
                this.clock.remove(this.processAndDraw);
                this.clock = null;
            }
        } catch (e) {
            this.logger.error(e);
        }

        for (let slot = 0; slot < this.textures.length; slot++) {
            try {
                this.textures[slot].destroy();
            } catch (e) {
                throw new Error(e);
            }
        }
        for (let progSlot = 0; progSlot < this.progs.length; progSlot++) {
            this.progs[progSlot].destroy();
            this.gl.deleteVertexArray(this.buffers[progSlot].vertsVAO);
        }
        Object.values(this.framebuffers).forEach(fb => {
            this.gl.deleteFramebuffer(fb);
        });

        this.gl = null;

        let delCanvas = document.getElementById("webGLCanvas" + this.id);
        if (delCanvas !== null) {
            delCanvas.remove();
        }

        let delCanvas2 = document.getElementById("outCanvas" + this.id);
        if (delCanvas2 !== null) {
            delCanvas2.remove();
        }
        delete this;
    }
}
