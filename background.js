// Make sure the alarms permission is in the manifest.json file:
// "permissions": ["tabs", "storage", "identity", "activeTab", "alarms"]

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

// Listen for installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Open onboarding page
    chrome.tabs.create({
      url: chrome.runtime.getURL('onboarding.html')
    });
  }
});

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
  console.log('Background script queueing sync for user:', userId);
  
  // Store locally
  chrome.storage.local.set({ stats });
  
  // Queue sync operation for when popup opens
  chrome.storage.local.set({ 
    pendingSync: { 
      userId, 
      timestamp: Date.now() 
    }
  });
  
  // Send message to all tabs to refresh stats
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      chrome.tabs.sendMessage(tab.id, { action: 'refreshStats' })
        .catch(() => {}); // Ignore errors for tabs that don't have our content script
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