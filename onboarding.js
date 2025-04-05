document.addEventListener('DOMContentLoaded', () => {
  // Step navigation elements
  const steps = document.querySelectorAll('.onboarding-step');
  const step1Next = document.getElementById('step-1-next');
  const step2Prev = document.getElementById('step-2-prev');
  const step2Next = document.getElementById('step-2-next');
  const step3Prev = document.getElementById('step-3-prev');
  const finishOnboarding = document.getElementById('finish-onboarding');
  
  // Auth form elements
  const signupForm = document.getElementById('onboarding-signup-form');
  const loginForm = document.getElementById('onboarding-login-form');
  const showSignupLink = document.getElementById('show-signup');
  const showLoginLink = document.getElementById('show-login');
  const googleSigninBtn = document.getElementById('google-signin');
  const googleSignupBtn = document.getElementById('google-signup');
  
  // Step navigation
  let currentStep = 1;
  
  // Check if user is already authenticated
  auth.onAuthStateChanged((user) => {
    if (user) {
      // Skip to success step
      goToStep(4);
    }
  });
  
  // Step 1 -> Step 2
  step1Next.addEventListener('click', () => {
    goToStep(2);
  });
  
  // Step 2 -> Step 1
  step2Prev.addEventListener('click', () => {
    goToStep(1);
  });
  
  // Step 2 -> Step 3
  step2Next.addEventListener('click', () => {
    goToStep(3);
  });
  
  // Step 3 -> Step 2
  step3Prev.addEventListener('click', () => {
    goToStep(2);
  });
  
  // Finish onboarding
  finishOnboarding.addEventListener('click', () => {
    // Close this tab and go back to the extension
    window.close();
  });
  
  // Show signup form
  showSignupLink.addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.style.display = 'none';
    signupForm.style.display = 'block';
  });
  
  // Show login form
  showLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    signupForm.style.display = 'none';
    loginForm.style.display = 'block';
  });
  
  // Signup form submission
  signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    
    auth.createUserWithEmailAndPassword(email, password)
      .then((userCredential) => {
        // Update profile
        return userCredential.user.updateProfile({
          displayName: name
        });
      })
      .then(() => {
        // Create initial user data
        createInitialUserData();
        
        // Go to success step
        goToStep(4);
      })
      .catch((error) => {
        showError(error.message);
      });
  });
  
  // Login form submission
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    auth.signInWithEmailAndPassword(email, password)
      .then(() => {
        // Go to success step
        goToStep(4);
      })
      .catch((error) => {
        showError(error.message);
      });
  });
  
  // Google authentication
  googleSigninBtn.addEventListener('click', () => {
    signInWithGoogle();
  });
  
  googleSignupBtn.addEventListener('click', () => {
    signInWithGoogle();
  });
  
  // Sign in with Google using Chrome Identity API
  function signInWithGoogle() {
    // Show a loading indicator or disable the button
    googleSigninBtn.disabled = true;
    googleSignupBtn.disabled = true;
    
    try {
      // For Chrome extension we need to use a different auth flow
      // Use chrome.identity API to get Google OAuth token
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          showError(chrome.runtime.lastError.message);
          googleSigninBtn.disabled = false;
          googleSignupBtn.disabled = false;
          return;
        }
        
        // Create credential with the token
        const credential = firebase.auth.GoogleAuthProvider.credential(null, token);
        
        // Sign in with credential
        auth.signInWithCredential(credential)
          .then((result) => {
            // Check if it's a new user
            const isNewUser = result.additionalUserInfo.isNewUser;
            
            if (isNewUser) {
              createInitialUserData();
            }
            
            // Go to success step
            goToStep(4);
          })
          .catch((error) => {
            console.error("Google auth error:", error);
            showError("Google sign-in failed: " + error.message);
          })
          .finally(() => {
            googleSigninBtn.disabled = false;
            googleSignupBtn.disabled = false;
          });
      });
    } catch (error) {
      console.error("Chrome identity error:", error);
      showError("Google sign-in failed. Try using email login instead.");
      googleSigninBtn.disabled = false;
      googleSignupBtn.disabled = false;
    }
  }
  
  // Create initial user data
  function createInitialUserData() {
    const user = auth.currentUser;
    if (!user) return;
    
    // Default stats
    const defaultStats = {
      todayCount: 0,
      streak: 0,
      lastUpdated: new Date().toISOString().split('T')[0],
      appliedJobs: []
    };
    
    // Save to Chrome storage
    chrome.storage.local.set({
      user: {
        uid: user.uid,
        displayName: user.displayName || '',
        email: user.email || '',
        photoURL: user.photoURL || ''
      },
      stats: defaultStats
    });
    
    // Save to Firestore
    db.collection('users').doc(user.uid).set({
      displayName: user.displayName || '',
      email: user.email || '',
      photoURL: user.photoURL || '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      stats: defaultStats
    }).catch(error => {
      console.error("Error creating user document:", error);
    });
  }
  
  // Navigate to a specific step
  function goToStep(step) {
    // Hide current step
    steps[currentStep - 1].classList.remove('active');
    
    // Show new step
    steps[step - 1].classList.add('active');
    
    // Update current step
    currentStep = step;
  }
  
  // Show error message
  function showError(message) {
    const errorToast = document.getElementById('error-toast');
    const errorMessage = document.getElementById('error-message');
    
    errorMessage.textContent = message;
    errorToast.classList.add('visible');
    
    setTimeout(() => {
      errorToast.classList.remove('visible');
    }, 3000);
  }
}); 