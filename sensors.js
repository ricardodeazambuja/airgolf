// ============================================
// SENSORS MODULE
// ============================================
// Handle raw IMU data collection from device motion sensors
// Feeds data to tracking.js for position estimation

import { GameState } from './config.js';

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
    if (event.acceleration) {
        imuData.acceleration = {
            x: event.acceleration.x || 0,
            y: event.acceleration.y || 0,
            z: event.acceleration.z || 0
        };
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

    // Update club tip tracking if ball is set or swinging
    if (currentState === GameState.BALL_SET_READY_TO_SWING ||
        currentState === GameState.SWINGING) {
        if (updateClubTipTrackingCallback) {
            updateClubTipTrackingCallback();
        }
    }

    // If we're in swinging state, record the motion
    if (currentState === GameState.SWINGING) {
        if (recordSwingMotionCallback) {
            recordSwingMotionCallback();
        }
    }
}

// ============================================
// DEVICE ORIENTATION HANDLER
// ============================================
function handleDeviceOrientation(event) {
    // Store device orientation
    imuData.orientation = {
        alpha: event.alpha || 0,  // Rotation around z-axis (0-360)
        beta: event.beta || 0,    // Rotation around x-axis (-180 to 180)
        gamma: event.gamma || 0   // Rotation around y-axis (-90 to 90)
    };
}

// ============================================
// PERMISSION STATE SETTER
// ============================================
export function setIMUPermissionGranted(value) {
    imuPermissionGranted = value;
}
