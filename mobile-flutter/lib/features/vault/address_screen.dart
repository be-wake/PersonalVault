import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/models/address.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/utils/error_utils.dart';
import '../../shared/widgets/app_button.dart';
import '../../shared/widgets/app_card.dart';
import '../../shared/widgets/app_input.dart';
import '../../shared/widgets/loading_spinner.dart';

final _addressesProvider =
    FutureProvider.autoDispose<List<AddressData>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final userId = ref.watch(authProvider).user!.id;
  final data = await api.getAddresses(userId);
  return data
      .map((a) => AddressData.fromJson(a as Map<String, dynamic>))
      .toList();
});

const _labels = ['Home', 'Work', 'Family', 'Other'];

class AddressScreen extends ConsumerStatefulWidget {
  const AddressScreen({super.key});

  @override
  ConsumerState<AddressScreen> createState() => _AddressScreenState();
}

class _AddressScreenState extends ConsumerState<AddressScreen> {
  bool _showForm = false;
  String _selectedLabel = _labels.first;
  final _line1 = TextEditingController();
  final _line2 = TextEditingController();
  final _city = TextEditingController();
  final _state = TextEditingController();
  final _postal = TextEditingController();
  final _country = TextEditingController();
  bool _saving = false;
  String? _toast;

  @override
  void dispose() {
    for (final c in [_line1, _line2, _city, _state, _postal, _country]) {
      c.dispose();
    }
    super.dispose();
  }

  void _showToast(String msg) {
    setState(() => _toast = msg);
    Future.delayed(const Duration(seconds: 3), () {
      if (mounted) setState(() => _toast = null);
    });
  }

  Future<void> _addAddress() async {
    setState(() => _saving = true);
    try {
      final api = ref.read(apiClientProvider);
      final userId = ref.read(authProvider).user!.id;
      await api.addAddress(userId, {
        'label': _selectedLabel,
        'line1': _line1.text.trim(),
        if (_line2.text.isNotEmpty) 'line2': _line2.text.trim(),
        'city': _city.text.trim(),
        'state': _state.text.trim(),
        'postal': _postal.text.trim(),
        'country': _country.text.trim(),
      });
      for (final c in [_line1, _line2, _city, _state, _postal, _country]) {
        c.clear();
      }
      setState(() => _showForm = false);
      ref.invalidate(_addressesProvider);
      _showToast('Address added');
    } catch (e) {
      _showToast(friendlyError(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _deleteAddress(String addrId) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete address?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Delete',
                  style: TextStyle(color: AppColors.danger))),
        ],
      ),
    );
    if (ok != true) return;
    try {
      final api = ref.read(apiClientProvider);
      final userId = ref.read(authProvider).user!.id;
      await api.deleteAddress(userId, addrId);
      ref.invalidate(_addressesProvider);
      _showToast('Address deleted');
    } catch (e) {
      _showToast(friendlyError(e));
    }
  }

  Future<void> _setPrimary(String addrId) async {
    try {
      final api = ref.read(apiClientProvider);
      final userId = ref.read(authProvider).user!.id;
      await api.setPrimaryAddress(userId, addrId);
      ref.invalidate(_addressesProvider);
      _showToast('Primary address updated');
    } catch (e) {
      _showToast(friendlyError(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final addrsAsync = ref.watch(_addressesProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Addresses')),
      body: Stack(
        children: [
          addrsAsync.when(
            loading: () => const LoadingSpinner(message: 'Loading...'),
            error: (e, _) => Center(
                child: Text(friendlyError(e),
                    style: const TextStyle(color: AppColors.danger))),
            data: (addresses) => RefreshIndicator(
              color: AppColors.accent,
              onRefresh: () async => ref.invalidate(_addressesProvider),
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (_showForm) ...[
                    AppCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Add Address',
                              style: TextStyle(
                                  fontWeight: FontWeight.w600, fontSize: 16)),
                          const SizedBox(height: 16),
                          DropdownButtonFormField<String>(
                            initialValue: _selectedLabel,
                            decoration:
                                const InputDecoration(labelText: 'Label'),
                            items: _labels
                                .map((l) => DropdownMenuItem(
                                    value: l, child: Text(l)))
                                .toList(),
                            onChanged: (v) =>
                                setState(() => _selectedLabel = v!),
                          ),
                          const SizedBox(height: 12),
                          AppInput(label: 'Line 1', controller: _line1),
                          const SizedBox(height: 12),
                          AppInput(
                              label: 'Line 2 (optional)',
                              controller: _line2),
                          const SizedBox(height: 12),
                          Row(children: [
                            Expanded(
                                child: AppInput(
                                    label: 'City', controller: _city)),
                            const SizedBox(width: 12),
                            Expanded(
                                child: AppInput(
                                    label: 'State', controller: _state)),
                          ]),
                          const SizedBox(height: 12),
                          Row(children: [
                            Expanded(
                                child: AppInput(
                                    label: 'Postal', controller: _postal)),
                            const SizedBox(width: 12),
                            Expanded(
                                child: AppInput(
                                    label: 'Country',
                                    controller: _country)),
                          ]),
                          const SizedBox(height: 16),
                          Row(children: [
                            Expanded(
                              child: AppButton(
                                  title: 'Cancel',
                                  variant: AppButtonVariant.secondary,
                                  onPressed: () =>
                                      setState(() => _showForm = false)),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: AppButton(
                                  title: 'Save',
                                  onPressed: _saving ? null : _addAddress,
                                  loading: _saving),
                            ),
                          ]),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],
                  if (!_showForm)
                    AppButton(
                        title: 'Add Address',
                        variant: AppButtonVariant.secondary,
                        onPressed: () => setState(() => _showForm = true)),
                  const SizedBox(height: 16),
                  ...addresses.map((addr) => Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: AppCard(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 8, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: addr.isCurrent
                                        ? AppColors.successSoft
                                        : AppColors.accentLight,
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: Text(
                                    addr.isCurrent
                                        ? '${addr.label ?? 'Address'} Â· Primary'
                                        : addr.label ?? 'Address',
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                      color: addr.isCurrent
                                          ? AppColors.success
                                          : AppColors.accent,
                                    ),
                                  ),
                                ),
                                const Spacer(),
                                IconButton(
                                  icon: const Icon(Icons.delete_outline,
                                      color: AppColors.danger, size: 18),
                                  onPressed: () =>
                                      _deleteAddress(addr.id),
                                  padding: EdgeInsets.zero,
                                  constraints: const BoxConstraints(),
                                ),
                              ]),
                              const SizedBox(height: 8),
                              Text(
                                [
                                  addr.line1,
                                  addr.line2,
                                  addr.city,
                                  addr.state,
                                  addr.postal,
                                  addr.country,
                                ]
                                    .where((s) =>
                                        s != null && s.isNotEmpty)
                                    .join(', '),
                                style: const TextStyle(
                                    color: AppColors.textSecondary,
                                    fontSize: 14),
                              ),
                              if (!addr.isCurrent) ...[
                                const SizedBox(height: 10),
                                AppButton(
                                  title: 'Set as Primary',
                                  variant: AppButtonVariant.ghost,
                                  fullWidth: false,
                                  onPressed: () => _setPrimary(addr.id),
                                ),
                              ],
                            ],
                          ),
                        ),
                      )),
                  if (addresses.isEmpty && !_showForm)
                    const Center(
                      child: Padding(
                        padding: EdgeInsets.symmetric(vertical: 32),
                        child: Text('No addresses yet',
                            style: TextStyle(color: AppColors.textMuted)),
                      ),
                    ),
                ],
              ),
            ),
          ),
          if (_toast != null)
            Positioned(
              bottom: 24,
              left: 24,
              right: 24,
              child: Material(
                borderRadius: BorderRadius.circular(10),
                color: AppColors.accentDark,
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 16, vertical: 12),
                  child: Text(_toast!,
                      style: const TextStyle(color: Colors.white)),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
