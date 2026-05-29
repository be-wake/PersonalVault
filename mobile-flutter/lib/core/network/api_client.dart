import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../constants/api_constants.dart';

// Endpoint methods are grouped by feature into these part files. They are
// `extension`s on ApiClient living in the same library, so they share the
// private Dio client and token state without exposing it publicly.
part 'api_client.auth.dart';
part 'api_client.vault.dart';
part 'api_client.consents.dart';
part 'api_client.account.dart';

/// HTTP core for the PDV API.
///
/// Responsibilities kept here: building the Dio client, attaching the bearer
/// token on every request, and transparently refreshing the session (single
/// flight) when the API returns 401. The actual REST endpoints live in the
/// `api_client.*.dart` part files, grouped by feature.
class ApiClient {
  late final Dio _dio;
  final FlutterSecureStorage _storage;

  String? _accessToken;
  String? _refreshToken;
  Future<void>? _inflightRefresh;

  ApiClient(this._storage) {
    _dio = Dio(BaseOptions(
      baseUrl: kApiUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      headers: {'Content-Type': 'application/json'},
    ));

    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        _accessToken ??= await _storage.read(key: kAccessTokenKey);
        if (_accessToken != null) {
          options.headers['Authorization'] = 'Bearer $_accessToken';
        }
        handler.next(options);
      },
      onError: (error, handler) async {
        if (error.response?.statusCode == 401 &&
            !_isRefreshEndpoint(error.requestOptions.path)) {
          try {
            _inflightRefresh ??= _doRefresh().whenComplete(() {
              _inflightRefresh = null;
            });
            await _inflightRefresh;

            final opts = Options(
              method: error.requestOptions.method,
              headers: {
                ...error.requestOptions.headers,
                'Authorization': 'Bearer $_accessToken',
              },
            );
            final retried = await _dio.request(
              error.requestOptions.path,
              data: error.requestOptions.data,
              queryParameters: error.requestOptions.queryParameters,
              options: opts,
            );
            handler.resolve(retried);
          } catch (_) {
            handler.next(error);
          }
        } else {
          handler.next(error);
        }
      },
    ));
  }

  bool _isRefreshEndpoint(String path) =>
      path.contains('/auth/refresh') || path.contains('/auth/login');

  Future<void> _doRefresh() async {
    _refreshToken ??= await _storage.read(key: kRefreshTokenKey);
    if (_refreshToken == null) throw Exception('No refresh token');

    final refreshDio = Dio(BaseOptions(baseUrl: kApiUrl));
    final resp = await refreshDio.post('/auth/refresh', data: {
      'refreshToken': _refreshToken,
    });

    _accessToken = resp.data['accessToken'] as String;
    await _storage.write(key: kAccessTokenKey, value: _accessToken);

    // The server rotates the refresh token on every use (single-use tokens with
    // reuse detection). Persist the new one so the next refresh doesn't replay the
    // now-revoked token, which would revoke the whole session server-side.
    final rotated = resp.data['refreshToken'] as String?;
    if (rotated != null) {
      _refreshToken = rotated;
      await _storage.write(key: kRefreshTokenKey, value: rotated);
    }
  }

  Future<void> saveTokens(String access, String refresh) async {
    _accessToken = access;
    _refreshToken = refresh;
    await Future.wait([
      _storage.write(key: kAccessTokenKey, value: access),
      _storage.write(key: kRefreshTokenKey, value: refresh),
    ]);
  }

  Future<void> clearTokens() async {
    // Best-effort: tell the server to revoke this refresh token so it can't be
    // replayed after logout. Never block local sign-out on a network failure.
    _refreshToken ??= await _storage.read(key: kRefreshTokenKey);
    if (_refreshToken != null) {
      try {
        await Dio(BaseOptions(baseUrl: kApiUrl)).post(
          '/auth/logout',
          data: {'refreshToken': _refreshToken},
        );
      } catch (_) {/* ignore — clearing locally below is what matters */}
    }

    _accessToken = null;
    _refreshToken = null;
    await Future.wait([
      _storage.delete(key: kAccessTokenKey),
      _storage.delete(key: kRefreshTokenKey),
    ]);
  }

  Future<String?> getStoredAccessToken() => _storage.read(key: kAccessTokenKey);
}
