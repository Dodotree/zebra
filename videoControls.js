import { utilsUI } from "./utils/UI.js";

export class VideoControls extends HTMLElement {
    constructor() {
        super();
        this.form = null;
        this.callback = null;
    }

    /**
     * `CustomElement` lifecycle callback. Invoked each time the it's appended into a
     * document-connected element.
     */
    connectedCallback() {
    }

    init(kind, label, capabilities, settings, callback) {
        this.reset();
        const details = this.appendChild(document.createElement("details"));

        details.appendChild(
            utilsUI.get({
                tag: "summary",
                text: `${kind} ${label} controls`,
            })
        );

        this.form = details.appendChild(document.createElement("form"));
        this.form.kind = kind;
        this.callback = callback;

        const buckets = {
            info: ["deviceId", "groupId"],
            box: ["resizeMode", "aspectRatio", "width", "height", "frameRate"],
            exposure: [
                "exposureMode",
                "exposureTime",
                "exposureCompensation",
                "iso",
                "whiteBalanceMode",
            ],
            focus: ["focusMode", "focusDistance", "focusRange"],
            color: [
                "brightness",
                "colorTemperature",
                "contrast",
                "saturation",
                "sharpness",
            ],
        };

        const usedSoFar = [];

        Object.keys(buckets).forEach((buck) => {
            const bucketNode = document.createElement("fieldset");
            bucketNode.setAttribute(
                "style",
                "break-inside: avoid; page-break-inside: avoid;"
            );
            buckets[buck].forEach((cKey) => {
                if (cKey in capabilities) {
                    usedSoFar.push(cKey);
                    bucketNode.appendChild(
                        this.constructor.createInput(
                            cKey,
                            capabilities[cKey],
                            settings[cKey],
                            callback
                        )
                    );
                }
            });

            if (bucketNode.children.length > 0) {
                this.form.appendChild(bucketNode);
            } else {
                bucketNode.remove();
            }
        });

        const leftoverKeys = Object.keys(capabilities).filter(
            (key) => usedSoFar.indexOf(key) === -1
        );

        leftoverKeys.forEach((cKey) => {
            this.form.appendChild(
                this.constructor.createInput(
                    cKey,
                    capabilities[cKey],
                    settings[cKey],
                    callback
                )
            );
        });
    }

    /**
     * `CustomElement`lifecycle callback. Invoked each time it's removed from the
     * document's DOM.
     */
    disconnectedCallback() {
        this.reset();
    }

    reset() {
        this.querySelectorAll(".control-select").forEach((select) => {
            select.removeEventListener("change", this.callback);
        });

        const inps = document.querySelectorAll(".control-input");
        inps.forEach((input) => {
            input.removeEventListener("input", this.callback);
            input.oninput = null;
        });

        this.innerHTML = "";
        this.form = null;
        this.callback = null;
    }

    setControlValue(key, value) {
        if (this.form[key]) {
            this.form[key].value = value;
        }
        if (this.form[key + "Range"]) {
            this.form[key + "Range"].value = value;
        }
        if (this.form[key + "Number"]) {
            this.form[key + "Number"].value = value;
        }
    }

    static createInput(cKey, cOptions, cValue, callback) {
        const pElement = document.createElement("p");

        // string or String wrapper
        if (typeof cOptions === "string" || cOptions instanceof String) {
            pElement.appendChild(
                utilsUI.get({
                    tag: "label",
                    text: cKey,
                    attrs: { htmlFor: cKey },
                })
            );
            // those most likely are not meant to be changed
            pElement.appendChild(
                utilsUI.get({
                    tag: "input",
                    attrs: {
                        type: "text",
                        name: cKey,
                        value: cValue,
                        disabled: true,
                    },
                })
            );
        } else if (Array.isArray(cOptions) && cOptions.length > 0) {
            pElement.appendChild(
                utilsUI.get({
                    tag: "label",
                    text: cKey,
                    attrs: { htmlFor: cKey },
                })
            );
            const sel = pElement.appendChild(
                utilsUI.get({
                    tag: "select",
                    attrs: { name: cKey, class: "control-select" },
                })
            );
            cOptions.forEach((option) => {
                sel.appendChild(
                    utilsUI.get({
                        tag: "option",
                        text: option,
                        attrs: { value: option },
                    })
                );
            });
            sel.addEventListener("change", callback);
        } else if (Object.keys(cOptions).includes("min") && Object.keys(cOptions).includes("max")) {
            pElement.appendChild(
                utilsUI.get({
                    tag: "label",
                    text: cKey,
                    attrs: { htmlFor: cKey + "Range" },
                })
            );
            const inpRange = pElement.appendChild(
                utilsUI.get({
                    tag: "input",
                    attrs: {
                        type: "range",
                        name: cKey + "Range",
                        key: cKey,
                        min: cOptions.min,
                        max: cOptions.max,
                        step: "step" in cOptions ? cOptions.step : 1,
                        value: cValue,
                        class: "control-input",
                        oninput: `this.form.${cKey + "Number"}.value = this.value`,
                    },
                })
            );
            inpRange.addEventListener("input", callback);
            const inpNum = pElement.appendChild(
                utilsUI.get({
                    tag: "input",
                    attrs: {
                        type: "number",
                        name: cKey + "Number",
                        key: cKey,
                        min: cOptions.min,
                        max: cOptions.max,
                        step: "step" in cOptions ? cOptions.step : 1,
                        value: cValue,
                        class: "control-input",
                        oninput: `this.form.${cKey + "Range"}.value = this.value`,
                    },
                })
            );
            inpNum.addEventListener("input", callback);
        }
        return pElement;
    }
}

if (!customElements.get("video-controls")) {
    customElements.define("video-controls", VideoControls);
}
