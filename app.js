
const glcanvas = document.getElementById('myCanvas');
const gl = glcanvas.getContext("webgl");


captureButton.addEventListener('click', takeScreenshot);


//# create and attach the shader program to the webGL context
var attributes, uniforms, program;

function attachShader(params) {
    fragmentShader = getShaderByName(params.fragmentShaderName);
    vertexShader = getShaderByName(params.vertexShaderName);

    program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { alert("Unable to initialize the shader program: " + gl.getProgramInfoLog(program)); }

    gl.useProgram(program);

    // get the location of attributes and uniforms
    attributes = {};

    for (var i = 0; i < params.attributes.length; i++) {
        var attributeName = params.attributes[i];
        attributes[attributeName] = gl.getAttribLocation(program, attributeName);
        gl.enableVertexAttribArray(attributes[attributeName]);
    }

    uniforms = {};

    for (i = 0; i < params.uniforms.length; i++) {
        var uniformName = params.uniforms[i];
        uniforms[uniformName] = gl.getUniformLocation(program, uniformName);

        gl.enableVertexAttribArray(attributes[uniformName]);
    }
}

function getShaderByName(id) {
    var shaderScript = document.getElementById(id);

    var theSource = "";
    var currentChild = shaderScript.firstChild;

    while (currentChild) {
        if (currentChild.nodeType === 3) { theSource += currentChild.textContent; }
        currentChild = currentChild.nextSibling;
    }

    var result;

    if (shaderScript.type === "x-shader/x-fragment") { result = gl.createShader(gl.FRAGMENT_SHADER); }
    else { result = gl.createShader(gl.VERTEX_SHADER); }

    gl.shaderSource(result, theSource);
    gl.compileShader(result);

    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
        alert("An error occurred compiling the shaders: " + gl.getShaderInfoLog(result));
        return null;
    }
    return result;
}

attachShader({
    fragmentShaderName: 'shader-fs',
    vertexShaderName: 'shader-vs',
    attributes: ['aVertexPosition'],
    uniforms: ['someVal', 'uSampler'],
});

// Boilerplate webGL initialization
gl.clearColor(0.0, 0.0, 0.0, 0.0);
gl.clearDepth(1.0);
gl.disable(gl.DEPTH_TEST);

positionsBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionsBuffer);
var positions = [
    -1.0, -1.0,
    1.0, -1.0,
    1.0, 1.0,
    -1.0, 1.0,
];
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

var vertexColors = [0xff00ff88, 0xffffffff];

var cBuffer = gl.createBuffer();

verticesIndexBuffer = gl.createBuffer();
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, verticesIndexBuffer);

var vertexIndices = [0, 1, 2, 0, 2, 3,];

gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(vertexIndices), gl.STATIC_DRAW
);

texture = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, texture);

//# must be LINEAR to avoid subtle pixelation (double-check this... test other options like NEAREST)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.bindTexture(gl.TEXTURE_2D, null);

// update the texture from the video
updateTexture = function () {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    //# next line fails in Safari if input video is NOT from same domain/server as this html code
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
    gl.bindTexture(gl.TEXTURE_2D, null);
};




function takeScreenshot() {
    //# video is ready (can display pixels)
    if (video.readyState >= 3) {
        updateTexture(); //# update pixels with current video frame's pixels...

        gl.useProgram(program); //# apply our program

        gl.bindBuffer(gl.ARRAY_BUFFER, positionsBuffer);
        gl.vertexAttribPointer(attributes['aVertexPosition'], 2, gl.FLOAT, false, 0, 0);

        //# Specify the texture to map onto the faces.
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(uniforms['uSampler'], 0);

        //# Draw GPU
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, verticesIndexBuffer);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }

    //# re-capture the next frame... basically the function loops itself
    //# consider adding event listener for video pause to set value as... cancelAnimationFrame( takeScreenshot ); 
    requestAnimationFrame(takeScreenshot);
}



/**
 *       const depthConstraints = {
      	audio: false,
        video:{
          // R200 related hack: prefer depth (width = 628) to IR (width = 641) stream.
          width: {ideal:628, max:640},

          // SR300 depth camera enables capture at 110 frames per second.
          frameRate: {ideal:110},
        }
      }
 */
/**
 *    // Color stream tracks have larger resolution than depth stream tracks.
      // If we cannot use deviceId to select, for now, we need to misuse width.
      ideal_width = ids.length == 1 ? ideal_width : 1280;

      const depthColorConstraints = ideal_width ?
      {
        video: {
          width: {ideal:ideal_width},
          deviceId: {exact: ids},
        },
      } : {
        video: {
          deviceId: {exact: ids},
        },
      }
 */


/**
 * Lense distortion calibration for Intel RealSense cameras.
 */

depthCameraCalibration = function(depth_stream) {
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

    if (cameraName === "R200")  {
        result = {
            depthScale: 0.001,
            depthOffset: new Float32Array(
                [ 233.3975067138671875, 179.2618865966796875 ]
            ),
            depthFocalLength: new Float32Array(
                [ 447.320953369140625, 447.320953369140625 ]
            ),
            colorOffset: new Float32Array(
                [ 311.841033935546875, 229.7513275146484375 ]
            ),
            colorFocalLength: new Float32Array(
                [ 627.9630126953125, 634.02410888671875 ]
            ),
            depthToColor: [
                0.99998325109481811523, 0.002231199527159333229, 0.00533978315070271492, 0,
                -0.0021383403800427913666, 0.99984747171401977539, -0.017333013936877250671, 0,
                -0.0053776423446834087372, 0.017321307212114334106, 0.99983555078506469727, 0,
                -0.058898702263832092285, -0.00020283895719330757856, -0.0001998419174924492836, 1
            ],
            depthDistortionModel: distortionModels.NONE,
            depthDistortioncoeffs: [ 0, 0, 0, 0, 0 ],
            colorDistortionModel: distortionModels.MODIFIED_BROWN_CONRADY,
            colorDistortioncoeffs: [
                -0.078357703983783721924,
                0.041351985186338424683,
                -0.00025565386749804019928,
                0.0012357287341728806496,
                0
            ],
        };
    } else if (cameraName === "SR300")  {
        result =  {
            depthScale: 0.0001249866472790017724,
            depthOffset: new Float32Array(
                [ 310.743988037109375, 245.1811676025390625 ]
            ),
            depthFocalLength: new Float32Array(
                [ 475.900726318359375, 475.900726318359375]
            ),
            colorOffset: new Float32Array(
                [ 312.073974609375, 241.969329833984375 ]
            ),
            colorFocalLength: new Float32Array(
                [ 617.65087890625, 617.65093994140625 ]
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
            colorDistortioncoeffs: [ 0, 0, 0, 0, 0 ],
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