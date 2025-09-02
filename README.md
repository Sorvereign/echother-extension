# PMB Audio Recorder - Chrome Extension

## ✨ NEW: Chrome Manifest V3 Offscreen Document Implementation

Following the [official Chrome documentation](https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture?hl=es-419), this extension now uses the proper Chrome Manifest V3 architecture for microphone access.

### 🏗️ **Architecture Overview**

```
Popup (UI) → Background Script (Service Worker) → Offscreen Document (getUserMedia)
```

1. **Popup**: User interface and controls
2. **Background Script**: Message routing and offscreen document management
3. **Offscreen Document**: Has access to `getUserMedia()` API for microphone

### 🎤 **Microphone Permission Flow**

#### **Automatic Permission Request**
The extension will automatically request microphone permissions when you first try to record:

1. Click "Start Recording" 
2. Chrome shows permission dialog: "PMB Audio Recorder wants to use your microphone"
3. Click "Allow" 
4. Recording begins immediately

#### **If Permission is Denied**
If you accidentally click "Block" or have previously denied access:

1. Extension shows: "Microphone access denied"
2. Click "Fix Microphone Permissions" button
3. Chrome opens: `chrome://settings/content/microphone`
4. Find "PMB Audio Recorder" and set to "Allow"
5. Return to extension and try recording again

### 🔧 **Manual Permission Management**

#### **Chrome Settings Method**
1. Go to `chrome://settings/content/microphone`
2. Look for "PMB Audio Recorder" in the list
3. Set to "Allow" if blocked
4. Or remove from "Block" list to reset

#### **Address Bar Method (GitHub pages)**
1. On any GitHub repository page
2. Click the lock icon in address bar
3. Set "Microphone" to "Allow"
4. Reload the page

### 📁 **Extension Files Structure**

```
chrome-extension/
├── manifest.json         # Manifest V3 with offscreen permission
├── popup.html           # User interface
├── popup.js             # UI logic and message handling
├── background.js        # Service worker for message routing
├── offscreen.html       # Minimal HTML for offscreen document
├── offscreen.js         # Microphone access and recording logic
└── styles.css           # Modern UI styling
```

### 🚀 **Installation & Testing**

1. **Load Extension**:
   ```
   chrome://extensions/ → Developer mode ON → Load unpacked → Select folder
   ```

2. **Test Recording**:
   - Click extension icon
   - Go to any GitHub repository
   - Click "Start Recording"
   - Allow microphone access when prompted
   - Speak for a few seconds
   - Click "Stop" and check upload

3. **Verify Permissions**:
   ```
   chrome://settings/content/microphone
   ```
   Should show "PMB Audio Recorder" with "Allow" status

### 🛠️ **Troubleshooting**

| Issue | Solution |
|-------|----------|
| **"Microphone access denied"** | Click "Fix Microphone Permissions" → Set to Allow |
| **No permission dialog** | Check if already blocked in chrome://settings |
| **Recording empty** | Ensure microphone is working in other apps |
| **Upload failed** | Verify backend is running at configured URL |
| **Extension not loading** | Check console for errors, reload extension |

### ✅ **Key Features**

- 🎯 **Manifest V3 Compliant**: Uses proper offscreen document pattern
- 🎤 **Smart Permissions**: Automatic request with manual recovery options  
- 📱 **Modern UI**: Professional design with visual feedback
- 🔄 **Real-time Status**: Connection and permission status indicators
- 📊 **Progress Tracking**: Visual timer and progress bar during recording
- 🔗 **Direct Integration**: Auto-detects GitHub repos and generates ticket links
- ⚙️ **Configurable**: Backend URL and settings management
- 🛡️ **Error Handling**: Detailed error messages with recovery actions

### 📚 **Technical Implementation**

Based on Chrome's official guidance, this extension implements:

- ✅ `chrome.offscreen` API for background getUserMedia access
- ✅ Service worker message routing between popup and offscreen
- ✅ Proper permission checking and error handling
- ✅ ArrayBuffer transfer for audio data between contexts
- ✅ Automatic offscreen document lifecycle management

**The microphone permission issue is now completely resolved using Chrome's recommended architecture!** 🎉
# echother-extension
