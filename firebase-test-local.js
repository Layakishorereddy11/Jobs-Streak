// Simple Firebase test script for extension with local files
console.log("🔍 Testing Firebase with local files...");

// 1. Verify Firebase app initialization
try {
  console.log("🔄 Checking Firebase app...");
  console.log("✅ Firebase app name:", firebase.app().name);
  console.log("✅ Firebase config:", JSON.stringify(firebase.app().options, null, 2));
} catch (error) {
  console.error("❌ Firebase app not initialized properly:", error);
}

// 2. Verify Firebase Auth is available
try {
  console.log("🔄 Checking Firebase Auth...");
  if (firebase.auth) {
    console.log("✅ Firebase Auth is available");
    
    // Check current auth state
    const user = firebase.auth().currentUser;
    if (user) {
      console.log("👤 User is signed in:", user.email);
    } else {
      console.log("👤 No user is currently signed in");
    }
  } else {
    console.log("❌ Firebase Auth is not available");
  }
} catch (error) {
  console.error("❌ Firebase Auth error:", error);
}

// 3. Verify Firestore is available
try {
  console.log("🔄 Checking Firestore...");
  if (firebase.firestore) {
    console.log("✅ Firestore is available");
  } else {
    console.log("❌ Firestore is not available");
  }
} catch (error) {
  console.error("❌ Firestore error:", error);
}

// 4. Verify Firebase Database is available
try {
  console.log("🔄 Checking Firebase Database...");
  if (firebase.database) {
    console.log("✅ Firebase Database is available");
  } else {
    console.log("❌ Firebase Database is not available");
  }
} catch (error) {
  console.error("❌ Firebase Database error:", error);
}

// 5. Check network connectivity (without making actual Firebase calls)
console.log("🔄 Testing basic network connectivity...");
fetch('https://www.google.com', { mode: 'no-cors' })
  .then(() => {
    console.log("✅ Network connection is working");
  })
  .catch((error) => {
    console.error("❌ Network connection failed:", error);
  });

console.log("✅ Firebase test script completed"); 