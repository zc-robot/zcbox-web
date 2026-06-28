# Fleet Operations Console

This context describes the operator-facing concepts for a desktop application used to run and supervise a robot fleet in a site.

## Language

**Fleet Operations Console**:
A desktop console for on-site operators to monitor a robot fleet, manage tasks, manage storage, inspect operational state, and issue bounded controls during live operations. The shared codebase provides common console capabilities, while project-specific packaged app builds may differ in Task Templates, terminology, and actuator controls.
_Avoid_: Robot debugger, Zenoh viewer, map editor

**Project Build**:
A packaged version of the Fleet Operations Console tailored to a specific project, including project-specific Task Templates, terminology, actuator controls, and version identity. The app should expose project build identity in a low-noise place such as Settings, About, or a footer.
_Avoid_: Generic app instance

**Task**:
An operator-requested unit of fleet work represented as a defined sequence of Unit Tasks before it is sent to the Task Manager. A task lifecycle is Draft, Scheduled, Submitted, Active, then Completed, with Failed and Canceled as terminal exits; Draft is not sent to the Fleet Server, Scheduled waits for a timer, Submitted is sent and waiting for acceptance or execution, and Active is being executed.
_Avoid_: API request, UI form

**Unit Task**:
One step in a Task sequence. Every Task is composed from two kinds of unit tasks: Go To and Action.
_Avoid_: Subtask

**Go To**:
A Unit Task that moves a Robot to a target such as a Waypoint, Storage Location, or other navigable destination.
_Avoid_: Move command

**Action**:
A Unit Task that asks the Robot to perform a non-navigation operation, such as interacting with a shelf, lift motor, Digital Output, or other actuator.
_Avoid_: Button click, actuator topic

**Task Manager**:
The backend component that receives a Task with a clear Unit Task sequence and decides whether each Unit Task can be performed. The Task Manager does not create the task sequence; the frontend creates it from operator inputs and project-specific task rules.
_Avoid_: Task sequence builder, frontend

**Task Template**:
A frontend rule packaged with the desktop app that turns project-specific operator inputs into a defined sequence of Unit Tasks. Different projects can provide different task templates without changing the Task Manager contract. Operators should be able to inspect the generated Unit Task sequence before submission, but direct sequence editing is not required.
_Avoid_: Task manager logic, form only

**Feed Task Template**:
A Task Template where the operator selects a Robot and Zone, and the frontend creates the Go To and Action sequence needed for feeding work based on project-specific rules and Storage state.
_Avoid_: Feed task manager

**Template Error**:
A Task creation error where the frontend cannot generate a valid Unit Task sequence from the operator's Task Template inputs.
_Avoid_: Backend rejection

**Submission Error**:
A Task error where the Fleet Server or Task Manager rejects or cannot receive the Task.
_Avoid_: Execution failure

**Execution Error**:
A Task error where a Task was accepted but failed during execution.
_Avoid_: Submission error

**Blocked Task**:
A Task or Unit Task that cannot proceed because Storage, Robot state, door/lift/resource state, or route availability prevents it.
_Avoid_: Generic failure

**Robot-assigned Task**:
A Task where the operator selects the specific Robot that should execute the work.
_Avoid_: Dispatcher-assigned task

**Dispatcher-assigned Task**:
A Task where the operator defines the work and the Fleet Server chooses which Robot should execute it.
_Avoid_: Robot-assigned task

**Storage**:
The fleet-operational model of places where goods, racks, pallets, or inventory units can be placed, reserved, picked, dropped, or blocked. Storage state determines where robots can be sent and whether pickup/dropoff work is valid.
_Avoid_: Map annotation, database list

**Storage Location**:
A named place within Storage, usually tied to a Level and one or more Waypoints, where an inventory unit, rack, or pallet can be placed, reserved, picked, or dropped. A storage location has an availability state such as available, reserved, occupied, or blocked.
_Avoid_: Waypoint, map point

**Inventory Unit**:
The generic thing occupying or moving between Storage Locations, such as a pallet, rack, or other load handled by the robot fleet.
_Avoid_: Storage location

**Zone**:
A named operational grouping of Storage Locations or shelves. Some Tasks, such as feed tasks, use a Zone as an operator input that the frontend expands into a Unit Task sequence based on project-specific task rules and current Storage state.
_Avoid_: Single storage location

**Robot**:
An operational fleet member with a unique IP address configured through the Fleet Operations Console and sent to the fleet server. A robot also has operator-facing state such as status, pose, battery, task activity, peripheral state, and integration identifiers such as a command namespace.
_Avoid_: Zenoh namespace, RMF participant, ROS node

**Fleet Server**:
The backend authority that stores fleet configuration and exposes fleet-level APIs for robot registration, robot IP configuration, task dispatch, storage state, maps/sites, and RMF/free-fleet integration. It contains the free_fleet/RMF adapter and may run on a robot controller for single-robot sites or on an independent computer for multi-robot sites.
_Avoid_: Desktop app, robot controller

**Robot Controller**:
The robot's onboard Orange Pi 5 Plus computer running Ubuntu 22.04 and robot-local programs such as Nav2, OpenPLC, battery interface, motor interface, and related hardware integrations.
_Avoid_: Fleet server, desktop app

**Connection Host**:
The IP address or hostname selected at startup as the desktop app's target. In Robot View it is a Robot Controller; in Fleet View it is usually the Fleet Server, which may be co-located on a Robot Controller for single-robot sites.
_Avoid_: Controller IP

**Robot View**:
The site setup area of the Fleet Operations Console where operators build maps and prepare deployment data such as waypoints, paths, doors, and lifts before sending the deployment to the Fleet Server.
_Avoid_: Single-robot operations view

**Fleet View**:
The daily operations area of the Fleet Operations Console where operators monitor the fleet and create, dispatch, and manage operational tasks.
_Avoid_: Mapping view, deployment setup

**Mapping Phase**:
The site setup phase that creates or imports the physical map representation, such as PNG, PGM, YAML map files, and map metadata. The map may be produced by SLAM workflows or imported from existing map assets.
_Avoid_: Deployment phase, daily operations

**Deployment Phase**:
The site setup phase after mapping where operators turn a physical map into fleet-operational navigation data such as waypoints, paths, doors, lifts, reference coordinates, robot footprint/configuration, and data that must be exported or sent to the Fleet Server before daily operations.
_Avoid_: Mapping phase, daily operations

**Site**:
The operational place managed by one Fleet Server, containing one or more levels, robots, storage areas, tasks, and deployment data. A site is broader than a single map file.
_Avoid_: Map file

**Level**:
An operational map layer in a site that contains the map image and deployment information such as waypoints and related navigation data. In this product, level and map refer to the same operator-facing concept, with level preferred when the object includes more than raw map files.
_Avoid_: Map

**Waypoint**:
A named navigable pose on a Level that can be used as a task destination, route point, storage location reference, or operational landmark. A waypoint must be meaningful to navigation or dispatch, not merely a drawn point on the canvas.
_Avoid_: Canvas point

**Lane**:
A navigable connection between Waypoints on a Level, used to form the navigation graph for dispatch and traffic planning. A lane has a width that constrains obstacle avoidance; while moving along the lane, a robot should not plan beyond that width.
_Avoid_: Path, graph edge

**Door**:
A controllable or annotated passage on a Level that affects whether robots can traverse connected Lanes. A door has geometry on the map and may have an integration identity and traversal constraints such as open/closed state, direction, or waiting behavior.
_Avoid_: Static drawing

**Lift**:
A vertical transport resource connecting Levels, with named stops, map geometry or location, and possible integration/control state. A lift affects task planning because a robot may need to reserve, wait for, enter, ride, and exit the lift to complete cross-level work.
_Avoid_: Elevator drawing

**Fleet State**:
The live operational picture of the fleet in Fleet View, including robot positions, statuses, batteries, current tasks, faults, connectivity, and relevant peripheral state. Operators should see a coherent fleet picture rather than transport details such as Zenoh, namespaces, or topic names. Fleet State should be marked stale if no update arrives for 3 seconds.
_Avoid_: Zenoh data, topic list, namespace

**Engineering Diagnostics**:
A separate surface for development and troubleshooting details such as DIDO bits, motor states, raw subscription status, namespaces, topic names, backend technical error details, or stack traces. Engineering diagnostics should not be mixed into the normal operator workflow; operators should see domain-level messages first.
_Avoid_: Operator dashboard

**Hardware Diagnostics**:
An operator-facing diagnostics surface for Robot and system health details such as CPU temperature, memory, sensor connectivity, network interface status, CAN/UART interface status, battery interface status, motor interface status, and other hardware-adjacent health signals. Hardware diagnostics should use operator-facing names and health states rather than raw transport names. Hardware diagnostics are subscribed to directly by the desktop app for all Robots at a low or normal rate when topic volume is small enough, live in Robot Detail, and are not shown on Dashboard. Diagnostic groups include Compute, Sensors, and Interfaces, with Power and Motion groups shown when those signals are available. Diagnostic levels map to Normal, Warning, Fault, and Unknown or Stale; diagnostics are Stale after 5 seconds without an update and Unknown if no diagnostics have arrived for that Robot in the current session. Robot Detail should default Hardware Diagnostics to abnormal items only, including Warning, Fault, Stale, and Unknown, with a toggle to show Normal items. Fault diagnostics should warn or block Robot-assigned Tasks unless the Task Manager explicitly accepts them; Warning diagnostics should be visible but not block dispatch by default. Hardware Diagnostics alerts are visual-only in the first version, with no sound or desktop notifications.
_Avoid_: Engineering diagnostics, raw topic list

**Diagnostic Name**:
An operator-facing label derived from a raw diagnostic identifier. Examples include CPU, Memory, Swap, Lidar, Lidar 1, Lidar 2, Lidar 3, IMU, Camera 1 Color, Camera 1 Depth, Ethernet enP4p65s0, CAN can0, CAN can1, and UART uart6.
_Avoid_: Raw diagnostic identifier

**Digital Input**:
An operator-facing read-only peripheral input signal reported by a robot or its controller. Use compact `I` labels for unnamed signals, such as `I1`, `I2`, and so on. Operators should not simulate or override Digital Inputs in Fleet View because inputs represent observed hardware state. Do not provide in-app label editing in the first version.
_Avoid_: DIDO, DI, UInt8MultiArray, topic bit

**Digital Output**:
An operator-facing peripheral output signal reported by a robot or its controller. Use compact `O` labels for unnamed signals, such as `O1`, `O2`, and so on. Operators may command predefined Digital Outputs explicitly where supported, and those controls should reflect the currently observed output or coil state. If observed state has not arrived, predefined output controls should be visible but disabled with Unknown state. The displayed output value should wait for observed state and should not update optimistically from command response alone. After an output command, the UI may show pending or sent status and the service response separately from the observed output value. Arbitrary output address entry belongs in Engineering Diagnostics rather than normal Fleet View or Robot Detail. Do not provide in-app label editing in the first version.
_Avoid_: DIDO, DO, UInt8MultiArray, topic bit

**Manual Control**:
A bounded operator override for a selected Robot during daily operations. Manual control may include velocity commands, Digital Outputs, lift motor commands, or other robot actuator commands sent through robot integrations, and is a temporary intervention rather than a Task. For velocity control, releasing the control sends zero velocity; actuator controls should show current state and require explicit commands, but should not auto-revert unless the actuator semantics require it. Velocity Control belongs in the Fleet View sidebar; non-velocity actuator controls belong in Robot detail or Peripheral State views. For now, every Fleet View user may use Manual Control. Hardware Diagnostics faults, Disconnected state, and Last Known State should not block Manual Control by default, although those states should remain visible while controls are used.
_Avoid_: Task, autonomous dispatch

**Velocity Control**:
A Manual Control for temporarily moving a selected Robot by sending velocity commands. In Fleet View, velocity control is a persistent sidebar control rather than part of the robot list or robot detail.
_Avoid_: Task, joystick debug tool

**Peripheral State**:
A Robot's live hardware-adjacent state shown to operators, including Digital Inputs, Digital Outputs, lift motors, shelf or pallet state, battery, and motor health. Peripheral state should be grouped by operator function: Power, Motion, Fork/Lift, Shelf/Pallet, and I/O. Peripheral state should be presented as operator concepts rather than raw messages or topics, and is the natural home for non-velocity actuator controls.
_Avoid_: Raw topic data, hardware dump

**Robot Detail**:
A side panel or drawer for inspecting one selected Robot while keeping Fleet View context visible. Robot detail contains Overview, Peripheral State, Hardware Diagnostics, and Robot Activity sections, plus non-velocity Manual Control. Its header should always show robot name, IP address, current Level, current Task, battery percentage, overall health, and last update age. Robot Detail stays pinned to the selected Robot if that Robot disconnects or disappears from live Fleet State, showing Disconnected or Last Known State with age rather than closing automatically.
_Avoid_: Separate robot page, row expansion

**Robot Overview**:
The first Robot Detail section, showing the minimum operational identity and state needed before opening deeper sections: robot name, IP address, Level, pose or position, battery, current Task, current Unit Task, mode or state, network state, last update age, and overall health.
_Avoid_: Full diagnostics, raw telemetry

**Robot Activity**:
An operator timeline for one selected Robot, including current task changes, Unit Task start/finish/fail events, Manual Control events, deployment or Level changes affecting that Robot, and important Peripheral State or Hardware Diagnostics changes. Robot Activity should not include low-level transport or debug logs. In the first version, Robot Activity is session-only in the desktop app rather than persisted.
_Avoid_: Debug log, raw event stream

**Dashboard**:
The default daily-operations view that shows one coherent operating picture, including the current Level map, robot positions, active tasks, fleet health, blockers, faults, and critical Peripheral State alerts. The Dashboard map should be interactive, including panning and mouse-wheel zooming, and should be optimized for scanning and intervention rather than configuration. Clicking a robot selects it, opens Robot Detail, and centers that robot in the map view.
_Avoid_: Configuration page, raw data panel

**Sites View**:
The Fleet View section for operational site assets already known to the Fleet Server, including choosing the active site or Level, inspecting deployed configuration, syncing or uploading completed deployment packages, and viewing status. Sites View is not the editor for waypoints, lanes, doors, or lifts; those belong to Robot View's Deployment Phase.
_Avoid_: Deployment editor

**Deployment Upload**:
The handoff from Robot View's Deployment Phase to the Fleet Server, consisting of an RMF building map YAML and referenced Level image files. The Fleet Server accepts the upload, stores the building map assets, and generates the navigation artifacts used for daily operations.
_Avoid_: Local export, GET request

**Deployment Activation**:
The step after a successful Deployment Upload that makes the new deployment take effect in daily operations. Deployment activation restarts the Fleet Server services so generated RMF and navigation artifacts are loaded before Fleet View uses the Site. During activation, Fleet View is not ready for daily operations and task dispatch should remain unavailable until the Fleet Server is reachable and fresh Fleet State is received. Manual Control may still be sent if the selected Robot command path is available.
_Avoid_: Upload success, map save

**Fleet Disconnected**:
The Fleet View state where the Fleet Server is down, restarting, unreachable, or not publishing fresh Fleet State for 10 seconds. Stale data must not be presented as live during Fleet Disconnected.
_Avoid_: No Zenoh data, topic error

**Poor Network**:
An operator-facing Robot connectivity state shown when live state feedback is stale, disconnected, or unreliable but the app may still be able to send Manual Control commands through the selected Robot command path. Poor Network should be shown inline on the robot marker, robot row, Robot Detail header, and Manual Control panel rather than as a blocking popup. When Manual Control is sent in Poor Network, the UI should show a non-blocking toast that the command was sent under poor network conditions and must not imply that the Robot moved or an actuator changed until live state confirms it.
_Avoid_: Zenoh disconnected, command success

**Last Known State**:
The most recent Fleet State retained after live updates stop. Last known state should be displayed with a visible stale indicator and age. Task dispatch should remain unavailable until live Fleet State returns, but Manual Control may still be sent if the selected Robot command path is available.
_Avoid_: Live state
