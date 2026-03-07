import { useState, useEffect, useRef, useCallback } from 'react';

type StepStatus = 'pending' | 'in_progress' | 'waiting_for_proof' | 'verified' | 'failed' | 'skipped';
type RunState = {
  checklistId: string;
  currentStepIndex: number;
  stepStates: Record<string, { stepId: string; status: StepStatus; message?: string }>;
  variables: Record<string, string>;
};
type ChecklistMeta = { id: string; name: string; description: string };
type Step = {
  id: string;
  title: string;
  type: string;
  guidance: string;
  proofType?: string;
  criteria?: { commands?: string[]; visionPrompt?: string };
};
type CurrentStepResult = {
  step: Step;
  state: { status: string; message?: string };
  index: number;
  total: number;
} | null;

export default function App() {
  const [checklists, setChecklists] = useState<ChecklistMeta[]>([]);
  const [runState, setRunState] = useState<RunState | null>(null);
  const [currentStep, setCurrentStep] = useState<CurrentStepResult>(null);
  const [checklist, setChecklist] = useState<{ id: string; name: string; steps: Step[]; materials?: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);
  const [verifyAccordionOpen, setVerifyAccordionOpen] = useState(false);
  const [materialsAcknowledged, setMaterialsAcknowledged] = useState(false);
  const [cameraChecked, setCameraChecked] = useState(false);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [slidePaneMode, setSlidePaneMode] = useState<'camera' | 'upload' | 'showMeHow' | 'resources' | null>(null);
  const softwareRunStepIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const CAMERA_SETUP_INDEX = -2;
  const checklistNeedsCamera = Boolean(checklist?.steps?.some((s) => s.proofType === 'image'));
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const api = window.humanAI;

  useEffect(() => {
    if (!api) return;
    api.checklists.list().then(setChecklists).catch(() => setChecklists([]));
  }, [api]);

  const refreshRunState = useCallback(async () => {
    if (!api) return;
    const state = await api.run.getState();
    setRunState(state as RunState | null);
    const checklistData = await api.run.getChecklist();
    setChecklist(checklistData as { id: string; name: string; steps: Step[]; materials?: string[] } | null);
    const step = await api.run.getCurrentStep();
    setCurrentStep(step);
  }, [api]);

  useEffect(() => {
    if (!api || !runState) return;
    refreshRunState();
  }, [api, runState?.currentStepIndex, runState?.stepStates, refreshRunState]);

  const startRun = async (checklistId: string) => {
    if (!api) return;
    setError(null);
    const result = await api.run.start(checklistId, {});
    if (!result.ok) {
      setError(result.error || 'Failed to start');
      return;
    }
    setRunState(result.runState as RunState);
    const step = await api.run.getCurrentStep();
    setCurrentStep(step);
    const checklistData = await api.run.getChecklist();
    setChecklist(checklistData as { id: string; name: string; steps: Step[]; materials?: string[] } | null);
    setMaterialsAcknowledged(false);
    setCameraChecked(false);
    const needsCamera = (checklistData?.steps ?? []).some((s: Step) => s.proofType === 'image');
    if (checklistData?.materials?.length) {
      setSelectedStepIndex(-1);
    } else if (needsCamera) {
      setSelectedStepIndex(CAMERA_SETUP_INDEX);
    } else {
      setSelectedStepIndex(null);
    }
  };

  const runSoftwareStep = async () => {
    if (!api || !currentStep) return;
    if (softwareRunStepIdRef.current === currentStep.step.id) return;
    softwareRunStepIdRef.current = currentStep.step.id;
    setError(null);
    try {
      const result = await api.run.executeStep();
      setRunState(result.runState as RunState);
      const step = await api.run.getCurrentStep();
      setCurrentStep(step);
      // Step failure message is shown in the step's pane, not globally
    } finally {
      softwareRunStepIdRef.current = null;
    }
  };

  const startCamera = useCallback(async (deviceId?: string) => {
    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId } }
          : { facingMode: 'environment' },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraReady(true);
      setSelectedCameraId(deviceId ?? null);
      const devices = await navigator.mediaDevices.enumerateDevices();
      setVideoDevices(devices.filter((d) => d.kind === 'videoinput'));
    } catch (e) {
      setError('Camera access denied or unavailable');
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);
    setCapturedImage(null);
    setVideoDevices([]);
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !streamRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const base64 = dataUrl.split(',')[1] || '';
    setCapturedImage(dataUrl);
    return base64;
  }, []);

  const submitProof = async () => {
    if (!api || !currentStep) return;
    const base64 = capturedImage
      ? capturedImage.split(',')[1] || ''
      : capturePhoto();
    if (!base64) return;
    setError(null);
    const result = await api.run.submitProof(currentStep.step.id, base64);
    setRunState(result.runState as RunState);
    const step = await api.run.getCurrentStep();
    setCurrentStep(step);
    stopCamera();
    setCapturedImage(null);
    if (!result.verified) setError(result.message);
  };

  const handleCameraChange = useCallback(
    (newDeviceId: string) => {
      stopCamera();
      setCameraReady(false);
      startCamera(newDeviceId);
    },
    [startCamera, stopCamera]
  );

  const handleUploadImage = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCapturedImage(reader.result as string);
      setSlidePaneMode('upload');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, []);

  const handleSkipStep = async () => {
    if (!api) return;
    setError(null);
    const result = await api.run.skipStep();
    setRunState(result.runState as RunState);
    const step = await api.run.getCurrentStep();
    setCurrentStep(step);
    setSelectedStepIndex(null);
  };

  const handleMarkCompleted = async () => {
    if (!api) return;
    setError(null);
    const result = await api.run.markStepCompleted();
    setRunState(result.runState as RunState);
    const step = await api.run.getCurrentStep();
    setCurrentStep(step);
    setSelectedStepIndex(null);
  };

  const needsProof = currentStep?.step.type === 'human' && currentStep?.state?.status === 'waiting_for_proof';
  const isSoftwarePending = currentStep?.step.type === 'software' && currentStep?.state?.status === 'pending';
  const isHumanPending = currentStep?.step.type === 'human' && currentStep?.state?.status === 'pending';

  const runHumanStep = useCallback(async () => {
    if (!api || !currentStep) return;
    setError(null);
    const result = await api.run.executeStep();
    setRunState(result.runState as RunState);
    const step = await api.run.getCurrentStep();
    setCurrentStep(step);
  }, [api, currentStep?.step.id]);

  useEffect(() => {
    if (isSoftwarePending && api && currentStep) {
      runSoftwareStep();
    }
  }, [isSoftwarePending, api, currentStep?.step.id]);

  useEffect(() => {
    if (isHumanPending && api && currentStep) {
      runHumanStep();
    }
  }, [isHumanPending, api, currentStep?.step.id, runHumanStep]);

  useEffect(() => {
    setVerifyAccordionOpen(false);
  }, [selectedStepIndex, currentStep?.step?.id]);

  // When camera becomes ready, attach stream to video if it’s mounted (e.g. on camera setup page the video mounts after cameraReady)
  // #region agent log
  useEffect(() => {
    const hasStream = !!streamRef.current;
    const hasVideo = !!videoRef.current;
    if (cameraReady && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
    fetch('http://127.0.0.1:7242/ingest/8af4f906-f237-48e2-ad82-e768fdea0d84',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.tsx:cameraAttach',message:'stream attach',data:{cameraReady,slidePaneMode,hasStream,hasVideo,attached:cameraReady&&hasStream&&hasVideo},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
  }, [cameraReady, slidePaneMode]);
  // #endregion

  useEffect(() => {
    setSlidePaneMode(null);
    stopCamera();
  }, [currentStep?.step?.id]);

  if (!api) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        This app must run inside Electron. Use <code>npm run dev</code>.
      </div>
    );
  }

  const showActionBar =
    runState &&
    currentStep &&
    (materialsAcknowledged || !checklist?.materials?.length) &&
    (cameraChecked || !checklistNeedsCamera);

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: '100vh' }}>
      {/* Left: navigation only */}
      <aside
        style={{
          width: 'min(400px, 36%)',
          minWidth: 280,
          borderRight: '1px solid #27272a',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          background: '#18181b',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>HumanAI</h1>
        {error && (
          <div style={{ padding: 10, background: '#3f1f1f', borderRadius: 8, fontSize: 14 }}>{error}</div>
        )}
        {!runState ? (
          <>
            <p style={{ margin: 0, color: '#a1a1aa', fontSize: 14 }}>Choose a setup workflow</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {checklists.map((c) => (
                <li key={c.id} style={{ marginBottom: 8 }}>
                  <button
                    onClick={() => startRun(c.id)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      textAlign: 'left',
                      background: '#27272a',
                      border: '1px solid #3f3f46',
                      borderRadius: 8,
                      color: '#e4e4e7',
                      cursor: 'pointer',
                    }}
                  >
                    <strong>{c.name}</strong>
                    {c.description && (
                      <div style={{ fontSize: 12, color: '#a1a1aa', marginTop: 4 }}>{c.description}</div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            {checklists.length === 0 && (
              <p style={{ color: '#71717a', fontSize: 13 }}>No checklists found. Add JSON files to electron/checklists.</p>
            )}
          </>
        ) : (
          <>
            <div style={{ fontSize: 12, color: '#a1a1aa' }}>
              {checklist?.name}
              {checklist?.materials?.length && !materialsAcknowledged
                ? ' · Items and materials'
                : checklistNeedsCamera && !cameraChecked && (materialsAcknowledged || !checklist?.materials?.length)
                  ? ' · Camera setup'
                  : ` · Step ${currentStep ? currentStep.index + 1 : 0}/${currentStep?.total ?? 0}`}
            </div>
            {checklist && (
              <div style={{ flex: 1, overflow: 'auto' }}>
                {checklist.materials?.length ? (
                  <button
                    key="materials"
                    type="button"
                    onClick={() => setSelectedStepIndex(-1)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      marginBottom: 4,
                      borderRadius: 6,
                      border: 'none',
                      textAlign: 'left',
                      cursor: 'pointer',
                      background: selectedStepIndex === -1 ? '#3f3f46' : !materialsAcknowledged ? '#27272a' : 'transparent',
                      borderLeft: !materialsAcknowledged ? '3px solid #3b82f6' : selectedStepIndex === -1 ? '3px solid #71717a' : '3px solid transparent',
                      fontSize: 13,
                      color: '#e4e4e7',
                      opacity: materialsAcknowledged ? 0.8 : 1,
                    }}
                  >
                    <span style={{ marginRight: 8 }}>
                      {materialsAcknowledged ? '✓' : !materialsAcknowledged ? '●' : '○'}
                    </span>
                    Items and materials
                  </button>
                ) : null}
                {checklistNeedsCamera ? (
                  <button
                    key="camera-setup"
                    type="button"
                    onClick={() => setSelectedStepIndex(CAMERA_SETUP_INDEX)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      marginBottom: 4,
                      borderRadius: 6,
                      border: 'none',
                      textAlign: 'left',
                      cursor: 'pointer',
                      background: selectedStepIndex === CAMERA_SETUP_INDEX ? '#3f3f46' : !cameraChecked ? '#27272a' : 'transparent',
                      borderLeft: !cameraChecked ? '3px solid #3b82f6' : selectedStepIndex === CAMERA_SETUP_INDEX ? '3px solid #71717a' : '3px solid transparent',
                      fontSize: 13,
                      color: '#e4e4e7',
                      opacity: cameraChecked ? 0.8 : 1,
                    }}
                  >
                    <span style={{ marginRight: 8 }}>
                      {cameraChecked ? '✓' : selectedStepIndex === CAMERA_SETUP_INDEX ? '●' : '○'}
                    </span>
                    Camera setup
                  </button>
                ) : null}
                {checklist.steps.map((s, i) => {
                  const state = runState.stepStates[s.id];
                  const status = state?.status ?? 'pending';
                  const isCurrent = currentStep?.step.id === s.id && selectedStepIndex !== -1 && selectedStepIndex !== CAMERA_SETUP_INDEX;
                  const isSelected = selectedStepIndex === i;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedStepIndex(i)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        marginBottom: 4,
                        borderRadius: 6,
                        border: 'none',
                        textAlign: 'left',
                        cursor: 'pointer',
                        background: isSelected ? '#3f3f46' : isCurrent ? '#27272a' : 'transparent',
                        borderLeft: isCurrent ? '3px solid #3b82f6' : isSelected ? '3px solid #71717a' : '3px solid transparent',
                        fontSize: 13,
                        color: '#e4e4e7',
                        opacity: status === 'verified' || status === 'skipped' ? 0.8 : 1,
                      }}
                    >
                      <span style={{ marginRight: 8 }}>
                        {status === 'verified' ? '✓' : status === 'failed' ? '✗' : status === 'skipped' ? '−' : isCurrent ? '●' : '○'}
                      </span>
                      {s.title}
                    </button>
                  );
                })}
              </div>
            )}
            {currentStep && (
              <div style={{ marginTop: 'auto' }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{currentStep.step.title}</div>
                {currentStep.state?.status === 'verified' && (
                  <div style={{ color: '#22c55e', fontSize: 12 }}>Verified</div>
                )}
                {currentStep.state?.status === 'skipped' && (
                  <div style={{ color: '#71717a', fontSize: 12 }}>Skipped</div>
                )}
                {currentStep.state?.status === 'failed' && (
                  <div style={{ color: '#ef4444', fontSize: 12 }}>{currentStep.state?.message || 'Failed'}</div>
                )}
                {currentStep.state?.status === 'waiting_for_proof' && (
                  <div style={{ color: '#a1a1aa', fontSize: 12 }}>Waiting for proof</div>
                )}
                {currentStep.state?.status === 'in_progress' && (
                  <div style={{ color: '#a1a1aa', fontSize: 12 }}>Running check…</div>
                )}
                {currentStep.state?.status === 'pending' && (
                  <div style={{ color: '#a1a1aa', fontSize: 12 }}>Pending</div>
                )}
              </div>
            )}
          </>
        )}
      </aside>
      {/* Right column: guidance + action bar */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <main
          style={{
            flex: 1,
            padding: 24,
            overflow: 'auto',
            background: '#0f0f12',
          }}
        >
        {(() => {
          const showMaterialsView =
            runState &&
            checklist?.materials?.length &&
            (selectedStepIndex === -1 || !materialsAcknowledged);
          const showCameraView =
            runState &&
            checklistNeedsCamera &&
            !cameraChecked &&
            (materialsAcknowledged || !checklist?.materials?.length);
          if (showMaterialsView) {
            return (
              <>
                <h2 style={{ marginTop: 0, fontSize: 20 }}>Items and materials</h2>
                <p style={{ color: '#a1a1aa', fontSize: 15, marginBottom: 16 }}>
                  Gather these before you start:
                </p>
                <ul style={{ color: '#e4e4e7', fontSize: 15, lineHeight: 1.8, paddingLeft: 24, marginBottom: 24 }}>
                  {checklist!.materials!.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
                {!materialsAcknowledged && (
                  <button
                    type="button"
                    onClick={() => {
                      setMaterialsAcknowledged(true);
                      setSelectedStepIndex(checklistNeedsCamera ? CAMERA_SETUP_INDEX : 0);
                    }}
                    style={{
                      padding: '12px 20px',
                      background: '#22c55e',
                      border: 'none',
                      borderRadius: 8,
                      color: '#fff',
                      fontSize: 15,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    I have everything – Continue
                  </button>
                )}
              </>
            );
          }
          if (showCameraView) {
            return (
              <>
                <h2 style={{ marginTop: 0, fontSize: 20 }}>Camera setup</h2>
                <p style={{ color: '#a1a1aa', fontSize: 15, marginBottom: 16 }}>
                  This workflow will ask you to take photos for some steps. Please allow camera access and confirm it works.
                </p>
                {!cameraReady && (
                  <button
                    type="button"
                    onClick={() => startCamera()}
                    style={{
                      padding: '12px 20px',
                      background: '#3b82f6',
                      border: 'none',
                      borderRadius: 8,
                      color: '#fff',
                      fontSize: 15,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Allow camera
                  </button>
                )}
                {cameraReady && videoDevices.length > 1 && (
                  <div style={{ marginTop: 16, marginBottom: 8 }}>
                    <label style={{ fontSize: 14, color: '#a1a1aa', display: 'block', marginBottom: 6 }}>Select camera (e.g. table/setup facing)</label>
                    <select
                      value={selectedCameraId ?? ''}
                      onChange={(e) => handleCameraChange(e.target.value)}
                      style={{
                        width: '100%',
                        maxWidth: 480,
                        padding: '10px 12px',
                        background: '#27272a',
                        border: '1px solid #3f3f46',
                        borderRadius: 8,
                        color: '#e4e4e7',
                        fontSize: 14,
                      }}
                    >
                      {videoDevices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Camera ${d.deviceId.slice(0, 8)}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div
                  style={{
                    marginTop: 16,
                    position: 'relative',
                    background: '#000',
                    borderRadius: 8,
                    overflow: 'hidden',
                    marginBottom: 16,
                    maxWidth: 480,
                    minHeight: cameraReady ? 0 : 180,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {cameraReady ? (
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      style={{ width: '100%', display: 'block' }}
                    />
                  ) : (
                    <p style={{ color: '#71717a', fontSize: 14, margin: 0, padding: 16, textAlign: 'center' }}>
                      Live preview will appear here after you allow camera access.
                    </p>
                  )}
                </div>
                {cameraReady && (
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => {
                        stopCamera();
                        setCameraChecked(true);
                        setSelectedStepIndex(0);
                      }}
                      style={{
                        padding: '12px 20px',
                        background: '#22c55e',
                        border: 'none',
                        borderRadius: 8,
                        color: '#fff',
                        fontSize: 15,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Camera works – Continue
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        stopCamera();
                        setCameraChecked(true);
                        setSelectedStepIndex(0);
                      }}
                      style={{
                        padding: '12px 20px',
                        background: '#52525b',
                        border: 'none',
                        borderRadius: 8,
                        color: '#e4e4e7',
                        fontSize: 15,
                        cursor: 'pointer',
                      }}
                    >
                      Skip camera check
                    </button>
                  </div>
                )}
              </>
            );
          }
          const displayStep: Step | null =
            checklist && selectedStepIndex !== null && selectedStepIndex >= 0 && checklist.steps[selectedStepIndex]
              ? checklist.steps[selectedStepIndex]
              : currentStep?.step ?? null;
          const isViewingCurrent = !displayStep || (currentStep && displayStep.id === currentStep.step.id);
          if (!displayStep) {
            return runState ? (
              <p style={{ color: '#71717a' }}>Setup complete or no step selected.</p>
            ) : (
              <p style={{ color: '#71717a' }}>Select a workflow from the left to start.</p>
            );
          }
          const criteria = displayStep.criteria;
          return (
            <>
              {selectedStepIndex !== null && selectedStepIndex >= 0 && (
                <p style={{ marginTop: 0, marginBottom: 12, fontSize: 12, color: '#71717a' }}>
                  Viewing step {selectedStepIndex + 1} of {checklist?.steps.length ?? 0}
                  {isViewingCurrent && ' (current)'}. Click another step to view its details.
                </p>
              )}
              <h2 style={{ marginTop: 0, fontSize: 20 }}>{displayStep.title}</h2>
              {runState && runState.stepStates[displayStep.id]?.status === 'failed' && runState.stepStates[displayStep.id]?.message && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    background: '#3f1f1f',
                    borderRadius: 8,
                    fontSize: 14,
                    color: '#fca5a5',
                    border: '1px solid #7f1f1f',
                  }}
                >
                  Verification failed: {runState.stepStates[displayStep.id].message}
                </div>
              )}
              <div
                style={{
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.6,
                  color: '#a1a1aa',
                  fontSize: 15,
                }}
              >
                {displayStep.guidance}
              </div>
              <section style={{ marginTop: 24, border: '1px solid #27272a', borderRadius: 8, overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => setVerifyAccordionOpen((o) => !o)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '12px 16px',
                    background: '#18181b',
                    border: 'none',
                    color: '#e4e4e7',
                    fontSize: 16,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 12, transition: 'transform 0.2s', transform: verifyAccordionOpen ? 'rotate(90deg)' : 'none' }}>
                    ▶
                  </span>
                  How the agent will verify
                </button>
                {verifyAccordionOpen && (
                  <div style={{ padding: '0 16px 16px', background: '#18181b', borderTop: '1px solid #27272a' }}>
                    {displayStep.type === 'software' ? (
                      criteria?.commands?.length ? (
                        <>
                          <p style={{ color: '#a1a1aa', fontSize: 13, marginBottom: 8, marginTop: 8 }}>The agent will run the following checks:</p>
                          <pre
                            style={{
                              background: '#0f0f12',
                              padding: 12,
                              borderRadius: 8,
                              overflow: 'auto',
                              fontSize: 12,
                              color: '#a1a1aa',
                              margin: 0,
                            }}
                          >
                            {criteria.commands.join('\n')}
                          </pre>
                        </>
                      ) : (
                        <p style={{ color: '#71717a', fontSize: 13, marginTop: 8 }}>No commands defined.</p>
                      )
                    ) : criteria?.visionPrompt ? (
                      <>
                        <p style={{ color: '#a1a1aa', fontSize: 13, marginBottom: 8, marginTop: 8 }}>The agent will ask the vision model:</p>
                        <blockquote
                          style={{
                            margin: 0,
                            padding: 12,
                            background: '#0f0f12',
                            borderRadius: 8,
                            borderLeft: '4px solid #3b82f6',
                            color: '#a1a1aa',
                            fontSize: 14,
                          }}
                        >
                          {criteria.visionPrompt}
                        </blockquote>
                      </>
                    ) : (
                      <p style={{ color: '#71717a', fontSize: 13, marginTop: 8 }}>No verification prompt defined.</p>
                    )}
                  </div>
                )}
              </section>
              {isViewingCurrent && displayStep.type === 'human' && (
                <p style={{ marginTop: 16, color: '#71717a', fontSize: 14 }}>
                  Use the action bar below to take a photo or upload an image, then submit for verification.
                </p>
              )}
            </>
          );
        })()}
      </main>
      {/* Slide pane: opens above action bar for camera / upload / show me how / resources */}
      {showActionBar && slidePaneMode !== null && (
        <div
          style={{
            borderTop: '1px solid #27272a',
            padding: '16px 24px',
            background: '#1c1c1e',
            maxHeight: 380,
            overflow: 'auto',
          }}
        >
          {slidePaneMode === 'camera' && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleUploadImage}
                style={{ display: 'none' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#e4e4e7' }}>Camera</span>
                <button
                  type="button"
                  onClick={() => { stopCamera(); setSlidePaneMode(null); }}
                  style={{
                    padding: '6px 12px',
                    background: 'transparent',
                    border: '1px solid #3f3f46',
                    borderRadius: 6,
                    color: '#a1a1aa',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  Close
                </button>
              </div>
              {cameraReady && videoDevices.length > 1 && (
                <div style={{ marginBottom: 10 }}>
                  <select
                    value={selectedCameraId ?? ''}
                    onChange={(e) => handleCameraChange(e.target.value)}
                    style={{
                      padding: '6px 10px',
                      background: '#27272a',
                      border: '1px solid #3f3f46',
                      borderRadius: 6,
                      color: '#e4e4e7',
                      fontSize: 12,
                    }}
                  >
                    {videoDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Camera ${d.deviceId.slice(0, 8)}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ width: 400, minHeight: 280, background: '#000', borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                  {cameraReady && (
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      style={{ width: '100%', display: capturedImage ? 'none' : 'block', minHeight: 280, objectFit: 'cover' }}
                    />
                  )}
                  {capturedImage && (
                    <img src={capturedImage} alt="Preview" style={{ width: '100%', display: 'block', minHeight: 280, objectFit: 'cover' }} />
                  )}
                  {!cameraReady && !capturedImage && (
                    <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717a', fontSize: 13 }}>
                      Starting camera…
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {!capturedImage ? (
                    <button
                      onClick={capturePhoto}
                      style={{
                        padding: '8px 14px',
                        background: '#3b82f6',
                        border: 'none',
                        borderRadius: 6,
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: 13,
                      }}
                    >
                      Take photo
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={submitProof}
                        style={{
                          padding: '8px 14px',
                          background: '#22c55e',
                          border: 'none',
                          borderRadius: 6,
                          color: '#fff',
                          cursor: 'pointer',
                          fontSize: 13,
                        }}
                      >
                        Submit for verification
                      </button>
                      <button
                        onClick={() => setCapturedImage(null)}
                        style={{
                          padding: '8px 14px',
                          background: '#52525b',
                          border: 'none',
                          borderRadius: 6,
                          color: '#e4e4e7',
                          cursor: 'pointer',
                          fontSize: 13,
                        }}
                      >
                        Retake
                      </button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
          {slidePaneMode === 'upload' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#e4e4e7' }}>Upload image</span>
                <button
                  type="button"
                  onClick={() => { setCapturedImage(null); setSlidePaneMode(null); }}
                  style={{
                    padding: '6px 12px',
                    background: 'transparent',
                    border: '1px solid #3f3f46',
                    borderRadius: 6,
                    color: '#a1a1aa',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  Close
                </button>
              </div>
              {!capturedImage ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: '10px 16px',
                    background: '#3b82f6',
                    border: 'none',
                    borderRadius: 6,
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  Choose file
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ width: 200, background: '#000', borderRadius: 8, overflow: 'hidden' }}>
                    <img src={capturedImage} alt="Upload" style={{ width: '100%', display: 'block', maxHeight: 160, objectFit: 'cover' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button
                      onClick={submitProof}
                      style={{
                        padding: '8px 14px',
                        background: '#22c55e',
                        border: 'none',
                        borderRadius: 6,
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: 13,
                      }}
                    >
                      Submit for verification
                    </button>
                    <button
                      onClick={() => setCapturedImage(null)}
                      style={{
                        padding: '8px 14px',
                        background: '#52525b',
                        border: 'none',
                        borderRadius: 6,
                        color: '#e4e4e7',
                        cursor: 'pointer',
                        fontSize: 13,
                      }}
                    >
                      Retake
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          {slidePaneMode === 'showMeHow' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ margin: 0, color: '#a1a1aa', fontSize: 14 }}>Show me how – coming soon.</p>
              <button
                type="button"
                onClick={() => setSlidePaneMode(null)}
                style={{
                  padding: '6px 12px',
                  background: 'transparent',
                  border: '1px solid #3f3f46',
                  borderRadius: 6,
                  color: '#a1a1aa',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                Close
              </button>
            </div>
          )}
          {slidePaneMode === 'resources' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ margin: 0, color: '#a1a1aa', fontSize: 14 }}>Resources – coming soon.</p>
              <button
                type="button"
                onClick={() => setSlidePaneMode(null)}
                style={{
                  padding: '6px 12px',
                  background: 'transparent',
                  border: '1px solid #3f3f46',
                  borderRadius: 6,
                  color: '#a1a1aa',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                Close
              </button>
            </div>
          )}
        </div>
      )}
      {/* Action bar: left = Open camera / Upload image; right = Skip, Mark completed, Show me how, Resources */}
      {showActionBar && (
        <footer
          style={{
            borderTop: '1px solid #27272a',
            padding: '12px 24px',
            background: '#18181b',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          {currentStep!.step.type === 'human' && currentStep!.state?.status === 'waiting_for_proof' && (
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleUploadImage}
              style={{ display: 'none' }}
            />
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            {currentStep!.step.type === 'software' && (
              <span style={{ fontSize: 13, color: '#a1a1aa' }}>
                {currentStep!.state?.status === 'in_progress'
                  ? 'Running check…'
                  : currentStep!.state?.message || 'Run the step to verify.'}
              </span>
            )}
            {currentStep!.step.type === 'human' && currentStep!.state?.status === 'waiting_for_proof' && (
              <>
                <button
                  onClick={async () => {
                    if (!cameraReady) await startCamera();
                    setSlidePaneMode('camera');
                  }}
                  style={{
                    padding: '8px 14px',
                    background: '#3b82f6',
                    border: 'none',
                    borderRadius: 6,
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  Open camera
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: '8px 14px',
                    background: '#52525b',
                    border: 'none',
                    borderRadius: 6,
                    color: '#e4e4e7',
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  Upload image
                </button>
              </>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            {!['verified', 'skipped'].includes(currentStep!.state?.status ?? '') && (
              <>
                <button
                  onClick={handleSkipStep}
                  style={{
                    padding: '8px 14px',
                    background: '#52525b',
                    border: 'none',
                    borderRadius: 6,
                    color: '#e4e4e7',
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  Skip
                </button>
                <button
                  onClick={handleMarkCompleted}
                  style={{
                    padding: '8px 14px',
                    background: '#52525b',
                    border: 'none',
                    borderRadius: 6,
                    color: '#e4e4e7',
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  Mark completed
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setSlidePaneMode('showMeHow')}
              style={{
                padding: '8px 14px',
                background: 'transparent',
                border: '1px solid #3f3f46',
                borderRadius: 6,
                color: '#e4e4e7',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              Show me how
            </button>
            <button
              type="button"
              onClick={() => setSlidePaneMode('resources')}
              style={{
                padding: '8px 14px',
                background: 'transparent',
                border: '1px solid #3f3f46',
                borderRadius: 6,
                color: '#e4e4e7',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              Resources
            </button>
          </div>
        </footer>
      )}
      </div>
    </div>
  );
}
