const { execFileSync } = require('node:child_process');

function buildRevision() {
  const supplied = process.env.KNITTING_BUILD_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA;
  if (supplied && /^[a-f0-9]{7,40}$/i.test(supplied)) return supplied.slice(0, 7);
  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 1000,
    }).trim();
  } catch {
    return null;
  }
}

/** @param {import('expo/config').ConfigContext} context */
module.exports = ({ config }) => ({
  ...config,
  name: config.name ?? 'Knitting',
  slug: config.slug ?? 'knitting',
  extra: {
    ...config.extra,
    buildInfo: { revision: buildRevision(), builtAt: new Date().toISOString() },
  },
});
