export class Logger extends HTMLElement {
    constructor() {
        super();
        this.logPanel = null;

        this.log = this.log.bind(this);
        this.error = this.error.bind(this);
    }

    /**
     * `CustomElement` lifecycle callback. Invoked each time the it's appended into a
     * document-connected element.
     */
    connectedCallback() {
        const section = this.appendChild(document.createElement("section"));
        section.classList.add("logger");
        this.logPanel = section.appendChild(document.createElement("textarea"));
    }

    log(message) {
        this.logPanel.value += "\n\n" + message;
        this.logPanel.scrollTop = this.logPanel.scrollHeight;
    }

    error(error) {
        // eslint-disable-next-line no-console
        console.error(error);
        if (error instanceof DOMException) {
            this.log(`DOMException:\nname: ${error.name}\nmessage: ${error.message}`);
            return;
        } if (error instanceof Error) {
            this.log(`Error:\ntype: ${typeof error}\nname: ${error.name}\n`
                + `message: ${error.message}\ncause: ${error.cause}`
                + JSON.stringify(error, null, 2));
            return;
        }
        this.log(`Error: ${error}`);
    }
}

if (!customElements.get("screen-logger")) {
    customElements.define("screen-logger", Logger);
}
