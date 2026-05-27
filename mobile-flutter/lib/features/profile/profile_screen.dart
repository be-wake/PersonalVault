import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/utils/error_utils.dart';
import '../../shared/widgets/app_button.dart';
import '../../shared/widgets/app_card.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).user!;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Profile')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            // Avatar
            CircleAvatar(
              radius: 36,
              backgroundColor: AppColors.accentLight,
              child: Text(
                user.name.isNotEmpty ? user.name[0].toUpperCase() : '?',
                style: const TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.w700,
                    color: AppColors.accent),
              ),
            ),
            const SizedBox(height: 12),
            Text(user.name,
                style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary)),
            Text(user.email,
                style: const TextStyle(
                    color: AppColors.textSecondary, fontSize: 14)),
            if (user.createdAt != null) ...[
              const SizedBox(height: 4),
              Text(
                'Member since ${_fmtDate(user.createdAt!)}',
                style: const TextStyle(
                    color: AppColors.textMuted, fontSize: 12),
              ),
            ],
            const SizedBox(height: 24),

            // Account info
            _SectionCard(
              title: 'Account',
              children: [
                _InfoRow(label: 'Email', value: user.email),
                _InfoRow(
                    label: 'User ID',
                    value: '${user.id.substring(0, 8)}...'),
              ],
            ),
            const SizedBox(height: 12),

            // Privacy
            _SectionCard(
              title: 'Privacy',
              children: [
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.download_outlined,
                      color: AppColors.accent),
                  title: const Text('Export My Data'),
                  subtitle: const Text('Download all vault data as JSON'),
                  onTap: () => _exportData(context, ref),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Danger zone
            _SectionCard(
              title: 'Danger Zone',
              children: [
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.warning_amber_outlined,
                      color: AppColors.danger),
                  title: const Text('Delete Account',
                      style: TextStyle(color: AppColors.danger)),
                  subtitle:
                      const Text('Permanently delete account and data'),
                  onTap: () => _confirmDelete(context),
                ),
              ],
            ),
            const SizedBox(height: 24),

            AppButton(
              title: 'Sign Out',
              variant: AppButtonVariant.secondary,
              onPressed: () => _signOut(context, ref),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _exportData(BuildContext context, WidgetRef ref) async {
    try {
      await ref.read(apiClientProvider).exportData();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Export started â€” check your email')),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text(friendlyError(e)),
              backgroundColor: AppColors.danger),
        );
      }
    }
  }

  Future<void> _confirmDelete(BuildContext context) async {
    await showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Account'),
        content: const Text(
            'Account deletion requires step-up authentication. Feature coming soon.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('OK')),
        ],
      ),
    );
  }

  Future<void> _signOut(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign out?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Sign Out')),
        ],
      ),
    );
    if (ok == true) {
      await ref.read(authProvider.notifier).logout();
    }
  }

  String _fmtDate(String iso) {
    try {
      final dt = DateTime.parse(iso).toLocal();
      const months = [
        '',
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec'
      ];
      return '${months[dt.month]} ${dt.year}';
    } catch (_) {
      return iso;
    }
  }
}

class _SectionCard extends StatelessWidget {
  final String title;
  final List<Widget> children;

  const _SectionCard({required this.title, required this.children});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 8),
          child: Text(title,
              style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                  color: AppColors.textSecondary)),
        ),
        AppCard(child: Column(children: children)),
      ],
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          SizedBox(
            width: 80,
            child: Text(label,
                style: const TextStyle(
                    color: AppColors.textMuted, fontSize: 13)),
          ),
          Expanded(
            child: Text(value,
                style: const TextStyle(
                    color: AppColors.textPrimary, fontSize: 13)),
          ),
        ],
      ),
    );
  }
}
