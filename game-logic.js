// ============================================
// GAME LOGIC MODULE
// ============================================
// Core game mechanics: state management, swing detection, hit detection, ball launching

import { GameState } from './config.js';
import { addDebugMessage, debugLog } from './utils.js';
import { clubTipTracking, resetTracking } from './tracking.js';
import { imuData, resetSensorDebugFlags } from './sensors.js';
import { ballFlight, resetBallFlight } from './physics.js';
import { playHitSound, playAlarmSound } from './audio.js';

// ============================================
// GAME STATE
// ============================================
export let currentState = GameState.READY_TO_SET_BALL;

export function setCurrentState(state) {
    const previousState = currentState;
    currentState = state;
    // Log every state transition
    if (previousState !== state) {
        addDebugMessage(`🔄 STATE: ${previousState} → ${state}`);
    }
}

export function getCurrentState() {
    return currentState;
}

// ============================================
// TARGET STATE
// ============================================
export const targetState = {
    position: { x: 0, y: 0, z: 50 }, // Target position in 3D space
    active: false                     // Whether target is placed
};

// Generate target position based on settings
export function generateTarget(settings) {
    if (settings.targetMode === 'random') {
        // Random position within fairway bounds
        // Fairway: x in [-5, 5], z in [20, 80] (avoid too close/far)
        targetState.position.x = (Math.random() * 10) - 5;  // -5 to 5 meters
        targetState.position.z = 20 + (Math.random() * 60); // 20 to 80 meters
        targetState.position.y = 0; // Ground level
    } else {
        // Fixed distance mode
        targetState.position.x = 0; // Center of fairway
        targetState.position.z = settings.targetDistance;
        targetState.position.y = 0;
    }
    targetState.active = true;
    addDebugMessage(`🎯 Target: ${targetState.position.z.toFixed(0)}m away, ${targetState.position.x.toFixed(1)}m ${targetState.position.x > 0 ? 'right' : 'left'}`);
}

// ============================================
// BALL POSITION & SWING DATA
// ============================================
export const ballPosition = {
    orientation: { alpha: 0, beta: 0, gamma: 0 },
    timestamp: 0,
    set: false
};

export const swingData = {
    recordedMotion: [],
    startTime: 0,
    hitDetected: false,
    hitTime: 0,
    impactVelocity: { x: 0, y: 0, z: 0 }
};

// ============================================
// SWING TIMEOUT TRACKING
// ============================================
export const swingTimer = {
    startTime: 0,
    timeRemaining: 0,
    expired: false
};

// ============================================
// SWING RECORDING & REPLAY
// ============================================
export const swingRecorder = {
    isRecording: false,
    recordedSwings: [],
    currentRecording: null,
    replayMode: false,
    replayIndex: 0,
    replayProgress: 0,
    replaySpeed: 1.0,
    cameraAngle: 'perspective'
};

// ============================================
// LAST SHOT DATA
// ============================================
export const lastShot = {
    distance: 0,
    maxHeight: 0,
    impactSpeed: 0,
    timestamp: null,
    velocity: null,
    spin: null
};

// ============================================
// SET BALL POSITION
// ============================================
export function setBallPosition(settings, updateStatus, setBallBtn) {
    // Record current orientation as ball position
    ballPosition.orientation = { ...imuData.orientation };
    ballPosition.timestamp = Date.now();
    ballPosition.set = true;

    // Calculate current tip position BEFORE resetting (need clubTipTracking from tracking.js)
    // The calculateClubTipPosition is internal to tracking.js, so we just recalculate via offset

    // Store current position as offset (so future positions are relative to this)
    clubTipTracking.offset = {
        x: clubTipTracking.tipPosition.x + clubTipTracking.offset.x,
        y: clubTipTracking.tipPosition.y + clubTipTracking.offset.y,
        z: clubTipTracking.tipPosition.z + clubTipTracking.offset.z
    };

    // Clear history
    clubTipTracking.history = [];
    clubTipTracking.lastUpdateTime = Date.now();

    // Start swing timeout timer
    swingTimer.startTime = Date.now();
    swingTimer.timeRemaining = settings.swingTimeout;
    swingTimer.expired = false;

    addDebugMessage(`⏱️ Timer started: ${settings.swingTimeout}s timeout`);

    currentState = GameState.BALL_SET_READY_TO_SWING;
    setBallBtn.disabled = true;
    updateStatus('✓ Ball Set! Swing now!');

    // Start swing recording if enabled
    if (swingRecorder.isRecording) {
        swingRecorder.currentRecording = {
            tipPath: [],
            startTime: Date.now(),
            ballPosition: { ...ballPosition },
            settings: { ...settings }
        };
        addDebugMessage(`🎥 Recording swing...`);
    }

    // Debug
    addDebugMessage(`⚪ Ball set! Tip at [${clubTipTracking.tipPosition.x.toFixed(3)}, ${clubTipTracking.tipPosition.y.toFixed(3)}, ${clubTipTracking.tipPosition.z.toFixed(3)}]`);
    addDebugMessage(`Offset: [${clubTipTracking.offset.x.toFixed(3)}, ${clubTipTracking.offset.y.toFixed(3)}, ${clubTipTracking.offset.z.toFixed(3)}]`);

    // Generate target
    generateTarget(settings);

    // Start monitoring for swing motion
    startSwingDetection();
}

// ============================================
// SWING DETECTION
// ============================================
function startSwingDetection() {
    swingData.recordedMotion = [];
    swingData.startTime = Date.now();
    swingData.hitDetected = false;

    currentState = GameState.SWINGING;
    addDebugMessage(`🎯 State changed to SWINGING - ready to detect hit`);
}

export function recordSwingMotion() {
    // Store IMU data snapshot
    swingData.recordedMotion.push({
        acceleration: { ...imuData.acceleration },
        rotationRate: { ...imuData.rotationRate },
        orientation: { ...imuData.orientation },
        timestamp: imuData.timestamp
    });

    // Keep only last 2 seconds to limit memory usage
    const twoSecondsAgo = Date.now() - 2000;
    swingData.recordedMotion = swingData.recordedMotion.filter(
        d => d.timestamp > twoSecondsAgo
    );

    // Check for timeout and hit detection
    checkSwingTimeout();
    if (!swingTimer.expired) {
        detectBallHit();
    }
}

export function checkSwingTimeout() {
    if (swingTimer.expired || !currentSettings) return;

    const elapsed = (Date.now() - swingTimer.startTime) / 1000;
    swingTimer.timeRemaining = Math.max(0, currentSettings.swingTimeout - elapsed);

    if (swingTimer.timeRemaining <= 0) {
        swingTimer.expired = true;
        handleSwingTimeout();
    }
}

function handleSwingTimeout() {
    // Play alarm sound
    playAlarmSound(currentSettings);

    // Cancel current recording (swing timed out - no hit)
    if (swingRecorder.isRecording && swingRecorder.currentRecording) {
        addDebugMessage(`🎥 Recording canceled (timeout)`);
        swingRecorder.currentRecording = null;
    }

    // Force reset
    currentState = GameState.READY_TO_SET_BALL;
    ballPosition.set = false;
    swingData.recordedMotion = [];
    swingData.hitDetected = false;
    currentUICallbacks.setBallBtn.disabled = false;

    currentUICallbacks.updateStatus('⏰ TIMEOUT! Set ball position again');
}

// ============================================
// HIT DETECTION
// ============================================
// Detects when club tip re-enters hit zone with sufficient speed
function detectBallHit() {
    if (swingData.hitDetected || !currentSettings) return;

    // Calculate club tip distance from ball (at origin 0,0,0)
    const tipDistance = Math.sqrt(
        clubTipTracking.tipPosition.x ** 2 +
        clubTipTracking.tipPosition.y ** 2 +
        clubTipTracking.tipPosition.z ** 2
    );

    const hitThreshold = currentSettings.hitZoneDiameter / 200; // cm diameter → m radius

    // Total acceleration magnitude (proxy for swing speed)
    const totalAcceleration = Math.sqrt(
        imuData.acceleration.x ** 2 +
        imuData.acceleration.y ** 2 +
        imuData.acceleration.z ** 2
    );

    // HIT CONDITIONS:
    // 1. Club tip within hit zone
    // 2. Moving fast enough
    // 3. Has completed a backswing (moved away ≥15cm)
    if (tipDistance < hitThreshold && totalAcceleration > currentSettings.minSwingSpeed) {
        const recentHistory = clubTipTracking.history.slice(-20);
        const maxDistance = Math.max(...recentHistory.map(h =>
            Math.sqrt(h.position.x ** 2 + h.position.y ** 2 + h.position.z ** 2)
        ));

        if (maxDistance > 0.15) {
            registerBallHit();
        }
    }
}

function registerBallHit() {
    swingData.hitDetected = true;
    swingData.hitTime = Date.now();

    addDebugMessage(`💥 HIT REGISTERED!`);

    // Calculate velocity at impact
    swingData.impactVelocity = calculateImpactVelocity();

    // Store impact speed for results
    lastShot.impactSpeed = Math.sqrt(
        swingData.impactVelocity.x ** 2 +
        swingData.impactVelocity.y ** 2 +
        swingData.impactVelocity.z ** 2
    );

    // Play hit sound
    playHitSound(currentSettings);

    // Save recorded swing if recording was active
    if (swingRecorder.isRecording && swingRecorder.currentRecording) {
        swingRecorder.currentRecording.endTime = Date.now();
        swingRecorder.currentRecording.impactVelocity = { ...swingData.impactVelocity };
        swingRecorder.currentRecording.distance = 0; // Will be updated when ball lands
        swingRecorder.recordedSwings.push(swingRecorder.currentRecording);
        addDebugMessage(`🎥 Swing saved! Total: ${swingRecorder.recordedSwings.length}`);
        currentUICallbacks.replayBtn.disabled = false; // Enable replay button
        swingRecorder.currentRecording = null;
    }

    currentState = GameState.BALL_FLYING;
    currentUICallbacks.updateStatus('🏌️ HIT! Ball is flying...');

    // Start ball flight simulation
    launchBall(swingData.impactVelocity);
}

// ============================================
// IMPACT VELOCITY CALCULATION
// ============================================
// Calculates ball launch velocity from club tip movement at impact.
//
// METHOD:
//   1. Use position history to compute velocity (Δposition / Δtime)
//   2. Apply loft angle transformation (converts downward swing to upward launch)
//   3. Scale by club/ball properties
//   4. Negate X to compensate for sensor inversions
//
// TRANSFORMATIONS APPLIED:
//   - Loft angle: Converts downswing into upward trajectory
//   - Club weight: Heavier club = more momentum transfer
//   - Impact power: Game balance multiplier

function calculateImpactVelocity() {
    const history = clubTipTracking.history;

    // Need at least 5 samples for stable velocity estimate
    if (history.length < 5) {
        const fallback = {
            x: imuData.acceleration.x * 5,
            y: imuData.acceleration.y * 5,
            z: imuData.acceleration.z * 5
        };
        addDebugMessage(`⚠️ Low history, using acceleration fallback`);
        return fallback;
    }

    // Use last 5 samples for smoother estimate
    const current = history[history.length - 1];
    const previous = history[history.length - 5];
    const dt = (current.timestamp - previous.timestamp) / 1000;

    if (dt === 0) {
        addDebugMessage(`⚠️ Zero time delta`);
        return { x: 0, y: 0, z: 0 };
    }

    // Calculate velocity: v = Δposition / Δtime
    const deltaX = current.position.x - previous.position.x;
    const deltaY = current.position.y - previous.position.y;
    const deltaZ = current.position.z - previous.position.z;

    let vx = deltaX / dt;
    let vy = deltaY / dt;
    let vz = deltaZ / dt;

    // LOFT ANGLE TRANSFORMATION
    // Converts downward club motion into upward ball launch
    // Only apply if swinging downward (vy < 0), otherwise keep as-is
    const loftRadians = currentSettings.loftAngle * Math.PI / 180;
    const horizontalSpeed = Math.sqrt(vx * vx + vz * vz);

    let vyLofted;
    if (vy < 0) {
        // Transform downswing into upward launch using loft angle
        vyLofted = horizontalSpeed * Math.sin(loftRadians) + Math.abs(vy) * Math.cos(loftRadians);
        addDebugMessage(`Loft: ${vy.toFixed(1)} → ${vyLofted.toFixed(1)} m/s (${currentSettings.loftAngle}°)`);
    } else {
        vyLofted = vy;
    }

    // SCALING FACTORS
    // Club weight: Heavier clubs transfer more energy
    // Impact power: Game balance multiplier for playability
    const weightFactor = currentSettings.clubWeight / 200;
    const totalScale = weightFactor * currentSettings.impactPower;

    // ENSURE FORWARD FLIGHT
    // Ball must always fly away from player (positive Z)
    let finalVz = Math.abs(vz * totalScale);

    // IMPORTANT: Negate X velocity to compensate for inverted sensor inputs
    // We inverted alpha/gamma/accel-x in tracking.js for correct visual feedback
    // This caused club tip X positions to be inverted, so we negate here for correct ball flight
    const result = {
        x: -vx * totalScale,  // NEGATED: compensates for sensor axis inversions
        y: vyLofted * totalScale,
        z: finalVz
    };

    const totalVel = Math.sqrt(result.x ** 2 + result.y ** 2 + result.z ** 2);
    addDebugMessage(`💥 Impact: ${totalVel.toFixed(1)} m/s [x:${result.x.toFixed(1)}, y:${result.y.toFixed(1)}, z:${result.z.toFixed(1)}]`);

    return result;
}

// ============================================
// LAUNCH BALL
// ============================================
// Initializes ball flight with calculated velocity and spin
function launchBall(initialVelocity) {
    // Ball weight affects velocity (lighter balls fly faster)
    const ballWeightFactor = 45.9 / currentSettings.ballWeight;
    let vx = initialVelocity.x * ballWeightFactor;
    let vy = initialVelocity.y * ballWeightFactor;
    let vz = initialVelocity.z * ballWeightFactor;

    // SPIN CALCULATION
    // Sidespin from horizontal velocity → slice/hook
    // Backspin from vertical velocity → lift
    const ballRadius = (currentSettings.ballDiameter / 100) / 2;

    if (ballRadius > 0 && isFinite(vx) && isFinite(vy) && isFinite(vz)) {
        const sidespinRate = -(vx / ballRadius) * 0.02;
        const backspinRate = (vy / ballRadius) * 0.05;

        ballFlight.spin = {
            x: isFinite(backspinRate) ? backspinRate : 0,
            y: isFinite(sidespinRate) ? sidespinRate : 0,
            z: 0
        };
        ballFlight.initialSpin = { ...ballFlight.spin };

        const spinType = Math.abs(ballFlight.spin.y) > 2
            ? (ballFlight.spin.y > 0 ? 'SLICE' : 'HOOK')
            : 'STRAIGHT';
        addDebugMessage(`🌀 Spin: ${spinType} (${ballFlight.spin.y.toFixed(1)} rad/s)`);
    } else {
        ballFlight.spin = { x: 0, y: 0, z: 0 };
        ballFlight.initialSpin = { x: 0, y: 0, z: 0 };
    }

    // Initialize flight state
    ballFlight.position = { x: 0, y: 0, z: 0 };
    ballFlight.velocity = { x: vx, y: vy, z: vz };
    ballFlight.flying = true;
    ballFlight.startTime = Date.now();
    ballFlight.lastUpdateTime = Date.now();
    ballFlight.maxHeight = 0;
    ballFlight.trajectory = [{ x: 0, y: 0, z: 0 }];

    // Store for results display
    lastShot.velocity = { x: vx, y: vy, z: vz };
    lastShot.spin = { ...ballFlight.spin };
    lastShot.timestamp = Date.now();

    const totalVel = Math.sqrt(vx ** 2 + vy ** 2 + vz ** 2);
    addDebugMessage(`🏌️ Launch: ${totalVel.toFixed(1)} m/s [x:${vx.toFixed(1)}, y:${vy.toFixed(1)}, z:${vz.toFixed(1)}]`);
}

// ============================================
// RESET GAME
// ============================================
export function resetGame(imuPermissionGranted, updateStatus, setBallBtn) {
    ballPosition.set = false;
    swingData.recordedMotion = [];
    swingData.hitDetected = false;
    swingTimer.expired = false;
    swingTimer.timeRemaining = 0;

    resetSensorDebugFlags();
    resetTracking();
    resetBallFlight();

    debugLog.messages = [];
    addDebugMessage(`🔄 Game reset`);

    currentState = GameState.READY_TO_SET_BALL;
    setBallBtn.disabled = false;

    updateStatus(imuPermissionGranted ?
        '🔄 Ready for another shot! Tap "Tee Up"' :
        '🔄 Reset! Tap "Tee Up" to begin'
    );
}

// ============================================
// STORE REFERENCES TO SETTINGS AND UI CALLBACKS
// ============================================
// These will be set by main.js
let currentSettings = null;
let currentUICallbacks = null;

export function setGameSettings(settings) {
    currentSettings = settings;
    addDebugMessage(`⚙️ Settings loaded: swingTimeout=${settings.swingTimeout}s`);
}

export function setUICallbacks(callbacks) {
    currentUICallbacks = callbacks;
}
