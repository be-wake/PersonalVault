import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/app_button.dart';
import '../../shared/widgets/app_input.dart';

/// New-account registration screen.
class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _nameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  String? _localError;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _passCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_passCtrl.text.length < 8) {
      setState(() => _localError = 'Password must be at least 8 characters');
      return;
    }
    if (_passCtrl.text != _confirmCtrl.text) {
      setState(() => _localError = 'Passwords do not match');
      return;
    }
    setState(() => _localError = null);
    await ref.read(authProvider.notifier).register(
          _nameCtrl.text.trim(),
          _emailCtrl.text.trim(),
          _passCtrl.text,
        );
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    final error = _localError ?? auth.error;

    return Scaffold(

      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.textPrimary),
          onPressed: () => context.go('/auth/sign-in'),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Create account',
                style: TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Your private data vault',
                style: TextStyle(fontSize: 16, color: AppColors.textSecondary),
              ),
              const SizedBox(height: 32),
              if (error != null) ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.dangerSoft,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AppColors.danger.withValues(alpha: 0.3)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.error_outline,
                          color: AppColors.danger, size: 18),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          error,
                          style: const TextStyle(
                              color: AppColors.danger, fontSize: 14),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
              ],
              AppInput(label: 'Full Name', hint: 'Vivek Verma', controller: _nameCtrl),
              const SizedBox(height: 16),
              AppInput(
                label: 'Email',
                hint: 'you@example.com',
                controller: _emailCtrl,
                keyboardType: TextInputType.emailAddress,
              ),
              const SizedBox(height: 16),
              AppInput(
                label: 'Password',
                hint: 'Min 8 characters',
                controller: _passCtrl,
                obscureText: true,
              ),
              const SizedBox(height: 16),
              AppInput(
                label: 'Confirm Password',
                hint: '••••••••',
                controller: _confirmCtrl,
                obscureText: true,
              ),
              const SizedBox(height: 32),
              AppButton(
                title: 'Create Account',
                onPressed: auth.isLoading ? null : _submit,
                loading: auth.isLoading,
              ),
              const SizedBox(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Text('Already have an account? ',
                      style: TextStyle(color: AppColors.textSecondary)),
                  GestureDetector(
                    onTap: () => context.go('/auth/sign-in'),
                    child: const Text(
                      'Sign In',
                      style: TextStyle(
                        color: AppColors.accent,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
