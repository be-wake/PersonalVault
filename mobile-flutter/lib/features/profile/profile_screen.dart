import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/theme_provider.dart';
import '../../shared/utils/error_utils.dart';
import '../../shared/widgets/app_button.dart';
import '../../shared/widgets/app_card.dart';

// ── Profile photo file path ───────────────────────────────────────────────────

Future<File> _profilePhotoFile() async {
  final dir = await getApplicationDocumentsDirectory();
  return File('${dir.path}/profile_photo.jpg');
}

// ── Screen ────────────────────────────────────────────────────────────────────

/// Profile screen: name edit, theme toggle, data export, account deletion, logout.
class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  File? _profilePhoto;
  bool _loadingPhoto = true;
  final TextEditingController _nameController = TextEditingController();
  final FocusNode _nameFocusNode = FocusNode();
  bool _isEditingName = false;
  bool _savingName = false;

  @override
  void initState() {
    super.initState();
    _loadPhoto();
    _nameFocusNode.addListener(() {
      if (!_nameFocusNode.hasFocus && _isEditingName) {
        _saveNameInline();
      }
    });
  }

  @override
  void dispose() {
    _nameController.dispose();
    _nameFocusNode.dispose();
    super.dispose();
  }

  Future<void> _loadPhoto() async {
    final f = await _profilePhotoFile();
    if (mounted) {
      setState(() {
        _profilePhoto = f.existsSync() ? f : null;
        _loadingPhoto = false;
      });
    }
  }

  Future<void> _pickPhoto() async {
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
            const SizedBox(height: 12),
            ListTile(
              leading: const Icon(Icons.camera_alt_outlined,
                  color: AppColors.accent),
              title: const Text('Take Photo'),
              onTap: () => Navigator.pop(ctx, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined,
                  color: AppColors.accent),
              title: const Text('Choose from Gallery'),
              onTap: () => Navigator.pop(ctx, ImageSource.gallery),
            ),
            if (_profilePhoto != null)
              ListTile(
                leading: const Icon(Icons.delete_outline,
                    color: AppColors.danger),
                title: const Text('Remove Photo',
                    style: TextStyle(color: AppColors.danger)),
                onTap: () => Navigator.pop(ctx, null),
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );

    // null means remove (only shown when photo exists)
    if (source == null && _profilePhoto != null) {
      // User tapped "Remove Photo"
      await _profilePhoto!.delete();
      if (mounted) setState(() => _profilePhoto = null);
      return;
    }
    if (source == null) return;

    try {
      final picker = ImagePicker();
      final picked = await picker.pickImage(
        source: source,
        imageQuality: 80,
        maxWidth: 800,
      );
      if (picked == null) return;

      final dest = await _profilePhotoFile();
      await File(picked.path).copy(dest.path);
      if (mounted) setState(() => _profilePhoto = dest);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to save photo')),
        );
      }
    }
  }

  void _startInlineNameEdit() {
    final user = ref.read(authProvider).user!;
    _nameController
      ..text = user.name
      ..selection = TextSelection.collapsed(offset: user.name.length);
    setState(() => _isEditingName = true);
    _nameFocusNode.requestFocus();
  }

  Future<void> _saveNameInline() async {
    final user = ref.read(authProvider).user!;
    final newName = _nameController.text.trim();
    if (mounted) setState(() => _isEditingName = false);

    if (newName.isEmpty || newName == user.name) {
      _nameController.text = user.name;
      return;
    }

    if (mounted) setState(() => _savingName = true);
    try {
      await ref.read(authProvider.notifier).updateName(newName);
    } catch (e) {
      _nameController.text = user.name;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text(friendlyError(e)),
              backgroundColor: AppColors.danger),
        );
      }
    } finally {
      if (mounted) setState(() => _savingName = false);
    }
  }

  Future<void> _exportData() async {
    try {
      await ref.read(apiClientProvider).exportData();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Your data export is ready')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text(friendlyError(e)),
              backgroundColor: AppColors.danger),
        );
      }
    }
  }

  Future<void> _confirmDelete() async {
    await showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Account'),
        content: const Text(
            'Account deletion requires step-up authentication. Feature coming soon.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('OK')),
        ],
      ),
    );
  }

  Future<void> _signOut() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign out?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Sign Out')),
        ],
      ),
    );
    if (ok == true) {
      await ref.read(authProvider.notifier).logout();
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user!;
    final themeMode = ref.watch(themeProvider);

    if (!_isEditingName && _nameController.text != user.name) {
      _nameController.text = user.name;
    }

    return Scaffold(

      appBar: AppBar(title: const Text('Profile')),
      body: GestureDetector(
        behavior: HitTestBehavior.translucent,
        onTap: () => FocusScope.of(context).unfocus(),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
          children: [
            // ── Avatar ──────────────────────────────────────────────────────
            Stack(
              children: [
                GestureDetector(
                  onTap: _pickPhoto,
                  child: _loadingPhoto
                      ? const CircleAvatar(
                          radius: 44,
                          backgroundColor: AppColors.accentLight,
                          child: SizedBox(
                            width: 24,
                            height: 24,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        )
                      : CircleAvatar(
                          radius: 44,
                          backgroundColor: AppColors.accentLight,
                          backgroundImage: _profilePhoto != null
                              ? FileImage(_profilePhoto!)
                              : null,
                          child: _profilePhoto == null
                              ? Text(
                                  user.name.isNotEmpty
                                      ? user.name[0].toUpperCase()
                                      : '?',
                                  style: const TextStyle(
                                      fontSize: 32,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.accent),
                                )
                              : null,
                        ),
                ),
                Positioned(
                  bottom: 0,
                  right: 0,
                  child: GestureDetector(
                    onTap: _pickPhoto,
                    child: Container(
                      padding: const EdgeInsets.all(6),
                      decoration: const BoxDecoration(
                        color: AppColors.accent,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.camera_alt,
                          color: Colors.white, size: 14),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // ── Name + email ────────────────────────────────────────────────
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _isEditingName
                    ? SizedBox(
                        width: 220,
                        child: TextField(
                          controller: _nameController,
                          focusNode: _nameFocusNode,
                          autofocus: true,
                          textAlign: TextAlign.center,
                          textInputAction: TextInputAction.done,
                          onSubmitted: (_) =>
                              FocusScope.of(context).unfocus(),
                          style: const TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.w700,
                              color: AppColors.textPrimary),
                          decoration: const InputDecoration(
                            isDense: true,
                            contentPadding:
                                EdgeInsets.symmetric(vertical: 4),
                            border: UnderlineInputBorder(),
                          ),
                        ),
                      )
                    : GestureDetector(
                        onTap: _startInlineNameEdit,
                        child: Text(user.name,
                            style: const TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w700,
                                color: AppColors.textPrimary)),
                      ),
                const SizedBox(width: 6),
                _savingName
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : GestureDetector(
                        onTap: _startInlineNameEdit,
                        child: const Icon(Icons.edit_outlined,
                            size: 18, color: AppColors.textMuted),
                      ),
              ],
            ),
            const SizedBox(height: 2),
            Text(user.email,
                style: const TextStyle(
                    color: AppColors.textSecondary, fontSize: 14)),
            if (user.createdAt != null) ...[
              const SizedBox(height: 4),
              Text(
                'Member since ${_fmtDate(user.createdAt!)}',
                style: const TextStyle(
                    color: AppColors.textMuted, fontSize: 12),
              ),
            ],
            const SizedBox(height: 24),

            // ── Account section ──────────────────────────────────────────────
            _SectionCard(
              title: 'Account',
              children: [
                _InfoRow(label: 'Email', value: user.email),
                _InfoRow(
                    label: 'User ID',
                    value: '${user.id.substring(0, 8)}…'),
              ],
            ),
            const SizedBox(height: 12),

            // ── Appearance section ───────────────────────────────────────────
            _SectionCard(
              title: 'Appearance',
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Theme',
                          style: TextStyle(
                              color: AppColors.textMuted, fontSize: 13)),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          _ThemeChip(
                            label: 'Light',
                            icon: Icons.light_mode_outlined,
                            selected: themeMode == ThemeMode.light,
                            onTap: () => ref
                                .read(themeProvider.notifier)
                                .setMode(ThemeMode.light),
                          ),
                          const SizedBox(width: 8),
                          _ThemeChip(
                            label: 'Dark',
                            icon: Icons.dark_mode_outlined,
                            selected: themeMode == ThemeMode.dark,
                            onTap: () => ref
                                .read(themeProvider.notifier)
                                .setMode(ThemeMode.dark),
                          ),
                          const SizedBox(width: 8),
                          _ThemeChip(
                            label: 'System',
                            icon: Icons.brightness_auto_outlined,
                            selected: themeMode == ThemeMode.system,
                            onTap: () => ref
                                .read(themeProvider.notifier)
                                .setMode(ThemeMode.system),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // ── Privacy section ──────────────────────────────────────────────
            _SectionCard(
              title: 'Privacy',
              children: [
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.download_outlined,
                      color: AppColors.accent),
                  title: const Text('Export My Data'),
                  subtitle: const Text('Download all vault data as JSON'),
                  onTap: _exportData,
                ),
              ],
            ),
            const SizedBox(height: 12),

            // ── Danger zone ──────────────────────────────────────────────────
            _SectionCard(
              title: 'Danger Zone',
              children: [
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.warning_amber_outlined,
                      color: AppColors.danger),
                  title: const Text('Delete Account',
                      style: TextStyle(color: AppColors.danger)),
                  subtitle:
                      const Text('Permanently delete account and data'),
                  onTap: _confirmDelete,
                ),
              ],
            ),
            const SizedBox(height: 24),

            AppButton(
              title: 'Sign Out',
              variant: AppButtonVariant.secondary,
              onPressed: _signOut,
            ),
          ],
          ),
        ),
      ),
    );
  }

  String _fmtDate(String iso) {
    try {
      final dt = DateTime.parse(iso).toLocal();
      const months = [
        '',
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
      ];
      return '${months[dt.month]} ${dt.year}';
    } catch (_) {
      return iso;
    }
  }
}

// ── Theme chip ────────────────────────────────────────────────────────────────

class _ThemeChip extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  const _ThemeChip({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? AppColors.accent : AppColors.background,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: selected ? AppColors.accent : AppColors.border,
            width: selected ? 2 : 1,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon,
                size: 15,
                color:
                    selected ? Colors.white : AppColors.textSecondary),
            const SizedBox(width: 5),
            Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color:
                    selected ? Colors.white : AppColors.textSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Section card ──────────────────────────────────────────────────────────────

class _SectionCard extends StatelessWidget {
  final String title;
  final List<Widget> children;

  const _SectionCard({required this.title, required this.children});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 8),
          child: Text(title,
              style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                  color: AppColors.textSecondary)),
        ),
        AppCard(child: Column(children: children)),
      ],
    );
  }
}

// ── Info row ──────────────────────────────────────────────────────────────────

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          SizedBox(
            width: 80,
            child: Text(label,
                style: const TextStyle(
                    color: AppColors.textMuted, fontSize: 13)),
          ),
          Expanded(
            child: Text(value,
                style: const TextStyle(
                    color: AppColors.textPrimary, fontSize: 13)),
          ),
        ],
      ),
    );
  }
}
