// Make sure the alarms permission is in the manifest.json file:
// "permissions": ["tabs", "storage", "identity", "activeTab", "alarms"]

// Background script counter for testing service worker lifecycle
let backgroundCounter = 1;

// Set up a counter test alarm
chrome.alarms.create('counterTest', { periodInMinutes: 1/60 }); // Every second

// Import Firebase SDK
importScripts('lib/firebase-app-compat.js');
importScripts('lib/firebase-database-compat.js');
importScripts('lib/firebase-firestore-compat.js');
importScripts('lib/firebase-auth-compat.js');

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAEJrsFagxQs8KmaG47fKKzcC_81LAJ4R8",
  authDomain: "jobs-streak.firebaseapp.com",
  databaseURL: "https://jobs-streak-default-rtdb.firebaseio.com",
  projectId: "jobs-streak",
  storageBucket: "jobs-streak.firebasestorage.app",
  messagingSenderId: "848377435066",
  appId: "1:848377435066:web:a809f63b3b1a99c9768383",
  measurementId: "G-87ZXGEFB07"
};

// Initialize Firebase when service worker starts
let firebaseInitialized = false;
let connectionMonitor = null;
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
      
      // Ensure we're connected to Firebase
      firebase.database().goOnline();
      
      // Monitor connection status
      if (!connectionMonitor) {
        connectionMonitor = firebase.database().ref('.info/connected');
        connectionMonitor.on('value', (snap) => {
          const connected = snap.val();
          console.log('Firebase connection status:', connected ? 'connected' : 'disconnected');
          
          // If we've reconnected, check for pending syncs
          if (connected) {
            retryPendingSync();
          }
        });
      }
      
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
        syncWithFirebase(userId, result.pendingSync.stats);
      } else {
        // Otherwise get the current stats
        chrome.storage.local.get(['stats'], (statsResult) => {
          if (statsResult.stats) {
            syncWithFirebase(userId, statsResult.stats);
          }
        });
      }
    }
  });
};

// Set up a periodic check for pending syncs
chrome.alarms.create('syncRetry', { periodInMinutes: 1/60 }); // Check every 5 minutes

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
        syncWithFirebase(result.user.uid, stats);
      });
    }
  });
};

// Function to sync data with Firebase
const syncWithFirebase = (userId, stats) => {
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
  
  let realTimeSuccess = false;
  let firestoreSuccess = false;
  
  // First, update Firebase Realtime Database
  try {
    console.log('Creating new Firebase database reference');
    // Create a fresh database reference each time to avoid stale connections
    const dbRef = firebase.database().ref(`users/${userId}/stats`);
    
    // Set persistence to ensure data is written immediately
    firebase.database().goOnline();
    
    // Use set with force write (with server timestamp to ensure freshness)
    dbRef.set({
      ...stats,
      _serverTimestamp: firebase.database.ServerValue.TIMESTAMP
    })
      .then(() => {
        console.log('Firebase Realtime DB updated successfully.');
        realTimeSuccess = true;
        checkSyncComplete();
      })
      .catch((err) => {
        console.error('Error updating Firebase Realtime DB:', err);
        realTimeSuccess = false;
        checkSyncComplete();
      });
  } catch (error) {
    console.error('Failed to access Firebase Realtime DB:', error);
    realTimeSuccess = false;
    checkSyncComplete();
  }
  
  // Second, update Firestore
  try {
    console.log('Updating Firestore document');
    // Add timestamp for versioning
    const statsWithTimestamp = {
      ...stats,
      _timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // Check if document exists
    firestoreDB.collection('users').doc(userId).get()
      .then((doc) => {
        if (doc.exists) {
          // Update existing document
          return firestoreDB.collection('users').doc(userId).update({ 
            stats: statsWithTimestamp 
          });
        } else {
          // Create new document with user info
          const userData = {
            stats: statsWithTimestamp,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          };
          return firestoreDB.collection('users').doc(userId).set(userData);
        }
      })
      .then(() => {
        console.log('Firestore DB updated successfully.');
        firestoreSuccess = true;
        checkSyncComplete();
      })
      .catch((err) => {
        console.error('Error updating Firestore DB:', err);
        firestoreSuccess = false;
        checkSyncComplete();
      });
  } catch (error) {
    console.error('Failed to access Firestore DB:', error);
    firestoreSuccess = false;
    checkSyncComplete();
  }
  
  // Function to check if both syncs are complete and take appropriate action
  function checkSyncComplete() {
    const anySuccess = realTimeSuccess || firestoreSuccess;
    
    if (anySuccess) {
      // At least one succeeded, clear any pending sync
      chrome.storage.local.set({
        pendingSyncResolved: true
      });
      console.log(`Sync status: Realtime DB: ${realTimeSuccess ? 'Success' : 'Failed'}, Firestore: ${firestoreSuccess ? 'Success' : 'Failed'}`);
    } else {
      // Both failed, store for retry
      chrome.storage.local.set({
        pendingSync: {
          userId,
          timestamp: Date.now(),
          stats: stats
        }
      });
      console.error('Both database updates failed, will retry later');
    }
  }
  
  // Update local chrome storage
  chrome.storage.local.set({ stats });
  
  // Send message to all tabs so that content UIs refresh immediately
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      chrome.tabs.sendMessage(tab.id, { action: 'refreshStats' })
        .catch(() => {}); // Ignore errors for tabs missing our content script
    });
  });
};

// Set up Firebase health check for active connection
chrome.alarms.create('firebaseHealthCheck', { periodInMinutes: 1 }); // Check every minute

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
  
  if (alarm.name === 'firebaseHealthCheck') {
    // Keep Firebase connection alive
    if (firebaseInitialized) {
      try {
        firebase.database().goOnline();
        // Ping the database to keep the connection alive
        firebase.database().ref('.info/connected').once('value')
          .then(snap => {
            console.log('Firebase connection health check:', snap.val() ? 'connected' : 'disconnected');
          })
          .catch(err => {
            console.warn('Firebase health check error:', err);
          });
      } catch (e) {
        console.warn('Health check failed:', e);
      }
    }
  }
  
  // Counter test
  if (alarm.name === 'counterTest') {
    console.log(`Background script counter: ${backgroundCounter}`);
    backgroundCounter++;
    
    // Reset counter after reaching 1000
    if (backgroundCounter > 1000) {
      backgroundCounter = 1;
      console.log('Counter reset to 1');
    }
  }
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'syncStats') {
    console.log('Received syncStats message');
    chrome.storage.local.get(['user', 'stats'], (result) => {
      if (result.user && result.stats) {
        console.log('Found user and stats, syncing with Firebase');
        
        // Make sure Firebase is initialized before syncing
        if (initializeFirebaseIfNeeded()) {
          // Ensure we go online in case connection was lost
          try {
            firebase.database().goOnline();
            console.log('Firebase database connection re-established');
          } catch (e) {
            console.warn('Could not call goOnline:', e);
          }
          
          // Call the sync function with a small delay to ensure database connection is ready
          setTimeout(() => {
            syncWithFirebase(result.user.uid, result.stats);
          }, 100);
          
          sendResponse({ status: 'success' });
        } else {
          console.error('Failed to initialize Firebase for sync');
          sendResponse({ status: 'error', message: 'Failed to initialize Firebase' });
        }
      } else {
        console.error('Missing user or stats, cannot sync with Firebase');
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
  
  return true; // Keep the message channel open for async responses
});