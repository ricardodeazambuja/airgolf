// ============================================
// AUDIO SYSTEM MODULE
// ============================================
// Generate sound effects using Web Audio API

// Create audio context
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

// ============================================
// SOUND EFFECTS
// ============================================

export function playHitSound(settings) {
    if (!settings.soundEnabled) return;

    const now = audioContext.currentTime;
    const volume = settings.soundVolume / 100;

    // Create a sharp "crack" sound for club hitting ball
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Sharp percussive sound
    oscillator.frequency.setValueAtTime(800, now);
    oscillator.frequency.exponentialRampToValueAtTime(100, now + 0.1);
    oscillator.type = 'triangle';

    gainNode.gain.setValueAtTime(volume * 0.5, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

    oscillator.start(now);
    oscillator.stop(now + 0.15);
}

export function playLandSound(settings) {
    if (!settings.soundEnabled) return;

    const now = audioContext.currentTime;
    const volume = settings.soundVolume / 100;

    // Create a "thud" sound for ball landing
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Low thud sound
    oscillator.frequency.setValueAtTime(150, now);
    oscillator.frequency.exponentialRampToValueAtTime(50, now + 0.2);
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(volume * 0.4, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

    oscillator.start(now);
    oscillator.stop(now + 0.25);
}

export function playAlarmSound(settings) {
    if (!settings.soundEnabled) return;

    const now = audioContext.currentTime;
    const volume = settings.soundVolume / 100;

    // Create an urgent beeping alarm sound
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Alternating beep pattern
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.setValueAtTime(660, now + 0.15);
    oscillator.frequency.setValueAtTime(880, now + 0.3);
    oscillator.type = 'square';

    gainNode.gain.setValueAtTime(volume * 0.3, now);
    gainNode.gain.setValueAtTime(0.01, now + 0.1);
    gainNode.gain.setValueAtTime(volume * 0.3, now + 0.15);
    gainNode.gain.setValueAtTime(0.01, now + 0.25);
    gainNode.gain.setValueAtTime(volume * 0.3, now + 0.3);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.45);

    oscillator.start(now);
    oscillator.stop(now + 0.45);
}
