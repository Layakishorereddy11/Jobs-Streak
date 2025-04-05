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
      const { userId, timestamp } = result.pendingSync;
      
      // Only process syncs that are less than 1 hour old
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      if (timestamp && timestamp > oneHourAgo && userId) {
        console.log('Processing pending sync for user:', userId);
        
        // Remove the pending sync first to prevent loops
        chrome.storage.local.remove(['pendingSync'], () => {
          // Check if we have direct access to syncUserData
          if (typeof syncUserData === 'function') {
            syncUserData(userId);
          } else {
            console.log('syncUserData not available yet, will retry after initialization');
            
            // Wait for Firebase to initialize
            setTimeout(() => {
              if (typeof syncUserData === 'function') {
                syncUserData(userId);
              } else {
                console.error('syncUserData still not available after waiting');
              }
            }, 2000);
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
        // Clear user data from storage
        chrome.storage.local.remove(['user'], () => {
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
  
  // Track a new application
  async function trackApplication() {
    const trackButton = document.getElementById('track-application-btn');
    const deleteButton = document.getElementById('delete-application-btn');
    
    // Add loading state
    trackButton.classList.add('btn-loading');
    trackButton.disabled = true;
    
    try {
      // Get current stats
      const stats = await getUserStats();
      
      // Get the current page URL from the active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = tab.url;
      const title = tab.title || 'Job Application';
      
      // Check if this URL is already tracked as the lastTracked
      const lastTrackedJob = stats.appliedJobs.find(job => job.lastTracked === true);
      if (lastTrackedJob && lastTrackedJob.url === url) {
        // This URL is already tracked
        trackButton.classList.remove('btn-loading');
        trackButton.classList.add('btn-warning');
        trackButton.querySelector('.btn-text').textContent = 'Already tracked';
        
        // Reset button after delay
        setTimeout(() => {
          trackButton.classList.remove('btn-warning');
          trackButton.disabled = true;
          trackButton.querySelector('.btn-text').textContent = 'Track Application';
          
          // Make sure delete button is enabled
          deleteButton.disabled = false;
        }, 1500);
        
        return;
      }
      
      // Update stats
      stats.todayCount += 1;
      const today = new Date().toISOString().split('T')[0];
      
      // Add the application with special flag indicating it's the latest tracked URL
      // Clear any previous lastTracked flags first
      stats.appliedJobs.forEach(job => job.lastTracked = false);
      
      stats.appliedJobs.push({
        url: url,
        title: title,
        date: today,
        timestamp: new Date().toISOString(),
        lastTracked: true  // Flag to identify the last tracked URL
      });
      
      // Check if streak should be updated (if today's count just reached 20)
      if (stats.todayCount === 20) {
        stats.streak += 1;
      }
      
      // Save stats
      await updateStats(stats);
      
      // Show feedback
      trackButton.classList.add('btn-success');
      trackButton.querySelector('.btn-text').textContent = 'Added!';
      
      // Update UI
      updateCounters(stats);
      updateRecentApplications(stats.appliedJobs);
      createApplicationChart(stats.appliedJobs);
      
      // Sync with Firebase
      syncWithFirebase();
      
      // Enable the delete button and disable the track button
      deleteButton.disabled = false;
      
      // Reset button after delay
      setTimeout(() => {
        trackButton.classList.remove('btn-loading', 'btn-success');
        trackButton.disabled = true; // Keep disabled until remove is clicked
        trackButton.querySelector('.btn-text').textContent = 'Track Application';
      }, 1500);
      
    } catch (error) {
      console.error("Error tracking application:", error);
      trackButton.classList.remove('btn-loading');
      trackButton.classList.add('btn-error');
      
      setTimeout(() => {
        trackButton.classList.remove('btn-error');
        trackButton.disabled = false;
      }, 1500);
      
      showError("Failed to track application");
    }
  }
  
  // Remove an application
  async function removeApplication() {
    const deleteButton = document.getElementById('delete-application-btn');
    const trackButton = document.getElementById('track-application-btn');
    
    // Add loading state
    deleteButton.classList.add('btn-loading');
    deleteButton.disabled = true;
    
    try {
      // Get current stats
      const stats = await getUserStats();
      
      // Get the current page URL 
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentUrl = tab.url;
      
      // Find the last tracked URL that matches current URL
      const lastTrackedIndex = stats.appliedJobs.findIndex(job => 
        job.lastTracked === true && job.url === currentUrl
      );
      
      if (lastTrackedIndex !== -1 && stats.todayCount > 0) {
        // Decrement counter
        stats.todayCount -= 1;
        
        // Remove the job
        stats.appliedJobs.splice(lastTrackedIndex, 1);
        
        // Save stats
        await updateStats(stats);
        
        // Show feedback
        deleteButton.classList.add('btn-success');
        deleteButton.querySelector('.btn-text').textContent = 'Removed!';
        
        // Update UI
        updateCounters(stats);
        updateRecentApplications(stats.appliedJobs);
        createApplicationChart(stats.appliedJobs);
        
        // Sync with Firebase
        syncWithFirebase();
      } else {
        deleteButton.classList.add('btn-warning');
        deleteButton.querySelector('.btn-text').textContent = 'Not tracked here';
      }
      
      // Reset button after delay
      setTimeout(() => {
        deleteButton.classList.remove('btn-loading', 'btn-success', 'btn-warning');
        deleteButton.disabled = true; // Keep disabled until track is clicked
        deleteButton.querySelector('.btn-text').textContent = 'Remove Application';
        
        // Enable track button
        trackButton.disabled = false;
      }, 1500);
      
    } catch (error) {
      console.error("Error removing application:", error);
      deleteButton.classList.remove('btn-loading');
      deleteButton.classList.add('btn-error');
      
      setTimeout(() => {
        deleteButton.classList.remove('btn-error');
        deleteButton.disabled = true;
        
        // Enable track button
        trackButton.disabled = false;
      }, 1500);
      
      showError("Failed to remove application");
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
  
  // Sync stats with Firebase
  function syncWithFirebase() {
    chrome.runtime.sendMessage({ action: 'syncStats' })
      .catch(error => {
        console.log("Could not send sync message:", error);
      });
  }
  
  // Get user stats
  async function getUserStats() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['stats'], (result) => {
        const defaultStats = {
          todayCount: 0,
          streak: 0,
          lastUpdated: new Date().toISOString().split('T')[0],
          appliedJobs: []
        };
        
        resolve(result.stats || defaultStats);
      });
    });
  }
  
  // Update stats
  async function updateStats(stats) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ stats }, () => {
        resolve();
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
            chrome.storage.local.remove(['user'], () => {
              showAuthScreen();
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
            chrome.storage.local.set({ user: userData }, () => {
              showDashboard(userData);
            });
          } else {
            // No user in Firebase either, show auth screen
            showAuthScreen();
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
      
      // Store user info in Chrome storage for persistence
      chrome.storage.local.set({ user: userData }, () => {
        showDashboard(userData);
      });
    } else {
      // No user signed in with Firebase, check storage as fallback
      chrome.storage.local.get(['user'], (result) => {
        if (result.user) {
          // User in storage but not in Firebase, verify with onAuthStateChanged
          auth.onAuthStateChanged((firebaseUser) => {
            if (firebaseUser) {
              showDashboard(result.user);
            } else {
              showAuthScreen();
            }
          });
        } else {
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
  
  // Load user stats
  function loadUserStats() {
    chrome.storage.local.get(['stats'], (result) => {
      if (result.stats) {
        const stats = result.stats;
        
        // Update counts
        updateCounters(stats);
        
        // Update recent applications list
        updateRecentApplications(stats.appliedJobs || []);
        
        // Create or update chart
        createApplicationChart(stats.appliedJobs || []);
      } else {
        // Initialize with empty stats
        const defaultStats = {
          todayCount: 0,
          streak: 0,
          lastUpdated: new Date().toISOString().split('T')[0],
          appliedJobs: []
        };
        
        chrome.storage.local.set({ stats: defaultStats });
        
        updateCounters(defaultStats);
        
        // Create empty chart
        createApplicationChart([]);
      }
    });
  }
  
  // Update recent applications list
  function updateRecentApplications(appliedJobs) {
    // Sort by date descending
    const sortedJobs = [...appliedJobs].sort((a, b) => 
      new Date(b.timestamp) - new Date(a.timestamp)
    );
    
    // Take only the 5 most recent
    const recentJobs = sortedJobs.slice(0, 3);
    
    if (recentJobs.length > 0) {
      recentApplicationsList.innerHTML = '';
      
      recentJobs.forEach(job => {
        const jobDate = new Date(job.timestamp);
        const formattedDate = jobDate.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        });
        
        const jobElement = document.createElement('div');
        jobElement.className = 'application-item';
        
        // Don't show URL for manual entries
        const urlDisplay = job.url === 'manual-entry' 
          ? 'Manual entry' 
          : job.url;
        
        jobElement.innerHTML = `
          <div class="application-title">${job.title || 'Job Application'}</div>
          <div class="application-url">${urlDisplay}</div>
          <div class="application-date">${formattedDate}</div>
        `;
        
        // Add click event to open the URL (except for manual entries)
        if (job.url !== 'manual-entry') {
          jobElement.addEventListener('click', () => {
            chrome.tabs.create({ url: job.url });
          });
        }
        
        recentApplicationsList.appendChild(jobElement);
      });
    } else {
      recentApplicationsList.innerHTML = '<div class="empty-state">No applications tracked yet.</div>';
    }
  }
  
  // Create applications chart
  function createApplicationChart(appliedJobs) {
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

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'triggerFirebaseSync' && request.userId) {
      console.log('Received request to sync with Firebase for user:', request.userId);
      // Check if syncUserData function exists
      if (typeof syncUserData === 'function') {
        syncUserData(request.userId);
        sendResponse({ status: 'success' });
      } else {
        console.error('syncUserData function not found');
        sendResponse({ status: 'error', message: 'syncUserData function not found' });
      }
    }
    return true; // Keep the message channel open for async responses
  });
}); 