// State management
let recording = false;
let mediaRecorder;
let chunks = [];
let repoUrl = '';
let maxSeconds = 180;
let seconds = 0;
let interval;
let backendUrl = 'http://localhost:8000';
let frontendUrl = 'http://localhost:3000';
let userSession = null;
let extensionSessionId = null;

// DOM elements
const el = (id) => document.getElementById(id);
const elements = {
  startBtn: el('startBtn'),
  stopBtn: el('stopBtn'),
  statusEl: el('status'),
  timerEl: el('timer'),
  repoEl: el('repo'),
  backendInput: el('backendInput'),
  saveBtn: el('saveCfg'),
  permHelp: el('permHelp'),
  saveMsg: el('saveMsg'),
  settingsToggle: el('settingsToggle'),
  settingsContent: el('settingsContent'),
  testConnection: el('testConnection'),
  connectionStatus: el('connectionStatus'),
  waveIndicator: el('waveIndicator'),
  progressFill: el('progressFill'),
  linkEl: el('link'),
  loginBtn: el('loginBtn'),
  userInfo: el('userInfo'),
  recordingIndicator: el('recordingIndicator')
};

// Utility functions
function formatTime(s) {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `${m}:${ss}`;
}

function updateProgress() {
  const progress = (seconds / maxSeconds) * 100;
  elements.progressFill.style.width = `${Math.min(progress, 100)}%`;
}

function setStatus(message, type = '') {
  elements.statusEl.textContent = message;
  elements.statusEl.className = `status-message ${type}`;
}

function setConnectionStatus(connected) {
  elements.connectionStatus.className = `status-indicator ${connected ? '' : 'disconnected'}`;
}

// Timer management
function startTimer() {
  seconds = 0;
  elements.timerEl.classList.add('recording');
  elements.waveIndicator.classList.add('active');
  elements.recordingIndicator.style.display = 'flex';
  
  console.log('Starting timer from 0 seconds');
  
  interval = setInterval(() => {
    seconds++;
    elements.timerEl.textContent = formatTime(seconds);
    updateProgress();
    
    if (seconds >= maxSeconds) {
      stopRecording();
    }
  }, 1000);
}

function startTimerWithOffset(offsetSeconds) {
  // Clear any existing timer
  if (interval) {
    clearInterval(interval);
  }
  
  // Set the initial seconds to the offset
  seconds = offsetSeconds;
  elements.timerEl.textContent = formatTime(seconds);
  elements.timerEl.classList.add('recording');
  elements.waveIndicator.classList.add('active');
  elements.recordingIndicator.style.display = 'flex';
  
  // Start the timer from the current offset
  interval = setInterval(() => {
    seconds++;
    elements.timerEl.textContent = formatTime(seconds);
    updateProgress();
    
    if (seconds >= maxSeconds) {
      stopRecording();
    }
  }, 1000);
  
  console.log(`Timer started with offset: ${offsetSeconds} seconds`);
}

function stopTimer() {
  clearInterval(interval);
  elements.timerEl.classList.remove('recording');
  elements.waveIndicator.classList.remove('active');
  elements.recordingIndicator.style.display = 'none';
}

// Repository detection
async function detectRepo() {
  try {
    // First, try to get analyzed repositories from backend if user is authenticated
    if (userSession && userSession.user_id) {
      try {
        const response = await fetch(`${backendUrl}/api/user-repositories?user_id=${userSession.user_id}`);
        if (response.ok) {
          const data = await response.json();
          if (data.repositories && data.repositories.length > 0) {
            // Get the most recent analyzed repository
            const latestRepo = data.repositories[0];
            const urlMatch = latestRepo.url.match(/github\.com\/([^\/]+\/[^\/]+)/);
            const displayName = urlMatch ? urlMatch[1] : 'Analyzed Repository';
            
            elements.repoEl.textContent = `${displayName} (analyzed)`;
            elements.repoEl.style.color = '#059669';
            return latestRepo.url;
          }
        }
      } catch (apiError) {
        console.log('Could not fetch repositories from backend:', apiError);
      }
    }
    
    // Fallback: Check for analyzed repository from storage
    try {
      const stored = await chrome.storage.local.get(['analyzedRepoUrl']);
      if (stored.analyzedRepoUrl) {
        // Extract repo name from URL for display
        const urlMatch = stored.analyzedRepoUrl.match(/github\.com\/([^\/]+\/[^\/]+)/);
        const displayName = urlMatch ? urlMatch[1] : 'Analyzed Repository';
        
        elements.repoEl.textContent = `${displayName} (analyzed)`;
        elements.repoEl.style.color = '#059669';
        return stored.analyzedRepoUrl;
      }
    } catch (storageError) {
      console.log('No analyzed repository found in storage');
    }
    
    // Fallback: Check current tab if on GitHub
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url || '';
    
    if (url.includes('github.com')) {
      const match = url.match(/github\.com\/([^\/]+\/[^\/]+)/);
      if (match) {
        const repoName = match[1];
        const repoUrl = `https://github.com/${repoName}`;
        elements.repoEl.textContent = `${repoName} (current tab)`;
        elements.repoEl.style.color = '#f59e0b'; // Orange for current tab
        return repoUrl;
      }
    }
    
    elements.repoEl.textContent = 'No repository detected';
    elements.repoEl.style.color = '#64748b';
    return '';
  } catch (error) {
    console.error('Repository detection error:', error);
    elements.repoEl.textContent = 'Error detecting repository';
    elements.repoEl.style.color = '#dc2626';
    return '';
  }
}

// Refresh repository detection and UI
async function refreshRepoDetection() {
  console.log('Refreshing repository detection...');
  repoUrl = await detectRepo();
  return repoUrl;
}

// Permission checking
async function checkMicrophonePermission() {
  try {
    const result = await navigator.permissions.query({ name: 'microphone' });
    return result.state;
  } catch (error) {
    console.log('Permissions API not supported, will try direct access');
    return 'unknown';
  }
}

// Recording functions with fallback
async function startRecording() {
  try {
    elements.startBtn.disabled = true;
    elements.stopBtn.disabled = false;
    setStatus('Initializing recording...', 'warning');
    
    // Always try offscreen document approach first (recommended)
    try {
      console.log('Attempting offscreen recording...');
      setStatus('Initializing offscreen recording...', 'warning');
      
      const initResponse = await chrome.runtime.sendMessage({
        type: 'init-recording'
      });
      
      console.log('Init response:', initResponse);
      
      if (initResponse?.success) {
        setStatus('Starting recording via offscreen...', 'warning');
        
        const startResponse = await chrome.runtime.sendMessage({
          type: 'start-recording'
        });
        
        console.log('Start response:', startResponse);
        
        if (startResponse?.success) {
          setStatus('Recording... Speak clearly into your microphone', 'success');
          startTimer();
          recording = true;
          
          // Store recording state in storage so it persists if popup closes
          const startTime = Date.now();
          await chrome.storage.local.set({ 
            isRecording: true, 
            recordingStartTime: startTime,
            repoUrl: repoUrl,
            recordingMethod: 'offscreen'
          });
          
          console.log('Recording started successfully via offscreen at:', startTime);
          
          // Note: Real-time processing removed for simplicity
          console.log('Recording started - will process when stopped');
          
          return;
        } else {
          throw new Error(`Failed to start recording via offscreen: ${startResponse?.error || 'Unknown error'}`);
        }
      } else {
        throw new Error(`Failed to initialize offscreen recording: ${initResponse?.error || 'Unknown error'}`);
      }
    } catch (offscreenError) {
      console.log('Offscreen approach failed, trying direct approach:', offscreenError);
      setStatus(`Offscreen recording failed: ${offscreenError.message}`, 'error');
      
      // Wait a bit before trying direct recording
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Fallback: Direct recording in popup (not recommended as it stops when popup closes)
    setStatus('Starting direct recording...', 'warning');
    await startDirectRecording();
    
  } catch (error) {
    console.error('All recording methods failed:', error);
    handleRecordingError(error);
  }
}

// Direct recording fallback
async function startDirectRecording() {
  setStatus('Requesting microphone access...', 'warning');
  
  const constraints = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 48000
    }
  };
  
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  chunks = [];
  
  // Check for available MIME types
  const mimeTypes = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/mpeg'
  ];
  
  let mimeType = 'audio/webm';
  for (const type of mimeTypes) {
    if (MediaRecorder.isTypeSupported(type)) {
      mimeType = type;
      break;
    }
  }
  
  console.log('Using MIME type:', mimeType);
  
  mediaRecorder = new MediaRecorder(stream, { mimeType });
  
  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
      console.log('Audio chunk recorded:', event.data.size, 'bytes');
    }
  };
  
  mediaRecorder.onstop = async () => {
    console.log('Recording stopped, processing', chunks.length, 'chunks');
    const blob = new Blob(chunks, { type: mimeType });
    console.log('Final blob size:', blob.size, 'bytes');
    
    // Stop all tracks to release microphone
    stream.getTracks().forEach(track => {
      track.stop();
      console.log('Track stopped:', track.kind, track.label);
    });
    
    if (blob.size > 0) {
      await upload(blob);
    } else {
      setStatus('Recording was empty. Please try again.', 'warning');
      elements.startBtn.disabled = false;
      elements.stopBtn.disabled = true;
    }
  };
  
  mediaRecorder.onerror = (event) => {
    console.error('MediaRecorder error:', event.error);
    setStatus('Recording error occurred. Please try again.', 'error');
    elements.startBtn.disabled = false;
    elements.stopBtn.disabled = true;
  };
  
  mediaRecorder.start(1000);
  setStatus('Recording... Speak clearly into your microphone', 'success');
  startTimer();
  recording = true;
  
  // Store recording state for direct recording too
  try {
    const startTime = Date.now();
    await chrome.storage.local.set({ 
      isRecording: true, 
      recordingStartTime: startTime,
      repoUrl: repoUrl,
      recordingMethod: 'direct'
    });
    console.log('Direct recording state stored at:', startTime);
  } catch (error) {
    console.log('Failed to store direct recording state:', error);
  }
}

function handleRecordingError(error) {
  let errorMessage = 'Recording failed. ';
  let showPermissionsButton = false;
  
  if (error.name === 'NotAllowedError' || error.message?.includes('Permission') || error.message?.includes('denied')) {
    errorMessage = 'Microphone access denied. ';
    showPermissionsButton = true;
  } else if (error.name === 'NotFoundError' || error.message?.includes('NotFoundError')) {
    errorMessage = 'No microphone found. Check your device. ';
  } else if (error.name === 'NotReadableError' || error.message?.includes('NotReadableError')) {
    errorMessage = 'Microphone is being used by another application. ';
  } else if (error.message?.includes('Chrome offscreen API')) {
    errorMessage = 'Chrome version too old. Please update Chrome or try again. ';
  } else {
    errorMessage += error.message || 'Unknown error occurred.';
  }
  
  setStatus(errorMessage, 'error');
  elements.startBtn.disabled = false;
  elements.stopBtn.disabled = true;
  
  if (showPermissionsButton) {
    showPermissionsHelper();
  }
}

async function stopRecording() {
  if (!recording) return;
  
  setStatus('Stopping recording...', 'warning');
  stopTimer();
  recording = false;
  elements.startBtn.disabled = false;
  elements.stopBtn.disabled = true;
  
  // Clear recording state from storage
  try {
    await chrome.storage.local.remove(['isRecording', 'recordingStartTime', 'repoUrl', 'recordingMethod']);
    console.log('Recording state cleared from storage');
  } catch (error) {
    console.log('Error clearing recording state:', error);
  }
  
  // If using direct recording (mediaRecorder exists)
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    console.log('Stopping direct recording');
    mediaRecorder.stop();
    return;
  }
  
  // Otherwise, try to stop via background script (offscreen method)
  chrome.runtime.sendMessage({
    type: 'stop-recording'
  }).then(response => {
    if (response?.success && response?.audioData) {
      setStatus('Processing audio...', 'warning');
      
      // Convert array buffer back to blob for upload
      const blob = new Blob([response.audioData], { 
        type: response.mimeType || 'audio/webm' 
      });
      
      console.log('Got audio blob:', blob.size, 'bytes');
      upload(blob);
    } else {
      setStatus('Failed to get recording data', 'error');
    }
  }).catch(error => {
    console.error('Stop recording error:', error);
    setStatus('Failed to stop recording', 'error');
  });
}

function showPermissionsHelper() {
  elements.linkEl.innerHTML = `
    <button id="openPermissions" class="btn btn-outline" style="margin-top: 8px;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <path d="M12 19v4"/>
        <path d="M8 23h8"/>
      </svg>
      Fix Microphone Permissions
    </button>
  `;
  
  el('openPermissions').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'open-settings' });
  });
}

// Note: stopRecording function is already defined above with the new offscreen implementation

// Upload function
async function upload(blob) {
  try {
    // Check authentication
    if (!userSession) {
      setStatus('Please login first to record audio', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('file', blob, 'recording.webm');
    formData.append('repo_url', repoUrl);
    formData.append('user_id', userSession.user_id || userSession.id);
    
    const response = await fetch(`${backendUrl.replace(/\/$/, '')}/api/context-blocks/process-meeting`, {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    setStatus('Upload complete! Processing meeting...', 'success');
    
    if (data?.session_id) {
      elements.linkEl.innerHTML = `
        <a href="#" id="openResults">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14,2 14,8 20,8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10,9 9,9 8,9"/>
          </svg>
          View Context Blocks
        </a>
      `;
      
      el('openResults').addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: `${frontendUrl}/context-blocks/${data.session_id}` });
      });
    } else {
      setStatus('Upload complete, but no session ID received', 'warning');
    }
    
  } catch (error) {
    console.error('Upload error:', error);
    setStatus('Upload failed. Check backend connection.', 'error');
    setConnectionStatus(false);
  }
}

// Simplified: No real-time processing for now

// Settings functions
async function loadSettings() {
  try {
    const stored = await chrome.storage.sync.get(['backendUrl', 'frontendUrl']);
    
    if (stored.backendUrl) {
      backendUrl = stored.backendUrl;
    }
    if (stored.frontendUrl) {
      frontendUrl = stored.frontendUrl;
    }
    
    elements.backendInput.value = backendUrl;
    
    // Load extension session ID and user session
    const localStored = await chrome.storage.local.get(['extensionSessionId', 'userSession']);
    if (localStored.extensionSessionId) {
      extensionSessionId = localStored.extensionSessionId;
      console.log('Loaded extension session ID:', extensionSessionId);
    }
    if (localStored.userSession) {
      userSession = localStored.userSession;
      console.log('Loaded user session:', userSession);
    }
    
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

async function saveSettings() {
  const url = elements.backendInput.value?.trim();
  
  if (!url) {
    elements.saveMsg.textContent = 'Please enter a valid URL';
    elements.saveMsg.className = 'save-message error';
    return;
  }
  
  try {
    backendUrl = url;
    await chrome.storage.sync.set({ backendUrl: url });
    
    elements.saveMsg.textContent = 'Configuration saved successfully';
    elements.saveMsg.className = 'save-message success';
    
    setTimeout(() => {
      elements.saveMsg.textContent = '';
      elements.saveMsg.className = 'save-message';
    }, 3000);
    
    // Test connection after saving
    await testConnection();
    
  } catch (error) {
    console.error('Failed to save settings:', error);
    elements.saveMsg.textContent = 'Failed to save configuration';
    elements.saveMsg.className = 'save-message error';
  }
}

async function testConnection() {
  try {
    setStatus('Testing connection...', 'warning');
    setConnectionStatus(false);
    
    const response = await fetch(`${backendUrl}/api/extension-test`);
    
    if (response.ok) {
      const data = await response.json();
      setStatus('Backend connection successful', 'success');
      setConnectionStatus(true);
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    console.error('Connection test failed:', error);
    setStatus('Backend connection failed', 'error');
    setConnectionStatus(false);
  }
}

// Authentication functions
async function checkAuthStatus() {
  try {
    // First try to get extension session
    if (extensionSessionId) {
      const response = await fetch(`${backendUrl}/api/auth/extension-session/${extensionSessionId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.user) {
          userSession = data.user;
          updateAuthUI();
          return true;
        }
      }
    }
    
    // Fallback to regular session check
    const response = await fetch(`${backendUrl}/api/auth/session`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.user) {
        userSession = data.user;
        updateAuthUI();
        return true;
      } else {
        userSession = null;
        updateAuthUI();
        return false;
      }
    } else {
      userSession = null;
      updateAuthUI();
      return false;
    }
  } catch (error) {
    console.error('Auth check failed:', error);
    userSession = null;
    updateAuthUI();
    return false;
  }
}

function updateAuthUI() {
  const recordingSection = document.querySelector('.section:nth-child(4)'); // Voice Recording section
  
  if (userSession) {
    // User is authenticated
    elements.loginBtn.style.display = 'none';
    elements.userInfo.style.display = 'block';
    elements.userInfo.innerHTML = `
      <div class="user-info">
        <span class="user-name">${userSession.email || 'User'}</span>
        <button id="logoutBtn" class="btn btn-sm btn-outline">Logout</button>
      </div>
    `;
    
    // Show recording section
    if (recordingSection) {
      recordingSection.style.display = 'block';
    }
    
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', logout);
    }
  } else {
    // User is not authenticated
    elements.loginBtn.style.display = 'block';
    elements.userInfo.style.display = 'none';
    
    // Hide recording section
    if (recordingSection) {
      recordingSection.style.display = 'none';
    }
  }
}

async function login() {
  try {
    setStatus('Opening login page...', 'warning');
    
    // Open frontend login page for extension
    chrome.tabs.create({ 
      url: `${frontendUrl}/login?redirect=extension`,
      active: true 
    });
    
    setStatus('Please complete login in the opened tab. It will close automatically.', 'warning');
    
  } catch (error) {
    console.error('Login failed:', error);
    setStatus('Login failed', 'error');
  }
}



async function logout() {
  try {
    // Try extension logout first
    if (extensionSessionId) {
      const response = await fetch(`${backendUrl}/api/auth/extension-logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ session_id: extensionSessionId })
      });
      
      if (response.ok) {
        extensionSessionId = null;
        userSession = null;
        
        // Clear all session data from storage
        await chrome.storage.local.remove(['extensionSessionId', 'userSession']);
        
        updateAuthUI();
        setStatus('Logged out successfully', 'success');
        return;
      }
    }
    
    // Fallback to regular logout
    const response = await fetch(`${backendUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    if (response.ok) {
      userSession = null;
      extensionSessionId = null;
      
      // Clear all session data from storage
      await chrome.storage.local.remove(['extensionSessionId', 'userSession']);
      
      updateAuthUI();
      setStatus('Logged out successfully', 'success');
    }
  } catch (error) {
    console.error('Logout failed:', error);
    setStatus('Logout failed', 'error');
  }
}

// Event listeners
elements.startBtn.addEventListener('click', async () => {
  if (!recording) {
    repoUrl = await detectRepo();
    await startRecording();
  }
});

elements.stopBtn.addEventListener('click', () => {
  if (recording) {
    stopRecording();
  }
});

// Listen for messages from offscreen document
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'popup') return;
  
  console.log('Popup received message:', message.type);
  
  switch (message.type) {
    case 'recording-started':
      setStatus('Recording... Speak clearly into your microphone', 'success');
      break;
      
    case 'recording-completed':
      setStatus('Recording completed, processing...', 'success');
      break;
      
    case 'recording-error':
      console.error('Recording error from offscreen:', message.error);
      setStatus(`Recording error: ${message.error?.message || 'Unknown error'}`, 'error');
      elements.startBtn.disabled = false;
      elements.stopBtn.disabled = true;
      stopTimer();
      recording = false;
      
      if (message.error?.name === 'NotAllowedError') {
        showPermissionsHelper();
      }
      break;
      
    case 'tab-updated':
      // Auto-detect repo when tab changes
      detectRepo();
      break;
      
    case 'auth-updated':
      // Handle authentication update from background script
      console.log('Auth updated from background:', message);
      extensionSessionId = message.sessionId;
      userSession = message.user;
      updateAuthUI();
      setStatus('Login successful! You can now record audio.', 'success');
      break;
      
    // Note: Audio chunk processing removed for simplicity
  }
});

// Listen for storage changes (when repository is analyzed)
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.analyzedRepoUrl) {
    console.log('Repository analysis detected, updating UI...');
    refreshRepoDetection();
  }
});

// Login button handler
elements.loginBtn.addEventListener('click', login);

elements.saveBtn.addEventListener('click', saveSettings);

elements.testConnection.addEventListener('click', testConnection);

elements.permHelp.addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://settings/content/microphone' });
});

elements.settingsToggle.addEventListener('click', () => {
  elements.settingsContent.classList.toggle('open');
});

// Check if there's an ongoing recording
async function checkOngoingRecording() {
  try {
    const stored = await chrome.storage.local.get(['isRecording', 'recordingStartTime', 'repoUrl', 'recordingMethod']);
    if (stored.isRecording && stored.recordingStartTime) {
      const elapsedTime = Math.floor((Date.now() - stored.recordingStartTime) / 1000);
      
      console.log('Found ongoing recording:', {
        method: stored.recordingMethod,
        elapsedTime,
        repoUrl: stored.repoUrl
      });
      
      // Update UI to show ongoing recording
      recording = true;
      seconds = elapsedTime;
      elements.timerEl.textContent = formatTime(seconds);
      elements.timerEl.classList.add('recording');
      elements.waveIndicator.classList.add('active');
      elements.recordingIndicator.style.display = 'flex';
      elements.startBtn.disabled = true;
      elements.stopBtn.disabled = false;
      
      // Update progress
      updateProgress();
      
      // Set repo URL if available
      if (stored.repoUrl) {
        repoUrl = stored.repoUrl;
      }
      
      const methodText = stored.recordingMethod === 'offscreen' ? 'offscreen' : 'direct';
      setStatus(`Recording in progress... (via ${methodText})`, 'success');
      
      // Always restart the timer with the correct elapsed time
      startTimerWithOffset(elapsedTime);
      
      return true;
    }
    return false;
  } catch (error) {
    console.log('Error checking ongoing recording:', error);
    return false;
  }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Initializing extension...');
  
  await loadSettings();
  
  // Initialize UI elements
  elements.progressFill.style.width = '0%';
  elements.timerEl.textContent = '00:00';
  
  // Check authentication status
  console.log('Checking authentication status...');
  await checkAuthStatus();
  
  // Detect repository
  console.log('Detecting repository...');
  repoUrl = await detectRepo();
  
  // Test backend connection
  console.log('Testing backend connection...');
  await testConnection();
  
  // Check if there's an ongoing recording
  console.log('Checking for ongoing recording...');
  const hasOngoingRecording = await checkOngoingRecording();
  
  if (hasOngoingRecording) {
    console.log('Found ongoing recording, verifying with offscreen...');
    
    // Verify with offscreen document that recording is still active
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'check-recording-status'
      });
      
      if (response?.success && response?.isRecording) {
        console.log('Recording confirmed active via offscreen');
        
        // Get the real recording time from offscreen
        const realRecordingTime = Math.floor(response.recordingTime / 1000);
        console.log('Real recording time from offscreen:', realRecordingTime, 'seconds');
        
        // Update the stored start time to match the real recording time
        const newStartTime = Date.now() - (realRecordingTime * 1000);
        await chrome.storage.local.set({ recordingStartTime: newStartTime });
        
        // Update UI with the correct time
        recording = true;
        seconds = realRecordingTime;
        elements.timerEl.textContent = formatTime(seconds);
        elements.timerEl.classList.add('recording');
        elements.waveIndicator.classList.add('active');
        elements.recordingIndicator.style.display = 'flex';
        elements.startBtn.disabled = true;
        elements.stopBtn.disabled = false;
        
        // Start timer with the correct offset
        startTimerWithOffset(realRecordingTime);
        
        const methodText = stored.recordingMethod === 'offscreen' ? 'offscreen' : 'direct';
        setStatus(`Recording in progress... (via ${methodText})`, 'success');
        
      } else {
        console.log('Recording not active in offscreen, clearing state');
        await chrome.storage.local.remove(['isRecording', 'recordingStartTime', 'repoUrl', 'recordingMethod']);
        recording = false;
        elements.timerEl.classList.remove('recording');
        elements.waveIndicator.classList.remove('active');
        elements.recordingIndicator.style.display = 'none';
        elements.startBtn.disabled = false;
        elements.stopBtn.disabled = true;
        setStatus('Ready to record', 'info');
      }
    } catch (error) {
      console.log('Error checking recording status:', error);
      // If we can't verify, assume recording is not active
      await chrome.storage.local.remove(['isRecording', 'recordingStartTime', 'repoUrl', 'recordingMethod']);
      recording = false;
      elements.timerEl.classList.remove('recording');
      elements.waveIndicator.classList.remove('active');
      elements.recordingIndicator.style.display = 'none';
      elements.startBtn.disabled = false;
      elements.stopBtn.disabled = true;
      setStatus('Ready to record', 'info');
    }
  } else {
    // No ongoing recording found, ensure UI is in correct state
    recording = false;
    elements.timerEl.classList.remove('recording');
    elements.waveIndicator.classList.remove('active');
    elements.recordingIndicator.style.display = 'none';
    elements.startBtn.disabled = false;
    elements.stopBtn.disabled = true;
    setStatus('Ready to record', 'info');
  }
  
  // Try to initialize the recording system, but don't fail if it doesn't work
  try {
    const permissionState = await checkMicrophonePermission();
    if (permissionState === 'granted') {
      setStatus('Ready to record - microphone access granted', 'success');
    } else if (permissionState === 'denied') {
      setStatus('Microphone access blocked. Will show fix button when recording.', 'warning');
    } else {
      setStatus('Ready to record - will request microphone access when needed', '');
    }
    chrome.runtime.sendMessage({ type: 'init-recording' }).catch(() => {
      console.log('Offscreen initialization failed, will use direct recording');
    });
  } catch (error) {
    console.log('Could not check initial permissions:', error);
    setStatus('Ready to record', '');
  }
  
  console.log('Extension initialization complete');
});

