document.addEventListener('DOMContentLoaded', () => {
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
  
  // Check if user is authenticated
  checkAuthState();
  
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
        checkAuthState();
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
  
  // Check auth state and update UI accordingly
  function checkAuthState() {
    const user = auth.currentUser;
    
    if (user) {
      // User is signed in, show dashboard
      authSection.classList.remove('active');
      dashboardSection.classList.add('active');
      
      // Update user info
      userName.textContent = user.displayName || 'User';
      userEmail.textContent = user.email || '';
      userAvatar.src = user.photoURL || 'images/avatar-placeholder.png';
      
      // Generate invite link
      inviteLink.value = `https://jobs-streak.web.app/invite/${user.uid}`;
      
      // Load user stats
      loadUserStats();
      
      // Load friends list
      loadFriends();
    } else {
      // User is signed out, show auth section
      dashboardSection.classList.remove('active');
      authSection.classList.add('active');
      loginForm.classList.add('active');
      signupForm.classList.remove('active');
    }
  }
  
  // Load user stats
  function loadUserStats() {
    chrome.storage.local.get(['stats'], (result) => {
      if (result.stats) {
        const stats = result.stats;
        
        // Update counts
        todayCount.textContent = stats.todayCount || 0;
        streakCount.textContent = stats.streak || 0;
        totalCount.textContent = stats.appliedJobs?.length || 0;
        
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
        
        todayCount.textContent = 0;
        streakCount.textContent = 0;
        totalCount.textContent = 0;
        
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
        jobElement.innerHTML = `
          <div class="application-title">${job.title || 'Job Application'}</div>
          <div class="application-url">${job.url}</div>
          <div class="application-date">${formattedDate}</div>
        `;
        
        // Add click event to open the URL
        jobElement.addEventListener('click', () => {
          chrome.tabs.create({ url: job.url });
        });
        
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
          }
        }
      });
    }
  }
  
  // Load friends list
  function loadFriends() {
    const user = auth.currentUser;
    if (!user) return;
    
    db.collection('users').doc(user.uid).collection('friends').get()
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
}); 