/* Electron main process — wraps the GeoCalc web app as a desktop window.
 *
 * webSecurity is disabled so the in-app AI chat can call provider APIs
 * (Anthropic / OpenAI / Gemini) directly from the renderer without being
 * blocked by browser CORS. This is a local, single-user personal app; the
 * only outbound requests are the ones the user triggers from the chat box,
 * to the provider they configured, with their own key.
 */
const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 920,
    minHeight: 600,
    title: "GeoCalc",
    backgroundColor: "#0f1419",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  });

  win.loadFile(path.join(__dirname, "..", "index.html"));

  // Open any target="_blank" / external links in the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) { shell.openExternal(url); return { action: "deny" }; }
    return { action: "allow" };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
