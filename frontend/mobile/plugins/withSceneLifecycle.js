/**
 * Adopts the UIKit scene-based life cycle, which iOS 27 requires at launch
 * ("UIScene life cycle is required for apps built with this SDK").
 *
 * Expo SDK 57 ships `ExpoAppSceneDelegate` (objc name EXExpoAppSceneDelegate),
 * but the prebuild template still creates the window in the app delegate. This
 * plugin:
 *  1. registers EXExpoAppSceneDelegate in Info.plist's UIApplicationSceneManifest;
 *  2. makes AppDelegate conform to ExpoReactNativeFactoryProvider and stops it
 *     from creating a window / starting React Native (the scene delegate does).
 */
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

function withSceneManifest(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: 'EXExpoAppSceneDelegate',
          },
        ],
      },
    };
    return cfg;
  });
}

function withSceneAppDelegate(config) {
  return withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'swift') return cfg;
    let src = cfg.modResults.contents;

    src = src.replace(
      /class AppDelegate: ExpoAppDelegate \{/,
      'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {',
    );

    // The scene delegate creates the window and starts React Native into it.
    src = src.replace(
      /#if os\(iOS\) \|\| os\(tvOS\)\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\s*factory\.startReactNative\([\s\S]*?\)\s*#endif\s*/,
      '    ',
    );

    cfg.modResults.contents = src;
    return cfg;
  });
}

module.exports = function withSceneLifecycle(config) {
  return withSceneAppDelegate(withSceneManifest(config));
};
