import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tijori/app.dart';

void main() {
  testWidgets('TijoriApp smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(
      const ProviderScope(child: TijoriApp()),
    );
    // App loads without crashing
    expect(find.byType(MaterialApp), findsOneWidget);
  });
}
