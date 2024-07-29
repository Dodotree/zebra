import Clock from "./utils/Clock.js";
import VideoGL from "./glVideo.js";
import { MediaControls } from "./mediaControls.js";
import { utilsUI } from "./utils/UI.js";

export class MediaElement extends HTMLElement {
    static get observedAttributes() {
        // any attribute for use here should be in low case
        return ["showvideo", "showwebgl", "showoutcanvas"];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        const checkbox = this.querySelector(`.${name}`);
        if (checkbox && checkbox.checked !== newValue) checkbox.checked = newValue;
    }

    constructor(env) {
        super();

        this.env = env;

        /**
         * @type {HTMLVideoElement}
         */
        this.video = null;

        /**
         * @type {HTMLCanvasElement}
         */
        this.canvasGL = null;

        /**
         * [internal] Camera or mic name.
         * @type {string}
         */
        this.streamdevice = "";

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
         *              contentHint: string,
         *              label: string,
         *              settings: object,
         *              capabilities: object,
         *         },
         *  video:
         *         {
         *              track: MediaStreamTrack,
         *              contentHint: string,
        *               label: string,
         *              settings: object,
         *              capabilities: object,
        *         }
         * }}
         * @description Current stream tracks for controls callback.
         */
        this.streamTracks = {
            audio: { track: null },
            video: { track: null }
        };

        /**
         *  @type {{
         *      audio: MediaControls,
         *      video: MediaControls,
         *  }}
         * */
        this.controls = {
            audio: null,
            video: null
        };

        /**
         * @type {ScreenLogger}
         */
        this.logger = null;

        // to make bound callback event listener removable
        this.controlsCallback = utilsUI.debounce(this.controlsCallback.bind(this), 400);
        this.onShowChange = this.onShowChange.bind(this);
        this.setOrientation = this.setOrientation.bind(this);

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
     * @description Show video element. Since iPhone stops streaming when video is not visible,
     * in order to make WebGL work, video element should be visible 1px x 1px.
     * if you don't care about WebGL on iPhone, you can just use display: none.
     */
    set showvideo(value) {
        this.toggleAttribute("showvideo", value);

        if (!this.video) return;
        const [w, h] = this.env.orientedResolution(
            this.streamTracks.video.settings.width,
            this.streamTracks.video.settings.height
        );
        this.setVideoSize(w, h);
    }

    setVideoSize(vidW, vidH) {
        const [w, h] = this.getAttribute("showvideo")
            ? [vidW / this.env.pixelRatio, vidH / this.env.pixelRatio] : [1, 1];
        this.video.style.width = `${w}px`;
        this.video.style.height = `${h}px`;
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

    /**
     * `CustomElement` lifecycle callback. Invoked each time the custom element is appended into a
     * document-connected element.
     */
    connectedCallback() {
        this.logger = document.getElementsByTagName("screen-logger")[0];

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

    openControls() {
        Object.keys(this.streamTracks).forEach((kind) => {
            // TODO reuse controls if possible
            // remove controls from previous instance if any, connect to this one
            if (this.streamTracks[kind].track) {
                try {
                    this.controls[kind] = new MediaControls();
                    document.body.insertBefore(this.controls[kind], this);
                    this.controls[kind].init(
                        kind,
                        this.streamTracks[kind],
                        this.controlsCallback
                    );
                } catch (e) {
                    this.logger.error(e);
                }
            }
        });
    }

    initVideoTrackUI() {
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
        this.video = this.appendChild(utilsUI.get({
            tag: "video",
            attrs: {
                controls: true,
                autoplay: true,
                playsInline: true,
                preload: "auto",
                loop: true,
                crossOrigin: "anonymous",
            },
        }));
        // TODO: captureButton.addEventListener('click', takeScreenshot); // webGL
    }

    initAudioTrackUI(stream) {
        // TODO: visualization of sound to show it's working
        this.logger.log("Audio track");
        this.audio = this.appendChild(
            utilsUI.get({
                tag: "meter",
                attrs: {
                    max: 1,
                    value: 0,
                    hight: 0.25
                },
            })
        );
        try {
            // TODO: separate as audio visualizer component
            this.clock = new Clock();
            const audioContext = new AudioContext();
            const audioNode = audioContext.createMediaStreamSource(stream);
            const analyserNode = audioContext.createAnalyser();
            audioNode.connect(analyserNode);

            const pcmData = new Float32Array(analyserNode.fftSize);
            this.clock.on("tick", () => {
                analyserNode.getFloatTimeDomainData(pcmData);
                // const sum = pcmData.reduce((acc, val) => acc + val, 0);
                // this.audio.value = sum / pcmData.length;
                let sumSquares = 0.0;
                // eslint-disable-next-line no-restricted-syntax
                for (const amplitude of pcmData) { sumSquares += amplitude * amplitude; }
                this.audio.value = Math.sqrt(sumSquares / pcmData.length);
            });
        } catch (e) {
            this.logger.error(e);
        }
    }

    setTrack(track) {
        // track capabilities when available ~same as stream capabilities,
        // don't know about all environments
        // track has: kind, contentHint
        // id, label, muted, enabled, readyState(live, ended), onmute, onunmute, onended
        const current = {
            track,
            contentHint: track.contentHint,
            label: track.label,
            settings: track.getSettings(),
            capabilities: track.getCapabilities
                ? track.getCapabilities()
                : {},
        };
        this.streamTracks[track.kind] = current;
        this.logger.log(`Track ${track.kind} ${track.contentHint} ${track.label}\n`
            + "Settings:\n" + JSON.stringify(current.settings, null, 2)
            + "Stats:\n" + JSON.stringify(track.stats, null, 2));
    }

    setStream(device, constraints, stream, onRelease) {
        this.streamdevice = device;
        this.setAttribute("streamdevice", device);

        this.currentConstraints = constraints;
        this.onRelease = onRelease;

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
            })
        ).onclick = this.openControls.bind(this);
        caption.appendChild(
            utilsUI.get({
                tag: "button",
                text: "✕",
            })
        ).onclick = this.destroy.bind(this);

        stream.getTracks().forEach((track) => {
            this.setTrack(track);

            if (track.kind === "video") {
                this.initVideoTrackUI();
                this.video.srcObject = stream;
                this.resetResolutions();
                this.showwebgl = true;
            } else if (track.kind === "audio") {
                this.initAudioTrackUI(stream);
            }
        });

        this.env.on("orientation", this.setOrientation);
    }

    // TODO: after throttle maybe check for other keys too
    controlsCallback(event) {
        const form = event.target.form;
        const trackKind = form.kind;
        let key = event.target.getAttribute("key");
        key = key || event.target.name;
        const type = utilsUI.getValueTypeFromInputType(event.target.type);
        const value = type === "number" ? parseFloat(event.target.value) : event.target.value;

        // sometimes it's required to set "manual" mode before changes
        // but so far it changes between continuous and manual automatically
        this.requestTrackChanges(trackKind, type, { [key]: value });
    }

    setOrientation() {
        if (!this.trackResolution) return;
        const [w, h] = this.env.whFromResolution(this.trackResolution);
        this.setResolution(w, h);
    }

    resetResolutions() {
        // settings should provide width and height, and aspect ratio
        const settings = this.streamTracks.video.settings;
        const capabilities = this.streamTracks.video.capabilities;

        const listOfResolutions = [[settings.width, settings.height]];
        if (capabilities.width && capabilities.height) {
            listOfResolutions.push([capabilities.width.max, capabilities.height.max]);
        }
        this.initResolutionsUI(
            listOfResolutions,
            this.streamdevice,
            this.env.os
        );
        this.setResolution(settings.width, settings.height);

        this.logger.log("Track  Capabilities:\n" + JSON.stringify(capabilities, null, 2));
    }

    onRequestResolution(event) {
        if (this.trackResolution === event.target.value) {
            this.logger.log("Warning: resolution is already set to " + this.trackResolution);
            return;
        }
        const [w, h] = this.env.whFromResolution(event.target.value);
        this.requestTrackChanges("video", "number", { width: w, height: h });
    }

    setResolution(vidW, vidH) {
        let [w, h] = this.env.orientedResolution(vidW, vidH);
        // keep in mind video frame should be set to size/pixelRatio
        this.setVideoSize(w, h);
        // canvas context should have right dimensions
        // it's easier to replace canvas than try to update context of existing one
        this.initGL(w, h);
        // keeping the standard order in naming resolutions
        this.trackResolution = (w > h) ? `${w}x${h}` : `${h}x${w}`;

        const resHolder = this.querySelector(".resolution-select");
        const index = Array.from(resHolder.options).findIndex(
            (option) => option.value === this.trackResolution
        );
        if (index !== -1) {
            resHolder.selectedIndex = index;
        }

        this.logger.log(`Resolution set to ${this.trackResolution}`);
    }

    // make sure the original obj is not mutated, deep copy with modifications
    mergeOverride(o, oo) {
        const sharedKeys = new Set([...Object.keys(o), ...Object.keys(oo)]);
        return Array.from(sharedKeys.values()).reduce((acc, key) => {
            if (typeof o[key] === "object" && typeof oo[key] === "object") {
                acc[key] = this.mergeOverride(o[key], oo[key]);
            } else {
                acc[key] = key in oo ? oo[key] : o[key];
            }
            return acc;
        }, {});
    }

    /**
     * @description Last resort to change track settings through changing stream.
     * rollback if not successful.
     */
    requestStreamChanges(trackKind, changes, trackConstraints) {
        // constrains are more like wishes, not necessarily granted
        const oldSettings = this.streamTracks[trackKind].settings;
        this.stopDeviceTracks();
        const constraints = this.mergeOverride(
            this.currentConstraints,
            { [trackKind]: trackConstraints }
        );
        this.logger.log(
            `Requesting *stream* with constraints ${JSON.stringify(constraints, null, 2)}`
        );
        navigator.mediaDevices
            .getUserMedia(constraints)
            .then((stream) => {
                stream.getTracks().forEach((track) => {
                    this.setTrack(track);
                    if (track.kind === "video") {
                        this.video.srcObject = stream;
                        this.logger.log("Post stream request check:");
                        const unchanged = this.constructor.nothingChanged(
                            this.streamTracks[trackKind].settings,
                            oldSettings,
                            changes,
                            this.logger.log
                        );
                        if (unchanged) {
                            this.reportUnchanged(constraints, unchanged, changes, 2);
                            // restore to the actual value instead of what we tried to set
                            this.changeControls(trackKind, unchanged);
                            return;
                        }
                        // Successful
                        this.currentConstraints = constraints;
                        this.changeSetting(trackKind, oldSettings, changes);
                    } else if (track.kind === "audio") {
                        // this.initAudioTrackUI(stream);
                    }
                });
            })
            .catch((error) => {
                this.logger.log(`getUserMedia error for constrains: \n${JSON.stringify(constraints, null, 2)}:`);
                this.logger.error(error);
                // rollback. attempt once.
            });
    }

    requestTrackChanges(trackKind, type, changes) {
        const track = this.streamTracks[trackKind].track;
        const oldSettings = this.streamTracks[trackKind].settings;
        this.logger.log(`Requesting track changes ${JSON.stringify(changes, null, 2)}`
            + `Current track settings ${JSON.stringify(oldSettings, null, 2)}`
            + "Pre-check if such request really needed changes/old:");
        if (this.constructor.nothingChanged(changes, oldSettings, changes, this.logger.log)) {
            this.logger.log("Warning: Matches current settings. Nothing to change");
            return;
        }
        // TODO: don't rely on advanced since they are optional,
        // add required and min/max/ideal/exact
        // type could be useful for min/max reset if needed
        const constraints = Object.keys(changes).reduce((acc, key) => {
            acc[key] = { ideal: changes[key], exact: changes[key] };
            return acc;
        }, { advanced: [changes] });

        track
            .applyConstraints(constraints)
            .then(() => {
                const newSettings = track.getSettings();
                this.streamTracks[trackKind].settings = newSettings;
                this.logger.log("Post track request check:");
                const unchanged = this.constructor.nothingChanged(
                    newSettings,
                    oldSettings,
                    changes,
                    this.logger.log
                );
                if (unchanged) {
                    this.reportUnchanged(unchanged, changes, 1);
                    // it will restore control inputs if unsuccessful too
                    this.requestStreamChanges(trackKind, changes, constraints);
                    return;
                }
                // Successful
                this.logger.log("Success initiating changes:\n"
                    + "Track Constraints:\n" + JSON.stringify(constraints, null, 2)
                    + "New Settings:\n" + JSON.stringify(newSettings, null, 2)
                    + "Old Settings:\n" + JSON.stringify(oldSettings, null, 2)
                    + "Stats:\n" + JSON.stringify(track.stats, null, 2));
                // only need oldChanges for comparison since newSettings are already set
                this.changeSetting(trackKind, oldSettings, changes);
            })
            .catch((e) => {
                this.logger.log(`Failed set track changes ${JSON.stringify(changes, null, 2)}`);
                this.logger.log(`applyConstraints error for constrains: \n${JSON.stringify(constraints, null, 2)}:`);
                this.logger.error(e);
            });
    }

    // returns false if anything changed
    // returns intended change keys with their actual values (previous that stayed the same)
    static nothingChanged(newSettings, oldSettings, intendedChanges, log) {
        log("Nothing changed test:\n"
            + "New Settings:\n" + JSON.stringify(newSettings, null, 2)
            + "Old Settings:\n" + JSON.stringify(oldSettings, null, 2));
        // eslint-disable-next-line no-restricted-syntax
        for (const key in intendedChanges) {
            if (newSettings[key] !== oldSettings[key]) {
                log(`Found change [${key}] new/old:  ${newSettings[key]} != ${oldSettings[key]}\n`
                + `Intended change: [${key}] = ${intendedChanges[key]}\n`
                + `typeof ${typeof newSettings[key]} ${typeof oldSettings[key]}`);
                return false;
            }
        }
        const unchanged = Object.keys(intendedChanges).reduce((acc, key) => {
            acc[key] = newSettings[key];
            return acc;
        }, {});
        return unchanged;
    }

    reportUnchanged(constraints, unchanged, intendedChanges, attempt) {
        this.logger.log(
            `Warning: Nothing changed.\nIntended changes ${JSON.stringify(intendedChanges, null, 2)}`
            + `Used Constraints ${JSON.stringify(constraints, null, 2)}`
            + `Attempt ${attempt} left unchanged ${JSON.stringify(unchanged, null, 2)}`
        );
    }

    // important! update track[kind].settings before updating controls
    // otherwise it will trigger another event
    changeControls(trackKind, changes) {
        if (!this.controls[trackKind]) {
            return;
        }
        try {
            Object.keys(changes).forEach((key) => {
                this.controls[trackKind].setControlValue(key, changes[key]);
            });
        } catch (e) {
            this.logger.error(e);
        }
    }

    changeSetting(trackKind, oldSettings, intendedChanges) {
        const newSettings = this.streamTracks[trackKind].settings;

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
                        `Warning: ${sKey} changed to ${newSettings[sKey]} instead of requested ${intendedChanges[sKey]}`
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

        this.changeControls(trackKind, changes);

        if (["width", "height", "aspectRatio"].some(v=> Object.keys(changes).indexOf(v) >= 0)) {
            // aspectRatio adjusts width and height to closest value in integers w,h
            this.setResolution(
                newSettings.width,
                newSettings.height
            );
        }
    }

    static getAspectRatioTag(width, height) {
        let [w, h] = width > height ? [width, height] : [height, width];
        const aspKeys = [0, 0, 1, 1, 2, 3, 4, 5, 6, 7, 7, 8, 8, 8, 8, 9, 9, 9, 9, 10, 10, 10];
        const aspTags = ["1:1", "5:4", "4:3", "1.43:1 IMAX", "3:2", "8:5", "5:3", "16:9", "15:8 HDTV", "2.39:1", "2.75:1"];
        const keyIndex = Math.round(12 * (w / h)) - 12;
        if (keyIndex < 0 || keyIndex > aspKeys.length) return "";
        return aspTags[aspKeys[keyIndex]];
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

    stopDeviceTracks() {
        if (!this.video || !this.video.srcObject) return;
        this.video.srcObject.getTracks().forEach((track) => {
            track.stop();
        });
        this.video.srcObject = null;
        this.streamTracks.audio.track = null;
        this.streamTracks.audio.video = null;
    }

    destroy() {
        this.querySelectorAll("input[type='checkbox']").forEach((inp) => {
            inp.removeEventListener("change", this.onShowChange);
        });
        this.querySelectorAll("button").forEach((button) => {
            button.onclose = null;
        });
        this.querySelectorAll("select").forEach((select) => {
            select.onchange = null;
        });
        try {
            Object.keys(this.streamTracks).forEach((kind) => {
                if (this.controls[kind]) {
                    this.controls[kind].remove();
                    this.controls[kind] = null;
                }
            });
            this.env.remove("orientation", this.setOrientation);
        } catch (e) {
            this.logger.error(e);
        }
        this.stopDeviceTracks();
        this.destroyCanvases();
        this.onRelease(this.id);
        this.remove();
    }

    destroyCanvases() {
        if (!this.canvasGL) { return; }
        try {
            this.canvasGL.destroy();
            this.canvasGL = null;
        } catch (e) {
            this.logger.error(e);
        }
    }

    initGL(w, h) {
        this.destroyCanvases();
        const webGLCanvasID = "webGLCanvas" + this.streamdevice;
        const outCanvasID = "outCanvas" + this.streamdevice;
        this.appendChild(
            utilsUI.get({
                tag: "canvas",
                attrs: {
                    id: webGLCanvasID,
                    class: "webGLCanvas",
                    width: w,
                    height: h,
                    style: `width: ${w / this.env.pixelRatio}px; height: ${h / this.env.pixelRatio}px;`,
                },
            })
        );
        this.appendChild(
            utilsUI.get({
                tag: "canvas",
                attrs: {
                    id: outCanvasID,
                    class: "outCanvas",
                    width: w,
                    height: h,
                    style: `width: ${w / this.env.pixelRatio}px; height: ${h / this.env.pixelRatio}px;`,
                },
            })
        );
        try {
            this.canvasGL = new VideoGL(
                this.video,
                this.streamdevice.includes("Depth"),
                webGLCanvasID,
                outCanvasID,
                w,
                h
            );
        } catch (e) {
            this.logger.error(e);
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
