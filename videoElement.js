import { VideoClass } from "./videoClass.js";

class VideoElement extends VideoClass {
    oninit() {
        super.oninit();
    }

    get hasAudio() {
        return (
            (this.video.srcObject
            && this.video.srcObject.getAudioTracks
            && this.video.srcObject.getAudioTracks().length)
            || this.video.mozHasAudio
            || this.video.webkitAudioDecodedByteCount
            || (this.video.audioTracks && this.video.audioTracks.length)
        );
    }
}

// TODO: transfer stream specific code here
customElements.define("my-camera", VideoElement);
