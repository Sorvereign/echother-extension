// Background script for PMB Audio Recorder extension

let offscreenDocumentCreated = false;

// Helper function to send messages with timeout
function sendMessageWithTimeout(message, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Message timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    
    chrome.runtime.sendMessage(message, (response) => {
      clearTimeout(timeout);
      
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response) {
        resolve(response);
      } else {
        reject(new Error('No response received'));
      }
    });
  });
}

// Listen for extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('PMB Audio Recorder extension installed');
});

// Create offscreen document when needed
async function createOffscreenDocument() {
  try {
    // Always try to create a new offscreen document
    await chrome.offscreen.createDocument({
      url: chrome.runtime.getURL('offscreen.html'),
      reasons: ['USER_MEDIA'],
      justification: 'Recording audio from microphone for voice notes'
    });
    
    offscreenDocumentCreated = true;
    console.log('Offscreen document created successfully');
    
  } catch (error) {
    // If document already exists, that's fine
    if (error.message?.includes('Only a single offscreen document may be created')) {
      console.log('Offscreen document already exists, using existing one');
      offscreenDocumentCreated = true;
      return;
    }
    
    console.error('Failed to create offscreen document:', error);
    throw new Error(`Offscreen document creation failed: ${error.message}`);
  }
}

// Check if offscreen document is still alive
async function checkOffscreenDocument() {
  try {
    // Try to send a ping message to the offscreen document
    const response = await sendMessageWithTimeout({
      type: 'ping',
      target: 'offscreen'
    }, 1000);
    
    return response?.success === true;
  } catch (error) {
    console.log('Offscreen document not responding, recreating...');
    offscreenDocumentCreated = false;
    return false;
  }
}

// Listen for messages from popup and offscreen
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  console.log('Background received message:', message.type, 'from', sender.url);
  
  try {
    switch (message.type) {
      case 'init-recording':
        // Check if chrome.offscreen API is available
        if (!chrome.offscreen) {
          throw new Error('Chrome offscreen API not available. Please update Chrome to version 109+');
        }
        
        // Check if offscreen document is still alive
        const isAlive = await checkOffscreenDocument();
        if (!isAlive) {
          console.log('Offscreen document not alive, recreating...');
          offscreenDocumentCreated = false;
        }
        
        // Create offscreen document and prepare for recording
        await createOffscreenDocument();
        
        // Wait a bit for the offscreen document to initialize
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Verify the offscreen document is working
        const pingResponse = await sendMessageWithTimeout({
          type: 'ping',
          target: 'offscreen'
        }, 2000);
        
        if (!pingResponse?.success) {
          throw new Error('Offscreen document not responding after creation');
        }
        
        console.log('Offscreen document initialized successfully');
        sendResponse({ success: true });
        break;
        
      case 'get-active-tab':
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        sendResponse({ tab: tabs[0] });
        break;
        
      case 'open-settings':
        await chrome.tabs.create({ url: 'chrome://settings/content/microphone' });
        sendResponse({ success: true });
        break;
        
      case 'start-recording':
        // Ensure offscreen document exists
        await createOffscreenDocument();
        
        // Forward to offscreen document with timeout
        try {
          const startResponse = await sendMessageWithTimeout({
            type: 'start-recording',
            target: 'offscreen'
          }, 5000);
          sendResponse(startResponse);
        } catch (error) {
          console.error('Failed to start recording:', error);
          sendResponse({ success: false, error: error.message });
        }
        break;
        
      case 'stop-recording':
        // Forward to offscreen document with timeout
        try {
          const stopResponse = await sendMessageWithTimeout({
            type: 'stop-recording',
            target: 'offscreen'
          }, 5000);
          sendResponse(stopResponse);
        } catch (error) {
          console.error('Failed to stop recording:', error);
          sendResponse({ success: false, error: error.message });
        }
        break;
        
      case 'check-permissions':
        // Ensure offscreen document exists
        await createOffscreenDocument();
        
        // Forward to offscreen document with timeout
        try {
          const permResponse = await sendMessageWithTimeout({
            type: 'check-permissions',
            target: 'offscreen'
          }, 3000);
          sendResponse(permResponse);
        } catch (error) {
          console.error('Failed to check permissions:', error);
          sendResponse({ success: false, hasPermission: false, error: error.message });
        }
        break;
        
      case 'check-recording-status':
        // Ensure offscreen document exists
        await createOffscreenDocument();
        
        // Forward to offscreen document with timeout
        try {
          const statusResponse = await sendMessageWithTimeout({
            type: 'check-recording-status',
            target: 'offscreen'
          }, 3000);
          sendResponse(statusResponse);
        } catch (error) {
          console.error('Failed to check recording status:', error);
          sendResponse({ success: false, isRecording: false, error: error.message });
        }
        break;
        
      case 'auth-success':
        // Store authentication session from frontend
        console.log('Background script received auth-success:', message);
        console.log('Storing extension session:', message.sessionId);
        try {
          await chrome.storage.local.set({
            extensionSessionId: message.sessionId,
            userSession: message.user
          });
          console.log('Session stored successfully');
          
          // Notify popup if it's open
          chrome.runtime.sendMessage({
            type: 'auth-updated',
            target: 'popup',
            sessionId: message.sessionId,
            user: message.user
          }).catch(() => {
            console.log('Popup not open, ignoring error');
          });
          
          sendResponse({ success: true });
        } catch (error) {
          console.error('Failed to store session:', error);
          sendResponse({ success: false, error: error.message });
        }
        break;
        
      // Forward messages from offscreen to popup
      case 'recording-started':
      case 'recording-completed':
      case 'recording-error':
        // These are forwarded automatically by Chrome runtime
        break;
        
      default:
        console.log('Unknown message type:', message.type);
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  } catch (error) {
    console.error('Background script error:', error);
    sendResponse({ success: false, error: error.message });
  }
  
  return true; // Keep the messaging channel open for async response
});

// Listen for tab updates to detect repo changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('github.com')) {
    console.log('GitHub tab updated:', tab.url);
    // Send message to popup if it's listening
    chrome.runtime.sendMessage({
      type: 'tab-updated',
      target: 'popup',
      url: tab.url
    }).catch(() => {
      // Popup might not be open, ignore error
    });
  }
});

// Handle browser action clicks (when popup can't open)
chrome.action.onClicked.addListener(async (tab) => {
  console.log('Extension icon clicked on tab:', tab.url);
  // Could open a new tab with recorder if popup fails
});