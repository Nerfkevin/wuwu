import { Stack } from "expo-router";
import { View, StyleSheet } from "react-native";
import Background from "react-native-ambient-background";

export default function OnboardingLayout() {
  return (
    <View style={styles.root}>
      <Background
        variant="fluid"
        mainColor="#0a000d"
        speed={0.2}
        style={StyleSheet.absoluteFillObject}
      />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "none",
          gestureEnabled: false,
          contentStyle: { backgroundColor: "transparent" },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="screen1" />
        <Stack.Screen name="screen2" />
        <Stack.Screen name="screen3" />
        <Stack.Screen name="screen4" />
        <Stack.Screen name="screen5" />
        <Stack.Screen name="screen6" />
        <Stack.Screen name="screen7" />
        <Stack.Screen name="screen8" />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
});
