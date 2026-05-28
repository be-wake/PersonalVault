import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/models/audit.dart';
import '../../core/theme/app_theme.dart';
import '../../core/ws/websocket_provider.dart';
import '../../shared/utils/error_utils.dart';
import '../../shared/widgets/app_card.dart';
import '../../shared/widgets/loading_spinner.dart';

final _dashboardProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final userId = ref.watch(authProvider).user?.id;
  if (userId == null) return {'activeConsents': 0, 'recentEvents': <dynamic>[]};
  return api.getDashboardStats(userId);
});

class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});

  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  // Cache the notifier so we can safely unsubscribe in dispose()
  // without touching `ref` (forbidden after widget is disposed).
  late final WebSocketNotifier _wsNotifier;

  @override
  void initState() {
    super.initState();
    _wsNotifier = ref.read(websocketProvider.notifier);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _wsNotifier.subscribe(_onWsMessage);
    });
  }

  @override
  void dispose() {
    _wsNotifier.unsubscribe(_onWsMessage);
    super.dispose();
  }

  void _onWsMessage(Map<String, dynamic> msg) {
    final type = msg['type'] as String?;
    if (type != null &&
        (type.startsWith('CONSENT_') || type == 'DATA_ACCESSED')) {
      ref.invalidate(_dashboardProvider);
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);
    final user = authState.user;
    if (user == null) return const Scaffold(body: LoadingSpinner());
    final dashAsync = ref.watch(_dashboardProvider);

    return Scaffold(

      body: SafeArea(
        child: RefreshIndicator(
          color: AppColors.accent,
          onRefresh: () async => ref.invalidate(_dashboardProvider),
          child: CustomScrollView(
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(24, 24, 24, 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Hello, ${user.name.split(' ').first}',
                        style: const TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'Your data vault is secure',
                        style: TextStyle(
                            fontSize: 14, color: AppColors.textSecondary),
                      ),
                    ],
                  ),
                ),
              ),
              dashAsync.when(
                loading: () => const SliverFillRemaining(
                    child: LoadingSpinner(message: 'Loading dashboard...')),
                error: (e, _) => SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(friendlyError(e),
                        style: const TextStyle(color: AppColors.danger)),
                  ),
                ),
                data: (data) => SliverPadding(
                  padding: const EdgeInsets.all(16),
                  sliver: SliverList(
                    delegate: SliverChildListDelegate([
                      _StatsRow(
                        activeConsents: data['activeConsents'] as int,
                        recentEvents:
                            (data['recentEvents'] as List).length,
                      ),
                      const SizedBox(height: 20),
                      const _SectionLabel('Your Vault'),
                      const SizedBox(height: 12),
                      _VaultGrid(),
                      const SizedBox(height: 20),
                      const _SectionLabel('Quick Actions'),
                      const SizedBox(height: 12),
                      _QuickActions(),
                      const SizedBox(height: 20),
                      if ((data['recentEvents'] as List).isNotEmpty) ...[
                        const _SectionLabel('Recent Activity'),
                        const SizedBox(height: 12),
                        ...(data['recentEvents'] as List).map(
                          (e) => Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: _ActivityItem(
                              event: AuditEvent.fromJson(
                                  e as Map<String, dynamic>),
                            ),
                          ),
                        ),
                      ],
                    ]),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatsRow extends StatelessWidget {
  final int activeConsents;
  final int recentEvents;
  const _StatsRow(
      {required this.activeConsents, required this.recentEvents});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _StatCard(
            icon: Icons.handshake_outlined,
            label: 'Active Consents',
            value: '$activeConsents',
            color: AppColors.accent,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _StatCard(
            icon: Icons.history,
            label: 'Recent Events',
            value: '$recentEvents',
            color: AppColors.success,
          ),
        ),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color color;
  const _StatCard(
      {required this.icon,
      required this.label,
      required this.value,
      required this.color});

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 22),
          const SizedBox(height: 10),
          Text(value,
              style: TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.w700,
                  color: color)),
          Text(label,
              style: const TextStyle(
                  fontSize: 12, color: AppColors.textSecondary)),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(text,
        style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
            color: AppColors.textPrimary));
  }
}

class _VaultGrid extends StatelessWidget {
  final _items = const [
    _VaultItem(Icons.badge_outlined, 'Identity', '/vault/identity', AppColors.accent),
    _VaultItem(Icons.home_outlined, 'Address', '/vault/address', AppColors.success),
    _VaultItem(Icons.credit_card_outlined, 'Cards', '/vault/cards', AppColors.warning),
    _VaultItem(Icons.contacts_outlined, 'Contacts', '/vault/contacts', AppColors.accentDark),
  ];

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 12,
      mainAxisSpacing: 12,
      childAspectRatio: 1.4,
      children: _items
          .map((item) => AppCard(
                onTap: () => context.go(item.route),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(item.icon, color: item.color, size: 28),
                    const SizedBox(height: 8),
                    Text(item.label,
                        style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 14,
                            color: AppColors.textPrimary)),
                  ],
                ),
              ))
          .toList(),
    );
  }
}

class _VaultItem {
  final IconData icon;
  final String label;
  final String route;
  final Color color;
  const _VaultItem(this.icon, this.label, this.route, this.color);
}

class _QuickActions extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        children: [
          _ActionRow(
            icon: Icons.add_circle_outline,
            label: 'Grant Access',
            onTap: () => context.go('/consents/grant'),
          ),
          const Divider(height: 1, color: AppColors.border),
          _ActionRow(
            icon: Icons.handshake_outlined,
            label: 'Manage Consents',
            onTap: () => context.go('/consents'),
          ),
          const Divider(height: 1, color: AppColors.border),
          _ActionRow(
            icon: Icons.history,
            label: 'View History',
            onTap: () => context.go('/history'),
            showDivider: false,
          ),
        ],
      ),
    );
  }
}

class _ActionRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool showDivider;
  const _ActionRow(
      {required this.icon,
      required this.label,
      required this.onTap,
      this.showDivider = true});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(
          children: [
            Icon(icon, color: AppColors.accent, size: 20),
            const SizedBox(width: 12),
            Expanded(
              child: Text(label,
                  style: const TextStyle(
                      fontSize: 15, color: AppColors.textPrimary)),
            ),
            const Icon(Icons.chevron_right, color: AppColors.textMuted, size: 20),
          ],
        ),
      ),
    );
  }
}

class _ActivityItem extends StatelessWidget {
  final AuditEvent event;
  const _ActivityItem({required this.event});

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: AppColors.accentLight,
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.info_outline,
                color: AppColors.accent, size: 18),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  event.label ?? event.eventType,
                  style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: AppColors.textPrimary),
                ),
                if (event.rpName != null)
                  Text(event.rpName!,
                      style: const TextStyle(
                          fontSize: 12, color: AppColors.textMuted)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
