// Make sure the alarms permission is in the manifest.json file:
// "permissions": ["tabs", "storage", "identity", "activeTab", "alarms"]

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

// Initialize Firebase when service worker starts
let firebaseInitialized = false;
let firestoreDB = null;

function initializeFirebaseIfNeeded() {
  if (!firebaseInitialized) {
    try {
      // Check if Firebase app already exists
      try {
        firebase.app();
      } catch (e) {
        // Initialize if it doesn't exist
        firebase.initializeApp(firebaseConfig);
      }
      
      // Initialize Firestore
      firestoreDB = firebase.firestore();
      
      firebaseInitialized = true;
      console.log('Firebase initialized in background script');
      return true;
    } catch (err) {
      console.error('Failed to initialize Firebase:', err);
      return false;
    }
  }
  return true;
}

// Initialize Firebase on service worker startup
initializeFirebaseIfNeeded();

// Function to retry pending syncs
const retryPendingSync = () => {
  chrome.storage.local.get(['pendingSync'], (result) => {
    if (result.pendingSync && result.pendingSync.userId && (result.pendingSync.stats || result.pendingSync.timestamp)) {
      console.log('Found pending sync, retrying...');
      const userId = result.pendingSync.userId;
      
      // If we have the stats directly in pendingSync, use them
      if (result.pendingSync.stats) {
        syncWithFirestore(userId, result.pendingSync.stats);
      } else {
        // Otherwise get the current stats
        chrome.storage.local.get(['stats'], (statsResult) => {
          if (statsResult.stats) {
            syncWithFirestore(userId, statsResult.stats);
          }
        });
      }
    }
  });
};

// Set up a periodic check for pending syncs
chrome.alarms.create('syncRetry', { periodInMinutes: 5 }); // Check every 5 minutes

// Listen for installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Open onboarding page
    chrome.tabs.create({
      url: chrome.runtime.getURL('onboarding.html')
    });
  }
  
  // Check for pending syncs on startup
  retryPendingSync();
});

// Also check for pending syncs when the service worker starts
retryPendingSync();

// Function to check if day has changed and update streak accordingly
const checkDayChange = async () => {
  chrome.storage.local.get(['stats', 'user'], (result) => {
    if (!result.stats || !result.user) return;
    
    const stats = result.stats;
    const today = new Date().toISOString().split('T')[0];
    const lastUpdated = stats.lastUpdated;
    
    if (today !== lastUpdated) {
      // If more than one day has passed and yesterday's count was less than 20, reset streak
      const lastDate = new Date(lastUpdated);
      const todayDate = new Date(today);
      const diffTime = Math.abs(todayDate - lastDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays > 1 || stats.todayCount < 20) {
        stats.streak = 0;
      }
      
      // If user completed yesterday's goal, increment streak
      if (stats.todayCount >= 20 && diffDays === 1) {
        stats.streak += 1;
      }
      
      // Reset today's count
      stats.todayCount = 0;
      stats.lastUpdated = today;
      
      // Update storage
      chrome.storage.local.set({ stats }, () => {
        syncWithFirestore(result.user.uid, stats);
      });
    }
  });
};

// Function to sync data with Firestore
const syncWithFirestore = (userId, stats) => {
  console.log('Background script syncing immediately for user:', userId);
  
  // Make sure Firebase is initialized
  if (!initializeFirebaseIfNeeded()) {
    console.error('Failed to initialize Firebase, storing pending sync');
    chrome.storage.local.set({
      pendingSync: {
        userId,
        timestamp: Date.now(),
        stats: stats
      }
    });
    return;
  }
  
  // Validate stats object
  if (!stats || typeof stats !== 'object') {
    console.error('Invalid stats object:', stats);
    return;
  }
  
  // Ensure stats has userId
  if (!stats.userId) {
    stats.userId = userId;
  }
  
  // Ensure stats has appliedJobs array
  if (!Array.isArray(stats.appliedJobs)) {
    stats.appliedJobs = [];
  }
  
  // Clean stats object for Firestore - avoid nested structure
  const cleanedStats = {
    userId: stats.userId,
    streak: stats.streak || 0,
    todayCount: stats.todayCount || 0,
    lastUpdated: stats.lastUpdated || new Date().toISOString().split('T')[0],
    appliedJobs: stats.appliedJobs.map(job => ({
      url: job.url || '',
      title: job.title || '',
      date: job.date || new Date().toISOString().split('T')[0],
      lastTracked: Boolean(job.lastTracked),
      timestamp: job.timestamp || new Date().toISOString(),
      favicon: job.favicon || ''
    })),
    _timestamp: firebase.firestore.FieldValue.serverTimestamp()
  };
  
  // Update Firestore
  try {
    console.log('Updating Firestore document with cleaned data');
    
    // Check if document exists
    firestoreDB.collection('users').doc(userId).get()
      .then((doc) => {
        if (doc.exists) {
          // Update existing document
          return firestoreDB.collection('users').doc(userId).update(cleanedStats);
        } else {
          // Create new document with user info
          return firestoreDB.collection('users').doc(userId).set({
            ...cleanedStats,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
      })
      .then(() => {
        console.log('Firestore DB updated successfully.');
        // Clear any pending sync after success
        chrome.storage.local.set({
          pendingSyncResolved: true
        });
      })
      .catch((err) => {
        console.error('Error updating Firestore DB:', err);
        // Store for retry
        chrome.storage.local.set({
          pendingSync: {
            userId,
            timestamp: Date.now(),
            stats: stats
          }
        });
      });
  } catch (error) {
    console.error('Failed to access Firestore DB:', error);
    // Save pending sync
    chrome.storage.local.set({
      pendingSync: {
        userId,
        timestamp: Date.now(),
        stats: stats
      }
    });
  }
  
  // Update local chrome storage with cleaned structure
  chrome.storage.local.set({ stats: cleanedStats });
  
  // Send message to all tabs so that content UIs refresh immediately
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      chrome.tabs.sendMessage(tab.id, { action: 'refreshStats' })
        .catch(() => {}); // Ignore errors for tabs missing our content script
    });
  });
};

// Schedule daily check
chrome.alarms.create('dailyCheck', { periodInMinutes: 60 }); // Check every hour

// Listen for scheduled checks
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dailyCheck') {
    checkDayChange();
  }
  
  if (alarm.name === 'syncRetry') {
    retryPendingSync();
  }
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'syncStats') {
    console.log('Received syncStats message');
    chrome.storage.local.get(['user', 'stats'], (result) => {
      if (result.user && result.stats) {
        console.log('Found user and stats, syncing with Firestore');
        
        // Make sure Firebase is initialized before syncing
        if (initializeFirebaseIfNeeded()) {
          // Call the sync function
          syncWithFirestore(result.user.uid, result.stats);
          sendResponse({ status: 'success' });
        } else {
          console.error('Failed to initialize Firebase for sync');
          sendResponse({ status: 'error', message: 'Failed to initialize Firebase' });
        }
      } else {
        console.error('Missing user or stats, cannot sync with Firestore');
        sendResponse({ status: 'error', message: 'Missing user or stats' });
      }
    });
    return true; // Keep the message channel open for async responses
  }
  
  if (request.action === 'userLoggedIn') {
    // Update all tabs with new user data
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, { action: 'refreshStats' })
          .catch(() => {}); // Ignore errors for tabs that don't have our content script
      });
    });
    sendResponse({ status: 'success' });
    return true; // Keep the message channel open for async responses
  }
  
  if (request.action === 'userLoggedOut') {
    // Reset Firebase initialization state
    firebaseInitialized = false;
    firestoreDB = null;
    
    // Clear any stored data
    chrome.storage.local.remove(['stats', 'pendingSync', 'pendingSyncResolved'], () => {
      console.log('Background: User data cleared on logout');
    });
    
    // Update all tabs to reflect logged out state
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, { action: 'userLoggedOut' })
          .catch(() => {}); // Ignore errors for tabs that don't have our content script
      });
    });
    
    sendResponse({ status: 'success' });
    return true; // Keep the message channel open for async responses
  }
  
  if (request.action === 'getStats') {
    if (!request.userId) {
      sendResponse({ success: false, message: 'No userId provided' });
      return true;
    }
    
    if (!firestoreDB) {
      initializeFirebaseIfNeeded().then(() => {
        // Get stats from Firestore
        firestoreDB.collection('users').doc(request.userId).get()
          .then((doc) => {
            if (doc.exists) {
              const docData = doc.data();
              
              // Prepare default stats
              const defaultStats = {
                userId: request.userId,
                todayCount: 0,
                streak: 0,
                lastUpdated: new Date().toISOString().split('T')[0],
                appliedJobs: []
              };
              
              // Handle flattened structure (new format)
              if (Array.isArray(docData.appliedJobs)) {
                // This is the new flattened structure
                const validStats = {
                  userId: docData.userId || request.userId,
                  todayCount: typeof docData.todayCount === 'number' ? docData.todayCount : 0,
                  streak: typeof docData.streak === 'number' ? docData.streak : 0,
                  lastUpdated: docData.lastUpdated || new Date().toISOString().split('T')[0],
                  appliedJobs: Array.isArray(docData.appliedJobs) ? docData.appliedJobs : []
                };
                
                sendResponse({ success: true, stats: validStats });
              }
              // Handle nested structure (old format)
              else if (docData.stats && typeof docData.stats === 'object') {
                // Using old nested structure, extract and convert
                const stats = docData.stats;
                
                // Create flattened structure 
                const flattenedStats = {
                  userId: stats.userId || request.userId,
                  todayCount: typeof stats.todayCount === 'number' ? stats.todayCount : 0,
                  streak: typeof stats.streak === 'number' ? stats.streak : 0,
                  lastUpdated: stats.lastUpdated || new Date().toISOString().split('T')[0],
                  appliedJobs: Array.isArray(stats.appliedJobs) ? stats.appliedJobs : []
                };
                
                // Update the document to use the new structure
                firestoreDB.collection('users').doc(request.userId).update(flattenedStats)
                  .catch(error => {
                    console.error('Error updating document to new structure:', error);
                  });
                
                sendResponse({ success: true, stats: flattenedStats });
              } 
              // Handle malformed document
              else {
                console.log('Document exists but has invalid structure, using default stats');
                // Store default stats to Firestore
                firestoreDB.collection('users').doc(request.userId).update(defaultStats)
                  .catch(error => {
                    console.error('Error creating default stats in Firestore:', error);
                  });
                
                sendResponse({ success: true, stats: defaultStats });
              }
            } else {
              // Create default stats for new user
              const defaultStats = {
                userId: request.userId,
                todayCount: 0,
                streak: 0,
                lastUpdated: new Date().toISOString().split('T')[0],
                appliedJobs: [],
                _timestamp: firebase.firestore.FieldValue.serverTimestamp()
              };
              
              // Create a new document
              firestoreDB.collection('users').doc(request.userId).set({
                ...defaultStats,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
              }).catch(error => {
                console.error('Error creating new document:', error);
              });
              
              sendResponse({ success: true, stats: defaultStats });
            }
          })
          .catch((error) => {
            console.error('Error getting stats from Firestore:', error);
            sendResponse({ success: false, message: error.message });
          });
      });
    } else {
      // Same logic as above but without the initialization promise
      firestoreDB.collection('users').doc(request.userId).get()
        .then((doc) => {
          if (doc.exists) {
            const docData = doc.data();
            
            // Prepare default stats
            const defaultStats = {
              userId: request.userId,
              todayCount: 0,
              streak: 0,
              lastUpdated: new Date().toISOString().split('T')[0],
              appliedJobs: []
            };
            
            // Handle flattened structure (new format)
            if (Array.isArray(docData.appliedJobs)) {
              // This is the new flattened structure
              const validStats = {
                userId: docData.userId || request.userId,
                todayCount: typeof docData.todayCount === 'number' ? docData.todayCount : 0,
                streak: typeof docData.streak === 'number' ? docData.streak : 0,
                lastUpdated: docData.lastUpdated || new Date().toISOString().split('T')[0],
                appliedJobs: Array.isArray(docData.appliedJobs) ? docData.appliedJobs : []
              };
              
              sendResponse({ success: true, stats: validStats });
            }
            // Handle nested structure (old format)
            else if (docData.stats && typeof docData.stats === 'object') {
              // Using old nested structure, extract and convert
              const stats = docData.stats;
              
              // Create flattened structure 
              const flattenedStats = {
                userId: stats.userId || request.userId,
                todayCount: typeof stats.todayCount === 'number' ? stats.todayCount : 0,
                streak: typeof stats.streak === 'number' ? stats.streak : 0,
                lastUpdated: stats.lastUpdated || new Date().toISOString().split('T')[0],
                appliedJobs: Array.isArray(stats.appliedJobs) ? stats.appliedJobs : []
              };
              
              // Update the document to use the new structure
              firestoreDB.collection('users').doc(request.userId).update(flattenedStats)
                .catch(error => {
                  console.error('Error updating document to new structure:', error);
                });
              
              sendResponse({ success: true, stats: flattenedStats });
            } 
            // Handle malformed document
            else {
              console.log('Document exists but has invalid structure, using default stats');
              // Store default stats to Firestore
              firestoreDB.collection('users').doc(request.userId).update(defaultStats)
                .catch(error => {
                  console.error('Error creating default stats in Firestore:', error);
                });
              
              sendResponse({ success: true, stats: defaultStats });
            }
          } else {
            // Create default stats for new user
            const defaultStats = {
              userId: request.userId,
              todayCount: 0,
              streak: 0,
              lastUpdated: new Date().toISOString().split('T')[0],
              appliedJobs: [],
              _timestamp: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            // Create a new document
            firestoreDB.collection('users').doc(request.userId).set({
              ...defaultStats,
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(error => {
              console.error('Error creating new document:', error);
            });
            
            sendResponse({ success: true, stats: defaultStats });
          }
        })
        .catch((error) => {
          console.error('Error getting stats from Firestore:', error);
          sendResponse({ success: false, message: error.message });
        });
    }
    
    return true; // Keep the message channel open for async response
  }
  
  if (request.action === 'updateStats') {
    if (!request.userId || !request.stats) {
      sendResponse({ success: false, message: 'Missing userId or stats' });
      return true;
    }
    
    // Validate stats object
    if (!request.stats || typeof request.stats !== 'object') {
      sendResponse({ success: false, message: 'Invalid stats object' });
      return true;
    }
    
    // Ensure required stats fields
    const stats = request.stats;
    
    // Clean the stats object to use flattened structure
    const cleanedStats = {
      userId: stats.userId || request.userId,
      todayCount: typeof stats.todayCount === 'number' ? stats.todayCount : 0,
      streak: typeof stats.streak === 'number' ? stats.streak : 0,
      lastUpdated: stats.lastUpdated || new Date().toISOString().split('T')[0],
      appliedJobs: Array.isArray(stats.appliedJobs) ? stats.appliedJobs.map(job => ({
        url: job.url || '',
        title: job.title || '',
        date: job.date || new Date().toISOString().split('T')[0],
        lastTracked: Boolean(job.lastTracked),
        timestamp: job.timestamp || new Date().toISOString(),
        favicon: job.favicon || ''
      })) : [],
      _timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    if (!firestoreDB) {
      initializeFirebaseIfNeeded().then(() => {
        // Update stats in Firestore
        firestoreDB.collection('users').doc(request.userId).set(cleanedStats, { merge: true })
          .then(() => {
            sendResponse({ success: true });
          })
          .catch((error) => {
            console.error('Error updating stats in Firestore:', error);
            sendResponse({ success: false, message: error.message });
          });
      });
    } else {
      // Update stats in Firestore
      firestoreDB.collection('users').doc(request.userId).set(cleanedStats, { merge: true })
        .then(() => {
          sendResponse({ success: true });
        })
        .catch((error) => {
          console.error('Error updating stats in Firestore:', error);
          sendResponse({ success: false, message: error.message });
        });
    }
    
    return true; // Keep the message channel open for async response
  }
  
  return true; // Keep the message channel open for async responses
});