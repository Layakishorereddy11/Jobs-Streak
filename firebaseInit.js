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

// Monitor Firestore connection status
function monitorFirestoreConnection() {
  try {
    // Try to use the Firebase Database connection monitor
    const connRef = firebase.database().ref('.info/connected');
    connRef.on('value', (snap) => {
      isConnected = snap.val() === true;
      console.log('Firebase connection status:', isConnected);
      
      // When we reconnect, sync any changes that happened while offline
      if (isConnected) {
        const user = auth.currentUser;
        if (user) {
          chrome.storage.local.get(['stats'], (result) => {
            if (result.stats) {
              syncUserData(user.uid);
            }
          });
        }
      }
    });
  } catch (e) {
    console.log('Could not monitor connection status, using fallback:', e);
    // Use navigator.onLine as a fallback with periodic checking
    checkConnectionWithFallback();
  }
}

// Fallback connection checker that doesn't rely on Firebase Realtime Database
function checkConnectionWithFallback() {
  // Start with online status from navigator
  isConnected = navigator.onLine;
  console.log('Initial connection status (fallback):', isConnected);
  
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
  
  // Also periodically try to ping Firestore to verify connection
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

// Try to initialize connection monitoring
monitorFirestoreConnection();

// Sync data between Chrome storage and Firebase
function syncUserData(userId) {
  console.log('Syncing data for user:', userId);
  // Get local data
  chrome.storage.local.get(['stats'], (result) => {
    const localStats = result.stats;
    
    if (!localStats) {
      console.log('No local stats found, skipping sync');
      return;
    }
    
    console.log('Local stats found, syncing with Firestore');
    
    // Get Firestore data
    db.collection('users').doc(userId).get()
      .then((doc) => {
        if (doc.exists) {
          console.log('User document exists in Firestore');
          const firestoreStats = doc.data().stats;
          
          // Determine which stats to use
          let finalStats = localStats;
          
          if (firestoreStats) {
            // If remote data is more recent, use it
            const localDate = new Date(localStats.lastUpdated);
            const firestoreDate = new Date(firestoreStats.lastUpdated);
            
            if (firestoreDate > localDate) {
              console.log('Using Firestore data (more recent)');
              finalStats = firestoreStats;
            } else {
              // Merge applied jobs from both sources
              console.log('Merging local and Firestore data');
              const localJobUrls = new Set(localStats.appliedJobs.map(job => job.url));
              const newJobs = firestoreStats.appliedJobs.filter(job => !localJobUrls.has(job.url));
              
              finalStats.appliedJobs = [...localStats.appliedJobs, ...newJobs];
            }
          }
          
          // Update both storages
          chrome.storage.local.set({ stats: finalStats });
          
          // Always try to update Firestore, regardless of connection state
          console.log('Updating existing Firestore document');
          db.collection('users').doc(userId).update({ stats: finalStats })
            .then(() => {
              console.log('Successfully updated Firestore');
            })
            .catch(error => {
              console.error("Error updating Firestore:", error);
              
              // Store that we need to sync later
              chrome.storage.local.set({ 
                pendingSync: { 
                  userId, 
                  timestamp: Date.now() 
                }
              });
            });
        } else {
          console.log('User document does not exist, creating new one');
          // Create user document if it doesn't exist
          const userData = {
            stats: localStats,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            displayName: auth.currentUser ? auth.currentUser.displayName || '' : '',
            email: auth.currentUser ? auth.currentUser.email || '' : '',
            photoURL: auth.currentUser ? auth.currentUser.photoURL || '' : ''
          };
          
          // Always try to create Firestore document, regardless of connection state
          console.log('Creating new Firestore document');
          db.collection('users').doc(userId).set(userData)
            .then(() => {
              console.log('Successfully created new document in Firestore');
            })
            .catch(error => {
              console.error("Error creating user document:", error);
              
              // Store that we need to sync later
              chrome.storage.local.set({ 
                pendingSync: { 
                  userId, 
                  timestamp: Date.now() 
                }
              });
            });
        }
      })
      .catch((error) => {
        console.error("Error syncing with Firestore:", error);
        
        // Store that we need to sync later
        chrome.storage.local.set({ 
          pendingSync: { 
            userId, 
            timestamp: Date.now() 
          }
        });
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
      // Sync data with Firebase
      syncUserData(user.uid);
    });
    
    // Notify background script about login
    chrome.runtime.sendMessage({ action: 'userLoggedIn' })
      .catch(error => {
        console.log("Could not send login message to background", error);
      });
  } else {
    // User is signed out
    chrome.storage.local.remove(['user']);
    
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