const fs = require('fs');
const path = require('path');

async function deleteDirectory(directory) {
  return new Promise((resolve, reject) => {
    fs.rm(directory, { recursive: true, force: true }, (err) => {
      if (err) {
        return reject(`Error deleting directory: ${err}`);
      }
      console.log(`Deleted directory: ${directory}`);
      resolve();
    });
  });
}

module.exports = deleteDirectory;