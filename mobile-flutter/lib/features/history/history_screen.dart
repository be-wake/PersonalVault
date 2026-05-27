import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/models/audit.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/utils/error_utils.dart';
import '../../shared/widgets/loading_spinner.dart';

final _historyProvider =
    FutureProvider.autoDispose.family<List<AuditEvent>, String?>((ref, resource) async {
  final api = ref.watch(apiClientProvider);
  final userId = ref.watch(authProvider).user!.id;
  final data = await api.getAuditEvents(userId, resource: resource);
  return data
      .map((e) => AuditEvent.fromJson(e as Map<String, dynamic>))
      .toList();
});

const _filters = <String, String?>{
  'All': null,
  'Identity': 'identity',
  'Address': 'address',
  'Payment': 'payment',
  'Contacts': 'contacts',
  'Consent': 'consent',
};

const _eventIcons = <String, IconData>{
  'IDENTITY_READ': Icons.badge_outlined,
  'IDENTITY_UPDATED': Icons.edit_outlined,
  'ADDRESS_READ': Icons.home_outlined,
  'ADDRESS_UPDATED': Icons.edit_outlined,
  'PAYMENT_READ': Icons.credit_card_outlined,
  'CONSENT_GRANTED': Icons.handshake_outlined,
  'CONSENT_REVOKED': Icons.cancel_outlined,
  'LOGIN': Icons.login,
  'REGISTER': Icons.person_add_outlined,
};

const _eventColors = <String, Color>{
  'CONSENT_REVOKED': AppColors.danger,
  'LOGIN': AppColors.success,
  'REGISTER': AppColors.success,
};

class HistoryScreen extends ConsumerStatefulWidget {
  const HistoryScreen({super.key});

  @override
  ConsumerState<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends ConsumerState<HistoryScreen> {
  String _activeFilter = 'All';

  String? get _resourceFilter => _filters[_activeFilter];

  @override
  Widget build(BuildContext context) {
    final eventsAsync = ref.watch(_historyProvider(_resourceFilter));

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('History')),
      body: Column(
        children: [
          SizedBox(
            height: 48,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              itemCount: _filters.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, i) {
                final label = _filters.keys.elementAt(i);
                final active = label == _activeFilter;
                return GestureDetector(
                  onTap: () => setState(() => _activeFilter = label),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 6),
                    decoration: BoxDecoration(
                      color: active ? AppColors.accent : AppColors.card,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: active ? AppColors.accent : AppColors.border,
                      ),
                    ),
                    child: Text(
                      label,
                      style: TextStyle(
                        color: active ? Colors.white : AppColors.textSecondary,
                        fontSize: 13,
                        fontWeight: active ? FontWeight.w600 : FontWeight.normal,
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
          Expanded(
            child: eventsAsync.when(
              loading: () => const LoadingSpinner(message: 'Loading history...'),
              error: (e, _) => Center(
                  child: Text(friendlyError(e),
                      style: const TextStyle(color: AppColors.danger))),
              data: (events) {
                if (events.isEmpty) {
                  return const Center(
                    child: Text('No events',
                        style: TextStyle(color: AppColors.textMuted)),
                  );
                }
                return RefreshIndicator(
                  color: AppColors.accent,
                  onRefresh: () async =>
                      ref.invalidate(_historyProvider(_resourceFilter)),
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: events.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (context, i) => _EventTile(event: events[i]),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _EventTile extends StatelessWidget {
  final AuditEvent event;
  const _EventTile({required this.event});

  @override
  Widget build(BuildContext context) {
    final icon = _eventIcons[event.eventType] ?? Icons.history;
    final color = _eventColors[event.eventType] ?? AppColors.accent;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: color, size: 18),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  event.label ?? _formatEventType(event.eventType),
                  style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: AppColors.textPrimary),
                ),
                if (event.rpName != null)
                  Text(event.rpName!,
                      style: const TextStyle(
                          fontSize: 12, color: AppColors.textSecondary)),
              ],
            ),
          ),
          Text(
            _fmtDate(event.timestamp),
            style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
          ),
        ],
      ),
    );
  }

  String _formatEventType(String type) =>
      type.replaceAll('_', ' ').toLowerCase().split(' ').map((w) {
        if (w.isEmpty) return w;
        return w[0].toUpperCase() + w.substring(1);
      }).join(' ');

  String _fmtDate(String iso) {
    try {
      final dt = DateTime.parse(iso).toLocal();
      final months = [
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
      return '${months[dt.month]} ${dt.day} Â· ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return iso;
    }
  }
}
