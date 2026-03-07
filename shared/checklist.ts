export type StepType = 'software' | 'human';
export type ProofType = 'image' | 'confirmation' | 'both';
export type StepStatus = 'pending' | 'in_progress' | 'waiting_for_proof' | 'verified' | 'failed' | 'skipped';

export interface SoftwareCriteria {
  commands: string[];
  platform: 'host' | 'target';
  targetHost?: string;
}

export interface HumanCriteria {
  visionPrompt: string;
  confirmationPrompt?: string;
}

export interface ChecklistStep {
  id: string;
  title: string;
  type: StepType;
  proofType?: ProofType;
  criteria: SoftwareCriteria | HumanCriteria;
  guidance: string;
  links?: string[];
  optional?: boolean;
}

export interface Checklist {
  id: string;
  name: string;
  description: string;
  version?: string;
  materials?: string[];
  steps: ChecklistStep[];
  variables?: { key: string; label: string; default?: string }[];
}

export interface StepState {
  stepId: string;
  status: StepStatus;
  message?: string;
  verifiedAt?: number;
}

export interface RunState {
  checklistId: string;
  currentStepIndex: number;
  stepStates: Record<string, StepState>;
  variables: Record<string, string>;
}
