# Ship Project-Specific Desktop App Builds

The Fleet Operations Console uses a shared codebase for common fleet operations capabilities, but each project may ship its own packaged desktop app build. Project builds can differ in Task Templates, operator terminology, and actuator controls while keeping the Fleet Server and Task Manager contracts stable.

This supports project-specific workflows such as feed tasks without moving sequence-building logic into the Task Manager. The trade-off is that changing a project workflow requires releasing a new app package rather than only changing Fleet Server configuration.
