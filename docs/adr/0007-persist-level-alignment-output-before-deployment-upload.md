# Persist Level Alignment Output Before Deployment Upload

Visual Level Alignment export persists the generated aligned Level images and Nav2 map YAML to the local saved map files before uploading the deployment to the Fleet Server. The frontend sends the same generated artifacts to `/slam/updateMapFiles` for every selected Level and proceeds to Deployment Upload only after every local update succeeds; the backend creates sibling `.bak` backups before overwriting navigation and localization assets.

This favors consistency between local working Level assets and uploaded deployment artifacts over treating alignment as a transient upload-only transform. The trade-off is that final export mutates local map files, but backing up the originals and failing before upload on local update errors keeps the operation auditable and recoverable.
