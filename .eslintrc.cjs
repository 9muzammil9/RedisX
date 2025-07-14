module.exports = {
  root: true,
  ignorePatterns: [
    'node_modules',
    'dist',
    'build',
    'coverage',
    '*.min.js',
    'client/',
    'server/',
  ],
  // This is a workspace root config that doesn't apply to any files directly
  // Each workspace (client/server) has its own specific configuration
};
