import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'core/auth/auth_provider.dart';
import 'core/theme/app_theme.dart';
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

class _RouterNotifier extends ChangeNotifier {
  final Ref _ref;

  _RouterNotifier(this._ref) {
    _ref.listen(authProvider, (_, __) => notifyListeners());
  }

  String? redirect(BuildContext context, GoRouterState state) {
    final auth = _ref.read(authProvider);
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
    ChangeNotifierProvider<_RouterNotifier>((ref) => _RouterNotifier(ref));

final routerProvider = Provider<GoRouter>((ref) {
  final notifier = ref.watch(_routerNotifierProvider);

  return GoRouter(
    refreshListenable: notifier,
    redirect: notifier.redirect,
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

class TijoriApp extends ConsumerWidget {
  const TijoriApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'Tijori',
      theme: AppTheme.light,
      routerConfig: router,
      debugShowCheckedModeBanner: false,
    );
  }
}
