import { VideoClass } from "./videoClass.js";

class VideoElement extends VideoClass {
    oninit() {
        super.oninit();
    }

    saveScreenshot() {
        const anchor = document.createElement("a");

        if (this.video.videoWidth && this.video.videoHeight) {
            const canvas = document.createElement("canvas");
            canvas.width = this.video.videoWidth;
            canvas.height = this.video.videoHeight;
            canvas
                .getContext("2d")
                .drawImage(this.video, 0, 0, canvas.width, canvas.height);
            anchor.href = canvas.toDataURL("image/jpeg");
        } else {
            return;
        }

        const ts = new Date()
            .toISOString()
            .substring(0, 19)
            .replaceAll("-", "")
            .replaceAll(":", "");
        anchor.download = `snapshot_${ts}.jpeg`;
        anchor.click();
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

customElements.define("my-camera", VideoElement);

const card = {
    type: "my-camera",
    name: "My Custom Video Element",
    preview: false,
    description: "Play any camera stream",
};
// Apple iOS 12 doesn't support `||=`
if (window.customCards) window.customCards.push(card);
else window.customCards = [card];
