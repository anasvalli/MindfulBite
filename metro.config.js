const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Force CJS over ESM — prevents Hermes from seeing ESM dynamic import(variable) expressions
// that come from @supabase packages (they use import(OTEL_PKG) for optional OpenTelemetry)
config.resolver.resolverMainFields = ["react-native", "main", "module"];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@opentelemetry/api") {
    return { type: "empty" };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });
