const electron = require("electron");
const orchestrator = require("./orchestrator");

electron.ipcMain.handle("checklists:list", () => orchestrator.listChecklists());

electron.ipcMain.handle(
  "run:start",
  (_: unknown, checklistId: string, variables: Record<string, string>) => {
    return orchestrator.startRun(checklistId, variables || {});
  },
);

electron.ipcMain.handle("run:getState", () => orchestrator.getRunState());

electron.ipcMain.handle("run:getChecklist", () => orchestrator.getChecklist());

electron.ipcMain.handle("run:getCurrentStep", () =>
  orchestrator.getCurrentStepForRenderer(),
);

electron.ipcMain.handle("run:executeStep", async () => {
  return orchestrator.runCurrentStep();
});

electron.ipcMain.handle(
  "run:submitProof",
  async (_: unknown, stepId: string, imageBase64: string) => {
    return orchestrator.submitProof(stepId, imageBase64);
  },
);

electron.ipcMain.handle("run:skipStep", () => orchestrator.skipStep());

electron.ipcMain.handle("run:markStepCompleted", () =>
  orchestrator.markStepCompleted(),
);
