# NavigateThroughPoses API 调用文档

通过 Nav2 的 ROS 2 动作接口 `nav2_msgs/action/NavigateThroughPoses`，控制机器人按顺序经过一组地图位姿。服务端先接受或拒绝目标，随后分别发送执行反馈和最终结果。目标被接受并不代表导航已经完成。

本文介绍原生 ROS 2 调用方式，以及通过 `zenoh-bridge-ros2dds` 直接使用 Zenoh 调用的方式。本文用于工程集成，不是 Fleet Server 的任务提交 API。直接调用导航会绕过 Fleet Operations Console 的 Task Manager 流程；调用前应与正在运行的车队适配器或任务执行器协调机器人控制权。

## 版本与部署信息

以下消息定义适用于 **ROS 2 Humble / Nav2 Humble 官方上游版本**。定制版本或较新的 Nav2 版本可能采用不同的目标、反馈或结果字段。客户端应使用与机器人已安装接口一致的消息类型代码。

| 配置项 | 此前检查到的 NEST 部署值 |
| --- | --- |
| 机器人控制器 | `10.148.165.8` |
| Zenoh TCP 连接地址 | `tcp/10.148.165.8:7447` |
| ROS 域 ID | `15` |
| 原生 ROS 动作名称 | `/navigate_through_poses` |
| 桥接命名空间 | `nest_23719a2467aa0281_c72d801c87` |
| Zenoh 动作基础路径 | `nest_23719a2467aa0281_c72d801c87/navigate_through_poses` |
| 位姿坐标系 | 通常为 `map`，需确认机器人的全局坐标系 |

上述部署值来自 2026-07-13 的检查。2026-09-05 尝试通过 SSH 再次核实时连接超时，因此尚未验证当前服务是否可用，也未核实机器人已安装的定制动作消息定义。编写本文时没有发送机器人运动指令。

机器人命名空间添加在 **Zenoh 键名前面**，不会自动添加到位姿的 `frame_id`。除非机器人实际使用的 TF 坐标系就是 `<robot-namespace>/map`，否则不要将 `map` 改成该值。Zenoh 键名不以 `/` 开头。此前检查到的机器人原生 ROS 动作名称不包含机器人命名空间。

## 前置条件与接口发现

Nav2 必须处于激活状态，机器人定位必须完成初始化，目标位姿所在坐标系必须能够转换到导航使用的全局坐标系。坐标采用以米为单位的地图坐标，而不是图片像素坐标。下文坐标仅用于演示；执行前应替换为当前已加载地图中的可达位姿。

在机器人的 ROS 环境中运行以下只读检查命令。若使用定制工作空间，应在加载 Humble 环境后加载该工作空间：

```bash
source /opt/ros/humble/setup.bash
source /data/ws/install/setup.bash
export ROS_DOMAIN_ID=15
ros2 action list -t
ros2 action info /navigate_through_poses
ros2 interface show nav2_msgs/action/NavigateThroughPoses
```

ROS 客户端还需要兼容的 DDS 发现配置。此前检查到的控制器使用 CycloneDDS，并将通信限制在主机回环接口；仅在另一台电脑上设置域 ID 为 15，并不能直接访问该机器人的 DDS。远程访问应使用 Zenoh，或在控制器已配置好的 ROS 环境中运行原生 ROS 示例。

使用 Zenoh 时，将以下条目合并到机器人桥接配置中已有的 `plugins.ros2dds.allow.action_servers` 列表：

```json5
action_servers: [".*/navigate_through_poses"]
```

保留其他已有的允许列表。允许发布 `transition_event` 并不等于开放导航动作接口。桥接程序会为该动作统一建立三个服务路由和两个话题路由。参见[桥接动作路由实现](https://github.com/eclipse-zenoh/zenoh-plugin-ros2dds/blob/main/zenoh-plugin-ros2dds/src/route_action_srv.rs)。

## 目标参数

| 字段 | Humble 类型 | 含义 |
| --- | --- | --- |
| `poses` | `geometry_msgs/PoseStamped[]` | 按顺序排列的导航位姿列表，不能为空 |
| `poses[i].header.frame_id` | `string` | 位姿坐标系，通常为 `map` |
| `poses[i].header.stamp` | ROS 时间 | 使用机器人时钟域的时间戳；静态地图坐标系中的目标通常可以使用零时间戳 |
| `poses[i].pose.position` | 三个 `float64` 值 | `x`、`y`、`z`，单位为米；平面导航通常设置 `z=0` |
| `poses[i].pose.orientation` | 四元数 | 单位四元数 `x`、`y`、`z`、`w` |
| `behavior_tree` | `string` | 空字符串使用服务端默认行为树；否则指定 Nav2 服务端运行环境内可访问的行为树 XML 文件路径 |

平面偏航角 `theta` 使用弧度，对应四元数为 `(0, 0, sin(theta/2), cos(theta/2))`。四个分量均为零的四元数无效。中间位姿的完成判定与是否停车取决于所选行为树；该动作本身不定义各途经点的停留时间或作业操作。

## 原生 ROS 2 调用

以下命令在连接到已激活的机器人时，会提交真实的运动目标：

```bash
ros2 action send_goal /navigate_through_poses \
  nav2_msgs/action/NavigateThroughPoses \
  '{poses: [
    {header: {frame_id: map}, pose: {position: {x: 1.0, y: 0.0, z: 0.0}, orientation: {x: 0.0, y: 0.0, z: 0.0, w: 1.0}}},
    {header: {frame_id: map}, pose: {position: {x: 2.0, y: 1.0, z: 0.0}, orientation: {x: 0.0, y: 0.0, z: 0.7071067811865475, w: 0.7071067811865476}}}
  ], behavior_tree: ""}' \
  --feedback
```

在 ROS 2 Python 节点中，使用 `rclpy.action.ActionClient(node, NavigateThroughPoses, '/navigate_through_poses')` 创建客户端。等待服务端可用后，调用 `send_goal_async(goal, feedback_callback=...)`，检查返回目标句柄的 `accepted` 标志，再调用 `get_result_async()`。保留该句柄，以便通过 `cancel_goal_async()` 取消目标。等待这些异步结果期间，节点执行器必须持续运行。参见 [Humble 动作客户端实现](https://github.com/ros2/rclpy/blob/humble/rclpy/rclpy/action/client.py)。

## 直接使用 Zenoh 的调用协议

以下使用 `BASE` 表示 `nest_23719a2467aa0281_c72d801c87/navigate_through_poses`。

| Zenoh 键名 | 操作 | 请求／接收的消息 |
| --- | --- | --- |
| `BASE/_action/send_goal` | 查询（`session.get`） | `NavigateThroughPoses_SendGoal.Request` → `.Response` |
| `BASE/_action/get_result` | 查询（`session.get`） | `NavigateThroughPoses_GetResult.Request` → `.Response` |
| `BASE/_action/cancel_goal` | 查询（`session.get`） | `action_msgs/srv/CancelGoal.Request` → `.Response` |
| `BASE/_action/feedback` | 订阅 | `NavigateThroughPoses_FeedbackMessage` |
| `BASE/_action/status` | 订阅 | `action_msgs/msg/GoalStatusArray` |

这些接口传输的是 ROS CDR 二进制消息，**不是 JSON REST 接口**。发送的服务请求必须经过序列化，并包含四字节 CDR 封装头。不要自行添加 DDS 请求标识：ROS2DDS 桥接程序负责添加该传输封装，并在返回响应时移除它。向动作基础路径执行普通 `put` 不会提交导航目标。参见[键名后缀定义](https://github.com/eclipse-zenoh/zenoh-plugin-ros2dds/blob/main/zenoh-plugin-ros2dds/src/ros2_utils.rs)和[服务序列化处理](https://github.com/eclipse-zenoh/zenoh-plugin-ros2dds/blob/main/zenoh-plugin-ros2dds/src/route_service_srv.rs)。

目标调用流程如下：

1. 生成唯一的 16 字节目标 UUID，并在整个调用过程中保留它。
2. 在发送目标前订阅反馈和状态，并根据该 UUID 筛选消息。
3. 使用 `{goal_id, goal: {poses, behavior_tree}}` 查询 `send_goal`。
4. 检查响应中的布尔值 `accepted` 和接受时间 `stamp`。目标被拒绝时结束本次流程。
5. 使用 `{goal_id}` 查询 `get_result`。响应可能需要等到执行结束才返回，因此超时时间应覆盖预期导航时长。
6. 根据结果响应中的 `status` 判断最终状态。需要停止时应显式取消；查询超时或客户端断开不会自动取消机器人运动。

### 使用 ROS 消息序列化的 Python 示例

运行环境需要安装 `eclipse-zenoh`（示例使用 1.x API）、`rclpy`，以及与机器人兼容的 `nav2_msgs` 消息类型代码。示例使用 ROS 消息类型进行 CDR 编解码，网络请求通过 Zenoh 发送。因此，它不能直接作为无 ROS 环境的 macOS 或浏览器示例运行。

将代码保存为 `navigate_through_poses_zenoh.py`。传入 `--execute` 才会提交示例位姿；传入 `--cancel-goal UUID` 则取消此前提交的指定目标。

```python
import argparse
import math
import uuid

import zenoh
from action_msgs.msg import GoalStatusArray
from action_msgs.srv import CancelGoal
from geometry_msgs.msg import PoseStamped
from nav2_msgs.action import NavigateThroughPoses
from rclpy.serialization import deserialize_message, serialize_message
from unique_identifier_msgs.msg import UUID


def pose(x, y, yaw):
    value = PoseStamped()
    value.header.frame_id = "map"
    value.pose.position.x = float(x)
    value.pose.position.y = float(y)
    value.pose.orientation.z = math.sin(yaw / 2)
    value.pose.orientation.w = math.cos(yaw / 2)
    return value


def call(session, key, request, response_type, timeout):
    for reply in session.get(
        key, payload=serialize_message(request), timeout=timeout
    ):
        if reply.ok is not None:
            return deserialize_message(reply.ok.payload.to_bytes(), response_type)
        if reply.err is not None:
            raise RuntimeError(str(reply.err))
    raise TimeoutError(f"No reply from {key}; execution state is unknown")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--endpoint", default="tcp/10.148.165.8:7447")
    parser.add_argument("--namespace", default="nest_23719a2467aa0281_c72d801c87")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--execute", action="store_true")
    mode.add_argument("--cancel-goal", type=uuid.UUID)
    parser.add_argument("--result-timeout", type=float, default=300.0)
    args = parser.parse_args()

    namespace = args.namespace.strip("/")
    base = "/".join(part for part in (namespace, "navigate_through_poses") if part)
    goal_uuid = args.cancel_goal or uuid.uuid4()
    goal_id = UUID(uuid=list(goal_uuid.bytes))
    print(f"goal_id={goal_uuid}", flush=True)

    config = zenoh.Config()
    config.insert_json5("mode", '"client"')
    import json
    config.insert_json5("connect/endpoints", json.dumps([args.endpoint]))
    config.insert_json5("scouting/multicast/enabled", "false")

    with zenoh.open(config) as session:
        if args.cancel_goal:
            request = CancelGoal.Request()
            request.goal_info.goal_id = goal_id
            # The default zero timestamp selects only this UUID.
            response = call(session, base + "/_action/cancel_goal", request,
                            CancelGoal.Response, 10.0)
            print(f"cancel_return_code={response.return_code}")
            print(f"goals_canceling={len(response.goals_canceling)}")
        else:
            def feedback(sample):
                message = deserialize_message(
                    sample.payload.to_bytes(), NavigateThroughPoses.Impl.FeedbackMessage
                )
                if bytes(message.goal_id.uuid) == goal_uuid.bytes:
                    value = message.feedback
                    print(f"remaining={value.number_of_poses_remaining}, "
                          f"distance={value.distance_remaining:.2f}m", flush=True)

            def status(sample):
                message = deserialize_message(sample.payload.to_bytes(), GoalStatusArray)
                for entry in message.status_list:
                    if bytes(entry.goal_info.goal_id.uuid) == goal_uuid.bytes:
                        print(f"status={entry.status}", flush=True)

            feedback_sub = session.declare_subscriber(base + "/_action/feedback", feedback)
            status_sub = session.declare_subscriber(base + "/_action/status", status)
            try:
                request = NavigateThroughPoses.Impl.SendGoalService.Request()
                request.goal_id = goal_id
                request.goal.poses = [pose(1.0, 0.0, 0.0), pose(2.0, 1.0, math.pi / 2)]
                request.goal.behavior_tree = ""
                response = call(session, base + "/_action/send_goal", request,
                                NavigateThroughPoses.Impl.SendGoalService.Response, 10.0)
                if not response.accepted:
                    raise RuntimeError("Navigation goal rejected")
                print("Goal accepted; waiting for terminal result", flush=True)
                result_request = NavigateThroughPoses.Impl.GetResultService.Request()
                result_request.goal_id = goal_id
                result = call(session, base + "/_action/get_result", result_request,
                              NavigateThroughPoses.Impl.GetResultService.Response,
                              args.result_timeout)
                print(f"terminal_status={result.status}; result={result.result}")
                return 0 if result.status == 4 else 1
            finally:
                feedback_sub.undeclare()
                status_sub.undeclare()

        # Cancellation acceptance is not yet a terminal CANCELED result.
        result_request = NavigateThroughPoses.Impl.GetResultService.Request()
        result_request.goal_id = goal_id
        result = call(session, base + "/_action/get_result", result_request,
                      NavigateThroughPoses.Impl.GetResultService.Response,
                      args.result_timeout)
        print(f"terminal_status={result.status}")
        return 0 if result.status == 5 else 1


if __name__ == "__main__":
    raise SystemExit(main())
```

替换示例坐标后运行：

```bash
python3 navigate_through_poses_zenoh.py --execute
```

需要取消时，在另一个终端运行以下命令，将 `YOUR_GOAL_UUID` 替换为提交目标时打印的 UUID：

```bash
python3 navigate_through_poses_zenoh.py --cancel-goal YOUR_GOAL_UUID
```

如果 `send_goal` 超时，仍应保留该 UUID，因为服务端可能已经接受目标。再次提交目标前，应先核对原目标的状态／结果，或取消该 UUID 对应的目标。本示例不会在按下 Ctrl+C、发生异常或结果查询超时时自动取消导航。

## 执行反馈、最终结果与取消

Humble 的反馈包含当前位姿 `current_pose`、已导航时长 `navigation_time`、预计剩余时长 `estimated_time_remaining`、恢复次数 `number_of_recoveries`、剩余距离 `distance_remaining` 和剩余位姿数量 `number_of_poses_remaining`。时长由 `sec` 和 `nanosec` 组成，距离单位为米。结果体为 `std_msgs/Empty result`，应根据 **GetResult 响应中的 status** 判断是否成功，而不是根据空结果体判断。参见 [Humble 动作定义](https://github.com/ros-navigation/navigation2/blob/humble/nav2_msgs/action/NavigateThroughPoses.action)。

| 状态值 | 含义 | 是否为最终状态 |
| --- | --- | --- |
| `0` | 未知（Unknown） | 无法据此确认结果 |
| `1` | 已接受（Accepted） | 否 |
| `2` | 执行中（Executing） | 否 |
| `3` | 取消中（Canceling） | 否 |
| `4` | 成功（Succeeded） | 是 |
| `5` | 已取消（Canceled） | 是 |
| `6` | 已中止（Aborted） | 是 |

上述状态值定义于 [GoalStatus](https://github.com/ros2/rcl_interfaces/blob/humble/action_msgs/msg/GoalStatus.msg)。不要假定较新 Nav2 版本中的结果错误字段也存在于 Humble 中。

取消单个目标时，使用该目标的 UUID 和零时间戳。`CancelGoal.Response.return_code` 为 `0` 表示接受取消，为 `1` 表示拒绝，为 `2` 表示未知 UUID，为 `3` 表示目标已经结束。检查 `goals_canceling` 后，还需等待最终结果。全零 UUID 配合零时间戳表示**取消全部目标**，不要用于取消单个目标。参见 [CancelGoal 语义定义](https://github.com/ros2/rcl_interfaces/blob/humble/action_msgs/srv/CancelGoal.srv)。

## 常见问题排查

| 现象 | 检查内容 |
| --- | --- |
| `send_goal` 没有响应 | 检查连接地址、命名空间、动作服务端允许列表、动作路由是否激活、消息定义是否匹配，以及服务端是否可用 |
| 目标被拒绝 | 检查 Nav2 是否激活、位姿列表是否非空、行为树是否可用，以及是否存在竞争的导航请求 |
| 接受目标后中止 | 检查定位／TF、地图坐标、规划器／控制器日志、障碍物和行为树失败原因 |
| 没有反馈 | 提交前先订阅；按包含 UUID 的 `FeedbackMessage` 解码；确认 UUID 筛选正确 |
| 结果查询超时 | 导航可能仍在执行，应查询状态或显式取消。根据预期导航时长调整客户端及中间桥接程序的查询超时 |
| 原 UUID 变成未知 | 服务端重启或结果保留时间到期可能导致目标状态被清除 |
| 生命周期窗口一直显示“等待事件” | 生命周期转换话题与动作反馈／状态是不同接口；执行导航目标不要求发生生命周期转换 |

桌面应用现有的 `zenoh-command-bridge.py` 可作为 CDR 服务查询的参考，但目前没有提供 `NavigateThroughPoses` 动作命令。接入桌面应用时，需要增加目标关联、消息订阅、结果处理和取消功能；本文 Python 示例是独立调用参考。可以在本地进行语法检查，但完整执行验证需要连接可用的机器人，并选定实际测试位姿。
