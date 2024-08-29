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

    guessValueType(value) {
        if (value === !!value || value === "true" || value === "false") {
            return "boolean";
        } if (!Number.isNaN(parseFloat(value))
            && parseFloat(value).toString() === value.toString()) {
            // since parseFloat allows for string trailing characters
            return "number";
        } if (typeof value === "string") {
            return "string";
        }
        // "any" stands for objects, null, undefined, NaN
        return "any";
    },

    guessConstraintType(k, item) {
        if (["pan", "tilt", "zoom"].indexOf(k) > -1) {
            return "numberBoolean";
        } if (utilsUI.notEmptyArray(item)) {
            return this.guessValueType(item[0]) + "Array";
        } if (typeof item === "object" && item !== null) {
            return ("min" in item || "max" in item) ? "number" : "any";
        }
        return this.guessValueType(item);
    },

    /* returns guessed types for each constraint:
     string, number, boolean, stringArray, booleanArray
     pan, tilt and zoom are "numberBoolean"
     meaning they are initiated as boolean then set as number
     I'm yet to see how pointsOfInterest appear in reality - so it's "any" for now */
    getConstraintTypes(items) {
        return (Object.keys(items))
            .reduce((acc, k)=> {
                acc[k] = this.guessConstraintType(k, items[k]);
                return acc;
            }, {});
    },

    // they are generated because we want to keep them consistent with buckets
    // and getConstraintTypes() function
    constraintTypes: {},

    imageCaptureKeys() {
        const buckets = this.buckets;
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
        const buckets = this.buckets;
        return [
            ...Object.keys(buckets.IDs),
            ...Object.keys(buckets.Box),
            ...Object.keys(buckets.Audio)
        ];
    },

    getTheoreticalCapabilities() {
        return (Object.keys(this.buckets))
            .reduce((acc, key)=> Object.assign(acc, structuredClone(this.buckets[key])), {});
    },

    /* "min" and "max" usually include "step" too (though not always true) */
    /* some features have to be enable at getUserMedia {pan: true} to become available */
    /* where possible values for pan tilt zoom are  (boolean or ConstrainDouble) */
    buckets: {
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
            pointsOfInterest: { x: 0.5, y: 0.5 },
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
    },

    // Sequential application of constraints might be needed
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
                // if stream: IDs and pan, zoom, tilt "true" // track: Box, Audio
                // Audio booleans especially likely to need whole stream request
                stage1[key] = constraints[key];
            } else if (constraints[key] === "manual") {
                // manual mode just in case it should be set before value
                // all of them - ImageCapture constraints
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

    getConstraintKeys(constraints) {
        const keysSet = (constraints.advanced || [])
            .reduce((acc, o) => {
                Object.assign(acc, o);
                return acc;
            }, {});
        Object.assign(keysSet, constraints);
        delete keysSet.advanced;
        return Object.keys(keysSet);
        // set.union() is not supported on mobile
        // const advanced = constraints.advanced || [];
        // const keysSet = advanced.reduce(
        //     (acc, o) => acc.union(new Set(Object.keys(o))),
        //     new Set(Object.keys(constraints))
        // );
        // return Array.from(keysSet.values()).filter((key) => key !== "advanced");
    },

    /* returns a pair of constraints for stream and track
       and filters out advanced that don't correspond to settings
       and removes duplicates
       track constraints later will be used to find out
       which control inputs should be "enabled"
    */
    separateAndCleanConstraints(initK, returnedK, settings) {
        // in case it was like initK was boolean True and returned {}
        if (initK === !!initK
            && typeof returnedK === "object" && Object.keys(returnedK).length === 0) {
            return [initK, {}];
        }
        const streamK = {};
        const trackK = {};
        Object.keys(initK).forEach((key) => {
            if (Object.keys(this.buckets.IDs).indexOf(key) > -1) {
                streamK[key] = initK[key];
            } else if (Object.keys(this.buckets.CropAndZoom).indexOf(key) > -1) {
                if (key in returnedK && !Number.isNaN(returnedK[key])) {
                    streamK[key] = true;
                    trackK[key] = returnedK[key];
                } else {
                    streamK[key] = initK[key];
                }
            } else if (key in returnedK) {
                if (key === "advanced") {
                    trackK[key] = returnedK[key];
                } else if (typeof returnedK[key] !== "object") {
                    // TODO: is it possible for initK min/max getting lost?
                    trackK[key] = { ideal: returnedK[key] };
                } else {
                    // TODO hypothetically "exact" might not match settings
                    trackK[key] = returnedK[key];
                }
            } else if (key in settings && this.notEmpty(settings[key])) {
                // for example imageCapture constraints will not be returned
                // and can have different value due to step rounding
                trackK[key] = { ideal: settings[key] };
            }
        });
        if ("advanced" in trackK) {
            // since "advanced" treated as "exact" - remove not equal to settings
            trackK.advanced = trackK.advanced
                .filter((o) => Object.keys(o).every((k) => k in settings && o[k] === settings[k]));
            trackK.advanced = this.duplicateRemoval(trackK.advanced);
        }
        return [streamK, trackK];
    },

    notEmpty(value) {
        return value !== undefined && value !== null && value !== "";
    },

    // will return true for both object or array if not empty
    notEmptyObject(o) {
        return (typeof o === "object" && Object.keys(o).length > 0);
    },

    notEmptyArray(arr) {
        return (Array.isArray(arr) && Object.keys(arr).length > 0);
    },

    // you can always just delete keys after cloning
    filterOutObjectKeys(o, keys) {
        if (keys.length === 0) {
            return structuredClone(o);
        }
        return Object.keys(o).reduce((acc, key) => {
            if (keys.indexOf(key) === -1) {
                acc[key] = o[key];
            }
            return acc;
        }, {});
    },

    getValueFromCapability(capability) {
        if ("min" in capability) {
            return capability.min;
        } if ("ideal" in capability) {
            return capability.ideal;
        } if (Array.isArray(capability)) {
            return capability[0];
        }
        return Object.values(capability)[0];
    },

    // could be Array(2000).fill(0).
    // x = Math.floor(0.5 + Math.sqrt(0.25 + 2*i)) - 1; y = i - x*(x+1)/2;
    // for parallel execution without cycles
    // just in case: for cubic root use t = n+1 substitution and Cardano root
    duplicateRemoval(advanced) {
        let arr = structuredClone(advanced);
        let i = 0;
        while (i < arr.length) {
            // removes {} from advanced just in case
            arr[i] = arr[i] && Object.keys(arr[i]).length !== 0 ? arr[i] : false;
            const o1 = arr[i];
            let ii = 0;
            while (ii < i) {
                arr[ii] = arr[ii] && Object.keys(arr[ii]).length !== 0 ? arr[ii] : false;
                const o2 = arr[ii];
                if (o1 && o2 && Object.keys(o1).length === Object.keys(o2).length
                      && Object.keys(o1).every((k) => o1[k] === o2[k])) {
                    arr[ii] = false;
                }
                // eslint-disable-next-line no-plusplus
                ii++;
            }
            // eslint-disable-next-line no-plusplus
            i++;
        }
        return arr.filter((o) => o);
    },

    // checks effect of track constraints (and capabilities) on settings
    // if capabilities are not provided, it's a theoretical
    // creates data nodes for controls with data types and values
    // every node is disabled until found in constraints (and permitted in capabilities)
    // permanently disabled are in settings but not in capabilities (real, not theoretical)
    // theoretical value exist to show some default value in case the node gets enabled
    // since some constraints have no value and are not in capabilities - deleted
    getControlsData(constraints, settings, capabilities, log) {
        const theoreticCaps = this.getTheoreticalCapabilities();
        const theoretical = !capabilities;
        const caps = theoretical ? theoreticCaps : capabilities;
        const keys = Object.keys(Object.assign({}, settings, caps));

        const keyValues = keys.reduce((acc, key) => {
            const valueNotEmpty = (key in settings) && this.notEmpty(settings[key]);
            // the weird thing that it returns current ids(strings) as track capabilities
            const capsNotEmpty = (key in caps)
                && (this.notEmptyObject(caps[key]) || typeof caps[key] === "string");
            acc[key] = {
                status: -1,
                value: null,
                theoreticalValue: null,
                type: this.constraintTypes[key]
                        || this.guessValueType(settings[key], caps[key]),
                caps: capsNotEmpty ? structuredClone(caps[key]) : null,
                disabled: true,
                permanentlyDisabled: false,
            };
            if (valueNotEmpty && capsNotEmpty) {
                acc[key].status = 2;
                acc[key].value = settings[key];
            } else if (valueNotEmpty && !capsNotEmpty) {
                if (!(key in theoreticCaps)) {
                    log(`Key ${key} is not in theoretic capabilities`);
                }
                acc[key].status = 1;
                acc[key].value = settings[key];
                acc[key].caps = (!theoretical && (key in theoreticCaps))
                    ? structuredClone(theoreticCaps[key]) : null;
                acc[key].permanentlyDisabled = !theoretical;
            } else if (!valueNotEmpty && !capsNotEmpty) {
                // for weird cases when empty options in caps: facingMode = []
                // and no value in settings: facingMode key not in settings
                console.log(`Key ${key} is not in settings or capabilities`);
                delete acc[key];
            } else { // stands for leftover: (!valueNotEmpty && capsNotEmpty)
                acc[key].status = 0;
                acc[key].theoreticalValue = this.getValueFromCapability(caps[key]);
                console.log(`Key ${key} is not in settings but in caps`);
            }
            return acc;
        }, {});

        const deleteConstraintKeys = [];
        this.getConstraintKeys(constraints).forEach((key) => {
            if (!(key in keyValues) || keyValues[key].status === 0) {
                deleteConstraintKeys.push(key);
            } else if (keyValues[key].status === 2
                   || (keyValues[key].status === 1 && !theoretical)) {
                keyValues[key].disabled = false;
            }
        });

        const clonedC = this.filterOutObjectKeys(constraints, deleteConstraintKeys);
        if (deleteConstraintKeys.length > 0 && "advanced" in clonedC) {
            clonedC.advanced.forEach((o, i) => {
                clonedC.advanced[i] = this.filterOutObjectKeys(o, deleteConstraintKeys);
            });
            clonedC.advanced = this.duplicateRemoval(clonedC.advanced);
        }

        return { controlsData: keyValues, cleaned: clonedC };
    },

    // nothing (intentionally) changed, returns false immediately if anything changed
    // returns unchanged only if not one of the intended changes was applied
    findUnchanged(newSettings, oldSettings, intendedChanges) {
        // The tricky part here is that flipped W/H are not considered as a change
        // at least not on mobile where it's up to to the device to decide
        if ("width" in intendedChanges && "height" in intendedChanges) {
            if (Object.keys(intendedChanges).length === 2
                && (
                    (newSettings.width === oldSettings.height
                        && newSettings.height === oldSettings.width)
                    || (newSettings.width === oldSettings.width
                        && newSettings.height === oldSettings.height)
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
            acc[key] = { unchanged: newSettings[key], intended: intendedChanges[key] };
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

    stayFullScreen(canvas) {
        const expandFullScreen = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        expandFullScreen();
        // Resize screen when the browser has triggered the resize event
        window.addEventListener("resize", expandFullScreen);
    },

    downloadJSONold(exportObj, exportName) {
        const anchor = document.createElement("a");
        anchor.setAttribute("href", "data:text/json;charset=utf-8,"
            + encodeURIComponent(JSON.stringify(exportObj, null, 2)));
        anchor.setAttribute("download", exportName + ".json");
        document.body.appendChild(anchor); // required for firefox
        anchor.click();
        anchor.remove();
    },

    downloadJSON(exportObj, exportName) {
        const anchor = document.createElement("a");
        const blob = new Blob(
            [JSON.stringify(exportObj, null, 2)],
            { type: "application/json;charset=utf-8" }
        );
        const jsonObjectUrl = URL.createObjectURL(blob);
        anchor.setAttribute("href", jsonObjectUrl);
        anchor.setAttribute("download", exportName + ".json");
        document.body.appendChild(anchor); // required for firefox
        anchor.click();
        URL.revokeObjectURL(jsonObjectUrl);
        anchor.remove();
    },

    downloadImage(canvas) {
        const anchor = document.createElement("a");
        anchor.setAttribute("href", canvas.toDataURL("image/jpeg"));

        const ts = new Date()
            .toISOString()
            .substring(0, 19)
            .replaceAll("-", "")
            .replaceAll(":", "");
        anchor.setAttribute("download", `snapshot_${ts}.jpg`);
        document.body.appendChild(anchor); // required for firefox
        anchor.click();
        anchor.remove();
    }
};

utilsUI.constraintTypes = utilsUI.getConstraintTypes(utilsUI.getTheoreticalCapabilities());
