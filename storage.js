// ============================================
// DATA PERSISTENCE MODULE
// ============================================
// Save and load settings and last shot data using localStorage

import { defaultSettings } from './config.js';

// ============================================
// SAVE TO LOCAL STORAGE
// ============================================

export function saveToLocalStorage(settings, lastShot) {
    try {
        localStorage.setItem('airGolfSettings', JSON.stringify(settings));
        localStorage.setItem('airGolfLastShot', JSON.stringify(lastShot));
    } catch (e) {
        console.error('Failed to save to localStorage:', e);
    }
}

// ============================================
// LOAD FROM LOCAL STORAGE
// ============================================

export function loadFromLocalStorage() {
    let settings = { ...defaultSettings };
    let lastShot = {
        distance: 0,
        maxHeight: 0,
        impactSpeed: 0,
        timestamp: null
    };

    try {
        const savedSettings = localStorage.getItem('airGolfSettings');
        const savedLastShot = localStorage.getItem('airGolfLastShot');

        if (savedSettings) {
            const loaded = JSON.parse(savedSettings);
            // Merge with defaults to handle new settings
            settings = { ...settings, ...loaded };
        }

        if (savedLastShot) {
            lastShot = JSON.parse(savedLastShot);
        }
    } catch (e) {
        console.error('Failed to load from localStorage:', e);
    }

    return { settings, lastShot };
}
