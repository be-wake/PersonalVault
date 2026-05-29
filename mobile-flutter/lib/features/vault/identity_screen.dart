import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/models/identity.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/utils/error_utils.dart';
import '../../shared/widgets/app_button.dart';
import '../../shared/widgets/app_card.dart';
import '../../shared/widgets/app_input.dart';
import '../../shared/widgets/app_toast.dart';
import '../../shared/widgets/confirm_dialog.dart';
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

// Icon per document type
IconData _iconForType(String type) => switch (type.toLowerCase()) {
      'passport' => Icons.menu_book_outlined,
      'pan' => Icons.credit_card_outlined,
      'driving licence' => Icons.directions_car_outlined,
      'voter id' => Icons.how_to_vote_outlined,
      _ => Icons.badge_outlined,
    };

// Accent colour per document type
Color _colorForType(String type) => switch (type.toLowerCase()) {
      'passport' => const Color(0xFF1565C0),
      'pan' => const Color(0xFF2E7D32),
      'driving licence' => const Color(0xFF6A1B9A),
      'voter id' => const Color(0xFFE65100),
      'aadhaar' => AppColors.accent,
      _ => AppColors.accentDark,
    };

// ── Image helpers ────────────────────────────────────────────────────────────

Future<Directory> _imgDir() async {
  final base = await getApplicationDocumentsDirectory();
  final dir = Directory('${base.path}/identity_images');
  if (!await dir.exists()) await dir.create(recursive: true);
  return dir;
}

Future<File?> _loadImage(String docId, String side) async {
  final dir = await _imgDir();
  final f = File('${dir.path}/${docId}_$side.jpg');
  return await f.exists() ? f : null;
}

Future<File> _saveImage(String docId, String side, XFile picked) async {
  final dir = await _imgDir();
  final dest = File('${dir.path}/${docId}_$side.jpg');
  await File(picked.path).copy(dest.path);
  return dest;
}

Future<void> _deleteImage(String docId, String side) async {
  final dir = await _imgDir();
  final f = File('${dir.path}/${docId}_$side.jpg');
  if (await f.exists()) await f.delete();
}

// ── Screen ───────────────────────────────────────────────────────────────────

/// Manages common identity info and government-ID documents.
class IdentityScreen extends ConsumerStatefulWidget {
  const IdentityScreen({super.key});

  @override
  ConsumerState<IdentityScreen> createState() => _IdentityScreenState();
}

class _IdentityScreenState extends ConsumerState<IdentityScreen>
    with ToastHostMixin {
  bool _showForm = false;
  String _selectedType = _idTypes.first;
  final _numberCtrl = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _numberCtrl.dispose();
    super.dispose();
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
      showToast('Document added');
    } catch (e) {
      showToast(friendlyError(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _deleteDocument(String docId) async {
    final confirmed = await showConfirmDialog(context, title: 'Delete document?');
    if (!confirmed) return;
    try {
      final api = ref.read(apiClientProvider);
      final userId = ref.read(authProvider).user!.id;
      await api.deleteDocument(userId, docId);
      // Clean up local images
      await _deleteImage(docId, 'front');
      await _deleteImage(docId, 'back');
      ref.invalidate(_identityProvider);
      showToast('Document deleted');
    } catch (e) {
      showToast(friendlyError(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final identityAsync = ref.watch(_identityProvider);

    return Scaffold(

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
                  // ── Add form ──────────────────────────────────────────────
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
                            decoration:
                                const InputDecoration(labelText: 'ID Type'),
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
                          Row(children: [
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
                          ]),
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

                  // ── Document cards ────────────────────────────────────────
                  ...identity.documents.map(
                    (doc) => Padding(
                      padding: const EdgeInsets.only(bottom: 16),
                      child: _DocumentCard(
                        doc: doc,
                        onDelete: () => _deleteDocument(doc.id),
                        onToast: showToast,
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

          // ── Toast ─────────────────────────────────────────────────────────
          toastOverlay(),
        ],
      ),
    );
  }
}

// ── Document card ─────────────────────────────────────────────────────────────

class _DocumentCard extends StatefulWidget {
  final IdentityDocument doc;
  final VoidCallback onDelete;
  final void Function(String) onToast;

  const _DocumentCard({
    required this.doc,
    required this.onDelete,
    required this.onToast,
  });

  @override
  State<_DocumentCard> createState() => _DocumentCardState();
}

class _DocumentCardState extends State<_DocumentCard> {
  bool _revealed = false;
  File? _frontImage;
  File? _backImage;
  bool _loadingImages = true;

  @override
  void initState() {
    super.initState();
    _loadImages();
  }

  Future<void> _loadImages() async {
    final front = await _loadImage(widget.doc.id, 'front');
    final back = await _loadImage(widget.doc.id, 'back');
    if (mounted) {
      setState(() {
        _frontImage = front;
        _backImage = back;
        _loadingImages = false;
      });
    }
  }

  Future<void> _pickImage(String side) async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 16),
            ListTile(
              leading:
                  const Icon(Icons.camera_alt_outlined, color: AppColors.accent),
              title: const Text('Take Photo'),
              onTap: () => Navigator.pop(ctx, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined,
                  color: AppColors.accent),
              title: const Text('Choose from Gallery'),
              onTap: () => Navigator.pop(ctx, ImageSource.gallery),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );

    if (source == null) return;

    try {
      final picker = ImagePicker();
      final picked = await picker.pickImage(
        source: source,
        imageQuality: 85,
        maxWidth: 1200,
      );
      if (picked == null) return;

      final saved = await _saveImage(widget.doc.id, side, picked);
      if (mounted) {
        setState(() {
          if (side == 'front') {
            _frontImage = saved;
          } else {
            _backImage = saved;
          }
        });
        widget.onToast('${side == 'front' ? 'Front' : 'Back'} image saved');
      }
    } catch (e) {
      if (mounted) widget.onToast('Failed to save image');
    }
  }

  Future<void> _removeImage(String side) async {
    await _deleteImage(widget.doc.id, side);
    if (mounted) {
      setState(() {
        if (side == 'front') {
          _frontImage = null;
        } else {
          _backImage = null;
        }
      });
    }
  }

  String _maskedNumber(String number) {
    if (number.length <= 4) return number;
    final visible = number.substring(number.length - 4);
    final hidden = '●' * (number.length - 4);
    // Group for readability
    return '${hidden.replaceAllMapped(RegExp(r'.{1,4}'), (m) => '${m.group(0)} ').trim()} $visible';
  }

  @override
  Widget build(BuildContext context) {
    final color = _colorForType(widget.doc.idType);
    final icon = _iconForType(widget.doc.idType);
    final number = widget.doc.idNumber;

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Header ───────────────────────────────────────────────────────
          Row(children: [
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(icon, color: color, size: 16),
                  const SizedBox(width: 6),
                  Text(
                    widget.doc.idType,
                    style: TextStyle(
                        color: color,
                        fontWeight: FontWeight.w700,
                        fontSize: 14),
                  ),
                ],
              ),
            ),
            const Spacer(),
            IconButton(
              icon: const Icon(Icons.delete_outline,
                  color: AppColors.danger, size: 20),
              onPressed: widget.onDelete,
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(),
            ),
          ]),

          const SizedBox(height: 14),
          const Divider(height: 1),
          const SizedBox(height: 14),

          // ── ID Number row ─────────────────────────────────────────────────
          Row(children: [
            const Text('ID Number',
                style: TextStyle(
                    fontSize: 12,
                    color: AppColors.textMuted,
                    fontWeight: FontWeight.w500)),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                _revealed ? number : _maskedNumber(number),
                style: TextStyle(
                  fontSize: 14,
                  color: AppColors.textPrimary,
                  fontWeight: FontWeight.w600,
                  fontFamily: _revealed ? null : 'monospace',
                  letterSpacing: _revealed ? 1.2 : 0,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 8),
            GestureDetector(
              onTap: () => setState(() => _revealed = !_revealed),
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(6),
                  border:
                      Border.all(color: color.withValues(alpha: 0.2)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      _revealed
                          ? Icons.visibility_off_outlined
                          : Icons.visibility_outlined,
                      size: 14,
                      color: color,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      _revealed ? 'Hide' : 'Show',
                      style: TextStyle(
                          fontSize: 12,
                          color: color,
                          fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
            ),
          ]),

          const SizedBox(height: 16),

          // ── Document images ───────────────────────────────────────────────
          Row(children: [
            Expanded(
              child: _ImageTile(
                label: 'Front',
                image: _frontImage,
                loading: _loadingImages,
                accentColor: color,
                onPick: () => _pickImage('front'),
                onRemove: () => _removeImage('front'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _ImageTile(
                label: 'Back',
                image: _backImage,
                loading: _loadingImages,
                accentColor: color,
                onPick: () => _pickImage('back'),
                onRemove: () => _removeImage('back'),
              ),
            ),
          ]),
        ],
      ),
    );
  }
}

// ── Image tile ────────────────────────────────────────────────────────────────

class _ImageTile extends StatelessWidget {
  final String label;
  final File? image;
  final bool loading;
  final Color accentColor;
  final VoidCallback onPick;
  final VoidCallback onRemove;

  const _ImageTile({
    required this.label,
    required this.image,
    required this.loading,
    required this.accentColor,
    required this.onPick,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: const TextStyle(
                fontSize: 12,
                color: AppColors.textMuted,
                fontWeight: FontWeight.w500)),
        const SizedBox(height: 6),
        GestureDetector(
          onTap: onPick,
          child: Container(
            height: 100,
            width: double.infinity,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              color: loading
                  ? AppColors.background
                  : image != null
                      ? null
                      : accentColor.withValues(alpha: 0.04),
              border: Border.all(
                color: image != null
                    ? accentColor.withValues(alpha: 0.3)
                    : accentColor.withValues(alpha: 0.2),
                width: image != null ? 1.5 : 1,
                strokeAlign: BorderSide.strokeAlignInside,
              ),
              image: image != null
                  ? DecorationImage(
                      image: FileImage(image!),
                      fit: BoxFit.cover,
                    )
                  : null,
            ),
            child: loading
                ? const Center(
                    child: SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2)))
                : image != null
                    ? Align(
                        alignment: Alignment.topRight,
                        child: Padding(
                          padding: const EdgeInsets.all(6),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              _ImageAction(
                                icon: Icons.edit_outlined,
                                onTap: onPick,
                              ),
                              const SizedBox(width: 4),
                              _ImageAction(
                                icon: Icons.delete_outline,
                                onTap: onRemove,
                                danger: true,
                              ),
                            ],
                          ),
                        ),
                      )
                    : Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.add_photo_alternate_outlined,
                              color: accentColor.withValues(alpha: 0.5),
                              size: 26),
                          const SizedBox(height: 4),
                          Text(
                            'Add $label',
                            style: TextStyle(
                                fontSize: 11,
                                color: accentColor.withValues(alpha: 0.6),
                                fontWeight: FontWeight.w500),
                          ),
                        ],
                      ),
          ),
        ),
      ],
    );
  }
}

class _ImageAction extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  final bool danger;

  const _ImageAction(
      {required this.icon, required this.onTap, this.danger = false});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(5),
        decoration: BoxDecoration(
          color: danger
              ? AppColors.danger.withValues(alpha: 0.85)
              : Colors.black54,
          borderRadius: BorderRadius.circular(6),
        ),
        child: Icon(icon, size: 14, color: Colors.white),
      ),
    );
  }
}
