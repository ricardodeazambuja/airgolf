// ============================================
// CLUB TIP TRACKING MODULE
// ============================================
// This module implements 3D club tip position tracking using sensor fusion
// CRITICAL MODULE: Easy to extend with magnetometer, Kalman filter, etc.

import { addDebugMessage } from './utils.js';

// ============================================
// CLUB TIP TRACKING STATE
// ============================================
// Track the position of the club tip through 3D space
export const clubTipTracking = {
    // Quaternion for orientation (Madgwick filter output)
    quaternion: { w: 1, x: 0, y: 0, z: 0 },

    // Club tip position in 3D space (meters from grip)
    tipPosition: { x: 0, y: 0, z: 0 },

    // Offset to subtract (set when ball is positioned)
    offset: { x: 0, y: 0, z: 0 },

    // Club tip velocity (m/s)
    tipVelocity: { x: 0, y: 0, z: 0 },

    // Tracking history for visualization
    history: [],

    // Madgwick filter parameters
    beta: 0.1,  // Filter gain (higher = more responsive, more noise)

    // Last update timestamp
    lastUpdateTime: 0,

    // Frame counter for debug messages (doesn't get filtered like history)
    frameCount: 0
};

// ============================================
// MADGWICK FILTER - SENSOR FUSION
// ============================================
// PURPOSE: Combine accelerometer and gyroscope data for accurate orientation

function madgwickFilterUpdate(gx, gy, gz, ax, ay, az, dt, mx = 0, my = 0, mz = 0) {
    // Convert gyroscope degrees/sec to radians/sec
    gx = gx * Math.PI / 180;
    gy = gy * Math.PI / 180;
    gz = gz * Math.PI / 180;

    // Short name for quaternion
    let q = clubTipTracking.quaternion;

    // Normalize accelerometer measurement
    const norm = Math.sqrt(ax * ax + ay * ay + az * az);
    if (norm === 0) return; // Avoid division by zero

    ax /= norm;
    ay /= norm;
    az /= norm;

    // Gradient descent algorithm corrective step
    const _2q0 = 2 * q.w;
    const _2q1 = 2 * q.x;
    const _2q2 = 2 * q.y;
    const _2q3 = 2 * q.z;
    const _4q0 = 4 * q.w;
    const _4q1 = 4 * q.x;
    const _4q2 = 4 * q.y;
    const _8q1 = 8 * q.x;
    const _8q2 = 8 * q.y;
    const q0q0 = q.w * q.w;
    const q1q1 = q.x * q.x;
    const q2q2 = q.y * q.y;
    const q3q3 = q.z * q.z;
    // Cross products needed for magnetometer (9DOF)
    const q0q1 = q.w * q.x;
    const q0q2 = q.w * q.y;
    const q0q3 = q.w * q.z;
    const q1q2 = q.x * q.y;
    const q1q3 = q.x * q.z;
    const q2q3 = q.y * q.z;

    // Gradient from accelerometer (6DOF - always computed)
    let s0 = _4q0 * q2q2 + _2q2 * ax + _4q0 * q1q1 - _2q1 * ay;
    let s1 = _4q1 * q3q3 - _2q3 * ax + 4 * q0q0 * q.x - _2q0 * ay - _4q1 + _8q1 * q1q1 + _8q1 * q2q2 + _4q1 * az;
    let s2 = 4 * q0q0 * q.y + _2q0 * ax + _4q2 * q3q3 - _2q3 * ay - _4q2 + _8q2 * q1q1 + _8q2 * q2q2 + _4q2 * az;
    let s3 = 4 * q1q1 * q.z - _2q1 * ax + 4 * q2q2 * q.z - _2q2 * ay;

    // Magnetometer correction (9DOF - only if magnetometer data available)
    if (mx !== 0 || my !== 0 || mz !== 0) {
        // Normalize magnetometer measurement
        const mNorm = Math.sqrt(mx * mx + my * my + mz * mz);
        if (mNorm > 0) {
            mx /= mNorm;
            my /= mNorm;
            mz /= mNorm;

            // Reference direction of Earth's magnetic field (in quaternion frame)
            const _2q0mx = 2 * q.w * mx;
            const _2q0my = 2 * q.w * my;
            const _2q0mz = 2 * q.w * mz;
            const _2q1mx = 2 * q.x * mx;

            const hx = mx * q0q0 - _2q0my * q.z + _2q0mz * q.y + mx * q1q1 + _2q1 * my * q.y + _2q1 * mz * q.z - mx * q2q2 - mx * q3q3;
            const hy = _2q0mx * q.z + my * q0q0 - _2q0mz * q.x + _2q1mx * q.y - my * q1q1 + my * q2q2 + _2q2 * mz * q.z - my * q3q3;
            const _2bx = Math.sqrt(hx * hx + hy * hy);
            const _2bz = -_2q0mx * q.y + _2q0my * q.x + mz * q0q0 + _2q1mx * q.z - mz * q1q1 + _2q2 * my * q.z - mz * q2q2 + mz * q3q3;
            const _4bx = 2 * _2bx;
            const _4bz = 2 * _2bz;

            // Magnetometer gradient (add to accelerometer gradient)
            s0 -= (-_2q2 * _2bx * (q1q1 + q2q2 - 0.5 - q3q3) + _2q3 * _2bz * (q1q2 - q0q3));
            s1 -= (_2q2 * _2bx * (q0q2 + q1q3) - _2q3 * _2bz * (q0q1 + q2q3));
            s2 -= (-_2q1 * _2bx * (q0q2 + q1q3) - _2q0 * _2bz * (0.5 - q1q1 - q2q2) + _4bz * q.y);
            s3 -= (_2q1 * _2bx * (q1q1 + q2q2 - 0.5 - q3q3) + _2q0 * _2bz * (q0q1 - q2q3) - _4bx * q.z);
        }
    }

    const sNorm = Math.sqrt(s0 * s0 + s1 * s1 + s2 * s2 + s3 * s3);

    // Apply feedback step
    const qDot1 = 0.5 * (-q.x * gx - q.y * gy - q.z * gz) - clubTipTracking.beta * (s0 / sNorm);
    const qDot2 = 0.5 * (q.w * gx + q.y * gz - q.z * gy) - clubTipTracking.beta * (s1 / sNorm);
    const qDot3 = 0.5 * (q.w * gy - q.x * gz + q.z * gx) - clubTipTracking.beta * (s2 / sNorm);
    const qDot4 = 0.5 * (q.w * gz + q.x * gy - q.y * gx) - clubTipTracking.beta * (s3 / sNorm);

    // Integrate quaternion rate
    q.w += qDot1 * dt;
    q.x += qDot2 * dt;
    q.y += qDot3 * dt;
    q.z += qDot4 * dt;

    // Normalize quaternion
    const qNorm = Math.sqrt(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z);
    q.w /= qNorm;
    q.x /= qNorm;
    q.y /= qNorm;
    q.z /= qNorm;
}

// ============================================
// CLUB TIP POSITION CALCULATION
// ============================================
// PURPOSE: Calculate 3D position of club tip based on orientation and club length

function calculateClubTipPosition(settings) {
    const q = clubTipTracking.quaternion;
    const clubLength = settings.clubLength;

    // Club points downward from grip in local coordinates
    // Local club direction: (0, -clubLength, 0) in grip's reference frame
    const localX = 0;
    const localY = -clubLength;
    const localZ = 0;

    // Rotate local club vector by quaternion to get world position
    // q * v * q_conjugate
    const ix = q.w * localX + q.y * localZ - q.z * localY;
    const iy = q.w * localY + q.z * localX - q.x * localZ;
    const iz = q.w * localZ + q.x * localY - q.y * localX;
    const iw = -q.x * localX - q.y * localY - q.z * localZ;

    let tipX = ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y;
    let tipY = iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z;
    let tipZ = iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x;

    // Apply phone orientation transformation
    if (settings.phoneOrientation === 'edge') {
        // Edge-first: Rotate 90° around Z axis
        // When holding phone edge-first (landscape), rotate coords
        const tempX = tipX;
        const tempY = tipY;
        const tempZ = tipZ;

        tipX = tempY;   // Phone Y → Screen X (rotated)
        tipY = tempX;   // Phone X → Screen Y
        tipZ = tempZ;   // Phone Z stays Z (forward/back)
    }
    // For 'screen' orientation, no transformation needed (original behavior)

    // Offset so tip starts at (0,0,0) instead of (0, -clubLength, 0)
    // Add clubLength to Y so initial position is at origin
    // Then subtract the offset that was stored when ball was set
    clubTipTracking.tipPosition.x = tipX - clubTipTracking.offset.x;
    clubTipTracking.tipPosition.y = (tipY + clubLength) - clubTipTracking.offset.y;
    clubTipTracking.tipPosition.z = tipZ - clubTipTracking.offset.z;
}

// ============================================
// CLUB TIP TRACKING UPDATE
// ============================================
// PURPOSE: Update club tip tracking with new IMU data

export function updateClubTipTracking(imuData, settings, ballPosition, swingRecorder) {
    const now = Date.now();

    // Calculate time delta
    if (clubTipTracking.lastUpdateTime === 0) {
        clubTipTracking.lastUpdateTime = now;
        return;
    }

    const dt = (now - clubTipTracking.lastUpdateTime) / 1000; // Convert to seconds
    clubTipTracking.lastUpdateTime = now;

    // Skip if dt is too large (first frame or tab was inactive)
    if (dt > 0.1) return;

    // Increment frame counter
    clubTipTracking.frameCount++;

    // Debug: Check compass availability (first 100 frames only, print every 20 frames)
    if (clubTipTracking.frameCount <= 100 && clubTipTracking.frameCount % 20 === 0) {
        const compassHeading = imuData.orientation.alpha;
        if (compassHeading !== null && compassHeading !== undefined) {
            addDebugMessage(`🧭 9DOF mode: Compass ${compassHeading.toFixed(1)}° (yaw drift correction active)`);
        } else {
            addDebugMessage(`⚠️ 6DOF mode: Compass unavailable (gyro+accel only)`);
        }
    }

    // Convert compass heading to magnetometer components (if available)
    let mx = 0, my = 0, mz = 0;
    const compassHeading = imuData.orientation.alpha;
    if (compassHeading !== null && compassHeading !== undefined) {
        // Convert compass heading (0-360°) to magnetometer vector
        // alpha: 0° = North, 90° = East, 180° = South, 270° = West
        const headingRad = compassHeading * Math.PI / 180;
        mx = Math.cos(headingRad);  // North component
        my = Math.sin(headingRad);  // East component
        mz = 0;  // Assuming horizontal (vertical component negligible)
    }

    // Update orientation using Madgwick filter (6DOF or 9DOF)
    madgwickFilterUpdate(
        imuData.rotationRate.alpha || 0,
        imuData.rotationRate.beta || 0,
        imuData.rotationRate.gamma || 0,
        imuData.acceleration.x || 0,
        imuData.acceleration.y || 0,
        imuData.acceleration.z || 0,
        dt,
        mx, my, mz  // Magnetometer (0,0,0 if unavailable → 6DOF mode)
    );

    // Safety check: verify quaternion is valid (first 10 frames)
    if (clubTipTracking.history.length < 10) {
        const q = clubTipTracking.quaternion;
        const qMag = Math.sqrt(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z);
        if (!isFinite(qMag) || Math.abs(qMag - 1.0) > 0.01) {
            addDebugMessage(`⚠️ Quaternion invalid: mag=${qMag.toFixed(3)} (should be 1.0)`);
        }
    }

    // Calculate club tip position from orientation
    calculateClubTipPosition(settings);

    // Store in history for visualization
    clubTipTracking.history.push({
        position: { ...clubTipTracking.tipPosition },
        timestamp: now
    });

    // Record for swing replay if recording is active
    if (swingRecorder.isRecording && swingRecorder.currentRecording && ballPosition.set) {
        swingRecorder.currentRecording.tipPath.push({
            position: { ...clubTipTracking.tipPosition },
            velocity: { ...clubTipTracking.tipVelocity },
            timestamp: now
        });
    }

    // Keep only last 2 seconds of history
    const twoSecondsAgo = now - 2000;
    clubTipTracking.history = clubTipTracking.history.filter(
        h => h.timestamp > twoSecondsAgo
    );
}

// ============================================
// RESET FUNCTION
// ============================================
export function resetTracking() {
    clubTipTracking.quaternion = { w: 1, x: 0, y: 0, z: 0 };
    clubTipTracking.tipPosition = { x: 0, y: 0, z: 0 };
    clubTipTracking.offset = { x: 0, y: 0, z: 0 };
    clubTipTracking.tipVelocity = { x: 0, y: 0, z: 0 };
    clubTipTracking.history = [];
    clubTipTracking.lastUpdateTime = 0;
    clubTipTracking.frameCount = 0;
}
