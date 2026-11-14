// Accès à Netlify Blobs (une « boîte » par usage : suivi, config, limites).
let blobs = null;
try { blobs = require('@netlify/blobs'); } catch (e) { blobs = null; }
exports.st = (event, name) => {
  if (!blobs) throw new Error('Module @netlify/blobs absent (package.json non installé ?)');
  try { blobs.connectLambda(event); } catch (e) { /* hors Netlify */ }
  return blobs.getStore({ name, consistency: 'strong' });
};
