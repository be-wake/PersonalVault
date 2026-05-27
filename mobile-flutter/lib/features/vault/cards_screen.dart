import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/models/payment.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/utils/error_utils.dart';
import '../../shared/widgets/app_button.dart';
import '../../shared/widgets/app_card.dart';
import '../../shared/widgets/app_input.dart';
import '../../shared/widgets/loading_spinner.dart';

final _cardsProvider =
    FutureProvider.autoDispose<List<PaymentCard>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final userId = ref.watch(authProvider).user!.id;
  final data = await api.getCards(userId);
  return data.map((c) => PaymentCard.fromJson(c as Map<String, dynamic>)).toList();
});

const _cardTypes = ['Visa', 'Mastercard', 'Amex', 'Rupay', 'Other'];

const _cardEmoji = {
  'Visa': 'ðŸ’³',
  'Mastercard': 'ðŸ”´',
  'Amex': 'ðŸŸ¦',
  'Rupay': 'ðŸ‡®ðŸ‡³',
  'Other': 'ðŸ’³',
};

class CardsScreen extends ConsumerStatefulWidget {
  const CardsScreen({super.key});

  @override
  ConsumerState<CardsScreen> createState() => _CardsScreenState();
}

class _CardsScreenState extends ConsumerState<CardsScreen> {
  bool _showForm = false;
  String _selectedType = _cardTypes.first;
  final _last4 = TextEditingController();
  final _expiry = TextEditingController();
  bool _saving = false;
  String? _toast;

  @override
  void dispose() {
    _last4.dispose();
    _expiry.dispose();
    super.dispose();
  }

  void _showToast(String msg) {
    setState(() => _toast = msg);
    Future.delayed(const Duration(seconds: 3), () {
      if (mounted) setState(() => _toast = null);
    });
  }

  Future<void> _addCard() async {
    if (_last4.text.length != 4 || !RegExp(r'^\d{4}$').hasMatch(_last4.text)) {
      _showToast('Last 4 digits must be exactly 4 numbers');
      return;
    }
    if (!RegExp(r'^\d{2}/\d{2}$').hasMatch(_expiry.text)) {
      _showToast('Expiry must be MM/YY');
      return;
    }
    setState(() => _saving = true);
    try {
      final api = ref.read(apiClientProvider);
      final userId = ref.read(authProvider).user!.id;
      await api.addCard(userId, {
        'cardType': _selectedType,
        'last4': _last4.text,
        'expiryMmYy': _expiry.text,
      });
      _last4.clear();
      _expiry.clear();
      setState(() => _showForm = false);
      ref.invalidate(_cardsProvider);
      _showToast('Card added');
    } catch (e) {
      _showToast(friendlyError(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _deleteCard(String cardId) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove card?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Remove',
                  style: TextStyle(color: AppColors.danger))),
        ],
      ),
    );
    if (ok != true) return;
    try {
      final api = ref.read(apiClientProvider);
      final userId = ref.read(authProvider).user!.id;
      await api.deleteCard(userId, cardId);
      ref.invalidate(_cardsProvider);
      _showToast('Card removed');
    } catch (e) {
      _showToast(friendlyError(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final cardsAsync = ref.watch(_cardsProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Payment Cards')),
      body: Stack(
        children: [
          cardsAsync.when(
            loading: () => const LoadingSpinner(message: 'Loading...'),
            error: (e, _) => Center(
                child: Text(friendlyError(e),
                    style: const TextStyle(color: AppColors.danger))),
            data: (cards) => RefreshIndicator(
              color: AppColors.accent,
              onRefresh: () async => ref.invalidate(_cardsProvider),
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (_showForm) ...[
                    AppCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Add Card',
                              style: TextStyle(
                                  fontWeight: FontWeight.w600, fontSize: 16)),
                          const SizedBox(height: 16),
                          DropdownButtonFormField<String>(
                            initialValue: _selectedType,
                            decoration:
                                const InputDecoration(labelText: 'Card Type'),
                            items: _cardTypes
                                .map((t) => DropdownMenuItem(
                                    value: t, child: Text(t)))
                                .toList(),
                            onChanged: (v) =>
                                setState(() => _selectedType = v!),
                          ),
                          const SizedBox(height: 12),
                          AppInput(
                            label: 'Last 4 digits',
                            hint: '1234',
                            controller: _last4,
                            keyboardType: TextInputType.number,
                          ),
                          const SizedBox(height: 12),
                          AppInput(
                            label: 'Expiry',
                            hint: 'MM/YY',
                            controller: _expiry,
                            keyboardType: TextInputType.datetime,
                          ),
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
                                  title: 'Add',
                                  onPressed: _saving ? null : _addCard,
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
                        title: 'Add Card',
                        variant: AppButtonVariant.secondary,
                        onPressed: () => setState(() => _showForm = true)),
                  const SizedBox(height: 16),
                  ...cards.map((card) => Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: AppCard(
                          child: Row(
                            children: [
                              Text(
                                _cardEmoji[card.cardType] ?? 'ðŸ’³',
                                style: const TextStyle(fontSize: 28),
                              ),
                              const SizedBox(width: 14),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      '${card.cardType ?? 'Card'} Â·Â·Â·Â· ${card.last4}',
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w600,
                                          color: AppColors.textPrimary),
                                    ),
                                    if (card.expiryMmYy != null)
                                      Text('Exp ${card.expiryMmYy}',
                                          style: const TextStyle(
                                              color: AppColors.textSecondary,
                                              fontSize: 13)),
                                  ],
                                ),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete_outline,
                                    color: AppColors.danger, size: 20),
                                onPressed: () => _deleteCard(card.id),
                              ),
                            ],
                          ),
                        ),
                      )),
                  if (cards.isEmpty && !_showForm)
                    const Center(
                      child: Padding(
                        padding: EdgeInsets.symmetric(vertical: 32),
                        child: Text('No cards yet',
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
