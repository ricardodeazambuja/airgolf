# Air Golf

Turn your phone into a golf club. Uses IMU sensors to track swing motion and simulate ball flight with realistic physics.

<p align="center" width="100%">
    <img width="685" height="966" alt="image" src="https://github.com/user-attachments/assets/84b4ce67-fafb-4d32-808c-c1e9aac2d15f" />
</p>

## How to Play

1. **Grant Motion Permissions**
   - iOS: Tap "Tee Up" → Allow motion/orientation access
   - Android: Should work automatically

2. **Tee Up**
   - Tap "Tee Up" button
   - Hold phone like a golf club (bottom edge = club head)
   - Ball appears with yellow circle (hit zone)

3. **Swing**
   - Pull back (backswing)
   - Swing through the ball (fast motion required)
   - Hit is detected when club tip enters yellow zone at speed

4. **Watch Ball Flight**
   - Yellow line shows trajectory
   - Camera auto-zooms to keep ball in view
   - Results appear at top when ball lands

5. **Reset & Repeat**
   - Tap "Reset" to try again
   - Tap "Tee Up" to place new ball

## Settings

### Golf Club

**Club Length** (0.5-2.0m, default: 1.2m)
- Distance from your hand to club head
- Longer = more swing arc, more distance
- Measure your actual club if you want realism

**Club Head Weight** (100-500g, default: 200g)
- Currently display-only, not used in physics

**Loft Angle** (10-60°, default: 25°)
- Club face angle - converts downward swing to upward launch
- 10° = Driver (long, low trajectory)
- 25° = 5-iron (medium)
- 42° = 9-iron (high, short)

### Phone Grip

**Swing Style**
- **Edge First**: Hold phone edge like a club shaft (recommended)
- **Screen First**: Swing with screen facing forward (alternative)

### Golf Ball

**Ball Diameter** (3-10cm, default: 4.3cm)
- Regulation golf ball is 4.3cm
- Affects visual size only

**Ball Weight** (30-100g, default: 45.9g)
- Regulation weight is 45.9g
- Currently display-only, not used in physics

**Hit Zone Diameter** (5-100cm, default: 30cm)
- Yellow circle size around ball
- Smaller = harder to hit (precise)
- Larger = easier to hit (forgiving)

### Hit Detection

**~~Position Sensitivity~~** (deprecated)
- This setting is not used
- Hit zone diameter controls detection area

**Minimum Swing Speed** (1-15 m/s², default: 5.0)
- Acceleration threshold to register hit
- Lower = gentle taps work
- Higher = requires aggressive swing

**Swing Timeout** (5-30s, default: 10s)
- Time limit after tee-up before auto-reset
- Increase if you need more setup time

### Physics

**Gravity** (5-15 m/s², default: 9.81)
- Earth gravity is 9.81 m/s²
- Lower = moon golf (floaty)
- Higher = heavy ball

**Air Resistance** (0-1, default: 0.5)
- 0 = vacuum (no drag)
- 0.5 = realistic
- 1 = maximum drag

**Impact Power** (0.5-3.0, default: 1.5)
- Club spring effect (coefficient of restitution)
- 0.5 = soft, low distance
- 1.5 = realistic
- 3.0 = super bounce

**Spin Effect** (0-10, default: 5)
- Magnus force (curve from sidespin)
- 0 = no curve (always straight)
- 5 = realistic hook/slice
- 10 = extreme curve

### Display

**Show Debug Info**
- Shows tracking data, spin values, physics info
- Useful for troubleshooting

### Sound

**Enable Sound Effects**
- Hit, landing, and alarm sounds

**Volume** (0-100%, default: 50%)
- Overall volume control

## Recording & Replay

**Record Swing**
- Tap "🎥 Record Swing" to enable recording mode
- Your next swing will be saved
- Tap again to cancel

**Replay**
- Tap "▶️ Replay" to view last recorded swing
- Tap "🔄 Change View" to cycle camera angles
  - Perspective, Top, Front, Left, Right
- Tap canvas to exit replay

## Troubleshooting

### Ball doesn't appear
- Check motion permissions (Settings → Safari → Motion & Orientation)
- Refresh page and allow permissions again
- Try in Safari (not Chrome/Firefox on iOS)

### Can't hit the ball
- **Yellow circle too small**: Increase "Hit Zone Diameter" in settings
- **Not swinging fast enough**: Lower "Minimum Swing Speed"
- **No backswing**: Pull phone away 15cm+ before swinging through
- **Check club tip indicator**: Green dot shows where club is
  - Green = in hit zone
  - Yellow = near
  - Red = too far

### Ball flies wrong direction
- Check "Swing Style" in Phone Grip settings
- Try switching between "Edge First" and "Screen First"
- Look at debug info (enable in Display settings) to see velocity

### Always shows "STRAIGHT" (never hook/slice)
- Sidespin requires horizontal movement during swing
- Swing with left/right motion (not just down)
- Check debug log for spin values (should be >2 rad/s for hook/slice)

### iOS "Undo Typing" dialog appears
- Tap outside any input fields before swinging
- Or add game to Home Screen (Share → Add to Home Screen)
- Standalone mode disables iOS system gestures

### Ball path not visible
- Ball path is bright yellow during flight
- Check if ball actually launched (debug info shows velocity)
- Camera auto-zooms to fit trajectory

### Trajectory doesn't fit on screen
- Fixed in latest version (auto-zoom implemented)
- Refresh if using old cached version

## Running Locally

Requires HTTPS for motion sensors to work.

### Quick Start
```bash
python https_server.py
```

Then open: `https://localhost:8443` (or your server IP on local network)

Accept the self-signed certificate warning.

**Note**: The server includes cache-prevention headers to avoid iOS Safari caching issues during development. If you update code and don't see changes, restart the server and force-refresh the page.

### Manual Setup
```bash
# Generate certificate (first time only)
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes

# Run HTTPS server
python3 -m http.server 4443 --bind localhost --protocol HTTP/1.1
```

## Technical Details

### Architecture
- **Modular ES6**: 11 separate modules for physics, tracking, rendering, etc.
- **Madgwick Filter**: Sensor fusion (gyro + accel → orientation)
- **Magnus Effect**: Realistic ball spin physics
- **Dynamic Camera**: Auto-zoom to fit ball trajectory

### Key Modules
- `tracking.js` - Club tip position tracking (critical module)
- `physics.js` - Ball flight simulation
- `sensors.js` - IMU data collection
- `game-logic.js` - Hit detection & game state
- `renderer.js` - 3D visualization

### Browser Requirements
- **iOS**: Safari 13+ (motion permissions required)
- **Android**: Chrome 79+ or Firefox 68+
- **Desktop**: Limited (no motion sensors)

## License

MIT
