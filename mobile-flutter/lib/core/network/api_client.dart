import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../constants/api_constants.dart';

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
    _accessToken = null;
    _refreshToken = null;
    await Future.wait([
      _storage.delete(key: kAccessTokenKey),
      _storage.delete(key: kRefreshTokenKey),
    ]);
  }

  Future<String?> getStoredAccessToken() => _storage.read(key: kAccessTokenKey);

  // ── Auth ────────────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> login(String email, String password) async {
    final resp = await _dio.post('/auth/login', data: {
      'email': email,
      'password': password,
    });
    return resp.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> register(
      String name, String email, String password) async {
    final resp = await _dio.post('/auth/register', data: {
      'name': name,
      'email': email,
      'password': password,
    });
    return resp.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> getMe() async {
    final resp = await _dio.get('/auth/me');
    return resp.data as Map<String, dynamic>;
  }

  // ── Identity ────────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> getIdentity(String userId) async {
    final resp = await _dio.get('/v1/identity/$userId');
    return resp.data as Map<String, dynamic>;
  }

  Future<void> updateIdentity(String userId, Map<String, dynamic> data) async {
    await _dio.put('/v1/identity/$userId', data: data);
  }

  Future<Map<String, dynamic>> addDocument(
      String userId, Map<String, dynamic> data) async {
    final resp = await _dio.post('/v1/identity/$userId/documents', data: data);
    return resp.data as Map<String, dynamic>;
  }

  Future<void> updateDocument(
      String userId, String docId, Map<String, dynamic> data) async {
    await _dio.put('/v1/identity/$userId/documents/$docId', data: data);
  }

  Future<void> deleteDocument(String userId, String docId) async {
    await _dio.delete('/v1/identity/$userId/documents/$docId');
  }

  // ── Address ─────────────────────────────────────────────────────────────────

  Future<List<dynamic>> getAddresses(String userId) async {
    final resp = await _dio.get('/v1/address/$userId');
    return (resp.data as Map<String, dynamic>)['addresses'] as List<dynamic>;
  }

  Future<Map<String, dynamic>> addAddress(
      String userId, Map<String, dynamic> data) async {
    final resp = await _dio.post('/v1/address/$userId', data: data);
    return resp.data as Map<String, dynamic>;
  }

  Future<void> updateAddress(
      String userId, String addrId, Map<String, dynamic> data) async {
    await _dio.put('/v1/address/$userId/$addrId', data: data);
  }

  Future<void> deleteAddress(String userId, String addrId) async {
    await _dio.delete('/v1/address/$userId/$addrId');
  }

  Future<void> setPrimaryAddress(String userId, String addrId) async {
    await _dio.put('/v1/address/$userId/$addrId/primary');
  }

  // ── Payment ─────────────────────────────────────────────────────────────────

  Future<List<dynamic>> getCards(String userId) async {
    final resp = await _dio.get('/v1/payment/$userId/cards');
    return (resp.data as Map<String, dynamic>)['cards'] as List<dynamic>;
  }

  Future<Map<String, dynamic>> addCard(
      String userId, Map<String, dynamic> data) async {
    final resp = await _dio.post('/v1/payment/$userId/cards', data: data);
    return resp.data as Map<String, dynamic>;
  }

  Future<void> deleteCard(String userId, String cardId) async {
    await _dio.delete('/v1/payment/$userId/cards/$cardId');
  }

  // ── Contacts ────────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> getContacts(String userId) async {
    final resp = await _dio.get('/v1/contacts/$userId');
    final data = resp.data as Map<String, dynamic>;
    return data['contacts'] as Map<String, dynamic>? ?? {};
  }

  Future<void> updateContacts(String userId, Map<String, dynamic> data) async {
    await _dio.put('/v1/contacts/$userId', data: data);
  }

  // ── Consents ─────────────────────────────────────────────────────────────────

  Future<List<dynamic>> getConsents(String userId) async {
    final resp = await _dio.get('/v1/consents/$userId');
    return (resp.data as Map<String, dynamic>)['grants'] as List<dynamic>;
  }

  Future<Map<String, dynamic>> getConsent(
      String userId, String grantId) async {
    final resp = await _dio.get('/v1/consents/$userId/$grantId');
    return (resp.data as Map<String, dynamic>)['grant'] as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> grantConsent(Map<String, dynamic> data) async {
    final resp = await _dio.post('/v1/consents', data: data);
    return resp.data as Map<String, dynamic>;
  }

  Future<void> revokeConsent(String grantId) async {
    await _dio.delete('/v1/consents/$grantId');
  }

  // ── Relying Parties ──────────────────────────────────────────────────────────

  Future<List<dynamic>> getRelyingParties() async {
    final resp = await _dio.get('/v1/relying-parties');
    return (resp.data as Map<String, dynamic>)['relyingParties'] as List<dynamic>;
  }

  // ── Audit ────────────────────────────────────────────────────────────────────

  Future<List<dynamic>> getAuditEvents(
    String userId, {
    String? resource,
    String? from,
    String? to,
    int limit = 50,
  }) async {
    final resp = await _dio.get(
      '/v1/audit/$userId',
      queryParameters: {
        'limit': limit,
        if (resource != null) 'resource': resource,
        if (from != null) 'from': from,
        if (to != null) 'to': to,
      },
    );
    return (resp.data as Map<String, dynamic>)['events'] as List<dynamic>;
  }

  // ── Account / GDPR ───────────────────────────────────────────────────────────

  Future<void> exportData() async {
    await _dio.post('/v1/account/export');
  }

  Future<void> deleteVaultResource(String resource) async {
    await _dio.delete('/v1/account/vault/$resource');
  }

  Future<Map<String, dynamic>> getDashboardStats(String userId) async {
    final results = await Future.wait([
      getConsents(userId),
      getAuditEvents(userId, limit: 5),
    ]);
    return {
      'activeConsents': (results[0])
          .where((c) => (c as Map)['status'] == 'ACTIVE')
          .length,
      'recentEvents': results[1],
    };
  }
}
