## Zentrix web-UI

### MQTT

详见 [README_MQTT.md](README_MQTT.md)，了解前端如何连接 MQTT，并解码机器人位姿、电池、扫描和压缩建图地图数据。

### Build

You could setup build environment by creating a `.env.production.local` file in the root directory of the project.
For now, the `.env.production.local` file should contain the following variables:

```
VITE_API_DOMAIN=http://192.168.1.173:1234
```
