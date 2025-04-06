// Remove import attempt with importScripts which doesn't work in popup context
// and check Firebase availability when DOM is loaded instead

document.addEventListener('DOMContentLoaded', () => {
  // Check if Firebase is available
  if (typeof firebase === 'undefined') {
    console.error('Firebase is not defined. Make sure Firebase scripts are loaded in popup.html');
    // Show error in popup
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = 'Error loading Firebase. Please reload the extension.';
    document.body.prepend(errorDiv);
    return;
  }
  
  // Check for pending sync operations
  chrome.storage.local.get(['pendingSync'], (result) => {
    if (result.pendingSync) {
      console.log('Found pending sync operation:', result.pendingSync);
      const { userId, timestamp, pullOnly } = result.pendingSync;
      
      // Only process syncs that are less than 1 hour old
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      if (timestamp && timestamp > oneHourAgo && userId) {
        console.log('Processing pending sync for user:', userId);
        
        // Remove the pending sync first to prevent loops
        chrome.storage.local.remove(['pendingSync'], () => {
          if (pullOnly) {
            // Only fetch data from Firestore
            chrome.runtime.sendMessage({ 
              action: 'getStats', 
              userId: userId 
            }).catch(error => {
              console.log("Could not send getStats message to background", error);
            });
          } else {
            // Use background script's sync method
            syncWithFirestore();
          }
        });
      } else {
        // Clear old pending sync operations
        chrome.storage.local.remove(['pendingSync']);
      }
    }
  });

  // DOM elements - Authentication
  const authSection = document.getElementById('auth-section');
  const dashboardSection = document.getElementById('dashboard-section');
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const showSignupLink = document.getElementById('show-signup');
  const showLoginLink = document.getElementById('show-login');
  const googleSigninBtn = document.getElementById('google-signin');
  const googleSignupBtn = document.getElementById('google-signup');
  
  // DOM elements - Dashboard
  const userName = document.getElementById('user-name');
  const userEmail = document.getElementById('user-email');
  const userAvatar = document.getElementById('user-avatar');
  const logoutBtn = document.getElementById('logout-btn');
  const todayCount = document.getElementById('today-count');
  const streakCount = document.getElementById('streak-count');
  const totalCount = document.getElementById('total-count');
  const recentApplicationsList = document.getElementById('recent-applications-list');
  const friendsList = document.getElementById('friends-list');
  const copyInviteBtn = document.getElementById('copy-invite');
  const inviteLink = document.getElementById('invite-link');
  const navItems = document.querySelectorAll('.nav-item');
  
  // Initially hide both sections until auth is checked
  authSection.style.display = 'none';
  dashboardSection.style.display = 'none';
  
  // Check if user is authenticated - first from Chrome storage, then from Firebase
  checkAuthStateFromStorage();
  
  // Create track application buttons with proper state
  const createTrackButtons = () => {
    // First remove any existing buttons to prevent duplicates
    const existingContainer = document.querySelector('.track-buttons-container');
    if (existingContainer) {
      existingContainer.remove();
    }
    
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'track-buttons-container';
    
    // Get current button state from storage
    initializeButtonState().then(({trackButtonDisabled, deleteButtonDisabled}) => {
      buttonsContainer.innerHTML = `
        <div class="track-button-group">
          <button id="track-application-btn" class="btn btn-track" ${trackButtonDisabled ? 'disabled' : ''}>
            <span class="btn-icon">+</span>
            <span class="btn-text">Track Application</span>
          </button>
          <div class="button-tooltip">Track a job application</div>
        </div>
        <div class="track-button-group">
          <button id="delete-application-btn" class="btn btn-delete" ${deleteButtonDisabled ? 'disabled' : ''}>
            <span class="btn-icon">-</span>
            <span class="btn-text">Remove Application</span>
          </button>
          <div class="button-tooltip">Remove last tracked application</div>
        </div>
      `;
      
      // Insert after the streak summary
      const streakSummary = document.querySelector('.streak-summary');
      streakSummary.parentNode.insertBefore(buttonsContainer, streakSummary.nextSibling);
      
      // Add event listeners to the buttons
      document.getElementById('track-application-btn').addEventListener('click', async () => {
        await trackApplication();
      });
      
      document.getElementById('delete-application-btn').addEventListener('click', async () => {
        await removeApplication();
      });
    });
  };
  
  // Initialize button state based on storage
  async function initializeButtonState() {
    return new Promise((resolve) => {
      // Get current active tab first
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const currentUrl = tabs[0]?.url || '';
        
        // Then check storage for lastTracked status
        chrome.storage.local.get(['stats'], (result) => {
          const stats = result.stats || { appliedJobs: [] };
          // Only disable Track button if the lastTracked job matches the current URL
          const lastTrackedJob = stats.appliedJobs.find(job => job.lastTracked === true);
          const isCurrentUrlTracked = lastTrackedJob && lastTrackedJob.url === currentUrl;
          
          resolve({
            trackButtonDisabled: isCurrentUrlTracked,
            deleteButtonDisabled: !isCurrentUrlTracked
          });
        });
      });
    });
  }
  
  // Authentication event listeners
  showSignupLink.addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.classList.remove('active');
    signupForm.classList.add('active');
  });
  
  showLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    signupForm.classList.remove('active');
    loginForm.classList.add('active');
  });
  
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    auth.signInWithEmailAndPassword(email, password)
      .then(() => {
        // User logged in
        checkAuthState();
      })
      .catch((error) => {
        showError(error.message);
      });
  });
  
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
        // User signed up and profile updated
        checkAuthState();
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
    // Use signInWithCredential in a Chrome extension
    const googleAuthProvider = 'https://accounts.google.com/o/oauth2/auth';
    const clientId = firebase.app().options.apiKey;
    
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
          .then(() => {
            // User logged in with Google
            checkAuthState();
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
  
  // Logout
  logoutBtn.addEventListener('click', () => {
    auth.signOut()
      .then(() => {
        // Send logout message to background script first
        chrome.runtime.sendMessage({ action: 'userLoggedOut' })
          .catch(error => {
            console.log("Could not send logout message to background", error);
          });
        
        // Clear ALL user data from storage
        chrome.storage.local.remove(['user', 'stats', 'pendingSync', 'pendingSyncResolved'], () => {
          console.log('User data cleared from Chrome storage on logout');
          showAuthScreen();
        });
      })
      .catch((error) => {
        showError(error.message);
      });
  });
  
  // Navigation
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      // Here you would implement tab switching
    });
  });
  
  // Copy invite link
  copyInviteBtn.addEventListener('click', () => {
    inviteLink.select();
    document.execCommand('copy');
    copyInviteBtn.textContent = 'Copied!';
    
    setTimeout(() => {
      copyInviteBtn.textContent = 'Copy';
    }, 2000);
  });
  
  // Clear storage button
  const clearStorageBtn = document.getElementById('clear-storage-btn');
  if (clearStorageBtn) {
    clearStorageBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to clear all storage data? This will log you out and reset all local data.')) {
        await clearAllChromeStorage();
        // Force logout and refresh the popup
        setTimeout(() => {
          location.reload();
        }, 1000);
      }
    });
  }
  
  // Track a new job application
  async function trackApplication() {
    try {
      // Get current tab information
      const tabs = await new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          resolve(tabs);
        });
      });
      
      const currentTab = tabs[0];
      const url = currentTab.url;
      const title = currentTab.title;
      
      // Get current stats
      const result = await new Promise((resolve) => {
        chrome.storage.local.get(['user', 'stats'], (result) => {
          resolve(result);
        });
      });
      
      if (!result.user) {
        showError('You must be logged in to track applications');
        return;
      }
      
      const userId = result.user.uid;
      let stats = result.stats || { userId: userId, appliedJobs: [], todayCount: 0, streak: 0, lastUpdated: '' };
      
      // Ensure stats has userId
      stats.userId = userId;
      
      // Check if URL is already tracked
      const isAlreadyTracked = stats.appliedJobs.some(job => job.url === url);
      
      if (isAlreadyTracked) {
        showError('This application is already tracked');
        return;
      }
      
      // Create new job entry
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const newJob = {
        url,
        title,
        date: today,
        favicon: `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}`,
        lastTracked: true
      };
      
      // Clear previous lastTracked flags
      stats.appliedJobs.forEach(job => {
        job.lastTracked = false;
      });
      
      // Add new job to the beginning of the array
      stats.appliedJobs.unshift(newJob);
      
      // Update counters
      if (stats.lastUpdated === today) {
        stats.todayCount++;
      } else {
        // Check if streak should continue or reset
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        
        if (stats.lastUpdated === yesterdayStr) {
          // Continued streak
          stats.streak++;
        } else if (stats.lastUpdated && stats.lastUpdated !== today) {
          // Broken streak - but start a new one
          stats.streak = 1;
        } else {
          // First time tracking or same day
          stats.streak = 1;
        }
        
        stats.todayCount = 1;
        stats.lastUpdated = today;
      }
      
      // Update stats in storage and Firestore
      await updateStats(stats);
      
      // Update UI
      updateCounters(stats);
      updateRecentApplications(stats.appliedJobs);
      createApplicationChart(stats.appliedJobs);
      
      // Update button state
      const buttonState = await initializeButtonState();
      document.getElementById('track-application-btn').disabled = buttonState.trackButtonDisabled;
      document.getElementById('delete-application-btn').disabled = buttonState.deleteButtonDisabled;
      
      // Show success message
      //showSuccess('Application tracked successfully!');
      
    } catch (error) {
      console.error('Error tracking application:', error);
      showError('Failed to track application');
    }
  }
  
  // Remove the last tracked job application
  async function removeApplication() {
    try {
      // Get current stats
      const result = await new Promise((resolve) => {
        chrome.storage.local.get(['user', 'stats'], (result) => {
          resolve(result);
        });
      });
      
      if (!result.user) {
        showError('You must be logged in to remove applications');
        return;
      }
      
      if (!result.stats || !result.stats.appliedJobs || result.stats.appliedJobs.length === 0) {
        showError('No applications to remove');
        return;
      }
      
      const userId = result.user.uid;
      const stats = { ...result.stats, userId };
      
      // Find the last tracked job
      const lastTrackedIndex = stats.appliedJobs.findIndex(job => job.lastTracked === true);
      
      if (lastTrackedIndex === -1) {
        showError('No tracked application found to remove');
        return;
      }
      
      // Get the job to be removed
      const removedJob = stats.appliedJobs[lastTrackedIndex];
      
      // Check if the job was tracked today
      const today = new Date().toISOString().split('T')[0];
      if (removedJob.date === today && stats.todayCount > 0) {
        stats.todayCount--;
      }
      
      // Remove the job
      stats.appliedJobs.splice(lastTrackedIndex, 1);
      
      // Set the new last tracked job if there are any left
      if (stats.appliedJobs.length > 0) {
        stats.appliedJobs[0].lastTracked = true;
      }
      
      // Update stats in storage and Firestore
      await updateStats(stats);
      
      // Update UI
      updateCounters(stats);
      updateRecentApplications(stats.appliedJobs);
      createApplicationChart(stats.appliedJobs);
      
      // Update button state
      const buttonState = await initializeButtonState();
      document.getElementById('track-application-btn').disabled = buttonState.trackButtonDisabled;
      document.getElementById('delete-application-btn').disabled = buttonState.deleteButtonDisabled;
      
      // Show success message
      //showSuccess('Application removed successfully!');
      
    } catch (error) {
      console.error('Error removing application:', error);
      showError('Failed to remove application');
    }
  }
  
  // Update counter displays
  function updateCounters(stats) {
    todayCount.textContent = stats.todayCount;
    streakCount.textContent = stats.streak;
    totalCount.textContent = stats.appliedJobs?.length || 0;
    
    // Add animation for counters
    [todayCount, streakCount, totalCount].forEach(element => {
      element.classList.add('counter-updated');
      setTimeout(() => {
        element.classList.remove('counter-updated');
      }, 500);
    });
  }
  
  // Sync stats with Firestore
  function syncWithFirestore() {
    console.log('Syncing stats with Firestore');
    chrome.runtime.sendMessage({ action: 'syncStats' })
      .catch(error => {
        console.log("Could not send sync message:", error);
      });
  }
  
  // Get user stats from Firestore
  async function getUserStats() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['user'], async (result) => {
        if (!result.user) {
          console.log('No user found in storage');
          resolve(null);
          return;
        }
        
        const userId = result.user.uid;
        
        try {
          // Send message to background script to get stats from Firestore
          chrome.runtime.sendMessage({ 
            action: 'getStats', 
            userId: userId 
          }, (response) => {
            if (response && response.success && response.stats) {
              // Store stats in Chrome storage with userId to verify ownership
              const statsWithUserId = {
                ...response.stats,
                userId: userId // Add userId to stats for ownership verification
              };
              
              chrome.storage.local.set({ stats: statsWithUserId });
              resolve(statsWithUserId);
            } else {
              console.log('No stats found in Firestore, creating default stats');
              // Initialize with empty stats
              const defaultStats = {
                userId: userId, // Add userId to stats for ownership verification
                todayCount: 0,
                streak: 0,
                lastUpdated: new Date().toISOString().split('T')[0],
                appliedJobs: []
              };
              
              // Save default stats to Firestore via background script
              chrome.runtime.sendMessage({ 
                action: 'updateStats', 
                userId: userId,
                stats: defaultStats
              });
              
              // Store in Chrome storage
              chrome.storage.local.set({ stats: defaultStats });
              resolve(defaultStats);
            }
          });
        } catch (error) {
          console.error('Error getting user stats:', error);
          resolve(null);
        }
      });
    });
  }
  
  // Update stats in Chrome storage and Firestore
  async function updateStats(stats) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['user'], (result) => {
        if (!result.user) {
          console.log('No user found, stats not updated');
          resolve(false);
          return;
        }
        
        const userId = result.user.uid;
        
        // Ensure stats has userId for verification
        const statsWithUserId = {
          ...stats,
          userId: userId
        };
        
        // Update in Chrome storage
        chrome.storage.local.set({ stats: statsWithUserId }, () => {
          // Send to background script to update in Firestore
          chrome.runtime.sendMessage({
            action: 'updateStats',
            userId: userId,
            stats: statsWithUserId
          }, (response) => {
            if (response && response.success) {
              console.log('Stats updated in Firestore');
              resolve(true);
            } else {
              console.error('Failed to update stats in Firestore');
              resolve(false);
            }
          });
        });
      });
    });
  }
  
  // Check auth state from Chrome storage first (for faster UI response)
  function checkAuthStateFromStorage() {
    chrome.storage.local.get(['user'], (result) => {
      if (result.user) {
        // User data found in storage, show dashboard
        showDashboard(result.user);
        
        // Then verify with Firebase (in case token expired)
        auth.onAuthStateChanged((firebaseUser) => {
          if (!firebaseUser) {
            // Firebase says user is not logged in, remove from storage and show auth
            chrome.storage.local.remove(['user', 'stats', 'pendingSync', 'pendingSyncResolved'], () => {
              console.log('Clearing all user data - Firebase auth validation failed');
              showAuthScreen();
            });
          } else if (firebaseUser.uid !== result.user.uid) {
            // Different user logged in with Firebase than what's in storage
            // This can happen when switching accounts without proper logout
            console.log('User mismatch detected. Clearing old data and updating storage.');
            
            // Update storage with fresh Firebase data
            const userData = {
              uid: firebaseUser.uid,
              displayName: firebaseUser.displayName || 'User',
              email: firebaseUser.email || '',
              photoURL: firebaseUser.photoURL || ''
            };
            
            // Clear old data first, then set new user data
            chrome.storage.local.remove(['stats', 'pendingSync', 'pendingSyncResolved'], () => {
              chrome.storage.local.set({ user: userData }, () => {
                showDashboard(userData);
              });
            });
          } else {
            // Update storage with fresh Firebase data
            const userData = {
              uid: firebaseUser.uid,
              displayName: firebaseUser.displayName || 'User',
              email: firebaseUser.email || '',
              photoURL: firebaseUser.photoURL || ''
            };
            chrome.storage.local.set({ user: userData });
          }
        });
      } else {
        // No user in storage, check with Firebase
        auth.onAuthStateChanged((firebaseUser) => {
          if (firebaseUser) {
            // User is signed in with Firebase but not in storage, update storage
            const userData = {
              uid: firebaseUser.uid,
              displayName: firebaseUser.displayName || 'User',
              email: firebaseUser.email || '',
              photoURL: firebaseUser.photoURL || ''
            };
            
            // Clear any potential stale data first
            chrome.storage.local.remove(['stats', 'pendingSync', 'pendingSyncResolved'], () => {
              chrome.storage.local.set({ user: userData }, () => {
                showDashboard(userData);
              });
            });
          } else {
            // No user in Firebase either, show auth screen and ensure storage is clean
            chrome.storage.local.remove(['user', 'stats', 'pendingSync', 'pendingSyncResolved'], () => {
              showAuthScreen();
            });
          }
        });
      }
    });
  }
  
  // Check auth state with Firebase
  function checkAuthState() {
    const user = auth.currentUser;
    
    if (user) {
      // User is signed in, show dashboard
      const userData = {
        uid: user.uid,
        displayName: user.displayName || 'User',
        email: user.email || '',
        photoURL: user.photoURL || ''
      };
      
      // Clear any potential stale data first, then store user info in Chrome storage for persistence
      chrome.storage.local.remove(['stats', 'pendingSync', 'pendingSyncResolved'], () => {
        chrome.storage.local.set({ user: userData }, () => {
          showDashboard(userData);
        });
      });
    } else {
      // No user signed in with Firebase, check storage as fallback
      chrome.storage.local.get(['user'], (result) => {
        if (result.user) {
          // User in storage but not in Firebase, verify with onAuthStateChanged
          auth.onAuthStateChanged((firebaseUser) => {
            if (firebaseUser) {
              // Ensure the user in storage matches the Firebase user
              if (firebaseUser.uid !== result.user.uid) {
                // User mismatch, update storage with current Firebase user
                const newUserData = {
                  uid: firebaseUser.uid,
                  displayName: firebaseUser.displayName || 'User',
                  email: firebaseUser.email || '',
                  photoURL: firebaseUser.photoURL || ''
                };
                
                // Clear old data first, then set new user data
                chrome.storage.local.remove(['stats', 'pendingSync', 'pendingSyncResolved'], () => {
                  chrome.storage.local.set({ user: newUserData }, () => {
                    showDashboard(newUserData);
                  });
                });
              } else {
                showDashboard(result.user);
              }
            } else {
              // No user in Firebase, clear all storage data
              chrome.storage.local.remove(['user', 'stats', 'pendingSync', 'pendingSyncResolved'], () => {
                showAuthScreen();
              });
            }
          });
        } else {
          // No user in storage or Firebase, show auth screen
          showAuthScreen();
        }
      });
    }
  }
  
  // Show dashboard with user data
  function showDashboard(userData) {
    // Hide auth section and show dashboard
    authSection.style.display = 'none';
    dashboardSection.style.display = 'block';
    
    // Remove and add classes for animation
    authSection.classList.remove('active');
    dashboardSection.classList.add('active');
    
    // Update user info
    userName.textContent = userData.displayName;
    userEmail.textContent = userData.email;
    userAvatar.src = userData.photoURL || 'images/avatar-placeholder.png';
    
    // Generate invite link
    inviteLink.value = `https://jobs-streak.web.app/invite/${userData.uid}`;
    
    // Create track buttons if they don't exist yet
    if (!document.querySelector('.track-buttons-container')) {
      createTrackButtons();
    }
    
    // Load user stats
    loadUserStats();
    
    // Load friends list
    loadFriends(userData.uid);
    
    // Listen for storage changes to update UI in real-time
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes.stats) {
        const newStats = changes.stats.newValue;
        if (newStats) {
          // Update counters and visuals
          updateCounters(newStats);
          updateRecentApplications(newStats.appliedJobs);
          createApplicationChart(newStats.appliedJobs);
          
          // Update button states for current URL
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs || !tabs[0]) return;
            
            const currentUrl = tabs[0].url;
            const lastTrackedJob = newStats.appliedJobs.find(job => job.lastTracked === true);
            const isCurrentUrlTracked = lastTrackedJob && lastTrackedJob.url === currentUrl;
            
            // Get buttons
            const trackButton = document.getElementById('track-application-btn');
            const deleteButton = document.getElementById('delete-application-btn');
            
            if (trackButton && deleteButton) {
              // Update button states
              trackButton.disabled = isCurrentUrlTracked;
              deleteButton.disabled = !isCurrentUrlTracked;
            }
          });
        }
      }
    });
  }
  
  // Show authentication screen
  function showAuthScreen() {
    // Hide dashboard and show auth section
    dashboardSection.style.display = 'none';
    authSection.style.display = 'block';
    
    // Remove and add classes for animation
    dashboardSection.classList.remove('active');
    authSection.classList.add('active');
    loginForm.classList.add('active');
    signupForm.classList.remove('active');
  }
  
  // Load user stats from Chrome storage or Firebase
  function loadUserStats() {
    chrome.storage.local.get(['user', 'stats'], (result) => {
      if (result.user) {
        // First try to get stats from Chrome storage
        if (result.stats) {
          // Verify stats belong to the current user
          if (result.stats.userId === result.user.uid) {
            // We have stats for the current user
            updateCounters(result.stats);
            updateRecentApplications(result.stats.appliedJobs || []);
            createApplicationChart(result.stats.appliedJobs || []);
            
            // No need to sync here - avoid duplicate save
          } else {
            console.log('Stats in storage belong to a different user, fetching from Firestore');
            // Stats belong to a different user, clear them and fetch from Firestore
            chrome.storage.local.remove(['stats'], () => {
              getUserStats().then(stats => {
                if (stats) {
                  updateCounters(stats);
                  updateRecentApplications(stats.appliedJobs || []);
                  createApplicationChart(stats.appliedJobs || []);
                }
              });
            });
          }
        } else {
          // No stats in storage, fetch from Firestore
          getUserStats().then(stats => {
            if (stats) {
              updateCounters(stats);
              updateRecentApplications(stats.appliedJobs || []);
              createApplicationChart(stats.appliedJobs || []);
            }
          });
        }
        
        // Load friends data
        loadFriends(result.user.uid);
      }
    });
  }
  
  // Update recent applications list
  function updateRecentApplications(appliedJobs) {
    // Ensure appliedJobs is an array
    if (!Array.isArray(appliedJobs) || appliedJobs.length === 0) {
      recentApplicationsList.innerHTML = '<div class="empty-state">No applications tracked yet.</div>';
      return;
    }
    
    // Sort by date descending
    const sortedJobs = [...appliedJobs].sort((a, b) => {
      // Handle missing timestamp - fallback to date if timestamp is missing
      const timeA = a.timestamp ? new Date(a.timestamp) : new Date(a.date);
      const timeB = b.timestamp ? new Date(b.timestamp) : new Date(b.date);
      return timeB - timeA;
    });
    
    // Take only the 5 most recent
    const recentJobs = sortedJobs.slice(0, 3);
    
    recentApplicationsList.innerHTML = '';
    
    recentJobs.forEach(job => {
      // Use timestamp if available, otherwise use date
      const jobDate = job.timestamp ? new Date(job.timestamp) : new Date(job.date);
      const formattedDate = jobDate.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
      
      const jobElement = document.createElement('div');
      jobElement.className = 'application-item';
      
      // Don't show URL for manual entries
      const urlDisplay = !job.url || job.url === 'manual-entry' 
        ? 'Manual entry' 
        : job.url;
      
      jobElement.innerHTML = `
        <div class="application-title">${job.title || 'Job Application'}</div>
        <div class="application-url">${urlDisplay}</div>
        <div class="application-date">${formattedDate}</div>
      `;
      
      // Add click event to open the URL (except for manual entries)
      if (job.url && job.url !== 'manual-entry') {
        jobElement.addEventListener('click', () => {
          chrome.tabs.create({ url: job.url });
        });
      }
      
      recentApplicationsList.appendChild(jobElement);
    });
  }
  
  // Create applications chart
  function createApplicationChart(appliedJobs) {
    // Ensure appliedJobs is an array
    if (!Array.isArray(appliedJobs)) {
      appliedJobs = [];
    }
    
    // Get applications per day for the last 7 days
    const today = new Date();
    const days = [];
    const counts = [];
    
    // Generate last 7 days
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const formattedDate = date.toISOString().split('T')[0];
      
      days.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
      
      // Count applications for this day
      const count = appliedJobs.filter(job => job.date === formattedDate).length;
      counts.push(count);
    }
    
    // Create or update chart
    const ctx = document.getElementById('applications-chart').getContext('2d');
    
    if (window.applicationsChart) {
      window.applicationsChart.data.labels = days;
      window.applicationsChart.data.datasets[0].data = counts;
      window.applicationsChart.update();
    } else {
      window.applicationsChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: days,
          datasets: [{
            label: 'Applications',
            data: counts,
            backgroundColor: 'rgba(0, 112, 243, 0.7)',
            borderColor: 'rgba(0, 112, 243, 1)',
            borderWidth: 1,
            borderRadius: 4,
            maxBarThickness: 40
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              mode: 'index',
              intersect: false
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                precision: 0
              }
            }
          },
          animation: {
            duration: 500
          }
        }
      });
    }
  }
  
  // Load friends list
  function loadFriends(userIdParam) {
    const userId = userIdParam || (auth.currentUser ? auth.currentUser.uid : null);
    
    if (!userId) {
      chrome.storage.local.get(['user'], (result) => {
        if (result.user) {
          loadFriendsWithUID(result.user.uid);
        } else {
          friendsList.innerHTML = '<div class="empty-state">Please sign in to see friends.</div>';
        }
      });
      return;
    }
    
    loadFriendsWithUID(userId);
  }
  
  // Load friends with user ID
  function loadFriendsWithUID(userId) {
    db.collection('users').doc(userId).collection('friends').get()
      .then((querySnapshot) => {
        if (querySnapshot.empty) {
          friendsList.innerHTML = '<div class="empty-state">Add friends to see their streaks.</div>';
          return;
        }
        
        friendsList.innerHTML = '';
        
        // Get friend UIDs
        const friendUids = querySnapshot.docs.map(doc => doc.id);
        
        // Get friend data
        db.collection('users').where(firebase.firestore.FieldPath.documentId(), 'in', friendUids).get()
          .then((usersSnapshot) => {
            usersSnapshot.forEach((doc) => {
              const friendData = doc.data();
              
              const friendElement = document.createElement('div');
              friendElement.className = 'friend-item';
              friendElement.innerHTML = `
                <img class="friend-avatar" src="${friendData.photoURL || 'images/avatar-placeholder.png'}" alt="${friendData.displayName}">
                <div class="friend-info">
                  <div class="friend-name">${friendData.displayName}</div>
                  <div class="friend-streak">Current streak: <span class="friend-streak-value">${friendData.stats?.streak || 0}</span> days</div>
                </div>
              `;
              
              friendsList.appendChild(friendElement);
            });
          })
          .catch((error) => {
            console.error("Error getting friends data:", error);
            friendsList.innerHTML = '<div class="empty-state">Error loading friends.</div>';
          });
      })
      .catch((error) => {
        console.error("Error getting friends:", error);
        friendsList.innerHTML = '<div class="empty-state">Error loading friends.</div>';
      });
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
  
  // Show success message
  function showSuccess(message) {
    const successToast = document.createElement('div');
    successToast.className = 'toast success-toast';
    successToast.innerHTML = `<div class="toast-content">${message}</div>`;
    
    document.body.appendChild(successToast);
    
    // Show after a brief delay
    setTimeout(() => {
      successToast.classList.add('visible');
    }, 100);
    
    // Hide after 3 seconds
    setTimeout(() => {
      successToast.classList.remove('visible');
      
      // Remove from DOM after animation
      setTimeout(() => {
        document.body.removeChild(successToast);
      }, 300);
    }, 3000);
  }
  
  // Clear all Chrome storage data
  function clearAllChromeStorage() {
    return new Promise((resolve) => {
      chrome.storage.local.clear(() => {
        console.log('All Chrome storage data cleared');
        showSuccess('Storage cleared. Please refresh the extension.');
        resolve(true);
      });
    });
  }

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'triggerFirebaseSync' && request.userId) {
      console.log('Received request to sync with Firestore for user:', request.userId);
      // Use our syncWithFirestore function
      syncWithFirestore();
      sendResponse({ status: 'success' });
    }
    return true; // Keep the message channel open for async responses
  });
}); 