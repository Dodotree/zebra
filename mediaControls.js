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
        this.newConstraints = {};

        this.toggleAttribute = utilsUI.toggleAttribute.bind(this);
        this.onFormInput = this.onFormInput.bind(this);

        // Warning: .disabled is used only for initial state, not tracked later
        this.data = null;
        this.callback = null;
        this.debounceOnFormInput = null;
    }

    init(trackInfo) {
        this.reset();
        this.callback = trackInfo.updateCallback;
        this.destroyCallback = trackInfo.destroyCallback;
        this.debounceOnFormInput = utilsUI.debounce(this.onFormInput, trackInfo.debouncetime);

        this.constraints = structuredClone(trackInfo.constraints);
        this.newConstraints = structuredClone(trackInfo.constraints);
        this.data = structuredClone(trackInfo.data);

        const details = this.appendChild(
            utilsUI.get({
                tag: "details",
                attrs: { open: true },
            })
        );

        const summary = details.appendChild(
            utilsUI.get({
                tag: "summary",
            })
        );
        const h5 = summary.appendChild(
            utilsUI.get({
                tag: "h5",
                text: `${trackInfo.kind} track controls for "${trackInfo.label}"`,
            })
        );
        h5.appendChild(
            utilsUI.get({
                tag: "button",
                text: "✕",
                attrs: { class: "destroy" },
            })
        ).onclick = this.destroy.bind(this);

        this.form = details.appendChild(document.createElement("form"));
        this.form.kind = trackInfo.kind;

        const buckets = utilsUI.buckets;
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
                if (cKey in this.data) {
                    usedSoFar.push(cKey);
                    bucketNode.appendChild(this.createInput(cKey, this.data[cKey]));
                }
            });

            if (bucketNode.children.length > 1) {
                this.form.appendChild(bucketNode);
            } else {
                bucketNode.remove();
            }
        });

        const leftoverKeys = Object.keys(this.data).filter((key) => usedSoFar.indexOf(key) === -1);
        leftoverKeys.forEach((cKey) => {
            this.form.appendChild(this.createInput(cKey, this.data[cKey]));
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
        this.form.constraints.value = JSON.stringify(this.constraints, null, 2);

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
                    type: "button",
                    name: "saveconstraints",
                    value: "Download JSON",
                },
            })
        ).onclick = this.saveConstraints.bind(this);

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
        this.liveupdates = trackInfo.liveupdates;
        this.debouncetime = trackInfo.debouncetime;
    }

    editConstraints() {
        this.liveupdates = false;
        this.toggleAttribute("contenteditable", true, this.form.constraints);
    }

    saveConstraints() {
        utilsUI.downloadJSON(this.newConstraints, "constraints");
    }

    parseValue(key, value) {
        if (this.data[key].type.indexOf("boolean") !== -1) {
            return (value === "true");
        } if (this.data[key].type.indexOf("number") !== -1) {
            // numberBoolean for tilt pan zoom for track should be number
            return parseFloat(value);
        }
        // string, stringArray or any (will be left as string)
        return value;
    }

    getFormKeyValues() {
        // TODO: get value from input, not range slider for numbers
        const pairs = Object.fromEntries(new FormData(this.form).entries());
        return Object.keys(pairs)
            .filter((key) => {
                return utilsUI.notEmpty(pairs[key]);
            })
            .reduce((acc, key) => {
                // since all form values returned as strings, we need to convert them
                acc[key] = this.parseValue(key, pairs[key]);
                return acc;
            }, {});
    }

    // returns an approximation of intended changes
    // since "advanced" can contain many variants
    getConstraintsChanges(constrains) {
        // lowest index in advanced has higher priority -> reversed for overwrite
        const changes = (constrains.advanced.toReversed() || []).reduce((acc, item) => {
            Object.keys(item).forEach((key) => {
                if (key in this.data) {
                    const value = this.parseValue(key, item[key].toString());
                    if (value !== this.data[key].value) {
                        acc[key] = value;
                    }
                }
            });
            return acc;
        }, {});

        return Object.keys(constrains)
            .filter((key) => {
                return utilsUI.notEmpty(constrains[key]) && key in this.data;
            })
            .reduce((acc, key) => {
                let value;
                let isExact = false;
                if (typeof constrains[key] === "object") {
                    if (constrains[key].exact) {
                        value = constrains[key].exact;
                        isExact = true;
                    } else if (constrains[key].ideal) {
                        value = constrains[key].ideal;
                    }
                } else {
                    value = constrains[key];
                }
                value = this.parseValue(key, value.toString());
                if (value !== this.data[key].value && (isExact || !(key in changes))) {
                    acc[key] = value;
                }
                return acc;
            }, changes);
    }

    onSubmit(e) {
        if (e) {
            e.preventDefault();
        }
        console.log("onSubmit", this.form.constraints.hasAttribute("contenteditable"));
        if (this.form.constraints.hasAttribute("contenteditable")) {
            try {
                const constraints = JSON.parse(this.form.constraints.value);
                this.callback(this.form.kind, this.getConstraintsChanges(constraints), constraints);
                return false;
            } catch (error) {
                this.logger.error(error);
            }
        }
        this.callback(this.form.kind, this.changes, this.newConstraints);
        return false;
    }

    onFormInput() {
        if (this.locked || !this.liveupdates) return;

        const keyValues = this.getFormKeyValues();

        this.changes = Object.keys(keyValues)
            .filter((key) => !(key in this.data) || keyValues[key] !== this.data[key].value)
            .reduce((acc, key) => {
                acc[key] = keyValues[key];
                return acc;
            }, {});
        this.form.changes.value = JSON.stringify(this.changes, null, 2);

        // generate track constraints from enabled inputs, avoid using "mandatory"
        // (e.g. "exact", "min") as it's not supported by all browsers

        // if the key was in advanced but not in plain, new values also will be only in advanced
        // since advanced is treated as "exact" and gets rejected if not supported
        // you might need to add "ideal" plain constraints for those keys
        const newConstraints = { advanced: [] };
        const usedKeys = [];
        if (this.constraints.advanced && Object.keys(this.constraints.advanced).length > 0) {
            newConstraints.advanced = this.constraints.advanced.reduce((acc, item) => {
                if (Object.keys(item).every((key) => key in keyValues)) {
                    const line = Object.keys(item).reduce((a, key) => {
                        a[key] = keyValues[key];
                        usedKeys.push(key);
                        return a;
                    }, {});
                    acc.push(line);
                }
                return acc;
            }, []);
        }
        Object.keys(keyValues).forEach(key => {
            if (usedKeys.indexOf(key) === -1) {
                newConstraints.advanced.push({ [key]: keyValues[key] });
            }
        });
        if (newConstraints.advanced.length === 0) { delete newConstraints.advanced; }
        Object.keys(this.constraints).forEach(key => {
            if (key !== "advanced" && key in keyValues) {
                newConstraints[key] = structuredClone(this.constraints[key]);
                newConstraints[key].ideal = keyValues[key];
                usedKeys.push(key);
            }
        });
        Object.keys(keyValues).forEach(key => {
            if (usedKeys.indexOf(key) === -1) {
                newConstraints[key] = { ideal: keyValues[key] };
            }
        });
        this.form.constraints.value = JSON.stringify(newConstraints, null, 2);
        this.newConstraints = newConstraints;

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

    setControlValue(key) {
        // [0] must be checkbox, [1] range/select/input, [2] input
        if (!this.form[key] || !this.form[key][1]) return;
        // set value on input, not on range
        // range sets 1.777777 as 2.0013888 probably due to range pixel step
        if (this.form[key][2]) {
            const input = (this.form[key][1].type === "number") ? this.form[key][2] : this.form[key][1];
            input.value = this.data[key].value;
            input.dispatchEvent(new Event("input"));
            return;
        }
        this.form[key][1].value = this.data[key].value;
        if (this.form[key][1].tagName === "input") {
            this.form[key].dispatchEvent(new Event("input"));
        }
    }

    updateControls(data, changedKeys, unchangedKeys, constraints) {
        this.locked = true;

        this.data = structuredClone(data);
        this.constraints = structuredClone(constraints);
        this.newConstraints = structuredClone(constraints);
        this.form.constraints.value = JSON.stringify(constraints, null, 2);
        this.toggleAttribute("contenteditable", false, this.form.constraints);

        changedKeys.forEach((key) => {
            this.setControlValue(key);
        });
        Object.keys(unchangedKeys).forEach((key) => {
            this.setControlValue(key);
        });

        this.changes = {};
        // as message, nothing else
        this.form.changes.value = "Changed Keys:\n" + JSON.stringify(changedKeys, null, 2)
         + "\nUnchanged Keys:\n" + JSON.stringify(unchangedKeys, null, 2);

        this.locked = false;
    }

    toggleDisabled(e) {
        const name = e.target.name;
        this.form[name][1].disabled = !e.target.checked;
        if (this.form[name][2]) {
            this.form[name][2].disabled = !e.target.checked;
        }
    }

    createInput(cKey, node) {
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
        checkbox.checked = !node.disabled;
        checkbox.disabled = node.permanentlyDisabled;

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
        if (node.type === "string") {
            // those most likely are not meant to be changed
            const input = pElement.appendChild(
                utilsUI.get({
                    tag: "input",
                    attrs: {
                        type: "text",
                        name: cKey,
                        value: node.value,
                    },
                })
            );
            input.disabled = node.disabled;
        } else if (node.type.indexOf("Array") !== -1) {
            // Select is better than checkbox for boolean values
            const sel = pElement.appendChild(
                utilsUI.get({
                    tag: "select",
                    attrs: {
                        name: cKey,
                        class: "control-select",
                    },
                })
            );
            sel.disabled = node.disabled;
            node.caps.forEach((option) => {
                sel.appendChild(
                    utilsUI.get({
                        tag: "option",
                        text: option.toString(),
                        attrs: { value: option.toString() },
                    })
                );
            });
            if (node.value !== null) {
                sel.value = node.value.toString();
            }
        } else if (node.type.indexOf("number") !== -1) {
            const attrs = {
                name: cKey,
                min: node.caps.min,
                max: node.caps.max,
                step: "step" in node.caps ? node.caps.step : 1,
                value: node.value, // do not change default value (could be long)
                // PS be aware that range will set 1.777777 as 2.0013888
                class: "control-input",
            };
            const range = pElement.appendChild(
                utilsUI.get({
                    tag: "input",
                    attrs: {
                        type: "range",
                        ...attrs,
                        oninput: `this.form.${cKey}[2].value = this.value`,
                    },
                })
            );
            range.disabled = node.disabled;
            const input = pElement.appendChild(
                utilsUI.get({
                    tag: "input",
                    attrs: {
                        type: "number",
                        ...attrs,
                        oninput: `this.form.${cKey}[1].value = this.value`,
                    },
                })
            );
            input.disabled = node.disabled;
        }
        return pElement;
    }

    destroy() {
        this.destroyCallback(this.form.kind);
        this.reset();
        this.remove();
    }
}

if (!customElements.get("media-controls")) {
    customElements.define("media-controls", MediaControls);
}
