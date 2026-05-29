import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'app.dart';

/// App entry point. Wraps the app in a Riverpod [ProviderScope] so providers
/// are available everywhere.
void main() {
  runApp(const ProviderScope(child: TijoriApp()));
}
