import VideoGL from "./glVideo.js";
import { MediaControls } from "./mediaControls.js";
import { utilsUI } from "./utils/UI.js";

export class MediaElement extends HTMLElement {
    static get observedAttributes() {
        return ["showvideo", "showwebgl", "showoutcanvas"];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        const checkbox = this.querySelector(`.${name}`);
        if (checkbox && checkbox.checked !== newValue) checkbox.checked = newValue;
    }

    constructor() {
        super();

        /**
         * @type {HTMLVideoElement}
         */
        this.video = null;

        /**
         * @type {HTMLCanvasElement}
         */
        this.canvasGL = null;

        /**
         * [internal] Display pixel ratio.
         * @type {number}
         */
        this.pixelRatio = 1;

        /**
         * [internal] OS name.
         * @type {string}
         */
        this.os = "";

        /**
         * [internal] w > h.
         * @type {boolean}
         */
        this.wide = false;

        /**
         * [internal] Camera or mic name.
         * @type {string}
         */
        this.streamdevice = "";

        /**
         * @type {MediaStream}
         */
        this.currentStream = null;

        /**
         * [internal] Constrains object used to fetch the stream.
         * @type {object}
         */
        this.currentConstraints = null;

        /**
         * [internal] WxH actual dimensions of the *video* track.
         * @type {string}
         */
        this.trackResolution = "";

        /**
         * @type {{
         *   audio:
         *         {
         *              track: MediaStreamTrack,
         *              label: string,
         *              settings: object,
         *              capabilities: object,
         *              controls: MediaControls
         *         },
         *  video:
         *         {
         *              track: MediaStreamTrack,
         *              label: string,
         *              settings: object,
         *              capabilities: object,
         *              controls: MediaControls
        *         }
         * }}
         * @description Current stream tracks for controls callback.
         */
        this.streamTracks = { audio: null, video: null };

        /**
         * @type {ScreenLogger}
         */
        this.logger = null;

        // to make bound callback event listener removable
        this.controlsCallback = utilsUI.debounce(this.controlsCallback.bind(this), 400);
        this.setOrientation = utilsUI.throttle(this.setOrientation.bind(this), 400);
        this.onShowChange = this.onShowChange.bind(this);

        /**
         * [config] Default `false`.
         * @type {boolean}
         */
        this.showvideo = false;

        /**
         * [config] Default `false`.
         * @type {boolean}
         */
        this.showwebgl = false;

        /**
         * [config] Default `false`.
         * @type {boolean}
         */
        this.showoutcanvas = false;

        /**
         * [config] Run stream when not displayed on the screen. Default `false`.
         * @type {boolean}
         */
        this.backgroundPlayOk = false;

        /**
         * [config] Run stream only when browser page on the screen. Stop when user change browser
         * tab or minimize browser windows.
         * @type {boolean}
         */
        this.visibilityCheck = true;

        /**
         * [config] Run stream only when player in the viewport. Stop when user scroll out player.
         * Value is percentage of visibility from `0` (not visible) to `1` (full visible).
         * Default `0` - disable;
         * @type {number}
         */
        this.visibilityThreshold = 0;
    }

    toggleAttribute(name, value) {
        if (value) {
            this.setAttribute(name, true);
        } else {
            this.removeAttribute(name);
        }
    }

    /**
     * @param {Boolean} value
     */
    set showvideo(value) {
        this.toggleAttribute("showvideo", value);
    }

    /**
     * @param {Boolean} value
     */
    set showwebgl(value) {
        this.toggleAttribute("showwebgl", value);
    }

    /**
     * @param {Boolean} value
     */
    set showoutcanvas(value) {
        this.toggleAttribute("showoutcanvas", value);
    }

    onShowChange(event) {
        this[event.target.name.replace(/-.*/, "")] = event.target.checked;
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
        this.streamTracks = { audio: null, video: null };
    }

    openControls() {
        Object.keys(this.streamTracks).forEach((kind) => {
            // TODO reuse controls if possible
            // remove controls from previous instance if any, connect to this one
            if (this.streamTracks[kind]) {
                try {
                    this.streamTracks[kind].controls = new MediaControls();
                    document.body.insertBefore(this.streamTracks[kind].controls, this);
                    this.streamTracks[kind].controls.init(
                        kind,
                        this.streamTracks[kind],
                        this.controlsCallback
                    );
                } catch (e) {
                    this.logger.logError(e);
                }
            }
        });
    }

    setStream(device, constraints, stream) {
        this.streamdevice = device;
        this.setAttribute("streamdevice", device);

        this.currentConstraints = constraints;
        this.currentStream = stream;

        const caption = this.appendChild(
            utilsUI.get({
                tag: "h4",
                text: device,
            })
        );
        caption.appendChild(
            utilsUI.get({
                tag: "button",
                text: "⚙",
                attrs: { onclick: this.openControls.bind(this) },
            })
        ).onclick = this.openControls.bind(this);

        stream.getTracks().forEach((track) => {
            // might need all constraints for updated constrains stream request
            // but so far it was possible to apply additional constrains to the track
            const current = {
                track,
                label: track.label,
                settings: track.getSettings(),
                capabilities: track.getCapabilities
                    ? track.getCapabilities()
                    : {},
                controls: null,
            };
            this.streamTracks[track.kind] = current;
            // constrains are more like wishes, not necessarily granted
            // settings should provide width and height, and aspect ratio
            // keep in mind video frame should be set to size/pixelRatio
            // track capabilities when available ~same as stream capabilities,
            // don't know about all environments
            if (track.kind === "video") {
                this.appendChild(
                    utilsUI.get({
                        tag: "input",
                        attrs: {
                            type: "checkbox",
                            name: `showvideo-${this.id}`,
                            class: "showvideo",
                            value: true,
                        },
                    })
                ).addEventListener("change", this.onShowChange);
                this.appendChild(
                    utilsUI.get({
                        tag: "label",
                        text: "video",
                        attrs: { htmlFor: `showvideo-${this.id}` },
                    })
                );
                this.appendChild(
                    utilsUI.get({
                        tag: "input",
                        attrs: {
                            type: "checkbox",
                            name: `showwebgl-${this.id}`,
                            class: "showwebgl",
                            value: true,
                        },
                    })
                ).addEventListener("change", this.onShowChange);
                this.appendChild(
                    utilsUI.get({
                        tag: "label",
                        text: "webGL",
                        attrs: { htmlFor: `showwebgl-${this.id}` },
                    })
                );
                this.appendChild(
                    utilsUI.get({
                        tag: "input",
                        attrs: {
                            type: "checkbox",
                            name: `showoutcanvas-${this.id}`,
                            class: "showoutcanvas",
                            value: true,
                        },
                    })
                ).addEventListener("change", this.onShowChange);
                this.appendChild(
                    utilsUI.get({
                        tag: "label",
                        text: "outCanvas",
                        attrs: { htmlFor: `showoutcanvas-${this.id}` },
                    })
                );

                this.appendChild(
                    utilsUI.get({
                        tag: "select",
                        attrs: {
                            name: `resolution-select-${this.id}`,
                            class: "resolution-select",
                        },
                    })
                ).onchange = this.onRequestResolution.bind(this);
                const vidW = current.settings.width;
                const vidH = current.settings.height;
                this.video = this.appendChild(utilsUI.get({
                    tag: "video",
                    attrs: {
                        controls: true,
                        autoplay: true,
                        playsInline: true,
                        preload: "auto",
                        loop: true,
                        crossOrigin: "anonymous",
                        style: `width: ${vidW / this.pixelRatio}px; height: ${vidH / this.pixelRatio}px;`,
                    },
                }));

                // TODO: captureButton.addEventListener('click', takeScreenshot); // webGL
                this.video.srcObject = stream;
                this.resetResolutions();
                this.showwebgl = true;
            } else if (track.kind === "audio") {
                // TODO: visualization of sound to show it's working
                this.logger.log("Audio track");
            }

            this.logger.log(`Track ${track.kind} ${track.label}`);
            this.logger.log("Track Stats:\n" + JSON.stringify(track.stats, null, 2));
        });
    }

    /**
     * `CustomElement` lifecycle callback. Invoked each time the custom element is appended into a
     * document-connected element.
     */
    connectedCallback() {
        this.logger = document.getElementsByTagName("screen-logger")[0];

        // TODO: in case of multiple displays
        // const mqString = `(resolution: ${window.devicePixelRatio}dppx)`;
        // const media = matchMedia(mqString);
        // media.addEventListener("change", updatePixelRatio.bind(this));

        this.pixelRatio = window.devicePixelRatio;
        this.os = this.constructor.getOS();
        this.watchOrientation();

        // TODO: capture image and video
        // <button for_id=""> Capture </button>

        // if you want it to play in the background there"s nothing else to setup
        if (this.backgroundPlayOk) return;

        // TODO:
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

    setOrientation(isWide) {
        this.wide = isWide;
        if (!this.currentResolution) return;
        const [w, h] = this.currentResolution.split("x");
        this.setResolution(w, h);
    }

    resetResolutions() {
        const settings = this.streamTracks.video.settings;
        const capabilities = this.streamTracks.video.capabilities;

        const listOfResolutions = [[settings.width, settings.height]];
        if (capabilities.width && capabilities.height) {
            listOfResolutions.push([capabilities.width.max, capabilities.height.max]);
        }
        this.initResolutionsUI(
            listOfResolutions,
            this.streamdevice,
            this.os
        );
        this.setResolution(settings.width, settings.height);

        this.logger.log("Track  Settings:\n" + JSON.stringify(settings, null, 2));
        this.logger.log("Track  Capabilities:\n" + JSON.stringify(capabilities, null, 2));
    }

    // TODO: after throttle maybe check for other keys too
    controlsCallback(event) {
        const form = event.target.form;
        const trackKind = form.kind;
        let key = event.target.getAttribute("key");
        key = key || event.target.name;
        const value = event.target.value;
        // sometimes it's required to set "manual" mode before changes
        // but so far it changes between continuous and manual automatically
        this.requestStreamChanges(trackKind, { [key]: value });
    }

    onRequestResolution(event) {
        if (this.trackResolution === event.target.value) {
            return;
        }

        const [w, h] = event.target.value.split("x").map(Number);
        if (w.isNan || h.isNan) {
            this.logger.log("Error: resolution should be in format \"width x height\"");
            return;
        }
        // "ideal" preferred for initiating the stream { width: { ideal: w }, height: { ideal: h } }
        this.requestStreamChanges("video", { width: w, height: h });
    }

    setResolution(vidW, vidH) {
        let [w, h] = [vidW, vidH];
        if ((this.wide && w < h) || (!this.wide && w >= h)) {
            [w, h] = [vidH, vidW];
        }
        this.video.style.width = `${w / this.pixelRatio}px`;
        this.video.style.height = `${h / this.pixelRatio}px`;
        this.style.width = `${w / this.pixelRatio + 20}px`;
        // canvas context should have right dimensions
        // it's easier to replace canvas than try to update context of existing one
        this.initGL(w, h);
        this.trackResolution = `${w}x${h}`;
        this.logger.log(`Resolution set to ${this.trackResolution}`);
    }

    requestStreamChanges(trackKind, changes) {
        const track = this.streamTracks[trackKind].track;
        const oldSettings = this.streamTracks[trackKind].settings;
        if (this.constructor.nothingChanged(changes, oldSettings, changes)) {
            return;
        }

        track
            .applyConstraints({
                advanced: [changes],
            })
            .then(() => {
                const newSettings = track.getSettings();
                this.changeSetting(trackKind, newSettings, oldSettings, changes);
            })
            .catch((e) => {
                this.logger.log(`Failed set stream changes ${JSON.stringify(changes, null, 2)}`);
                this.logger.logError(e);
            });
    }

    static nothingChanged(newSettings, oldSettings, intendedChange) {
        // eslint-disable-next-line no-restricted-syntax
        for (const key in intendedChange) {
            if (newSettings[key] !== oldSettings[key]) {
                return false;
            }
        }
        return true;
    }

    changeControls(trackKind, changes) {
        const controls = this.streamTracks[trackKind].controls;
        if (!controls) {
            return;
        }
        Object.keys(changes).forEach((key) => {
            controls.setControlValue(key, changes[key]);
        });
    }

    changeSetting(trackKind, newSettings, oldSettings, intendedChanges) {
        if (this.constructor.nothingChanged(newSettings, oldSettings, intendedChanges)) {
            this.logger.log(
                `Warning: Nothing changed. Intended changes ${JSON.stringify(intendedChanges, null, 2)}`
            );
            // restore to the actual value instead of what we tried to set
            try {
                const unchanged = Object.keys(intendedChanges).reduce((acc, key) => {
                    acc[key] = newSettings[key];
                    return acc;
                }, {});
                this.changeControls(trackKind, unchanged);
            } catch (e) {
                this.logger.logError(e);
            }
            return;
        }

        const changes = {};
        let controlsReset = false;
        const sharedKeys = new Set([
            ...Object.keys(oldSettings),
            ...Object.keys(newSettings),
        ]);
        sharedKeys.forEach((sKey) => {
            if (
                newSettings[sKey] === undefined
                        || oldSettings[sKey] === undefined
            ) {
                controlsReset = true;
                // different set of settings, total reset needed for controls
                this.logger.log(`Warning: Key ${sKey} is missing in one of the settings`);
            }
            if (oldSettings[sKey] !== newSettings[sKey]) {
                changes[sKey] = newSettings[sKey];
                if (sKey in intendedChanges && intendedChanges[sKey] === newSettings[sKey]) {
                    this.logger.log(`Success: ${sKey} changed to ${newSettings[sKey]}`);
                } else if (sKey in intendedChanges && intendedChanges[sKey] !== newSettings[sKey]) {
                    // usually those are rounding errors
                    this.logger.log(
                        `Warning: ${sKey} changed to ${newSettings[sKey]} instead of requested ${newSettings[sKey]}`
                    );
                } else {
                    this.logger.log(`Warning: ${sKey} changed to ${newSettings[sKey]} too`);
                }
            }
        });

        this.logger.log(`Changes ${JSON.stringify(changes, null, 2)}`);

        if (controlsReset && trackKind === "video") {
            this.streamTracks.video.settings = newSettings;
            this.streamTracks.video.capabilities = this.streamTracks.video.getCapabilities
                ? this.streamTracks.video.getCapabilities()
                : {};
            this.resetResolutions();
            return;
        }

        // important! update currentSettings before updating controls
        // otherwise it will trigger another event
        this.streamTracks[trackKind].settings = newSettings;
        try {
            this.changeControls(trackKind, changes);
        } catch (e) {
            this.logger.logError(e);
        }

        if (["width", "height", "aspectRatio"].some(v=> Object.keys(changes).indexOf(v) >= 0)) {
            // aspectRatio adjusts width and height to closest value in integers w,h
            this.setResolution(
                newSettings.width,
                newSettings.height
            );
        }
    }

    static getOrientation(angle, deviceWide) {
        return angle === 180 || angle === 0
            ? deviceWide
            : !deviceWide;
    }

    static getOS() {
        const uA = navigator.userAgent || navigator.vendor || window.opera;
        if ((/iPad|iPhone|iPod/.test(uA) && !window.MSStream) || (uA.includes("Mac") && "ontouchend" in document)) return "iOS";

        const os = ["Windows", "Android", "Unix", "Mac", "Linux", "BlackBerry"];
        // eslint-disable-next-line no-plusplus
        for (let i = 0; i < os.length; i++) if (new RegExp(os[i], "i").test(uA)) return os[i];
        return "unknown";
    }

    static getAspectRatioTag(width, height) {
        let [w, h] = width > height ? [width, height] : [height, width];
        const aspKeys = [0, 0, 1, 1, 2, 3, 4, 5, 6, 7, 7, 8, 8, 8, 8, 9, 9, 9, 9, 10, 10, 10];
        const aspTags = ["1:1", "5:4", "4:3", "1.43:1 IMAX", "3:2", "8:5", "5:3", "16:9", "15:8 HDTV", "2.39:1", "2.75:1"];
        const keyIndex = Math.round(12 * (w / h)) - 12;
        if (keyIndex < 0 || keyIndex > aspKeys.length) return "";
        return aspTags[aspKeys[keyIndex]];
    }

    watchOrientation() {
        let angle = 0;
        // eslint-disable-next-line no-restricted-globals
        const deviceWide = screen.width > screen.height;
        // eslint-disable-next-line no-restricted-globals
        if (screen && "orientation" in screen) {
            try {
                // eslint-disable-next-line no-restricted-globals
                angle = screen.orientation.angle;
            } catch (e) {
                this.logger.log(
                    `Screen orientation error:\n ${JSON.stringify(e, null, 2)}`
                );
            }
            this.logger.log(
                // eslint-disable-next-line no-restricted-globals
                `Screen orientation: ${angle} degrees, ${screen.orientation.type}.`
            );
            // eslint-disable-next-line no-restricted-globals
            screen.orientation.addEventListener("change", () => {
                // eslint-disable-next-line no-restricted-globals
                angle = screen.orientation.angle;
                const wide = this.constructor.getOrientation(angle, deviceWide);
                this.setOrientation(wide);
                this.logger.log(
                    // eslint-disable-next-line no-restricted-globals
                    `Screen orientation change: ${angle} degrees, ${screen.orientation.type}.`
                );
            });
        } else if ("onorientationchange" in window) {
            // for some mobile browsers
            try {
                angle = window.orientation;
            } catch (e) {
                this.logger.logError(e);
            }
            this.logger.log(`Window orientation: ${angle} degrees.`);
            window.addEventListener("orientationchange", () => {
                angle = window.orientation;
                const wide = this.constructor.getOrientation(angle, deviceWide);
                this.setOrientation(wide);
                this.logger.log(`Window orientation change: ${angle} degrees.`);
            });
        }
        const wide = this.constructor.getOrientation(angle, deviceWide);
        this.setOrientation(wide);
        this.logger.log(
            `Orientation ${angle} device ${deviceWide ? "Wide" : "Narrow"} => ${this.wide ? "Wide" : "Narrow"} screen`
        );
    }

    initResolutionsUI(givenRs, camera, os) {
        // resolution switch is a shortcut to Box options in controls
        // since capabilities are not always available, control could be imaginary
        // overall size affects frame rate, so, no guarantee that it will be granted
        // TODO 2: best resolution for the screen
        // TODO 3: scan resolutions that will not switch to cut/resize in vid.settings
        const resHolder = this.querySelector(".resolution-select");
        resHolder.innerHTML = "";

        let resolutions = [];
        const camResolutions = {
            "SR300 RGB": [
                [1920, 1080, "16:9 1080p Full HD", 30],
                [1280, 720, "16:9 720p HD", 60],
                [960, 540, "16:9", 60],
                [848, 480, "16:9 ~480p", 60],
                [640, 360, "16:9 360p", 60],
                [424, 240, "16:9", 60],
                [320, 180, "16:9", 60],
                [640, 480, "4:3", 60],
                [320, 240, "4:3", 60],
            ],
            "SR300 Depth": [
                [640, 480, "4:3 480p SD", 110],
            ],
            "R200 RGB": [
                [1920, 1080, "16:9 1080p Full HD", 30],
                [640, 480, "4:3 480p SD", 60],
            ],
            "R200 Depth": [
                [628, 468, "", 60],
                [480, 360, "4:3", 60],
                [320, 240, "4:3", 60],
            ]
        };
        const osResolutions = {
            iOS: [
                [4032, 3024, "4:3 12M", 60],
                [3264, 2448, "4:3", 60],
                [3088, 2320, "4:3", 60],
                [1280, 960, "4:3 720p HD", 60],
                [640, 480, "4:3 480p SD", 60],
                [3840, 2160, "1:1.9 2160p 4K Ultra HD", 60],
                [1920, 1080, "16:9 1080p Full HD", 60],
                [1280, 720, "16:9", 60],
            ],
            Android: [
                [4032, 3024, "4:3", 60],
                [4032, 1908, "Full", 60],
                [3024, 3024, "1:1", 60],
                [4032, 2268, "16:9", 60],
            ],
        };
        const defaultResolutions = [
            [640, 360, "16:9 360p", 60],
            [640, 480, "4:3 480p SD", 60],
            [1280, 720, "16:9 720p HD", 60],
            [1920, 1080, "16:9 1080p Full HD", 60],
            [2560, 1440, "16:9 1440p 2K", 60],
            [3840, 2160, "1:1.9 2160p 4K Ultra HD", 60],
            [7680, 4320, "16:9 8K Full Ultra HD", 60],
        ];
        if (camera in camResolutions) {
            resolutions = camResolutions[camera];
        } else if (os in osResolutions) {
            resolutions = osResolutions[os];
        } else {
            resolutions = defaultResolutions;
        }
        givenRs.forEach((res) => {
            if (!resolutions.some((r) => r[0] === res[0] && r[1] === res[1])) {
                res.push(this.constructor.getAspectRatioTag(res[0], res[1]));
                resolutions.push(res);
            }
        });
        // last givenRs is the maximum dimensions w,h provided by capabilities
        if (givenRs.length === 2) {
            resolutions = resolutions.filter((r) => r[0] <= givenRs[1][0] && r[1] <= givenRs[1][1]);
        }
        resolutions.forEach((row) => {
            const res = `${row[0]}x${row[1]}`;
            resHolder.appendChild(
                utilsUI.get({
                    tag: "option",
                    text: `${res} (${row[2]})`,
                    attrs: { value: res },
                })
            );
        });
        // first givenRs from actual track settings
        resHolder.value = `${givenRs[0][0]}x${givenRs[0][1]}`;
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
                    id: "webGLCanvas" + this.streamdevice,
                    class: "webGLCanvas",
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
                    id: "outCanvas" + this.streamdevice,
                    class: "outCanvas",
                    width: w,
                    height: h,
                    style: `width: ${w / this.pixelRatio}px; height: ${h / this.pixelRatio}px;`,
                },
            })
        );
        try {
            this.canvasGL = new VideoGL(
                this.video,
                this.streamdevice.includes("Depth"),
                "webGLCanvas" + this.streamdevice,
                "outCanvas" + this.streamdevice,
                w,
                h
            );
        } catch (e) {
            this.logger.logError(e);
        }
    }

    get hasAudio() {
        return (
            (this.video.srcObject
            && this.video.srcObject.getAudioTracks
            && this.video.srcObject.getAudioTracks().length)
            || this.video.mozHasAudio
            || this.video.webkitAudioDecodedByteCount
            || (this.video.audioTracks && this.video.audioTracks.length)
        );
    }
}

customElements.define("media-element", MediaElement);
