import { utilsUI } from "./utils/UI.js";

export class MediaControls extends HTMLElement {
    constructor() {
        super();
        this.form = null;
        this.callback = null;
    }

    init(kind, trackInfo, callback) {
        this.reset();
        const details = this.appendChild(document.createElement("details"));

        const summary = details.appendChild(
            utilsUI.get({
                tag: "summary",
                text: `${kind} ${trackInfo.label} controls`,
            })
        );
        summary.appendChild(
            utilsUI.get({
                tag: "button",
                text: "✕",
            })
        ).onclick = this.destroy.bind(this);

        this.form = details.appendChild(document.createElement("form"));
        this.form.kind = kind;
        this.callback = callback;

        const buckets = {
            IDs: ["deviceId", "groupId"],
            Box: ["resizeMode", "aspectRatio", "width", "height", "frameRate"],
            Exposure: [
                "exposureMode",
                "exposureTime",
                "exposureCompensation",
                "iso",
                "whiteBalanceMode",
            ],
            Focus: ["focusMode", "focusDistance", "focusRange"],
            Color: [
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
            bucketNode.appendChild(
                utilsUI.get({
                    tag: "legend",
                    text: buck,
                })
            );
            buckets[buck].forEach((cKey) => {
                if (cKey in trackInfo.capabilities) {
                    usedSoFar.push(cKey);
                    bucketNode.appendChild(
                        this.constructor.createInput(
                            cKey,
                            trackInfo.capabilities[cKey],
                            trackInfo.settings[cKey],
                            callback
                        )
                    );
                }
            });

            if (bucketNode.children.length > 1) {
                this.form.appendChild(bucketNode);
            } else {
                bucketNode.remove();
            }
        });

        const leftoverKeys = Object.keys(trackInfo.capabilities).filter(
            (key) => usedSoFar.indexOf(key) === -1
        );

        leftoverKeys.forEach((cKey) => {
            this.form.appendChild(
                this.constructor.createInput(
                    cKey,
                    trackInfo.capabilities[cKey],
                    trackInfo.settings[cKey],
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
            function fix(num) { return parseFloat(num.toFixed(4)); }
            pElement.appendChild(
                utilsUI.get({
                    tag: "label",
                    text: `${cKey} ${fix(cOptions.min)} - ${fix(cOptions.max)}, step: ${"step" in cOptions ? fix(cOptions.step) : 1}`,
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
                        value: cValue, // do not change default value (could be long)
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

    destroy() {
        this.reset();
        this.remove();
    }
}

if (!customElements.get("media-controls")) {
    customElements.define("media-controls", MediaControls);
}
