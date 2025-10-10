# AirGolf Technical Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [Coordinate Systems](#coordinate-systems)
3. [Sensor Fusion](#sensor-fusion)
4. [3D Transformations](#3d-transformations)
5. [Hit Detection](#hit-detection)
6. [Physics Calculations](#physics-calculations)
7. [Troubleshooting](#troubleshooting)

---

## System Overview

AirGolf converts smartphone IMU (Inertial Measurement Unit) data into a virtual golf simulation. The phone is held like a golf club, and sensor fusion algorithms track the 3D position of the "club tip" to detect ball impacts and calculate trajectories.

### Architecture

```
┌─────────────┐
│   Browser   │
│   Events    │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌──────────────┐
│  sensors.js │────▶│ tracking.js  │
│  (IMU data) │     │ (Madgwick +  │
└─────────────┘     │  Quaternion) │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │game-logic.js │
                    │(Hit detect + │
                    │  Physics)    │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ renderer.js  │
                    │(Visualization)│
                    └──────────────┘
```

### Data Flow

1. **Browser Events** → `devicemotion`, `deviceorientation`
2. **sensors.js** → Collects raw IMU data
3. **tracking.js** → Fuses sensors to estimate orientation (quaternion)
4. **tracking.js** → Transforms quaternion to 3D club tip position
5. **game-logic.js** → Detects ball hits, calculates velocity
6. **physics.js** → Simulates ball flight
7. **renderer.js** → Draws 3D scene

---

## Coordinate Systems

### World Coordinate System

The game uses a **right-handed coordinate system** from the player's perspective:

```
       Y (up)
       │
       │
       └─────── X (right)
      ╱
     ╱
    Z (away from player)
```

- **X-axis**: Left (-) / Right (+)
- **Y-axis**: Down (-) / Up (+)
- **Z-axis**: Toward player (-) / Away from player (+)

### Phone Coordinate System

When holding the phone like a golf club (screen facing forward):

```
Phone orientation:
  ┌───────────┐
  │  Screen   │  ← Facing ball
  │           │
  └───────────┘
       │
       │ Club extends downward
       ▼
```

### Axis Mapping

| Phone Sensor Axis | World Axis | Notes |
|-------------------|------------|-------|
| Accelerometer X | X | Left/Right movement |
| Accelerometer Y | Y | Up/Down movement |
| Accelerometer Z | Z | Forward/Back movement |
| Gyro Alpha (Z) | Yaw | Rotation around vertical |
| Gyro Beta (X) | Pitch | Tilt up/down |
| Gyro Gamma (Y) | Roll | Rotation around depth |

---

## Sensor Fusion

### Why Sensor Fusion?

Individual sensors have limitations:

| Sensor | Strengths | Weaknesses |
|--------|-----------|------------|
| **Gyroscope** | Accurate rotation rate | Drifts over time (integration error) |
| **Accelerometer** | Absolute orientation reference (gravity) | Noisy, affected by motion |
| **Magnetometer** | Absolute heading reference | Interference from metal/electronics |

### Madgwick Filter

The Madgwick filter combines all three sensors using gradient descent optimization to produce a drift-free orientation quaternion.

```javascript
// From tracking.js:76-171
function madgwickFilterUpdate(gx, gy, gz, ax, ay, az, dt, mx = 0, my = 0, mz = 0) {
    // Convert gyroscope from degrees/sec to radians/sec
    gx = gx * Math.PI / 180;
    gy = gy * Math.PI / 180;
    gz = gz * Math.PI / 180;

    // Normalize accelerometer
    const norm = Math.sqrt(ax * ax + ay * ay + az * az);
    if (norm === 0) return;
    ax /= norm;
    ay /= norm;
    az /= norm;

    // Gradient descent algorithm
    // ... (see tracking.js for full implementation)

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
```

#### Filter Parameters

- **Beta (β)**: Filter gain, controls responsiveness vs. noise rejection
  - Current value: `0.1`
  - Higher β = faster response, more noise
  - Lower β = slower response, less noise

#### 6DOF vs 9DOF Mode

- **6DOF**: Gyro + Accelerometer only (when magnetometer unavailable)
- **9DOF**: Gyro + Accelerometer + Magnetometer (prevents yaw drift)

```javascript
// From tracking.js:270-279
let mx = 0, my = 0, mz = 0;
const compassHeading = imuData.orientation.alpha;
if (compassHeading !== null && compassHeading !== undefined) {
    const headingRad = compassHeading * Math.PI / 180;
    mx = Math.cos(headingRad);  // North component
    my = Math.sin(headingRad);  // East component
    mz = 0;  // Horizontal assumption
}
```

---

## 3D Transformations

### Quaternion to Position

The club tip position is calculated by rotating a local vector (pointing from grip to tip) by the device orientation quaternion.

#### Mathematical Formula

```
world_position = q × local_vector × q*
```

Where:
- `q` = orientation quaternion (w, x, y, z)
- `q*` = conjugate of q
- `local_vector` = (0, -clubLength, 0) in phone's coordinate frame

#### Implementation

```javascript
// From tracking.js:187-214
function calculateClubTipPosition(settings) {
    const q = clubTipTracking.quaternion;
    const clubLength = settings.clubLength;

    // Club extends downward from phone along -Y axis
    const localX = 0;
    const localY = -clubLength;
    const localZ = 0;

    // Step 1: q × local_vec
    const ix = q.w * localX + q.y * localZ - q.z * localY;
    const iy = q.w * localY + q.z * localX - q.x * localZ;
    const iz = q.w * localZ + q.x * localY - q.y * localX;
    const iw = -q.x * localX - q.y * localY - q.z * localZ;

    // Step 2: intermediate × q_conjugate
    let tipX = ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y;
    let tipY = iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z;
    let tipZ = iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x;

    // Apply offset correction
    clubTipTracking.tipPosition.x = tipX - clubTipTracking.offset.x;
    clubTipTracking.tipPosition.y = (tipY + clubLength) - clubTipTracking.offset.y;
    clubTipTracking.tipPosition.z = tipZ - clubTipTracking.offset.z;
}
```

#### Offset Correction

When "Tee Up" is pressed, the current tip position becomes the ball position (origin):

```javascript
// From game-logic.js:122-126
clubTipTracking.offset = {
    x: clubTipTracking.tipPosition.x + clubTipTracking.offset.x,
    y: clubTipTracking.tipPosition.y + clubTipTracking.offset.y,
    z: clubTipTracking.tipPosition.z + clubTipTracking.offset.z
};
```

This makes all subsequent positions relative to the ball.

---

## Sensor Axis Inversions

### The Problem

Different devices and browsers report IMU data with varying sign conventions. To ensure consistent behavior, certain axes must be inverted.

### Inversions Applied

```javascript
// From tracking.js:299-308
madgwickFilterUpdate(
    -(imuData.rotationRate.alpha || 0),  // NEGATED: Yaw
    -(imuData.rotationRate.beta || 0),   // NEGATED: Pitch
    -(imuData.rotationRate.gamma || 0),  // NEGATED: Roll
    -(imuData.acceleration.x || 0),      // NEGATED: Left/Right
    -(imuData.acceleration.y || 0),      // NEGATED: Up/Down
    imuData.acceleration.z || 0,         // NOT negated: Forward/Back
    dt,
    mx, my, mz
);
```

### Why Each Axis is Inverted

| Axis | Reason |
|------|--------|
| **Alpha (Yaw)** | Clockwise phone rotation should appear clockwise |
| **Beta (Pitch)** | Raising arms should move tip UP (not down) |
| **Gamma (Roll)** | Maintains right-hand coordinate system |
| **Accel X** | Matches yaw/roll inversions |
| **Accel Y** | Matches pitch inversion |
| **Accel Z** | Naturally correct (not inverted) |

### Compensating Negation

Because X-axis is inverted in tracking, it must be negated again when calculating ball velocity to ensure correct flight direction:

```javascript
// From game-logic.js:442-446
const result = {
    x: -vx * totalScale,  // NEGATED: compensates for sensor inversions
    y: vyLofted * totalScale,
    z: finalVz
};
```

**Result**: Swing left → Ball flies left ✓

---

## Hit Detection

### Detection Algorithm

A hit is registered when three conditions are met simultaneously:

1. **Proximity**: Club tip within hit zone
2. **Speed**: Total acceleration exceeds threshold
3. **Backswing**: Club moved away ≥15cm before returning

```javascript
// From game-logic.js:235-268
function detectBallHit() {
    if (swingData.hitDetected || !currentSettings) return;

    // 1. Calculate club tip distance from ball
    const tipDistance = Math.sqrt(
        clubTipTracking.tipPosition.x ** 2 +
        clubTipTracking.tipPosition.y ** 2 +
        clubTipTracking.tipPosition.z ** 2
    );

    const hitThreshold = currentSettings.hitZoneDiameter / 200; // cm → m radius

    // 2. Calculate swing speed
    const totalAcceleration = Math.sqrt(
        imuData.acceleration.x ** 2 +
        imuData.acceleration.y ** 2 +
        imuData.acceleration.z ** 2
    );

    // 3. Check conditions
    if (tipDistance < hitThreshold &&
        totalAcceleration > currentSettings.minSwingSpeed) {

        // Verify backswing
        const recentHistory = clubTipTracking.history.slice(-20);
        const maxDistance = Math.max(...recentHistory.map(h =>
            Math.sqrt(h.position.x ** 2 + h.position.y ** 2 + h.position.z ** 2)
        ));

        if (maxDistance > 0.15) {
            registerBallHit();
        }
    }
}
```

### Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `hitZoneDiameter` | 40 cm | Size of detection zone around ball |
| `minSwingSpeed` | 15 m/s² | Minimum acceleration to register hit |
| Backswing distance | 0.15 m | Minimum distance for valid swing |

---

## Physics Calculations

### Impact Velocity Calculation

Velocity is calculated from position history using finite differences:

```
v = Δposition / Δtime
```

```javascript
// From game-logic.js:395-413
const current = history[history.length - 1];
const previous = history[history.length - 5];
const dt = (current.timestamp - previous.timestamp) / 1000;

const deltaX = current.position.x - previous.position.x;
const deltaY = current.position.y - previous.position.y;
const deltaZ = current.position.z - previous.position.z;

let vx = deltaX / dt;
let vy = deltaY / dt;
let vz = deltaZ / dt;
```

### Loft Angle Transformation

Golf clubs have a **loft angle** that converts downward swing motion into upward ball launch:

```javascript
// From game-logic.js:417-427
const loftRadians = currentSettings.loftAngle * Math.PI / 180;
const horizontalSpeed = Math.sqrt(vx * vx + vz * vz);

let vyLofted;
if (vy < 0) {
    // Transform downswing into upward launch
    vyLofted = horizontalSpeed * Math.sin(loftRadians) +
               Math.abs(vy) * Math.cos(loftRadians);
} else {
    vyLofted = vy;
}
```

#### Physics Explanation

```
Original downswing velocity:  ↓ (vy < 0)

Loft angle applied:          ⤢ θ

Resulting launch:            ↗ (vyLofted > 0)
```

### Scaling Factors

Multiple factors scale the final velocity:

```javascript
// From game-logic.js:432-437
const weightFactor = currentSettings.clubWeight / 200;  // Heavier club = more energy
const totalScale = weightFactor * currentSettings.impactPower;  // Game balance

// Ball weight affects velocity (lighter = faster)
const ballWeightFactor = 45.9 / currentSettings.ballWeight;
vx *= ballWeightFactor;
vy *= ballWeightFactor;
vz *= ballWeightFactor;
```

### Spin Calculation

Ball spin determines hook/slice behavior:

```javascript
// From game-logic.js:471-478
const ballRadius = (currentSettings.ballDiameter / 100) / 2;

const sidespinRate = -(vx / ballRadius) * 0.02;  // Left/Right velocity → Spin
const backspinRate = (vy / ballRadius) * 0.05;   // Up/Down velocity → Backspin

ballFlight.spin = {
    x: backspinRate,   // Affects lift (Magnus effect)
    y: sidespinRate,   // Affects curve (hook/slice)
    z: 0               // Rifle spin (not modeled)
};
```

#### Spin Effects

- **Positive sidespin** (y > 0): Ball slices right →
- **Negative sidespin** (y < 0): Ball hooks left ←
- **Backspin** (x): Generates lift (Magnus effect)

---

## Troubleshooting

### Ball Flies Opposite Direction

**Symptom**: Swing left but ball goes right

**Cause**: X-axis inversion mismatch

**Fix**: Check that both inversions are present:
1. Sensor input negation in `tracking.js:303`
2. Velocity negation in `game-logic.js:443`

### Ball Doesn't Go Up

**Symptom**: Ball flies forward but stays on ground

**Cause**: Loft angle not being applied or Y-velocity inverted

**Checklist**:
- ✓ Beta (pitch) is negated in `tracking.js:301`
- ✓ Accel Y is negated in `tracking.js:304`
- ✓ Loft transformation applies when `vy < 0` in `game-logic.js:421-426`

### Hit Detection Not Working

**Symptom**: Swing through ball but no hit registered

**Debug Steps**:
1. Enable debug mode (show debug log)
2. Check "Motion detected" message appears
3. Check "Near!" messages when approaching ball
4. Verify `maxDistance > 0.15` in debug output

**Common Issues**:
- Swing too slow (increase swing speed or lower `minSwingSpeed`)
- Not completing backswing (move back >15cm before forward swing)
- Hit zone too small (increase `hitZoneDiameter` setting)

### Quaternion Drift

**Symptom**: Club tip position drifts over time

**Solutions**:
1. **Reduce tracking duration**: Motion-triggered tracking limits drift to 2 seconds max
2. **Enable magnetometer**: 9DOF mode prevents yaw drift
3. **Increase Madgwick beta**: Higher β reduces drift but increases noise

### Performance Issues

**Symptom**: Laggy sensor updates, choppy motion

**Optimizations**:
1. Reduce history length in `tracking.js:329-335`
2. Increase `dt` threshold in `tracking.js:238`
3. Throttle debug messages
4. Reduce canvas rendering complexity

---

## Code Structure Summary

### Module Responsibilities

| Module | Responsibility |
|--------|---------------|
| `sensors.js` | Raw IMU data collection |
| `tracking.js` | Sensor fusion, 3D position estimation |
| `game-logic.js` | Game state, hit detection, velocity calculation |
| `physics.js` | Ball flight simulation (gravity, drag, spin) |
| `renderer.js` | 3D visualization and UI rendering |
| `config.js` | Game settings and constants |
| `utils.js` | Helper functions (projection, debugging) |

### Key Data Structures

```javascript
// Orientation (quaternion)
{
    w: 1.0,    // Scalar component
    x: 0.0,    // X component
    y: 0.0,    // Y component
    z: 0.0     // Z component
}

// Club tip position
{
    x: 0.0,    // Left (-) / Right (+)
    y: 0.0,    // Down (-) / Up (+)
    z: 0.0     // Toward (-) / Away (+)
}

// Velocity
{
    x: 0.0,    // m/s
    y: 0.0,    // m/s
    z: 0.0     // m/s
}

// Spin
{
    x: 0.0,    // Backspin (rad/s)
    y: 0.0,    // Sidespin (rad/s)
    z: 0.0     // Rifle spin (rad/s)
}
```

---

## References

### Academic Papers

1. **Madgwick, S.O.H.** (2010). "An efficient orientation filter for inertial and inertial/magnetic sensor arrays"
   - Original Madgwick filter paper
   - https://www.x-io.co.uk/open-source-imu-and-ahrs-algorithms/

2. **Magnus Effect** - Explains why spinning balls curve
   - https://en.wikipedia.org/wiki/Magnus_effect

### Browser APIs

- [DeviceMotionEvent](https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent)
- [DeviceOrientationEvent](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent)

### Math Resources

- [Quaternion Rotation](https://www.euclideanspace.com/maths/algebra/realNormedAlgebra/quaternions/transforms/index.htm)
- [Sensor Fusion Overview](https://www.analog.com/en/analog-dialogue/articles/sensor-fusion.html)

---

## Appendix: Settings Reference

### Game Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `clubLength` | float | 1.0 m | Distance from grip to club tip |
| `clubWeight` | float | 200 g | Affects momentum transfer |
| `ballWeight` | float | 45.9 g | Standard golf ball weight |
| `ballDiameter` | float | 4.27 cm | Standard golf ball diameter |
| `loftAngle` | float | 30° | Club loft (driver ~10°, wedge ~60°) |
| `impactPower` | float | 2.0 | Game balance multiplier |
| `hitZoneDiameter` | float | 40 cm | Size of hit detection zone |
| `minSwingSpeed` | float | 15 m/s² | Minimum acceleration for hit |
| `swingTimeout` | float | 10 s | Time limit for swing |
| `spinEffect` | float | 5/10 | Spin influence on trajectory |

### Physics Constants

| Constant | Value | Source |
|----------|-------|--------|
| Gravity | 9.81 m/s² | Standard gravity |
| Air density | 1.225 kg/m³ | Sea level, 15°C |
| Drag coefficient | 0.47 | Sphere in air |

---

**Last Updated**: 2025-01-09
**Version**: 1.0.0
**Authors**: AirGolf Development Team
