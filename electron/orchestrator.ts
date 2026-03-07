const { exec } = require('child_process');
const pathModule = require('path');
const fs = require('fs');

interface Checklist {
  id: string;
  name: string;
  description: string;
  version?: string;
  materials?: string[];
  steps: Array<{
    id: string;
    title: string;
    type: 'software' | 'human';
    proofType?: string;
    criteria: Record<string, unknown>;
    guidance: string;
    links?: string[];
    optional?: boolean;
  }>;
  variables?: Array<{ key: string; label: string; default?: string }>;
}

interface StepState {
  stepId: string;
  status: string;
  message?: string;
  verifiedAt?: number;
}

interface RunState {
  checklistId: string;
  currentStepIndex: number;
  stepStates: Record<string, StepState>;
  variables: Record<string, string>;
}

let currentRun: RunState | null = null;
let currentChecklist: Checklist | null = null;

function getChecklistsDir(): string {
  try {
    const { app } = require('electron');
    return pathModule.join(app.getAppPath(), 'electron', 'checklists');
  } catch {
    return pathModule.join(__dirname, 'checklists');
  }
}

function getChecklistPath(id: string): string {
  return pathModule.join(getChecklistsDir(), `${id}.json`);
}

function loadChecklist(id: string): Checklist | null {
  try {
    const p = getChecklistPath(id);
    const raw = fs.readFileSync(p, 'utf-8');
    const checklist = JSON.parse(raw) as Checklist;
    currentChecklist = checklist;
    return checklist;
  } catch {
    return null;
  }
}

function listChecklists(): { id: string; name: string; description: string }[] {
  const dir = getChecklistsDir();
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f: string) => f.endsWith('.json'));
  const list: { id: string; name: string; description: string }[] = [];
  for (const f of files) {
    try {
      const c = JSON.parse(fs.readFileSync(pathModule.join(dir, f), 'utf-8')) as Checklist;
      list.push({ id: c.id, name: c.name, description: c.description || '' });
    } catch {
      // skip invalid
    }
  }
  return list;
}

function substituteVariables(str: string, vars: Record<string, string>): string {
  let out = str;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v || '');
  }
  return out;
}

function runCommand(command: string, cwd?: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    exec(substituteVariables(command, currentRun?.variables || {}), { cwd: cwd || process.cwd(), timeout: 10000 }, (err: Error | null, stdout: string, stderr: string) => {
      if (err && (err as NodeJS.ErrnoException).code !== undefined) {
        const code = (err as NodeJS.ErrnoException).code;
        resolve({ stdout: String(stdout), stderr: String(stderr), code: typeof code === 'number' ? code : 1 });
      } else {
        resolve({ stdout: String(stdout), stderr: String(stderr), code: err ? 1 : 0 });
      }
    });
  });
}

async function executeSoftwareStep(step: Checklist['steps'][0]): Promise<{ verified: boolean; message: string }> {
  const criteria = step.criteria as { commands?: string[]; platform?: string };
  const commands = criteria?.commands as string[] | undefined;
  if (!commands || !Array.isArray(commands)) {
    return { verified: false, message: 'No commands defined for this step.' };
  }
  let lastMessage = '';
  for (let i = 0; i < commands.length; i++) {
    const cmd = substituteVariables(commands[i], currentRun?.variables || {});
    const result = await runCommand(cmd);
    lastMessage = result.stdout.trim() || result.stderr.trim() || (result.code === 0 ? 'OK' : `Exit ${result.code}`);
    const success = result.code === 0 && String(result.stdout).indexOf('not found') === -1;
    if (success) return { verified: true, message: lastMessage || 'Verified' };
  }
  return { verified: false, message: lastMessage || 'Check failed' };
}

function verifyImageWithVision(_imageBase64: string, visionPrompt: string): Promise<{ verified: boolean; message: string }> {
  // Stub: in production call OpenAI/Anthropic vision API. For now always accept.
  return Promise.resolve({
    verified: true,
    message: `[Stub] Would verify with prompt: "${visionPrompt.slice(0, 60)}...". Accepted for demo.`,
  });
}

function getCurrentStep() {
  if (!currentRun || !currentChecklist) return null;
  const idx = currentRun.currentStepIndex;
  if (idx < 0 || idx >= currentChecklist.steps.length) return null;
  const step = currentChecklist.steps[idx];
  const state = currentRun.stepStates[step.id];
  return { step, state, index: idx, total: currentChecklist.steps.length };
}

function advanceToNextStep(): boolean {
  if (!currentRun || !currentChecklist) return false;
  currentRun.currentStepIndex++;
  return currentRun.currentStepIndex < currentChecklist.steps.length;
}

function startRun(checklistId: string, variables: Record<string, string>): { ok: boolean; error?: string; runState?: RunState } {
  const checklist = loadChecklist(checklistId);
  if (!checklist) return { ok: false, error: 'Checklist not found' };
  const stepStates: Record<string, StepState> = {};
  for (const s of checklist.steps) {
    stepStates[s.id] = { stepId: s.id, status: 'pending' };
  }
  const vars: Record<string, string> = {};
  for (const v of checklist.variables || []) {
    vars[v.key] = variables[v.key] ?? v.default ?? '';
  }
  currentRun = {
    checklistId,
    currentStepIndex: 0,
    stepStates,
    variables: vars,
  };
  return { ok: true, runState: currentRun };
}

function getRunState(): RunState | null {
  return currentRun;
}

function getChecklist(): Checklist | null {
  return currentChecklist;
}

async function runCurrentStep(): Promise<{ done: boolean; verified: boolean; message?: string; runState: RunState | null }> {
  const cur = getCurrentStep();
  if (!cur || !currentRun) return { done: true, verified: false, runState: currentRun };
  const { step, index } = cur;
  currentRun.stepStates[step.id].status = step.type === 'software' ? 'in_progress' : 'waiting_for_proof';
  if (step.type === 'software') {
    const result = await executeSoftwareStep(step);
    currentRun.stepStates[step.id].status = result.verified ? 'verified' : 'failed';
    currentRun.stepStates[step.id].message = result.message;
    if (result.verified) currentRun.stepStates[step.id].verifiedAt = Date.now();
    const hasMore = advanceToNextStep();
    return { done: !hasMore, verified: result.verified, message: result.message, runState: currentRun };
  }
  return { done: false, verified: false, message: 'Waiting for proof', runState: currentRun };
}

async function submitProof(stepId: string, imageBase64: string): Promise<{ verified: boolean; message: string; runState: RunState | null }> {
  const cur = getCurrentStep();
  if (!cur || !currentRun || cur.step.id !== stepId) {
    return { verified: false, message: 'Wrong step or no run', runState: currentRun };
  }
  const step = cur.step;
  if (step.type !== 'human') {
    return { verified: false, message: 'This step is not a human verification step', runState: currentRun };
  }
  const criteria = step.criteria as { visionPrompt?: string };
  const prompt = criteria?.visionPrompt || 'Does the image show the required setup?';
  const result = await verifyImageWithVision(imageBase64, prompt);
  currentRun.stepStates[stepId].status = result.verified ? 'verified' : 'failed';
  currentRun.stepStates[stepId].message = result.message;
  if (result.verified) currentRun.stepStates[stepId].verifiedAt = Date.now();
  advanceToNextStep();
  return { verified: result.verified, message: result.message, runState: currentRun };
}

function getCurrentStepForRenderer() {
  const cur = getCurrentStep();
  if (!cur) return null;
  return {
    step: cur.step,
    state: cur.state,
    index: cur.index,
    total: cur.total,
  };
}

function skipStep(): { runState: RunState | null } {
  const cur = getCurrentStep();
  if (!cur || !currentRun) return { runState: currentRun };
  currentRun.stepStates[cur.step.id].status = 'skipped';
  advanceToNextStep();
  return { runState: currentRun };
}

function markStepCompleted(): { runState: RunState | null } {
  const cur = getCurrentStep();
  if (!cur || !currentRun) return { runState: currentRun };
  currentRun.stepStates[cur.step.id].status = 'verified';
  currentRun.stepStates[cur.step.id].verifiedAt = Date.now();
  advanceToNextStep();
  return { runState: currentRun };
}

module.exports = {
  listChecklists,
  loadChecklist,
  startRun,
  getRunState,
  getChecklist,
  runCurrentStep,
  submitProof,
  getCurrentStepForRenderer,
  skipStep,
  markStepCompleted,
};
