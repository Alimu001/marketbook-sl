import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  getRangeForPreset,
  REPORT_PERIOD_PRESETS,
  type ReportPeriodPreset,
  type ReportPeriodRange,
} from "@/reports/period";

interface ReportPeriodSelectorProps {
  preset: ReportPeriodPreset;
  range: ReportPeriodRange;
  onChange: (preset: ReportPeriodPreset, range: ReportPeriodRange) => void;
}

export function ReportPeriodSelector({
  preset,
  range,
  onChange,
}: ReportPeriodSelectorProps) {
  const [customFrom, setCustomFrom] = useState(range.from);
  const [customTo, setCustomTo] = useState(range.to);

  const handlePreset = (nextPreset: ReportPeriodPreset) => {
    if (nextPreset === "custom") {
      onChange("custom", { from: customFrom, to: customTo });
      return;
    }

    onChange(nextPreset, getRangeForPreset(nextPreset));
  };

  const applyCustom = () => {
    onChange("custom", { from: customFrom.trim(), to: customTo.trim() });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Period</Text>
      <View style={styles.row}>
        {REPORT_PERIOD_PRESETS.map((entry) => (
          <Pressable
            key={entry.key}
            accessibilityRole="button"
            onPress={() => handlePreset(entry.key)}
            style={[
              styles.chip,
              preset === entry.key && styles.chipActive,
            ]}
          >
            <Text
              style={[
                styles.chipText,
                preset === entry.key && styles.chipTextActive,
              ]}
            >
              {entry.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {preset === "custom" ? (
        <View style={styles.customRow}>
          <TextInput
            value={customFrom}
            onChangeText={setCustomFrom}
            placeholder="From YYYY-MM-DD"
            placeholderTextColor="#94A3B8"
            style={styles.input}
            autoCapitalize="none"
          />
          <TextInput
            value={customTo}
            onChangeText={setCustomTo}
            placeholder="To YYYY-MM-DD"
            placeholderTextColor="#94A3B8"
            style={styles.input}
            autoCapitalize="none"
          />
          <Pressable accessibilityRole="button" onPress={applyCustom} style={styles.applyButton}>
            <Text style={styles.applyText}>Apply</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.rangeText}>
          {range.from} to {range.to}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
    marginBottom: 12,
  },
  label: {
    fontSize: 15,
    fontWeight: "700",
    color: "#334155",
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  chipActive: {
    backgroundColor: "#0F766E",
    borderColor: "#0F766E",
  },
  chipText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#FFFFFF",
  },
  customRow: {
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#0F172A",
    backgroundColor: "#FFFFFF",
  },
  applyButton: {
    alignSelf: "flex-start",
    backgroundColor: "#0F766E",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  applyText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  rangeText: {
    fontSize: 13,
    color: "#64748B",
  },
});
