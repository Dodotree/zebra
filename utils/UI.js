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

    stayFullScreen(canvas) {
        const expandFullScreen = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        expandFullScreen();
        // Resize screen when the browser has triggered the resize event
        window.addEventListener("resize", expandFullScreen);
    },

    getOrientation(angle, deviceWide) {
        return angle === 180 || angle === 0
            ? deviceWide
            : !deviceWide;
    },

    watchOrientation(callback, log) {
        let angle = 0;
        // eslint-disable-next-line no-restricted-globals
        const deviceWide = screen.width > screen.height;
        // eslint-disable-next-line no-restricted-globals
        if (screen && "orientation" in screen) {
            try {
                // eslint-disable-next-line no-restricted-globals
                angle = screen.orientation.angle;
            } catch (e) {
                log(
                    `Screen orientation error:\n ${JSON.stringify(e, null, 2)}`
                );
            }
            log(
                // eslint-disable-next-line no-restricted-globals
                `Screen orientation: ${angle} degrees, ${screen.orientation.type}.`
            );
            // eslint-disable-next-line no-restricted-globals
            screen.orientation.addEventListener("change", () => {
                // eslint-disable-next-line no-restricted-globals
                angle = screen.orientation.angle;
                const wide = this.getOrientation(angle, deviceWide);
                callback(wide);
                log(
                    // eslint-disable-next-line no-restricted-globals
                    `Screen orientation change: ${angle} degrees, ${screen.orientation.type}.`
                );
            });
        } else if ("onorientationchange" in window) {
            // for some mobile browsers
            try {
                angle = window.orientation;
            } catch (e) {
                log(
                    `Window orientation error: ${JSON.stringify(e, null, 2)}`
                );
            }
            log(`Window orientation: ${angle} degrees.`);
            window.addEventListener("orientationchange", () => {
                angle = window.orientation;
                const wide = this.getOrientation(angle, deviceWide);
                callback(wide);
                log(`Window orientation change: ${angle} degrees.`);
            });
        }
        const wide = this.getOrientation(angle, deviceWide);
        callback(wide);
        log(
            `Orientation ${angle} device ${deviceWide ? "Wide" : "Narrow"} => ${this.wide ? "Wide" : "Narrow"} screen`
        );
    },

    getOS() {
        const uA = navigator.userAgent || navigator.vendor || window.opera;
        if ((/iPad|iPhone|iPod/.test(uA) && !window.MSStream) || (uA.includes("Mac") && "ontouchend" in document)) return "iOS";

        const os = ["Windows", "Android", "Unix", "Mac", "Linux", "BlackBerry"];
        // eslint-disable-next-line no-plusplus
        for (let i = 0; i < os.length; i++) if (new RegExp(os[i], "i").test(uA)) return os[i];
        return "unknown";
    },

    getDeviceName(label) {
        if (label.indexOf("RealSense") > -1) {
            if (label.indexOf("SR300") > -1 || label.includes("Camera S") > -1) {
                if (label.indexOf("RGB") > -1) {
                    return "SR300 RGB";
                }
                return "SR300 Depth";
            }
            if (label.indexOf("R200") > -1) {
                if (label.indexOf("RGB") > -1) {
                    return "R200 RGB";
                }
                return "R200 Depth";
            }
        }
        return label;
    },

    getAspectRatioTag(width, height) {
        let [w, h] = width > height ? [width, height] : [height, width];
        const aspKeys = [0, 0, 1, 1, 2, 3, 4, 5, 6, 7, 7, 8, 8, 8, 8, 9, 9, 9, 9, 10, 10, 10];
        const aspTags = ["1:1", "5:4", "4:3", "1.43:1 IMAX", "3:2", "8:5", "5:3", "16:9", "15:8 HDTV", "2.39:1", "2.75:1"];
        const keyIndex = Math.round(12 * (w / h)) - 12;
        if (keyIndex < 0 || keyIndex > aspKeys.length) return "";
        return aspTags[aspKeys[keyIndex]];
    },

    initResolutionsUI(givenRs, camera, os) {
        // resolution switch is a shortcut to Box options in controls
        // since capabilities are not always available, control could be imaginary
        // overall size affects frame rate, so, no guarantee that it will be granted
        // TODO 2: best resolution for the screen
        // TODO 3: scan resolutions that will not switch to cut/resize in vid.settings
        const resHolder = document.getElementById("resolution-select");
        resHolder.innerHTML = "";

        let resolutions = [];
        const camResolutions = {
            "SR300 RGB": [
                [1920, 1080, "16:9 1080p Full HD", 30],
                [1280, 720, "16:9 720p HD", 60],
                [960, 540, "16:9", 60],
                [848, 480, "16:9 ~480p", 60],
                [640, 360, "16:9 360p", 60],
                [424, 240, "16:9", 60],
                [320, 180, "16:9", 60],
                [640, 480, "4:3", 60],
                [320, 240, "4:3", 60],
            ],
            "SR300 Depth": [
                [640, 480, "4:3 480p SD", 110],
            ],
            "R200 RGB": [
                [1920, 1080, "16:9 1080p Full HD", 30],
                [640, 480, "4:3 480p SD", 60],
            ],
            "R200 Depth": [
                [628, 468, "", 60],
                [480, 360, "4:3", 60],
                [320, 240, "4:3", 60],
            ]
        };
        const osResolutions = {
            iOS: [
                [4032, 3024, "4:3 12M", 60],
                [3264, 2448, "4:3", 60],
                [3088, 2320, "4:3", 60],
                [1280, 960, "4:3 720p HD", 60],
                [640, 480, "4:3 480p SD", 60],
                [3840, 2160, "1:1.9 2160p 4K Ultra HD", 60],
                [1920, 1080, "16:9 1080p Full HD", 60],
                [1280, 720, "16:9", 60],
            ],
            Android: [
                [4032, 3024, "4:3", 60],
                [4032, 1908, "Full", 60],
                [3024, 3024, "1:1", 60],
                [4032, 2268, "16:9", 60],
            ],
        };
        const defaultResolutions = [
            [640, 360, "16:9 360p", 60],
            [640, 480, "4:3 480p SD", 60],
            [1280, 720, "16:9 720p HD", 60],
            [1920, 1080, "16:9 1080p Full HD", 60],
            [2560, 1440, "16:9 1440p 2K", 60],
            [3840, 2160, "1:1.9 2160p 4K Ultra HD", 60],
            [7680, 4320, "16:9 8K Full Ultra HD", 60],
        ];
        if (camera in camResolutions) {
            resolutions = camResolutions[camera];
        } else if (os in osResolutions) {
            resolutions = osResolutions[os];
        } else {
            resolutions = defaultResolutions;
        }
        givenRs.forEach((res) => {
            if (!resolutions.some((r) => r[0] === res[0] && r[1] === res[1])) {
                res.push(utilsUI.getAspectRatioTag(res[0], res[1]));
                resolutions.push(res);
            }
        });
        // last givenRs is the maximum dimensions w,h provided by capabilities
        if (givenRs.length === 2) {
            resolutions = resolutions.filter((r) => r[0] <= givenRs[1][0] && r[1] <= givenRs[1][1]);
        }
        resolutions.forEach((row) => {
            const res = `${row[0]}x${row[1]}`;
            resHolder.appendChild(
                utilsUI.get({
                    tag: "option",
                    text: `${res} (${row[2]})`,
                    attrs: { value: res },
                })
            );
        });
        // first givenRs from actual track settings
        resHolder.value = `${givenRs[0][0]}x${givenRs[0][1]}`;
    },
};
