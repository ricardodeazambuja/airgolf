// ============================================
// GAME LOGIC MODULE
// ============================================
// Core game mechanics: state management, swing detection, hit detection, ball launching

import { GameState } from './config.js';
import { addDebugMessage, debugLog } from './utils.js';
import { clubTipTracking, resetTracking } from './tracking.js';
import { imuData } from './sensors.js';
import { ballFlight, resetBallFlight } from './physics.js';
import { playHitSound, playAlarmSound } from './audio.js';

// ============================================
// GAME STATE
// ============================================
export let currentState = GameState.READY_TO_SET_BALL;

export function setCurrentState(state) {
    currentState = state;
}

export function getCurrentState() {
    return currentState;
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
    addDebugMessage(`📱 Grip: ${settings.phoneOrientation === 'edge' ? 'Edge First 🏌️' : 'Screen First 📱'}`);
    addDebugMessage(`Offset: [${clubTipTracking.offset.x.toFixed(3)}, ${clubTipTracking.offset.y.toFixed(3)}, ${clubTipTracking.offset.z.toFixed(3)}]`);

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
}

export function recordSwingMotion() {
    // Store IMU data during swing
    swingData.recordedMotion.push({
        acceleration: { ...imuData.acceleration },
        rotationRate: { ...imuData.rotationRate },
        orientation: { ...imuData.orientation },
        timestamp: imuData.timestamp
    });

    // Keep only last 2 seconds of data to avoid memory issues
    const twoSecondsAgo = Date.now() - 2000;
    swingData.recordedMotion = swingData.recordedMotion.filter(
        d => d.timestamp > twoSecondsAgo
    );

    // Check for timeout
    checkSwingTimeout();

    // Check if club has returned to ball position (hit detected)
    if (!swingTimer.expired) {
        detectBallHit();
    }
}

function checkSwingTimeout() {
    if (swingTimer.expired) return;

    const elapsed = (Date.now() - swingTimer.startTime) / 1000; // Convert to seconds
    swingTimer.timeRemaining = Math.max(0, swingTimer.swingTimeout - elapsed);

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
function detectBallHit() {
    if (swingData.hitDetected) return;

    // Calculate distance of club tip from ball (which is at origin 0,0,0)
    const tipDistance = Math.sqrt(
        clubTipTracking.tipPosition.x ** 2 +
        clubTipTracking.tipPosition.y ** 2 +
        clubTipTracking.tipPosition.z ** 2
    );

    // Hit threshold from settings (convert cm to meters)
    const hitThreshold = currentSettings.hitZoneDiameter / 200; // Diameter to radius, cm to m

    // Calculate club tip velocity magnitude
    const totalAcceleration = Math.sqrt(
        imuData.acceleration.x ** 2 +
        imuData.acceleration.y ** 2 +
        imuData.acceleration.z ** 2
    );

    // Debug: log when close to hit zone
    if (tipDistance < hitThreshold * 1.5) {
        addDebugMessage(`Near! dist:${tipDistance.toFixed(3)}m thresh:${hitThreshold.toFixed(3)}m accel:${totalAcceleration.toFixed(1)}`);
    }

    // Detect hit: club tip is near ball AND moving fast
    if (tipDistance < hitThreshold && totalAcceleration > currentSettings.minSwingSpeed) {
        // Additional check: ensure club has moved away first (backswing)
        const recentHistory = clubTipTracking.history.slice(-20); // Last 20 samples
        const maxDistance = Math.max(...recentHistory.map(h =>
            Math.sqrt(h.position.x ** 2 + h.position.y ** 2 + h.position.z ** 2)
        ));

        addDebugMessage(`HIT CHECK: dist:${tipDistance.toFixed(3)} backswing:${maxDistance.toFixed(3)}`);

        // Only register hit if club moved away at least 15cm before returning
        if (maxDistance > 0.15) {
            registerBallHit();
        } else {
            addDebugMessage(`REJECTED: backswing too small (need >0.15m)`);
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
function calculateImpactVelocity() {
    const history = clubTipTracking.history;
    if (history.length < 5) {
        // Fallback to acceleration-based estimate
        const fallback = {
            x: imuData.acceleration.x * 5,
            y: imuData.acceleration.y * 5,
            z: imuData.acceleration.z * 5
        };
        addDebugMessage(`VEL: Using fallback (hist short)`);
        return fallback;
    }

    // Get last few samples (smoother estimate)
    const current = history[history.length - 1];
    const previous = history[history.length - 5];

    const dt = (current.timestamp - previous.timestamp) / 1000; // Convert ms to seconds

    if (dt === 0) {
        addDebugMessage(`VEL: dt=0!`);
        return { x: 0, y: 0, z: 0 };
    }

    // Calculate raw velocity in phone coordinates
    const deltaX = current.position.x - previous.position.x;
    const deltaY = current.position.y - previous.position.y;
    const deltaZ = current.position.z - previous.position.z;

    addDebugMessage(`ΔPos: [${deltaX.toFixed(3)}, ${deltaY.toFixed(3)}, ${deltaZ.toFixed(3)}] in ${dt.toFixed(3)}s`);

    let vx = deltaX / dt;
    let vy = deltaY / dt;
    let vz = deltaZ / dt;

    addDebugMessage(`Raw phone vel: x:${vx.toFixed(2)} y:${vy.toFixed(2)} z:${vz.toFixed(2)} m/s`);

    // Transform phone coordinates → screen/world coordinates
    if (currentSettings.phoneOrientation === 'edge') {
        const tempX = vx;
        const tempY = vy;
        const tempZ = vz;

        vx = tempY;   // Phone Y → Screen X
        vy = -tempZ;  // Phone Z → Screen Y (inverted)
        vz = tempX;   // Phone X → Screen Z

        addDebugMessage(`📱 Edge: PhoneX→ScreenZ, PhoneY→ScreenX, PhoneZ→ScreenY`);
    }

    addDebugMessage(`Screen vel: x:${vx.toFixed(2)} y:${vy.toFixed(2)} z:${vz.toFixed(2)} m/s`);

    // Apply loft angle transformation
    const loftRadians = currentSettings.loftAngle * Math.PI / 180;
    const horizontalSpeed = Math.sqrt(vx * vx + vz * vz);

    let vyLofted;
    if (vy < 0) {
        vyLofted = horizontalSpeed * Math.sin(loftRadians) + Math.abs(vy) * Math.cos(loftRadians);
        addDebugMessage(`Loft applied: ${vy.toFixed(2)} → ${vyLofted.toFixed(2)} (${currentSettings.loftAngle}°)`);
    } else {
        vyLofted = vy;
        addDebugMessage(`No loft needed (Y already positive)`);
    }

    // Apply scaling factors
    const weightFactor = currentSettings.clubWeight / 200;
    const leverEffect = 1.0;
    const energyTransferFactor = currentSettings.impactPower;
    const totalScale = weightFactor * leverEffect * energyTransferFactor;

    addDebugMessage(`Scale: ${totalScale.toFixed(1)}x ✓`);

    // Ensure ball flies AWAY from player (positive Z)
    const horizontalXZ = Math.sqrt(vx ** 2 + vz ** 2);
    const scaledZ = vz * totalScale;
    let finalVz = Math.abs(scaledZ); // Always positive (away)

    if (horizontalXZ > 0.1) {
        if (Math.abs(vz) > Math.abs(vx)) {
            addDebugMessage(`Z dominant: forcing AWAY (${finalVz.toFixed(1)} m/s)`);
        } else {
            addDebugMessage(`X dominant: Z set to AWAY (${finalVz.toFixed(1)} m/s)`);
        }
    } else {
        addDebugMessage(`Low motion: Z forced AWAY (${finalVz.toFixed(1)} m/s)`);
    }

    const result = {
        x: vx * totalScale,
        y: vyLofted * totalScale,
        z: finalVz
    };

    const totalVel = Math.sqrt(result.x ** 2 + result.y ** 2 + result.z ** 2);
    addDebugMessage(`IMPACT: ${totalVel.toFixed(1)}m/s [x:${result.x.toFixed(1)}, y:${result.y.toFixed(1)}, z:${result.z.toFixed(1)}]`);

    if (totalVel > 80) {
        addDebugMessage(`⚠️ VELOCITY HIGH! ${totalVel.toFixed(0)}m/s (pro level is 60-75)`);
    } else if (totalVel < 5) {
        addDebugMessage(`⚠️ VELOCITY LOW! ${totalVel.toFixed(0)}m/s (swing harder!)`);
    }

    return result;
}

// ============================================
// LAUNCH BALL
// ============================================
function launchBall(initialVelocity) {
    // Ball weight affects distance
    const ballWeightFactor = 45.9 / currentSettings.ballWeight;

    let vx = initialVelocity.x * ballWeightFactor;
    let vy = initialVelocity.y * ballWeightFactor;
    let vz = initialVelocity.z * ballWeightFactor;

    addDebugMessage(`🔧 Launch V: [${vx.toFixed(1)}, ${vy.toFixed(1)}, ${vz.toFixed(1)}] m/s`);

    // Calculate spin
    const ballRadius = (currentSettings.ballDiameter / 100) / 2;

    if (ballRadius <= 0 || !isFinite(vx) || !isFinite(vy) || !isFinite(vz)) {
        addDebugMessage(`⚠️ Invalid velocity or ball size, skipping spin`);
        ballFlight.spin = { x: 0, y: 0, z: 0 };
    } else {
        const sidespinRate = -(vx / ballRadius) * 0.02;
        const backspinRate = (vy / ballRadius) * 0.05;
        const riflespinRate = 0;

        ballFlight.spin = {
            x: isFinite(backspinRate) ? backspinRate : 0,
            y: isFinite(sidespinRate) ? sidespinRate : 0,
            z: isFinite(riflespinRate) ? riflespinRate : 0
        };
    }

    const spinMagnitude = Math.sqrt(ballFlight.spin.x ** 2 + ballFlight.spin.y ** 2);

    if (currentSettings.spinEffect > 0 && spinMagnitude > 5) {
        addDebugMessage(`🌀 Spin: ${spinMagnitude.toFixed(0)} rad/s`);

        if (Math.abs(ballFlight.spin.y) > 50) {
            const direction = ballFlight.spin.y < 0 ? 'SLICE→' : '←HOOK';
            addDebugMessage(`🌀 ${direction}`);
        }
    }

    // Initialize flight state
    ballFlight.position = { x: 0, y: 0, z: 0 };
    ballFlight.velocity = { x: vx, y: vy, z: vz };
    ballFlight.flying = true;
    ballFlight.startTime = Date.now();
    ballFlight.lastUpdateTime = Date.now();
    ballFlight.maxHeight = 0;
    ballFlight.trajectory = [{ x: 0, y: 0, z: 0 }];

    // Store in lastShot
    lastShot.velocity = { x: vx, y: vy, z: vz };
    lastShot.spin = { ...ballFlight.spin };
    lastShot.timestamp = Date.now();

    const totalVel = Math.sqrt(vx ** 2 + vy ** 2 + vz ** 2);
    addDebugMessage(`🏌️ LAUNCH! ${totalVel.toFixed(1)}m/s`);
    addDebugMessage(`V: [${vx.toFixed(1)}, ${vy.toFixed(1)}, ${vz.toFixed(1)}]`);

    if (vy <= 0) {
        addDebugMessage(`⚠️ Y velocity ${vy.toFixed(1)} ≤ 0! Ball won't go up!`);
    } else {
        addDebugMessage(`✓ Y velocity ${vy.toFixed(1)} is UP`);
    }

    if (vz <= 0) {
        addDebugMessage(`⚠️ Z velocity ${vz.toFixed(1)} ≤ 0! Ball coming TOWARD you!`);
    } else {
        addDebugMessage(`✓ Z velocity ${vz.toFixed(1)} is AWAY`);
    }
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

    // Reset using tracking module function
    resetTracking();

    // Reset using physics module function
    resetBallFlight();

    // Clear debug log
    debugLog.messages = [];
    addDebugMessage(`🔄 Game reset`);

    currentState = GameState.READY_TO_SET_BALL;
    setBallBtn.disabled = false;

    if (imuPermissionGranted) {
        updateStatus('🔄 Ready for another shot! Tap "Tee Up"');
    } else {
        updateStatus('🔄 Reset! Tap "Tee Up" to begin');
    }
}

// ============================================
// STORE REFERENCES TO SETTINGS AND UI CALLBACKS
// ============================================
// These will be set by main.js
let currentSettings = null;
let currentUICallbacks = null;

export function setGameSettings(settings) {
    currentSettings = settings;
}

export function setUICallbacks(callbacks) {
    currentUICallbacks = callbacks;
}
