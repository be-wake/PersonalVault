part of 'api_client.dart';

/// Audit trail, account/GDPR actions, and dashboard aggregation.
extension ApiClientAccount on ApiClient {
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

  // ── Account / GDPR ─────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> updateName(String name) async {
    final resp = await _dio.patch('/v1/account/name', data: {'name': name});
    return resp.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> exportData() async {
    final resp = await _dio.get('/v1/account/export');
    return resp.data as Map<String, dynamic>;
  }

  Future<void> deleteVaultResource(String resource) async {
    await _dio.delete('/v1/account/vault/$resource');
  }

  // ── Dashboard aggregation ──────────────────────────────────────────────────────

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
