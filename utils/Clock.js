import EventEmitter from "./EventEmitter.js";

// Abstracts away the requestAnimationFrame in an effort to provide a clock instance
// to sync various parts of an application
export default class Clock extends EventEmitter {
    constructor(fpsMeter = null) {
        super();

        this.isRunning = true;
        this.isDestroyed = false;

        if (fpsMeter) {
            this.fpsMeter = fpsMeter;
            this.LOG_SIZE = 60;
            this.times = new Uint32Array(this.LOG_SIZE);
            this.times.fill(1000);
            this.timesIndex = 1;
            this.previousTime = 1000;
        }

        this.tick = fpsMeter ? this.measuredTick.bind(this) : this.justTick.bind(this);
        this.tick();

        window.addEventListener("blur", this.stop);
        window.addEventListener("focus", this.start);
    }

    justTick() {
        if (this.isRunning) {
            this.emit("tick");
        }
        if (this.isDestroyed) {
            this.destroy(); // one more time free it for garbage collector
            return;
        }
        requestAnimationFrame(this.tick);
    }

    measuredTick(time) {
        if (this.previousTime) {
            this.times[this.timesIndex] = 1000 / (time - this.previousTime);
            const minimum = this.times.reduce((c, v)=>Math.min(c, v), 1000);
            this.timesIndex = (this.timesIndex + 1) % this.times.length;
            this.fpsMeter.innerText = `${minimum.toPrecision(3)} fps in last ${ this.LOG_SIZE } frames`;
        }
        this.previousTime = time;
        if (this.isRunning) {
            this.emit("tick");
        }
        if (this.isDestroyed) {
            this.destroy(); // one more time free it for garbage collector
            return;
        }
        requestAnimationFrame(this.tick);
    }

    start() {
        this.isRunning = true;
    }

    stop() {
        this.isRunning = false;
    }

    destroy() {
        this.stop();
        this.isDestroyed = true;
        window.removeEventListener("blur", this.stop);
        window.removeEventListener("focus", this.start);
        delete this;
    }
}
