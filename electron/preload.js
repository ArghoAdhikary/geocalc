/* preload.js — safe bridge between the renderer and the Electron main process.
 * Exposes only a small project-file API (FR-ARC-004/005); no Node globals leak
 * into the page (contextIsolation stays on, nodeIntegration stays off).
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("gcDesktop", {
  isDesktop: true,
  openProject: () => ipcRenderer.invoke("project:open"),
  saveProject: (content, path) => ipcRenderer.invoke("project:save", { content, path }),
  saveProjectAs: (content, defaultName) => ipcRenderer.invoke("project:saveAs", { content, defaultName }),
  // Native menu -> renderer events (File > New/Open/Save/Save As).
  onMenu: (cb) => ipcRenderer.on("menu", (_e, action) => cb(action))
});
