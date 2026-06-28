# Allow Manual Control During Hardware Faults

Manual Control remains available even when Hardware Diagnostics reports a fault because operators may need direct intervention to recover, move, reset, or power down a robot. The UI must keep the fault visible while controls are used, and physical safety protections remain outside this product decision; the app should not silently convert diagnostic faults into software control lockouts by default.
