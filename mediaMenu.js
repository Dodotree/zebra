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

        this.appendChild(
            utilsUI.get({
                tag: "label",
                text: "Available streams:",
                attrs: { htmlFor: "device-select" },
            })
        );
        this.select = this.appendChild(
            utilsUI.get({
                tag: "select",
                attrs: { name: "device-select" },
            })
        );
        this.appendChild(
            utilsUI.get({
                tag: "button",
                text: "Add +",
            })
        ).onclick = this.onAddStream.bind(this);

        // test stream needed only to activate mediaDevices (firefox has incomplete info otherwise)
        // using Promises instead of async/await because we are inside lifecycle callback
        navigator.mediaDevices.getUserMedia({
            audio: true, // it's better to take all names to avoid confusion
            video: true,
        }).then((stream) => {
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
                        this.deviceIDstreams[mediaDevice.deviceId] = [];
                        const kind = mediaDevice.kind.replace("input", "");
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
                // now we can release the test stream
                stream.getTracks().forEach((track) => {
                    track.stop();
                });
            }).catch((error) => {
                this.logger.log("Error while fetching available streaming devices info");
                this.logger.error(error);
            });
        }).catch((err) => {
            this.logger.log("Initiating default stream error:\n");
            this.logger.error(err);
        });

        // TODO
        // const supportedOptions = navigator.mediaDevices.getSupportedConstraints();
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
                this.addStream(stream, deviceId, deviceName, constraints);
            })
            .catch((error) => {
                this.logger.log(`getUserMedia error for constrains: \n${JSON.stringify(constraints, null, 2)}:`);
                this.logger.error(error);
            });
    }

    onAddStream() {
        const selected = this.select.options[this.select.selectedIndex];
        const deviceLabel = selected.text;
        const deviceId = selected.value;
        const constraints = selected.getAttribute("kind") === "audioinput"
            ? { audio: { deviceId: { exact: deviceId } } }
            : { video: { deviceId: { exact: deviceId } } };

        // default RealSense on first load (ideal defaults)
        const deviceName = this.constructor.getDeviceName(deviceLabel);
        if (deviceName === "SR300 RGB") {
            constraints.video.width = { ideal: 1280 };
        } else if (deviceName === "SR300 Depth") {
            constraints.video.frameRate = { ideal: 110 };
        } else if (deviceName === "R200 Depth") {
            constraints.video.width = { ideal: 628, max: 640 };
        } else if (constraints.video) {
            // default webcam dimensions adjusted for orientation
            let [w, h] = this.env.orientedResolution(640, 480);
            constraints.video.width = { ideal: w };
            constraints.video.height = { ideal: h };
            constraints.video.aspectRatio = { ideal: w / h };
        }

        this.logger.log(`Selected ${deviceLabel}`);
        this.logger.log(`Get constrains ${JSON.stringify(constraints, null, 2)}`);
        // should be prior to apply constrains: track.getConstrains();
        // but even if we only use deviceId as constrain to get the stream
        // most likely it will provide default webcam 640x480 and not what it's capable of

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
