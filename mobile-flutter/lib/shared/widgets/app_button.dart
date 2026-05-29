import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

enum AppButtonVariant { primary, secondary, danger, ghost }

/// App-styled button with variants and a built-in loading spinner state.
class AppButton extends StatelessWidget {
  final String title;
  final VoidCallback? onPressed;
  final AppButtonVariant variant;
  final bool loading;
  final bool fullWidth;

  const AppButton({
    super.key,
    required this.title,
    this.onPressed,
    this.variant = AppButtonVariant.primary,
    this.loading = false,
    this.fullWidth = true,
  });

  @override
  Widget build(BuildContext context) {
    final disabled = onPressed == null || loading;

    switch (variant) {
      case AppButtonVariant.primary:
        return SizedBox(
          width: fullWidth ? double.infinity : null,
          height: 50,
          child: ElevatedButton(
            onPressed: disabled ? null : onPressed,
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.accent,
              foregroundColor: Colors.white,
              disabledBackgroundColor: AppColors.accent.withValues(alpha: 0.5),
            ),
            child: _label(Colors.white),
          ),
        );
      case AppButtonVariant.secondary:
        return SizedBox(
          width: fullWidth ? double.infinity : null,
          height: 50,
          child: OutlinedButton(
            onPressed: disabled ? null : onPressed,
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.accent,
              side: BorderSide(
                color: disabled
                    ? AppColors.accent.withValues(alpha: 0.5)
                    : AppColors.accent,
              ),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
            child: _label(AppColors.accent),
          ),
        );
      case AppButtonVariant.danger:
        return SizedBox(
          width: fullWidth ? double.infinity : null,
          height: 50,
          child: ElevatedButton(
            onPressed: disabled ? null : onPressed,
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.danger,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
            child: _label(Colors.white),
          ),
        );
      case AppButtonVariant.ghost:
        return SizedBox(
          width: fullWidth ? double.infinity : null,
          height: 50,
          child: TextButton(
            onPressed: disabled ? null : onPressed,
            child: _label(AppColors.accent),
          ),
        );
    }
  }

  Widget _label(Color color) {
    if (loading) {
      return SizedBox(
        width: 20,
        height: 20,
        child: CircularProgressIndicator(
          strokeWidth: 2,
          color: color,
        ),
      );
    }
    return Text(
      title,
      style: TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.w600,
        color: color,
      ),
    );
  }
}
