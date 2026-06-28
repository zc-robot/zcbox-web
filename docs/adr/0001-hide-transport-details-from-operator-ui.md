# Hide Transport Details From Operator UI

The Fleet Operations Console is an operator-facing product, so Fleet View should present Fleet State using domain concepts such as robots, tasks, storage, inputs, outputs, motor health, and peripheral state rather than raw transport concepts such as Zenoh, namespaces, or topic names. Raw integration details remain available only in Engineering Diagnostics, preserving troubleshooting access without making daily operations depend on protocol vocabulary.
