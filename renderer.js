// ============================================
// RENDERER MODULE - COMPLETE IMPLEMENTATION
// ============================================

import { GameState, groundLinePercent } from './config.js';
import { project3DToScreen, debugLog, addDebugMessage } from './utils.js';
import { clubTipTracking } from './tracking.js';
import { ballFlight } from './physics.js';
import { imuData, imuPermissionGranted } from './sensors.js';

// Canvas references
let canvas = null;
let ctx = null;
let lastRenderTime = 0;

// State references
let gameState = null;
let settings = null;
let ballPosition = null;
let swingTimer = null;
let swingRecorder = null;
let lastShot = null;

// Callbacks
let checkSwingTimeoutCallback = null;
let updateBallPhysicsCallback = null;

export function initRenderer(canvasElement) {
    canvas = canvasElement;
    ctx = canvas.getContext('2d');
}

export function setRenderState(state) {
    gameState = state.getCurrentState;
    settings = state.settings;
    ballPosition = state.ballPosition;
    swingTimer = state.swingTimer;
    swingRecorder = state.swingRecorder;
    lastShot = state.lastShot;
}

export function setRenderCallbacks(callbacks) {
    checkSwingTimeoutCallback = callbacks.checkSwingTimeout;
    updateBallPhysicsCallback = callbacks.updateBallPhysics;
}

export function render(timestamp) {
const deltaTime = timestamp - lastRenderTime;
lastRenderTime = timestamp;

// Clear canvas
ctx.fillStyle = '#87CEEB';
ctx.fillRect(0, 0, canvas.width, canvas.height);

// Draw ground
drawGround();

// Update and draw based on state
switch (gameState()) {
case GameState.READY_TO_SET_BALL:
drawClubPosition();
break;

case GameState.BALL_SET_READY_TO_SWING:
drawClubPosition();
// Show countdown and check timeout
drawCountdownTimer();
if (ballPosition.set) {
checkSwingTimeoutCallback();
}
break;

case GameState.SWINGING:
drawClubPosition();
drawSwingTrail();
break;

case GameState.BALL_FLYING:
updateBallPhysicsCallback(deltaTime);
drawBallTrajectory();
drawBall();
break;

case GameState.SHOWING_RESULTS:
drawBallTrajectory();
drawResults();
break;
}

// Draw debug info on canvas if enabled
drawDebugInfo();

// Draw swing replay if active
if (swingRecorder.replayMode) {
drawSwingReplay(deltaTime);
}

// Continue rendering loop
requestAnimationFrame(render);
}

export function drawSwingReplay(deltaTime) {
// Get the swing to replay
const swing = swingRecorder.recordedSwings[swingRecorder.replayIndex];
if (!swing || !swing.tipPath || swing.tipPath.length === 0) {
return;
}

// Update replay progress
swingRecorder.replayProgress += (deltaTime / 1000) * swingRecorder.replaySpeed;
const duration = (swing.endTime - swing.startTime) / 1000; // seconds

// Loop replay
if (swingRecorder.replayProgress >= duration) {
swingRecorder.replayProgress = 0;
}

// Calculate which frame to show
const frameIndex = Math.floor(
(swingRecorder.replayProgress / duration) * swing.tipPath.length
);

// ================================================================
// CALCULATE AUTOMATIC SCALE based on swing bounds
// ================================================================
// Find the min/max of the swing path in 3D space
let minX = Infinity, maxX = -Infinity;
let minY = Infinity, maxY = -Infinity;
let minZ = Infinity, maxZ = -Infinity;

swing.tipPath.forEach(point => {
minX = Math.min(minX, point.position.x);
maxX = Math.max(maxX, point.position.x);
minY = Math.min(minY, point.position.y);
maxY = Math.max(maxY, point.position.y);
minZ = Math.min(minZ, point.position.z);
maxZ = Math.max(maxZ, point.position.z);
});

// Include ball position (0,0,0) in bounds
minX = Math.min(minX, 0);
maxX = Math.max(maxX, 0);
minY = Math.min(minY, 0);
maxY = Math.max(maxY, 0);
minZ = Math.min(minZ, 0);
maxZ = Math.max(maxZ, 0);

// Calculate range for each axis
const rangeX = maxX - minX;
const rangeY = maxY - minY;
const rangeZ = maxZ - minZ;

// ================================================================
// LARGER REPLAY OVERLAY - 80% of screen for better visibility
// ================================================================
const margin = canvas.width * 0.1;
const overlayX = margin;
const overlayY = canvas.height * 0.1;
const overlayW = canvas.width - (margin * 2);  // 80% width
const overlayH = canvas.height * 0.75;          // 75% height

// Available drawing area (leave space for header and controls)
const drawAreaW = overlayW - 40;
const drawAreaH = overlayH - 180;  // Space for header, stats, progress bar

// Calculate scale based on current camera view
// We want the swing to fit within the drawing area with some padding
const padding = 0.85;  // Use 85% of available space (15% padding)
let autoScale;

switch(swingRecorder.cameraAngle) {
case 'top':
// Top view shows X and Z
const topRangeMax = Math.max(rangeX, rangeZ);
autoScale = topRangeMax > 0 ? (Math.min(drawAreaW, drawAreaH) * padding) / topRangeMax : 200;
break;

case 'front':
// Front view shows X and Y
const frontRangeMax = Math.max(rangeX, rangeY);
autoScale = frontRangeMax > 0 ? (Math.min(drawAreaW, drawAreaH) * padding) / frontRangeMax : 200;
break;

case 'left':
case 'right':
// Side views show Z and Y
const sideRangeMax = Math.max(rangeZ, rangeY);
autoScale = sideRangeMax > 0 ? (Math.min(drawAreaW, drawAreaH) * padding) / sideRangeMax : 200;
break;

case 'perspective':
default:
// Perspective needs to consider all three dimensions
// Use the projection dimensions to calculate scale
const perspRangeW = rangeX + rangeZ * 0.5;  // X affected by Z in perspective
const perspRangeH = rangeY + rangeZ * 0.3;  // Y affected by Z in perspective
const perspMaxW = perspRangeW > 0 ? drawAreaW * padding / perspRangeW : 200;
const perspMaxH = perspRangeH > 0 ? drawAreaH * padding / perspRangeH : 200;
autoScale = Math.min(perspMaxW, perspMaxH);
break;
}

// Ensure scale is reasonable (not too small or too large)
autoScale = Math.max(50, Math.min(autoScale, 500));

// Calculate center offset to center the swing in the view
let offsetX = 0, offsetY = 0;

switch(swingRecorder.cameraAngle) {
case 'top':
offsetX = -(minX + maxX) / 2;
offsetY = -(minZ + maxZ) / 2;
break;
case 'front':
offsetX = -(minX + maxX) / 2;
offsetY = -(minY + maxY) / 2;
break;
case 'left':
offsetX = -(minZ + maxZ) / 2;
offsetY = -(minY + maxY) / 2;
break;
case 'right':
offsetX = -(minZ + maxZ) / 2;
offsetY = -(minY + maxY) / 2;
break;
case 'perspective':
const perspCenterX = (minX + maxX) / 2;
const perspCenterZ = (minZ + maxZ) / 2;
const perspCenterY = (minY + maxY) / 2;
offsetX = -(perspCenterX - perspCenterZ * 0.5);
offsetY = -(perspCenterY + perspCenterZ * 0.3);
break;
}

// Background with slight transparency to see game behind
ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
ctx.fillRect(overlayX, overlayY, overlayW, overlayH);

// Border
ctx.strokeStyle = '#ffff00';
ctx.lineWidth = 3;
ctx.strokeRect(overlayX, overlayY, overlayW, overlayH);

// ================================================================
// HEADER: Title and stats
// ================================================================
ctx.fillStyle = '#ffff00';
ctx.font = 'bold 24px Arial';
ctx.textAlign = 'left';
ctx.fillText(`📼 Replay ${swingRecorder.replayIndex + 1}/${swingRecorder.recordedSwings.length}`, overlayX + 20, overlayY + 35);

// Camera view indicator
ctx.font = 'bold 18px Arial';
ctx.fillStyle = '#00ffff';
const viewNames = {
'perspective': '📐 Perspective',
'top': '⬇️ Top View',
'front': '👁️ Front View',
'left': '◀️ Left Side',
'right': '▶️ Right Side'
};
ctx.fillText(viewNames[swingRecorder.cameraAngle], overlayX + 20, overlayY + 65);

// Swing stats
ctx.font = '16px Arial';
ctx.fillStyle = 'white';
ctx.fillText(`Distance: ${swing.distance ? swing.distance.toFixed(1) + 'm' : 'N/A'}`, overlayX + overlayW - 200, overlayY + 35);
ctx.fillText(`Height: ${swing.maxHeight ? swing.maxHeight.toFixed(1) + 'm' : 'N/A'}`, overlayX + overlayW - 200, overlayY + 60);

// Scale info (debug)
ctx.font = '12px Arial';
ctx.fillStyle = '#888';
ctx.fillText(`Scale: ${autoScale.toFixed(0)}`, overlayX + overlayW - 200, overlayY + 85);

// ================================================================
// 3D SWING VISUALIZATION with camera projections
// ================================================================
const viewX = overlayX + overlayW / 2;
const viewY = overlayY + 140 + drawAreaH / 2;  // Centered in drawing area

// Draw coordinate axes for reference
drawAxes(viewX, viewY, autoScale * 0.6, swingRecorder.cameraAngle);

// Project 3D swing path to 2D based on camera angle
ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
ctx.lineWidth = 3;
ctx.beginPath();

swing.tipPath.forEach((point, i) => {
const projected = projectPoint(point.position, swingRecorder.cameraAngle, autoScale, offsetX, offsetY);
const screenX = viewX + projected.x;
const screenY = viewY + projected.y;

if (i === 0) {
ctx.moveTo(screenX, screenY);
} else {
ctx.lineTo(screenX, screenY);
}
});
ctx.stroke();

// Draw trail with fading effect
if (frameIndex >= 5) {
ctx.strokeStyle = 'rgba(0, 255, 255, 0.6)';
ctx.lineWidth = 4;
ctx.beginPath();

for (let i = Math.max(0, frameIndex - 15); i < frameIndex; i++) {
const point = swing.tipPath[i];
const projected = projectPoint(point.position, swingRecorder.cameraAngle, autoScale, offsetX, offsetY);
const screenX = viewX + projected.x;
const screenY = viewY + projected.y;

if (i === Math.max(0, frameIndex - 15)) {
ctx.moveTo(screenX, screenY);
} else {
ctx.lineTo(screenX, screenY);
}
}
ctx.stroke();
}

// ================================================================
// Current position (highlighted)
// ================================================================
if (frameIndex < swing.tipPath.length) {
const currentPoint = swing.tipPath[frameIndex];
const projected = projectPoint(currentPoint.position, swingRecorder.cameraAngle, autoScale, offsetX, offsetY);
const curX = viewX + projected.x;
const curY = viewY + projected.y;

// Ball position (at origin)
const ballProj = projectPoint({x: 0, y: 0, z: 0}, swingRecorder.cameraAngle, autoScale, offsetX, offsetY);
const ballX = viewX + ballProj.x;
const ballY = viewY + ballProj.y;

// Draw ball
ctx.fillStyle = 'white';
ctx.strokeStyle = 'yellow';
ctx.lineWidth = 3;
ctx.beginPath();
ctx.arc(ballX, ballY, 10, 0, Math.PI * 2);
ctx.fill();
ctx.stroke();

// Draw club tip
ctx.fillStyle = 'lime';
ctx.strokeStyle = 'white';
ctx.lineWidth = 2;
ctx.beginPath();
ctx.arc(curX, curY, 12, 0, Math.PI * 2);
ctx.fill();
ctx.stroke();

// Line from club to ball
ctx.strokeStyle = 'rgba(0, 255, 0, 0.6)';
ctx.lineWidth = 3;
ctx.beginPath();
ctx.moveTo(ballX, ballY);
ctx.lineTo(curX, curY);
ctx.stroke();

// Show velocity vector
if (currentPoint.velocity) {
const velEnd = {
x: currentPoint.position.x + currentPoint.velocity.x * 0.05,
y: currentPoint.position.y + currentPoint.velocity.y * 0.05,
z: currentPoint.position.z + currentPoint.velocity.z * 0.05
};
const velProj = projectPoint(velEnd, swingRecorder.cameraAngle, autoScale, offsetX, offsetY);
const velX = viewX + velProj.x;
const velY = viewY + velProj.y;

// Velocity arrow
ctx.strokeStyle = 'rgba(255, 0, 255, 0.8)';
ctx.lineWidth = 3;
ctx.beginPath();
ctx.moveTo(curX, curY);
ctx.lineTo(velX, velY);
ctx.stroke();

// Arrowhead
const angle = Math.atan2(velY - curY, velX - curX);
ctx.fillStyle = 'rgba(255, 0, 255, 0.8)';
ctx.beginPath();
ctx.moveTo(velX, velY);
ctx.lineTo(velX - 10 * Math.cos(angle - Math.PI/6), velY - 10 * Math.sin(angle - Math.PI/6));
ctx.lineTo(velX - 10 * Math.cos(angle + Math.PI/6), velY - 10 * Math.sin(angle + Math.PI/6));
ctx.closePath();
ctx.fill();
}
}

// ================================================================
// PROGRESS BAR
// ================================================================
const barX = overlayX + 20;
const barY = overlayY + overlayH - 40;
const barW = overlayW - 40;
const barH = 10;

ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
ctx.fillRect(barX, barY, barW, barH);

ctx.fillStyle = '#4CAF50';
ctx.fillRect(barX, barY, barW * (swingRecorder.replayProgress / duration), barH);

// Progress text
ctx.fillStyle = 'white';
ctx.font = '12px Arial';
ctx.textAlign = 'center';
ctx.fillText(`${(swingRecorder.replayProgress).toFixed(1)}s / ${duration.toFixed(1)}s`, overlayX + overlayW / 2, barY - 5);

// ================================================================
// CONTROLS
// ================================================================
ctx.fillStyle = '#aaa';
ctx.font = 'bold 14px Arial';
ctx.textAlign = 'left';
ctx.fillText('⏹️ Stop', overlayX + 20, overlayY + overlayH - 10);

ctx.textAlign = 'right';
ctx.fillText('🔄 Change View (tap replay button)', overlayX + overlayW - 20, overlayY + overlayH - 10);
}

// ================================================================
// Helper: Project 3D point to 2D based on camera angle
// ================================================================
export function projectPoint(point, cameraAngle, scale, offsetX = 0, offsetY = 0) {
let x, y;

// Apply centering offset
const px = point.x + offsetX;
const py = point.y + offsetY;
const pz = point.z;

switch(cameraAngle) {
case 'top':
// Looking down from above (bird's eye)
x = px * scale;
y = -pz * scale;  // Z goes down in screen space
break;

case 'front':
// Looking at golfer from front
x = px * scale;
y = -py * scale;  // Y goes up
break;

case 'left':
// Looking from left side
x = pz * scale;
y = -py * scale;
break;

case 'right':
// Looking from right side
x = -pz * scale;
y = -py * scale;
break;

case 'perspective':
default:
// 3D perspective view (default)
// Isometric-style projection
x = (px - pz * 0.5) * scale;
y = (-py - pz * 0.3) * scale;
break;
}

return { x, y };
}

// ================================================================
// Helper: Draw coordinate axes for reference
// ================================================================
export function drawAxes(centerX, centerY, length, cameraAngle) {
const axes = [
{ dir: {x: 1, y: 0, z: 0}, color: '#ff4444', label: 'X' },  // Red
{ dir: {x: 0, y: 1, z: 0}, color: '#44ff44', label: 'Y' },  // Green
{ dir: {x: 0, y: 0, z: 1}, color: '#4444ff', label: 'Z' }   // Blue
];

ctx.lineWidth = 2;
ctx.font = 'bold 14px Arial';

axes.forEach(axis => {
const start = projectPoint({x: 0, y: 0, z: 0}, cameraAngle, length);
const end = projectPoint({
x: axis.dir.x * 1,
y: axis.dir.y * 1,
z: axis.dir.z * 1
}, cameraAngle, length);

ctx.strokeStyle = axis.color;
ctx.beginPath();
ctx.moveTo(centerX + start.x, centerY + start.y);
ctx.lineTo(centerX + end.x, centerY + end.y);
ctx.stroke();

// Label
ctx.fillStyle = axis.color;
ctx.textAlign = 'center';
ctx.fillText(axis.label, centerX + end.x, centerY + end.y - 5);
});
}

export function drawGround() {
// Draw perspective fairway looking down the course
const groundLine = canvas.height * groundLinePercent;

// Sky
const gradient = ctx.createLinearGradient(0, 0, 0, groundLine);
gradient.addColorStop(0, '#87CEEB');
gradient.addColorStop(1, '#B0E0E6');
ctx.fillStyle = gradient;
ctx.fillRect(0, 0, canvas.width, groundLine);

// Ground/fairway
ctx.fillStyle = '#90EE90';
ctx.fillRect(0, groundLine, canvas.width, canvas.height - groundLine);

// Draw perspective grid to show depth
ctx.strokeStyle = 'rgba(0, 100, 0, 0.3)';
ctx.lineWidth = 1;

// Horizontal lines (distance markers) - draw from near to far
for (let z = 0; z <= 100; z += 10) {
// Left and right edges of fairway
const leftPos = project3DToScreen(-5, 0, z, canvas);
const rightPos = project3DToScreen(5, 0, z, canvas);

if (leftPos.visible && rightPos.visible) {
ctx.beginPath();
ctx.moveTo(leftPos.x, leftPos.y);
ctx.lineTo(rightPos.x, rightPos.y);
ctx.stroke();
}
}

// Vertical lines (fairway edges)
ctx.strokeStyle = 'rgba(0, 100, 0, 0.5)';
ctx.lineWidth = 2;

// Left edge
const nearLeft = project3DToScreen(-5, 0, 0, canvas);
const farLeft = project3DToScreen(-5, 0, 100, canvas);
if (nearLeft.visible || farLeft.visible) {
ctx.beginPath();
ctx.moveTo(nearLeft.x, nearLeft.y);
ctx.lineTo(farLeft.x, farLeft.y);
ctx.stroke();
}

// Right edge
const nearRight = project3DToScreen(5, 0, 0, canvas);
const farRight = project3DToScreen(5, 0, 100, canvas);
if (nearRight.visible || farRight.visible) {
ctx.beginPath();
ctx.moveTo(nearRight.x, nearRight.y);
ctx.lineTo(farRight.x, farRight.y);
ctx.stroke();
}

// Center line
ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
ctx.lineWidth = 1;
ctx.setLineDash([5, 5]);
const nearCenter = project3DToScreen(0, 0, 0, canvas);
const farCenter = project3DToScreen(0, 0, 100, canvas);
if (nearCenter.visible || farCenter.visible) {
ctx.beginPath();
ctx.moveTo(nearCenter.x, nearCenter.y);
ctx.lineTo(farCenter.x, farCenter.y);
ctx.stroke();
}
ctx.setLineDash([]);
}

export function drawClubPosition() {
// TODO: Visualize current club position/orientation
const x = canvas.width / 2;
const y = canvas.height / 2;

// If no IMU permission yet, show instruction
if (!imuPermissionGranted) {
ctx.fillStyle = 'white';
ctx.font = 'bold 28px Arial';
ctx.textAlign = 'center';
ctx.fillText('🏌️ Air Golf', x, y - 90);

ctx.font = '18px Arial';
ctx.fillStyle = '#ffdd00';
ctx.fillText('Hold phone like a golf club', x, y - 45);

ctx.font = '14px Arial';
ctx.fillStyle = '#aaa';
ctx.fillText('(Grip it naturally - edge or screen as club face)', x, y - 20);

ctx.font = 'bold 20px Arial';
ctx.fillStyle = '#4CAF50';
ctx.fillText('↓ Tap "Tee Up" below ↓', x, y + 20);

ctx.font = '12px Arial';
ctx.fillStyle = '#999';
ctx.fillText('Adjust "Phone Orientation" in Settings if needed', x, y + 45);

ctx.font = 'bold 11px Arial';
ctx.fillStyle = '#ff6666';
ctx.fillText('⚠️ We take no responsibility for broken phones! 😅🏌️', x, y + 65);
return;
}

// Show ball position indicator if ball is set
if (ballPosition.set) {
// Draw tee position (ball at origin in 3D space)
const teePos = project3DToScreen(0, 0, 0, canvas);

if (teePos.visible) {
const ballRadius = Math.max(8, settings.ballDiameter * teePos.scale * 0.3);

// Draw hit zone (detection area)
const hitZoneRadius = Math.max(30, settings.hitZoneDiameter * teePos.scale * 0.6);
ctx.fillStyle = 'rgba(255, 255, 0, 0.1)';
ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
ctx.lineWidth = 2;
ctx.beginPath();
ctx.arc(teePos.x, teePos.y, hitZoneRadius, 0, Math.PI * 2);
ctx.fill();
ctx.stroke();

// Draw club tip position indicator
const clubTipPos = project3DToScreen(
clubTipTracking.tipPosition.x,
clubTipTracking.tipPosition.y,
clubTipTracking.tipPosition.z,
canvas
);

if (clubTipPos.visible) {
const tipDist = Math.sqrt(
clubTipTracking.tipPosition.x ** 2 +
clubTipTracking.tipPosition.y ** 2 +
clubTipTracking.tipPosition.z ** 2
);

// Color based on distance from ball
let tipColor = 'yellow';
if (tipDist < settings.hitZoneDiameter / 200) {
tipColor = 'lime'; // In hit zone!
} else if (tipDist > 0.5) {
tipColor = 'red'; // Too far
}

// Draw club tip dot
ctx.fillStyle = tipColor;
ctx.strokeStyle = 'black';
ctx.lineWidth = 2;
ctx.beginPath();
ctx.arc(clubTipPos.x, clubTipPos.y, 6, 0, Math.PI * 2);
ctx.fill();
ctx.stroke();

// Draw line from ball to club tip
ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
ctx.lineWidth = 1;
ctx.setLineDash([2, 2]);
ctx.beginPath();
ctx.moveTo(teePos.x, teePos.y);
ctx.lineTo(clubTipPos.x, clubTipPos.y);
ctx.stroke();
ctx.setLineDash([]);
}

// Draw tee marker
ctx.fillStyle = 'rgba(139, 69, 19, 0.8)';
const teeHeight = Math.max(10, 15 * teePos.scale / 100);
ctx.fillRect(teePos.x - 1, teePos.y - teeHeight, 2, teeHeight);

// Draw ball glow
ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
ctx.beginPath();
ctx.arc(teePos.x, teePos.y - teeHeight, ballRadius * 1.3, 0, Math.PI * 2);
ctx.fill();

// Draw ball
ctx.fillStyle = 'white';
ctx.strokeStyle = 'black';
ctx.lineWidth = 2;
ctx.beginPath();
ctx.arc(teePos.x, teePos.y - teeHeight, ballRadius, 0, Math.PI * 2);
ctx.fill();
ctx.stroke();

// Text above ball
ctx.fillStyle = 'yellow';
ctx.font = 'bold 20px Arial';
ctx.textAlign = 'center';
ctx.shadowColor = 'black';
ctx.shadowBlur = 4;
ctx.fillText('READY', teePos.x, teePos.y - teeHeight - ballRadius - 25);
ctx.fillText('Swing!', teePos.x, teePos.y - teeHeight - ballRadius - 5);
ctx.shadowBlur = 0;
} else {
// Fallback if projection fails - draw in center
const centerX = canvas.width / 2;
const centerY = canvas.height * 0.8;

ctx.fillStyle = 'white';
ctx.strokeStyle = 'black';
ctx.lineWidth = 2;
ctx.beginPath();
ctx.arc(centerX, centerY, 10, 0, Math.PI * 2);
ctx.fill();
ctx.stroke();

ctx.fillStyle = 'yellow';
ctx.font = 'bold 20px Arial';
ctx.textAlign = 'center';
ctx.fillText('READY - Swing!', centerX, centerY - 30);
}
}

// Show orientation values
ctx.fillStyle = 'white';
ctx.font = '18px Arial';
ctx.textAlign = 'center';
ctx.fillText(`α:${imuData.orientation.alpha.toFixed(0)}°`, x, y);
ctx.fillText(`β:${imuData.orientation.beta.toFixed(0)}°`, x, y + 25);
ctx.fillText(`γ:${imuData.orientation.gamma.toFixed(0)}°`, x, y + 50);
}

export function drawCountdownTimer() {
// Show countdown timer
if (swingTimer.timeRemaining > 0) {
const centerX = canvas.width / 2;
const timerY = 120;

// Determine color based on time remaining
let timerColor = '#4CAF50'; // Green
if (swingTimer.timeRemaining <= 3) {
timerColor = '#ff4444'; // Red - urgent!
} else if (swingTimer.timeRemaining <= 5) {
timerColor = '#ffaa00'; // Orange - warning
}

// Draw timer background
ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
ctx.fillRect(centerX - 80, timerY - 30, 160, 50);

// Draw timer text
ctx.fillStyle = timerColor;
ctx.font = 'bold 32px Arial';
ctx.textAlign = 'center';
ctx.fillText(Math.ceil(swingTimer.timeRemaining) + 's', centerX, timerY + 5);

// Flash warning when low
if (swingTimer.timeRemaining <= 3 && Math.floor(swingTimer.timeRemaining * 2) % 2 === 0) {
ctx.fillStyle = 'rgba(255, 68, 68, 0.3)';
ctx.fillRect(0, 0, canvas.width, canvas.height);
}
}
}

export function drawSwingTrail() {
// TODO: Draw visual trail showing swing path
// Use swingData.recordedMotion to visualize swing

// Show countdown timer
drawCountdownTimer();

// Show swing power meter
const totalAccel = Math.sqrt(
imuData.acceleration.x ** 2 +
imuData.acceleration.y ** 2 +
imuData.acceleration.z ** 2
);

const meterWidth = canvas.width * 0.8;
const meterHeight = 40;
const meterX = canvas.width * 0.1;
const meterY = 200;

// Background
ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
ctx.fillRect(meterX, meterY, meterWidth, meterHeight);

// Power bar
const powerPercent = Math.min(totalAccel / 20, 1); // Scale to 20 m/s²
ctx.fillStyle = powerPercent > 0.7 ? '#ff4444' : powerPercent > 0.4 ? '#ffaa00' : '#44ff44';
ctx.fillRect(meterX, meterY, meterWidth * powerPercent, meterHeight);

// Label
ctx.fillStyle = 'white';
ctx.font = 'bold 20px Arial';
ctx.textAlign = 'center';
ctx.fillText('SWING POWER', canvas.width / 2, meterY - 10);
ctx.fillText(totalAccel.toFixed(1) + ' m/s²', canvas.width / 2, meterY + 28);

// Draw club tip trail
if (clubTipTracking.history.length > 1) {
const centerX = canvas.width / 2;
// Center of green area (same as ball position)
const groundTop = canvas.height * 0.7;
const centerY = groundTop + (canvas.height - groundTop) / 2;
const scale = 100; // Scale factor for visualization

ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
ctx.lineWidth = 3;
ctx.beginPath();

clubTipTracking.history.forEach((point, i) => {
const screenX = centerX + point.position.x * scale;
const screenY = centerY - point.position.y * scale;

if (i === 0) {
ctx.moveTo(screenX, screenY);
} else {
ctx.lineTo(screenX, screenY);
}
});

ctx.stroke();

// Draw current club tip position
if (clubTipTracking.history.length > 0) {
const current = clubTipTracking.history[clubTipTracking.history.length - 1];
const tipX = centerX + current.position.x * scale;
const tipY = centerY - current.position.y * scale;

ctx.fillStyle = '#ffff00';
ctx.beginPath();
ctx.arc(tipX, tipY, 8, 0, Math.PI * 2);
ctx.fill();
ctx.strokeStyle = '#ff0000';
ctx.lineWidth = 2;
ctx.stroke();
}
}
}

export function drawBall() {
// Draw ball in 3D space with perspective projection
const pos = project3DToScreen(
ballFlight.position.x,
ballFlight.position.y,
ballFlight.position.z,
canvas
);

// Debug: log ball position for first few frames
const timeSinceLaunch = Date.now() - ballFlight.startTime;
if (timeSinceLaunch < 500) {
const growing = pos.scale > 100; // Scale increases as ball comes closer
const direction = growing ? '→YOU⚠️' : '→AWAY✓';
addDebugMessage(`Ball: z=${ballFlight.position.z.toFixed(1)}m ${direction}`);
}

// Only draw if ball is visible
if (!pos.visible) return;

// Ball gets smaller with distance (perspective)
const ballRadius = Math.max(3, settings.ballDiameter * pos.scale * 0.3);

// Shadow on ground
const shadowPos = project3DToScreen(
ballFlight.position.x,
0, // on ground
ballFlight.position.z,
canvas
);

if (shadowPos.visible) {
ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
ctx.beginPath();
const shadowRadius = Math.max(2, settings.ballDiameter * shadowPos.scale * 0.25);
ctx.ellipse(shadowPos.x, shadowPos.y, shadowRadius, shadowRadius * 0.5, 0, 0, Math.PI * 2);
ctx.fill();
}

// Ball
ctx.fillStyle = 'white';
ctx.beginPath();
ctx.arc(pos.x, pos.y, ballRadius, 0, Math.PI * 2);
ctx.fill();
ctx.strokeStyle = 'black';
ctx.lineWidth = Math.max(1, ballRadius * 0.1);
ctx.stroke();

// Distance indicator
ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
ctx.font = `${Math.max(10, 12 * pos.scale / 100)}px Arial`;
ctx.textAlign = 'center';
const dist = Math.sqrt(
ballFlight.position.x ** 2 +
ballFlight.position.z ** 2
);
ctx.fillText(`${dist.toFixed(1)}m`, pos.x, pos.y - ballRadius - 5);

// Spin curve indicator
if (settings.spinEffect > 0 && ballFlight.spin) {
const sidespin = ballFlight.spin.y;
if (Math.abs(sidespin) > 20) {
// Draw curve arrow
const arrowY = pos.y + ballRadius + 15;
ctx.strokeStyle = sidespin > 0 ? '#ff4444' : '#4444ff';
ctx.lineWidth = 2;
ctx.beginPath();

if (sidespin > 0) {
// Slice (curving right)
ctx.moveTo(pos.x - 15, arrowY);
ctx.quadraticCurveTo(pos.x, arrowY - 5, pos.x + 15, arrowY);
ctx.fillText('→', pos.x + 20, arrowY + 5);
} else {
// Hook (curving left)
ctx.moveTo(pos.x + 15, arrowY);
ctx.quadraticCurveTo(pos.x, arrowY - 5, pos.x - 15, arrowY);
ctx.fillText('←', pos.x - 20, arrowY + 5);
}
ctx.stroke();
}
}
}

export function drawBallTrajectory() {
// Draw the ball's flight path in 3D perspective
if (ballFlight.trajectory.length < 2) return;

ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
ctx.lineWidth = 2;
ctx.setLineDash([5, 5]);

ctx.beginPath();
let hasStarted = false;

for (let i = 0; i < ballFlight.trajectory.length; i++) {
const point = ballFlight.trajectory[i];
const pos = project3DToScreen(point.x, point.y, point.z, canvas);

if (pos.visible) {
if (!hasStarted) {
ctx.moveTo(pos.x, pos.y);
hasStarted = true;
} else {
ctx.lineTo(pos.x, pos.y);
}
}
}

if (hasStarted) {
ctx.stroke();
}
ctx.setLineDash([]);  // Reset to solid
}

export function drawResults() {
// TODO: Show final statistics
// - Total distance
// - Max height
// - Swing speed
// - Swing visualization

const centerX = canvas.width / 2;
const centerY = canvas.height / 2;

ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
ctx.fillRect(centerX - 160, centerY - 160, 320, 320);

ctx.fillStyle = 'white';
ctx.font = 'bold 28px Arial';
ctx.textAlign = 'center';
ctx.fillText('Shot Complete! 🏌️', centerX, centerY - 120);

ctx.font = '20px Arial';
ctx.fillText(`Distance: ${ballFlight.landingDistance.toFixed(2)}m`, centerX, centerY - 80);
ctx.fillText(`Max Height: ${ballFlight.maxHeight.toFixed(2)}m`, centerX, centerY - 50);

if (lastShot.impactSpeed) {
ctx.fillText(`Impact Speed: ${lastShot.impactSpeed.toFixed(1)}m/s`, centerX, centerY - 20);
}

// Show velocity components for debugging
ctx.font = '14px Arial';
ctx.fillStyle = '#ffff00';
ctx.fillText(`Launch velocity:`, centerX, centerY + 10);
ctx.font = '16px monospace';
ctx.fillText(`X:${ballFlight.velocity.x.toFixed(1)} Y:${ballFlight.velocity.y.toFixed(1)} Z:${ballFlight.velocity.z.toFixed(1)}`, centerX, centerY + 30);

// Show spin information
if (lastShot.spin) {
ctx.font = '14px Arial';
ctx.fillStyle = '#00ffff';
const sidespin = lastShot.spin.y;
let spinText = 'Straight';
if (Math.abs(sidespin) > 50) {
if (sidespin > 0) {
spinText = `SLICE →`;
} else {
spinText = `← HOOK`;
}
} else if (Math.abs(sidespin) > 20) {
if (sidespin > 0) {
spinText = `Fade →`;
} else {
spinText = `← Draw`;
}
}
ctx.fillText(`Shot Shape: ${spinText}`, centerX, centerY + 50);
}

ctx.font = '12px Arial';
ctx.fillStyle = '#aaa';
ctx.fillText(`(Enable Debug to see detailed logs)`, centerX, centerY + 70);

// Show last shot if available
if (lastShot.timestamp) {
ctx.font = '14px Arial';
ctx.fillStyle = '#aaa';
const shotDate = new Date(lastShot.timestamp);
ctx.fillText(`Last shot: ${shotDate.toLocaleTimeString()}`, centerX, centerY + 95);
}

ctx.font = '16px Arial';
ctx.fillStyle = '#4CAF50';
ctx.fillText('Tap Reset to play again', centerX, centerY + 125);
}

export function drawDebugInfo() {
if (!settings.showDebug) return;

// Draw debug overlay in top-left corner
const debugX = 10;
const debugY = 10;
const debugWidth = Math.min(canvas.width - 20, 400);
const debugHeight = 250; // Fixed height

// Semi-transparent background
ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
ctx.fillRect(debugX - 5, debugY - 5, debugWidth + 10, debugHeight + 10);

// Title
ctx.fillStyle = '#00ff00';
ctx.font = 'bold 14px monospace';
ctx.textAlign = 'left';
ctx.fillText('DEBUG LOG:', debugX, debugY + 15);

// PERSISTENT HUD: Show current tip position (doesn't scroll)
if (ballPosition.set) {
const tipDist = Math.sqrt(
clubTipTracking.tipPosition.x ** 2 +
clubTipTracking.tipPosition.y ** 2 +
clubTipTracking.tipPosition.z ** 2
);

ctx.fillStyle = '#ffff00';
ctx.font = 'bold 11px monospace';
ctx.fillText(`TIP: [${clubTipTracking.tipPosition.x.toFixed(2)}, ${clubTipTracking.tipPosition.y.toFixed(2)}, ${clubTipTracking.tipPosition.z.toFixed(2)}] ${tipDist.toFixed(2)}m`, debugX, debugY + 30);
}

// PERSISTENT HUD: Last shot velocity (stays visible!)
if (lastShot.velocity) {
ctx.fillStyle = '#ff00ff';
ctx.font = 'bold 11px monospace';
const spinLabel = lastShot.spin ? ` spin:${Math.abs(lastShot.spin.y).toFixed(0)}` : '';
ctx.fillText(`LAST: V[${lastShot.velocity.x.toFixed(1)}, ${lastShot.velocity.y.toFixed(1)}, ${lastShot.velocity.z.toFixed(1)}]${spinLabel}`, debugX, debugY + 43);
}

// Debug messages (scrolling log)
ctx.font = '11px monospace';
ctx.fillStyle = '#00ff00';
let lineY = debugY + 63; // Start below HUD
const lineHeight = 14;

// Reserve space for coordinate legend at bottom (55px)
const availableHeight = debugHeight - 118; // 63 for top + HUD, 55 for bottom
const maxLines = Math.floor(availableHeight / lineHeight);

// Show last N messages that fit (most recent at bottom)
const visibleMessages = debugLog.messages.slice(-maxLines);
visibleMessages.forEach(msg => {
ctx.fillText(msg, debugX, lineY);
lineY += lineHeight;
});

// If no messages yet, show IMU data
if (debugLog.messages.length === 0 && imuPermissionGranted) {
ctx.fillText('Waiting for events...', debugX, lineY);
}

// Draw coordinate system indicator (bottom of debug box)
const coordY = debugY + debugHeight - 55;
ctx.fillStyle = '#ffff00';
ctx.font = 'bold 10px monospace';
ctx.fillText(`MODE: ${settings.phoneOrientation === 'edge' ? 'EDGE FIRST 🏌️' : 'SCREEN FIRST 📱'}`, debugX, coordY);
ctx.fillStyle = '#00ff00';
ctx.font = '10px monospace';
ctx.fillText('Screen: X=L/R Y=UP/DOWN Z=AWAY', debugX, coordY + 12);
ctx.fillText(`Spin: ${settings.spinEffect}/10 | Side swing = Hook/Slice`, debugX, coordY + 22);
ctx.fillText('Large |X| = slice/hook, Large Z = straight', debugX, coordY + 32);
}
