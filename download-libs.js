const fs = require('fs');
const https = require('https');
const path = require('path');

// Create lib directory if it doesn't exist
const libDir = path.join(__dirname, 'lib');
if (!fs.existsSync(libDir)) {
  fs.mkdirSync(libDir);
}

// Files to download
const files = [
  {
    url: 'https://www.gstatic.com/firebasejs/9.19.1/firebase-app-compat.js',
    dest: path.join(libDir, 'firebase-app-compat.js')
  },
  {
    url: 'https://www.gstatic.com/firebasejs/9.19.1/firebase-auth-compat.js',
    dest: path.join(libDir, 'firebase-auth-compat.js')
  },
  {
    url: 'https://www.gstatic.com/firebasejs/9.19.1/firebase-firestore-compat.js',
    dest: path.join(libDir, 'firebase-firestore-compat.js')
  },
  {
    url: 'https://www.gstatic.com/firebasejs/9.19.1/firebase-database-compat.js',
    dest: path.join(libDir, 'firebase-database-compat.js')
  },
  {
    url: 'https://cdn.jsdelivr.net/npm/chart.js/dist/chart.umd.js',
    dest: path.join(libDir, 'chart.js')
  }
];

// Download function
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`Downloaded: ${dest}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest);
      console.error(`Error downloading ${url}: ${err.message}`);
      reject(err);
    });
  });
}

// Download all files
async function downloadAll() {
  console.log('Downloading required libraries...');
  
  for (const file of files) {
    try {
      await downloadFile(file.url, file.dest);
    } catch (err) {
      console.error(`Failed to download ${file.url}`);
    }
  }
  
  console.log('All files downloaded successfully!');
}

downloadAll(); 