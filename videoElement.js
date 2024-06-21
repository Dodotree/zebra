import {VideoClass} from './videoClass.js';

class VideoElement extends VideoClass {
    /**.
     * @param {Object} config
     */
    setConfig(config) {

        if (config.backgroundPlayOk) this.backgroundPlayOk = config.backgroundPlayOk;

        if (config.intersection === 0) this.visibilityThreshold = 0;
        else this.visibilityThreshold = config.intersection || 0.75;

        /**
         * @type {{
         *     media: string,
         *
         *     title: string,
         *     poster: string,
         *     muted: boolean,
         *     intersection: number,
         *     ui: boolean,
         *     style: string,
         *     backgroundPlayOk: boolean,
         * }} config
         */
        this.config = Object.assign({
            media: this.media,
        }, config);

        this.streamID = -1;
        this.nextStream(false);
    }

    setStatus(mode, status) {
        const divMode = this.querySelector('.mode').innerText;
        if (mode === 'error' && divMode !== 'Loading..' && divMode !== 'Loading...') return;

        this.querySelector('.mode').innerText = mode;
        this.querySelector('.status').innerText = status || '';
    }

    /** @param reload {boolean} */
    nextStream(reload) {
        this.streamID = (this.streamID + 1) % this.config.streams.length;
        const stream = this.config.streams[this.streamID];
        this.media = stream.media || this.config.media;

        if (reload) {
            this.ondisconnect();
            setTimeout(() => this.onconnect(), 100); // wait ws.close event
        }
    }

    oninit() {
        super.oninit();
        this.renderMain();
        this.renderCustomUI();
        this.renderShortcuts();
        this.renderStyle();
    }

    saveScreenshot() {
        const anchor = document.createElement('a');

        if (this.video.videoWidth && this.video.videoHeight) {
            const canvas = document.createElement('canvas');
            canvas.width = this.video.videoWidth;
            canvas.height = this.video.videoHeight;
            canvas.getContext('2d').drawImage(this.video, 0, 0, canvas.width, canvas.height);
            anchor.href = canvas.toDataURL('image/jpeg');
        } else {
            return;
        }

        const ts = new Date().toISOString().substring(0, 19).replaceAll('-', '').replaceAll(':', '');
        anchor.download = `snapshot_${ts}.jpeg`;
        anchor.click();
    }

    get hasAudio() {
        return (
            (this.video.srcObject && this.video.srcObject.getAudioTracks && this.video.srcObject.getAudioTracks().length) ||
            (this.video.mozHasAudio || this.video.webkitAudioDecodedByteCount) ||
            (this.video.audioTracks && this.video.audioTracks.length)
        );
    }
}

customElements.define('my-camera', VideoElement);

const card = {
    type: 'my-camera',
    name: 'My Custom Video Element',
    preview: false,
    description: 'Play any camera stream',
};
// Apple iOS 12 doesn't support `||=`
if (window.customCards) window.customCards.push(card);
else window.customCards = [card];