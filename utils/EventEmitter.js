// Simple implementation of the pub/sub pattern to decouple components
export default class EventEmitter {
    constructor() {
        this.events = {};
    }

    // TODO: use new Set() instead of array to avoid duplicates
    on(event, callback) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(callback);
    }

    remove(event, listener) {
        if (this.events[event]) {
            const index = this.events[event].indexOf(listener);
            // eslint-disable-next-line no-bitwise
            if (~index) {
                this.events[event].splice(index, 1);
            }
        }
    }

    emit(eventName) {
        const events = this.events[eventName];
        if (events) {
            events.forEach((event) => event());
        }
    }
}
