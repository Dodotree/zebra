// Encapsulates creating of WebGL textures
export default class Texture {
    constructor(
        gl,
        slot,
        config = {
            source: null,
            flip: false,
            mipmap: false,
            params: {},
            width: 1,
            height: 1,
            depth: 1,
            isFloat: false,
            isVideo: false,
        }
    ) {
        this.gl = gl;
        this.slot = slot;
        this.width = config.width;
        this.height = config.height;
        this.depth = config.depth;
        this.isFloat = config.isFloat;
        this.flip = config.flip;
        this.mipmap = config.mipmap;
        this.params = config.params;

        this.glTexture = null;

        this.type = this.isFloat ? this.gl.FLOAT : this.gl.UNSIGNED_BYTE;

        if (this.isFloat) {
            // High-precision floating point format for coordinates
            this.internalFormat = this.gl.RGBA32F;
            this.format = this.gl.RGBA;
        } else if (this.depth === 1 || this.depth === 8) {
            // Single channel formats (grayscale, binary)
            this.internalFormat = this.gl.R8;
            this.format = this.gl.RED;
        } else if (this.depth === 24) {
            // RGB format (3 channels)
            this.internalFormat = this.gl.RGB8;
            this.format = this.gl.RGB;
        } else if (this.depth === 32) {
            // RGBA format (4 channels)
            this.internalFormat = this.gl.RGBA8; // this.gl.RGBA32F, this.gl.FLOAT,
            this.format = this.gl.RGBA;
        } else {
            console.warn(`Unsupported bit depth: ${this.depth}, defaulting to 8-bit grayscale`);
            this.internalFormat = this.gl.R8;
            this.format = this.gl.RED;
        }

        if (config.isVideo) {
            if (!config.source) {
                throw new Error("Video source must be provided for video textures");
            }
            this.source = config.source;
            this.update = this.videoUpdate.bind(this);
        } else {
            this.source = null;
            this.update = this.updatePlain.bind(this);
        }
    }

    init() {
        this.glTexture = this.gl.createTexture();
        this.gl.activeTexture(this.gl.TEXTURE0 + this.slot);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.glTexture);

        Object.entries(this.params).forEach((pair) => {
            this.gl.texParameteri(
                this.gl.TEXTURE_2D,
                this.gl[pair[0]],
                this.gl[pair[1]]
            );
        });

        if (this.flip) {
            this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);
        }
        if (this.mipmap) {
            this.gl.generateMipmap(this.gl.TEXTURE_2D);
        }
        // Clean
        this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    }

    videoUpdate() {
        if (this.source.readyState < 3) return;
        this.updatePlain(this.source);
    }

    updatePlain(source = null) {
        this.gl.activeTexture(this.gl.TEXTURE0 + this.slot);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.glTexture);

        this.gl.texImage2D(
            this.gl.TEXTURE_2D,
            0, // mipmap level
            this.internalFormat, // internal format
            this.width, // width and height are optional if source is an image/video
            this.height, // and already has dimensions
            0, // border (must be 0, always)
            this.format, // format
            this.type, // type
            source
        );
    }

    activate() {
        this.gl.activeTexture(this.gl.TEXTURE0 + this.slot);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.glTexture);
    }

    destroy() {
        if (this.glTexture) {
            this.gl.deleteTexture(this.glTexture);
            this.glTexture = null;
        }
        delete this;
    }
}
