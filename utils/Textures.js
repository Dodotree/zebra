// Encapsulates creating of WebGL textures
export default class Textures {
    constructor(gl) {
        this.gl = gl;
        this.textures = [];
        this.glTextures = [];
        // eslint-disable-next-line no-console
        console.log("textures constructed", this.gl);
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
        // eslint-disable-next-line no-console
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
        this.gl.texImage2D(
            this.gl.TEXTURE_2D,
            0,
            this.gl.RGBA,
            this.gl.RGBA,
            this.gl.UNSIGNED_BYTE,
            this.video
        );

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

    update(slot) {
        if (this.video.readyState < 3) return; // not ready to display pixels
        this.gl.activeTexture(this.gl.TEXTURE0 + slot);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.glTextures[slot]);
        // next line fails in Safari if input video is NOT from same domain/server as this html code
        this.gl.texImage2D(
            this.gl.TEXTURE_2D,
            0,
            this.gl.RGB,
            this.gl.RGB,
            this.gl.UNSIGNED_BYTE,
            this.video
        );

        // from 3d camera example
        // webgl2 this.gl.texImage2D(this.gl.TEXTURE_2D, 0,
        // this.gl.R32F, this.gl.RED, this.gl.FLOAT, this.video);
        // webgl gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, gl.RGBA, gl.FLOAT, video);
    }
}
