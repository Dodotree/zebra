import EventEmitter from "./EventEmitter.js";
import { utilsUI } from "./UI.js";

export default class Environment extends EventEmitter {
    constructor(logger) {
        super();

        /**
         * [internal] OS name.
         * @type {string}
         */
        this.os = this.constructor.getOS();

        /**
         * [internal] Display pixel ratio.
         * @type {number}
         */
        this.pixelRatio = window.devicePixelRatio;

        // eslint-disable-next-line no-restricted-globals
        this.deviceWide = screen.width > screen.height;

        /**
         * [internal] w > h.
         * @type {boolean}
         */
        this.wide = false;

        this.logger = logger || console;

        this.setOrientation = utilsUI.throttle(this.setOrientation.bind(this), 400);
        this.watchResizeOrientation = this.watchResizeOrientation.bind(this);

        this.watchOrientation();
        window.addEventListener("resize", this.watchResizeOrientation.bind(this));
    }

    static getOS() {
        const uA = navigator.userAgent || navigator.vendor || window.opera;
        if ((/iPad|iPhone|iPod/.test(uA) && !window.MSStream) || (uA.includes("Mac") && "ontouchend" in document)) return "iOS";

        const os = ["Windows", "Android", "Unix", "Mac", "Linux", "BlackBerry"];
        // eslint-disable-next-line no-plusplus
        for (let i = 0; i < os.length; i++) if (new RegExp(os[i], "i").test(uA)) return os[i];
        return "unknown";
    }

    // TODO: in case of multiple displays
    // const mqString = `(resolution: ${window.devicePixelRatio}dppx)`;
    // const media = matchMedia(mqString);
    // media.addEventListener("change", updatePixelRatio.bind(this));

    setOrientation(isWide) {
        if (this.wide === isWide) return;
        this.wide = isWide;
        this.emit("orientation", this.wide);
    }

    getOrientation(angle) {
        return angle === 180 || angle === 0
            ? this.deviceWide
            : !this.deviceWide;
    }

    orientedResolution(w, h) {
        if ((this.wide && w < h) || (!this.wide && w >= h)) {
            return [h, w];
        }
        return [w, h];
    }

    whFromResolution(resolution) {
        const [w, h] = resolution.split("x").map(Number);
        if (w.isNan || h.isNan) {
            this.logger.log("Error: resolution should be in format \"width x height\"");
            return [];
        }
        return [w, h]; // this.orientedResolution(w, h);
    }

    watchResizeOrientation() {
        this.setOrientation(window.innerWidth > window.innerHeight);
    }

    watchOrientation() {
        let angle = 0;

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
                const wide = this.getOrientation(angle);
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
                this.logger.error(e);
            }
            this.logger.log(`Window orientation: ${angle} degrees.`);
            window.addEventListener("orientationchange", () => {
                angle = window.orientation;
                const wide = this.getOrientation(angle);
                this.setOrientation(wide);
                this.logger.log(`Window orientation change: ${angle} degrees.`);
            });
        }
        const wide = this.getOrientation(angle);
        this.setOrientation(wide);
        this.logger.log(
            `Orientation ${angle} device ${this.deviceWide ? "Wide" : "Narrow"} => ${this.wide ? "Wide" : "Narrow"} screen`
        );
    }
}
