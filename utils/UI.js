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

    imageCaptureKeys() {
        const buckets = this.buckets();
        return [
            ...Object.keys(buckets.Color),
            ...Object.keys(buckets.Exposure),
            ...Object.keys(buckets.Focus),
            ...Object.keys(buckets.CropAndZoom),
            ...Object.keys(buckets.Flash),
            ...Object.keys(buckets.Photo)
        ];
    },

    nonImageCaptureKeys() {
        const buckets = this.buckets();
        return [
            ...Object.keys(buckets.IDs),
            ...Object.keys(buckets.Box),
            ...Object.keys(buckets.Audio)
        ];
    },

    theoreticalConstraints() {
        const buckets = this.buckets();
        return (Object.keys(this.buckets()))
            .reduce((acc, key)=> Object.assign(acc, buckets[key]), {});
    },

    /* "min" and "max" usually include "step" too (though not always true) */
    /* some features have to be enable at getUserMedia {pan: true} to become available */
    /* where possible values for pan tilt zoom are  (boolean or ConstrainDouble) */
    buckets() {
        return {
            IDs: { deviceId: "", groupId: "" },
            Box: {
                /* left and right sides in user direction */
                facingMode: ["environment", "user", "left", "right"],
                /* downscaled (not up scaled) and/or cropped from a higher camera resolution */
                resizeMode: ["none", "crop-and-scale"],
                /* value is the width divided by the height and is rounded to ten decimal places */
                aspectRatio: { min: 0, exact: 1.3333333332, max: 10000 },
                width: { min: 0, ideal: 640, max: 10000 },
                height: { min: 0, ideal: 480, max: 10000 },
                /* can be affected by lighting conditions */
                frameRate: { min: 0, ideal: 30, max: 110 }
            },
            Audio: {
                sampleRate: { min: 0, ideal: 48000, max: 96000 },
                /* The linear sample size in bits. If device produces *linear* samples */
                sampleSize: { min: 0, ideal: 16, max: 32 },
                echoCancellation: [true, false],
                autoGainControl: [true, false],
                noiseSuppression: [true, false],
                voiceIsolation: [true, false],
                latency: { min: 0.1, ideal: 0.01, max: 0.1 },
                channelCount: { min: 0, ideal: 2, max: 2 },
                /* deprecated */
                volume: { min: 0.0, ideal: 0.5, max: 1.0 }
            },
            Exposure: {
                /* chances are that only "manual" and "continuous" are available */
                exposureMode: ["none", "manual", "single-shot", "continuous"],
                /* only works in manual mode */
                exposureTime: {
                    min: 4.8828125, step: 4.8828125, ideal: 1250, max: 2500
                },
                /* only works in continuous or single-shot mode */
                exposureCompensation: { min: 0, ideal: 0, max: 255 },
                /* sensitivity of the camera to light */
                iso: { min: 0, ideal: 100, max: 800 },
            },
            Flash: {
                /* light stays on as long as the track is active  */
                torch: [true, false],
            },
            Photo: {
                imageHeight: { min: 0, ideal: 480, max: 10000 },
                imageWidth: { min: 0, ideal: 640, max: 10000 },
                fillLightMode: ["off", "auto", "flash"],
                redEyeReduction: ["never", "always", "controllable"],
            },
            Focus: {
                focusMode: ["none", "manual", "single-shot", "continuous"],
                /* usually in meters */
                focusDistance: { min: 0, ideal: 5, max: 600 },
                focusRange: { min: 0, ideal: 0.5, max: 1 },
                backgroundBlur: [true, false],
                /* in use by Focus, Exposure and Auto White Balance, in normalized coords 0.0-1.0 */
                pointsOfInterest: { exact: { x: 0.5, y: 0.5 } },
            },
            Color: {
                whiteBalanceMode: ["none", "manual", "single-shot", "continuous"],
                /* enabled in manual white balance mode */
                colorTemperature: {
                    min: 2000, step: 10, ideal: 3950, max: 7500
                },
                brightness: { min: 0, ideal: 128, max: 255 },
                contrast: { min: 0, ideal: 128, max: 255 },
                saturation: { min: 0, ideal: 128, max: 255 },
                sharpness: { min: 0, ideal: 128, max: 255 }
            },
            CropAndZoom: {
                /* getUserMedia with  {pan: true, tilt: true, zoom: true} */
                /* and then .applyConstraints({advanced: [{pan: event.target.value}]}); */
                pan: {
                    min: -180000, step: 3600, ideal: 0, max: 180000
                },
                tilt: {
                    min: -180000, step: 3600, ideal: 0, max: 180000
                },
                zoom: { min: 100, ideal: 100, max: 400 }
            },
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
        const mediaConstraints = this.nonImageCaptureKeys();
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
        const keysRequired = Object.keys(constraints).reduce((acc, key) => {
            acc[key] = true;
            return acc;
        }, {});
        const keysSet = Object.keys(constraints.advanced || []).reduce((acc, o) => {
            Object.assign(acc, o);
            return acc;
        }, keysRequired);
        return Object.keys(keysSet);
        // set.union() is not supported on mobile
        // const advanced = constraints.advanced || [];
        // const keysSet = advanced.reduce(
        //     (acc, o) => acc.union(new Set(Object.keys(o))),
        //     new Set(Object.keys(constraints))
        // );
        // return Array.from(keysSet.values()).filter((key) => key !== "advanced");
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
            acc[key] = { ideal: keyValues[key] };
            return acc;
        }, idConstraints);
        if (advancedKeys.length > 0) {
            constraints.advanced = keys.map((key) => ({ [key]: keyValues[key] }));
        }
        return constraints;
    },

    // TODO: advanced should be overridden in reverse order
    // since the lower set in the advanced is the least priority
    // each set in advanced is either satisfied or failed together
    // all values in the set treated as "exact"
    // if advanced fails it tries to go as close as possible to "ideal"
    // "max", "min", or "exact" are always treated as mandatory
    // meaning if it's not possible to satisfy Promise will be rejected
    // in one hand you'll know it's not possible and act on it
    // (in the other hand it might get somewhat satisfied without "exact")
    // so technically we should check by getConstraints() which one was satisfied
    // on each step and save that to know for sure what worked
    // BUT that is in theory, in practice advanced support is iffy
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
        return constraints;
    },

    // separate function for the sake of keeping one standard
    getUnchangedItem(actual, intended) {
        return { unchanged: actual, intended };
    },

    // nothing (intentionally) changed, returns false immediately if anything changed
    // returns unchanged only if not one of the intended changes was applied
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
            acc[key] = this.getUnchangedItem(newSettings[key], intendedChanges[key]);
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
                // added below for the sake of diversity, not sure if they are natively supported
                [2560, 1440, "16:9 1440p 2K", 60],
                [1920, 1080, "16:9 1080p Full HD", 60],
                [1280, 720, "16:9 720p HD", 60],
                [640, 480, "4:3 480p SD", 60],
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

    parseValue(txt, item) {
        if (txt === "true" || txt === "false") {
            return txt === "true";
        }
        if (typeof item === "object" && "max" in item) {
            return parseFloat(txt);
        }
        return txt;
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
