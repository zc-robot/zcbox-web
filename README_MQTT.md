# MQTT 数据处理说明

前端使用 MQTT over WebSocket 获取实时机器人数据，主要用于二进制数据和高频数据。公共 MQTT 客户端创建逻辑在 `src/hooks/mqtt.ts`。

## 连接方式

前端连接地址：

```text
<ws-or-wss>://<robot-or-current-host>:9001
```

主机选择逻辑在 `src/service/apiServer.ts`：

- 开启 `自动获取域名` 时，MQTT 主机使用 `window.location.hostname`。
- 未开启时，MQTT 主机从配置的 WebSocket 域名中解析。

MQTT 客户端参数：

```text
username: zc
password: 8888
protocolVersion: 4
clean: true
resubscribe: true
keepalive: 15
reconnectPeriod: 2000 ms
connectTimeout: 5000 ms
```

旧版自定义 payload 的多字节字段按网络字节序，也就是大端序解析。ROS 2 CDR payload 会先按 CDR encapsulation 里的字节序解析。

## 主题总览

| 数据 | 订阅主题 | 请求主题 | Hook |
| --- | --- | --- | --- |
| 机器人位姿 | `robot_pose` | 无 | `useRobotPoseMqtt` |
| 电池 | `battery/data` | 每 3 秒发送 `battery/sub` | `useBatteryStateMqtt` |
| 激光位姿 | `laser_pose` | 随扫描显示开启 | `useLaserScanMqtt` |
| 过滤后扫描 | `scan/filtered` | 每 5 秒发送 `scan/filtered/required` | `useLaserScanMqtt` |
| 建图地图 | `map/compressed` | 无 | `useCompressedMapMqtt` |

## 机器人位姿

相关代码：

- `src/hooks/useRobotPoseMqtt.ts`
- `src/hooks/mqtt.ts`

订阅主题：

```text
robot_pose
```

当前 payload 是 ROS 2 CDR 序列化的 `geometry_msgs/msg/Pose`，不再是旧的 12 字节自定义格式。

CDR 消息内容：

```text
geometry_msgs/msg/Point position
  float64 x
  float64 y
  float64 z
geometry_msgs/msg/Quaternion orientation
  float64 x
  float64 y
  float64 z
  float64 w
```

Payload 前面包含 4 字节 CDR encapsulation，前端会根据 encapsulation 判断大小端，并按 CDR 对齐规则读取字段。

处理流程：

1. 订阅 `robot_pose`。
2. 将 CDR `geometry_msgs/msg/Pose` 解码成 `PoseMessage`。
3. 根据 quaternion 计算 roll、pitch、yaw，复用现有机器人渲染逻辑。
4. 通过 `useGridStore.updateRobotPose` 写入状态。

兼容性：

- 前端仍保留旧 12 字节 `float32 x, y, yaw` 格式的 fallback。
- 新机器人端应使用 CDR `geometry_msgs/msg/Pose`。

卡死恢复机制：

- Hook 会记录最后一次有效 `robot_pose` 消息时间。
- 如果 MQTT 客户端仍处于 connected 状态，但 7 秒没有收到有效位姿，就销毁并重建 MQTT 客户端。
- Watchdog 每 3 秒检查一次。

这个机制用于恢复浏览器端 MQTT 会话看起来还连接着、但实际不再收到消息的情况。

## 电池

相关代码：

- `src/hooks/useBatteryStateMqtt.ts`

订阅主题：

```text
battery/data
```

请求主题：

```text
battery/sub
```

前端每 3 秒向 `battery/sub` 发送空 payload。机器人端收到这个 ping 后，只在有限时间窗口内发布电池数据。

当前 payload 是 ROS 2 CDR 序列化的 `sensor_msgs/msg/BatteryState`，与 ROS topic `battery/state` 上的消息一致，不再是旧的固定 35 字节自定义结构。

```text
sensor_msgs/msg/BatteryState
```

MQTT payload 不包含 `battery/energy_consumption`，能耗仍是独立 ROS topic。

处理流程：

1. 解码 CDR `sensor_msgs/msg/BatteryState`。
2. 跳过 `Header`。
3. 读取 `current`。
4. 读取 `percentage`，再乘以 100 转成百分比。
5. 通过 `useGridStore.updateRobotBattery` 写入状态。

兼容性：

- 前端仍保留旧版 35 字节 `uint8 version + uint8 flags + uint8 power_supply_status + float32...` 格式的 fallback。
- 新机器人端应使用 CDR `sensor_msgs/msg/BatteryState`。

当前 UI 只显示 `battery` 和 `batteryCurrent`。

## 激光位姿和扫描数据

相关代码：

- `src/hooks/useLaserScanMqtt.ts`

这些主题只有在 UI 中开启扫描显示时才会启用。

激光位姿主题：

```text
laser_pose
```

激光位姿 payload 与 `robot_pose` 相同，也是 CDR 序列化的 `geometry_msgs/msg/Pose`：

```text
geometry_msgs/msg/Pose
```

过滤后扫描订阅主题：

```text
scan/filtered
```

过滤后扫描请求主题：

```text
scan/filtered/required
```

开启扫描显示时，前端每 5 秒向 `scan/filtered/required` 发送一个零字节 payload。机器人端收到后会开始或延长 `scan/filtered` 的发布窗口。

过滤后扫描 payload：

```text
sensor_msgs/msg/LaserScan
```

当前 payload 是 ROS 2 CDR 序列化的 `sensor_msgs/msg/LaserScan`，由机器人端 `rclcpp::Serialization<sensor_msgs::msg::LaserScan>` 生成。没有额外自定义 header、version byte 或毫米量化。

处理流程：

1. 解码 CDR `sensor_msgs/msg/LaserScan`。
2. 读取 `angle_min`、`angle_increment`、`range_min`、`range_max` 和 `ranges`。
3. 将 `NaN`、`Infinity` 等非有限 range 保持为 `NaN`。
4. `intensities` 当前 UI 不使用，会跳过。
5. 通过 `useGridStore.updateLaserPose` 和 `useGridStore.updateLaserScan` 写入状态。

兼容性：

- 前端仍保留旧版 `uint8 version + uint16 count + float32 angle_min + float32 angle_increment + uint16 range_min_mm + uint16 range_max_mm + uint16 ranges_mm[count]` 格式的 fallback。
- 新机器人端应使用 CDR `sensor_msgs/msg/LaserScan`。

渲染逻辑：

- 扫描点由 `src/components/map/LaserScan.tsx` 渲染。
- 正常情况下，扫描使用 `laser_pose` 作为位姿。
- 重定位模式下，扫描位姿会基于用户拖动的重定位机器人位姿做相对变换，便于用户让扫描轮廓和地图墙体对齐。

## 建图地图

相关代码：

- `src/hooks/useCompressedMapMqtt.ts`
- `src/worker.ts`
- `src/page/mapping/index.tsx`

订阅主题：

```text
map/compressed
```

当前 MQTT payload 是 raw `gzip(CDR nav_msgs/msg/OccupancyGrid)`，不再用 CDR `std_msgs/msg/UInt8MultiArray` 包裹。

MQTT v5 metadata：

```text
content-type: ros2+cdr/nav_msgs/OccupancyGrid
compression: gzip
```

```text
ROS /map nav_msgs/msg/OccupancyGrid
-> CDR serialize OccupancyGrid
-> gzip
-> raw MQTT payload on map/compressed
```

处理流程：

1. Mapping 页面挂载时订阅 `map/compressed`。
2. 如果上一帧地图还在解码或渲染，只保留最新的一帧 pending payload，避免积压。
3. 在 map worker 中识别 gzip payload。
4. 使用浏览器 `DecompressionStream('gzip')` 解压，得到 CDR `nav_msgs/msg/OccupancyGrid`。
5. 解码 `OccupancyGrid.info.width`、`height`、`resolution`、`origin` 和 `data`。
6. 校验 `data.length == width * height`。
7. 将 `int8[] data` 转成前端 occupancy 值。
8. 根据 `OccupancyGrid.info` 创建 `GridInfoMessage`。
9. 通过 `useGridStore.setMapGrid` 写入状态。

兼容性：

- 前端仍兼容上一版 CDR `std_msgs/msg/UInt8MultiArray` 包裹格式，即 `UInt8MultiArray.data` 中放 gzip 后的 CDR `nav_msgs/msg/OccupancyGrid`。
- 前端也兼容旧版 `version/codec/width/height/.../gzip_data` 自定义二进制。
- 新机器人端应直接向 MQTT 发布 raw `gzip(CDR nav_msgs/msg/OccupancyGrid)`。

复用现有地图渲染链路：

```text
MQTT map/compressed
  -> useCompressedMapMqtt
  -> worker.decodeCompressedMapPayload
  -> gunzip
  -> CDR OccupancyGrid
  -> useGridStore.setMapGrid
  -> GridMap
  -> worker.mapImageData
  -> Konva Image
```

建图时旧的 `/map` WebSocket 地图流已经不再用于地图数据。

## Store 更新关系

所有 MQTT 解码后的数据都会进入 Zustand grid store：

| Store action | 数据来源 |
| --- | --- |
| `updateRobotPose` | `robot_pose` |
| `updateRobotBattery` | `battery/data` |
| `updateLaserPose` | `laser_pose` |
| `updateLaserScan` | `scan/filtered` |
| `setMapGrid` | `map/compressed` |

旧的 `/robot_data` WebSocket 仍用于机器人状态字段，例如 `fsm`、`task_uid`、`localization_quality`。当 WebSocket 机器人数据到达时，store 会保留 MQTT 更新过的 pose 和 battery 值。

## 实现说明

- 当前每个 MQTT 功能拥有自己的 MQTT client。这样可以让扫描、地图等功能独立挂载和卸载，生命周期更简单。
- 二进制解析统一使用 `DataView`。CDR payload 按 encapsulation 判断大小端；电池和扫描按大端序读取。
- 地图 gzip 解压放在 worker 中执行，避免阻塞 UI 主线程。
- 电池和扫描数据在机器人端有发布窗口限制，所以前端需要周期性发送请求 ping。
- 机器人位姿不是请求触发型数据，但前端有 stale-stream watchdog，用来恢复浏览器 MQTT 会话卡死。

## 快速调试命令

订阅原始机器人位姿：

```bash
mosquitto_sub -h <robot-ip> -p 1885 -u zc -P 8888 -t robot_pose
```

`robot_pose` 和 `laser_pose` 是 CDR 二进制数据，`mosquitto_sub` 只能确认有数据，不能直接显示 x、y、yaw。

请求电池发布：

```bash
mosquitto_pub -h <robot-ip> -p 1885 -u zc -P 8888 -t battery/sub -n
```

请求扫描发布：

```bash
mosquitto_pub -h <robot-ip> -p 1885 -u zc -P 8888 -t scan/filtered/required -n
```

订阅压缩地图：

```bash
mosquitto_sub -h <robot-ip> -p 1885 -u zc -P 8888 -t map/compressed > map_payload.bin
```

`map_payload.bin` 是 raw gzip 数据，需要先 gunzip，然后把解压结果按 CDR `nav_msgs/msg/OccupancyGrid` 解码。
