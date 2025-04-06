// Function to check if user is authenticated
const checkAuthentication = async () => {
  return new Promise((resolve) => {
    chrome.storage.local.get(['user'], (result) => {
      resolve(result.user ? true : false);
    });
  });
};

// Function to get user stats
const getUserStats = async () => {
  return new Promise((resolve) => {
    chrome.storage.local.get(['user', 'stats'], (result) => {
      // First check if we have a user
      if (!result.user) {
        console.log('No user found in getUserStats');
        resolve(null);
        return;
      }
      
      // Create userId for verification
      const userId = result.user.uid;
      
      // Default stats with user ID 
      const defaultStats = {
        userId: userId,
        todayCount: 0,
        streak: 0,
        lastUpdated: new Date().toISOString().split('T')[0],
        appliedJobs: []
      };
      
      // Verify and clean stats if they exist
      if (result.stats) {
        // Add userId if missing
        if (!result.stats.userId) {
          result.stats.userId = userId;
        }
        
        // Ensure appliedJobs is an array
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
  const lastUpdated = stats.lastUpdated;
  
  if (today !== lastUpdated) {
    // If more than one day has passed and yesterday's count was less than 20, reset streak
    const lastDate = new Date(lastUpdated);
    const todayDate = new Date(today);
    const diffTime = Math.abs(todayDate - lastDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays > 1 || stats.todayCount < 20) {
      stats.streak = 0;
    }
    
    // If user completed yesterday's goal, increment streak
    if (stats.todayCount >= 20 && diffDays === 1) {
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
    
    // Check if the user is authenticated
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
    
    // Get current URL
    const currentUrl = window.location.href;
    
    // Check if any URL was last tracked (for button state)
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
    
    document.getElementById('track-job').addEventListener('click', async () => {
      // Store references to buttons
      const trackButton = document.getElementById('track-job');
      const removeButton = document.getElementById('remove-job');
      
      // Check if buttons still exist
      if (!trackButton || !removeButton) return;
      
      // Show loading state
      trackButton.classList.add('loading');
      trackButton.disabled = true;
      
      try {
        // Get the current URL
        const jobUrl = window.location.href;
        
        // Check if this URL is already tracked
        const lastTrackedJob = stats.appliedJobs.find(job => job.lastTracked === true);
        if (lastTrackedJob && lastTrackedJob.url === jobUrl) {
          // This URL is already tracked
          trackButton.classList.remove('loading');
          trackButton.classList.add('warning');
          
          // Use safer way to update text content
          const buttonTextSpan = trackButton.querySelector('.btn-text') || trackButton;
          if (buttonTextSpan) buttonTextSpan.textContent = 'Already tracked';
          
          // Reset button after delay
          setTimeout(() => {
            // Check if element still exists
            const refreshedTrackButton = document.getElementById('track-job');
            const refreshedRemoveButton = document.getElementById('remove-job');
            if (!refreshedTrackButton || !refreshedRemoveButton) return;
            
            refreshedTrackButton.classList.remove('warning');
            refreshedTrackButton.disabled = true;
            refreshedTrackButton.innerHTML = '<span class="button-icon">+</span> Track Application';
            
            // Make sure remove button is enabled
            refreshedRemoveButton.disabled = false;
          }, 2000);
          
          return;
        }
        
        // Increment count
        stats.todayCount += 1;
        
        // Save URL and info
        const today = new Date().toISOString().split('T')[0];
        
        // Clear any previous lastTracked flags
        stats.appliedJobs.forEach(job => job.lastTracked = false);
        
        stats.appliedJobs.push({
          url: jobUrl,
          title: document.title,
          date: today,
          timestamp: new Date().toISOString(),
          lastTracked: true // Flag to identify the last tracked URL
        });
        
        // Update stats
        await updateStats(stats);
        
        // Update UI - safely with null checks
        const todayCountElement = document.querySelector('.stat-box:first-child .stat-count');
        if (todayCountElement) todayCountElement.textContent = stats.todayCount;
        
        // Check if streak should be updated
        if (stats.todayCount >= 20 && stats.todayCount - 1 < 20) {
          stats.streak += 1;
          const streakCountElement = document.querySelector('.stat-box:nth-child(2) .stat-count');
          if (streakCountElement) streakCountElement.textContent = stats.streak;
        }
        
        // Check if trackButton still exists before using it
        if (trackButton && document.body.contains(trackButton)) {
          // Show success state
          trackButton.classList.remove('loading');
          trackButton.classList.add('success');
          
          // Use safer way to update text
          const buttonTextSpan = trackButton.querySelector('.btn-text') || trackButton;
          if (buttonTextSpan) buttonTextSpan.textContent = 'Added!';
        }
        
        // Check if removeButton still exists
        if (removeButton && document.body.contains(removeButton)) {
          // Enable remove button and keep track button disabled
          removeButton.disabled = false;
        }
        
        // Sync with Firestore via background script
        const syncSuccess = await syncWithFirestore();
        if (!syncSuccess) {
          console.log('Firestore sync failed, data will sync later');
        }
        
        // Reset button after delay with null checks
        setTimeout(() => {
          // Get fresh references in case DOM has changed
          const refreshedTrackButton = document.getElementById('track-job');
          if (refreshedTrackButton) {
            refreshedTrackButton.classList.remove('success');
            refreshedTrackButton.disabled = true; // Keep disabled until remove is clicked
            refreshedTrackButton.innerHTML = '<span class="button-icon">+</span> Track Application';
          }
        }, 2000);
        
      } catch (error) {
        console.error("Error tracking application:", error);
        
        // Null check before using trackButton
        if (trackButton && document.body.contains(trackButton)) {
          trackButton.classList.remove('loading');
          trackButton.classList.add('error');
          
          setTimeout(() => {
            // Get fresh reference in case DOM has changed
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
    
    document.getElementById('remove-job').addEventListener('click', async () => {
      // Store references to buttons
      const removeButton = document.getElementById('remove-job');
      const trackButton = document.getElementById('track-job');
      
      // Check if buttons still exist
      if (!removeButton || !trackButton) return;
      
      // Show loading state
      removeButton.classList.add('loading');
      removeButton.disabled = true;
      
      try {
        // Get current URL
        const currentUrl = window.location.href;
        
        // Find the last tracked job for this URL
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
          
          // Update UI - safely with null checks
          const todayCountElement = document.querySelector('.stat-box:first-child .stat-count');
          if (todayCountElement) todayCountElement.textContent = stats.todayCount;
          
          // Null check before using removeButton
          if (removeButton && document.body.contains(removeButton)) {
            // Show success state
            removeButton.classList.remove('loading');
            removeButton.classList.add('success');
            
            // Use safer way to update text
            const buttonTextSpan = removeButton.querySelector('.btn-text') || removeButton;
            if (buttonTextSpan) buttonTextSpan.textContent = 'Removed!';
          }
          
          // Null check before using trackButton
          if (trackButton && document.body.contains(trackButton)) {
            // Enable track button
            trackButton.disabled = false;
          }
          
          // Sync with Firestore via background script
          const syncSuccess = await syncWithFirestore();
          if (!syncSuccess) {
            console.log('Firestore sync failed, data will sync later');
          }
        } else {
          // Only proceed if elements still exist
          if (removeButton && document.body.contains(removeButton)) {
            // No applications to remove for this URL
            removeButton.classList.remove('loading');
            removeButton.classList.add('warning');
            
            // Use safer way to update text
            const buttonTextSpan = removeButton.querySelector('.btn-text') || removeButton;
            if (buttonTextSpan) buttonTextSpan.textContent = 'Nothing to remove';
          }
          
          // Null check before using trackButton
          if (trackButton && document.body.contains(trackButton)) {
            // Enable track button since there's nothing to remove
            trackButton.disabled = false;
          }
        }
        
        // Reset button after delay with null checks
        setTimeout(() => {
          // Get fresh references in case DOM has changed
          const refreshedRemoveButton = document.getElementById('remove-job');
          const refreshedTrackButton = document.getElementById('track-job');
          
          if (refreshedRemoveButton) {
            refreshedRemoveButton.classList.remove('success', 'warning');
            refreshedRemoveButton.disabled = true; // Keep disabled until track is clicked
            refreshedRemoveButton.innerHTML = '<span class="button-icon">-</span> Remove Application';
          }
          
          if (refreshedTrackButton) {
            refreshedTrackButton.disabled = false;
          }
        }, 2000);
        
      } catch (error) {
        console.error("Error removing application:", error);
        
        // Null check before using removeButton
        if (removeButton && document.body.contains(removeButton)) {
          removeButton.classList.remove('loading');
          removeButton.classList.add('error');
          
          setTimeout(() => {
            // Get fresh references in case DOM has changed
            const refreshedRemoveButton = document.getElementById('remove-job');
            const refreshedTrackButton = document.getElementById('track-job');
            
            if (refreshedRemoveButton) {
              refreshedRemoveButton.classList.remove('error');
              refreshedRemoveButton.disabled = !isCurrentUrlTracked;
              refreshedRemoveButton.innerHTML = '<span class="button-icon">-</span> Remove Application';
            }
            
            if (refreshedTrackButton) {
              // Enable track button
              refreshedTrackButton.disabled = isCurrentUrlTracked;
            }
          }, 2000);
        }
      }
    });

    // Add click listener to stats area for manual sync
    document.querySelector('.job-streak-stats').addEventListener('click', async () => {
      // Visual feedback that sync is happening
      const statsElement = document.querySelector('.job-streak-stats');
      statsElement.classList.add('syncing');
      
      // Try to pull from Firestore
      console.log('Manual sync triggered - pulling from Firestore');
      const syncSuccess = await pullFromFirestore();
      
      // Visual feedback of sync result
      if (syncSuccess) {
        statsElement.classList.remove('syncing');
        statsElement.classList.add('sync-success');
        setTimeout(() => {
          statsElement.classList.remove('sync-success');
        }, 1500);
      } else {
        statsElement.classList.remove('syncing');
        statsElement.classList.add('sync-error');
        setTimeout(() => {
          statsElement.classList.remove('sync-error');
        }, 1500);
      }
      
      // Refresh UI to show updated data
      await refreshUI(true);
    });
  } catch (error) {
    console.error("Error creating job tracking UI:", error);
  }
};

// Function to refresh the UI without recreating it
const refreshUI = async (skipSync = true) => {
  try {
    // Check if UI exists, if not recreate it
    const container = document.getElementById('job-streak-container');
    if (!container) {
      console.log('UI container not found, recreating');
      createJobTrackingUI();
      return;
    }

    // Get latest stats
    let stats = await getUserStats();
    if (!stats) {
      console.log('No stats found, recreating UI');
      createJobTrackingUI();
      return;
    }
    
    // Ensure stats has appliedJobs
    if (!stats.appliedJobs) {
      stats.appliedJobs = [];
    }
    
    // Update counter displays
    const todayCountElement = document.querySelector('.stat-box:first-child .stat-count');
    const streakCountElement = document.querySelector('.stat-box:nth-child(2) .stat-count');
    
    if (todayCountElement) {
      todayCountElement.textContent = stats.todayCount || 0;
    }
    
    if (streakCountElement) {
      streakCountElement.textContent = stats.streak || 0;
    }
    
    // Reset button states based on current URL
    const currentUrl = window.location.href;
    const lastTrackedJob = Array.isArray(stats.appliedJobs) 
      ? stats.appliedJobs.find(job => job && job.lastTracked === true) 
      : null;
    const isCurrentUrlTracked = lastTrackedJob && lastTrackedJob.url === currentUrl;
    
    const trackButton = document.getElementById('track-job');
    const removeButton = document.getElementById('remove-job');
    
    if (!trackButton || !removeButton) {
      console.log('Buttons not found, recreating UI');
      createJobTrackingUI();
      return;
    }
    
    // Reset button states and appearances
    trackButton.disabled = isCurrentUrlTracked;
    trackButton.classList.remove('loading', 'success', 'error', 'warning');
    trackButton.innerHTML = '<span class="button-icon">+</span> Track Application';
    
    removeButton.disabled = !isCurrentUrlTracked;
    removeButton.classList.remove('loading', 'success', 'error', 'warning');
    removeButton.innerHTML = '<span class="button-icon">-</span> Remove Application';
    
    // Only sync with Firestore if explicitly requested
    if (!skipSync) {
      // Pull latest data from Firestore
      await pullFromFirestore();
    }
  } catch (error) {
    console.error('Error refreshing UI:', error);
    // If there's an error, try recreating the UI from scratch
    createJobTrackingUI();
  }
};

// Function to pull data from Firestore without pushing
const pullFromFirestore = async () => {
  try {
    const userData = await new Promise(resolve => {
      chrome.storage.local.get(['user'], (result) => {
        resolve(result);
      });
    });
    
    if (!userData.user) {
      console.log('No user found, skipping Firestore pull');
      return false;
    }
    
    // Send message to get data from Firestore
    const response = await chrome.runtime.sendMessage({ 
      action: 'getStats', 
      userId: userData.user.uid 
    });
    
    return response && response.success;
  } catch (error) {
    console.error('Error pulling from Firestore:', error);
    return false;
  }
};

// Set up periodic UI refresh every 500 milliseconds (half a second)
setInterval(() => {
  // Just refresh UI without syncing to Firestore
  refreshUI(true).catch(error => {
    console.error('Error in periodic UI refresh:', error);
  });
}, 500);

// Create and inject UI when page loads
window.addEventListener('load', createJobTrackingUI);

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'refreshStats') {
    // Refresh UI with latest data AND pull from Firestore
    refreshUI(false).catch(error => {
      console.error('Error refreshing UI:', error);
    });
    sendResponse({ status: 'success' });
  }
  
  if (request.action === 'userLoggedOut') {
    console.log('User logged out, removing UI');
    // Remove the tracking UI when user logs out
    const container = document.getElementById('job-streak-container');
    if (container) {
      container.remove();
    }
    sendResponse({ status: 'success' });
  }
  
  return true; // Keep message channel open for async response
});

// Add event listener for URL changes in single-page apps
let lastUrl = window.location.href;
new MutationObserver(() => {
  const currentUrl = window.location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    // URL changed, refresh the UI without pushing to Firestore
    refreshUI(true).catch(error => {
      console.error('Error refreshing UI after URL change:', error);
    });
  }
}).observe(document, { subtree: true, childList: true });

// Function to sync with Firestore via background script
const syncWithFirestore = async () => {
  console.log('Sending syncStats message to background script');
  try {
    // Make sure we have user and stats data before attempting to sync
    const userData = await new Promise(resolve => {
      chrome.storage.local.get(['user', 'stats'], (result) => {
        resolve(result);
      });
    });
    
    // If no user or stats, don't sync
    if (!userData.user || !userData.stats) {
      console.log('No user or stats found, skipping sync');
      return false;
    }
    
    // Make sure stats has userId for verification
    if (!userData.stats.userId) {
      userData.stats.userId = userData.user.uid;
      await new Promise(resolve => {
        chrome.storage.local.set({ stats: userData.stats }, resolve);
      });
    }
    
    // Send sync message to background script
    const response = await chrome.runtime.sendMessage({ action: 'syncStats' });
    console.log('Sync response:', response);
    if (response && response.status === 'success') {
      console.log('Sync successful');
      return true;
    } else {
      console.error('Sync failed:', response ? response.message : 'Unknown error');
      return false;
    }
  } catch (error) {
    console.error('Error sending sync message:', error);
    // Try again in case the background script was inactive
    try {
      console.log('Retrying sync after error...');
      // Wait a moment for the service worker to wake up
      await new Promise(resolve => setTimeout(resolve, 500));
      const retryResponse = await chrome.runtime.sendMessage({ action: 'syncStats' });
      console.log('Retry sync response:', retryResponse);
      return retryResponse && retryResponse.status === 'success';
    } catch (retryError) {
      console.error('Retry sync also failed:', retryError);
      return false;
    }
  }
};