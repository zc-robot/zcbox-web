## Zentrix web-UI

### MQTT

详见 [README_MQTT.md](README_MQTT.md)，了解前端如何连接 MQTT，并解码机器人位姿、电池、扫描和压缩建图地图数据。

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

The desktop app can test robot pose through native Zenoh by launching `desktop/zenoh-robot-pose-bridge.py` from Electron. The bridge fetches the namespace from `/zenoh/zenoh` through the existing API host, subscribes to `<namespace>/robot_pose` on `tcp/<controller-ip>:7447`, decodes the CDR pose payload, and forwards pose updates to the UI.

Pointcloud viewing is also desktop-only. When the pointcloud toolbar button is enabled, Electron launches `desktop/zenoh-pointcloud-bridge.py`, subscribes to `<namespace>/depth/points/filtered`, `<namespace>/depth/points`, and `<namespace>/yolo/detections_pointcloud`, decodes ROS 2 `sensor_msgs/PointCloud2`, downsamples the payload, and renders a top-down overlay on the map.

The macOS desktop package includes `eclipse-zenoh==1.7.1`, matching the current controller bridge. The sidecar still runs through `python3`; override paths only when testing a different Zenoh Python package or interpreter:

```bash
ZCBOX_ZENOH_PYTHON=/path/to/python3 ZCBOX_ZENOH_PYTHONPATH=/path/to/eclipse-zenoh pnpm desktop:dev
```
