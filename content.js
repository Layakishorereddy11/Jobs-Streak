// Function to check if user is authenticated
const checkAuthentication = async () => {
  return new Promise((resolve) => {
    chrome.storage.local.get(['user'], (result) => {
      resolve(!!result.user);
    });
  });
};

// Function to get user stats
const getUserStats = async () => {
  return new Promise((resolve) => {
    chrome.storage.local.get(['user', 'stats'], (result) => {
      if (!result.user) {
        console.log('No user found in getUserStats');
        resolve(null);
        return;
      }
      
      // Get userId for verification
      const userId = result.user.uid;
      
      // Default stats with user ID 
      const defaultStats = {
        userId,
        todayCount: 0,
        streak: 0,
        lastUpdated: new Date().toISOString().split('T')[0],
        appliedJobs: []
      };
      
      // Verify and clean stats if they exist
      if (result.stats) {
        if (!result.stats.userId) {
          result.stats.userId = userId;
        }
        
        if (!Array.isArray(result.stats.appliedJobs)) {
          result.stats.appliedJobs = [];
        }
        
        // If stats belong to a different user, return default stats
        if (result.stats.userId !== userId) {
          console.log('Stats belong to different user, returning default stats');
          resolve(defaultStats);
          return;
        }
        
        resolve(result.stats);
      } else {
        resolve(defaultStats);
      }
    });
  });
};

// Function to update stats
const updateStats = async (stats) => {
  return new Promise((resolve) => {
    chrome.storage.local.set({ stats }, () => {
      resolve();
    });
  });
};

// Function to check and reset daily count if day changed
const checkAndResetDailyCount = async (stats) => {
  const today = new Date().toISOString().split('T')[0];
  const lastUpdated = stats.lastUpdated || today;
  
  if (today !== lastUpdated) {
    const lastDate = new Date(lastUpdated);
    const todayDate = new Date(today);
    const diffTime = Math.abs(todayDate - lastDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // Reset streak if more than one day passed or didn't meet goal
    if (diffDays > 1 || stats.todayCount < 20) {
      stats.streak = 0;
    } else if (stats.todayCount >= 20 && diffDays === 1) {
      // Increment streak if goal was met yesterday
      stats.streak += 1;
    }
    
    // Reset today's count
    stats.todayCount = 0;
    stats.lastUpdated = today;
  }
  
  return stats;
};

// Function to create and inject job tracking UI
const createJobTrackingUI = async () => {
  try {
    // Remove existing container if it exists
    const existingContainer = document.getElementById('job-streak-container');
    if (existingContainer) {
      existingContainer.remove();
    }
    
    // Check if user is authenticated
    const isAuthenticated = await checkAuthentication();
    if (!isAuthenticated) {
      return;
    }
    
    // Get user stats
    let stats = await getUserStats();
    if (!stats) {
      stats = {
        todayCount: 0,
        streak: 0,
        lastUpdated: new Date().toISOString().split('T')[0],
        appliedJobs: []
      };
    }
    
    // Ensure appliedJobs exists
    if (!Array.isArray(stats.appliedJobs)) {
      stats.appliedJobs = [];
    }
    
    stats = await checkAndResetDailyCount(stats);
    await updateStats(stats);
    
    // Get current URL and check if it's already tracked
    const currentUrl = window.location.href;
    const lastTrackedJob = stats.appliedJobs.find(job => job && job.lastTracked === true);
    const isCurrentUrlTracked = lastTrackedJob && lastTrackedJob.url === currentUrl;
    
    // Set button states based on current URL
    const trackDisabled = isCurrentUrlTracked ? 'disabled' : '';
    const removeDisabled = !isCurrentUrlTracked ? 'disabled' : '';
    
    // Create the UI container
    const container = document.createElement('div');
    container.id = 'job-streak-container';
    container.innerHTML = `
      <div class="job-streak-widget">
        <div class="job-streak-header">
          <img src="${chrome.runtime.getURL('images/icon48.png')}" alt="Jobs Streak" />
          <h3>Jobs Streak</h3>
          <button id="job-streak-close">×</button>
        </div>
        <div class="job-streak-stats">
          <div class="stat-box">
            <span class="stat-count">${stats.todayCount || 0}</span>
            <span class="stat-label">Today</span>
          </div>
          <div class="stat-box">
            <span class="stat-count">${stats.streak || 0}</span>
            <span class="stat-label">Day Streak</span>
          </div>
        </div>
        <div class="job-streak-actions">
          <button id="track-job" class="job-streak-button track" ${trackDisabled}>
            <span class="button-icon">+</span>
            Track Application
          </button>
          <button id="remove-job" class="job-streak-button remove" ${removeDisabled}>
            <span class="button-icon">-</span>
            Remove Application
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(container);
    
    // Add event listeners
    document.getElementById('job-streak-close').addEventListener('click', () => {
      container.style.display = 'none';
    });
    
    // Track job button event listener
    document.getElementById('track-job').addEventListener('click', async () => {
      const trackButton = document.getElementById('track-job');
      const removeButton = document.getElementById('remove-job');
      
      if (!trackButton || !removeButton) return;
      
      trackButton.classList.add('loading');
      trackButton.disabled = true;
      
      try {
        const jobUrl = window.location.href;
        
        // Check if already tracked
        const lastTrackedJob = stats.appliedJobs.find(job => job.lastTracked === true);
        if (lastTrackedJob && lastTrackedJob.url === jobUrl) {
          trackButton.classList.remove('loading');
          trackButton.classList.add('warning');
          
          const buttonTextSpan = trackButton.querySelector('.button-icon') ? 
            trackButton : trackButton.querySelector('.btn-text');
          if (buttonTextSpan) buttonTextSpan.textContent = 'Already tracked';
          
          setTimeout(() => {
            const refreshedTrackButton = document.getElementById('track-job');
            const refreshedRemoveButton = document.getElementById('remove-job');
            if (!refreshedTrackButton || !refreshedRemoveButton) return;
            
            refreshedTrackButton.classList.remove('warning');
            refreshedTrackButton.disabled = true;
            refreshedTrackButton.innerHTML = '<span class="button-icon">+</span> Track Application';
            refreshedRemoveButton.disabled = false;
          }, 2000);
          
          return;
        }
        
        // Increment count
        stats.todayCount += 1;
        
        // Get today's date
        const today = new Date().toISOString().split('T')[0];
        
        // Clear any previous lastTracked flags
        stats.appliedJobs.forEach(job => job.lastTracked = false);
        
        // Extract company name from URL
        const url = new URL(jobUrl);
        const hostname = url.hostname.replace('www.', '');
        const companyName = hostname.split('.')[0].charAt(0).toUpperCase() + hostname.split('.')[0].slice(1);
        
        // Add new job application
        stats.appliedJobs.unshift({
          url: jobUrl,
          title: document.title,
          date: today,
          company: companyName,
          timestamp: new Date().toISOString(),
          lastTracked: true
        });
        
        // Update stats
        await updateStats(stats);
        
        // Update UI counters
        const todayCountElement = document.querySelector('.stat-box:first-child .stat-count');
        if (todayCountElement) todayCountElement.textContent = stats.todayCount;
        
        // Check if streak should be updated
        if (stats.todayCount >= 20 && stats.todayCount - 1 < 20) {
          stats.streak += 1;
          const streakCountElement = document.querySelector('.stat-box:nth-child(2) .stat-count');
          if (streakCountElement) streakCountElement.textContent = stats.streak;
        }
        
        // Update button state
        if (trackButton && document.body.contains(trackButton)) {
          trackButton.classList.remove('loading');
          trackButton.classList.add('success');
          
          const buttonTextSpan = trackButton.querySelector('.button-icon') ? 
            trackButton : trackButton.querySelector('.btn-text');
          if (buttonTextSpan) buttonTextSpan.textContent = 'Added!';
        }
        
        // Update remove button state
        if (removeButton && document.body.contains(removeButton)) {
          removeButton.disabled = false;
        }
        
        // Sync with Firestore
        await syncWithFirestore();
        
        // Reset button after delay
        setTimeout(() => {
          const refreshedTrackButton = document.getElementById('track-job');
          if (refreshedTrackButton) {
            refreshedTrackButton.classList.remove('success');
            refreshedTrackButton.disabled = true;
            refreshedTrackButton.innerHTML = '<span class="button-icon">+</span> Track Application';
          }
        }, 2000);
        
      } catch (error) {
        console.error("Error tracking application:", error);
        
        if (trackButton && document.body.contains(trackButton)) {
          trackButton.classList.remove('loading');
          trackButton.classList.add('error');
          
          setTimeout(() => {
            const refreshedTrackButton = document.getElementById('track-job');
            if (refreshedTrackButton) {
              refreshedTrackButton.classList.remove('error');
              refreshedTrackButton.disabled = false;
              refreshedTrackButton.innerHTML = '<span class="button-icon">+</span> Track Application';
            }
          }, 2000);
        }
      }
    });
    
    // Remove job button event listener
    document.getElementById('remove-job').addEventListener('click', async () => {
      const removeButton = document.getElementById('remove-job');
      const trackButton = document.getElementById('track-job');
      
      if (!removeButton || !trackButton) return;
      
      removeButton.classList.add('loading');
      removeButton.disabled = true;
      
      try {
        const currentUrl = window.location.href;
        
        // Find the job to remove
        const lastTrackedIndex = stats.appliedJobs.findIndex(job => 
          job.lastTracked === true && job.url === currentUrl
        );
        
        if (lastTrackedIndex !== -1 && stats.todayCount > 0) {
          // Decrement count
          stats.todayCount -= 1;
          
          // Remove the job
          stats.appliedJobs.splice(lastTrackedIndex, 1);
          
          // Update stats
          await updateStats(stats);
          
          // Update UI
          const todayCountElement = document.querySelector('.stat-box:first-child .stat-count');
          if (todayCountElement) todayCountElement.textContent = stats.todayCount;
          
          // Update button states
          if (removeButton && document.body.contains(removeButton)) {
            removeButton.classList.remove('loading');
            removeButton.classList.add('success');
            
            const buttonTextSpan = removeButton.querySelector('.button-icon') ? 
              removeButton : removeButton.querySelector('.btn-text');
            if (buttonTextSpan) buttonTextSpan.textContent = 'Removed!';
          }
          
          if (trackButton && document.body.contains(trackButton)) {
            trackButton.disabled = false;
          }
          
          // Sync with Firestore
          await syncWithFirestore();
        } else {
          if (removeButton && document.body.contains(removeButton)) {
            removeButton.classList.remove('loading');
            removeButton.classList.add('warning');
            
            const buttonTextSpan = removeButton.querySelector('.button-icon') ? 
              removeButton : removeButton.querySelector('.btn-text');
            if (buttonTextSpan) buttonTextSpan.textContent = 'No job to remove';
          }
        }
        
        // Reset button after delay
        setTimeout(() => {
          const refreshedRemoveButton = document.getElementById('remove-job');
          if (refreshedRemoveButton) {
            refreshedRemoveButton.classList.remove('warning');
            refreshedRemoveButton.classList.remove('success');
            refreshedRemoveButton.innerHTML = '<span class="button-icon">-</span> Remove Application';
            
            // Update button state
            const currentUrl = window.location.href;
            const lastTrackedJob = stats.appliedJobs.find(job => job.lastTracked === true);
            refreshedRemoveButton.disabled = !(lastTrackedJob && lastTrackedJob.url === currentUrl);
          }
        }, 2000);
        
      } catch (error) {
        console.error("Error removing application:", error);
        
        if (removeButton && document.body.contains(removeButton)) {
          removeButton.classList.remove('loading');
          removeButton.classList.add('error');
          
          setTimeout(() => {
            const refreshedRemoveButton = document.getElementById('remove-job');
            if (refreshedRemoveButton) {
              refreshedRemoveButton.classList.remove('error');
              refreshedRemoveButton.disabled = false;
              refreshedRemoveButton.innerHTML = '<span class="button-icon">-</span> Remove Application';
            }
          }, 2000);
        }
      }
    });
    
  } catch (error) {
    console.error('Error creating UI:', error);
  }
};

// Function to sync with Firestore via background script
const syncWithFirestore = async () => {
  try {
    // Make sure we have user and stats data before attempting to sync
    const userData = await new Promise(resolve => {
      chrome.storage.local.get(['user', 'stats'], (result) => {
        resolve(result);
      });
    });
    
    if (!userData.user || !userData.stats) {
      console.log('No user or stats found, skipping sync');
      return false;
    }
    
    // Ensure stats has userId for verification
    if (!userData.stats.userId) {
      userData.stats.userId = userData.user.uid;
      await new Promise(resolve => {
        chrome.storage.local.set({ stats: userData.stats }, resolve);
      });
    }
    
    // Send sync message to background script
    const response = await chrome.runtime.sendMessage({ action: 'syncStats' });
    return response && response.status === 'success';
  } catch (error) {
    console.error('Error sending sync message:', error);
    
    // Try again in case the background script was inactive
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      const retryResponse = await chrome.runtime.sendMessage({ action: 'syncStats' });
      return retryResponse && retryResponse.status === 'success';
    } catch (retryError) {
      console.error('Retry sync also failed:', retryError);
      return false;
    }
  }
};

// Function to update button states based on current URL
const updateButtonStates = async () => {
  try {
    const currentUrl = window.location.href;
    const userData = await new Promise(resolve => {
      chrome.storage.local.get(['stats'], (result) => {
        resolve(result);
      });
    });
    
    if (!userData.stats || !Array.isArray(userData.stats.appliedJobs)) {
      console.log('No valid stats found for button state update');
      return;
    }
    
    const stats = userData.stats;
    const lastTrackedJob = stats.appliedJobs.find(job => job && job.lastTracked === true);
    const isCurrentUrlTracked = lastTrackedJob && lastTrackedJob.url === currentUrl;
    
    // Get button elements
    const trackButton = document.getElementById('track-job');
    const removeButton = document.getElementById('remove-job');
    
    if (trackButton && removeButton) {
      // Update button states
      trackButton.disabled = isCurrentUrlTracked;
      removeButton.disabled = !isCurrentUrlTracked;
      
      // Reset button text if needed
      trackButton.innerHTML = '<span class="button-icon">+</span> Track Application';
      removeButton.innerHTML = '<span class="button-icon">-</span> Remove Application';
      
      // Remove any status classes
      trackButton.classList.remove('loading', 'success', 'warning', 'error');
      removeButton.classList.remove('loading', 'success', 'warning', 'error');
    }
  } catch (error) {
    console.error('Error updating button states:', error);
  }
};

// Initial UI creation
createJobTrackingUI();

// Listen for messages from background or popup
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'refreshStats') {
    console.log('Received refreshStats message, updating UI');
    // Fully recreate the UI for major changes
    createJobTrackingUI();
  } else if (message.action === 'updateButtonStates') {
    console.log('Received updateButtonStates message');
    // Just update button states for minor changes
    updateButtonStates();
  } else if (message.action === 'statsUpdated') {
    console.log('Received statsUpdated message, updating button states');
    // Update button states when stats are updated in popup
    updateButtonStates();
  }
});

// Add a mutation observer to detect URL changes in SPA sites
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    createJobTrackingUI();
  }
}).observe(document, { subtree: true, childList: true });