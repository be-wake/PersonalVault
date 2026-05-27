import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/models/consent.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/utils/error_utils.dart';
import '../../core/ws/websocket_provider.dart';
import '../../shared/widgets/app_card.dart';
import '../../shared/widgets/loading_spinner.dart';

final _consentsProvider =
    FutureProvider.autoDispose<List<ConsentGrant>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final userId = ref.watch(authProvider).user!.id;
  final data = await api.getConsents(userId);
  return data
      .map((c) => ConsentGrant.fromJson(c as Map<String, dynamic>))
      .toList();
});

class ConsentsScreen extends ConsumerStatefulWidget {
  const ConsentsScreen({super.key});

  @override
  ConsumerState<ConsentsScreen> createState() => _ConsentsScreenState();
}

class _ConsentsScreenState extends ConsumerState<ConsentsScreen> {
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
    if (type != null && type.startsWith('CONSENT_')) {
      ref.invalidate(_consentsProvider);
    }
  }

  Color _statusColor(String status) => switch (status) {
        'ACTIVE' => AppColors.success,
        'REVOKED' => AppColors.danger,
        _ => AppColors.textMuted,
      };

  Color _statusBg(String status) => switch (status) {
        'ACTIVE' => AppColors.successSoft,
        'REVOKED' => AppColors.dangerSoft,
        _ => AppColors.border,
      };

  @override
  Widget build(BuildContext context) {
    final consentsAsync = ref.watch(_consentsProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Consents'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: AppColors.accent),
            onPressed: () => context.go('/consents/grant'),
          ),
        ],
      ),
      body: consentsAsync.when(
        loading: () => const LoadingSpinner(message: 'Loading consents...'),
        error: (e, _) => Center(
            child: Text(friendlyError(e),
                style: const TextStyle(color: AppColors.danger))),
        data: (grants) {
          if (grants.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.handshake_outlined,
                      color: AppColors.textMuted, size: 48),
                  const SizedBox(height: 12),
                  const Text('No consents granted',
                      style: TextStyle(color: AppColors.textMuted)),
                  const SizedBox(height: 16),
                  TextButton.icon(
                    onPressed: () => context.go('/consents/grant'),
                    icon: const Icon(Icons.add),
                    label: const Text('Grant Access'),
                  ),
                ],
              ),
            );
          }
          return RefreshIndicator(
            color: AppColors.accent,
            onRefresh: () async => ref.invalidate(_consentsProvider),
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: grants.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (context, i) {
                final g = grants[i];
                return AppCard(
                  onTap: () => context.go('/consents/${g.id}'),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(children: [
                        Expanded(
                          child: Text(
                            g.rp?.name ?? g.relyingPartyId,
                            style: const TextStyle(
                                fontWeight: FontWeight.w600,
                                fontSize: 15,
                                color: AppColors.textPrimary),
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: _statusBg(g.status),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            g.status,
                            style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                                color: _statusColor(g.status)),
                          ),
                        ),
                      ]),
                      if (g.purpose != null) ...[
                        const SizedBox(height: 4),
                        Text(g.purpose!,
                            style: const TextStyle(
                                color: AppColors.textSecondary,
                                fontSize: 13),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis),
                      ],
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 6,
                        runSpacing: 4,
                        children: g.scopes.map((s) {
                          final label = kScopeLabels[s] ?? s;
                          return Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: AppColors.accentLight,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Text(label,
                                style: const TextStyle(
                                    fontSize: 11,
                                    color: AppColors.accent)),
                          );
                        }).toList(),
                      ),
                      if (g.grantedAt != null) ...[
                        const SizedBox(height: 8),
                        Text(
                          'Granted ${_fmtDate(g.grantedAt!)}',
                          style: const TextStyle(
                              fontSize: 11, color: AppColors.textMuted),
                        ),
                      ],
                    ],
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }

  String _fmtDate(String iso) {
    try {
      final dt = DateTime.parse(iso).toLocal();
      return '${dt.day} ${_month(dt.month)} ${dt.year}';
    } catch (_) {
      return iso;
    }
  }

  String _month(int m) => const [
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
      ][m];
}
