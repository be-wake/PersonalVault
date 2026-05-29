import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const _kThemeKey = 'app_theme_mode';

/// Holds the active [ThemeMode] and persists the user's choice to secure
/// storage so it survives restarts.
class ThemeNotifier extends Notifier<ThemeMode> {
  late final FlutterSecureStorage _storage;

  @override
  ThemeMode build() {
    _storage = const FlutterSecureStorage();
    Future.microtask(_load);
    return ThemeMode.system;
  }

  Future<void> _load() async {
    final saved = await _storage.read(key: _kThemeKey);
    if (saved != null) {
      state = ThemeMode.values.firstWhere(
        (m) => m.name == saved,
        orElse: () => ThemeMode.system,
      );
    }
  }

  Future<void> setMode(ThemeMode mode) async {
    state = mode;
    await _storage.write(key: _kThemeKey, value: mode.name);
  }
}

final themeProvider = NotifierProvider<ThemeNotifier, ThemeMode>(
  ThemeNotifier.new,
);
