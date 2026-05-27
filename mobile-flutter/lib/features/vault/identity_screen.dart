import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/models/identity.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/utils/error_utils.dart';
import '../../shared/widgets/app_button.dart';
import '../../shared/widgets/app_card.dart';
import '../../shared/widgets/app_input.dart';
import '../../shared/widgets/loading_spinner.dart';

final _identityProvider =
    FutureProvider.autoDispose<IdentityData>((ref) async {
  final api = ref.watch(apiClientProvider);
  final userId = ref.watch(authProvider).user!.id;
  final data = await api.getIdentity(userId);
  return IdentityData.fromJson(data);
});

const _idTypes = [
  'Aadhaar',
  'Passport',
  'Driving Licence',
  'PAN',
  'Voter ID',
  'National ID',
];

class IdentityScreen extends ConsumerStatefulWidget {
  const IdentityScreen({super.key});

  @override
  ConsumerState<IdentityScreen> createState() => _IdentityScreenState();
}

class _IdentityScreenState extends ConsumerState<IdentityScreen> {
  bool _showForm = false;
  String _selectedType = _idTypes.first;
  final _numberCtrl = TextEditingController();
  bool _saving = false;
  String? _toast;

  @override
  void dispose() {
    _numberCtrl.dispose();
    super.dispose();
  }

  void _showToast(String msg) {
    setState(() => _toast = msg);
    Future.delayed(const Duration(seconds: 3), () {
      if (mounted) setState(() => _toast = null);
    });
  }

  Future<void> _addDocument() async {
    if (_numberCtrl.text.trim().isEmpty) return;
    setState(() => _saving = true);
    try {
      final api = ref.read(apiClientProvider);
      final userId = ref.read(authProvider).user!.id;
      await api.addDocument(userId, {
        'idType': _selectedType,
        'idNumber': _numberCtrl.text.trim(),
      });
      _numberCtrl.clear();
      setState(() => _showForm = false);
      ref.invalidate(_identityProvider);
      _showToast('Document added');
    } catch (e) {
      _showToast(friendlyError(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _deleteDocument(String docId) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete document?'),
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
    if (confirmed != true) return;
    try {
      final api = ref.read(apiClientProvider);
      final userId = ref.read(authProvider).user!.id;
      await api.deleteDocument(userId, docId);
      ref.invalidate(_identityProvider);
      _showToast('Document deleted');
    } catch (e) {
      _showToast(friendlyError(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final identityAsync = ref.watch(_identityProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Identity')),
      body: Stack(
        children: [
          identityAsync.when(
            loading: () => const LoadingSpinner(message: 'Loading...'),
            error: (e, _) => Center(
                child: Text(friendlyError(e),
                    style: const TextStyle(color: AppColors.danger))),
            data: (identity) => RefreshIndicator(
              color: AppColors.accent,
              onRefresh: () async => ref.invalidate(_identityProvider),
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (_showForm) ...[
                    AppCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Add Document',
                              style: TextStyle(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 16,
                                  color: AppColors.textPrimary)),
                          const SizedBox(height: 16),
                          DropdownButtonFormField<String>(
                            initialValue: _selectedType,
                            decoration: const InputDecoration(
                                labelText: 'ID Type'),
                            items: _idTypes
                                .map((t) => DropdownMenuItem(
                                    value: t, child: Text(t)))
                                .toList(),
                            onChanged: (v) =>
                                setState(() => _selectedType = v!),
                          ),
                          const SizedBox(height: 16),
                          AppInput(
                            label: 'ID Number',
                            hint: 'Enter ID number',
                            controller: _numberCtrl,
                          ),
                          const SizedBox(height: 16),
                          Row(
                            children: [
                              Expanded(
                                child: AppButton(
                                  title: 'Cancel',
                                  variant: AppButtonVariant.secondary,
                                  onPressed: () =>
                                      setState(() => _showForm = false),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: AppButton(
                                  title: 'Save',
                                  onPressed: _saving ? null : _addDocument,
                                  loading: _saving,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],
                  if (!_showForm)
                    AppButton(
                      title: 'Add Document',
                      variant: AppButtonVariant.secondary,
                      onPressed: () => setState(() => _showForm = true),
                    ),
                  const SizedBox(height: 16),
                  ...identity.documents.map(
                    (doc) => Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: AppCard(
                        child: Row(
                          children: [
                            const Icon(Icons.badge_outlined,
                                color: AppColors.accent, size: 22),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(doc.idType,
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w600,
                                          color: AppColors.textPrimary)),
                                  Text(
                                    'â€¢â€¢â€¢â€¢${doc.idNumber.length > 4 ? doc.idNumber.substring(doc.idNumber.length - 4) : doc.idNumber}',
                                    style: const TextStyle(
                                        color: AppColors.textSecondary,
                                        fontSize: 13),
                                  ),
                                ],
                              ),
                            ),
                            IconButton(
                              icon: const Icon(Icons.delete_outline,
                                  color: AppColors.danger, size: 20),
                              onPressed: () => _deleteDocument(doc.id),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  if (identity.documents.isEmpty && !_showForm)
                    const Center(
                      child: Padding(
                        padding: EdgeInsets.symmetric(vertical: 32),
                        child: Text('No documents yet',
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
                      style: const TextStyle(
                          color: Colors.white, fontSize: 14)),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
