import { glVideo } from './glVideo.js';

export class VideoClass extends HTMLElement {
    constructor() {
        super();

        this.DISCONNECT_TIMEOUT = 5000;
        this.RECONNECT_TIMEOUT = 30000

        /**
         * [config] Requested medias (video, audio, microphone).
         * @type {string}
         */
        this.media = 'video,audio';

        /**
         * [config] Run stream when not displayed on the screen. Default `false`.
         * @type {boolean}
         */
        this.backgroundPlayOk = false;

        /**
         * [config] Run stream only when player in the viewport. Stop when user scroll out player.
         * Value is percentage of visibility from `0` (not visible) to `1` (full visible).
         * Default `0` - disable;
         * @type {number}
         */
        this.visibilityThreshold = 0;

        /**
         * [config] Run stream only when browser page on the screen. Stop when user change browser
         * tab or minimize browser windows.
         * @type {boolean}
         */
        this.visibilityCheck = true;

        /**
         * [internal] Display pixel ratio.
         * @type {number}
         */
        this.pixelRatio

        /**
         * @type {HTMLVideoElement}
         */
        this.video = null;

        /**
         * [internal] Disconnect TimeoutID.
         * @type {number}
         */
        this.disconnectTID = 0;

        /**
         * [internal] Reconnect TimeoutID.
         * @type {number}
         */
        this.reconnectTID = 0;
    }


    /**
   * `CustomElement` lifecycle callback. Invoked each time the custom element is appended into a
   * document-connected element.
   */
    connectedCallback() {
        if (this.disconnectTID) {
            clearTimeout(this.disconnectTID);
            this.disconnectTID = 0;
        }

        // because video autopause on disconnected from DOM
        if (this.video) {
            const seek = this.video.seekable;
            if (seek.length > 0) {
                this.video.currentTime = seek.end(seek.length - 1);
            }
            //this.play();
        } else {
            this.onInit();
        }
    }

    /**
     * `CustomElement`lifecycle callback. Invoked each time the custom element is removed from the
     * document's DOM.
     */
    disconnectedCallback() {
        if (this.backgroundPlayOk || this.disconnectTID) return;

        this.disconnectTID = setTimeout(() => {
            if (this.reconnectTID) {
                clearTimeout(this.reconnectTID);
                this.reconnectTID = 0;
            }

            this.disconnectTID = 0;

            //this.ondisconnect();
        }, this.DISCONNECT_TIMEOUT);
    }

    /**
     * Creates child DOM elements. Called automatically once on `connectedCallback`.
     */
    async onInit() {

        this.log = document.createElement('textarea');
        this.log.id = 'log';
        this.log.value = '';
        this.log.style = `width: 640px; height: 260px; display:block;`;
        this.appendChild(this.log);

        let testStream = null;
        let mediaDevices = [];
        // test stream needed only to activate mediaDevices (firefox has incomplete info otherwise)
        try {
            testStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true })
        } catch (err) {
            this.log.value += '\n\nInitiating test stream error\n' + JSON.stringify(err, null, 2);
        }
        try {
            mediaDevices = await navigator.mediaDevices.enumerateDevices()
        } catch (error) {
            this.log.value += '\n\nError while fetching available streaming devices info\n' + JSON.stringify(error, null, 2);
        }


        const supportedOptions = navigator.mediaDevices.getSupportedConstraints();
        console.log(mediaDevices);

        const mqString = `(resolution: ${window.devicePixelRatio}dppx)`;
        const media = matchMedia(mqString);
        //media.addEventListener("change", updatePixelRatio.bind(this));
        this.pixelRatio = window.devicePixelRatio;

        const label = document.createElement('label');
        label.htmlFor = 'camera-select';
        const labelText = document.createTextNode('Select Camera:');
        label.appendChild(labelText);
        this.appendChild(label);
        this.select = document.createElement('select');
        this.select.id = 'camera-select'
        const blankOption = document.createElement('option');
        blankOption.value = 'none';
        const blankText = document.createTextNode('None');
        blankOption.appendChild(blankText);
        this.select.appendChild(blankOption);
        mediaDevices.forEach((mediaDevice, count) => {
            const option = document.createElement('option');
            option.value = mediaDevice.deviceId;
            const label = mediaDevice.label || `Camera ${count++}`;
            const textNode = document.createTextNode(label);
            option.appendChild(textNode);
            this.select.appendChild(option);
            if (mediaDevice.getCapabilities) {
                console.log(count, mediaDevice.getCapabilities());
            }
        });
        this.appendChild(this.select);
        this.select.addEventListener('change', this.onCameraChange.bind(this));

        this.stopDeviceTracks(testStream);

        this.video = document.createElement('video');
        this.video.controls = true;
        this.video.autoplay = true;
        this.video.playsInline = true;
        this.video.preload = 'auto';
        this.video.loop = true;
        this.video.crossOrigin = "anonymous";

        // this is going to change depending on selected camera resolution
        this.video.style.display = 'block'; // fix bottom margin 4px
        this.video.style.width = `${640 / this.pixelRatio}px`;
        this.video.style.height = `${480 / this.pixelRatio}px`;

        this.appendChild(this.video);

        const canvas = document.createElement('canvas');
        canvas.id = 'vCanvas';
        canvas.width = 640 / this.pixelRatio;
        canvas.height = 480 / this.pixelRatio;

        this.appendChild(canvas);

        const resolutionGroup = document.createElement('fieldset');
        resolutionGroup.id = 'resolution-group';
        this.insertBefore(resolutionGroup, this.video);

        // if you want it to play in the background there's nothing else to setup
        if (this.backgroundPlayOk) return;

        if ('hidden' in document && this.visibilityCheck) {
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    //this.disconnectedCallback();
                } else if (this.isConnected) {
                    //this.connectedCallback();
                }
            });
        }

        if ('IntersectionObserver' in window && this.visibilityThreshold) {
            const observer = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) {
                        //this.disconnectedCallback();
                    } else if (this.isConnected) {
                        //this.connectedCallback();
                    }
                });
            }, { threshold: this.visibilityThreshold });
            observer.observe(this);
        }

        this.initGL();
        // <button id="capture"> Capture </button>
        // <canvas id="myCanvas" width="480" height="270"></canvas>
    }

    initGL() {
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
        const glV = new glVideo('vCanvas', 'depth-vs', 'depth-fs', ['v'], ['s']);
        glV.init(0, {
            source: this.video,
            flip: false,
            mipmap: false,
            params: {
                TEXTURE_WRAP_T: 'CLAMP_TO_EDGE',
                TEXTURE_WRAP_S: 'CLAMP_TO_EDGE',
                TEXTURE_MAG_FILTER: 'NEAREST',
                TEXTURE_MIN_FILTER: 'NEAREST'
            }
        },
            { s: 0 },
            { v: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), i: new Uint16Array([0, 1, 2, 0, 2, 3]) }
        );
    }

    onCameraChange(event) {

        if (this.select.value === 'none') {
            this.stopDeviceTracks(this.currentStream);
            return;
        }

        const deviceLabel = this.select.options[this.select.selectedIndex].text;
        const constraints = {
            video: { deviceId: { exact: this.select.value } },
            audio: false
        };
        if (deviceLabel.indexOf("RealSense")>-1 && deviceLabel.indexOf("RGB")>-1) {
            constraints.video.frameRate = { ideal: 110 };
            constraints.video.width = { ideal: 1280 };
        }
        if (deviceLabel.indexOf("RealSense")>-1 && deviceLabel.indexOf("R200")>-1) {
            constraints.video.width = { ideal: 628, max: 640 };
        }
        this.log.value = `\nSelected ${deviceLabel}`;
        this.log.value += `\nGet constrains ${JSON.stringify(constraints)}`;
        // should be prior to apply constrains: track.getConstrains();
        // but even if we only use deviceId as constrain to get the stream
        // most likely it will provide default webcam 640x480 and not what it's capable of

        navigator.mediaDevices
            .getUserMedia(constraints)
            .then(stream => {
                this.currentStream = stream;
                this.video.srcObject = stream;

                stream.getTracks().forEach(track => {
                    // constrains are more like wishes, not necessarily granted
                    //settings should provide width and height, and aspect ratio
                    //video frame should be set to size/pixelRatio
                    let settings = track.getSettings();
                    this.video.style.width = `${settings.width / this.pixelRatio}px`;
                    this.video.style.height = `${settings.height / this.pixelRatio}px`;

                    const canvas = document.getElementById('vCanvas');
                    canvas.width = settings.width / this.pixelRatio;
                    canvas.height = settings.height / this.pixelRatio;

                    // capabilities not always available,but can provide native resolution and aspect ratio
                    // next is providing options to switch. It's possible to "scan" for common
                    // variations of that, but I doubt it's convenient. Maybe an input for custom resolution. 
                    let capabilities = track.getCapabilities ? track.getCapabilities() : {};



                    this.log.value += `\n\nTrack ${track.kind} ${track.label}`;
                    this.log.value += '\n\nSettings>>:\n' + JSON.stringify(settings, null, 2);
                    this.log.value += '\n\nCapabilities>>:\n' + JSON.stringify(capabilities, null, 2);
                    this.log.value += '\n\nStats>>:\n' + JSON.stringify(track.stats, null, 2);
                })
            })
            .catch(error => {
                this.log.value += `\n\nGet user media error for constrains ${JSON.stringify(constraints)}:\n ${JSON.stringify(error, null, 2)}`;
            });
    }

    play() {
        this.video.play().catch(() => {
            if (!this.video.muted) {
                this.video.muted = true;
                this.video.play().catch(er => {
                    console.warn(er);
                });
            }
        });
    }

    stopDeviceTracks(stream) {
        stream.getTracks().forEach(track => {
            track.stop();
        });
    }

}

