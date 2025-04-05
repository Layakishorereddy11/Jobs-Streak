# Jobs Streak Chrome Extension

A beautiful Chrome extension to track your job applications and maintain your daily streak, with social features to compete with friends.

## Features

- 🔍 **Automatic Job Detection**: The extension automatically detects job application sites.
- 📊 **Easy Tracking**: Two convenient buttons to track your job applications:
  - Simple counter to track your daily applications
  - Track with URL to save the job URL for future reference
- 🔥 **Streak System**: Apply to at least 20 jobs daily to maintain your streak.
- 📈 **Beautiful Statistics**: Visualize your application history with elegant charts.
- 👥 **Social Features**: Invite friends to view each other's streaks and share job URLs.
- 🔐 **Secure Authentication**: Email/password and Google sign-in options.
- 💾 **Cloud Sync**: Your data syncs across devices using Firebase.

## Installation

1. Clone this repository or download it as a ZIP file.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable "Developer mode" using the toggle in the top right.
4. Click "Load unpacked" and select the extension directory.
5. The Jobs Streak extension will be installed and ready to use.

## Setup for Development

1. Create a Firebase project at [https://console.firebase.google.com/](https://console.firebase.google.com/).
2. Enable Authentication (Email/Password and Google sign-in methods).
3. Create a Firestore database.
4. Get your Firebase configuration and replace the placeholder values in `firebaseInit.js` and `background.js`.
5. For the icons, replace the placeholder images in the `images` directory with your own.

## Usage

1. Sign up or log in to the extension through the popup interface.
2. Browse job listing sites or application pages.
3. When you apply for a job, click the "Track Application" button to increase your daily count.
4. To save the job URL, click "Track & Save URL."
5. View your statistics, streaks, and application history in the extension popup.
6. Invite friends to compete and stay motivated together.
7. Maintain a streak by applying to at least 20 jobs daily.

## Tech Stack

- JavaScript
- HTML/CSS
- Firebase Authentication
- Firestore Database
- Chart.js for visualizations
- Chrome Extension API

## License

MIT

## Author

[Your Name]

---

Made with ❤️ for job seekers