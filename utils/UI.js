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

    toggleAttribute(name, value, pa) {
        const node = pa || this;
        if (value) {
            node.setAttribute(name, true);
        } else {
            node.removeAttribute(name);
        }
    },

    // more you click, more you wait
    debounce(func, delay) {
        let lastTimeoutId = null;
        return (...args) => {
            if (lastTimeoutId) {
                clearTimeout(lastTimeoutId);
            }
            if (args.indexOf("debounceTerminatedNow") === -1) {
                lastTimeoutId = setTimeout(() => {
                    func.apply(this, args);
                }, delay);
            }
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

    imageCaptureConstraints() {
        const buckets = this.buckets();
        return [
            ...buckets.Color,
            ...buckets.Exposure,
            ...buckets.Focus,
            ...buckets.CropAndZoom,
            ...buckets.Flash
        ];
    },

    nonImageCaptureConstraints() {
        const buckets = this.buckets();
        return [
            ...buckets.IDs,
            ...buckets.Box,
            ...buckets.Audio
        ];
    },

    buckets() {
        return {
            IDs: ["deviceId", "groupId"],
            Box: [
                "facingMode",
                "resizeMode",
                "aspectRatio",
                "width",
                "height",
                "frameRate"
            ],
            Audio: [
                "autoGainControl",
                "channelCount",
                "echoCancellation",
                "latency",
                "noiseSuppression",
                "sampleRate",
                "sampleSize",
                "volume",
            ],
            Exposure: [
                "whiteBalanceMode",
                "exposureMode",
                "exposureTime",
                "exposureCompensation",
                "iso",
            ],
            Flash: ["torch"],
            Focus: ["focusMode", "focusDistance", "focusRange"],
            Color: [
                "brightness",
                "colorTemperature",
                "contrast",
                "saturation",
                "sharpness",
            ],
            CropAndZoom: ["pan", "tilt", "zoom"],
        };
    },

    // sequential application of constraints might be needed
    // Some might require setting "manual" mode first
    // Others should not mix due to Chrome error:
    // Mixing ImageCapture and non-ImageCapture constraints is not currently supported
    getConstraintStages(constraints) {
        const stage1 = { advanced: [] };
        const stage2 = { advanced: [] };
        const stage3 = { advanced: [] };
        const mediaConstraints = this.nonImageCaptureConstraints();
        Object.keys(constraints).forEach((key) => {
            if (key === "advanced") {
                constraints.advanced.forEach((o) => {
                    // sort by first key in line
                    const [k] = Object.keys(o);
                    if (mediaConstraints.includes(k)) {
                        stage1.advanced.push(o);
                    } else if (o[k] === "manual") {
                        stage2.advanced.push(o);
                    } else {
                        stage3.advanced.push(o);
                    }
                });
            } else if (mediaConstraints.includes(key)) {
                // IDs, Box, Audio
                stage1[key] = constraints[key];
            } else if (constraints[key] === "manual") {
                // manual mode just in case it should be set before value
                stage2[key] = constraints[key];
            } else {
                // Color, Exposure, Focus, CropAndZoom, Flash - ImageCapture constraints
                stage3[key] = constraints[key];
            }
        });
        const stages = [];
        [stage1, stage2, stage3].forEach((stage) => {
            if (stage.advanced.length === 0) { delete stage.advanced; }
            if (Object.keys(stage).length > 0) {
                stages.push(stage);
            }
        });
        return stages;
    },

    uniqueKeys(o, oo) {
        const sharedKeys = new Set([...Object.keys(o), ...Object.keys(oo)]);
        return Array.from(sharedKeys.values());
    },

    constraintKeys(constraints) {
        const advanced = constraints.advanced || [];
        const keysSet = advanced.reduce(
            (acc, o) => acc.union(new Set(Object.keys(o))),
            new Set(Object.keys(constraints))
        );
        return Array.from(keysSet.values()).filter((key) => key !== "advanced");
    },

    getChanges(pairs, oldSettings) {
        return Object.keys(pairs)
            .filter((key) => !(key in oldSettings) || pairs[key] !== oldSettings[key])
            .reduce((acc, key) => {
                acc[key] = pairs[key];
                return acc;
            }, {});
    },

    getConstraints(keyValues) {
        const keys = Object.keys(keyValues);
        const idConstraints = ["deviceId", "groupId"].reduce((acc, key) => {
            if (keys.indexOf(key) > -1) {
                acc[key] = { exact: keyValues[key] };
            }
            return acc;
        }, {});
        const advancedKeys = keys.filter((key) => ["deviceId", "groupId"].indexOf(key) === -1);
        const constraints = advancedKeys.reduce((acc, key) => {
            acc[key] = { ideal: keyValues[key], exact: keyValues[key] };
            return acc;
        }, idConstraints);
        if (advancedKeys.length > 0) {
            constraints.advanced = keys.map((key) => ({ [key]: keyValues[key] }));
        }
        return constraints;
    },

    getChangedConstraints(oldConstraints, changes, deleteKeys) {
        const merged = (oldConstraints.advanced || [])
            .reduce((acc, o)=> Object.assign(acc, o), {});
        Object.assign(merged, changes);
        const keys = this.uniqueKeys(merged, oldConstraints)
            .filter((key) => key !== "advanced" && deleteKeys.indexOf(key) === -1);
        const constraints = keys.reduce((acc, key) => {
            const a = oldConstraints[key] || {};
            // "ideal" here is more for the sake of overriding old "ideal"
            const b = key in merged ? { exact: merged[key], ideal: merged[key] } : {};
            acc[key] = Object.assign({}, a, b);
            return acc;
        }, {});
        const advancedKeys = keys.filter((key) => ["deviceId", "groupId"].indexOf(key) === -1);
        if (advancedKeys.length > 0) {
            constraints.advanced = advancedKeys.reduce((acc, key) => {
                if ("exact" in constraints[key]) {
                    acc.push({ [key]: constraints[key].exact });
                } else if ("ideal" in constraints[key]) {
                    acc.push({ [key]: constraints[key].ideal });
                }
                return acc;
            }, []);
        }
        console.log("changing", oldConstraints, changes, constraints);
        return constraints;
    },

    // returns false if anything changed
    // returns intended change keys with their actual values (previous that stayed the same)
    nothingChanged(newSettings, oldSettings, intendedChanges) {
        // The tricky part here is that flipped W/H are not considered as a change
        // at least not on mobile where it's up to to the device to decide
        if ("width" in intendedChanges && "height" in intendedChanges) {
            if (intendedChanges.length === 2
                && (
                    (intendedChanges.width === oldSettings.height
                    && intendedChanges.height === oldSettings.width)
                        || (intendedChanges.width === oldSettings.width
                            && intendedChanges.height === oldSettings.height)
                )
            ) {
                return false;
            }
        }
        // eslint-disable-next-line no-restricted-syntax
        for (const key in intendedChanges) {
            if (newSettings[key] !== oldSettings[key]) {
                return false;
            }
        }
        const unchanged = Object.keys(intendedChanges).reduce((acc, key) => {
            acc[key] = newSettings[key];
            return acc;
        }, {});
        return unchanged;
    },

    getAspectRatioTag(width, height) {
        let [w, h] = width > height ? [width, height] : [height, width];
        const aspKeys = [0, 0, 1, 1, 2, 3, 4, 5, 6, 7, 7, 8, 8, 8, 8, 9, 9, 9, 9, 10, 10, 10];
        const aspTags = ["1:1", "5:4", "4:3", "1.43:1 IMAX", "3:2", "8:5", "5:3", "16:9", "15:8 HDTV", "2.39:1", "2.75:1"];
        const keyIndex = Math.round(12 * (w / h)) - 12;
        if (keyIndex < 0 || keyIndex > aspKeys.length) return "";
        return aspTags[aspKeys[keyIndex]];
    },

    getResolutions(givenRs, camera, os) {
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
                res.push(this.getAspectRatioTag(res[0], res[1]));
                resolutions.push(res);
            }
        });
        // last givenRs is the maximum dimensions w,h provided by capabilities
        if (givenRs.length === 2) {
            resolutions = resolutions.filter((r) => r[0] <= givenRs[1][0] && r[1] <= givenRs[1][1]);
        }
        return resolutions;
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
