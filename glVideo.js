import { utils, Clock, Program, Textures } from './gl_utils.js';

// captureButton.addEventListener('click', takeScreenshot);



export class glVideo {

  constructor(canvasId, vertexShaderId, fragmentShaderId, attrs, uniforms) {
    const canvas = document.getElementById(canvasId);
    this.canvasId = canvasId;
    this.gl = utils.getGLContext(canvas);

    // Depth: The extension tells us if we can use single component R32F texture format.
    // webgl2 
    this.gl.color_buffer_float_ext = this.gl.getExtension('EXT_color_buffer_float');
    // webgl gl.getExtension("OES_texture_float");
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

    this.program = new Program(this.gl, vertexShaderId, fragmentShaderId);
    this.program.load(attrs, uniforms);

    this.buffers = {};
    this.clock = new Clock();
    this.textures = new Textures(this.gl);
  }

  /*** HERE and below I don't use spread operator for parameters because it's slow
   * and whole point of WebGL is speed ***/


  /** Boilerplate webGL initialization */
  init(slot, texture_options, uni_data, buffer_data) {
    this.gl.clearColor(0.0, 0.0, 0.0, 0.0);
    this.gl.clearDepth(1.0);
    this.gl.disable(this.gl.DEPTH_TEST);
    // not sure if it should be here or in a texture class
    if (texture_options.flip) {
      this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);
    }

    this.textures.init(slot, texture_options);
    this.initUniforms(uni_data);
    this.initBuffers(buffer_data);
    //this.initFramebuffer(slot);

    this.clock.on('tick', this.draw.bind(this));
  }

  initUniforms(uni_data) {
    this.gl.uniform1i(this.program.s, uni_data.s);
  }

  initBuffers(buff_data) {
    //const texCoordBufferData = new Float32Array([]);

    this.buffers = { indices_len: buff_data.i.length }; // store data needed for each draw()
    // Create VAO instance
    this.buffers.vertsVAO = this.gl.createVertexArray();
    // Bind it so we can work on it
    this.gl.bindVertexArray(this.buffers.vertsVAO); // repeat this on each draw()

    this.vertsBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertsBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, buff_data.v, this.gl.STATIC_DRAW); // vertices VAO
    // Now we additionally provide instructions for VAO to use data later in draw()
    // benefit: one time on init *instead* of each draw()
    this.gl.enableVertexAttribArray(this.program.v);
    this.gl.vertexAttribPointer(this.program.v, 2, this.gl.FLOAT, false, 0, 0);

    // Setting up the IBO
    this.indsBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indsBuffer);
    // here we use indices but only inds.length is needed on each draw()
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, buff_data.i, this.gl.STATIC_DRAW);

    // Clean
    this.gl.bindVertexArray(null);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null);
  }

  initFramebuffer(slot) {
    // Framebuffer for reading back the texture.
    this.framebuffer = this.gl.createFramebuffer();
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
    this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, this.textures.glTextures[slot], 0);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
  }

  draw() {

    const slot = 0;

    this.textures.update(slot);
    this.gl.bindVertexArray(this.buffers.vertsVAO); // repeat this on each draw()
    this.gl.drawElements(this.gl.TRIANGLES, this.buffers.indices_len, this.gl.UNSIGNED_SHORT, 0);

    // Read it back to buffer from framebuffer.
    // readPixels();

    // TODO: process pixels.
    // Put read and processed pixels to 2D canvas.
    // Note: This is just one of scenarios for the demo. You can directly
    // bind video to 2D canvas without using WebGL as intermediate step.
    // putReadPixelsTo2DCanvas();
  }

  readPixels() {
    // Bind the framebuffer the texture is color-attached to.
    gl.bindFramebuffer(gl.FRAMEBUFFER, gl.framebuffer);

    if (!read_buffer) {
      read_format = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT);
      if (read_format == gl.RED && gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE) == gl.FLOAT) {
        read_buffer = new Float32Array(video.width * video.height);
      } else {
        read_format = gl.RGBA;
        read_buffer = new Float32Array(video.width * video.height * 4);
      }
    }
    gl.readPixels(0, 0, video.width, video.height, read_format, gl.FLOAT, read_buffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  putReadPixelsTo2DCanvas() {
    var img = context_2d.getImageData(0, 0, video.width, video.height);
    var data = img.data;
    var stride = (read_format === gl.RED) ? 1 : 4;
    var j = 0;
    for (var i = 0; i < data.length; i += 4, j += stride) {
      data[i] = read_buffer[j] * 255;
      data[i + 3] = 255;
    }
    context_2d.putImageData(img, 0, 0);
  }

  destroy() {
    this.clock.stop();
    this.gl.deleteProgram(this.program.program);
    this.gl.deleteBuffer(this.buffers.vertsBuffer);
    this.gl.deleteBuffer(this.buffers.indsBuffer);
    this.gl.deleteVertexArray(this.buffers.vertsVAO);
    for (let i = 0; i < this.textures.glTextures.length; i++) {
      this.gl.deleteTexture(this.textures.glTextures[i]);
    }
    if (this.framebuffer) {
      this.gl.deleteFramebuffer(this.framebuffer);
    }

    this.gl = null;
    let delCanvas = document.getElementById(this.canvasId);
    if (delCanvas !== null) {
      delCanvas.remove();
    }
  }
}





// const glV = new glVideo('vCanvas', 'shader-vs', 'shader-fs', ['aVertexPosition'], ['someVal', 'uSampler']);

// glV.initBuffers(new Float32Array([
//     -1.0, -1.0,
//     1.0, -1.0,
//     1.0, 1.0,
//     -1.0, 1.0,
// ]), new Uint16Array([0, 1, 2, 0, 2, 3,]));





/**
 * Lense distortion calibration for Intel RealSense cameras.
 */

const depthCameraCalibration = function (depth_stream) {
  const label = depth_stream.getVideoTracks()[0].label;
  const cameraName = label.includes("R200") ? "R200"
    : (label.includes("Camera S") || label.includes("SR300")) ? "SR300"
      : label;

  var distortionModels = {
    NONE: 0,
    MODIFIED_BROWN_CONRADY: 1,
    INVERSE_BROWN_CONRADY: 2,
  };

  var result;

  if (cameraName === "R200") {
    result = {
      depthScale: 0.001,
      depthOffset: new Float32Array(
        [233.3975067138671875, 179.2618865966796875]
      ),
      depthFocalLength: new Float32Array(
        [447.320953369140625, 447.320953369140625]
      ),
      colorOffset: new Float32Array(
        [311.841033935546875, 229.7513275146484375]
      ),
      colorFocalLength: new Float32Array(
        [627.9630126953125, 634.02410888671875]
      ),
      depthToColor: [
        0.99998325109481811523, 0.002231199527159333229, 0.00533978315070271492, 0,
        -0.0021383403800427913666, 0.99984747171401977539, -0.017333013936877250671, 0,
        -0.0053776423446834087372, 0.017321307212114334106, 0.99983555078506469727, 0,
        -0.058898702263832092285, -0.00020283895719330757856, -0.0001998419174924492836, 1
      ],
      depthDistortionModel: distortionModels.NONE,
      depthDistortioncoeffs: [0, 0, 0, 0, 0],
      colorDistortionModel: distortionModels.MODIFIED_BROWN_CONRADY,
      colorDistortioncoeffs: [
        -0.078357703983783721924,
        0.041351985186338424683,
        -0.00025565386749804019928,
        0.0012357287341728806496,
        0
      ],
    };
  } else if (cameraName === "SR300") {
    result = {
      depthScale: 0.0001249866472790017724,
      depthOffset: new Float32Array(
        [310.743988037109375, 245.1811676025390625]
      ),
      depthFocalLength: new Float32Array(
        [475.900726318359375, 475.900726318359375]
      ),
      colorOffset: new Float32Array(
        [312.073974609375, 241.969329833984375]
      ),
      colorFocalLength: new Float32Array(
        [617.65087890625, 617.65093994140625]
      ),
      depthToColor: [
        0.99998641014099121094, -0.0051436689682304859161, 0.00084982655243948101997, 0,
        0.0051483912393450737, 0.99997079372406005859, -0.005651625804603099823, 0,
        -0.00082073162775486707687, 0.0056559243239462375641, 0.99998366832733154297, 0,
        0.025699997320771217346, -0.00073326355777680873871, 0.0039400043897330760956, 1
      ],
      depthDistortionModel: distortionModels.INVERSE_BROWN_CONRADY,
      depthDistortioncoeffs: [
        0.14655706286430358887,
        0.078352205455303192139,
        0.0026113723870366811752,
        0.0029218809213489294052,
        0.066788062453269958496,
      ],
      colorDistortionModel: distortionModels.NONE,
      colorDistortioncoeffs: [0, 0, 0, 0, 0],
    };
  } else {
    throw {
      name: "CameraNotSupported",
      message: "Sorry, your camera '" + cameraName + "' is not supported",
    };
  }
  // This also de-normalizes the depth value (it's originally a 16-bit
  // integer normalized into a float between 0 and 1).
  result.depthScale = result.depthScale * 65535;
  return result;
}