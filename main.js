// ============================================
// MAIN ENTRY POINT
// ============================================
// Initialize all modules and start the game

import { defaultSettings } from './config.js';
import { loadFromLocalStorage, saveToLocalStorage } from './storage.js';
import { initRenderer, render, setRenderState, setRenderCallbacks } from './renderer.js';
import { initUI, updateStatus } from './ui.js';
import { addDebugMessage } from './utils.js';
import {
    getCurrentState,
    setCurrentState,
    setBallPosition,
    ballPosition,
    swingData,
    swingTimer,
    swingRecorder,
    lastShot,
    resetGame,
    setGameSettings,
    setUICallbacks,
    recordSwingMotion,
    checkSwingTimeout
} from './game-logic.js';
import { requestIMUPermission, setSensorCallbacks, imuData, imuPermissionGranted as getIMUPermissionGranted } from './sensors.js';
import { updateClubTipTracking } from './tracking.js';
import { updateBallPhysics } from './physics.js';

// ============================================
// INITIALIZATION
// ============================================

// Load settings and last shot from localStorage
const loaded = loadFromLocalStorage();
const settings = loaded.settings;
const loadedLastShot = loaded.lastShot;

// Copy loaded last shot to lastShot
Object.assign(lastShot, loadedLastShot);

// Initialize game settings
setGameSettings(settings);

// Get canvas and context
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Set canvas size
function resizeCanvas() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Get UI elements
const elements = {
    setBallBtn: document.getElementById('setBallBtn'),
    resetBtn: document.getElementById('resetBtn'),
    settingsBtn: document.getElementById('settingsBtn'),
    recordBtn: document.getElementById('recordBtn'),
    replayBtn: document.getElementById('replayBtn'),
    statusDiv: document.getElementById('status'),
    settingsModal: document.getElementById('settingsModal'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    cancelSettingsBtn: document.getElementById('cancelSettingsBtn'),
    settingsInputs: {
        clubLength: document.getElementById('clubLength'),
        clubWeight: document.getElementById('clubWeight'),
        loftAngle: document.getElementById('loftAngle'),
        ballDiameter: document.getElementById('ballDiameter'),
        ballWeight: document.getElementById('ballWeight'),
        hitZoneDiameter: document.getElementById('hitZoneDiameter'),
        minSwingSpeed: document.getElementById('minSwingSpeed'),
        swingTimeout: document.getElementById('swingTimeout'),
        targetMode: document.getElementById('targetMode'),
        targetDistance: document.getElementById('targetDistance'),
        gravity: document.getElementById('gravity'),
        airResistance: document.getElementById('airResistance'),
        impactPower: document.getElementById('impactPower'),
        spinEffect: document.getElementById('spinEffect'),
        showDebug: document.getElementById('showDebug'),
        soundEnabled: document.getElementById('soundEnabled'),
        soundVolume: document.getElementById('soundVolume')
    },
    canvas: canvas
};

// Initialize renderer
initRenderer(canvas);

// Set up game-logic UI callbacks
setUICallbacks({
    setBallBtn: elements.setBallBtn,
    replayBtn: elements.replayBtn,
    updateStatus: updateStatus
});

// Set up sensor callbacks
setSensorCallbacks({
    updateClubTipTracking: () => updateClubTipTracking(imuData, settings, ballPosition, swingRecorder),
    recordSwingMotion: recordSwingMotion,
    updateStatus: updateStatus,
    getCurrentState: getCurrentState,
    onIMUInitialized: () => {
        setCurrentState('ready_to_set_ball');
        elements.resetBtn.disabled = false;
    }
});

// Initialize UI with callbacks
initUI(elements, {
    resetGame: () => resetGame(getIMUPermissionGranted, updateStatus, elements.setBallBtn),
    requestIMUPermission: requestIMUPermission,
    setBallPosition: () => setBallPosition(settings, updateStatus, elements.setBallBtn),
    settings: settings,
    lastShot: lastShot
});

// Set render state
setRenderState({
    getCurrentState: getCurrentState,
    settings: settings,
    ballPosition: ballPosition,
    swingTimer: swingTimer,
    swingRecorder: swingRecorder,
    lastShot: lastShot
});

// Set render callbacks
setRenderCallbacks({
    checkSwingTimeout: checkSwingTimeout,  // Use game-logic.js function (handles timeout properly)
    updateBallPhysics: (deltaTime) => updateBallPhysics(
        deltaTime,
        settings,
        swingData,
        swingRecorder,
        lastShot,
        () => saveToLocalStorage(settings, lastShot),
        updateStatus,
        setCurrentState
    )
});

// Start render loop
requestAnimationFrame(render);

// ============================================
// iOS SHAKE-TO-UNDO FIX
// ============================================
// Prevent iOS shake-to-undo gesture from interfering with swing

// Blur any focused input when game starts to prevent shake-to-undo
document.addEventListener('focusin', (e) => {
    // Allow focus in settings modal
    if (!elements.settingsModal.classList.contains('active')) {
        setTimeout(() => e.target.blur(), 100);
    }
});

// Prevent gesture events that might trigger iOS controls
document.addEventListener('gesturestart', (e) => {
    e.preventDefault();
});

// Additional fix: ensure no input is focused when swinging
canvas.addEventListener('touchstart', () => {
    if (document.activeElement) {
        document.activeElement.blur();
    }
});

addDebugMessage('✅ Air Golf initialized successfully!');
