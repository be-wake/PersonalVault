import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/models/payment.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/utils/error_utils.dart';
import '../../shared/widgets/app_button.dart';
import '../../shared/widgets/app_card.dart';
import '../../shared/widgets/app_input.dart';
import '../../shared/widgets/loading_spinner.dart';

// ── Expiry formatter ──────────────────────────────────────────────────────────
// Strips non-digits, then auto-inserts "/" after the 2nd digit.
// Result is always at most 5 chars: MM/YY.

class _ExpiryFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
      TextEditingValue oldValue, TextEditingValue newValue) {
    // Keep only digits
    final digits = newValue.text.replaceAll(RegExp(r'[^\d]'), '');
    final capped = digits.length > 4 ? digits.substring(0, 4) : digits;

    final String formatted;
    if (capped.length <= 2) {
      formatted = capped;
    } else {
      formatted = '${capped.substring(0, 2)}/${capped.substring(2)}';
    }

    return TextEditingValue(
      text: formatted,
      selection: TextSelection.collapsed(offset: formatted.length),
    );
  }
}

// ── Card visuals ──────────────────────────────────────────────────────────────

const _cardTypes = ['Visa', 'Mastercard', 'Amex', 'Rupay', 'Other'];

const _cardColors = {
  'visa': Color(0xFF1A1F71),       // Visa deep blue
  'mastercard': Color(0xFFEB001B), // Mastercard red
  'amex': Color(0xFF2E77BC),       // Amex blue
  'rupay': Color(0xFF00529B),      // RuPay blue
  'other': AppColors.accentDark,
};

Color _colorFor(String? type) =>
    _cardColors[(type ?? '').toLowerCase()] ?? AppColors.accentDark;

// ── Provider ──────────────────────────────────────────────────────────────────

final _cardsProvider =
    FutureProvider.autoDispose<List<PaymentCard>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final userId = ref.watch(authProvider).user!.id;
  final data = await api.getCards(userId);
  return data
      .map((c) => PaymentCard.fromJson(c as Map<String, dynamic>))
      .toList();
});

// ── Screen ────────────────────────────────────────────────────────────────────

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
  final _nickname = TextEditingController();
  bool _saving = false;
  String? _toast;

  @override
  void dispose() {
    _last4.dispose();
    _expiry.dispose();
    _nickname.dispose();
    super.dispose();
  }

  void _showToast(String msg) {
    setState(() => _toast = msg);
    Future.delayed(const Duration(seconds: 3), () {
      if (mounted) setState(() => _toast = null);
    });
  }

  void _resetForm() {
    _selectedType = _cardTypes.first;
    _last4.clear();
    _expiry.clear();
    _nickname.clear();
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
        if (_nickname.text.trim().isNotEmpty) 'nickname': _nickname.text.trim(),
      });
      _resetForm();
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
        content: const Text('This action cannot be undone.'),
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
                  // ── Add form ────────────────────────────────────────────
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
                            inputFormatters: [
                              FilteringTextInputFormatter.digitsOnly,
                              LengthLimitingTextInputFormatter(4),
                            ],
                          ),
                          const SizedBox(height: 12),
                          AppInput(
                            label: 'Expiry',
                            hint: 'MM/YY',
                            controller: _expiry,
                            keyboardType: TextInputType.number,
                            inputFormatters: [_ExpiryFormatter()],
                          ),
                          const SizedBox(height: 12),
                          AppInput(
                            label: 'Nickname (optional)',
                            hint: 'e.g. Main HDFC, Travel card',
                            controller: _nickname,
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

                  // ── Card list ───────────────────────────────────────────
                  ...cards.map((card) => Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: _CardTile(
                          card: card,
                          onDelete: () => _deleteCard(card.id),
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

          // ── Toast ──────────────────────────────────────────────────────
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

// ── Card tile ─────────────────────────────────────────────────────────────────

class _CardTile extends StatelessWidget {
  final PaymentCard card;
  final VoidCallback onDelete;

  const _CardTile({required this.card, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    final color = _colorFor(card.cardType);
    final typeName = _capitalise(card.cardType ?? 'Card');

    return AppCard(
      child: Row(
        children: [
          // Coloured icon badge
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(Icons.credit_card, color: color, size: 22),
          ),
          const SizedBox(width: 14),

          // Card details
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Nickname or type + masked number
                Text(
                  card.nickname != null && card.nickname!.isNotEmpty
                      ? card.nickname!
                      : '$typeName •••• ${card.last4}',
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 15,
                    color: color,
                  ),
                ),
                // If nickname shown, show type + number as subtitle
                if (card.nickname != null && card.nickname!.isNotEmpty)
                  Text(
                    '$typeName •••• ${card.last4}',
                    style: const TextStyle(
                        fontSize: 13, color: AppColors.textSecondary),
                  ),
                if (card.expiryMmYy != null)
                  Text(
                    'Exp ${card.expiryMmYy}',
                    style: const TextStyle(
                        fontSize: 12, color: AppColors.textMuted),
                  ),
              ],
            ),
          ),

          // Delete button
          IconButton(
            icon: const Icon(Icons.delete_outline,
                color: AppColors.danger, size: 20),
            onPressed: onDelete,
          ),
        ],
      ),
    );
  }

  String _capitalise(String s) =>
      s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);
}
