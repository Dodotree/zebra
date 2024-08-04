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

    // more you click, more you wait
    debounce(func, delay) {
        let lastTimeoutId = null;
        return (...args) => {
            if (lastTimeoutId) {
                clearTimeout(lastTimeoutId);
            }
            lastTimeoutId = setTimeout(() => {
                func.apply(this, args);
            }, delay);
        };
    },

    // first click is fired, next is postponed
    // postponed will have arguments of the latest attempt
    throttle(callback, delay) {
        let lastTimeoutId = null;
        let lastExecTime = 0;

        return (...args) => {
            const elapsed = Date.now() - lastExecTime;

            function execCallback() {
                lastExecTime = Date.now();
                callback.apply(this, args);
            }

            if (lastTimeoutId) {
                clearTimeout(lastTimeoutId);
            }
            if (!lastExecTime || elapsed >= delay) {
                execCallback();
                return;
            }

            lastTimeoutId = setTimeout(execCallback, delay - elapsed);
        };
    },

    uniqueKeys(o, oo) {
        const sharedKeys = new Set([...Object.keys(o), ...Object.keys(oo)]);
        return Array.from(sharedKeys.values());
    },

    imageConstraints() {
        return ["whiteBalanceMode", "exposureMode", "exposureCompensation",
            "exposureTime", "colorTemperature", "iso", "brightness", "contrast",
            "saturation", "sharpness", "focusDistance", "pan", "tilt", "zoom", "torch"];
    },

    // sequential application of constraints might be needed
    // Some might require setting "manual" mode first
    // Others should not mix due to Chrome error:
    // Mixing ImageCapture and non-ImageCapture constraints is not currently supported
    getChangedConstraints(oldConstraints, changes) {
        // making sure we are not mutating the original object
        const newConstraints = structuredClone(oldConstraints);
        if (!("advanced" in newConstraints)) { newConstraints.advanced = []; }
        // keyLines is key to index of line in advanced array of {} objects
        const keyLines = newConstraints.advanced.reduce((acc, o, index) => {
            Object.keys(o).forEach((key) => { acc[key] = index; });
            return acc;
        }, {});
        Object.keys(changes).forEach((key) => {
            const value = changes[key];
            newConstraints[key] = { ...newConstraints[key], ideal: value, exact: value };
            if (key in keyLines) {
                newConstraints.advanced[keyLines[key]][key] = value;
            } else {
                newConstraints.advanced.push({ [key]: value });
            }
        });
        return newConstraints;
    },

    toggleAttribute(name, value, pa) {
        const node = pa || this;
        if (value) {
            node.setAttribute(name, true);
        } else {
            node.removeAttribute(name);
        }
    },

    getValueTypeFromInputType(type) {
        switch (type) {
        case "checkbox":
            return "boolean";
        case "range":
        case "number":
            return "number";
        case "text":
        case "select-one":
        case "select-multiple":
        default:
            return "string";
        }
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
};
