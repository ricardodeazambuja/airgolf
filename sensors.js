// ============================================
// SENSORS MODULE
// ============================================
// Collects raw IMU (Inertial Measurement Unit) data from device sensors.
//
// SENSORS USED:
//   - Accelerometer: Linear acceleration in m/s²
//   - Gyroscope: Angular velocity in deg/s
//   - Magnetometer: Compass heading in degrees (if available)
//
// DATA FLOW:
//   Browser events → This module → tracking.js (sensor fusion) → game-logic.js (hit detection)

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
// Called by browser on every sensor update (typically ~60Hz)
function handleDeviceMotion(event) {
    // ACCELERATION DATA
    // Prefer linear acceleration (gravity-compensated), fallback to raw acceleration
    if (event.acceleration && (event.acceleration.x !== null || event.acceleration.y !== null || event.acceleration.z !== null)) {
        imuData.acceleration = {
            x: event.acceleration.x || 0,
            y: event.acceleration.y || 0,
            z: event.acceleration.z || 0
        };

        if (!handleDeviceMotion._accelSourceLogged) {
            handleDeviceMotion._accelSourceLogged = true;
            addDebugMessage('📱 Using linear acceleration (gravity-compensated)');
        }
    } else if (event.accelerationIncludingGravity) {
        imuData.acceleration = {
            x: event.accelerationIncludingGravity.x || 0,
            y: event.accelerationIncludingGravity.y || 0,
            z: event.accelerationIncludingGravity.z || 0
        };

        if (!handleDeviceMotion._accelSourceLogged) {
            handleDeviceMotion._accelSourceLogged = true;
            addDebugMessage('⚠️ Using raw acceleration (includes gravity ~9.8m/s²)');
        }
    }

    // GYROSCOPE DATA
    if (event.rotationRate) {
        imuData.rotationRate = {
            alpha: event.rotationRate.alpha || 0,  // Yaw (Z-axis)
            beta: event.rotationRate.beta || 0,    // Pitch (X-axis)
            gamma: event.rotationRate.gamma || 0   // Roll (Y-axis)
        };
    }

    imuData.timestamp = event.timeStamp || Date.now();

    const currentState = getCurrentStateCallback ? getCurrentStateCallback() : null;

    // Update club tip tracking when ball is set or actively swinging
    if (currentState === GameState.BALL_SET_READY_TO_SWING || currentState === GameState.SWINGING) {
        if (updateClubTipTrackingCallback) {
            try {
                updateClubTipTrackingCallback();
            } catch (error) {
                addDebugMessage(`❌ Tracking error: ${error.message}`);
            }
        }
    }

    // Record swing motion data for hit detection
    if (currentState === GameState.SWINGING && recordSwingMotionCallback) {
        recordSwingMotionCallback();
    }
}

// ============================================
// DEVICE ORIENTATION HANDLER
// ============================================
// Provides absolute orientation (including compass heading if available)
function handleDeviceOrientation(event) {
    imuData.orientation = {
        alpha: event.alpha,      // Compass heading 0-360° (null if unavailable)
        beta: event.beta ?? 0,   // Pitch: -180 to 180°
        gamma: event.gamma ?? 0  // Roll: -90 to 90°
    };
    // NOTE: alpha is kept as null when compass unavailable (not defaulted to 0)
    //       This allows tracking.js to detect 6DOF vs 9DOF mode
}

// ============================================
// PERMISSION STATE SETTER
// ============================================
export function setIMUPermissionGranted(value) {
    imuPermissionGranted = value;
}

export function resetSensorDebugFlags() {
    handleDeviceMotion._accelSourceLogged = false;
}
