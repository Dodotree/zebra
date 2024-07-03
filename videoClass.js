import VideoGL from "./glVideo.js";
import { utilsUI } from "./utils/UI.js";

export class VideoClass extends HTMLElement {
    constructor() {
        super();

        this.DISCONNECT_TIMEOUT = 5000;
        this.RECONNECT_TIMEOUT = 30000;

        /**
         * [config] Requested medias (video, audio, microphone).
         * @type {string}
         */
        this.media = "video,audio";

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
        this.pixelRatio = 1;

        /**
         * @type {HTMLVideoElement}
         */
        this.video = null;

        this.currentStream = null;
        this.currentTracks = { audio: null, video: null };

        this.select = null;
        this.canvasGL = null;
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

        // to make bound callback event listener removable
        this.controlsCallback = this.controlsCallback.bind(this);
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

        if (!this.logPanel) {
            this.logPanel = utilsUI.get({
                tag: "textarea",
                attrs: { id: "log", value: "" },
            });
            this.appendChild(this.logPanel);
        }

        // because video autopause on disconnected from DOM
        if (this.video) {
            const seek = this.video.seekable;
            if (seek.length > 0) {
                this.video.currentTime = seek.end(seek.length - 1);
            }
            // this.play();
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

            // this.ondisconnect();
        }, this.DISCONNECT_TIMEOUT);
    }

    log(message) {
        this.logPanel.value += "\n\n" + message;
        this.logPanel.scrollTop = this.logPanel.scrollHeight;
    }

    // for browsers that don't support autoplay
    play() {
        this.video.play().catch(() => {
            if (!this.video.muted) {
                this.video.muted = true;
                this.video.play().catch((er) => {
                    console.warn(er);
                });
            }
        });
    }

    stopDeviceTracks() {
        if (!this.currentStream) return;
        this.currentStream.getTracks().forEach((track) => {
            track.stop();
        });
        this.currentStream = null;
        this.currentTracks = { audio: null, video: null };
    }

    /**
     * Creates child DOM elements. Called automatically once on `connectedCallback`.
     */
    async onInit() {
        this.appendChild(
            utilsUI.get({
                tag: "details",
                attrs: { id: "track-capabilities" },
            })
        );

        let mediaDevices = [];
        // test stream needed only to activate mediaDevices (firefox has incomplete info otherwise)
        try {
            this.currentStream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: true,
            });
        } catch (err) {
            this.log(
                "Initiating test stream error:\n" + JSON.stringify(err, null, 2)
            );
        }
        try {
            mediaDevices = await navigator.mediaDevices.enumerateDevices();
        } catch (error) {
            this.log(
                "Error while fetching available streaming devices info:\n"
                    + JSON.stringify(error, null, 2)
            );
        }

        // TO DO
        // const supportedOptions = navigator.mediaDevices.getSupportedConstraints();

        // TO DO: in case of multiple displays
        // const mqString = `(resolution: ${window.devicePixelRatio}dppx)`;
        // const media = matchMedia(mqString);
        // media.addEventListener("change", updatePixelRatio.bind(this));

        this.pixelRatio = window.devicePixelRatio;
        this.setOrientation();

        this.appendChild(
            utilsUI.get({
                tag: "label",
                text: "Select Camera:",
                attrs: { htmlFor: "camera-select" },
            })
        );
        this.select = utilsUI.get({
            tag: "select",
            attrs: { id: "camera-select" },
        });
        this.select.appendChild(
            utilsUI.get({
                tag: "option",
                text: "None",
                attrs: { value: "none" },
            })
        );
        mediaDevices.forEach((mediaDevice, index) => {
            this.select.appendChild(
                utilsUI.get({
                    tag: "option",
                    text: mediaDevice.label || `Camera ${index}`,
                    attrs: { value: mediaDevice.deviceId },
                })
            );
            this.log(`Steam ${index} id=${mediaDevice.deviceId}`);
            if (mediaDevice.getCapabilities) {
                this.log(
                    `Capabilities:\n${JSON.stringify(mediaDevice.getCapabilities(), null, 2)}`
                );
            }
        });
        this.appendChild(this.select);
        this.select.addEventListener("change", this.onCameraChange.bind(this));

        // now we can release the test stream
        this.stopDeviceTracks(this.currentStream);

        const resHolder = this.appendChild(
            utilsUI.get({
                tag: "select",
                attrs: { id: "resolution-select" },
            })
        );
        resHolder.addEventListener(
            "change",
            this.onResolutionChange.bind(this)
        );

        const vidW = this.wide ? 640 : 480;
        const vidH = this.wide ? 480 : 640;
        this.video = utilsUI.get({
            tag: "video",
            attrs: {
                controls: true,
                autoplay: true,
                playsInline: true,
                preload: "auto",
                loop: true,
                crossOrigin: "anonymous",
                style: `display: block; width: ${vidW / this.pixelRatio}px; height: ${vidH / this.pixelRatio}px;`,
            },
        });
        this.appendChild(this.video);

        // if you want it to play in the background there"s nothing else to setup
        if (this.backgroundPlayOk) return;

        // TO DO:
        if ("hidden" in document && this.visibilityCheck) {
            document.addEventListener("visibilitychange", () => {
                if (document.hidden) {
                    // this.disconnectedCallback();
                } else if (this.isConnected) {
                    // this.connectedCallback();
                }
            });
        }

        if ("IntersectionObserver" in window && this.visibilityThreshold) {
            const observer = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        if (!entry.isIntersecting) {
                            // this.disconnectedCallback();
                        } else if (this.isConnected) {
                            // this.connectedCallback();
                        }
                    });
                },
                { threshold: this.visibilityThreshold }
            );
            observer.observe(this);
        }

        // TO DO: capture image and video
        // <button id="capture"> Capture </button>
    }

    // TO DO 1: with audio tracks
    // TO DO 2: multiple cameras
    onCameraChange() {
        this.stopDeviceTracks();
        utilsUI.deleteControlsUI("track-capabilities", this.controlsCallback);
        document.getElementById("resolution-select").innerHTML = "";
        if (this.canvasGL) {
            this.canvasGL.destroy();
        }

        if (this.select.value === "none") {
            return;
        }

        const deviceLabel = this.select.options[this.select.selectedIndex].text;
        const constraints = {
            video: { deviceId: { exact: this.select.value } },
            audio: false,
        };
        if (deviceLabel.indexOf("RealSense") > -1) {
            if (deviceLabel.indexOf("SR300") > -1) {
                if (deviceLabel.indexOf("RGB") > -1) {
                    constraints.video.width = { ideal: 1280 };
                } else {
                    constraints.video.frameRate = { ideal: 110 };
                }
            }
            if (
                deviceLabel.indexOf("R200") > -1
                && deviceLabel.indexOf("RGB") === -1
            ) {
                constraints.video.width = { ideal: 628, max: 640 };
            }
        }

        this.log(`Selected ${deviceLabel}`);
        this.log(`Get constrains ${JSON.stringify(constraints, null, 2)}`);
        // should be prior to apply constrains: track.getConstrains();
        // but even if we only use deviceId as constrain to get the stream
        // most likely it will provide default webcam 640x480 and not what it's capable of

        navigator.mediaDevices
            .getUserMedia(constraints)
            .then((stream) => {
                this.currentStream = stream;
                this.video.srcObject = stream;

                stream.getTracks().forEach((track) => {
                    // might need constraints for updated constrains stream request
                    // but so far it was possible to apply additional constrains to the track
                    this.constraints = constraints;
                    this.currentTracks[track.kind] = track;
                    // constrains are more like wishes, not necessarily granted
                    // settings should provide width and height, and aspect ratio
                    // video frame should be set to size/pixelRatio
                    let settings = track.getSettings();
                    this.currentSettings = settings;
                    let vidW = settings.width;
                    let vidH = settings.height;
                    // track capabilities ~same as stream capabilities,
                    // don't know about all environments
                    // .getCapabilities not always available,
                    // can provide native resolution and aspect ratio
                    let capabilities = track.getCapabilities
                        ? track.getCapabilities()
                        : {};
                    const capHolder = document.getElementById("track-capabilities");
                    capHolder.innerHTML = "";
                    capHolder.appendChild(
                        utilsUI.get({
                            tag: "summary",
                            text: `${track.kind} ${track.label} controls`,
                        })
                    );
                    capHolder.appendChild(
                        utilsUI.getCapabilitiesUI(
                            track.kind,
                            capabilities,
                            settings,
                            this.controlsCallback
                        )
                    );

                    // resolution switch is a shortcut to Box options in capabilities
                    // it requires webGL canvas remaking
                    // (so event removals etc. for garbage collection )
                    // common would be 4:3 and 16:9; 3:2 and 1:1 is something to consider
                    // overall size affects frame rate, so, no guarantee that it will be granted
                    // TODO 1: standard resolutions for RealSense, Razor, iPhone, Android, iPad
                    // render similar variants for unknown
                    // TO DO 2: scan resolutions that will not switch to cut/resize in settings
                    const resHolder = document.getElementById("resolution-select");
                    resHolder.innerHTML = "";
                    resHolder.appendChild(
                        utilsUI.get({
                            tag: "option",
                            text: `${vidW}x${vidH}`,
                            attrs: { value: `${vidW}x${vidH}` },
                        })
                    );
                    if (capabilities.width) {
                        const betterRes = `${capabilities.width.max}x${capabilities.height.max}`;
                        resHolder.appendChild(
                            utilsUI.get({
                                tag: "option",
                                text: betterRes,
                                attrs: { value: betterRes },
                            })
                        );
                    }

                    this.setResolution(vidW, vidH);

                    this.log(`Track ${track.kind} ${track.label}`);
                    this.log(
                        "Track  Settings:\n" + JSON.stringify(settings, null, 2)
                    );
                    this.log(
                        "Track  Capabilities:\n"
                            + JSON.stringify(capabilities, null, 2)
                    );
                    this.log(
                        "Track Stats:\n" + JSON.stringify(track.stats, null, 2)
                    );
                });
            })
            .catch((error) => {
                this.log(
                    `Got user media error for constrains: \n${JSON.stringify(constraints, null, 2)}:`
                );
                this.log(`Error: ${JSON.stringify(error, null, 2)}`);
            });
    }

    setResolution(vidW, vidH) {
        let [w, h] = [vidW, vidH];
        if ((this.wide && w < h) || (!this.wide && w >= h)) {
            [w, h] = [vidH, vidW];
        }
        this.log(`Resolution ${this.wide ? "Wide" : "Narrow"} w<h? ${vidW < vidH}  w>h? ${vidW >= vidH}  ${vidW},${vidH}  => ${w}x${h}`);
        this.video.style.width = `${vidW / this.pixelRatio}px`;
        this.video.style.height = `${vidH / this.pixelRatio}px`;
        // canvas context should have right dimensions
        // it's easier to replace canvas than try to update context of existing one
        // destroy canvas before initGL unless there're none
        this.initGL(vidW, vidH);
        this.currentResolution = `${vidW}x${vidH}`;
        this.log(`Resolution set to ${this.currentResolution}`);
    }

    controlsCallback(event) {
        const form = event.target.form;
        const trackKind = form.kind;
        let key = event.target.getAttribute("key");
        key = key || event.target.name;
        const value = event.target.value;

        // sometimes it's required to set "manual" mode before changes
        // but so far it changes between continuous and manual automatically

        if (this.currentSettings[key] === value) {
            return;
        }

        this.currentTracks[trackKind]
            .applyConstraints({
                advanced: [{ [key]: value }],
            })
            .then(() => {
                const newSettings = this.currentTracks[trackKind].getSettings();
                if (newSettings[key] === this.currentSettings[key]) {
                    this.log(
                        `Nothing changed: ${key} stays ${this.currentSettings[key]}`
                    );
                    utilsUI.setControlValue(
                        form,
                        key,
                        this.currentSettings[key]
                    );
                } else {
                    if (newSettings[key] === value) {
                        // success
                        this.log(`Success! ${key} set to ${value}`);
                    } else {
                        this.log(
                            `Warning: ${key} changed to ${newSettings[key]} instead of requested ${value}`
                        );
                    }

                    // out of curiosity check if something else changed
                    this.currentSettings[key] = value;
                    const changes = {};
                    if (
                        JSON.stringify(newSettings)
                        !== JSON.stringify(this.currentSettings)
                    ) {
                        this.log("Something else changes with it");
                        const sharedKeys = new Set([
                            ...Object.keys(this.currentSettings),
                            ...Object.keys(newSettings),
                        ]);
                        for (const sKey of sharedKeys) {
                            if (
                                newSettings[sKey] === undefined
                                || this.currentSettings[sKey] === undefined
                            ) {
                                this.log(
                                    `Key ${sKey} is missing in one of the settings`
                                );
                                // total reset needed for controls
                                // getCapabilities
                            }
                            if (
                                this.currentSettings[sKey] !== newSettings[sKey]
                            ) {
                                changes[sKey] = newSettings[sKey];
                            }
                        }
                        this.log(`Changes ${JSON.stringify(changes, null, 2)}`);
                    }

                    // important! update currentSettings before updating controls
                    // otherwise it will trigger another event
                    this.currentSettings = newSettings;
                    for (const chKey in changes) {
                        utilsUI.setControlValue(form, chKey, changes[chKey]);
                    }

                    if (
                        key === "width"
                        || key === "height"
                        || key === "aspectRatio"
                    ) {
                        // aspectRatio adjusts width and height to closest value in integers w,h
                        this.canvasGL.destroy();
                        this.setResolution(
                            newSettings.width,
                            newSettings.height
                        );
                    }
                }
            })
            .catch((e) => {
                this.log(
                    `Failed set ${key} to ${value} error: ${JSON.stringify(e, null, 2)}`
                );
            });
    }

    onResolutionChange(event) {
        this.stopDeviceTracks();

        const [w, h] = event.target.value.split("x");
        if ((w + 0).isNan || (h + 0).isNan) {
            this.log("Error: resolution should be in format \"width x height\"");
            return;
        }

        this.constraints.video.width = { ideal: w };
        this.constraints.video.height = { ideal: h };
        console.log(
            this.constraints,
            "resolution changing from",
            this.currentResolution
        );

        navigator.mediaDevices
            .getUserMedia(this.constraints)
            .then((stream) => {
                this.currentStream = stream;
                this.video.srcObject = stream;
                stream.getTracks().forEach((track) => {
                    let settings = track.getSettings();
                    this.canvasGL.destroy();
                    this.setResolution(settings.width, settings.height);
                });
            })
            .catch((error) => {
                this.log(
                    `Got user media error for constrains ${JSON.stringify(this.constraints, null, 2)}:`
                );
                this.log(`Error: ${JSON.stringify(error, null, 2)}`);
            });
    }

    setOrientation() {
        this.angle = 0;
        // eslint-disable-next-line no-restricted-globals
        this.deviceWide = screen.width > screen.height;
        // eslint-disable-next-line no-restricted-globals
        if (screen && "orientation" in screen) {
            try {
                // eslint-disable-next-line no-restricted-globals
                this.angle = screen.orientation.angle;
            } catch (e) {
                this.log(
                    `Screen orientation error:\n ${JSON.stringify(e, null, 2)}`
                );
            }
            this.log(
                // eslint-disable-next-line no-restricted-globals
                `Screen orientation: ${this.angle} degrees, ${screen.orientation.type}.`
            );
            // eslint-disable-next-line no-restricted-globals
            screen.orientation.addEventListener("change", () => {
                // eslint-disable-next-line no-restricted-globals
                this.angle = screen.orientation.angle;
                this.wide = this.angle === 180 || this.angle === 0
                    ? this.deviceWide
                    : !this.deviceWide;
                this.log(
                    // eslint-disable-next-line no-restricted-globals
                    `Screen orientation change: ${this.angle} degrees, ${screen.orientation.type}.`
                );
            });
        } else if ("onorientationchange" in window) {
            // for some mobile browsers
            try {
                this.angle = window.orientation;
            } catch (e) {
                this.log(
                    `Window orientation error: ${JSON.stringify(e, null, 2)}`
                );
            }
            this.log(`Window orientation: ${this.angle} degrees.`);
            window.addEventListener("orientationchange", () => {
                this.angle = window.orientation;
                this.wide = this.angle === 180 || this.angle === 0
                    ? this.deviceWide
                    : !this.deviceWide;
                this.log(`Window orientation change: ${this.angle} degrees.`);
            });
        }
        this.wide = this.angle === 180 || this.angle === 0
            ? this.deviceWide
            : !this.deviceWide;
        this.log(
            `Orientation ${this.angle} device ${this.deviceWide ? "Wide" : "Narrow"} => ${this.wide ? "Wide" : "Narrow"} screen`
        );
    }

    initGL(w, h) {
        this.appendChild(
            utilsUI.get({
                tag: "canvas",
                attrs: {
                    id: "vCanvas",
                    width: w,
                    height: h,
                    style: `width: ${w / this.pixelRatio}px; height: ${h / this.pixelRatio}px;`,
                },
            })
        );
        this.appendChild(
            utilsUI.get({
                tag: "canvas",
                attrs: {
                    id: "outputCanvas",
                    width: w,
                    height: h,
                    style: `width: ${w / this.pixelRatio}px; height: ${h / this.pixelRatio}px;`,
                },
            })
        );
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
        try {
            this.canvasGL = new VideoGL(
                "vCanvas",
                "outputCanvas",
                "depth-vs",
                "depth-fs",
                ["v"],
                ["s"]
            );
        } catch (e) {
            console.log(e);
        }
        this.canvasGL.init(
            0,
            {
                source: this.video,
                flip: false,
                mipmap: false,
                params: {
                    TEXTURE_WRAP_T: "CLAMP_TO_EDGE",
                    TEXTURE_WRAP_S: "CLAMP_TO_EDGE",
                    TEXTURE_MAG_FILTER: "NEAREST",
                    TEXTURE_MIN_FILTER: "NEAREST",
                },
            },
            { s: 0 },
            {
                v: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
                i: new Uint16Array([0, 1, 2, 0, 2, 3]),
            }
        );
    }
}
