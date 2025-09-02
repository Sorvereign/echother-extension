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
});

// Send initial tab update
setTimeout(() => {
  chrome.runtime.sendMessage({
    type: 'tab-updated',
    target: 'popup',
    url: window.location.href
  });
}, 1000);