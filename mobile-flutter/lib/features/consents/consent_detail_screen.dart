import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/models/consent.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/utils/error_utils.dart';
import '../../core/ws/websocket_provider.dart';
import '../../shared/widgets/app_button.dart';
import '../../shared/widgets/app_card.dart';
import '../../shared/widgets/loading_spinner.dart';

final _consentDetailProvider =
    FutureProvider.autoDispose.family<ConsentGrant, String>((ref, grantId) async {
  final api = ref.watch(apiClientProvider);
  final userId = ref.watch(authProvider).user!.id;
  final data = await api.getConsent(userId, grantId);
  return ConsentGrant.fromJson(data);
});

class ConsentDetailScreen extends ConsumerStatefulWidget {
  final String grantId;
  const ConsentDetailScreen({super.key, required this.grantId});

  @override
  ConsumerState<ConsentDetailScreen> createState() =>
      _ConsentDetailScreenState();
}

class _ConsentDetailScreenState extends ConsumerState<ConsentDetailScreen> {
  bool _revoking = false;
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
    final grantId = msg['grantId'] as String?;
    if ((type == 'CONSENT_REVOKED' || type == 'CONSENT_EXPIRED') &&
        (grantId == null || grantId == widget.grantId)) {
      ref.invalidate(_consentDetailProvider(widget.grantId));
    }
  }

  Future<void> _revoke() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Revoke access?'),
        content: const Text(
            'This will immediately stop all data sharing with this service.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Revoke',
                  style: TextStyle(color: AppColors.danger))),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _revoking = true);
    try {
      await ref.read(apiClientProvider).revokeConsent(widget.grantId);
      if (mounted) context.go('/consents');
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text(friendlyError(e)),
              backgroundColor: AppColors.danger),
        );
      }
    } finally {
      if (mounted) setState(() => _revoking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final grantAsync = ref.watch(_consentDetailProvider(widget.grantId));

    return Scaffold(

      appBar: AppBar(title: const Text('Consent Details')),
      body: grantAsync.when(
        loading: () => const LoadingSpinner(message: 'Loading...'),
        error: (e, _) => Center(
            child: Text(friendlyError(e),
                style: const TextStyle(color: AppColors.danger))),
        data: (grant) => RefreshIndicator(
          color: AppColors.accent,
          onRefresh: () async =>
              ref.invalidate(_consentDetailProvider(widget.grantId)),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(children: [
                        Container(
                          width: 48,
                          height: 48,
                          decoration: BoxDecoration(
                            color: AppColors.accentLight,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Icon(Icons.business,
                              color: AppColors.accent, size: 24),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                grant.rp?.name ?? grant.relyingPartyId,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 16,
                                    color: AppColors.textPrimary),
                              ),
                              if (grant.rp?.domain != null)
                                Text(grant.rp!.domain!,
                                    style: const TextStyle(
                                        fontSize: 12,
                                        color: AppColors.textMuted)),
                            ],
                          ),
                        ),
                        _StatusChip(status: grant.status),
                      ]),
                      if (grant.purpose != null) ...[
                        const SizedBox(height: 16),
                        const Text('Purpose',
                            style: TextStyle(
                                fontWeight: FontWeight.w600,
                                color: AppColors.textSecondary,
                                fontSize: 12)),
                        const SizedBox(height: 4),
                        Text(grant.purpose!,
                            style: const TextStyle(
                                color: AppColors.textPrimary)),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Shared Data',
                          style: TextStyle(
                              fontWeight: FontWeight.w600,
                              fontSize: 15,
                              color: AppColors.textPrimary)),
                      const SizedBox(height: 12),
                      ...grant.scopes.map((s) => Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: Row(children: [
                              const Icon(Icons.check_circle,
                                  color: AppColors.success, size: 16),
                              const SizedBox(width: 8),
                              Text(kScopeLabels[s] ?? s,
                                  style: const TextStyle(
                                      color: AppColors.textPrimary)),
                            ]),
                          )),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Timeline',
                          style: TextStyle(
                              fontWeight: FontWeight.w600,
                              fontSize: 15,
                              color: AppColors.textPrimary)),
                      const SizedBox(height: 12),
                      if (grant.grantedAt != null)
                        _TimelineRow(
                            label: 'Granted',
                            value: _fmtDate(grant.grantedAt!)),
                      if (grant.expiresAt != null)
                        _TimelineRow(
                            label: 'Expires',
                            value: _fmtDate(grant.expiresAt!)),
                      if (grant.revokedAt != null)
                        _TimelineRow(
                            label: 'Revoked',
                            value: _fmtDate(grant.revokedAt!),
                            danger: true),
                    ],
                  ),
                ),
                if (grant.isActive) ...[
                  const SizedBox(height: 24),
                  AppButton(
                    title: 'Revoke Access',
                    variant: AppButtonVariant.danger,
                    onPressed: _revoking ? null : _revoke,
                    loading: _revoking,
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _fmtDate(String iso) {
    try {
      final dt = DateTime.parse(iso).toLocal();
      return '${dt.day} ${_month(dt.month)} ${dt.year} Â· ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
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

class _StatusChip extends StatelessWidget {
  final String status;
  const _StatusChip({required this.status});

  @override
  Widget build(BuildContext context) {
    final color = switch (status) {
      'ACTIVE' => AppColors.success,
      'REVOKED' => AppColors.danger,
      _ => AppColors.textMuted,
    };
    final bg = switch (status) {
      'ACTIVE' => AppColors.successSoft,
      'REVOKED' => AppColors.dangerSoft,
      _ => AppColors.border,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(status,
          style: TextStyle(
              color: color, fontWeight: FontWeight.w700, fontSize: 12)),
    );
  }
}

class _TimelineRow extends StatelessWidget {
  final String label;
  final String value;
  final bool danger;
  const _TimelineRow(
      {required this.label, required this.value, this.danger = false});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          SizedBox(
            width: 64,
            child: Text(label,
                style: const TextStyle(
                    color: AppColors.textMuted, fontSize: 12)),
          ),
          Text(value,
              style: TextStyle(
                  color: danger ? AppColors.danger : AppColors.textPrimary,
                  fontSize: 13)),
        ],
      ),
    );
  }
}
