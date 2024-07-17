// Encapsulates creating of WebGL textures
export default class Textures {
    constructor(gl, isDepthStream = false) {
        this.gl = gl;
        this.textures = [];
        this.glTextures = [];
        this.update = isDepthStream ? this.updateDepth : this.updateRGB;
    }

    init(
        slot,
        options = {
            source: null,
            flip: false,
            mipmap: false,
            params: {},
        }
    ) {
        this.textures[slot] = options;
        this.gl.activeTexture(this.gl.TEXTURE0 + slot);
        this.glTextures[slot] = this.gl.createTexture();
        this.video = options.source;

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
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.glTextures[slot]);

        Object.entries(this.textures[slot].params).forEach((pair) => {
            this.gl.texParameteri(
                this.gl.TEXTURE_2D,
                this.gl[pair[0]],
                this.gl[pair[1]]
            );
        });

        if (this.textures[slot].mipmap) {
            this.gl.generateMipmap(this.gl.TEXTURE_2D);
        }
        // Clean
        this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    }

    updateRGB(slot) {
        if (this.video.readyState < 3) return; // not ready to display pixels

        this.gl.activeTexture(this.gl.TEXTURE0 + slot);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.glTextures[slot]);
        this.gl.texImage2D(
            this.gl.TEXTURE_2D,
            0,
            this.gl.RGBA32F,
            this.gl.RGBA,
            this.gl.FLOAT,
            this.video
        );
    }

    updateDepth(slot) {
        if (this.video.readyState < 3) return; // not ready to display pixels

        this.gl.activeTexture(this.gl.TEXTURE0 + slot);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.glTextures[slot]);
        this.gl.texImage2D(
            this.gl.TEXTURE_2D,
            0,
            this.gl.R32F,
            this.gl.RED,
            this.gl.FLOAT,
            this.video
        );
    }
}
