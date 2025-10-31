const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'production',
  // We don't actually need to bundle app code; this entry is a no-op
  entry: path.resolve(__dirname, 'docs', 'swagger.js'),
  output: {
    path: path.resolve(__dirname, 'public', 'swagger-ui'),
    filename: 'noop.js',
    clean: true,
  },
  target: 'web',
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: path.resolve(__dirname, 'node_modules/swagger-ui-dist/swagger-ui.css'), to: '.' },
        { from: path.resolve(__dirname, 'node_modules/swagger-ui-dist/swagger-ui-bundle.js'), to: '.' },
        { from: path.resolve(__dirname, 'node_modules/swagger-ui-dist/swagger-ui-standalone-preset.js'), to: '.' },
        { from: path.resolve(__dirname, 'node_modules/swagger-ui-dist/favicon-16x16.png'), to: '.' },
        { from: path.resolve(__dirname, 'node_modules/swagger-ui-dist/favicon-32x32.png'), to: '.' }
      ]
    })
  ]
};


