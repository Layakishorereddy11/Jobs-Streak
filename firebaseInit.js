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

// Initialize Firebase with custom settings
firebase.initializeApp(firebaseConfig);

// Auth and Firestore instances
const auth = firebase.auth();
const db = firebase.firestore();

// Set Firestore settings with merge to avoid overriding warnings
db.settings({
  cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
  merge: true
});

// Use modern cache settings instead of deprecated enableMultiTabIndexedDbPersistence
db.settings({
  cache: {
    synchronizeTabs: true
  },
  merge: true
});

// Define global connection state variable
let isConnected = false;

// Monitor connection status using navigator.onLine
function monitorConnection() {
  // Start with online status from navigator
  isConnected = navigator.onLine;
  console.log('Initial connection status:', isConnected ? 'online' : 'offline');
  
  // Listen for online/offline events
  window.addEventListener('online', () => {
    console.log('Device went online');
    isConnected = true;
    
    // Attempt to sync when we go back online
    const user = auth.currentUser;
    if (user) {
      chrome.storage.local.get(['stats'], (result) => {
        if (result.stats) {
          syncUserData(user.uid);
        }
      });
    }
  });
  
  window.addEventListener('offline', () => {
    console.log('Device went offline');
    isConnected = false;
  });
  
  // Periodically ping Firestore to verify connection
  setInterval(() => {
    // Simple timestamp ping to check Firestore availability
    if (navigator.onLine) {
      db.collection('_connection_test_').doc('ping')
        .set({ timestamp: firebase.firestore.FieldValue.serverTimestamp() })
        .then(() => {
          if (!isConnected) {
            console.log('Connection restored to Firestore');
            isConnected = true;
            
            // Sync data if we regained connection
            const user = auth.currentUser;
            if (user) {
              chrome.storage.local.get(['stats'], (result) => {
                if (result.stats) {
                  syncUserData(user.uid);
                }
              });
            }
          }
        })
        .catch((error) => {
          console.log('Firestore ping failed:', error);
          isConnected = false;
        });
    } else {
      isConnected = false;
    }
  }, 60000); // Check every minute
}

// Initialize connection monitoring
monitorConnection();

// Function to pull data from Firestore to Chrome storage
function syncUserData(userId) {
  console.log('Pulling data from Firestore for user:', userId);
  
  // Send message to background script to get data from Firestore
  chrome.runtime.sendMessage({ 
    action: 'getStats', 
    userId: userId 
  })
  .then(response => {
    if (response && response.success && response.stats) {
      console.log('Successfully fetched stats from Firestore');
    } else {
      console.log('No stats found in Firestore or error occurred');
    }
  })
  .catch(error => {
    console.error('Error getting stats from Firestore:', error);
    
    // Store that we need to sync later
    chrome.storage.local.set({ 
      pendingSync: { 
        userId, 
        timestamp: Date.now(),
        pullOnly: true  // Flag to indicate we only want to pull data
      }
    });
  });
}

// Auth state observer
auth.onAuthStateChanged((user) => {
  if (user) {
    // User is signed in
    const userData = {
      uid: user.uid,
      displayName: user.displayName || '',
      email: user.email || '',
      photoURL: user.photoURL || ''
    };
    
    // Store user info in Chrome storage for persistent login across popup sessions
    chrome.storage.local.set({ user: userData }, () => {
      // Instead of syncing data TO Firestore, request stats FROM Firestore
      console.log('User logged in, fetching stats from Firestore');
      chrome.runtime.sendMessage({ 
        action: 'getStats', 
        userId: user.uid 
      }).catch(error => {
        console.log("Could not send getStats message to background", error);
      });
    });
    
    // Notify background script about login
    chrome.runtime.sendMessage({ action: 'userLoggedIn' })
      .catch(error => {
        console.log("Could not send login message to background", error);
      });
  } else {
    // User is signed out - clear ALL user data from storage
    chrome.storage.local.remove(['user', 'stats', 'pendingSync', 'pendingSyncResolved'], () => {
      console.log('User data cleared from Chrome storage on logout');
    });
    
    // Notify all tabs that user is logged out
    chrome.runtime.sendMessage({ action: 'userLoggedOut' })
      .catch(error => {
        console.log("Could not send logout message to background", error);
      });
  }
});

// Setup Firebase auth persistence
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
  .catch((error) => {
    console.error("Error setting auth persistence:", error);
  }); 