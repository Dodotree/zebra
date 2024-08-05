import { utilsUI } from "./utils/UI.js";

export class MediaControls extends HTMLElement {
    static get observedAttributes() {
        // any attribute for use here should be in low case
        return ["liveupdates", "debouncetime"];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        const input = this.querySelector(`.${name}`);
        if (!input) return;
        if (input.type === "checkbox" && input.checked !== newValue) {
            input.checked = newValue;
        } else if (input.type === "number" && input.value !== newValue) {
            input.value = newValue;
        }
        if (name === "liveupdates") {
            this.toggleAttribute("disabled", newValue === "true", this.form.submit);
            this.toggleAttribute("disabled", newValue === "true", this.form.editconstraints);
        }
        if (name === "debouncetime" && typeof this.debouncedOutput === "function") {
            this.debouncedOutput("debounceTerminatedNow");
            this.debouncedOutput = utilsUI.debounce(this.outputConstraints, newValue);
        }
    }

    onLiveCheckboxChange(e) {
        this.liveupdates = e.target.checked;
    }

    get liveupdates() {
        return this.getAttribute("liveupdates") === "true";
    }

    set liveupdates(value) {
        if (this.liveupdates === value) return;
        this.toggleAttribute("liveupdates", value);
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

        this.toggleAttribute = utilsUI.toggleAttribute.bind(this);
        this.outputConstraints = this.outputConstraints.bind(this);
    }

    init(kind, trackInfo, liveupdates, debouncetime, callback) {
        this.reset();
        this.callback = callback;
        this.debouncedOutput = utilsUI.debounce(this.outputConstraints, debouncetime);
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

        const buckets = utilsUI.buckets();
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
                            trackInfo.settings[cKey]
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
                    trackInfo.settings[cKey]
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
                tag: "output",
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
                },
            })
        ).onclick = this.editConstraints.bind(this);

        this.form.appendChild(
            utilsUI.get({
                tag: "input",
                attrs: {
                    type: "submit",
                    name: "submit",
                    value: "Submit",
                },
            })
        );

        this.form.oninput = this.debouncedOutput;

        this.appendChild(
            utilsUI.get({
                tag: "input",
                attrs: {
                    type: "checkbox",
                    name: "liveupdates",
                    class: "liveupdates",
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
                },
            })
        ).oninput = this.onDebounceTimeChange.bind(this);
        this.liveupdates = liveupdates;
        this.debouncetime = debouncetime;
    }

    editConstraints() {
        this.form.constraints.setAttribute("contenteditable", true);
    }

    getChanges(oldSettings, capabilities) {
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

    setConstraints(constraints) {
        this.trackInfo.constraints = constraints;
        this.printOutput(constraints);
    }

    outputConstraints() {
        const changed = this.getChanges(
            this.trackInfo.settings,
            this.trackInfo.capabilities
        );
        const newConstraints = utilsUI.getChangedConstraints(this.trackInfo.constraints, changed);

        this.printOutput(newConstraints);
        if (this.liveupdates) {
            this.callback(this.form.kind, changed, newConstraints);
        }
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
        if (typeof this.debouncedOutput !== "function") return;

        this.debouncedOutput("debounceTerminatedNow");
        const inps = this.querySelectorAll("input");
        inps.forEach((input) => {
            input.oninput = null;
            input.onclick = null; // for checkboxes
        });
        const buttons = this.querySelectorAll("button");
        buttons.forEach((button) => {
            button.onclick = null;
        });
        if (this.form) {
            this.form.oninput = null;
            this.form = null;
        }
        this.innerHTML = "";
        this.callback = null;
        this.debouncedOutput = null;
    }

    setControlValue(key, value) {
        if (!this.form[key]) return;
        // set value on input, not on range
        // range sets 1.777777 as 2.0013888 probably due to range pixel step
        if (this.form[key][1]) {
            const input = (this.form[key][1].type === "number") ? this.form[key][1] : this.form[key][0];
            input.value = value;
            input.dispatchEvent(new Event("input"));
            return;
        }
        this.form[key].value = value;
        this.form[key].dispatchEvent(new Event("input"));
    }

    updateControls(changes) {
        Object.keys(changes).forEach((key) => {
            this.setControlValue(key, changes[key]);
        });
    }

    static createInput(cKey, cOptions, cValue) {
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
                        min: cOptions.min,
                        max: cOptions.max,
                        step: "step" in cOptions ? cOptions.step : 1,
                        value: cValue, // do not change default value (could be long)
                        class: "control-input",
                        oninput: `this.form.${cKey}[1].value = this.value`,
                    },
                })
            );
            pElement.appendChild(
                utilsUI.get({
                    tag: "input",
                    attrs: {
                        type: "number",
                        name: cKey,
                        min: cOptions.min,
                        max: cOptions.max,
                        step: "step" in cOptions ? cOptions.step : 1,
                        value: cValue,
                        class: "control-input",
                        oninput: `this.form.${cKey}[0].value = this.value`,
                    },
                })
            );
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
