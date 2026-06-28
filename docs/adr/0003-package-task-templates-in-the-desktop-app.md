# Package Task Templates In The Desktop App

Task Templates are project-specific frontend rules that turn operator inputs into a defined sequence of Unit Tasks before the Task is sent to the Task Manager. The Fleet Operations Console packages these templates in the desktop app instead of expecting the Task Manager to generate sequences or the Fleet Server to provide template definitions.

This keeps the Task Manager contract focused on validating and executing explicit Unit Task sequences, while allowing each project build of the desktop app to provide workflows such as feed tasks. The trade-off is that changing Task Templates requires updating the app package rather than only updating Fleet Server configuration.
