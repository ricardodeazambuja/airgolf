// ============================================
// CLUB TIP TRACKING MODULE
// ============================================
// Tracks the 3D position of the phone (club tip) using IMU sensor fusion.
//
// COORDINATE SYSTEM:
//   X-axis: Left(-) / Right(+) relative to player
//   Y-axis: Down(-) / Up(+)
//   Z-axis: Toward player(-) / Away from player(+)
//
// SENSOR FUSION APPROACH:
//   - Uses Madgwick filter to combine gyroscope + accelerometer (+ magnetometer if available)
//   - Produces quaternion orientation which is then used to calculate club tip position
//   - Supports both 6DOF (gyro+accel) and 9DOF (gyro+accel+magnetometer) tracking

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
    frameCount: 0,

    // Start time for rate measurement
    startTime: 0,

    // Motion-triggered tracking state
    trackingActive: false,      // Position tracking only active during motion
    trackingStartTime: 0,       // When motion was detected
    motionThreshold: 2.0,       // m/s² - acceleration to trigger tracking
    maxTrackingDuration: 2.0    // seconds - max time to track
};

// ============================================
// MADGWICK FILTER - SENSOR FUSION ALGORITHM
// ============================================
// Fuses gyroscope, accelerometer, and optionally magnetometer data to estimate device orientation.
//
// WHY MADGWICK:
//   - Gyroscope measures rotation rate but drifts over time
//   - Accelerometer provides absolute orientation reference (gravity) but is noisy
//   - Magnetometer provides absolute heading reference but may have interference
//   - Madgwick filter combines all three using gradient descent optimization
//
// OUTPUT: Quaternion (w, x, y, z) representing device orientation in 3D space
//
// PARAMETERS:
//   gx, gy, gz: Gyroscope angular velocity (deg/s)
//   ax, ay, az: Accelerometer linear acceleration (m/s²)
//   mx, my, mz: Magnetometer field strength (optional, use 0 for 6DOF mode)
//   dt: Time delta since last update (seconds)

function madgwickFilterUpdate(gx, gy, gz, ax, ay, az, dt, mx = 0, my = 0, mz = 0) {
    // Convert gyroscope from degrees/sec to radians/sec
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
// Transforms the club tip position from phone's local coordinate frame to world coordinates.
//
// CONCEPT:
//   1. Phone is held at grip (origin)
//   2. Club extends downward from phone by clubLength meters
//   3. As phone rotates, club tip moves in 3D space
//   4. Use quaternion rotation to transform local position to world position
//
// MATH: world_position = q × local_vector × q*
//   where q* is the conjugate of quaternion q

function calculateClubTipPosition(settings) {
    const q = clubTipTracking.quaternion;
    const clubLength = settings.clubLength;

    // Define club tip in phone's local coordinate frame
    // Phone at (0,0,0), club extends downward along -Y axis
    const localX = 0;
    const localY = -clubLength;
    const localZ = 0;

    // Apply quaternion rotation: world_pos = q × local_vec × q_conjugate
    // Step 1: q × local_vec
    const ix = q.w * localX + q.y * localZ - q.z * localY;
    const iy = q.w * localY + q.z * localX - q.x * localZ;
    const iz = q.w * localZ + q.x * localY - q.y * localX;
    const iw = -q.x * localX - q.y * localY - q.z * localZ;

    // Step 2: intermediate × q_conjugate
    let tipX = ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y;
    let tipY = iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z;
    let tipZ = iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x;

    // Apply offset correction:
    // 1. Add clubLength to Y to move initial position from (0, -clubLength, 0) to (0, 0, 0)
    // 2. Subtract the offset stored when "Tee Up" was pressed (makes that position the ball)
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
        clubTipTracking.startTime = now; // Start rate measurement
        return;
    }

    const dt = (now - clubTipTracking.lastUpdateTime) / 1000; // Convert to seconds
    clubTipTracking.lastUpdateTime = now;

    // Skip if dt is too large (first frame or tab was inactive)
    if (dt > 0.1) return;

    clubTipTracking.frameCount++;

    // MOTION-TRIGGERED TRACKING
    // To reduce drift, only track position during active swing motion
    if (ballPosition.set && !clubTipTracking.trackingActive) {
        const accelMag = Math.sqrt(
            (imuData.acceleration.x || 0) ** 2 +
            (imuData.acceleration.y || 0) ** 2 +
            (imuData.acceleration.z || 0) ** 2
        );

        if (accelMag > clubTipTracking.motionThreshold) {
            clubTipTracking.trackingActive = true;
            clubTipTracking.trackingStartTime = now;
            clubTipTracking.history = [];
            addDebugMessage(`🚀 Motion detected (${accelMag.toFixed(1)} m/s²)`);
        }

        return;  // Skip position calculation until motion detected
    }

    // Warn once if tracking duration exceeds limit
    if (clubTipTracking.trackingActive) {
        const trackingDuration = (now - clubTipTracking.trackingStartTime) / 1000;
        if (trackingDuration > clubTipTracking.maxTrackingDuration && !updateClubTipTracking._maxTimeWarned) {
            updateClubTipTracking._maxTimeWarned = true;
            addDebugMessage(`⏱️ Max tracking time (${clubTipTracking.maxTrackingDuration}s) reached`);
        }
    }

    // MAGNETOMETER CONVERSION
    // Convert compass heading to magnetometer vector components (if compass available)
    let mx = 0, my = 0, mz = 0;
    const compassHeading = imuData.orientation.alpha;
    if (compassHeading !== null && compassHeading !== undefined) {
        const headingRad = compassHeading * Math.PI / 180;
        mx = Math.cos(headingRad);  // North component
        my = Math.sin(headingRad);  // East component
        mz = 0;  // Horizontal assumption (vertical field negligible)
    }

    // ============================================
    // SENSOR AXIS INVERSIONS
    // ============================================
    // WHY WE NEGATE CERTAIN AXES:
    //   Different devices/browsers report IMU data with varying sign conventions.
    //   These inversions ensure consistent behavior across platforms.
    //
    // INVERTED AXES:
    //   - Alpha (yaw around Z): Negated so clockwise phone rotation → clockwise tip movement
    //   - Beta (pitch around X): Negated so raising arms → tip moves UP (not down)
    //   - Gamma (roll around Y): Negated to maintain right-hand coordinate system
    //   - Accel X: Negated to match yaw/roll inversions
    //   - Accel Y: Negated to match pitch inversion
    //   - Accel Z: NOT negated (forward/back is naturally correct)
    //
    // NOTE: In game-logic.js, we negate velocity.x again to compensate for this,
    //       ensuring ball flies in the correct direction relative to swing.

    madgwickFilterUpdate(
        -(imuData.rotationRate.alpha || 0),
        -(imuData.rotationRate.beta || 0),
        -(imuData.rotationRate.gamma || 0),
        -(imuData.acceleration.x || 0),
        -(imuData.acceleration.y || 0),
        imuData.acceleration.z || 0,
        dt,
        mx, my, mz  // Magnetometer components (0 if unavailable = 6DOF mode)
    );

    // Transform quaternion orientation to world-space club tip position
    calculateClubTipPosition(settings);

    // Record position in history for hit detection
    clubTipTracking.history.push({
        position: { ...clubTipTracking.tipPosition },
        timestamp: now
    });

    // Record for swing replay (if enabled)
    if (swingRecorder.isRecording && swingRecorder.currentRecording && ballPosition.set) {
        swingRecorder.currentRecording.tipPath.push({
            position: { ...clubTipTracking.tipPosition },
            velocity: { ...clubTipTracking.tipVelocity },
            timestamp: now
        });
    }

    // Limit history to current tracking session only
    if (clubTipTracking.trackingActive) {
        clubTipTracking.history = clubTipTracking.history.filter(
            h => h.timestamp >= clubTipTracking.trackingStartTime
        );
    } else {
        clubTipTracking.history = [];
    }
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
    clubTipTracking.startTime = 0;
    clubTipTracking.trackingActive = false;
    clubTipTracking.trackingStartTime = 0;

    // Reset debug flags
    calculateClubTipPosition._lastYDebug = 0;
    updateClubTipTracking._maxTimeWarned = false;
}
