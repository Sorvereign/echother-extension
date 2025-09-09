// Content script for PMB Audio Recorder Extension
console.log('PMB Audio Recorder content script loaded');

// Listen for tab updates and notify popup
const observer = new MutationObserver(() => {
  chrome.runtime.sendMessage({
    type: 'tab-updated',
    target: 'popup',
    url: window.location.href
  });
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

console.log('Content script loaded and listening for messages');

// Listen for authentication messages from the frontend
window.addEventListener('message', (event) => {
  console.log('Content script received message:', event.data);
  
  if (event.data.type === 'EXTENSION_AUTH_SUCCESS') {
    console.log('Extension auth success received:', event.data);
    
    // Forward to background script to store session
    chrome.runtime.sendMessage({
      type: 'auth-success',
      sessionId: event.data.sessionId,
      user: event.data.user
    }).catch(error => {
      console.error('Error sending message to background from content script:', error);
    });
  }

  // Bridge: start recording via background/offscreen
  if (event.data.type === 'START_EXTENSION_RECORDING') {
    (async () => {
      try {
        // init offscreen and start
        const initResp = await chrome.runtime.sendMessage({ type: 'init-recording' });
        if (!initResp?.success) throw new Error(initResp?.error || 'init failed');
        const startResp = await chrome.runtime.sendMessage({ type: 'start-recording' });
        if (!startResp?.success) throw new Error(startResp?.error || 'start failed');
        window.postMessage({ type: 'EXTENSION_RECORDING_STARTED', success: true }, '*');
      } catch (err) {
        window.postMessage({ type: 'EXTENSION_RECORDING_STARTED', success: false, error: err?.message || String(err) }, '*');
      }
    })();
  }

  if (event.data.type === 'STOP_EXTENSION_RECORDING') {
    (async () => {
      try {
        const stopResp = await chrome.runtime.sendMessage({ type: 'stop-recording' });
        if (!stopResp?.success) throw new Error(stopResp?.error || 'stop failed');
        window.postMessage({ type: 'EXTENSION_RECORDING_STOPPED', success: true }, '*');
      } catch (err) {
        window.postMessage({ type: 'EXTENSION_RECORDING_STOPPED', success: false, error: err?.message || String(err) }, '*');
      }
    })();
  }
});

// Send initial tab update
setTimeout(() => {
  chrome.runtime.sendMessage({
    type: 'tab-updated',
    target: 'popup',
    url: window.location.href
  });
}, 1000);