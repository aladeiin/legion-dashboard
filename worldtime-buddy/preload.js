// No privileged APIs are exposed to the renderer. The app only needs
// localStorage (for saving locations) and the browser's built-in Intl
// timezone APIs, both of which are already available in the renderer
// without any bridging.
