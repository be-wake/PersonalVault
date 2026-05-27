import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/models/contacts.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/utils/error_utils.dart';
import '../../shared/widgets/app_button.dart';
import '../../shared/widgets/app_card.dart';
import '../../shared/widgets/app_input.dart';
import '../../shared/widgets/loading_spinner.dart';

final _contactsProvider =
    FutureProvider.autoDispose<ContactsData?>((ref) async {
  final api = ref.watch(apiClientProvider);
  final userId = ref.watch(authProvider).user!.id;
  try {
    final data = await api.getContacts(userId);
    return ContactsData.fromJson(data);
  } catch (_) {
    return null;
  }
});

const _phoneTypes = ['Mobile', 'Home', 'Work', 'Other'];

class ContactsScreen extends ConsumerStatefulWidget {
  const ContactsScreen({super.key});

  @override
  ConsumerState<ContactsScreen> createState() => _ContactsScreenState();
}

class _ContactsScreenState extends ConsumerState<ContactsScreen> {
  final _phone = TextEditingController();
  final _email = TextEditingController();
  String _phoneType = _phoneTypes.first;
  bool _saving = false;
  bool _initialized = false;
  String? _banner;
  bool _bannerSuccess = true;

  @override
  void dispose() {
    _phone.dispose();
    _email.dispose();
    super.dispose();
  }

  void _initFromData(ContactsData? data) {
    if (_initialized || data == null) return;
    _initialized = true;
    _phone.text = data.phonePrimary ?? '';
    _email.text = data.emailSecondary ?? '';
    _phoneType = data.phoneType ?? _phoneTypes.first;
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final api = ref.read(apiClientProvider);
      final userId = ref.read(authProvider).user!.id;
      await api.updateContacts(userId, {
        'phonePrimary': _phone.text.trim(),
        'phoneType': _phoneType,
        'emailSecondary': _email.text.trim(),
      });
      ref.invalidate(_contactsProvider);
      setState(() {
        _banner = 'Contacts saved';
        _bannerSuccess = true;
      });
    } catch (e) {
      setState(() {
        _banner = friendlyError(e);
        _bannerSuccess = false;
      });
    } finally {
      if (mounted) setState(() => _saving = false);
      Future.delayed(const Duration(seconds: 3), () {
        if (mounted) setState(() => _banner = null);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final contactsAsync = ref.watch(_contactsProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Contacts')),
      body: contactsAsync.when(
        loading: () => const LoadingSpinner(message: 'Loading...'),
        error: (e, _) => Center(
            child: Text(friendlyError(e),
                style: const TextStyle(color: AppColors.danger))),
        data: (contacts) {
          _initFromData(contacts);
          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                if (_banner != null)
                  Container(
                    margin: const EdgeInsets.only(bottom: 16),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: _bannerSuccess
                          ? AppColors.successSoft
                          : AppColors.dangerSoft,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          _bannerSuccess
                              ? Icons.check_circle_outline
                              : Icons.error_outline,
                          color: _bannerSuccess
                              ? AppColors.success
                              : AppColors.danger,
                          size: 18,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          _banner!,
                          style: TextStyle(
                            color: _bannerSuccess
                                ? AppColors.success
                                : AppColors.danger,
                          ),
                        ),
                      ],
                    ),
                  ),
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      DropdownButtonFormField<String>(
                        initialValue: _phoneType,
                        decoration:
                            const InputDecoration(labelText: 'Phone Type'),
                        items: _phoneTypes
                            .map((t) =>
                                DropdownMenuItem(value: t, child: Text(t)))
                            .toList(),
                        onChanged: (v) => setState(() => _phoneType = v!),
                      ),
                      const SizedBox(height: 16),
                      AppInput(
                        label: 'Primary Phone',
                        hint: '+91 98765 43210',
                        controller: _phone,
                        keyboardType: TextInputType.phone,
                      ),
                      const SizedBox(height: 16),
                      AppInput(
                        label: 'Secondary Email',
                        hint: 'alt@example.com',
                        controller: _email,
                        keyboardType: TextInputType.emailAddress,
                      ),
                      const SizedBox(height: 24),
                      AppButton(
                        title: 'Save',
                        onPressed: _saving ? null : _save,
                        loading: _saving,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
