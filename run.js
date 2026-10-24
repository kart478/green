const { githubGreenWave } = require('./index.js');

githubGreenWave().then(() => {
  console.log('Green wave completed successfully');
  process.exit(0);
}).catch((err) => {
  console.error('Green wave failed:', err);
  process.exit(1);
});
