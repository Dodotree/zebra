import VideoGL from "./glVideo.js";
import { VideoControls } from "./videoControls.js";
import { utilsUI } from "./utils/UI.js";

export class VideoClass extends HTMLElement {
    constructor() {
        super();

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

        this.logger = null;

        // to make bound callback event listener removable
        this.controlsCallback = this.controlsCallback.bind(this);
        this.setOrientation = this.setOrientation.bind(this);
    }

    // for browsers that don't support autoplay
    play() {
        this.video.play().catch(() => {
            if (!this.video.muted) {
                this.video.muted = true;
                this.video.play().catch((er) => {
                    // eslint-disable-next-line no-console
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
     * `CustomElement` lifecycle callback. Invoked each time the custom element is appended into a
     * document-connected element.
     */
    connectedCallback() {
        this.logger = document.getElementsByTagName("screen-logger")[0];

        this.select = document.getElementById("camera-select");
        this.select.addEventListener("change", this.onCameraChange.bind(this));

        try {
            this.controls = new VideoControls();
            document.body.insertBefore(this.controls, this);
        } catch (e) {
            this.logger.logError(e);
        }

        const resHolder = document.getElementById("resolution-select");
        resHolder.addEventListener(
            "change",
            this.onResolutionChange.bind(this)
        );

        // TO DO: capture image and video
        // <button id="capture"> Capture </button>

        // TO DO: in case of multiple displays
        // const mqString = `(resolution: ${window.devicePixelRatio}dppx)`;
        // const media = matchMedia(mqString);
        // media.addEventListener("change", updatePixelRatio.bind(this));

        this.pixelRatio = window.devicePixelRatio;
        this.os = utilsUI.getOS();
        utilsUI.watchOrientation(this.setOrientation, this.logger.log);

        // the most universal resolution for cameras, empty until stream is initialized
        const vidW = this.wide ? 640 : 480;
        const vidH = this.wide ? 480 : 640;
        this.video = this.appendChild(utilsUI.get({
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
        }));

        // test stream needed only to activate mediaDevices (firefox has incomplete info otherwise)
        // using Promises instead of async/await because we are inside lifecycle callback
        navigator.mediaDevices.getUserMedia({
            audio: false,
            video: true,
        }).then((stream) => {
            navigator.mediaDevices.enumerateDevices().then((devices) => {
                devices.forEach((mediaDevice, index) => {
                    this.select.appendChild(
                        utilsUI.get({
                            tag: "option",
                            text: mediaDevice.label || `Camera ${index}`,
                            attrs: { value: mediaDevice.deviceId },
                        })
                    );
                    this.logger.log(`Steam ${index} id=${mediaDevice.deviceId}`);
                    if (mediaDevice.getCapabilities) {
                        this.logger.log(
                            `Capabilities:\n${JSON.stringify(mediaDevice.getCapabilities(), null, 2)}`
                        );
                    }
                });
                // now we can release the test stream
                this.stopDeviceTracks(stream);
            }).catch((error) => {
                this.logger.log("Error while fetching available streaming devices info");
                this.logger.logError(error);
            });
        }).catch((err) => {
            this.logger.log("Initiating default stream error:\n");
            this.logger.logError(err);
        });

        // TO DO
        // const supportedOptions = navigator.mediaDevices.getSupportedConstraints();

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
    }

    changeSettings(kind, label, settings, capabilities) {
        this.currentSettings = settings;
        try {
            this.controls.init(
                kind,
                label,
                capabilities,
                settings,
                this.controlsCallback
            );
        } catch (e) {
            this.logger.logError(e);
        }

        const listOfResolutions = [[settings.width, settings.height]];
        if (capabilities.width && capabilities.height) {
            listOfResolutions.push([capabilities.width.max, capabilities.height.max]);
        }
        utilsUI.initResolutionsUI(
            listOfResolutions,
            this.device,
            this.os
        );
        this.setResolution(settings.width, settings.height);

        this.logger.log("Track  Settings:\n" + JSON.stringify(settings, null, 2));
        this.logger.log("Track  Capabilities:\n" + JSON.stringify(capabilities, null, 2));
    }

    getStream(constraints) {
        navigator.mediaDevices
            .getUserMedia(constraints)
            .then((stream) => {
                this.constraints = constraints;
                this.initStream(stream);
            })
            .catch((error) => {
                this.logger.log(`getUserMedia error for constrains: \n${JSON.stringify(constraints, null, 2)}:`);
                this.logger.logError(error);
            });
    }

    initStream(stream) {
        this.currentStream = stream;
        this.video.srcObject = stream;

        stream.getTracks().forEach((track) => {
            // might need all constraints for updated constrains stream request
            // but so far it was possible to apply additional constrains to the track
            this.currentTracks[track.kind] = track;
            // constrains are more like wishes, not necessarily granted
            // settings should provide width and height, and aspect ratio
            // keep in mind video frame should be set to size/pixelRatio
            let settings = track.getSettings();
            // track capabilities when available ~same as stream capabilities,
            // don't know about all environments
            let capabilities = track.getCapabilities
                ? track.getCapabilities()
                : {};
            this.changeSettings(track.kind, track.label, settings, capabilities);

            this.logger.log(`Track ${track.kind} ${track.label}`);
            this.logger.log("Track Stats:\n" + JSON.stringify(track.stats, null, 2));
        });
    }

    // TO DO 1: with audio tracks
    // TO DO 2: multiple cameras
    onCameraChange() {
        this.stopDeviceTracks();
        try {
            this.controls.reset("video-controls", this.controlsCallback);
        } catch (e) {
            this.logger.logError(e);
        }
        document.getElementById("resolution-select").innerHTML = "";

        if (this.select.value === "none") {
            return;
        }

        const deviceLabel = this.select.options[this.select.selectedIndex].text;
        const constraints = {
            video: { deviceId: { exact: this.select.value } },
            audio: false,
        };

        // default RealSense on first load (ideal defaults)
        this.device = utilsUI.getDeviceName(deviceLabel);
        if (this.device === "SR300 RGB") {
            constraints.video.width = { ideal: 1280 };
        } else if (this.device === "SR300 Depth") {
            constraints.video.frameRate = { ideal: 110 };
        } else if (this.device === "R200 Depth") {
            constraints.video.width = { ideal: 628, max: 640 };
        }

        this.logger.log(`Selected ${deviceLabel}`);
        this.logger.log(`Get constrains ${JSON.stringify(constraints, null, 2)}`);
        // should be prior to apply constrains: track.getConstrains();
        // but even if we only use deviceId as constrain to get the stream
        // most likely it will provide default webcam 640x480 and not what it's capable of

        this.getStream(constraints);
    }

    setOrientation(isWide) {
        this.wide = isWide;
    }

    setResolution(vidW, vidH) {
        let [w, h] = [vidW, vidH];
        if ((this.wide && w < h) || (!this.wide && w >= h)) {
            [w, h] = [vidH, vidW];
        }
        this.video.style.width = `${w / this.pixelRatio}px`;
        this.video.style.height = `${h / this.pixelRatio}px`;
        // canvas context should have right dimensions
        // it's easier to replace canvas than try to update context of existing one
        this.initGL(w, h);
        this.currentResolution = `${w}x${h}`;
        this.logger.log(`Resolution set to ${this.currentResolution}`);
    }

    // TODO: needs throttle, but still one value at a time
    controlsCallback(event) {
        const form = event.target.form;
        const trackKind = form.kind;
        let key = event.target.getAttribute("key");
        key = key || event.target.name;
        const value = event.target.value;
        const track = this.currentTracks[trackKind];

        // sometimes it's required to set "manual" mode before changes
        // but so far it changes between continuous and manual automatically

        if (this.currentSettings[key] === value) {
            return;
        }

        track
            .applyConstraints({
                advanced: [{ [key]: value }],
            })
            .then(() => {
                const newSettings = track.getSettings();
                if (newSettings[key] === this.currentSettings[key]) {
                    this.logger.log(
                        `Nothing changed: ${key} stays ${this.currentSettings[key]}`
                    );
                    // restore to the actual value instead of what we tried to set
                    try {
                        this.controls.setControlValue(form, key, newSettings[key]);
                    } catch (e) {
                        this.logger.logError(e);
                    }
                    return;
                }

                if (newSettings[key] === value) {
                    // success
                    this.logger.log(`Success! ${key} set to ${value}`);
                } else {
                    // usually those are rounding errors
                    this.logger.log(
                        `Warning: ${key} changed to ${newSettings[key]} instead of requested ${value}`
                    );
                }

                const changes = {};
                let controlsReset = false;
                const sharedKeys = new Set([
                    ...Object.keys(this.currentSettings),
                    ...Object.keys(newSettings),
                ]);
                sharedKeys.forEach((sKey) => {
                    if (
                        newSettings[sKey] === undefined
                        || this.currentSettings[sKey] === undefined
                    ) {
                        controlsReset = true;
                        // different set of settings, total reset needed for controls
                        this.logger.log(`Warning: Key ${sKey} is missing in one of the settings`);
                    }
                    if (this.currentSettings[sKey] !== newSettings[sKey]) {
                        changes[sKey] = newSettings[sKey];
                        if (sKey !== key) {
                            this.logger.log(`Warning: ${sKey} changed to ${newSettings[sKey]} too`);
                        }
                    }
                });
                if (controlsReset) {
                    let capabilities = track.getCapabilities
                        ? track.getCapabilities()
                        : {};
                    this.changeSettings(trackKind, track.label, newSettings, capabilities);
                    return;
                }

                this.logger.log(`Changes ${JSON.stringify(changes, null, 2)}`);

                // important! update currentSettings before updating controls
                // otherwise it will trigger another event
                this.currentSettings = newSettings;
                changes.forEach((chKey) =>{
                    try {
                        this.controls.setControlValue(form, chKey, changes[chKey]);
                    } catch (e) {
                        this.logger.logError(e);
                    }
                });

                if (
                    key === "width" || key === "height"
                        || key === "aspectRatio"
                ) {
                    // aspectRatio adjusts width and height to closest value in integers w,h
                    this.setResolution(
                        newSettings.width,
                        newSettings.height
                    );
                }
            })
            .catch((e) => {
                this.logger.log(`Failed set ${key} to ${value}`);
                this.logger.logError(e);
            });
    }

    onResolutionChange(event) {
        if (this.currentResolution === event.target.value) {
            return;
        }

        const [w, h] = event.target.value.split("x");
        if ((w + 0).isNan || (h + 0).isNan) {
            this.logger.log("Error: resolution should be in format \"width x height\"");
            return;
        }

        this.stopDeviceTracks();
        this.constraints.video.width = { ideal: w };
        this.constraints.video.height = { ideal: h };
        this.getStream(this.constraints);
    }

    initGL(w, h) {
        if (this.canvasGL) {
            this.canvasGL.destroy();
            this.canvasGL = null;
        }

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
        try {
            this.canvasGL = new VideoGL(
                this.video,
                this.device.includes("Depth"),
                "vCanvas",
                "outputCanvas",
                w,
                h
            );
        } catch (e) {
            this.logger.logError(e);
        }
    }
}
