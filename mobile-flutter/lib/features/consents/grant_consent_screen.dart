import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/models/consent.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/utils/error_utils.dart';
import '../../shared/widgets/app_button.dart';
import '../../shared/widgets/loading_spinner.dart';

final _relyingPartiesProvider =
    FutureProvider.autoDispose<List<RelyingParty>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final data = await api.getRelyingParties();
  return data
      .map((r) => RelyingParty.fromJson(r as Map<String, dynamic>))
      .toList();
});

/// Flow for granting a relying party access to selected scopes.
class GrantConsentScreen extends ConsumerStatefulWidget {
  const GrantConsentScreen({super.key});

  @override
  ConsumerState<GrantConsentScreen> createState() =>
      _GrantConsentScreenState();
}

class _GrantConsentScreenState extends ConsumerState<GrantConsentScreen> {
  int _step = 0;
  RelyingParty? _selectedRp;
  final Set<String> _selectedScopes = {};
  final _purposeCtrl = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _purposeCtrl.dispose();
    super.dispose();
  }

  bool get _canProceed => switch (_step) {
        0 => _selectedRp != null,
        1 => _selectedScopes.isNotEmpty,
        2 => _purposeCtrl.text.trim().isNotEmpty,
        _ => false,
      };

  Future<void> _submit() async {
    setState(() => _submitting = true);
    try {
      final api = ref.read(apiClientProvider);
      await api.grantConsent({
        'relyingPartyId': _selectedRp!.id,
        'scopes': _selectedScopes.toList(),
        'purpose': _purposeCtrl.text.trim(),
      });
      if (mounted) context.go('/consents');
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(friendlyError(e)), backgroundColor: AppColors.danger),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(

      appBar: AppBar(
        title: const Text('Grant Access'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => _step > 0
              ? setState(() => _step--)
              : context.go('/consents'),
        ),
      ),
      body: Column(
        children: [
          _StepIndicator(current: _step),
          Expanded(
            child: SingleChildScrollView(
              child: _buildStep(),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                if (_step > 0)
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: AppButton(
                        title: 'Back',
                        variant: AppButtonVariant.secondary,
                        onPressed: () => setState(() => _step--),
                      ),
                    ),
                  ),
                Expanded(
                  child: AppButton(
                    title: _step == 2 ? 'Grant' : 'Next',
                    onPressed: _canProceed
                        ? (_step == 2 ? _submit : () => setState(() => _step++))
                        : null,
                    loading: _submitting,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStep() {
    return switch (_step) {
      0 => _StepChooseService(
          selected: _selectedRp,
          onSelect: (rp) => setState(() => _selectedRp = rp),
        ),
      1 => _StepSelectScopes(
          rp: _selectedRp!,
          selected: _selectedScopes,
          onToggle: (s) => setState(() {
            if (_selectedScopes.contains(s)) {
              _selectedScopes.remove(s);
            } else {
              _selectedScopes.add(s);
            }
          }),
        ),
      2 => _StepPurpose(
          controller: _purposeCtrl,
          onChanged: () => setState(() {}),
        ),
      _ => const SizedBox(),
    };
  }
}

class _StepIndicator extends StatelessWidget {
  final int current;
  const _StepIndicator({required this.current});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
      child: Row(
        children: [
          _StepCircle(index: 0, current: current),
          Expanded(
            child: Container(
              height: 2,
              color: current > 0 ? AppColors.accent : AppColors.border,
            ),
          ),
          _StepCircle(index: 1, current: current),
          Expanded(
            child: Container(
              height: 2,
              color: current > 1 ? AppColors.accent : AppColors.border,
            ),
          ),
          _StepCircle(index: 2, current: current),
        ],
      ),
    );
  }
}

class _StepCircle extends StatelessWidget {
  final int index;
  final int current;
  const _StepCircle({required this.index, required this.current});

  @override
  Widget build(BuildContext context) {
    final active = index == current;
    final done = index < current;
    return Container(
      width: 32,
      height: 32,
      decoration: BoxDecoration(
        color: active || done
            ? AppColors.accent
            : Theme.of(context).colorScheme.surfaceContainerHighest,
        shape: BoxShape.circle,
        border: Border.all(
          color: active || done ? AppColors.accent : AppColors.border,
          width: 2,
        ),
      ),
      child: Center(
        child: done
            ? const Icon(Icons.check, color: Colors.white, size: 16)
            : Text(
                '${index + 1}',
                style: TextStyle(
                  color: active ? Colors.white : AppColors.textMuted,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                ),
              ),
      ),
    );
  }
}

class _StepChooseService extends ConsumerWidget {
  final RelyingParty? selected;
  final ValueChanged<RelyingParty> onSelect;

  const _StepChooseService(
      {required this.selected, required this.onSelect});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rpsAsync = ref.watch(_relyingPartiesProvider);

    return rpsAsync.when(
      loading: () => const LoadingSpinner(message: 'Loading services...'),
      error: (e, _) => Center(child: Text(friendlyError(e))),
      data: (rps) => ListView.separated(
        padding: const EdgeInsets.all(16),
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        itemCount: rps.length,
        separatorBuilder: (_, __) => const SizedBox(height: 8),
        itemBuilder: (ctx, i) {
          final rp = rps[i];
          final isSelected = selected?.id == rp.id;
          return GestureDetector(
            onTap: () => onSelect(rp),
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: isSelected
                    ? AppColors.accentLight
                    : AppColors.card,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: isSelected ? AppColors.accent : AppColors.border,
                  width: isSelected ? 2 : 1,
                ),
              ),
              child: Row(children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: AppColors.accentLight,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.business,
                      color: AppColors.accent, size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(rp.name,
                          style: const TextStyle(
                              fontWeight: FontWeight.w600,
                              color: AppColors.textPrimary)),
                      if (rp.domain != null)
                        Text(rp.domain!,
                            style: const TextStyle(
                                fontSize: 12,
                                color: AppColors.textMuted)),
                    ],
                  ),
                ),
                if (isSelected)
                  const Icon(Icons.check_circle,
                      color: AppColors.accent, size: 20),
              ]),
            ),
          );
        },
      ),
    );
  }
}

class _StepSelectScopes extends StatelessWidget {
  final RelyingParty rp;
  final Set<String> selected;
  final ValueChanged<String> onToggle;

  const _StepSelectScopes(
      {required this.rp, required this.selected, required this.onToggle});

  @override
  Widget build(BuildContext context) {
    final scopes = rp.allowedScopes.isNotEmpty
        ? rp.allowedScopes
        : kScopeLabels.keys.toList();

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Select data to share with ${rp.name}',
              style: const TextStyle(
                  fontSize: 15, color: AppColors.textSecondary)),
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: scopes.map((s) {
              final label = kScopeLabels[s] ?? s;
              final active = selected.contains(s);
              return FilterChip(
                label: Text(label),
                selected: active,
                onSelected: (_) => onToggle(s),
                selectedColor: AppColors.accent,
                labelStyle: TextStyle(
                    color: active ? Colors.white : AppColors.textPrimary,
                    fontWeight: FontWeight.w500),
                checkmarkColor: Colors.white,
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}

class _StepPurpose extends StatelessWidget {
  final TextEditingController controller;
  final VoidCallback? onChanged;
  const _StepPurpose({required this.controller, this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Why are you granting this access?',
              style: TextStyle(
                  fontSize: 15, color: AppColors.textSecondary)),
          const SizedBox(height: 8),
          const Text(
            'This reason will be visible in your consent history.',
            style: TextStyle(fontSize: 12, color: AppColors.textMuted),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: controller,
            onChanged: (_) => onChanged?.call(),
            maxLines: 5,
            decoration: const InputDecoration(
              hintText: 'e.g. For KYC verification at checkout',
              border: OutlineInputBorder(),
            ),
          ),
        ],
      ),
    );
  }
}
