
import React from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { Colors, Fonts, Layout } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function ProfileScreen() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          <Ionicons name="person" size={40} color={Colors.textSecondary} />
        </View>
        <Text style={styles.username}>User Name</Text>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>12</Text>
          <Text style={styles.statLabel}>Hours Played</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>45</Text>
          <Text style={styles.statLabel}>Sessions</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>8</Text>
          <Text style={styles.statLabel}>Recorded</Text>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.row}>
          <Ionicons name="mic-outline" size={24} color={Colors.text} />
          <Text style={styles.rowText}>Using iPhone Microphone</Text>
          <Text style={styles.editLink}>Edit</Text>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.row}>
          <Text style={styles.rowText}>Privacy Policy</Text>
          <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.rowText}>Terms of Service</Text>
          <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.rowText}>Rate Us</Text>
          <Ionicons name="star-outline" size={20} color={Colors.textSecondary} />
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.rowText}>Contact Support</Text>
          <Ionicons name="mail-outline" size={20} color={Colors.textSecondary} />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    alignItems: 'center',
    paddingTop: 80,
    paddingBottom: 40,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  username: {
    fontFamily: Fonts.serif,
    fontSize: 24,
    color: Colors.text,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
    marginBottom: 40,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontFamily: Fonts.serifBold,
    fontSize: 32,
    color: Colors.text,
  },
  statLabel: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  section: {
    backgroundColor: '#1A1A1E',
    borderRadius: Layout.borderRadius,
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  rowText: {
    fontFamily: Fonts.mono,
    fontSize: 16,
    color: Colors.text,
    flex: 1,
    marginLeft: 16,
  },
  editLink: {
    fontFamily: Fonts.mono,
    fontSize: 14,
    color: Colors.chakra.blue,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: 40,
  },
});
