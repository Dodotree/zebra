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
            const isLive = newValue === "true";
            this.toggleAttribute("disabled", isLive, this.form.submit);
            this.toggleAttribute("disabled", isLive, this.form.editconstraints);
        }
        if (name === "debouncetime" && typeof this.debounceOnFormInput === "function") {
            this.debounceOnFormInput("debounceTerminatedNow");
            this.debounceOnFormInput = utilsUI.debounce(this.onFormInput, newValue);
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
        this.debouncetime = 0;
        this.liveupdates = false;

        this.form = null;
        this.locked = false;
        this.changes = {};
        this.constraints = {};

        this.toggleAttribute = utilsUI.toggleAttribute.bind(this);
        this.onFormInput = this.onFormInput.bind(this);

        this.trackInfo = null;
        this.callback = null;
        this.debounceOnFormInput = null;
    }

    init(kind, trackInfo, liveupdates, debouncetime, callback) {
        console.log("init", kind, trackInfo);
        this.reset();
        this.callback = callback;
        this.debounceOnFormInput = utilsUI.debounce(this.onFormInput, debouncetime);
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
            Object.keys(buckets[buck]).forEach((cKey) => {
                if (cKey in trackInfo.capabilities) {
                    usedSoFar.push(cKey);
                    bucketNode.appendChild(
                        this.createInput(
                            cKey,
                            trackInfo.capabilities[cKey],
                            trackInfo.settings[cKey],
                            (trackInfo.enabled.indexOf(cKey) !== -1)
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
                this.createInput(
                    cKey,
                    trackInfo.capabilities[cKey],
                    trackInfo.settings[cKey],
                    (trackInfo.enabled.indexOf(cKey) !== -1)
                )
            );
        });

        const pendingNode = this.form.appendChild(document.createElement("fieldset"));
        pendingNode.appendChild(
            utilsUI.get({
                tag: "legend",
                text: "Pending changes",
            })
        );
        pendingNode.appendChild(
            utilsUI.get({
                tag: "output",
                attrs: { name: "changes" },
            })
        );

        const outputNode = this.form.appendChild(document.createElement("fieldset"));
        outputNode.appendChild(
            utilsUI.get({
                tag: "legend",
                text: "Output Constraints",
            })
        );
        outputNode.appendChild(
            utilsUI.get({
                tag: "output",
                attrs: { name: "constraints" },
            })
        );

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
        ).onclick = this.onSubmit.bind(this);

        this.form.oninput = this.debounceOnFormInput;

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

    getFormKeyValues(capabilities) {
        const pairs = Object.fromEntries(new FormData(this.form).entries());
        return Object.keys(pairs)
            .filter((key) => {
                return pairs[key] !== null && pairs[key] !== undefined;
            })
            .reduce((acc, key) => {
                const item = capabilities[key];
                acc[key] = typeof item === "object" && "max" in item ? parseFloat(pairs[key]) : pairs[key];
                return acc;
            }, {});
    }

    setConstraints(constraints) {
        this.trackInfo.constraints = constraints;
    }

    onSubmit(e) {
        if (e) {
            e.preventDefault();
        }
        this.callback(this.form.kind, this.changes, this.constraints);
        return false;
    }

    onFormInput() {
        if (this.locked) return;

        const keyValues = this.getFormKeyValues(this.trackInfo.capabilities);

        this.changes = utilsUI.getChanges(keyValues, this.trackInfo.settings);
        this.form.changes.value = JSON.stringify(this.changes, null, 2);

        this.constraints = utilsUI.getConstraints(keyValues);
        this.form.constraints.value = JSON.stringify(this.constraints, null, 2);

        if (this.liveupdates) {
            this.onSubmit();
        }
    }

    /**
     * `CustomElement`lifecycle callback. Invoked each time it's removed from the
     * document's DOM.
     */
    disconnectedCallback() {
        this.reset();
    }

    reset() {
        if (typeof this.debounceOnFormInput !== "function") return;

        this.debounceOnFormInput("debounceTerminatedNow");
        this.debounceOnFormInput = null;
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
    }

    setControlValue(key, value, enabled) {
        // [0] must be checkbox, [1] range/select/input, [2] input
        if (!this.form[key] || !this.form[key][1]) return;
        this.form[key][0].checked = enabled;
        // set value on input, not on range
        // range sets 1.777777 as 2.0013888 probably due to range pixel step
        if (this.form[key][2]) {
            const input = (this.form[key][1].type === "number") ? this.form[key][2] : this.form[key][1];
            input.value = value;
            input.dispatchEvent(new Event("input"));
            return;
        }
        this.form[key][1].value = value;
        this.form[key].dispatchEvent(new Event("input"));
    }

    updateControls(changes) {
        this.locked = true;
        Object.keys(changes).forEach((key) => {
            this.setControlValue(key, changes[key]);
        });
        this.locked = false;
    }

    toggleDisabled(e) {
        const name = e.target.name;
        this.form[name][1].disabled = !e.target.checked;
        if (this.form[name][2]) {
            this.form[name][2].disabled = !e.target.checked;
        }
    }

    createInput(cKey, cOptions, cValue, enabled) {
        const pElement = document.createElement("p");
        const checkbox = pElement.appendChild(
            utilsUI.get({
                tag: "input",
                attrs: {
                    type: "checkbox",
                    name: cKey,
                },
            })
        );
        checkbox.onclick = this.toggleDisabled.bind(this);
        checkbox.checked = enabled;

        // function fix(num) { return parseFloat(num.toFixed(4)); }
        // text: `${cKey} ${fix(cOptions.min)} - ${fix(cOptions.max)}, step: ${"step" in cOptions ? fix(cOptions.step) : 1}`,
        pElement.appendChild(
            utilsUI.get({
                tag: "label",
                text: cKey,
                attrs: { htmlFor: cKey },
            })
        );

        // string or String wrapper
        if (typeof cOptions === "string" || cOptions instanceof String) {
            // those most likely are not meant to be changed
            const input = pElement.appendChild(
                utilsUI.get({
                    tag: "input",
                    attrs: {
                        type: "text",
                        name: cKey,
                        value: cValue,
                    },
                })
            );
            input.disabled = !enabled;
        } else if (Array.isArray(cOptions) && cOptions.length > 0) {
            const sel = pElement.appendChild(
                utilsUI.get({
                    tag: "select",
                    attrs: {
                        name: cKey,
                        class: "control-select",
                    },
                })
            );
            sel.disabled = !enabled;
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
            const range = pElement.appendChild(
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
                        oninput: `this.form.${cKey}[2].value = this.value`,
                    },
                })
            );
            range.disabled = !enabled;
            const input = pElement.appendChild(
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
                        oninput: `this.form.${cKey}[1].value = this.value`,
                    },
                })
            );
            input.disabled = !enabled;
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
