/**
 * Signs the app target with a fixed team and provisioning profile on every
 * prebuild, so `npx expo prebuild` doesn't fall back to automatic signing.
 *
 *   ["./plugins/withManualSigning", {
 *     "teamId": "ABCDE12345",
 *     "profile": "My App Development",       // profile name in the developer portal
 *     "identity": "Apple Development"        // or "Apple Distribution"
 *   }]
 *
 * Env overrides for other machines or teams: APPLE_TEAM_ID,
 * APPLE_PROVISIONING_PROFILE, APPLE_SIGN_IDENTITY. With no team set, nothing
 * changes and Xcode's automatic signing applies. Skipped on EAS cloud builds
 * (EAS_BUILD is set), which use EAS-managed credentials.
 */
const { withXcodeProject } = require('expo/config-plugins');

module.exports = function withManualSigning(config, options = {}) {
  const teamId = process.env.APPLE_TEAM_ID || options.teamId;
  const profile = process.env.APPLE_PROVISIONING_PROFILE || options.profile;
  const identity = process.env.APPLE_SIGN_IDENTITY || options.identity || 'Apple Development';
  if (!teamId || !profile) return config;
  // EAS cloud builds inject their own managed certificate and provisioning
  // profile; a hardcoded local profile name would not exist there.
  if (process.env.EAS_BUILD) return config;

  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const bundleId = config.ios && config.ios.bundleIdentifier;
    const configs = project.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(configs)) {
      const settings = configs[key] && configs[key].buildSettings;
      if (!settings || !settings.PRODUCT_BUNDLE_IDENTIFIER) continue;
      const id = String(settings.PRODUCT_BUNDLE_IDENTIFIER).replace(/"/g, '');
      if (bundleId && id !== bundleId) continue; // app target only, not pods/extensions
      settings.CODE_SIGN_STYLE = 'Manual';
      settings.DEVELOPMENT_TEAM = teamId;
      settings['"CODE_SIGN_IDENTITY[sdk=iphoneos*]"'] = `"${identity}"`;
      settings.PROVISIONING_PROFILE_SPECIFIER = `"${profile}"`;
    }
    return cfg;
  });
};
