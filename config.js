// ============================================
// CONFIGURATION & CONSTANTS
// ============================================
// This module contains all game configuration constants and default settings

// Game state enumeration
export const GameState = {
    WAITING_PERMISSION: 'waiting_permission',
    READY_TO_SET_BALL: 'ready_to_set_ball',
    BALL_SET_READY_TO_SWING: 'ball_set_ready_to_swing',
    SWINGING: 'swinging',
    BALL_FLYING: 'ball_flying',
    SHOWING_RESULTS: 'showing_results'
};

// Default game settings
export const defaultSettings = {
    clubLength: 1.2,        // meters
    clubWeight: 200,        // grams
    ballDiameter: 4.3,      // cm (regulation golf ball)
    ballWeight: 45.9,       // grams
    hitZoneDiameter: 30,    // cm (detection zone diameter)
    minSwingSpeed: 5.0,     // m/s²
    loftAngle: 25,          // degrees (club face angle - converts downward swing to upward launch)
    gravity: 9.81,          // m/s²
    airResistance: 0.5,     // factor 0-1
    impactPower: 1.5,       // Coefficient of restitution (club spring effect): 0.5-3.0, realistic is 1.4-1.6
    spinEffect: 5,          // 0-10: how much spin affects trajectory (Magnus effect)
    showDebug: false,       // Hidden by default to save space
    soundEnabled: true,
    soundVolume: 50,        // 0-100
    swingTimeout: 10,       // seconds until forced reset
    targetMode: 'random',   // 'fixed' or 'random'
    targetDistance: 50      // meters (used in fixed mode)
};

// Camera configuration for 3D projection
// COORDINATE SYSTEM:
// X-axis: Left (-) to Right (+)
// Y-axis: Down (-) to Up (+)
// Z-axis: Camera (-) to Fairway (+) - ball flies in +Z direction
export const camera = {
    distance: 4.0,  // Base distance - will be adjusted for aspect ratio
    height: 2.0,    // Base height - will be adjusted for aspect ratio
    fov: 60         // field of view in degrees
};

// Dynamic camera adjustment based on screen aspect ratio
export function getCameraForAspectRatio(width, height) {
    // Use window size, not canvas size, to detect portrait vs landscape
    const screenAspectRatio = window.innerWidth / window.innerHeight;
    const aspectRatio = screenAspectRatio;

    if (aspectRatio < 0.75) {
        // Portrait mobile (tall screen) - Move ground lower for better visibility
        return {
            distance: camera.distance * 0.65,  // Moderate distance (2.6m)
            height: camera.height * 0.35,      // Lower camera (0.7m)
            groundLinePercent: 0.55            // Ground at 55% down screen (closer to bottom)
        };
    } else if (aspectRatio < 1.0) {
        // Portrait tablet
        return {
            distance: camera.distance * 0.75,
            height: camera.height * 0.5,
            groundLinePercent: 0.60
        };
    } else {
        // Landscape / Desktop
        return {
            distance: camera.distance,
            height: camera.height,
            groundLinePercent: 0.70
        };
    }
}

// Ground rendering position (percentage down the screen)
// This will be overridden by getCameraForAspectRatio()
export const groundLinePercent = 0.60;
