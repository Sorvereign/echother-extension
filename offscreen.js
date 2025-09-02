// Offscreen document for audio recording
// This runs in the background and has access to getUserMedia

let mediaRecorder = null;
let chunks = [];
let recording = false;
let recordingStartTime = 0;

// Listen for messages from the popup
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return;
  
  console.log('Offscreen received message:', message.type);
  
  try {
    switch (message.type) {
      case 'ping':
        // Simple ping to check if offscreen document is alive
        sendResponse({ success: true, timestamp: Date.now() });
        break;
        
      case 'start-recording':
        await startRecording();
        sendResponse({ success: true });
        break;
        
      case 'stop-recording':
        const audioData = await stopRecording();
        sendResponse({ success: true, audioData });
        break;
        
      case 'check-permissions':
        const hasPermission = await checkMicrophoneAccess();
        sendResponse({ hasPermission });
        break;
        
      case 'check-recording-status':
        // Check if currently recording
        sendResponse({ 
          success: true, 
          isRecording: recording,
          recordingTime: recording ? Date.now() - recordingStartTime : 0
        });
        break;
        
      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  } catch (error) {
    console.error('Offscreen error:', error);
    sendResponse({ success: false, error: error.message });
  }
  
  return true; // Keep the message channel open for async response
});

async function checkMicrophoneAccess() {
  try {
    // Try to get a temporary stream to check permissions
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      } 
    });
    
    // Immediately stop the stream
    stream.getTracks().forEach(track => track.stop());
    return true;
  } catch (error) {
    console.log('Microphone access check failed:', error.name);
    return false;
  }
}

async function startRecording() {
  if (recording) {
    throw new Error('Already recording');
  }
  
  console.log('Starting audio recording...');
  
  try {
    // Request microphone access with optimal settings
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
        channelCount: 1
      }
    });
    
    console.log('Got media stream:', stream.getTracks().map(t => t.kind));
    
    // Clear previous chunks
    chunks = [];
    
    // Determine best MIME type
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
    
    // Create MediaRecorder
    mediaRecorder = new MediaRecorder(stream, { 
      mimeType,
      audioBitsPerSecond: 128000
    });
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
        console.log('Audio chunk recorded:', event.data.size, 'bytes');
        
        // Note: Real-time processing removed for simplicity
      }
    };
    
    mediaRecorder.onstop = () => {
      console.log('MediaRecorder stopped');
      // Stop all tracks to release microphone
      stream.getTracks().forEach(track => {
        track.stop();
        console.log('Track stopped:', track.kind);
      });
    };
    
    mediaRecorder.onerror = (event) => {
      console.error('MediaRecorder error:', event.error);
      recording = false;
    };
    
    // Start recording with 1-second intervals
    mediaRecorder.start(1000);
    recording = true;
    recordingStartTime = Date.now();
    
    console.log('Recording started successfully at:', recordingStartTime);
    
    // Notify popup that recording started
    chrome.runtime.sendMessage({
      type: 'recording-started',
      target: 'popup'
    });
    
  } catch (error) {
    console.error('Failed to start recording:', error);
    recording = false;
    
    // Notify popup of the error
    chrome.runtime.sendMessage({
      type: 'recording-error',
      target: 'popup',
      error: {
        name: error.name,
        message: error.message
      }
    });
    
    throw error;
  }
}

async function stopRecording() {
  if (!recording || !mediaRecorder) {
    throw new Error('Not currently recording');
  }
  
  console.log('Stopping audio recording...');
  
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Recording stop timeout'));
    }, 5000);
    
    mediaRecorder.onstop = () => {
      clearTimeout(timeoutId);
      
      console.log('Recording stopped, processing', chunks.length, 'chunks');
      
      if (chunks.length === 0) {
        reject(new Error('No audio data recorded'));
        return;
      }
      
      // Create final blob
      const blob = new Blob(chunks, { type: mediaRecorder.mimeType });
      console.log('Final audio blob size:', blob.size, 'bytes');
      
      // Convert blob to array buffer for transfer
      const reader = new FileReader();
      reader.onload = () => {
        const arrayBuffer = reader.result;
        
        // Notify popup that recording completed
        chrome.runtime.sendMessage({
          type: 'recording-completed',
          target: 'popup'
        });
        
        resolve({
          audioData: arrayBuffer,
          mimeType: mediaRecorder.mimeType,
          size: blob.size
        });
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read audio data'));
      };
      
      reader.readAsArrayBuffer(blob);
      
      recording = false;
      recordingStartTime = 0;
      mediaRecorder = null;
      chunks = [];
    };
    
    mediaRecorder.stop();
  });
}

console.log('Offscreen document loaded and ready');
