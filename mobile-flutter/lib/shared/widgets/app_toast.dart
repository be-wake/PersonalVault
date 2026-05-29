import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

/// The transient bottom toast shown across the vault screens. Designed to sit
/// as a direct child of a [Stack]. Usually rendered via [ToastHostMixin].
class AppToast extends StatelessWidget {
  final String message;
  final bool success;

  const AppToast({super.key, required this.message, this.success = true});

  @override
  Widget build(BuildContext context) {
    return Positioned(
      bottom: 24,
      left: 24,
      right: 24,
      child: Material(
        borderRadius: BorderRadius.circular(10),
        color: success ? AppColors.accentDark : AppColors.danger,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Text(
            message,
            style: const TextStyle(color: Colors.white, fontSize: 14),
          ),
        ),
      ),
    );
  }
}

/// Adds transient-toast state to a screen's [State]. Call [showToast] from
/// event handlers and render [toastOverlay] as a direct child of the screen's
/// [Stack]. Replaces the per-screen `_toast`/`_showToast` boilerplate.
mixin ToastHostMixin<T extends StatefulWidget> on State<T> {
  String? _toastMessage;
  bool _toastSuccess = true;

  void showToast(String message, {bool success = true}) {
    setState(() {
      _toastMessage = message;
      _toastSuccess = success;
    });
    Future.delayed(const Duration(seconds: 3), () {
      if (mounted) setState(() => _toastMessage = null);
    });
  }

  /// The toast widget (or an empty placeholder). Place inside the screen's Stack.
  Widget toastOverlay() => _toastMessage == null
      ? const SizedBox.shrink()
      : AppToast(message: _toastMessage!, success: _toastSuccess);
}
