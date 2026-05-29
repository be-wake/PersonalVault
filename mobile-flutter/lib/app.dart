import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'core/auth/auth_provider.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/theme_provider.dart';
import 'features/auth/sign_in_screen.dart';
import 'features/auth/register_screen.dart';
import 'features/dashboard/dashboard_screen.dart';
import 'features/vault/vault_home_screen.dart';
import 'features/vault/identity_screen.dart';
import 'features/vault/address_screen.dart';
import 'features/vault/cards_screen.dart';
import 'features/vault/contacts_screen.dart';
import 'features/consents/consents_screen.dart';
import 'features/consents/grant_consent_screen.dart';
import 'features/consents/consent_detail_screen.dart';
import 'features/history/history_screen.dart';
import 'features/profile/profile_screen.dart';
import 'shared/widgets/loading_spinner.dart';

// ── Router notifier ───────────────────────────────────────────────────────────

/// Drives go_router redirects from auth state: rebuilds routes when the user
/// signs in/out and gates protected routes behind authentication.
class _RouterNotifier extends ChangeNotifier {
  void onAuthChanged() => notifyListeners();

  String? redirect(AuthState auth, GoRouterState state) {
    final location = state.matchedLocation;
    final onSplash = location == '/splash';

    // While auth is restoring from storage, show splash — never render
    // protected screens with a null user.
    if (auth.isLoading) {
      return onSplash ? null : '/splash';
    }

    // Auth finished — leave splash immediately.
    final authenticated = auth.user != null;
    if (onSplash) return authenticated ? '/' : '/auth/sign-in';

    final onAuthPage = location.startsWith('/auth');
    if (!authenticated && !onAuthPage) return '/auth/sign-in';
    if (authenticated && onAuthPage) return '/';
    return null;
  }
}

final _routerNotifierProvider =
    Provider<_RouterNotifier>((ref) {
  final notifier = _RouterNotifier();
  ref.listen<AuthState>(authProvider, (_, __) => notifier.onAuthChanged());
  ref.onDispose(notifier.dispose);
  return notifier;
});

final routerProvider = Provider<GoRouter>((ref) {
  final notifier = ref.watch(_routerNotifierProvider);

  return GoRouter(
    refreshListenable: notifier,
    redirect: (context, state) => notifier.redirect(ref.read(authProvider), state),
    initialLocation: '/splash',
    routes: [
      // Splash — shown while auth state is being restored from storage
      GoRoute(
        path: '/splash',
        builder: (_, __) => const Scaffold(
          body: LoadingSpinner(message: 'Loading…'),
        ),
      ),

      // Auth routes
      GoRoute(
        path: '/auth/sign-in',
        builder: (_, __) => const SignInScreen(),
      ),
      GoRoute(
        path: '/auth/register',
        builder: (_, __) => const RegisterScreen(),
      ),

      // Main shell with bottom tabs
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => _MainScaffold(shell: shell),
        branches: [
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/',
              builder: (_, __) => const DashboardScreen(),
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/vault',
              builder: (_, __) => const VaultHomeScreen(),
              routes: [
                GoRoute(
                    path: 'identity',
                    builder: (_, __) => const IdentityScreen()),
                GoRoute(
                    path: 'address',
                    builder: (_, __) => const AddressScreen()),
                GoRoute(
                    path: 'cards',
                    builder: (_, __) => const CardsScreen()),
                GoRoute(
                    path: 'contacts',
                    builder: (_, __) => const ContactsScreen()),
              ],
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/consents',
              builder: (_, __) => const ConsentsScreen(),
              routes: [
                GoRoute(
                    path: 'grant',
                    builder: (_, __) => const GrantConsentScreen()),
                GoRoute(
                  path: ':grantId',
                  builder: (_, state) => ConsentDetailScreen(
                      grantId: state.pathParameters['grantId']!),
                ),
              ],
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/history',
              builder: (_, __) => const HistoryScreen(),
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/profile',
              builder: (_, __) => const ProfileScreen(),
            ),
          ]),
        ],
      ),
    ],
  );
});

// ── Bottom nav scaffold ───────────────────────────────────────────────────────

class _MainScaffold extends StatelessWidget {
  final StatefulNavigationShell shell;

  const _MainScaffold({required this.shell});

  static const _tabs = [
    _Tab(Icons.dashboard_outlined, Icons.dashboard, 'Home'),
    _Tab(Icons.lock_outlined, Icons.lock, 'Vault'),
    _Tab(Icons.handshake_outlined, Icons.handshake, 'Consents'),
    _Tab(Icons.history, Icons.history, 'History'),
    _Tab(Icons.person_outline, Icons.person, 'Profile'),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: shell,
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: shell.currentIndex,
        onTap: (index) => shell.goBranch(
          index,
          initialLocation: index == shell.currentIndex,
        ),
        items: _tabs
            .map((t) => BottomNavigationBarItem(
                  icon: Icon(t.icon),
                  activeIcon: Icon(t.activeIcon),
                  label: t.label,
                ))
            .toList(),
      ),
    );
  }
}

class _Tab {
  final IconData icon;
  final IconData activeIcon;
  final String label;
  const _Tab(this.icon, this.activeIcon, this.label);
}

// ── Root app ──────────────────────────────────────────────────────────────────

/// Root-level ScaffoldMessenger key.
///
/// Keeping ScaffoldMessenger above the router prevents the
/// "Looking up a deactivated widget's ancestor is unsafe" assertion that fires
/// when a SnackBar animation finishes after its route has been popped.
final scaffoldMessengerKey = GlobalKey<ScaffoldMessengerState>();

/// Root widget: wires up theming and the go_router configuration.
class TijoriApp extends ConsumerWidget {
  const TijoriApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final themeMode = ref.watch(themeProvider);
    return MaterialApp.router(
      title: 'Tijori',
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: themeMode,
      scaffoldMessengerKey: scaffoldMessengerKey,
      routerConfig: router,
      debugShowCheckedModeBanner: false,
    );
  }
}
