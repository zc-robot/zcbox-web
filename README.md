## Zentrix web-UI

### Legacy MQTT

旧版浏览器遥测说明保留在 [README_MQTT.md](README_MQTT.md)。桌面版现在通过 Zenoh 接收机器人位姿、电池、扫描、压缩建图地图和点云数据，并通过 Zenoh 发布速度控制。

### Build

You could setup build environment by creating a `.env.production.local` file in the root directory of the project.
For now, the `.env.production.local` file should contain the following variables:

```
VITE_API_DOMAIN=http://192.168.1.173:1234
```

### Desktop app

This project can also be packaged as an Electron desktop app for macOS and Windows.

```bash
pnpm desktop:dev
pnpm desktop:build
pnpm desktop:build:mac
pnpm desktop:build:win
```

Packaged artifacts are written to `release/`. macOS and Windows installers are also available from the `Desktop builds` GitHub Actions workflow.

Desktop builds load the app from local files, so automatic host detection falls back to `127.0.0.1`. Use `VITE_DESKTOP_HOST`, `VITE_API_DOMAIN`, or `VITE_WS_DOMAIN` in `.env.production.local` to bake in a robot host, or change the host settings in the app.

### Zenoh telemetry

The desktop app uses native Zenoh sidecars launched from Electron. The bridge fetches the namespace from `/zenoh/zenoh` through the existing API host and connects to `tcp/<controller-ip>:7447`.

`desktop/zenoh-robot-pose-bridge.py` subscribes to direct pose keys, preferring `<namespace>/robot_pose` and using `<namespace>/laser_pose` only as a delayed non-TF fallback, decodes the CDR pose payload, and forwards pose updates to the UI. `desktop/zenoh-telemetry-bridge.py` replaces the previous MQTT runtime path for battery, laser pose/scan, compressed mapping maps, and `cmd_vel_collision` publishing. Mapping enables the compressed map subscription; deployment only enables battery and scan telemetry so it does not overwrite the loaded deployment map.

Pointcloud viewing is also desktop-only. When the pointcloud toolbar button is enabled, Electron launches `desktop/zenoh-pointcloud-bridge.py`, subscribes to the configured topic list, decodes ROS 2 `sensor_msgs/PointCloud2`, downsamples the payload, and renders a top-down overlay on the map. The bridge fetches static fixed-joint transforms from `/parameter/urdf_raw`, infers standard camera optical frames when needed, and also subscribes to `<namespace>/tf` and `<namespace>/tf_static`. When a TF chain is available it prefers transforming pointcloud samples into `map`, then base frames, then `odom` before rendering. The default topic list includes `<namespace>/depth/points`, `<namespace>/*/depth/points`, `<namespace>/**/depth/points`, and filtered/yolo variants, so camera topics such as `<namespace>/camera_1/depth/points` and `<namespace>/camera_2/depth/points` are covered. Use the pointcloud topic control in the toolbar to add or replace topics for a specific robot.

The macOS desktop package includes `eclipse-zenoh==1.7.1`, matching the current controller bridge. The sidecar still runs through `python3`; override paths only when testing a different Zenoh Python package or interpreter:

```bash
ZCBOX_ZENOH_PYTHON=/path/to/python3 ZCBOX_ZENOH_PYTHONPATH=/path/to/eclipse-zenoh pnpm desktop:dev
```
