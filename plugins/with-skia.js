const { withAndroidManifest, withGradleProperties, withSettingsGradle } = require('@expo/config-plugins');

const withSkia = (config) => {
  config = withAndroidManifest(config, (config) => {
    if (!config.modResults.manifest.application) {
      config.modResults.manifest.application = [{}];
    }
    if (!config.modResults.manifest.application[0]['uses-native-code']) {
      config.modResults.manifest.application[0]['uses-native-code'] = [{ $: { 'android:enable': 'true' } }];
    }
    return config;
  });

  config = withGradleProperties(config, (config) => {
    const properties = config.modResults || [];
    const setProp = (key, value) => {
      const idx = properties.findIndex(p => p.key === key);
      if (idx >= 0) properties[idx] = { key, value, type: 'property' };
      else properties.push({ key, value, type: 'property' });
    };
    setProp('android.enableJetifier', 'true');
    setProp('android.useAndroidX', 'true');
    return config;
  });

  config = withSettingsGradle(config, (config) => {
    if (!config.modResults.contents.includes('react-native-skia')) {
      const skiaGradle = `
// Skia
def reactNativeSkiaDir = new File(rootProject.projectDir, '../node_modules/@shopify/react-native-skia/android')
if (reactNativeSkiaDir.exists()) {
    include ':react-native-skia'
    project(':react-native-skia').projectDir = reactNativeSkiaDir
}
`;
      config.modResults.contents = config.modResults.contents.replace(
        /include ':app'/,
        skiaGradle + '\ninclude \':app\''
      );
    }
    return config;
  });

  return config;
};

module.exports = withSkia;
