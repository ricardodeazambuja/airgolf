// ============================================
// PHYSICS MODULE
// ============================================
// Ball flight physics simulation: gravity, Magnus effect (spin), air resistance

import { GameState } from './config.js';
import { addDebugMessage } from './utils.js';
import { playLandSound } from './audio.js';
import { targetState } from './game-logic.js';

// ============================================
// BALL FLIGHT STATE
// ============================================
// Simulate ball trajectory after hit
export const ballFlight = {
    position: { x: 0, y: 0, z: 0 },     // 3D position in world space
    velocity: { x: 0, y: 0, z: 0 },     // Current velocity
    spin: { x: 0, y: 0, z: 0 },         // Spin rate (rad/s) - causes Magnus effect
    initialSpin: { x: 0, y: 0, z: 0 },  // Initial spin at launch (before decay)
    flying: false,
    startTime: 0,
    lastUpdateTime: 0,  // For per-frame delta time
    landingDistance: 0,
    maxHeight: 0,
    trajectory: []  // Store path for visualization
};

// ============================================
// BALL PHYSICS UPDATE
// ============================================
// Update ball position and velocity during flight
// Simulates:
// 1. Gravity (constant downward acceleration)
// 2. Magnus force (spin-induced curve)
// 3. Air resistance (drag)
// 4. Position update (velocity integration)
// 5. Ground collision detection

export function updateBallPhysics(deltaTime, settings, swingData, swingRecorder, lastShot, saveToLocalStorage, updateStatus, setCurrentState) {
    if (!ballFlight.flying) return;

    const dt = deltaTime / 1000; // Convert milliseconds to seconds

    // Skip huge time deltas (first frame or tab was inactive)
    // Large dt would cause physics instability (ball teleporting)
    if (dt > 0.1) {
        addDebugMessage(`Skip physics: dt=${dt.toFixed(2)}s too large`);
        return;
    }

    // ====================================================================
    // GRAVITY: Constant downward acceleration
    // ====================================================================
    const gravity = -settings.gravity; // m/s² (negative = downward)

    // Update velocity with gravity
    ballFlight.velocity.y += gravity * dt;  // m/s

    // ====================================================================
    // MAGNUS FORCE: Spin creates aerodynamic force perpendicular to motion
    // ====================================================================
    // Physics: Spinning ball drags air around it → pressure differential
    // Cross product ω × v gives force direction (right-hand rule)

    if (settings.spinEffect > 0 && ballFlight.spin) {
        const spinFactor = settings.spinEffect * 0.00001;

        // Cross product: ω × v
        // Spin is in rad/s, velocity is in m/s
        // Result is acceleration in m/s²
        const magnusX = spinFactor * (
            ballFlight.spin.y * ballFlight.velocity.z -
            ballFlight.spin.z * ballFlight.velocity.y
        );
        const magnusY = spinFactor * (
            ballFlight.spin.z * ballFlight.velocity.x -
            ballFlight.spin.x * ballFlight.velocity.z
        );
        const magnusZ = spinFactor * (
            ballFlight.spin.x * ballFlight.velocity.y -
            ballFlight.spin.y * ballFlight.velocity.x
        );

        // Apply Magnus acceleration to velocity
        if (isFinite(magnusX)) ballFlight.velocity.x += magnusX * dt;
        if (isFinite(magnusY)) ballFlight.velocity.y += magnusY * dt;
        if (isFinite(magnusZ)) ballFlight.velocity.z += magnusZ * dt;

        // Log Magnus effect in first 500ms
        const timeSinceLaunch = Date.now() - ballFlight.startTime;
        if (timeSinceLaunch < 500 && (magnusX !== 0 || magnusZ !== 0)) {
            addDebugMessage(`🌀 Magnus: X${magnusX > 0 ? '+' : ''}${magnusX.toFixed(2)} m/s²`);
        }

        // Spin decays due to air friction
        const spinDecay = 0.98; // Per frame
        ballFlight.spin.x *= spinDecay;
        ballFlight.spin.y *= spinDecay;
        ballFlight.spin.z *= spinDecay;
    }

    // ====================================================================
    // AIR RESISTANCE (Drag): Opposes motion, proportional to velocity²
    // ====================================================================

    if (settings.airResistance > 0) {
        const dragFactor = settings.airResistance * 0.01; // Scale factor

        // Apply drag to horizontal motion
        ballFlight.velocity.x *= (1 - dragFactor);
        ballFlight.velocity.z *= (1 - dragFactor);

        // Y-axis drag only when moving upward (asymmetric for realism)
        if (ballFlight.velocity.y > 0) {
            ballFlight.velocity.y *= (1 - dragFactor);
        }
    }

    // ====================================================================
    // POSITION UPDATE: Integrate velocity to get new position
    // ====================================================================

    ballFlight.position.x += ballFlight.velocity.x * dt;  // meters
    ballFlight.position.y += ballFlight.velocity.y * dt;  // meters
    ballFlight.position.z += ballFlight.velocity.z * dt;  // meters

    // Store trajectory point for visualization
    // Always store points to show the path
    ballFlight.trajectory.push({
        x: ballFlight.position.x,
        y: ballFlight.position.y,
        z: ballFlight.position.z
    });

    // Log first few updates for debugging
    const timeSinceLaunch = Date.now() - ballFlight.startTime;
    if (timeSinceLaunch < 200) {  // First 200ms
        const zDirection = ballFlight.position.z > 0 ? 'AWAY✓' : 'TOWARD⚠️';
        addDebugMessage(`Physics: z=${ballFlight.position.z.toFixed(2)}m ${zDirection}`);
    }

    // Track maximum height (for stats)
    if (ballFlight.position.y > ballFlight.maxHeight) {
        ballFlight.maxHeight = ballFlight.position.y;
    }

    // ====================================================================
    // GROUND COLLISION: Check if ball hit ground
    // ====================================================================

    if (ballFlight.position.y <= 0 && ballFlight.velocity.y < 0) {
        ballFlight.position.y = 0;
        ballFlight.flying = false;
        ballFlight.landingDistance = Math.sqrt(
            ballFlight.position.x ** 2 + ballFlight.position.z ** 2
        );

        addDebugMessage(`⛳ LANDED! ${ballFlight.landingDistance.toFixed(2)}m, h:${ballFlight.maxHeight.toFixed(2)}m`);

        // Update last recorded swing with final distance
        if (swingRecorder.recordedSwings.length > 0) {
            const lastSwing = swingRecorder.recordedSwings[swingRecorder.recordedSwings.length - 1];
            if (lastSwing.distance === 0) {
                lastSwing.distance = ballFlight.landingDistance;
                lastSwing.maxHeight = ballFlight.maxHeight;
            }
        }

        // Check if ball never left ground
        if (ballFlight.maxHeight < 0.01) {
            addDebugMessage(`⚠️ BUG: Ball never left ground! Check Y velocity at launch`);
        }

        // Play landing sound
        playLandSound(settings);

        // Calculate impact speed
        const impactSpeed = Math.sqrt(
            swingData.impactVelocity.x ** 2 +
            swingData.impactVelocity.y ** 2 +
            swingData.impactVelocity.z ** 2
        );

        // Calculate distance to target
        let targetAccuracy = null;
        if (targetState && targetState.active) {
            const dx = ballFlight.position.x - targetState.position.x;
            const dz = ballFlight.position.z - targetState.position.z;
            targetAccuracy = Math.sqrt(dx * dx + dz * dz);
        }

        // Save shot data
        lastShot.distance = ballFlight.landingDistance;
        lastShot.maxHeight = ballFlight.maxHeight;
        lastShot.impactSpeed = impactSpeed;
        lastShot.timestamp = new Date().toISOString();
        lastShot.velocity = { ...swingData.impactVelocity };
        lastShot.spin = { ...ballFlight.initialSpin };  // Use initial spin, not decayed
        lastShot.targetAccuracy = targetAccuracy;  // Distance from target

        saveToLocalStorage();

        setCurrentState(GameState.SHOWING_RESULTS);

        // Build status message with target accuracy
        let statusMsg = `⛳ Ball landed! Distance: ${ballFlight.landingDistance.toFixed(2)}m`;
        if (targetAccuracy !== null) {
            statusMsg += ` | Target: ${targetAccuracy.toFixed(2)}m away`;
        }
        updateStatus(statusMsg);
    }
}

// ============================================
// RESET BALL FLIGHT
// ============================================
export function resetBallFlight() {
    ballFlight.position = { x: 0, y: 0, z: 0 };
    ballFlight.velocity = { x: 0, y: 0, z: 0 };
    ballFlight.spin = { x: 0, y: 0, z: 0 };
    ballFlight.initialSpin = { x: 0, y: 0, z: 0 };
    ballFlight.flying = false;
    ballFlight.startTime = 0;
    ballFlight.lastUpdateTime = 0;
    ballFlight.landingDistance = 0;
    ballFlight.maxHeight = 0;
    ballFlight.trajectory = [];

    // Reset debug flags
    updateBallPhysics._nearGroundLogged = false;
}
