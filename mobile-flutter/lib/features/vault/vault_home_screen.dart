import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/app_card.dart';

class VaultHomeScreen extends StatelessWidget {
  const VaultHomeScreen({super.key});

  static const _sections = [
    _VaultSection(
      icon: Icons.badge_outlined,
      title: 'Identity',
      description: 'Government IDs & personal info',
      route: '/vault/identity',
      color: AppColors.accent,
    ),
    _VaultSection(
      icon: Icons.home_outlined,
      title: 'Address',
      description: 'Residential & mailing addresses',
      route: '/vault/address',
      color: AppColors.success,
    ),
    _VaultSection(
      icon: Icons.credit_card_outlined,
      title: 'Payment Cards',
      description: 'Saved payment cards',
      route: '/vault/cards',
      color: AppColors.warning,
    ),
    _VaultSection(
      icon: Icons.contacts_outlined,
      title: 'Contacts',
      description: 'Phone numbers & email',
      route: '/vault/contacts',
      color: AppColors.accentDark,
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(

      appBar: AppBar(title: const Text('Vault')),
      body: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: _sections.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (context, i) {
          final s = _sections[i];
          return AppCard(
            onTap: () => context.go(s.route),
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: s.color.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(s.icon, color: s.color, size: 24),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(s.title,
                          style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                              color: AppColors.textPrimary)),
                      const SizedBox(height: 2),
                      Text(s.description,
                          style: const TextStyle(
                              fontSize: 13, color: AppColors.textSecondary)),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right,
                    color: AppColors.textMuted, size: 20),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _VaultSection {
  final IconData icon;
  final String title;
  final String description;
  final String route;
  final Color color;
  const _VaultSection({
    required this.icon,
    required this.title,
    required this.description,
    required this.route,
    required this.color,
  });
}
