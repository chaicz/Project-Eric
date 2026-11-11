// Runs the Eric Collab e2e + multiuser suites against the LOCAL relay
// (the one the extension is actually configured to use), instead of the
// public demos.yjs.dev instance. Sets the env var then delegates to the
// original test script so we test the same code paths.
process.env.ERIC_COLLAB_TEST_SIGNALING = process.env.ERIC_COLLAB_TEST_SIGNALING
  || 'ws://127.0.0.1:1234/ws';

const path = require('path');
const script = process.argv[2];
require(path.resolve(script));
