/**
 * MINIMALIST SPIRIT LEVEL
 * Handles motion sensors, iOS permissions, adaptive orientation, calibration & feedback.
 */

(function () {
  'use strict';

  // --- DOM Elements ---
  const bubble = document.getElementById('bubble');
  const edgeBubble = document.getElementById('edge-bubble');
  const levelStage = document.getElementById('level-stage');
  const degreeVal = document.getElementById('degree-val');
  const pitchVal = document.getElementById('pitch-val');
  const rollVal = document.getElementById('roll-val');
  const modeIndicator = document.getElementById('mode-indicator');
  const edgeHorizonLine = document.getElementById('edge-horizon-line');

  const modeBtn = document.getElementById('mode-btn');
  const zeroBtn = document.getElementById('zero-btn');
  const hapticBtn = document.getElementById('haptic-btn');
  const toast = document.getElementById('toast');

  const permOverlay = document.getElementById('permission-overlay');
  const enableSensorsBtn = document.getElementById('enable-sensors-btn');

  // --- Configuration ---
  const LEVEL_THRESHOLD = 0.3;      // Degrees to qualify as "perfectly level"
  const FILTER_ALPHA = 0.22;        // Low-pass smoothing filter (0.1 to 0.35)
  const MAX_SURFACE_ANGLE = 45;     // Threshold to switch Auto mode from Flat to Edge
  const BULLSEYE_RADIUS = 115;      // Max travel radius for 2D bubble (px)
  const TUBE_HALF_WIDTH = 100;      // Max travel for edge tube (px)

  // --- State ---
  let mode = 'AUTO';                // 'AUTO' | 'SURFACE' | 'EDGE'
  let currentOrientation = 'SURFACE'; // Active resolved layout: 'SURFACE' or 'EDGE'
  let hapticEnabled = true;
  let isLevel = false;
  let wasLevel = false;

  // Raw & Smoothed Sensor Data
  let rawBeta = 0;   // Front-back tilt (-180 to 180)
  let rawGamma = 0;  // Left-right tilt (-90 to 90)
  let smoothBeta = 0;
  let smoothGamma = 0;

  // Calibration Offsets (for camera bumps / phone cases)
  let offsetBeta = 0;
  let offsetGamma = 0;

  // Web Audio Context for subtle Level ping
  let audioCtx = null;
  let wakeLock = null;

  // Load saved calibration
  try {
    const savedBeta = localStorage.getItem('levl_offset_beta');
    const savedGamma = localStorage.getItem('levl_offset_gamma');
    if (savedBeta !== null && savedGamma !== null) {
      offsetBeta = parseFloat(savedBeta);
      offsetGamma = parseFloat(savedGamma);
      zeroBtn.classList.add('active');
    }
  } catch (e) {
    console.warn('Storage unavailable', e);
  }

  // --- Sound / Haptic Feedback ---
  function initAudio() {
    if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playLevelPing() {
    if (!hapticEnabled) return;
    try {
      initAudio();
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
      osc.frequency.exponentialRampToValueAtTime(1760, audioCtx.currentTime + 0.08); // chirp up
      
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.12);
    } catch (e) {}

    // Subtle vibration on mobile devices
    if ('vibrate' in navigator && hapticEnabled) {
      try {
        navigator.vibrate(30);
      } catch (e) {}
    }
  }

  // --- Screen Wake Lock (Keep screen awake while leveling) ---
  async function requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
      } catch (err) {
        console.warn('Wake Lock error:', err);
      }
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !wakeLock) {
      requestWakeLock();
    }
  });

  // --- Toast Notice ---
  let toastTimer = null;
  function showToast(msg) {
    if (toastTimer) clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.classList.add('show');
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2000);
  }

  // --- Device Orientation Math ---
  /**
   * Compute gravity vector in phone coordinates:
   * Device frame: X = Right, Y = Top, Z = Out of screen
   */
  function calculatePhysics(beta, gamma) {
    const radB = (beta * Math.PI) / 180;
    const radG = (gamma * Math.PI) / 180;

    // Unit normal vector pointing out of screen transformed by pitch & roll
    const gx = -Math.sin(radG) * Math.cos(radB);
    const gy = Math.sin(radB);
    const gz = Math.cos(radB) * Math.cos(radG);

    // Total tilt angle from horizontal surface (0° when completely flat)
    const clampedGz = Math.max(-1, Math.min(1, gz));
    const surfaceTiltAngle = Math.acos(clampedGz) * (180 / Math.PI);

    // In-plane edge angle (angle around Z axis when held vertically against a wall)
    // 0° = landscape horizontal, 90° = portrait vertical
    let edgeAngle = Math.atan2(gy, -gx) * (180 / Math.PI);

    // Nearest cardinal edge (0°, 90°, 180°, -90° / 270°)
    const cardinalEdges = [0, 90, 180, -90, -180];
    let minEdgeDiff = Infinity;
    for (const card of cardinalEdges) {
      let diff = edgeAngle - card;
      while (diff > 180) diff -= 360;
      while (diff < -180) diff += 360;
      if (Math.abs(diff) < Math.abs(minEdgeDiff)) {
        minEdgeDiff = diff;
      }
    }

    return {
      surfaceTiltAngle,
      edgeDiffAngle: minEdgeDiff,
      edgeAngle,
      gx,
      gy,
      gz
    };
  }

  // --- Animation & Render Loop ---
  function updateUI() {
    // Smooth incoming sensor angles with low-pass filter
    smoothBeta += (rawBeta - smoothBeta) * FILTER_ALPHA;
    smoothGamma += (rawGamma - smoothGamma) * FILTER_ALPHA;

    // Apply zero/calibration offsets
    const effBeta = smoothBeta - offsetBeta;
    const effGamma = smoothGamma - offsetGamma;

    const physics = calculatePhysics(effBeta, effGamma);

    // Decide active mode
    if (mode === 'AUTO') {
      currentOrientation = physics.surfaceTiltAngle > MAX_SURFACE_ANGLE ? 'EDGE' : 'SURFACE';
    } else {
      currentOrientation = mode;
    }

    let displayedAngle = 0;

    if (currentOrientation === 'SURFACE') {
      levelStage.classList.remove('mode-edge');
      modeIndicator.textContent = 'SURFACE LEVEL';

      displayedAngle = physics.surfaceTiltAngle;

      // Map roll (X) and pitch (Y) to bullseye pixel coordinates
      // 10 degrees fills the outer radius
      const scale = BULLSEYE_RADIUS / 10;
      let bx = effGamma * scale;
      let by = -effBeta * scale;

      // Clamp bubble to outer ring boundary
      const dist = Math.sqrt(bx * bx + by * by);
      if (dist > BULLSEYE_RADIUS) {
        bx = (bx / dist) * BULLSEYE_RADIUS;
        by = (by / dist) * BULLSEYE_RADIUS;
      }

      bubble.style.transform = `translate(${bx.toFixed(1)}px, ${by.toFixed(1)}px)`;

      // Pitch & Roll sub-readouts
      pitchVal.textContent = (effBeta >= 0 ? '+' : '') + effBeta.toFixed(1) + '°';
      rollVal.textContent = (effGamma >= 0 ? '+' : '') + effGamma.toFixed(1) + '°';

    } else {
      // EDGE / VERTICAL MODE
      levelStage.classList.add('mode-edge');
      modeIndicator.textContent = 'EDGE LEVEL';

      const absEdgeDev = Math.abs(physics.edgeDiffAngle);
      displayedAngle = absEdgeDev;

      // Bubble position along 1D tube (-10° to +10° travel)
      const maxEdgeTravelDeg = 8;
      const tx = Math.max(-TUBE_HALF_WIDTH, Math.min(TUBE_HALF_WIDTH, (-physics.edgeDiffAngle / maxEdgeTravelDeg) * TUBE_HALF_WIDTH));
      edgeBubble.style.transform = `translateX(${tx.toFixed(1)}px)`;

      // Horizon line tilt indicator
      edgeHorizonLine.style.transform = `rotate(${(-physics.edgeDiffAngle).toFixed(1)}deg)`;

      // Sub readout shows tilt relative to vertical
      pitchVal.textContent = effBeta.toFixed(1) + '°';
      rollVal.textContent = (physics.edgeDiffAngle >= 0 ? '+' : '') + physics.edgeDiffAngle.toFixed(1) + '°';
    }

    // Format single decimal place readout (e.g., 0.0°)
    degreeVal.textContent = displayedAngle.toFixed(1);

    // Check if within "Level" threshold
    isLevel = displayedAngle <= LEVEL_THRESHOLD;

    if (isLevel) {
      document.body.classList.add('is-level');
      if (!wasLevel) {
        playLevelPing();
      }
    } else {
      document.body.classList.remove('is-level');
    }
    wasLevel = isLevel;

    requestAnimationFrame(updateUI);
  }

  // --- Sensor Orientation Handler ---
  function onDeviceOrientation(e) {
    if (e.beta !== null && e.gamma !== null) {
      rawBeta = e.beta;
      rawGamma = e.gamma;
    }
  }

  // --- Permission & Sensor Setup ---
  async function requestSensorAccess() {
    initAudio();
    requestWakeLock();

    // Check for iOS 13+ permission API
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const permissionState = await DeviceOrientationEvent.requestPermission();
        if (permissionState === 'granted') {
          window.addEventListener('deviceorientation', onDeviceOrientation, true);
          permOverlay.classList.add('hidden');
        } else {
          showToast('Motion permission denied');
        }
      } catch (err) {
        console.error('Permission error:', err);
        permOverlay.classList.add('hidden');
      }
    } else {
      // Standard Android / modern browser
      window.addEventListener('deviceorientation', onDeviceOrientation, true);
      permOverlay.classList.add('hidden');
    }
  }

  // Auto-dismiss permission if deviceorientation fires right away
  function testSensorAvailability() {
    let fired = false;
    function testListener(e) {
      if (e.beta !== null || e.gamma !== null) {
        fired = true;
        permOverlay.classList.add('hidden');
        window.removeEventListener('deviceorientation', testListener);
      }
    }
    window.addEventListener('deviceorientation', testListener);
    setTimeout(() => {
      window.removeEventListener('deviceorientation', testListener);
      // If not fired and not iOS, allow click to dismiss
      if (!fired && !(typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function')) {
        // Desktop or unsupported - allow preview mode
      }
    }, 1200);
  }

  // --- Desktop / Mouse Simulation ---
  let isPointerDown = false;
  function handlePointerTilt(e) {
    const rect = levelStage.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);

    // Simulate gamma and beta (-10° to 10°)
    rawGamma = Math.max(-15, Math.min(15, dx * 8));
    rawBeta = Math.max(-15, Math.min(15, -dy * 8));
  }

  window.addEventListener('pointerdown', (e) => {
    // If clicking outside overlay
    if (!permOverlay.classList.contains('hidden') && e.target === enableSensorsBtn) return;
    isPointerDown = true;
    handlePointerTilt(e);
  });

  window.addEventListener('pointermove', (e) => {
    if (isPointerDown) handlePointerTilt(e);
  });

  window.addEventListener('pointerup', () => {
    isPointerDown = false;
    // Slowly return to 0 when released on desktop
    rawGamma = 0;
    rawBeta = 0;
  });

  // --- Control Buttons ---

  // 1. Mode Button (AUTO -> SURFACE -> EDGE)
  modeBtn.addEventListener('click', () => {
    initAudio();
    if (mode === 'AUTO') {
      mode = 'SURFACE';
      modeBtn.textContent = 'SURF';
      showToast('Locked to Surface Mode');
    } else if (mode === 'SURFACE') {
      mode = 'EDGE';
      modeBtn.textContent = 'EDGE';
      showToast('Locked to Edge Mode');
    } else {
      mode = 'AUTO';
      modeBtn.textContent = 'AUTO';
      showToast('Auto Mode Active');
    }
  });

  // 2. Zero / Calibrate Button
  zeroBtn.addEventListener('click', () => {
    initAudio();
    if (offsetBeta !== 0 || offsetGamma !== 0) {
      // Clear calibration
      offsetBeta = 0;
      offsetGamma = 0;
      zeroBtn.classList.remove('active');
      try {
        localStorage.removeItem('levl_offset_beta');
        localStorage.removeItem('levl_offset_gamma');
      } catch (e) {}
      showToast('Calibration Reset');
    } else {
      // Zero to current position
      offsetBeta = smoothBeta;
      offsetGamma = smoothGamma;
      zeroBtn.classList.add('active');
      try {
        localStorage.setItem('levl_offset_beta', offsetBeta.toString());
        localStorage.setItem('levl_offset_gamma', offsetGamma.toString());
      } catch (e) {}
      showToast('Zeroed to current surface');
    }
  });

  // 3. Haptic / Sound Toggle
  hapticBtn.addEventListener('click', () => {
    hapticEnabled = !hapticEnabled;
    hapticBtn.classList.toggle('active', hapticEnabled);
    showToast(hapticEnabled ? 'Feedback Enabled' : 'Muted');
  });

  // 4. Enable Sensors Button
  enableSensorsBtn.addEventListener('click', () => {
    requestSensorAccess();
  });

  // Dismiss overlay when user clicks outside modal card on desktop
  permOverlay.addEventListener('click', (e) => {
    if (e.target === permOverlay) {
      permOverlay.classList.add('hidden');
    }
  });

  // --- Initialization ---
  testSensorAvailability();
  hapticBtn.classList.add('active'); // active by default
  requestAnimationFrame(updateUI);

})();
