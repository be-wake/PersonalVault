import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

/// Shows a standard confirm / cancel dialog and resolves to `true` only when
/// the user confirms. Replaces the delete-confirmation `AlertDialog` that was
/// duplicated across the vault screens.
Future<bool> showConfirmDialog(
  BuildContext context, {
  required String title,
  String message = 'This action cannot be undone.',
  String confirmLabel = 'Delete',
  String cancelLabel = 'Cancel',
  bool destructive = true,
}) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: Text(cancelLabel),
        ),
        TextButton(
          onPressed: () => Navigator.pop(ctx, true),
          child: Text(
            confirmLabel,
            style: destructive ? const TextStyle(color: AppColors.danger) : null,
          ),
        ),
      ],
    ),
  );
  return confirmed == true;
}
