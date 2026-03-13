import { NativeTabs, Icon, Label, VectorIcon } from 'expo-router/unstable-native-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';

export default function TabLayout() {
  return (
    <NativeTabs
      tintColor={Colors.tint}
      backgroundColor={Colors.background}
      iconColor={{
        default: Colors.tabIconDefault,
        selected: Colors.tabIconSelected,
      }}
      labelStyle={{
        default: { color: Colors.tabIconDefault },
        selected: { color: Colors.tabIconSelected },
      }}
    >
      <NativeTabs.Trigger name="index">
        <Icon 
          sf="house.fill" 
          androidSrc={<VectorIcon family={Ionicons} name="home" />} 
        />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      
      <NativeTabs.Trigger name="library">
        <Icon 
          sf="books.vertical.fill" 
          androidSrc={<VectorIcon family={Ionicons} name="library" />} 
        />
        <Label>Library</Label>
      </NativeTabs.Trigger>
      
      <NativeTabs.Trigger name="profile">
        <Icon 
          sf="person.fill" 
          androidSrc={<VectorIcon family={Ionicons} name="person" />} 
        />
        <Label>Profile</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
