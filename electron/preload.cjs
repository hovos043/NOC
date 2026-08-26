const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nameamNoc", {
  getAuthToken: () => ipcRenderer.invoke("nameam-noc:get-auth-token"),
  getAppVersion: () => ipcRenderer.invoke("nameam-noc:get-app-version"),
});
