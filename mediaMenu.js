import { utilsUI } from "./utils/UI.js";
import Environment from "./utils/Environment.js";
import { MediaElement } from "./mediaElement.js";

export class MediaMenu extends HTMLElement {
    constructor() {
        super();

        /**
         * [config] Requested medias (video, audio, microphone).
         * @type {string}
         */
        this.media = "video,audio";

        /**
         * Firefox provides labels only when some stream is active.
         * if default one is taken and cannot launch, we will have to postpone
         * querying for real labels until we get some stream.
         * @type {boolean}
         */
        this.gotLabels = false;

        /**
         * @type {HTMLSelectElement}
         */
        this.select = null;

        /**
         * Each device has an array of cloned streamIDs.
         * @type {Object.<string, [string, string]>}
         */
        this.deviceIDstreams = {};

        this.onReleaseDevice = this.onReleaseDevice.bind(this);
    }

    /**
     * `CustomElement` lifecycle callback. Invoked each time the custom element is appended into a
     * document-connected element.
     */
    connectedCallback() {
        this.logger = document.getElementsByTagName("screen-logger")[0];
        this.env = new Environment(this.logger);

        this.select = this.appendChild(
            utilsUI.get({
                tag: "select",
                attrs: { name: "device-select" },
            })
        );
        this.appendChild(
            utilsUI.get({
                tag: "button",
                text: "Cam/Mic",
            })
        ).onclick = this.onAddStream.bind(this, false);
        this.appendChild(
            utilsUI.get({
                tag: "button",
                text: "Cam&Mic",
            })
        ).onclick = this.onAddStream.bind(this, true);

        // test stream needed only to activate mediaDevices (firefox has incomplete info otherwise)
        // using Promises instead of async/await because we are inside lifecycle callback
        navigator.mediaDevices.getUserMedia({
            audio: true, // it's better to take all names to avoid confusion
            video: true,
        }).then((stream) => {
            this.getDeviceList();
            // now we can release the test stream
            stream.getTracks().forEach((track) => {
                track.stop();
            });
        }).catch((err) => {
            this.logger.log("Initiating default stream error:\n");
            this.logger.error(err);
            this.getDeviceList();
        });
    }

    getDeviceList() {
        this.select.innerHTML = "";
        this.select.appendChild(
            utilsUI.get({
                tag: "option",
                text: "Select camera/microphone",
                attrs: {
                    value: "",
                    disabled: true,
                },
            })
        );
        navigator.mediaDevices.enumerateDevices().then((devices) => {
            const groups = devices.reduce((acc, device) => {
                if (device.kind.includes("output")) {
                    return acc;
                }
                if (!acc[device.groupId]) {
                    acc[device.groupId] = [];
                }
                acc[device.groupId].push(device);
                return acc;
            }, {});
            Object.keys(groups).forEach((groupId, index) => {
                const group = this.select.appendChild(
                    utilsUI.get({
                        tag: "optgroup",
                    })
                );
                groups[groupId].forEach((mediaDevice) => {
                    if (!(mediaDevice.deviceId in this.deviceIDstreams)) {
                        this.deviceIDstreams[mediaDevice.deviceId] = [];
                    }
                    const kind = mediaDevice.kind.replace("input", "");
                    this.gotLabels = this.gotLabels || !!mediaDevice.label;
                    const label = mediaDevice.label || (kind === "video" ? `Camera ${index}` : `Microphone ${index}`);
                    group.appendChild(
                        utilsUI.get({
                            tag: "option",
                            text: `${kind} ${label}`,
                            attrs: {
                                value: mediaDevice.deviceId,
                                groupId,
                                kind: mediaDevice.kind
                            },
                        })
                    );

                    this.logger.log(`Steam ${index} deviceId=${mediaDevice.deviceId}`);
                    if (mediaDevice.getCapabilities) {
                        this.logger.log(
                            `Capabilities:\n${JSON.stringify(mediaDevice.getCapabilities(), null, 2)}`
                        );
                    }
                });
            });
        }).catch((error) => {
            this.logger.log("Error while fetching available streaming devices info");
            this.logger.error(error);
        });
    }

    addStream(stream, deviceId, deviceName, constraints) {
        this.deviceIDstreams[deviceId].push(stream);
        const mediaUI = new MediaElement(this.env, deviceId, stream.id);
        document.body.insertBefore(
            mediaUI,
            document.querySelector("footer")
        );
        mediaUI.setStream(deviceName, constraints, stream, this.onReleaseDevice);
    }

    getStream(deviceId, deviceName, constraints) {
        if (this.deviceIDstreams[deviceId].length > 0) {
            const stream = this.deviceIDstreams[deviceId][0].clone();
            this.deviceIDstreams[deviceId].push(stream);
            this.addStream(stream, deviceId, deviceName, constraints);
            return;
        }
        navigator.mediaDevices
            .getUserMedia(constraints)
            .then((stream) => {
                if (!this.gotLabels) {
                    this.getDeviceList();
                }
                // if that's the first time we get the stream, we might not know
                // the actual device name yet, so constrains might be not ideal
                // TODO: reset constrains if it matters, so cloning will be right
                // or just close/open the stream
                // or TODO: iterate over all streams until one works and provides labels
                this.addStream(stream, deviceId, deviceName, constraints);
            })
            .catch((error) => {
                this.logger.log(`getUserMedia error for constrains: \n${JSON.stringify(constraints, null, 2)}:`);
                this.logger.error(error);
            });
    }

    onAddStream(withOtherTrack) {
        const selected = this.select.options[this.select.selectedIndex];
        const deviceLabel = selected.text;
        const deviceId = selected.value;
        const constraints = selected.getAttribute("kind") === "audioinput"
            ? { audio: { deviceId: { exact: deviceId } }, video: withOtherTrack }
            : {
                video: {
                    deviceId: { exact: deviceId }, pan: true, tilt: true, zoom: true
                },
                audio: withOtherTrack
            };

        // default RealSense on first load (ideal defaults)
        const deviceName = this.constructor.getDeviceName(deviceLabel);
        if (deviceName === "SR300 RGB") {
            constraints.video.width = { ideal: 1280 };
        } else if (deviceName === "SR300 Depth") {
            constraints.video.frameRate = { ideal: 110 };
        } else if (deviceName === "R200 Depth") {
            constraints.video.width = { ideal: 628, max: 640 };
        } else if (constraints.video && constraints.video.deviceId) {
            // default webcam dimensions adjusted for orientation
            // let [w, h] = this.env.orientedResolution(640, 480);
            constraints.video.width = { ideal: 640 };
            constraints.video.height = { ideal: 480 };
        }

        this.logger.log(`Selected ${deviceLabel}`);
        this.logger.log(`Get constrains ${JSON.stringify(constraints, null, 2)}`);

        this.getStream(this.select.value, deviceName, constraints);
    }

    static getDeviceName(label) {
        if (label.indexOf("RealSense") > -1) {
            if (label.indexOf("SR300") > -1 || label.includes("Camera S") > -1) {
                if (label.indexOf("RGB") > -1) {
                    return "SR300 RGB";
                }
                return "SR300 Depth";
            }
            if (label.indexOf("R200") > -1) {
                if (label.indexOf("RGB") > -1) {
                    return "R200 RGB";
                }
                return "R200 Depth";
            }
        }
        return label;
    }

    onReleaseDevice(deviceId, streamId) {
        this.deviceIDstreams[deviceId] = this.deviceIDstreams[deviceId]
            .filter((stream) => stream.id !== streamId);
    }
}

customElements.define("media-menu", MediaMenu);
