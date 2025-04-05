// Make sure the alarms permission is in the manifest.json file:
// "permissions": ["tabs", "storage", "identity", "activeTab", "alarms"]

// Import Firebase SDK
importScripts('lib/firebase-app-compat.js');
importScripts('lib/firebase-database-compat.js');

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

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

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
        syncWithFirebase(result.user.uid, stats);
      });
    }
  });
};

// Function to sync data with Firebase
const syncWithFirebase = (userId, stats) => {
  console.log('Background script syncing immediately for user:', userId);
  
  // Always try to update Firebase
  try {
    const dbRef = firebase.database().ref(`users/${userId}/stats`);
    dbRef.set(stats)
      .then(() => {
        console.log('Firebase DB updated successfully.');
        
        // Clear any pending sync after success
        chrome.storage.local.set({
          pendingSyncResolved: true
        });
      })
      .catch((err) => {
        console.error('Error updating Firebase DB:', err);
        // Keep track of pending sync for retry later
        chrome.storage.local.set({
          pendingSync: {
            userId,
            timestamp: Date.now(),
            stats: stats
          }
        });
      });
  } catch (error) {
    console.error('Failed to access Firebase:', error);
    // Save pending sync
    chrome.storage.local.set({
      pendingSync: {
        userId,
        timestamp: Date.now(),
        stats: stats
      }
    });
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
    chrome.storage.local.get(['user', 'stats'], (result) => {
      if (result.user && result.stats) {
        syncWithFirebase(result.user.uid, result.stats);
      }
    });
    sendResponse({ status: 'success' });
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
  }
  
  return true; // Keep the message channel open for async responses
});