# Mission: Maintain robot-mode camera diagnostics

## Why
Trace camera data from the Robot Controller into the Fleet Operations Console so depth-preview failures can be localized and the playback path can be changed safely.

## Success looks like
- Explain which host, port, and camera-gateway routes Robot View uses.
- Distinguish source activation, RTSP output, preview rendering, and snapshot polling.
- Identify whether a depth-video fault belongs to source discovery, gateway control, transport, image decoding, or canvas colorization.

## Constraints
- Ground explanations in the current `zcbox-web` working tree.
- Keep each lesson short and tied to a concrete maintenance or debugging task.
- Treat camera-gateway internals as an external boundary because their implementation is not in this repository.

## Out of scope
- Camera hardware calibration and ROS driver configuration.
- Fleet View camera UX.
- Point-cloud ROI generation and 3D rendering beyond its separation from depth-video playback.
