const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("humanAI", {
  checklists: {
    list: () => ipcRenderer.invoke("checklists:list"),
  },
  run: {
    start: (checklistId: string, variables: Record<string, string>) =>
      ipcRenderer.invoke("run:start", checklistId, variables),
    getState: () => ipcRenderer.invoke("run:getState"),
    getChecklist: () => ipcRenderer.invoke("run:getChecklist"),
    getCurrentStep: () => ipcRenderer.invoke("run:getCurrentStep"),
    executeStep: () => ipcRenderer.invoke("run:executeStep"),
    submitProof: (stepId: string, imageBase64: string) =>
      ipcRenderer.invoke("run:submitProof", stepId, imageBase64),
    skipStep: () => ipcRenderer.invoke("run:skipStep"),
    markStepCompleted: () => ipcRenderer.invoke("run:markStepCompleted"),
  },
});
