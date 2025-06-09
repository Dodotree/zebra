# Zebra - WebCam Exploration Tool

Zebra is a browser-based tool for exploring and manipulating camera capabilities across different devices and browsers. It provides a visual interface for testing WebGL2 video processing, camera controls, and capturing media in real-time.

Right now I'm working on shaders. It's an adaptation of Leptonica's normal binarization, first working draft.

<table>
  <tr>
    <td><img src="https://github.com/Dodotree/zebra/blob/main/doc_imgs/IMG_0250.png" alt="Zebra WebCam Tool" width="45%" /></td>
    <td><img src="https://github.com/Dodotree/zebra/blob/main/doc_imgs/BinarizationWebGL.JPG" alt="Zebra WebCam Tool" width="85%" /></td>
  </tr>
</table>

## 🔗 Live Demo

Try it out: [https://dodotree.github.io/zebra/](https://dodotree.github.io/zebra/)

## 📋 Features

- **Device Discovery**: Automatically detects available cameras and microphones
- **Stream Controls**: Manipulate camera settings like exposure, focus, white balance, brightness, etc.
- **WebGL Processing**: Apply real-time shaders to video streams
- **Resolution Switching**: Test different resolutions and aspect ratios
- **Depth Camera Support**: Special handling for depth cameras (Intel RealSense)
- **Media Capture**: Take snapshots and save configurations
- **Audio Visualization**: View audio input levels
- **Advanced Controls**: Pan, tilt, zoom and other camera capabilities when available
- **Settings Export**: Download camera configurations as JSON

## 🚀 Getting Started

1. Clone this repository
2. Open index.html in a compatible browser
3. Grant permission to access cameras/microphones
4. Select a camera or mic from the dropdown
5. Push the "camera or mic" or "camera and mic" button. If camera stream is not available, make sure it's not already taken by another tab or a different app in your system.
6. Push the "frames" button if you want full screen, or the "cogs" button to see available camera options.
7. Explore available controls and settings

> ⚠️ **Important**: Camera settings modified through this tool (or any browser-based application) may persist on your system even after closing the browser. Neither browsers nor operating systems reliably restore previous camera settings automatically. This is a limitation of the underlying browser APIs and camera systems, not specific to Zebra. It's recommended to note your original settings before making changes.

## 📸 Use Cases

Zebra is particularly useful for:

- **Calibrating Camera Settings**: Fine-tune exposure, brightness, and other parameters
- **Shader Development**: Test WebGL2 shaders on live video feeds
- **Depth Sensing**: Work with RGB+D cameras like Intel RealSense
- **Camera Capability Testing**: Discover which features are available on different devices
- **Cross-Browser Testing**: Verify camera behavior across browsers

## 🔧 Technical Details

Zebra is built with modern web technologies:
- WebRTC for camera access
- MediaStream API for device control
- WebGL2 for GPU-accelerated processing
- Custom elements for modular UI components

## 🌐 Browser Compatibility

Tested and working on:
- Chrome (desktop & mobile)
- Firefox (desktop & mobile)
- Safari (iOS limitations apply)
- Edge (Chromium-based)
- Mobile Safari on iPhone
- Galaxy

Note: Some features depend on browser implementation of MediaStream capabilities.

## 📊 Example Projects

Zebra enables many creative and technical projects:
- Striped image segmentation
- Thermal printer shader effects
- Camera distortion calibration
- Flat paper leaf projection
- 3D capture from RGB and depth camera combinations

## 📄 License

MIT License

## 🙏 Contributing

Contributions welcome! Please feel free to submit a Pull Request.
