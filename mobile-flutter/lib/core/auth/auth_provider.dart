import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../models/user.dart';
import '../network/api_client.dart';

// ApiClient's endpoint methods are extensions split across api_client.*.dart
// part files. Re-export the library so any consumer of `apiClientProvider`
// gets those extension methods in scope without importing the path directly.
export '../network/api_client.dart';

// ── Providers ────────────────────────────────────────────────────────────────

final storageProvider = Provider<FlutterSecureStorage>((ref) {
  return const FlutterSecureStorage();
});

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(ref.watch(storageProvider));
});

final authProvider =
    StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(ref.watch(apiClientProvider));
});

// ── State ─────────────────────────────────────────────────────────────────────

/// Immutable auth state. `isLoading` is true while the session is being
/// restored from storage on startup.
class AuthState {
  final User? user;
  final bool isLoading;
  final String? error;

  const AuthState({this.user, this.isLoading = false, this.error});

  AuthState copyWith({User? user, bool? isLoading, String? error}) => AuthState(
        user: user ?? this.user,
        isLoading: isLoading ?? this.isLoading,
        error: error,
      );
}

// ── Notifier ──────────────────────────────────────────────────────────────────

/// Owns the auth lifecycle: restore-on-launch, login, register, and logout,
/// keeping tokens in [ApiClient] in sync with [AuthState].
class AuthNotifier extends StateNotifier<AuthState> {
  final ApiClient _api;

  AuthNotifier(this._api) : super(const AuthState(isLoading: true)) {
    _restore();
  }

  Future<void> _restore() async {
    final token = await _api.getStoredAccessToken();
    if (token == null) {
      state = const AuthState();
      return;
    }
    try {
      final data = await _api.getMe();
      state = AuthState(user: User.fromJson(data['user'] as Map<String, dynamic>));
    } catch (_) {
      await _api.clearTokens();
      state = const AuthState();
    }
  }

  Future<void> login(String email, String password) async {
    state = const AuthState(isLoading: true);
    try {
      final data = await _api.login(email, password);
      final accessToken  = data['accessToken']  as String?;
      final refreshToken = data['refreshToken'] as String?;
      if (accessToken == null) throw Exception('Server did not return an access token.');
      await _api.saveTokens(accessToken, refreshToken ?? '');
      state = AuthState(user: User.fromJson(data['user'] as Map<String, dynamic>));
    } on DioException catch (e) {
      state = AuthState(error: _extractError(e));
    } catch (e) {
      state = AuthState(error: e.toString());
    }
  }

  Future<void> register(String name, String email, String password) async {
    state = const AuthState(isLoading: true);
    try {
      final data = await _api.register(name, email, password);
      final accessToken  = data['accessToken']  as String?;
      final refreshToken = data['refreshToken'] as String?;
      if (accessToken == null) throw Exception('Server did not return an access token.');
      await _api.saveTokens(accessToken, refreshToken ?? '');
      state = AuthState(user: User.fromJson(data['user'] as Map<String, dynamic>));
    } on DioException catch (e) {
      state = AuthState(error: _extractError(e));
    } catch (e) {
      state = AuthState(error: e.toString());
    }
  }

  Future<void> updateName(String name) async {
    final data = await _api.updateName(name);
    final newName = data['name'] as String;
    if (state.user != null) {
      state = state.copyWith(
        user: User(
          id: state.user!.id,
          email: state.user!.email,
          name: newName,
          createdAt: state.user!.createdAt,
        ),
      );
    }
  }

  Future<void> logout() async {
    await _api.clearTokens();
    state = const AuthState();
  }

  String _extractError(DioException e) {
    final data = e.response?.data;

    // Backend envelope: { "error": { "code": "...", "message": "..." } }
    if (data is Map) {
      final inner = data['error'];
      if (inner is Map && inner['message'] is String) {
        return inner['message'] as String;
      }
      // Some endpoints return a flat { "message": "..." }
      if (data['message'] is String) return data['message'] as String;
    }
    // Plain string body (rare)
    if (data is String && data.isNotEmpty && data.length < 200) return data;

    // Never expose the raw Dio technical message — map by status code instead.
    return switch (e.response?.statusCode) {
      400 => 'Invalid request. Please check your input.',
      401 => 'Invalid email or password.',
      403 => 'Access denied.',
      404 => 'Not found.',
      409 => 'An account with this email already exists.',
      422 => 'Invalid data provided.',
      500 || 502 || 503 => 'Server error. Please try again later.',
      _ when e.type == DioExceptionType.connectionTimeout ||
            e.type == DioExceptionType.receiveTimeout =>
        'Request timed out. Check your connection.',
      _ when e.type == DioExceptionType.connectionError =>
        'Cannot reach the server. Check your connection.',
      _ => 'Something went wrong. Please try again.',
    };
  }
}
