import Clock from "./utils/Clock.js";
import { ProcessingWEBGL } from "./WebGL.js";
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

    constructor(env, deviceId, streamId) {
        super();

        this.env = env;
        this.deviceId = deviceId;
        this.streamId = streamId;

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

        this.resolutionsList = [];

        /**
         * [internal] Constrains object used to fetch the stream.
         * @type {object}
         */
        this.streamConstraints = { audio: false, video: false };

        /**
         * [internal] Constrains object used to apply constraints to existing track.
         * @type {object}
         */
        this.trackConstraints = {};

        /**
         * [internal] WxH actual dimensions of the video track.
         * @description str is plain WxH string, name is sorted WxH or HxW.
         * @description name does not depend on orientation.
         * @description name is used for options in resolution dropdown.
         * @type {{w: number, h: number, str: string, name: string}}
         */
        this.trackResolution = {
            w: 0, h: 0, str: "0x0", name: "0x0"
        };

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
         *  @type {
         *      audio: MediaControls,
         *      video: MediaControls,
         *  }
         * */
        this.controls = {
            audio: null,
            video: null
        };

        /**
         *  @type {
        *      audio: [],
        *      video: [],
        *  }
        * */
        this.controlsData = {
            audio: null,
            video: null
        };

        /**
         * @type {ScreenLogger}
         */
        this.logger = null;

        // to make bound callback event listener removable
        this.requestTrackChanges = this.requestTrackChanges.bind(this);
        this.onShowChange = this.onShowChange.bind(this);
        this.setOrientation = this.setOrientation.bind(this);
        this.onVideoPlayed = this.onVideoPlayed.bind(this);
        this.openControls = this.openControls.bind(this);
        this.onControlsDestroyed = this.onControlsDestroyed.bind(this);

        this.toggleAttribute = utilsUI.toggleAttribute.bind(this);

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

    /**
     * @param {Boolean} value
     * @description Show video element. Since iPhone stops streaming when video is not visible,
     * in order to make WebGL work, video element should be visible 1px x 1px.
     * if you don't care about WebGL on iPhone, you can just use display: none.
     */
    set showvideo(value) {
        this.toggleAttribute("showvideo", value);
        if (!this.video) return;
        // those dimensions could be different from track settings
        // could be 0 if not loaded or stalled, waiting etc.
        this.setVideoSize(
            this.video.videoWidth,
            this.video.videoHeight
        );
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

    setVideoSize(vidW, vidH) {
        const isVisible = this.getAttribute("showvideo");
        this.video.classList.toggle("keep-on-screen", !isVisible);
        // keep in mind video frame should be set to size/pixelRatio
        const [w, h] = isVisible
            ? [vidW / this.env.pixelRatio, vidH / this.env.pixelRatio] : [1, 1];
        this.video.style.width = `${w}px`;
        this.video.style.height = `${h}px`;
        this.logger.log(`Video style size set to ${w}x${h} from ${vidW}x${vidH} resolution`);
    }

    setOrientation() {
        if (!this.video) return;
        this.onVideoPlayed({ type: "orientation" });
    }

    onVideoPlayed(event) {
        this.logger.log(`${event.type} event`);
        this.logDimensions();
        if (this.video.videoWidth
            && this.video.videoHeight
            && `${this.video.videoWidth}x${this.video.videoHeight}` !== this.trackResolution.str) {
            this.logger.log("Video resolution or orientation changed");
            this.setResolution();
        }
    }

    logDimensions() {
        this.logger.log(
            `Video dimensions: ${this.video.videoWidth}x${this.video.videoHeight}`
            + `vs. ${this.trackResolution.str} resolution`
        );
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

    onControlsDestroyed(kind) {
        this.controls[kind] = null;
        this.querySelector(`.open-controls[kind=${kind}]`).disabled = false;
    }

    openControls(e) {
        let kind;
        if (typeof e === "object") {
            kind = e.target.getAttribute("kind");
            e.target.disabled = true;
        } else {
            kind = e;
        }

        if (!this.streamTracks[kind]) return;

        try {
            this.controls[kind] = new MediaControls();
            this.appendChild(this.controls[kind]);
            this.controls[kind].init({
                kind,
                label: this.streamTracks[kind].label,
                constraints: this.trackConstraints[kind],
                data: this.controlsData[kind],
                // capabilities: structuredClone(this.streamTracks[kind].capabilities),
                // settings: structuredClone(this.streamTracks[kind].settings),
                liveupdates: true,
                debouncetime: 500,
                updateCallback: this.requestTrackChanges,
                destroyCallback: this.onControlsDestroyed,
            });
        } catch (event) {
            this.logger.error(event);
        }
    }

    initVideoTrackUI(label) {
        this.videoPlace.appendChild(
            utilsUI.get({
                tag: "h5",
                text: label,
            })
        );
        this.videoPlace.appendChild(
            utilsUI.get({
                tag: "button",
                text: "✕",
                attrs: { class: "destroy" },
            })
        ).onclick = this.destroy.bind(this);
        this.resolutionLabel = this.videoPlace.appendChild(
            utilsUI.get({
                tag: "output",
                text: "set resolution",
            })
        );
        this.videoPlace.appendChild(
            utilsUI.get({
                tag: "input",
                attrs: {
                    type: "checkbox",
                    name: `showvideo-${this.streamId}`,
                    class: "showvideo",
                    value: true,
                },
            })
        ).addEventListener("change", this.onShowChange);
        this.videoPlace.appendChild(
            utilsUI.get({
                tag: "label",
                text: "video",
                attrs: { htmlFor: `showvideo-${this.streamId}` },
            })
        );
        this.videoPlace.appendChild(
            utilsUI.get({
                tag: "input",
                attrs: {
                    type: "checkbox",
                    name: `showwebgl-${this.streamId}`,
                    class: "showwebgl",
                    value: true,
                },
            })
        ).addEventListener("change", this.onShowChange);
        this.videoPlace.appendChild(
            utilsUI.get({
                tag: "label",
                text: "webGL",
                attrs: { htmlFor: `showwebgl-${this.streamId}` },
            })
        );
        this.videoPlace.appendChild(
            utilsUI.get({
                tag: "input",
                attrs: {
                    type: "checkbox",
                    name: `showoutcanvas-${this.streamId}`,
                    class: "showoutcanvas",
                    value: true,
                },
            })
        ).addEventListener("change", this.onShowChange);
        this.videoPlace.appendChild(
            utilsUI.get({
                tag: "label",
                text: "outCanvas",
                attrs: { htmlFor: `showoutcanvas-${this.streamId}` },
            })
        );

        this.videoPlace.appendChild(
            utilsUI.get({
                tag: "select",
                attrs: {
                    name: `resolution-select-${this.streamId}`,
                    class: "resolution-select",
                },
            })
        ).onchange = this.onResolutionDropdownChange.bind(this);
        this.videoPlace.appendChild(
            utilsUI.get({
                tag: "button",
                text: "⛶",
                attrs: {
                    kind: "video",
                },
            })
        ).onclick = this.onFullscreenClick.bind(this);
        this.videoPlace.appendChild(
            utilsUI.get({
                tag: "button",
                text: "📸",
            })
        ).onclick = this.takeSnapshot.bind(this);
        this.videoPlace.appendChild(
            utilsUI.get({
                tag: "button",
                text: "⚙",
                attrs: {
                    class: "open-controls",
                    kind: "video",
                },
            })
        ).onclick = this.openControls;

        this.video = this.videoPlace.appendChild(utilsUI.get({
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
        // HTMLMediaElement events
        // this.video.onloadstart = this.onVideoPlayed;
        // this.video.onloadedmetadata = this.onVideoPlayed;
        this.video.onloadeddata = this.onVideoPlayed;
        // this.video.onemptied = this.onVideoPlayed;
        // this.video.oncanplay = this.onVideoPlayed;
        // this.video.oncanplaythrough = this.onVideoPlayed;

        this.video.onsuspend = this.onVideoPlayed;
        this.video.onwaiting = this.onVideoPlayed;
        this.video.onstalled = this.onVideoPlayed;
        this.video.onerror = this.onVideoPlayed;

        this.video.onabort = this.onVideoPlayed;
        this.video.oncompleted = this.onVideoPlayed;
        this.video.onended = this.onVideoPlayed;

        this.video.onplay = this.onVideoPlayed;
        // this.video.onpause = this.onVideoPlayed;
        // this.video.onseeked = this.onVideoPlayed;
        // this.video.onseeking = this.onVideoPlayed;
        // this.video.onvolumechange = this.onVideoPlayed;
        // this.video.onratechange = this.onVideoPlayed;

        // this.video.onplaying = this.onVideoPlayed;
        // this.video.onprogress = this.onVideoPlayed;
        // this.video.ontimeupdate = this.onVideoPlayed;
        // deprecated but might be still working
        // this.video.audioprocess = this.onVideoPlayed;

        // HTMLVideoElement events
        this.video.onenterpictureinpicture = this.onVideoPlayed;
        this.video.onleavepictureinpicture = this.onVideoPlayed;
        // this is the only event to track phone webcam orientation
        // because it will flip w/h as it likes even if you add track constraints
        this.video.onresize = this.onVideoPlayed;
        // TODO: captureButton.addEventListener('click', takeScreenshot); // webGL
    }

    initAudioTrackUI(stream, label) {
        this.audioPlace.appendChild(
            utilsUI.get({
                tag: "h5",
                text: label,
            })
        );
        this.audioPlace.appendChild(
            utilsUI.get({
                tag: "button",
                text: "✕",
                attrs: { class: "destroy" },
            })
        ).onclick = this.destroy.bind(this); // TODO: remove audio track!!!
        this.audio = this.audioPlace.appendChild(
            utilsUI.get({
                tag: "meter",
                attrs: {
                    name: label,
                    max: 1,
                    value: 0,
                    hight: 0.25
                },
            })
        );
        this.audioPlace.appendChild(
            utilsUI.get({
                tag: "button",
                text: "🔇", // "🔈🕩🕨",
                attrs: { id: "toggle-audio" },
            })
        ); // TODO: mute audio
        this.audioPlace.appendChild(
            utilsUI.get({
                tag: "button",
                text: "⚙",
                attrs: {
                    class: "open-controls",
                    kind: "audio",
                },
            })
        ).onclick = this.openControls;

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
        this.streamTracks[track.kind] = {
            track,
            contentHint: track.contentHint,
            label: track.label,
            settings: track.getSettings(),
            capabilities: track.getCapabilities
                ? track.getCapabilities()
                : utilsUI.getTheoreticalCapabilities(),
        };
        this.logger.log(`Set track ${track.kind}:\n`);
        this.logger.log(JSON.stringify(this.streamTracks[track.kind], null, 2));
    }

    setConstraints(kind, updateStreamC, constraints, returnedConstraints) {
        const [streamC, trackC] = utilsUI.separateAndCleanConstraints(
            constraints,
            returnedConstraints,
            this.streamTracks[kind].settings
        );
        if (updateStreamC) {
            this.streamConstraints[kind] = streamC;
        }
        this.trackConstraints[kind] = trackC;
    }

    setControlsData(kind) {
        const data = utilsUI.getControlsData(
            this.trackConstraints[kind],
            this.streamTracks[kind].settings,
            this.streamTracks[kind].capabilities,
            this.logger.log
        );
        this.controlsData[kind] = data.controlsData;
        this.trackConstraints[kind] = data.cleaned;
    }

    setStream(device, constraints, stream, onReleaseCallback) {
        this.streamdevice = device;
        this.setAttribute("streamdevice", device);

        this.logger.log(`Stream constraints:\n ${JSON.stringify(constraints, null, 2)}`);
        this.onRelease = onReleaseCallback;

        this.videoPlace = this.appendChild(utilsUI.get({ tag: "div" }));
        this.audioPlace = this.appendChild(utilsUI.get({ tag: "div" }));

        stream.getTracks().forEach((track) => {
            this.setTrack(track);
            this.setConstraints(track.kind, true, constraints[track.kind], track.getConstraints());
            this.setControlsData(track.kind);
            if (track.kind === "video") {
                this.initVideoTrackUI(track.label || device);
                this.video.srcObject = stream;
                this.resetResolutions();
                this.showwebgl = true;
            } else if (track.kind === "audio") {
                this.initAudioTrackUI(stream, track.label);
            }
            track.onended = this.onVideoPlayed;
            track.onmute = this.onVideoPlayed;
            track.onunmute = this.onVideoPlayed;
        });
        this.logger.log(`Returned S constraints:\n ${JSON.stringify(this.streamConstraints, null, 2)}`);
        this.logger.log(`Returned T constraints:\n ${JSON.stringify(this.trackConstraints, null, 2)}`);
        this.env.on("orientation", this.setOrientation);
    }

    rollbackStream() {
        // TODO track *and stream* constraints
        navigator.mediaDevices
            .getUserMedia(this.trackConstraints)
            .then((stream) => {
                stream.getTracks().forEach((track) => {
                    this.setTrack(track);
                    this.updateTrackControls(track.kind, [], []);
                    if (track.kind === "video") {
                        this.selectCurrentResolution();
                    }
                });
            })
            .catch((error) => {
                this.logger.log("RollBack error for constrains:\n"
                    + JSON.stringify(this.trackConstraints, null, 2));
                this.logger.error(error);
            });
    }

    /**
     * @description Last resort to change track settings through changing stream.
     * some settings need tracks to be stopped in order to make changes
     * for example noiseSuppression and other boolean audio constraints
     */
    requestStreamChanges(trackKind, changes, requestConstraints) {
        this.stopDeviceTracks();
        const oldSettings = structuredClone(this.streamTracks[trackKind].settings);
        const constraints = Object.keys(this.streamConstraints).reduce((acc, kind) => {
            acc[kind] = !this.streamConstraints[kind] ? false
                : Object.assign(
                    {},
                    this.streamConstraints[kind],
                    kind === trackKind ? requestConstraints : this.trackConstraints[kind]
                );
            return acc;
        }, {});
        this.logger.log(
            `Requesting *stream* with constraints ${JSON.stringify(constraints, null, 2)}`
        );
        this.logger.log(`Old ${trackKind} settings ${JSON.stringify(oldSettings, null, 2)}`);
        this.logger.log(`Intended changes ${JSON.stringify(changes, null, 2)}`);
        navigator.mediaDevices
            .getUserMedia(constraints)
            .then((stream) => {
                stream.getTracks().forEach((track) => {
                    this.setTrack(track);
                    if (track.kind === "video") {
                        this.video.srcObject = stream;
                    } else if (track.kind === "audio" && trackKind === "video") {
                        // this.initAudioTrackUI(stream);
                    }
                    // potentially here could have happened changes in other tracks
                    // but ignoring for now
                    if (track.kind === trackKind) {
                        this.postChangesCheck(
                            trackKind,
                            changes,
                            this.streamTracks[track.kind].settings, // since setTrack() updated it
                            oldSettings,
                            constraints[trackKind],
                            track.getConstraints(),
                            2
                        );
                    }
                });
            })
            .catch((error) => {
                this.logger.log("Request stream changes error for constrains:\n"
                    + JSON.stringify(constraints, null, 2));
                this.logger.error(error);
                this.rollbackStream();
            });
    }

    requestTrackChanges(trackKind, changes, requestConstraints) {
        const track = this.streamTracks[trackKind].track;
        if (!track) {
            this.logger.log(`Warning: No ${trackKind} track found to apply changes`);
            return;
        }

        const oldSettings = structuredClone(this.streamTracks[trackKind].settings);
        if (utilsUI.findUnchanged(oldSettings, changes, changes)) {
            this.logger.log(`Warning: Matches current ${trackKind} settings. Nothing to change`);
            // this.logger.log(`Intended changes ${JSON.stringify(changes, null, 2)}`);
            // this.logger.log(`Old settings ${JSON.stringify(oldSettings, null, 2)}`);
            // this.logger.log(`Current settings ${JSON.stringify(track.getSettings(), null, 2)}`);
            return;
        }
        const stages = utilsUI.getConstraintStages(requestConstraints);
        if (stages.length === 0) {
            this.logger.log("Warning: No constraints to apply");
            return;
        }
        // it's not necessary to set all constraints, only those that are changed
        // but it's cleaner way to keep them all of them at one glance
        // to avoid "overconstrained" error we should set them in stages
        // "media" and "imageCapture" constraints should be separated
        // as well as switch to "manual" might require separate call
        this.logger.log(`Requested track changes for ${trackKind} track:\n`
            + JSON.stringify(changes, null, 2));
        // this.logger.log(`from constraints ${JSON.stringify(this.trackConstraints[trackKind], null, 2)}`);
        // this.logger.log(`New track constraints ${JSON.stringify(requestConstraints, null, 2)}`);
        // this.logger.log(`Applying constraints in stages:\n ${JSON.stringify(stages, null, 2)}`);
        // this.logger.log(`Checking ${trackKind} track settings:\n ${JSON.stringify(track.getSettings(), null, 2)}`);

        const returnedConstraints = {};
        track
            .applyConstraints(stages[0])
            .then(() => {
                Object.assign(returnedConstraints, track.getConstraints());
                if (stages.length > 1) {
                    return track.applyConstraints(stages[1]);
                } return Promise.resolve();
            })
            .then(() => {
                Object.assign(returnedConstraints, track.getConstraints());
                if (stages.length > 2) {
                    return track.applyConstraints(stages[2]);
                } return Promise.resolve();
            })
            .then(() => {
                Object.assign(returnedConstraints, track.getConstraints());
                this.postChangesCheck(
                    trackKind,
                    changes,
                    track.getSettings(),
                    oldSettings,
                    requestConstraints,
                    returnedConstraints,
                    1
                );
            })
            .catch((e) => {
                this.logger.log(`Failed set track changes ${JSON.stringify(changes, null, 2)}`);
                this.logger.log(`applyConstraints error for constrains: \n${JSON.stringify(requestConstraints, null, 2)}:`);
                this.logger.error(e);
                // since "overconstrained" error means that the track stays the same
                // we should reset the controls to the actual values (and resolution dropdown)
                // if (e instanceof DOMException && e.name === "OverconstrainedError") {
                // }
                this.onFailedTrackChanges(
                    trackKind,
                    changes,
                    Object.keys(changes),
                    requestConstraints,
                    1
                );
            });
    }

    onFailedTrackChanges(kind, changes, unchangedKeys, requestConstraints, attempt) {
        if (attempt === 1) {
            this.requestStreamChanges(kind, changes, requestConstraints);
            return;
        }
        // roll back input values (instead of what we attempted to set)
        this.updateTrackControls(kind, [], unchangedKeys);
        if (kind === "video") {
            this.selectCurrentResolution();
        }
    }

    postChangesCheck(kind, changes, newSettings, oldSettings, requestC, returnedC, attempt) {
        if (Object.keys(changes).length === 0) return;

        this.logger.log("Post request check:");
        const unchanged = utilsUI.findUnchanged(
            oldSettings,
            this.streamTracks[kind].settings,
            changes
        );
        if (unchanged) {
            this.reportUnchanged(kind, requestC, unchanged, changes, attempt);
            this.onFailedTrackChanges(kind, changes, Object.keys(unchanged), requestC, attempt);
            return;
        }

        // Successful
        this.logger.log(`Successful change on ${attempt} attempt: Track ${kind} settings updated:`
            + `\n ${JSON.stringify(newSettings, null, 2)}`);
        // settings updated for 1st attempt since 2nd used setTrack() already
        if (attempt === 1) {
            this.streamTracks[kind].settings = newSettings;
        }
        this.setConstraints(kind, (attempt === 2), requestC, returnedC);
        this.updateChangedInputs(kind, changes, newSettings, oldSettings);
    }

    reportUnchanged(kind, constraints, unchanged, intendedChanges, attempt) {
        this.logger.log(
            `Warning: Nothing changed in ${kind} settings.`
            + `Attempt #${attempt}:\n ${JSON.stringify(unchanged, null, 2)}`
            + `Used Constraints ${JSON.stringify(constraints, null, 2)}\n`
        );
    }

    updateTrackControls(trackKind, changedKeys, unchangedKeys) {
        if (!this.controls[trackKind]) return;
        try {
            this.controls[trackKind].updateControls(
                this.controlsData[trackKind],
                changedKeys,
                unchangedKeys,
                this.trackConstraints[trackKind]
            );
        } catch (e) {
            this.logger.error(e);
        }
    }

    updateChangedInputs(trackKind, intendedChanges, newSettings, oldSettings) {
        const changeKeys = [];
        const unchangedKeys = [];
        let controlsReset = false;
        utilsUI.uniqueKeys(oldSettings, newSettings).forEach((sKey) => {
            if (
                newSettings[sKey] === undefined || oldSettings[sKey] === undefined
            ) {
                controlsReset = true;
                // TODO: different set of settings, total reset needed for controls
                // For example, pan change can change zoom too which is not in capabilities
                // but still appears in new settings
                this.logger.log(`Warning: Key ${sKey} is missing in one of the settings`);
            }
            if (oldSettings[sKey] !== newSettings[sKey]) {
                changeKeys.push(sKey);
                this.controlsData[trackKind][sKey].value = newSettings[sKey];
                if (sKey in intendedChanges && intendedChanges[sKey] === newSettings[sKey]) {
                    this.logger.log(`[${sKey}] changed to ${newSettings[sKey]}`);
                } else if (sKey in intendedChanges && intendedChanges[sKey] !== newSettings[sKey]) {
                    // usually those are just rounding errors -> measure % difference
                    // also sometimes width and height could be flipped
                    this.logger.log(
                        `Warning: ${sKey} changed to ${newSettings[sKey]} instead of requested ${intendedChanges[sKey]}`
                    );
                } else {
                    this.logger.log(`Warning: ${sKey} changed to ${newSettings[sKey]} too`);
                }
            } else if (sKey in intendedChanges) {
                this.logger.log(`[${sKey}] is unchanged`);
                unchangedKeys.push(sKey);
            }
        });

        if (controlsReset && trackKind === "video") {
            this.streamTracks.video.capabilities = this.streamTracks.video.track.getCapabilities
                ? this.streamTracks.video.track.getCapabilities()
                : {};
            this.resetResolutions();
            this.resetControls(trackKind);
            return;
        }

        this.updateTrackControls(trackKind, changeKeys, unchangedKeys);
    }

    resetControls(kind) {
        this.setControlsData(kind);
        try {
            if (this.controls[kind]) {
                // remove should trigger reset() with all event listeners removal
                this.controls[kind].remove();
                this.controls[kind] = null;
                this.openControls(kind);
            }
        } catch (e) {
            this.logger.error(e);
        }
    }

    onResolutionDropdownChange(event) {
        if (!event || !event.target || !event.target.value) return;
        const changes = this.env.parseResolutionName(event.target.value);
        this.changeResolution(changes);
    }

    onFullscreenClick() {
        const [w, h] = this.env.getFullScreenBox();
        const resolutions = structuredClone(this.resolutionsList);
        resolutions.sort((a, b) => Math.abs((b[0] - w) * (b[1] - h))
            - Math.abs((a[0] - w) * (a[1] - h)));
        const optimal = resolutions.pop();
        this.changeResolution({ width: optimal[0], height: optimal[1] });
    }

    // advanced: the lower set in the advanced is the least priority
    // each set in advanced is either satisfied or failed together
    // all values in the advanced sets treated as "exact"
    // if advanced fails it tries to go as close as possible to "ideal"
    // "max", "min", or "exact" are always treated as mandatory
    // meaning if it's not possible to satisfy Promise will be rejected
    // *mandatory* constraints might not be allowed at all for some keys
    // throwing "Mandatory pan constraints are not supported" error
    // with mandatory in one hand you'll know it's not possible, and act on it
    // (in the other hand it might get somewhat satisfied without "exact")
    changeResolution(newRes) {
        if (this.trackResolution.name === `${newRes.width}x${newRes.height}`) {
            this.logger.log("Warning: resolution is already set to " + this.trackResolution.name);
            return;
        }
        const videoConstraints = structuredClone(this.trackConstraints.video);
        videoConstraints.advanced = videoConstraints.advanced || [];
        videoConstraints.advanced.unshift(newRes);
        videoConstraints.width = "width" in videoConstraints
            ? Object.assign(videoConstraints.width, { ideal: newRes.width })
            : { ideal: newRes.width };
        videoConstraints.height = "height" in videoConstraints
            ? Object.assign(videoConstraints.height, { ideal: newRes.height })
            : { ideal: newRes.height };
        if ("aspectRatio" in videoConstraints) {
            delete videoConstraints.aspectRatio;
        }
        this.requestTrackChanges("video", newRes, videoConstraints);
    }

    resetResolutions() {
        const settings = this.streamTracks.video.settings;
        const capabilities = this.streamTracks.video.capabilities;

        const [w, h] = [settings.width, settings.height].toSorted((a, b) => b - a);
        const listOfResolutions = [[w, h]];
        if (capabilities.width && capabilities.height) {
            const [W, H] = [capabilities.width.max, capabilities.height.max]
                .toSorted((a, b) => b - a);
            listOfResolutions.push([W, H]);
        }
        this.initResolutionsUI(
            listOfResolutions,
            this.streamdevice,
            this.env.os
        );
    }

    selectCurrentResolution() {
        const resHolder = this.querySelector(".resolution-select");
        if (!resHolder) return;
        const index = Array.from(resHolder.options).findIndex(
            (option) => option.value === this.trackResolution
        );
        if (index !== -1) {
            resHolder.selectedIndex = index;
        }
        this.resolutionLabel.textContent = (index !== -1)
            ? this.trackResolution.str : resHolder.options[resHolder.selectedIndex].textContent;
    }

    setResolution() {
        if (!this.video) return;
        // TODO: verify influence of cut/resize constraint on this
        const [w, h] = [this.video.videoWidth, this.video.videoHeight];
        this.setVideoSize(w, h);

        // canvas context should have right dimensions
        // it's easier to replace canvas than try to update context of existing one
        this.destroyCanvases();
        try {
            this.canvasGL = new ProcessingWEBGL(
                this.streamId,
                32, // depth,
                w, // width,
                h, // height,
                this.env.pixelRatio, // pixelRatio = 1,
                this.video, // source = null,
                true, // watch = false,
                this.logger // logger
            );
        } catch (e) {
            this.logger.error(e);
        }

        this.trackResolution = {
            w, h, str: `${w}x${h}`, name: w > h ? `${w}x${h}` : `${h}x${w}`
        };
        this.logger.log(`Resolution is set to ${this.trackResolution.str}`);
        this.selectCurrentResolution();
    }

    initResolutionsUI(givenRs, camera, os) {
        // resolution switch is a shortcut to Box options in controls
        // since capabilities are not always available, control could be imaginary
        // overall size affects frame rate, so, no guarantee that it will be granted
        // TODO 2: best resolution for the screen
        // TODO 3: scan resolutions that will not switch to cut/resize in vid.settings
        const resHolder = this.querySelector(".resolution-select");
        resHolder.innerHTML = "";
        const resolutions = utilsUI.getResolutions(givenRs, camera, os);
        this.resolutionsList = resolutions;

        this.logger.log("Available resolutions:\n" + JSON.stringify(resolutions, null, 2));

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
            // TODO: remove track event listeners
            track.stop();
        });
        // TODO: remove video event listeners
        this.video.srcObject = null;
        this.streamTracks.audio.track = null;
        this.streamTracks.video.track = null;
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
        this.onRelease(this.deviceId, this.streamId);
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

    takeSnapshot() {
        if (!this.canvasGL || !this.canvasGL.out2DCanvasID) return;
        const canvas = document.getElementById(this.canvasGL.out2DCanvasID);
        utilsUI.downloadImage(canvas);
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
