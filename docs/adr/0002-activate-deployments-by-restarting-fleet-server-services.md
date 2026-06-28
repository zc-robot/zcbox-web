# Activate Deployments By Restarting Fleet Server Services

After the desktop app uploads RMF building YAML and referenced map images to the Fleet Server, upload success alone does not mean the deployment is active. The Fleet Operations Console activates the deployment by calling the Fleet Server compose control API to stop and then start the RMF compose stack, so generated RMF/navigation artifacts are loaded before Fleet View daily operations use the Site.

This favors operational correctness over a lighter live-reload path. A future live-reload activation can replace this decision when the Fleet Server can reliably reload generated map and navigation artifacts without restarting the compose stack.
