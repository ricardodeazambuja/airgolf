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
    phoneOrientation: 'edge',   // 'screen' or 'edge' - which side is the club face
    clubLength: 1.2,        // meters
    clubWeight: 200,        // grams
    ballDiameter: 4.3,      // cm (regulation golf ball)
    ballWeight: 45.9,       // grams
    hitZoneDiameter: 30,    // cm (detection zone diameter)
    hitSensitivity: 15,     // degrees (deprecated - using distance now)
    minSwingSpeed: 5.0,     // m/s²
    loftAngle: 25,          // degrees (club face angle - converts downward swing to upward launch)
    gravity: 9.81,          // m/s²
    airResistance: 0.5,     // factor 0-1
    impactPower: 1.5,       // Coefficient of restitution (club spring effect): 0.5-3.0, realistic is 1.4-1.6
    spinEffect: 5,          // 0-10: how much spin affects trajectory (Magnus effect)
    showDebug: false,       // Hidden by default to save space
    soundEnabled: true,
    soundVolume: 50,        // 0-100
    swingTimeout: 10        // seconds until forced reset
};

// Camera configuration for 3D projection
// COORDINATE SYSTEM:
// X-axis: Left (-) to Right (+)
// Y-axis: Down (-) to Up (+)
// Z-axis: Camera (-) to Fairway (+) - ball flies in +Z direction
export const camera = {
    distance: 4.0,  // meters behind tee (farther for better view)
    height: 2.0,    // meters above ground (higher for better angle)
    fov: 60         // field of view in degrees
};

// Ground rendering position (percentage down the screen)
export const groundLinePercent = 0.70; // Ground at 70% down screen
