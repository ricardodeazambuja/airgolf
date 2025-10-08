// ============================================
// SENSORS MODULE
// ============================================
// Handle raw IMU data collection from device motion sensors
// Feeds data to tracking.js for position estimation

import { GameState } from './config.js';
import { addDebugMessage } from './utils.js';

// ============================================
// IMU DATA STORAGE
// ============================================
// Store raw sensor data from device motion events
export const imuData = {
    acceleration: { x: 0, y: 0, z: 0 },      // Linear acceleration (m/s²)
    rotationRate: { alpha: 0, beta: 0, gamma: 0 },  // Angular velocity (deg/s)
    orientation: { alpha: 0, beta: 0, gamma: 0 },    // Device orientation (deg)
    timestamp: 0
};

// Permission state
export let imuPermissionGranted = false;

// Callback functions (will be set by main.js)
let updateClubTipTrackingCallback = null;
let recordSwingMotionCallback = null;
let updateStatusCallback = null;
let getCurrentStateCallback = null;
let onIMUInitializedCallback = null;

// ============================================
// SET CALLBACKS
// ============================================
export function setSensorCallbacks(callbacks) {
    updateClubTipTrackingCallback = callbacks.updateClubTipTracking;
    recordSwingMotionCallback = callbacks.recordSwingMotion;
    updateStatusCallback = callbacks.updateStatus;
    getCurrentStateCallback = callbacks.getCurrentState;
    onIMUInitializedCallback = callbacks.onIMUInitialized;
}

// ============================================
// IMU PERMISSION REQUEST
// ============================================
// Request permission for device motion sensors (iOS 13+)
export async function requestIMUPermission() {
    if (updateStatusCallback) {
        updateStatusCallback('Requesting IMU permission...');
    }

    // Check if DeviceMotionEvent.requestPermission exists (iOS 13+)
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
            const permission = await DeviceMotionEvent.requestPermission();
            if (permission === 'granted') {
                initializeIMU();
                return true;
            } else {
                if (updateStatusCallback) {
                    updateStatusCallback('ERROR: IMU permission denied');
                }
                return false;
            }
        } catch (error) {
            if (updateStatusCallback) {
                updateStatusCallback('ERROR: ' + error.message);
            }
            return false;
        }
    } else {
        // Non-iOS devices or older iOS
        initializeIMU();
        return true;
    }
}

// ============================================
// INITIALIZE IMU
// ============================================
function initializeIMU() {
    // Start listening to device motion events
    window.addEventListener('devicemotion', handleDeviceMotion);
    window.addEventListener('deviceorientation', handleDeviceOrientation);

    imuPermissionGranted = true;

    // Debug: Log platform detection
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    const platform = isIOS ? 'iOS' : (isAndroid ? 'Android' : 'Desktop');
    addDebugMessage(`📱 Platform: ${platform}`);

    if (updateStatusCallback) {
        updateStatusCallback('✓ IMU Ready! Set ball position to start');
    }

    // Notify that IMU is initialized
    if (onIMUInitializedCallback) {
        onIMUInitializedCallback();
    }
}

// ============================================
// DEVICE MOTION HANDLER
// ============================================
// Collect and store raw IMU data from device sensors
function handleDeviceMotion(event) {
    // Store acceleration and rotation rate
    // iOS note: event.acceleration may be null, use accelerationIncludingGravity as fallback
    if (event.acceleration && (event.acceleration.x !== null || event.acceleration.y !== null || event.acceleration.z !== null)) {
        imuData.acceleration = {
            x: event.acceleration.x || 0,
            y: event.acceleration.y || 0,
            z: event.acceleration.z || 0
        };

        // Debug: log once that we're using linear acceleration
        if (!handleDeviceMotion._accelSourceLogged) {
            handleDeviceMotion._accelSourceLogged = true;
            addDebugMessage('📱 Using linear acceleration (without gravity)');
        }
    } else if (event.accelerationIncludingGravity) {
        // Fallback: use total acceleration (including gravity)
        // This is less accurate but better than nothing
        imuData.acceleration = {
            x: event.accelerationIncludingGravity.x || 0,
            y: event.accelerationIncludingGravity.y || 0,
            z: event.accelerationIncludingGravity.z || 0
        };

        // Debug: log once that we're using gravity-inclusive data
        if (!handleDeviceMotion._accelSourceLogged) {
            handleDeviceMotion._accelSourceLogged = true;
            addDebugMessage('⚠️ Using accelerationIncludingGravity (includes ~9.8m/s² gravity)');
        }
    }

    if (event.rotationRate) {
        imuData.rotationRate = {
            alpha: event.rotationRate.alpha || 0,
            beta: event.rotationRate.beta || 0,
            gamma: event.rotationRate.gamma || 0
        };
    }

    imuData.timestamp = event.timeStamp || Date.now();

    // Get current state
    const currentState = getCurrentStateCallback ? getCurrentStateCallback() : null;

    // Debug: Heartbeat to confirm handleDeviceMotion is running (log once after ball set)
    if (!handleDeviceMotion._heartbeatLogged &&
        (currentState === GameState.BALL_SET_READY_TO_SWING || currentState === GameState.SWINGING)) {
        handleDeviceMotion._heartbeatLogged = true;
        addDebugMessage(`💓 [SENSORS] Heartbeat OK - current state: ${currentState}`);
    }

    // Debug: Periodic heartbeat every 2 seconds to verify continuous operation
    const now = Date.now();
    if (!handleDeviceMotion._lastPeriodicLog || now - handleDeviceMotion._lastPeriodicLog > 2000) {
        handleDeviceMotion._lastPeriodicLog = now;
        if (currentState === GameState.BALL_SET_READY_TO_SWING ||
            currentState === GameState.SWINGING) {
            const isSwinging = currentState === GameState.SWINGING;
            addDebugMessage(`💓 state:${currentState} cb:${recordSwingMotionCallback ? 'OK' : 'NULL'} match:${isSwinging}`);
        }
    }

    // Update club tip tracking if ball is set or swinging
    if (currentState === GameState.BALL_SET_READY_TO_SWING ||
        currentState === GameState.SWINGING) {
        if (updateClubTipTrackingCallback) {
            try {
                updateClubTipTrackingCallback();
                // Debug: Log after tracking update completes
                if (!handleDeviceMotion._trackingCompleted) {
                    handleDeviceMotion._trackingCompleted = true;
                    addDebugMessage(`✓ Tracking callback completed`);
                }
            } catch (error) {
                addDebugMessage(`❌ ERROR in tracking: ${error.message}`);
            }
        }
    }

    // Removed: "After tracking" debug spam

    // If we're in swinging state, record the motion
    if (currentState === GameState.SWINGING) {
        // Debug: log once when swing recording starts in sensors
        if (!handleDeviceMotion._swingingLogged) {
            handleDeviceMotion._swingingLogged = true;
            addDebugMessage(`🔄 INSIDE IF BLOCK - calling callback`);
        }
        if (recordSwingMotionCallback) {
            recordSwingMotionCallback();
        } else {
            // Debug: callback not set!
            if (!handleDeviceMotion._callbackMissing) {
                handleDeviceMotion._callbackMissing = true;
                addDebugMessage(`❌ ERROR: callback is null!`);
            }
        }
    } else {
        // Debug: log what state we're in if not swinging
        if (handleDeviceMotion._swingingLogged && !handleDeviceMotion._notSwingingLogged) {
            handleDeviceMotion._notSwingingLogged = true;
            addDebugMessage(`🔄 [SENSORS] State changed from SWINGING to ${currentState}`);
        }

        // Debug: Why is the check failing?
        if (!handleDeviceMotion._failureLogged &&
            (currentState === GameState.BALL_SET_READY_TO_SWING || currentState === 'swinging')) {
            handleDeviceMotion._failureLogged = true;
            addDebugMessage(`❌ [DEBUG] State check FAILED: current="${currentState}", expected="${GameState.SWINGING}"`);
        }
    }
}

// ============================================
// DEVICE ORIENTATION HANDLER
// ============================================
function handleDeviceOrientation(event) {
    // Store device orientation
    // IMPORTANT: Keep null/undefined for alpha when compass unavailable
    // Using || 0 would make "no compass" indistinguishable from "pointing North"
    imuData.orientation = {
        alpha: event.alpha,  // Rotation around z-axis (0-360), null if no compass
        beta: event.beta ?? 0,    // Rotation around x-axis (-180 to 180)
        gamma: event.gamma ?? 0   // Rotation around y-axis (-90 to 90)
    };
}

// ============================================
// PERMISSION STATE SETTER
// ============================================
export function setIMUPermissionGranted(value) {
    imuPermissionGranted = value;
}

// ============================================
// RESET DEBUG FLAGS (called from game reset)
// ============================================
export function resetSensorDebugFlags() {
    handleDeviceMotion._accelSourceLogged = false;
    handleDeviceMotion._swingingLogged = false;
    handleDeviceMotion._notSwingingLogged = false;
    handleDeviceMotion._heartbeatLogged = false;
    handleDeviceMotion._callbackMissing = false;
    handleDeviceMotion._lastPeriodicLog = 0;
    handleDeviceMotion._failureLogged = false;
    handleDeviceMotion._reachedSwingCheck = false;
    handleDeviceMotion._trackingCompleted = false;
    addDebugMessage('🔄 Sensor debug flags reset');
}
