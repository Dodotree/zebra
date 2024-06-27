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

        this.log = utilsUI.get({
            tag: "textarea",
            attrs: { id: 'log', value: '', style: `width: 640px; height: 260px; display:block;` }
        });
        this.appendChild(this.log);

        this.appendChild(utilsUI.get({
            tag: "details",
            attrs: { id: 'track-capabilities' }
        }));

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

        //TO DO
        const supportedOptions = navigator.mediaDevices.getSupportedConstraints();

        const mqString = `(resolution: ${window.devicePixelRatio}dppx)`;
        const media = matchMedia(mqString);
        //media.addEventListener("change", updatePixelRatio.bind(this)); //TO DO: in case of multiple displays
        this.pixelRatio = window.devicePixelRatio;

        this.angle = 0;
        if(screen && 'orientation' in screen){
            // this.angle = screen.orientation.angle;
            this.log.value += `\nOrientation screen`;
            screen.orientation.addEventListener("change", (event) => {
                this.angle = screen.orientation.angle;
                this.log.value += `\nScreen Orientation change: ${this.angle} degrees.`;
            });
        }
        // window.addEventListener("deviceorientation", (event) => {
        //     this.log.value += `\ndeviceorientation ${event.alpha} : ${event.beta} : ${event.gamma}`;
        // });
        this.wide = (this.angle === 180 || this.angle === 0);
        this.log.value += `\nNarrowing down 2 Orientation ${this.angle}`;

        this.appendChild(utilsUI.get({
            tag: "label",
            text: "Select Camera:",
            attrs: { htmlFor: 'camera-select' }
        }));
        this.select = utilsUI.get({
            tag: "select",
            attrs: { id: 'camera-select' }
        });
        this.select.appendChild(utilsUI.get({
            tag: "option",
            text: "None",
            attrs: { value: 'none' }
        }));
        mediaDevices.forEach((mediaDevice, count) => {
            this.select.appendChild(utilsUI.get({
                tag: "option",
                text: mediaDevice.label || `Camera ${count++}`,
                attrs: { value: mediaDevice.deviceId }
            }));
            if (mediaDevice.getCapabilities) {
                this.log.value += `\nSteam ${count} id=${mediaDevice.deviceId}\nCapabilities>>:\n ${JSON.stringify(mediaDevice.getCapabilities(), null, 2)}`;
            }
        });
        this.appendChild(this.select);
        this.select.addEventListener('change', this.onCameraChange.bind(this));

        // now we can release the test stream
        this.stopDeviceTracks(testStream);

        const resHolder = utilsUI.get({
            tag: "select",
            attrs: { id: 'resolution-select' }
        });
        this.appendChild(resHolder);
        resHolder.addEventListener('change', this.onResolutionChange.bind(this));

        this.video = utilsUI.get({
            tag: "video",
            attrs: {
                controls: true,
                autoplay: true,
                playsInline: true,
                preload: 'auto',
                loop: true,
                crossOrigin: "anonymous",
                style: `display: block; width: ${640 / this.pixelRatio}px; height: ${480 / this.pixelRatio}px;`
            }
        });
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
    }


    onCameraChange(event) {

        if (this.select.value === 'none') {
            this.stopDeviceTracks(this.currentStream);
            document.getElementById('track-capabilities').innerHTML = '';
            return;
        }

        const deviceLabel = this.select.options[this.select.selectedIndex].text;
        const constraints = {
            video: { deviceId: { exact: this.select.value } },
            audio: false
        };
        if (deviceLabel.indexOf("RealSense") > -1) {
            if (deviceLabel.indexOf("SR300") > -1) {
                if (deviceLabel.indexOf("RGB") > -1) {
                    constraints.video.width = { ideal: 1280 };
                } else {
                    constraints.video.frameRate = { ideal: 110 };
                }
            }
            if (deviceLabel.indexOf("R200") > -1 && deviceLabel.indexOf("RGB") == -1) {
                constraints.video.width = { ideal: 628, max: 640 };
            }
        }
        if (deviceLabel.indexOf("RealSense") > -1 && deviceLabel.indexOf("R200") > -1) {

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
                this.currentTracks = {};

                stream.getTracks().forEach(track => {
                    // constrains are more like wishes, not necessarily granted
                    //settings should provide width and height, and aspect ratio
                    //video frame should be set to size/pixelRatio
                    let settings = track.getSettings();
                    this.video.style.width = `${settings.width / this.pixelRatio}px`;
                    this.video.style.height = `${settings.height / this.pixelRatio}px`;

                    // canvas context should have right dimensions
                    // it's easier to replace canvas than try to update context of existing one
                    this.appendChild(utilsUI.get({
                        tag: "canvas",
                        attrs: {
                            id: 'vCanvas',
                            width: settings.width,
                            height: settings.height,
                            style: `width: ${settings.width / this.pixelRatio}px; height: ${settings.height / this.pixelRatio}px;`
                        }
                    }));
                    this.initGL();

                    // track capabilities look the same as stream capabilities, don't know about all environments
                    // capabilities not always available, but can provide native resolution and aspect ratio
                    // next is providing options to switch. It's possible to "scan" for common
                    // variations of that, but I doubt it's convenient. Maybe an input for custom resolution. 
                    let capabilities = track.getCapabilities ? track.getCapabilities() : {};
                    const capHolder = document.getElementById('track-capabilities');
                    capHolder.innerHTML = '';
                    capHolder.appendChild(utilsUI.get({
                        tag: "summary",
                        text: `${track.kind} ${track.label} controls`
                    }));
                    capHolder.appendChild(utilsUI.getCapabilitiesUI(track.kind, capabilities, settings, this.controlsCallback.bind(this)));

                    const resHolder = document.getElementById('resolution-select');
                    resHolder.innerHTML = '';
                    const defaultRes = `${settings.width}x${settings.height}`;
                    this.currentResolution = defaultRes;
                    this.constraints = constraints;
                    const betterRes = `${capabilities.width.max}x${capabilities.height.max}`;

                    resHolder.appendChild(utilsUI.get({
                        tag: "option",
                        text: defaultRes,
                        attrs: { value: defaultRes }
                    }));
                    resHolder.appendChild(utilsUI.get({
                        tag: "option",
                        text: betterRes,
                        attrs: { value: betterRes }
                    }));;

                    this.currentTracks[track.kind] = track;
                    this.log.value += `\n\nTrack ${track.kind} ${track.label}`;
                    this.log.value += '\n\nTrack  Settings>>:\n' + JSON.stringify(settings, null, 2);
                    this.log.value += '\n\nTrack  Capabilities>>:\n' + JSON.stringify(capabilities, null, 2);
                    this.log.value += '\n\nTrack Stats>>:\n' + JSON.stringify(track.stats, null, 2);
                })
            })
            .catch(error => {
                this.log.value += `\n\nGot user media error for constrains ${JSON.stringify(constraints)}:\n ${JSON.stringify(error, null, 2)}`;
            });
    }

    controlsCallback(event) {
        console.log(this.currentTracks, event.target.form.kind, event.target.name, event.target.value);
        this.currentTracks[event.target.form.kind].applyConstraints({
            advanced: [
                { [event.target.name]: event.target.value }
            ]
        })
            .then(() => {
                // success
                console.log('The new device settings are: ', this.currentTracks[event.target.form.kind].getSettings());
            })
            .catch(e => {
                console.error('Failed to set exposure time', e);
            });
    }

    onResolutionChange(event) {
        this.stopDeviceTracks(this.currentStream);

        const [w, h] = event.target.value.split('x');
        if ((w + 0).isNan || (h + 0).isNan) {
            this.log.value = 'Error: resolution should be in format "width x height"';
            return;
        }

        this.constraints.video.width = { ideal: w };
        this.constraints.video.height = { ideal: h };
        console.log(this.constraints, 'resolution changing from', this.currentResolution);

        navigator.mediaDevices
            .getUserMedia(this.constraints)
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

                    // removing canvas with webgl class should include unsubscribing from events
                    // TO DO: possibly make it into a custom element
                    document.getElementById('vCanvas').remove();

                    // canvas context should have right dimensions
                    // it's easier to replace canvas than try to update context of existing one
                    this.appendChild(utilsUI.get({
                        tag: "canvas",
                        attrs: {
                            id: 'vCanvas',
                            width: settings.width,
                            height: settings.height,
                            style: `width: ${settings.width / this.pixelRatio}px; height: ${settings.height / this.pixelRatio}px;`
                        }
                    }));
                    this.initGL();

                    this.currentResolution = `${settings.width}x${settings.height}`;
                    console.log(this.constraints, 'resolution changed to', this.currentResolution);
                });
            })
            .catch(error => {
                this.log.value += `\n\nGot user media error for constrains ${JSON.stringify(this.constraints)}:\n ${JSON.stringify(error, null, 2)}`;
            });
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

// it is convenient but noticeably slower than direct DOM manipulation
// I can live with that but maybe unwrap before publishing
const utilsUI = {
    get(element) {
        const el = document.createElement(element.tag);
        if (element.text) {
            el.appendChild(document.createTextNode(element.text));
        }
        if (element.attrs) {
            for (const attr in element.attrs) {
                el.setAttribute(attr, element.attrs[attr]);
            };
        }
        return el;
    },

    getCapabilitiesUI(trackKind, capabilities, settings, callback) {
        const form = document.createElement("form");
        form.kind = trackKind;
        const buckets = {
            info: ['deviceId', 'groupId'],
            box: ['resizeMode', 'aspectRatio', 'width', 'height', 'frameRate'],
            exposure: ['exposureMode', 'exposureTime', 'exposureCompensation', 'iso', 'whiteBalanceMode'],
            focus: ['focusMode', 'focusDistance', 'focusRange'],
            color: ['brightness', 'colorTemperature', 'contrast', 'saturation', 'sharpness'],
        }

        const usedSoFar = [];

        for (const buck in buckets) {
            const bucketNode = document.createElement("fieldset");
            bucketNode.setAttribute('style', 'break-inside: avoid; page-break-inside: avoid;');

            buckets[buck].forEach(cKey => {
                if (cKey in capabilities) {
                    usedSoFar.push(cKey);
                    bucketNode.appendChild(utilsUI.getInputUI(cKey, capabilities[cKey], settings[cKey], callback));
                }
            })

            if (bucketNode.children.length > 0) {
                form.appendChild(bucketNode);
            }
        }

        const leftoverKeys = Object.keys(capabilities).filter(key => usedSoFar.indexOf(key) == -1);
        console.log('leftoverKeys', leftoverKeys);
        leftoverKeys.forEach(cKey => {
            if (cKey in capabilities) {
                usedSoFar.push(cKey);
                form.appendChild(utilsUI.getInputUI(cKey, capabilities[cKey], settings[cKey], callback));
            }
        })


        return form;
    },

    getInputUI(cKey, cOptions, cValue, callback) {
        const pnode = document.createElement("p");

        if (typeof cOptions === 'string' || cOptions instanceof String) { // string or String wrapper
            // those most likely are not meant to be changed
            pnode.appendChild(utilsUI.get({
                tag: "label",
                text: cKey,
                attrs: { htmlFor: cKey }
            }));
            const inp = pnode.appendChild(utilsUI.get({
                tag: "input",
                attrs: {
                    type: 'text',
                    name: cKey,
                    value: cValue,
                    disabled: true
                }
            }));
        } else if (Array.isArray(cOptions) && cOptions.length > 0) {

            pnode.appendChild(utilsUI.get({
                tag: "label",
                text: cKey,
                attrs: { htmlFor: cKey }
            }));
            const sel = pnode.appendChild(utilsUI.get({
                tag: "select",
                attrs: { name: cKey }
            }));
            cOptions.forEach((option, index) => {
                sel.appendChild(utilsUI.get({
                    tag: "option",
                    text: option,
                    attrs: { value: option }
                }));
            });
            sel.addEventListener('change', callback);

        } else if (Object.keys(cOptions).includes('min' && 'max')) {

            pnode.appendChild(utilsUI.get({
                tag: "label",
                text: cKey,
                attrs: { htmlFor: cKey + 'Range' }
            }));
            const inpRange = pnode.appendChild(utilsUI.get({
                tag: "input",
                attrs: {
                    type: 'range',
                    name: cKey + 'Range',
                    min: cOptions.min,
                    max: cOptions.max,
                    step: 'step' in cOptions ? cOptions.step : 1,
                    value: cValue,
                    oninput: `this.form.${cKey + 'Number'}.value = this.value`
                }
            }));
            inpRange.addEventListener('input', callback);
            const inpNum = pnode.appendChild(utilsUI.get({
                tag: "input",
                attrs: {
                    type: 'number',
                    name: cKey + 'Number',
                    min: cOptions.min,
                    max: cOptions.max,
                    step: 'step' in cOptions ? cOptions.step : 1,
                    value: cValue,
                    oninput: `this.form.${cKey + 'Range'}.value = this.value`
                }
            }));
            inpNum.addEventListener('input', callback);
        }
        return pnode;
    }
}