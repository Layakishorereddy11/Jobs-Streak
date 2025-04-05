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

// Set Firestore settings - use more modern cache settings to avoid deprecation warnings
db.settings({
  cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
});

// Enable persistence (offline capabilities)
db.enablePersistence({
  synchronizeTabs: true
})
.then(() => {
  console.log("Firestore persistence enabled successfully");
})
.catch((err) => {
  if (err.code === 'failed-precondition') {
    console.log('Persistence failed: Multiple tabs open');
  } else if (err.code === 'unimplemented') {
    console.log('Persistence not supported in this browser');
  } else {
    console.error('Persistence error:', err);
  }
});

// Monitor Firestore connection status
let isConnected = false;
function monitorFirestoreConnection() {
  const connRef = firebase.database().ref('.info/connected');
  connRef.on('value', (snap) => {
    isConnected = snap.val() === true;
    if (isConnected) {
      console.log('Connected to Firebase');
      
      // When we reconnect, sync any changes that happened while offline
      const user = auth.currentUser;
      if (user) {
        chrome.storage.local.get(['stats'], (result) => {
          if (result.stats) {
            syncUserData(user.uid);
          }
        });
      }
    } else {
      console.log('Disconnected from Firebase');
    }
  });
}

// Try to initialize connection monitoring
try {
  monitorFirestoreConnection();
} catch (e) {
  console.log('Could not monitor connection status:', e);
}

// Sync data between Chrome storage and Firebase
function syncUserData(userId) {
  // Get local data
  chrome.storage.local.get(['stats'], (result) => {
    const localStats = result.stats;
    
    if (!localStats) return;
    
    // Get Firestore data
    db.collection('users').doc(userId).get()
      .then((doc) => {
        if (doc.exists) {
          const firestoreStats = doc.data().stats;
          
          // Determine which stats to use
          let finalStats = localStats;
          
          if (firestoreStats) {
            // If remote data is more recent, use it
            const localDate = new Date(localStats.lastUpdated);
            const firestoreDate = new Date(firestoreStats.lastUpdated);
            
            if (firestoreDate > localDate) {
              finalStats = firestoreStats;
            } else {
              // Merge applied jobs from both sources
              const localJobUrls = new Set(localStats.appliedJobs.map(job => job.url));
              const newJobs = firestoreStats.appliedJobs.filter(job => !localJobUrls.has(job.url));
              
              finalStats.appliedJobs = [...localStats.appliedJobs, ...newJobs];
            }
          }
          
          // Update both storages
          chrome.storage.local.set({ stats: finalStats });
          
          // Update Firestore, but only if we're connected
          if (isConnected) {
            db.collection('users').doc(userId).update({ stats: finalStats })
              .catch(error => {
                console.error("Error updating Firestore:", error);
              });
          }
        } else {
          // Create user document if it doesn't exist
          const userData = {
            stats: localStats,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            displayName: auth.currentUser.displayName || '',
            email: auth.currentUser.email || '',
            photoURL: auth.currentUser.photoURL || ''
          };
          
          // Update Firestore, but only if we're connected
          if (isConnected) {
            db.collection('users').doc(userId).set(userData)
              .catch(error => {
                console.error("Error creating user document:", error);
              });
          }
        }
      })
      .catch((error) => {
        console.error("Error syncing with Firestore:", error);
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
    
    // Store user info in Chrome storage
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
  }
}); 