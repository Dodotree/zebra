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
            testStream = await navigator.mediaDevices.getUserMedia({audio: false, video: true})
        }catch (err) {
            this.log.value += '\n\nInitiating test stream error\n' + JSON.stringify(err, null, 2);
        }
        try {
            mediaDevices = await navigator.mediaDevices.enumerateDevices()
        }catch (error) {
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

        // this is going to change depending on selected camera resolution
        this.video.style.display = 'block'; // fix bottom margin 4px
        this.video.style.width = `${640 / this.pixelRatio}px`;
        this.video.style.height = `${480 / this.pixelRatio}px`;

        this.appendChild(this.video);

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

        // <button id="capture"> Capture </button>
        // <canvas id="myCanvas" width="480" height="270"></canvas>
    }

    onCameraChange(event) {

        if (this.select.value === 'none') {
            this.stopDeviceTracks(this.currentStream);
            return;
        }

        const constraints = {
            video: { deviceId: { exact: this.select.value } },
            audio: false
        };
        navigator.mediaDevices
            .getUserMedia(constraints)
            .then(stream => {
                this.currentStream = stream;
                this.video.srcObject = stream;

                stream.getTracks().forEach(track => {
                    //settings should provide width and height, and aspect ratio
                    //video frame should be set to size/pixelRatio
                    let settings = track.getSettings();
                    let capabilities = track.getCapabilities ? track.getCapabilities() : {};
                    this.video.style.width = `${settings.width / this.pixelRatio}px`;
                    this.video.style.height = `${settings.height / this.pixelRatio}px`;
                    // should be prior to apply constrains
                    //track.getConstrains();
                    this.log.value = `${this.select.value} ${track.kind} ${track.label}`;
                    this.log.value += '\n\nSettings:\n' + JSON.stringify(settings, null, 2);
                    this.log.value += '\n\nCapabilities:\n' + JSON.stringify(capabilities, null, 2);
                    this.log.value += '\n\nStats:\n' + JSON.stringify(track.stats, null, 2);
                });
            })
            .catch(error => {
                this.log.value += `\n\nGet user media error for constrains ${JSON.stringify(constrains)}:\n ${JSON.stringify(track.stats, null, 2)}`;
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