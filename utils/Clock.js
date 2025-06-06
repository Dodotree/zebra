import EventEmitter from "./EventEmitter.js";

// Abstracts away the requestAnimationFrame in an effort to provide a clock instance
// to sync various parts of an application
export default class Clock extends EventEmitter {
    constructor() {
        super();

        this.isRunning = true;

        this.tick = this.tick.bind(this);
        this.tick();

        window.onblur = () => {
            this.stop();
        };

        window.onfocus = () => {
            this.start();
        };
    }

    tick() {
        if (this.isRunning) {
            this.emit("tick");
        }
        requestAnimationFrame(this.tick);
    }

    start() {
        this.isRunning = true;
    }

    stop() {
        this.isRunning = false;
    }
}
