// it is convenient but noticeably slower than direct DOM manipulation
// I can live with that but maybe unwrap before publishing
export const utilsUI = {
    get(element) {
        const el = document.createElement(element.tag);
        if (element.text) {
            el.appendChild(document.createTextNode(element.text));
        }
        if (element.attrs) {
            Object.keys(element.attrs).forEach((attr) => {
                el.setAttribute(attr, element.attrs[attr]);
            });
        }
        return el;
    },

    stayFullScreen(canvas) {
        const expandFullScreen = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        expandFullScreen();
        // Resize screen when the browser has triggered the resize event
        window.addEventListener("resize", expandFullScreen);
    },

    deleteControlsUI(paID, callback) {
        const pa = document.getElementById(paID);
        document.querySelectorAll(".control-select").forEach((select) => {
            select.removeEventListener("change", callback);
        });

        const inps = document.querySelectorAll(".control-input");
        inps.forEach((input) => {
            input.removeEventListener("input", callback);
            input.oninput = null;
        });

        pa.innerHTML = "";
    },

    setControlValue(form, key, value) {
        if (form[key]) {
            form[key].value = value;
        }
        if (form[key + "Range"]) {
            form[key + "Range"].value = value;
        }
        if (form[key + "Number"]) {
            form[key + "Number"].value = value;
        }
    },

    getCapabilitiesUI(trackKind, capabilities, settings, callback) {
        const form = document.createElement("form");
        form.kind = trackKind;
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
                        utilsUI.getInputUI(
                            cKey,
                            capabilities[cKey],
                            settings[cKey],
                            callback
                        )
                    );
                }
            });

            if (bucketNode.children.length > 0) {
                form.appendChild(bucketNode);
            }
        });

        const leftoverKeys = Object.keys(capabilities).filter(
            (key) => usedSoFar.indexOf(key) === -1
        );

        leftoverKeys.forEach((cKey) => {
            if (cKey in capabilities) {
                usedSoFar.push(cKey);
                form.appendChild(
                    utilsUI.getInputUI(
                        cKey,
                        capabilities[cKey],
                        settings[cKey],
                        callback
                    )
                );
            }
        });

        return form;
    },

    getInputUI(cKey, cOptions, cValue, callback) {
        const pElement = document.createElement("p");

        if (typeof cOptions === "string" || cOptions instanceof String) {
            // string or String wrapper
            // those most likely are not meant to be changed
            pElement.appendChild(
                utilsUI.get({
                    tag: "label",
                    text: cKey,
                    attrs: { htmlFor: cKey },
                })
            );
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
    },
};
