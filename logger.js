export class Logger extends HTMLElement {
    constructor() {
        super();
        this.logPanel = null;

        this.log = this.log.bind(this);
        this.logError = this.logError.bind(this);
    }

    /**
     * `CustomElement` lifecycle callback. Invoked each time the it's appended into a
     * document-connected element.
     */
    connectedCallback() {
        this.logPanel = this.appendChild(document.createElement("textarea"));
        console.log("Logger connected", this.logPanel);
    }

    log(message) {
        this.logPanel.value += "\n\n" + message;
        this.logPanel.scrollTop = this.logPanel.scrollHeight;
    }

    logError(error) {
        console.error(error);
        if (error instanceof DOMException) {
            this.log(`DOMException: ${error.name}: ${error.message}`);
            return;
        } if (error instanceof Error) {
            this.log(`Error ${typeof error} ${error.name}: ${error.message} ${error.cause}`);
            return;
        }
        this.log(`Error: ${error}`);
    }
}

if (!customElements.get("screen-logger")) {
    customElements.define("screen-logger", Logger);
}
