part of 'api_client.dart';

/// Consent grants and relying-party directory endpoints.
extension ApiClientConsents on ApiClient {
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

  Future<List<dynamic>> getRelyingParties() async {
    final resp = await _dio.get('/v1/relying-parties');
    return (resp.data as Map<String, dynamic>)['relyingParties'] as List<dynamic>;
  }
}
