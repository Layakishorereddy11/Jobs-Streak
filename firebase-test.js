// This script helps test Firebase connectivity from the popup
// Add this temporarily to your popup.html after the other scripts

// Test Firebase connection
console.log("⏳ Testing Firebase connection...");

// 1. Test Firebase App initialization
try {
  console.log("✅ Firebase App initialized:", firebase.app().name);
} catch (error) {
  console.error("❌ Firebase App initialization failed:", error);
}

// 2. Test database access
try {
  const testRef = firebase.database().ref('connection_test');
  testRef.set({
    timestamp: new Date().toISOString(),
    browser: navigator.userAgent
  })
  .then(() => {
    console.log("✅ Firebase Database write successful");
    
    // Read back the data
    return testRef.once('value');
  })
  .then((snapshot) => {
    console.log("✅ Firebase Database read successful:", snapshot.val());
  })
  .catch((error) => {
    console.error("❌ Firebase Database operation failed:", error);
  });
} catch (error) {
  console.error("❌ Firebase Database access failed:", error);
}

// 3. Test Firestore access
try {
  const testDoc = firebase.firestore().collection('connection_test').doc('test_doc');
  testDoc.set({
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    browser: navigator.userAgent
  })
  .then(() => {
    console.log("✅ Firestore write successful");
    
    // Read back the data
    return testDoc.get();
  })
  .then((doc) => {
    console.log("✅ Firestore read successful:", doc.data());
  })
  .catch((error) => {
    console.error("❌ Firestore operation failed:", error);
  });
} catch (error) {
  console.error("❌ Firestore access failed:", error);
}

// 4. Test Authentication state
try {
  firebase.auth().onAuthStateChanged((user) => {
    if (user) {
      console.log("✅ Firebase Auth: User is signed in", user.email);
    } else {
      console.log("ℹ️ Firebase Auth: No user is signed in");
    }
  });
} catch (error) {
  console.error("❌ Firebase Auth state check failed:", error);
}

// Check network connectivity
fetch('https://www.googleapis.com/identitytoolkit/v3/relyingparty/getAccountInfo?key=' + 
  firebase.app().options.apiKey, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({})
})
.then(response => {
  console.log("✅ Network connection to Firebase APIs is working", response.status);
})
.catch(error => {
  console.error("❌ Network connection to Firebase APIs failed:", error);
}); 