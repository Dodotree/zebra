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

    toggleAttribute(pa, name, value) {
        if (value) {
            pa.setAttribute(name, true);
        } else {
            pa.removeAttribute(name);
        }
    },

    uniqueKeys(o, oo) {
        const sharedKeys = new Set([...Object.keys(o), ...Object.keys(oo)]);
        return Array.from(sharedKeys.values());
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
