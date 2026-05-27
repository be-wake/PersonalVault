import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

class AppInput extends StatefulWidget {
  final String label;
  final String? hint;
  final String? error;
  final bool obscureText;
  final bool multiline;
  final TextEditingController? controller;
  final TextInputType? keyboardType;
  final ValueChanged<String>? onChanged;
  final String? initialValue;

  const AppInput({
    super.key,
    required this.label,
    this.hint,
    this.error,
    this.obscureText = false,
    this.multiline = false,
    this.controller,
    this.keyboardType,
    this.onChanged,
    this.initialValue,
  });

  @override
  State<AppInput> createState() => _AppInputState();
}

class _AppInputState extends State<AppInput> {
  late bool _obscure;

  @override
  void initState() {
    super.initState();
    _obscure = widget.obscureText;
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          widget.label,
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w500,
            color: AppColors.textSecondary,
          ),
        ),
        const SizedBox(height: 6),
        TextFormField(
          controller: widget.controller,
          initialValue: widget.controller == null ? widget.initialValue : null,
          obscureText: _obscure,
          maxLines: widget.multiline ? 4 : 1,
          keyboardType: widget.multiline
              ? TextInputType.multiline
              : widget.keyboardType,
          onChanged: widget.onChanged,
          selectionControls: MaterialTextSelectionControls(),
          decoration: InputDecoration(
            hintText: widget.hint,
            errorText: widget.error,
            suffixIcon: widget.obscureText
                ? IconButton(
                    icon: Icon(
                      _obscure ? Icons.visibility_off : Icons.visibility,
                      color: AppColors.textMuted,
                      size: 20,
                    ),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  )
                : null,
          ),
        ),
      ],
    );
  }
}
