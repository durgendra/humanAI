/// <reference types="vite/client" />

interface HumanAIApi {
  checklists: {
    list: () => Promise<{ id: string; name: string; description: string }[]>;
  };
  run: {
    start: (
      checklistId: string,
      variables: Record<string, string>,
    ) => Promise<{ ok: boolean; error?: string; runState?: unknown }>;
    getState: () => Promise<unknown>;
    getChecklist: () => Promise<unknown>;
    getCurrentStep: () => Promise<{
      step: {
        id: string;
        title: string;
        type: string;
        guidance: string;
        proofType?: string;
      };
      state: { status: string; message?: string };
      index: number;
      total: number;
    } | null>;
    executeStep: () => Promise<{
      done: boolean;
      verified: boolean;
      message?: string;
      runState: unknown;
    }>;
    submitProof: (
      stepId: string,
      imageBase64: string,
    ) => Promise<{ verified: boolean; message: string; runState: unknown }>;
    skipStep: () => Promise<{ runState: unknown }>;
    markStepCompleted: () => Promise<{ runState: unknown }>;
  };
}

declare global {
  interface Window {
    humanAI?: HumanAIApi;
  }
}
