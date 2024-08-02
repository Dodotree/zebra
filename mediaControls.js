import { utilsUI } from "./utils/UI.js";

export class MediaControls extends HTMLElement {
    static get observedAttributes() {
        // any attribute for use here should be in low case
        return ["liveupdates", "debouncetime"];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        const input = this.querySelector(`.${name}`);
        if (!input) return;
        console.log("input, new value, current value, checked:", input, newValue, input.value, input.checked);
        if (input.type === "checkbox" && input.checked !== newValue) {
            input.checked = newValue;
        } else if (input.type === "number" && input.value !== newValue) {
            input.value = newValue;
        }
        if (name === "liveupdates") {
            utilsUI.toggleAttribute(this.form.submit, "disabled", newValue === "true");
            utilsUI.toggleAttribute(this.form.editconstraints, "disabled", newValue === "true");
        }
        console.log("input, current value, checked:", input, input.value, input.checked);
    }

    onLiveCheckboxChange(e) {
        this.liveupdates = e.target.checked;
    }

    get liveupdates() {
        return this.getAttribute("liveupdates") === "true";
    }

    set liveupdates(value) {
        if (this.liveupdates === value) return;
        utilsUI.toggleAttribute(this, "liveupdates", value);
    }

    onDebounceTimeChange(e) {
        this.setAttribute("debouncetime", e.target.value);
    }

    get debouncetime() {
        return Number(this.getAttribute("debouncetime"));
    }

    set debouncetime(value) {
        if (this.debouncetime === value) return;
        this.setAttribute("debouncetime", value);
        this.debouncetime = value;
    }

    constructor() {
        super();
        this.form = null;
        this.callback = null;

        this.liveupdates = true;
        this.debouncetime = 400;

        this.outputConstraints = utilsUI.debounce(this.outputConstraints.bind(this), 200);
    }

    init(kind, trackInfo, callback) {
        this.reset();
        this.callback = callback;
        this.trackInfo = trackInfo;

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
        const outputNode = this.form.appendChild(document.createElement("fieldset"));
        outputNode.appendChild(
            utilsUI.get({
                tag: "legend",
                text: "Output Constraints",
            })
        );
        this.output = outputNode.appendChild(
            utilsUI.get({
                tag: "Output",
                attrs: { name: "constraints" },
            })
        );
        this.printOutput(trackInfo.constraints);

        this.form.appendChild(
            utilsUI.get({
                tag: "input",
                attrs: {
                    type: "button",
                    name: "editconstraints",
                    value: "Edit Constraints",
                    disabled: true
                },
            })
        ).onclick = callback;

        this.form.appendChild(
            utilsUI.get({
                tag: "input",
                attrs: {
                    type: "submit",
                    name: "submit",
                    value: "Submit",
                    disabled: true
                },
            })
        ).onclick = callback;

        this.form.oninput = this.outputConstraints;

        this.appendChild(
            utilsUI.get({
                tag: "input",
                attrs: {
                    type: "checkbox",
                    name: "liveupdates",
                    class: "liveupdates",
                    checked: this.liveupdates,
                },
            })
        ).onclick = this.onLiveCheckboxChange.bind(this);
        this.appendChild(
            utilsUI.get({
                tag: "label",
                text: "Live updates in ms ",
                attrs: { htmlFor: "liveupdates" },
            })
        );
        this.appendChild(
            utilsUI.get({
                tag: "input",
                attrs: {
                    type: "number",
                    name: "debouncetime",
                    class: "debouncetime",
                    min: 200,
                    max: 2000,
                    step: 50,
                    value: this.debouncetime,
                },
            })
        ).oninput = this.onDebounceTimeChange.bind(this);
    }

    filterOutUnchanged(oldSettings, capabilities) {
        const pairs = Object.fromEntries(new FormData(this.form).entries());
        return utilsUI.uniqueKeys(pairs, oldSettings)
            .filter((key) => ["deviceId", "groupId"].indexOf(key) === -1 && key in capabilities)
            .filter((key) => {
                if (key in oldSettings) {
                    // since FormData converts everything into strings
                    return pairs[key] !== oldSettings[key].toString();
                }
                return true;
            }).reduce((acc, key) => {
                acc[key] = "max" in capabilities[key] ? parseFloat(pairs[key]) : pairs[key];
                return acc;
            }, {});
    }

    outputConstraints() {
        // tricky part: settings give no value but capabilities have it
        // aspectRatio on iPhone for example, probably don't use it

        const changed = this.filterOutUnchanged(
            this.trackInfo.settings,
            this.trackInfo.capabilities
        );

        const newConstraints = structuredClone(this.trackInfo.constraints);
        if (!("advanced" in newConstraints)) { newConstraints.advanced = []; }
        const mapAdvanced = newConstraints.advanced.reduce((acc, o, index) => {
            Object.keys(o).forEach((key) => { acc[key] = index; });
            return acc;
        }, {});
        Object.keys(changed).forEach((key) => {
            const value = changed[key];
            newConstraints[key] = { ...newConstraints[key], ideal: value, exact: value };
            if (key in mapAdvanced) {
                newConstraints.advanced[mapAdvanced[key]][key] = value;
            } else {
                newConstraints.advanced.push({ [key]: value });
            }
        });
        this.printOutput(newConstraints);
    }

    printOutput(constraints) {
        this.output.value = JSON.stringify(constraints, null, 2);
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
        if (this.form) {
            this.form.oninput = null;
            this.form = null;
        }
        this.innerHTML = "";
        this.callback = null;
    }

    setControlValue(key, value) {
        if (this.form[key]) {
            this.form[key].value = value;
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
            sel.addEventListener("change", callback);
            cOptions.forEach((option) => {
                sel.appendChild(
                    utilsUI.get({
                        tag: "option",
                        text: option,
                        attrs: { value: option },
                    })
                );
            });
        } else if (Object.keys(cOptions).includes("min") && Object.keys(cOptions).includes("max")) {
            function fix(num) { return parseFloat(num.toFixed(4)); }
            pElement.appendChild(
                utilsUI.get({
                    tag: "label",
                    text: `${cKey} ${fix(cOptions.min)} - ${fix(cOptions.max)}, step: ${"step" in cOptions ? fix(cOptions.step) : 1}`,
                    attrs: { htmlFor: cKey },
                })
            );
            pElement.appendChild(
                utilsUI.get({
                    tag: "input",
                    attrs: {
                        type: "range",
                        name: cKey,
                        key: cKey,
                        min: cOptions.min,
                        max: cOptions.max,
                        step: "step" in cOptions ? cOptions.step : 1,
                        value: cValue, // do not change default value (could be long)
                        class: "control-input",
                        oninput: `this.form.${cKey}[1].value = this.value`,
                    },
                })
            ).addEventListener("input", callback);
            pElement.appendChild(
                utilsUI.get({
                    tag: "input",
                    attrs: {
                        type: "number",
                        name: cKey,
                        key: cKey,
                        min: cOptions.min,
                        max: cOptions.max,
                        step: "step" in cOptions ? cOptions.step : 1,
                        value: cValue,
                        class: "control-input",
                        oninput: `this.form.${cKey}[0].value = this.value`,
                    },
                })
            ).addEventListener("input", callback);
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
