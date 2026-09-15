# Robot-mode Camera Diagnostics Resources

## Knowledge

- [Source: `CameraStreamControls.tsx` at commit `0b24fde`](https://github.com/zc-robot/zcbox-web/blob/0b24fde3a131114d5e05d66cdfefdd13947c7267/src/components/CameraStreamControls.tsx)
  Primary source for source selection, start/stop lifecycle, snapshot polling, canvas rendering, and the depth colormap. Use for: understanding what the operator actually sees.
- [Source: `apiServer.ts` camera-gateway adapter at commit `0b24fde`](https://github.com/zc-robot/zcbox-web/blob/0b24fde3a131114d5e05d66cdfefdd13947c7267/src/service/apiServer.ts#L346-L563)
  Defines host and port selection, renderer-to-desktop fallback behavior, cache busting, and source start/stop/snapshot calls. Use for: tracing requests out of React.
- [Source: Electron camera-gateway bridge at commit `0b24fde`](https://github.com/zc-robot/zcbox-web/blob/0b24fde3a131114d5e05d66cdfefdd13947c7267/desktop/main.cjs#L65-L264)
  Defines the desktop-side path allowlist, JSON requests, binary image fetches, and base64 handoff. Use for: debugging desktop transport and security boundaries.
- [Source: Robot-mode startup at commit `0b24fde`](https://github.com/zc-robot/zcbox-web/blob/0b24fde3a131114d5e05d66cdfefdd13947c7267/src/page/App.tsx#L42-L133)
  Shows how the selected Connection Host becomes the HTTP and WebSocket host used to derive the camera-gateway address. Use for: debugging wrong-host failures.
- [Reference: Canvas pixel manipulation — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Pixel_manipulation_with_canvas)
  Authoritative browser reference for `drawImage`, `getImageData`, and `putImageData`. Use for: understanding the browser primitives behind the depth colormap.

## Wisdom (Communities)

- [Project maintainers via `zc-robot/zcbox-web` issues](https://github.com/zc-robot/zcbox-web/issues)
  Use for: confirming camera-gateway response contracts or deployment behavior that cannot be established from this repository alone.

## Gaps

- The camera-gateway implementation and its exact snapshot/preview encodings are not present in this repository.
