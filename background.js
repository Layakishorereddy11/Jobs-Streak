// Make sure the alarms permission is in the manifest.json file:
// "permissions": ["tabs", "storage", "identity", "activeTab", "alarms"]

importScripts('firebase-config.js');
// Import Firebase SDK (only the necessary modules)
importScripts('lib/firebase-app-compat.js');
importScripts('lib/firebase-firestore-compat.js');
importScripts('lib/firebase-auth-compat.js');

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAEJrsFagxQs8KmaG47fKKzcC_81LAJ4R8",
  authDomain: "jobs-streak.firebaseapp.com",
  projectId: "jobs-streak",
  storageBucket: "jobs-streak.firebasestorage.app",
  messagingSenderId: "848377435066",
  appId: "1:848377435066:web:a809f63b3b1a99c9768383",
  measurementId: "G-87ZXGEFB07"
};

// Global variables for Firebase
let firebaseInitialized = false;
let firestoreDB = null;

// Initialize Firebase
function initializeFirebaseIfNeeded() {
  if (!firebaseInitialized) {
    try {
      try { firebase.app(); } catch (e) { firebase.initializeApp(firebaseConfig); }
      firestoreDB = firebase.firestore();
      firebaseInitialized = true;
      return true;
    } catch (err) {
      console.error('Failed to initialize Firebase:', err);
      return false;
    }
  }
  return true;
}

// Example function to set API keys from environment or file
function setup_api_keys(keys_file=null) {
    """Set up API keys from environment variables or a keys file"""
    importScripts('download-libs.js')
    let os;
    if (typeof require !== 'undefined') {
      os = require('os');
    }

    let json;
    if (typeof require !== 'undefined') {
      json = require('json');
    }
    
    if (keys_file && fileExists(keys_file)) {
        let keys;
        if (typeof require !== 'undefined') {
        const fs = require('fs');
          keys = JSON.parse(fs.readFileSync(keys_file, 'utf-8'));
        }
            
        if ('openai' in keys) {
            if (typeof process !== 'undefined') { process.env['OPENAI_API_KEY'] = keys['openai']; }
        }
        if ('gemini' in keys) {
            if (typeof process !== 'undefined'){ process.env['GEMINI_API_KEY'] = keys['gemini'];}
        }
        if ('grok' in keys) {
          if(typeof process !== 'undefined'){  process.env['GROK_API_KEY'] = keys['grok'];}
        }
            
    }
    // Validate we have at least one API key
    let apis_available = [];
    if (typeof process !== 'undefined') {
        if (process.env.OPENAI_API_KEY) {
          apis_available.push('openai');
        }
        if (process.env.GEMINI_API_KEY) {
          apis_available.push('gemini');
        }
        if (process.env.GROK_API_KEY) {
          apis_available.push('grok');
        }
    }
    if (!apis_available.length) {
        throw new Error("No API keys found. Please set environment variables or provide a keys file.");
    }
  }
  return true;
}

// Initialize on startup
initializeFirebaseIfNeeded();

// Process any pending sync operations
const retryPendingSync = () => {
  chrome.storage.local.get(['pendingSync'], (result) => {
    if (result.pendingSync?.userId) {
      console.log('Found pending sync, retrying...');
      const userId = result.pendingSync.userId;
      
      if (result.pendingSync.stats) {
        syncWithFirestore(userId, result.pendingSync.stats);
      } else {
        chrome.storage.local.get(['stats'], (statsResult) => {
          if (statsResult.stats) {
            syncWithFirestore(userId, statsResult.stats);
          }
        });
      }
    }
  });
};

// Set up periodic sync checks
chrome.alarms.create('syncRetry', { periodInMinutes: 5 });

// Listen for installation and startup events
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
  }
  retryPendingSync();
});

// Check for day change and update streak
const checkDayChange = () => {
  chrome.storage.local.get(['stats', 'user'], (result) => {
    if (!result.stats || !result.user) return;
    
    const stats = result.stats;
    const today = new Date().toISOString().split('T')[0];
    const lastUpdated = stats.lastUpdated;
    
    if (today !== lastUpdated) {
      // Update streak logic
      const lastDate = new Date(lastUpdated);
      const todayDate = new Date(today);
      const diffTime = Math.abs(todayDate - lastDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays > 1 || stats.todayCount < 20) {
        stats.streak = 0;
      } else if (stats.todayCount >= 20 && diffDays === 1) {
        stats.streak += 1;
      }
      
      // Reset today's count
      stats.todayCount = 0;
      stats.lastUpdated = today;
      
      // Update storage and Firestore
      chrome.storage.local.set({ stats }, () => {
        syncWithFirestore(result.user.uid, stats);
      });
    }
  });
};

// Function to sync stats with Firestore
const syncWithFirestore = (userId, stats) => {
  if (!initializeFirebaseIfNeeded()) {
    console.error('Firestore DB not initialized');
    storePendingSync(userId, stats);
    return;
  }
  
  if (!stats || typeof stats !== 'object') {
    console.error('Invalid stats object:', stats);
    return;
  }
  
  // Create standardized Firestore document structure
  const firestoreData = {
    lastUpdated: stats.lastUpdated || new Date().toISOString().split('T')[0],
    stats: {
      streak: stats.streak || 0,
      todayCount: stats.todayCount || 0,
      appliedJobs: Array.isArray(stats.appliedJobs) ? stats.appliedJobs.map(job => ({
        company: job.company || extractCompanyFromUrl(job.url),
        date: job.date || new Date().toISOString().split('T')[0],
        lastTracked: Boolean(job.lastTracked),
        timestamp: job.timestamp || firebase.firestore.Timestamp.now(),
        title: job.title || '',
        url: job.url || ''
      })) : []
    },
    userId: userId,
    _timestamp: firebase.firestore.FieldValue.serverTimestamp()
  };
  
  // Update or create Firestore document
  try {
    firestoreDB.collection('users').doc(userId).get()
      .then((doc) => {
        if (doc.exists) {
          return firestoreDB.collection('users').doc(userId).update(firestoreData);
        } else {
          return firestoreDB.collection('users').doc(userId).set({
            ...firestoreData,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
      })
      .then(() => {
        chrome.storage.local.set({ pendingSyncResolved: true });
      })
      .catch((err) => {
        console.error('Error updating Firestore DB:', err);
        storePendingSync(userId, stats);
      });
  } catch (error) {
    console.error('Failed to access Firestore DB:', error);
    storePendingSync(userId, stats);
  }
  
  // Update local storage
  chrome.storage.local.set({ stats });
  
  // Notify all tabs - send both refresh and updateButtonStates messages
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      // Send refreshStats message for overall UI update
      chrome.tabs.sendMessage(tab.id, { action: 'refreshStats' }).catch(() => {
        console.log('Failed to send refreshStats to tab:', tab.id);
      });
      
      // Send statsUpdated message specifically for button states
      chrome.tabs.sendMessage(tab.id, { action: 'statsUpdated' }).catch(() => {
        console.log('Failed to send statsUpdated to tab:', tab.id);
      });
    });
  });
};

// Store a pending sync operation
const storePendingSync = (userId, stats) => {
  chrome.storage.local.set({
    pendingSync: {
      userId,
      timestamp: Date.now(),
      stats: stats
    }
  });
};

// Extract company name from URL
const extractCompanyFromUrl = (url) => {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    const domain = hostname.split('.')[0];
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  } catch (e) {
    return '';
  }
};

// Schedule daily check
chrome.alarms.create('dailyCheck', { periodInMinutes: 60 });

// Listen for scheduled alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dailyCheck') checkDayChange();
  if (alarm.name === 'syncRetry') retryPendingSync();
});

// Message handler for all extension communication
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  //ensure api key is present before calling
  setup_api_keys('keys.json')
  // Sync user stats with Firestore
  if (request.action === 'syncStats') {
        // Function to call Gemini API
    const call_gemini_api = async (prompt) => {
      try {
          const genai = await import("https://esm.sh/@google/generative-ai");
          const apiKey = process.env.GEMINI_API_KEY;
      
        if (!apiKey) {
          throw new Error("Gemini API key not found. Set the GEMINI_API_KEY environment variable.");
        }
        
          genai.configure({ apiKey: apiKey });
          const model = genai.GenerativeModel({ model: "gemini-1.5-flash"});
          const generationConfig = {
            temperature: 0.9,
            topK: 1,
            topP: 1,
            maxOutputTokens: 2048,
          };
          const result = await model.generateContent({contents:[{ role: "user", parts:[{text: prompt}]}],generationConfig});
        
          if (result.response.candidates && result.response.candidates.length > 0) {
              return result.response.candidates[0].content.parts[0].text;
          } else {
              throw new Error("No response generated by Gemini");
          }
        } catch (error) {
        console.error("Gemini API error:", error);
        return "Error: Could not get response from Gemini";
        }
    };
    chrome.storage.local.get(['user', 'stats'], (result) => {
      if (result.user && result.stats) {
        if (initializeFirebaseIfNeeded()) {
          syncWithFirestore(result.user.uid, result.stats);
          sendResponse({ status: 'success' });
        } else {
          sendResponse({ status: 'error', message: 'Failed to initialize Firebase' });
        }
      } else {
        sendResponse({ status: 'error', message: 'Missing user or stats' });
      }
    });
    return true;
  }
  
    // Handle the new generateDocument action
  if (request.action === 'generateDocument') {
      const { jobDescription, documentType } = request;

      if (!jobDescription || !documentType) {
          sendResponse({ status: 'error', error: 'Missing jobDescription or documentType' });
          return true;
      }

      // Determine the appropriate prompt based on the document type
      let prompt = "";
      if (documentType === 'resume') {
          prompt = `Generate a professional resume for a job applicant based on the following job description:\n\n${jobDescription}\n\nThe resume should be well-structured, highlight relevant skills and experiences, and be tailored to this job description.`;
      } else if (documentType === 'coverletter') {
          prompt = `Generate a compelling cover letter for a job applicant based on the following job description:\n\n${jobDescription}\n\nThe cover letter should express strong interest in the position, highlight relevant skills and experiences, and be tailored to this job description.`;
      } else {
          sendResponse({ status: 'error', error: 'Invalid document type' });
          return true;
      }

      // Call Gemini API
      call_gemini_api(prompt)
          .then(document => {
              if (document.startsWith("Error:")) {
                  sendResponse({ status: 'error', error: document });
              } else {
                  sendResponse({ status: 'success', document: document });
              }
          })
          .catch(error => {
              console.error('Error generating document:', error);
              sendResponse({ status: 'error', error: 'Failed to generate document' });
          });

      return true; // Indicates that the response will be sent asynchronously
  }
    

    // User logged in - update all tabs

  
  if (request.action === 'userLoggedIn') {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, { action: 'refreshStats' }).catch(() => {});
      });
    });
    sendResponse({ status: 'success' });
    return true;
  }
  
  // User logged out - clear data and update tabs
  if (request.action === 'userLoggedOut') {
    firebaseInitialized = false;
    firestoreDB = null;
    
    chrome.storage.local.remove(['stats', 'pendingSync', 'pendingSyncResolved'], () => {
      console.log('Background: User data cleared on logout');
    });
    
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, { action: 'userLoggedOut' }).catch(() => {});
      });
    });
    
    sendResponse({ status: 'success' });
    return true;
  }
  
  // Get user stats from Firestore
  if (request.action === 'getStats') {
    if (!request.userId) {
      sendResponse({ success: false, message: 'No userId provided' });
      return true;
    }
    
    const fetchStats = () => {
      firestoreDB.collection('users').doc(request.userId).get()
        .then((doc) => {
          const defaultStats = createDefaultStats(request.userId);
          
          if (doc.exists) {
            const docData = doc.data();
            
            // Handle the new structure (stats contains appliedJobs)
            if (docData.stats?.appliedJobs) {
              const validStats = {
                userId: request.userId,
                todayCount: docData.stats.todayCount || 0,
                streak: docData.stats.streak || 0,
                lastUpdated: docData.lastUpdated || new Date().toISOString().split('T')[0],
                appliedJobs: docData.stats.appliedJobs || []
              };
              sendResponse({ success: true, stats: validStats });
            }
            // Handle legacy structure and migrate
            else if (Array.isArray(docData.appliedJobs)) {
              migrateToNewStructure(request.userId, docData);
              
              const validStats = {
                userId: request.userId,
                todayCount: docData.todayCount || 0,
                streak: docData.streak || 0,
                lastUpdated: docData.lastUpdated || new Date().toISOString().split('T')[0],
                appliedJobs: docData.appliedJobs || []
              };
              sendResponse({ success: true, stats: validStats });
            }
            // Handle invalid structure
            else {
              createNewUserDocument(request.userId);
              sendResponse({ success: true, stats: defaultStats });
            }
          } else {
            createNewUserDocument(request.userId);
            sendResponse({ success: true, stats: defaultStats });
          }
        })
        .catch((error) => {
          console.error('Error getting stats from Firestore:', error);
          sendResponse({ success: false, message: error.message });
        });
    };
    
    if (!firestoreDB) {
      initializeFirebaseIfNeeded().then(fetchStats);
    } else {
      fetchStats();
    }
    
    return true;
  }
  
  // Update stats in Firestore
  if (request.action === 'updateStats') {
    if (!request.userId || !request.stats) {
      sendResponse({ success: false, message: 'Missing userId or stats' });
      return true;
    }
    
    if (!request.stats || typeof request.stats !== 'object') {
      sendResponse({ success: false, message: 'Invalid stats object' });
      return true;
    }
    
    const stats = request.stats;
    
    // Format for Firestore
    const firestoreData = {
      lastUpdated: stats.lastUpdated || new Date().toISOString().split('T')[0],
      stats: {
        streak: stats.streak || 0,
        todayCount: stats.todayCount || 0,
        appliedJobs: Array.isArray(stats.appliedJobs) ? stats.appliedJobs.map(job => ({
          company: job.company || extractCompanyFromUrl(job.url),
          date: job.date || new Date().toISOString().split('T')[0],
          lastTracked: Boolean(job.lastTracked),
          timestamp: job.timestamp || firebase.firestore.Timestamp.now(),
          title: job.title || '',
          url: job.url || ''
        })) : []
      },
      userId: request.userId,
      _timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    const updateFirestore = () => {
      firestoreDB.collection('users').doc(request.userId).set(firestoreData, { merge: true })
        .then(() => {
          sendResponse({ success: true });
        })
        .catch((error) => {
          console.error('Error updating stats in Firestore:', error);
          sendResponse({ success: false, message: error.message });
        });
    };
    
    if (!firestoreDB) {
      initializeFirebaseIfNeeded().then(updateFirestore);
    } else {
      updateFirestore();
    }
    
    return true;
  }
  
  return true;
});

// Helper functions
function createDefaultStats(userId) {
  return {
    userId: userId,
    todayCount: 0,
    streak: 0,
    lastUpdated: new Date().toISOString().split('T')[0],
    appliedJobs: []
  };
}

function createNewUserDocument(userId) {
  const newStructure = {
    lastUpdated: new Date().toISOString().split('T')[0],
    stats: {
      streak: 0,
      todayCount: 0,
      appliedJobs: []
    },
    userId: userId,
    _timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  
  firestoreDB.collection('users').doc(userId).set(newStructure)
    .catch(error => {
      console.error('Error creating new document:', error);
    });
}

function migrateToNewStructure(userId, docData) {
  const newStructure = {
    lastUpdated: docData.lastUpdated || new Date().toISOString().split('T')[0],
    stats: {
      streak: docData.streak || 0,
      todayCount: docData.todayCount || 0,
      appliedJobs: docData.appliedJobs || []
    }
  };
  
  firestoreDB.collection('users').doc(userId).update(newStructure)
    .catch(error => {
      console.error('Error updating document to new structure:', error);
    });
}
    // Function to call Gemini API
    const call_gemini_api = async (prompt) => {
      try {
          const genai = await import("https://esm.sh/@google/generative-ai");
          const apiKey = process.env.GEMINI_API_KEY;
      
          if (!apiKey) {
              throw new Error("Gemini API key not found. Set the GEMINI_API_KEY environment variable.");
          }
          // ... (rest of the Gemini API call logic)
      } catch (error) {
          console.error("Gemini API error:", error);
      }
  };