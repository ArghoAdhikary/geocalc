/* Electron main process — GeoCalc Pro desktop host.
 *
 * Wraps the web app as a desktop window, provides a native File menu, and
 * handles project file open/save with atomic writes (FR-ARC-004).
 *
 * webSecurity is disabled so the in-app AI assistant can call provider APIs
 * directly from the renderer without browser CORS. This is a local, single-user
 * app; the only outbound requests are ones the user triggers from the chat box,
 * to the provider they configured, with their own key.
 */
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");

let mainWindow = null;
const FILTERS = [{ name: "GeoCalc Pro project", extensions: ["gcp"] }, { name: "All files", extensions: ["*"] }];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320, height: 860, minWidth: 980, minHeight: 640,
    title: "GeoCalc Pro", backgroundColor: "#e7ecf1",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, "..", "index.html"));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) { shell.openExternal(url); return { action: "deny" }; }
    return { action: "allow" };
  });
}

// Atomic write: write a temp file alongside the target, then rename over it.
function atomicWrite(filePath, content) {
  const tmp = filePath + ".tmp-" + process.pid;
  fs.writeFileSync(tmp, content, "utf8");
  fs.renameSync(tmp, filePath);
}

ipcMain.handle("project:open", async () => {
  const res = await dialog.showOpenDialog(mainWindow, { properties: ["openFile"], filters: FILTERS });
  if (res.canceled || !res.filePaths[0]) return null;
  const p = res.filePaths[0];
  return { path: p, content: fs.readFileSync(p, "utf8") };
});

ipcMain.handle("project:save", async (_e, { content, path: p }) => {
  if (!p) return { canceled: true };
  atomicWrite(p, content);
  return { path: p };
});

ipcMain.handle("project:saveAs", async (_e, { content, defaultName }) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    defaultPath: (defaultName || "project") + ".gcp", filters: FILTERS
  });
  if (res.canceled || !res.filePath) return { canceled: true };
  atomicWrite(res.filePath, content);
  return { path: res.filePath };
});

function sendMenu(action) { if (mainWindow) mainWindow.webContents.send("menu", action); }

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    {
      label: "File",
      submenu: [
        { label: "New Project", accelerator: "CmdOrCtrl+N", click: () => sendMenu("new") },
        { label: "Open…", accelerator: "CmdOrCtrl+O", click: () => sendMenu("open") },
        { type: "separator" },
        { label: "Save", accelerator: "CmdOrCtrl+S", click: () => sendMenu("save") },
        { label: "Save As…", accelerator: "CmdOrCtrl+Shift+S", click: () => sendMenu("saveAs") },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" }
      ]
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
