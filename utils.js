// ============================================
// UTILITY FUNCTIONS
// ============================================
// Helper functions for 3D projection, debugging, and math utilities

import { camera, groundLinePercent, getCameraForAspectRatio } from './config.js';

// ============================================
// 3D PROJECTION
// ============================================

// Project 3D world coordinates to 2D screen coordinates
export function project3DToScreen(worldX, worldY, worldZ, canvas) {
    // Camera is behind the ball, looking forward (+Z direction)
    // worldZ increases as ball flies away

    // Get responsive camera settings based on screen aspect ratio
    const responsiveCamera = getCameraForAspectRatio(canvas.width, canvas.height);

    const cameraZ = -responsiveCamera.distance; // Camera is behind (0,0,0)
    const cameraY = responsiveCamera.height;

    // Relative to camera
    const relX = worldX;
    const relY = worldY - cameraY;
    const relZ = worldZ - cameraZ;

    // Prevent division by zero or negative Z (behind camera)
    if (relZ <= 0.1) {
        return { x: canvas.width / 2, y: canvas.height, scale: 0, visible: false };
    }

    // Simple perspective projection
    const perspective = 250 / relZ; // Reduced from 300 for less aggressive scaling

    const screenX = canvas.width / 2 + relX * perspective;

    // Ground is at groundLinePercent down the screen (responsive)
    const groundLine = canvas.height * responsiveCamera.groundLinePercent;
    const screenY = groundLine - relY * perspective;

    // Check if visible on screen
    const visible = screenX >= -50 && screenX <= canvas.width + 50 &&
                  screenY >= -50 && screenY <= canvas.height + 50;

    return { x: screenX, y: screenY, scale: perspective, visible: visible };
}

// ============================================
// DEBUG LOG SYSTEM
// ============================================

export const debugLog = {
    messages: [],
    maxMessages: 50,  // Keep more messages
    messageCount: 0   // Monotonic counter
};

export function addDebugMessage(message) {
    debugLog.messageCount++;
    const counter = debugLog.messageCount.toString().padStart(3, '0');
    debugLog.messages.push(`[${counter}] ${message}`);

    // Keep only last N messages
    if (debugLog.messages.length > debugLog.maxMessages) {
        debugLog.messages.shift();
    }
}
