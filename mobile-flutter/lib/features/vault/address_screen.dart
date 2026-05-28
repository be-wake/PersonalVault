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
  final _name = TextEditingController();
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
    for (final c in [_name, _line1, _line2, _city, _state, _postal, _country]) {
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

  void _resetForm() {
    _selectedLabel = _labels.first;
    for (final c in [_name, _line1, _line2, _city, _state, _postal, _country]) {
      c.clear();
    }
  }

  Future<void> _addAddress() async {
    if (_line1.text.trim().isEmpty) return;
    setState(() => _saving = true);
    try {
      final api = ref.read(apiClientProvider);
      final userId = ref.read(authProvider).user!.id;
      await api.addAddress(userId, {
        'label': _selectedLabel,
        if (_name.text.trim().isNotEmpty) 'name': _name.text.trim(),
        'line1': _line1.text.trim(),
        if (_line2.text.isNotEmpty) 'line2': _line2.text.trim(),
        'city': _city.text.trim(),
        'state': _state.text.trim(),
        'postal': _postal.text.trim(),
        'country': _country.text.trim(),
      });
      _resetForm();
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
        content: const Text('This action cannot be undone.'),
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

  Future<void> _showEditSheet(AddressData addr) async {
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _EditAddressSheet(
        addr: addr,
        onSaved: (data) async {
          final api = ref.read(apiClientProvider);
          final userId = ref.read(authProvider).user!.id;
          await api.updateAddress(userId, addr.id, data);
          ref.invalidate(_addressesProvider);
          _showToast('Address updated');
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final addrsAsync = ref.watch(_addressesProvider);

    return Scaffold(

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
                  // ── Add form ──────────────────────────────────────────────
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
                          AppInput(
                            label: 'Name (optional)',
                            hint: 'e.g. Mum, John\'s place',
                            controller: _name,
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

                  // ── Address cards ─────────────────────────────────────────
                  ...addresses.map((addr) => Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: _AddressCard(
                          addr: addr,
                          onEdit: () => _showEditSheet(addr),
                          onDelete: () => _deleteAddress(addr.id),
                          onSetPrimary: addr.isCurrent
                              ? null
                              : () => _setPrimary(addr.id),
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

          // ── Toast ─────────────────────────────────────────────────────────
          if (_toast != null)
            Positioned(
              bottom: 24,
              left: 24,
              right: 24,
              child: Material(
                borderRadius: BorderRadius.circular(10),
                color: AppColors.accentDark,
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
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

// ── Edit address bottom sheet ─────────────────────────────────────────────────

class _EditAddressSheet extends StatefulWidget {
  final AddressData addr;
  final Future<void> Function(Map<String, dynamic> data) onSaved;

  const _EditAddressSheet({required this.addr, required this.onSaved});

  @override
  State<_EditAddressSheet> createState() => _EditAddressSheetState();
}

class _EditAddressSheetState extends State<_EditAddressSheet> {
  late String _selectedLabel;
  late final TextEditingController _name;
  late final TextEditingController _l1;
  late final TextEditingController _l2;
  late final TextEditingController _city;
  late final TextEditingController _state;
  late final TextEditingController _postal;
  late final TextEditingController _country;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final addr = widget.addr;
    _selectedLabel =
        _labels.contains(addr.label) ? addr.label! : _labels.first;
    _name = TextEditingController(text: addr.name ?? '');
    _l1 = TextEditingController(text: addr.line1 ?? '');
    _l2 = TextEditingController(text: addr.line2 ?? '');
    _city = TextEditingController(text: addr.city ?? '');
    _state = TextEditingController(text: addr.state ?? '');
    _postal = TextEditingController(text: addr.postal ?? '');
    _country = TextEditingController(text: addr.country ?? '');
  }

  @override
  void dispose() {
    for (final c in [_name, _l1, _l2, _city, _state, _postal, _country]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (_l1.text.trim().isEmpty) return;
    setState(() => _saving = true);
    try {
      await widget.onSaved({
        'label': _selectedLabel,
        if (_name.text.trim().isNotEmpty) 'name': _name.text.trim(),
        'line1': _l1.text.trim(),
        if (_l2.text.isNotEmpty) 'line2': _l2.text.trim(),
        'city': _city.text.trim(),
        'state': _state.text.trim(),
        'postal': _postal.text.trim(),
        'country': _country.text.trim(),
      });
      if (mounted) Navigator.pop(context);
    } catch (_) {
      // Error handling is done in onSaved callback (toast shown by parent)
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding:
          EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: const BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: DraggableScrollableSheet(
          initialChildSize: 0.88,
          minChildSize: 0.5,
          maxChildSize: 0.95,
          expand: false,
          builder: (_, scrollCtrl) => ListView(
            controller: scrollCtrl,
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
            children: [
              // Handle
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 20),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade300,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const Text(
                'Edit Address',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: 20),
              DropdownButtonFormField<String>(
                initialValue: _selectedLabel,
                decoration: const InputDecoration(labelText: 'Label'),
                items: _labels
                    .map((l) => DropdownMenuItem(value: l, child: Text(l)))
                    .toList(),
                onChanged: (v) => setState(() => _selectedLabel = v!),
              ),
              const SizedBox(height: 14),
              AppInput(
                label: 'Name (optional)',
                hint: 'e.g. Mum, John\'s place',
                controller: _name,
              ),
              const SizedBox(height: 14),
              AppInput(label: 'Line 1', controller: _l1),
              const SizedBox(height: 14),
              AppInput(label: 'Line 2 (optional)', controller: _l2),
              const SizedBox(height: 14),
              Row(children: [
                Expanded(child: AppInput(label: 'City', controller: _city)),
                const SizedBox(width: 12),
                Expanded(child: AppInput(label: 'State', controller: _state)),
              ]),
              const SizedBox(height: 14),
              Row(children: [
                Expanded(
                    child: AppInput(label: 'Postal', controller: _postal)),
                const SizedBox(width: 12),
                Expanded(
                    child: AppInput(label: 'Country', controller: _country)),
              ]),
              const SizedBox(height: 24),
              AppButton(
                title: 'Save Changes',
                loading: _saving,
                onPressed: _saving ? null : _save,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Address card widget ───────────────────────────────────────────────────────

class _AddressCard extends StatelessWidget {
  final AddressData addr;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  final VoidCallback? onSetPrimary;

  const _AddressCard({
    required this.addr,
    required this.onEdit,
    required this.onDelete,
    this.onSetPrimary,
  });

  @override
  Widget build(BuildContext context) {
    final rawLabel = addr.label ?? 'Address';
    // When label is "Other" and a name is set, show the name as the title
    final displayLabel = (rawLabel.toLowerCase() == 'other' &&
            addr.name != null &&
            addr.name!.isNotEmpty)
        ? addr.name!
        : rawLabel;
    final label = displayLabel;
    final badgeText = addr.isCurrent ? '$label · Primary' : label;
    final badgeColor =
        addr.isCurrent ? AppColors.successSoft : AppColors.accentLight;
    final badgeTextColor =
        addr.isCurrent ? AppColors.success : AppColors.accent;

    final addressLine = [
      addr.line1,
      addr.line2,
      addr.city,
      addr.state,
      addr.postal,
      addr.country,
    ].where((s) => s != null && s.isNotEmpty).join(', ');

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Header row ──────────────────────────────────────────────────
          Row(children: [
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: badgeColor,
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                badgeText,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: badgeTextColor,
                ),
              ),
            ),
            const Spacer(),
            // Edit button
            IconButton(
              icon: const Icon(Icons.edit_outlined,
                  color: AppColors.accent, size: 18),
              onPressed: onEdit,
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(),
              tooltip: 'Edit',
            ),
            const SizedBox(width: 8),
            // Delete button
            IconButton(
              icon: const Icon(Icons.delete_outline,
                  color: AppColors.danger, size: 18),
              onPressed: onDelete,
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(),
              tooltip: 'Delete',
            ),
          ]),

          const SizedBox(height: 8),

          // ── Name (shown when label is not Other, since Other already uses name as badge) ─
          if (addr.name != null &&
              addr.name!.isNotEmpty &&
              (addr.label ?? '').toLowerCase() != 'other') ...[
            Text(
              addr.name!,
              style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: AppColors.textPrimary),
            ),
            const SizedBox(height: 4),
          ],

          // ── Address text ─────────────────────────────────────────────────
          Text(
            addressLine.isEmpty ? '—' : addressLine,
            style: const TextStyle(
                color: AppColors.textSecondary, fontSize: 14),
          ),

          // ── Set as primary ───────────────────────────────────────────────
          if (onSetPrimary != null) ...[
            const SizedBox(height: 10),
            AppButton(
              title: 'Set as Primary',
              variant: AppButtonVariant.ghost,
              fullWidth: false,
              onPressed: onSetPrimary,
            ),
          ],
        ],
      ),
    );
  }
}
