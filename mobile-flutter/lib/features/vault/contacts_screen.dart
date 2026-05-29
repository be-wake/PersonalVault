import 'package:flutter/material.dart';
import 'package:flutter_contacts/flutter_contacts.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/models/contacts.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/utils/error_utils.dart';
import '../../shared/widgets/app_button.dart';
import '../../shared/widgets/app_card.dart';
import '../../shared/widgets/app_input.dart';
import '../../shared/widgets/app_toast.dart';
import '../../shared/widgets/confirm_dialog.dart';
import '../../shared/widgets/loading_spinner.dart';

// ── Provider ──────────────────────────────────────────────────────────────────

final _contactsProvider =
    FutureProvider.autoDispose<List<ContactPerson>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final userId = ref.watch(authProvider).user!.id;
  final data = await api.getContacts(userId);
  return data
      .map((c) => ContactPerson.fromJson(c as Map<String, dynamic>))
      .toList();
});

const _phoneTypes = ['Mobile', 'Home', 'Work', 'Other'];

// ── Screen ────────────────────────────────────────────────────────────────────

class ContactsScreen extends ConsumerStatefulWidget {
  const ContactsScreen({super.key});

  @override
  ConsumerState<ContactsScreen> createState() => _ContactsScreenState();
}

class _ContactsScreenState extends ConsumerState<ContactsScreen>
    with ToastHostMixin {
  Future<void> _deleteContact(String contactId) async {
    final ok = await showConfirmDialog(context, title: 'Delete contact?');
    if (!ok) return;
    try {
      final api = ref.read(apiClientProvider);
      final userId = ref.read(authProvider).user!.id;
      await api.deleteContact(userId, contactId);
      ref.invalidate(_contactsProvider);
      showToast('Contact deleted');
    } catch (e) {
      showToast(friendlyError(e), success: false);
    }
  }

  Future<void> _showAddSheet({ContactPerson? prefill}) async {
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _ContactFormSheet(
        title: 'Add Contact',
        prefill: prefill,
        onSaved: (data) async {
          final api = ref.read(apiClientProvider);
          final userId = ref.read(authProvider).user!.id;
          await api.addContact(userId, data);
          ref.invalidate(_contactsProvider);
          showToast('Contact added');
        },
      ),
    );
  }

  Future<void> _showEditSheet(ContactPerson contact) async {
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _ContactFormSheet(
        title: 'Edit Contact',
        existing: contact,
        onSaved: (data) async {
          final api = ref.read(apiClientProvider);
          final userId = ref.read(authProvider).user!.id;
          await api.updateContact(userId, contact.id, data);
          ref.invalidate(_contactsProvider);
          showToast('Contact updated');
        },
      ),
    );
  }

  Future<void> _importFromDevice() async {
    // Request read permission (v2 API)
    final status =
        await FlutterContacts.permissions.request(PermissionType.read);
    final granted = status == PermissionStatus.granted ||
        status == PermissionStatus.limited;
    if (!granted) {
      if (mounted) showToast('Contacts permission denied', success: false);
      return;
    }

    // Fetch device contacts with phone + email (v2 API)
    final deviceContacts = await FlutterContacts.getAll(
      properties: {ContactProperty.phone, ContactProperty.email},
    );

    if (!mounted) return;

    if (deviceContacts.isEmpty) {
      showToast('No contacts found on device', success: false);
      return;
    }

    // Show multi-select import sheet — returns the contacts the user picked
    final selected = await showModalBottomSheet<List<Contact>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) =>
          _DeviceContactImportSheet(contacts: deviceContacts),
    );

    if (selected == null || selected.isEmpty || !mounted) return;

    // Save each selected contact to the backend
    final api = ref.read(apiClientProvider);
    final userId = ref.read(authProvider).user!.id;
    int saved = 0;
    for (final c in selected) {
      try {
        final phone =
            c.phones.isNotEmpty ? c.phones.first.number : null;
        final email =
            c.emails.isNotEmpty ? c.emails.first.address : null;
        await api.addContact(userId, {
          if (c.displayName != null) 'name': c.displayName,
          if (phone != null) 'phonePrimary': phone,
          if (email != null) 'emailSecondary': email,
        });
        saved++;
      } catch (_) {}
    }

    if (!mounted) return;
    ref.invalidate(_contactsProvider);
    showToast('Imported $saved contact${saved == 1 ? '' : 's'}');
  }

  @override
  Widget build(BuildContext context) {
    final contactsAsync = ref.watch(_contactsProvider);

    return Scaffold(

      appBar: AppBar(title: const Text('Contacts')),
      body: Stack(
        children: [
          contactsAsync.when(
            loading: () => const LoadingSpinner(message: 'Loading...'),
            error: (e, _) => Center(
                child: Text(friendlyError(e),
                    style: const TextStyle(color: AppColors.danger))),
            data: (contacts) => RefreshIndicator(
              color: AppColors.accent,
              onRefresh: () async => ref.invalidate(_contactsProvider),
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // ── Action buttons ──────────────────────────────────────
                  Row(children: [
                    Expanded(
                      child: AppButton(
                        title: 'Add Contact',
                        variant: AppButtonVariant.secondary,
                        onPressed: () => _showAddSheet(),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: AppButton(
                        title: 'Import',
                        variant: AppButtonVariant.secondary,
                        onPressed: _importFromDevice,
                      ),
                    ),
                  ]),
                  const SizedBox(height: 16),

                  // ── Empty state ─────────────────────────────────────────
                  if (contacts.isEmpty)
                    _EmptyState(
                      onAddManually: () => _showAddSheet(),
                      onImport: _importFromDevice,
                    ),

                  // ── Contact cards ───────────────────────────────────────
                  ...contacts.map((c) => Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: _ContactCard(
                          contact: c,
                          onEdit: () => _showEditSheet(c),
                          onDelete: () => _deleteContact(c.id),
                        ),
                      )),
                ],
              ),
            ),
          ),

          // ── Toast ───────────────────────────────────────────────────────
          toastOverlay(),
        ],
      ),
    );
  }
}

// ── Contact card ──────────────────────────────────────────────────────────────

class _ContactCard extends StatelessWidget {
  final ContactPerson contact;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  const _ContactCard({
    required this.contact,
    required this.onEdit,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final initials = _initials(contact.name);

    return AppCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Avatar
          Container(
            width: 44,
            height: 44,
            decoration: const BoxDecoration(
              color: AppColors.accentLight,
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: Text(
              initials,
              style: const TextStyle(
                  color: AppColors.accent,
                  fontWeight: FontWeight.w700,
                  fontSize: 16),
            ),
          ),
          const SizedBox(width: 12),

          // Details
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (contact.name != null && contact.name!.isNotEmpty)
                  Text(
                    contact.name!,
                    style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 15,
                        color: AppColors.textPrimary),
                  ),
                if (contact.phonePrimary != null &&
                    contact.phonePrimary!.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Row(children: [
                    const Icon(Icons.phone_outlined,
                        size: 13, color: AppColors.textMuted),
                    const SizedBox(width: 4),
                    Text(
                      contact.phonePrimary!,
                      style: const TextStyle(
                          fontSize: 13, color: AppColors.textSecondary),
                    ),
                    if (contact.phoneType != null) ...[
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 1),
                        decoration: BoxDecoration(
                          color: AppColors.accentLight,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          contact.phoneType!,
                          style: const TextStyle(
                              fontSize: 10,
                              color: AppColors.accent,
                              fontWeight: FontWeight.w600),
                        ),
                      ),
                    ],
                  ]),
                ],
                if (contact.emailSecondary != null &&
                    contact.emailSecondary!.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Row(children: [
                    const Icon(Icons.email_outlined,
                        size: 13, color: AppColors.textMuted),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        contact.emailSecondary!,
                        style: const TextStyle(
                            fontSize: 13,
                            color: AppColors.textSecondary),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ]),
                ],
              ],
            ),
          ),

          // Actions — 3-dot popup menu
          PopupMenuButton<_ContactAction>(
            icon: const Icon(Icons.more_vert,
                color: AppColors.textMuted, size: 20),
            onSelected: (action) {
              if (action == _ContactAction.edit) onEdit();
              if (action == _ContactAction.delete) onDelete();
            },
            itemBuilder: (_) => [
              const PopupMenuItem(
                value: _ContactAction.edit,
                child: Row(children: [
                  Icon(Icons.edit_outlined,
                      color: AppColors.accent, size: 18),
                  SizedBox(width: 10),
                  Text('Edit'),
                ]),
              ),
              const PopupMenuItem(
                value: _ContactAction.delete,
                child: Row(children: [
                  Icon(Icons.delete_outline,
                      color: AppColors.danger, size: 18),
                  SizedBox(width: 10),
                  Text('Delete',
                      style: TextStyle(color: AppColors.danger)),
                ]),
              ),
            ],
          ),
        ],
      ),
    );
  }

  String _initials(String? name) {
    if (name == null || name.isEmpty) return '?';
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.length == 1) return parts[0][0].toUpperCase();
    return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
  }
}

// ── Empty state ───────────────────────────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  final VoidCallback onAddManually;
  final VoidCallback onImport;

  const _EmptyState({required this.onAddManually, required this.onImport});

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        children: [
          const SizedBox(height: 12),
          const Icon(Icons.contacts_outlined,
              size: 48, color: AppColors.textMuted),
          const SizedBox(height: 12),
          const Text(
            'No contacts saved yet',
            style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary),
          ),
          const SizedBox(height: 6),
          const Text(
            'Add contacts manually or import them\ndirectly from your device.',
            textAlign: TextAlign.center,
            style:
                TextStyle(fontSize: 13, color: AppColors.textSecondary),
          ),
          const SizedBox(height: 20),
          Row(children: [
            Expanded(
              child: AppButton(
                title: 'Add Manually',
                variant: AppButtonVariant.secondary,
                onPressed: onAddManually,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: AppButton(
                title: 'Import from Device',
                onPressed: onImport,
              ),
            ),
          ]),
          const SizedBox(height: 4),
        ],
      ),
    );
  }
}

// ── Add / Edit form sheet ─────────────────────────────────────────────────────

class _ContactFormSheet extends StatefulWidget {
  final String title;
  final ContactPerson? existing;   // non-null → edit mode
  final ContactPerson? prefill;    // non-null → imported from device
  final Future<void> Function(Map<String, dynamic>) onSaved;

  const _ContactFormSheet({
    required this.title,
    required this.onSaved,
    this.existing,
    this.prefill,
  });

  @override
  State<_ContactFormSheet> createState() => _ContactFormSheetState();
}

class _ContactFormSheetState extends State<_ContactFormSheet> {
  late String _phoneType;
  late final TextEditingController _name;
  late final TextEditingController _phone;
  late final TextEditingController _email;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final src = widget.existing ?? widget.prefill;
    _phoneType = src?.phoneType ??
        (_phoneTypes.contains(src?.phoneType) ? src!.phoneType! : _phoneTypes.first);
    _name  = TextEditingController(text: src?.name ?? '');
    _phone = TextEditingController(text: src?.phonePrimary ?? '');
    _email = TextEditingController(text: src?.emailSecondary ?? '');
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _email.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_name.text.trim().isEmpty && _phone.text.trim().isEmpty) return;
    setState(() => _saving = true);
    try {
      await widget.onSaved({
        if (_name.text.trim().isNotEmpty) 'name': _name.text.trim(),
        if (_phone.text.trim().isNotEmpty) 'phonePrimary': _phone.text.trim(),
        'phoneType': _phoneType,
        if (_email.text.trim().isNotEmpty)
          'emailSecondary': _email.text.trim(),
      });
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(friendlyError(e))),
        );
      }
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
          initialChildSize: 0.75,
          minChildSize: 0.5,
          maxChildSize: 0.92,
          expand: false,
          builder: (_, scrollCtrl) => ListView(
            controller: scrollCtrl,
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
            children: [
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
              Text(
                widget.title,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: 20),
              AppInput(
                label: 'Name',
                hint: 'e.g. Mum, John Smith',
                controller: _name,
              ),
              const SizedBox(height: 14),
              DropdownButtonFormField<String>(
                initialValue: _phoneType,
                decoration: const InputDecoration(labelText: 'Phone Type'),
                items: _phoneTypes
                    .map((t) =>
                        DropdownMenuItem(value: t, child: Text(t)))
                    .toList(),
                onChanged: (v) => setState(() => _phoneType = v!),
              ),
              const SizedBox(height: 14),
              AppInput(
                label: 'Phone Number',
                hint: '+91 98765 43210',
                controller: _phone,
                keyboardType: TextInputType.phone,
              ),
              const SizedBox(height: 14),
              AppInput(
                label: 'Email (optional)',
                hint: 'name@example.com',
                controller: _email,
                keyboardType: TextInputType.emailAddress,
              ),
              const SizedBox(height: 24),
              AppButton(
                title: 'Save',
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

// ── Contact action enum (for popup menu) ─────────────────────────────────────

enum _ContactAction { edit, delete }

// ── Device contact import sheet (multi-select) ────────────────────────────────

class _DeviceContactImportSheet extends StatefulWidget {
  final List<Contact> contacts;
  const _DeviceContactImportSheet({required this.contacts});

  @override
  State<_DeviceContactImportSheet> createState() =>
      _DeviceContactImportSheetState();
}

class _DeviceContactImportSheetState
    extends State<_DeviceContactImportSheet> {
  String _query = '';
  late Set<String> _selectedIds;

  @override
  void initState() {
    super.initState();
    // Pre-select every contact (filter out any contacts with null ids)
    _selectedIds =
        widget.contacts.map((c) => c.id).whereType<String>().toSet();
  }

  List<Contact> get _filtered => _query.isEmpty
      ? widget.contacts
      : widget.contacts
          .where((c) => (c.displayName ?? '')
              .toLowerCase()
              .contains(_query.toLowerCase()))
          .toList();

  bool get _allSelected =>
      _filtered.every((c) => c.id == null || _selectedIds.contains(c.id));

  void _toggleAll() {
    setState(() {
      if (_allSelected) {
        for (final c in _filtered) {
          if (c.id != null) _selectedIds.remove(c.id!);
        }
      } else {
        for (final c in _filtered) {
          if (c.id != null) _selectedIds.add(c.id!);
        }
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;
    final selectedCount = _selectedIds.length;

    return Container(
      height: MediaQuery.of(context).size.height * 0.90,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius:
            const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        children: [
          // Handle
          Container(
            width: 40,
            height: 4,
            margin: const EdgeInsets.symmetric(vertical: 12),
            decoration: BoxDecoration(
              color: Colors.grey.shade400,
              borderRadius: BorderRadius.circular(2),
            ),
          ),

          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Import Contacts',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    TextButton(
                      onPressed: _toggleAll,
                      child: Text(
                        _allSelected ? 'Deselect All' : 'Select All',
                        style: const TextStyle(color: AppColors.accent),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                // Search field
                TextField(
                  decoration: InputDecoration(
                    hintText: 'Search contacts…',
                    prefixIcon: const Icon(Icons.search,
                        size: 20, color: AppColors.textMuted),
                    contentPadding:
                        const EdgeInsets.symmetric(vertical: 10),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  onChanged: (v) => setState(() => _query = v),
                ),
              ],
            ),
          ),

          // Contact list with checkboxes
          Expanded(
            child: filtered.isEmpty
                ? const Center(
                    child: Text('No contacts found',
                        style:
                            TextStyle(color: AppColors.textMuted)))
                : ListView.builder(
                    itemCount: filtered.length,
                    itemBuilder: (_, i) {
                      final c = filtered[i];
                      final phone = c.phones.isNotEmpty
                          ? c.phones.first.number
                          : null;
                      final cid = c.id ?? '';
                      final isSelected = _selectedIds.contains(cid);
                      return CheckboxListTile(
                        value: isSelected,
                        activeColor: AppColors.accent,
                        onChanged: cid.isEmpty
                            ? null
                            : (_) => setState(() {
                                  if (isSelected) {
                                    _selectedIds.remove(cid);
                                  } else {
                                    _selectedIds.add(cid);
                                  }
                                }),
                        secondary: CircleAvatar(
                          backgroundColor: AppColors.accentLight,
                          child: Text(
                            (c.displayName?.isNotEmpty ?? false)
                                ? c.displayName![0].toUpperCase()
                                : '?',
                            style: const TextStyle(
                                color: AppColors.accent,
                                fontWeight: FontWeight.w700),
                          ),
                        ),
                        title: Text(c.displayName ?? 'Unknown',
                            style: const TextStyle(
                                fontWeight: FontWeight.w500)),
                        subtitle:
                            phone != null ? Text(phone) : null,
                      );
                    },
                  ),
          ),

          // Import button
          SafeArea(
            child: Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              child: SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: selectedCount == 0
                      ? null
                      : () {
                          final selected = widget.contacts
                              .where((c) =>
                                  c.id != null &&
                                  _selectedIds.contains(c.id))
                              .toList();
                          Navigator.pop(context, selected);
                        },
                  child: Text(selectedCount == 0
                      ? 'Select contacts to import'
                      : 'Import $selectedCount contact${selectedCount == 1 ? '' : 's'}'),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
