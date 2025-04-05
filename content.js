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
  // Check if the user is authenticated
  const isAuthenticated = await checkAuthentication();
  if (!isAuthenticated) {
    return;
  }
  
  // Get user stats
  let stats = await getUserStats();
  stats = await checkAndResetDailyCount(stats);
  await updateStats(stats);
  
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
          <span class="stat-count">${stats.todayCount}</span>
          <span class="stat-label">Today</span>
        </div>
        <div class="stat-box">
          <span class="stat-count">${stats.streak}</span>
          <span class="stat-label">Day Streak</span>
        </div>
      </div>
      <div class="job-streak-actions">
        <button id="track-job">Track Application</button>
        <button id="track-url">Track & Save URL</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(container);
  
  // Add event listeners
  document.getElementById('job-streak-close').addEventListener('click', () => {
    container.style.display = 'none';
  });
  
  document.getElementById('track-job').addEventListener('click', async () => {
    stats.todayCount += 1;
    await updateStats(stats);
    document.querySelector('.stat-box:first-child .stat-count').textContent = stats.todayCount;
    // Check if streak should be updated
    if (stats.todayCount >= 20 && stats.todayCount - 1 < 20) {
      stats.streak += 1;
      document.querySelector('.stat-box:nth-child(2) .stat-count').textContent = stats.streak;
      await updateStats(stats);
    }
  });
  
  document.getElementById('track-url').addEventListener('click', async () => {
    stats.todayCount += 1;
    const jobUrl = window.location.href;
    const today = new Date().toISOString().split('T')[0];
    
    stats.appliedJobs.push({
      url: jobUrl,
      title: document.title,
      date: today,
      timestamp: new Date().toISOString()
    });
    
    await updateStats(stats);
    document.querySelector('.stat-box:first-child .stat-count').textContent = stats.todayCount;
    
    // Check if streak should be updated
    if (stats.todayCount >= 20 && stats.todayCount - 1 < 20) {
      stats.streak += 1;
      document.querySelector('.stat-box:nth-child(2) .stat-count').textContent = stats.streak;
      await updateStats(stats);
    }
  });
};

// Add event listener to inject UI after page load
window.addEventListener('load', () => {
  // Job application site detection logic (simplified for now)
  const isJobSite = true; // In a real app, we would have more complex detection
  
  if (isJobSite) {
    createJobTrackingUI();
  }
});

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'refreshStats') {
    createJobTrackingUI();
  }
  sendResponse({ status: 'success' });
}); 