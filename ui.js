// ============================================
// UI MODULE
// ============================================
// UI management: buttons, settings modal, status updates

import { swingRecorder } from './game-logic.js';
import { saveToLocalStorage } from './storage.js';

// UI element references (will be set by main.js)
let setBallBtn = null;
let resetBtn = null;
let settingsBtn = null;
let recordBtn = null;
let replayBtn = null;
let statusDiv = null;
let settingsModal = null;
let saveSettingsBtn = null;
let cancelSettingsBtn = null;
let settingsInputs = null;
let canvas = null;

// Settings reference (will be set by main.js)
let settings = null;

// Callback references
let resetGameCallback = null;
let requestIMUPermissionCallback = null;
let setBallPositionCallback = null;

export function initUI(elements, callbacks) {
    // Store UI element references
    setBallBtn = elements.setBallBtn;
    resetBtn = elements.resetBtn;
    settingsBtn = elements.settingsBtn;
    recordBtn = elements.recordBtn;
    replayBtn = elements.replayBtn;
    statusDiv = elements.statusDiv;
    settingsModal = elements.settingsModal;
    saveSettingsBtn = elements.saveSettingsBtn;
    cancelSettingsBtn = elements.cancelSettingsBtn;
    settingsInputs = elements.settingsInputs;
    canvas = elements.canvas;
    
    // Store callbacks
    resetGameCallback = callbacks.resetGame;
    requestIMUPermissionCallback = callbacks.requestIMUPermission;
    setBallPositionCallback = callbacks.setBallPosition;
    settings = callbacks.settings;
    
    // Set up event listeners
    setupEventListeners();
}

function setupEventListeners() {
    // Set ball button
    setBallBtn.addEventListener('click', async function() {
        // First check if we need to request IMU permission
        const granted = await requestIMUPermissionCallback();
        if (granted) {
            setBallPositionCallback();
        }
    });
    
    // Reset button
    resetBtn.addEventListener('click', resetGameCallback);
    
    // Record button - toggle recording mode
    recordBtn.addEventListener('click', function() {
        swingRecorder.isRecording = !swingRecorder.isRecording;
        
        if (swingRecorder.isRecording) {
            recordBtn.textContent = '⏺️ Recording ON';
            recordBtn.style.background = '#ff4444';
            updateStatus('🎥 Recording mode ON - your next swing will be saved!');
        } else {
            recordBtn.textContent = '🎥 Record Swing';
            recordBtn.style.background = '';
            updateStatus('🎥 Recording mode OFF');
            // Cancel any in-progress recording
            if (swingRecorder.currentRecording) {
                swingRecorder.currentRecording = null;
            }
        }
    });
    
    // Replay button - show swing replay
    replayBtn.addEventListener('click', function() {
        if (swingRecorder.recordedSwings.length === 0) {
            updateStatus('⚠️ No recorded swings to replay!');
            return;
        }
        
        // If already in replay mode, cycle camera view
        if (swingRecorder.replayMode) {
            const views = ['perspective', 'top', 'front', 'left', 'right'];
            const currentIndex = views.indexOf(swingRecorder.cameraAngle);
            const nextIndex = (currentIndex + 1) % views.length;
            swingRecorder.cameraAngle = views[nextIndex];
            
            const viewNames = {
                'perspective': '📐 Perspective',
                'top': '⬇️ Top View',
                'front': '👁️ Front View',
                'left': '◀️ Left Side',
                'right': '▶️ Right Side'
            };
            updateStatus(`🔄 Camera: ${viewNames[swingRecorder.cameraAngle]}`);
            return;
        }
        
        // Start replay mode
        swingRecorder.replayMode = true;
        swingRecorder.replayProgress = 0;
        swingRecorder.replayIndex = swingRecorder.recordedSwings.length - 1; // Show most recent
        swingRecorder.cameraAngle = 'perspective'; // Reset to default view
        replayBtn.textContent = '🔄 Change View';
        replayBtn.style.background = '#4444ff';
        updateStatus(`▶️ Replaying swing ${swingRecorder.replayIndex + 1}/${swingRecorder.recordedSwings.length} | Tap 🔄 to change camera`);
    });
    
    // Stop replay when clicking canvas
    canvas.addEventListener('click', function(e) {
        if (swingRecorder.replayMode) {
            swingRecorder.replayMode = false;
            replayBtn.textContent = '▶️ Replay';
            replayBtn.style.background = '';
            updateStatus('⏹️ Replay stopped (tap Replay to start again)');
        }
    });
    
    // Settings modal
    settingsBtn.addEventListener('click', openSettings);
    saveSettingsBtn.addEventListener('click', saveSettings);
    cancelSettingsBtn.addEventListener('click', closeSettings);
    
    // Update range displays
    settingsInputs.minSwingSpeed.addEventListener('input', function() {
        document.getElementById('speedValue').textContent = parseFloat(this.value).toFixed(1);
    });
    settingsInputs.swingTimeout.addEventListener('input', function() {
        document.getElementById('timeoutValue').textContent = this.value;
    });
    settingsInputs.loftAngle.addEventListener('input', function() {
        document.getElementById('loftValue').textContent = this.value;
    });
    settingsInputs.airResistance.addEventListener('input', function() {
        document.getElementById('airResValue').textContent = parseFloat(this.value).toFixed(1);
    });
    settingsInputs.impactPower.addEventListener('input', function() {
        document.getElementById('impactPowerValue').textContent = parseFloat(this.value).toFixed(1);
    });
    settingsInputs.spinEffect.addEventListener('input', function() {
        document.getElementById('spinValue').textContent = this.value;
    });
    settingsInputs.soundVolume.addEventListener('input', function() {
        document.getElementById('volumeValue').textContent = this.value;
    });
    settingsInputs.targetDistance.addEventListener('input', function() {
        document.getElementById('targetDistValue').textContent = this.value;
    });

    // Close modal when clicking outside
    settingsModal.addEventListener('click', function(e) {
        if (e.target === settingsModal) {
            closeSettings();
        }
    });
}

function openSettings() {
    // Load current settings into inputs
    settingsInputs.clubLength.value = settings.clubLength;
    settingsInputs.clubWeight.value = settings.clubWeight;
    settingsInputs.loftAngle.value = settings.loftAngle;
    settingsInputs.ballDiameter.value = settings.ballDiameter;
    settingsInputs.ballWeight.value = settings.ballWeight;
    settingsInputs.hitZoneDiameter.value = settings.hitZoneDiameter;
    settingsInputs.minSwingSpeed.value = settings.minSwingSpeed;
    settingsInputs.swingTimeout.value = settings.swingTimeout;
    settingsInputs.gravity.value = settings.gravity;
    settingsInputs.airResistance.value = settings.airResistance;
    settingsInputs.impactPower.value = settings.impactPower;
    settingsInputs.spinEffect.value = settings.spinEffect;
    settingsInputs.showDebug.checked = settings.showDebug;
    settingsInputs.soundEnabled.checked = settings.soundEnabled;
    settingsInputs.soundVolume.value = settings.soundVolume;
    settingsInputs.targetMode.value = settings.targetMode;
    settingsInputs.targetDistance.value = settings.targetDistance;

    // Update range displays
    document.getElementById('speedValue').textContent = settings.minSwingSpeed.toFixed(1);
    document.getElementById('timeoutValue').textContent = settings.swingTimeout;
    document.getElementById('loftValue').textContent = settings.loftAngle;
    document.getElementById('airResValue').textContent = settings.airResistance.toFixed(1);
    document.getElementById('impactPowerValue').textContent = settings.impactPower.toFixed(1);
    document.getElementById('spinValue').textContent = settings.spinEffect;
    document.getElementById('volumeValue').textContent = settings.soundVolume;
    document.getElementById('targetDistValue').textContent = settings.targetDistance;

    settingsModal.classList.add('active');
}

function saveSettings() {
    // Save all settings
    settings.clubLength = parseFloat(settingsInputs.clubLength.value);
    settings.clubWeight = parseFloat(settingsInputs.clubWeight.value);
    settings.loftAngle = parseFloat(settingsInputs.loftAngle.value);
    settings.ballDiameter = parseFloat(settingsInputs.ballDiameter.value);
    settings.ballWeight = parseFloat(settingsInputs.ballWeight.value);
    settings.hitZoneDiameter = parseFloat(settingsInputs.hitZoneDiameter.value);
    settings.minSwingSpeed = parseFloat(settingsInputs.minSwingSpeed.value);
    settings.swingTimeout = parseFloat(settingsInputs.swingTimeout.value);
    settings.gravity = parseFloat(settingsInputs.gravity.value);
    settings.airResistance = parseFloat(settingsInputs.airResistance.value);
    settings.impactPower = parseFloat(settingsInputs.impactPower.value);
    settings.spinEffect = parseFloat(settingsInputs.spinEffect.value);
    settings.showDebug = settingsInputs.showDebug.checked;
    settings.soundEnabled = settingsInputs.soundEnabled.checked;
    settings.soundVolume = parseFloat(settingsInputs.soundVolume.value);
    settings.targetMode = settingsInputs.targetMode.value;
    settings.targetDistance = parseFloat(settingsInputs.targetDistance.value);

    // Save to localStorage (need to pass lastShot reference)
    saveToLocalStorage(settings, {}); // TODO: pass lastShot from main
    
    closeSettings();
    updateStatus('⚙️ Settings saved!');
}

function closeSettings() {
    settingsModal.classList.remove('active');
}

export function updateStatus(message) {
    statusDiv.textContent = message;
}

